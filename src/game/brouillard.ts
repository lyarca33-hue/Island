/**
 * Brouillard de guerre : on ne voit nettement que ce que le perso voit lui-même.
 *
 * Une grille vue de dessus couvre l'île (CELL m par case). Plusieurs fois par seconde, des rayons
 * partent des yeux du perso dans toutes les directions, à l'horizontale :
 * - un mur les arrête (portes fermées et rideaux tirés compris ; une porte ouverte, un passage ou
 *   une fenêtre les laissent passer) ;
 * - le relief aussi : derrière le haut d'une colline, le sol est caché (ligne d'horizon du rayon).
 * Chaque case touchée est « vue » ; elle est aussi retenue (« déjà vue ») pour la suite.
 *
 * Dehors, le toit d'une maison se voit dès qu'un rayon atteint un de ses murs : l'intérieur de la
 * pièce est alors compté comme vu (c'est le toit qu'on voit), sans être retenu comme visité.
 *
 * La grille part au GPU dans une petite texture (rouge : vu maintenant, vert : déjà vu) que la
 * passe finale (postfx.ts) lit pour chaque pixel, d'après sa position dans le monde : ce qui est
 * vu reste tel quel, ce qui a été vu s'assombrit et se ternit, l'inconnu reste dans la brume.
 */
import * as THREE from 'three';
import { SEA_LEVEL as SEA } from './ile';
import type { Rect } from './room';

/** Taille d'une case (m) et demi-côté de la grille (m), centrée sur la maison. */
export const FOG_CELL = 0.3;
export const FOG_HALF = 66;
const N = Math.round((2 * FOG_HALF) / FOG_CELL);

/** Hauteur des yeux (m) au-dessus du sol, et ce qu'on voit d'une case : son sol, et ce qui s’y tient (un buisson, quelqu’un debout). */
const EYE = 1.55;
const TARGET = 0.8;
/** Hauteur d'un mur (son toit se voit par-dessus une butte qui cache son pied). */
const WALL_TOP = 2.5;
/** Ce qui est à moins de ça du perso se voit toujours (m) : lui, ce qu'il tient, ses pieds. */
const AROUND = 0.6;
/** Au-delà du mur touché, la case du mur lui-même est encore vue (m). */
const WALL_SKIN = 0.18;
/** Vitesse (par seconde) à laquelle une case s'éclaire quand on la voit, et s'éteint quand on ne la voit plus. */
const FADE_IN = 6;
const FADE_OUT = 1.6;
/** Écart entre deux tracés de rayons (s), et déplacement (m) qui en demande un aussitôt. */
const CAST_EVERY = 0.3;
const CAST_MIN = 0.08;
const CAST_MOVE = 0.15;

const FOG_KEY = 'rp-island-brouillard';

