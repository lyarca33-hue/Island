/**
 * Les plats cuisinés et la vaisselle faits avec Tripo (dossier `Assets` du Bureau de Greg, lot du
 * 9 octobre au soir) → `public/packs/plats.glb`, lu comme un pack (src/game/packs/assets.ts), de la
 * même façon que les aliments (tools/build_aliments_assets.mjs) : un nœud par modèle nommé comme
 * la fiche du jeu qu'il habille (« steak-frites »), posé au sol et centré, à sa vraie taille, une
 * texture WebP, maillage allégé puis compressé. Écrit aussi sa ligne dans src/game/packs/manifest.ts.
 *
 * `src/game/items/interior.ts` (FOOD_LOOKS) dit quel modèle habille quelle fiche.
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_plats_assets.mjs --src "<Bureau>/Assets" --out public/packs/plats.glb
 *
 * `--preview <dossier>` écrit aussi chaque modèle à part dans ce dossier (pour le regarder).
 *
 * Un modèle de plus, sans refaire tout le pack (les autres modèles sont gardés tels quels) :
 *
 *   node tools/build_plats_assets.mjs --add <fichier.glb> --nom livre-recettes --cm 24
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { cloneDocument, dedup, flatten, join, mergeDocuments, meshopt, prune, simplify, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Fichier de Tripo (nom sans « Modèle+3D+ » ni « .glb », en minuscules) → modèle du pack.
 * `cm` : plus grande dimension réelle ; `rot` : rotations (axe, degrés) qui le posent à plat comme
 * l'objet du jeu ; `tri` : triangles visés.
 */
const PLATS = {
  // ——— plats cuisinés (recipes.ts, prep.ts, feculents.ts) ———
  "d'œuf+au+plat": { nom: 'oeuf-plat', cm: 12, flat: true },
  "d'omelette+pliée": { nom: 'omelette', cm: 15, flat: true },
  "d'un+plat+de+macaronis+gratinés": { nom: 'gratin-pates', cm: 24, tri: 2000 },
  'de+bol+de+yaourt': { nom: 'yaourt-fraises', cm: 12 },
  'de+cubes+de+pain': { nom: 'croutons', cm: 9 },
  'de+cuisse+de+poulet+rôti': { nom: 'poulet-frites', cm: 18, tri: 2000 },
  'de+filet+de+poisson': { nom: 'poisson-citron', cm: 16 },
  'de+fruits+mélangés': { nom: 'salade-fruits', cm: 13, tri: 2000 },
  'de+gâteau+rond': { nom: 'gateau', cm: 22 },
  'de+grappe+de+légumes': { nom: 'poelee-legumes', cm: 14, tri: 2000 },
  'de+hamburger': { nom: 'hamburger', cm: 11, tri: 2000 },
  'de+hot-dog': { nom: 'hot-dog', cm: 18, flat: true },
  'de+laitue': { nom: 'feuilles-salade', cm: 14, tri: 2000 },
  'de+pain+perdu': { nom: 'pain-perdu', cm: 13 },
  'de+pâtes+penne': { nom: 'pates', cm: 11, tri: 2000 },
  'de+pizza+ronde': { nom: 'pizza', cm: 28 },
  'de+poire+pochée': { nom: 'poire-chocolat', cm: 12 },
  'de+poulet+rôti': { nom: 'poulet-roti', cm: 28, tri: 2500 },
  'de+sandwich': { nom: 'sandwich', cm: 13, rot: [['z', 90]] },
  'de+sandwich+grillé': { nom: 'croque-monsieur', cm: 12 },
  'de+steak+et+frites': { nom: 'steak-frites', cm: 22, tri: 2000 },
  'de+tranches+de+pain+grillé': { nom: 'bruschetta', cm: 16, rot: [['z', 90]] },
  'fruit+crumble+pie+3d+model': { nom: 'crumble', cm: 20 },
  'ressource+de+jeu+tranche+de+pain': { nom: 'tartine-tomate', cm: 11, rot: [['z', 90]] },
  // ——— vaisselle, ustensiles, emballages ———
  "d'un+moule+à+gâteau+rond": { nom: 'moule', cm: 23 },
  "d'un+plat+à+four+ovale": { nom: 'plat-four', cm: 32 },
  'de+boîte+à+thé': { nom: 'sachets-the', cm: 12 },
  'de+brique+de+boisson+rectangulaire': { nom: 'jus-orange', cm: 20 },
  'de+disque+de+pierre+rond': { nom: 'pierre-pizza', cm: 30, rot: [['z', 90]] },
  'de+manique+matelassée': { nom: 'maniques', cm: 24, rot: [['z', 90]] },
  'de+passoire+de+cuisine+ronde': { nom: 'passoire', cm: 26 },
  'de+sac+de+congélation': { nom: 'legumes-surgeles', cm: 22, rot: [['z', 90]] },
  'de+sac+en+plastique+blanc': { nom: 'sac-poubelle', cm: 50 },
  'de+théière': { nom: 'theiere', cm: 22, tri: 2000 },
  // ——— la cuisine ———
  'livre-recettes': { nom: 'livre-recettes', cm: 24, tri: 2000, atlas: 512 },
};

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const OUT = args.out ?? 'public/packs/plats.glb';
const PREVIEW = args.preview;
const ADD = args.add;
const SRC = ADD ? path.dirname(ADD) : args.src;
if (!SRC) throw new Error('--src <dossier des plats Tripo texturés> (ou --add <fichier.glb>) manquant');

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const keyOf = (file) => file.replace(/\.glb$/, '').replace(/^(petit\+)?mod[eè]le\+3d\+(stylisé\+)?/i, '').toLowerCase();
const tris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + p.getIndices().getCount() / 3, 0);

