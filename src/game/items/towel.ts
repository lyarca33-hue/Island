/**
 * La serviette de bain : un vrai tissu simulé (des points reliés, la pesanteur), dans le repère du
 * monde. Pendue, elle est pliée en deux sur la barre du porte-serviettes ; tenue, elle pend de la
 * main et se balance ; pour se sécher, elle est tendue entre les deux mains et se pose sur le corps ;
 * lâchée par terre, elle tombe en tas ; rangée (étagère, armoire), elle est pliée en carré.
 *
 * Le jeu dit chaque image où elle est (`hang`, `hold`, `fold`, `free`) et ce qu'elle touche (le
 * corps, en boules) ; au repos, elle ne calcule plus rien.
 */
import * as THREE from 'three';

/** Points du tissu en largeur et en longueur ; taille de la serviette dépliée (m). */
const NX = 12;
const NZ = 24;
const WIDTH = 0.46;
const LENGTH = 0.95;
/** Épaisseur de l'éponge (m) ; ce jeu entre le tissu et ce qu'il touche. */
const HALF = 0.006;
const GAP = 0.012;
/** Pas de calcul (s), passes sur les liens, amortissement, frottement. */
const STEP = 1 / 90;
const ITERS = 6;
const DAMP = 0.982;
const FRICTION = 0.7;
const GRAVITY = 9.8;
const K_STRUCT = 1;
const K_SHEAR = 0.6;
const K_BEND = 0.05;
/** Deux bouts éloignés du tissu ne se traversent pas (m). */
const SELF = 0.018;
/** Un bout froncé dans la main pour se sécher : sa largeur (m). */
const GATHER = 0.07;
/** Rayon de la barre du porte-serviettes (m). */
const BAR = 0.014;

