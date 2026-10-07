/**
 * Les gestes de cuisine (lot « gestes ») : ce qu'il leur faut. Œufs, lait, beurre, fromage ; le
 * saladier où l'on casse les œufs et mélange une pâte, le fouet, la spatule, la cuillère en bois,
 * la louche et la râpe (dans le pot à ustensiles et le placard) ; l'étagère à épices et ses pots
 * (sel, poivre, paprika, herbes, huile) pour assaisonner ; et ce que ces gestes donnent : œuf au
 * plat, omelette, crêpe, tartines, fromage râpé.
 *
 * Les règles des gestes sont dans Game (casser, mélanger, remuer, faire sauter, servir,
 * assaisonner, tartiner, râper, goûter).
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

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
const cooked = <T extends THREE.Mesh>(m: T): T => {
  m.name = 'cuit';
  return m;
};
const STAIN = 0xb79a6a;
const stained = (m: THREE.Object3D): THREE.Object3D => {
  m.name = 'sale';
  return m;
};

/** Couleur des liquides du lot (le lait, les préparations du saladier). */
export const PREP_LIQUIDS: Record<string, THREE.ColorRepresentation> = {
  lait: 0xf7f5ee,
  'œufs': 0xf2b632,
  'œufs battus': 0xf2c94c,
  'pâte à crêpes': 0xf1deb0,
  'préparation': 0xe9dcc0,
};

/**
 * Pâtes du saladier : ce qu'il faut y mettre (au moins), puis mélanger ; la pâte versée dans la
 * poêle devient `cooks` (une crêpe par louche : `per` du saladier plein).
 */
export const BATTERS: Array<{ name: string; needs: string[]; cooks: string; per: number }> = [
  { name: 'pâte à crêpes', needs: ['œuf', 'lait', 'farine'], cooks: 'crepe', per: 0.2 },
  { name: 'œufs battus', needs: ['œuf'], cooks: 'omelette', per: 1 },
];

/** Ce qui se tartine (pot ou beurre tenu, avec un couteau) : le mot du nom de la tartine. */
export const SPREADS: Record<string, string> = { confiture: 'confiture', miel: 'miel', 'pâte à tartiner': 'chocolat', beurre: 'beurre' };
/** Ce qu'on tartine : nom → préfixe des fiches obtenues (tartines-confiture, crepe-miel…). */
export const SPREAD_ON: Record<string, string> = { 'tranches de pain': 'tartines', 'pain grillé': 'tartines', crêpe: 'crepe' };

/** Pots de l'étagère à épices : nom → le mot du geste (« un peu de sel », « un filet d'huile »). */
export const SPICES: Record<string, string> = { sel: 'du sel', poivre: 'du poivre', paprika: 'du paprika', 'herbes de Provence': 'des herbes', "huile d'olive": 'un filet d’huile' };
/** Ce qui se range où : le pot à ustensiles, l'étagère à épices, le placard. */
export const UTENSIL_POT = ['fouet', 'spatule', 'cuillère en bois', 'louche'];
export const PREP_CUPBOARD = ['saladier', 'râpe'];
export const PREP_FRESH = ['œuf', 'lait', 'beurre', 'fromage', 'fromage râpé', 'tartines de confiture', 'tartines au miel', 'tartines au chocolat', 'tartines beurrées', 'crêpe'];

/** Cuisent à la poêle (casser un œuf, verser une pâte). */
export const PREP_PAN_FOOD = ['œuf au plat', 'omelette', 'crêpe'];

export const PREP_FEMININE = ['spatule', 'cuillère en bois', 'louche', 'râpe', 'omelette', 'crêpe', 'pâte à crêpes', 'étagère à épices', 'huile d\'olive', 'crêpe à la confiture', 'crêpe au miel', 'crêpe au chocolat', 'crêpe au beurre', 'tartines de confiture', 'tartines au miel', 'tartines au chocolat', 'tartines beurrées', 'préparation'];
export const PREP_PLURAL = ['herbes de Provence', 'tartines de confiture', 'tartines au miel', 'tartines au chocolat', 'tartines beurrées', 'œufs battus', 'œufs'];