function bounds(doc) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], v = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } }
  }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]) };
}
// matrices 4×4 en colonnes (glTF)
const scale = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const move = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
function turn(axis, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  if (axis === 'x') return [1, 0, 0, 0, 0, c, n, 0, 0, -n, c, 0, 0, 0, 0, 1];
  if (axis === 'y') return [c, 0, -n, 0, 0, 1, 0, 0, n, 0, c, 0, 0, 0, 0, 1];
  return [c, n, 0, 0, -n, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Rotation qui couche le modèle : son axe le plus mince vers +y, le plus long vers z. */
function flatten3(doc) {
  const pts = [], v = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); pts.push([...v]); }
  }
  const mean = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k], 0) / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (q[i] - mean[i]) * (q[j] - mean[j]);
  // vecteurs propres (Jacobi)
  const A = C.map((r) => [...r]), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) {
    let p = 0, q = 1;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(A[i][j]) > Math.abs(A[p][q])) [p, q] = [i, j];
    if (Math.abs(A[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - sn * akq; A[k][q] = sn * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - sn * aqk; A[q][k] = sn * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - sn * vkq; V[k][q] = sn * vkp + c * vkq; }
  }
  const order = [0, 1, 2].sort((a, b) => A[a][a] - A[b][b]);
  const col = (i) => [V[0][i], V[1][i], V[2][i]];
  const y = col(order[0]), z = col(order[2]);
  // le haut reste du côté où il était (l'axe mince pointe vers le haut d'origine)
  if (y[1] < 0) { y[0] *= -1; y[1] *= -1; y[2] *= -1; }
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  // lignes = nouveaux axes (matrice en colonnes)
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1];
}

