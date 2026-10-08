/**
 * Le jardin, dehors autour de la maison : des arbres (feuillus et sapins), des buissons, une
 * bordure fleurie le long du salon, un chemin de pierres depuis la porte d'entrée, et ce dont on
 * se sert : le potager (on sème, on arrose, on désherbe, on récolte de vrais légumes de la
 * cuisine), le robinet du jardin et son arrosoir, le pommier (on y cueille des pommes), le massif
 * de fleurs (on les sent, on en cueille un bouquet) et le banc où l'on s'assoit.
 *
 * Tout suit les saisons : bourgeons et fleurs au printemps, pommes en été et en automne, feuilles
 * rousses puis branches nues et neige l'hiver, où la terre gelée ne pousse plus. Les légumes
 * poussent avec les heures du jeu, plus vite arrosés et désherbés.
 *
 * Les fiches des objets sont ici (ajoutées au catalogue) ; Game ne fait que brancher le jardin
 * (menu, clic, heures qui passent, saison) par l'interface GardenHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { ItemDef } from './items/catalog';
import type { WorldItem } from './items/carry';
import { createToonMaterial } from './toon';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.ColorRepresentation | THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat instanceof THREE.Material ? mat : toon(mat));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (parts.length) g.add(...parts);
  return g;
}

/** Pavé de `w` × `h` × `d` centré en (x, y, z). */
const box = (w: number, h: number, d: number, mat: THREE.ColorRepresentation | THREE.Material, x = 0, y = h / 2, z = 0, shadow = true) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);

/** Petit générateur pseudo-aléatoire déterministe (même jardin à chaque lancement). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ——— les objets du jardin ———

/** Potager surélevé : largeur (x), profondeur (z), hauteur des planches, dessus de la terre. */
const BED_W = 2.6;
const BED_D = 1.2;
const BED_H = 0.26;
const SOIL_Y = 0.21;
/** Les quatre carrés du potager, de gauche à droite (x, repère du potager). */
const PARCEL_X = [-0.975, -0.325, 0.325, 0.975];
/** Banc : hauteur de l'assise. */
const BENCH_SEAT = 0.455;
/** Arrosoir : contenance (litres) ; il faut tant de litres pour bien arroser le potager. */
const CAN_VOLUME = 1.6;
const BED_THIRST = 0.8;
/** Pommier : pommes au plus, et où elles pendent (sous le feuillage, à portée de main). */
const APPLES_MAX = 8;
/** Milieu de la couronne du pommier (m). */
const CROWN_Y = 2.15;
const APPLE_SPOTS: Array<[number, number, number]> = Array.from({ length: APPLES_MAX }, (_, i) => {
  const a = (i / APPLES_MAX) * Math.PI * 2 + 0.3;
  const r = 0.62 + (i % 3) * 0.06;
  return [Math.cos(a) * r, 1.5 + (i % 2) * 0.12, Math.sin(a) * r];
});
/** Massif de fleurs : nombre de fleurs, et combien en prend un bouquet. */
const FLOWERS = 18;
const BOUQUET = 5;
const FLOWER_COLORS = [0xe0475a, 0xf2c94c, 0xf6f1ea, 0x9b6fd1, 0xf08fb6, 0xf28c38];

/** Noms au féminin (accord des messages). */
export const GARDEN_FEMININE = ['carotte', 'tomate', 'pomme de terre'];

