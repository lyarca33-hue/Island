/**
 * Les pièces de la maison. Chaque pièce vient d'une fiche (RoomSpec) : son rectangle, son sol,
 * ses portes et passages, ses fenêtres, ses lampes, son interrupteur, ses meubles rangés contre
 * les murs et son décor. Les fiches sont listées dans rooms.ts ; la cuisine est ici (KITCHEN).
 * Deux pièces voisines ont chacune leur mur, dos à dos, percé au même endroit pour le passage ;
 * leurs toits se rejoignent au-dessus (pas de débord ni de pignon côté mitoyen).
 *
 * Lumière jour et nuit, réglée par l'horloge du jeu : les lampes s'allument au crépuscule
 * et s'éteignent au matin, les vitres passent du ciel clair au bleu nuit. L'interrupteur de la
 * pièce allume ou éteint à la main ; l'horloge reprend la main au prochain lever ou coucher.
 * Le jour, une lumière entre par chaque fenêtre (projecteur dedans, ombre du croisillon au sol) ;
 * la nuit, un peu de clair de lune. Un vrai toit couvre la pièce quand le perso est dehors.
 * Un toit et des murs invisibles, qui ne font que de l'ombre, gardent le soleil et la lune dehors
 * (sauf par les fenêtres, même quand un mur est abaissé en coupe) : dedans, ce sont les lampes
 * qui éclairent et projettent les ombres.
 *
 * Murs « en coupe » comme dans les Sims : quand le perso est dans une pièce, les murs tournés
 * vers la caméra s'abaissent à hauteur de plinthe dans toutes les pièces ; ils se relèvent quand
 * la caméra tourne. Dehors, murs et toit restent pleins : le perso caché derrière se voit en
 * transparence, entouré d'une aura (passe finale, voir postfx.ts).
 *
 * Les meubles sont rangés contre les murs par rangées (runs) : chacun dos au mur, collé au
 * précédent ; leurs places viennent de leurs boîtes (placeRuns), pas de coordonnées à la main.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from './toon';
import { lightAllPasses } from './postfx';
import { kitParts, PlasterSheet, tileRoof, type Kit } from './kit';
import { SUNRISE, SUNSET } from './clock';
import type { WorldItem } from './items/carry';

/** Rectangle intérieur d'une pièce (m) : x de x0 à x1, z de z0 à z1. Le fond (nord) est à z0. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Intérieur de la cuisine. */
export const ROOM: Rect = { x0: -3.2, x1: 3.2, z0: -2.8, z1: 2.8 };
/** Hauteur et épaisseur des murs, hauteur d'un mur abaissé (en coupe). */
export const WALL_H = 2.5;
export const WALL_T = 0.12;
const CUT_H = 0.2;
/** Hauteur d'une porte ou d'un passage. */
export const DOOR_H = 2.08;
/** Bas des placards hauts de la cuisine (80 cm de haut : leur haut au ras des fenêtres). */
const WALL_CUPBOARD_Y = 1.3;
/** Table de la cuisine, devant la fenêtre du sud. */
const KITCHEN_TABLE = { x: 1, z: 1.7 };
/** Passage de la cuisine à l'entrée (mur ouest de la cuisine) : de z0 à z1. */
export const DOOR = { z0: 1.35, z1: 2.25 };
/** Passage de la cuisine au salon (mur est de la cuisine) : de z0 à z1. */
export const SALON_PASS = { z0: -1.5, z1: -0.3 };
/** Distance (m) à laquelle une porte s'ouvre devant le perso, et sa vitesse (ouverture par seconde). */
const DOOR_NEAR = 1.4;
const DOOR_SPEED = 1.8;
/** Porte de garage : distance où elle s'ouvre devant le perso, vitesse (ouverture par seconde). */
const GARAGE_NEAR = 2.2;
const GARAGE_SPEED = 0.8;
/** Rideaux : vitesse (part tirée par seconde), part de la lumière de la fenêtre qu'ils arrêtent. */
const CURTAIN_SPEED = 1.5;
const CURTAIN_DIM = 0.97;
/** Bas et haut des fenêtres (celle du fond, au-dessus de l'évier, passe au-dessus du robinet). */
const WIN_LOW = 1.3;
export const WIN_HIGH = 2.1;
/** Kit Tripo (dress) : taille d'un carreau du kit posé (quatre carreaux de 40 cm), enfoncement de l'enduit dans le mur. */
const KIT_FLOOR = 0.8;
const PLASTER_IN = 0.012;
/** Ce que l'enduit dépasse au plus de la face du mur (relief de 2 cm, enfoncé de PLASTER_IN). */
const PLASTER_OUT = 0.008;

const PLASTER = 0xefe5cf;
const CAP = 0x7c6a58;
const SKIRT = 0x8a6440;
const FRAME = 0xf6f3ec;
export const WOOD = 0x8a6440;
export const DARK_WOOD = 0x5d4129;

/** Suspensions : hauteur de l'ampoule, couleur et force de la lumière allumée, portée (m). */
const LAMP_Y = 1.95;
const LAMP_COLOR = 0xffc98a;
const LAMP_I = 9;
const LAMP_RANGE = 7;
/** Lampadaire : hauteur de l'ampoule. */
const FLOOR_LAMP_Y = 1.5;
/** Les lampes s'allument sur cette durée (h) avant le coucher, s'éteignent après le lever. */
const LAMP_FADE = 1.5;
/** Lumière par les fenêtres : couleur et force en plein jour, au lever/coucher, et clair de lune. */
const WIN_DAY = new THREE.Color(0xfff1d8);
const WIN_WARM = new THREE.Color(0xffb878);
const WIN_MOON = new THREE.Color(0x9fb4ff);
const WIN_I = 12;
const WIN_MOON_I = 3;
/** Toit : pente (rad), débord autour des murs (m). */
const ROOF_PITCH = THREE.MathUtils.degToRad(30);
const ROOF_OVER = 0.3;
/** Taille de la carte d'ombre des lampes (par face du cube). */
const LAMP_SHADOW = 512;
/** Vitesse du fondu quand on appuie sur l'interrupteur (part de lumière par seconde). */
const SWITCH_FADE = 4;
/** Hauteur des interrupteurs. */
const SWITCH_Y = 1.1;
/** Vitres : ciel de jour, ciel de nuit (couleur, opacité). */
const PANE_DAY = { color: new THREE.Color(0xbfe3f2), opacity: 0.35 };
const PANE_NIGHT = { color: new THREE.Color(0x1c2748), opacity: 0.75 };

/** Part de lumière des lampes à l'heure `h` : 1 la nuit, 0 en plein jour, fondu autour du lever et du coucher. */
export function lampLevel(h: number): number {
  const morning = 1 - THREE.MathUtils.smoothstep(h, SUNRISE, SUNRISE + LAMP_FADE);
  const evening = THREE.MathUtils.smoothstep(h, SUNSET - LAMP_FADE, SUNSET);
  return Math.max(morning, evening);
}

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

/** Ouverture dans un mur, le long du mur (u : x pour nord et sud, z pour est et ouest) et en hauteur. */
export interface Opening {
  wall: WallName;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  /** Fenêtre qui s'ouvre : le battant (croisillon, vitre) est un objet (la fiche `fenetre`), le mur n'en garde que le cadre. */
  sash?: boolean;
  /** Rideaux devant la fenêtre (leur couleur) : tirés, ils assombrissent la pièce le jour. */
  curtain?: THREE.ColorRepresentation;
}

/**
 * Porte ou passage : `leaf` = porte d'entrée avec un battant qui s'ouvre seul devant le perso ;
 * `inner` = porte intérieure (battant blanc, sans paillasson) qui s'ouvre dans la pièce, ouverte ou
 * fermée à la main (clic droit) : fermée, elle s'ouvre quand le perso passe et se referme derrière lui.
 */
export interface Doorway {
  wall: WallName;
  u0: number;
  u1: number;
  leaf?: boolean;
  inner?: boolean;
  /** Charnière à l'autre bout de l'ouverture. */
  flip?: boolean;
  /** Porte de garage basculante : elle monte et se range sous le plafond quand le perso approche. */
  garage?: boolean;
}

/** Rangée de meubles dos au mur, dans l'ordre de x (nord, sud) ou de z (est, ouest) croissant à partir de `from` ; un nombre laisse un écart (m). */
export interface Run {
  wall: WallName;
  from: number;
  items: Array<string | number>;
}

/** Repères pour accrocher le décor au-dessus des meubles : position des meubles placés. */
export type Anchors = (id: string) => THREE.Vector3 | undefined;