/** Toutes les textures de couleur dans un atlas carré (carrés de côté 2^n rangés en quadtree). */
async function atlas(doc, size) {
  const root = doc.getRoot();
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  const texs = [...new Set(prims.map((p) => p.getMaterial()?.getBaseColorTexture()).filter(Boolean))];
  const orig = texs.map((t) => t.getSize()[0]);
  let k = 0;
  while (orig.reduce((s, o) => s + Math.max(16, o >> k) ** 2, 0) > size * size) k++;
  const cells = texs.map((t, i) => ({ t, s: Math.max(16, orig[i] >> k) })).sort((a, b) => b.s - a.s);
  const free = [{ x: 0, y: 0, s: size }];
  for (const c of cells) {
    free.sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
    let f = free.find((f) => f.s >= c.s);
    free.splice(free.indexOf(f), 1);
    while (f.s > c.s) {
      const h = f.s / 2;
      free.push({ x: f.x + h, y: f.y, s: h }, { x: f.x, y: f.y + h, s: h }, { x: f.x + h, y: f.y + h, s: h });
      f = { x: f.x, y: f.y, s: h };
    }
    c.x = f.x;
    c.y = f.y;
  }
  const layers = [];
  for (const c of cells) {
    c.pad = c.s >= 64 ? 2 : 1;
    const img = await sharp(Buffer.from(c.t.getImage())).resize(c.s - 2 * c.pad, c.s - 2 * c.pad).removeAlpha()
      .extend({ top: c.pad, bottom: c.pad, left: c.pad, right: c.pad, extendWith: 'copy' }).png().toBuffer();
    layers.push({ input: img, left: c.x, top: c.y });
  }
  const webp = await sharp({ create: { width: size, height: size, channels: 3, background: '#808080' } }).composite(layers).webp({ quality: 85 }).toBuffer();
  const tex = doc.createTexture('atlas').setImage(new Uint8Array(webp)).setMimeType('image/webp');
  const material = doc.createMaterial('atlas').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
  const byTex = new Map(cells.map((c) => [c.t, c]));
  const done = new Set();
  for (const p of prims) {
    const c = byTex.get(p.getMaterial()?.getBaseColorTexture());
    const uv = p.getAttribute('TEXCOORD_0');
    if (c && uv && !done.has(uv)) {
      done.add(uv);
      const v = [];
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, v);
        // (les uv de Tripo restent dans [0, 1] : pas de répétition à garder)
        uv.setElement(i, [(c.x + c.pad + v[0] * (c.s - 2 * c.pad)) / size, (c.y + c.pad + v[1] * (c.s - 2 * c.pad)) / size]);
      }
    }
    p.setMaterial(material);
  }
  for (const m of root.listMaterials()) if (m !== material) m.dispose();
  for (const t of root.listTextures()) if (t !== tex) t.dispose();
}

/** Un aliment prêt : un nœud `o.nom`, un maillage, une texture. */
async function fix(file, o) {
  const doc = await io.read(path.join(SRC, file));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root = doc.getRoot();
  await doc.transform(flatten());
  const before = tris(doc);
  for (const n of root.listNodes()) {
    if (n.getMesh()) transformMesh(n.getMesh(), n.getWorldMatrix());
    n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  // couché comme dans le jeu, à sa taille, posé au sol, centré
  const all = (m) => { for (const mesh of root.listMeshes()) transformMesh(mesh, m); };
  // à plat : sa direction la plus mince (analyse en composantes principales) passe à la verticale
  if (o.flat) all(flatten3(doc));
  for (const [axis, deg] of o.rot ?? []) all(turn(axis, deg));
  all(scale(o.cm / 100 / Math.max(...bounds(doc).size)));
  const b = bounds(doc);
  all(move([-(b.lo[0] + b.hi[0]) / 2, -b.lo[1], -(b.lo[2] + b.hi[2]) / 2]));
  // seule la couleur sert
  for (const mat of root.listMaterials()) mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  await atlas(doc, o.atlas ?? 256);
  // un nœud à son nom, un maillage
  const scene = root.listScenes()[0];
  const top = doc.createNode(o.nom).setMesh(doc.createMesh(o.nom));
  for (const n of root.listNodes()) if (n !== top && n.getMesh()) for (const p of n.getMesh().listPrimitives()) top.getMesh().addPrimitive(p);
  for (const n of root.listNodes()) if (n !== top) { n.getMesh()?.dispose(); n.dispose(); }
  for (const c of scene.listChildren()) scene.removeChild(c);
  scene.addChild(top);
  await doc.transform(prune(), dedup(), join({ keepMeshes: true, keepNamed: true }), weld());
  // allègement : erreur permise augmentée jusqu'à tenir la cible
  const target = o.tri ?? 1500;
  const mid = tris(doc);
  let best = doc;
  for (let err = 0.002; err <= 0.1; err *= 1.5) {
    const d = cloneDocument(doc);
    d.setLogger(new Logger(Logger.Verbosity.WARN));
    await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / mid), error: err }), prune());
    best = d;
    if (tris(d) <= target * 1.1) break;
  }
  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    await io.write(path.join(PREVIEW, `${o.nom}.glb`), best);
  }
  const size = bounds(best).size.map((v) => +v.toFixed(3));
  return { doc: best, size, before, after: tris(best) };
}

