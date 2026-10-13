/**
 * Mode construction (le créateur de bâtiment) : on monte un bâtiment pièce par pièce avec les
 * modèles du jeu. Les murs sont les pans taillés dans le muret de la ville (packs/pansMur.ts), la
 * porte et les tuiles du toit viennent du kit de la maison (kit.ts), le décor des packs (ville…).
 * Le catalogue et la grille (2 m, la longueur d'un pan) sont dans batir.ts.
 *
 * Un aperçu translucide suit la souris, calé sur la grille : clic gauche pour poser (on peut
 * glisser pour poser une rangée de murs ou de sols), R pour tourner. Poser sur une place prise la
 * remplace (un mur plein par une fenêtre). Démolir retire la pièce visée ; Ctrl+Z annule.
 *
 * Un bâtiment est à une seule hauteur : chaque pièce reprend la hauteur du bâtiment voisin, sinon
 * celle du sol le plus bas sous elle (aplanir le terrain avant aide). Toits et pignons se posent en
 * haut des murs ; aux coins, une chaîne d'angle en pierre de taille ferme le mur. Les portes en bois
 * s'ouvrent quand le perso approche. Vue de dessus, les toits s'effacent quand il est dessous.
 * Les murs et le décor se contournent ; tout part avec la sauvegarde.
 */
import * as THREE from 'three';
import { createToonMaterial } from './toon';
import { createPan, PAN_HEIGHT, PAN_THICK, PIGNON_BASE, PIGNON_HEIGHT, panObstacles, type PanKind } from './packs/pansMur';
import { packModel, packSize } from './packs/assets';
import type { PackId } from './packs/manifest';
import { kitParts, loadKit, tileRoof } from './kit';
import { tiles, toon } from './room';
import { parquet } from './maison';
import {
  decodePieces, encodePieces, footPoints, GRID, PIECE_BY_ID, PIECES, slotOf, snapPiece,
  type Category, type PieceDef, type PieceId, type PieceSave, type Spot,
} from './batir';

export type BuildTool = 'poser' | 'demolir';

/** Le décor (et la barrière) : le modèle d'un pack. */
const MODELS: Partial<Record<PieceId, [PackId, string]>> = {
  barriere: ['ville', 'barriere-bois'],
  lampadaire: ['ville', 'lampadaire-rue'],
  banc: ['ville', 'banc-public'],
  jardiniere: ['ville', 'jardiniere-rue'],
  escalier: ['ville', 'escalier-pierre'],
  tonneau: ['etals', 'tonneau'],
  table: ['ville', 'table-pique-nique'],
  puits: ['ville', 'puits'],
  rondins: ['bucheron', 'rondins-empiles'],
};

const PANS: Partial<Record<PieceId, PanKind>> = { mur: 'mur', 'mur-fenetre': 'mur-fenetre', 'mur-porte': 'mur-porte', 'mur-porte-bois': 'mur-porte', pignon: 'pignon' };

/** Une pièce reprend la hauteur d'un bâtiment à moins de ça (m, au sol). */
const NEAR = 3;
/** Épaisseur des sols (m). */
const FLOOR_T = 0.04;
/** Toit à deux pentes : pente du pignon, faîtage un peu au-dessus des rives, débords à l'égout et au pignon. */
const ROOF_ANGLE = Math.atan2(PIGNON_HEIGHT, PIGNON_BASE / 2);
const RIDGE = PIGNON_HEIGHT + 0.26;
const EAVE = 0.4;
const GABLE = 0.35;
const ROOF_T = 0.06;
/** Ouverture du passage du battant (pansMur : trou de 1,2 m, cadre de 10 cm). */
const DOOR_W = 1;
const DOOR_H = 2.08;
const DOOR_OPEN = 1.45;
/** Le battant s'ouvre quand le perso est à moins de ça (m) devant ou derrière. */
const DOOR_NEAR = 1.6;
const UNDO_MAX = 200;

