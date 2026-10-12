/**
 * Les maisons Tripo où l'on entre (chacune un seul maillage fermé, vu du dehors), découpées pour
 * qu'on puisse y entrer : `public/models/maison-<nom>.glb`, un nœud par morceau, dans le repère du
 * jeu (1 unité = 1 m, porte vers +z, seuil de la porte à y = 0, milieu de la pièce du bas en
 * x = z = 0). Le jeu met dedans une vraie pièce (murs, sol, plafond, porte qui s'ouvre :
 * src/game/campagne.ts) et cache le haut quand le perso y est.
 *
 * - rez-sud, rez-nord, rez-est, rez-ouest : les façades du rez-de-chaussée, coupées net à
 *   CUT (le haut des murs des pièces), chacune cachée quand le mur de la pièce de ce côté est
 *   abaissé en coupe. La porte peinte de la façade sud est découpée : le battant de la pièce la remplace.
 * - etage : le haut des murs (étage et pignons), de CUT à l'égout, et l'auvent de la porte ;
 * - toit : au-dessus de l'égout (pans, cheminée, haut des pignons) ;
 * - aile (maison en pierre) : l'aile basse collée au nord et à l'est du corps de logis, entière
 *   (murs et toit), fermée : cachée quand le mur nord ou est de la pièce est abaissé.
 * Les marches du perron, sous le niveau du sol (y < 0) une fois le seuil ramené à 0, sont retirées.
 *
 * Maillage allégé (simplify) et compressé (meshopt), texture de couleur seule en WebP 2048 px (le
 * cel shading n'utilise ni relief ni rugosité).
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_campagne_assets.mjs --maison campagne --src "<…>/cozy countryside house 3d model.glb"
 *   node tools/build_campagne_assets.mjs --maison pierre --src "<…>/stone house 3d model.glb"
 */
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
if (!args.src) throw new Error('--src <modèle Tripo> manquant');

/**
 * Réglages de chaque maison (m, repère du jeu sauf mention) :
 * - scale : échelle du modèle (il sort de Tripo dans une boîte d'un mètre) ;
 * - sill : hauteur du seuil de la porte dans le modèle (au-dessus des marches), ramenée à y = 0 ;
 * - cut : hauteur de la coupe du rez-de-chaussée, le haut des murs des pièces (WALL_H dans room.ts) ;
 * - eave : égout du toit, au-dessus du seuil ;
 * - door : la porte peinte, découpée : de x0 à x1, du sol à `top`, sur `depth` m derrière le nu de la façade ;
 * - awning : l'auvent au-dessus de la porte, ce qui dépasse de `out` devant la façade, au-dessus de `y`, à moins de `half` de `at` ;
 * - band : hauteurs (avant le décalage du seuil) où mesurer le nu des façades du corps de logis ;
 * - wing : l'aile, ce qui est à plus de `margin` derrière la façade nord ou à droite de la façade est, sous `top` ;
 * - keep : part des triangles gardés.
 */
const PRESETS = {
  campagne: {
    scale: 11, sill: 0.0385, cut: 2.5, eave: 4.75,
    door: { x0: -0.6, x1: 0.6, top: 2.12, depth: 0.7 },
    awning: { y: 2.2, out: -0.3, half: 1.5, at: 0 },
    band: [0.6, 4.5],
    keep: 0.045,
  },
  pierre: {
    scale: 12.5, sill: 0.0414, cut: 2.5, eave: 5.9,
    door: { x0: -0.95, x1: 0.69, top: 2.23, depth: 0.7 },
    awning: { y: 1.95, out: 0.15, half: 1.7, at: -0.13 },
    band: [5.75, 6.25],
    wing: { margin: 0.1, top: 5.1 },
    keep: 0.045,
  },
};
const NAME = args.maison ?? 'campagne';
const H = PRESETS[NAME];
if (!H) throw new Error(`--maison ${NAME} inconnue (${Object.keys(PRESETS).join(', ')})`);
const OUT = args.out ?? `public/models/maison-${NAME}.glb`;
const { scale: SCALE, sill: SILL, cut: CUT, eave: EAVE, door: DOOR, awning: AWNING, keep: KEEP } = H;
const TEX = 2048;

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// ------------------------------------------------------------------ lecture et allègement
const src = await io.read(args.src);
await src.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: KEEP, error: 0.002 }));
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray();
const N = prim.getAttribute('NORMAL').getArray();
const T = prim.getAttribute('TEXCOORD_0').getArray();
const I = prim.getIndices().getArray();
const color = prim.getMaterial().getBaseColorTexture();

