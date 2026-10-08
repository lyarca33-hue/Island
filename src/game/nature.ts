/**
 * Le décor du jardin en vrais modèles : feuillus, sapins, buissons, chemin de galets, et ce qui
 * pousse au sol (herbes, fleurs, petites plantes, fougères, trèfles, rochers, champignons).
 *
 * Les modèles viennent du « Stylized Nature MegaKit » de Quaternius (CC0), regroupés et allégés
 * dans `public/models/nature.glb` par `tools/build_nature_assets.py`. Chaque sorte de plante est
 * dessinée en une fois pour toutes ses copies (InstancedMesh) : peu de dessins par image.
 *
 * Le jardin (jardin.ts) garde la main sur ce qui se fait et sur les saisons : il teinte les
 * feuilles, effeuille les arbres l'hiver, blanchit les sapins sous la neige (voir NatureDecor).
 * Tant que le fichier n'est pas chargé, le jardin montre ses plantes faites par programme.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rng } from './plants';
import type { Rect } from './room';
import { createToonMaterial } from './toon';

export const NATURE_URL = `${import.meta.env.BASE_URL}models/nature.glb`;

/** Les modèles du fichier : pour chacun, ses pièces (une par matériau). */
export interface NatureKit {
  parts: Map<string, Array<{ geometry: THREE.BufferGeometry; material: string }>>;
  materials: Map<string, THREE.MeshToonMaterial>;
}

let loading: Promise<NatureKit> | null = null;

/** Charge le fichier une seule fois ; les matériaux passent en cel shading, comme le reste du jeu. */
export function loadNature(): Promise<NatureKit> {
  loading ??= new GLTFLoader().loadAsync(NATURE_URL).then((gltf) => {
    const kit: NatureKit = { parts: new Map(), materials: new Map() };
    const toonOf = (old: THREE.MeshStandardMaterial): string => {
      if (!kit.materials.has(old.name)) {
        // pas de liseré sur les feuilles découpées : leurs normales partent dans tous les sens,
        // le liseré les blanchirait presque toutes
        const m = createToonMaterial({ color: 0xffffff, map: old.map, rimStrength: old.alphaTest > 0 ? 0 : 0.12 });
        m.name = old.name;
        m.side = THREE.DoubleSide;
        m.alphaTest = old.alphaTest;
        kit.materials.set(old.name, m);
      }
      old.dispose();
      return old.name;
    };
    for (const node of gltf.scene.children) {
      const parts: Array<{ geometry: THREE.BufferGeometry; material: string }> = [];
      node.traverse((o) => {
        if (o instanceof THREE.Mesh) parts.push({ geometry: o.geometry, material: toonOf(o.material as THREE.MeshStandardMaterial) });
      });
      kit.parts.set(node.name, parts);
    }
    return kit;
  });
  return loading;
}

/** Hauteur d'un modèle (m, avant mise à l'échelle). */
function heightOf(kit: NatureKit, name: string): number {
  const box = new THREE.Box3();
  for (const p of kit.parts.get(name) ?? []) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  return Math.max(0.01, box.max.y);
}

/** Toutes les copies d'un modèle, une InstancedMesh par pièce (nommée `modèle:matériau`). */
function instances(kit: NatureKit, name: string, at: THREE.Matrix4[], shadow: boolean): THREE.InstancedMesh[] {
  if (!at.length) return [];
  return (kit.parts.get(name) ?? []).map((p) => {
    const m = new THREE.InstancedMesh(p.geometry, kit.materials.get(p.material)!, at.length);
    m.name = `${name}:${p.material}`;
    at.forEach((x, i) => m.setMatrixAt(i, x));
    m.computeBoundingSphere();
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  });
}

/** Où sont les arbres, le chemin, et ce qui doit rester libre. */
export interface DecorLayout {
  /** Feuillus et sapins : [x, z, échelle] ; buissons : [x, z, rayon]. */
  oaks: Array<[number, number, number]>;
  pines: Array<[number, number, number]>;
  bushes: Array<[number, number, number]>;
  /** Les pierres plates du chemin. */
  path: Array<[number, number]>;
  /** Où rien ne pousse : les pièces de la maison, la bordure fleurie… */
  rects: Rect[];
  /** …et autour des objets du jardin : [x, z, rayon]. */
  spots: Array<[number, number, number]>;
}

