/**
 * La cuisine : meubles de rangement (placard, tiroir), gros appareils (four, micro-ondes,
 * lave-vaisselle), poubelle et petits appareils (bouilloire, grille-pain, mixeur). Mêmes fiches que le reste du catalogue (catalog.ts) ; les portes,
 * le tiroir, la cuisson et le lavage sont joués par Game.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z, et font la hauteur du plan de travail (sauf le
 * micro-ondes, posé dessus, et la poubelle) : mis côte à côte, ils forment le plan de travail.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';
import { FROZEN_FOOD, MORE_FRUITS, OVEN_EXTRA } from './pantry';
import { PREP_CUPBOARD, STOVE_RECIPES } from './prep';
import { DISHES as RECIPE_DISHES } from './recipes';

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

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

/** Lueur d'un appareil en marche (four, micro-ondes) : cachée au repos. */
function glow(w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.set(x, y, z);
  m.name = 'lumiere';
  m.visible = false;
  return m;
}

/** Fruits qui se mixent (les prochains fruits s'ajoutent ici). */
export const FRUITS = ['pomme', 'quartiers de pomme', ...MORE_FRUITS];
/** Mixeur : hauteur du socle, du bol ; où se pose la tasse, à côté (x, m). */
const MIXER_BASE = 0.1;
const MIXER_JAR = 0.2;
const MIXER_CUP = 0.13;
/** Hauteur du grille-pain (m). */
const TOASTER_H = 0.17;
/** Où se pose la tasse à côté de la bouilloire, sous son bec (x, m). */
const KETTLE_CUP = 0.1;
/** Hauteur du plan de travail (m), comme sous la machine à café et l'évier. */
const COUNTER_H = 0.9;
/** Épaisseur du plan de travail, des parois des meubles et des portes (m). */
const TOP = 0.04;
const WALL = 0.02;
const WOOD = 0x8a6440;
const DARK_WOOD = 0x5d4129;
const COUNTER = 0xd9d3c5;
const KNOB = 0xc9c2b0;
const STEEL = 0xb9bfc6;
const INOX = 0xd2d6da;
const BLACK = 0x2e3135;

/** Vaisselle qui passe au lave-vaisselle et sèche à l'égouttoir (les couverts se rangent au tiroir, le reste au placard). */
export const DISHES = ['tasse', 'verre', 'bol', 'assiette', 'carafe', 'fourchette', 'couteau de table', 'cuillère'];
/** Petits objets qui vont dans le tiroir : les couverts, le torchon, la lettre. */
export const DRAWER_THINGS = ['fourchette', 'couteau de table', 'cuillère', 'torchon', 'lettre'];
/** Égouttoir : largeur, profondeur, dessus de la grille, hauteur du rebord (m) ; panier à couverts (centre x, z). */
const RACK_W = 0.3;
const RACK_D = 0.44;
const RACK_FLOOR = 0.022;
const RACK_H = 0.09;
const RACK_BASKET: [number, number] = [0.09, 0.18];
/** Ce qui va à chaque place de l'égouttoir : verres et bols au fond, l'assiette au milieu, les couverts au panier. */
const RACK_CUPS = ['verre', 'tasse', 'bol', 'carafe'];
const RACK_SLOTS: Array<[[number, number, number], string[]]> = [
  [[-0.072, RACK_FLOOR, -0.16], RACK_CUPS],
  [[0.072, RACK_FLOOR, -0.16], RACK_CUPS],
  [[0, RACK_FLOOR, 0.03], ['assiette', 'bol']],
  [[-0.08, RACK_FLOOR, 0.175], ['verre', 'tasse']],
  ...[-0.02, 0.02].map((dx): [[number, number, number], string[]] => [[RACK_BASKET[0] + dx, RACK_FLOOR, RACK_BASKET[1]], ['fourchette', 'couteau de table', 'cuillère']]),
];
/** Ce qui se met au four et au micro-ondes. */
export const OVEN_FOOD = ['lasagne', 'steak', 'pomme de terre', 'pomme', 'sandwich', 'pain', 'carotte', 'tomate', 'tranches de pain', 'rondelles de carotte', ...OVEN_EXTRA];

