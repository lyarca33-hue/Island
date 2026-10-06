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
  /** Objets d'une même sorte qui s'empilent (les livres) : on peut en porter plusieurs. */
  stack?: string;
  /** Se pose couché (un livre à plat sur sa couverture), sauf rangé debout dans un meuble. */
  layFlat?: boolean;
  /**
   * Meuble de rangement : places où poser un objet debout (repère du meuble, base de l'objet),
   * l'objet tourné vers l'avant du meuble (+Z).
   */
  slots?: Array<[number, number, number]>;
  /**
   * Se lit : le modèle du livre ouvert (pages vers +Z, haut vers +Y, centré), montré à la place
   * du livre fermé pendant la lecture.
   */
  buildOpen?(): THREE.Object3D;
  /**
   * Récipient qui se remplit (tasse) : sa pièce nommée `liquide` monte avec le niveau, de
   * `fill[0]` (vide) à `fill[1]` (plein) en hauteur dans l'objet. Vide au départ.
   */
  fill?: [number, number];
  /**
   * Machine qui remplit un récipient (machine à café) : où poser le récipient (repère de la
   * machine, base de l'objet, l'avant vers +Z). La pièce `jet` est l'écoulement, cachée au repos.
   */
  pour?: { at: [number, number, number]; fills: string; liquid: string; seconds: number };
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
/** Épaisseur d'un livre (m) : les places d'un rayon sont collées les unes aux autres. */
const BOOK_T = 0.045;
/** Bibliothèque : trois rayons (dessus des planches), places de gauche à droite sur chacun. */
const SHELF_W = 1.0;
const SHELF_D = 0.3;
const SHELF_H = 1.42;
const SHELVES = [0.06, 0.5, 0.94];
export const SLOTS_PER_SHELF = 20;
const SHELF_SLOTS = SHELVES.flatMap((y) =>
  Array.from({ length: SLOTS_PER_SHELF }, (_, i): [number, number, number] => [-0.47 + BOOK_T / 2 + 0.002 + i * (BOOK_T + 0.001), y, 0]),
);

/**
 * Un livre (fiche commune, couleurs différentes). Debout, haut vers +Y, dos vers -Z ; la paume
 * se pose à plat sur la couverture.
 */
function book(id: string, color: THREE.ColorRepresentation): ItemDef {
  return {
    id,
    name: 'livre',
    portable: true,
    grip: 'chest',
    gripPoint: [-BOOK_T / 2, 0.13, 0],
    stack: 'livre',
    layFlat: true,
    buildOpen: () => {
      // deux moitiés en léger V autour du dos, pages crème côté lecteur
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const half = new THREE.Group();
        half.add(mesh(new THREE.BoxGeometry(0.17, 0.24, 0.006), color, (s * 0.17) / 2, 0, -0.003));
        half.add(mesh(new THREE.BoxGeometry(0.16, 0.226, 0.016), 0xf1e7cf, (s * 0.16) / 2, 0, 0.008));
        half.rotation.y = -s * 0.18;
        g.add(half);
      }
      return g;
    },
    build: () => {
      const cover = mesh(new THREE.BoxGeometry(BOOK_T, 0.24, 0.17), color, 0, 0.12, 0);
      const pages = mesh(new THREE.BoxGeometry(0.038, 0.226, 0.16), 0xf1e7cf, 0, 0.12, 0.007);
      return group(cover, pages);
    },
  };
}

/** Hauteur du plan de travail sous la machine à café (m). */
const COUNTER_H = 0.9;
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
    fill: [0.012, CUP_H - 0.012],
    build: () => {
      // ouverte en haut (on voit le café dedans), parois visibles des deux côtés
      const body = mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.85, CUP_H, 20, 1, true), 0xe9e2d0, 0, CUP_H / 2, 0);
      (body.material as THREE.Material).side = THREE.DoubleSide;
      const bottom = mesh(new THREE.CircleGeometry(CUP_R * 0.85, 20).rotateX(-Math.PI / 2), 0xd8d0bc, 0, 0.006, 0);
      const coffee = mesh(new THREE.CircleGeometry(CUP_R * 0.97, 20).rotateX(-Math.PI / 2), 0x4a2c1a, 0, CUP_H - 0.012, 0);
      coffee.name = 'liquide';
      const handle = mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), 0xe9e2d0, 0, CUP_H * 0.55, CUP_R + 0.012);
      handle.rotation.y = Math.PI / 2;
      return group(body, bottom, coffee, handle);
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
  book('livre', 0x3e5d8a),
  book('livre-rouge', 0x9a3b34),
  book('livre-vert', 0x3f6e48),
  book('livre-ocre', 0xb08a3a),
  book('livre-violet', 0x5e4a86),
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
    id: 'bibliotheque',
    name: 'bibliothèque',
    portable: false,
    slots: SHELF_SLOTS,
    build: () => {
      const wood = 0x7a5232, dark = 0x5b3b22;
      const t = 0.03;
      const g = group(
        mesh(new THREE.BoxGeometry(t, SHELF_H, SHELF_D), wood, -SHELF_W / 2 + t / 2, SHELF_H / 2, 0),
        mesh(new THREE.BoxGeometry(t, SHELF_H, SHELF_D), wood, SHELF_W / 2 - t / 2, SHELF_H / 2, 0),
        mesh(new THREE.BoxGeometry(SHELF_W, SHELF_H, 0.015), dark, 0, SHELF_H / 2, -SHELF_D / 2 + 0.0075),
        mesh(new THREE.BoxGeometry(SHELF_W, t, SHELF_D), wood, 0, SHELF_H - t / 2, 0),
      );
      for (const y of SHELVES) g.add(mesh(new THREE.BoxGeometry(SHELF_W - 2 * t, t, SHELF_D - 0.015), wood, 0, y - t / 2, 0.0075));
      return g;
    },
  },
  {
    id: 'machine-a-cafe',
    name: 'machine à café',
    portable: false,
    // la tasse se pose sur la grille, sous le bec, l'anse vers l'avant
    pour: { at: [0, COUNTER_H + 0.016, 0.1], fills: 'tasse', liquid: 'café', seconds: 2.6 },
    build: () => {
      const H = COUNTER_H;
      const body = 0x2e3135, metal = 0xb9bfc6;
      const g = group(
        // petit meuble de cuisine
        mesh(new THREE.BoxGeometry(0.6, H - 0.03, 0.4), 0x8a6440, 0, (H - 0.03) / 2, 0),
        mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), 0xd9d3c5, 0, H - 0.015, 0),
        mesh(new THREE.BoxGeometry(0.5, 0.006, 0.01), 0x5d4129, 0, H - 0.12, 0.2),
        // machine : colonne, tête avec le bec, grille d'égouttage, réservoir d'eau
        mesh(new THREE.BoxGeometry(0.24, 0.36, 0.16), body, 0, H + 0.18, -0.1),
        mesh(new THREE.BoxGeometry(0.24, 0.08, 0.32), body, 0, H + 0.32, -0.02),
        mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.03, 12), metal, 0, H + 0.265, 0.1),
        mesh(new THREE.BoxGeometry(0.2, 0.016, 0.16), metal, 0, H + 0.008, 0.08),
        mesh(new THREE.BoxGeometry(0.07, 0.3, 0.12), 0x7fb2c9, 0.155, H + 0.16, -0.1),
        mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 14).rotateX(Math.PI / 2), 0xd0463a, 0.07, H + 0.32, 0.142),
      );
      // café qui coule du bec dans la tasse
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), toon(0x3b2213));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(0, H + 0.25, 0.1);
      g.add(jet);
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
