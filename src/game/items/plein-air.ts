/**
 * Les objets du plein air, faits avec les modèles des packs de Quaternius (CC0) : l'étang et son
 * ponton, les cannes à pêche et les poissons qu'on y attrape (Cute Fish Pack), le coin camping
 * avec son feu de camp (Survival Pack), et deux petits monstres qui se promènent (Bestiary -
 * Dungeon Monsters Kit, licence Quaternius QAL).
 *
 * Ce qu'on en fait (pêcher, griller sa prise au feu de camp, dormir sous la tente, se soigner,
 * les monstres qui suivent ou fuient) est dans loisirs.ts.
 */
import * as THREE from 'three';
import { creatureModel, fitScale, packModel, packSize, type Fit } from '../packs/assets';
import type { ModelName, PackId } from '../packs/manifest';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

/** Le modèle d'un pack, nommé (pièce à part, voir WorldItem.part) ou non. */
function model<P extends PackId>(pack: P, name: ModelName<P>, fit: Fit, part = ''): THREE.Group {
  const g = packModel(pack, name, fit, true);
  g.name = part;
  return g;
}

/** Fiche d'un objet fait d'un seul modèle de pack. */
function prop<P extends PackId>(id: string, name: string, pack: P, file: ModelName<P>, fit: Fit, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, portable: true, fragility: 8, durability: 200, ...extra, build: () => model(pack, file, fit) };
}

// ——— l'étang ———

/** L'étang : centre, demi-axes (m) ; le ponton part de sa rive nord vers le sud. */
export const POND = { x: 9, z: 16, rx: 6, rz: 4.2 };
/** Ponton : largeur, longueur, hauteur du plancher (m). */
export const DOCK_W = 1.5;
const DOCK_SCALE = fitScale('peche', 'Dock_Long', { width: DOCK_W });
export const DOCK_L = packSize('peche', 'Dock_Long').z * DOCK_SCALE;
export const DOCK_TOP = 0.08;
/** Hauteur du plancher dans le modèle du ponton (unités du pack). */
const DOCK_DECK = 4.08;
/** Hauteur de la surface de l'eau. */
export const WATER_Y = 0.02;

/** Eau de l'étang : une ellipse bleue, une berge de sable autour. */
function pondModel(): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), createToonMaterial({ color: 0x3f8fb8, rimStrength: 0 }));
  water.scale.set(POND.rx, 1, POND.rz);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.name = 'eau';
  const deep = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), createToonMaterial({ color: 0x2d6f95, rimStrength: 0 }));
  deep.scale.set(POND.rx * 0.62, 1, POND.rz * 0.6);
  deep.position.set(0.4, WATER_Y + 0.002, 0.3);
  const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 48).rotateX(-Math.PI / 2), toon(0xcdb57e));
  shore.scale.set(POND.rx, 1, POND.rz);
  shore.position.y = 0.012;
  shore.receiveShadow = true;
  // quelques roseaux sur la rive
  const reed = toon(0x6a8a3a);
  for (let i = 0; i < 14; i++) {
    const a = 2.3 + (i / 14) * 2.2 + (i % 3) * 0.05;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.7 + (i % 4) * 0.15, 5), reed);
    r.position.set(Math.cos(a) * POND.rx * 1.02, 0.4, Math.sin(a) * POND.rz * 1.02);
    r.rotation.z = ((i % 5) - 2) * 0.06;
    r.castShadow = true;
    g.add(r);
  }
  g.add(water, deep, shore);
  return g;
}

// ——— la pêche ———

export type Rarity = 'commun' | 'peu commun' | 'rare' | 'légendaire';

export interface FishKind {
  id: string;
  name: string;
  model: ModelName<'peche'>;
  rarity: Rarity;
  /** Longueur (m). */
  length: number;
  /** Ce que le marché en donne (centimes). */
  price: number;
}

const F = (model: ModelName<'peche'>, id: string, name: string, rarity: Rarity, length: number, price: number): FishKind => ({ id: `poisson-${id}`, name, model, rarity, length, price });

