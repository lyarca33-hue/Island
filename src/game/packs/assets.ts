/**
 * Modèles des packs de Quaternius (CC0), un .glb par pack dans public/packs (voir
 * tools/build_pack_assets.mjs) : chaque modèle y est un nœud nommé comme le fichier d'origine,
 * posé au sol (bas de sa boîte à y = 0) et centré.
 *
 * Les packs dont le jeu fait des objets (nourriture) sont chargés avant de construire la maison
 * (preloadPacks) : `packModel` les rend alors tout de suite. Un pack pas encore chargé : `packModel`
 * rend un groupe vide qui se remplit au chargement.
 * Les matériaux deviennent du cel shading, comme le reste du jeu.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createToonMaterial } from '../toon';
import { poseMotion } from '../items/rigs';
import { PACK_SIZES, type ModelName, type PackId } from './manifest';
import { packRigOf, type Box, type Make, type PackRig } from './rigs';

export const packUrl = (id: PackId) => `${import.meta.env.BASE_URL}packs/${id}.glb`;

/** Packs chargés : modèle par nom. */
const loaded = new Map<PackId, Map<string, THREE.Object3D>>();
const loading = new Map<PackId, Promise<void>>();
/** Groupes rendus avant le chargement, à remplir quand le pack arrive. */
const pending = new Map<PackId, Array<{ name: string; into: THREE.Group; own: boolean }>>();

/** Matériau toon équivalent (un par matériau du pack, partagé par tous les modèles). */
function toonOf(m: THREE.Material): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  const t = createToonMaterial({ color: src.color ?? 0xffffff, map: src.map ?? null, rimStrength: 0.15 });
  if (src.transparent) {
    t.transparent = true;
    t.opacity = src.opacity;
    t.depthWrite = false;
  }
  if (src.emissive && src.emissive.getHex() !== 0) {
    t.emissive.copy(src.emissive);
    t.emissiveMap = src.emissiveMap ?? null;
  }
  t.side = src.side;
  t.name = src.name;
  // une texture peinte (packs « MegaKit », monstres) ne prend pas les taches d'usure (durability.ts)
  if (t.map) t.userData.noWear = true;
  return t;
}

/**
 * Sommets en nombres simples, un tableau par attribut : la compression (meshopt) les rend entrelacés
 * et quantifiés, ce que la fusion des pièces fixes (merge.ts) ne sait pas regrouper.
 */
function plainGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(a.count * a.itemSize);
    // (getComponent rend la valeur décompressée d'un attribut normalisé)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (g.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}

/** Charge un pack (une seule fois). */
export function loadPack(id: PackId): Promise<void> {
  let p = loading.get(id);
  if (p) return p;
  p = new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(packUrl(id))
    .then((gltf) => {
      const mats = new Map<THREE.Material, THREE.Material>();
      const geos = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
      const models = new Map<string, THREE.Object3D>();
      for (const node of [...gltf.scene.children]) {
        node.traverse((o) => {
          o.userData = {};
          if (!(o instanceof THREE.Mesh)) return;
          const m = o.material as THREE.Material;
          if (!mats.has(m)) mats.set(m, toonOf(m));
          o.material = mats.get(m)!;
          if (!geos.has(o.geometry)) geos.set(o.geometry, plainGeometry(o.geometry));
          o.geometry = geos.get(o.geometry)!;
          o.castShadow = true;
          o.receiveShadow = true;
        });
        models.set(node.name, node);
      }
      loaded.set(id, models);
      for (const { name, into, own } of pending.get(id) ?? []) fill(id, name, into, own);
      pending.delete(id);
    });
  // un pack qui manque (tests, hors ligne) n'empêche pas de jouer : le décor reste vide
  p = p.catch((e) => console.warn(`Pack ${id} non chargé`, e));
  loading.set(id, p);
  return p;
}

/** Charge ces packs ; rend la main quand ils sont prêts (ou ont échoué). */
export function preloadPacks(ids: PackId[]): Promise<void> {
  return Promise.all(ids.map(loadPack)).then(() => undefined);
}

export const packReady = (id: PackId) => loaded.has(id);

function fill(id: PackId, name: string, into: THREE.Group, own: boolean): void {
  const src = loaded.get(id)?.get(name);
  if (!src) return;
  // (sa position et son échelle sont celles du nœud : la décompression des sommets, voir meshopt)
  const copy = src.clone();
  // sans nom : ses pièces sont fixes et se regroupent (merge.ts)
  copy.traverse((o) => {
    o.name = '';
    // un objet s'use seul : ses matériaux à lui (sinon toutes les cannes pâliraient ensemble)
    if (own && o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
  });
  into.add(copy);
}

/** Boîte du modèle (largeur x, hauteur y, profondeur z, en unités du pack). */
export function packSize<P extends PackId>(id: P, name: ModelName<P>): THREE.Vector3 {
  const s = (PACK_SIZES[id] as Record<string, readonly [number, number, number]>)[name];
  return s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1);
}

