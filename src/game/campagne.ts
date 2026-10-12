/**
 * Les maisons Tripo où l'on entre (public/models/maison-<nom>.glb, voir
 * tools/build_campagne_assets.mjs) : la maison de campagne au sud-est de l'île et la maison en
 * pierre à l'est. Dans chacune, une vraie pièce au rez-de-chaussée (murs, parquet, plafond, porte
 * qui s'ouvre, fenêtres, comme celles de la maison) posée juste derrière les façades du modèle. Du
 * dehors, on ne voit que le modèle ; quand le perso est dans la pièce, l'étage et le toit se cachent,
 * et la façade de chaque mur abaissé en coupe aussi : on voit la pièce de dessus, entourée des murs
 * de pierre.
 *
 * Repère de chaque modèle : 1 unité = 1 m, porte vers +z (le sud), seuil à y = 0, milieu de la
 * pièce du bas en `site`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAMPAGNE_SITE, PIERRE_SITE } from './ile';
import { parquet } from './maison';
import { box, toon, WALL_H, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec, type WallName } from './room';
import { createToonMaterial } from './toon';

type Sides = Record<WallName, number>;

/** Une maison Tripo où l'on entre (m, repère du modèle sauf `site`). */
export interface TripoHouse {
  /** Nom de la pièce du bas. */
  name: string;
  /** Fichier sous public/models/. */
  file: string;
  /** Milieu de la pièce du bas (monde). */
  site: { x: number; z: number };
  /** Nu des façades au rez-de-chaussée, mesuré par le script de découpe. */
  facade: Sides;
  /**
   * Face extérieure des murs de la pièce : juste en deçà de ce que la façade a de plus rentré (le
   * fond des fenêtres), pour qu'aucune pierre ne perce l'enduit de la pièce.
   */
  inner: Sides;
  /** La porte peinte, découpée dans la façade sud : milieu `at`, demi-largeur de la pièce `half` et du trou `hole`, haut du trou. */
  door: { at: number; half: number; hole: number; top: number };
  /** Fenêtres du rez-de-chaussée (le long de x au sud et au nord, de z à l'est et à l'ouest), et leur appui. */
  windows: Array<{ wall: WallName; u0: number; u1: number }>;
  sill: number;
  /** Pierre de la façade, pour boucher l'épaisseur entre la façade et la pièce, et le dessus des murs coupés. */
  stone: number;
  stoneTop: number;
  /** Ce qui est fermé autour de la pièce, en plus des façades (l'aile de la maison en pierre) : x0, x1, z0, z1. */
  solids?: Array<[number, number, number, number]>;
  /** Avancée du perron devant la façade sud (sans herbe). */
  porch: number;
}

/** La maison de campagne : une grande pièce, la porte au sud, les deux fenêtres de la façade. */
export const CAMPAGNE_HOUSE: TripoHouse = {
  name: 'maison de campagne',
  file: 'maison-campagne.glb',
  site: CAMPAGNE_SITE,
  facade: { est: 4.418, ouest: -4.418, sud: 2.528, nord: -2.528 },
  inner: { est: 4.27, ouest: -4.34, sud: 2.24, nord: -2.4 },
  door: { at: 0, half: 0.55, hole: 0.6, top: 2.12 },
  windows: [{ wall: 'sud', u0: -2.95, u1: -2.07 }, { wall: 'sud', u0: 2.03, u1: 2.97 }],
  sill: 0.95,
  stone: 0xb48d5c,
  stoneTop: 0x8f6d45,
  porch: 0.5,
};

/**
 * La maison en pierre : le corps de logis (deux étages et des combles) et, collée au nord et à
 * l'est, une aile basse qui reste fermée. La pièce du bas tient tout le corps de logis : la double
 * porte cintrée sous l'auvent au sud, quatre fenêtres au sud et deux à l'ouest.
 */