/** Caisson de meuble bas (côtés, fond, socle) et son plan de travail, ouvert à l'avant. */
function carcass(w: number, d: number, color: THREE.ColorRepresentation = WOOD): THREE.Group {
  const h = COUNTER_H - TOP;
  return group(
    box(WALL, h, d, color, -w / 2 + WALL / 2, h / 2, 0),
    box(WALL, h, d, color, w / 2 - WALL / 2, h / 2, 0),
    box(w, h, WALL, color, 0, h / 2, -d / 2 + WALL / 2),
    // socle en retrait, sous le fond du meuble
    box(w - 2 * WALL, 0.08, d - 0.06, DARK_WOOD, 0, 0.04, -0.03),
    box(w, WALL, d, color, 0, 0.08 + WALL / 2, 0),
    // plan de travail, qui déborde un peu
    box(w + 0.02, TOP, d + 0.02, COUNTER, 0, COUNTER_H - TOP / 2, 0.01),
  );
}

/** Placard : dessus du fond (y) et des étagères, places de gauche à droite. */
const CUP_W = 0.6;
const CUP_D = 0.55;
const CUP_SHELVES = [0.08 + WALL, 0.48];
// une rangée devant (places 0 à 5), puis une au fond (6 à 11) pour les verres et les bols
const CUP_SLOTS = [0.04, -0.13].flatMap((z) => CUP_SHELVES.flatMap((y) => [-0.18, 0, 0.18].map((x): [number, number, number] => [x, y, z])));

/** Tiroir : largeur, profondeur du meuble, fond du tiroir (y), course (m). */
const DRAWER_W = 0.5;
const DRAWER_D = 0.55;
const DRAWER_Y = 0.7;
const DRAWER_OUT = 0.36;

/** Four : largeur, profondeur ; bas et haut de l'enceinte ; grille (m). */
const OVEN_W = 0.6;
const OVEN_D = 0.58;
const OVEN_LOW = 0.16;
const OVEN_HIGH = 0.66;
const OVEN_RACK = 0.3;

/** Lave-vaisselle : largeur, profondeur, bas de la porte, paniers (m). */
const DW_W = 0.6;
const DW_D = 0.58;
const DW_LOW = 0.1;
const DW_RACKS = [0.2, 0.5];

/** Micro-ondes : largeur, profondeur, hauteur ; largeur de l'enceinte (le tableau de commande à droite). */
const MW_W = 0.46;
const MW_D = 0.34;
const MW_H = 0.27;
const MW_CAV = 0.32;

/** Congélateur sous le frigo : largeur, profondeur, hauteur, fond du tiroir, course (m). */
const FZ_W = 0.6;
const FZ_D = 0.6;
const FZ_H = 0.45;
const FZ_Y = 0.07;
const FZ_OUT = 0.34;
const FRIDGE_WHITE = 0xe9e6de;
/** Ce qui va au congélateur (la lasagne : un plat surgelé). */
export const FROZEN_THINGS = ['bac à glaçons', 'lasagne', 'steak', 'pain', ...FROZEN_FOOD];

/** Poubelle à pédale : côté, hauteur (m). */
const BIN_S = 0.3;
const BIN_H = 0.55;