// ------------------------------------------------------------------ nu des murs, au rez-de-chaussée
/** Le nu de chaque façade : médiane des sommets tournés vers ce côté, dans la bande de hauteurs `band` (dans le repère Tripo, × SCALE). */
function planes() {
  const sides = { est: [], ouest: [], sud: [], nord: [] };
  for (let i = 0; i < P.length / 3; i++) {
    const y = P[3 * i + 1] * SCALE;
    if (y < H.band[0] || y > H.band[1]) continue;
    const nx = N[3 * i], nz = N[3 * i + 2];
    if (nx > 0.9) sides.est.push(P[3 * i] * SCALE);
    if (nx < -0.9) sides.ouest.push(P[3 * i] * SCALE);
    if (nz > 0.9) sides.sud.push(P[3 * i + 2] * SCALE);
    if (nz < -0.9) sides.nord.push(P[3 * i + 2] * SCALE);
  }
  const med = (a) => a.sort((u, v) => u - v)[a.length >> 1];
  return { est: med(sides.est), ouest: med(sides.ouest), sud: med(sides.sud), nord: med(sides.nord) };
}
const raw = planes();
/** Décalage : le milieu des façades en x = z = 0, le seuil de la porte à y = 0. */
const OFF = [(raw.est + raw.ouest) / 2, SILL * SCALE, (raw.sud + raw.nord) / 2];
const WALLS = { est: raw.est - OFF[0], ouest: raw.ouest - OFF[0], sud: raw.sud - OFF[2], nord: raw.nord - OFF[2] };

// ------------------------------------------------------------------ triangles et découpe
/** Sommet : position (3), normale (3), uv (2). */
const vert = (i) => [P[3 * i] * SCALE - OFF[0], P[3 * i + 1] * SCALE - OFF[1], P[3 * i + 2] * SCALE - OFF[2], N[3 * i], N[3 * i + 1], N[3 * i + 2], T[2 * i], T[2 * i + 1]];
const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/**
 * Coupe le polygone `poly` par le plan `axis` = `at` : les morceaux en dessous et au-dessus (des
 * polygones, vides s'il n'y a rien de ce côté). Sutherland-Hodgman, un côté à la fois.
 */
function split(poly, axis, at) {
  const below = [], above = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const da = a[axis] - at, db = b[axis] - at;
    if (da <= 0) below.push(a);
    if (da >= 0) above.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const m = lerp(a, b, da / (da - db));
      below.push(m);
      above.push(m);
    }
  }
  return [below.length >= 3 ? below : null, above.length >= 3 ? above : null];
}

const groups = { 'rez-sud': [], 'rez-nord': [], 'rez-est': [], 'rez-ouest': [], etage: [], toit: [], aile: [] };
const put = (name, poly) => {
  if (!poly) return;
  for (let k = 1; k + 1 < poly.length; k++) groups[name].push(poly[0], poly[k], poly[k + 1]);
};

/** Façade la plus proche du point (x, z) : celle dont le nu est le plus près. */
function side(x, z) {
  const d = { est: Math.abs(x - WALLS.est), ouest: Math.abs(x - WALLS.ouest), sud: Math.abs(z - WALLS.sud), nord: Math.abs(z - WALLS.nord) };
  return Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
}

const mean = (poly, k) => poly.reduce((t, v) => t + v[k], 0) / poly.length;

