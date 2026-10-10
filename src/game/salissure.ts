/**
 * La maison se salit avec le temps et l'usage : la poussière se dépose sur les sols (surtout le long
 * des murs) et sur le dessus des meubles, les pas laissent des traces (de la boue quand on rentre
 * du jardin sous la pluie ou dans la neige), et les toilettes, le lavabo, la douche, l'évier et la
 * gazinière se ternissent à chaque usage.
 *
 * Rendu léger : par pièce, un seul calque posé sur le sol (une texture de 3 cm le texel, remise à
 * jour seulement là où ça change) ; par meuble, un voile de poussière sur son dessus (un plan) et,
 * pour le sanitaire, une teinte terne. Rien n'est dessiné tant que c'est propre.
 *
 * L'API (Game la relaie pour les ordres et les animations de ménage) :
 * - `soilFloor` / `cleanFloor` : salir ou nettoyer le sol autour d'un point (balai, serpillière, aspirateur) ;
 * - `soilItem` / `cleanItem` : salir ou nettoyer un meuble ;
 * - `dirtiestSpot` : où passer le balai ou la serpillière ensuite ;
 * - `age` : fait passer le temps (poussière) ; `tick` : les pas du perso.
 */
import * as THREE from 'three';
import type { WorldItem } from './items/carry';
import { toonGradient } from './toon';

/** Côté d'un texel du calque de sol (m) : assez fin pour une empreinte de chaussure. */
export const CELL = 0.03;
/** Côté d'une case de poussière (m) : la poussière varie lentement, le grain vient du bruit au rendu. */
export const DUST_CELL = 0.25;
/** Poussière gagnée par heure de jeu (au milieu d'une pièce ; deux fois plus le long des murs). */
export const FLOOR_DUST_PER_HOUR = 0.006;
/** Poussière gagnée par heure de jeu sur le dessus d'un meuble. */
export const ITEM_DUST_PER_HOUR = 0.005;
/** Crasse gagnée par heure de jeu par le sanitaire, même sans s'en servir (calcaire). */
export const ITEM_GRIME_PER_HOUR = 0.0015;
/** Longueur d'un pas (m) : une empreinte à chaque pas. */
export const STRIDE = 0.36;
/** Trace laissée par un pas, chaussures propres (l'usure des passages). */
export const STEP_TRACE = 0.012;
/** Au-delà, un sol ou un meuble est dit sale (describe, ordres). */
export const DIRTY = 0.25;

export type FloorTool = 'balai' | 'serpillière' | 'aspirateur';
export type FloorDirtKind = 'poussière' | 'boue';

/** Ce que chaque outil enlève : part de la poussière, part des traces, et un peu de traces en plus. */
const TOOLS: Record<FloorTool, { dust: number; traces: number; flat: number }> = {
  balai: { dust: 0.85, traces: 0.1, flat: 0.04 },
  aspirateur: { dust: 0.95, traces: 0.15, flat: 0.05 },
  serpillière: { dust: 0.6, traces: 0.85, flat: 0.06 },
};

/** Meubles dont le dessus prend un voile de poussière (plateau à plat). */
export const DUST_TOPS = new Set([
  'table', 'table-basse', 'meuble-tele', 'table-de-nuit', 'plan-de-travail', 'placard', 'tiroir', 'lave-vaisselle',
  'frigo', 'armoire', 'bibliotheque', 'etagere-garage', 'etabli', 'four', 'congelateur',
]);
/** Ce qui se ternit à l'usage (crasse, calcaire, graisse) : nettoyé au spray et à l'éponge. */
export const SANITARY = new Set(['toilettes', 'lavabo', 'douche', 'evier', 'gaziniere']);
/** Crasse laissée par un usage. */
export const USE_GRIME: Record<string, number> = { toilettes: 0.08, douche: 0.06, lavabo: 0.03, evier: 0.04, gaziniere: 0.03 };