const wood = createToonMaterial({ color: 0x6e4a2c, rimStrength: 0 });
const quoinMat = createToonMaterial({ color: 0x9c7a55, rimStrength: 0 });
const roofMat = createToonMaterial({ color: 0xa65a3a, rimStrength: 0 });
const ridgeMat = createToonMaterial({ color: 0x8a4630, rimStrength: 0 });
const slabMat = createToonMaterial({ color: 0xb9ae98, rimStrength: 0 });
const quoinGeo = new THREE.BoxGeometry(PAN_THICK + 0.06, PAN_HEIGHT, PAN_THICK + 0.06).translate(0, PAN_HEIGHT / 2, 0);

/** Les sols (faits à la demande : leurs textures sont dessinées dans un canevas). */
let floors: Partial<Record<PieceId, THREE.Material>> | null = null;
function floorMaterial(id: PieceId): THREE.Material {
  floors ??= (() => {
    const tile = tiles(256, 2, '#efe4cf', '#d9c7a6', '#c2b293', 4);
    tile.repeat.set(GRID / 0.8, GRID / 0.8);
    const stone = tiles(256, 2, '#b8b0a2', '#a69d8e', '#857d70', 6);
    stone.repeat.set(GRID / 1, GRID / 1);
    return { parquet: parquet({ x0: 0, x1: GRID, z0: 0, z1: GRID }), carrelage: toon(0xffffff, tile), dallage: toon(0xffffff, stone) };
  })();
  return floors[id]!;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Le battant en bois d'une porte : pivot sur le montant gauche, le kit le remplace à son arrivée. */
function doorLeaf(): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(-DOOR_W / 2, 0, 0);
  const plain = mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.04), wood, DOOR_W / 2, DOOR_H / 2 + 0.01, 0);
  pivot.add(plain);
  loadKit()
    .then((kit) => {
      const door = new THREE.Group();
      for (const part of kitParts(kit.porte)) door.add(mesh(part.geometry, part.material));
      // le battant du kit fait 88 × 205 cm, 5 cm d'épaisseur
      door.scale.set(DOOR_W / 0.88, DOOR_H / 2.05, 0.8);
      door.position.set(DOOR_W / 2, 0.01, 0);
      plain.visible = false;
      pivot.add(door);
    })
    .catch(() => {});
  return pivot;
}

/**
 * Toit à deux pentes de 4 m de large (le pignon), 2 m le long du faîtage (x). `ends` : ses bouts
 * sans voisin (-x, +x), qui débordent au-dessus du pignon. Tuiles du kit sur un pan peint.
 */
function roof(ends: [boolean, boolean]): THREE.Group {
  const g = new THREE.Group();
  const x0 = -GRID / 2 - (ends[0] ? GABLE : 0.005), x1 = GRID / 2 + (ends[1] ? GABLE : 0.005);
  const lx = x1 - x0, cx = (x0 + x1) / 2;
  const slope = (PIGNON_BASE / 2 + EAVE) / Math.cos(ROOF_ANGLE);
  const wraps: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const dir = new THREE.Vector3(0, -Math.sin(ROOF_ANGLE), s * Math.cos(ROOF_ANGLE));
    const normal = new THREE.Vector3(0, Math.cos(ROOF_ANGLE), s * Math.sin(ROOF_ANGLE));
    const top = new THREE.Vector3(cx, RIDGE, 0).addScaledVector(dir, slope / 2);
    const pan = mesh(new THREE.BoxGeometry(lx, ROOF_T, slope), roofMat);
    pan.position.copy(top).addScaledVector(normal, -ROOF_T / 2);
    pan.rotation.x = s * ROOF_ANGLE;
    g.add(pan);
    const wrap = new THREE.Group();
    wrap.position.copy(top);
    wrap.rotation.x = s * ROOF_ANGLE;
    wrap.userData.side = s;
    wraps.push(wrap);
    g.add(wrap);
    // la sablière sur la moitié intérieure du mur : pas de jour entre le mur et le toit
    g.add(mesh(new THREE.BoxGeometry(GRID, 0.19, PAN_THICK / 2 - 0.02), wood, 0, 0.095, s * (PIGNON_BASE / 2 - PAN_THICK / 4 - 0.01)));
  }
  g.add(mesh(new THREE.BoxGeometry(lx, 0.1, 0.22), ridgeMat, cx, RIDGE + 0.03, 0));
  loadKit()
    .then((kit) => {
      for (const wrap of wraps) {
        const tilesGroup = new THREE.Group();
        for (const t of tileRoof(kit.tuile, lx, slope, Math.round(wrap.userData.side * 7919 + lx * 31))) {
          t.castShadow = t.receiveShadow = true;
          tilesGroup.add(t);
        }
        // tileRoof : faîtage à -z ; le pan d'en face est tourné
        tilesGroup.rotation.y = wrap.userData.side < 0 ? Math.PI : 0;
        tilesGroup.position.y = 0.03;
        wrap.add(tilesGroup);
      }
    })
    .catch(() => {});
  return g;
}

