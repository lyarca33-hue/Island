/**
 * Inventaire à cases des meubles de rangement : chaque meuble a une grille (colonnes × rangées),
 * chaque objet y prend un rectangle de cases selon sa taille, vu de face (largeur × hauteur). Un
 * objet n'entre que s'il reste un rectangle libre à sa mesure (en plus d'une place dans le meuble).
 */
import type * as THREE from 'three';

/** Grille de chaque meuble : [colonnes, rangées]. */
export const GRIDS: Record<string, [number, number]> = {
  frigo: [8, 6],
  congelateur: [4, 3],
  placard: [6, 4],
  'plan-de-travail': [6, 4],
  'placard-haut': [6, 4],
  tiroir: [8, 3],
  'garde-manger': [8, 6],
  'lave-vaisselle': [6, 4],
  four: [3, 2],
  'micro-ondes': [2, 2],
  armoire: [6, 6],
  'table-de-nuit': [3, 2],
};

/** Côté d'une case (m) : un objet de 15 cm de large et de haut tient dans une case. */
const CELL = 0.15;
/** Un objet ne prend jamais plus de 3 × 3 cases. */
const MAX = 3;

/** Cases prises par un objet de taille `size` (m) : [largeur, hauteur]. */
export function cellsOf(size: THREE.Vector3): [number, number] {
  const n = (v: number) => Math.min(MAX, Math.max(1, Math.ceil(v / CELL - 0.05)));
  return [n(size.x), n(size.y)];
}

/** Rectangle de cases d'un objet dans la grille. */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Range les objets (leurs cases [l, h]) dans une grille `cols` × `rows`, les plus gros d'abord, chacun
 * à la première place libre (de haut en bas, de gauche à droite). Null s'ils n'y tiennent pas tous.
 * Le résultat suit l'ordre de `items`.
 */
export function pack(cols: number, rows: number, items: Array<[number, number]>): Cell[] | null {
  const used = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const out: Cell[] = new Array(items.length);
  const order = items.map((_, i) => i).sort((a, b) => items[b][0] * items[b][1] - items[a][0] * items[a][1] || a - b);
  for (const i of order) {
    const [w, h] = items[i];
    const free = (x: number, y: number) => {
      for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) if (used[j][k]) return false;
      return true;
    };
    let at: Cell | null = null;
    for (let y = 0; y + h <= rows && !at; y++) for (let x = 0; x + w <= cols && !at; x++) if (free(x, y)) at = { x, y, w, h };
    if (!at) return null;
    for (let j = at.y; j < at.y + h; j++) for (let k = at.x; k < at.x + w; k++) used[j][k] = true;
    out[i] = at;
  }
  return out;
}
