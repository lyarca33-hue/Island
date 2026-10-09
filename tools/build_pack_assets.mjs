/**
 * Regroupe les modèles des packs de Quaternius (CC0) en un .glb par pack, légers pour le jeu :
 * un nœud par modèle (nommé comme le fichier d'origine), posé au sol (bas de sa boîte à y = 0,
 * centré en x et z), maillages compressés (meshopt), une couleur par matériau. Les textures (packs « MegaKit »)
 * ne gardent que la couleur (le cel shading n'utilise ni relief ni rugosité), en WebP 1024 px.
 *
 * Écrit aussi src/game/packs/manifest.ts : la boîte (en m) de chaque modèle, connue sans
 * télécharger le pack.
 *
 *   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
 *   node tools/build_pack_assets.mjs --src <dossier des packs> --out public/packs [--only nourriture]
 *
 * Avec --only, seuls ces packs sont refaits ; le manifeste garde les tailles des autres.
 *
 * Le dossier des packs contient les packs tels que téléchargés (« Ultimate Food Pack - Oct 2019/OBJ »),
 * voir PACKS ci-dessous.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/** Les packs : nom du .glb, dossier source, format, échelle (unités du pack → m), modèles gardés (absent : tous). */
const PACKS = [
  { id: 'nourriture', dir: 'Ultimate Food Pack - Oct 2019/OBJ', kind: 'obj', scale: 1, models: [
    'Apple', 'Banana', 'Bread', 'ChickenLeg', 'ChocolateBar', 'Egg_Fried', 'Egg_Whole', 'KetchupBottle', 'Lettuce_Whole',
    'MayoBottle', 'Orange', 'Pepper_Red', 'Pizza', 'Steak', 'Tomato',
  ] },
];

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const SRC = args.src;
const OUT = args.out ?? 'public/packs';
const TEX = Number(args.tex ?? 1024);
if (!SRC) throw new Error('--src <dossier des packs> manquant');

/** Fichiers d'un dossier et de ses sous-dossiers ayant cette extension, triés. */
function walk(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.toLowerCase().endsWith(ext)) out.push(p);
  }
  return out.sort();
}

/** Une pièce lue : positions, normales, uv (facultatif), matériau. */
class Part {
  constructor(mat) {
    this.mat = mat;
    this.pos = [];
    this.nor = [];
    this.uv = [];
  }
}

/** Lit un .obj (et son .mtl) : une pièce par matériau, couleurs Kd. */
async function readObj(file) {
  const mtl = new Map();
  const mtlFile = file.replace(/\.obj$/i, '.mtl');
  if (fs.existsSync(mtlFile)) {
    let cur = null;
    for (const line of fs.readFileSync(mtlFile, 'utf8').split('\n')) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'newmtl') mtl.set((cur = t.slice(1).join(' ')), { name: cur, color: [0.8, 0.8, 0.8], opacity: 1 });
      else if (t[0] === 'Kd' && cur) mtl.get(cur).color = t.slice(1, 4).map(Number);
      else if (t[0] === 'd' && cur) mtl.get(cur).opacity = Number(t[1]);
    }
  }
  const v = [], vn = [];
  const parts = new Map();
  let part = null;
  const use = (name) => {
    const m = mtl.get(name) ?? { name: name || 'defaut', color: [0.8, 0.8, 0.8], opacity: 1 };
    if (!parts.has(m.name)) parts.set(m.name, new Part(m));
    part = parts.get(m.name);
  };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') v.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'vn') vn.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'usemtl') use(t.slice(1).join(' '));
    else if (t[0] === 'f') {
      if (!part) use('');
      const corners = t.slice(1).map((c) => c.split('/').map((n) => (n ? Number(n) : 0)));
      const idx = (n, len) => (n < 0 ? len + n : n - 1);
      // éventail : polygone → triangles
      for (let i = 1; i + 1 < corners.length; i++) {
        const tri = [corners[0], corners[i], corners[i + 1]];
        const p = tri.map((c) => v[idx(c[0], v.length)]);
        let n = tri.map((c) => (c[2] ? vn[idx(c[2], vn.length)] : null));
        if (n.some((x) => !x)) {
          const a = p[1].map((x, k) => x - p[0][k]), b = p[2].map((x, k) => x - p[0][k]);
          const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const l = Math.hypot(...c) || 1;
          n = [0, 1, 2].map(() => c.map((x) => x / l));
        }
        for (let k = 0; k < 3; k++) {
          part.pos.push(...p[k]);
          part.nor.push(...n[k]);
        }
      }
    }
  }
  return [...parts.values()].filter((p) => p.pos.length);
}