/** Les poissons de l'étang. */
export const FISH: FishKind[] = [
  F('Goldfish', 'rouge', 'poisson rouge', 'commun', 0.16, 150),
  F('BlueGoldfish', 'rouge-bleu', 'poisson rouge bleu', 'commun', 0.16, 180),
  F('Tetra', 'tetra', 'tétra', 'commun', 0.12, 120),
  F('CardinalFish', 'cardinal', 'poisson-cardinal', 'commun', 0.14, 160),
  F('RedSnapper', 'vivaneau', 'vivaneau', 'commun', 0.32, 400),
  F('Flatfish', 'limande', 'limande', 'commun', 0.28, 350),
  F('Turbot', 'turbot', 'turbot', 'commun', 0.34, 450),
  F('Tang', 'chirurgien', 'poisson-chirurgien', 'commun', 0.2, 220),
  F('Clownfish', 'clown', 'poisson-clown', 'peu commun', 0.12, 500),
  F('ZebraClownFish', 'clown-zebre', 'poisson-clown zébré', 'peu commun', 0.12, 550),
  F('YellowTang', 'chirurgien-jaune', 'chirurgien jaune', 'peu commun', 0.2, 600),
  F('BlueTang', 'chirurgien-bleu', 'chirurgien bleu', 'peu commun', 0.22, 650),
  F('ButterflyFish', 'papillon', 'poisson-papillon', 'peu commun', 0.18, 550),
  F('Betta', 'combattant', 'combattant', 'peu commun', 0.1, 500),
  F('Cowfish', 'vache', 'poisson-vache', 'peu commun', 0.24, 700),
  F('Puffer', 'globe', 'poisson-globe', 'peu commun', 0.24, 750),
  F('Piranha', 'piranha', 'piranha', 'peu commun', 0.26, 800),
  F('ArmoredCatfish', 'chat', 'poisson-chat', 'peu commun', 0.36, 700),
  F('Koi', 'koi', 'carpe koï', 'rare', 0.45, 1500),
  F('MoorishIdol', 'idole', 'idole des Maures', 'rare', 0.2, 1200),
  F('RoyalGramma', 'gramma', 'gramma royal', 'rare', 0.1, 1100),
  F('MandarinFish', 'mandarin', 'poisson mandarin', 'rare', 0.1, 1300),
  F('ParrotFish', 'perroquet', 'poisson-perroquet', 'rare', 0.4, 1600),
  F('Lionfish', 'lion', 'poisson-lion', 'rare', 0.3, 1700),
  F('BlackLionFish', 'lion-noir', 'poisson-lion noir', 'rare', 0.3, 1900),
  F('CoralGrouper', 'merou', 'mérou corail', 'rare', 0.5, 1800),
  F('FlowerHorn', 'flowerhorn', 'flowerhorn', 'rare', 0.3, 2000),
  F('Humphead', 'napoleon', 'napoléon', 'légendaire', 0.7, 4000),
  F('Anglerfish', 'baudroie', 'baudroie', 'légendaire', 0.5, 4500),
  F('Blobfish', 'blob', 'poisson-blob', 'légendaire', 0.3, 5000),
  F('Sunfish', 'lune', 'poisson-lune', 'légendaire', 0.8, 5500),
  F('Tuna', 'thon', 'thon', 'légendaire', 0.8, 5000),
  F('Swordfish', 'espadon', 'espadon', 'légendaire', 0.9, 6500),
  F('GoblinShark', 'requin-lutin', 'requin-lutin', 'légendaire', 0.9, 7000),
  F('Shark', 'requin', 'requin', 'légendaire', 0.9, 8000),
];
export const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));

