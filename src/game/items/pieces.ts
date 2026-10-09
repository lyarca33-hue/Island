/**
 * Les meubles et objets des autres pièces (salon, chambre, salle de bain, entrée, garage), faits
 * avec Tripo : leurs fiches. Le modèle de chacun est dans `public/models/<pièce>.glb` (tripo.ts) ;
 * le modèle fait par programme n'est qu'une boîte à la taille du modèle Tripo, le temps qu'il charge
 * (il est chargé avant la maison, voir App.tsx). Les mesures (assises, rayons, plateaux, vasque du
 * lavabo) sont prises sur les modèles.
 *
 * Tous sont posés au sol, l'avant vers +Z, centrés en X et Z.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';
import { ROOM_RIGS } from './rigs';

type Size = [w: number, h: number, d: number];

/** Boîte à la taille du modèle (avant son chargement). */
function block([w, h, d]: Size, color: THREE.ColorRepresentation): THREE.Group {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createToonMaterial({ color, rimStrength: 0 }));
  m.position.y = h / 2;
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Un meuble : pas portable, on le pousse. */
function meuble(id: string, name: string, size: Size, color: THREE.ColorRepresentation, more: Partial<ItemDef> = {}): ItemDef {
  return { id, name, portable: false, movable: true, durability: 300, build: () => block(size, color), ...ROOM_RIGS[id]?.def, ...more };
}

/** Un petit objet qu'on prend à la main. */
function objet(id: string, name: string, size: Size, color: THREE.ColorRepresentation, more: Partial<ItemDef> = {}): ItemDef {
  return { id, name, portable: true, fragility: 4, durability: 80, build: () => block(size, color), ...ROOM_RIGS[id]?.def, ...more };
}

/** Places sur un plateau à la hauteur `y` : une rangée de `n` places de -w/2 à w/2, à la profondeur `z`. */
function row(y: number, w: number, n: number, z = 0): Array<[number, number, number]> {
  return Array.from({ length: n }, (_, i): [number, number, number] => [-w / 2 + (w * (i + 0.5)) / n, y, z]);
}

// —— salon
/** Canapé et fauteuil : hauteur des coussins d'assise. */
const SOFA_SEAT = 0.42;
const ARMCHAIR_SEAT = 0.38;
/** Table basse : plateau et tablette du dessous. */
const LOW_TABLE = [0.436, 0.18];
/** Meuble télé (la console) : ses deux rayons et le dessus, où pose la télé. */
export const CONSOLE_TOP = 0.793;
const CONSOLE_SHELVES = [0.131, 0.514];

// —— chambre
/** Table de nuit : le dessus. */
export const NIGHTSTAND_TOP = 0.544;

// —— salle de bain
/** Lavabo : fond de la vasque, bord, bec du robinet (au-dessus de la vasque). */
const BASIN_FLOOR = 0.67;
const BASIN_Z = 0.08;
const TAP: [number, number, number] = [0, 0.9, -0.03];

// —— garage
/** Établi : plateau et tablette du dessous. */
export const BENCH_TOP = 0.913;
const BENCH_SHELF = 0.227;
/** Étagère du garage : le dessus de ses cinq plateaux. */
const RACK_SHELVES = [0.221, 0.578, 0.913, 1.313, 1.771];

