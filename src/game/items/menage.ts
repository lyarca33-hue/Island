/**
 * Le ménage et le linge faits avec Tripo (public/models/menage.glb, voir tools/README.md) : ce qui
 * n'existait pas encore dans le jeu. La pelle et la balayette, la raclette, la brosse à récurer, la
 * tête de loup, les produits (liquide vaisselle, gel WC, nettoyant sol), le support de la brosse
 * WC, le chariot de ménage où tout se range, la machine à laver et le sèche-linge (leur hublot
 * s'ouvre). Le balai, la serpillière, le seau, le spray et les gants existaient déjà
 * (upkeep.ts) : ils prennent seulement leur modèle (tripo.ts).
 *
 * Avant le chargement du modèle, chaque objet est une boîte à sa taille.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

type Size = [w: number, h: number, d: number];
type V3 = [number, number, number];

function block([w, h, d]: Size, color: THREE.ColorRepresentation): THREE.Group {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createToonMaterial({ color, rimStrength: 0 }));
  m.position.y = h / 2;
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function objet(id: string, name: string, size: Size, color: THREE.ColorRepresentation, more: Partial<ItemDef> = {}): ItemDef {
  return { id, name, portable: true, fragility: 7, durability: 100, build: () => block(size, color), ...more };
}

function meuble(id: string, name: string, size: Size, color: THREE.ColorRepresentation, more: Partial<ItemDef> = {}): ItemDef {
  return { id, name, portable: false, movable: true, durability: 300, fragility: 8, build: () => block(size, color), ...more };
}

/** Hublot de la machine à laver et du sèche-linge : charnière à gauche (repère du modèle). */
export const WASHER_HINGE: V3 = [-0.235, 0, 0.27];
export const DRYER_HINGE: V3 = [-0.218, 0, 0.27];

/** Chariot de ménage : le dessus de ses trois plateaux (mesures du modèle). */
export const CART_SHELVES = [0.565, 0.29, 0.07];
const CART_W = 0.5;
const cartRow = (y: number, n: number): V3[] => Array.from({ length: n }, (_, i): V3 => [-CART_W / 2 + (CART_W * (i + 0.5)) / n, y, 0]);

/** Ce qui se range sur le chariot. */
export const CART_HOLDS = ['nettoyant sol', 'liquide vaisselle', 'gel WC', 'spray nettoyant', 'brosse à récurer', 'raclette', 'pelle', 'balayette', 'gants de ménage', 'éponge', 'chiffon'];

/** Noms au féminin (accord des messages). */
export const MENAGE_FEMININE = ['pelle', 'balayette', 'raclette', 'brosse à récurer', 'tête de loup', 'machine à laver'];

export const MENAGE_ITEMS: ItemDef[] = [
  objet('pelle', 'pelle', [0.31, 0.32, 0.19], 0x4f5d75, { grip: 'handle', gripPoint: [0, 0.28, -0.07] }),
  objet('balayette', 'balayette', [0.3, 0.04, 0.1], 0x4f5d75, { grip: 'fist', gripPoint: [0.11, 0.02, 0] }),
  objet('raclette-vitres', 'raclette', [0.3, 0.12, 0.17], 0x2e3135, { grip: 'fist', gripPoint: [0, 0.06, 0.12] }),
  objet('brosse-recurer', 'brosse à récurer', [0.16, 0.11, 0.07], 0xb08a5c, { grip: 'fist', gripPoint: [0, 0.09, 0] }),
  objet('tete-de-loup', 'tête de loup', [0.25, 1.6, 0.25], 0x8d9093, { grip: 'pole', gripPoint: [0, 1.0, 0], fragility: 9 }),
  objet('liquide-vaisselle', 'liquide vaisselle', [0.08, 0.22, 0.08], 0xe8b04a, { grip: 'fist', gripPoint: [0, 0.1, 0], fragility: 9 }),
  objet('gel-wc', 'gel WC', [0.13, 0.25, 0.08], 0x2f8a6e, { grip: 'fist', gripPoint: [0, 0.1, 0], fragility: 9 }),
  objet('nettoyant-sol', 'nettoyant sol', [0.17, 0.28, 0.12], 0x7f9a5a, { grip: 'handle', gripPoint: [0, 0.22, -0.03], fragility: 9 }),
  objet('support-brosse-wc', 'support de brosse WC', [0.1, 0.13, 0.1], 0xd9c4a8, { fragility: 5, holds: ['brosse WC'], slots: [[0, 0.02, 0]] }),
  meuble('chariot-menage', 'chariot de ménage', [0.61, 0.75, 0.53], 0x7f9a5a, {
    holds: CART_HOLDS,
    slots: [...cartRow(CART_SHELVES[0], 4), ...cartRow(CART_SHELVES[1], 3), ...cartRow(CART_SHELVES[2], 2)],
  }),
  // le hublot s'ouvre vers la gauche, sur sa charnière (tripo.ts)
  meuble('machine-a-laver', 'machine à laver', [0.6, 0.85, 0.62], 0xe9e6de, { door: THREE.MathUtils.degToRad(-100) }),
  meuble('seche-linge', 'sèche-linge', [0.6, 0.85, 0.62], 0xe9e6de, { door: THREE.MathUtils.degToRad(-100) }),
];