/** Les cannes à pêche, de la plus simple à la meilleure : modèle, nom, prix au magasin (centimes). */
export const RODS: Array<{ id: string; name: string; model: ModelName<'peche'>; price: number }> = [
  { id: 'canne-a-peche', name: 'canne à pêche', model: 'FishingRod_Lvl1', price: 1500 },
  { id: 'canne-a-peche-2', name: 'canne à pêche en bambou', model: 'FishingRod_Lvl2', price: 3500 },
  { id: 'canne-a-peche-3', name: 'canne à pêche à moulinet', model: 'FishingRod_Lvl3', price: 7500 },
  { id: 'canne-a-peche-4', name: 'canne à pêche en carbone', model: 'FishingRod_Lvl4', price: 15000 },
  { id: 'canne-a-peche-5', name: 'canne à pêche de champion', model: 'FishingRod_Lvl5', price: 30000 },
];
/** Faim rendue par un poisson grillé entier, et en combien de bouchées (selon sa taille). */
export const fishMeal = (length: number) => ({
  hunger: Math.round(THREE.MathUtils.clamp(length * 90, 12, 60)),
  bites: Math.round(THREE.MathUtils.clamp(length * 10, 3, 8)),
});

/** Temps de grill (s, feu bien pris) : un gros poisson cuit plus longtemps. */
export const fishGrill = (length: number) => Math.round(10 + length * 20);

/** Hauteur d'une canne (m) : le bout de la ligne. */
export const ROD_H = 1.6;

/** Niveau de la canne tenue (1 à 5), 0 si ce n'est pas une canne. */
export const rodLevel = (id: string) => RODS.findIndex((r) => r.id === id) + 1;

/** Prix au magasin des objets du plein air (centimes). */
export const OUTDOOR_PRICES: Record<string, number> = {
  ...Object.fromEntries(RODS.map((r) => [r.id, r.price])),
  ...Object.fromEntries(FISH.map((f) => [f.id, Math.round(f.price * 1.6)])),
  'grille-camping': 2200,
  'trousse-de-secours': 2500,
  pansements: 600,
  hache: 3500,
  pelle: 2500,
  'sac-a-dos': 4500,
  boussole: 1800,
  allumettes: 200,
  'lampe-torche': 1500,
  radio: 3900,
  telephone: 30000,
};

// ——— le camping ———

/** Feu de camp : où se pose une poêle, au-dessus des bûches. */
const FIRE_W = 0.9;
const FIRE_TOP = packSize('survie', 'Bonfire').y * fitScale('survie', 'Bonfire', { width: FIRE_W });
/** Où se pose la grille (ou la poêle) au-dessus des bûches. */
export const FIRE_SPOT_Y = FIRE_TOP * 0.82;
/** Grille de camping : demi-largeur, longueur, hauteur du treillis (m). */
const GRILL_HX = 0.22;
const GRILL_L = 0.62;
const GRILL_FLOOR = 0.014;

/** Tente : longueur avec ses cordes (m), et de sa toile (la moitié), où l'on dort. */
const TENT_L = 4;
const TENT_CANVAS = TENT_L / 2;

/** Ce qui se grille au feu de camp : les poissons pêchés entiers, et la viande du frigo. */
export const GRILL_FOOD = [...FISH.map((f) => f.name), 'poisson', 'steak', 'saucisses', 'poulet'];

/** La grille de camping : un cadre et un treillis de fer, deux places côte à côte. */
function grillModel(): THREE.Group {
  const g = new THREE.Group();
  const iron = toon(0x3b3a38);
  const bar = (w: number, d: number, x: number, z: number, y = GRILL_FLOOR) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), iron);
    m.position.set(x, y - 0.005, z);
    m.castShadow = true;
    g.add(m);
  };
  // le cadre
  bar(GRILL_HX * 2, 0.014, 0, -GRILL_L / 2);
  bar(GRILL_HX * 2, 0.014, 0, GRILL_L / 2);
  bar(0.014, GRILL_L, -GRILL_HX, 0);
  bar(0.014, GRILL_L, GRILL_HX, 0);
  // le treillis
  for (let i = 1; i < 7; i++) bar(0.006, GRILL_L, -GRILL_HX + (i * GRILL_HX * 2) / 7, 0);
  // deux poignées relevées, aux bouts (la boîte monte assez haut pour garder ce qu'on y pose)
  for (const z of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 4, 10, Math.PI), iron);
    h.position.set(0, GRILL_FLOOR, z * (GRILL_L / 2 + 0.005));
    h.rotation.y = Math.PI / 2;
    g.add(h);
  }
  return g;
}

