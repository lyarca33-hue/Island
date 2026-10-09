/**
 * Les pièces vides autour de la cuisine, en attendant leurs meubles Tripo. Deux rangées, toits à
 * deux pentes dans le même sens que celui de la cuisine :
 * - devant (même profondeur que la cuisine, un seul toit d'un bout à l'autre) : le garage, l'entrée
 *   (la porte de la maison, au sud), la cuisine, le salon (passage par le mur est de la cuisine) ;
 * - derrière le salon : la salle de bain et la chambre, chacune avec sa porte sur le salon.
 * Deux pièces voisines ont chacune leur mur, dos à dos (2 × WALL_T entre les deux intérieurs).
 */
import * as THREE from 'three';
import { DOOR, ROOM, SALON_PASS, tiles, toon, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec, type WallName } from './room';
import { tripoDecor } from './items/tripo';
import { BENCH_TOP, CONSOLE_TOP, NIGHTSTAND_TOP, RACK_Y } from './items/pieces';

/** Écart entre les intérieurs de deux pièces voisines : leurs deux murs. */
const GAP = 2 * WALL_T;

export const ENTREE: Rect = { x0: ROOM.x0 - GAP - 2.4, x1: ROOM.x0 - GAP, z0: ROOM.z0, z1: ROOM.z1 };
export const GARAGE: Rect = { x0: ENTREE.x0 - GAP - 5, x1: ENTREE.x0 - GAP, z0: ROOM.z0, z1: ROOM.z1 };
export const SALON: Rect = { x0: ROOM.x1 + GAP, x1: ROOM.x1 + GAP + 6.64, z0: ROOM.z0, z1: ROOM.z1 };
export const SALLE_DE_BAIN: Rect = { x0: SALON.x0, x1: SALON.x0 + 2.4, z0: SALON.z0 - GAP - 4.4, z1: SALON.z0 - GAP };
export const CHAMBRE: Rect = { x0: SALLE_DE_BAIN.x1 + GAP, x1: SALON.x1, z0: SALLE_DE_BAIN.z0, z1: SALLE_DE_BAIN.z1 };

/** Porte de la maison, au sud de l'entrée (de x0 à x1). */
export const FRONT_DOOR = { x0: ENTREE.x0 + 0.7, x1: ENTREE.x0 + 1.6 };
/** Porte entre l'entrée et le garage (le long de z). */
const GARAGE_DOOR = { z0: -0.6, z1: 0.3 };
/** Grande porte du garage, au sud : la porte basculante du kit (240 cm). */
const CAR_DOOR = { x0: GARAGE.x0 + 1.3, x1: GARAGE.x0 + 3.72 };
/** Portes du salon vers la salle de bain et la chambre (le long de x). */
const BATH_DOOR = { x0: SALLE_DE_BAIN.x0 + 0.75, x1: SALLE_DE_BAIN.x0 + 1.55 };
const BED_DOOR = { x0: CHAMBRE.x1 - 1.3, x1: CHAMBRE.x1 - 0.45 };

