/**
 * Le salon : canapé, table basse et télé. Mêmes fiches que le reste du catalogue (catalog.ts) ;
 * s'asseoir et allumer la télé sont joués par Game.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z.
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

/** Canapé : largeur, profondeur, hauteur de l'assise et du dossier. */
const SOFA_W = 2.0;
const SOFA_D = 0.9;
const SOFA_SEAT = 0.44;
const SOFA_BACK = 0.85;
/**
 * Sieste sur le canapé (repère du canapé) : les pieds du dormeur contre l'accoudoir +X, la tête
 * vers l'accoudoir -X, couché sur les coussins d'assise ; on se relève devant (+Z).
 */
export const SOFA_NAP = { feet: new THREE.Vector3(SOFA_W / 2 - 0.2, SOFA_SEAT + 0.06, 0.08), head: new THREE.Vector3(-1, 0, 0), front: SOFA_D / 2 };
/** Hauteur du plateau de la table basse. */
export const LOW_TABLE_H = 0.42;
/** Meuble télé : hauteur du dessus (où pose la télé). */
const TV_STAND_H = 0.48;

export const SALON_ITEMS: ItemDef[] = [
  {
    id: 'canape',
    name: 'canapé',
    portable: false,
    movable: true,
    durability: 400,
    seat: SOFA_SEAT,
    build: () => {
      // tissu vert sauge, coussins plus clairs, petits pieds en bois ; dossier côté -Z
      const fabric = 0x6c8a78, cushion = 0x86a592, feet = 0x5d4129;
      const g = new THREE.Group();
      const arm = 0.16;
      g.add(
        box(SOFA_W, 0.22, SOFA_D, fabric, 0, 0.06 + 0.11, 0),
        box(SOFA_W, SOFA_BACK - 0.06, 0.2, fabric, 0, 0.06 + (SOFA_BACK - 0.06) / 2, -SOFA_D / 2 + 0.1),
        box(arm, 0.62 - 0.06, SOFA_D, fabric, -SOFA_W / 2 + arm / 2, 0.06 + (0.62 - 0.06) / 2, 0),
        box(arm, 0.62 - 0.06, SOFA_D, fabric, SOFA_W / 2 - arm / 2, 0.06 + (0.62 - 0.06) / 2, 0),
      );
      // deux coussins d'assise et deux de dossier
      const inner = SOFA_W - 2 * arm;
      for (const sx of [-1, 1]) {
        g.add(box(inner / 2 - 0.02, SOFA_SEAT - 0.28, SOFA_D - 0.24, cushion, (sx * inner) / 4, 0.28 + (SOFA_SEAT - 0.28) / 2, 0.1));
        g.add(box(inner / 2 - 0.04, 0.4, 0.12, cushion, (sx * inner) / 4, SOFA_SEAT + 0.2, -SOFA_D / 2 + 0.25));
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.06, 0.06, 0.06, feet, x * (SOFA_W / 2 - 0.08), 0.03, z * (SOFA_D / 2 - 0.08)));
      return g;
    },
  },
  {
    id: 'table-basse',
    name: 'table basse',
    portable: false,
    movable: true,
    durability: 300,
    build: () => {
      const g = new THREE.Group();
      g.add(box(1.1, 0.04, 0.6, 0x9b6a3c, 0, LOW_TABLE_H - 0.02, 0));
      // tablette du bas, pour les magazines
      g.add(box(0.98, 0.02, 0.5, 0x7a5232, 0, 0.1, 0));
      for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) g.add(box(0.05, LOW_TABLE_H - 0.04, 0.05, 0x6e4626, x, (LOW_TABLE_H - 0.04) / 2, z));
      return g;
    },
  },
  {
    id: 'television',
    name: 'télé',
    portable: false,
    movable: true,
    durability: 250,
    screen: true,
    build: () => {
      const g = new THREE.Group();
      // meuble bas en bois, deux niches
      g.add(
        box(1.5, TV_STAND_H - 0.04, 0.42, 0x7a5232, 0, 0.04 + (TV_STAND_H - 0.04) / 2, 0),
        box(0.66, 0.24, 0.02, 0x4a3220, -0.36, 0.24, 0.205),
        box(0.66, 0.24, 0.02, 0x4a3220, 0.36, 0.24, 0.205),
        box(1.44, 0.04, 0.38, 0x5d4129, 0, 0.02, 0),
      );
      // la télé : pied, cadre noir, écran (pièce `ecran`, éteint au départ)
      const y0 = TV_STAND_H;
      g.add(
        box(0.3, 0.02, 0.18, 0x222326, 0, y0 + 0.01, -0.02),
        box(0.05, 0.12, 0.04, 0x222326, 0, y0 + 0.07, -0.04),
        box(1.12, 0.66, 0.05, 0x1b1c1f, 0, y0 + 0.13 + 0.33, -0.03),
      );
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.6), new THREE.MeshBasicMaterial({ color: 0x0c0d10 }));
      screen.position.set(0, y0 + 0.13 + 0.33, -0.004);
      screen.name = 'ecran';
      g.add(screen);
      // voyant de veille, rouge
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      led.position.set(0.5, y0 + 0.155, 0.0);
      led.name = 'voyant';
      g.add(led);
      return g;
    },
  },
];