export const PIERRE_HOUSE: TripoHouse = {
  name: 'maison en pierre',
  file: 'maison-pierre.glb',
  site: PIERRE_SITE,
  facade: { est: 4.775, ouest: -4.775, sud: 2.819, nord: -2.819 },
  inner: { est: 4.6, ouest: -4.28, sud: 2.5, nord: -2.75 },
  door: { at: -0.13, half: 0.65, hole: 0.82, top: 2.23 },
  windows: [
    { wall: 'sud', u0: -4.0, u1: -3.45 },
    { wall: 'sud', u0: -2.53, u1: -1.93 },
    { wall: 'sud', u0: 1.75, u1: 2.37 },
    { wall: 'sud', u0: 3.24, u1: 3.85 },
    { wall: 'ouest', u0: -2.17, u1: -1.46 },
    { wall: 'ouest', u0: 0.42, u1: 1.13 },
  ],
  sill: 0.7,
  stone: 0xc8ac7c,
  stoneTop: 0xa48a5f,
  solids: [[-3.75, 6.7, -6.25, -2.82], [4.77, 6.7, -2.82, 2.15]],
  porch: 1,
};

/** La pièce du rez-de-chaussée d'une maison Tripo (monde). */
function houseRect(h: TripoHouse): Rect {
  const { x, z } = h.site;
  return { x0: x + h.inner.ouest + WALL_T, x1: x + h.inner.est - WALL_T, z0: z + h.inner.nord + WALL_T, z1: z + h.inner.sud - WALL_T };
}

/** La fiche de la pièce du bas d'une maison Tripo. */
function houseSpec(h: TripoHouse): RoomSpec {
  const rect = houseRect(h);
  const { x: CX, z: CZ } = h.site;
  const { facade: F, inner: IN, door: D } = h;
  return {
    name: h.name,
    rect,
    floor: () => parquet(rect),
    kitFloor: false,
    roof: false,
    doors: [{ wall: 'sud', u0: CX + D.at - D.half, u1: CX + D.at + D.half, leaf: true, inward: true }],
    windows: () => h.windows.map((w) => {
      const c = w.wall === 'sud' || w.wall === 'nord' ? CX : CZ;
      return { wall: w.wall, u0: c + w.u0, u1: c + w.u1, y0: h.sill, y1: WIN_HIGH };
    }),
    runs: [],
    decor: (room) => {
      // entre les murs de la pièce et les façades : le perso ne s'y glisse pas (sauf par la porte)
      const strip = (x0: number, x1: number, z0: number, z1: number) => {
        const half = new THREE.Vector3((x1 - x0) / 2, WALL_H, (z1 - z0) / 2);
        room.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-half.x, 0, -half.z), new THREE.Vector3(half.x, WALL_H, half.z)), pos: new THREE.Vector3(CX + (x0 + x1) / 2, 0, CZ + (z0 + z1) / 2), yaw: 0, wall: true });
      };
      const out = 0.12;
      strip(F.ouest - out, D.at - D.half, IN.sud, F.sud + out);
      strip(D.at + D.half, F.est + out, IN.sud, F.sud + out);
      strip(F.ouest - out, F.est + out, F.nord - out, IN.nord);
      strip(IN.est, F.est + out, IN.nord, IN.sud);
      strip(F.ouest - out, IN.ouest, IN.nord, IN.sud);
      for (const [x0, x1, z0, z1] of h.solids ?? []) strip(x0, x1, z0, z1);
    },
  };
}

export const CAMPAGNE_SPEC = houseSpec(CAMPAGNE_HOUSE);
export const PIERRE_SPEC = houseSpec(PIERRE_HOUSE);

/** Débord du dessus des murs coupés au-delà du nu de la façade (les pierres en saillie). */
const LEDGE = 0.16;

export type TripoPart = `rez-${WallName}` | 'etage' | 'toit' | 'aile';

/** Le modèle d'une maison Tripo autour de sa pièce, et ce qui s'en cache quand le perso y est. */
export class TripoHouseModel {
  readonly group = new THREE.Group();
  private parts = new Map<TripoPart, THREE.Group>();

  constructor(readonly house: TripoHouse, readonly spec: RoomSpec) {
    this.group.name = house.file.replace('.glb', '');
    this.group.position.set(house.site.x, 0, house.site.z);
    for (const name of ['rez-sud', 'rez-nord', 'rez-est', 'rez-ouest', 'etage', 'toit', 'aile'] as const) {
      const g = new THREE.Group();
      g.name = name;
      this.parts.set(name, g);
      this.group.add(g);
    }
    this.buildFillers();
  }

