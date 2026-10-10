/**
 * Les 44 premiers modèles Tripo de la ville (salve « ville et métiers », n° 001 à 044 : la place,
 * les rues, le parc, les devantures et les enseignes ; dossier `Assets` du Bureau de Greg, lot du
 * 10 octobre) → `public/packs/ville.glb`, lu comme un pack (src/game/packs/assets.ts). Un nœud par
 * modèle nommé comme dans la salve (« lampadaire-rue »), posé au sol et centré, à sa vraie taille.
 *
 * Allégés sans perte visible dans le jeu :
 *  - Tripo les livre à ~95 000 triangles ; ils passent sous le plafond prévu par la salve
 *    (2 000 à 15 000 selon la taille) avec meshoptimizer, l'erreur de forme restant sous 1 % ;
 *  - seules la texture de couleur et la forme servent au cel shading du jeu (toonOf ne garde que
 *    `map`) : relief (normal map) et rugosité/métal, deux PNG/JPEG 2048 sur trois, sont retirés ;
 *  - la couleur, PNG 2048, devient un WebP 1024 (le plus grand côté d'un modèle à l'écran dépasse
 *    rarement 1 000 px).
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_ville_assets.mjs --src "<Bureau>/Assets" --out public/packs/ville.glb [--preview <dossier>]
 *
 * `--preview <dossier>` écrit aussi chaque modèle allégé à part (`<nom>_<cm>cm.glb`, non compressé).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, flatten, join, mergeDocuments, meshopt, prune, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Fichier de Tripo (nom sans « Modèle+3D+ » ni « .glb », en minuscules) → modèle du pack.
 * `cm` : plus grande dimension réelle (salve) ; `tri` : triangles visés (haut de la fourchette de la salve).
 */