/** Le modèle d'une pièce, dans son repère (posé à y = 0, centré ; voir batir.ts). */
export function makePiece(id: PieceId, ends: [boolean, boolean] = [true, true]): THREE.Group {
  const g = new THREE.Group();
  g.name = `batiment/${id}`;
  const pan = PANS[id];
  if (pan) g.add(createPan(pan));
  if (id === 'mur-porte-bois') g.add((g.userData.door = doorLeaf()));
  const model = MODELS[id];
  if (model) {
    const m = packModel(model[0], model[1] as never);
    // la barrière est couchée le long de z dans son pack : le long du bord (x) ici
    if (id === 'barriere') m.rotation.y = Math.PI / 2;
    g.add(m);
  }
  if (id === 'parquet' || id === 'carrelage' || id === 'dallage') g.add(mesh(new THREE.BoxGeometry(GRID, FLOOR_T, GRID), floorMaterial(id), 0, FLOOR_T / 2, 0));
  if (id === 'toit') g.add(roof(ends));
  if (id === 'toit-plat') g.add(mesh(new THREE.BoxGeometry(GRID, 0.2, GRID), slabMat, 0, 0.1, 0));
  return g;
}

/** Ce qui bloque le passage d'une pièce (boîtes dans son repère). */
export function pieceObstacles(id: PieceId): THREE.Box3[] {
  const pan = PANS[id];
  if (pan) return panObstacles(pan);
  if (id === 'barriere') return [new THREE.Box3(new THREE.Vector3(-GRID / 2, 0, -0.2), new THREE.Vector3(GRID / 2, 1.25, 0.2))];
  const model = MODELS[id];
  if (!model) return [];
  const s = packSize(model[0], model[1] as never);
  return [new THREE.Box3(new THREE.Vector3(-s.x / 2, 0, -s.z / 2), new THREE.Vector3(s.x / 2, s.y, s.z / 2))];
}

/** Une pièce posée dans le monde. */
interface Placed extends PieceSave {
  def: PieceDef;
  slot: string;
  object: THREE.Group;
  /** Toit : ses bouts libres, tels que construits. */
  ends?: string;
  /** Porte en bois : son battant. */
  door?: { pivot: THREE.Object3D; angle: number; target: number };
}

/** Un geste à annuler : la pièce posée, celle retirée (remplacée ou démolie). */
interface Step {
  added?: PieceSave;
  removed?: PieceSave;
}

export interface ConstructionHost {
  /** Hauteur du sol en (x, z). */
  ground(x: number, z: number): number;
  /** Plus d'herbe qui traverse ce rectangle (un sol posé). */
  clearGrass(x0: number, x1: number, z0: number, z1: number): void;
  /** Les murs ou le décor ont changé : chemins à refaire. */
  changed(): void;
}