/** Un meuble suivi : `dust` (poussière sur le dessus), `grime` (crasse du sanitaire), de 0 à 1. */
export interface ItemDirt {
  dust: number;
  grime: number;
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Bruit de valeur déterministe (0 à 1) sur une grille de pas `scale`. */
function hash(i: number, k: number, seed: number): number {
  let h = (i * 374761393 + k * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const fx = x / scale, fz = z / scale;
  const i = Math.floor(fx), k = Math.floor(fz);
  const tx = fx - i, tz = fz - k;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash(i, k, seed), b = hash(i + 1, k, seed), c = hash(i, k + 1, seed), d = hash(i + 1, k + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Octets ↔ texte (base64), pour la sauvegarde. */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Couleurs du calque de sol : poussière grise et claire, traces brun foncé. */
const DUST_RGB = [128, 120, 108];
const TRACE_RGB = [74, 58, 42];
const DUST_ALPHA = 0.6;
const TRACE_ALPHA = 0.85;

/** Sauvegarde d'un sol : poussière (cases de DUST_CELL) et traces (une case sur SAVE_STEP), en octets. */
export interface FloorSave {
  d: string;
  t: string;
}
const SAVE_STEP = 3;

/** La saleté du sol d'une pièce, et son calque. */
export class FloorDirt {
  readonly nx: number;
  readonly nz: number;
  readonly cx: number;
  readonly cz: number;
  /** Traces de pas et boue, une valeur par texel (peut dépasser 1 : la couleur sature). */
  readonly traces: Float32Array;
  readonly dx: number;
  readonly dz: number;
  /** Poussière, par case de DUST_CELL. */
  readonly dust: Float32Array;
  /** Part de la poussière gagnée par case (plus le long des murs). */
  private readonly weight: Float32Array;
  /** Grain de la poussière, par texel (0,2 à 2,4). */
  private readonly grain: Float32Array;
  private bytes: Uint8Array | null = null;
  private texture: THREE.DataTexture | null = null;
  mesh: THREE.Mesh | null = null;
  /** Zone du calque à redessiner (texels), ou null. */
  private stale: { i0: number; i1: number; k0: number; k1: number } | null = null;

  constructor(readonly name: string, readonly rect: Rect, seed = 1) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    this.nx = Math.max(1, Math.round(w / CELL));
    this.nz = Math.max(1, Math.round(d / CELL));
    this.cx = w / this.nx;
    this.cz = d / this.nz;
    this.traces = new Float32Array(this.nx * this.nz);
    this.dx = Math.max(1, Math.round(w / DUST_CELL));
    this.dz = Math.max(1, Math.round(d / DUST_CELL));
    this.dust = new Float32Array(this.dx * this.dz);
    this.weight = new Float32Array(this.dx * this.dz);
    for (let i = 0; i < this.dx; i++) for (let k = 0; k < this.dz; k++) {
      const x = rect.x0 + ((i + 0.5) * w) / this.dx, z = rect.z0 + ((k + 0.5) * d) / this.dz;
      const wall = Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
      this.weight[k * this.dx + i] = 0.75 + 1.25 * Math.exp(-wall / 0.35);
    }
    this.grain = new Float32Array(this.nx * this.nz);
    for (let i = 0; i < this.nx; i++) for (let k = 0; k < this.nz; k++) {
      const x = rect.x0 + (i + 0.5) * this.cx, z = rect.z0 + (k + 0.5) * this.cz;
      const n = 0.6 * valueNoise(x, z, 0.45, seed) + 0.4 * valueNoise(x, z, 0.08, seed + 7);
      this.grain[k * this.nx + i] = 0.2 + 2.2 * n * n;
    }
  }

  contains(x: number, z: number): boolean {
    const r = this.rect;
    return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  }

  /** La poussière tombe : `hours` heures de jeu. */
  age(hours: number): void {
    if (hours <= 0) return;
    for (let j = 0; j < this.dust.length; j++) this.dust[j] = Math.min(1, this.dust[j] + hours * FLOOR_DUST_PER_HOUR * this.weight[j]);
    this.touchAll();
  }

  /** Poussière (lissée) en (x, z). */
  dustAt(x: number, z: number): number {
    const r = this.rect;
    const fx = THREE.MathUtils.clamp(((x - r.x0) / (r.x1 - r.x0)) * this.dx - 0.5, 0, this.dx - 1);
    const fz = THREE.MathUtils.clamp(((z - r.z0) / (r.z1 - r.z0)) * this.dz - 0.5, 0, this.dz - 1);
    const i = Math.min(this.dx - 2, Math.floor(fx)), k = Math.min(this.dz - 2, Math.floor(fz));
    if (this.dx < 2 || this.dz < 2) return this.dust[0];
    const tx = fx - i, tz = fz - k;
    const g = (a: number, b: number) => this.dust[b * this.dx + a];
    return (g(i, k) * (1 - tx) + g(i + 1, k) * tx) * (1 - tz) + (g(i, k + 1) * (1 - tx) + g(i + 1, k + 1) * tx) * tz;
  }

  /** Traces en (x, z). */
  tracesAt(x: number, z: number): number {
    const i = Math.floor((x - this.rect.x0) / this.cx), k = Math.floor((z - this.rect.z0) / this.cz);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return 0;
    return this.traces[k * this.nx + i];
  }

  /** Texels autour de (x, z) dans un rayon `r` : appelle `fn(index, poids 0..1)`. */
  private around(x: number, z: number, r: number, fn: (j: number, w: number) => void): void {
    const i0 = Math.max(0, Math.floor((x - r - this.rect.x0) / this.cx)), i1 = Math.min(this.nx - 1, Math.floor((x + r - this.rect.x0) / this.cx));
    const k0 = Math.max(0, Math.floor((z - r - this.rect.z0) / this.cz)), k1 = Math.min(this.nz - 1, Math.floor((z + r - this.rect.z0) / this.cz));
    if (i0 > i1 || k0 > k1) return;
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const px = this.rect.x0 + (i + 0.5) * this.cx, pz = this.rect.z0 + (k + 0.5) * this.cz;
      const d = Math.hypot(px - x, pz - z);
      if (d > r) continue;
      // bord fondu sur le dernier quart du rayon
      fn(k * this.nx + i, Math.min(1, ((r - d) / r) * 4));
    }
    this.touch(i0, i1, k0, k1);
  }

  /** Cases de poussière autour de (x, z) dans un rayon `r`. */
  private aroundDust(x: number, z: number, r: number, fn: (j: number, w: number) => void): void {
    const sx = (this.rect.x1 - this.rect.x0) / this.dx, sz = (this.rect.z1 - this.rect.z0) / this.dz;
    const rr = r + Math.max(sx, sz) / 2;
    for (let i = 0; i < this.dx; i++) for (let k = 0; k < this.dz; k++) {
      const px = this.rect.x0 + (i + 0.5) * sx, pz = this.rect.z0 + (k + 0.5) * sz;
      const d = Math.hypot(px - x, pz - z);
      if (d > rr) continue;
      fn(k * this.dx + i, Math.min(1, ((rr - d) / rr) * 3));
    }
    const pad = rr + DUST_CELL;
    this.touchWorld(x - pad, x + pad, z - pad, z + pad);
  }

  /** Une empreinte de chaussure en (x, z), pointée vers `yaw` (le long de +Z à 0), de force `amount`. */
  stamp(x: number, z: number, yaw: number, amount: number): void {
    if (amount <= 0 || !this.contains(x, z)) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.around(x, z, 0.16, (j) => {
      const i = j % this.nx, k = (j - i) / this.nx;
      const px = this.rect.x0 + (i + 0.5) * this.cx - x, pz = this.rect.z0 + (k + 0.5) * this.cz - z;
      const u = px * fx + pz * fz, v = px * fz - pz * fx;
      // semelle (avant) et talon (arrière), en ellipses fondues
      const sole = 1 - ((u - 0.035) / 0.085) ** 2 - (v / 0.042) ** 2;
      const heel = 1 - ((u + 0.095) / 0.04) ** 2 - (v / 0.034) ** 2;
      const w = Math.max(sole, heel);
      if (w > 0) this.traces[j] += amount * Math.min(1, w * 3);
    });
  }

  /** Salit le sol autour de (x, z) : poussière (fondue) ou boue (taches). */
  soil(x: number, z: number, r: number, amount: number, kind: FloorDirtKind = 'poussière'): void {
    if (amount <= 0) return;
    if (kind === 'poussière') this.aroundDust(x, z, r, (j, w) => (this.dust[j] = Math.min(1, this.dust[j] + amount * w)));
    else this.around(x, z, r, (j, w) => (this.traces[j] += amount * w * (0.6 + 0.8 * this.grain[j] / 1.5)));
  }

  /** Nettoie autour de (x, z) avec `tool` : renvoie la saleté enlevée (somme poussière + traces, en m² pleins). */
  clean(x: number, z: number, r: number, tool: FloorTool, strength = 1): number {
    const t = TOOLS[tool];
    const s = clamp01(strength);
    let removed = 0;
    const cellArea = this.cx * this.cz;
    const dustArea = ((this.rect.x1 - this.rect.x0) / this.dx) * ((this.rect.z1 - this.rect.z0) / this.dz);
    this.aroundDust(x, z, r, (j, w) => {
      const before = this.dust[j];
      this.dust[j] = before * (1 - t.dust * s * w);
      removed += (before - this.dust[j]) * dustArea;
    });
    this.around(x, z, r, (j, w) => {
      const before = this.traces[j];
      if (before <= 0) return;
      this.traces[j] = Math.max(0, before * (1 - t.traces * s * w) - t.flat * s * w);
      removed += (before - this.traces[j]) * cellArea;
    });
    return removed;
  }

  /** Moyennes sur la pièce (0 à 1) : poussière, traces ; et `pire` : la case de 50 cm la plus sale. */
  level(): { poussiere: number; traces: number; pire: number } {
    let dust = 0, tr = 0;
    for (const v of this.dust) dust += v;
    for (const v of this.traces) tr += Math.min(1, v);
    const best = this.dirtiest('serpillière');
    const bestDust = this.dirtiest('balai');
    return { poussiere: dust / this.dust.length, traces: tr / this.traces.length, pire: Math.max(best?.value ?? 0, bestDust?.value ?? 0) };
  }

  /**
   * Le carré de 50 cm le plus sale pour `tool` (le balai et l'aspirateur visent la poussière, la
   * serpillière les traces), hors de ceux que `skip(x, z)` écarte (sous un meuble) ; null si tout est propre.
   * Avec `near`, le plus proche de ce point parmi ceux au-dessus de `min` (on avance de proche en proche).
   */
  dirtiest(tool: FloorTool, skip?: (x: number, z: number) => boolean, min = 0.02, near?: { x: number; z: number }): { x: number; z: number; value: number } | null {
    const B = 0.5;
    const r = this.rect;
    const bx = Math.max(1, Math.round((r.x1 - r.x0) / B)), bz = Math.max(1, Math.round((r.z1 - r.z0) / B));
    const sx = (r.x1 - r.x0) / bx, sz = (r.z1 - r.z0) / bz;
    let best: { x: number; z: number; value: number } | null = null;
    let bestDist = Infinity;
    for (let a = 0; a < bx; a++) for (let b = 0; b < bz; b++) {
      const x = r.x0 + (a + 0.5) * sx, z = r.z0 + (b + 0.5) * sz;
      if (skip?.(x, z)) continue;
      let v: number;
      if (tool === 'serpillière') {
        let sum = 0, n = 0;
        const i0 = Math.floor((x - sx / 2 - r.x0) / this.cx), i1 = Math.min(this.nx - 1, Math.floor((x + sx / 2 - r.x0) / this.cx));
        const k0 = Math.floor((z - sz / 2 - r.z0) / this.cz), k1 = Math.min(this.nz - 1, Math.floor((z + sz / 2 - r.z0) / this.cz));
        for (let i = Math.max(0, i0); i <= i1; i += 2) for (let k = Math.max(0, k0); k <= k1; k += 2) {
          sum += Math.min(1, this.traces[k * this.nx + i]);
          n++;
        }
        // des empreintes éparses comptent : la moyenne d'un carré, relevée
        v = n ? Math.min(1, (sum / n) * 4) : 0;
      } else v = this.dustAt(x, z);
      if (v <= min) continue;
      if (near) {
        const dist = Math.hypot(x - near.x, z - near.z);
        if (!best || dist < bestDist) {
          best = { x, z, value: v };
          bestDist = dist;
        }
      } else if (!best || v > best.value) best = { x, z, value: v };
    }
    return best;
  }

  // ——— rendu ———

  private touchAll(): void {
    this.stale = { i0: 0, i1: this.nx - 1, k0: 0, k1: this.nz - 1 };
  }

  private touch(i0: number, i1: number, k0: number, k1: number): void {
    const s = this.stale;
    this.stale = s ? { i0: Math.min(s.i0, i0), i1: Math.max(s.i1, i1), k0: Math.min(s.k0, k0), k1: Math.max(s.k1, k1) } : { i0, i1, k0, k1 };
  }

  private touchWorld(x0: number, x1: number, z0: number, z1: number): void {
    const i0 = Math.max(0, Math.floor((x0 - this.rect.x0) / this.cx)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.rect.x0) / this.cx));
    const k0 = Math.max(0, Math.floor((z0 - this.rect.z0) / this.cz)), k1 = Math.min(this.nz - 1, Math.floor((z1 - this.rect.z0) / this.cz));
    if (i0 <= i1 && k0 <= k1) this.touch(i0, i1, k0, k1);
  }