/** Ce que le jardin règle selon la saison. */
export interface NatureDecor {
  readonly group: THREE.Group;
  /** Feuilles des feuillus (texture blanche, teintée par la saison). */
  readonly leaves: THREE.MeshToonMaterial;
  /** Aiguilles des sapins. */
  readonly needles: THREE.MeshToonMaterial;
  /** Feuilles des buissons, toujours verts (blanchies par la neige). */
  readonly bushLeaves: THREE.MeshToonMaterial[];
  /** Ce qui pousse au sol (herbes, plantes), blanchi par la neige. */
  readonly ground: THREE.MeshToonMaterial[];
  /** Les fleurs (au sol et sur les buissons fleuris), fermées l'hiver. */
  readonly flowers: THREE.InstancedMesh[];
  /** Les feuilles des feuillus, à effeuiller. */
  readonly crowns: THREE.InstancedMesh[];
}

/** Hauteur (m) d'un feuillu et d'un sapin d'échelle 1, comme les arbres faits par programme. */
const OAK_H = 4.3;
const PINE_H = 4.0;
/**
 * Couleurs des feuilles (leurs textures sont blanches) : printemps, été, automne, hiver. Plus
 * soutenues que celles des arbres faits par programme : les feuilles du pack sont en aplats.
 */
export const OAK_LEAF_COLOR = [0x78b844, 0x4a8a32, 0xd0731f, 0x7a5a3a];
export const NEEDLE_COLOR = 0x3c7446;
export const BUSH_COLOR = 0x4f8a3c;

/** Ce qui pousse au sol : modèle, nombre de touffes, hauteur (m), copies par touffe, près des arbres. */
const SCATTER: Array<{ model: string; n: number; h: number; clump: number; near?: 'oak' | 'pine' | 'tree' }> = [
  { model: 'Grass_Common_Short', n: 40, h: 0.3, clump: 4 },
  { model: 'Grass_Wispy_Short', n: 10, h: 0.28, clump: 2 },
  { model: 'Clover_1', n: 8, h: 0.12, clump: 2 },
  { model: 'Plant_1', n: 10, h: 0.28, clump: 1 },
  { model: 'Flower_3_Group', n: 8, h: 0.42, clump: 1 },
  { model: 'Flower_4_Single', n: 8, h: 0.36, clump: 2 },
  { model: 'Fern_1', n: 9, h: 0.32, clump: 1, near: 'pine' },
  { model: 'Mushroom_Common', n: 5, h: 0.12, clump: 2, near: 'oak' },
  { model: 'Rock_Medium_1', n: 3, h: 0.4, clump: 1, near: 'tree' },
  { model: 'Rock_Medium_2', n: 3, h: 0.3, clump: 1, near: 'tree' },
  { model: 'Pebble_Round_3', n: 8, h: 0.06, clump: 2 },
];
/** Le jardin semé : de -R à +R autour de la maison. */
const AREA = { x0: -15, x1: 16, z0: -15, z1: 13 };

const OAK_MODELS = ['CommonTree_3', 'CommonTree_5'];
const PINE_MODELS = ['Pine_5', 'Pine_4'];
const PEBBLES = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_4', 'Pebble_Round_5'];

/**
 * Le décor du jardin en modèles du pack, aux places de `layout`. `density` (0 à 1) éclaircit ce
 * qui pousse au sol (qualité basse : moins de triangles à dessiner).
 */
