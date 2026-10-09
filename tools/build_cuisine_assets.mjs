/**
 * Les meubles, appareils et ustensiles d'une pièce faits avec Tripo, en un seul .glb pour le jeu
 * (public/models/cuisine.glb, salon.glb, chambre.glb…, lus par src/game/items/tripo.ts). Les modèles d'entrée sont déjà corrigés
 * (voir tripo/modeles/cuisine/README.md : 1 unité = 1 m, posés au sol, avant vers +z, un atlas WebP,
 * pièces mobiles en nœuds nommés) : ce script les regroupe sans les retoucher, un nœud par modèle
 * nommé comme son fichier sans la taille (« placard-bas »), ses pièces mobiles en enfants
 * (« porte », « tiroir-1 », « bouton-0 »…), puis compresse les sommets (meshopt).
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
 *   node tools/build_cuisine_assets.mjs --src <dossier des modèles corrigés> --out public/models/cuisine.glb
 *   node tools/build_cuisine_assets.mjs --src <…>/garage --out public/models/garage.glb --skip porte-garage
 *
 * `--skip` laisse de côté des modèles (noms sans la taille, séparés par des virgules) : la porte du
 * garage, déjà dans le kit de la maison.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const SRC = args.src;
const OUT = args.out ?? 'public/models/cuisine.glb';
if (!SRC) throw new Error('--src <dossier des modèles corrigés> manquant');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const skip = new Set((args.skip ?? '').split(',').filter(Boolean));
const files = fs.readdirSync(SRC).filter((f) => /_\d+cm\.glb$/.test(f) && !skip.has(f.replace(/_\d+cm\.glb$/, ''))).sort();
const docs = await Promise.all(files.map((f) => io.read(path.join(SRC, f))));
const [doc, ...rest] = docs;
const scene = doc.getRoot().listScenes()[0];
for (const d of rest) {
  const map = mergeDocuments(doc, d);
  for (const s of d.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
}
for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
// chaque modèle : nommé sans sa taille
files.forEach((f, i) => {
  const name = f.replace(/_\d+cm\.glb$/, '');
  const top = scene.listChildren()[i];
  if (top.getName() !== name) console.warn(`${f} : nœud « ${top.getName()} », renommé « ${name} »`);
  top.setName(name);
});
// un seul tampon
const buffer = doc.getRoot().listBuffers()[0];
for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();
doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
for (const n of scene.listChildren()) console.log(`${n.getName()} : ${n.listChildren().map((c) => c.getName()).join(', ') || '—'}`);
console.log(`${OUT} : ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