export const GARDEN_ITEMS: ItemDef[] = [
  {
    id: 'banc',
    name: 'banc',
    portable: false,
    movable: true,
    seat: BENCH_SEAT,
    fragility: 9,
    durability: 400,
    // lattes de bois sur des pieds en fonte, dossier incliné (dos vers -Z), accoudoirs
    build: () => {
      const wood = toon(0x9a6b42), iron = toon(0x2c2f33);
      const g = group();
      for (const z of [-0.13, 0, 0.13]) g.add(box(1.4, 0.035, 0.11, wood, 0, 0.4375, z));
      const back = new THREE.Group();
      back.position.set(0, 0.47, -0.2);
      back.rotation.x = -0.18;
      back.add(box(1.4, 0.09, 0.03, wood, 0, 0.16, 0), box(1.4, 0.09, 0.03, wood, 0, 0.31, 0));
      g.add(back);
      for (const x of [-0.62, 0.62]) {
        const out = x + Math.sign(x) * 0.035;
        g.add(box(0.04, 0.42, 0.04, iron, x, 0.21, 0.17), box(0.04, 0.42, 0.04, iron, x, 0.21, -0.17), box(0.04, 0.035, 0.4, iron, x, 0.4, 0));
        const post = box(0.04, 0.46, 0.04, iron, x, 0.66, -0.235);
        post.rotation.x = -0.18;
        g.add(post, box(0.05, 0.03, 0.42, iron, out, 0.64, -0.01), box(0.03, 0.2, 0.03, iron, out, 0.53, 0.18));
      }
      return g;
    },
  },
  {
    id: 'potager',
    name: 'potager',
    portable: false,
    fragility: 10,
    durability: 1000,
    // carré surélevé en planches, rempli de terre ; quatre carrés séparés, une étiquette chacun
    build: () => {
      const wood = toon(0x8a6440);
      const g = group(
        box(BED_W, BED_H, 0.05, wood, 0, BED_H / 2, BED_D / 2 - 0.025),
        box(BED_W, BED_H, 0.05, wood, 0, BED_H / 2, -BED_D / 2 + 0.025),
        box(0.05, BED_H, BED_D - 0.1, wood, BED_W / 2 - 0.025, BED_H / 2, 0),
        box(0.05, BED_H, BED_D - 0.1, wood, -BED_W / 2 + 0.025, BED_H / 2, 0),
      );
      const soil = box(BED_W - 0.1, SOIL_Y, BED_D - 0.1, 0x5b3d26, 0, SOIL_Y / 2, 0);
      soil.name = 'terre';
      g.add(soil);
      // sillons et séparations entre les carrés
      for (const x of [-0.65, 0, 0.65]) g.add(box(0.03, 0.03, BED_D - 0.1, wood, x, SOIL_Y + 0.005, 0));
      const tags = [0xe8853a, 0xd83a2e, 0xc9a66b, 0x5f9a3c];
      PARCEL_X.forEach((x, i) => {
        for (const z of [-0.25, 0.05, 0.35]) g.add(box(0.5, 0.008, 0.05, 0x4a311f, x, SOIL_Y + 0.002, z, false));
        // étiquette piquée devant le carré, une pastille de la couleur du légume
        g.add(box(0.012, 0.22, 0.012, 0xc9b48a, x + 0.22, SOIL_Y + 0.11, BED_D / 2 - 0.1));
        g.add(box(0.1, 0.07, 0.01, 0xefe3c4, x + 0.22, SOIL_Y + 0.22, BED_D / 2 - 0.1));
        g.add(mesh(new THREE.CircleGeometry(0.022, 12), tags[i], x + 0.22, SOIL_Y + 0.22, BED_D / 2 - 0.094, false));
      });
      return g;
    },
  },
  {
    id: 'robinet-jardin',
    name: 'robinet du jardin',
    portable: false,
    fragility: 9,
    durability: 400,
    // on y remplit l'arrosoir (posé sur la grille, sous le bec), une bouteille, une carafe…
    pour: { at: [0, 0.04, 0], fills: ['arrosoir', 'tasse', 'verre', 'carafe', 'casserole', "bouteille d'eau"], liquid: 'eau', seconds: 3, color: 0x9fcde6, drain: true },
    build: () => {
      const steel = toon(0x9aa3ab), stone = toon(0x8d8f8a);
      const g = group(
        // grille de pierre au pied, le poteau de bois, le tuyau qui monte, le bras et le bec au-dessus de la grille
        box(0.5, 0.04, 0.46, stone, 0, 0.02, 0),
        box(0.09, 0.8, 0.09, 0x7a5636, -0.2, 0.4, 0),
        mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.64, 10), steel, -0.145, 0.32, 0),
        mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10).rotateZ(Math.PI / 2), steel, -0.07, 0.64, 0),
        mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.07, 10), steel, 0, 0.61, 0),
        // la manette rouge
        mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16).rotateX(Math.PI / 2), 0xc0392b, -0.08, 0.69, 0),
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), steel, -0.08, 0.67, 0),
      );
      const jet = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 8), 0x9fd3ef, 0, 0.575, 0, false);
      jet.name = 'jet';
      jet.visible = false;
      g.add(jet);
      return g;
    },
  },
  {
    id: 'arrosoir',
    name: 'arrosoir',
    portable: true,
    // tenu par l'anse du dos (+Z), on arrose par le bec (vers -Z) ; on ne boit pas dedans
    grip: 'fist',
    gripPoint: [0, 0.2, 0.15],
    mouth: [0, 0.29, -0.3],
    jug: true,
    fill: [0.01, 0.2],
    volume: CAN_VOLUME,
    fragility: 9,
    durability: 200,
    build: () => {
      const metal = toon(0x4f8a5b);
      const body = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 20), metal, 0, 0.11, 0);
      const rim = mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20).rotateX(Math.PI / 2), 0x3f7049, 0, 0.22, 0);
      // le bec, de bas en haut vers l'avant, et sa pomme d'arrosage
      const spout = mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.3, 10), metal, 0, 0.165, -0.185);
      spout.rotation.x = -0.74;
      const rose = mesh(new THREE.CylinderGeometry(0.035, 0.016, 0.04, 12), 0x3f7049, 0, 0.28, -0.29);
      rose.rotation.x = -0.74;
      // l'anse du dos, et l'anse du dessus
      const back = mesh(new THREE.TorusGeometry(0.065, 0.011, 8, 16, Math.PI), metal, 0, 0.14, 0.1);
      back.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      const top = mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 16, Math.PI), metal, 0, 0.22, 0);
      top.rotation.y = Math.PI / 2;
      const water = mesh(new THREE.CylinderGeometry(0.094, 0.094, 1, 20).translate(0, 0.5, 0), 0x9fcde6, 0, 0.01, 0, false);
      water.name = 'liquide';
      water.userData.column = true;
      water.scale.y = 0.001;
      return group(water, body, rim, spout, rose, back, top);
    },
  },
  {
    id: 'pommier',
    name: 'pommier',
    portable: false,
    fragility: 10,
    durability: 2000,
    // tronc, branches, feuillage (pièce `feuillage`), fleurs du printemps (`fleurs`), pommes (`pommes`)
    build: () => {
      const bark = toon(0x6b4a2e);
      const g = group(mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.6, 10), bark, 0, 0.8, 0));
      for (const [a, tilt] of [[0, 0.7], [2.1, 0.6], [4.2, 0.75]]) {
        const b = mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.9, 8), bark, 0, 0, 0);
        b.geometry.translate(0, 0.45, 0);
        b.position.set(0, 1.35, 0);
        b.rotation.set(tilt * Math.cos(a), 0, tilt * Math.sin(a), 'YXZ');
        g.add(b);
      }
      const leaves = toon(0x4d8a36);
      // la couronne grandit et rapetisse autour de son milieu (feuilles au printemps, nue l'hiver)
      const crown = group();
      crown.name = 'feuillage';
      crown.position.y = CROWN_Y;
      for (const [x, y, z, r] of [[0, 2.15, 0, 0.85], [0.5, 1.95, 0.2, 0.55], [-0.45, 2.0, -0.25, 0.6], [0.1, 2.05, -0.5, 0.55], [-0.2, 1.95, 0.5, 0.55], [0.15, 2.6, 0.05, 0.55]]) {
        crown.add(mesh(new THREE.IcosahedronGeometry(r, 1), leaves, x, y - CROWN_Y, z));
      }
      const blossoms = group();
      blossoms.name = 'fleurs';
      const rand = rng(11);
      const petal = toon(0xfbe3ee);
      for (let i = 0; i < 40; i++) {
        const a = rand() * Math.PI * 2, e = rand() * 1.1 - 0.2;
        const r = 0.82 + rand() * 0.12;
        blossoms.add(mesh(new THREE.IcosahedronGeometry(0.065, 0), petal, Math.cos(a) * Math.cos(e) * r, 2.15 - CROWN_Y + Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r, false));
      }
      crown.add(blossoms);
      const apples = group();
      apples.name = 'pommes';
      const red = toon(0xc0392b), stem = toon(0x6b4a2b);
      for (const [x, y, z] of APPLE_SPOTS) {
        apples.add(group(
          mesh(new THREE.SphereGeometry(0.038, 12, 9), red, 0, -0.04, 0),
          mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 5), stem, 0, 0.0, 0, false),
        ));
        apples.children[apples.children.length - 1].position.set(x, y + 0.04, z);
      }
      g.add(crown, apples);
      return g;
    },
  },
  {
    id: 'massif-fleurs',
    name: 'massif de fleurs',
    portable: false,
    fragility: 10,
    durability: 1000,
    // bordure de pierres, terre, et les fleurs (pièce `fleurs`, une fleur par enfant)
    build: () => {
      const stone = toon(0x9a9790);
      const g = group(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 24), 0x5b3d26, 0, 0.03, 0));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const s = mesh(new THREE.DodecahedronGeometry(0.075, 0), stone, Math.cos(a) * 0.64, 0.05, Math.sin(a) * 0.64);
        s.scale.set(1.2, 0.8, 1);
        s.rotation.y = -a;
        g.add(s);
      }
      const flowers = group();
      flowers.name = 'fleurs';
      const rand = rng(5);
      const green = toon(0x4f8a3c);
      for (let i = 0; i < FLOWERS; i++) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.48;
        const h = 0.22 + rand() * 0.16;
        const f = group(
          mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 5), green, 0, h / 2, 0, false),
          mesh(new THREE.SphereGeometry(0.04, 7, 5).scale(1, 0.55, 1), green, 0.03, h * 0.35, 0, false),
          mesh(new THREE.IcosahedronGeometry(0.045, 0), FLOWER_COLORS[i % FLOWER_COLORS.length], 0, h, 0),
          mesh(new THREE.SphereGeometry(0.018, 6, 5), 0xf6d55c, 0, h + 0.03, 0, false),
        );
        f.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
        f.rotation.y = rand() * Math.PI;
        flowers.add(f);
      }
      g.add(flowers);
      return g;
    },
  },
  {
    id: 'bouquet',
    name: 'bouquet de fleurs',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.09, 0],
    fragility: 8,
    durability: 30,
    breakWord: 'abîmé',
    // posé debout : les tiges serrées dans un cornet de papier kraft, les fleurs en haut
    build: () => {
      const green = toon(0x4f8a3c);
      const g = group(mesh(new THREE.CylinderGeometry(0.05, 0.022, 0.16, 12, 1, true), 0xc9a66b, 0, 0.1, 0));
      (g.children[0] as THREE.Mesh).material = Object.assign(toon(0xc9a66b), { side: THREE.DoubleSide });
      for (let i = 0; i < BOUQUET; i++) {
        const a = (i / BOUQUET) * Math.PI * 2;
        const x = Math.cos(a) * 0.03, z = Math.sin(a) * 0.03;
        g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 5), green, x * 0.6, 0.12, z * 0.6, false));
        g.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), FLOWER_COLORS[(i * 2) % FLOWER_COLORS.length], x, 0.25 + (i % 2) * 0.02, z));
      }
      return g;
    },
  },
];