/** Lit un .gltf (déjà dans le repère du monde) : une pièce par primitive. */
async function readGltf(io, file, texDir) {
  // les packs « MegaKit » rangent leurs textures à part : on les cherche par leur nom
  const doc = await io.read(file).catch(async () => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const resources = {};
    for (const b of json.buffers ?? []) resources[b.uri] = new Uint8Array(fs.readFileSync(path.join(path.dirname(file), b.uri)));
    for (const im of json.images ?? []) {
      const p = [path.join(path.dirname(file), im.uri), path.join(texDir, im.uri)].find((q) => fs.existsSync(q));
      resources[im.uri] = p ? new Uint8Array(fs.readFileSync(p)) : new Uint8Array(0);
    }
    return io.readJSON({ json, resources });
  });
  const root = doc.getRoot();
  for (const scene of root.listScenes()) for (const n of scene.listChildren()) clearNodeTransform(n);
  // tout le sous-arbre : transformations ramenées dans les maillages
  const parts = [];
  const visit = (node) => {
    clearNodeTransform(node);
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const pos = prim.getAttribute('POSITION');
      const nor = prim.getAttribute('NORMAL');
      const uv = prim.getAttribute('TEXCOORD_0');
      const ind = prim.getIndices();
      const count = ind ? ind.getCount() : pos.getCount();
      const tex = mat?.getBaseColorTexture();
      const p = new Part({
        name: mat?.getName() || 'defaut',
        color: (mat?.getBaseColorFactor() ?? [0.8, 0.8, 0.8, 1]).slice(0, 3),
        opacity: mat?.getAlpha() ?? 1,
        blend: mat?.getAlphaMode() === 'BLEND',
        texture: tex ? { name: tex.getName() || tex.getURI(), image: tex.getImage(), mime: tex.getMimeType() } : null,
        emissive: mat?.getEmissiveFactor()?.some((x) => x > 0) ? mat.getEmissiveFactor() : null,
      });
      const a = [], b = [], c = [];
      for (let i = 0; i < count; i++) {
        const k = ind ? ind.getScalar(i) : i;
        p.pos.push(...pos.getElement(k, a));
        p.nor.push(...(nor ? nor.getElement(k, b) : [0, 1, 0]));
        if (uv) p.uv.push(...uv.getElement(k, c));
      }
      if (p.pos.length) parts.push(p);
    }
    for (const ch of node.listChildren()) visit(ch);
  };
  for (const scene of root.listScenes()) for (const n of scene.listChildren()) visit(n);
  return parts;
}

/** Recentre les pièces d'un modèle : bas de la boîte à y = 0, centre en x et z ; renvoie la boîte. */
function ground(parts, scale) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    p.pos[i + k] *= scale;
    min[k] = Math.min(min[k], p.pos[i + k]);
    max[k] = Math.max(max[k], p.pos[i + k]);
  }
  const off = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) p.pos[i + k] -= off[k];
  const r = (x) => Math.round(x * 1000) / 1000;
  return [r(max[0] - min[0]), r(max[1] - min[1]), r(max[2] - min[2])];
}