  /** Le calque (créé la première fois), à poser dans la pièce. */
  build(): THREE.Mesh {
    if (this.mesh) return this.mesh;
    this.bytes = new Uint8Array(this.nx * this.nz * 4);
    const tex = (this.texture = new THREE.DataTexture(this.bytes, this.nx, this.nz, THREE.RGBAFormat));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // le plan couché a v = 0 côté z1 : la ligne k de la texture repart de z0
    tex.repeat.set(1, -1);
    tex.offset.set(0, 1);
    const r = this.rect;
    // éclairé comme le sol (paliers du toon) : la nuit, la saleté n'éclaire pas la pièce
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    const mesh = (this.mesh = new THREE.Mesh(geo, mat));
    mesh.position.set((r.x0 + r.x1) / 2, 0.008, (r.z0 + r.z1) / 2);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = 1;
    mesh.name = `salete-${this.name}`;
    mesh.visible = false;
    this.touchAll();
    this.render();
    return mesh;
  }

  /** Redessine la zone changée ; renvoie vrai si la texture part à la carte graphique. */
  render(): boolean {
    const s = this.stale;
    if (!s || !this.bytes || !this.texture || !this.mesh) return false;
    this.stale = null;
    const out = this.bytes;
    const r = this.rect;
    for (let k = s.k0; k <= s.k1; k++) {
      const z = r.z0 + (k + 0.5) * this.cz;
      for (let i = s.i0; i <= s.i1; i++) {
        const j = k * this.nx + i;
        const ad = clamp01(this.dustAt(r.x0 + (i + 0.5) * this.cx, z) * this.grain[j]) * DUST_ALPHA;
        const at = clamp01(this.traces[j]) * TRACE_ALPHA;
        const a = at + ad * (1 - at);
        const o = j * 4;
        if (a < 0.004) {
          out[o + 3] = 0;
          continue;
        }
        const wd = (ad * (1 - at)) / a, wt = at / a;
        out[o] = DUST_RGB[0] * wd + TRACE_RGB[0] * wt;
        out[o + 1] = DUST_RGB[1] * wd + TRACE_RGB[1] * wt;
        out[o + 2] = DUST_RGB[2] * wd + TRACE_RGB[2] * wt;
        out[o + 3] = a * 255;
      }
    }
    this.texture.needsUpdate = true;
    // propre : rien à dessiner
    let any = false;
    for (let j = 3; j < out.length; j += 4 * 7) if (out[j] > 2) { any = true; break; }
    this.mesh.visible = any;
    return true;
  }