/** Stock voulu (liste de courses). */
export const PREP_STOCK: Record<string, number> = { 'œuf': 4, lait: 1, beurre: 1, fromage: 1, sel: 1, poivre: 1, paprika: 1, 'herbes de Provence': 1, "huile d'olive": 1 };

/** Ustensile de cuisine couché à plat (debout dans le pot) : manche vers le bas, l'outil en haut. */
function utensil(id: string, name: string, len: number, more: Partial<ItemDef>, head: () => THREE.Object3D, handleColor: THREE.ColorRepresentation = 0x8a5a2b): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.04, 0],
    mouth: [0, len - 0.02, 0],
    layFlat: true,
    dish: true,
    stirs: true,
    fragility: 10,
    durability: 250,
    breakWord: 'tordu',
    build: () => {
      const h = head();
      h.position.y = len * 0.62;
      return group(box(0.014, len * 0.62, 0.012, handleColor, 0, len * 0.31), h, stained(box(0.016, 0.03, 0.014, STAIN, 0, len * 0.75)));
    },
    ...more,
  };
}

/** Pot à épices (verre, couvercle de couleur) ou flacon. */
function spiceJar(id: string, name: string, color: THREE.ColorRepresentation, lid: THREE.ColorRepresentation, h = 0.1): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'fist',
    gripPoint: [0, h * 0.45, 0.025],
    mouth: [0, h, 0],
    spice: SPICES[name],
    fragility: 4,
    durability: 80,
    breakWord: 'cassé',
    build: () => group(cyl(0.022, h - 0.015, color, (h - 0.015) / 2, 0, 0, 14), cyl(0.023, 0.016, lid, h - 0.008, 0, 0, 14), cyl(0.0225, h * 0.3, 0xf3efe4, h * 0.4, 0, 0, 14)),
  };
}

/** Tranches tartinées : les tranches de pain, le dessus de la couleur de ce qu'on a étalé. */
function tartines(id: string, name: string, top: THREE.ColorRepresentation, hunger: number): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.01, 0.04],
    mouth: [0, 0.015, -0.04],
    food: { hunger, bites: 5, color: top },
    fragility: 10,
    durability: 15,
    breakWord: 'écrasé',
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Group();
        s.add(mesh(new THREE.BoxGeometry(0.075, 0.01, 0.065), 0xb98a4a, 0, 0.005, 0));
        s.add(mesh(new THREE.BoxGeometry(0.065, 0.011, 0.055), 0xf2dca8, 0, 0.0055, 0));
        s.add(mesh(new THREE.BoxGeometry(0.062, 0.003, 0.052), top, 0, 0.0125, 0));
        s.position.set(-0.06 + i * 0.04, 0, (i % 2) * 0.03 - 0.015);
        g.add(s);
      }
      return g;
    },
  };
}

/** Crêpe garnie (pliée en quatre). */
function filledCrepe(id: string, name: string, fill: THREE.ColorRepresentation): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.006, 0.05],
    mouth: [0, 0.008, -0.05],
    food: { hunger: 22, bites: 3, color: 0xe0b060 },
    fragility: 10,
    durability: 15,
    breakWord: 'écrasée',
    build: () => {
      const quarter = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 20, 1, false, 0, Math.PI / 2), 0xe0b060, 0, 0.006, 0);
      const jam = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 20, 1, false, 0.1, Math.PI / 2 - 0.2), fill, 0, 0.013, 0);
      return group(quarter, jam);
    },
  };
}

