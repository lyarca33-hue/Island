/**
 * Les provisions : épicerie (farine, sucre, chocolat, pots, sauces, biscuits…), produits frais
 * (viandes, poisson, laitages, fruits et légumes), boissons et surgelés, plus le garde-manger où
 * se range l'épicerie, le sac de courses et la liste de courses (Game : stocks et courses).
 *
 * Mêmes fiches que le reste du catalogue (catalog.ts). Un aliment qui cuit a une pièce `cuit`
 * dont la couleur suit la cuisson ; un surgelé est « surgelé » tant qu'il n'est pas passé au four
 * ou à la poêle (rawWord) ; une boisson se verse dans un verre comme la bouteille d'eau.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';
import { PREP_STOCK } from './prep';
import { UPKEEP_STOCK } from './upkeep';
import { LIFE_STOCK } from './life';
import { FECULENT_PANTRY, FECULENT_STOCK } from './feculents';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = h / 2, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cyl = (r: number, h: number, color: THREE.ColorRepresentation, y = h / 2, x = 0, z = 0, n = 16) => mesh(new THREE.CylinderGeometry(r, r, h, n), color, x, y, z);
/** Une pièce dont la couleur suit la cuisson (voir cooking.ts). */
const cooked = <T extends THREE.Mesh>(m: T): T => {
  m.name = 'cuit';
  return m;
};

/** Couleur de chaque boisson (le verre où on la verse prend cette couleur). */
export const DRINK_COLORS: Record<string, THREE.ColorRepresentation> = {
  "jus d'orange": 0xf5a623,
  soda: 0x5a2e1c,
  'eau gazeuse': 0xcfe9f2,
  vin: 0x7a1e2c,
};

/** Ce que rend une tasse entière de chaque boisson, en plus de la soif (voir Game.tickNeeds). */
export const DRINK_EFFECTS: Record<string, { soif?: number; faim?: number; fatigue?: number }> = {
  "jus d'orange": { faim: 6 },
  soda: { fatigue: 4 },
  'eau gazeuse': { soif: 15 },
  vin: {},
  lait: { faim: 4 },
};

/** Épicerie : se range au garde-manger. */
export const PANTRY_THINGS = ['farine', 'sucre', 'tablette de chocolat', 'confiture', 'miel', 'pâte à tartiner', 'sauce tomate', 'vinaigre', 'levure', 'biscuits', 'chips', 'oignon', 'ail', 'banane', 'pomme de terre', 'sachets de thé', ...FECULENT_PANTRY];
/** Frais et boissons : au frigo. */
export const FRESH_THINGS = ['jambon', 'saucisses', 'poulet', 'poisson', 'yaourt', 'crème', 'salade', 'orange', 'fraises', 'citron', 'champignons', 'poivron', 'courgette', 'moutarde', 'ketchup', 'mayonnaise', "jus d'orange", 'soda', 'eau gazeuse', 'vin', 'feuilles de salade', 'rondelles de banane', "quartiers d'orange", 'rondelles de citron'];
/** Surgelés : au congélateur. */
export const FROZEN_FOOD = ['frites', 'pizza', 'légumes surgelés'];
/** Cuisent à la poêle (en plus du steak). */
export const PAN_FOOD = ['poulet', 'poisson', 'saucisses', 'champignons', 'poivron', 'courgette', 'oignon', 'légumes surgelés'];
/** Cuisent au four (et se réchauffent au micro-ondes). */
export const OVEN_EXTRA = ['poulet', 'poisson', 'frites', 'pizza', 'légumes surgelés', 'courgette', 'poivron'];
/** Fruits en plus qui se mixent. */
export const MORE_FRUITS = ['banane', 'orange', 'fraises', 'rondelles de banane', "quartiers d'orange"];

/** Noms au féminin, et au pluriel, des provisions (accord des messages). */
export const PANTRY_FEMININE = ['farine', 'tablette de chocolat', 'confiture', 'pâte à tartiner', 'sauce tomate', 'moutarde', 'mayonnaise', 'levure', 'eau gazeuse', 'chips', 'salade', 'saucisses', 'crème', 'banane', 'orange', 'fraises', 'courgette', 'frites', 'pizza', 'feuilles de salade', 'rondelles de banane', 'rondelles de citron', 'liste de courses'];
export const PANTRY_PLURAL = ['biscuits', 'chips', 'saucisses', 'fraises', 'champignons', 'frites', 'légumes surgelés', 'feuilles de salade', 'rondelles de banane', "quartiers d'orange", 'rondelles de citron'];