  // ——— sauvegarde ———

  save(): FloorSave {
    const d = new Uint8Array(this.dust.length);
    this.dust.forEach((v, j) => (d[j] = Math.round(clamp01(v) * 255)));
    const tx = Math.ceil(this.nx / SAVE_STEP), tz = Math.ceil(this.nz / SAVE_STEP);
    const t = new Uint8Array(tx * tz);
    for (let a = 0; a < tx; a++) for (let b = 0; b < tz; b++) {
      let sum = 0, n = 0;
      for (let i = a * SAVE_STEP; i < Math.min(this.nx, (a + 1) * SAVE_STEP); i++) for (let k = b * SAVE_STEP; k < Math.min(this.nz, (b + 1) * SAVE_STEP); k++) {
        sum += Math.min(2, this.traces[k * this.nx + i]);
        n++;
      }
      t[b * tx + a] = Math.round((sum / n / 2) * 255);
    }
    return { d: toBase64(d), t: toBase64(t) };
  }

  load(s: Partial<FloorSave> | undefined): void {
    if (!s) return;
    const d = typeof s.d === 'string' ? fromBase64(s.d) : null;
    if (d && d.length === this.dust.length) d.forEach((v, j) => (this.dust[j] = v / 255));
    const tx = Math.ceil(this.nx / SAVE_STEP), tz = Math.ceil(this.nz / SAVE_STEP);
    const t = typeof s.t === 'string' ? fromBase64(s.t) : null;
    if (t && t.length === tx * tz) {
      for (let i = 0; i < this.nx; i++) for (let k = 0; k < this.nz; k++) {
        this.traces[k * this.nx + i] = (t[Math.floor(k / SAVE_STEP) * tx + Math.floor(i / SAVE_STEP)] / 255) * 2;
      }
    }
    this.touchAll();
  }
}

