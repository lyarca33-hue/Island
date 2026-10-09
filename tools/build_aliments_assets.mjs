/**
 * Les aliments faits avec Tripo (licence d'usage commercial) → un seul pack pour le jeu,
 * `public/packs/aliments.glb`, lu comme les packs de Quaternius (src/game/packs/assets.ts) : un nœud
 * par aliment nommé comme dans ALIMENTS (« pomme »), posé au sol (bas à y = 0) et centré, à sa vraie
 * taille (1 unité = 1 m), un seul maillage et une texture WebP (les textures de Tripo regroupées en
 * un atlas), maillage allégé (simplify) puis sommets compressés (meshopt). Écrit aussi sa ligne
 * dans src/game/packs/manifest.ts (les autres packs y restent).
 *
 * `src/game/items/interior.ts` (FOOD_LOOKS) dit quel modèle habille quel aliment du jeu.
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_aliments_assets.mjs --src "<Bureau>/Assets/aliment/texture" --out public/packs/aliments.glb
 *
 * `--preview <dossier>` écrit aussi chaque aliment à part dans ce dossier (pour le regarder).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { cloneDocument, dedup, flatten, join, mergeDocuments, meshopt, prune, simplify, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Fichier de Tripo (nom sans « Modèle+3D+ » ni « .glb », en minuscules) → aliment du jeu.
 * `cm` : plus grande dimension réelle ; `rot` : rotations (axe, degrés) qui le posent comme l'aliment du jeu
 * (les longs couchés le long de z, sauf ceux que le jeu couche le long de x) ; `tri` : triangles visés.
 */
const ALIMENTS = {
  "d'œuf": { nom: 'oeuf', cm: 6 },
  "d'oignon": { nom: 'oignon', cm: 8 },
  "d'un+bloc+de+beurre": { nom: 'beurre', cm: 11, rot: [['y', 90]] },
  "d'un+bulbe+d'ail": { nom: 'ail', cm: 6 },
  "d'un+morceau+de+fromage": { nom: 'fromage', cm: 12 },
  "d'une+miche+de+pain+ronde": { nom: 'pain', cm: 22 },
  'de+baguette+stylisée': { nom: 'baguette', cm: 60, rot: [['x', 90]] },
  'de+banane': { nom: 'banane', cm: 19, rot: [['x', -45]] },
  'de+barre+de+chocolat': { nom: 'chocolat', cm: 16, rot: [['y', 90]] },
  "de+bouteille+d'huile": { nom: 'huile', cm: 28 },
  'de+bouteille+de+vinaigre': { nom: 'vinaigre', cm: 25 },
  'de+bouteille+souple': { nom: 'mayonnaise', cm: 19 },
  'de+bouteille+souple (1)': { nom: 'ketchup', cm: 19 },
  'de+brique+de+lait': { nom: 'lait', cm: 20 },
  'de+carotte': { nom: 'carotte', cm: 18, rot: [['x', 90]] },
  'de+champignon': { nom: 'champignon', cm: 6 },
  'de+citron': { nom: 'citron', cm: 8, rot: [['y', 90]] },
  'de+filet+de+poisson+cru': { nom: 'poisson', cm: 16 },
  'de+grappe+de+raisin': { nom: 'raisin', cm: 16 },
  'de+moulin+à+poivre': { nom: 'poivre', cm: 18 },
  'de+panier+à+fraises': { nom: 'fraises', cm: 12, rot: [['y', 90]] },
  'de+pilon+de+poulet': { nom: 'poulet', cm: 14, rot: [['z', 90]] },
  'de+poire+stylisée': { nom: 'poire', cm: 11 },
  'de+poivron+vert': { nom: 'poivron', cm: 9 },
  'de+pomme+de+terre': { nom: 'pomme-de-terre', cm: 9, rot: [['z', 90]] },
  'de+pot+à+crème+rond': { nom: 'creme', cm: 9 },
  'de+pot+à+polygone+moyen': { nom: 'confiture', cm: 10 },
  'de+pot+rond': { nom: 'moutarde', cm: 9 },
  'de+pot+de+miel': { nom: 'miel', cm: 10 },
  'de+pot+de+yaourt': { nom: 'yaourt', cm: 7 },
  'de+sac+en+papier+pour+la+farine': { nom: 'farine', cm: 18 },
  'de+salière': { nom: 'sel', cm: 10 },
  'de+saucisse': { nom: 'saucisses', cm: 15, rot: [['z', 90]] },
  'de+steak+de+bœuf': { nom: 'steak', cm: 15, rot: [['y', 90]] },
  'de+tête+de+laitue': { nom: 'salade', cm: 16 },
  'de+tomate+low-poly': { nom: 'tomate', cm: 7 },
  'de+tranche+de+jambon (1)': { nom: 'jambon', cm: 11 },
  'orange': { nom: 'orange', cm: 8 },
  'stylisé+de+concombre': { nom: 'concombre', cm: 22, rot: [['y', 90]] },
  'stylisé+de+courgette': { nom: 'courgette', cm: 20 },
  'stylisé+de+pomme': { nom: 'pomme', cm: 8 },
  // un poireau (le fichier de Tripo n'a pas de nom)
  'ressemblait+à+un+modèle+3d': { nom: 'poireau', cm: 32, rot: [['x', 90]] },
};

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const SRC = args.src;
const OUT = args.out ?? 'public/packs/aliments.glb';
const PREVIEW = args.preview;
if (!SRC) throw new Error('--src <dossier des aliments Tripo texturés> manquant');

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const keyOf = (file) => file.replace(/\.glb$/, '').replace(/^(petit\+)?mod[eè]le\+3d\+/i, '').toLowerCase();
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

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')).sort();
const built = [];
for (const file of files) {
  const o = ALIMENTS[keyOf(file)];
  if (!o) {
    console.log(`(laissé de côté) ${file}`);
    continue;
  }
  const r = await fix(file, o);
  built.push({ nom: o.nom, ...r });
  console.log(`${o.nom.padEnd(16)} ${String(r.before).padStart(6)} → ${String(r.after).padStart(5)} tri  ${r.size.map((v) => Math.round(v * 100)).join(' × ')} cm`);
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
console.log(`${OUT} : ${built.length} aliments, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);

// manifeste : la boîte de chaque aliment, les autres packs gardés
const MANIFEST = 'src/game/packs/manifest.ts';
const text = fs.readFileSync(MANIFEST, 'utf8');
const body = text.slice(text.indexOf('{', text.indexOf('PACK_SIZES')), text.lastIndexOf('} as const') + 1);
const manifest = new Function(`return ${body}`)();
manifest.aliments = Object.fromEntries(built.map((b) => [b.nom, b.size]));
const lines = [
  '/**',
  ' * Boîte (largeur x, hauteur y, profondeur z, en m) de chaque modèle des packs (Quaternius, et les',
  ' * aliments Tripo), posé au sol et centré. Fichier écrit par tools/build_pack_assets.mjs et',
  ' * tools/build_aliments_assets.mjs : ne pas modifier à la main.',
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
