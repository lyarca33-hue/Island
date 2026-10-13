/**
 * Pans de mur de bâtiment taillés dans le muret de la ville (pack ville, `muret` : un mur en pierre
 * sèche de 2 m de long, 1,13 m de haut, 69 cm d'épaisseur).
 *
 * Un pan fait 2 m de long sur 2,80 m de haut : trois murets empilés (assises un peu aplaties pour
 * tomber juste à 2,80 m) et amincis à une cinquantaine de centimètres, un sur deux retourné pour que
 * les pierres ne se répètent pas. Les ouvertures (porte, fenêtre) et le haut en pointe du pignon
 * sont découpés net dans les pierres ; un cadre en bois (rives pour le pignon) recouvre la coupe.
 * Le pan est couché le long de x, face vers ±z, posé au sol (y = 0) et centré : deux pans se
 * mettent bout à bout tous les 2 m.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import { loadPack, packModel } from './assets';

export type PanKind = 'mur' | 'mur-fenetre' | 'mur-porte' | 'pignon';
export const PAN_KINDS: PanKind[] = ['mur', 'mur-fenetre', 'mur-porte', 'pignon'];

/** Longueur (m) d'un pan, hauteur d'un pan droit, et base (m) et hauteur du pignon (posé sur deux pans droits). */
export const PAN_LENGTH = 2;
export const PAN_HEIGHT = 2.8;
export const PIGNON_BASE = 4;
export const PIGNON_HEIGHT = 1.6;
/** Le muret aminci à cette part de son épaisseur. */
const THIN = 0.75;
/** Et un peu allongé : deux pans bout à bout se chevauchent, sans jour entre leurs pierres. */
const OVERLAP = 1.03;
/** Hauteur (m) du muret d'origine : trois murets empilés font un pan. */
const MURET_H = 1.1327;
const COURSES = 3;
const SQUASH = PAN_HEIGHT / (COURSES * MURET_H);
const COURSE_H = MURET_H * SQUASH;

/** Ouvertures découpées (m, repère du pan) : de x0 à x1, de y0 à y1. */
interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export const HOLES: Partial<Record<PanKind, Hole>> = {
  'mur-fenetre': { x0: -0.5, x1: 0.5, y0: 0.9, y1: 2.1 },
  'mur-porte': { x0: -0.6, x1: 0.6, y0: 0, y1: 2.25 },
};
/** Largeur (m) des montants du cadre et des rives. */
const FRAME = 0.1;

// ——— découpe des triangles ———

type Vert = number[][];
/** Garde la part du polygone où a·x + b·y + c ≥ 0. */
function keep(poly: Vert[], a: number, b: number, c: number): Vert[] {
  const f = (v: Vert) => a * v[0][0] + b * v[0][1] + c;
  const res: Vert[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = f(p), fq = f(q);
    if (fp >= 0) res.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      res.push(p.map((x, k) => x.map((v, j) => v + (q[k][j] - v) * t)));
    }
  }
  return res.length >= 3 ? res : [];
}

/** Ce qui reste du polygone hors du rectangle `h` (jusqu'à quatre morceaux). */
function outside(poly: Vert[], h: Hole): Vert[][] {
  const left = keep(poly, -1, 0, h.x0);
  let mid = keep(poly, 1, 0, -h.x0);
  const right = keep(mid, 1, 0, -h.x1);
  mid = keep(mid, -1, 0, h.x1);
  const below = keep(mid, 0, -1, h.y0);
  mid = keep(mid, 0, 1, -h.y0);
  const above = keep(mid, 0, 1, -h.y1);
  return [left, right, below, above].filter((p) => p.length);
}

/**
 * Découpe une géométrie sans index (position, normal, uv) : `cut` rend les morceaux gardés d'un
 * triangle (vide : retiré). Rend une nouvelle géométrie.
 */
