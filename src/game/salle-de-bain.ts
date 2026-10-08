/**
 * La salle de bain, au nord de la cuisine (sans couvrir la fenêtre de l'évier) : on y entre par
 * la porte de son mur est, depuis la chambre. Carrelage blanc et bleu, faïence autour de la douche
 * et du lavabo, douche à l'italienne dans le coin, toilettes, lavabo et son miroir le long du
 * fond, puis la machine à laver et le sèche-linge sous la petite fenêtre haute ; porte-serviettes
 * contre le mur ouest, panier à linge dans le coin sud-est (la lessive : buanderie.ts).
 */
import * as THREE from 'three';
import { box, ROOM, tiles, toon, WALL_T, type Anchors, type Rect, type Room, type RoomSpec } from './room';

/** Intérieur de la salle de bain : son mur sud est dos au mur nord de la cuisine. */
export const BATHROOM: Rect = { x0: -0.85, x1: ROOM.x1, z0: -6.2, z1: ROOM.z0 - 2 * WALL_T };
/** Porte vers la chambre (mur est), de z0 à z1. */
export const BATHROOM_DOOR = { z0: -5.2, z1: -4.4 };
/** Hauteur de la faïence au mur. */
const FAIENCE_H = 2.0;

/** Petits carreaux blancs et bleu pâle, carreaux de 20 cm. */
function bathFloor(r: Rect): THREE.Material {
  const tex = tiles(256, 4, '#f3f5f4', '#cfe0e6', '#b9c7cc', 3);
  tex.repeat.set((r.x1 - r.x0) / 0.8, (r.z1 - r.z0) / 0.8);
  return toon(0xffffff, tex);
}

/** Faïence (carreaux de 15 cm, blancs à joints gris) posée contre le mur nord, de `u0` à `u1`, jusqu'à `h`. */
function faience(room: Room, u0: number, u1: number, h: number): void {
  const tex = tiles(128, 2, '#eef4f5', '#e4eef0', '#c6d2d5', 2);
  tex.repeat.set((u1 - u0) / 0.3, h / 0.3);
  const f = room.wallFrame('nord', (u0 + u1) / 2);
  // le Z local du repère suit le mur vers -x
  f.add(box(0.012, h, u1 - u0, toon(0xffffff, tex), 0.006, h / 2, 0, false));
  room.wallGroup('nord').add(f);
}

/** Faïence derrière la douche et le lavabo, tapis de bain, rouleau de papier, patère. */
function bathroomDecor(room: Room, anchor: Anchors): void {
  const { x0, z0 } = room.rect;
  const shower = anchor('douche');
  const toilet = anchor('toilettes');
  const sink = anchor('lavabo');
  // faïence tout le long du fond, jusqu'au bout du lavabo
  faience(room, x0, (sink?.x ?? 1.3) + 0.45, FAIENCE_H);
  // et sur le mur ouest, à côté de la douche
  const side = room.wallFrame('ouest', z0 + 0.55);
  const tex = tiles(128, 2, '#eef4f5', '#e4eef0', '#c6d2d5', 2);
  tex.repeat.set(1.1 / 0.3, FAIENCE_H / 0.3);
  side.add(box(0.012, FAIENCE_H, 1.1, toon(0xffffff, tex), 0.006, FAIENCE_H / 2, 0, false));
  room.wallGroup('ouest').add(side);
  // tapis de bain devant la douche
  if (shower) room.group.add(box(0.7, 0.012, 0.45, toon(0x7fb3cf), shower.x, 0.008, shower.z + 0.78, false), box(0.62, 0.014, 0.37, toon(0xa9cfe2), shower.x, 0.009, shower.z + 0.78, false));
  // rouleau de papier au mur, à droite des toilettes (vu de face)
  if (toilet) {
    const roll = room.wallFrame('nord', toilet.x + 0.36, 0.72);
    const chrome = toon(0xc8ced4);
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 16), toon(0xfbfbf6));
    paper.position.set(0.09, -0.03, 0);
    paper.rotation.x = Math.PI / 2;
    roll.add(box(0.1, 0.02, 0.02, chrome, 0.05, 0, 0.06, false), box(0.1, 0.02, 0.02, chrome, 0.05, 0, -0.06, false), paper);
    room.wallGroup('nord').add(roll);
  }
  // patère et peignoir à côté de la porte
  const hook = room.wallFrame('est', BATHROOM_DOOR.z1 + 0.55, 1.6);
  hook.add(
    box(0.03, 0.03, 0.03, toon(0xc8ced4), 0.015, 0, 0, false),
    box(0.06, 0.75, 0.32, toon(0xf0e6ea), 0.05, -0.38, 0),
    box(0.065, 0.06, 0.33, toon(0xd9c3cc), 0.05, -0.45, 0, false),
  );
  room.wallGroup('est').add(hook);
}

export const BATHROOM_SPEC: RoomSpec = {
  name: 'salle de bain',
  rect: BATHROOM,
  floor: () => bathFloor(BATHROOM),
  // la porte vers la chambre : son battant est dans chambre.ts
  doors: [{ wall: 'est', u0: BATHROOM_DOOR.z0, u1: BATHROOM_DOOR.z1 }],
  joined: ['sud', 'est'],
  // petite fenêtre haute au fond, au-dessus de rien
  windows: () => [{ wall: 'nord', u0: 2.15, u1: 2.85, y0: 1.45, y1: 2.05 }],
  lamps: () => [{ x: (BATHROOM.x0 + BATHROOM.x1) / 2, z: (BATHROOM.z0 + BATHROOM.z1) / 2, kind: 'suspension', shade: 0xe9eef0 }],
  lightSwitch: { wall: 'est', u: BATHROOM_DOOR.z1 + 0.2 },
  runs: [
    // douche dans le coin, toilettes, puis le lavabo et son miroir
    // puis, sous la petite fenêtre, la machine à laver et le sèche-linge côte à côte (buanderie.ts)
    { wall: 'nord', from: BATHROOM.x0, items: ['douche', 0.25, 'toilettes', 0.35, 'lavabo', 0.12, 'machine-a-laver', 0.04, 'seche-linge'] },
    { wall: 'ouest', from: BATHROOM.z0 + 1.35, items: ['porte-serviettes'] },
  ],
  // le panier à linge en osier dans le coin sud-est, sous le peignoir : chaque douche y laisse une tenue sale
  items: [
    ['panier-linge', BATHROOM.x1 - 0.3, 0, BATHROOM.z1 - 0.3, 0],
    // l'étendoir, dehors au soleil devant la cuisine : on le rentre (on le pousse) quand il pleut
    ['etendoir', -1.3, 0, 3.95, 0],
  ],
  decor: bathroomDecor,
};