async function buildPack(io, pack) {
  const dir = path.join(SRC, pack.dir);
  const ext = pack.kind === 'obj' ? '.obj' : '.gltf';
  const files = walk(dir, ext).filter((f) => !pack.models || pack.models.includes(path.basename(f, ext)));
  const doc = new Document();
  const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = doc.createBuffer();
  const scene = doc.createScene(pack.id);
  const mats = new Map();
  const textures = new Map();
  const sizes = {};
  const material = async (m) => {
    const key = `${m.name}|${m.color.join(',')}|${m.texture?.name ?? ''}|${m.opacity}`;
    if (mats.has(key)) return mats.get(key);
    const mat = doc.createMaterial(m.name).setBaseColorFactor([...m.color, m.opacity]).setMetallicFactor(0).setRoughnessFactor(1);
    if (m.opacity < 1 || m.blend) mat.setAlphaMode('BLEND');
    if (m.emissive) mat.setEmissiveFactor(m.emissive);
    if (m.texture && m.texture.image?.length) {
      let tex = textures.get(m.texture.name);
      if (!tex) {
        const img = await sharp(Buffer.from(m.texture.image)).resize(TEX, TEX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        tex = doc.createTexture(m.texture.name).setImage(new Uint8Array(img)).setMimeType('image/webp').setURI(`${m.texture.name}.webp`);
        textures.set(m.texture.name, tex);
      }
      mat.setBaseColorTexture(tex);
    }
    mats.set(key, mat);
    return mat;
  };
  for (const file of files) {
    const name = path.basename(file, ext);
    const parts = await (pack.kind === 'obj' ? readObj(file) : readGltf(io, file, path.join(SRC, pack.textures))).catch((e) => {
      console.warn(`${file} ignoré : ${e.message}`);
      return [];
    });
    if (!parts.length) continue;
    sizes[name] = ground(parts, pack.scale);
    const mesh = doc.createMesh(name);
    for (const p of parts) {
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p.pos)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p.nor)).setBuffer(buffer))
        .setMaterial(await material(p.mat));
      if (p.uv.length && p.mat.texture) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(p.uv)).setBuffer(buffer));
      mesh.addPrimitive(prim);
    }
    scene.addChild(doc.createNode(name).setMesh(mesh));
  }
  if (!textures.size) webp.dispose();
  // le décor, vu de loin, garde sa silhouette avec deux fois moins de triangles
  const light = pack.simplify ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.008 })] : [];
  await doc.transform(weld(), ...light, dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${pack.id}.glb`);
  await io.write(out, doc);
  console.log(`${out} : ${Object.keys(sizes).length} modèles, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
  return sizes;
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const manifest = {};
const only = args.only?.split(',');
for (const pack of PACKS) if (!only || only.includes(pack.id)) manifest[pack.id] = await buildPack(io, pack);
// les packs pas refaits (avec --only, ou écrits par un autre script) gardent les tailles déjà écrites
const MANIFEST = 'src/game/packs/manifest.ts';
if (fs.existsSync(MANIFEST)) {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  const body = text.slice(text.indexOf('{', text.indexOf('PACK_SIZES')), text.lastIndexOf('} as const') + 1);
  const old = new Function(`return ${body}`)();
  for (const id of Object.keys(old)) if (!(id in manifest)) manifest[id] = old[id];
}
// (les packs écrits par un autre script, comme les aliments Tripo, restent à la suite)
const order = [...PACKS.map((p) => p.id), ...Object.keys(manifest).filter((id) => !PACKS.some((p) => p.id === id))];
const sorted = Object.fromEntries(order.filter((id) => id in manifest).map((id) => [id, manifest[id]]));
if (!Object.keys(sorted).length) process.exit(0);

const lines = [
  '/**',
  ' * Boîte (largeur x, hauteur y, profondeur z, en m) de chaque modèle des packs de Quaternius,',
  ' * posé au sol et centré. Fichier écrit par tools/build_pack_assets.mjs : ne pas modifier à la main.',
  ' */',
  'export const PACK_SIZES = {',
  ...Object.entries(sorted).map(([id, models]) => `  ${id}: {\n${Object.entries(models).map(([n, s]) => `    ${JSON.stringify(n)}: [${s.join(', ')}],`).join('\n')}\n  },`),
  '} as const satisfies Record<string, Record<string, readonly [number, number, number]>>;',
  '',
  'export type PackId = keyof typeof PACK_SIZES;',
  'export type ModelName<P extends PackId> = keyof (typeof PACK_SIZES)[P] & string;',
  '',
];
fs.mkdirSync('src/game/packs', { recursive: true });
fs.writeFileSync(MANIFEST, lines.join('\n'));