export function cutGeometry(g: THREE.BufferGeometry, cut: (tri: Vert[]) => Vert[][]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'].filter((n) => g.getAttribute(n));
  const attrs = names.map((n) => g.getAttribute(n));
  const out: number[][] = names.map(() => []);
  const vert = (i: number): Vert => attrs.map((a) => Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i, c)));
  const n = g.getAttribute('position').count;
  for (let i = 0; i + 2 < n; i += 3) {
    for (const poly of cut([vert(i), vert(i + 1), vert(i + 2)])) {
      for (let j = 1; j + 1 < poly.length; j++) {
        for (const v of [poly[0], poly[j], poly[j + 1]]) v.forEach((x, k) => out[k].push(...x));
      }
    }
  }
  const res = new THREE.BufferGeometry();
  names.forEach((name, k) => res.setAttribute(name, new THREE.Float32BufferAttribute(out[k], attrs[k].itemSize)));
  return res;
}

/**
 * Le muret de la ville (sa géométrie, sans index, dans le repère du modèle : longueur sur z), en
 * pan droit ou en pignon (voir le haut du fichier).
 */
export function panGeometry(muret: THREE.BufferGeometry, kind: PanKind): THREE.BufferGeometry {
  const base = muret.index ? muret.toNonIndexed() : muret.clone();
  // longueur le long de x (un peu allongée), aminci (z) et assises aplaties (y)
  base.applyMatrix4(new THREE.Matrix4().makeScale(OVERLAP, SQUASH, THIN).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  const segs = kind === 'pignon' ? PIGNON_BASE / PAN_LENGTH : 1;
  const courses = kind === 'pignon' ? Math.ceil(PIGNON_HEIGHT / COURSE_H) : COURSES;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < courses; j++) {
      const m = new THREE.Matrix4().makeTranslation((i - (segs - 1) / 2) * PAN_LENGTH, j * COURSE_H, 0);
      // un sur deux retourné : les mêmes pierres ne se suivent pas
      if ((i + j) % 2) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      parts.push(base.clone().applyMatrix4(m));
    }
  }
  const all = concat(parts);
  const hole = HOLES[kind];
  const k = (2 * PIGNON_HEIGHT) / PIGNON_BASE;
  return cutGeometry(all, (tri) => {
    if (kind === 'pignon') {
      // sous les deux pentes : y ≤ k (base/2 − |x|)
      const p = keep(keep(tri, -k, -1, k * (PIGNON_BASE / 2)), k, -1, k * (PIGNON_BASE / 2));
      return p.length ? [p] : [];
    }
    if (!hole) return [tri];
    const xs = tri.map((v) => v[0][0]), ys = tri.map((v) => v[0][1]);
    if (Math.max(...xs) <= hole.x0 || Math.min(...xs) >= hole.x1 || Math.max(...ys) <= hole.y0 || Math.min(...ys) >= hole.y1) return [tri];
    return outside(tri, hole);
  });
}

/** Met bout à bout des géométries sans index qui ont les mêmes attributs. */
function concat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const res = new THREE.BufferGeometry();
  for (const name of Object.keys(parts[0].attributes)) {
    const size = parts[0].getAttribute(name).itemSize;
    const arr = new Float32Array(parts.reduce((s, p) => s + p.getAttribute(name).array.length, 0));
    let o = 0;
    for (const p of parts) {
      arr.set(p.getAttribute(name).array as Float32Array, o);
      o += p.getAttribute(name).array.length;
    }
    res.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return res;
}

// ——— les pans dans le jeu ———

/** Épaisseur (m) d'un pan, pierres saillantes comprises (le muret aminci). */
export const PAN_THICK = 0.694 * THIN;

/** Ce qui bloque le passage d'un pan (boîtes dans son repère) : la porte laisse passer. */
export function panObstacles(kind: PanKind): THREE.Box3[] {
  const z = PAN_THICK / 2, half = PAN_LENGTH / 2;
  const box = (x0: number, x1: number, y1 = PAN_HEIGHT) => new THREE.Box3(new THREE.Vector3(x0, 0, -z), new THREE.Vector3(x1, y1, z));
  if (kind === 'pignon') return [];
  if (kind === 'mur-porte') {
    const h = HOLES[kind]!;
    return [box(-half, h.x0 + FRAME), box(h.x1 - FRAME, half)];
  }
  return [box(-half, half)];
}

let geos: Promise<Map<PanKind, THREE.BufferGeometry> & { material: THREE.Material }> | null = null;