/**
 * Stock voulu à la maison : ce qui manque (moins que ce nombre, rangé ou posé) va sur la liste de
 * courses, et le sac de courses en rapporte de quoi compléter.
 */
export const STOCK: Record<string, number> = {
  farine: 1, sucre: 1, 'tablette de chocolat': 1, confiture: 1, miel: 1, 'pâte à tartiner': 1, 'sauce tomate': 1, vinaigre: 1, levure: 1, biscuits: 1, chips: 1,
  oignon: 2, ail: 1, salade: 1, poulet: 1, poisson: 1, jambon: 1, saucisses: 1, yaourt: 2, crème: 1,
  banane: 2, orange: 2, fraises: 1, citron: 1, champignons: 1, poivron: 1, courgette: 1,
  moutarde: 1, ketchup: 1, mayonnaise: 1, "jus d'orange": 1, soda: 2, 'eau gazeuse': 1, vin: 1,
  frites: 1, pizza: 1, 'légumes surgelés': 1,
  pomme: 2, steak: 2, tomate: 1, carotte: 1, concombre: 1, 'pomme de terre': 2, pain: 1, "bouteille d'eau": 2, lasagne: 1, sandwich: 1,
  ...PREP_STOCK,
  ...UPKEEP_STOCK,
  ...LIFE_STOCK,
  ...FECULENT_STOCK,
};

/** Paquet en carton ou en papier : corps, bande de couleur (étiquette). */
function packet(w: number, h: number, d: number, body: THREE.ColorRepresentation, band: THREE.ColorRepresentation): THREE.Group {
  return group(box(w, h, d, body), box(w + 0.002, h * 0.3, d + 0.002, band, 0, h * 0.55));
}

/** Pot en verre : corps, couvercle, étiquette. */
function jar(r: number, h: number, body: THREE.ColorRepresentation, lid: THREE.ColorRepresentation, label: THREE.ColorRepresentation): THREE.Group {
  return group(cyl(r, h - 0.012, body, (h - 0.012) / 2), cyl(r * 1.04, 0.014, lid, h - 0.007), cyl(r + 0.001, h * 0.35, label, h * 0.4));
}

/** Flacon souple (ketchup, mayonnaise) : corps, bouchon. */
function squeeze(body: THREE.ColorRepresentation, cap: THREE.ColorRepresentation): THREE.Group {
  return group(mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.15, 14), body, 0, 0.075, 0), mesh(new THREE.ConeGeometry(0.02, 0.035, 12), cap, 0, 0.167, 0));
}

/** Boisson : corps opaque, colonne de liquide (cachée dedans, mais Game en règle le niveau). */
function drinkCol(r: number, h: number, color: THREE.ColorRepresentation, y0: number): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(r, r, 1, 14).translate(0, 0.5, 0), color, 0, y0, 0);
  m.name = 'liquide';
  m.userData.column = true;
  m.scale.y = h;
  return m;
}

/** Fiche d'un aliment qu'on tient dans le poing. */
function food(id: string, name: string, size: [number, number], more: Partial<ItemDef>, build: () => THREE.Object3D): ItemDef {
  const [h, r] = size;
  return {
    id,
    name,
    portable: true,
    grip: 'fist',
    gripPoint: [0, h / 2, r],
    mouth: [0, h * 0.7, -r],
    fragility: 9,
    durability: 20,
    breakWord: 'écrasé',
    build,
    ...more,
  };
}

/** Bouteille, brique ou canette qu'on verse dans un verre (on y boit aussi, comme la bouteille d'eau). */
function drink(id: string, name: string, liquid: string, h: number, r: number, more: Partial<ItemDef>, build: () => THREE.Object3D): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'fist',
    gripPoint: [0, h * 0.45, r],
    mouth: [0, h, 0],
    fill: [0.01, h - 0.03],
    volume: 0.5,
    startFull: liquid,
    fragility: 8,
    durability: 40,
    breakWord: 'cabossé',
    build,
    ...more,
  };
}

/** Morceaux d'un fruit ou d'une salade coupés sur la planche : pris entre les doigts. */
function pieces(id: string, name: string, hunger: number, bites: number, build: () => THREE.Object3D): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.01, 0.04],
    mouth: [0, 0.015, -0.04],
    food: { hunger, bites },
    fragility: 10,
    durability: 15,
    breakWord: 'écrasé',
    build,
  };
}