export class Construction {
  readonly root = new THREE.Group();
  private readonly pieces = new THREE.Group();
  private readonly corners = new THREE.Group();
  private readonly placed: Placed[] = [];
  private undoList: Step[] = [];
  private open = false;
  tool: BuildTool = 'poser';
  category: Category = 'murs';
  piece: PieceId = 'mur';
  /** Quarts (ou huitièmes) de tour de la pièce à poser. */
  private turn = 0;
  private pressing = false;
  private lastSlot: string | null = null;
  /** Le rayon de la souris (null : hors de la vue). */
  private ray: THREE.Ray | null = null;
  /** La pièce à poser, calée, et sa hauteur ; null : rien sous la souris. */
  private aimed: { spot: Spot; y: number } | null = null;
  /** La pièce visée par Démolir. */
  private target: Placed | null = null;
  private ghost: THREE.Group | null = null;
  private ghostId: PieceId | null = null;
  private readonly ghostOk = new THREE.MeshBasicMaterial({ color: 0x8fe07a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly ghostSwap = new THREE.MeshBasicMaterial({ color: 0xf5be5b, transparent: true, opacity: 0.5, depthWrite: false });
  private readonly marker = new THREE.Box3Helper(new THREE.Box3(), 0xf2795b);
  private readonly raycaster = new THREE.Raycaster();
  private readonly listeners = new Set<() => void>();
  /** Quelque chose a changé depuis la dernière sauvegarde. */
  private dirty = false;
  private saved: ReturnType<typeof encodePieces> | null | undefined;

  constructor(private readonly host: ConstructionHost) {
    this.root.name = 'construction';
    this.marker.visible = false;
    this.marker.renderOrder = 20;
    (this.marker.material as THREE.LineBasicMaterial).depthTest = false;
    this.root.add(this.pieces, this.corners, this.marker);
  }

  get on(): boolean {
    return this.open;
  }

  set on(v: boolean) {
    if (v === this.open) return;
    this.open = v;
    this.pressing = false;
    this.ray = null;
    this.aimed = null;
    this.target = null;
    this.showGhost(null);
    this.marker.visible = false;
    this.changed();
  }

  listen(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  get count(): number {
    return this.placed.length;
  }

  get canUndo(): boolean {
    return this.undoList.length > 0;
  }

  get pressed(): boolean {
    return this.pressing;
  }

  setTool(t: BuildTool): void {
    this.tool = t;
    this.changed();
  }

  setCategory(c: Category): void {
    this.category = c;
    const first = PIECES.find((p) => p.cat === c);
    if (first && PIECE_BY_ID.get(this.piece)!.cat !== c) this.piece = first.id;
    this.tool = 'poser';
    this.changed();
  }

  setPiece(id: PieceId): void {
    this.piece = id;
    this.category = PIECE_BY_ID.get(id)!.cat;
    this.tool = 'poser';
    this.changed();
  }

  /** La n-ième pièce (1 à 9) de la catégorie ouverte. */
  pickNumber(n: number): void {
    const list = PIECES.filter((p) => p.cat === this.category);
    if (list[n - 1]) this.setPiece(list[n - 1].id);
  }

  rotate(): void {
    this.turn++;
    this.changed();
  }

  aim(ray: THREE.Ray | null): void {
    this.ray = ray;
  }

  press(): void {
    this.pressing = true;
    this.lastSlot = null;
    this.act();
  }

  release(): void {
    this.pressing = false;
    this.lastSlot = null;
  }

  // ---------------------------------------------------------------- visée

  /** Premier point du sol touché par le rayon (pas de 0,4 m, puis affiné), ou null. */
  private hitGround(ray: THREE.Ray): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    const above = (t: number) => {
      p.copy(ray.origin).addScaledVector(ray.direction, t);
      return p.y - this.host.ground(p.x, p.z);
    };
    if (above(0) < 0) return null;
    let prev = 0;
    for (let t = 0.4; t < 600; t += 0.4) {
      if (above(t) < 0) {
        let lo = prev, hi = t;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          if (above(mid) < 0) hi = mid;
          else lo = mid;
        }
        above(hi);
        return p.clone();
      }
      if (p.y < -20 && ray.direction.y < 0) return null;
      prev = t;
    }
    return null;
  }

  /** La hauteur du bâtiment le plus proche de (x, z), à moins de NEAR m (null : aucun). */
  private baseNear(x: number, z: number): number | null {
    let best: Placed | null = null, d = NEAR;
    for (const p of this.placed) {
      if (p.def.snap === 'libre') continue;
      const e = Math.hypot(p.x - x, p.z - z);
      if (e < d) {
        d = e;
        best = p;
      }
    }
    return best ? best.y : null;
  }

  /** Hauteur où poser la pièce : sur le sol d'un bâtiment voisin, sinon au plus bas du terrain dessous. */
  private baseFor(def: PieceDef, s: Spot): number {
    if (def.snap === 'libre') {
      const floor = this.placed.find((p) => p.def.layer === 'sol' && Math.abs(p.x - s.x) <= GRID / 2 && Math.abs(p.z - s.z) <= GRID / 2);
      return floor ? floor.y + FLOOR_T : this.host.ground(s.x, s.z);
    }
    const near = this.baseNear(s.x, s.z);
    if (near !== null) return near;
    return Math.min(...footPoints(def, s).map(([x, z]) => this.host.ground(x, z)));
  }

  private updateAim(): void {
    this.aimed = null;
    const ray = this.ray;
    if (!ray) return;
    let p = this.hitGround(ray);
    const def = PIECE_BY_ID.get(this.piece)!;
    // toits et pignons : visés à la hauteur du haut des murs voisins
    if (def.high) {
      const from = p ?? ray.origin;
      const base = this.baseNear(from.x, from.z);
      if (base !== null) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base + PAN_HEIGHT));
        p = ray.intersectPlane(plane, new THREE.Vector3()) ?? p;
      }
    }
    if (!p) return;
    const spot = snapPiece(def, p.x, p.z, this.turn);
    this.aimed = { spot, y: this.baseFor(def, spot) };
  }

  /** La pièce posée sous le rayon (pour Démolir). */
  private pick(): Placed | null {
    if (!this.ray) return null;
    this.raycaster.ray.copy(this.ray);
    const hit = this.raycaster.intersectObject(this.pieces, true)[0];
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o && o.parent !== this.pieces) o = o.parent;
    return this.placed.find((p) => p.object === o) ?? null;
  }

  /** Clic (ou glissé) : poser, ou démolir. */
  private act(): void {
    if (this.tool === 'demolir') {
      const t = this.pick();
      if (t) {
        this.removePlaced(t);
        this.record({ removed: this.toSave(t) });
        this.after();
      }
      return;
    }
    const a = this.aimed;
    if (!a) return;
    const key = a.spot.slot || `${a.spot.x}|${a.spot.z}`;
    if (key === this.lastSlot) return;
    this.lastSlot = key;
    const save: PieceSave = { id: this.piece, x: a.spot.x, z: a.spot.z, yaw: a.spot.yaw, y: a.y };
    const step = this.put(save);
    if (step) {
      this.record(step);
      this.after();
    }
  }

  // ---------------------------------------------------------------- pièces

  private toSave(p: Placed): PieceSave {
    return { id: p.id, x: p.x, z: p.z, yaw: p.yaw, y: p.y };
  }

  /** Pose une pièce (en remplaçant celle de sa place) ; rend le geste, ou null si rien n'a changé. */
  private put(s: PieceSave): Step | null {
    const def = PIECE_BY_ID.get(s.id)!;
    const slot = slotOf(s);
    let removed: PieceSave | undefined;
    if (slot) {
      const old = this.placed.find((p) => p.slot === slot);
      if (old) {
        if (old.id === s.id && Math.abs(Math.cos(old.yaw - s.yaw) - 1) < 1e-3) return null;
        removed = this.toSave(old);
        this.removePlaced(old);
      }
    }
    const object = makePiece(s.id);
    object.position.set(s.x, s.y + (def.high ? PAN_HEIGHT : 0), s.z);
    object.rotation.y = s.yaw;
    this.pieces.add(object);
    const p: Placed = { ...s, def, slot, object };
    if (object.userData.door) {
      p.door = { pivot: object.userData.door as THREE.Object3D, angle: 0, target: 0 };
    }
    this.placed.push(p);
    if (def.layer === 'sol') this.host.clearGrass(s.x - GRID / 2 - 0.2, s.x + GRID / 2 + 0.2, s.z - GRID / 2 - 0.2, s.z + GRID / 2 + 0.2);
    return { added: s, removed };
  }

  private removePlaced(p: Placed): void {
    this.pieces.remove(p.object);
    const i = this.placed.indexOf(p);
    if (i >= 0) this.placed.splice(i, 1);
    if (this.target === p) this.target = null;
  }

  private findSame(s: PieceSave): Placed | undefined {
    return this.placed.find((p) => p.id === s.id && Math.abs(p.x - s.x) < 1e-3 && Math.abs(p.z - s.z) < 1e-3 && Math.abs(p.y - s.y) < 1e-3);
  }

  private record(step: Step): void {
    this.undoList.push(step);
    if (this.undoList.length > UNDO_MAX) this.undoList.shift();
  }

  /** Défait le dernier geste. */
  undo(): void {
    const step = this.undoList.pop();
    if (!step) return;
    if (step.added) {
      const p = this.findSame(step.added);
      if (p) this.removePlaced(p);
    }
    if (step.removed) this.put(step.removed);
    this.after();
  }

  /** Redégage l'herbe sous chaque plancher (après resetGrass : un plancher retiré la laisse repousser). */
  clearFloorsGrass(): void {
    for (const p of this.placed) if (p.def.layer === 'sol') this.host.clearGrass(p.x - GRID / 2 - 0.2, p.x + GRID / 2 + 0.2, p.z - GRID / 2 - 0.2, p.z + GRID / 2 + 0.2);
  }

  /** Démolit tout (ça ne s'annule pas : le panneau demande confirmation). */
  clearAll(): void {
    for (const p of [...this.placed]) this.removePlaced(p);
    this.undoList = [];
    this.after();
  }

  /** Après un changement : coins, bouts des toits, chemins, interface, sauvegarde. */
  private after(notify = true): void {
    this.refreshRoofs();
    this.refreshCorners();
    this.dirty = true;
    if (notify) {
      this.host.changed();
      this.changed();
    }
  }

  /** Un bout de toit sans voisin le long du faîtage déborde au-dessus du pignon. */
  private refreshRoofs(): void {
    const roofs = this.placed.filter((p) => p.id === 'toit');
    for (const p of roofs) {
      const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
      const has = (k: number) => roofs.some((o) => o !== p && o.slot.endsWith(p.slot.slice(-1)) && Math.abs(o.x - (p.x + k * GRID * ax)) < 1e-3 && Math.abs(o.z - (p.z + k * GRID * az)) < 1e-3 && Math.abs(o.y - p.y) < 1e-3);
      const ends: [boolean, boolean] = [!has(-1), !has(1)];
      const key = ends.join();
      if (p.ends === key) continue;
      p.ends = key;
      const object = makePiece('toit', ends);
      object.position.copy(p.object.position);
      object.rotation.y = p.yaw;
      object.visible = p.object.visible;
      this.pieces.remove(p.object);
      this.pieces.add(object);
      p.object = object;
    }
  }

  /** Les coins des murs : là où deux murs se croisent à angle droit. */
  private cornerSpots(): THREE.Vector3[] {
    const axes = new Map<string, { at: THREE.Vector3; x: boolean; z: boolean }>();
    for (const p of this.placed) {
      if (p.def.layer !== 'mur' || p.id === 'barriere') continue;
      const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
      const alongX = Math.abs(ax) > 0.5;
      for (const k of [-1, 1]) {
        const x = +(p.x + k * ax * GRID / 2).toFixed(2), z = +(p.z + k * az * GRID / 2).toFixed(2);
        const key = `${x}|${z}|${p.y.toFixed(2)}`;
        const e = axes.get(key) ?? { at: new THREE.Vector3(x, p.y, z), x: false, z: false };
        if (alongX) e.x = true;
        else e.z = true;
        axes.set(key, e);
      }
    }
    return [...axes.values()].filter((e) => e.x && e.z).map((e) => e.at);
  }

  private refreshCorners(): void {
    this.corners.clear();
    for (const at of this.cornerSpots()) this.corners.add(mesh(quoinGeo, quoinMat, at.x, at.y, at.z));
  }

  /** Ce qui bloque le passage : murs, décor, coins. */
  obstacles(): Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> {
    const out: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> = [];
    for (const p of this.placed) {
      if (p.def.high) continue;
      for (const box of pieceObstacles(p.id)) out.push({ box, pos: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, wall: p.def.layer === 'mur' });
    }
    const h = (PAN_THICK + 0.06) / 2;
    for (const at of this.cornerSpots()) out.push({ box: new THREE.Box3(new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, PAN_HEIGHT, h)), pos: new THREE.Vector3(at.x, 0, at.z), yaw: 0, wall: true });
    return out;
  }

  // ---------------------------------------------------------------- à chaque image

  /**
   * `perso` : où est le perso (les portes s'ouvrent devant lui) ; `topView` : vue de dessus (les
   * toits au-dessus de lui s'effacent).
   */
  update(dt: number, perso: THREE.Vector3, topView: boolean): void {
    for (const p of this.placed) {
      const d = p.door;
      if (!d) continue;
      const dx = perso.x - p.x, dz = perso.z - p.z;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const near = Math.abs(lx) < 1.2 && Math.abs(lz) < DOOR_NEAR;
      // s'ouvre du côté opposé au perso (le battant ne le cogne pas)
      if (near && d.target === 0) d.target = lz >= 0 ? DOOR_OPEN : -DOOR_OPEN;
      else if (!near) d.target = 0;
      if (d.angle !== d.target) {
        const step = 3 * dt;
        d.angle = Math.abs(d.target - d.angle) <= step ? d.target : d.angle + Math.sign(d.target - d.angle) * step;
        d.pivot.rotation.y = d.angle;
      }
    }
    // les toits sous lesquels est le perso s'effacent (vue de dessus), et ceux qui les touchent
    const under = topView && this.placed.some((p) => p.def.high && p.def.layer === 'toit' && this.covers(p, perso));
    for (const p of this.placed) {
      if (!p.def.high) continue;
      p.object.visible = !(under && Math.hypot(p.x - perso.x, p.z - perso.z) < 10);
    }
    if (!this.open) return;
    if (this.tool === 'demolir') {
      this.showGhost(null);
      this.target = this.pick();
      if (this.pressing && this.target) this.act();
      this.marker.visible = !!this.target;
      if (this.target) this.marker.box.setFromObject(this.target.object);
      return;
    }
    this.marker.visible = false;
    this.updateAim();
    if (this.pressing && this.aimed && PIECE_BY_ID.get(this.piece)!.snap !== 'libre') this.act();
    const a = this.aimed;
    if (!a) {
      this.showGhost(null);
      return;
    }
    const def = PIECE_BY_ID.get(this.piece)!;
    const ghost = this.showGhost(this.piece);
    ghost.position.set(a.spot.x, a.y + (def.high ? PAN_HEIGHT : 0), a.spot.z);
    ghost.rotation.y = a.spot.yaw;
    const swap = !!a.spot.slot && this.placed.some((p) => p.slot === a.spot.slot);
    const mat = swap ? this.ghostSwap : this.ghostOk;
    // les modèles arrivent après coup (pierres, tuiles, décor) : on repeint à chaque image
    ghost.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material !== mat) {
        o.material = mat;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
  }

  /** Le perso est-il sous ce toit ? */
  private covers(p: Placed, at: THREE.Vector3): boolean {
    const dx = at.x - p.x, dz = at.z - p.z;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const hz = p.id === 'toit' ? PIGNON_BASE / 2 : GRID / 2;
    return Math.abs(lx) <= GRID / 2 && Math.abs(lz) <= hz;
  }

  private showGhost(id: PieceId | null): THREE.Group {
    if (id !== this.ghostId) {
      if (this.ghost) this.root.remove(this.ghost);
      this.ghost = id ? makePiece(id) : null;
      this.ghostId = id;
      if (this.ghost) {
        this.ghost.renderOrder = 10;
        this.root.add(this.ghost);
      }
    }
    return this.ghost!;
  }

  // ---------------------------------------------------------------- sauvegarde

  save(): ReturnType<typeof encodePieces> | null {
    if (!this.dirty && this.saved !== undefined) return this.saved;
    this.dirty = false;
    return (this.saved = this.placed.length ? encodePieces(this.placed.map((p) => this.toSave(p))) : null);
  }

  load(x: unknown): void {
    for (const p of [...this.placed]) this.removePlaced(p);
    this.undoList = [];
    for (const s of decodePieces(x)) this.put(s);
    this.after(false);
    this.dirty = false;
    this.saved = undefined;
    this.host.changed();
    this.changed();
  }
}

/** Clé des bâtiments de la carte de test dans le navigateur (celle de l'ancienne page `?batir`). */
const BATIR_KEY = 'island-batiments';

export function loadBatiments(): unknown {
  try {
    const raw = localStorage.getItem(BATIR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBatiments(x: unknown): void {
  try {
    if (x) localStorage.setItem(BATIR_KEY, JSON.stringify(x));
    else localStorage.removeItem(BATIR_KEY);
  } catch {
    // stockage plein ou refusé : les bâtiments restent pour cette visite
  }
}