/** Texture partagée du voile de poussière des meubles : du grain, en transparence. */
let dustAlpha: THREE.CanvasTexture | null = null;
function dustAlphaMap(): THREE.Texture {
  if (dustAlpha) return dustAlpha;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size; i++) for (let k = 0; k < size; k++) {
    // bruit qui boucle (les bords se raccordent)
    const n = 0.6 * valueNoise(i % size, k % size, 16, 3) + 0.4 * valueNoise(i, k, 4, 9);
    const v = Math.round(THREE.MathUtils.clamp(40 + 260 * n * n, 0, 255));
    img.data.set([v, v, v, 255], (k * size + i) * 4);
  }
  g.putImageData(img, 0, 0);
  dustAlpha = new THREE.CanvasTexture(canvas);
  dustAlpha.wrapS = dustAlpha.wrapT = THREE.RepeatWrapping;
  return dustAlpha;
}

const DUST_TOP_COLOR = new THREE.Color(0xb3aa96);
/** Teinte du sanitaire encrassé (calcaire, graisse) et part max de cette teinte. */
const GRIME_COLOR = new THREE.Color(0x8c7d5a);
const GRIME_TINT = 0.45;

/** Le rendu de la saleté d'un meuble : voile de poussière sur le dessus, teinte terne. */
class ItemLook {
  private veil: THREE.Mesh | null = null;
  /** Matériaux recopiés pour la teinte : copie → couleur d'origine. */
  private tinted = new Map<THREE.Material, THREE.Color>();
  private shown = { dust: -1, grime: -1 };

