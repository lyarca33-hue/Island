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
import { PACK_SIZES, type ModelName, type PackId } from './manifest';

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