export const PIECES_ITEMS: ItemDef[] = [
  // —— salon
  meuble('canape', 'canapé', [2, 0.9, 0.93], 0x8a9a6a, { seat: SOFA_SEAT }),
  meuble('fauteuil', 'fauteuil', [0.89, 0.9, 0.71], 0xc9a032, { seat: ARMCHAIR_SEAT }),
  meuble('table-basse', 'table basse', [1, 0.44, 0.55], 0xb07a48, {
    slots: [...row(LOW_TABLE[0], 0.8, 4, -0.1), ...row(LOW_TABLE[0], 0.8, 4, 0.12), ...row(LOW_TABLE[1], 0.8, 3)],
  }),
  meuble('meuble-tele', 'meuble télé', [1.2, 0.79, 0.35], 0x8a5a34, {
    slots: [...row(CONSOLE_TOP, 1.1, 5, 0.06), ...CONSOLE_SHELVES.flatMap((y) => row(y, 1.05, 6))],
  }),
  // posée sur le meuble télé, branchée : elle ne se déplace pas
  meuble('television', 'télé', [0.8, 0.7, 0.25], 0x222326, { movable: false, durability: 250 }),
  meuble('lampadaire', 'lampadaire', [0.81, 1.6, 0.78], 0xd8c09a),
  objet('coussin', 'coussin', [0.45, 0.45, 0.22], 0xc9a032, { grip: 'chest', fragility: 1 }),
  objet('telecommande', 'télécommande', [0.08, 0.03, 0.2], 0x26272b),

  // —— chambre
  meuble('lit', 'lit', [1.5, 1.19, 2.05], 0xd8d2c4, { durability: 400 }),
  meuble('table-de-nuit', 'table de nuit', [0.62, 0.55, 0.48], 0xb58556, {
    slots: [...row(NIGHTSTAND_TOP, 0.5, 3, 0.04), ...row(0.151, 0.46, 2)],
  }),
  meuble('lampe-chevet', 'lampe de chevet', [0.19, 0.37, 0.19], 0xe9dcc0, { durability: 120 }),
  // le cintre pend dans l'armoire
  meuble('armoire', 'armoire', [0.95, 1.95, 0.58], 0x8a5a34, { durability: 400, slots: [[0, 1.25, 0], [-0.3, 0.02, 0.05], [0.3, 0.02, 0.05]] }),
  // le réveil donne l'heure : ses aiguilles sont ajoutées sur le cadran (le modèle n'en a pas)
  {
    ...objet('reveil', 'réveil', [0.12, 0.18, 0.07], 0xb0302a, { fragility: 6, clock: true }),
    build: () => {
      const g = block([0.12, 0.18, 0.07], 0xb0302a);
      const hand = (name: string, len: number, w: number) => {
        const pivot = new THREE.Group();
        pivot.name = name;
        pivot.position.set(0, 0.07, 0.036);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.003), createToonMaterial({ color: 0x222222, rimStrength: 0 }));
        m.position.y = len / 2 - 0.006;
        pivot.add(m);
        g.add(pivot);
      };
      hand('aiguille-heures', 0.024, 0.005);
      hand('aiguille-minutes', 0.036, 0.003);
      return g;
    },
  },
  meuble('sansevieria', 'plante', [0.57, 1, 0.55], 0x4f7d48, { durability: 120 }),
  objet('pull', 'pull', [0.26, 0.07, 0.25], 0xe8e2d6, { grip: 'palm', fragility: 1 }),
  objet('cintre', 'chemise sur cintre', [0.41, 0.54, 0.13], 0xe8e2d6, { fragility: 1 }),

  // —— salle de bain
  meuble('lavabo', 'lavabo', [0.78, 1.04, 0.74], 0xd8d6d0, {
    // raccordé à l'eau : il ne se déplace pas
    movable: false,
    fragility: 7,
    pour: { at: [0, BASIN_FLOOR, BASIN_Z], fills: ['tasse', 'verre', 'carafe', "bouteille d'eau"], liquid: 'eau', seconds: 2, color: 0x9fcde6, drain: true },
    wash: { hands: [0, 0.88, 0.04] },
    build: () => {
      const g = block([0.78, 1.04, 0.74], 0xd8d6d0);
      // l'eau qui monte dans la vasque bouchée, le bouchon, le filet du robinet (Game.tickSinks)
      const pool = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1, 0.2), new THREE.MeshBasicMaterial({ color: 0x8fc3e0, transparent: true, opacity: 0.7, depthWrite: false }));
      pool.name = 'cuve';
      pool.visible = false;
      pool.position.set(0, BASIN_FLOOR, BASIN_Z);
      pool.userData = { floor: BASIN_FLOOR, depth: 0.12 };
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.01, 16), createToonMaterial({ color: 0x2a2b2e, rimStrength: 0 }));
      plug.name = 'bouchon';
      plug.visible = false;
      plug.position.set(0, BASIN_FLOOR + 0.006, BASIN_Z);
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), createToonMaterial({ color: 0x9fd3ef, rimStrength: 0 }));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(...TAP);
      g.add(pool, plug, jet);
      return g;
    },
  }),
  meuble('toilettes', 'toilettes', [0.38, 0.81, 0.52], 0xe6e4de, { movable: false, fragility: 7 }),
  meuble('porte-serviettes', 'porte-serviettes', [0.98, 0.98, 0.3], 0xa8adb2),
  objet('serviette', 'serviette', [0.46, 0.46, 0.08], 0x3b78a8, { fragility: 1 }),
  objet('verre-dents', 'verre à dents', [0.07, 0.1, 0.07], 0x8fb4c8, { fragility: 7 }),
  objet('brosse-dents', 'brosse à dents', [0.04, 0.17, 0.02], 0x3aa8d8, { fragility: 2 }),
  objet('savon-pain', 'savon', [0.05, 0.04, 0.08], 0xe7a6b4, { grip: 'cradle', fragility: 1, soap: true }),
  objet('gel-douche', 'gel douche', [0.09, 0.16, 0.1], 0x6a9fd0, { grip: 'cradle', fragility: 3 }),
  objet('papier-toilette', 'papier toilette', [0.11, 0.09, 0.11], 0xf4f1ea, { fragility: 1 }),

  // —— entrée
  // dehors, au bord du chemin : plantée dans le sol
  meuble('boite-lettres', 'boîte aux lettres', [0.32, 1.37, 0.43], 0x4f6a52, { movable: false }),
  meuble('porte-parapluies', 'porte-parapluies', [0.21, 0.5, 0.21], 0x34507a, { durability: 150, slots: [[0, 0.02, 0]] }),
  objet('parapluie', 'parapluie', [0.12, 0.72, 0.14], 0xf1ece0, { grip: 'pole', fragility: 3 }),
  objet('chaussure', 'chaussure', [0.23, 0.12, 0.25], 0x6a4026, { fragility: 1 }),
  objet('chausson', 'chausson', [0.12, 0.1, 0.25], 0xe8b4c0, { fragility: 1 }),
  objet('botte', 'botte de pluie', [0.14, 0.28, 0.21], 0x5f8a6a, { fragility: 1 }),

  // —— garage
  meuble('etabli', 'établi', [1.5, 0.91, 0.65], 0x8a9a8a, {
    durability: 400,
    table: 'comptoir',
    slots: [...row(BENCH_TOP, 1.3, 5, 0.05), ...row(BENCH_SHELF, 1.2, 3)],
  }),
  meuble('etagere-garage', 'étagère', [0.9, 1.8, 0.4], 0xb58a5a, { slots: RACK_SHELVES.flatMap((y) => row(y, 0.8, 3)) }),
  objet('caisse-outils', 'caisse à outils', [0.45, 0.25, 0.26], 0x6a6d70, { grip: 'handle', gripPoint: [0, 0.25, 0], fragility: 8, durability: 200 }),
  objet('carton', 'carton', [0.45, 0.32, 0.36], 0xb88a58, { grip: 'twoHands', gripPoint: [0, 0.16, 0], fragility: 2 }),
  meuble('velo', 'vélo', [1.7, 1.12, 0.74], 0x26272b, { durability: 250 }),
  objet('beche', 'bêche', [0.23, 1.1, 0.12], 0x8a6440, { grip: 'pole', fragility: 9, durability: 300 }),
  objet('rateau', 'râteau', [0.45, 1.5, 0.2], 0x9a7a54, { grip: 'pole', fragility: 9, durability: 300 }),
];