  constructor(private readonly item: WorldItem) {}

  update(d: ItemDirt): void {
    const q = (v: number) => Math.round(v * 40) / 40;
    const dust = q(d.dust), grime = q(d.grime);
    if (dust === this.shown.dust && grime === this.shown.grime) return;
    this.shown = { dust, grime };
    if (DUST_TOPS.has(this.item.def.id)) this.showVeil(dust);
    if (SANITARY.has(this.item.def.id)) this.tint(grime);
  }

  private showVeil(dust: number): void {
    if (dust < 0.04 && !this.veil) return;
    if (!this.veil) {
      const b = this.item.box;
      const w = Math.max(0.05, b.max.x - b.min.x - 0.03), d = Math.max(0.05, b.max.z - b.min.z - 0.03);
      const map = dustAlphaMap().clone();
      map.repeat.set(w / 0.5, d / 0.5);
      map.needsUpdate = true;
      const mat = new THREE.MeshToonMaterial({ color: DUST_TOP_COLOR, alphaMap: map, gradientMap: toonGradient(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const veil = (this.veil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat));
      veil.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.003, (b.min.z + b.max.z) / 2);
      veil.name = 'poussiere';
      veil.castShadow = false;
      veil.receiveShadow = true;
      veil.raycast = () => {};
      this.item.object.add(veil);
    }
    (this.veil.material as THREE.MeshToonMaterial).opacity = Math.min(0.85, dust * 0.9);
    this.veil.visible = dust >= 0.04;
  }

  private tint(grime: number): void {
    const k = grime * GRIME_TINT;
    this.item.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.name === 'poussiere' || o.parent?.name === 'taches') return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const c = (m as THREE.MeshStandardMaterial).color;
        // l'eau, les vitres : laissées telles quelles
        if (!c || m.transparent) return m;
        if (!this.tinted.has(m)) {
          if (k === 0) return m;
          const copy = m.clone();
          // le liseré du toon est dans onBeforeCompile : la copie le garde (même programme)
          copy.onBeforeCompile = m.onBeforeCompile;
          copy.customProgramCacheKey = m.customProgramCacheKey;
          this.tinted.set(copy, c.clone());
          return copy;
        }
        return m;
      });
      for (const m of next) {
        const base = this.tinted.get(m);
        if (base) (m as THREE.MeshStandardMaterial).color.copy(base).lerp(GRIME_COLOR, k);
      }
      if (next.some((m, i) => m !== mats[i])) mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
  }
}