/** Objets du jardin posés au départ : [id, x, y, z, rotation (rad)]. */
export const GARDEN_START: Array<[string, number, number, number, number]> = [
  ['potager', -0.4, 0, 6.2, 0],
  ['robinet-jardin', -2.55, 0, 6.15, 0],
  ['arrosoir', -2.05, 0, 6.65, -0.6],
  ['banc', -4.5, 0, 7.3, 0.25],
  ['pommier', -6.3, 0, 7.9, 0.4],
  ['massif-fleurs', -5.7, 0, 4.7, 0],
];

// ——— les légumes du potager ———

interface Crop {
  /** Fiche de l'aliment récolté (catalogue de la cuisine). */
  id: string;
  name: string;
  plural: string;
  feminine: boolean;
  /** Heures de jeu pour mûrir (arrosé, désherbé), et nombre de légumes récoltés. */
  hours: number;
  yield: number;
}

const CROPS: Crop[] = [
  { id: 'carotte', name: 'carotte', plural: 'carottes', feminine: true, hours: 30, yield: 4 },
  { id: 'tomate', name: 'tomate', plural: 'tomates', feminine: true, hours: 40, yield: 4 },
  { id: 'pomme-de-terre', name: 'pomme de terre', plural: 'pommes de terre', feminine: true, hours: 36, yield: 3 },
  { id: 'concombre', name: 'concombre', plural: 'concombres', feminine: false, hours: 32, yield: 3 },
];

/** Un carré du potager : son légume, sa pousse (0 à 1, null pas semé), les légumes mûrs qui restent. */
interface Parcel {
  crop: Crop;
  stage: number | null;
  left: number;
  /** Le modèle : la plante (grandit avec la pousse) et les légumes mûrs (un par légume). */
  plant: THREE.Group;
  grow: THREE.Group;
  fruits: THREE.Object3D[];
}

/** La plante d'un carré : feuillage qui grandit, légumes montrés une fois mûrs. */
function cropModel(crop: Crop, x: number): { plant: THREE.Group; grow: THREE.Group; fruits: THREE.Object3D[] } {
  const leaf = toon(crop.id === 'pomme-de-terre' ? 0x5c8f3a : 0x4f9a3c);
  const grow = group();
  const fruits: THREE.Object3D[] = [];
  const spots: Array<[number, number]> = [[-0.12, -0.25], [0.12, -0.25], [-0.12, 0.05], [0.12, 0.05], [-0.12, 0.35], [0.12, 0.35]];
  if (crop.id === 'carotte') {
    const orange = toon(0xe8853a);
    for (const [px, pz] of spots.slice(0, 6)) {
      // fanes en plumeau
      for (let k = 0; k < 3; k++) {
        const f = mesh(new THREE.ConeGeometry(0.02, 0.2, 5), leaf, px + (k - 1) * 0.02, 0.1, pz, false);
        f.rotation.z = (k - 1) * 0.35;
        grow.add(f);
      }
    }
    for (const [px, pz] of spots.slice(0, crop.yield)) {
      const top = mesh(new THREE.ConeGeometry(0.03, 0.07, 8).rotateX(Math.PI), orange, px, 0.01, pz, false);
      fruits.push(top);
    }
  } else if (crop.id === 'tomate') {
    const stake = toon(0xb08a5a), red = toon(0xd83a2e);
    for (const pz of [-0.18, 0.22]) {
      grow.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.75, 6), stake, 0, 0.375, pz, false));
      for (const [dy, dx, r] of [[0.18, 0.05, 0.11], [0.36, -0.05, 0.12], [0.55, 0.04, 0.1]]) grow.add(mesh(new THREE.IcosahedronGeometry(r, 0), leaf, dx, dy, pz));
    }
    for (const [dx, dy, pz] of [[0.1, 0.3, -0.15], [-0.1, 0.45, -0.2], [0.1, 0.42, 0.25], [-0.1, 0.28, 0.2]]) fruits.push(mesh(new THREE.SphereGeometry(0.04, 10, 8), red, dx, dy, pz));
  } else if (crop.id === 'pomme-de-terre') {
    const brown = toon(0xc9a66b), bloom = toon(0xf3eef6);
    for (const pz of [-0.25, 0.05, 0.35]) {
      const bush = mesh(new THREE.IcosahedronGeometry(0.15, 1), leaf, 0, 0.12, pz);
      bush.scale.y = 0.75;
      grow.add(bush, mesh(new THREE.IcosahedronGeometry(0.025, 0), bloom, 0.05, 0.24, pz, false));
    }
    for (const [dx, pz] of [[-0.17, -0.15], [0.17, 0.0], [-0.17, 0.25]]) fruits.push(mesh(new THREE.SphereGeometry(0.04, 9, 7).scale(1.2, 0.9, 1), brown, dx, 0.015, pz));
  } else {
    const green = toon(0x3f7a2c);
    for (const [px, pz] of spots) {
      const l = mesh(new THREE.SphereGeometry(0.09, 8, 6).scale(1, 0.3, 1), leaf, px, 0.04, pz);
      grow.add(l);
    }
    for (const [dx, pz] of [[-0.05, -0.12], [0.08, 0.15], [-0.08, 0.38]]) {
      const c = mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8).rotateZ(Math.PI / 2), green, dx, 0.03, pz);
      c.rotation.y = 0.5;
      fruits.push(c);
    }
  }
  const plant = group(grow, ...fruits);
  plant.position.set(x, SOIL_Y, 0);
  return { plant, grow, fruits };
}

