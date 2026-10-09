/**
 * La couette souple du lit : la géométrie du modèle (pièce `couette`) déformée à chaque image,
 * dans le repère du lit (la tête vers -Z, le dessus du matelas à `bed.top`).
 *
 * - `fold` : le haut de la couette se rabat vers les pieds, en tournant autour d'une ligne en
 *   travers du lit (`foldZ`) ; 1 = rabattu à plat sur le reste (le lit ouvert).
 * - `body` : la bosse du dormeur sous la couette, de son côté du lit (`side`, en x).
 * - `mess` : froissée, de travers (le lit défait).
 *
 * Chaque réglage glisse vers sa cible (`to`) en `seconds` ; rien n'est recalculé au repos.
 */
import * as THREE from 'three';

export interface DuvetPose {
  fold: number;
  foldZ: number;
  body: number;
  side: number;
  mess: number;
}

const KEYS: Array<keyof DuvetPose> = ['fold', 'foldZ', 'body', 'side', 'mess'];

/** Hauteur de la bosse du dormeur (m), sa demi-largeur, et son étendue le long du lit. */
const BODY_H = 0.22;
const BODY_HALF = 0.32;
const BODY_Z: [number, number] = [-0.62, 1.25];
/** En deçà (|x|, m), ce qui pend est le bout de la couette ; au-delà, ses côtés. */
const SIDE_DRAPE = 0.62;
/** Largeur (m) sur laquelle le pli s'arrondit. */
const FOLD_ROUND = 0.07;
/** Ce qui pend au bord du lit, une fois rabattu, se couche à plat (m sous le dessus). */
const FLAT_DROP = 0.04;

export class Duvet {
  readonly pose: DuvetPose = { fold: 0, foldZ: -0.05, body: 0, side: 0, mess: 0 };
  private from: DuvetPose = { ...this.pose };
  private target: DuvetPose = { ...this.pose };
  private t = 0;
  private d = 0;
  private dirty = false;
  private readonly rest: Float32Array;
  private readonly restN: Float32Array | null;
  /** Dessus de la couette par tranche de 5 cm le long du lit (z). */
  private readonly tops = new Map<number, number>();
  private readonly seed = Math.random() * 10;

  /** `mesh` : le maillage de la couette, dans le repère du lit (sa géométrie est copiée). */
  constructor(private readonly mesh: THREE.Mesh) {
    mesh.geometry = mesh.geometry.clone();
    // rabattue ou soulevée, on en voit aussi l'envers
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
    mat.side = THREE.DoubleSide;
    mesh.material = mat;
    // la couette rabattue sort de sa boîte de départ
    mesh.frustumCulled = false;
    const g = mesh.geometry;
    this.rest = (g.attributes.position.array as Float32Array).slice();
    this.restN = g.attributes.normal ? (g.attributes.normal.array as Float32Array).slice() : null;
    for (let i = 0; i < this.rest.length; i += 3) {
      const k = Math.floor(this.rest[i + 2] / 0.05);
      this.tops.set(k, Math.max(this.tops.get(k) ?? -Infinity, this.rest[i + 1]));
    }
  }

  /** Dessus de la couette au niveau `z`. */
  private topAt(z: number): number {
    return this.tops.get(Math.floor(z / 0.05)) ?? 0.7;
  }

  /** Hauteur où le pli se fait : le dessus de la couette là où le rabat se couche. */
  private hingeAt(foldZ: number): number {
    let top = -Infinity;
    for (let k = Math.floor((foldZ - 0.05) / 0.05); k <= Math.floor((foldZ + 0.5) / 0.05); k++) top = Math.max(top, this.tops.get(k) ?? -Infinity);
    return Number.isFinite(top) ? top : 0.7;
  }

  /** Le lit défait, fait ? */
  get unmade(): boolean {
    return this.target.mess > 0.5;
  }

  /** En train de bouger ? */
  get moving(): boolean {
    return this.t < this.d;
  }

  /** Va vers `pose` (les réglages donnés) en `seconds`. */
  to(pose: Partial<DuvetPose>, seconds: number): void {
    this.from = { ...this.pose };
    this.target = { ...this.pose, ...pose };
    this.t = 0;
    this.d = Math.max(seconds, 1e-3);
    this.dirty = true;
  }