/** Fiche d'une pièce. */
export interface RoomSpec {
  /** Nom de la pièce (« cuisine », « salon »). */
  name: string;
  rect: Rect;
  /** Texture du sol. */
  floor: () => THREE.Material;
  /** Carreau du kit Tripo posé sur le sol (par défaut) ; false garde le sol `floor` (parquet, béton). */
  kitFloor?: boolean;
  doors: Doorway[];
  /** Murs collés à une autre pièce : le toit n'y déborde pas et n'y a pas de pignon. */
  joined?: WallName[];
  /** Fenêtres (selon la place des meubles). */
  windows: (anchor: Anchors) => Opening[];
  /** Lampes : position au sol, suspension au plafond ou lampadaire. */
  lamps: (anchor: Anchors) => Array<{ x: number; z: number; kind: 'suspension' | 'lampadaire'; shade?: THREE.ColorRepresentation }>;
  /** Interrupteur : sur quel mur, à quelle place le long du mur. */
  lightSwitch: { wall: WallName; u: number };
  /** Meubles rangés contre les murs. */
  runs: Run[];
  /** Posés sur un autre meuble au départ : [objet, meuble dessous]. */
  onTop?: Array<[string, string, number?, number?, number?]>;
  /** Objets posés au départ, hors des rangées : [id, x, y, z, rotation (rad)]. */
  items?: Array<[string, number, number, number, number]>;
  /** Décor fixe (accroché aux murs, tapis…). */
  decor?: (room: Room, anchor: Anchors) => void;
}

/**
 * Range les meubles des rangées de la pièce `spec` contre ses murs. `pick(id)` donne le prochain
 * objet de ce type pas encore placé.
 */
