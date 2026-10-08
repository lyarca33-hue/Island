/**
 * Le chaton et ses affaires (sa vie est dans chat.ts) : le chaton lui-même, sa gamelle et le sac
 * de croquettes. Tout est fait par programme pour le jeu (formes three.js, aucun fichier tiers) :
 * une vingtaine de petites pièces, nommées pour bouger (tête, pattes, queue, yeux).
 *
 * Le chaton a l'avant vers +Z, comme les autres objets.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

/** Pelage roux, ventre et chaussettes blanches, truffe et intérieur des oreilles roses. */
const FUR = 0xf2a75a;
const STRIPE = 0xc4773a;
const WHITE = 0xfff3e2;
const PINK = 0xf0a0a0;
const EYE = 0x2b2a26;

/** Hauteur du dos (m), longueur des pattes, du cou à la queue. */
export const KITTEN_BACK = 0.17;
export const LEG_L = 0.1;
export const TAIL_SEGS = 5;
export const TAIL_SEG_L = 0.045;
/** Échelle du chaton (ses mesures ci-dessus sont celles d'avant). */
export const KITTEN_SCALE = 1.45;

/**
 * Matériaux d'un objet, un par couleur, à lui seul : l'usure (durability.ts) ternit l'objet qui
 * s'use sans toucher les autres. Ceux du chaton ne s'usent pas.
 */
let mats = new Map<number, THREE.Material>();
let wears = true;
function mat(color: number): THREE.Material {
  let m = mats.get(color);
  if (!m) {
    mats.set(color, (m = createToonMaterial({ color, rimStrength: 0.2 })));
    if (!wears) m.userData.noWear = true;
  }
  return m;
}

/** Construit avec des matériaux neufs. */
function fresh<T>(build: () => T, wear = true): T {
  mats = new Map();
  wears = wear;
  return build();
}