export function natureDecor(kit: NatureKit, layout: DecorLayout, density = 1, seed = 5): NatureDecor {
  const rand = rng(seed);
  const group = new THREE.Group();
  group.name = 'nature';
  const mat = (name: string) => kit.materials.get(name)!;
  const byModel = new Map<string, THREE.Matrix4[]>();
  const put = (model: string, x: number, y: number, z: number, h: number, yaw = rand() * Math.PI * 2) => {
    const s = h / heightOf(kit, model);
    const list = byModel.get(model) ?? [];
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
    byModel.set(model, list);
  };

  layout.oaks.forEach(([x, z, s], i) => put(OAK_MODELS[i % OAK_MODELS.length], x, 0, z, OAK_H * s));
  layout.pines.forEach(([x, z, s], i) => put(PINE_MODELS[i % PINE_MODELS.length], x, 0, z, PINE_H * s));
  layout.bushes.forEach(([x, z, r], i) => put(i % 2 ? 'Bush_Common_Flowers' : 'Bush_Common', x, 0, z, r * 1.9));
  // le chemin : des galets plats, un peu enfoncés dans l'herbe
  layout.path.forEach(([x, z], i) => put(PEBBLES[i % PEBBLES.length], x, -0.02, z, 0.07, i * 1.3));

  // ce qui pousse au sol, en touffes, hors de la maison, du chemin et des objets du jardin
  const trees = [...layout.oaks.map(([x, z]) => ({ x, z, kind: 'oak' })), ...layout.pines.map(([x, z]) => ({ x, z, kind: 'pine' }))];
  const free = (x: number, z: number, r: number) =>
    layout.rects.every((q) => x < q.x0 - r - 0.4 || x > q.x1 + r + 0.4 || z < q.z0 - r - 0.4 || z > q.z1 + r + 0.4) &&
    layout.spots.every(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) > sr + r) &&
    layout.path.every(([px, pz]) => Math.hypot(x - px, z - pz) > 0.45 + r) &&
    layout.bushes.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br * 0.8 + r) &&
    trees.every((t) => Math.hypot(x - t.x, z - t.z) > 0.3 + r);
  for (const kind of SCATTER) {
    const n = Math.round(kind.n * density);
    const near = kind.near ? trees.filter((t) => kind.near === 'tree' || t.kind === kind.near) : [];
    for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
      let x: number, z: number;
      if (near.length) {
        const t = near[Math.floor(rand() * near.length)], a = rand() * Math.PI * 2, d = 0.6 + rand() * 1.1;
        x = t.x + Math.cos(a) * d;
        z = t.z + Math.sin(a) * d;
      } else {
        x = AREA.x0 + rand() * (AREA.x1 - AREA.x0);
        z = AREA.z0 + rand() * (AREA.z1 - AREA.z0);
      }
      if (!free(x, z, 0.3)) continue;
      k++;
      for (let c = 0; c < kind.clump; c++) {
        const cx = x + (c ? (rand() - 0.5) * 0.6 : 0), cz = z + (c ? (rand() - 0.5) * 0.6 : 0);
        if (c && !free(cx, cz, 0.15)) continue;
        put(kind.model, cx, 0, cz, kind.h * (0.8 + rand() * 0.4));
      }
    }
  }

  const tall = new Set([...OAK_MODELS, ...PINE_MODELS, 'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2']);
  const all: THREE.InstancedMesh[] = [];
  for (const [model, at] of byModel) all.push(...instances(kit, model, at, tall.has(model)));
  if (all.length) group.add(...all);

  const leaves = mat('feuilles'), needles = mat('aiguilles'), bushLeaves = mat('feuilles-buisson');
  needles.color.set(NEEDLE_COLOR);
  bushLeaves.color.set(BUSH_COLOR);
  // les buissons fleuris ont les feuilles des feuillus : un matériau à part, vert toute l'année
  const bushTop = all.find((m) => m.name === 'Bush_Common_Flowers:feuilles');
  const bushFlowerLeaves = createToonMaterial({ color: BUSH_COLOR, map: leaves.map, rimStrength: 0 });
  bushFlowerLeaves.side = THREE.DoubleSide;
  bushFlowerLeaves.alphaTest = leaves.alphaTest;
  if (bushTop) bushTop.material = bushFlowerLeaves;
  return {
    group,
    leaves,
    needles,
    bushLeaves: [bushLeaves, bushFlowerLeaves],
    ground: [mat('herbe'), mat('plantes')],
    flowers: all.filter((m) => m.name.endsWith(':fleurs')),
    crowns: all.filter((m) => m.name.endsWith(':feuilles') && m !== bushTop),
  };
}