/** Étagère à épices : planche au mur au-dessus du plan de travail (posée dessus, son repère au ras du plan). */
const SHELF_Y = 0.7;
const SHELF_W = 0.86;
const SHELF_D = 0.2;
const SPICE_SLOTS: Array<[number, number, number]> = [-0.32, -0.2, -0.08, 0.06, 0.2].map((x): [number, number, number] => [x, SHELF_Y + 0.015, 0]);

/** Pot à ustensiles : places debout (manches dedans). */
const POT_R = 0.055;
const POT_H = 0.13;

export const PREP_ITEMS: ItemDef[] = [
  // ——— frais ———
  {
    id: 'oeuf',
    name: 'œuf',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.028, 0.02],
    fragility: 1,
    durability: 10,
    breakWord: 'cassé',
    build: () => group(mesh(new THREE.SphereGeometry(0.02, 14, 10).scale(1, 1.3, 1), 0xf3e6d0, 0, 0.026, 0)),
  },
  {
    id: 'lait',
    name: 'lait',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.09, 0.035],
    mouth: [0.02, 0.2, 0.02],
    fill: [0.01, 0.17],
    volume: 1,
    startFull: 'lait',
    fragility: 8,
    durability: 40,
    breakWord: 'cabossé',
    build: () => {
      const col = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12).translate(0, 0.5, 0), PREP_LIQUIDS.lait, 0, 0.01, 0);
      col.name = 'liquide';
      col.userData.column = true;
      col.scale.y = 0.16;
      // la brique : blanche, une bande bleue, le toit pointu et le bouchon
      return group(col, box(0.07, 0.18, 0.07, 0xffffff), box(0.071, 0.06, 0.071, 0x3b6db3, 0, 0.07), mesh(new THREE.CylinderGeometry(0.001, 0.05, 0.03, 4, 1).rotateY(Math.PI / 4), 0xffffff, 0, 0.195, 0), cyl(0.009, 0.012, 0x3b6db3, 0.2, 0.018, 0.018, 10));
    },
  },
  {
    id: 'beurre',
    name: 'beurre',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.015, 0.03],
    fragility: 10,
    durability: 30,
    breakWord: 'écrasé',
    build: () => group(box(0.1, 0.03, 0.05, 0xf6e7a8), box(0.101, 0.012, 0.051, 0x3f7a35, 0, 0.022)),
  },
  {
    id: 'fromage',
    name: 'fromage',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.025, 0.035],
    mouth: [0, 0.03, -0.03],
    food: { hunger: 15, bites: 4, color: 0xf2cf5b },
    fragility: 10,
    durability: 30,
    breakWord: 'écrasé',
    // un quartier de fromage : le cœur jaune, la croûte
    build: () => group(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 3, 1, false, 0, Math.PI / 3).translate(0, 0.025, 0), 0xf2cf5b, 0, 0, -0.03), mesh(new THREE.BoxGeometry(0.004, 0.05, 0.07).translate(0, 0.025, 0), 0xe0a630, -0.002, 0, 0)),
  },
  {
    id: 'fromage-rape',
    name: 'fromage râpé',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.01, 0.03],
    mouth: [0, 0.012, -0.03],
    food: { hunger: 6, bites: 2, color: 0xf2cf5b },
    fragility: 10,
    durability: 10,
    breakWord: 'éparpillé',
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4, d = Math.sqrt(i / 18) * 0.035;
        const s = box(0.018, 0.003, 0.003, 0xf2cf5b, Math.cos(a) * d, 0.002 + (i % 4) * 0.003, Math.sin(a) * d);
        s.rotation.y = a * 1.7;
        g.add(s);
      }
      return g;
    },
  },
  // ——— cuit à la poêle ———
  {
    id: 'oeuf-plat',
    name: 'œuf au plat',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.006, 0.04],
    mouth: [0, 0.008, -0.04],
    food: { hunger: 15, bites: 2, color: 0xf2b632 },
    cook: { seconds: 8, burn: 18, colors: [0xf4f1e6, 0xffffff, 0x3a2a20] },
    fragility: 10,
    durability: 10,
    breakWord: 'écrasé',
    build: () => group(cooked(mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.006, 18).scale(1, 1, 0.85), 0xf4f1e6, 0, 0.003, 0)), mesh(new THREE.SphereGeometry(0.016, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2b632, 0.006, 0.005, 0)),
  },
  {
    id: 'omelette',
    name: 'omelette',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.008, 0.05],
    mouth: [0, 0.01, -0.05],
    food: { hunger: 30, bites: 4, color: 0xe8b84a },
    cook: { seconds: 10, burn: 18, colors: [0xf2d36b, 0xe8b84a, 0x3a2a20] },
    fragility: 10,
    durability: 10,
    breakWord: 'écrasée',
    build: () => group(cooked(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 20, 1, false, 0, Math.PI).rotateY(Math.PI / 2), 0xf2d36b, 0, 0.007, 0.02))),
  },
  {
    id: 'crepe',
    name: 'crêpe',
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.003, 0.07],
    mouth: [0, 0.004, -0.07],
    food: { hunger: 15, bites: 3, color: 0xe0b060 },
    cook: { seconds: 6, burn: 14, colors: [0xf3e3b0, 0xe0b060, 0x3a2a20] },
    fragility: 10,
    durability: 10,
    breakWord: 'déchirée',
    build: () => group(cooked(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.004, 24), 0xf3e3b0, 0, 0.002, 0))),
  },
  // ——— ce que donnent les gestes ———
  tartines('tartines-confiture', 'tartines de confiture', 0xa3233a, 32),
  tartines('tartines-miel', 'tartines au miel', 0xe0a630, 32),
  tartines('tartines-chocolat', 'tartines au chocolat', 0x4a2a1a, 35),
  tartines('tartines-beurre', 'tartines beurrées', 0xf6e7a8, 30),
  filledCrepe('crepe-confiture', 'crêpe à la confiture', 0xa3233a),
  filledCrepe('crepe-miel', 'crêpe au miel', 0xe0a630),
  filledCrepe('crepe-chocolat', 'crêpe au chocolat', 0x4a2a1a),
  filledCrepe('crepe-beurre', 'crêpe au beurre', 0xf6e7a8),
  // ——— ustensiles ———
  {
    id: 'saladier',
    name: 'saladier',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.085, 0.11],
    mouth: [0, 0.09, -0.11],
    fill: [0.012, 0.075],
    volume: 1,
    mixes: true,
    dish: true,
    fragility: 3,
    durability: 80,
    build: () => {
      const wall = mesh(new THREE.CylinderGeometry(0.115, 0.06, 0.09, 28, 1, true), 0xe9eef0, 0, 0.045, 0);
      (wall.material as THREE.Material).side = THREE.DoubleSide;
      const floor = cyl(0.06, 0.008, 0xdfe5e8, 0.004, 0, 0, 24);
      // la préparation : un disque qui monte avec le niveau (Game le règle par le `fill`)
      const batter = mesh(new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0), PREP_LIQUIDS['préparation'], 0, 0.012, 0);
      batter.name = 'liquide';
      batter.userData.column = true;
      batter.scale.set(0.08, 0.001, 0.08);
      const stain = stained(mesh(new THREE.TorusGeometry(0.09, 0.004, 6, 24).rotateX(Math.PI / 2), STAIN, 0, 0.06, 0));
      return group(floor, batter, wall, stain);
    },
  },
  utensil('fouet', 'fouet', 0.27, {}, () => {
    // quatre boucles de fil d'acier
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const loop = mesh(new THREE.TorusGeometry(0.025, 0.0015, 4, 16).scale(1, 2.2, 1), 0xc3c8ce, 0, 0.05, 0);
      loop.rotation.y = (i * Math.PI) / 4;
      g.add(loop);
    }
    return g;
  }, 0x2a2b2e),
  utensil('spatule', 'spatule', 0.3, {}, () => group(box(0.06, 0.07, 0.004, 0x2a2b2e, 0, 0.035)), 0x2a2b2e),
  utensil('cuillere-bois', 'cuillère en bois', 0.3, {}, () => group(mesh(new THREE.SphereGeometry(0.5, 12, 8).scale(0.04, 0.06, 0.012), 0xc9a06a, 0, 0.03, 0)), 0xc9a06a),
  utensil('louche', 'louche', 0.3, {}, () => group(mesh(new THREE.SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xc3c8ce, 0, 0.035, 0.03)), 0xc3c8ce),
  {
    id: 'rape',
    name: 'râpe',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.2, 0],
    mouth: [0, 0.1, -0.04],
    dish: true,
    grates: true,
    fragility: 10,
    durability: 250,
    breakWord: 'tordue',
    build: () => {
      // la râpe à quatre faces : un tronc de pyramide en métal, la poignée en haut
      const body = mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.17, 4, 1, true).rotateY(Math.PI / 4), 0xc3c8ce, 0, 0.085, 0);
      (body.material as THREE.Material).side = THREE.DoubleSide;
      const holes = new THREE.Group();
      for (let i = 0; i < 12; i++) holes.add(box(0.008, 0.003, 0.002, 0x55595e, ((i % 3) - 1) * 0.012, 0.03 + Math.floor(i / 3) * 0.035, 0.04 - Math.floor(i / 3) * 0.004));
      return group(body, holes, box(0.05, 0.03, 0.012, 0x2a2b2e, 0, 0.19), stained(box(0.03, 0.04, 0.004, STAIN, 0, 0.08, 0.042)));
    },
  },
  {
    id: 'pot-ustensiles',
    name: 'pot à ustensiles',
    portable: false,
    movable: false,
    durability: 300,
    fragility: 6,
    holds: UTENSIL_POT,
    slots: [[-0.015, 0.012, -0.015], [0.015, 0.012, -0.015], [-0.015, 0.012, 0.015], [0.015, 0.012, 0.015]],
    build: () => {
      const wall = mesh(new THREE.CylinderGeometry(POT_R, POT_R * 0.9, POT_H, 20, 1, true), 0x3e6f9e, 0, POT_H / 2, 0);
      (wall.material as THREE.Material).side = THREE.DoubleSide;
      return group(wall, cyl(POT_R * 0.9, 0.012, 0x335d85, 0.006, 0, 0, 20));
    },
  },
  // ——— épices ———
  {
    id: 'etagere-epices',
    name: 'étagère à épices',
    portable: false,
    movable: false,
    durability: 300,
    fragility: 8,
    holds: Object.keys(SPICES),
    slots: SPICE_SLOTS,
    build: () => group(
      box(SHELF_W, 0.03, SHELF_D, 0xc9a87a, 0, SHELF_Y),
      box(0.02, 0.12, 0.16, 0x7a5232, -0.33, SHELF_Y - 0.07, -0.02),
      box(0.02, 0.12, 0.16, 0x7a5232, 0.33, SHELF_Y - 0.07, -0.02),
      // deux bocaux décoratifs au bout
      cyl(0.065, 0.2, 0xb8c7cc, SHELF_Y + 0.115, 0.3, 0, 14),
      cyl(0.062, 0.02, 0x7a5232, SHELF_Y + 0.225, 0.3, 0, 14),
    ),
  },
  spiceJar('sel', 'sel', 0xffffff, 0x3b6db3, 0.1),
  spiceJar('poivre', 'poivre', 0x3a3a3a, 0x2a2b2e, 0.12),
  spiceJar('paprika', 'paprika', 0xd65b3a, 0x7a5232),
  spiceJar('herbes', 'herbes de Provence', 0x6d9a3e, 0x7a5232),
  { ...spiceJar('huile', "huile d'olive", 0xb8b23a, 0x2a2b2e, 0.2), fragility: 3 },
];