/** Tout ce qui se salit dans la maison. */
export class Salissure {
  readonly floors: FloorDirt[];
  readonly items = new Map<WorldItem, ItemDirt>();
  private looks = new Map<WorldItem, ItemLook>();
  /** Boue sous les chaussures (0 à 1) : prise dehors, laissée en empreintes dedans. */
  shoes = 0;
  private walked = 0;
  private last: THREE.Vector3 | null = null;
  private foot = 1;
  /** Heures de jeu pas encore données à la poussière (versées par paquets). */
  private pending = 0;
  private renderClock = 0;

  constructor(rooms: Array<{ name: string; rect: Rect }>) {
    this.floors = rooms.map((r, i) => new FloorDirt(r.name, r.rect, i + 1));
  }

  /** Les meubles suivis : le dessus à plat des meubles, le sanitaire. */
  static tracks(item: WorldItem): boolean {
    return !item.def.portable && (DUST_TOPS.has(item.def.id) || SANITARY.has(item.def.id));
  }

  track(item: WorldItem): ItemDirt | null {
    if (!Salissure.tracks(item)) return null;
    let d = this.items.get(item);
    if (!d) {
      d = { dust: 0, grime: 0 };
      this.items.set(item, d);
    }
    return d;
  }

  forget(item: WorldItem): void {
    this.items.delete(item);
    this.looks.delete(item);
  }

  floorAt(x: number, z: number): FloorDirt | undefined {
    return this.floors.find((f) => f.contains(x, z));
  }

  floorNamed(name: string): FloorDirt | undefined {
    return this.floors.find((f) => f.name === name);
  }

  /** Le temps passe : poussière sur les sols et les meubles (dedans), calcaire du sanitaire. */
  age(hours: number, inside: (item: WorldItem) => boolean = () => true): void {
    if (hours <= 0) return;
    for (const f of this.floors) f.age(hours);
    for (const [item, d] of this.items) {
      if (!inside(item)) continue;
      if (DUST_TOPS.has(item.def.id)) d.dust = Math.min(1, d.dust + hours * ITEM_DUST_PER_HOUR);
      if (SANITARY.has(item.def.id)) d.grime = Math.min(1, d.grime + hours * ITEM_GRIME_PER_HOUR);
    }
  }

  /**
   * Une image de jeu : les pas du perso (empreintes dedans, boue prise dehors), la poussière qui
   * tombe (par paquets de 6 minutes de jeu), le calque redessiné au plus 4 fois par seconde.
   */
  tick(dt: number, hours: number, walker: { position: THREE.Vector3; yaw: number; walking: boolean; outsideMud: number }, inside?: (item: WorldItem) => boolean): void {
    this.pending += hours;
    if (this.pending >= 0.1) {
      this.age(this.pending, inside);
      this.pending = 0;
    }
    const p = walker.position;
    if (!this.last) this.last = p.clone();
    const moved = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last.copy(p);
    if (walker.walking && moved < 1) this.walked += moved;
    else if (!walker.walking) this.walked = 0;
    if (this.walked >= STRIDE) {
      this.walked = 0;
      this.step(p, walker.yaw, walker.outsideMud);
    }
    this.renderClock -= dt;
    if (this.renderClock <= 0) {
      this.renderClock = 0.25;
      this.render();
    }
  }

