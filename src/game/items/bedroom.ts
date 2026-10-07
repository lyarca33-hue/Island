/**
 * La chambre : le lit (on y dort), la table de nuit (un tiroir pour les livres), la lampe de
 * chevet (elle s'allume et s'éteint d'un clic), l'armoire et ses pulls. Mêmes fiches que le reste
 * du catalogue (catalog.ts) ; le sommeil, la lampe, la porte et le tiroir sont joués par Game.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z (le lit : la tête contre le mur, à -Z).
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

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

const WOOD = 0x8a6440;
const DARK_WOOD = 0x5d4129;
const LIGHT_WOOD = 0xb08a5c;
const KNOB = 0xc9c2b0;
const WALL = 0.02;

/** Lit double : largeur, longueur, dessus du matelas (m). La tête est à -Z. */
export const BED_W = 1.4;
export const BED_L = 2.05;
export const BED_TOP = 0.52;
/** Table de nuit : largeur, hauteur, profondeur ; hauteur du fond du tiroir ; course du tiroir. */
const NIGHT_W = 0.46;
const NIGHT_H = 0.55;
const NIGHT_D = 0.4;
const NIGHT_DRAWER_Y = 0.36;
/** Armoire : largeur, hauteur, profondeur, dessus des étagères (places des pulls). */
const WARD_W = 0.9;
const WARD_H = 1.95;
const WARD_D = 0.56;
const WARD_SHELVES = [0.95, 1.35];