/** Une boule du corps (monde). */
export interface Ball {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Où est la serviette, ce qui la tient. */
export type TowelHold =
  /** Pliée en deux sur une barre : du point `a` au point `b` (monde). */
  | { kind: 'hang'; a: THREE.Vector3; b: THREE.Vector3 }
  /** Tenue : le milieu d'un bout dans la main `hand`. */
  | { kind: 'hold'; hand: THREE.Vector3 }
  /**
   * Se sécher : un bout dans chaque main (`a`, `b`), le milieu passé autour du corps, du côté
   * `around` (derrière le dos) ; au début, posée d'une main à l'autre (`seed` : où elles vont).
   */
  | { kind: 'wrap'; a: THREE.Vector3; b: THREE.Vector3; around: THREE.Vector3; seed: [THREE.Vector3, THREE.Vector3] }
  /** Pliée en carré, posée : le repère de l'objet (sa boîte, le dessous à `bottom`). */
  | { kind: 'fold'; matrix: THREE.Matrix4; bottom: number }
  /** Libre (lâchée) : elle tombe sur le sol. */
  | { kind: 'free' };

export class Towel {
  readonly mesh: THREE.Mesh;
  private readonly n = NX * NZ;
  private readonly pos = new Float32Array(NX * NZ * 3);
  private readonly prev = new Float32Array(NX * NZ * 3);
  private readonly start = new Float32Array(NX * NZ * 3);
  private readonly la: Int32Array;
  private readonly lb: Int32Array;
  private readonly lrest: Float32Array;
  private readonly lk: Float32Array;
  private readonly lbend: Uint8Array;
  private readonly pinned = new Uint8Array(NX * NZ);
  private readonly geo: THREE.BufferGeometry;
  private hold: TowelHold = { kind: 'free' };
  private holdKey = '';
  private balls: Ball[] = [];
  private floor = 0;
  private acc = 0;
  private still = 0;
  private age = 0;
  constructor(color: THREE.ColorRepresentation, hold: TowelHold) {
    const dx = WIDTH / (NX - 1), dz = LENGTH / (NZ - 1), dd = Math.hypot(dx, dz);
    const links: Array<[number, number, number, number, number]> = [];
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = this.id(i, j);
        if (i + 1 < NX) links.push([k, this.id(i + 1, j), dx, K_STRUCT, 0]);
        if (j + 1 < NZ) links.push([k, this.id(i, j + 1), dz, K_STRUCT, 0]);
        if (i + 1 < NX && j + 1 < NZ) {
          links.push([k, this.id(i + 1, j + 1), dd, K_SHEAR, 0]);
          links.push([this.id(i + 1, j), this.id(i, j + 1), dd, K_SHEAR, 0]);
        }
        if (i + 2 < NX) links.push([k, this.id(i + 2, j), dx * 2, K_BEND, 1]);
        if (j + 2 < NZ) links.push([k, this.id(i, j + 2), dz * 2, K_BEND, 1]);
      }
    }
    this.la = Int32Array.from(links, (l) => l[0]);
    this.lb = Int32Array.from(links, (l) => l[1]);
    this.lrest = Float32Array.from(links, (l) => l[2]);
    this.lk = Float32Array.from(links, (l) => l[3]);
    this.lbend = Uint8Array.from(links, (l) => l[4]);
    this.geo = this.buildGeometry();
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, map: terryTexture(color), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'serviette-tissu';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.setHold(hold, true);
    this.render();
  }

  private id(i: number, j: number): number {
    return j * NX + i;
  }

  /** Où elle est, ce qui la tient ; `snap` : posée tout de suite dans sa forme (chargement, rangée). */
  setHold(hold: TowelHold, snap = false): void {
    const key = hold.kind;
    const changed = key !== this.holdKey;
    this.hold = hold;
    this.holdKey = key;
    if (changed) this.still = this.age = 0;
    if (hold.kind === 'fold') {
      this.fold(hold.matrix, hold.bottom);
      return;
    }
    if (snap && hold.kind === 'hang') {
      // posée tout de suite pliée sur la barre, déjà retombée
      this.drape(hold.a, hold.b);
      for (let s = 0; s < 120; s++) this.step();
      this.render();
    }
    if (changed && hold.kind === 'wrap') this.wrap(hold.seed[0], hold.seed[1], hold.around);
  }

  /**
   * Passée autour du corps : de `a` à `b` en demi-ellipse vers `around` (sa profondeur, que le
   * tissu y tienne tout entier), la largeur en travers.
   */
  private wrap(a: THREE.Vector3, b: THREE.Vector3, around: THREE.Vector3): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const half = a.clone().sub(mid);
    const out = around.clone().normalize();
    const at = (phi: number, d: number, v: THREE.Vector3) => v.copy(mid).addScaledVector(half, Math.cos(phi)).addScaledVector(out, Math.sin(phi) * d);
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const length = (d: number) => {
      let sum = 0;
      at(0, d, w);
      for (let s = 1; s <= 32; s++) sum += at((Math.PI * s) / 32, d, v).distanceTo(w), w.copy(v);
      return sum;
    };
    let lo = 0, hi = LENGTH;
    for (let it = 0; it < 24; it++) {
      const d = (lo + hi) / 2;
      if (length(d) < LENGTH) lo = d;
      else hi = d;
    }
    const across = b.clone().sub(a).cross(out).normalize();
    const tan = new THREE.Vector3();
    for (let j = 0; j < NZ; j++) {
      const phi = (Math.PI * j) / (NZ - 1);
      at(phi, lo, v);
      // la largeur : en travers de l'arc, tournée comme lui
      tan.copy(half).multiplyScalar(-Math.sin(phi)).addScaledVector(out, Math.cos(phi) * lo).normalize();
      w.copy(across).cross(tan).cross(tan).negate().normalize();
      for (let i = 0; i < NX; i++) {
        const k = this.id(i, j) * 3;
        const u = (i / (NX - 1) - 0.5) * WIDTH;
        this.pos[k] = v.x + w.x * u;
        this.pos[k + 1] = v.y + w.y * u;
        this.pos[k + 2] = v.z + w.z * u;
      }
    }
    this.prev.set(this.pos);
    this.still = 0;
  }

  /** Les boules du corps qu'elle touche (vide : rien), et le sol (y). */
  setBodies(balls: Ball[], floor = 0): void {
    if (balls.length || this.balls.length) this.still = 0;
    this.balls = balls;
    this.floor = floor;
  }

  /** Pliée en deux sur la barre de `a` à `b` : les deux moitiés pendent de part et d'autre. */
  private drape(a: THREE.Vector3, b: THREE.Vector3): void {
    const v = new THREE.Vector3();
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        this.onBar(a, b, i, j, v);
        const k = this.id(i, j) * 3;
        this.pos[k] = v.x;
        this.pos[k + 1] = v.y;
        this.pos[k + 2] = v.z;
      }
    }
    this.prev.set(this.pos);
    this.still = 0;
  }

  /**
   * Le point (i, j) de la serviette pliée sur la barre : autour d'elle (un quart de tour de chaque
   * côté, au milieu de la longueur), puis droit vers le bas.
   */
  private onBar(a: THREE.Vector3, b: THREE.Vector3, i: number, j: number, out: THREE.Vector3): THREE.Vector3 {
    const along = b.clone().sub(a).normalize();
    // de chaque côté de la barre, à l'horizontale, perpendiculaire à elle
    const side = new THREE.Vector3(-along.z, 0, along.x).normalize();
    const s = (j - (NZ - 1) / 2) * (LENGTH / (NZ - 1));
    const u = (i / (NX - 1) - 0.5) * WIDTH;
    const r = BAR + GAP, arc = (Math.PI / 2) * r, sign = Math.sign(s || 1);
    const turn = Math.min(Math.abs(s), arc) / r, down = Math.max(0, Math.abs(s) - arc);
    return out.copy(a).add(b).multiplyScalar(0.5).addScaledVector(along, u).addScaledVector(side, sign * r * Math.sin(turn)).setY((a.y + b.y) / 2 + r * Math.cos(turn) - down);
  }

  /** Pliée en carré : quatre épaisseurs dans la boîte de l'objet, posée sur son dessous. */
  private fold(m: THREE.Matrix4, bottom: number): void {
    const layers = 4, per = NZ / layers, depth = LENGTH / layers;
    const v = new THREE.Vector3();
    for (let j = 0; j < NZ; j++) {
      const layer = Math.min(layers - 1, Math.floor(j / per));
      const t = (j - layer * per) / (per - 1);
      // en accordéon : une épaisseur sur deux repart dans l'autre sens
      const z = ((layer % 2 ? 1 - t : t) - 0.5) * depth * 0.9;
      for (let i = 0; i < NX; i++) {
        const x = (i / (NX - 1) - 0.5) * WIDTH * 0.95;
        v.set(x, bottom + HALF + layer * HALF * 2.2, z).applyMatrix4(m);
        const k = this.id(i, j) * 3;
        this.pos[k] = v.x;
        this.pos[k + 1] = v.y;
        this.pos[k + 2] = v.z;
      }
    }
    this.prev.set(this.pos);
    this.still = 999;
    this.render();
  }

  update(dt: number): void {
    if (this.hold.kind === 'fold') return;
    if (this.still > 90 && this.hold.kind !== 'hold' && this.hold.kind !== 'wrap') return;
    this.acc = Math.min(this.acc + dt, STEP * 5);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step();
    }
    this.render();
  }

  private step(): void {
    const p = this.pos, q = this.prev, n = this.n, pin = this.pinned;
    this.start.set(p);
    const g = GRAVITY * STEP * STEP;
    for (let x = 0; x < n * 3; x += 3) {
      const vx = (p[x] - q[x]) * DAMP, vy = (p[x + 1] - q[x + 1]) * DAMP, vz = (p[x + 2] - q[x + 2]) * DAMP;
      q[x] = p[x];
      q[x + 1] = p[x + 1];
      q[x + 2] = p[x + 2];
      p[x] += vx;
      p[x + 1] += vy - g;
      p[x + 2] += vz;
    }
    // tenue : le milieu d'un bout dans la main ; pour se sécher, chaque bout froncé dans une main
    pin.fill(0);
    const h = this.hold;
    const set = (k: number, x: number, y: number, z: number) => {
      p[k * 3] = x;
      p[k * 3 + 1] = y;
      p[k * 3 + 2] = z;
      pin[k] = 1;
    };
    if (h.kind === 'hold') {
      const m = Math.floor(NX / 2);
      set(this.id(m - 1, 0), h.hand.x + 0.01, h.hand.y, h.hand.z);
      set(this.id(m, 0), h.hand.x - 0.01, h.hand.y, h.hand.z);
    } else if (h.kind === 'hang') {
      // le pli sur la barre ne glisse pas (l'éponge y accroche)
      const v = new THREE.Vector3();
      for (const j of [NZ / 2 - 1, NZ / 2]) for (let i = 0; i < NX; i++) {
        this.onBar(h.a, h.b, i, j, v);
        set(this.id(i, j), v.x, v.y, v.z);
      }
    } else if (h.kind === 'wrap') {
      const across = h.b.clone().sub(h.a).cross(h.around).normalize();
      for (let i = 0; i < NX; i++) {
        const u = (i / (NX - 1) - 0.5) * GATHER;
        set(this.id(i, 0), h.a.x + across.x * u, h.a.y + across.y * u, h.a.z + across.z * u);
        set(this.id(i, NZ - 1), h.b.x + across.x * u, h.b.y + across.y * u, h.b.z + across.z * u);
      }
    }
    const la = this.la, lb = this.lb, lrest = this.lrest, lk = this.lk, lbend = this.lbend, m = la.length;
    for (let it = 0; it < ITERS; it++) {
      for (let l = 0; l < m; l++) {
        const ia = la[l], ib = lb[l];
        const a = ia * 3, b = ib * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const rest = lrest[l];
        if (lbend[l] && d < rest) continue;
        const ha = pin[ia], hb = pin[ib];
        if (ha && hb) continue;
        const f = ((d - rest) / d) * lk[l] * (ha || hb ? 1 : 0.5);
        if (!ha) {
          p[a] += dx * f;
          p[a + 1] += dy * f;
          p[a + 2] += dz * f;
        }
        if (!hb) {
          p[b] -= dx * f;
          p[b + 1] -= dy * f;
          p[b + 2] -= dz * f;
        }
      }
      if (h.kind === 'hold') this.tether(h.hand);
      if (it === ITERS - 1) this.selfCollide();
      this.collide();
    }
    let most = 0;
    const st = this.start;
    for (let x = 0; x < n * 3; x++) {
      const d = Math.abs(p[x] - st[x]);
      if (d > most) most = d;
    }
    this.age++;
    this.still = most > (this.age > 5 / STEP ? 1.5e-3 : 3e-4) ? 0 : this.still + 1;
  }

  /** Tenue par un bout : aucun point plus loin de la main que le tissu ne le permet (il ne s'allonge pas). */
  private tether(hand: THREE.Vector3): void {
    const p = this.pos, dx = WIDTH / (NX - 1), dz = LENGTH / (NZ - 1), m = (NX - 1) / 2;
    for (let j = 1; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x = this.id(i, j) * 3;
        const max = Math.hypot(j * dz, Math.max(0, Math.abs(i - m) - 0.5) * dx);
        const ex = p[x] - hand.x, ey = p[x + 1] - hand.y, ez = p[x + 2] - hand.z;
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d <= max) continue;
        const f = max / d;
        p[x] = hand.x + ex * f;
        p[x + 1] = hand.y + ey * f;
        p[x + 2] = hand.z + ez * f;
      }
    }
  }

  /** La barre (elle s'y plie), le corps, le sol. */
  private collide(): void {
    const p = this.pos, pin = this.pinned, h = this.hold;
    const a = h.kind === 'hang' ? h.a : null, b = h.kind === 'hang' ? h.b : null;
    const ab = a && b ? b.clone().sub(a) : null;
    const abLen2 = ab ? ab.lengthSq() || 1 : 1;
    for (let k = 0; k < this.n; k++) {
      if (pin[k]) continue;
      const x = k * 3;
      if (a && ab) {
        // la barre : un cylindre ; le tissu glisse peu dessus
        let t = ((p[x] - a.x) * ab.x + (p[x + 1] - a.y) * ab.y + (p[x + 2] - a.z) * ab.z) / abLen2;
        t = Math.min(1, Math.max(0, t));
        const cx = a.x + ab.x * t, cy = a.y + ab.y * t, cz = a.z + ab.z * t;
        this.ball(k, cx, cy, cz, BAR + GAP, true);
      }
      for (const s of this.balls) this.ball(k, s.x, s.y, s.z, s.r + GAP, false);
      if (p[x + 1] < this.floor + GAP) {
        p[x + 1] = this.floor + GAP;
        this.rub(k);
      }
    }
  }

  /** Repousse le point `k` hors de la boule (ou du cylindre, sa coupe) ; `grip` : il y accroche. */
  private ball(k: number, cx: number, cy: number, cz: number, r: number, grip: boolean): void {
    const p = this.pos, x = k * 3;
    const dx = p[x] - cx, dy = p[x + 1] - cy, dz = p[x + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2) || 1e-6;
    p[x] = cx + (dx / d) * r;
    p[x + 1] = cy + (dy / d) * r;
    p[x + 2] = cz + (dz / d) * r;
    if (grip) this.rub(k);
  }

  private rub(k: number): void {
    const p = this.pos, q = this.prev, x = k * 3;
    for (let a = 0; a < 3; a++) q[x + a] += (p[x + a] - q[x + a]) * FRICTION;
  }

  /** Les deux moitiés pliées sur la barre (ou le tas par terre) ne se traversent pas. */
  private selfCollide(): void {
    const p = this.pos, n = this.n, pin = this.pinned, min2 = SELF * SELF;
    for (let k = 0; k < n; k++) {
      const x = k * 3, ik = k % NX, jk = (k / NX) | 0;
      for (let o = k + 1; o < n; o++) {
        if (Math.abs(((o / NX) | 0) - jk) <= 2 && Math.abs((o % NX) - ik) <= 2) continue;
        const y = o * 3;
        const dx = p[y] - p[x], dy = p[y + 1] - p[x + 1], dz = p[y + 2] - p[x + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min2) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const f = ((SELF - d) / d) * 0.5;
        if (!pin[k]) {
          p[x] -= dx * f;
          p[x + 1] -= dy * f;
          p[x + 2] -= dz * f;
        }
        if (!pin[o]) {
          p[y] += dx * f;
          p[y + 1] += dy * f;
          p[y + 2] += dz * f;
        }
      }
    }
  }

  /** Les deux faces de l'éponge (un peu d'épaisseur) et le tour. */
  private buildGeometry(): THREE.BufferGeometry {
    const n = this.n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const uv = new Float32Array(n * 2 * 2);
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = this.id(i, j);
        uv[k * 2] = uv[(k + n) * 2] = i / (NX - 1);
        uv[k * 2 + 1] = uv[(k + n) * 2 + 1] = j / (NZ - 1);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let j = 0; j < NZ - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = this.id(i, j), b = this.id(i + 1, j), c = this.id(i, j + 1), d = this.id(i + 1, j + 1);
        idx.push(a, c, b, b, c, d);
        idx.push(a + n, b + n, c + n, b + n, d + n, c + n);
      }
    }
    const rim = (a: number, b: number) => idx.push(a, b, a + n, b, b + n, a + n);
    for (let i = 0; i < NX - 1; i++) {
      rim(this.id(i + 1, 0), this.id(i, 0));
      rim(this.id(i, NZ - 1), this.id(i + 1, NZ - 1));
    }
    for (let j = 0; j < NZ - 1; j++) {
      rim(this.id(0, j), this.id(0, j + 1));
      rim(this.id(NX - 1, j + 1), this.id(NX - 1, j));
    }
    g.setIndex(idx);
    return g;
  }

  private render(): void {
    const n = this.n, p = this.pos;
    const out = this.geo.attributes.position.array as Float32Array;
    const nrm = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    const at = (i: number, j: number, w: THREE.Vector3) => {
      const k = this.id(THREE.MathUtils.clamp(i, 0, NX - 1), THREE.MathUtils.clamp(j, 0, NZ - 1)) * 3;
      return w.set(p[k], p[k + 1], p[k + 2]);
    };
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = this.id(i, j);
        u.subVectors(at(i + 1, j, a), at(i - 1, j, b));
        v.subVectors(at(i, j + 1, a), at(i, j - 1, b));
        nrm.crossVectors(v, u).normalize();
        for (const [o, s] of [[0, 1], [n, -1]] as const) {
          out[(k + o) * 3] = p[k * 3] + nrm.x * HALF * s;
          out[(k + o) * 3 + 1] = p[k * 3 + 1] + nrm.y * HALF * s;
          out[(k + o) * 3 + 2] = p[k * 3 + 2] + nrm.z * HALF * s;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

/** L'éponge : la couleur de la serviette, un grain bouclé, deux bandes tissées près des bouts. */
function terryTexture(color: THREE.ColorRepresentation): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const base = new THREE.Color(color);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 128, 256);
  // les boucles de l'éponge
  for (let s = 0; s < 3500; s++) {
    const light = Math.random() < 0.5;
    g.fillStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    g.fillRect(Math.random() * 128, Math.random() * 256, 1.5, 1.5);
  }
  // les bandes tissées, plus claires, près de chaque bout ; l'ourlet
  const band = `#${base.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`;
  for (const y of [22, 256 - 34]) {
    g.fillStyle = band;
    g.fillRect(0, y, 128, 12);
  }
  g.fillStyle = `#${base.clone().multiplyScalar(0.7).getHexString()}`;
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 251, 128, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