const VILLE = {
  // ——— 1. la place, les rues et le parc ———
  "de+panneau+d'affichage": { nom: 'panneau-affichage', cm: 200, tri: 10000 },
  'de+lampadaire': { nom: 'lampadaire-rue', cm: 380, tri: 15000 },
  'de+banc+de+parc': { nom: 'banc-public', cm: 180, tri: 10000 },
  'de+poubelle': { nom: 'poubelle-rue', cm: 95, tri: 10000 },
  'de+fontaine': { nom: 'fontaine', cm: 300, tri: 15000 },
  "d'un+kiosque+octogonal": { nom: 'kiosque-musique', cm: 700, tri: 15000 },
  "d'horloge+de+rue": { nom: 'horloge-rue', cm: 350, tri: 10000 },
  'de+panneau+indicateur+en+bois': { nom: 'poteau-indicateur', cm: 280, tri: 10000 },
  "d'abribus": { nom: 'abribus', cm: 300, tri: 15000 },
  'de+colonne+publicitaire+ronde': { nom: 'colonne-affiche', cm: 300, tri: 10000 },
  "de+borne+d'incendie": { nom: 'borne-incendie', cm: 80, tri: 5000 },
  'de+borne+de+rue': { nom: 'potelet', cm: 100, tri: 5000 },
  'de+jardinière+en+bois': { nom: 'jardiniere-rue', cm: 120, tri: 10000 },
  "d'arbre+de+rue": { nom: 'arbre-rue', cm: 500, tri: 15000 },
  'de+porte-vélos': { nom: 'range-velos', cm: 200, tri: 10000 },
  'de+statue+de+pêcheur': { nom: 'statue', cm: 250, tri: 15000 },
  'de+cabine+téléphonique': { nom: 'cabine-telephone', cm: 240, tri: 10000 },
  'de+lanterne+murale': { nom: 'applique-rue', cm: 60, tri: 5000 },
  'de+jardinière': { nom: 'jardiniere-fenetre', cm: 80, tri: 5000 },
  'de+puits+en+pierre': { nom: 'puits', cm: 180, tri: 10000 },
  'de+table+de+pique-nique+en+bois': { nom: 'table-pique-nique', cm: 180, tri: 10000 },
  "de+balançoire+d'aire+de+jeux": { nom: 'balancoire', cm: 250, tri: 10000 },
  'de+toboggan+de+terrain+de+jeux': { nom: 'toboggan', cm: 300, tri: 10000 },
  'de+cheval+de+terrain+de+jeu': { nom: 'cheval-ressort', cm: 90, tri: 5000 },
  'de+fontaine+à+eau': { nom: 'fontaine-boire', cm: 110, tri: 5000 },
  'de+mât+de+drapeau': { nom: 'mat-drapeau', cm: 600, tri: 10000 },
  'de+mur+en+pierre+sèche': { nom: 'muret', cm: 200, tri: 10000 },
  'de+clôture+en+bois': { nom: 'barriere-bois', cm: 200, tri: 5000 },
  "d'un+pont+en+arc+de+pierre": { nom: 'pont-pierre', cm: 600, tri: 15000 },
  "d'escalier+en+pierre": { nom: 'escalier-pierre', cm: 200, tri: 10000 },
  // ——— 2. devantures et enseignes ———
  'de+façade+de+magasin+verte': { nom: 'devanture', cm: 300, tri: 15000 },
  "d'un+magasin+de+quartier": { nom: 'devanture-angle', cm: 300, tri: 15000 },
  "d'auvent+rayé+de+magasin": { nom: 'store-banne', cm: 300, tri: 10000 },
  "d'enseigne+suspendue": { nom: 'enseigne-potence', cm: 80, tri: 5000 },
  "d'enseigne+de+pain": { nom: 'enseigne-pain', cm: 70, tri: 5000 },
  'de+tasse+à+café': { nom: 'enseigne-tasse', cm: 60, tri: 5000 },
  "d'un+panneau+en+forme+de+poisson": { nom: 'enseigne-poisson', cm: 80, tri: 5000 },
  'de+panneau+marguerite': { nom: 'enseigne-fleur', cm: 60, tri: 5000 },
  'du+symbole+des+ciseaux': { nom: 'enseigne-ciseaux', cm: 60, tri: 5000 },
  'de+la+croix+de+pharmacie': { nom: 'enseigne-croix', cm: 60, tri: 5000 },
  "d'un+panneau+de+livre+ouvert": { nom: 'enseigne-livre', cm: 60, tri: 5000 },
  "d'enseigne+de+cornet+de+glace": { nom: 'enseigne-glace', cm: 60, tri: 5000 },
  'de+porte+en+bois': { nom: 'porte-boutique', cm: 220, tri: 10000 },
  'de+volet+en+bois': { nom: 'volet', cm: 150, tri: 5000 },
};
/** Côté de la texture de couleur (WebP). */
const TEX = 1024;
/** Erreur permise au simplificateur (part de la taille du modèle, uv et normales comprises). */
const MAX_ERR = 0.003;
/**
 * Poids des uv et des normales dans l'erreur : sans eux, l'allègement étire la texture sur les
 * grands triangles (traînées grises sur les vitres du lampadaire) et bouge les paliers du cel shading.
 */
const UV_WEIGHT = 2;
const NORMAL_WEIGHT = 0.5;

/** Allège une primitive en tenant compte de sa forme, de ses uv et de ses normales. */
function simplifyPrim(p, ratio) {
  const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), nor = p.getAttribute('NORMAL');
  const n = pos.getCount(), v = [];
  const positions = new Float32Array(n * 3), attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    positions.set(pos.getElement(i, v), i * 3);
    if (uv) attrs.set(uv.getElement(i, v), i * 5);
    if (nor) attrs.set(nor.getElement(i, v), i * 5 + 2);
  }
  const indices = new Uint32Array(p.getIndices().getArray());
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  const weights = [UV_WEIGHT, UV_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT];
  const [out] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, 5, weights, null, target, MAX_ERR, []);
  p.getIndices().setArray(n > 65535 ? out : new Uint16Array(out));
  compactPrimitive(p);
}

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const OUT = args.out ?? 'public/packs/ville.glb';
const PREVIEW = args.preview;
const SRC = args.src;
if (!SRC) throw new Error('--src <dossier des modèles Tripo de la ville> manquant');

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const keyOf = (file) => file.normalize('NFC').replace(/\.glb$/, '').replace(/^mod[eè]le\+3d\+/i, '').toLowerCase();
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