export const OUTDOOR_ITEMS: ItemDef[] = [
  {
    id: 'etang',
    name: 'étang',
    portable: false,
    fragility: 10,
    durability: 100000,
    build: pondModel,
  },
  {
    id: 'ponton',
    name: 'ponton',
    portable: false,
    fragility: 10,
    durability: 100000,
    build: () => {
      const g = model('peche', 'Dock_Long', { width: DOCK_W });
      g.position.y = DOCK_TOP - DOCK_DECK * DOCK_SCALE;
      return new THREE.Group().add(g);
    },
  },
  {
    id: 'barque',
    name: 'barque',
    portable: false,
    seat: 0.32,
    fragility: 10,
    durability: 2000,
    // tirée sur la berge, la proue vers +Z
    build: () => model('peche', 'Boat', { length: 2.6 }),
  },
  {
    id: 'boite-a-peche',
    name: 'boîte à pêche',
    portable: true,
    fragility: 8,
    durability: 300,
    // les leurres et le ver, dans une petite caisse
    build: () => {
      const g = new THREE.Group();
      const wood = toon(0x7a5332);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.2), wood);
      b.position.y = 0.04;
      b.castShadow = true;
      g.add(b);
      (['Lure_1', 'Lure_2', 'Lure_3', 'Lure_4', 'Lure_5', 'Lure_6'] as const).forEach((n, i) => {
        const l = model('peche', n, { size: 0.09 });
        l.position.set(-0.11 + (i % 3) * 0.11, 0.08, i < 3 ? -0.045 : 0.045);
        l.rotation.y = 0.3;
        g.add(l);
      });
      const worm = model('peche', 'Worm', { size: 0.07 });
      worm.position.set(0.21, 0, 0.05);
      g.add(worm);
      return g;
    },
  },
  ...RODS.map((r, i): ItemDef => ({
    id: r.id,
    name: r.name,
    portable: true,
    grip: 'pole',
    gripPoint: [0, 0.35, 0],
    fragility: 7 + Math.min(2, i),
    durability: 300 + i * 150,
    build: () => model('peche', r.model, { height: ROD_H }),
  })),
  ...FISH.map((f): ItemDef => ({
    id: f.id,
    name: f.name,
    portable: true,
    fragility: 9,
    durability: 100,
    breakWord: 'abîmé',
    // se vide sur la planche : il donne le poisson de la cuisine, qui se cuit ; entier, il se
    // grille sur la grille du feu de camp et se mange tel quel (la couleur suit : loisirs.ts)
    cut: 'poisson',
    food: { ...fishMeal(f.length), color: 0xf0dcc0 },
    cook: { seconds: fishGrill(f.length), burn: 22, colors: [0xffffff, 0xb07a48, 0x2e241c] },
    build: () => {
      const g = model('peche', f.model, { length: f.length });
      // couché sur le flanc, comme sur l'étal
      const s = packSize('peche', f.model).multiplyScalar(fitScale('peche', f.model, { length: f.length }));
      g.rotation.z = Math.PI / 2;
      g.position.x = s.y / 2;
      g.position.y = s.x / 2 - s.y / 2 + s.y / 2;
      return new THREE.Group().add(g);
    },
  })),
  {
    id: 'feu-de-camp',
    name: 'feu de camp',
    portable: false,
    fragility: 10,
    durability: 100000,
    // un clic sur les bûches l'allume ou l'éteint ; on y pose une poêle ou une casserole
    heat: { spots: [[0, FIRE_SPOT_Y, 0]], lit: 'flamme', warmup: 25 },
    build: () => {
      const g = new THREE.Group();
      const stones = toon(0x8c8a84);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + (i % 3) * 0.015, 0), stones);
        s.position.set(Math.cos(a) * FIRE_W * 0.62, 0.05, Math.sin(a) * FIRE_W * 0.62);
        s.rotation.set(i, i * 2, 0);
        s.castShadow = true;
        g.add(s);
      }
      g.add(model('survie', 'Bonfire', { width: FIRE_W }, 'bouton-0'));
      const fire = model('survie', 'Bonfire_Fire', { width: FIRE_W }, 'flamme-0');
      fire.visible = false;
      fire.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = false;
      });
      g.add(fire);
      return g;
    },
  },
  {
    id: 'buche',
    name: 'bûche',
    portable: false,
    movable: true,
    seat: 0.3,
    fragility: 10,
    durability: 1000,
    build: () => {
      const g = model('survie', 'WoodLog', { width: 1.1 });
      g.scale.y = 1.6;
      return new THREE.Group().add(g);
    },
  },
  {
    id: 'grille-camping',
    name: 'grille de camping',
    portable: true,
    grip: 'handle',
    gripPoint: [0, GRILL_FLOOR, GRILL_L / 2 + 0.03],
    cookware: { holds: GRILL_FOOD, places: [[-GRILL_HX / 2, GRILL_FLOOR, 0], [GRILL_HX / 2, GRILL_FLOOR, 0]], grate: true },
    fragility: 10,
    durability: 300,
    build: grillModel,
  },
  // on y dort comme dans un lit (Game.sleepIn), allongé sous la toile (les cordes la dépassent)
  { id: 'tente', name: 'tente', portable: false, bed: { top: 0.04, length: TENT_CANVAS, head: -TENT_CANVAS / 2 }, fragility: 10, durability: 5000, build: () => model('survie', 'Tent', { length: TENT_L }) },
  prop('trousse-de-secours', 'trousse de secours', 'survie', 'FirstAidKit', { width: 0.32 }, { grip: 'handle', durability: 3 }),
  prop('pansements', 'pansements', 'survie', 'Bandages', { height: 0.1 }, { durability: 5 }),
  prop('hache', 'hache', 'survie', 'Axe', { height: 0.7 }, { grip: 'pole', gripPoint: [0, 0.15, 0], fragility: 10, durability: 400 }),
  prop('pelle', 'pelle', 'survie', 'Shovel', { height: 1.1 }, { grip: 'pole', gripPoint: [0, 0.8, 0], fragility: 10, durability: 400 }),
  prop('sac-a-dos', 'sac à dos', 'survie', 'Backpack', { height: 0.5 }, { fragility: 10 }),
  prop('boussole', 'boussole', 'survie', 'Compass_Closed', { height: 0.07 }),
  prop('allumettes', 'allumettes', 'survie', 'Matchbox', { height: 0.06 }),
  prop('lampe-torche', 'lampe torche', 'survie', 'Torch', { height: 0.22 }),
  prop('radio', 'radio', 'survie', 'Radio', { height: 0.28 }, { fragility: 5 }),
  prop('telephone', 'téléphone', 'survie', 'Phone', { height: 0.15 }, { fragility: 4 }),
  prop('gourde', 'gourde', 'survie', 'WaterBottle_1', { height: 0.25 }),
  prop('conserve', 'boîte de conserve', 'survie', 'Can_Closed', { height: 0.11 }, { fragility: 10 }),
  prop('bidon-essence', 'bidon d’essence', 'survie', 'GasCan', { height: 0.45 }, { fragility: 10 }),
  { id: 'bonbonne-gaz', name: 'bonbonne de gaz', portable: false, movable: true, fragility: 10, durability: 2000, build: () => model('survie', 'PropaneTank', { height: 0.6 }) },
  { id: 'piege-a-loup', name: 'piège à loup', portable: false, fragility: 10, durability: 2000, build: () => model('survie', 'BearTrap_Open', { width: 0.45 }) },
  { id: 'radeau', name: 'radeau', portable: false, seat: 0.18, fragility: 10, durability: 2000, build: () => model('survie', 'Raft', { length: 2.4 }) },
  {
    id: 'torche-bois',
    name: 'torche',
    portable: false,
    fragility: 10,
    durability: 2000,
    // plantée dans le sol, allumée la nuit (loisirs.ts)
    build: () => {
      const g = new THREE.Group();
      g.add(model('survie', 'WoodenTorch', { height: 1.3 }));
      const fire = model('survie', 'WoodenTorch_Fire', { height: 1.3 * (3.547 / 2.691) }, 'flamme');
      g.add(fire);
      return g;
    },
  },
  // les monstres : ils se promènent (loisirs.ts), on ne les prend pas
  { id: 'puglin', name: 'puglin', portable: false, fragility: 10, durability: 100000, build: () => creatureModel('puglin', 0.95) },
  { id: 'diablotin', name: 'diablotin', portable: false, fragility: 10, durability: 100000, build: () => creatureModel('imp', 1.05) },
];

