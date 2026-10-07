/**
 * La chambre, au nord du salon : on y entre par le passage du mur nord du salon ; la porte du mur
 * ouest mène à la salle de bain. Parquet clair,
 * le lit tête contre le mur du fond entre deux tables de nuit (la lampe de chevet sur l'une),
 * l'armoire contre le mur est, un tapis au pied du lit, une suspension au plafond.
 */
import * as THREE from 'three';
import { BATHROOM_DOOR } from './salle-de-bain';
import { box, DARK_WOOD, toon, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec } from './room';
import { SALON } from './salon';

/** Intérieur de la chambre : son mur sud est dos au mur nord du salon. */
export const CHAMBRE: Rect = { x0: SALON.x0, x1: SALON.x1, z0: SALON.z0 - 2 * WALL_T - 5.36, z1: SALON.z0 - 2 * WALL_T };
/** Passage entre le salon et la chambre (x), au bout du mur, après la télé du salon. */
export const CHAMBRE_PASS = { x0: 7.6, x1: 8.4 };

/** Parquet clair : lames de chêne de tons voisins, posées en quinconce. */
function parquet(r: Rect): THREE.Material {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const tones = ['#d9b98c', '#e0c294', '#d2b083', '#dcbd8f', '#d6b588'];
  const rows = 8, h = 256 / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * 128;
    for (let i = -1; i < 2; i++) {
      g.fillStyle = tones[(j * 3 + i + 5) % tones.length];
      g.fillRect(off + i * 128, j * h, 128, h);
    }
    g.fillStyle = 'rgba(110,75,40,0.45)';
    g.fillRect(0, j * h + h - 2, 256, 2);
    g.fillRect(off, j * h, 2, h);
    g.fillRect((off + 128) % 256, j * h, 2, h);
    g.fillStyle = 'rgba(130,90,50,0.15)';
    for (let k = 0; k < 6; k++) g.fillRect((k * 53 + j * 31) % 256, j * h + 6 + (k % 3) * 8, 40, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set((r.x1 - r.x0) / 1.6, (r.z1 - r.z0) / 1.6);
  return toon(0xffffff, tex);
}

/** Tapis au pied du lit, descente de lit, tableau au mur ouest, plante dans un coin. */
function chambreDecor(room: Room, anchor: (id: string) => THREE.Vector3 | undefined): void {
  const { x0, z1 } = room.rect;
  const bed = anchor('lit');
  const bx = bed?.x ?? 5.5, bz = bed?.z ?? -7.4;
  // tapis rond (octogone) au pied du lit, débordant sous le lit
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.012, 8), toon(0x8a5a8c));
  rug.position.set(bx, 0.008, bz + 1.35);
  rug.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.014, 8), toon(0xe8d6b0));
  inner.position.set(bx, 0.009, bz + 1.35);
  inner.receiveShadow = true;
  room.group.add(rug, inner);
  // descente de lit côté porte
  room.group.add(box(0.5, 0.01, 0.9, toon(0x6d9a8c), bx + 1.15, 0.008, bz + 0.1, false));
  // tableau au mur ouest : un ciel étoilé
  const pic = room.wallFrame('ouest', -6.0, 1.5);
  pic.add(
    box(0.03, 0.55, 0.75, toon(DARK_WOOD), 0.015, 0, 0, false),
    box(0.01, 0.47, 0.67, toon(0x1f2f5a), 0.032, 0, 0, false),
    box(0.012, 0.09, 0.09, toon(0xf3e3a0), 0.034, 0.12, 0.18, false),
    box(0.012, 0.03, 0.03, toon(0xffffff), 0.034, -0.1, -0.2, false),
    box(0.012, 0.03, 0.03, toon(0xffffff), 0.034, 0.15, -0.12, false),
    box(0.012, 0.03, 0.03, toon(0xffffff), 0.034, -0.05, 0.05, false),
  );
  room.wallGroup('ouest').add(pic);
  // plante en pot dans le coin sud-ouest
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.3, 18), toon(0xd9d3c5));
  pot.position.y = 0.15;
  plant.add(pot);
  for (const [x, z, h] of [[0, 0, 0.7], [0.08, 0.04, 0.55], [-0.07, 0.06, 0.6], [0.04, -0.08, 0.5]]) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 8), toon(0x4f8a3c));
    leaf.position.set(x, 0.3 + h / 2, z);
    plant.add(leaf);
  }
  plant.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  plant.position.set(x0 + 0.3, 0, z1 - 0.3);
  room.group.add(plant);
  room.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-0.17, 0, -0.17), new THREE.Vector3(0.17, 1.0, 0.17)), pos: plant.position.clone(), yaw: 0, wall: false });
}

export const CHAMBRE_SPEC: RoomSpec = {
  name: 'chambre',
  rect: CHAMBRE,
  floor: () => parquet(CHAMBRE),
  // passage vers le salon (sud) et porte de la salle de bain (ouest : voir salle-de-bain.ts)
  doors: [{ wall: 'sud', u0: CHAMBRE_PASS.x0, u1: CHAMBRE_PASS.x1 }, { wall: 'ouest', u0: BATHROOM_DOOR.z0, u1: BATHROOM_DOOR.z1 }],
  joined: ['sud'],
  windows: (anchor) => {
    const bx = anchor('lit')?.x ?? 5.5;
    return [
      // au-dessus de la tête de lit, et sur le mur est, à côté de l'armoire
      { wall: 'nord', u0: bx - 0.45, u1: bx + 0.45, y0: 1.25, y1: WIN_HIGH },
      { wall: 'est', u0: -6.3, u1: -5.3, y0: 0.95, y1: WIN_HIGH },
    ];
  },
  lamps: () => [{ x: 6.0, z: -5.6, kind: 'suspension', shade: 0x8a5a8c }],
  lightSwitch: { wall: 'sud', u: CHAMBRE_PASS.x0 - 0.2 },
  runs: [
    // le lit entre ses deux tables de nuit, tête contre le mur du fond
    { wall: 'nord', from: CHAMBRE.x0 + 0.85, items: ['table-de-nuit', 0.04, 'lit', 0.04, 'table-de-nuit'] },
    { wall: 'est', from: CHAMBRE.z0 + 0.35, items: ['armoire'] },
  ],
  onTop: [['lampe-chevet', 'table-de-nuit']],
  decor: chambreDecor,
};