/** Rondelles couchées en petit tas. */
function disks(n: number, r: number, skin: THREE.ColorRepresentation, flesh: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, d = Math.sqrt(i / n) * r * 2.2;
    g.add(cyl(r, 0.006, skin, 0.003 + (i % 3) * 0.004, Math.cos(a) * d, Math.sin(a) * d));
    g.add(cyl(r * 0.85, 0.007, flesh, 0.0035 + (i % 3) * 0.004, Math.cos(a) * d, Math.sin(a) * d));
  }
  return g;
}

/** Garde-manger : largeur, profondeur, hauteur, rayons (dessus de chaque étagère, m). */
const PM_W = 0.7;
const PM_D = 0.45;
const PM_H = 1.95;
const PM_T = 0.025;
const PM_SHELVES = [0.08, 0.5, 0.9, 1.3];
/** Places : devant puis au fond, de gauche à droite, sur chaque étagère. */
const PM_SLOTS = PM_SHELVES.flatMap((y) => [0.08, -0.1].flatMap((z) => [-0.24, -0.08, 0.08, 0.24].map((x): [number, number, number] => [x, y, z])));
const PM_WOOD = 0xc9a87a;

export const PANTRY_ITEMS: ItemDef[] = [
  // ——— épicerie ———
  food('farine', 'farine', [0.16, 0.035], { fragility: 6, breakWord: 'éventré' }, () => packet(0.1, 0.16, 0.07, 0xf3efe4, 0x3b6db3)),
  food('sucre', 'sucre', [0.12, 0.035], { fragility: 6, breakWord: 'éventré' }, () => packet(0.1, 0.12, 0.07, 0xffffff, 0xd8352a)),
  food('chocolat', 'tablette de chocolat', [0.012, 0.04], { food: { hunger: 10, bites: 4, color: 0x5a3220 }, mouth: [0, 0.01, -0.06], gripPoint: [0, 0.006, 0.06] }, () => group(box(0.16, 0.012, 0.08, 0x6b3a22), box(0.161, 0.013, 0.05, 0x2f5f8f))),
  food('confiture', 'confiture', [0.1, 0.035], { fragility: 3, breakWord: 'cassé' }, () => jar(0.035, 0.1, 0xa3233a, 0xd9443a, 0xf3efe4)),
  food('miel', 'miel', [0.1, 0.035], { fragility: 3, breakWord: 'cassé' }, () => jar(0.035, 0.1, 0xe0a630, 0xf0c060, 0xf3efe4)),
  food('pate-tartiner', 'pâte à tartiner', [0.11, 0.04], { fragility: 3, breakWord: 'cassé' }, () => jar(0.04, 0.11, 0x4a2a1a, 0xf3efe4, 0xd8352a)),
  food('sauce-tomate', 'sauce tomate', [0.13, 0.035], { fragility: 3, breakWord: 'cassé' }, () => jar(0.035, 0.13, 0xc0302a, 0xd0b04a, 0x3f7a35)),
  food('vinaigre', 'vinaigre', [0.22, 0.03], { fragility: 3, breakWord: 'cassé', mouth: undefined }, () => group(cyl(0.03, 0.17, 0xb84a3a, 0.085), cyl(0.012, 0.05, 0xb84a3a, 0.195), cyl(0.014, 0.02, 0x2a2b2e, 0.225), cyl(0.031, 0.05, 0xf3efe4, 0.1))),
  food('levure', 'levure', [0.01, 0.04], { fragility: 10, gripPoint: [0, 0.005, 0.04], breakWord: 'déchiré' }, () => group(box(0.09, 0.01, 0.07, 0xf2cf5b), box(0.091, 0.011, 0.02, 0x3b6db3))),
  food('biscuits', 'biscuits', [0.06, 0.035], { food: { hunger: 12, bites: 4, color: 0xd9a45c }, breakWord: 'émietté' }, () => packet(0.2, 0.06, 0.07, 0xe8c27a, 0x8a3a2a)),
  food('chips', 'chips', [0.2, 0.04], { food: { hunger: 10, bites: 5, color: 0xf2cf5b }, fragility: 10, breakWord: 'éclaté' }, () => {
    // sachet gonflé, fermé en haut
    const bag = mesh(new THREE.SphereGeometry(0.08, 14, 10).scale(1, 1.25, 0.45), 0xf2cf5b, 0, 0.1, 0);
    return group(bag, box(0.12, 0.02, 0.02, 0xd8352a, 0, 0.19, 0), box(0.1, 0.05, 0.075, 0xd8352a, 0, 0.1, 0));
  }),
  // ——— frais : légumes, viandes, poisson, laitages ———
  food('oignon', 'oignon', [0.06, 0.03], { cook: { seconds: 10, burn: 20, colors: [0xd9b77a, 0xb07a3a, 0x2e2419] }, food: { hunger: 4, bites: 2 } }, () => group(cooked(mesh(new THREE.SphereGeometry(0.032, 14, 10).scale(1, 0.9, 1), 0xd9b77a, 0, 0.03, 0)), mesh(new THREE.ConeGeometry(0.008, 0.02, 6), 0xa07a4a, 0, 0.065, 0))),
  food('ail', 'ail', [0.045, 0.025], {}, () => group(mesh(new THREE.SphereGeometry(0.025, 12, 8).scale(1, 0.85, 1), 0xf3efe4, 0, 0.022, 0), mesh(new THREE.ConeGeometry(0.006, 0.018, 6), 0xe0d8c8, 0, 0.05, 0))),
  food('salade', 'salade', [0.12, 0.07], { food: { hunger: 5, bites: 3, color: 0x8bc34a }, cut: 'feuilles-salade', fragility: 10 }, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8;
      const leaf = mesh(new THREE.SphereGeometry(0.05, 10, 6), i % 2 ? 0x8bc34a : 0x689f38, Math.cos(a) * 0.025, 0.05 + (i % 3) * 0.012, Math.sin(a) * 0.025);
      leaf.scale.set(1, 0.8, 0.7);
      leaf.rotation.y = a;
      g.add(leaf);
    }
    return g;
  }),
  food('poulet', 'poulet', [0.04, 0.045], { food: { hunger: 40, bites: 4 }, cook: { seconds: 24, burn: 25, colors: [0xf0c4b0, 0xc8803a, 0x2a1d15] } }, () => {
    // une cuisse : la chair et l'os qui dépasse
    const meat = cooked(mesh(new THREE.SphereGeometry(0.045, 14, 10).scale(1.3, 0.55, 0.9), 0xf0c4b0, -0.01, 0.022, 0));
    return group(meat, mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8).rotateZ(Math.PI / 2), 0xf3efe4, 0.06, 0.022, 0), cyl(0.011, 0.012, 0xf3efe4, 0.022, 0.087));
  }),
  food('poisson', 'poisson', [0.02, 0.04], { food: { hunger: 30, bites: 4 }, cook: { seconds: 12, burn: 18, colors: [0xf1b9a6, 0xf0dcc0, 0x3a2a20] } }, () => group(cooked(mesh(new THREE.BoxGeometry(0.14, 0.018, 0.06), 0xf1b9a6, 0, 0.009, 0)), box(0.141, 0.004, 0.061, 0x9aa4ad, 0, 0.002, 0))),
  food('jambon', 'jambon', [0.01, 0.05], { food: { hunger: 15, bites: 3, color: 0xe8a0a0 }, gripPoint: [0, 0.005, 0.05] }, () => group(cyl(0.055, 0.008, 0xe8a0a0, 0.004, 0, 0, 20), cyl(0.056, 0.004, 0xf3e0d8, 0.002, 0, 0, 20))),
  food('saucisses', 'saucisses', [0.03, 0.03], { food: { hunger: 30, bites: 4 }, cook: { seconds: 15, burn: 25, colors: [0xd9908a, 0x8a4a2a, 0x231c17] } }, () => {
    const g = new THREE.Group();
    for (const z of [-0.016, 0.016]) g.add(cooked(mesh(new THREE.CapsuleGeometry(0.013, 0.1, 4, 10).rotateZ(Math.PI / 2), 0xd9908a, 0, 0.013, z)));
    return g;
  }),
  food('yaourt', 'yaourt', [0.07, 0.03], { food: { hunger: 12, bites: 4, color: 0xf6f3ec } }, () => group(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 16), 0xf6f3ec, 0, 0.035, 0), cyl(0.031, 0.003, 0x3b6db3, 0.0715), cyl(0.0305, 0.025, 0x9cc4e4, 0.04))),
  food('creme', 'crème', [0.07, 0.035], {}, () => group(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 16), 0xf6f3ec, 0, 0.035, 0), cyl(0.036, 0.004, 0xd8352a, 0.072))),
  // ——— fruits ———
  food('banane', 'banane', [0.035, 0.03], { food: { hunger: 12, bites: 3, color: 0xf6e6a8 }, cut: 'rondelles-banane', mouth: [0, 0.03, -0.08], gripPoint: [0, 0.02, 0.06] }, () => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.035, -0.09), new THREE.Vector3(0, 0.0, 0), new THREE.Vector3(0, 0.035, 0.09));
    return group(mesh(new THREE.TubeGeometry(curve, 12, 0.017, 8), 0xf2cf3a), cyl(0.006, 0.02, 0x5a4a2a, 0.04, 0, 0.095));
  }),
  food('orange', 'orange', [0.07, 0.035], { food: { hunger: 10, bites: 4, color: 0xf5a623 }, cut: 'quartiers-orange', fragility: 6 }, () => group(mesh(new THREE.SphereGeometry(0.036, 16, 12), 0xf08a1a, 0, 0.036, 0), cyl(0.004, 0.006, 0x4f8a3a, 0.073))),
  food('fraises', 'fraises', [0.05, 0.06], { food: { hunger: 8, bites: 4, color: 0xd8352a }, fragility: 5 }, () => {
    // une barquette pleine de fraises
    const g = group(box(0.13, 0.04, 0.1, 0x3f7a35));
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.ConeGeometry(0.014, 0.025, 8).rotateX(Math.PI), 0xd8352a, -0.04 + (i % 3) * 0.04, 0.05, i < 3 ? -0.022 : 0.022));
    return g;
  }),
  food('citron', 'citron', [0.06, 0.03], { cut: 'rondelles-citron', fragility: 6 }, () => mesh(new THREE.SphereGeometry(0.03, 14, 10).scale(1.3, 1, 1), 0xf2df3a, 0, 0.03, 0)),
  food('champignons', 'champignons', [0.04, 0.05], { food: { hunger: 5, bites: 3 }, cook: { seconds: 10, burn: 20, colors: [0xe8dcc8, 0x9a7a5a, 0x2e2419] } }, () => {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.025, 0], [0.02, -0.015], [0.015, 0.025]]) {
      g.add(cyl(0.008, 0.02, 0xf3efe4, 0.01, x, z, 8));
      g.add(cooked(mesh(new THREE.SphereGeometry(0.018, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8dcc8, x, 0.02, z)));
    }
    return g;
  }),
  food('poivron', 'poivron', [0.08, 0.04], { food: { hunger: 6, bites: 3 }, cook: { seconds: 12, burn: 20, colors: [0xd8352a, 0xa83a2a, 0x2e2419] } }, () => group(cooked(mesh(new THREE.SphereGeometry(0.04, 14, 10).scale(1, 1.1, 1), 0xd8352a, 0, 0.044, 0)), cyl(0.006, 0.02, 0x4f8a3a, 0.095))),
  food('courgette', 'courgette', [0.04, 0.05], { food: { hunger: 6, bites: 3 }, cook: { seconds: 14, burn: 20, colors: [0x3f7a35, 0x7a9a3a, 0x2e2419] }, mouth: [0, 0.02, -0.09] }, () => group(cooked(mesh(new THREE.CapsuleGeometry(0.02, 0.15, 6, 12).rotateX(Math.PI / 2), 0x3f7a35, 0, 0.02, 0)))),
  // ——— sauces au frigo ———
  food('moutarde', 'moutarde', [0.09, 0.03], { fragility: 3, breakWord: 'cassé' }, () => jar(0.03, 0.09, 0xd9b030, 0x2a2b2e, 0xf3efe4)),
  food('ketchup', 'ketchup', [0.18, 0.03], {}, () => squeeze(0xc0302a, 0xf3efe4)),
  food('mayonnaise', 'mayonnaise', [0.18, 0.03], {}, () => squeeze(0xf3e9b8, 0x3b6db3)),
  // ——— boissons ———
  drink('jus-orange', "jus d'orange", "jus d'orange", 0.2, 0.035, { fragility: 9, breakWord: 'écrasé' }, () => group(drinkCol(0.03, 0.17, DRINK_COLORS["jus d'orange"], 0.01), box(0.07, 0.19, 0.07, 0xf5a623, 0, 0.095), box(0.071, 0.06, 0.071, 0xf3efe4, 0, 0.1), mesh(new THREE.ConeGeometry(0.05, 0.02, 4).rotateY(Math.PI / 4), 0xf5a623, 0, 0.2, 0), cyl(0.01, 0.012, 0x3f7a35, 0.205, 0.015))),
  drink('soda', 'soda', 'soda', 0.12, 0.033, { volume: 0.33 }, () => group(drinkCol(0.03, 0.1, DRINK_COLORS.soda, 0.01), cyl(0.033, 0.12, 0xc0302a, 0.06), cyl(0.0335, 0.03, 0xf3efe4, 0.065), cyl(0.028, 0.004, 0xb9bfc6, 0.121))),
  drink('eau-gazeuse', 'eau gazeuse', 'eau gazeuse', 0.26, 0.035, { fragility: 4, breakWord: 'cassé' }, () => {
    const body = cyl(0.035, 0.2, 0x7fb88a, 0.1);
    const m = body.material as THREE.MeshToonMaterial;
    m.transparent = true;
    m.opacity = 0.6;
    m.depthWrite = false;
    return group(drinkCol(0.031, 0.18, DRINK_COLORS['eau gazeuse'], 0.01), body, mesh(new THREE.CylinderGeometry(0.014, 0.035, 0.04, 14), 0x7fb88a, 0, 0.22, 0), cyl(0.015, 0.02, 0x3f7a35, 0.25), cyl(0.036, 0.06, 0xf3efe4, 0.11));
  }),
  drink('vin', 'vin', 'vin', 0.3, 0.037, { volume: 0.75, fragility: 2, breakWord: 'cassé' }, () => group(drinkCol(0.033, 0.2, DRINK_COLORS.vin, 0.01), cyl(0.037, 0.21, 0x2c3a2a, 0.105), mesh(new THREE.CylinderGeometry(0.013, 0.037, 0.04, 14), 0x2c3a2a, 0, 0.23, 0), cyl(0.013, 0.05, 0x2c3a2a, 0.275), cyl(0.014, 0.025, 0x7a1e2c, 0.29), cyl(0.038, 0.07, 0xf3efe4, 0.1))),
  // ——— surgelés : « surgelé » jusqu'au four (ou à la poêle) ———
  food('frites', 'frites', [0.15, 0.03], { food: { hunger: 30, bites: 5, color: 0xe6c060 }, cook: { seconds: 4, burn: 20, colors: [0xe4eef3, 0xe6c060, 0x3a2a20] }, rawWord: 'surgelé', fragility: 10 }, () => group(box(0.13, 0.17, 0.05, 0x3b6db3, 0, 0.085), cooked(box(0.131, 0.07, 0.051, 0xe4eef3, 0, 0.08)))),
  food('pizza', 'pizza', [0.03, 0.12], { food: { hunger: 50, bites: 6, color: 0xd9a04a }, cook: { seconds: 6, burn: 20, colors: [0xe4eef3, 0xd9a04a, 0x2a1d15] }, rawWord: 'surgelé', gripPoint: [0, 0.01, 0.12], mouth: [0, 0.02, -0.1] }, () => {
    const g = group(cyl(0.12, 0.012, 0xe8c27a, 0.006, 0, 0, 24));
    g.add(cooked(cyl(0.105, 0.006, 0xe4eef3, 0.014, 0, 0, 24)));
    for (const [x, z] of [[-0.05, -0.03], [0.04, -0.05], [0.02, 0.05], [-0.04, 0.05], [0.06, 0.01]]) g.add(cyl(0.012, 0.004, 0xb0302a, 0.019, x, z, 10));
    return g;
  }),
  food('legumes-surgeles', 'légumes surgelés', [0.04, 0.05], { food: { hunger: 15, bites: 4, color: 0x7aa04a }, cook: { seconds: 8, burn: 20, colors: [0xe4eef3, 0x7aa04a, 0x2e2419] }, rawWord: 'surgelé', fragility: 10 }, () => group(box(0.15, 0.04, 0.12, 0x3f7a35), cooked(box(0.151, 0.02, 0.06, 0xe4eef3, 0, 0.03)))),
  // ——— morceaux coupés ———
  pieces('feuilles-salade', 'feuilles de salade', 5, 3, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.03, 10, 6), i % 2 ? 0x8bc34a : 0x689f38, Math.cos(i * 2.4) * 0.025, 0.008 + (i % 2) * 0.005, Math.sin(i * 2.4) * 0.025);
      leaf.scale.set(1.2, 0.25, 0.9);
      g.add(leaf);
    }
    return g;
  }),
  pieces('rondelles-banane', 'rondelles de banane', 12, 3, () => disks(8, 0.016, 0xf2df8a, 0xf6eec8)),
  pieces('quartiers-orange', "quartiers d'orange", 10, 4, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const q = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 12, 1, false, 0, Math.PI / 3).rotateZ(Math.PI / 2), 0xf5a623, -0.03 + i * 0.02, 0.012, (i % 2) * 0.02 - 0.01);
      q.rotation.y = -0.3 + i * 0.2;
      g.add(q);
    }
    return g;
  }),
  pieces('rondelles-citron', 'rondelles de citron', 1, 1, () => disks(5, 0.026, 0xf2df3a, 0xf8f0a8)),
  // ——— rangement, courses ———
  {
    id: 'garde-manger',
    name: 'garde-manger',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 7,
    // une grande armoire à provisions : porte à charnière à gauche (elle s'ouvre vers le mur, l'intérieur reste visible), quatre étagères
    door: -THREE.MathUtils.degToRad(100),
    holds: PANTRY_THINGS,
    slots: PM_SLOTS,
    build: () => {
      const W = PM_W, D = PM_D, H = PM_H, t = PM_T;
      const g = group(
        box(t, H, D, PM_WOOD, -W / 2 + t / 2, H / 2, 0),
        box(t, H, D, PM_WOOD, W / 2 - t / 2, H / 2, 0),
        box(W, H, t, 0xb8956a, 0, H / 2, -D / 2 + t / 2),
        box(W, t, D, PM_WOOD, 0, H - t / 2, 0),
        box(W, 0.06, D, 0x8a6440, 0, 0.03, 0),
      );
      for (const y of PM_SHELVES.slice(1)) g.add(box(W - 2 * t, 0.018, D - t - 0.01, PM_WOOD, 0, y - 0.009, 0));
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(-W / 2, 0, D / 2);
      door.add(
        box(W, H - 0.07, 0.025, PM_WOOD, W / 2, 0.07 + (H - 0.07) / 2, 0.0125),
        // deux panneaux en relief et un bouton
        box(W - 0.12, 0.7, 0.008, 0xd6b88c, W / 2, 0.55, 0.029),
        box(W - 0.12, 0.8, 0.008, 0xd6b88c, W / 2, 1.4, 0.029),
        mesh(new THREE.SphereGeometry(0.016, 10, 8), 0xc9c2b0, W - 0.05, 1.05, 0.04),
      );
      g.add(door);
      return g;
    },
  },
  {
    id: 'sac-courses',
    name: 'sac de courses',
    portable: true,
    grip: 'side',
    // tenu par les anses
    gripPoint: [0, 0.33, 0],
    fragility: 10,
    durability: 60,
    breakWord: 'déchiré',
    build: () => {
      const g = group(box(0.34, 0.28, 0.16, 0xd9c49a), box(0.341, 0.08, 0.161, 0x3f7a35, 0, 0.16));
      // des fanes et une baguette qui dépassent
      g.add(mesh(new THREE.ConeGeometry(0.02, 0.08, 6), 0x4f8a3a, -0.08, 0.31, 0), mesh(new THREE.CapsuleGeometry(0.018, 0.16, 4, 8).rotateZ(0.3), 0xd9a45c, 0.08, 0.33, 0.02));
      for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 12, Math.PI), 0xb8a070, x, 0.28, 0));
      return g;
    },
  },
  {
    id: 'liste-courses',
    name: 'liste de courses',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.002, 0.06],
    fragility: 10,
    durability: 40,
    breakWord: 'déchiré',
    // une feuille et son crayon
    build: () => {
      const g = group(box(0.1, 0.003, 0.14, 0xfbf8ee));
      for (let i = 0; i < 6; i++) g.add(box(0.07, 0.0035, 0.004, 0x6a7a9a, -0.005, 0.0016, -0.05 + i * 0.02));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).rotateX(Math.PI / 2).rotateY(0.4), 0xf2cf3a, 0.035, 0.005, 0));
      return g;
    },
  },
];