export const KITCHEN_ITEMS: ItemDef[] = [
  {
    id: 'placard',
    name: 'placard',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 7,
    // la porte : charnière à droite, comme le frigo
    door: THREE.MathUtils.degToRad(100),
    holds: [...DISHES.filter((d) => !DRAWER_THINGS.includes(d)), "bouteille d'eau", 'pomme', 'pain', 'boîte de pastilles', ...PREP_CUPBOARD],
    slots: CUP_SLOTS,
    build: () => {
      const g = carcass(CUP_W, CUP_D);
      // étagère du milieu (la planche sous la place du haut)
      g.add(box(CUP_W - 2 * WALL, WALL, CUP_D - WALL - 0.03, WOOD, 0, CUP_SHELVES[1] - WALL / 2, 0));
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(CUP_W / 2, 0, CUP_D / 2);
      const dh = COUNTER_H - TOP - 0.1;
      door.add(
        box(CUP_W - 0.004, dh, WALL, 0x9a7048, -CUP_W / 2, 0.1 + dh / 2, WALL / 2),
        box(CUP_W - 0.08, dh - 0.08, 0.004, DARK_WOOD, -CUP_W / 2, 0.1 + dh / 2, WALL + 0.002),
        // poignée à gauche, en haut
        box(0.014, 0.1, 0.014, KNOB, -CUP_W + 0.05, 0.72, WALL + 0.015),
      );
      g.add(door);
      return g;
    },
  },
  {
    id: 'tiroir',
    name: 'tiroir',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 7,
    drawer: DRAWER_OUT,
    holds: DRAWER_THINGS,
    // au fond du tiroir, deux rangées de deux, puis deux colonnes étroites au milieu (cuillères)
    slots: [-0.11, 0.11, -0.03, 0.03].flatMap((x) => [-0.12, 0.08].map((z): [number, number, number] => [x, DRAWER_Y + 0.006, z])),
    build: () => {
      const g = carcass(DRAWER_W, DRAWER_D);
      // deux fausses façades de tiroir en bas, avec leur poignée
      for (const [y0, y1] of [[0.1, 0.38], [0.4, 0.66]]) {
        g.add(box(DRAWER_W - 0.004, y1 - y0 - 0.006, WALL, 0x9a7048, 0, (y0 + y1) / 2, DRAWER_D / 2 + WALL / 2));
        g.add(box(0.14, 0.014, 0.014, KNOB, 0, y1 - 0.06, DRAWER_D / 2 + WALL + 0.01));
      }
      // le tiroir du haut : façade, fond et côtés ; il glisse vers l'avant
      const drawer = new THREE.Group();
      drawer.name = 'porte';
      const iw = DRAWER_W - 2 * WALL - 0.01, id = DRAWER_D - 0.04;
      const zc = DRAWER_D / 2 - id / 2;
      drawer.add(
        box(DRAWER_W - 0.004, 0.16, WALL, 0x9a7048, 0, 0.765, DRAWER_D / 2 + WALL / 2),
        box(0.14, 0.014, 0.014, KNOB, 0, 0.8, DRAWER_D / 2 + WALL + 0.01),
        box(iw, 0.006, id, 0xb08a5c, 0, DRAWER_Y + 0.003, zc),
        box(0.01, 0.1, id, 0xb08a5c, -iw / 2, DRAWER_Y + 0.05, zc),
        box(0.01, 0.1, id, 0xb08a5c, iw / 2, DRAWER_Y + 0.05, zc),
        box(iw, 0.1, 0.01, 0xb08a5c, 0, DRAWER_Y + 0.05, DRAWER_D / 2 - id),
      );
      g.add(drawer);
      return g;
    },
  },
  {
    id: 'congelateur',
    name: 'congélateur',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 8,
    cold: true,
    freezer: true,
    // un grand tiroir, sous le frigo (posé dessus, voir ON_TOP)
    drawer: FZ_OUT,
    holds: FROZEN_THINGS,
    // deux rangées de deux, puis une au milieu
    slots: [...[-0.13, 0.13].flatMap((x) => [-0.12, 0.1].map((z): [number, number, number] => [x, FZ_Y + 0.006, z])), [0, FZ_Y + 0.006, -0.12], [0, FZ_Y + 0.006, 0.1]],
    build: () => {
      const t = 0.03;
      const g = group(
        box(t, FZ_H, FZ_D, FRIDGE_WHITE, -FZ_W / 2 + t / 2, FZ_H / 2, 0),
        box(t, FZ_H, FZ_D, FRIDGE_WHITE, FZ_W / 2 - t / 2, FZ_H / 2, 0),
        box(FZ_W, FZ_H, t, FRIDGE_WHITE, 0, FZ_H / 2, -FZ_D / 2 + t / 2),
        box(FZ_W, t, FZ_D, FRIDGE_WHITE, 0, FZ_H - t / 2, 0),
        box(FZ_W + 0.004, 0.05, 0.04, 0x8d9093, 0, 0.025, FZ_D / 2 - 0.02),
      );
      // le tiroir : façade blanche, poignée, bac givré
      const drawer = new THREE.Group();
      drawer.name = 'porte';
      const iw = FZ_W - 2 * t - 0.01, id = FZ_D - 0.06;
      const zc = FZ_D / 2 - id / 2;
      drawer.add(
        box(FZ_W - 0.004, FZ_H - 0.07, 0.05, FRIDGE_WHITE, 0, 0.06 + (FZ_H - 0.07) / 2, FZ_D / 2 + 0.025),
        box(FZ_W - 0.12, 0.025, 0.03, 0x9ea4aa, 0, FZ_H - 0.08, FZ_D / 2 + 0.06),
        box(iw, 0.006, id, 0xdfe9ee, 0, FZ_Y + 0.003, zc),
        box(0.01, 0.2, id, 0xdfe9ee, -iw / 2, FZ_Y + 0.1, zc),
        box(0.01, 0.2, id, 0xdfe9ee, iw / 2, FZ_Y + 0.1, zc),
        box(iw, 0.2, 0.01, 0xdfe9ee, 0, FZ_Y + 0.1, FZ_D / 2 - id),
      );
      g.add(drawer);
      return g;
    },
  },
  {
    id: 'bac-glacons',
    name: 'bac à glaçons',
    portable: true,
    grip: 'fist',
    fragility: 8,
    durability: 80,
    // en plastique bleuté, les glaçons dans leurs cases
    build: () => {
      const g = group(box(0.22, 0.03, 0.1, 0x9cc4e4, 0, 0.015, 0));
      for (const x of [-0.075, -0.025, 0.025, 0.075]) for (const z of [-0.025, 0.025]) g.add(box(0.036, 0.022, 0.036, 0xf2f8fb, x, 0.03, z));
      return g;
    },
  },
  {
    id: 'eponge',
    name: 'éponge',
    portable: true,
    grip: 'fist',
    fragility: 1,
    durability: 50,
    wipes: true,
    // jaune, le côté qui gratte en vert
    build: () => group(box(0.1, 0.03, 0.065, 0xf2d34a, 0, 0.015, 0), box(0.1, 0.008, 0.065, 0x3f8f4a, 0, 0.034, 0)),
  },
  {
    id: 'torchon',
    name: 'torchon',
    portable: true,
    // plié, tenu par un coin
    grip: 'fist',
    gripPoint: [0.07, 0.006, 0.04],
    // sèche la vaisselle mouillée et les mains ; essuie aussi la table et les flaques, comme l'éponge
    towel: true,
    wipes: true,
    // du tissu : il ne casse pas, il s'use et finit par se déchirer
    fragility: 10,
    durability: 80,
    breakWord: 'déchiré',
    // plié à plat : blanc à deux rayures rouges
    build: () => {
      const g = group(box(0.2, 0.012, 0.13, 0xf3efe6, 0, 0.006, 0));
      for (const z of [-0.045, 0.045]) g.add(box(0.201, 0.0125, 0.012, 0xb33a3a, 0, 0.00625, z));
      return g;
    },
  },
  {
    id: 'egouttoir',
    name: 'égouttoir',
    portable: false,
    // posé sur le lave-vaisselle, contre l'évier (ON_TOP) : il ne se déplace pas seul
    movable: false,
    fragility: 7,
    durability: 150,
    holds: DISHES,
    slots: RACK_SLOTS.map(([at]) => at),
    slotHolds: RACK_SLOTS.map(([, names]) => names),
    // la vaisselle lavée à la main y sèche en une demi-heure de jeu
    rack: { minutes: 30 },
    build: () => {
      const W = RACK_W, D = RACK_D;
      const wire = 0xc7ccd2;
      // bac en plastique qui recueille l'eau, grille dessus, rebord en fil d'inox
      const g = group(
        box(W, 0.012, D, 0xdfe4e8, 0, 0.006, 0),
        box(0.008, 0.02, D, 0xd0d6dc, W / 2 - 0.004, 0.01, 0),
        box(0.008, 0.02, D, 0xd0d6dc, -W / 2 + 0.004, 0.01, 0),
      );
      for (let i = 0; i < 11; i++) g.add(box(W - 0.02, 0.006, 0.006, wire, 0, RACK_FLOOR - 0.003, -D / 2 + 0.02 + i * ((D - 0.04) / 10)));
      for (const x of [-W / 2 + 0.005, W / 2 - 0.005]) g.add(box(0.006, 0.006, D - 0.01, wire, x, RACK_H, 0));
      for (const z of [-D / 2 + 0.005, D / 2 - 0.005]) g.add(box(W - 0.01, 0.006, 0.006, wire, 0, RACK_H, z));
      for (const x of [-W / 2 + 0.005, W / 2 - 0.005]) for (const z of [-D / 2 + 0.005, D / 2 - 0.005]) g.add(box(0.006, RACK_H, 0.006, wire, x, RACK_H / 2, z));
      // panier à couverts, devant à droite
      const [bx, bz] = RACK_BASKET, bw = 0.09, bd = 0.07, bh = 0.1, plastic = 0x9fb7c9;
      g.add(
        box(bw, 0.004, bd, plastic, bx, RACK_FLOOR, bz),
        box(bw, bh, 0.004, plastic, bx, RACK_FLOOR + bh / 2, bz - bd / 2),
        box(bw, bh, 0.004, plastic, bx, RACK_FLOOR + bh / 2, bz + bd / 2),
        box(0.004, bh, bd, plastic, bx - bw / 2, RACK_FLOOR + bh / 2, bz),
        box(0.004, bh, bd, plastic, bx + bw / 2, RACK_FLOOR + bh / 2, bz),
      );
      return g;
    },
  },
  {
    id: 'plateau',
    name: 'plateau',
    portable: true,
    // à deux mains par les bords ; ce qu'on pose dessus part avec lui
    grip: 'twoHands',
    gripPoint: [0, 0.02, 0],
    fragility: 4,
    durability: 120,
    build: () => group(
      box(0.44, 0.012, 0.3, 0x6e4a2c, 0, 0.006, 0),
      box(0.44, 0.03, 0.012, 0x5e3e24, 0, 0.015, 0.144),
      box(0.44, 0.03, 0.012, 0x5e3e24, 0, 0.015, -0.144),
      box(0.012, 0.03, 0.3, 0x5e3e24, 0.214, 0.015, 0),
      box(0.012, 0.03, 0.3, 0x5e3e24, -0.214, 0.015, 0),
    ),
  },
  {
    id: 'pastilles',
    name: 'boîte de pastilles',
    portable: true,
    grip: 'fist',
    fragility: 6,
    durability: 60,
    // une boîte en carton pour le lave-vaisselle (Game compte les pastilles qui restent)
    build: () => group(box(0.12, 0.09, 0.07, 0x2f7fc1, 0, 0.045, 0), box(0.121, 0.03, 0.071, 0xf0f4f7, 0, 0.06, 0)),
  },
  {
    id: 'lasagne',
    name: 'lasagne',
    portable: true,
    grip: 'fist',
    fragility: 9,
    durability: 30,
    // une lasagne surgelée en barquette : givrée au départ, il faut la réchauffer (micro-ondes, four)
    food: { hunger: 45, bites: 6, color: 0xc0583a },
    cook: { seconds: 3, burn: 20, colors: [0xe4eef3, 0xc0583a, 0x3a2a20] },
    rawWord: 'congelé',
    build: () => {
      const top = box(0.15, 0.012, 0.11, 0xe4eef3, 0, 0.042, 0);
      top.name = 'cuit';
      return group(box(0.17, 0.04, 0.13, 0xb9bfc6, 0, 0.02, 0), top);
    },
  },
  {
    id: 'four',
    name: 'four',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 8,
    // la porte s'abaisse vers l'avant, charnière en bas
    door: THREE.MathUtils.degToRad(80),
    doorAxis: 'x',
    holds: OVEN_FOOD,
    slots: [-0.13, 0.13].map((x): [number, number, number] => [x, OVEN_RACK + 0.006, -0.02]),
    heats: { seconds: 8, burns: true },
    build: () => {
      const w = OVEN_W, d = OVEN_D, h = COUNTER_H - TOP;
      const inside = 0x3a3d42;
      const g = group(
        box(WALL, h, d, BLACK, -w / 2 + WALL / 2, h / 2, 0),
        box(WALL, h, d, BLACK, w / 2 - WALL / 2, h / 2, 0),
        box(w, h, WALL, inside, 0, h / 2, -d / 2 + WALL / 2),
        // socle et sole, voûte, bandeau de commande
        box(w, OVEN_LOW, d, BLACK, 0, OVEN_LOW / 2, 0),
        box(w - 2 * WALL, 0.01, d - WALL, inside, 0, OVEN_LOW + 0.005, 0),
        box(w, h - OVEN_HIGH, d, BLACK, 0, (OVEN_HIGH + h) / 2, 0),
        box(w - 0.02, 0.15, 0.01, INOX, 0, 0.77, d / 2 + 0.005),
        // grille
        box(w - 2 * WALL, 0.006, d - 0.08, STEEL, 0, OVEN_RACK + 0.003, 0),
        box(w + 0.02, TOP, d + 0.02, COUNTER, 0, COUNTER_H - TOP / 2, 0.01),
        glow(w - 2 * WALL - 0.01, OVEN_HIGH - OVEN_LOW - 0.02, d - 0.06, 0xff9a3c, 0, (OVEN_LOW + OVEN_HIGH) / 2, 0),
      );
      // boutons du bandeau
      for (const x of [-0.2, -0.12, 0.12, 0.2]) g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 14).rotateX(Math.PI / 2), BLACK, x, 0.77, d / 2 + 0.02));
      g.add(box(0.1, 0.035, 0.006, 0x1d2a22, 0, 0.77, d / 2 + 0.012));
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(0, OVEN_LOW, d / 2);
      const dh = OVEN_HIGH - OVEN_LOW;
      door.add(
        box(w - 0.02, dh, 0.03, INOX, 0, dh / 2, 0.015),
        box(w - 0.14, dh - 0.16, 0.006, 0x2a2622, 0, dh / 2 - 0.02, 0.031),
        // poignée en barre, en haut de la porte
        box(w - 0.12, 0.018, 0.018, STEEL, 0, dh - 0.04, 0.07),
        box(0.014, 0.014, 0.04, STEEL, -(w - 0.16) / 2, dh - 0.04, 0.05),
        box(0.014, 0.014, 0.04, STEEL, (w - 0.16) / 2, dh - 0.04, 0.05),
      );
      g.add(door);
      return g;
    },
  },
  {
    id: 'lave-vaisselle',
    name: 'lave-vaisselle',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 8,
    door: THREE.MathUtils.degToRad(85),
    doorAxis: 'x',
    holds: DISHES,
    // deux paniers ; une rangée au milieu (places 0 à 5), puis une à l'avant (6 à 11)
    slots: [-0.02, 0.15].flatMap((z) => DW_RACKS.flatMap((y) => [-0.17, 0, 0.17].map((x): [number, number, number] => [x, y + 0.008, z]))),
    washes: { seconds: 6 },
    build: () => {
      const w = DW_W, d = DW_D, h = COUNTER_H - TOP;
      const inside = 0xa8b0b8;
      const g = group(
        box(WALL, h, d, INOX, -w / 2 + WALL / 2, h / 2, 0),
        box(WALL, h, d, INOX, w / 2 - WALL / 2, h / 2, 0),
        box(w, h, WALL, inside, 0, h / 2, -d / 2 + WALL / 2),
        box(w, DW_LOW, d, 0x7d8389, 0, DW_LOW / 2, 0),
        box(w - 2 * WALL, 0.01, d - WALL, inside, 0, DW_LOW + 0.005, 0),
        box(w, 0.02, d, inside, 0, h - 0.01, 0),
        box(w + 0.02, TOP, d + 0.02, COUNTER, 0, COUNTER_H - TOP / 2, 0.01),
      );
      // paniers : un fond en grille et un rebord
      for (const y of DW_RACKS) {
        g.add(box(w - 2 * WALL - 0.02, 0.008, d - 0.08, 0x8e979f, 0, y + 0.004, 0));
        g.add(box(w - 2 * WALL - 0.02, 0.05, 0.008, 0x8e979f, 0, y + 0.025, (d - 0.08) / 2));
      }
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(0, DW_LOW, d / 2);
      const dh = h - DW_LOW;
      door.add(
        box(w - 0.004, dh, 0.03, INOX, 0, dh / 2, 0.015),
        // bandeau de commande et poignée en creux, en haut de la porte
        box(w - 0.004, 0.08, 0.006, 0x50565c, 0, dh - 0.04, 0.033),
        box(0.12, 0.02, 0.01, 0x1d2a22, -0.12, dh - 0.04, 0.038),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12).rotateX(Math.PI / 2), 0x6fc36a, 0.2, dh - 0.04, 0.038),
        box(0.2, 0.02, 0.02, STEEL, 0.02, dh - 0.11, 0.04),
      );
      g.add(door);
      return g;
    },
  },
  {
    id: 'micro-ondes',
    name: 'micro-ondes',
    portable: false,
    // posé sur le plan de travail : il suit le meuble dessous
    movable: false,
    durability: 200,
    fragility: 5,
    // charnière à gauche : la porte s'ouvre vers la gauche (angle négatif)
    door: -THREE.MathUtils.degToRad(100),
    // on y réchauffe aussi les plats préparés
    holds: [...OVEN_FOOD, ...STOVE_RECIPES.map((r) => r.name), ...RECIPE_DISHES.map((d) => d.name)],
    slots: [[-MW_W / 2 + WALL + MW_CAV / 2 - 0.01, 0.024, 0]],
    heats: { seconds: 4, burns: false },
    build: () => {
      const w = MW_W, d = MW_D, h = MW_H;
      const body = 0xe7e4dc, inside = 0xd8d4c8;
      const cx = -w / 2 + WALL + MW_CAV / 2 - 0.01;
      const g = group(
        box(w, WALL, d, body, 0, WALL / 2, 0),
        box(w, WALL, d, body, 0, h - WALL / 2, 0),
        box(WALL, h, d, body, -w / 2 + WALL / 2, h / 2, 0),
        box(w, h, WALL, inside, 0, h / 2, -d / 2 + WALL / 2),
        // tableau de commande à droite (cloison de l'enceinte comprise)
        box(w - MW_CAV - WALL, h, d, body, w / 2 - (w - MW_CAV - WALL) / 2, h / 2, 0),
        box(0.07, 0.04, 0.004, 0x1d2a22, w / 2 - 0.06, h - 0.06, d / 2 + 0.002),
        mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 14).rotateX(Math.PI / 2), 0x8d9093, w / 2 - 0.06, 0.12, d / 2 + 0.007),
        mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 14).rotateX(Math.PI / 2), 0x8d9093, w / 2 - 0.06, 0.07, d / 2 + 0.007),
        // plateau tournant
        mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.004, 24), 0xcfe3e8, cx, WALL + 0.002, 0),
        glow(MW_CAV - 0.01, h - 2 * WALL - 0.01, d - WALL - 0.02, 0xffe39a, cx, h / 2, 0.005),
      );
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(-w / 2, 0, d / 2);
      const dw = MW_CAV + WALL;
      door.add(
        box(dw, h - 0.004, 0.02, body, dw / 2, h / 2, 0.01),
        box(dw - 0.08, h - 0.08, 0.004, 0x2a2622, dw / 2 - 0.01, h / 2, 0.021),
        box(0.016, h - 0.08, 0.016, 0x9ea4aa, dw - 0.02, h / 2, 0.03),
      );
      g.add(door);
      return g;
    },
  },
  {
    id: 'bouilloire',
    name: 'bouilloire',
    portable: false,
    movable: false,
    durability: 200,
    fragility: 5,
    // comme la machine à café : la tasse se pose à côté, sous le bec, et le thé y coule
    pour: { at: [KETTLE_CUP, 0, 0.03], fills: ['tasse'], liquid: 'thé', seconds: 2.4, color: 0x9a5a22 },
    // il faut de l'eau dedans : on y verse celle d'une casserole, d'une bouteille ou d'une tasse
    tank: 1,
    // le bouton du socle l'allume ; l'eau chauffe, puis le thé coule ; elle s'éteint seule si on l'oublie
    heat: { spots: [[KETTLE_CUP, 0, 0.03]], lit: 'voyant', warmup: 4, autoOff: 45 },
    build: () => {
      const body = 0xe7e3da, dark = 0x3b3f44;
      const x = -0.06;
      const g = group(
        // socle, verseuse, couvercle
        mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.025, 24), dark, x, 0.0125, 0),
        mesh(new THREE.CylinderGeometry(0.065, 0.078, 0.17, 24), body, x, 0.11, 0),
        mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.02, 24), body, x, 0.205, 0),
        mesh(new THREE.SphereGeometry(0.014, 12, 8), dark, x, 0.222, 0),
        // poignée derrière
        box(0.02, 0.13, 0.02, dark, x - 0.085, 0.13, 0),
        box(0.03, 0.02, 0.02, dark, x - 0.072, 0.195, 0),
        box(0.03, 0.02, 0.02, dark, x - 0.072, 0.065, 0),
      );
      // bec, penché au-dessus de la tasse
      const spout = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.13, 12), body, (x + 0.06 + KETTLE_CUP) / 2, 0.15, 0.015);
      spout.rotation.z = -Math.PI / 3;
      g.add(spout);
      const button = group(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 14).rotateX(Math.PI / 2), 0xd0463a, x - 0.03, 0.0125, 0.088));
      button.name = 'bouton-0';
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      lamp.position.set(x + 0.03, 0.0125, 0.09);
      const lit = group(lamp);
      lit.name = 'voyant-0';
      lit.visible = false;
      g.add(button, lit);
      // thé qui coule du bec dans la tasse
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), toon(0x7a4519));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(KETTLE_CUP, 0.18, 0.03);
      g.add(jet);
      return g;
    },
  },
  {
    id: 'grille-pain',
    name: 'grille-pain',
    portable: false,
    movable: false,
    durability: 200,
    fragility: 5,
    // les tranches se posent dans la fente, sur le dessus ; elles en ressortent grillées
    holds: ['tranches de pain'],
    slots: [[0, TOASTER_H - 0.05, 0]],
    heats: { seconds: 5, burns: false, turns: { 'tranches de pain': 'pain-grille' } },
    build: () => {
      const w = 0.24, d = 0.14, h = TOASTER_H;
      const body = 0xc8ccd0, dark = 0x2e3135;
      const g = group(
        box(w, h - 0.01, d, body, 0, (h - 0.01) / 2, 0),
        box(w - 0.01, 0.012, d - 0.01, body, 0, h - 0.006, 0),
        // la fente, sombre, et ses pieds
        box(0.15, 0.002, 0.08, dark, 0, h + 0.001, 0),
        box(w - 0.02, 0.01, d - 0.02, dark, 0, 0.005, 0),
        // bouton du minuteur
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 14).rotateZ(Math.PI / 2), dark, w / 2 + 0.006, 0.05, 0.03),
        glow(0.14, 0.004, 0.07, 0xff8a3a, 0, h + 0.003, 0),
      );
      // levier sur le côté : il descend quand le grille-pain tourne
      const lever = group(box(0.03, 0.012, 0.02, dark, w / 2 + 0.015, h - 0.04, -0.02));
      lever.name = 'levier';
      g.add(lever);
      return g;
    },
  },
  {
    id: 'mixeur',
    name: 'mixeur',
    portable: false,
    movable: false,
    durability: 200,
    fragility: 6,
    // les fruits vont dans le bol ; mixés, ils donnent du jus qu'on verse dans la tasse posée à côté
    holds: FRUITS,
    slots: [[0, MIXER_BASE + 0.02, 0], [0, MIXER_BASE + 0.09, 0]],
    blends: { seconds: 4 },
    pour: { at: [MIXER_CUP, 0, 0.02], fills: ['tasse', 'verre'], liquid: 'jus de fruits', seconds: 2.2, color: 0xe8b04a },
    build: () => {
      const dark = 0x2e3135;
      const r = 0.065, h = MIXER_JAR, y0 = MIXER_BASE;
      const jarMat = new THREE.MeshBasicMaterial({ color: 0xdff0f5, transparent: true, opacity: 0.28, depthWrite: false });
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 20, 1, true), jarMat);
      jar.position.set(0, y0 + h / 2, 0);
      const g = group(
        // socle et ses boutons
        box(0.15, y0, 0.15, dark, 0, y0 / 2, 0),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 14).rotateX(Math.PI / 2), 0xd0463a, -0.03, y0 / 2, 0.078),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 14).rotateX(Math.PI / 2), 0x9ea4aa, 0.03, y0 / 2, 0.078),
        // bol transparent, son fond, son couvercle, son bec côté tasse, sa poignée
        jar,
        mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.01, 20), 0xb9c6cc, 0, y0 + 0.005, 0),
        mesh(new THREE.CylinderGeometry(r + 0.005, r + 0.005, 0.02, 20), dark, 0, y0 + h + 0.01, 0),
        box(0.07, 0.015, 0.03, 0xdff0f5, r + 0.025, y0 + h - 0.01, 0.02),
        box(0.02, 0.12, 0.025, dark, -r - 0.015, y0 + h / 2, 0),
        glow(0.15, 0.01, 0.15, 0x9fd8ff, 0, y0 + 0.005, 0),
      );
      // le jus mixé dans le bol, caché tant qu'il est vide
      const juice = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.82, h * 0.55, 20), 0xe8b04a, 0, y0 + h * 0.28, 0);
      juice.name = 'liquide';
      juice.visible = false;
      g.add(juice);
      // jus qui coule du bec dans la tasse
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), toon(0xe8b04a));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(MIXER_CUP, y0 + h - 0.02, 0.02);
      g.add(jet);
      return g;
    },
  },
  {
    id: 'poubelle',
    name: 'poubelle',
    portable: false,
    movable: true,
    durability: 150,
    fragility: 8,
    // couvercle à charnière derrière, en haut : il se relève
    door: -THREE.MathUtils.degToRad(100),
    doorAxis: 'x',
    bin: 8,
    build: () => {
      const s = BIN_S, h = BIN_H, t = 0.012;
      const color = 0x5f8a6e;
      const g = group(
        box(s, 0.02, s, color, 0, 0.01, 0),
        box(t, h, s, color, -s / 2 + t / 2, h / 2, 0),
        box(t, h, s, color, s / 2 - t / 2, h / 2, 0),
        box(s, h, t, color, 0, h / 2, -s / 2 + t / 2),
        box(s, h, t, color, 0, h / 2, s / 2 - t / 2),
        // pédale
        box(0.12, 0.015, 0.06, 0x4a4d52, 0, 0.03, s / 2 + 0.03),
      );
      // sac et déchets : montent avec ce qu'on jette (Game.ts)
      const trash = box(s - 2 * t - 0.004, 1, s - 2 * t - 0.004, 0x3b3f3a, 0, 0, 0);
      trash.geometry.translate(0, 0.5, 0);
      trash.position.y = 0.02;
      trash.scale.y = 0.001;
      trash.visible = false;
      trash.name = 'dechets';
      g.add(trash);
      const lid = new THREE.Group();
      lid.name = 'porte';
      lid.position.set(0, h, -s / 2);
      lid.add(box(s + 0.01, 0.02, s + 0.01, 0x4f7a5e, 0, 0.01, s / 2));
      g.add(lid);
      return g;
    },
  },
];
