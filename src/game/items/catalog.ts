/**
 * Catalogue des objets. Chaque objet a une petite fiche : peut-il être porté, avec quelle prise
 * (sinon devinée d'après sa taille) et par quel point la main le saisit. Pas d'animation par
 * objet : la pose vient du type de prise (grips.ts).
 *
 * Les objets de test sont faits de formes simples ; un objet importé (.glb) aura la même fiche.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { GripType } from './grips';

export interface ItemDef {
  id: string;
  /** Nom affiché (et compris par l'IA de RP : « prend: tasse »). */
  name: string;
  portable: boolean;
  /** Type de prise ; absent = deviné d'après la taille. */
  grip?: GripType;
  /**
   * Point saisi par la main, dans le repère de l'objet (posé au sol, haut vers +Y) ; absent =
   * centre de l'objet. Pour une prise à deux mains : centre de la prise.
   */
  gripPoint?: [number, number, number];
  build(): THREE.Object3D;
}

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

/** Hauteur du plateau de la table (m). */
export const TABLE_H = 0.74;
const CUP_R = 0.042;
const CUP_H = 0.1;

export const ITEMS: ItemDef[] = [
  {
    id: 'tasse',
    name: 'tasse',
    portable: true,
    grip: 'fist',
    // tenue par l'anse
    gripPoint: [0, CUP_H * 0.55, CUP_R + 0.02],
    build: () => {
      const body = mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.85, CUP_H, 20), 0xe9e2d0, 0, CUP_H / 2, 0);
      const coffee = mesh(new THREE.CircleGeometry(CUP_R * 0.85, 20).rotateX(-Math.PI / 2), 0x4a2c1a, 0, CUP_H - 0.01, 0);
      const handle = mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), 0xe9e2d0, 0, CUP_H * 0.55, CUP_R + 0.012);
      handle.rotation.y = Math.PI / 2;
      return group(body, coffee, handle);
    },
  },
  {
    id: 'lettre',
    name: 'lettre',
    portable: true,
    // pas de prise indiquée : devinée (petite et fine → entre les doigts)
    gripPoint: [0, 0.015, -0.05],
    build: () => {
      const paper = mesh(new THREE.BoxGeometry(0.11, 0.004, 0.15), 0xf4ead2, 0, 0.002, 0);
      const seal = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), 0xb0302a, 0, 0.005, 0.02);
      return group(paper, seal);
    },
  },
  {
    id: 'livre',
    name: 'livre',
    portable: true,
    grip: 'chest',
    // paume à plat sur la couverture
    gripPoint: [-0.0225, 0.13, 0],
    build: () => {
      // posé debout (haut vers +Y), dos vers -Z
      const cover = mesh(new THREE.BoxGeometry(0.045, 0.24, 0.17), 0x3e5d8a, 0, 0.12, 0);
      const pages = mesh(new THREE.BoxGeometry(0.038, 0.226, 0.16), 0xf1e7cf, 0, 0.12, 0.007);
      return group(cover, pages);
    },
  },
  {
    id: 'caisse',
    name: 'caisse',
    portable: true,
    grip: 'twoHands',
    gripPoint: [0, 0.17, 0],
    build: () => {
      const s = 0.34;
      const box = mesh(new THREE.BoxGeometry(s, s, s), 0xa8743f, 0, s / 2, 0);
      const plankMat = toon(0x7a4f2a);
      const g = group(box);
      for (const y of [0.04, s - 0.04]) {
        for (const [rx, rz, sx, sz] of [[0, s / 2, s + 0.01, 0.01], [0, -s / 2, s + 0.01, 0.01], [s / 2, 0, 0.01, s + 0.01], [-s / 2, 0, 0.01, s + 0.01]]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), plankMat);
          p.position.set(rx, y, rz);
          p.castShadow = true;
          g.add(p);
        }
      }
      return g;
    },
  },
  {
    id: 'table',
    name: 'table',
    portable: false,
    build: () => {
      const top = mesh(new THREE.BoxGeometry(1, 0.05, 0.6), 0x9b6a3c, 0, TABLE_H - 0.025, 0);
      const g = group(top);
      for (const [x, z] of [[-0.44, -0.24], [0.44, -0.24], [-0.44, 0.24], [0.44, 0.24]]) g.add(mesh(new THREE.BoxGeometry(0.06, TABLE_H - 0.05, 0.06), 0x6e4626, x, (TABLE_H - 0.05) / 2, z));
      return g;
    },
  },
];

export const ITEM_BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