/** Un modèle prêt : un nœud `o.nom`, un maillage, une texture WebP. */
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
  // à sa taille, posé au sol, centré
  const all = (m) => { for (const mesh of root.listMeshes()) transformMesh(mesh, m); };
  all(scale(o.cm / 100 / Math.max(...bounds(doc).size)));
  const b = bounds(doc);
  all(move([-(b.lo[0] + b.hi[0]) / 2, -b.lo[1], -(b.lo[2] + b.hi[2]) / 2]));
  // seule la couleur sert (cel shading) : relief, rugosité et métal retirés, couleur en WebP
  for (const mat of root.listMaterials()) {
    mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicFactor(0).setRoughnessFactor(1);
    const t = mat.getBaseColorTexture();
    if (t && !t.getURI().endsWith('.webp')) {
      const webp = await sharp(Buffer.from(t.getImage())).resize(TEX, TEX, { fit: 'inside', withoutEnlargement: true }).removeAlpha().webp({ quality: 90 }).toBuffer();
      t.setImage(new Uint8Array(webp)).setMimeType('image/webp').setURI(`${o.nom}.webp`);
    }
  }
  // un nœud à son nom, un maillage
  const scene = root.listScenes()[0];
  const top = doc.createNode(o.nom).setMesh(doc.createMesh(o.nom));
  for (const n of root.listNodes()) if (n !== top && n.getMesh()) for (const p of n.getMesh().listPrimitives()) top.getMesh().addPrimitive(p);
  for (const n of root.listNodes()) if (n !== top) { n.getMesh()?.dispose(); n.dispose(); }
  for (const c of scene.listChildren()) scene.removeChild(c);
  scene.addChild(top);
  await doc.transform(prune(), dedup(), join({ keepMeshes: true, keepNamed: true }), weld());
  // allègement : jusqu'à la cible, sans dépasser l'erreur permise
  const ratio = Math.min(1, o.tri / tris(doc));
  for (const p of top.getMesh().listPrimitives()) simplifyPrim(p, ratio);
  await doc.transform(prune());
  const d = doc;
  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    await io.write(path.join(PREVIEW, `${o.nom}_${o.cm}cm.glb`), d);
  }
  const size = bounds(d).size.map((v) => +v.toFixed(3));
  return { doc: d, size, before, after: tris(d) };
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.glb') && VILLE[keyOf(f)]).sort();
const built = [];
for (const file of files) {
  const o = VILLE[keyOf(file)];
  const r = await fix(file, o);
  built.push({ nom: o.nom, ...r });
  console.log(`${o.nom.padEnd(20)} ${String(r.before).padStart(6)} → ${String(r.after).padStart(5)} tri  ${r.size.map((v) => Math.round(v * 100)).join(' × ')} cm`);
}
const missing = Object.values(VILLE).filter((o) => !built.some((b) => b.nom === o.nom));
if (missing.length) console.log(`(introuvables) ${missing.map((o) => o.nom).join(', ')}`);
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

// manifeste : la boîte de chaque modèle, les autres packs gardés
const MANIFEST = 'src/game/packs/manifest.ts';
const text = fs.readFileSync(MANIFEST, 'utf8');
const body = text.slice(text.indexOf('{', text.indexOf('PACK_SIZES')), text.lastIndexOf('} as const') + 1);
const manifest = new Function(`return ${body}`)();
manifest.ville = Object.fromEntries(built.map((b) => [b.nom, b.size]));
const head = text.slice(0, text.indexOf('export const PACK_SIZES'));
const lines = [
  'export const PACK_SIZES = {',
  ...Object.entries(manifest).map(([id, models]) => `  ${id}: {\n${Object.entries(models).map(([n, s]) => `    ${JSON.stringify(n)}: [${s.join(', ')}],`).join('\n')}\n  },`),
  '} as const satisfies Record<string, Record<string, readonly [number, number, number]>>;',
  '',
  'export type PackId = keyof typeof PACK_SIZES;',
  'export type ModelName<P extends PackId> = keyof (typeof PACK_SIZES)[P] & string;',
  '',
];
fs.writeFileSync(MANIFEST, head + lines.join('\n'));