/** Parquet : lames de bois de tons voisins, posées en quinconce. */
function parquet(r: Rect): THREE.Material {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const tones = ['#b9875a', '#c4935f', '#ad7b4f', '#bf8c5c', '#b58256'];
  const rows = 8, h = 256 / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * 128;
    for (let i = -1; i < 2; i++) {
      g.fillStyle = tones[(j * 3 + i + 5) % tones.length];
      g.fillRect(off + i * 128, j * h, 128, h);
    }
    // joints entre lames, et bout des lames
    g.fillStyle = 'rgba(70,40,20,0.55)';
    g.fillRect(0, j * h + h - 2, 256, 2);
    g.fillRect(off, j * h, 2, h);
    g.fillRect((off + 128) % 256, j * h, 2, h);
    // fines veines
    g.fillStyle = 'rgba(90,55,30,0.18)';
    for (let k = 0; k < 6; k++) g.fillRect((k * 47 + j * 29) % 256, j * h + 6 + (k % 3) * 8, 40, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  // une répétition couvre 1,6 m : lames de 20 cm de large
  tex.repeat.set((r.x1 - r.x0) / 1.6, (r.z1 - r.z0) / 1.6);
  return toon(0xffffff, tex);
}

/** Dalle de béton du garage : grandes plaques grises, joints à peine marqués. */
function concrete(r: Rect): THREE.Material {
  const tex = tiles(256, 2, '#a7a39b', '#a19d95', '#8d8981', 2);
  tex.repeat.set((r.x1 - r.x0) / 2.4, (r.z1 - r.z0) / 2.4);
  return toon(0xffffff, tex);
}

/** Carrelage clair, carreaux de 40 cm (sous le carreau du kit Tripo, qui le remplace). */
function tiled(r: Rect): THREE.Material {
  const tex = tiles(256, 2, '#efe4cf', '#d9c7a6', '#c2b293', 4);
  tex.repeat.set((r.x1 - r.x0) / 0.8, (r.z1 - r.z0) / 0.8);
  return toon(0xffffff, tex);
}

const empty = { runs: [] };

/** Quart de tour : l'avant d'un meuble (+Z) tourné vers +X (rotation de π/2), vers -X (-π/2), vers -Z (π). */
const Q = Math.PI / 2;

/**
 * Décor fixe : le modèle Tripo `name` accroché au mur `wall` (à la place `u` le long du mur, son bas
 * à la hauteur `y`), dos au mur, décollé de `out` (m). Caché avec le mur quand il est abaissé.
 */
function hang(room: Room, wall: WallName, u: number, y: number, name: string, out = 0, flip = false): THREE.Object3D | null {
  const m = tripoDecor(name);
  if (!m) return null;
  const box = new THREE.Box3().setFromObject(m);
  // l'avant du modèle (+Z) vers l'intérieur de la pièce (X du repère du mur) ; `flip` : retourné,
  // l'avant contre le mur
  m.rotation.y = flip ? Q + Math.PI : Q;
  m.position.x = (flip ? box.max.z : -box.min.z) + out;
  const f = room.wallFrame(wall, u, y);
  f.add(m);
  room.wallGroup(wall).add(f);
  return m;
}

/** Décor fixe posé au sol (tapis, douche) : le modèle `name` en (x, z), tourné de `rot`, aplati de `flat`. */
function lay(room: Room, name: string, x: number, z: number, rot = 0, flat = 1): void {
  const m = tripoDecor(name);
  if (!m) return;
  m.position.set(x, 0.002, z);
  m.rotation.y = rot;
  m.scale.y = flat;
  for (const c of m.children) c.castShadow = false;
  room.group.add(m);
}

/** Entrée : place du portemanteau et du miroir le long du mur ouest (z), sur les murs du fond, que la caméra voit. */
const HALL = { coat: GARAGE_DOOR.z0 - 1.05, mirror: GARAGE_DOOR.z1 + 1.0 };

/** L'entrée : la porte de la maison au sud, le passage vers la cuisine, la porte du garage. */
export const ENTREE_SPEC: RoomSpec = {
  ...empty,
  name: 'entrée',
  rect: ENTREE,
  floor: () => tiled(ENTREE),
  doors: [
    { wall: 'sud', u0: FRONT_DOOR.x0, u1: FRONT_DOOR.x1, leaf: true },
    { wall: 'est', u0: DOOR.z0, u1: DOOR.z1 },
    { wall: 'ouest', u0: GARAGE_DOOR.z0, u1: GARAGE_DOOR.z1, inner: true, flip: true },
  ],
  joined: ['est', 'ouest'],
  windows: () => [{ wall: 'nord', u0: ENTREE.x0 + 0.8, u1: ENTREE.x0 + 1.6, y0: 0.95, y1: WIN_HIGH }],
  items: [
    // les chaussures rangées sous le portemanteau, le bout vers la pièce
    ['chaussure', ENTREE.x0 + 0.15, 0, HALL.coat - 0.25, Q],
    ['chaussure', ENTREE.x0 + 0.15, 0, HALL.coat - 0.02, Q],
    ['chausson', ENTREE.x0 + 0.15, 0, HALL.coat + 0.22, Q],
    ['chausson', ENTREE.x0 + 0.15, 0, HALL.coat + 0.36, Q],
    // les bottes de pluie et le porte-parapluies de chaque côté de la porte de la maison
    ['botte', ENTREE.x0 + 0.15, 0, ENTREE.z1 - 0.5, Q],
    ['botte', ENTREE.x0 + 0.15, 0, ENTREE.z1 - 0.32, Q],
    ['porte-parapluies', ENTREE.x1 - 0.16, 0, ENTREE.z1 - 0.2, 0],
    ['parapluie', ENTREE.x1 - 0.16, 0.05, ENTREE.z1 - 0.2, 0],
    // une lettre glissée sous la porte
    ['lettre', FRONT_DOOR.x0 + 0.5, 0, ENTREE.z1 - 0.35, 0.4],
    // la boîte aux lettres dehors, au bord du chemin, à gauche de la porte
    ['boite-lettres', ENTREE.x0 + 0.2, 0, ENTREE.z1 + WALL_T + 1.1, 0],
  ],
  decor: (room) => {
    // au mur du garage, de part et d'autre de sa porte : le portemanteau et son manteau, le miroir
    hang(room, 'ouest', HALL.coat, 1.55, 'portemanteau');
    // le manteau accroché par le col : on en voit le dos, le devant (les boutons) contre le mur
    hang(room, 'ouest', HALL.coat, 0.84, 'manteau-accroche', 0.03, true);
    const mirror = hang(room, 'ouest', HALL.mirror, 1.0, 'miroir-entree');
    // le cadre seul (Tripo n'a pas fait la glace) : une glace claire dedans
    if (mirror) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.68), toon(0xbfcdd2));
      glass.position.set(0, 0.4, 0);
      mirror.add(glass);
    }
  },
};