export interface Fit {
  /** Taille voulue (m) de la plus grande dimension, ou de la hauteur, de la largeur (x), de la longueur (z). */
  size?: number;
  height?: number;
  width?: number;
  length?: number;
  /** Échelle directe (prise si aucune taille n'est donnée). */
  scale?: number;
}

/** Échelle qui donne au modèle la taille voulue. */
export function fitScale<P extends PackId>(id: P, name: ModelName<P>, fit: Fit): number {
  const s = packSize(id, name);
  if (fit.size) return fit.size / Math.max(s.x, s.y, s.z);
  if (fit.height) return fit.height / s.y;
  if (fit.width) return fit.width / s.x;
  if (fit.length) return fit.length / s.z;
  return fit.scale ?? 1;
}

/**
 * Le modèle `name` du pack `id`, mis à la taille voulue, posé au sol. Pack pas encore chargé : le
 * groupe se remplit quand il arrive (sa boîte, elle, est connue tout de suite : packSize).
 * `own` : matériaux à lui (un objet du jeu, qui s'use) ; sinon partagés (le décor).
 */
export function packModel<P extends PackId>(id: P, name: ModelName<P>, fit: Fit = {}, own = false): THREE.Group {
  const g = new THREE.Group();
  g.name = '';
  const inner = new THREE.Group();
  inner.scale.setScalar(fitScale(id, name, fit));
  g.add(inner);
  if (loaded.has(id)) fill(id, name, inner, own);
  else {
    if (!pending.has(id)) pending.set(id, []);
    pending.get(id)!.push({ name, into: inner, own });
    void loadPack(id);
  }
  return g;
}

/** La texture du modèle `name` (sa première pièce peinte), si le pack est chargé : un état d'aliment (interior.ts). */
export function packTexture<P extends PackId>(id: P, name: string): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  loaded.get(id)?.get(name)?.traverse((o) => {
    if (!map && o instanceof THREE.Mesh) map = (o.material as THREE.MeshToonMaterial).map ?? null;
  });
  return map;
}

const inBox = (p: THREE.Vector3, [lo, hi]: Box) =>
  p.x >= lo[0] && p.x <= hi[0] && p.y >= lo[1] && p.y <= hi[1] && p.z >= lo[2] && p.z <= hi[2];

/** Pixels d'une texture (lus une fois) ; null hors navigateur. */
const pixels = new WeakMap<object, ImageData | null>();
function pixelsOf(tex: THREE.Texture | null): ImageData | null {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || typeof document === 'undefined') return null;
  if (!pixels.has(img)) {
    let data: ImageData | null = null;
    try {
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      data = g.getImageData(0, 0, img.width, img.height);
    } catch {
      data = null;
    }
    pixels.set(img, data);
  }
  return pixels.get(img)!;
}

/** Luminosité (0 à 1) de la texture au point uv. */
function lumaAt(px: ImageData, u: number, v: number): number {
  const x = Math.min(px.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * px.width)));
  const y = Math.min(px.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * px.height)));
  const o = (y * px.width + x) * 4;
  return (0.2126 * px.data[o] + 0.7152 * px.data[o + 1] + 0.0722 * px.data[o + 2]) / 255;
}

/**
 * Les triangles d'une géométrie sans index (repère du modèle) dont le centre passe le test (et, avec
 * `bright`, dont la texture est assez claire au centre).
 */
function pick(g: THREE.BufferGeometry, keep: (c: THREE.Vector3) => boolean, bright?: { px: ImageData; min: number }): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const yes: number[] = [], no: number[] = [];
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, t * 3 + k));
    let ok = keep(c.divideScalar(3));
    if (ok && bright && uv) {
      const u = (uv.getX(t * 3) + uv.getX(t * 3 + 1) + uv.getX(t * 3 + 2)) / 3;
      const w = (uv.getY(t * 3) + uv.getY(t * 3 + 1) + uv.getY(t * 3 + 2)) / 3;
      ok = lumaAt(bright.px, u, w) >= bright.min;
    }
    (ok ? yes : no).push(t);
  }
  const take = (tris: number[]) => {
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const arr = new Float32Array(tris.length * 3 * a.itemSize);
      tris.forEach((t, i) => arr.set((a.array as Float32Array).subarray(t * 3 * a.itemSize, (t + 1) * 3 * a.itemSize), i * 3 * a.itemSize));
      out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    return out;
  };
  return [take(yes), take(no)];
}