function mesh(geo: THREE.BufferGeometry, color: number, name = ''): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Un groupe nommé (pivot) posé en (x, y, z). */
function pivot(name: string, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/**
 * Le chaton : groupe `chat` (jamais regroupé avec d'autres pièces, voir merge.ts), et dedans
 * `corps`, `tete` (avec `yeux`), quatre pattes `patte-ag` `patte-ad` `patte-pg` `patte-pd`
 * (avant / arrière, gauche / droite : pivot à l'épaule, la patte pend vers le bas) et la queue
 * en segments `queue-0`… emboîtés.
 */
export function buildKitten(): THREE.Group {
  const root = new THREE.Group();
  const cat = new THREE.Group();
  cat.name = 'chat';
  // un chaton de quelques mois, un peu agrandi pour bien se voir à côté du perso
  cat.scale.setScalar(KITTEN_SCALE);
  root.add(cat);

  const body = pivot('corps', 0, KITTEN_BACK - 0.05, 0);
  const trunk = mesh(new THREE.SphereGeometry(1, 14, 10), FUR);
  trunk.scale.set(0.068, 0.062, 0.12);
  const belly = mesh(new THREE.SphereGeometry(1, 12, 8), WHITE);
  belly.scale.set(0.055, 0.05, 0.1);
  belly.position.set(0, -0.016, 0.01);
  body.add(trunk, belly);
  // trois rayures sur le dos
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.TorusGeometry(0.06, 0.007, 4, 12, Math.PI * 0.8), STRIPE);
    s.rotation.set(0, Math.PI / 2, Math.PI * 0.1);
    s.position.set(0, 0.008, -0.05 + i * 0.045);
    s.scale.set(1.08, 1, 1);
    body.add(s);
  }
  cat.add(body);

  const head = pivot('tete', 0, KITTEN_BACK + 0.035, 0.12);
  const skull = mesh(new THREE.SphereGeometry(0.058, 14, 10), FUR);
  skull.scale.set(1.05, 0.92, 0.95);
  const muzzle = mesh(new THREE.SphereGeometry(0.028, 10, 8), WHITE);
  muzzle.scale.set(1.2, 0.8, 0.8);
  muzzle.position.set(0, -0.018, 0.045);
  const nose = mesh(new THREE.SphereGeometry(0.008, 8, 6), PINK);
  nose.position.set(0, -0.006, 0.066);
  head.add(skull, muzzle, nose);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.022, 0.045, 4), FUR);
    ear.position.set(side * 0.032, 0.05, -0.005);
    ear.rotation.set(-0.15, Math.PI / 4, side * -0.3);
    const inner = mesh(new THREE.ConeGeometry(0.013, 0.03, 3), PINK);
    inner.position.set(0, -0.004, 0.008);
    ear.add(inner);
    head.add(ear);
  }
  const eyes = pivot('yeux', 0, 0.008, 0.048);
  for (const side of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.011, 8, 6), EYE);
    e.position.set(side * 0.022, 0, 0);
    e.scale.set(1, 1.25, 0.6);
    e.castShadow = false;
    eyes.add(e);
  }
  head.add(eyes);
  cat.add(head);

  const legGeo = new THREE.CylinderGeometry(0.014, 0.012, LEG_L, 6).translate(0, -LEG_L / 2, 0);
  const pawGeo = new THREE.SphereGeometry(0.016, 8, 6);
  for (const [name, x, z] of [['patte-ag', -0.032, 0.075], ['patte-ad', 0.032, 0.075], ['patte-pg', -0.034, -0.075], ['patte-pd', 0.034, -0.075]] as const) {
    const leg = pivot(name, x, LEG_L + 0.01, z);
    const shank = mesh(legGeo, FUR);
    const paw = mesh(pawGeo, WHITE);
    paw.scale.set(1, 0.6, 1.2);
    paw.position.set(0, -LEG_L, 0.004);
    leg.add(shank, paw);
    cat.add(leg);
  }

  // la queue : des segments emboîtés, chacun tourne un peu (elle ondule, se dresse, s'enroule)
  let parent: THREE.Object3D = cat;
  let at = new THREE.Vector3(0, KITTEN_BACK - 0.03, -0.11);
  const segGeo = new THREE.CylinderGeometry(0.011, 0.013, TAIL_SEG_L, 6).rotateX(Math.PI / 2).translate(0, 0, -TAIL_SEG_L / 2);
  for (let i = 0; i < TAIL_SEGS; i++) {
    const seg = pivot(`queue-${i}`, at.x, at.y, at.z);
    seg.add(mesh(segGeo, i === TAIL_SEGS - 1 ? STRIPE : FUR));
    parent.add(seg);
    parent = seg;
    at = new THREE.Vector3(0, 0, -TAIL_SEG_L);
  }
  return root;
}

/** La gamelle bleue ; ses croquettes (pièce `croquettes`) se voient quand elle est remplie. */
function buildBowl(): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 18, 1, true).translate(0, 0.02, 0), 0x4f86c7);
  (outer.material as THREE.Material).side = THREE.DoubleSide;
  const base = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 18).translate(0, 0.003, 0), 0x3e6ea8);
  const rim = mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 18).rotateX(Math.PI / 2).translate(0, 0.04, 0), 0x6a9bd6);
  g.add(outer, base, rim);
  const food = new THREE.Group();
  food.name = 'croquettes';
  const pile = mesh(new THREE.SphereGeometry(0.068, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9b5e2c);
  pile.scale.set(1, 0.35, 1);
  pile.position.y = 0.012;
  food.add(pile);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 0.02 + (i % 3) * 0.015;
    const k = mesh(new THREE.DodecahedronGeometry(0.008), 0x7a4521);
    k.position.set(Math.cos(a) * r, 0.03 - r * 0.2, Math.sin(a) * r);
    food.add(k);
  }
  food.visible = false;
  g.add(food);
  return g;
}

/** Le sac de croquettes : un sachet orange avec un poisson dessiné. */
function buildBag(): THREE.Group {
  const g = new THREE.Group();
  const bag = mesh(new THREE.BoxGeometry(0.16, 0.24, 0.07).translate(0, 0.12, 0), 0xf08a3c);
  const fold = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.04).translate(0, 0.252, 0), 0xd9702a);
  const label = mesh(new THREE.CircleGeometry(0.045, 16).translate(0, 0.12, 0.0355), 0xfff3e2);
  const fish = mesh(new THREE.SphereGeometry(0.022, 10, 6).scale(1.4, 0.7, 0.2).translate(-0.004, 0.12, 0.037), 0x4f86c6);
  const fin = mesh(new THREE.ConeGeometry(0.014, 0.02, 3).rotateZ(Math.PI / 2).scale(1, 1, 0.2).translate(0.034, 0.12, 0.037), 0x4f86c6);
  g.add(bag, fold, label, fish, fin);
  return g;
}