/** Le garage : dalle de béton, porte basculante au sud (elle s'ouvre devant le perso), porte vers l'entrée. */
export const GARAGE_SPEC: RoomSpec = {
  ...empty,
  name: 'garage',
  rect: GARAGE,
  floor: () => concrete(GARAGE),
  kitFloor: false,
  doors: [
    { wall: 'sud', u0: CAR_DOOR.x0, u1: CAR_DOOR.x1, garage: true },
    { wall: 'est', u0: GARAGE_DOOR.z0, u1: GARAGE_DOOR.z1 },
  ],
  joined: ['est'],
  windows: () => [{ wall: 'ouest', u0: -0.6, u1: 0.4, y0: 1.3, y1: WIN_HIGH }],
  items: [
    // au fond : l'établi et sa caisse à outils, l'étagère dans le coin
    ['etabli', GARAGE.x0 + 2.5, 0, GARAGE.z0 + 0.33, 0],
    ['caisse-outils', GARAGE.x0 + 2.2, BENCH_TOP, GARAGE.z0 + 0.3, 0],
    ['etagere-garage', GARAGE.x0 + 0.55, 0, GARAGE.z0 + 0.21, 0],
    ['carton', GARAGE.x0 + 0.55, 0.221, GARAGE.z0 + 0.22, 0],
    // des cartons empilés contre le mur ouest
    ['carton', GARAGE.x0 + 0.24, 0, GARAGE.z0 + 1.2, Q],
    ['carton', GARAGE.x0 + 0.24, 0.32, GARAGE.z0 + 1.2, Q],
    ['carton', GARAGE.x0 + 0.24, 0, GARAGE.z0 + 1.7, Q],
    // au fond, à droite de l'établi : le rangement à outils (le râteau et la bêche y pendent, remplissage.ts)
    ['rangement-outils', GARAGE.x0 + 4.0, RACK_Y, GARAGE.z0 + 0.15, 0],
    // le vélo garé le long du mur de l'entrée (un peu en retrait du mur sud : de quoi le sortir en reculant)
    ['velo', GARAGE.x1 - 0.6, 0, 1.4, Q],
  ],
};

/** Coin télé du salon : son milieu (x), la place du canapé et de la table basse (z). */
const SALON_TV = { x: (SALON.x0 + SALON.x1) / 2 + 0.15, sofa: 1.4, table: 0 };