  /** Charge le modèle ; ses morceaux vont dans les groupes du même nom. */
  load(): Promise<void> {
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}models/${this.house.file}`).then((gltf) => {
      const mats = new Map<THREE.Material, THREE.Material>();
      for (const node of [...gltf.scene.children]) {
        const to = this.parts.get(node.name as TripoPart);
        if (!to) continue;
        node.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const m = o.material as THREE.MeshStandardMaterial;
          if (!mats.has(m)) {
            if (m.map) m.map.anisotropy = 8;
            mats.set(m, createToonMaterial({ color: m.color, map: m.map, rimStrength: 0, soft: true }));
          }
          o.material = mats.get(m)!;
          o.castShadow = o.receiveShadow = true;
        });
        to.add(node);
      }
    });
  }

  /**
   * L'épaisseur entre les façades et les murs de la pièce : tableaux et linteau de la porte, seuil,
   * et le dessus de chaque façade coupée à hauteur des murs (vu de dessus quand l'étage est caché).
   */
  private buildFillers(): void {
    const { facade: F, inner: IN, door: D } = this.house;
    const stone = toon(this.house.stone), top = toon(this.house.stoneTop);
    const add = (part: TripoPart, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      const m = box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.parts.get(part)!.add(m);
    };
    const front = F.sud + 0.12;
    const a = D.at;
    // la porte : ses tableaux, son linteau et son seuil de pierre, de la pièce jusqu'au nu de la façade
    for (const s of [-1, 1]) add('rez-sud', stone, s > 0 ? a + D.half : a - D.hole - 0.04, s > 0 ? a + D.hole + 0.04 : a - D.half, 0, D.top, IN.sud, front);
    add('rez-sud', stone, a - D.hole - 0.04, a + D.hole + 0.04, 2.08, D.top + 0.1, IN.sud, front);
    add('rez-sud', stone, a - D.hole, a + D.hole, -0.02, 0.012, IN.sud, front + 0.1);
    // le dessus des façades coupées, au ras du haut des murs de la pièce
    const y0 = WALL_H, y1 = WALL_H + 0.02;
    const w = F.ouest - LEDGE, e = F.est + LEDGE;
    add('rez-sud', top, w, e, y0, y1, IN.sud, F.sud + LEDGE);
    add('rez-nord', top, w, e, y0, y1, F.nord - LEDGE, IN.nord);
    add('rez-est', top, IN.est, e, y0, y1, IN.nord, IN.sud);
    add('rez-ouest', top, w, IN.ouest, y0, y1, IN.nord, IN.sud);
  }

  /**
   * À chaque image. `room` : la pièce du rez-de-chaussée ; `inside` : le perso y est, vu de dessus
   * (à la première personne, tout reste entier). Dedans, l'étage et le toit se cachent, et la façade
   * de chaque mur abaissé en coupe ; l'aile aussi quand le mur nord ou est l'est.
   */
  update(room: Room, inside: boolean): void {
    this.parts.get('etage')!.visible = !inside;
    this.parts.get('toit')!.visible = !inside;
    for (const w of ['sud', 'nord', 'est', 'ouest'] as const) this.parts.get(`rez-${w}`)!.visible = !inside || !room.wallCut(w);
    this.parts.get('aile')!.visible = !inside || (!room.wallCut('nord') && !room.wallCut('est'));
  }

  /** Emprise au sol du modèle (monde), pour y retirer les touffes d'herbe. */
  footprint(): Rect {
    const { site: { x, z }, facade: F } = this.house;
    const r = { x0: x + F.ouest - 0.3, x1: x + F.est + 0.3, z0: z + F.nord - 0.3, z1: z + F.sud + this.house.porch };
    for (const [x0, x1, z0, z1] of this.house.solids ?? []) {
      r.x0 = Math.min(r.x0, x + x0 - 0.3); r.x1 = Math.max(r.x1, x + x1 + 0.3);
      r.z0 = Math.min(r.z0, z + z0 - 0.3); r.z1 = Math.max(r.z1, z + z1 + 0.3);
    }
    return r;
  }
}

/** Les maisons Tripo de l'île, chacune avec la fiche de sa pièce (rooms.ts). */
export const TRIPO_HOUSES: Array<[TripoHouse, RoomSpec]> = [[CAMPAGNE_HOUSE, CAMPAGNE_SPEC], [PIERRE_HOUSE, PIERRE_SPEC]];