for (let t = 0; t < I.length; t += 3) {
  let poly = [vert(I[t]), vert(I[t + 1]), vert(I[t + 2])];
  // sous le sol : les marches du perron, enterrées
  [, poly] = split(poly, 1, 0.005);
  if (!poly) continue;
  // l'aile, entière : derrière la façade nord ou à droite de la façade est, sous le toit du corps de logis
  if (H.wing && mean(poly, 1) < H.wing.top && (mean(poly, 0) > WALLS.est + H.wing.margin || mean(poly, 2) < WALLS.nord - H.wing.margin)) {
    put('aile', poly);
    continue;
  }
  const [low, rest] = split(poly, 1, CUT);
  const [mid, top] = rest ? split(rest, 1, EAVE) : [null, null];
  put('etage', mid);
  put('toit', top);
  if (!low) continue;
  const cx = mean(low, 0), cy = mean(low, 1), cz = mean(low, 2);
  const s = side(cx, cz);
  // l'auvent de la porte (et la façade derrière lui) : avec l'étage ; vus de derrière, ses pans feraient des éclats
  if (s === 'sud' && cy > AWNING.y && cz > WALLS.sud + AWNING.out && Math.abs(cx - AWNING.at) < AWNING.half) {
    put('etage', low);
    continue;
  }
  if (s !== 'sud' || cz < WALLS.sud - DOOR.depth) {
    put(`rez-${s}`, low);
    continue;
  }
  // la porte peinte : on garde ce qui est à gauche, à droite et au-dessus de l'ouverture
  const [left, r1] = split(low, 0, DOOR.x0);
  const [middle, right] = r1 ? split(r1, 0, DOOR.x1) : [null, null];
  const [, over] = middle ? split(middle, 1, DOOR.top) : [null, null];
  for (const p of [left, right, over]) put('rez-sud', p);
}

// ------------------------------------------------------------------ écriture
const doc = new Document();
const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene(`maison-${NAME}`);
const img = await sharp(Buffer.from(color.getImage())).resize(TEX, TEX, { fit: 'inside' }).webp({ quality: 82 }).toBuffer();
const tex = doc.createTexture(`maison-${NAME}`).setImage(new Uint8Array(img)).setMimeType('image/webp').setURI(`maison-${NAME}.webp`);
const mat = doc.createMaterial(`maison-${NAME}`).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
const counts = {};
for (const [name, verts] of Object.entries(groups)) {
  if (!verts.length) continue;
  const pick = (from, n) => new Float32Array(verts.flatMap((v) => v.slice(from, from + n)));
  const p = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pick(0, 3)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(pick(3, 3)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(pick(6, 2)).setBuffer(buffer))
    .setMaterial(mat);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)));
  counts[name] = verts.length / 3;
}
await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
webp.setRequired(true);
await io.write(OUT, doc);

const r = (x) => Math.round(x * 1000) / 1000;
console.log(`${OUT} : ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
console.log('triangles', counts);
console.log('nu des façades (m, repère du jeu)', Object.fromEntries(Object.entries(WALLS).map(([k, v]) => [k, r(v)])));
console.log('décalage du modèle (m, × SCALE)', OFF.map(r));
/** Ce que chaque façade a de plus rentré (fond des fenêtres) : la pièce se pose en deçà (INNER dans campagne.ts). */
const deep = {};
for (const s of ['sud', 'nord', 'est', 'ouest']) {
  const [k, sign, nk] = { sud: [2, 1, 5], nord: [2, -1, 5], est: [0, 1, 3], ouest: [0, -1, 3] }[s];
  const d = groups[`rez-${s}`].filter((v) => v[nk] * sign > 0.7 && v[1] > 0.3 && v[1] < 2.4).map((v) => v[k] * sign).sort((a, b) => a - b);
  if (d.length) deep[s] = r(d[Math.floor(d.length * 0.002)] * sign);
}
console.log('fond des façades (m, repère du jeu)', deep);
