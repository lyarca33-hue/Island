/**
 * La pièce de la cuisine : carrelage au sol, quatre murs, une porte d'entrée (qui s'ouvre seule
 * quand le perso s'en approche), deux fenêtres, et le décor fixé aux murs (crédence, hotte,
 * étagère, horloge qui donne l'heure du jeu, meuble d'angle).
 *
 * Murs « en coupe » comme dans les Sims : les murs tournés vers la caméra s'abaissent à hauteur
 * de plinthe pour qu'on voie dedans ; ils se relèvent quand la caméra tourne. Le perso hors de la
 * pièce, derrière un mur, le fait aussi s'abaisser.
 *
 * Les meubles sont rangés contre les murs par rangées (RUNS) : chacun dos au mur, collé au
 * précédent ; leurs places viennent de leurs boîtes (placeRuns), pas de coordonnées à la main.
 */
import * as THREE from 'three';
import { createToonMaterial } from './toon';
import type { WorldItem } from './items/carry';

/** Intérieur de la pièce (m) : x de x0 à x1, z de z0 à z1. Le fond (nord) est à z0. */
export const ROOM = { x0: -3.2, x1: 3.2, z0: -2.8, z1: 2.8 };
/** Hauteur et épaisseur des murs, hauteur d'un mur abaissé (en coupe). */
const WALL_H = 2.5;
const WALL_T = 0.12;
const CUT_H = 0.2;
/** Porte d'entrée (mur ouest) : de z0 à z1, hauteur. */
const DOOR = { z0: 1.35, z1: 2.25, h: 2.08 };
/** Distance (m) à laquelle la porte s'ouvre devant le perso, et sa vitesse (ouverture par seconde). */
const DOOR_NEAR = 1.4;
const DOOR_SPEED = 1.8;
/** Bas et haut des fenêtres (celle du fond, au-dessus de l'évier, passe au-dessus du robinet). */
const WIN_LOW = 1.3;
const WIN_HIGH = 2.1;
/** Hauteur du plan de travail : le haut des meubles bas, le bas de la crédence. */
const COUNTER_H = 0.9;

const PLASTER = 0xefe5cf;
const CAP = 0x7c6a58;
const SKIRT = 0x8a6440;
const FRAME = 0xf6f3ec;
const WOOD = 0x8a6440;
const DARK_WOOD = 0x5d4129;
const COUNTER = 0xd9d3c5;

export type WallName = 'nord' | 'sud' | 'est' | 'ouest';

interface WallSpec {
  /** Normale vers l'intérieur de la pièce (x, z). */
  n: [number, number];
  /** Rotation d'un meuble dos à ce mur (son avant, +Z, vers la pièce). */
  yaw: number;
}

const WALLS: Record<WallName, WallSpec> = {
  nord: { n: [0, 1], yaw: 0 },
  sud: { n: [0, -1], yaw: Math.PI },
  ouest: { n: [1, 0], yaw: Math.PI / 2 },
  est: { n: [-1, 0], yaw: -Math.PI / 2 },
};

/**
 * Rangées de meubles, dos au mur, dans l'ordre de x (murs nord et sud) ou de z (est, ouest)
 * croissant à partir de `from` ; un nombre laisse un écart (m).
 *
 * Le long du fond : lave-vaisselle à côté de l'évier (sous la fenêtre), plan de travail pour
 * couper entre l'évier et la gazinière, tiroir à couverts, puis le frigo au bout. Le long du mur
 * ouest : le coin café, le placard à vaisselle (micro-ondes dessus), le four, la poubelle. Les deux
 * rangées partent du meuble d'angle. La bibliothèque (livres de cuisine) au fond, après le frigo.
 */
export const RUNS: Array<{ wall: WallName; from: number; items: Array<string | number> }> = [
  { wall: 'nord', from: ROOM.x0 + 0.6, items: ['lave-vaisselle', 'evier', 'plan-de-travail', 'gaziniere', 'tiroir', 0.04, 'congelateur'] },
  { wall: 'ouest', from: ROOM.z0 + 0.6, items: ['machine-a-cafe', 'placard', 'four', 0.04, 'poubelle'] },
  { wall: 'nord', from: 2.05, items: ['bibliotheque'] },
];

/** Posés sur un autre meuble au départ : [objet, meuble dessous]. */
export const ON_TOP: Array<[string, string]> = [['micro-ondes', 'placard'], ['bouilloire', 'tiroir'], ['frigo', 'congelateur']];