  /** Pose tout de suite (chargement d'une partie). */
  set(pose: Partial<DuvetPose>): void {
    Object.assign(this.pose, pose);
    this.from = { ...this.pose };
    this.target = { ...this.pose };
    this.t = this.d = 0;
    this.dirty = true;
    this.update(0);
  }

  update(dt: number): void {
    if (this.t < this.d) {
      this.t = Math.min(this.d, this.t + dt);
      const k = THREE.MathUtils.smootherstep(this.t / this.d, 0, 1);
      for (const key of KEYS) this.pose[key] = THREE.MathUtils.lerp(this.from[key], this.target[key], k);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.deform();
  }

  private deform(): void {
    const { fold, foldZ, body, side, mess } = this.pose;
    const g = this.mesh.geometry;
    const pos = g.attributes.position.array as Float32Array;
    const nor = this.restN ? (g.attributes.normal.array as Float32Array) : null;
    const rest = this.rest, restN = this.restN;
    const hinge = this.hingeAt(foldZ);
    const s = this.seed;
    for (let i = 0; i < rest.length; i += 3) {
      const rx = rest[i];
      let x = rx, y = rest[i + 1], z = rest[i + 2];
      let nx = restN ? restN[i] : 0, ny = restN ? restN[i + 1] : 1, nz = restN ? restN[i + 2] : 0;
      // froissée : des plis, et de travers
      if (mess > 0) {
        y += mess * 0.02 * Math.sin(x * 7.3 + s) * Math.cos(z * 5.1 + s * 1.7) * (y > hinge - 0.08 ? 1 : 0.4);
        x += mess * 0.06 * Math.sin(z * 2.2 + s);
        z += mess * 0.05 * Math.sin(x * 3.1 + s * 0.6);
      }
      // la bosse du dormeur
      if (body > 0) {
        const u = (x - side) / BODY_HALF;
        const v = (z - BODY_Z[0]) / (BODY_Z[1] - BODY_Z[0]);
        if (Math.abs(u) < 1 && v > 0 && v < 1) {
          // ce qui pend au bord du lit se soulève moins : la couette se tend sur le dormeur
          const hang = THREE.MathUtils.clamp((y - (this.topAt(z) - 0.12)) / 0.08, 0, 1);
          const bump = Math.cos(u * Math.PI / 2) ** 2 * Math.sin(v * Math.PI) ** 0.4 * hang;
          y += body * BODY_H * bump;
        }
      }
      // rabattue : ce qui est avant la ligne du pli tourne par-dessus, vers les pieds ; froissée, le
      // pli n'est pas droit
      const f = fold * (1 - mess * 0.22 * (0.5 + 0.5 * Math.sin(rx * 2.7 + s)));
      if (f > 0 && z < foldZ) {
        // ce qui pend au bord se couche à plat : au bout (côté tête), il prolonge le rabat
        const drop = Math.max(0, hinge - FLAT_DROP - y);
        const dy = Math.max(y - hinge, -FLAT_DROP);
        const dz = z - foldZ - (Math.abs(rx) < SIDE_DRAPE ? drop : 0);
        // le pli s'arrondit sur quelques centimètres : pas de cassure dans le tissu
        const a = f * Math.PI * 0.97 * THREE.MathUtils.smoothstep(-dz, 0, FOLD_ROUND);
        const c = Math.cos(a), sn = Math.sin(a);
        // autour de l'axe X : de -Z (la tête) vers le haut puis +Z (les pieds)
        z = foldZ + dz * c - dy * sn;
        y = hinge + 0.03 * f * THREE.MathUtils.smoothstep(-dz, 0, FOLD_ROUND) + (-dz) * sn + dy * c;
        const nz2 = nz * c - ny * sn, ny2 = -nz * sn + ny * c;
        // un pli à plat : on voit le dessous de la couette, tourné vers le haut
        ny = ny2;
        nz = nz2;
      }
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
      if (nor) {
        nor[i] = nx;
        nor[i + 1] = ny;
        nor[i + 2] = nz;
      }
    }
    g.attributes.position.needsUpdate = true;
    if (nor) g.attributes.normal.needsUpdate = true;
  }
}