  /** Un pas en `p` : dehors, la boue colle aux semelles ; dedans, une empreinte. */
  step(p: THREE.Vector3, yaw: number, outsideMud: number): void {
    const floor = this.floorAt(p.x, p.z);
    this.foot = -this.foot;
    if (!floor) {
      this.shoes = Math.min(1, this.shoes + outsideMud);
      return;
    }
    const side = 0.09 * this.foot;
    const x = p.x + Math.cos(yaw) * side, z = p.z - Math.sin(yaw) * side;
    floor.stamp(x, z, yaw, STEP_TRACE + this.shoes);
    this.shoes *= 0.88;
    if (this.shoes < 0.01) this.shoes = 0;
  }

  /** Redessine ce qui a changé (calques de sol, voiles et teintes des meubles). */
  render(): void {
    for (const f of this.floors) f.render();
    for (const [item, d] of this.items) {
      let look = this.looks.get(item);
      if (!look) this.looks.set(item, (look = new ItemLook(item)));
      look.update(d);
    }
  }

  // ——— API ———

  soilFloor(x: number, z: number, r: number, amount: number, kind: FloorDirtKind = 'poussière'): boolean {
    const f = this.floorAt(x, z);
    if (!f) return false;
    f.soil(x, z, r, amount, kind);
    return true;
  }

  cleanFloor(x: number, z: number, r: number, tool: FloorTool, strength = 1): number {
    let removed = 0;
    for (const f of this.floors) {
      const rc = f.rect;
      if (x + r < rc.x0 || x - r > rc.x1 || z + r < rc.z0 || z - r > rc.z1) continue;
      removed += f.clean(x, z, r, tool, strength);
    }
    return removed;
  }

  soilItem(item: WorldItem, amount: number, kind: 'poussière' | 'crasse' = SANITARY.has(item.def.id) ? 'crasse' : 'poussière'): boolean {
    const d = this.track(item);
    if (!d) return false;
    if (kind === 'crasse') d.grime = clamp01(d.grime + amount);
    else d.dust = clamp01(d.dust + amount);
    return true;
  }

  /** Nettoie un meuble (éponge, chiffon) : renvoie ce qui est parti. */
  cleanItem(item: WorldItem, strength = 1): number {
    const d = this.items.get(item);
    if (!d) return 0;
    const s = clamp01(strength);
    const before = d.dust + d.grime;
    d.dust = d.dust * (1 - 0.95 * s);
    d.grime = d.grime * (1 - 0.9 * s);
    // un fond qui reste ne se voit pas : propre
    if (d.dust < 0.08) d.dust = 0;
    if (d.grime < 0.08) d.grime = 0;
    return before - d.dust - d.grime;
  }

  levelOf(item: WorldItem): ItemDirt | null {
    return this.items.get(item) ?? null;
  }

  // ——— sauvegarde ———

  save(): { sols: Record<string, FloorSave>; chaussures?: number } {
    const sols: Record<string, FloorSave> = {};
    for (const f of this.floors) sols[f.name] = f.save();
    return { sols, ...(this.shoes > 0.01 ? { chaussures: Math.round(this.shoes * 100) / 100 } : {}) };
  }

  load(s: unknown): void {
    const x = s as { sols?: Record<string, Partial<FloorSave>>; chaussures?: unknown } | undefined;
    if (!x || typeof x !== 'object') return;
    for (const f of this.floors) f.load(x.sols?.[f.name]);
    if (typeof x.chaussures === 'number') this.shoes = clamp01(x.chaussures);
  }
}

/** Mots pour dire l’état d’un meuble (describe) : « poussiéreux », « sale »… ; aucun s’il est propre. */
export function itemDirtWords(d: ItemDirt | null, feminine: boolean): string[] {
  if (!d) return [];
  const e = feminine ? 'e' : '';
  const out: string[] = [];
  if (d.dust >= DIRTY) out.push(d.dust >= 0.6 ? `couvert${e} de poussière` : 'poussiéreu' + (feminine ? 'se' : 'x'));
  if (d.grime >= DIRTY) out.push(d.grime >= 0.6 ? `très sale (spray et éponge)` : `sale (spray et éponge)`);
  return out;
}