/**
 * Range les meubles des rangées (RUNS) contre leurs murs. `pick(id)` donne le prochain objet de
 * ce type pas encore placé.
 */
export function placeRuns(pick: (id: string) => WorldItem | undefined): void {
  for (const run of RUNS) {
    const w = WALLS[run.wall];
    const [nx, nz] = w.n;
    // axe le long du mur (x ou z croissant) ; l'axe X du meuble tourné, dans le monde
    const along = nx === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const localX = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const s = along.dot(localX) > 0 ? 1 : -1;
    // coordonnée de la face intérieure du mur, mesurée le long de la normale
    const wallV = nx > 0 ? ROOM.x0 : nx < 0 ? -ROOM.x1 : nz > 0 ? ROOM.z0 : -ROOM.z1;
    let cursor = run.from;
    for (const id of run.items) {
      if (typeof id === 'number') {
        cursor += id;
        continue;
      }
      const it = pick(id);
      if (!it) continue;
      const b = it.box;
      const u = s > 0 ? cursor - b.min.x : cursor + b.max.x;
      const v = wallV - b.min.z + 0.01;
      it.object.position.set(along.x * u + nx * v, 0, along.z * u + nz * v);
      it.object.rotation.y = w.yaw;
      cursor += b.max.x - b.min.x;
    }
  }
}

const toon = (color: THREE.ColorRepresentation, map: THREE.Texture | null = null) => createToonMaterial({ color, map, rimStrength: 0 });

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Texture de carreaux : `n` × `n` carreaux de deux tons, joints clairs. */
function tiles(size: number, n: number, a: string, b: string, grout: string, line = 3): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const t = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? b : a;
    g.fillRect(i * t, j * t, t, t);
  }
  g.strokeStyle = grout;
  g.lineWidth = line;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * t); g.lineTo(size, i * t); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Ouverture dans un mur, le long du mur (u, coordonnée monde) et en hauteur. */
interface Opening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/** Un mur : sa partie haute (cachée en coupe), sa partie basse (montrée en coupe). */
interface Wall {
  name: WallName;
  n: THREE.Vector2;
  /** Un point de la face intérieure. */
  at: THREE.Vector2;
  full: THREE.Group;
  low: THREE.Group;
  cut: boolean;
}

/** Repères pour accrocher le décor au-dessus des meubles : position des meubles placés. */
export type Anchors = (id: string) => THREE.Vector3 | undefined;

export class Room {
  readonly group = new THREE.Group();
  /** Morceaux de mur pleins (et meuble d'angle) que le perso contourne : boîte, position, rotation. */
  readonly obstacles: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> = [];
  private walls: Wall[] = [];
  private door: THREE.Group;
  private doorOpen = 0;
  private hands: { hour: THREE.Object3D; minute: THREE.Object3D };
  private wallMat = toon(PLASTER);
  private capMat = toon(CAP);
  /** Murs pleins visibles, pour les clics (un clic sur un mur vise le sol à son pied). */
  private solid: THREE.Object3D[] = [];

  constructor(anchor: Anchors) {
    this.group.name = 'piece';
    const { x0, x1, z0, z1 } = ROOM;
    const sinkX = anchor('evier')?.x ?? -1.6;
    const stoveX = anchor('gaziniere')?.x ?? 0;
    const worktopX = anchor('plan-de-travail')?.x ?? -0.7;
    const coffeeZ = anchor('machine-a-cafe')?.z ?? -1.9;
    const tableAt = anchor('table');

    // sol carrelé, sous la pièce et le seuil de la porte
    const floorTex = tiles(256, 2, '#efe4cf', '#d9c7a6', '#c2b293', 4);
    floorTex.repeat.set((x1 - x0) / 0.8, (z1 - z0) / 0.8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), toon(0xffffff, floorTex));
    floor.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    floor.receiveShadow = true;
    floor.name = 'carrelage';
    this.group.add(floor);
    this.group.add(box(WALL_T, 0.012, DOOR.z1 - DOOR.z0, toon(DARK_WOOD), x0 - WALL_T / 2, 0.006, (DOOR.z0 + DOOR.z1) / 2, false));

