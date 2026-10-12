/**
 * La maison de campagne Tripo (public/models/maison-campagne.glb, voir
 * tools/build_campagne_assets.mjs), au sud-est de l'île, où l'on entre : dedans, une vraie pièce
 * (CAMPAGNE_SPEC : murs, parquet, plafond, porte qui s'ouvre, fenêtres, comme celles de la maison)
 * posée juste derrière les façades du modèle. Du dehors, on ne voit que le modèle ; quand le perso
 * est dans la pièce, l'étage et le toit se cachent, et la façade de chaque mur abaissé en coupe
 * aussi : on voit la pièce de dessus, entourée des murs de pierre.
 *
 * Repère du modèle : 1 unité = 1 m, porte vers +z (le sud), seuil à y = 0, milieu en CAMPAGNE_SITE.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAMPAGNE_SITE } from './ile';
import { parquet } from './maison';
import { box, toon, WALL_H, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec, type WallName } from './room';
import { createToonMaterial } from './toon';

export const CAMPAGNE_URL = `${import.meta.env.BASE_URL}models/maison-campagne.glb`;

const { x: CX, z: CZ } = CAMPAGNE_SITE;

/** Nu des façades du modèle au rez-de-chaussée (m, repère du modèle), mesuré par le script de découpe. */
const FACADE = { est: 4.418, ouest: -4.418, sud: 2.528, nord: -2.528 };
/**
 * Face extérieure des murs de la pièce (repère du modèle) : juste en deçà de ce que la façade a de
 * plus rentré (le fond des fenêtres au sud), pour qu'aucune pierre ne perce l'enduit de la pièce.
 */
const INNER = { est: 4.27, ouest: -4.34, sud: 2.24, nord: -2.4 };
/** La porte peinte, découpée dans la façade sud (de -0,6 à 0,6 m, haute de 2,12 m) ; la porte de la pièce y passe. */
const DOOR = { half: 0.55, hole: 0.6, top: 2.12 };

/** La pièce du rez-de-chaussée (monde). */
export const CAMPAGNE: Rect = {
  x0: CX + INNER.ouest + WALL_T,
  x1: CX + INNER.est - WALL_T,
  z0: CZ + INNER.nord + WALL_T,
  z1: CZ + INNER.sud - WALL_T,
};

/** Les deux fenêtres du rez-de-chaussée, au sud, de part et d'autre de la porte (repère du modèle, le long de x). */
const WINDOWS: Array<[number, number]> = [[-2.95, -2.07], [2.03, 2.97]];

/** Le rez-de-chaussée de la maison de campagne : une grande pièce, la porte au sud, les deux fenêtres de la façade. */
export const CAMPAGNE_SPEC: RoomSpec = {
  name: 'maison de campagne',
  rect: CAMPAGNE,
  floor: () => parquet(CAMPAGNE),
  kitFloor: false,
  roof: false,
  doors: [{ wall: 'sud', u0: CX - DOOR.half, u1: CX + DOOR.half, leaf: true, inward: true }],
  windows: () => WINDOWS.map(([u0, u1]) => ({ wall: 'sud' as const, u0: CX + u0, u1: CX + u1, y0: 0.95, y1: WIN_HIGH })),
  runs: [],
  decor: (room) => {
    // entre les murs de la pièce et les façades : le perso ne s'y glisse pas (sauf par la porte)
    const strip = (x0: number, x1: number, z0: number, z1: number) => {
      const h = new THREE.Vector3((x1 - x0) / 2, WALL_H, (z1 - z0) / 2);
      room.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-h.x, 0, -h.z), new THREE.Vector3(h.x, WALL_H, h.z)), pos: new THREE.Vector3(CX + (x0 + x1) / 2, 0, CZ + (z0 + z1) / 2), yaw: 0, wall: true });
    };
    const out = 0.12;
    strip(FACADE.ouest - out, -DOOR.half, INNER.sud, FACADE.sud + out);
    strip(DOOR.half, FACADE.est + out, INNER.sud, FACADE.sud + out);
    strip(FACADE.ouest - out, FACADE.est + out, FACADE.nord - out, INNER.nord);
    strip(INNER.est, FACADE.est + out, INNER.nord, INNER.sud);
    strip(FACADE.ouest - out, INNER.ouest, INNER.nord, INNER.sud);
  },
};

