/**
 * Le kit Tripo de la maison (mur, sol, pan de toit, porte, fenêtre) en un seul .glb léger pour le
 * jeu : un nœud par pièce, nommé comme la pièce, dans un repère commun (voir src/game/kit.ts), maillages
 * allégés (simplify) et compressés (meshopt). Les textures ne gardent que la couleur (le cel shading
 * n'utilise ni relief ni rugosité), en WebP 1024 px.
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_kit_assets.mjs --src <dossier des modèles> --out public/kit/maison.glb
 *
 * Le dossier des modèles contient les fichiers retouchés de l'Atelier Tripo (FICHIERS ci-dessous).
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, flatten, mergeDocuments, meshopt, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Les pièces : fichier, part de triangles gardés (et écart permis, en part de la taille), et passage dans le repère du kit.
 * - mur : plaque de 1 × 1 m, enduit (relief de 2 cm) tourné vers +z, x le long du mur, y de 0 à 1.
 * - sol : carreau de 1 × 1 m posé à plat, dessus à y = 0,03.
 * - toit : pan de 1 × 1 (mis à la taille du toit dans le jeu), faîtage à z = -0,5, égout à z = +0,5, bas à y = 0.
 * - porte : battant de 88 × 205 cm, poignée à +x, face avant vers +z, bas à y = 0.
 * - fenetre : fenêtre de 86 × 115 cm (cadre, croisillon, appui), face avant vers +z, bas à y = 0.
 * - tuile : tuile canal bombée vers le haut, longueur le long de z (de -0,5 à 0,5), largeur x de ±0,355, bas à y = 0.
 */
const FICHIERS = [
  // quart de tour autour de x : le relief (y) passe en z, la plaque (z) passe en y
  { nom: 'mur', fichier: 'mur-enduit.glb', garde: 0.04, erreur: 0.004, matrice: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0.5, 0, 1] },
  { nom: 'sol', fichier: 'sol-cuisine_100cm.glb', garde: 1 },
  { nom: 'toit', fichier: 'toit-pan-cuisine-2_660cm.glb', garde: 0.5, bas: true },
  { nom: 'porte', fichier: 'porte-entree_205cm.glb', garde: 0.25 },
  { nom: 'fenetre', fichier: 'fenetre_115cm.glb', garde: 0.25 },
  // posée des centaines de fois sur le toit : très allégée (sa forme est simple)
  { nom: 'tuile', fichier: 'tuile-canal.glb', garde: 0.05, erreur: 0.03, bas: true },
];

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const SRC = args.src;
const OUT = args.out ?? 'public/kit/maison.glb';
if (!SRC) throw new Error('--src <dossier des modèles> manquant');

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** Une pièce : ses transformations ramenées dans les maillages, sous un seul nœud nommé. */
async function piece(f) {
  const doc = await io.read(path.join(SRC, f.fichier));
  await doc.transform(flatten());
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const top = doc.createNode(f.nom);
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    transformMesh(mesh, node.getWorldMatrix());
    if (f.matrice) transformMesh(mesh, f.matrice);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    top.addChild(node);
  }
  for (const s of root.listScenes()) for (const c of s.listChildren()) s.removeChild(c);
  for (const n of root.listNodes()) if (n !== top && !n.getMesh()) n.dispose();
  scene.addChild(top);
  if (f.bas) {
    let minY = Infinity;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) minY = Math.min(minY, p.getAttribute('POSITION').getMin([])[1]);
    for (const m of root.listMeshes()) transformMesh(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -minY, 0, 1]);
  }
  // seule la couleur sert : ni relief, ni rugosité, ni métal
  for (const m of root.listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(1);
  }
  await doc.transform(prune(), weld());
  if (f.garde < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: f.garde, error: f.erreur ?? 0.002 }));
  return doc;
}

const [first, ...rest] = await Promise.all(FICHIERS.map(piece));
const doc = first;
const scene = doc.getRoot().listScenes()[0];
for (const d of rest) {
  const map = mergeDocuments(doc, d);
  for (const s of d.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
}
for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
// un seul tampon
const buffer = doc.getRoot().listBuffers()[0];
for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();
doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
for (const n of scene.listChildren()) {
  let tris = 0;
  n.traverse((c) => { for (const p of c.getMesh()?.listPrimitives() ?? []) tris += p.getIndices().getCount() / 3; });
  console.log(`${n.getName()} : ${tris} triangles`);
}
console.log(`${OUT} : ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
