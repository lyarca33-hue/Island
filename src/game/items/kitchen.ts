/**
 * La cuisine : meubles de rangement (placard, tiroir), gros appareils (four, micro-ondes,
 * lave-vaisselle) et poubelle. Mêmes fiches que le reste du catalogue (catalog.ts) ; les portes,
 * le tiroir, la cuisson et le lavage sont joués par Game.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z, et font la hauteur du plan de travail (sauf le
 * micro-ondes, posé dessus, et la poubelle) : mis côte à côte, ils forment le plan de travail.
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

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

/** Lueur d'un appareil en marche (four, micro-ondes) : cachée au repos. */
function glow(w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  m.position.set(x, y, z);
  m.name = 'lumiere';
  m.visible = false;
  return m;
}

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

/**
 * Vaisselle qui se range au placard et passe au lave-vaisselle. Les assiettes, verres, bols…
 * viendront s'ajouter ici.
 */
export const DISHES = ['tasse'];
/** Petits objets qui vont dans le tiroir (les couverts viendront s'y ajouter). */
export const DRAWER_THINGS = ['lettre'];
/** Ce qui se met au four et au micro-ondes (les aliments à cuire viendront s'y ajouter). */
export const OVEN_FOOD = ['pomme', 'sandwich', 'pain', 'carotte', 'tomate', 'tranches de pain', 'rondelles de carotte'];

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
const CUP_SLOTS = CUP_SHELVES.flatMap((y) => [-0.18, 0, 0.18].map((x): [number, number, number] => [x, y, 0.04]));

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
    holds: [...DISHES, "bouteille d'eau", 'pomme', 'pain'],
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
    // au fond du tiroir, deux rangées de deux
    slots: [-0.11, 0.11].flatMap((x) => [-0.12, 0.08].map((z): [number, number, number] => [x, DRAWER_Y + 0.006, z])),
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
    slots: DW_RACKS.flatMap((y) => [-0.17, 0, 0.17].map((x): [number, number, number] => [x, y + 0.008, -0.02])),
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
    holds: OVEN_FOOD,
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