/** Les géométries des pans (taillées une fois, au chargement du pack ville). */
function panGeometries(): Promise<Map<PanKind, THREE.BufferGeometry> & { material: THREE.Material }> {
  geos ??= loadPack('ville').then(() => {
    const model = packModel('ville', 'muret');
    model.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    model.traverse((o) => {
      if (!mesh && o instanceof THREE.Mesh) mesh = o;
    });
    if (!mesh) throw new Error('muret introuvable dans le pack ville');
    const m = mesh as THREE.Mesh;
    const muret = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const map = new Map(PAN_KINDS.map((k) => [k, panGeometry(muret, k)] as const));
    for (const g of map.values()) g.computeBoundingSphere();
    return Object.assign(map, { material: m.material as THREE.Material });
  });
  return geos;
}

const wood = createToonMaterial({ color: 0x6e4a2c, rimStrength: 0 });
const sillStone = createToonMaterial({ color: 0xcdbb94, rimStrength: 0 });
const glass = (() => {
  const m = createToonMaterial({ color: 0xbfe0ea, rimStrength: 0 });
  m.transparent = true;
  m.opacity = 0.35;
  m.depthWrite = false;
  return m;
})();

function block(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, depth: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, depth), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Le cadre qui borde une ouverture (montants, linteau, appui et vitre pour une fenêtre). */
function frameOf(kind: PanKind): THREE.Object3D[] {
  // un peu plus épais que les pierres les plus saillantes : la coupe ne se voit pas
  const d = PAN_THICK + 0.02;
  if (kind === 'pignon') {
    // les deux rives, le long des pentes
    const len = Math.hypot(PIGNON_BASE / 2, PIGNON_HEIGHT) + 0.15;
    const angle = Math.atan2(PIGNON_HEIGHT, PIGNON_BASE / 2);
    return [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, FRAME * 1.4, d), wood);
      // le dessous de la rive suit la pente
      const n = new THREE.Vector2(side * Math.sin(angle), Math.cos(angle)).multiplyScalar((FRAME * 1.4) / 2 - 0.02);
      m.position.set((side * PIGNON_BASE) / 4 + n.x, PIGNON_HEIGHT / 2 + n.y, 0);
      m.rotation.z = side * -angle;
      m.castShadow = m.receiveShadow = true;
      return m;
    });
  }
  const h = HOLES[kind];
  if (!h) return [];
  const parts = [block(wood, h.x0, h.x0 + FRAME, h.y0, h.y1, d), block(wood, h.x1 - FRAME, h.x1, h.y0, h.y1, d), block(wood, h.x0, h.x1, h.y1 - FRAME * 1.5, h.y1, d)];
  if (kind === 'mur-fenetre') {
    // l'appui en pierre, qui dépasse un peu dehors ; la croisée et la vitre, au milieu de l'épaisseur
    const sill = block(sillStone, h.x0 - 0.04, h.x1 + 0.04, h.y0 - 0.02, h.y0 + 0.07, d + 0.08);
    const xm = (h.x0 + h.x1) / 2, ym = (h.y0 + h.y1) / 2;
    parts.push(
      sill,
      block(wood, xm - 0.025, xm + 0.025, h.y0, h.y1, 0.06),
      block(wood, h.x0, h.x1, ym - 0.025, ym + 0.025, 0.06),
      block(glass, h.x0, h.x1, h.y0, h.y1, 0.01),
    );
  }
  return parts;
}

/**
 * Un pan de mur, posé au sol et centré (voir le haut du fichier). Les pierres arrivent avec le
 * pack ville : avant, seul le cadre est là.
 */
export function createPan(kind: PanKind): THREE.Group {
  const g = new THREE.Group();
  g.name = `pans-mur/${kind}`;
  for (const part of frameOf(kind)) g.add(part);
  void panGeometries()
    .then((all) => {
      const stones = new THREE.Mesh(all.get(kind)!, all.material);
      stones.castShadow = stones.receiveShadow = true;
      g.add(stones);
    })
    .catch((e) => console.warn('pans de mur non taillés', e));
  return g;
}