export const BEDROOM_ITEMS: ItemDef[] = [
  {
    id: 'lit',
    name: 'lit',
    portable: false,
    durability: 400,
    fragility: 9,
    bed: { top: BED_TOP, length: BED_L },
    build: () => {
      const g = new THREE.Group();
      const hw = BED_W / 2, hl = BED_L / 2;
      // cadre en bois, pieds, tête de lit contre le mur et pied de lit bas
      g.add(
        box(BED_W, 0.12, BED_L - 0.08, WOOD, 0, 0.24, 0),
        box(0.08, 1.0, 0.06, DARK_WOOD, -hw + 0.04, 0.5, -hl + 0.03),
        box(0.08, 1.0, 0.06, DARK_WOOD, hw - 0.04, 0.5, -hl + 0.03),
        box(BED_W - 0.08, 0.55, 0.04, WOOD, 0, 0.62, -hl + 0.03),
        box(BED_W - 0.2, 0.36, 0.01, LIGHT_WOOD, 0, 0.64, -hl + 0.055),
        box(BED_W, 0.4, 0.05, DARK_WOOD, 0, 0.3, hl - 0.025),
      );
      for (const x of [-hw + 0.05, hw - 0.05]) g.add(box(0.07, 0.18, 0.07, DARK_WOOD, x, 0.09, hl - 0.05));
      // matelas, drap blanc, deux oreillers
      g.add(box(BED_W - 0.06, 0.2, BED_L - 0.14, 0xf3efe6, 0, BED_TOP - 0.1, -0.02));
      for (const x of [-0.34, 0.34]) {
        g.add(mesh(new THREE.BoxGeometry(0.55, 0.12, 0.34), 0xffffff, x, BED_TOP + 0.05, -hl + 0.28));
      }
      // couette repliée au pied, et la couette des nuits (bombée sur le dormeur), cachée de jour
      const duvet = new THREE.Group();
      duvet.name = 'couette';
      duvet.add(box(BED_W - 0.02, 0.07, 1.25, 0x5b7fa8, 0, BED_TOP + 0.035, 0.32), box(BED_W, 0.06, 0.06, 0x4b6a8f, 0, BED_TOP + 0.04, 0.95));
      // un rabat de drap blanc sur le bord de la couette
      duvet.add(box(BED_W - 0.02, 0.075, 0.12, 0xf7f4ec, 0, BED_TOP + 0.036, -0.29));
      g.add(duvet);
      const night = new THREE.Group();
      night.name = 'couette-dormeur';
      night.add(
        box(BED_W - 0.02, 0.3, 1.24, 0x5b7fa8, 0, BED_TOP + 0.15, 0.37),
        box(BED_W - 0.02, 0.31, 0.12, 0xf7f4ec, 0, BED_TOP + 0.155, -0.31),
        // retombées sur les côtés et au pied
        box(0.04, 0.34, 1.36, 0x4b6a8f, -hw + 0.01, BED_TOP + 0.06, 0.31),
        box(0.04, 0.34, 1.36, 0x4b6a8f, hw - 0.01, BED_TOP + 0.06, 0.31),
      );
      night.visible = false;
      g.add(night);
      return g;
    },
  },
  {
    id: 'table-de-nuit',
    name: 'table de nuit',
    portable: false,
    movable: true,
    durability: 250,
    fragility: 7,
    drawer: 0.24,
    // au fond du tiroir : deux livres couchés
    slots: [[-0.1, NIGHT_DRAWER_Y + 0.006, 0], [0.1, NIGHT_DRAWER_Y + 0.006, 0]],
    build: () => {
      const g = new THREE.Group();
      // caisson ouvert devant, plateau, pieds
      g.add(
        box(NIGHT_W, WALL, NIGHT_D, WOOD, 0, NIGHT_H - WALL / 2, 0),
        box(WALL, NIGHT_H - 0.1, NIGHT_D, WOOD, -NIGHT_W / 2 + WALL / 2, 0.1 + (NIGHT_H - 0.1) / 2 - WALL / 2, 0),
        box(WALL, NIGHT_H - 0.1, NIGHT_D, WOOD, NIGHT_W / 2 - WALL / 2, 0.1 + (NIGHT_H - 0.1) / 2 - WALL / 2, 0),
        box(NIGHT_W, NIGHT_H - 0.1, WALL, WOOD, 0, 0.1 + (NIGHT_H - 0.1) / 2 - WALL / 2, -NIGHT_D / 2 + WALL / 2),
        box(NIGHT_W, WALL, NIGHT_D, WOOD, 0, 0.1, 0),
        // niche du bas, ouverte
        box(NIGHT_W - 2 * WALL, WALL, NIGHT_D - WALL, LIGHT_WOOD, 0, 0.33, WALL / 2),
      );
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.04, 0.1, 0.04, DARK_WOOD, x * (NIGHT_W / 2 - 0.03), 0.05, z * (NIGHT_D / 2 - 0.03)));
      // le tiroir du haut : façade, fond et côtés ; il glisse vers l'avant
      const drawer = new THREE.Group();
      drawer.name = 'porte';
      const iw = NIGHT_W - 2 * WALL - 0.01, id = NIGHT_D - 0.04;
      const zc = NIGHT_D / 2 - id / 2;
      drawer.add(
        box(NIGHT_W - 0.004, 0.16, WALL, 0x9a7048, 0, 0.44, NIGHT_D / 2 + WALL / 2),
        box(0.1, 0.014, 0.014, KNOB, 0, 0.46, NIGHT_D / 2 + WALL + 0.01),
        box(iw, 0.006, id, LIGHT_WOOD, 0, NIGHT_DRAWER_Y + 0.003, zc),
        box(0.01, 0.1, id, LIGHT_WOOD, -iw / 2, NIGHT_DRAWER_Y + 0.05, zc),
        box(0.01, 0.1, id, LIGHT_WOOD, iw / 2, NIGHT_DRAWER_Y + 0.05, zc),
        box(iw, 0.1, 0.01, LIGHT_WOOD, 0, NIGHT_DRAWER_Y + 0.05, NIGHT_D / 2 - id),
      );
      g.add(drawer);
      return g;
    },
  },
  {
    id: 'lampe-chevet',
    name: 'lampe de chevet',
    portable: true,
    fragility: 3,
    durability: 120,
    lamp: { y: 0.27, color: 0xffc98a, intensity: 1.4, range: 4.5 },
    build: () => {
      const g = new THREE.Group();
      const foot = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 20), 0xd9c7a6, 0, 0.015, 0);
      const stem = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), 0xc9a24a, 0, 0.14, 0);
      const shadeMat = new THREE.MeshBasicMaterial({ color: 0xe9dcc0, side: THREE.DoubleSide });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.14, 20, 1, true), shadeMat);
      shade.position.y = 0.3;
      shade.name = 'abat-jour';
      shade.castShadow = true;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3a342c }));
      bulb.position.y = 0.27;
      bulb.name = 'ampoule';
      g.add(foot, stem, shade, bulb);
      return g;
    },
  },
  {
    id: 'armoire',
    name: 'armoire',
    portable: false,
    movable: true,
    durability: 400,
    fragility: 8,
    // la porte : charnière à droite
    door: THREE.MathUtils.degToRad(105),
    holds: ['pull'],
    slots: WARD_SHELVES.flatMap((y) => [-0.22, 0.02, 0.26].map((x): [number, number, number] => [x, y + 0.005, 0.02])),
    build: () => {
      const g = new THREE.Group();
      const hw = WARD_W / 2, hd = WARD_D / 2;
      g.add(
        box(WALL, WARD_H - 0.08, WARD_D, WOOD, -hw + WALL / 2, 0.08 + (WARD_H - 0.08) / 2, 0),
        box(WALL, WARD_H - 0.08, WARD_D, WOOD, hw - WALL / 2, 0.08 + (WARD_H - 0.08) / 2, 0),
        box(WARD_W, WARD_H - 0.08, WALL, WOOD, 0, 0.08 + (WARD_H - 0.08) / 2, -hd + WALL / 2),
        box(WARD_W + 0.04, 0.04, WARD_D + 0.03, DARK_WOOD, 0, WARD_H - 0.02, 0.01),
        box(WARD_W, WALL, WARD_D, WOOD, 0, 0.08 + WALL / 2, 0),
        box(WARD_W, 0.08, WARD_D - 0.02, DARK_WOOD, 0, 0.04, 0),
      );
      for (const y of WARD_SHELVES) g.add(box(WARD_W - 2 * WALL, WALL, WARD_D - WALL - 0.02, LIGHT_WOOD, 0, y - WALL / 2, 0));
      // penderie : la tringle et trois cintres sous l'étagère du bas
      const rail = mesh(new THREE.CylinderGeometry(0.01, 0.01, WARD_W - 2 * WALL, 8), 0xc3c8cd, 0, 0.88, 0);
      rail.rotation.z = Math.PI / 2;
      g.add(rail);
      for (const [x, c] of [[-0.25, 0xb04a3c], [0, 0xe0b23a], [0.22, 0x6d9a3e]] as const) {
        g.add(box(0.36, 0.5, 0.05, c, x, 0.6, 0), box(0.02, 0.05, 0.02, 0xc3c8cd, x, 0.86, 0));
      }
      // la porte : pleine largeur, charnière à droite, poignée à gauche
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(hw, 0, hd);
      const dh = WARD_H - 0.14;
      door.add(
        box(WARD_W - 0.004, dh, WALL, 0x9a7048, -hw, 0.1 + dh / 2, WALL / 2),
        box(WARD_W - 0.16, dh * 0.42, 0.006, DARK_WOOD, -hw, 0.1 + dh * 0.74, WALL + 0.003),
        box(WARD_W - 0.16, dh * 0.42, 0.006, DARK_WOOD, -hw, 0.1 + dh * 0.27, WALL + 0.003),
        box(0.016, 0.16, 0.016, KNOB, -WARD_W + 0.06, 1.05, WALL + 0.016),
      );
      g.add(door);
      return g;
    },
  },
  pull('pull', 0xb04a3c),
  pull('pull-bleu', 0x4b6a8f),
  pull('pull-vert', 0x6d9a3e),
];

/** Un pull plié (fiche commune, couleurs différentes) : il s'empile. */
function pull(id: string, color: THREE.ColorRepresentation): ItemDef {
  return {
    id,
    name: 'pull',
    portable: true,
    grip: 'chest',
    stack: 'pull',
    fragility: 10,
    durability: 150,
    build: () => {
      const g = new THREE.Group();
      g.add(box(0.26, 0.07, 0.22, color, 0, 0.035, 0), box(0.24, 0.012, 0.03, 0xffffff, 0, 0.07, 0.09));
      return g;
    },
  };
}