/** Portions dans un sac de croquettes neuf. */
export const BAG_SERVINGS = 8;

export const ANIMAL_ITEMS: ItemDef[] = [
  // le chaton vit sa vie (chat.ts) : on ne le prend pas, on le caresse et on le nourrit
  { id: 'chaton', name: 'chaton', portable: false, fragility: 10, durability: 100000, build: () => fresh(buildKitten, false) },
  { id: 'gamelle', name: 'gamelle', portable: true, fragility: 9, durability: 300, build: () => fresh(buildBowl) },
  { id: 'croquettes', name: 'sac de croquettes', portable: true, fragility: 10, durability: BAG_SERVINGS, build: () => fresh(buildBag) },
];

/** Prix au magasin (centimes). */
export const ANIMAL_PRICES: Record<string, number> = { gamelle: 600, croquettes: 450 };

export const ANIMAL_FEMININE = ['gamelle'];

/** Ce que mange le chaton : les croquettes, un poisson pêché, un steak. */
export function catFood(id: string, isFish: (id: string) => boolean): boolean {
  return id === 'croquettes' || id === 'steak' || isFish(id);
}

/** Le coin du potager où le chaton errant attend qu'on le nourrisse : centre (x, z) et rayon (m). */
export const STRAY_ZONE = { x: 2.2, z: 6.0, r: 1.1 };

/** La chatière, dans le mur sud de la cuisine près de la table : côté jardin et côté cuisine. */
export const CAT_FLAP = { x: 2.4, outside: 3.2, inside: 2.4 };

/** Objets posés au départ : [id, x, y, z, rotation (rad)]. */
export const ANIMAL_START: Array<[string, number, number, number, number]> = [
  ['chaton', STRAY_ZONE.x, 0, STRAY_ZONE.z, Math.PI],
  // la gamelle par terre contre le mur est de la cuisine, les croquettes à côté
  ['gamelle', 2.9, 0, -0.35, 0],
  ['croquettes', 2.98, 0, 0.0, -Math.PI / 2],
];

// ——— la vie du chaton, en chiffres (sans three.js : testé à part) ———

/** Faim gagnée par minute de jeu (pleine en deux heures), sommeil gagné éveillé, perdu en dormant. */
export const HUNGER_PER_MIN = 1 / 120;
export const SLEEPY_PER_MIN = 1 / 70;
export const REST_PER_MIN = 1 / 25;
/** Il réclame à partir de cette faim. */
export const HUNGRY = 0.7;

export interface KittenNeeds {
  hunger: number;
  sleepy: number;
}

/** Faim et sommeil après `minutes` de jeu, éveillé ou endormi (bornés entre 0 et 1). */
export function tickNeeds(n: KittenNeeds, minutes: number, asleep: boolean): KittenNeeds {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    hunger: clamp(n.hunger + minutes * HUNGER_PER_MIN * (asleep ? 0.5 : 1)),
    sleepy: clamp(n.sleepy + minutes * (asleep ? -REST_PER_MIN : SLEEPY_PER_MIN)),
  };
}

/** Ce qu'il veut faire, une fois libre : manger d'abord, puis dormir, sinon se promener. */
export function kittenWants(n: KittenNeeds): 'manger' | 'dormir' | 'balade' {
  if (n.hunger >= HUNGRY) return 'manger';
  if (n.sleepy >= 1) return 'dormir';
  return 'balade';
}

/** L'état du chaton gardé avec la partie (sur le chaton). */
export interface KittenSave {
  adopte: boolean;
  faim: number;
  sommeil: number;
}

/** Relit l'état sauvé ; null s'il est absent ou abîmé. */
export function readKitten(x: unknown): KittenSave | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return { adopte: o.adopte === true, faim: num(o.faim), sommeil: num(o.sommeil) };
}
