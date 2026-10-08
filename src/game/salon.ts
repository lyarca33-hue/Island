/**
 * Le salon, à l'est de la cuisine : on y passe par le passage du mur est de la cuisine. Parquet,
 * télé contre le mur du fond, canapé tourné vers elle, table basse entre les deux sur un grand
 * tapis, lampadaire à côté du canapé, et la bibliothèque au fond avec sa chaise de lecture.
 */
import * as THREE from 'three';
import { box, DARK_WOOD, ROOM, SALON_PASS, toon, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec } from './room';
import { kentia } from './plants';

/** Intérieur du salon : son mur ouest est dos au mur est de la cuisine. */
export const SALON: Rect = { x0: ROOM.x1 + 2 * WALL_T, x1: ROOM.x1 + 2 * WALL_T + 5.2, z0: ROOM.z0, z1: ROOM.z1 };

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

/** Tapis, tableau au mur, plante dans le coin. */
function salonDecor(room: Room): void {
  const { x1, z1 } = room.rect;
  // grand tapis sous la table basse, bordure et centre
  room.group.add(
    box(3.0, 0.01, 2.6, toon(0x34506e), 6.6, 0.008, -0.15, false),
    box(2.7, 0.012, 2.3, toon(0xc9b48a), 6.6, 0.009, -0.15, false),
    box(2.3, 0.013, 1.9, toon(0xa7553f), 6.6, 0.0095, -0.15, false),
  );
  // tableau au mur ouest, derrière le canapé : un paysage de mer
  const pic = room.wallFrame('ouest', 0.2, 1.55);
  pic.add(
    box(0.03, 0.62, 0.9, toon(DARK_WOOD), 0.015, 0, 0, false),
    box(0.01, 0.26, 0.8, toon(0x9fd0e8), 0.032, 0.14, 0, false),
    box(0.01, 0.26, 0.8, toon(0x3f7fa8), 0.032, -0.12, 0, false),
    box(0.012, 0.08, 0.08, toon(0xf3d36b), 0.034, 0.18, -0.2, false),
  );
  room.wallGroup('ouest').add(pic);
  // plante en pot dans le coin sud-est (le coin nord-est reste libre pour un passage vers le nord)
  // les palmes s'ouvrent vers la pièce (nord-ouest), pas à travers les murs du coin
  const plant = kentia(-0.75 * Math.PI, 1.9);
  plant.position.set(x1 - 0.3, 0, z1 - 0.3);
  room.group.add(plant);
  room.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 1.2, 0.2)), pos: plant.position.clone(), yaw: 0, wall: false });
}

export const SALON_SPEC: RoomSpec = {
  name: 'salon',
  rect: SALON,
  floor: () => parquet(SALON),
  // passage vers la cuisine (ouest) et porte de la chambre (nord, x 7.6 à 8.4 : son battant est
  // dans chambre.ts)
  doors: [{ wall: 'ouest', u0: SALON_PASS.z0, u1: SALON_PASS.z1 }, { wall: 'nord', u0: 7.6, u1: 8.4 }],
  joined: ['ouest', 'nord'],
  windows: () => [
    // rideaux bleu canard, comme la bordure du tapis
    { wall: 'sud', u0: 5.3, u1: 6.5, y0: 0.95, y1: WIN_HIGH, curtain: 0x2f6f73 },
    { wall: 'est', u0: 1.25, u1: 2.25, y0: 0.95, y1: WIN_HIGH, curtain: 0x2f6f73 },
  ],
  lamps: () => [{ x: 5.25, z: 1.55, kind: 'lampadaire', shade: 0xb99a6c }],
  lightSwitch: { wall: 'ouest', u: SALON_PASS.z1 + 0.2 },
  runs: [
    { wall: 'nord', from: SALON.x0 + 0.25, items: ['bibliotheque'] },
    { wall: 'nord', from: 5.85, items: ['television'] },
  ],
  items: [
    // le canapé tourné vers la télé, la table basse entre les deux
    ['canape', 6.6, 0, 1.2, Math.PI],
    ['table-basse', 6.6, 0, -0.3, 0],
    // près de la bibliothèque, tournée vers la pièce : le coin lecture
    ['chaise', 5.15, 0, -2.15, -0.6],
  ],
  decor: salonDecor,
};