    // les murs (nord et sud couvrent les coins)
    const winNorth: Opening = { u0: sinkX - 0.5, u1: sinkX + 0.5, y0: WIN_LOW, y1: WIN_HIGH };
    const winEast: Opening = { u0: (tableAt?.z ?? 1) - 0.55, u1: (tableAt?.z ?? 1) + 0.55, y0: 0.95, y1: WIN_HIGH };
    const doorway: Opening = { u0: DOOR.z0, u1: DOOR.z1, y0: 0, y1: DOOR.h };
    this.addWall('nord', x0 - WALL_T, x1 + WALL_T, [winNorth]);
    this.addWall('sud', x0 - WALL_T, x1 + WALL_T, []);
    this.addWall('ouest', z0, z1, [doorway]);
    this.addWall('est', z0, z1, [winEast]);
    const north = this.wall('nord'), west = this.wall('ouest'), east = this.wall('est');
    this.addWindow(north, winNorth);
    this.addWindow(east, winEast);

    // porte d'entrée : chambranle côté pièce, battant qui s'ouvre vers l'extérieur
    const frame = toon(FRAME);
    const zc = (DOOR.z0 + DOOR.z1) / 2;
    west.full.add(
      box(0.03, DOOR.h + 0.06, 0.06, frame, x0 + 0.015, (DOOR.h + 0.06) / 2, DOOR.z0 - 0.03),
      box(0.03, DOOR.h + 0.06, 0.06, frame, x0 + 0.015, (DOOR.h + 0.06) / 2, DOOR.z1 + 0.03),
      box(0.03, 0.06, DOOR.z1 - DOOR.z0 + 0.12, frame, x0 + 0.015, DOOR.h + 0.03, zc),
    );
    const leafMat = toon(0x6f8f74);
    const leafW = DOOR.z1 - DOOR.z0 - 0.02;
    this.door = new THREE.Group();
    this.door.name = 'porte-entree';
    this.door.position.set(x0 - WALL_T + 0.02, 0, DOOR.z0 + 0.01);
    this.door.add(
      box(0.04, DOOR.h - 0.02, leafW, leafMat, 0, (DOOR.h - 0.02) / 2 + 0.01, leafW / 2),
      // panneaux moulurés et poignée, côté pièce
      box(0.01, 0.75, leafW - 0.24, toon(0x5f7d64), 0.025, 1.45, leafW / 2),
      box(0.01, 0.75, leafW - 0.24, toon(0x5f7d64), 0.025, 0.55, leafW / 2),
      box(0.04, 0.03, 0.12, toon(0xc9a24a), 0.045, 1.0, leafW - 0.1),
      box(0.04, 0.03, 0.12, toon(0xc9a24a), -0.045, 1.0, leafW - 0.1),
    );
    west.full.add(this.door);
    // paillasson devant la porte
    this.group.add(box(0.5, 0.012, 0.8, toon(0x9b6b3d), x0 + 0.32, 0.008, zc, false));

    // crédence carrelée au-dessus des plans de travail, du coin au frigo et au bout de la rangée ouest
    const fridge = anchor('frigo');
    const bin = anchor('poubelle');
    const splashTex = tiles(128, 4, '#dfecef', '#cfe1e6', '#ffffff', 2);
    const splashN = (fridge ? fridge.x - 0.32 : 0.9) - x0;
    const texN = splashTex.clone();
    texN.repeat.set(splashN / 0.4, 1);
    texN.needsUpdate = true;
    const splashH = WIN_LOW - COUNTER_H;
    north.full.add(box(splashN, splashH, 0.012, toon(0xffffff, texN), x0 + splashN / 2, COUNTER_H + splashH / 2, z0 + 0.006, false));
    const splashW = (bin ? bin.z + 0.2 : -0.5) - z0;
    const texW = splashTex.clone();
    texW.repeat.set(splashW / 0.4, 1);
    texW.needsUpdate = true;
    west.full.add(box(0.012, splashH, splashW, toon(0xffffff, texW), x0 + 0.006, COUNTER_H + splashH / 2, z0 + splashW / 2, false));

    // hotte au-dessus de la gazinière
    const inox = toon(0xc3c8cd);
    north.full.add(
      box(0.62, 0.1, 0.48, inox, stoveX, 1.68, z0 + 0.24),
      box(0.5, 0.12, 0.36, inox, stoveX, 1.79, z0 + 0.18),
      box(0.26, WALL_H - 1.85, 0.24, inox, stoveX, (WALL_H + 1.85) / 2, z0 + 0.12),
      box(0.5, 0.01, 0.4, toon(0x55595e), stoveX, 1.628, z0 + 0.25, false),
    );