/** Pièce faite par programme, l'axe à l'origine. */
function made(m: Make): THREE.Mesh {
  if (m.shape === 'jet') {
    const g = new THREE.CylinderGeometry(m.radius * (m.up ? 0.8 : 1), m.radius * (m.up ? 1 : 0.8), m.length, 8, 1, true).translate(0, (m.up ? 1 : -1) * (m.length / 2), 0);
    const mat = createToonMaterial({ color: m.color, rimStrength: 0 });
    mat.transparent = true;
    mat.opacity = m.opacity ?? 0.75;
    return new THREE.Mesh(g, mat);
  }
  if (m.shape === 'flamme') {
    const g = new THREE.ConeGeometry(m.radius, m.height, 8).translate(0, m.height / 2, 0);
    const mat = createToonMaterial({ color: 0xffb340, rimStrength: 0 });
    mat.emissive.set(0xff8a1c);
    return new THREE.Mesh(g, mat);
  }
  // (en anneaux : la surface peut onduler)
  if (m.shape === 'disque') return new THREE.Mesh(new THREE.RingGeometry(0, m.radius, 32, 8).rotateX(-Math.PI / 2), createToonMaterial({ color: m.color, rimStrength: 0 }));
  if (m.shape === 'cadran') return new THREE.Mesh(new THREE.CircleGeometry(m.radius, 32).rotateY(m.yaw), createToonMaterial({ color: m.color, rimStrength: 0 }));
  // l'aiguille, de l'axe vers midi (un peu en arrière de l'axe), à 4 mm devant le cadran
  const g = new THREE.BoxGeometry(m.width, m.length, 0.004).translate(0, m.length * 0.42, 0.004).rotateY(m.yaw);
  return new THREE.Mesh(g, createToonMaterial({ color: m.color, rimStrength: 0 }));
}

/**
 * Le modèle `name` du pack `id` découpé selon son rig (rigs.ts) : un groupe (repère du modèle, à sa
 * vraie taille) dont les pièces mobiles sont des enfants nommés, posés sur leur axe et au repos,
 * prêts pour `poseRig(objet, 'porte', k)`. Rend null si le pack n'est pas chargé ou si le modèle
 * n'a pas de rig. Les matériaux sont à l'objet (une lumière s'allume seule).
 */
export function packRig<P extends PackId>(id: P, name: ModelName<P>): THREE.Group | null {
  const rig = packRigOf(id, name);
  const src = loaded.get(id)?.get(name);
  if (!rig || !src) return null;
  return cutRig(src, rig);
}

/** Découpe `src` (un modèle de pack) selon `rig`. */
export function cutRig(src: THREE.Object3D, rig: PackRig): THREE.Group {
  const root = src.clone();
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  // à plat dans le repère du modèle, un morceau par maillage : le nœud lui-même porte la
  // décompression des sommets (meshopt), sa matrice est gardée
  const node = new THREE.Matrix4().compose(src.position, src.quaternion, src.scale);
  const pieces: Array<{ g: THREE.BufferGeometry; mat: THREE.Material }> = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(node.clone().multiply(o.matrixWorld));
    pieces.push({ g, mat: (o.material as THREE.Material).clone() });
  });
  const out = new THREE.Group();
  const side = rig.inside ? THREE.DoubleSide : THREE.FrontSide;
  for (const p of pieces) p.mat.side = side;
  for (const [partName, part] of Object.entries(rig.parts)) {
    const g = new THREE.Group();
    g.name = partName;
    const pivot = new THREE.Vector3(...(part.pivot ?? [0, 0, 0]));
    g.position.copy(pivot);
    if (part.boxes) {
      for (const p of pieces) {
        const keep = (c: THREE.Vector3) => part.boxes!.some((b) => inBox(c, b)) && !(part.not ?? []).some((b) => inBox(c, b));
        const px = part.bright !== undefined ? pixelsOf((p.mat as THREE.MeshToonMaterial).map) : null;
        const [mine, rest] = pick(p.g, keep, px ? { px, min: part.bright! } : undefined);
        p.g = rest;
        if (!mine.getAttribute('position').count) continue;
        mine.translate(-pivot.x, -pivot.y, -pivot.z);
        // une pièce qui s'allume a ses matériaux à elle
        const mesh = new THREE.Mesh(mine, part.motion?.kind === 'glow' ? p.mat.clone() : p.mat);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      }
    }
    if (part.make) g.add(made(part.make));
    if (part.motion) g.userData.motion = part.motion;
    if (part.play) g.userData.play = part.play;
    if (part.period) g.userData.period = part.period;
    out.add(g);
  }
  for (const p of pieces) {
    if (!p.g.getAttribute('position').count) continue;
    const mesh = new THREE.Mesh(p.g, p.mat);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  // au repos
  for (const g of out.children) if (g.userData.motion) poseMotion(g, g.userData.motion, 0);
  return out;
}