/** Le salon : parquet, passage depuis la cuisine, portes de la salle de bain et de la chambre au fond. */
export const SALON_SPEC: RoomSpec = {
  ...empty,
  name: 'salon',
  rect: SALON,
  floor: () => parquet(SALON),
  kitFloor: false,
  doors: [
    { wall: 'ouest', u0: SALON_PASS.z0, u1: SALON_PASS.z1 },
    { wall: 'nord', u0: BATH_DOOR.x0, u1: BATH_DOOR.x1 },
    { wall: 'nord', u0: BED_DOOR.x0, u1: BED_DOOR.x1 },
  ],
  joined: ['ouest', 'nord'],
  windows: () => [
    { wall: 'sud', u0: SALON.x0 + 1.4, u1: SALON.x0 + 2.6, y0: 0.95, y1: WIN_HIGH },
    { wall: 'sud', u0: SALON.x1 - 2.6, u1: SALON.x1 - 1.4, y0: 0.95, y1: WIN_HIGH },
    { wall: 'est', u0: -0.6, u1: 0.6, y0: 0.95, y1: WIN_HIGH },
  ],
  items: [
    // le coin télé : le meuble télé au fond entre les deux portes, le canapé face à lui, la table basse entre les deux
    ['meuble-tele', SALON_TV.x, 0, SALON.z0 + 0.18, 0],
    ['television', SALON_TV.x, CONSOLE_TOP, SALON.z0 + 0.16, 0],
    ['canape', SALON_TV.x, 0, SALON_TV.sofa, Math.PI],
    ['table-basse', SALON_TV.x, 0, SALON_TV.table, 0],
    ['telecommande', SALON_TV.x + 0.22, 0.436, SALON_TV.table + 0.05, 0.3],
    // le fauteuil de côté, tourné vers la table basse, le lampadaire à côté de lui
    ['fauteuil', SALON.x1 - 1.3, 0, SALON_TV.table, -Q],
    ['lampadaire', SALON.x1 - 0.45, 0, SALON_TV.table - 1.2, 0],
    // la bibliothèque contre le mur de la cuisine, une pile de livres sur le rayon du milieu (couchés à plat)
    ['bibliotheque', SALON.x0 + 0.25, 0, 1.6, Q],
    ...['livre', 'livre-rouge', 'livre-vert', 'livre-ocre', 'livre-violet'].map((id, i): [string, number, number, number, number] => [id, SALON.x0 + 0.27, 0.877 + i * 0.046, 1.85, -Q]),
  ],
  decor: (room) => lay(room, 'tapis', SALON_TV.x, SALON_TV.table, 0, 0.5),
};

/** Salle de bain : place des toilettes le long du fond (x), du lavabo le long du mur ouest (z), sur les murs que la caméra voit. */
const BATH = { toilet: SALLE_DE_BAIN.x0 + 1.75, sink: SALLE_DE_BAIN.z1 - 1.95 };