/** Pierre des façades, pour boucher l'épaisseur entre la façade et la pièce : tableaux de la porte, dessus des murs coupés. */
const STONE = 0xb48d5c;
const STONE_TOP = 0x8f6d45;
/** Débord du dessus des murs coupés au-delà du nu de la façade (les pierres en saillie). */
const LEDGE = 0.16;

export type CampagnePart = `rez-${WallName}` | 'etage' | 'toit';

export class Campagne {
  readonly group = new THREE.Group();
  private parts = new Map<CampagnePart, THREE.Group>();

  constructor() {
    this.group.name = 'maison-campagne';
    this.group.position.set(CX, 0, CZ);
    for (const name of ['rez-sud', 'rez-nord', 'rez-est', 'rez-ouest', 'etage', 'toit'] as const) {
      const g = new THREE.Group();
      g.name = name;
      this.parts.set(name, g);
      this.group.add(g);
    }
    this.buildFillers();
  }

  /** Charge le modèle ; ses morceaux vont dans les groupes du même nom. */
  load(): Promise<void> {
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CAMPAGNE_URL).then((gltf) => {
      const mats = new Map<THREE.Material, THREE.Material>();
      for (const node of [...gltf.scene.children]) {
        const to = this.parts.get(node.name as CampagnePart);
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
    const stone = toon(STONE), top = toon(STONE_TOP);
    const add = (part: CampagnePart, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      const m = box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.parts.get(part)!.add(m);
    };
    const front = FACADE.sud + 0.12;
    // la porte : ses tableaux, son linteau et son seuil de pierre, de la pièce jusqu'au nu de la façade
    for (const s of [-1, 1]) add('rez-sud', stone, s > 0 ? DOOR.half : -DOOR.hole - 0.04, s > 0 ? DOOR.hole + 0.04 : -DOOR.half, 0, DOOR.top, INNER.sud, front);
    add('rez-sud', stone, -DOOR.hole - 0.04, DOOR.hole + 0.04, 2.08, DOOR.top + 0.1, INNER.sud, front);
    add('rez-sud', stone, -DOOR.hole, DOOR.hole, -0.02, 0.012, INNER.sud, front + 0.1);
    // le dessus des façades coupées, au ras du haut des murs de la pièce
    const y0 = WALL_H, y1 = WALL_H + 0.02;
    const w = FACADE.ouest - LEDGE, e = FACADE.est + LEDGE;
    add('rez-sud', top, w, e, y0, y1, INNER.sud, FACADE.sud + LEDGE);
    add('rez-nord', top, w, e, y0, y1, FACADE.nord - LEDGE, INNER.nord);
    add('rez-est', top, INNER.est, e, y0, y1, INNER.nord, INNER.sud);
    add('rez-ouest', top, w, INNER.ouest, y0, y1, INNER.nord, INNER.sud);
  }

  /**
   * À chaque image. `room` : la pièce du rez-de-chaussée ; `inside` : le perso y est, vu de dessus
   * (à la première personne, tout reste entier). Dedans, l'étage et le toit se cachent, et la façade
   * de chaque mur abaissé en coupe.
   */
  update(room: Room, inside: boolean): void {
    this.parts.get('etage')!.visible = !inside;
    this.parts.get('toit')!.visible = !inside;
    for (const w of ['sud', 'nord', 'est', 'ouest'] as const) this.parts.get(`rez-${w}`)!.visible = !inside || !room.wallCut(w);
  }

  /** Emprise au sol du modèle (monde), pour y retirer les touffes d'herbe. */
  static footprint(): Rect {
    return { x0: CX + FACADE.ouest - 0.3, x1: CX + FACADE.est + 0.3, z0: CZ + FACADE.nord - 0.3, z1: CZ + FACADE.sud + 0.5 };
  }
}