    // étagère au-dessus du plan de travail : pots à épices et bocaux
    const shelf = new THREE.Group();
    shelf.add(
      box(0.86, 0.03, 0.2, toon(WOOD), 0, 1.6, z0 + 0.1),
      box(0.02, 0.12, 0.16, toon(DARK_WOOD), -0.33, 1.53, z0 + 0.08),
      box(0.02, 0.12, 0.16, toon(DARK_WOOD), 0.33, 1.53, z0 + 0.08),
    );
    const jars: Array<[number, number, number, number]> = [[-0.32, 0.04, 0.13, 0xd65b3a], [-0.22, 0.04, 0.13, 0x6d9a3e], [-0.12, 0.04, 0.13, 0xe0b23a], [0.06, 0.065, 0.2, 0xb8c7cc], [0.22, 0.065, 0.24, 0xb8c7cc]];
    for (const [x, r, h, c] of jars) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), toon(c));
      jar.position.set(x, 1.615 + h / 2, z0 + 0.1);
      jar.castShadow = true;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 14), toon(DARK_WOOD));
      lid.position.set(x, 1.615 + h + 0.01, z0 + 0.1);
      shelf.add(jar, lid);
    }
    shelf.position.x = worktopX;
    north.full.add(shelf);

    // horloge au-dessus du coin café : elle donne l'heure du jeu
    const clock = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32).rotateZ(Math.PI / 2), toon(0xfbf8f0));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 8, 32).rotateY(Math.PI / 2), toon(DARK_WOOD));
    clock.add(face, rim);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = box(0.01, i % 3 ? 0.02 : 0.035, 0.012, toon(0x333333), 0.016, Math.cos(a) * 0.135, Math.sin(a) * 0.135, false);
      tick.rotation.x = a;
      clock.add(tick);
    }
    const hand = (len: number, w: number) => {
      const pivot = new THREE.Group();
      pivot.position.x = 0.022;
      pivot.add(box(0.006, len, w, toon(0x222222), 0, len / 2 - 0.02, 0, false));
      clock.add(pivot);
      return pivot;
    };
    this.hands = { hour: hand(0.09, 0.016), minute: hand(0.13, 0.01) };
    clock.position.set(x0 + 0.02, 1.85, coffeeZ);
    west.full.add(clock);

    // meuble d'angle (les deux rangées partent de lui), une plante dessus
    const corner = new THREE.Group();
    corner.add(
      box(0.6, COUNTER_H - 0.04, 0.6, toon(WOOD), 0, (COUNTER_H - 0.04) / 2, 0),
      box(0.62, 0.04, 0.62, toon(COUNTER), 0, COUNTER_H - 0.02, 0),
      box(0.58, 0.08, 0.02, toon(DARK_WOOD), 0, 0.04, 0.3),
    );
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.16, 16), toon(0xb5653a));
    pot.position.set(-0.06, COUNTER_H + 0.08, -0.06);
    corner.add(pot);
    for (const [x, z, h] of [[0, 0, 0.32], [0.06, 0.03, 0.24], [-0.05, 0.05, 0.27], [0.03, -0.06, 0.22]]) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 8), toon(0x4f8a3c));
      leaf.position.set(-0.06 + x, COUNTER_H + 0.16 + h / 2, -0.06 + z);
      leaf.castShadow = true;
      corner.add(leaf);
    }
    corner.position.set(x0 + 0.3, 0, z0 + 0.3);
    corner.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
    this.group.add(corner);
    this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-0.31, 0, -0.31), new THREE.Vector3(0.31, COUNTER_H, 0.31)), pos: corner.position.clone(), yaw: 0, wall: false });

    // tapis sous la table et sa chaise
    if (tableAt) this.group.add(box(2, 0.01, 2.1, toon(0xb04a3c), tableAt.x, 0.008, tableAt.z - 0.45, false), box(1.8, 0.012, 1.9, toon(0xd8b07a), tableAt.x, 0.009, tableAt.z - 0.45, false));
    // tapis devant l'évier
    this.group.add(box(0.8, 0.01, 0.45, toon(0x5b7fa8), sinkX, 0.008, z0 + 1.0, false));
  }

  private wall(name: WallName): Wall {
    return this.walls.find((w) => w.name === name)!;
  }

  /**
   * Construit un mur de `a` à `b` (le long de x pour nord et sud, de z pour est et ouest), percé
   * de ses ouvertures : morceaux pleins de toute hauteur, allèges et linteaux autour des ouvertures.
   */
  private addWall(name: WallName, a: number, b: number, openings: Opening[]): void {
    const { x0, x1, z0, z1 } = ROOM;
    const [nx, nz] = WALLS[name].n;
    const alongX = nx === 0;
    // centre de l'épaisseur du mur, côté extérieur de la pièce
    const c = nz > 0 ? z0 - WALL_T / 2 : nz < 0 ? z1 + WALL_T / 2 : nx > 0 ? x0 - WALL_T / 2 : x1 + WALL_T / 2;
    const inner = nz > 0 ? z0 : nz < 0 ? z1 : nx > 0 ? x0 : x1;
    const full = new THREE.Group(), low = new THREE.Group();
    const piece = (u0: number, u1: number, y0: number, y1: number, mat: THREE.Material, to: THREE.Group, t = WALL_T, off = 0) => {
      if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return null;
      const u = (u0 + u1) / 2, len = u1 - u0;
      const m = alongX ? box(len, y1 - y0, t, mat, u, (y0 + y1) / 2, c + off) : box(t, y1 - y0, len, mat, c + off, (y0 + y1) / 2, u);
      to.add(m);
      return m;
    };
    const sorted = [...openings].sort((p, q) => p.u0 - q.u0);
    let u = a;
    const solidRuns: Array<[number, number]> = [];
    for (const o of sorted) {
      piece(u, o.u0, 0, WALL_H, this.wallMat, full);
      solidRuns.push([u, o.u0]);
      // allège sous une fenêtre, linteau au-dessus
      piece(o.u0, o.u1, 0, o.y0, this.wallMat, full);
      piece(o.u0, o.u1, o.y1, WALL_H, this.wallMat, full);
      if (o.y0 > 0) solidRuns.push([o.u0, o.u1]);
      u = o.u1;
    }
    piece(u, b, 0, WALL_H, this.wallMat, full);
    solidRuns.push([u, b]);
    // dessus du mur (la tranche, plus sombre), et le mur abaissé en coupe
    const caps: Array<[number, number]> = [];
    for (const [s, e] of solidRuns) {
      if (caps.length && Math.abs(caps[caps.length - 1][1] - s) < 1e-6) caps[caps.length - 1][1] = e;
      else caps.push([s, e]);
    }
    for (const [s, e] of caps) {
      piece(s, e, WALL_H, WALL_H + 0.02, this.capMat, full, WALL_T + 0.004);
      piece(s, e, 0, CUT_H, this.wallMat, low);
      piece(s, e, CUT_H, CUT_H + 0.02, this.capMat, low, WALL_T + 0.004);
      // plinthe côté pièce, toujours visible
      const skirt = piece(s, e, 0, 0.08, toon(SKIRT), this.group, 0.016, inner + (nx + nz) * 0.008 - c);
      if (skirt) skirt.castShadow = false;
      // le perso contourne le mur (sauf la porte)
      const len = e - s;
      const half = alongX ? new THREE.Vector3(len / 2, WALL_H / 2, WALL_T / 2) : new THREE.Vector3(WALL_T / 2, WALL_H / 2, len / 2);
      const pos = alongX ? new THREE.Vector3((s + e) / 2, 0, c) : new THREE.Vector3(c, 0, (s + e) / 2);
      this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-half.x, 0, -half.z), new THREE.Vector3(half.x, WALL_H, half.z)), pos, yaw: 0, wall: true });
    }
    low.visible = false;
    this.group.add(full, low);
    this.walls.push({ name, n: new THREE.Vector2(nx, nz), at: alongX ? new THREE.Vector2(0, inner) : new THREE.Vector2(inner, 0), full, low, cut: false });
    full.traverse((o) => { if (o instanceof THREE.Mesh) this.solid.push(o); });
  }

  /** Fenêtre dans l'ouverture `o` du mur : cadre, croisillon, vitre, rebord côté pièce. */
  private addWindow(w: Wall, o: Opening): void {
    const alongX = w.n.x === 0;
    const inner = alongX ? w.at.y : w.at.x;
    const sgn = alongX ? w.n.y : w.n.x;
    const c = inner - sgn * WALL_T / 2;
    const frame = toon(FRAME);
    const glass = new THREE.MeshBasicMaterial({ color: 0xbfe3f2, transparent: true, opacity: 0.35, depthWrite: false });
    const add = (u: number, y: number, lu: number, ly: number, t: number, mat: THREE.Material, off = 0) => {
      const m = alongX ? box(lu, ly, t, mat, u, y, c + off) : box(t, ly, lu, mat, c + off, y, u);
      m.castShadow = false;
      w.full.add(m);
      return m;
    };
    const um = (o.u0 + o.u1) / 2, ym = (o.y0 + o.y1) / 2, lu = o.u1 - o.u0, ly = o.y1 - o.y0, f = 0.05;
    add(o.u0 + f / 2, ym, f, ly, WALL_T, frame);
    add(o.u1 - f / 2, ym, f, ly, WALL_T, frame);
    add(um, o.y0 + f / 2, lu, f, WALL_T, frame);
    add(um, o.y1 - f / 2, lu, f, WALL_T, frame);
    add(um, ym, 0.03, ly, 0.05, frame);
    add(um, ym, lu, 0.03, 0.05, frame);
    const pane = add(um, ym, lu - 2 * f, ly - 2 * f, 0.01, glass);
    pane.receiveShadow = false;
    pane.name = 'vitre';
    // rebord, qui dépasse un peu dans la pièce
    add(um, o.y0 - 0.015, lu + 0.08, 0.03, WALL_T + 0.06, frame, sgn * 0.03);
  }

  /**
   * À chaque image : murs abaissés côté caméra (et entre la caméra et le perso s'il est dehors),
   * porte qui s'ouvre devant le perso, aiguilles de l'horloge.
   */
  update(dt: number, cameraYaw: number, player: THREE.Vector3, hour: number): void {
    const view = new THREE.Vector2(Math.cos(cameraYaw), Math.sin(cameraYaw));
    for (const w of this.walls) {
      const facing = w.n.dot(view);
      // le perso de l'autre côté du mur (dehors), et le mur entre lui et la caméra
      const outside = new THREE.Vector2(player.x, player.z).sub(w.at).dot(w.n) < 0;
      const cut = facing < -0.1 || (outside && facing > 0.1);
      if (cut !== w.cut) {
        w.cut = cut;
        w.full.visible = !cut;
        w.low.visible = cut;
      }
    }
    const { x0 } = ROOM;
    const zc = (DOOR.z0 + DOOR.z1) / 2;
    const near = Math.hypot(player.x - x0, player.z - zc) < DOOR_NEAR;
    this.doorOpen = THREE.MathUtils.clamp(this.doorOpen + (near ? 1 : -1) * DOOR_SPEED * dt, 0, 1);
    this.door.rotation.y = -THREE.MathUtils.smootherstep(this.doorOpen, 0, 1) * THREE.MathUtils.degToRad(100);
    const m = ((hour % 12) + 12) % 12;
    this.hands.hour.rotation.x = -(m / 12) * Math.PI * 2;
    this.hands.minute.rotation.x = -(hour % 1) * Math.PI * 2;
  }

  /** Point du sol au pied du mur visé par le rayon (côté pièce), s'il touche un mur avant le sol. */
  wallHit(ray: THREE.Raycaster, groundDist: number): THREE.Vector3 | null {
    const hit = ray.intersectObjects(this.solid.filter((o) => this.visibleChain(o)), false)[0];
    if (!hit || hit.distance >= groundDist) return null;
    const p = hit.point.clone().setY(0);
    // un peu en avant du mur, dans la pièce
    p.x = THREE.MathUtils.clamp(p.x, ROOM.x0 + 0.3, ROOM.x1 - 0.3);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.z0 + 0.3, ROOM.z1 - 0.3);
    return p;
  }

  private visibleChain(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  /**
   * Un objet lancé ne traverse pas les murs : s'il sort de la pièce ailleurs que par la porte, il
   * rebondit sur le mur (vitesse renvoyée, ralentie). Modifie `pos` et `vel`.
   */
  bounce(prev: THREE.Vector3, pos: THREE.Vector3, vel: THREE.Vector3): void {
    const { x0, x1, z0, z1 } = ROOM;
    const inside = (p: THREE.Vector3) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
    if (!inside(prev) || inside(pos)) return;
    const door = pos.x <= x0 && pos.z > DOOR.z0 + 0.05 && pos.z < DOOR.z1 - 0.05 && pos.y < DOOR.h;
    if (door) return;
    const e = 0.02;
    if (pos.x <= x0 || pos.x >= x1) {
      pos.x = THREE.MathUtils.clamp(pos.x, x0 + e, x1 - e);
      vel.x *= -0.35;
    }
    if (pos.z <= z0 || pos.z >= z1) {
      pos.z = THREE.MathUtils.clamp(pos.z, z0 + e, z1 - e);
      vel.z *= -0.35;
    }
  }
}