/** La salle de bain : carrelage, petite fenêtre haute au fond, porte sur le salon. */
export const SALLE_DE_BAIN_SPEC: RoomSpec = {
  ...empty,
  name: 'salle de bain',
  rect: SALLE_DE_BAIN,
  floor: () => tiled(SALLE_DE_BAIN),
  doors: [{ wall: 'sud', u0: BATH_DOOR.x0, u1: BATH_DOOR.x1, inner: true, lock: true }],
  joined: ['sud', 'est'],
  windows: () => [{ wall: 'nord', u0: SALLE_DE_BAIN.x0 + 0.9, u1: SALLE_DE_BAIN.x0 + 1.6, y0: 1.45, y1: WIN_HIGH }],
  items: [
    // les toilettes au fond, sous la fenêtre ; le lavabo contre le mur ouest, après la douche
    ['toilettes', BATH.toilet, 0, SALLE_DE_BAIN.z0 + 0.27, 0],
    ['papier-toilette', BATH.toilet, 0.805, SALLE_DE_BAIN.z0 + 0.09, 0],
    // le porte-papier au mur, à droite des toilettes : on y accroche le rouleau
    ['derouleur', BATH.toilet + 0.4, 0.66, SALLE_DE_BAIN.z0 + 0.035, 0],
    ['lavabo', SALLE_DE_BAIN.x0 + 0.37, 0, BATH.sink, Q],
    // sur le rebord du lavabo : le verre à dents et sa brosse, le savon
    ['verre-dents', SALLE_DE_BAIN.x0 + 0.07, 0.94, BATH.sink - 0.2, 0],
    ['brosse-dents', SALLE_DE_BAIN.x0 + 0.07, 0.95, BATH.sink - 0.2, 0.3],
    ['savon-pain', SALLE_DE_BAIN.x0 + 0.07, 0.94, BATH.sink + 0.2, Q],
    // le porte-serviettes en face, la serviette sur sa barre du haut
    ['porte-serviettes', SALLE_DE_BAIN.x1 - 0.16, 0, BATH.sink, -Q],
    ['serviette', SALLE_DE_BAIN.x1 - 0.16, 0.5, BATH.sink, -Q],
    // la douche dans le coin du fond (la colonne est accrochée au mur, voir decor)
    ['douche', SALLE_DE_BAIN.x0 + 0.48, 0, SALLE_DE_BAIN.z0 + 0.48, 0],
    // le gel douche dans le coin de la douche
    ['gel-douche', SALLE_DE_BAIN.x0 + 0.1, 0.04, SALLE_DE_BAIN.z0 + 0.1, Q],
  ],
  decor: (room) => {
    // la colonne de la douche au mur, au-dessus du receveur (un objet : on y entre)
    hang(room, 'ouest', SALLE_DE_BAIN.z0 + 0.48, 0.95, 'douche-colonne');
    lay(room, 'tapis-bain', SALLE_DE_BAIN.x0 + 0.5, SALLE_DE_BAIN.z0 + 1.3, 0, 0.5);
    // le miroir au-dessus du lavabo
    hang(room, 'ouest', BATH.sink, 1.08, 'miroir-lavabo');
  },
};

/** Chambre : le milieu du lit (z). */
const BED = { z: (CHAMBRE.z0 + CHAMBRE.z1) / 2 + 0.05 };

/** La chambre : parquet, fenêtres au fond et à l'est, porte sur le salon. */
export const CHAMBRE_SPEC: RoomSpec = {
  ...empty,
  name: 'chambre',
  rect: CHAMBRE,
  floor: () => parquet(CHAMBRE),
  kitFloor: false,
  doors: [{ wall: 'sud', u0: BED_DOOR.x0, u1: BED_DOOR.x1, inner: true, flip: true }],
  joined: ['sud', 'ouest'],
  windows: () => [
    { wall: 'nord', u0: CHAMBRE.x0 + 1.5, u1: CHAMBRE.x0 + 2.5, y0: 0.95, y1: WIN_HIGH },
    { wall: 'est', u0: -6.0, u1: -5.0, y0: 0.95, y1: WIN_HIGH },
  ],
  items: [
    // le lit, la tête contre le mur ouest, une table de nuit de chaque côté
    ['lit', CHAMBRE.x0 + 1.03, 0, BED.z, Q],
    ['table-de-nuit', CHAMBRE.x0 + 0.25, 0, BED.z - 1.08, Q],
    ['table-de-nuit', CHAMBRE.x0 + 0.25, 0, BED.z + 1.08, Q],
    ['lampe-chevet', CHAMBRE.x0 + 0.22, NIGHTSTAND_TOP, BED.z - 1.08, Q],
    ['reveil', CHAMBRE.x0 + 0.22, NIGHTSTAND_TOP, BED.z + 1.18, Q],
    // le pull plié au pied du lit
    ['pull', CHAMBRE.x0 + 1.85, 0.63, BED.z, Q],
    // l'armoire au fond à droite de la fenêtre (la chemise sur son cintre dedans, remplissage.ts) ; la plante dans le coin
    ['armoire', CHAMBRE.x1 - 0.62, 0, CHAMBRE.z0 + 0.3, 0],
    ['sansevieria', CHAMBRE.x0 + 0.35, 0, CHAMBRE.z0 + 0.32, 0],
  ],
  decor: (room) => lay(room, 'tapis-chambre', CHAMBRE.x0 + 2.4, BED.z, 0, 0.5),
};