const files = ADD ? [path.basename(ADD)] : fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')).sort();
const built = [];
for (const file of files) {
  const o = ADD ? { ...PLATS[args.nom], nom: args.nom, ...(args.cm ? { cm: +args.cm } : {}) } : PLATS[keyOf(file)];
  if (ADD && !o.cm) throw new Error('--cm <plus grande dimension> manquant');
  if (!o) {
    console.log(`(laissé de côté) ${file}`);
    continue;
  }
  const r = await fix(file, o);
  built.push({ nom: o.nom, ...r });
  console.log(`${o.nom.padEnd(16)} ${String(r.before).padStart(6)} → ${String(r.after).padStart(5)} tri  ${r.size.map((v) => Math.round(v * 100)).join(' × ')} cm`);
}
// --add : les modèles déjà dans le pack, gardés (sauf celui qu'on remplace)
if (ADD) {
  const old = await io.read(OUT);
  old.setLogger(new Logger(Logger.Verbosity.WARN));
  const sizes = new Function(`return ${fs.readFileSync('src/game/packs/manifest.ts', 'utf8').match(/plats: (\{[^}]*\})/)[1]}`)();
  for (const n of old.getRoot().listScenes()[0].listChildren()) {
    if (n.getName() === args.nom) continue;
    const d = cloneDocument(old);
    const scene = d.getRoot().listScenes()[0];
    for (const c of scene.listChildren()) if (c.getName() !== n.getName()) { scene.removeChild(c); c.dispose(); }
    await d.transform(prune());
    built.push({ nom: n.getName(), doc: d, size: sizes[n.getName()] });
  }
}
built.sort((a, b) => a.nom.localeCompare(b.nom));

// un seul document, un seul tampon
const [first, ...rest] = built.map((b) => b.doc);
const scene = first.getRoot().listScenes()[0];
for (const d of rest) {
  const map = mergeDocuments(first, d);
  for (const s of d.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
}
for (const s of first.getRoot().listScenes()) if (s !== scene) s.dispose();
const buffer = first.getRoot().listBuffers()[0];
for (const a of first.getRoot().listAccessors()) a.setBuffer(buffer);
for (const b of first.getRoot().listBuffers()) if (b !== buffer) b.dispose();
first.createExtension(EXTTextureWebP).setRequired(true);
await first.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, first);
console.log(`${OUT} : ${built.length} modèles, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);

// manifeste : la boîte de chaque aliment, les autres packs gardés
const MANIFEST = 'src/game/packs/manifest.ts';
const text = fs.readFileSync(MANIFEST, 'utf8');
const body = text.slice(text.indexOf('{', text.indexOf('PACK_SIZES')), text.lastIndexOf('} as const') + 1);
const manifest = new Function(`return ${body}`)();
manifest.plats = Object.fromEntries(built.map((b) => [b.nom, b.size]));
const lines = [
  '/**',
  ' * Boîte (largeur x, hauteur y, profondeur z, en m) de chaque modèle des packs (Quaternius, et les',
  ' * aliments et plats Tripo), posé au sol et centré. Fichier écrit par tools/build_pack_assets.mjs,',
  ' * tools/build_aliments_assets.mjs et tools/build_plats_assets.mjs : ne pas modifier à la main.',
  ' */',
  'export const PACK_SIZES = {',
  ...Object.entries(manifest).map(([id, models]) => `  ${id}: {\n${Object.entries(models).map(([n, s]) => `    ${JSON.stringify(n)}: [${s.join(', ')}],`).join('\n')}\n  },`),
  '} as const satisfies Record<string, Record<string, readonly [number, number, number]>>;',
  '',
  'export type PackId = keyof typeof PACK_SIZES;',
  'export type ModelName<P extends PackId> = keyof (typeof PACK_SIZES)[P] & string;',
  '',
];
fs.writeFileSync(MANIFEST, lines.join('\n'));