/** Brouillard de guerre affiché ou non (mémorisé ; affiché par défaut). */
export function loadFogOn(): boolean {
  try {
    return localStorage.getItem(FOG_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveFogOn(on: boolean): void {
  try {
    localStorage.setItem(FOG_KEY, on ? '1' : '0');
  } catch {
    // stockage indisponible : réglage pour cette partie seulement
  }
}

/** Morceau de mur vu de dessus : de a à b ; `clear()` dit s'il laisse voir (0 plein, 1 ouvert). */
export interface SightWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Numéro de la pièce du mur (pour son toit). */
  room: number;
  clear: () => number;
}

/** Réglage de finesse : nombre de rayons et portée de la vue (m). */
export const FOG_DETAIL = {
  basse: { rays: 640, range: 36 },
  normale: { rays: 1024, range: 48 },
} as const;

export class FogOfWar {
  /** Rouge : vu maintenant (fondu), vert : déjà vu. */
  readonly texture: THREE.DataTexture;
  /** Coin de la grille (x, z) et 1 / côté : pour passer d'un point du monde à la texture. */
  readonly box = new THREE.Vector3(-FOG_HALF, -FOG_HALF, 1 / (2 * FOG_HALF));
  private data = new Uint8Array(N * N * 2);
  /** Part vue (0 à 1) des cases encore éclairées, et la liste de ces cases. */
  private level = new Float32Array(N * N);
  private active: number[] = [];
  private inActive = new Uint8Array(N * N);
  /** Tracé de rayons où chaque case a été vue pour la dernière fois. */
  private stamp = new Uint32Array(N * N);
  private cast = 0;
  /** Hauteur du sol de chaque case, calculée la première fois qu'un rayon y passe. */
  private ground = new Float32Array(N * N).fill(NaN);
  private sinceCast = Infinity;
  private sinceFade = 0;
  private lastEye = new THREE.Vector2(Infinity, Infinity);
  private detail: { rays: number; range: number } = FOG_DETAIL.normale;
  private dirty = false;

  constructor(private height: (x: number, z: number) => number, private rooms: Rect[]) {
    this.texture = new THREE.DataTexture(this.data, N, N, THREE.RGFormat, THREE.UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  setDetail(d: keyof typeof FOG_DETAIL): void {
    this.detail = FOG_DETAIL[d];
  }

  /** Part vue maintenant (0 à 1) et déjà vue (0 ou 1) au point (x, z) du monde. */
  at(x: number, z: number): { seen: number; known: number } {
    const i = this.index(x, z);
    if (i < 0) return { seen: 0, known: 0 };
    return { seen: this.level[i], known: this.data[i * 2 + 1] / 255 };
  }

  /** Oublie tout ce qui a été vu (nouvelle partie). */
  forget(): void {
    for (let i = 1; i < this.data.length; i += 2) this.data[i] = 0;
    this.dirty = true;
  }

  /**
   * Pas de `dt` s : nouveaux rayons depuis `eye` (pieds du perso, y = sol) si besoin, puis le fondu.
   * `indoors` : perso dans une pièce (les toits sont alors cachés, pas de toit à voir).
   */
  update(dt: number, eye: THREE.Vector3, walls: SightWall[], indoors: boolean): void {
    this.sinceCast += dt;
    this.sinceFade += dt;
    const moved = Math.hypot(eye.x - this.lastEye.x, eye.z - this.lastEye.y) > CAST_MOVE;
    if (this.sinceCast >= CAST_EVERY || (moved && this.sinceCast >= CAST_MIN)) {
      this.castFrom(eye, walls, indoors);
      this.lastEye.set(eye.x, eye.z);
      this.sinceCast = 0;
    }
    if (this.sinceFade >= 1 / 30) {
      this.fade(this.sinceFade);
      this.sinceFade = 0;
    }
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  private index(x: number, z: number): number {
    const ix = Math.floor((x + FOG_HALF) / FOG_CELL), iz = Math.floor((z + FOG_HALF) / FOG_CELL);
    return ix < 0 || iz < 0 || ix >= N || iz >= N ? -1 : iz * N + ix;
  }

  private groundAt(i: number): number {
    let h = this.ground[i];
    if (Number.isNaN(h)) {
      const ix = i % N, iz = (i - ix) / N;
      h = this.ground[i] = this.height((ix + 0.5) * FOG_CELL - FOG_HALF, (iz + 0.5) * FOG_CELL - FOG_HALF);
    }
    return h;
  }

  /** Case `i` vue à ce tracé ; `remember` : retenue comme déjà vue. */
  private mark(i: number, remember: boolean): void {
    this.stamp[i] = this.cast;
    if (remember && this.data[i * 2 + 1] !== 255) {
      this.data[i * 2 + 1] = 255;
      this.dirty = true;
    }
    if (!this.inActive[i]) {
      this.inActive[i] = 1;
      this.active.push(i);
    }
  }

  /** Les rayons du tracé : cases vues maintenant (voir l'en-tête). */
  private castFrom(eye: THREE.Vector3, walls: SightWall[], indoors: boolean): void {
    this.cast++;
    const ex = eye.x, ez = eye.z;
    const e0 = this.index(ex, ez);
    if (e0 < 0) return;
    const ey = this.groundAt(e0) + EYE;
    // tout près du perso : toujours vu
    for (let dz = -AROUND; dz <= AROUND; dz += FOG_CELL) {
      for (let dx = -AROUND; dx <= AROUND; dx += FOG_CELL) {
        const i = this.index(ex + dx, ez + dz);
        if (i >= 0 && dx * dx + dz * dz <= AROUND * AROUND) this.mark(i, true);
      }
    }
    const solid = walls.filter((w) => w.clear() < 0.5);
    const roofSeen = new Set<number>();
    const { rays, range } = this.detail;
    const step = FOG_CELL * 0.9;
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      // mur le plus proche sur ce rayon
      let hit = range, room = -1;
      for (const w of solid) {
        const t = segmentHit(ex, ez, dx, dz, w);
        if (t < hit) {
          hit = t;
          room = w.room;
        }
      }
      const end = Math.min(range, hit + WALL_SKIN);
      // ligne d'horizon : pente la plus forte du relief déjà passé (vu des yeux)
      let horizon = -Infinity, last = -1;
      for (let r = step; r <= end; r += step) {
        const i = this.index(ex + dx * r, ez + dz * r);
        if (i < 0) break;
        const h = Math.max(this.groundAt(i), SEA);
        if (i !== last && (h + TARGET - ey) / r >= horizon) this.mark(i, true);
        last = i;
        horizon = Math.max(horizon, (h - ey) / r);
      }
      // dehors : le toit de la pièce dont on voit le mur (son haut dépasse l'horizon)
      if (!indoors && room >= 0 && hit < range) {
        const i = this.index(ex + dx * hit, ez + dz * hit);
        if (i >= 0 && (this.groundAt(i) + WALL_TOP - ey) / hit >= horizon) roofSeen.add(room);
      }
    }
    for (const n of roofSeen) {
      const r = this.rooms[n];
      if (!r) continue;
      for (let z = r.z0 - 0.1; z <= r.z1 + 0.1; z += FOG_CELL) {
        for (let x = r.x0 - 0.1; x <= r.x1 + 0.1; x += FOG_CELL) {
          const i = this.index(x, z);
          if (i >= 0) this.mark(i, false);
        }
      }
    }
  }

  /** Fondu des cases éclairées vers vu (1) ou pas vu (0), recopié dans la texture. */
  private fade(dt: number): void {
    const list = this.active;
    for (let j = list.length - 1; j >= 0; j--) {
      const i = list[j];
      const on = this.stamp[i] === this.cast;
      const prev = this.level[i];
      const v = on ? Math.min(1, prev + FADE_IN * dt) : Math.max(0, prev - FADE_OUT * dt);
      if (v === prev && on) continue;
      this.level[i] = v;
      this.data[i * 2] = Math.round(v * 255);
      this.dirty = true;
      if (v === 0) {
        this.inActive[i] = 0;
        list[j] = list[list.length - 1];
        list.pop();
      }
    }
  }
}

/** Distance le long du rayon (origine (ox, oz), direction unitaire (dx, dz)) jusqu'au mur `w`, ou Infinity. */
export function segmentHit(ox: number, oz: number, dx: number, dz: number, w: SightWall): number {
  const sx = w.bx - w.ax, sz = w.bz - w.az;
  const den = dx * sz - dz * sx;
  if (Math.abs(den) < 1e-9) return Infinity;
  const qx = w.ax - ox, qz = w.az - oz;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * dz - qz * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}