export function placeRuns(spec: RoomSpec, pick: (id: string) => WorldItem | undefined): void {
  const r = spec.rect;
  for (const run of spec.runs) {
    const w = WALLS[run.wall];
    const [nx, nz] = w.n;
    // axe le long du mur (x ou z croissant) ; l'axe X du meuble tourné, dans le monde
    const along = nx === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const localX = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
    const s = along.dot(localX) > 0 ? 1 : -1;
    // coordonnée de la face intérieure du mur, mesurée le long de la normale
    const wallV = nx > 0 ? r.x0 : nx < 0 ? -r.x1 : nz > 0 ? r.z0 : -r.z1;
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

export const toon = (color: THREE.ColorRepresentation, map: THREE.Texture | null = null) => createToonMaterial({ color, map, rimStrength: 0 });

export function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

let cookie: THREE.CanvasTexture | null = null;

/** Forme de la lumière d'une fenêtre au sol : quatre carreaux clairs, croisillon sombre, bords doux. */
function windowCookie(): THREE.CanvasTexture {
  if (cookie) return cookie;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(6px)';
  g.fillStyle = '#fff';
  for (const [x, y] of [[40, 50], [134, 50], [40, 134], [134, 134]]) g.fillRect(x, y, 82, 72);
  cookie = new THREE.CanvasTexture(cv);
  cookie.colorSpace = THREE.SRGBColorSpace;
  return cookie;
}

/** Texture de carreaux : `n` × `n` carreaux de deux tons, joints clairs. */
export function tiles(size: number, n: number, a: string, b: string, grout: string, line = 3): THREE.CanvasTexture {
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

/** Sol carrelé de la cuisine, carreaux de 40 cm. */
function tiledFloor(r: Rect): THREE.Material {
  const tex = tiles(256, 2, '#efe4cf', '#d9c7a6', '#c2b293', 4);
  tex.repeat.set((r.x1 - r.x0) / 0.8, (r.z1 - r.z0) / 0.8);
  return toon(0xffffff, tex);
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
  /** Boîtes des morceaux du mur haut : pour savoir s'il cache le perso dehors. */
  boxes: THREE.Box3[];
  /** Du début à la fin du mur (le long de x ou de z), et le milieu de son épaisseur. */
  span: [number, number];
  mid: number;
}

/**
 * Battant de porte (dans le mur haut), son ombre (gardée en coupe), ouverture. Porte intérieure :
 * fermée à la main (`shut`), et réarmée (`armed`) une fois le perso éloigné, pour ne pas se rouvrir
 * sous le nez de celui qui vient de la fermer.
 */
interface Leaf {
  door: THREE.Group;
  ghost: THREE.Group;
  center: THREE.Vector3;
  open: number;
  /** Rotation (rad) du battant grand ouvert. */
  swing: number;
  wall: WallName;
  inner: boolean;
  shut: boolean;
  armed: boolean;
}

/** Porte de garage basculante : pivot en haut de l'ouverture, son ombre, ouverture (0 à 1). */
interface Lift {
  pivot: THREE.Group;
  ghost: THREE.Group;
  center: THREE.Vector3;
  width: number;
  open: number;
}

/** Rideaux d'une fenêtre : deux pans (et leur ombre), la lumière de la fenêtre, part tirée (0 ouverts, 1 tirés). */
interface Curtain {
  group: THREE.Group;
  panels: Array<{ mesh: THREE.Mesh; ghost: THREE.Mesh; side: -1 | 1 }>;
  light: THREE.SpotLight | null;
  wall: WallName;
  u: number;
  width: number;
  drawn: boolean;
  k: number;
}

export class Room {
  readonly group = new THREE.Group();
  readonly spec: RoomSpec;
  readonly rect: Rect;
  /** Morceaux de mur pleins (et meubles fixes du décor) que le perso contourne : boîte, position, rotation. */
  readonly obstacles: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> = [];
  private walls: Wall[] = [];
  private leaves: Leaf[] = [];
  private lifts: Lift[] = [];
  private curtains: Curtain[] = [];
  /** Animations du décor (aiguilles de l'horloge…), à chaque image avec l'heure du jeu. */
  private tickers: Array<(dt: number, hour: number) => void> = [];
  private wallMat = toon(PLASTER);
  private capMat = toon(CAP);
  /** Murs pleins visibles, pour les clics (un clic sur un mur vise le sol à son pied). */
  private solid: THREE.Object3D[] = [];
  /** Lumières des lampes, et leurs ampoules (qui brillent allumées). */
  private lamps: THREE.PointLight[] = [];
  /** Lumières qui entrent par les fenêtres. */
  private winLights: THREE.SpotLight[] = [];
  /** Lumières éteintes qui complètent le compte d'ombres de la pièce (voir padShadows). */
  private spares: Array<THREE.PointLight | THREE.SpotLight> = [];
  /** Les lumières de la pièce font-elles des ombres (dernière pièce où était le perso) ? */
  private shadowsOn = true;
  /**
   * Lumières de la pièce dont la carte d'ombre sert en ce moment (allumées, avec ombre) : Game les
   * recalcule à son rythme (shadow.autoUpdate reste false).
   */
  readonly liveShadows: Array<THREE.PointLight | THREE.SpotLight> = [];
  /** Toit visible, montré quand le perso est dehors. */
  private roof = new THREE.Group();
  /** Ce que le kit Tripo remplace (dress) : le sol, les pans du toit, les fenêtres faites par programme. */
  private floor: THREE.Mesh;
  private roofPans: Array<{ mesh: THREE.Mesh; side: number; lx: number; slope: number }> = [];
  private windowParts: Array<{ o: Opening; w: Wall; meshes: THREE.Mesh[] }> = [];
  /** Pignons (mur, hauteur, demi-largeur), et dessus des murs sous un pignon : cachés quand le toit se voit. */
  private gables = new Map<WallName, { height: number; half: number }>();
  private gableCaps: THREE.Mesh[] = [];
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0x3a342c });
  /** Part de lumière des lampes en ce moment (0 à 1). */
  private lampK = 0;
  /** Allumé ou éteint à l'interrupteur (null : l'horloge décide), et ce que l'horloge voulait alors. */
  private manual: { on: boolean; auto: boolean } | null = null;
  /** Heure solaire (voir GameClock.solarHour). */
  private hour = 0;
  /** L'interrupteur (plaque et bascule), et sa bascule qui montre s'il est allumé. */
  readonly lightSwitch = new THREE.Group();
  private rocker = new THREE.Group();
  /** Ombre seule : invisible à l'écran, mais arrête la lumière (toit, murs gardés en coupe). */
  readonly shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  /** Ciel couvert (0 à 1, la météo) : moins de soleil par les fenêtres. */
  overcast = 0;
  /** Matériau partagé des vitres, teinté selon l'heure. */
  private glassMat = new THREE.MeshBasicMaterial({ color: PANE_DAY.color, transparent: true, opacity: PANE_DAY.opacity, depthWrite: false });

  constructor(spec: RoomSpec, anchor: Anchors) {
    this.spec = spec;
    this.rect = spec.rect;
    this.group.name = spec.name;
    const { x0, x1, z0, z1 } = this.rect;

    // sol, sous la pièce
    const floor = (this.floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), spec.floor()));
    floor.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    floor.receiveShadow = true;
    floor.name = `sol-${spec.name}`;
    this.group.add(floor);
    // toit invisible : le soleil et la lune n'entrent que par les fenêtres
    const roof = box(x1 - x0 + 2 * WALL_T, 0.05, z1 - z0 + 2 * WALL_T, this.shadowMat, (x0 + x1) / 2, WALL_H + 0.03, (z0 + z1) / 2);
    roof.receiveShadow = false;
    roof.name = 'toit-ombre';
    this.group.add(roof);

    // les murs (nord et sud couvrent les coins), percés des portes et des fenêtres
    const windows = spec.windows(anchor);
    const openings: Opening[] = [...windows, ...spec.doors.map((d) => ({ wall: d.wall, u0: d.u0, u1: d.u1, y0: 0, y1: DOOR_H }))];
    const on = (w: WallName) => openings.filter((o) => o.wall === w);
    this.addWall('nord', x0 - WALL_T, x1 + WALL_T, on('nord'));
    this.addWall('sud', x0 - WALL_T, x1 + WALL_T, on('sud'));
    this.addWall('ouest', z0, z1, on('ouest'));
    this.addWall('est', z0, z1, on('est'));
    for (const o of windows) this.addWindow(this.wall(o.wall), o);
    for (const d of spec.doors) this.addDoorway(d);

    spec.decor?.(this, anchor);

    for (const l of spec.lamps(anchor)) this.addLamp(l.x, l.z, l.kind, l.shade ?? 0x2f5d50);
    // lumière du dehors par les fenêtres, et le toit vu du dehors
    for (const o of windows) {
      const light = this.addWindowLight(this.wall(o.wall), o);
      if (o.curtain !== undefined) this.addCurtain(o, light);
    }
    this.buildRoof();

    // interrupteur : plaque blanche, bascule (haut enfoncé = allumé)
    const sw = this.lightSwitch;
    sw.name = 'interrupteur';
    sw.add(box(0.012, 0.11, 0.08, toon(0xf4f1ea), 0.006, 0, 0, false));
    this.rocker.add(box(0.014, 0.05, 0.035, toon(0xffffff), 0.007, 0, 0, false));
    this.rocker.position.x = 0.012;
    sw.add(this.rocker);
    const swAt = this.wallFrame(spec.lightSwitch.wall, spec.lightSwitch.u, SWITCH_Y);
    swAt.add(sw);
    this.wallGroup(spec.lightSwitch.wall).add(swAt);
    this.mergeGhosts();
  }

  /**
   * Les morceaux « ombre seule » fixes (murs gardés en coupe, cadres des fenêtres, toit) en un seul
   * maillage : un dessin par carte d'ombre au lieu d'une centaine. Le battant de porte, qui tourne,
   * reste à part (dans son groupe).
   */
  private mergeGhosts(): void {
    const ghosts = this.group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.material === this.shadowMat);
    if (ghosts.length < 2) return;
    const geo = mergeGeometries(ghosts.map((g) => {
      g.updateMatrix();
      return g.geometry.clone().applyMatrix4(g.matrix);
    }), false);
    if (!geo) return;
    const one = new THREE.Mesh(geo, this.shadowMat);
    one.name = 'ombres-murs';
    one.castShadow = true;
    one.receiveShadow = false;
    for (const g of ghosts) g.removeFromParent();
    this.group.add(one);
  }

  /** Le point (x, z) est-il dans la pièce (agrandie de `margin` m de chaque côté) ? */
  contains(p: THREE.Vector3, margin = 0): boolean {
    const { x0, x1, z0, z1 } = this.rect;
    return p.x > x0 - margin && p.x < x1 + margin && p.z > z0 - margin && p.z < z1 + margin;
  }

  /** Mur haut `name` : y accrocher du décor, caché avec le mur quand il est abaissé en coupe. */
  wallGroup(name: WallName): THREE.Group {
    return this.wall(name).full;
  }

  /** Ajoute une animation du décor, appelée à chaque image avec l'heure du jeu. */
  onTick(fn: (dt: number, hour: number) => void): void {
    this.tickers.push(fn);
  }

  /**
   * Repère posé sur la face intérieure du mur `name`, à la place `u` le long du mur et à la
   * hauteur `y` : son X local entre dans la pièce, son Z local suit le mur.
   */
  wallFrame(name: WallName, u: number, y = 0): THREE.Group {
    const [nx, nz] = WALLS[name].n;
    const { x0, x1, z0, z1 } = this.rect;
    const g = new THREE.Group();
    if (nx === 0) g.position.set(u, y, nz > 0 ? z0 : z1);
    else g.position.set(nx > 0 ? x0 : x1, y, u);
    g.rotation.y = Math.atan2(-nz, nx);
    return g;
  }

  /** Les lampes sont-elles allumées (ou en train de s'allumer) ? */
  get lightsOn(): boolean {
    return this.manual ? this.manual.on : lampLevel(this.hour) > 0.5;
  }

  /** Allume ou éteint à l'interrupteur, jusqu'au prochain lever ou coucher du soleil. */
  setLights(on: boolean): void {
    this.manual = { on, auto: lampLevel(this.hour) > 0.5 };
  }

  /** Où se tenir pour appuyer sur l'interrupteur, et le point à regarder. */
  switchSpot(): { stand: THREE.Vector3; face: THREE.Vector3 } {
    const f = this.wallFrame(this.spec.lightSwitch.wall, this.spec.lightSwitch.u, SWITCH_Y);
    const [nx, nz] = WALLS[this.spec.lightSwitch.wall].n;
    return { stand: f.position.clone().setY(0).add(new THREE.Vector3(nx, 0, nz).multiplyScalar(0.45)), face: f.position.clone() };
  }

  /** Distance de l'interrupteur sur le rayon, s'il est visible et touché. */
  switchHit(ray: THREE.Raycaster): number | null {
    if (!this.visibleChain(this.lightSwitch)) return null;
    return ray.intersectObject(this.lightSwitch, true)[0]?.distance ?? null;
  }

  /** Porte intérieure ou rideaux visés par le rayon (visibles), leur numéro et leur distance. */
  fixtureHit(ray: THREE.Raycaster): { kind: 'porte' | 'rideaux'; index: number; distance: number } | null {
    let best: { kind: 'porte' | 'rideaux'; index: number; distance: number } | null = null;
    const test = (kind: 'porte' | 'rideaux', index: number, o: THREE.Object3D) => {
      if (!this.visibleChain(o)) return;
      const d = ray.intersectObject(o, true)[0]?.distance;
      if (d !== undefined && (!best || d < best.distance)) best = { kind, index, distance: d };
    };
    this.leaves.forEach((l, i) => { if (l.inner) test('porte', i, l.door); });
    this.curtains.forEach((c, i) => test('rideaux', i, c.group));
    return best;
  }

  /** La porte intérieure `i` est-elle ouverte (laissée ouverte à la main) ? */
  doorOpen(i: number): boolean {
    return !this.leaves[i].shut;
  }

  /** Ouvre ou ferme la porte intérieure `i` (elle tourne à son rythme). */
  setDoor(i: number, open: boolean): void {
    const l = this.leaves[i];
    l.shut = !open;
    // fermée par le perso planté devant : elle attend qu'il s'éloigne pour se rouvrir à son passage
    l.armed = open;
  }

  /** Les rideaux `i` sont-ils tirés ? */
  curtainsDrawn(i: number): boolean {
    return this.curtains[i].drawn;
  }

  /** Tire (`drawn`) ou ouvre les rideaux `i`. */
  setCurtains(i: number, drawn: boolean): void {
    this.curtains[i].drawn = drawn;
  }

  /**
   * Où se tenir pour ouvrir ou fermer la porte `i` (du côté de `from`, dans la pièce ou de l'autre
   * côté du mur), ou tirer les rideaux `i` ; et le point à regarder.
   */
  fixtureSpot(kind: 'porte' | 'rideaux', i: number, from: THREE.Vector3): { stand: THREE.Vector3; face: THREE.Vector3 } {
    if (kind === 'porte') {
      const l = this.leaves[i];
      const [nx, nz] = WALLS[l.wall].n;
      const n = new THREE.Vector3(nx, 0, nz);
      const c = l.center.clone().setY(0);
      // devant la porte, côté pièce ; de l'autre côté si le perso est derrière le mur
      const inside = from.clone().sub(c).dot(n) > -WALL_T;
      const stand = inside ? c.clone().addScaledVector(n, 0.75) : c.clone().addScaledVector(n, -(2 * WALL_T + 0.75));
      return { stand, face: c.setY(1) };
    }
    const c = this.curtains[i];
    const f = this.wallFrame(c.wall, c.u, 1.2);
    const [nx, nz] = WALLS[c.wall].n;
    return { stand: f.position.clone().setY(0).add(new THREE.Vector3(nx, 0, nz).multiplyScalar(0.7)), face: f.position.clone() };
  }

  /** Lampe (suspension au plafond, ou lampadaire posé au sol) et sa lumière, éteinte au départ. */
  private addLamp(x: number, z: number, kind: 'suspension' | 'lampadaire', shadeColor: THREE.ColorRepresentation): void {
    const lamp = new THREE.Group();
    lamp.name = kind;
    const shadeMat = toon(shadeColor);
    shadeMat.side = THREE.DoubleSide;
    const y = kind === 'suspension' ? LAMP_Y : FLOOR_LAMP_Y;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), this.bulbMat);
    bulb.position.y = y;
    if (kind === 'suspension') {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, WALL_H - LAMP_Y - 0.1, 6), toon(0x2a2a2a));
      cord.position.y = (WALL_H + LAMP_Y + 0.1) / 2;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.16, 20, 1, true), shadeMat);
      shade.position.y = LAMP_Y + 0.06;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), toon(0xc9a24a));
      cap.position.y = LAMP_Y + 0.16;
      lamp.add(cord, shade, cap, bulb);
    } else {
      // socle rond, pied fin, abat-jour en tronc de cône au-dessus de l'ampoule
      const brass = toon(0xc9a24a);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24), brass);
      base.position.y = 0.015;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y - 0.03, 8), brass);
      pole.position.y = (y - 0.03) / 2 + 0.03;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 24, 1, true), shadeMat);
      shade.position.y = y + 0.06;
      lamp.add(base, pole, shade, bulb);
      lamp.traverse((o) => { if (o instanceof THREE.Mesh && o !== bulb) o.castShadow = true; });
      this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, y + 0.2, 0.2)), pos: new THREE.Vector3(x, 0, z), yaw: 0, wall: false });
    }
    lamp.position.set(x, 0, z);
    // la lumière part juste sous l'ampoule, pour éclairer sous l'abat-jour
    const light = lightAllPasses(new THREE.PointLight(LAMP_COLOR, 0, LAMP_RANGE, 2));
    light.position.set(x, y - 0.08, z);
    light.castShadow = true;
    light.shadow.mapSize.set(LAMP_SHADOW, LAMP_SHADOW);
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = LAMP_RANGE;
    light.shadow.bias = -0.003;
    light.shadow.radius = 3;
    // carte d'ombre calculée au moins une fois, même si la lampe démarre éteinte (sinon rien ne s'affiche)
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    this.lamps.push(light);
    this.group.add(lamp, light);
  }

  /**
   * Porte ou passage `d` : chambranle côté pièce, seuil dans l'épaisseur du mur ; une porte
   * d'entrée a en plus un battant qui s'ouvre vers l'extérieur, et un paillasson.
   */
  private addDoorway(d: Doorway): void {
    const w = this.wall(d.wall);
    const uc = (d.u0 + d.u1) / 2, half = (d.u1 - d.u0) / 2;
    const frame = toon(FRAME);
    const f = this.wallFrame(d.wall, uc);
    f.add(
      box(0.03, DOOR_H + 0.06, 0.06, frame, 0.015, (DOOR_H + 0.06) / 2, -half - 0.03),
      box(0.03, DOOR_H + 0.06, 0.06, frame, 0.015, (DOOR_H + 0.06) / 2, half + 0.03),
      box(0.03, 0.06, 2 * half + 0.12, frame, 0.015, DOOR_H + 0.03, 0),
    );
    w.full.add(f);
    // seuil en bois dans l'épaisseur du mur
    const sill = this.wallFrame(d.wall, uc);
    sill.add(box(WALL_T, 0.012, 2 * half, toon(DARK_WOOD), -WALL_T / 2, 0.006, 0, false));
    this.group.add(sill);
    if (d.garage) {
      this.addLift(d);
      return;
    }
    if (!d.leaf && !d.inner) return;
    const inner = !!d.inner;
    const leafMat = toon(inner ? 0xf4f1ea : 0x6f8f74);
    const panelMat = toon(inner ? 0xe6e1d6 : 0x5f7d64);
    const knob = toon(inner ? 0xc8ced4 : 0xc9a24a);
    const leafW = 2 * half - 0.02;
    // charnière au bout -Z du repère du mur (à l'autre bout avec `flip`) : le battant part de là
    const s = d.flip ? -1 : 1;
    const door = new THREE.Group();
    door.name = inner ? 'porte' : 'porte-entree';
    // porte d'entrée au fond de l'épaisseur du mur (elle s'ouvre dehors) ; porte intérieure contre
    // la pièce (elle s'ouvre dedans, à plat contre le mur)
    door.position.set(inner ? -0.03 : -WALL_T + 0.02, 0, -s * (half - 0.01));
    door.add(
      box(0.04, DOOR_H - 0.02, leafW, leafMat, 0, (DOOR_H - 0.02) / 2 + 0.01, s * leafW / 2),
      // panneaux moulurés et poignée, côté pièce (des deux côtés pour une porte intérieure)
      box(0.01, 0.75, leafW - 0.24, panelMat, 0.025, 1.45, s * leafW / 2),
      box(0.01, 0.75, leafW - 0.24, panelMat, 0.025, 0.55, s * leafW / 2),
      box(0.04, 0.03, 0.12, knob, 0.045, 1.0, s * (leafW - 0.1)),
      box(0.04, 0.03, 0.12, knob, -0.045, 1.0, s * (leafW - 0.1)),
    );
    if (inner) door.add(box(0.01, 0.75, leafW - 0.24, panelMat, -0.025, 1.45, s * leafW / 2), box(0.01, 0.75, leafW - 0.24, panelMat, -0.025, 0.55, s * leafW / 2));
    f.add(door);
    // ombre du battant, gardée même quand le mur est abaissé en coupe ; un peu plus large que le
    // battant : pas de filet de soleil autour quand la porte est fermée
    const gf = this.wallFrame(d.wall, uc);
    const ghost = new THREE.Group();
    ghost.position.copy(door.position);
    const ghostLeaf = box(0.08, DOOR_H + 0.04, leafW + 0.08, this.shadowMat, 0, (DOOR_H + 0.04) / 2, s * leafW / 2);
    ghostLeaf.receiveShadow = false;
    ghost.add(ghostLeaf);
    gf.add(ghost);
    this.group.add(gf);
    // paillasson devant la porte d'entrée ; une porte intérieure, elle, démarre ouverte
    if (!inner) {
      const mat = this.wallFrame(d.wall, uc);
      mat.add(box(0.5, 0.012, 0.8, toon(0x9b6b3d), 0.32, 0.008, 0, false));
      this.group.add(mat);
    }
    // ouverte : la porte d'entrée tourne de 100° vers le dehors, une porte intérieure de 90° vers la pièce
    const swing = (inner ? s : -s) * THREE.MathUtils.degToRad(inner ? 90 : 100);
    this.leaves.push({ door, ghost, center: f.position.clone(), open: inner ? 1 : 0, swing, wall: d.wall, inner, shut: false, armed: true });
  }

  /**
   * Porte de garage basculante dans l'ouverture `d` : un panneau qui pend sous un pivot en haut de
   * l'ouverture, au milieu du mur ; ouverte, elle tourne d'un quart de tour vers la pièce et se range à
   * plat sous le plafond. Le panneau fait par programme est remplacé par le modèle Tripo (dress).
   */
  private addLift(d: Doorway): void {
    const uc = (d.u0 + d.u1) / 2, width = d.u1 - d.u0 - 0.02;
    const pivot = this.wallFrame(d.wall, uc, DOOR_H);
    pivot.position.add(new THREE.Vector3(-WALL_T / 2, 0, 0).applyEuler(pivot.rotation));
    pivot.name = 'porte-garage';
    pivot.add(box(0.05, DOOR_H - 0.01, width, toon(0xe8e4dc), 0, -(DOOR_H - 0.01) / 2, 0));
    const ghost = pivot.clone(false);
    const shade = box(0.09, DOOR_H + 0.04, width + 0.08, this.shadowMat, 0, -(DOOR_H + 0.04) / 2 + 0.02, 0);
    shade.receiveShadow = false;
    ghost.add(shade);
    this.wall(d.wall).full.add(pivot);
    this.group.add(ghost);
    this.lifts.push({ pivot, ghost, center: pivot.position.clone(), width, open: 0 });
  }

  /**
   * Lumière du dehors par la fenêtre `o` du mur `w` : un projecteur dans la pièce, juste sous le
   * haut de la fenêtre, projette au sol la forme des carreaux (texture `windowCookie`). Placé
   * dedans, il n'éclaire pas la façade ni l'herbe.
   */
  private addWindowLight(w: Wall, o: Opening): THREE.SpotLight {
    const alongX = w.n.x === 0;
    const inner = alongX ? w.at.y : w.at.x;
    const um = (o.u0 + o.u1) / 2;
    const at = (u: number, along: number, y: number) =>
      alongX ? new THREE.Vector3(u, y, inner + w.n.y * along) : new THREE.Vector3(inner + w.n.x * along, y, u);
    const light = lightAllPasses(new THREE.SpotLight(WIN_DAY, 0, 7, 0.55, 0.15, 1.2));
    light.position.copy(at(um, 0.3, WALL_H - 0.1));
    light.target.position.copy(at(um, 2.1, 0));
    light.map = windowCookie();
    light.castShadow = true;
    light.shadow.mapSize.set(LAMP_SHADOW, LAMP_SHADOW);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 7;
    light.shadow.bias = -0.001;
    light.shadow.radius = 4;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    this.winLights.push(light);
    this.group.add(light, light.target);
    return light;
  }

  /**
   * Rideaux de la fenêtre `o` : une tringle au-dessus, deux pans de tissu qui se rejoignent au
   * milieu quand on les tire. Leur ombre (gardée en coupe) arrête le soleil ; la lumière de la
   * fenêtre `light` baisse quand ils sont tirés.
   */
  private addCurtain(o: Opening, light: THREE.SpotLight): void {
    const width = o.u1 - o.u0 + 0.3;
    const top = Math.min(o.y1 + 0.12, WALL_H - 0.05);
    const g = this.wallFrame(o.wall, (o.u0 + o.u1) / 2);
    g.add(box(0.025, 0.025, width + 0.06, toon(DARK_WOOD), 0.09, top, 0, false));
    for (const s of [-1, 1]) g.add(box(0.03, 0.04, 0.04, toon(DARK_WOOD), 0.09, top, s * (width / 2 + 0.03), false));
    const h = top - Math.max(o.y0 - 0.2, 0.05);
    // pan de 1 m de large, plissé : mis à l'échelle (le long du mur) selon qu'il est tiré ou non
    const geo = new THREE.BoxGeometry(0.03, h, 1);
    const mat = toon(o.curtain!);
    const panels: Curtain['panels'] = [];
    const gf = this.wallFrame(o.wall, (o.u0 + o.u1) / 2);
    for (const side of [-1, 1] as const) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.position.set(0.09, top - 0.02 - h / 2, 0);
      // plis : de fines bandes plus sombres
      for (let i = -2; i <= 2; i++) mesh.add(box(0.032, h, 0.04, toon(new THREE.Color(o.curtain!).multiplyScalar(0.82)), 0, 0, i * 0.2, false));
      g.add(mesh);
      const ghost = new THREE.Mesh(geo, this.shadowMat);
      ghost.castShadow = true;
      ghost.receiveShadow = false;
      ghost.position.copy(mesh.position);
      gf.add(ghost);
      panels.push({ mesh, ghost, side });
    }
    g.name = 'rideaux';
    this.wallGroup(o.wall).add(g);
    this.group.add(gf);
    const c: Curtain = { group: g, panels, light, wall: o.wall, u: (o.u0 + o.u1) / 2, width, drawn: false, k: 0 };
    this.curtains.push(c);
    this.placeCurtain(c);
  }

  /** Pans des rideaux selon leur part tirée : repliés de chaque côté, ou se rejoignant au milieu. */
  private placeCurtain(c: Curtain): void {
    const k = THREE.MathUtils.smootherstep(c.k, 0, 1);
    const w = THREE.MathUtils.lerp(0.18, c.width / 2 + 0.02, k);
    for (const p of c.panels) {
      for (const m of [p.mesh, p.ghost]) {
        m.scale.z = w;
        m.position.z = p.side * (c.width / 2 - w / 2);
      }
      // les plis gardent leur épaisseur : on les écarte avec le pan
      for (const f of p.mesh.children) f.scale.z = 1 / w;
    }
  }

  /**
   * Complète la pièce jusqu'à `lamps` lampes et `windows` fenêtres à ombre, avec des lumières
   * éteintes à la carte d'ombre minuscule : toutes les pièces ont ainsi le même nombre de lumières
   * à ombre, et passer d'une pièce à l'autre ne fait recompiler aucun shader.
   */
  padShadows(lamps: number, windows: number): void {
    const { x0, x1, z0, z1 } = this.rect;
    const c = new THREE.Vector3((x0 + x1) / 2, WALL_H - 0.2, (z0 + z1) / 2);
    const setup = (l: THREE.PointLight | THREE.SpotLight) => {
      lightAllPasses(l);
      l.position.copy(c);
      l.castShadow = this.shadowsOn;
      l.shadow.mapSize.set(16, 16);
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = true;
      this.spares.push(l);
      this.group.add(l);
    };
    for (let i = this.lamps.length; i < lamps; i++) setup(new THREE.PointLight(LAMP_COLOR, 0, 0.5, 2));
    for (let i = this.winLights.length; i < windows; i++) {
      const l = new THREE.SpotLight(WIN_DAY, 0, 0.5, 0.55, 0.15, 1.2);
      l.map = this.shadowsOn ? windowCookie() : null;
      l.target.position.copy(c).setY(0);
      this.group.add(l.target);
      setup(l);
    }
  }

  get shadowCounts(): { lamps: number; windows: number } {
    return { lamps: this.lamps.length, windows: this.winLights.length };
  }

  /**
   * Toit à deux pentes (faîtage le long de x) et pignons, au-dessus des murs. Côté mitoyen
   * (spec.joined), ni débord ni pignon : il rejoint le toit de la pièce voisine.
   */
  private buildRoof(): void {
    const { x0, x1, z0, z1 } = this.rect;
    const joined = new Set(this.spec.joined ?? []);
    const over = (w: WallName) => (joined.has(w) ? 0 : ROOF_OVER);
    const xa = x0 - WALL_T - over('ouest'), xb = x1 + WALL_T + over('est');
    const lx = xb - xa, xc = (xa + xb) / 2;
    const tan = Math.tan(ROOF_PITCH);
    const halfIn = (z1 - z0) / 2 + WALL_T;
    const zc = (z0 + z1) / 2;
    // faîtage : au-dessus du milieu, à la hauteur où la pente passe sur le haut des murs
    const ridgeY = WALL_H - 0.02 + halfIn * tan;
    // tuiles : rangées en quinconce
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#a4513a';
    g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) {
      g.fillStyle = '#7e3a28';
      g.fillRect(0, r * 32 + 28, 128, 4);
      for (let i = 0; i < 4; i++) g.fillRect(((i + (r % 2) * 0.5) * 32) % 128, r * 32, 3, 28);
    }
    for (const side of [-1, 1]) {
      const run = halfIn + over(side < 0 ? 'nord' : 'sud');
      const slope = run / Math.cos(ROOF_PITCH);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(lx / 0.8, slope / 0.6);
      const pan = box(lx, 0.06, slope, toon(0xffffff, tex), xc, ridgeY - (run * tan) / 2, zc + side * run / 2, false);
      pan.rotation.x = side * ROOF_PITCH;
      this.roof.add(pan);
      this.roofPans.push({ mesh: pan, side, lx, slope });
    }
    this.roof.add(box(lx + 0.04, 0.08, 0.12, toon(0x7e3a28), xc, ridgeY + 0.03, zc, false));
    // pignons, en crépi comme les murs, à l'aplomb des murs est et ouest
    const tri = new THREE.Shape();
    tri.moveTo(-halfIn, 0);
    tri.lineTo(halfIn, 0);
    tri.lineTo(0, halfIn * tan);
    const gable = new THREE.ExtrudeGeometry(tri, { depth: WALL_T, bevelEnabled: false });
    for (const [w, x] of [['ouest', x0 - WALL_T], ['est', x1]] as const) {
      if (joined.has(w)) continue;
      this.gables.set(w, { height: halfIn * tan, half: halfIn });
      const m = new THREE.Mesh(gable, this.wallMat);
      m.rotation.y = Math.PI / 2;
      m.position.set(x, WALL_H, zc);
      this.roof.add(m);
    }
    this.roof.updateMatrixWorld(true);
    this.roof.visible = false;
    this.roof.name = 'toit';
    this.group.add(this.roof);
  }

  /**
   * Habille la pièce avec le kit Tripo (kit.ts) : carrelage du sol, enduit sur les deux faces des
   * murs (hauts et abaissés), pans de toit en tuiles, battant de la porte d'entrée et fenêtres en
   * bois. Les pièces faites par programme restent dessous ou cachées : les ombres, les clics et le
   * contournement des murs ne changent pas.
   */
  dress(kit: Kit): void {
    const { x0, x1, z0, z1 } = this.rect;
    // sol : carreaux de 40 cm, comme le carrelage fait par programme, à peine en relief
    const nx = Math.max(1, Math.round((x1 - x0) / KIT_FLOOR)), nz = Math.max(1, Math.round((z1 - z0) / KIT_FLOOR));
    const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const part of this.spec.kitFloor === false ? [] : kitParts(kit.sol)) {
      const tiles = new THREE.InstancedMesh(part.geometry, part.material, nx * nz);
      // le carreau du kit fait 1 m de côté et 3 cm d'épaisseur : ramené à la grille, et à 1 cm
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        m.compose(new THREE.Vector3(x0 + (i + 0.5) * sx, -0.005, z0 + (k + 0.5) * sz), q, new THREE.Vector3(sx, 1 / 3, sz));
        tiles.setMatrixAt(i * nz + k, m);
      }
      tiles.castShadow = false;
      tiles.receiveShadow = true;
      tiles.name = `carrelage-${this.spec.name}`;
      this.group.add(tiles);
    }
    if (this.spec.kitFloor !== false) this.floor.visible = false;

    // murs : l'enduit sur chaque face des morceaux pleins, haut et bas (en coupe), et des pignons
    for (const w of this.walls) {
      // sous un pignon, l'enduit monte d'un seul tenant jusqu'au toit, coins compris
      const gable = this.gables.get(w.name);
      const ext = gable ? WALL_T : 0;
      const a = w.span[0] - ext, b = w.span[1] + ext;
      const sheet = new PlasterSheet(kit.mur, b - a, WALL_H + (gable?.height ?? 0));
      const alongX = w.n.x === 0;
      const along = alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      /** L'enduit d'une face (s = 1 côté pièce, -1 dehors) : `cut` le prend dans la plaque (u le long de la plaque). */
      const face = (s: number, cut: (flip: boolean) => THREE.BufferGeometry | null, to: THREE.Object3D) => {
        const out = new THREE.Vector3(w.n.x, 0, w.n.y).multiplyScalar(s);
        // repère direct : si (le long du mur, haut, dehors) est retourné, on prend le mur à l'envers
        const flip = along.clone().cross(new THREE.Vector3(0, 1, 0)).dot(out) < 0;
        const geo = cut(flip);
        if (!geo) return;
        const x = flip ? along.clone().negate() : along;
        const at = w.mid + (alongX ? out.z : out.x) * (WALL_T / 2 - PLASTER_IN);
        const origin = alongX ? new THREE.Vector3(flip ? b : a, 0, at) : new THREE.Vector3(at, 0, flip ? b : a);
        const relief = new THREE.Mesh(geo, this.wallMat);
        relief.matrixAutoUpdate = false;
        relief.matrix.makeBasis(x, new THREE.Vector3(0, 1, 0), out).setPosition(origin);
        relief.castShadow = false;
        relief.receiveShadow = true;
        to.add(relief);
      };
      if (gable) {
        const mid = (w.span[0] + w.span[1]) / 2;
        for (const s of [1, -1]) face(s, (flip) => {
          const c = flip ? b - mid : mid - a;
          return sheet.piece(c - gable.half, c + gable.half, WALL_H, WALL_H + gable.height, (u) => WALL_H + gable.height * (1 - Math.abs(u - c) / gable.half));
        }, this.roof);
      }
      for (const group of [w.full, w.low]) {
        for (const piece of [...group.children]) {
          if (!(piece instanceof THREE.Mesh)) continue;
          // le dessus du mur couvre aussi l'enduit ; sous un pignon, il se cache quand le toit se voit
          if (piece.material === this.capMat) {
            const k = (WALL_T + 2 * (PLASTER_OUT + 0.002)) / (WALL_T + 0.004);
            if (alongX) piece.scale.z = k;
            else piece.scale.x = k;
            if (gable && group === w.full) this.gableCaps.push(piece);
            continue;
          }
          if (piece.material !== this.wallMat) continue;
          const g = piece.geometry as THREE.BoxGeometry;
          const len = alongX ? g.parameters.width : g.parameters.depth;
          const uc = alongX ? piece.position.x : piece.position.z;
          const u0 = uc - len / 2, u1 = uc + len / 2;
          const y0 = piece.position.y - g.parameters.height / 2, y1 = piece.position.y + g.parameters.height / 2;
          for (const s of [1, -1]) face(s, (flip) => (flip ? sheet.piece(b - u1, b - u0, y0, y1) : sheet.piece(u0 - a, u1 - a, y0, y1)), group);
        }
      }
    }

    // toit : les tuiles du kit posées une à une sur chaque pan peint
    for (const p of this.roofPans) {
      const wrap = new THREE.Group();
      wrap.position.copy(p.mesh.position);
      wrap.rotation.copy(p.mesh.rotation);
      const pan = new THREE.Group();
      // la tuile canal du kit, posée une à une sur tout le pan (un tirage de variations par pan)
      const seed = Math.round(p.mesh.position.x * 101 + p.mesh.position.z * 31 + p.side * 7919);
      for (const tiles of tileRoof(kit.tuile, p.lx, p.slope, seed)) pan.add(tiles);
      // faîtage du pan du kit à -z : tourné pour le pan nord (son z local monte vers le faîtage)
      pan.rotation.y = p.side < 0 ? Math.PI : 0;
      // posées sur le pan peint, gardé dessous : on ne voit pas le jour entre les tuiles
      pan.position.y = 0.03;
      wrap.add(pan);
      this.roof.add(wrap);
    }
    this.roof.updateMatrixWorld(true);

    // portes : le battant en chêne du kit (poignée côté ouverture), à la place des panneaux
    for (const l of this.leaves) {
      const boxes = l.door.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
      const leaf = boxes[0].geometry as THREE.BoxGeometry;
      const leafW = leaf.parameters.depth, s = Math.sign(boxes[0].position.z) || 1;
      const door = new THREE.Group();
      for (const part of kitParts(kit.porte)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        door.add(mesh);
      }
      // le battant du kit fait 88 × 205 cm, 5 cm d'épaisseur : à la taille de l'ouverture, 4 cm
      door.scale.set(leafW / 0.88, (DOOR_H - 0.02) / 2.05, 0.8);
      door.rotation.y = -s * Math.PI / 2;
      door.position.set(0, 0.01, s * leafW / 2);
      for (const bx of boxes) bx.visible = false;
      l.door.add(door);
    }

    // porte de garage : le modèle Tripo, face avant dehors, à la taille de l'ouverture
    for (const l of this.lifts) {
      const door = new THREE.Group();
      for (const part of kitParts(kit.garage)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        door.add(mesh);
      }
      // le modèle fait 240 × 210 cm (x le long de la porte, face avant +z) : sa face avant passe au
      // -X du repère du mur (dehors), sa largeur le long du mur
      door.rotation.y = -Math.PI / 2;
      door.scale.set(l.width / 2.4, (DOOR_H - 0.01) / 2.1, 0.8);
      door.position.y = -(DOOR_H - 0.01);
      for (const c of l.pivot.children) c.visible = false;
      l.pivot.add(door);
    }

    // fenêtres : la fenêtre en bois du kit (cadre, croisillon, appui côté pièce), la vitre reste
    for (const { o, w, meshes } of this.windowParts) {
      const lu = o.u1 - o.u0, ly = o.y1 - o.y0, um = (o.u0 + o.u1) / 2;
      const win = new THREE.Group();
      for (const part of kitParts(kit.fenetre)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = false;
        win.add(mesh);
      }
      // la fenêtre du kit fait 86 × 115 cm et 14 cm de profondeur (le mur et l'appui qui dépasse)
      win.scale.set(lu / 0.86, ly / 1.15, 1);
      win.rotation.y = Math.atan2(w.n.x, w.n.y);
      win.position.set(w.n.x === 0 ? um : w.mid, o.y0, w.n.x === 0 ? w.mid : um);
      for (const mesh of meshes) mesh.visible = false;
      w.full.add(win);
    }
  }

  /** Lampes et vitres selon l'heure solaire `hour` (0 à 24). */
  private applyLight(dt: number, hour: number): void {
    const auto = lampLevel(hour);
    // l'horloge reprend la main quand elle change d'avis (lever ou coucher du soleil)
    if (this.manual && (auto > 0.5) !== this.manual.auto) this.manual = null;
    if (this.manual) this.lampK = THREE.MathUtils.clamp(this.lampK + (this.manual.on ? 1 : -1) * SWITCH_FADE * dt, 0, 1);
    else this.lampK = Math.abs(auto - this.lampK) < SWITCH_FADE * dt ? auto : this.lampK + Math.sign(auto - this.lampK) * SWITCH_FADE * dt;
    const k = this.lampK;
    // lampe éteinte : sa carte d'ombre n'est plus recalculée
    this.liveShadows.length = 0;
    if (this.shadowsOn && k > 0.001) this.liveShadows.push(...this.lamps);
    this.rocker.rotation.z = this.lightsOn ? 0.25 : -0.25;
    for (const l of this.lamps) l.intensity = LAMP_I * k;
    // ampoule éteinte grise, allumée au-dessus de 1 : le bloom la fait briller
    this.bulbMat.color.setRGB(0.23 + 2.4 * k, 0.2 + 1.9 * k, 0.17 + 1.1 * k);
    // vitres : nuit dès que le soleil est couché, un peu avant que les lampes soient à fond
    const night = Math.max(1 - THREE.MathUtils.smoothstep(hour, SUNRISE - 0.5, SUNRISE + 1), THREE.MathUtils.smoothstep(hour, SUNSET - 1, SUNSET + 0.5));
    this.glassMat.color.copy(PANE_DAY.color).lerp(PANE_NIGHT.color, night);
    this.glassMat.opacity = THREE.MathUtils.lerp(PANE_DAY.opacity, PANE_NIGHT.opacity, night);
    // fenêtres : plein jour (doré près du lever et du coucher), clair de lune la nuit
    const day = THREE.MathUtils.smoothstep(hour, SUNRISE, SUNRISE + 1.5) * (1 - THREE.MathUtils.smoothstep(hour, SUNSET - 1.5, SUNSET));
    const warm = 1 - THREE.MathUtils.smoothstep(Math.min(hour - SUNRISE, SUNSET - hour), 1, 3.5);
    for (const l of this.winLights) {
      l.color.copy(WIN_DAY).lerp(WIN_WARM, warm).lerp(WIN_MOON, 1 - day);
      // rideaux tirés : il ne passe plus qu'un peu de jour à travers le tissu
      const veil = 1 - CURTAIN_DIM * (this.curtains.find((c) => c.light === l)?.k ?? 0);
      l.intensity = (day * WIN_I * (1 - 0.7 * this.overcast) + night * WIN_MOON_I * (1 - 0.6 * this.overcast)) * veil;
      if (this.shadowsOn && l.intensity > 0.01) this.liveShadows.push(l);
    }
  }

  private wall(name: WallName): Wall {
    return this.walls.find((w) => w.name === name)!;
  }

  /**
   * Construit un mur de `a` à `b` (le long de x pour nord et sud, de z pour est et ouest), percé
   * de ses ouvertures : morceaux pleins de toute hauteur, allèges et linteaux autour des ouvertures.
   */
  private addWall(name: WallName, a: number, b: number, openings: Opening[]): void {
    const { x0, x1, z0, z1 } = this.rect;
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
      // l'ombre du mur (plein ou abaissé) est faite par son double « ombre seule », plein, ci-dessous
      if (to === full || to === low) m.castShadow = false;
      // le mur haut garde son ombre même abaissé en coupe : le soleil ne rentre pas par là
      if (to === full) {
        const ghost = new THREE.Mesh(m.geometry, this.shadowMat);
        ghost.position.copy(m.position);
        ghost.castShadow = true;
        ghost.receiveShadow = false;
        this.group.add(ghost);
      }
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
    full.updateMatrixWorld(true);
    const boxes: THREE.Box3[] = [];
    full.traverse((o) => { if (o instanceof THREE.Mesh) boxes.push(new THREE.Box3().setFromObject(o)); });
    this.walls.push({ name, n: new THREE.Vector2(nx, nz), at: alongX ? new THREE.Vector2(0, inner) : new THREE.Vector2(inner, 0), full, low, cut: false, boxes, span: [a, b], mid: c });
    full.traverse((o) => { if (o instanceof THREE.Mesh) this.solid.push(o); });
  }

  /** Fenêtre dans l'ouverture `o` du mur : cadre, croisillon, vitre, rebord côté pièce. */
  private addWindow(w: Wall, o: Opening): void {
    const alongX = w.n.x === 0;
    const inner = alongX ? w.at.y : w.at.x;
    const sgn = alongX ? w.n.y : w.n.x;
    const c = inner - sgn * WALL_T / 2;
    const frame = toon(FRAME);
    const glass = this.glassMat;
    const meshes: THREE.Mesh[] = [];
    if (!o.sash) this.windowParts.push({ o, w, meshes });
    const add = (u: number, y: number, lu: number, ly: number, t: number, mat: THREE.Material, off = 0) => {
      const m = alongX ? box(lu, ly, t, mat, u, y, c + off) : box(t, ly, lu, mat, c + off, y, u);
      m.castShadow = false;
      w.full.add(m);
      if (mat === frame) meshes.push(m);
      // le cadre et le croisillon dessinent leur ombre au sol, même mur abaissé
      if (mat === frame) {
        const ghost = new THREE.Mesh(m.geometry, this.shadowMat);
        ghost.position.copy(m.position);
        ghost.castShadow = true;
        this.group.add(ghost);
      }
      return m;
    };
    const um = (o.u0 + o.u1) / 2, ym = (o.y0 + o.y1) / 2, lu = o.u1 - o.u0, ly = o.y1 - o.y0, f = 0.05;
    add(o.u0 + f / 2, ym, f, ly, WALL_T, frame);
    add(o.u1 - f / 2, ym, f, ly, WALL_T, frame);
    add(um, o.y0 + f / 2, lu, f, WALL_T, frame);
    add(um, o.y1 - f / 2, lu, f, WALL_T, frame);
    if (!o.sash) {
      add(um, ym, 0.03, ly, 0.05, frame);
      add(um, ym, lu, 0.03, 0.05, frame);
      const pane = add(um, ym, lu - 2 * f, ly - 2 * f, 0.01, glass);
      pane.receiveShadow = false;
      pane.name = 'vitre';
    }
    // rebord, qui dépasse un peu dans la pièce
    add(um, o.y0 - 0.015, lu + 0.08, 0.03, WALL_T + 0.06, frame, sgn * 0.03);
  }

  /**
   * À chaque image : murs abaissés quand le perso est dans une pièce (`active`, celle-ci ou une
   * autre) : ceux tournés vers la caméra, et tous ceux qui se trouvent entre la caméra et la pièce
   * du perso ; relevés quand il sort (dehors, le toit et les murs restent pleins). Portes qui s'ouvrent devant le
   * perso, décor animé (selon l'heure `hour`), lampes et vitres selon l'heure solaire `solar`.
   */
  update(dt: number, cameraYaw: number, player: THREE.Vector3, hour: number, solar: number, toCamera: THREE.Vector3, active: Rect | null, shadowRoom: boolean): void {
    const indoors = active !== null;
    const view = new THREE.Vector2(Math.cos(cameraYaw), Math.sin(cameraYaw));
    // bord de la pièce du perso le plus proche de la caméra (mesuré le long de la vue)
    const edge = active ? Math.max(...[active.x0, active.x1].flatMap((x) => [active.z0, active.z1].map((z) => x * view.x + z * view.y))) : 0;
    // un mur passe devant la pièce du perso si son bout côté caméra dépasse ce bord
    const inFront = (w: Wall) => w.boxes.some((b) => Math.max(b.min.x * view.x, b.max.x * view.x) + Math.max(b.min.z * view.y, b.max.z * view.y) > edge + 0.01);
    // perso dans une autre pièce : rayons du perso (jambes, buste, tête) vers la caméra
    const rays = !indoors || this.contains(player) ? [] : [0.4, 1.0, 1.6].map((y) => new THREE.Ray(player.clone().setY(y), toCamera));
    // seules les lampes et les fenêtres d'UNE pièce font des ombres (`shadowRoom` : celle où est le
    // perso, gardée dehors et dans les passages) : chaque ombre prend une texture au shader, et
    // beaucoup de cartes graphiques n'en ont que 16 (au-delà, les matériaux ne s'affichent plus du
    // tout). Le NOMBRE de lumières à ombre ne change donc jamais (la pièce qui les perd et celle qui
    // les prend changent dans la même image) : sinon three recompile tous les matériaux, une
    // saccade à chaque sortie.
    if (shadowRoom !== this.shadowsOn) {
      this.shadowsOn = shadowRoom;
      for (const l of [...this.lamps, ...this.winLights, ...this.spares]) {
        l.castShadow = shadowRoom;
        l.shadow.needsUpdate = true;
      }
      // une fenêtre sans ombre perd aussi sa forme de carreaux : les matériaux des persos (MToon)
      // ne s'affichent plus si des projecteurs ont une forme sans avoir d'ombre
      for (const l of [...this.winLights, ...this.spares]) if (l instanceof THREE.SpotLight) l.map = shadowRoom ? windowCookie() : null;
    }
    const hides = (w: Wall) => rays.some((r) => w.boxes.some((b) => r.intersectsBox(b)));
    for (const w of this.walls) {
      // dans une pièce : les murs côté caméra s'abaissent, et celui qui cache le perso dans la pièce
      // voisine (le mur mitoyen) ; dehors, ils restent pleins
      const cut = indoors && (w.n.dot(view) < -0.1 || inFront(w) || hides(w));
      if (cut !== w.cut) {
        w.cut = cut;
        w.full.visible = !cut;
        w.low.visible = cut;
      }
    }
    // toit : dehors (avec les murs pleins)
    this.roof.visible = !indoors;
    // sous un pignon, le dessus du mur (plus sombre) ferait un trait entre le mur et le pignon
    for (const c of this.gableCaps) c.visible = indoors;
    for (const l of this.leaves) {
      const near = Math.hypot(player.x - l.center.x, player.z - l.center.z) < DOOR_NEAR;
      if (!near) l.armed = true;
      // porte intérieure ouverte : elle le reste ; fermée : elle s'ouvre pour laisser passer
      const want = l.inner && !l.shut ? true : near && l.armed;
      l.open = THREE.MathUtils.clamp(l.open + (want ? 1 : -1) * DOOR_SPEED * dt, 0, 1);
      l.door.rotation.y = THREE.MathUtils.smootherstep(l.open, 0, 1) * l.swing;
      l.ghost.rotation.y = l.door.rotation.y;
    }
    for (const l of this.lifts) {
      const near = Math.hypot(player.x - l.center.x, player.z - l.center.z) < GARAGE_NEAR;
      l.open = THREE.MathUtils.clamp(l.open + (near ? 1 : -1) * GARAGE_SPEED * dt, 0, 1);
      l.pivot.rotation.z = l.ghost.rotation.z = THREE.MathUtils.smootherstep(l.open, 0, 1) * (Math.PI / 2);
    }
    for (const c of this.curtains) {
      const k = THREE.MathUtils.clamp(c.k + (c.drawn ? 1 : -1) * CURTAIN_SPEED * dt, 0, 1);
      if (k !== c.k) {
        c.k = k;
        this.placeCurtain(c);
      }
    }
    for (const t of this.tickers) t(dt, hour);
    this.hour = solar;
    this.applyLight(dt, solar);
  }

  /** Point du sol au pied du mur visé par le rayon (côté pièce) et sa distance, s'il touche un mur avant `maxDist`. */
  wallHit(ray: THREE.Raycaster, maxDist: number): { point: THREE.Vector3; distance: number } | null {
    const hit = ray.intersectObjects(this.solid.filter((o) => this.visibleChain(o)), false)[0];
    if (!hit || hit.distance >= maxDist) return null;
    const { x0, x1, z0, z1 } = this.rect;
    const p = hit.point.clone().setY(0);
    // un peu en avant du mur, dans la pièce
    p.x = THREE.MathUtils.clamp(p.x, x0 + 0.3, x1 - 0.3);
    p.z = THREE.MathUtils.clamp(p.z, z0 + 0.3, z1 - 0.3);
    return { point: p, distance: hit.distance };
  }

  private visibleChain(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  /**
   * Un objet lancé ne traverse pas les murs : s'il sort de la pièce ailleurs que par une porte ou
   * un passage, il rebondit sur le mur (vitesse renvoyée, ralentie). Modifie `pos` et `vel`.
   */
  bounce(prev: THREE.Vector3, pos: THREE.Vector3, vel: THREE.Vector3): void {
    const { x0, x1, z0, z1 } = this.rect;
    if (!this.contains(prev) || this.contains(pos)) return;
    const through = this.spec.doors.some((d) => {
      const [nx, nz] = WALLS[d.wall].n;
      const out = nx > 0 ? pos.x <= x0 : nx < 0 ? pos.x >= x1 : nz > 0 ? pos.z <= z0 : pos.z >= z1;
      const u = nx === 0 ? pos.x : pos.z;
      return out && u > d.u0 + 0.05 && u < d.u1 - 0.05 && pos.y < DOOR_H;
    });
    if (through) return;
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

/**
 * La cuisine : le passage vers l'entrée (mur ouest) et vers le salon (mur est, voir maison.ts),
 * une fenêtre au fond au-dessus de l'évier et une sur le mur sud, la suspension au-dessus de la
 * table, l'interrupteur à côté du passage de l'entrée. Le toit continue sur l'entrée et le salon.
 */
export const KITCHEN: RoomSpec = {
  name: 'cuisine',
  rect: ROOM,
  floor: () => tiledFloor(ROOM),
  doors: [
    { wall: 'ouest', u0: DOOR.z0, u1: DOOR.z1 },
    { wall: 'est', u0: SALON_PASS.z0, u1: SALON_PASS.z1 },
  ],
  joined: ['ouest', 'est'],
  windows: () => [
    { wall: 'nord', u0: -2.1, u1: -1.1, y0: WIN_LOW, y1: WIN_HIGH },
    { wall: 'sud', u0: 0.45, u1: 1.55, y0: 0.95, y1: WIN_HIGH },
  ],
  // la suspension au-dessus de la table
  lamps: () => [{ x: KITCHEN_TABLE.x, z: KITCHEN_TABLE.z, kind: 'suspension' }],
  lightSwitch: { wall: 'ouest', u: DOOR.z1 + 0.2 },
  runs: [
    // le long du fond : l'évier sous la fenêtre, le lave-vaisselle et les tiroirs à sa gauche,
    // puis la gazinière entre deux plans de travail, le four et la poubelle
    { wall: 'nord', from: ROOM.x0, items: ['tiroir', 'lave-vaisselle', 'evier', 'placard', 'gaziniere', 'plan-de-travail', 'four', 0.04, 'poubelle'] },
    // contre le mur de la porte, en retrait du coin (le tiroir et la porte du lave-vaisselle s'y ouvrent) :
    // le frigo, puis le garde-manger (un peu d'écart : sa porte, ouverte, ne touche pas le frigo)
    { wall: 'ouest', from: ROOM.z0 + 1.5, items: ['congelateur', 0.1, 'garde-manger'] },
  ],
  onTop: [
    ['frigo', 'congelateur'],
    // le coin café sur les tiroirs, la bouilloire à côté de l'évier, le micro-ondes près de la gazinière
    ['machine-a-cafe', 'tiroir', 0, -0.12],
    ['bouilloire', 'placard', -0.15, -0.12],
    ['micro-ondes', 'plan-de-travail', 0.1, -0.06],
    // sur le lave-vaisselle : le grille-pain au fond à gauche, l'égouttoir contre l'évier
    ['grille-pain', 'lave-vaisselle', -0.15, -0.14],
    ['egouttoir', 'lave-vaisselle', 0.145, 0],
    ['mixeur', 'four', 0, -0.08],
  ],
  items: [
    // les placards hauts, au mur au-dessus des plans de travail (le haut au ras de la fenêtre)
    ['placard-haut', ROOM.x0 + 0.56, WALL_CUPBOARD_Y, ROOM.z0 + 0.185, 0],
    ['placard-haut', 0.77, WALL_CUPBOARD_Y, ROOM.z0 + 0.185, 0],
    // le coin repas devant la fenêtre du sud : la table, une chaise de chaque côté
    ['table', KITCHEN_TABLE.x, 0, KITCHEN_TABLE.z, 0],
    ['chaise', KITCHEN_TABLE.x, 0, KITCHEN_TABLE.z - 0.5, 0],
    ['chaise', KITCHEN_TABLE.x, 0, KITCHEN_TABLE.z + 0.5, Math.PI],
  ],
};