// ——— le décor : arbres, sapins, buissons, chemin, bordure fleurie ———

/** Feuillus et sapins autour de la maison (loin du côté de la caméra, pour ne pas cacher le perso). */
const OAKS: Array<[number, number, number]> = [[-9.8, 10, 1.1], [-9.5, -1.5, 1.25], [11.5, 5.5, 1.2], [12, -4.5, 1.0], [-6.5, -10, 1.15], [2.5, -13, 1.3], [-12.5, 12, 1.0]];
const PINES: Array<[number, number, number]> = [[-11.5, 3.2, 1.1], [-7.5, -6, 1.0], [14, 0.5, 1.2], [-2, -14, 1.1], [9.5, -12.5, 1.0], [-14, -8, 1.25]];
const BUSHES: Array<[number, number, number]> = [[9.3, 2.3, 0.45], [9.4, -1.0, 0.5], [-3.85, -0.9, 0.4], [-3.9, -2.1, 0.45], [-7.4, 5.4, 0.35]];
/** Chemin de pierres plates : de la porte d'entrée jusqu'au potager, au banc et au pommier. */
const PATH: Array<[number, number]> = [
  [-3.75, 1.8], [-4.3, 2.05], [-4.6, 2.6], [-4.55, 3.2], [-4.3, 3.75], [-3.85, 4.2], [-3.3, 4.55], [-2.7, 4.8],
  [-2.05, 4.95], [-1.4, 5.0], [-0.75, 5.0], [-0.1, 4.95], [0.55, 4.85], [-4.45, 4.45], [-4.5, 5.05], [-4.6, 5.6], [-4.55, 6.2],
];
/** Bordure fleurie au pied du mur sud du salon (x de 3.7 à 8.4). */
const BORDER = { x0: 3.7, x1: 8.4, z: 3.3, d: 0.38 };

/** Mélange les valeurs des quatre saisons à la position `yearPos` de l'année (comme seasonLook). */
function seasonWeights(yearPos: number): [number, number, number, number] {
  const f = (((yearPos * 4 - 0.5) % 4) + 4) % 4;
  const i = Math.floor(f);
  const t = THREE.MathUtils.smoothstep(f - i, 0.35, 0.65);
  const w: [number, number, number, number] = [0, 0, 0, 0];
  w[i] += 1 - t;
  w[(i + 1) % 4] += t;
  return w;
}
const mixN = (w: number[], v: number[]) => w.reduce((s, k, i) => s + k * v[i], 0);
function mixColor(w: number[], v: number[], out: THREE.Color): THREE.Color {
  const c = new THREE.Color();
  out.setRGB(0, 0, 0);
  v.forEach((hex, i) => out.add(c.set(hex).multiplyScalar(w[i])));
  return out;
}

/** Feuillage des feuillus selon la saison : tendre, vert, roux, (rien). Part de feuilles. */
const LEAF_COLOR = [0x8ccf5e, 0x4d8a36, 0xd8812c, 0x8a6a4a];
const LEAFINESS = [0.9, 1, 0.8, 0];
/** Fleurs : pleines au printemps et l'été, quelques-unes l'automne, aucune l'hiver. */
const BLOOM = [1, 1, 0.35, 0];
/** Pommes : vertes l'été, rouges l'automne (et celles de l'an dernier, au printemps). */
const APPLE_COLOR = [0xc0392b, 0x9cbf3a, 0xc0392b, 0xc0392b];

/** Ce dont le jardin a besoin de Game. */
export interface GardenHost {
  readonly character: Character;
  /** Fait apparaître l'objet `id` posé en `at` (monde), tourné de `yaw`. */
  spawn(id: string, at: THREE.Vector3, yaw: number): WorldItem | null;
  notice(text: string): void;
  say(text: string): void;
  mood(n: number): void;
  /** La terre salit les mains (à laver au savon avant de cuisiner). */
  soilHands(why: string): void;
  /** Verse le récipient tenu `can` au-dessus de `at()` (rien dessous), en se plaçant en `stand`. */
  pour(can: WorldItem, at: () => THREE.Vector3, stand: THREE.Vector3): boolean;
  pouring(): boolean;
  /** Le siège où le perso est assis. */
  sitting(): WorldItem | null;
}

