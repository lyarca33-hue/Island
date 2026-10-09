/**
 * Les états des aliments Tripo (cuit, brûlé, périmé, morceaux coupés), ajoutés au pack
 * `public/packs/aliments.glb` après tools/build_aliments_assets.mjs. Rien n'est généré sur Tripo :
 * tout est tiré des aliments du pack par les scripts Python de tools/aliments_etats/ (voir leur README).
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_aliments_etats.mjs extract --work <dossier>   # les aliments du pack, un .glb chacun, dans <dossier>/glb
 *   (cd <dossier> && PYTHONPATH=<dépôt>/tools/aliments_etats python3 -m cook && … perime && … cut)
 *   node tools/build_aliments_etats.mjs add --work <dossier>       # <dossier>/out/*.glb → nœuds du pack + manifeste
 *
 * Dans le pack : `steak-cuit`, `steak-brule`, `pomme-perime`… ont la même géométrie que l'aliment
 * (accesseurs partagés) et leur propre texture ; seule la texture sert au jeu (interior.ts). Les
 * morceaux coupés (`rondelles-carotte`, `quartiers-pomme`…) sont des modèles à eux : deux pièces,
 * la peau (texture de l'aliment) et la coupe. Les nœuds ajoutés portent `extras.etat`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, dequantize, flatten, meshopt, normals, prune, transformMesh } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const PACK = args.pack ?? 'public/packs/aliments.glb';
const WORK = args.work;
if (!WORK || !['extract', 'add'].includes(cmd)) throw new Error('usage : extract|add --work <dossier> [--pack public/packs/aliments.glb]');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(PACK);
doc.setLogger(new Logger(Logger.Verbosity.WARN));
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const isEtat = (n) => !!n.getExtras()?.etat;
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const webp = async (img) => new Uint8Array(await sharp(Buffer.from(img)).removeAlpha().webp({ quality: 85 }).toBuffer());

if (cmd === 'extract') {
  // chaque aliment seul, sommets en mètres (sans la quantification du pack), texture PNG
  fs.mkdirSync(path.join(WORK, 'glb'), { recursive: true });
  for (const name of scene.listChildren().filter((n) => !isEtat(n)).map((n) => n.getName())) {
    const one = cloneDocument(doc);
    one.setLogger(new Logger(Logger.Verbosity.WARN));
    for (const ext of one.getRoot().listExtensionsUsed()) ext.dispose();
    for (const n of one.getRoot().getDefaultScene().listChildren()) if (n.getName() !== name) n.dispose();
    await one.transform(prune(), dequantize(), flatten());
    for (const n of one.getRoot().listNodes()) {
      if (!n.getMesh()) continue;
      transformMesh(n.getMesh(), n.getWorldMatrix());
      n.setMatrix(ID);
    }
    for (const t of one.getRoot().listTextures()) t.setImage(new Uint8Array(await sharp(Buffer.from(t.getImage())).png().toBuffer())).setMimeType('image/png');
    await io.write(path.join(WORK, 'glb', `${name}.glb`), one);
  }
  console.log(`${fs.readdirSync(path.join(WORK, 'glb')).length} aliments dans ${WORK}/glb`);
  process.exit(0);
}

// ——— add ———
for (const n of scene.listChildren().filter(isEtat)) {
  n.getMesh()?.dispose();
  n.dispose();
}
const base = new Map(scene.listChildren().map((n) => [n.getName(), n]));
const STATE = /^(.+)-(cuit|brule|perime)$/;
const added = [];
const files = fs.readdirSync(path.join(WORK, 'out')).filter((f) => f.endsWith('.glb')).sort();
for (const file of files) {
  const name = file.replace(/\.glb$/, '');
  const src = await io.read(path.join(WORK, 'out', file));
  const m = name.match(STATE);
  if (m) {
    // même géométrie que l'aliment, sa texture à lui
    const of = base.get(m[1]);
    if (!of) throw new Error(`${file} : pas d'aliment « ${m[1]} » dans le pack`);
    const img = src.getRoot().listTextures()[0].getImage();
    const tex = doc.createTexture(name).setImage(await webp(img)).setMimeType('image/webp');
    const mat = doc.createMaterial(name).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
    const mesh = doc.createMesh(name);
    for (const p of of.getMesh().listPrimitives()) {
      const q = doc.createPrimitive().setMaterial(mat).setIndices(p.getIndices());
      for (const s of p.listSemantics()) q.setAttribute(s, p.getAttribute(s));
      mesh.addPrimitive(q);
    }
    const node = doc.createNode(name).setMesh(mesh).setMatrix(of.getMatrix()).setExtras({ etat: m[2] });
    scene.addChild(node);
    added.push({ name, size: null, from: m[1] });
  } else {
    // un morceau coupé : ses pièces (peau, coupe) dans un nœud, en mètres, posé au sol et centré
    await src.transform(flatten(), normals({ overwrite: false }));
    const node = doc.createNode(name).setExtras({ etat: 'coupe' });
    const mesh = doc.createMesh(name);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const v = [];
    for (const n of src.getRoot().listNodes()) {
      if (!n.getMesh()) continue;
      transformMesh(n.getMesh(), n.getWorldMatrix());
      for (const p of n.getMesh().listPrimitives()) {
        const tex = p.getMaterial().getBaseColorTexture();
        const t = doc.createTexture(`${name}-${n.getName()}`).setImage(await webp(tex.getImage())).setMimeType('image/webp');
        const mat = doc.createMaterial(`${name}-${n.getName()}`).setBaseColorTexture(t).setMetallicFactor(0).setRoughnessFactor(1);
        const q = doc.createPrimitive().setMaterial(mat);
        const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized());
        q.setIndices(copy(p.getIndices()));
        for (const s of ['POSITION', 'NORMAL', 'TEXCOORD_0']) if (p.getAttribute(s)) q.setAttribute(s, copy(p.getAttribute(s)));
        const pos = q.getAttribute('POSITION');
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
        }
        mesh.addPrimitive(q);
      }
    }
    node.setMesh(mesh);
    scene.addChild(node);
    added.push({ name, size: hi.map((h, k) => +(h - lo[k]).toFixed(3)) });
  }
}
const buffer = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buffer);
for (const b of root.listBuffers()) if (b !== buffer) b.dispose();
await doc.transform(prune(), dedup(), dequantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(PACK, doc);
console.log(`${PACK} : ${added.length} états ajoutés, ${(fs.statSync(PACK).size / 1024).toFixed(0)} Ko`);

// manifeste : un état a la boîte de son aliment ; un morceau coupé, la sienne
const MANIFEST = 'src/game/packs/manifest.ts';
const text = fs.readFileSync(MANIFEST, 'utf8');
const body = text.slice(text.indexOf('{', text.indexOf('PACK_SIZES')), text.lastIndexOf('} as const') + 1);
const manifest = new Function(`return ${body}`)();
const sizes = Object.fromEntries(Object.entries(manifest.aliments).filter(([n]) => base.has(n)));
for (const a of added) sizes[a.name] = a.size ?? sizes[a.from];
manifest.aliments = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
const head = text.slice(0, text.indexOf('export const PACK_SIZES'));
const tail = text.slice(text.lastIndexOf('} as const'));
fs.writeFileSync(
  MANIFEST,
  `${head}export const PACK_SIZES = {\n${Object.entries(manifest).map(([id, models]) => `  ${id}: {\n${Object.entries(models).map(([n, s]) => `    ${JSON.stringify(n)}: [${s.join(', ')}],`).join('\n')}\n  },`).join('\n')}\n${tail}`,
);