/**
 * Caractère d'un monstre : le curieux vient voir le perso et le suit quand on l'a salué ; le
 * farouche s'enfuit quand on l'approche, jusqu'à ce qu'on l'ait apprivoisé à force de saluts.
 */
export type Temper = 'curieux' | 'farouche';

/** Où se promène chaque monstre : centre (x, z), rayon (m), et son caractère. */
export const ROAMS: Record<string, { x: number; z: number; r: number; temper: Temper }> = {
  puglin: { x: -6, z: 13, r: 4.5, temper: 'curieux' },
  diablotin: { x: 31, z: -13.6, r: 2.4, temper: 'farouche' },
};

/** Objets du plein air posés au départ : [id, x, y, z, rotation (rad)]. */
export const OUTDOOR_START: Array<[string, number, number, number, number]> = [
  ['etang', POND.x, 0, POND.z, 0],
  // le ponton part de la rive nord vers le milieu de l'étang
  ['ponton', POND.x - 1.2, 0, POND.z - POND.rz + DOCK_L / 2 - 0.6, 0],
  ['barque', POND.x + 3.4, 0, POND.z - POND.rz - 0.9, -1.25],
  ['canne-a-peche', POND.x - 2.15, 0, POND.z - POND.rz - 0.9, 0],
  ['boite-a-peche', POND.x - 1.6, 0, POND.z - POND.rz - 1.1, 0.3],
  ['radeau', POND.x - POND.rx - 1.4, 0, POND.z + 0.6, 1.4],
  // le coin camping, au sud-ouest du jardin
  ['feu-de-camp', -11, 0, 16.5, 0],
  ['buche', -11, 0, 15.2, 0],
  ['buche', -12.3, 0, 16.6, Math.PI / 2],
  ['buche', -9.7, 0, 16.6, -Math.PI / 2],
  ['grille-camping', -11, FIRE_SPOT_Y, 16.5, 0],
  ['tente', -11.2, 0, 19.6, Math.PI],
  ['torche-bois', -13.2, 0, 18.4, 0],
  ['torche-bois', -8.8, 0, 18.4, 0],
  ['sac-a-dos', -12.9, 0, 19.2, 0.4],
  ['hache', -9.4, 0, 15.6, 0.2],
  ['pelle', -13.6, 0, 17.4, 0.5],
  ['bonbonne-gaz', -9.0, 0, 20.0, 0],
  ['bidon-essence', -8.6, 0, 19.5, 0.6],
  ['trousse-de-secours', -12.6, 0, 15.4, 0.4],
  ['pansements', -12.2, 0, 15.1, 0],
  ['allumettes', -10.4, 0, 15.6, 0.3],
  ['boussole', -13.3, 0, 19.8, 0],
  ['lampe-torche', -12.6, 0, 19.9, 1.2],
  ['radio', -9.6, 0, 19.0, -0.4],
  ['gourde', -10.2, 0, 19.8, 0],
  ['conserve', -9.9, 0, 21.2, 0],
  ['conserve', -9.75, 0, 21.35, 0],
  ['telephone', -12.1, 0, 15.25, 0.8],
  ['piege-a-loup', -15.5, 0, 21.5, 0.7],
  ['puglin', ROAMS.puglin.x, 0, ROAMS.puglin.z, 0],
  ['diablotin', ROAMS.diablotin.x, 0, ROAMS.diablotin.z, 0],
];

/** Noms au féminin (accord des messages). */
export const OUTDOOR_FEMININE = [...RODS.map((r) => r.name), 'barque', 'boîte à pêche', 'grille de camping', 'tente', 'trousse de secours', 'pelle', 'hache', 'boussole', 'lampe torche', 'radio', 'gourde', 'boîte de conserve', 'bonbonne de gaz', 'bûche', 'torche', 'carpe koï', 'limande', 'idole des Maures', 'baudroie'];