export class Garden {
  /** Le décor (arbres, buissons, chemin, bordure fleurie), à ajouter à la scène. */
  readonly group = new THREE.Group();
  /** Ce qui bloque le passage dans le décor : troncs, sapins, buissons, bordure. */
  readonly obstacles: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number }> = [];

  private host: GardenHost;
  private bed: WorldItem | null = null;
  private tree: WorldItem | null = null;
  private beds = new Map<WorldItem, number>();
  private parcels: Parcel[] = [];
  /** Humidité de la terre du potager (0 sec à 1 bien arrosé), mauvaises herbes (0 à 1). */
  private water = 0.6;
  private weeds = 0.35;
  private weedTufts: THREE.Object3D[] = [];
  /** Humidité et mauvaises herbes montrées (arrondies) : le potager ne se redessine que si elles changent. */
  private shownKey = '';
  /** Pommes sur l'arbre (au départ, quelques-unes de l'an dernier restent accrochées). */
  private apples = 4;
  private season = 0;
  /** Arrosage en cours : l'arrosoir, son niveau avant, si l'eau a commencé à couler, temps d'attente. */
  private watering: { can: WorldItem; before: number; started: boolean; t: number } | null = null;
  private benchAcc = 0;
  private onBench = false;
  /** Heures de jeu depuis qu'on a senti les fleurs. */
  private smelled = 99;

  private oakLeaves = toon(LEAF_COLOR[1]);
  private pineLeaves = toon(0x2f6a3e);
  private oakCrowns: THREE.Object3D[] = [];
  private borderFlowers: THREE.InstancedMesh;
  private borderBase: THREE.Matrix4[] = [];
  private lastLook = { yearPos: -1, snow: -1 };

  constructor(host: GardenHost) {
    this.host = host;
    this.group.name = 'jardin';
    const bark = toon(0x6b4a2e);
    const add = (o: THREE.Object3D, x: number, z: number, half: number, h = 2) => {
      this.group.add(o);
      this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, h, half)), pos: new THREE.Vector3(x, 0, z), yaw: 0 });
    };
    // feuillus : tronc, trois branches (visibles l'hiver, nues), couronne de feuilles
    const rand = rng(3);
    for (const [x, z, s] of OAKS) {
      const t = group(mesh(new THREE.CylinderGeometry(0.13, 0.2, 2.0, 10), bark, 0, 1.0, 0));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + rand();
        const b = mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.1, 7), bark);
        b.geometry.translate(0, 0.55, 0);
        b.position.set(0, 1.7, 0);
        b.rotation.set(0.75 * Math.cos(a), 0, 0.75 * Math.sin(a), 'YXZ');
        t.add(b);
      }
      const crown = group();
      crown.position.y = 2.9;
      for (let k = 0; k < 6; k++) {
        const a = rand() * Math.PI * 2, r = k === 0 ? 0 : 0.6 + rand() * 0.4;
        crown.add(mesh(new THREE.IcosahedronGeometry(k === 0 ? 1.15 : 0.7 + rand() * 0.25, 1), this.oakLeaves, Math.cos(a) * r, k === 0 ? 0 : rand() * 0.8 - 0.4, Math.sin(a) * r));
      }
      t.add(crown);
      this.oakCrowns.push(crown);
      t.scale.setScalar(s);
      t.position.set(x, 0, z);
      t.rotation.y = rand() * Math.PI;
      add(t, x, z, 0.25 * s);
    }
    // sapins : trois cônes empilés, verts toute l'année (blanchis par la neige)
    for (const [x, z, s] of PINES) {
      const t = group(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 8), bark, 0, 0.4, 0));
      for (const [y, r, h] of [[1.3, 1.1, 1.5], [2.1, 0.85, 1.3], [2.8, 0.55, 1.1]]) t.add(mesh(new THREE.ConeGeometry(r, h, 9), this.pineLeaves, 0, y, 0));
      t.scale.setScalar(s);
      t.position.set(x, 0, z);
      add(t, x, z, 0.6 * s);
    }
    // buissons ronds, toujours verts
    const bush = toon(0x3d7a3a);
    for (const [x, z, r] of BUSHES) {
      const b = group(mesh(new THREE.IcosahedronGeometry(r, 1), bush, 0, r * 0.8, 0), mesh(new THREE.IcosahedronGeometry(r * 0.7, 1), bush, r * 0.6, r * 0.6, r * 0.2));
      b.position.set(x, 0, z);
      add(b, x, z, r * 0.9, r * 1.6);
    }
    // chemin de pierres plates
    const stone = toon(0xa4a29b);
    PATH.forEach(([x, z], i) => {
      const s = mesh(new THREE.CylinderGeometry(0.22 + (i % 3) * 0.03, 0.24, 0.03, 9), stone, x, 0.012, z, false);
      s.rotation.y = i * 1.3;
      s.scale.z = 0.8 + (i % 2) * 0.15;
      this.group.add(s);
    });
    // bordure fleurie au pied du salon : terre, petite bordure de bois, fleurs (instanciées)
    const len = BORDER.x1 - BORDER.x0, cx = (BORDER.x0 + BORDER.x1) / 2;
    this.group.add(box(len, 0.05, BORDER.d, 0x5b3d26, cx, 0.025, BORDER.z), box(len, 0.08, 0.03, 0x8a6440, cx, 0.04, BORDER.z + BORDER.d / 2));
    this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-len / 2, 0, -BORDER.d / 2), new THREE.Vector3(len / 2, 0.5, BORDER.d / 2)), pos: new THREE.Vector3(cx, 0, BORDER.z), yaw: 0 });
    const n = 44;
    this.borderFlowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), toon(0xffffff), n);
    this.borderFlowers.castShadow = true;
    const stems = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.28, 5), toon(0x4f8a3c), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = BORDER.x0 + 0.08 + rand() * (len - 0.16), z = BORDER.z + (rand() - 0.5) * (BORDER.d - 0.1), h = 0.22 + rand() * 0.16;
      stems.setMatrixAt(i, m.makeTranslation(x, 0.14, z));
      const base = new THREE.Matrix4().makeTranslation(x, h, z);
      this.borderBase.push(base);
      this.borderFlowers.setMatrixAt(i, base);
      this.borderFlowers.setColorAt(i, new THREE.Color(FLOWER_COLORS[i % FLOWER_COLORS.length]));
    }
    this.group.add(stems, this.borderFlowers);
  }

  /** Branche les objets du jardin posés dans la scène (potager, pommier, massifs). */
  attach(items: WorldItem[]): void {
    this.bed = items.find((i) => i.def.id === 'potager') ?? null;
    this.tree = items.find((i) => i.def.id === 'pommier') ?? null;
    for (const m of items.filter((i) => i.def.id === 'massif-fleurs')) this.beds.set(m, 0);
    if (this.bed) {
      // au départ : les carottes et les tomates sont mûres, les pommes de terre poussent, les concombres sont à semer
      const start: Array<number | null> = [1, 1, 0.5, null];
      this.parcels = CROPS.map((crop, i) => {
        const model = cropModel(crop, PARCEL_X[i]);
        this.bed!.object.add(model.plant);
        const stage = start[i];
        return { crop, stage, left: stage === 1 ? crop.yield : 0, ...model };
      });
      const rand = rng(9);
      for (let i = 0; i < 9; i++) {
        const tuft = group();
        for (let k = 0; k < 4; k++) {
          const b = mesh(new THREE.ConeGeometry(0.012, 0.09, 4), 0x7a9a3a, (k - 1.5) * 0.012, 0.045, 0, false);
          b.rotation.z = (k - 1.5) * 0.3;
          tuft.add(b);
        }
        tuft.position.set((rand() - 0.5) * (BED_W - 0.25), SOIL_Y, (rand() - 0.5) * (BED_D - 0.25));
        this.bed.object.add(tuft);
        this.weedTufts.push(tuft);
      }
      this.showBed();
    }
    this.showApples();
  }

  /** Objet du jardin dont Game laisse le clic au jardin. */
  owns(item: WorldItem): boolean {
    return item === this.bed || item === this.tree || this.beds.has(item);
  }

  /** Ce qui bloque le passage d'un objet du jardin : le pommier, son tronc seulement (on passe sous les branches). */
  navBox(item: WorldItem): THREE.Box3 | null {
    if (item !== this.tree) return null;
    return new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 2, 0.2));
  }

  // ——— les heures qui passent ———

  /** `hours` de jeu passent ; `season` : 0 printemps, 1 été, 2 automne, 3 hiver. */
  tick(hours: number, season: number): void {
    if (hours <= 0) return;
    this.season = season;
    const winter = season === 3;
    this.smelled += hours;
    // la terre sèche en un jour (moins vite l'hiver), les mauvaises herbes poussent sauf l'hiver
    this.water = Math.max(0, this.water - hours / (winter ? 72 : 24));
    if (!winter) this.weeds = Math.min(1, this.weeds + hours / 40);
    let changed = false;
    for (const p of this.parcels) {
      if (p.stage === null || p.stage >= 1 || winter || this.water <= 0) continue;
      p.stage = Math.min(1, p.stage + (hours / p.crop.hours) * (this.weeds > 0.6 ? 0.5 : 1));
      if (p.stage >= 1) {
        p.left = p.crop.yield;
        this.host.notice(`Les ${p.crop.plural} sont mûr${p.crop.feminine ? 'e' : ''}s au potager.`);
      }
      changed = true;
    }
    const key = `${this.water.toFixed(2)}|${this.weeds.toFixed(2)}`;
    if (changed || key !== this.shownKey) {
      this.shownKey = key;
      this.showBed();
    }
    // pommes : elles poussent l'été et l'automne, tombent l'hiver ; au printemps, le pommier fleurit
    const before = Math.floor(this.apples);
    if (season === 1 || season === 2) this.apples = Math.min(APPLES_MAX, this.apples + hours / 6);
    else if (winter) this.apples = 0;
    if (Math.floor(this.apples) !== before) this.showApples();
    // le massif de fleurs repousse (une fleur toutes les quatre heures), sauf l'hiver
    for (const [m, picked] of this.beds) {
      if (!picked || winter) continue;
      const next = Math.max(0, picked - hours / 4);
      this.beds.set(m, next);
      if (Math.ceil(next) !== Math.ceil(picked)) this.showFlowers(m);
    }
    // sur le banc, au grand air : l'humeur monte doucement
    const bench = this.host.sitting()?.def.id === 'banc';
    if (bench && !this.onBench) this.host.say(winter ? 'Il fait frais, mais on est bien dehors.' : 'Qu’il fait bon dans le jardin…');
    this.onBench = bench;
    if (bench) {
      this.benchAcc += hours * 6;
      if (this.benchAcc >= 1) {
        this.host.mood(Math.floor(this.benchAcc));
        this.benchAcc %= 1;
      }
    }
  }

  /** La pluie (0 à 1) arrose le potager : deux heures de jeu d'averse le trempent. */
  rain(amount: number, hours: number): void {
    if (amount <= 0 || hours <= 0 || this.season === 3) return;
    this.water = Math.min(1, this.water + (amount * hours) / 2);
  }

  /** À chaque image : la saison (feuillage, fleurs, neige), et l'arrosage en cours. */
  update(dt: number, yearPos: number, snow: number): void {
    this.tickWatering(dt);
    const last = this.lastLook;
    if (Math.abs(yearPos - last.yearPos) < 0.0004 && Math.abs(snow - last.snow) < 0.01) return;
    last.yearPos = yearPos;
    last.snow = snow;
    const w = seasonWeights(yearPos);
    mixColor(w, LEAF_COLOR, this.oakLeaves.color);
    const leafy = mixN(w, LEAFINESS);
    for (const c of this.oakCrowns) {
      c.visible = leafy > 0.03;
      c.scale.setScalar(Math.max(0.03, leafy));
    }
    // les sapins blanchissent sous la neige
    this.pineLeaves.color.set(0x2f6a3e).lerp(new THREE.Color(0xe8eef4), snow * 0.55);
    // la bordure fleurie : les fleurs s'ouvrent et se fanent
    const bloom = mixN(w, BLOOM);
    const m = new THREE.Matrix4();
    this.borderBase.forEach((base, i) => {
      // les dernières fleurs de l'automne : une sur trois
      const s = bloom >= 0.99 || i % 3 === 0 ? bloom : Math.max(0, bloom * 2 - 1);
      this.borderFlowers.setMatrixAt(i, m.copy(base).multiply(new THREE.Matrix4().makeScale(Math.max(0.001, s), Math.max(0.001, s), Math.max(0.001, s))));
    });
    this.borderFlowers.instanceMatrix.needsUpdate = true;
    this.borderFlowers.visible = bloom > 0.02;
    for (const m of this.beds.keys()) this.showFlowers(m);
    // le pommier : feuilles, fleurs du printemps, couleur des pommes
    if (this.tree) {
      const crown = this.tree.object.getObjectByName('feuillage');
      if (crown) {
        crown.visible = leafy > 0.03;
        crown.scale.setScalar(Math.max(0.03, leafy));
        crown.traverse((o) => {
          if (o instanceof THREE.Mesh) mixColor(w, LEAF_COLOR, (o.material as THREE.MeshToonMaterial).color);
        });
      }
      const blossoms = this.tree.object.getObjectByName('fleurs');
      if (blossoms) blossoms.visible = w[0] > 0.3;
      const apples = this.tree.object.getObjectByName('pommes');
      const fruit = apples?.children[0]?.children[0] as THREE.Mesh | undefined;
      if (fruit) mixColor(w, APPLE_COLOR, (fruit.material as THREE.MeshToonMaterial).color);
    }
  }

  // ——— ce qu'on y fait ———

  /** Les actions du menu (clic droit) sur un objet du jardin. */
  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    if (item === this.bed) {
      if (this.canOf()) add('Arroser le potager', () => this.waterBed(false));
      this.parcels.forEach((p, i) => {
        if (p.stage !== null && p.stage >= 1 && p.left > 0) add(`Récolter ${p.crop.feminine ? 'une' : 'un'} ${p.crop.name} (${p.left})`, () => this.harvest(i, false));
      });
      this.parcels.forEach((p, i) => {
        if (p.stage === null) add(`Semer des ${p.crop.plural}`, () => this.sow(i, false));
      });
      if (this.weeds > 0.25) add('Désherber', () => this.weed(false));
    } else if (item === this.tree) {
      if (this.apples >= 1) add('Cueillir une pomme', () => this.pickApple(false));
    } else if (this.beds.has(item)) {
      if (this.blooming(item) > 0) add('Sentir les fleurs', () => this.smell(item, false));
      if (this.blooming(item) >= BOUQUET) add('Cueillir un bouquet', () => this.pickBouquet(item, false));
    }
  }

  /** Clic sur un objet du jardin : ce qu'il y a de plus utile à y faire. */
  click(item: WorldItem, running: boolean): boolean {
    if (item === this.bed) {
      if (this.canOf() && this.water < 0.9) return this.waterBed(running);
      const ripe = this.nearestParcel((p) => p.stage !== null && p.stage >= 1 && p.left > 0);
      if (ripe >= 0) return this.harvest(ripe, running);
      if (this.weeds > 0.5) return this.weed(running);
      const empty = this.parcels.findIndex((p) => p.stage === null);
      if (empty >= 0 && this.season !== 3) return this.sow(empty, running);
      return this.tell(this.season === 3 ? 'La terre est gelée : le potager se repose jusqu’au printemps.' : this.water < 0.3 ? 'La terre est sèche : remplis l’arrosoir au robinet du jardin et arrose le potager.' : 'Les légumes poussent. Il n’y a rien à récolter pour l’instant.');
    }
    if (item === this.tree) {
      if (this.apples >= 1) return this.pickApple(running);
      return this.tell(['Le pommier est en fleurs : les pommes viendront l’été.', 'Les pommes ne sont pas encore prêtes.', 'Il n’y a plus de pommes à cueillir.', 'Pas de pommes l’hiver.'][this.season]);
    }
    if (this.beds.has(item)) {
      if (this.blooming(item) > 0) return this.smell(item, running);
      return this.tell('Les fleurs sont fanées : elles repousseront au printemps.');
    }
    return false;
  }

  /** État visible pour l'infobulle (null : pas un objet du jardin). */
  stateOf(item: WorldItem): string | null {
    if (item === this.bed) {
      const words = this.parcels.map((p) => {
        if (p.stage === null) return `${p.crop.plural} à semer`;
        if (p.stage >= 1) return p.left ? `${p.left} ${p.left > 1 ? p.crop.plural : p.crop.name} prêt${p.crop.feminine ? 'e' : ''}${p.left > 1 ? 's' : ''}` : `${p.crop.plural} récolté${p.crop.feminine ? 'e' : ''}s`;
        return `${p.crop.plural} ${Math.round(p.stage * 100)} %`;
      });
      words.push(this.season === 3 ? 'terre gelée' : this.water <= 0 ? 'terre sèche' : this.water < 0.35 ? 'à arroser' : 'terre humide');
      if (this.weeds > 0.4) words.push('mauvaises herbes');
      return words.join(', ');
    }
    if (item === this.tree) {
      const n = Math.floor(this.apples);
      if (n) return `${n} pomme${n > 1 ? 's' : ''}`;
      return ['en fleurs', 'les pommes grossissent', 'plus de pommes', 'branches nues'][this.season];
    }
    if (this.beds.has(item)) {
      const n = this.blooming(item);
      return n ? `${n} fleur${n > 1 ? 's' : ''}` : 'fané';
    }
    return null;
  }

  private tell(text: string): boolean {
    this.host.notice(text);
    return false;
  }

  /** Le perso peut-il aller faire quelque chose de ses mains ? Sinon dit pourquoi. */
  private ready(again: () => boolean): boolean | null {
    const c = this.host.character;
    if (!c.canCarry) return this.tell('Crée un perso pour jardiner.');
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void again());
    return null;
  }

  /** L'arrosoir tenu, avec de l'eau. */
  private canOf(): WorldItem | undefined {
    return this.host.character.heldItems.find((h) => h.def.id === 'arrosoir' && h.contents === 'eau' && h.level > 0.02);
  }

  /** Le carré (selon `ok`) le plus proche du perso, -1 s'il n'y en a pas. */
  private nearestParcel(ok: (p: Parcel) => boolean): number {
    if (!this.bed) return -1;
    const at = this.host.character.position;
    let best = -1, d = Infinity;
    this.parcels.forEach((p, i) => {
      if (!ok(p)) return;
      const dd = this.parcelWorld(i).distanceTo(at);
      if (dd < d) [best, d] = [i, dd];
    });
    return best;
  }

  private parcelWorld(i: number, y = SOIL_Y, z = 0): THREE.Vector3 {
    this.bed!.object.updateMatrixWorld(true);
    return this.bed!.object.localToWorld(new THREE.Vector3(PARCEL_X[i], y, z));
  }

  /** Où se tenir devant le carré `i` (côté avant du potager). */
  private parcelStand(i: number): THREE.Vector3 {
    return this.parcelWorld(i, 0, BED_D / 2 + 0.4).setY(0);
  }

  /** Va devant le carré `i`, puis `then`. */
  private atParcel(i: number, running: boolean, then: () => void): boolean {
    this.host.character.approachThen(this.parcelStand(i), this.parcelWorld(i), then, running);
    return true;
  }

  private waterBed(running: boolean): boolean {
    const can = this.canOf();
    if (!can) return this.tell('Remplis l’arrosoir au robinet du jardin, puis arrose le potager.');
    const wait = this.ready(() => this.waterBed(running));
    if (wait !== null) return wait;
    if (this.season === 3) return this.tell('La terre est gelée : inutile d’arroser l’hiver.');
    if (this.watering) return false;
    // on arrose le milieu du potager, au-dessus des deux carrés du centre
    const at = () => this.bed!.object.localToWorld(new THREE.Vector3(0, SOIL_Y, 0.1));
    const stand = this.bed!.object.localToWorld(new THREE.Vector3(0, 0, BED_D / 2 + 0.38)).setY(0);
    if (!this.host.pour(can, at, stand)) return false;
    this.watering = { can, before: can.level, started: false, t: 0 };
    return true;
  }

  /** L'arrosoir s'incline au-dessus du potager : une fois fini, la terre a bu ce qui a coulé. */
  private tickWatering(dt: number): void {
    const w = this.watering;
    if (!w) return;
    w.t += dt;
    const pouring = this.host.pouring();
    if (pouring) w.started = true;
    if (pouring || (!w.started && w.t < 12)) return;
    this.watering = null;
    const litres = (w.before - w.can.level) * CAN_VOLUME;
    if (litres <= 0.01) return;
    this.water = Math.min(1, this.water + litres / BED_THIRST);
    this.showBed();
    this.host.notice(this.water >= 0.95 ? 'Le potager est bien arrosé.' : 'Le potager a bu, mais la terre est encore un peu sèche : encore un peu d’eau.');
    if (w.can.level <= 0.02) this.host.say('L’arrosoir est vide.');
  }

  private harvest(i: number, running: boolean): boolean {
    const p = this.parcels[i];
    if (!p || p.stage === null || p.stage < 1 || p.left <= 0) return this.tell('Rien à récolter ici.');
    const wait = this.ready(() => this.harvest(i, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell(`Les mains sont prises : pose quelque chose pour récolter ${p.crop.feminine ? 'une' : 'un'} ${p.crop.name}.`);
    return this.atParcel(i, running, () => {
      if (p.left <= 0) return;
      // le légume, arraché ou cueilli, posé sur le rebord du potager, puis pris en main
      const at = this.parcelWorld(i, BED_H, BED_D / 2 - 0.025);
      const veg = this.host.spawn(p.crop.id, at, this.bed!.object.rotation.y + Math.PI / 2);
      if (!veg) return;
      p.left--;
      if (p.left <= 0) {
        p.stage = null;
        this.host.notice(`Toutes les ${p.crop.plural} sont récoltées : ce carré est prêt à être semé.`);
      }
      this.showBed();
      if (p.crop.id === 'carotte' || p.crop.id === 'pomme-de-terre') this.host.soilHands('la terre du jardin');
      this.host.mood(1);
      if (!c.pickUp(veg, running)) this.host.notice(`${p.crop.feminine ? 'La' : 'Le'} ${p.crop.name} est posé${p.crop.feminine ? 'e' : ''} sur le bord du potager.`);
    });
  }

  private sow(i: number, running: boolean): boolean {
    const p = this.parcels[i];
    if (!p || p.stage !== null) return this.tell('Ce carré est déjà semé.');
    if (this.season === 3) return this.tell('La terre est gelée : on sèmera au printemps.');
    const wait = this.ready(() => this.sow(i, running));
    if (wait !== null) return wait;
    return this.atParcel(i, running, () => {
      if (p.stage !== null) return;
      p.stage = 0;
      p.left = 0;
      this.showBed();
      this.host.soilHands('la terre du jardin');
      this.host.notice(`Graines de ${p.crop.plural} semées.${this.water < 0.35 ? ' Pense à arroser le potager.' : ''}`);
    });
  }

  private weed(running: boolean): boolean {
    if (this.weeds <= 0.05) return this.tell('Il n’y a pas de mauvaises herbes.');
    const wait = this.ready(() => this.weed(running));
    if (wait !== null) return wait;
    // du côté du potager où l'on est
    return this.atParcel(this.nearestParcel(() => true), running, () => {
      this.weeds = 0;
      this.showBed();
      this.host.soilHands('la terre du jardin');
      this.host.mood(1);
      this.host.notice('Mauvaises herbes arrachées : les légumes pousseront mieux.');
    });
  }

  private pickApple(running: boolean): boolean {
    if (!this.tree || this.apples < 1) return this.tell('Il n’y a pas de pomme à cueillir.');
    const wait = this.ready(() => this.pickApple(running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell('Les mains sont prises : pose quelque chose pour cueillir une pomme.');
    // la pomme qui pend du côté du perso
    const apples = this.tree.object.getObjectByName('pommes')!;
    this.tree.object.updateMatrixWorld(true);
    const hanging = apples.children.filter((a) => a.visible);
    const at = c.position;
    const pick = hanging.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(at) - b.getWorldPosition(new THREE.Vector3()).distanceTo(at))[0];
    if (!pick) return false;
    const spot = pick.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.075, 0));
    this.apples = Math.max(0, this.apples - 1);
    this.showApples();
    const apple = this.host.spawn('pomme', spot, 0);
    if (!apple) return false;
    this.host.mood(1);
    return c.pickUp(apple, running) || this.tell('Pomme cueillie : elle attend sur la branche.');
  }

  private smell(item: WorldItem, running: boolean): boolean {
    const wait = this.ready(() => this.smell(item, running));
    if (wait !== null) return wait;
    this.host.character.approachThen(this.host.character.standFor(item), item.object.position, () => {
      const fresh = this.smelled > 2;
      this.smelled = 0;
      this.host.say(fresh ? 'Mmh, ça sent bon !' : 'Ça sent toujours aussi bon.');
      if (fresh) this.host.mood(4);
    }, running);
    return true;
  }

  private pickBouquet(item: WorldItem, running: boolean): boolean {
    if (this.blooming(item) < BOUQUET) return this.tell('Il n’y a pas assez de fleurs pour un bouquet.');
    const wait = this.ready(() => this.pickBouquet(item, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell('Les mains sont prises : pose quelque chose pour cueillir un bouquet.');
    c.approachThen(c.standFor(item), item.object.position, () => {
      if (this.blooming(item) < BOUQUET) return;
      this.beds.set(item, (this.beds.get(item) ?? 0) + BOUQUET);
      this.showFlowers(item);
      // le bouquet posé sur la bordure de pierres, du côté du perso, puis pris en main
      const dir = c.position.clone().sub(item.object.position).setY(0).normalize();
      const at = item.object.position.clone().addScaledVector(dir, 0.55).setY(0.08);
      const flowers = this.host.spawn('bouquet', at, 0);
      if (!flowers) return;
      this.host.mood(3);
      this.host.say('Un joli bouquet pour la maison.');
      c.pickUp(flowers, running);
    }, running);
    return true;
  }

  // ——— ce qui se voit ———

  /** Fleurs ouvertes dans le massif (selon la saison, moins celles cueillies). */
  private blooming(item: WorldItem): number {
    const bloom = mixN(seasonWeights(Math.max(0, this.lastLook.yearPos)), BLOOM);
    const open = bloom >= 0.99 ? FLOWERS : Math.floor(FLOWERS * Math.max(0, bloom));
    return Math.max(0, open - Math.ceil(this.beds.get(item) ?? 0));
  }

  private showFlowers(item: WorldItem): void {
    const flowers = item.object.getObjectByName('fleurs');
    if (!flowers) return;
    const n = this.blooming(item);
    flowers.children.forEach((f, i) => (f.visible = i < n));
  }

  private showApples(): void {
    const apples = this.tree?.object.getObjectByName('pommes');
    if (!apples) return;
    const n = Math.floor(this.apples);
    apples.children.forEach((a, i) => (a.visible = i < n));
  }

  /** Le potager : les plantes à leur taille, les légumes mûrs, la terre plus sombre arrosée, les mauvaises herbes. */
  private showBed(): void {
    if (!this.bed) return;
    for (const p of this.parcels) {
      p.plant.visible = p.stage !== null;
      if (p.stage === null) continue;
      const s = 0.12 + 0.88 * Math.min(1, p.stage);
      p.grow.scale.set(s, s * (this.water > 0 ? 1 : 0.8), s);
      p.fruits.forEach((f, i) => (f.visible = p.stage! >= 1 && i < p.left));
    }
    const soil = this.bed.object.getObjectByName('terre') as THREE.Mesh | undefined;
    if (soil) (soil.material as THREE.MeshToonMaterial).color.set(0x8a6a4a).lerp(new THREE.Color(0x3e2717), this.water);
    this.weedTufts.forEach((t, i) => {
      const s = THREE.MathUtils.clamp(this.weeds * 1.6 - i * 0.08, 0, 1);
      t.visible = s > 0.05;
      t.scale.setScalar(Math.max(0.05, s));
    });
  }
}
