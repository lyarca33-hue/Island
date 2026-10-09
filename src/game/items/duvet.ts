/**
 * La couette du lit : un vrai tissu simulé (des points reliés par des liens, la pesanteur, le
 * matelas, les oreillers, le dormeur), dans le repère du lit (la tête vers -Z). Elle drape sur les
 * bords du lit, se plie sur elle-même, se froisse ; une épaisseur matelassée la gonfle.
 *
 * On la manie par ses mains : `turnDown` (rabattre le haut vers les pieds pour se coucher), `cover`
 * (la remonter sur le dormeur), `throwBack` (la repousser en se levant : le lit reste défait),
 * `make` (la tirer vers la tête du lit et la lisser). Au repos, elle ne calcule plus rien.
 */
import * as THREE from 'three';

/** Le lit, mesuré sur le modèle : le matelas, le cadre (et le pied de lit), les oreillers, la tête de lit. */
export interface BedShape {
  /** Dessus du matelas (y), sa demi-largeur, sa longueur (z), le bas du matelas. */
  top: number;
  halfWidth: number;
  z: [number, number];
  bottom: number;
  /** Le cadre sous le matelas : demi-largeur, bout côté pieds (le pied de lit), haut et bas. */
  frame: { halfWidth: number; foot: number; top: number; bottom: number };
  /** Les oreillers : boîtes [x0, x1, z0, z1, haut]. */
  pillows: Array<[number, number, number, number, number]>;
  /** La tête de lit (z) : rien ne passe derrière. */
  head: number;
}

/** Le lit de la chambre (modèle `lit`), mesuré au lancer de rayons sur le modèle. */
export const LIT_SHAPE: BedShape = {
  top: 0.555,
  halfWidth: 0.655,
  z: [-0.95, 0.935],
  bottom: 0.38,
  frame: { halfWidth: 0.685, foot: 1.015, top: 0.4, bottom: 0.18 },
  pillows: [
    [-0.62, -0.04, -0.92, -0.38, 0.8],
    [0.04, 0.62, -0.92, -0.38, 0.8],
  ],
  head: -0.95,
};

/** Une boule du corps du dormeur (repère du lit). */
export interface BodySphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Points du tissu en largeur (x) et en longueur (z) ; taille de la couette (m). */
const NX = 31;
const NZ = 28;
const WIDTH = 1.9;
const LENGTH = 1.7;
/** Le haut de la couette, le lit fait (z) : juste sous les oreillers. */
const MADE_Z = -0.37;
/** Demi-épaisseur (m) : le gonflant ; on garde ce jeu entre le tissu et ce qu'il touche. */
const HALF = 0.028;
const GAP = 0.034;
/** Pas de calcul (s), passes sur les liens, amortissement, frottement sur ce qu'elle touche. */
const STEP = 1 / 90;
const ITERS = 5;
const DAMP = 0.985;
const FRICTION = 0.85;
/** En dessous de ce glissement par pas (m), le tissu accroche. */
const STICK = 0.0012;
const GRAVITY = 9.8;
/** Raideur des liens : droits, en biais, de pliage (ce qui fait le gonflant d'une couette). */
const K_STRUCT = 1;
const K_SHEAR = 0.7;
const K_BEND = 0.18;
/** Deux morceaux du tissu ne se traversent pas : distance mini (m) entre points éloignés sur la couette. */
const SELF = 0.05;
/** Au bout de SETTLE s sans qu'on la touche, elle s'arrête même si elle frémit encore. */
const SETTLE = 5;
/** Cases (une table de hachage) pour trouver vite les points proches. */
const CELLS = 4096;
/** Carreaux matelassés : un tous les QUILT points. */
const QUILT = 5;

interface Grab {
  i: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  lift: number;
  t: number;
  d: number;
  delay: number;
}

export class Duvet {
  readonly mesh: THREE.Mesh;
  private readonly n = NX * NZ;
  private readonly pos = new Float32Array(NX * NZ * 3);
  private readonly prev = new Float32Array(NX * NZ * 3);
  /** Les points au début du pas (pour savoir s'il a bougé). */
  private readonly start = new Float32Array(NX * NZ * 3);
  /** Les liens : les deux points, la longueur au repos, la raideur ; pliage (ne retient que l'étirement). */
  private readonly la: Int32Array;
  private readonly lb: Int32Array;
  private readonly lrest: Float32Array;
  private readonly lk: Float32Array;
  private readonly lbend: Uint8Array;
  /** Points tenus en main (1). */
  private readonly held = new Uint8Array(NX * NZ);
  private grabs: Grab[] = [];
  private bodyList: BodySphere[] = [];
  /** Ce qui est posé sur le lit (un pull plié…) : des boîtes [x0, x1, y0, y1, z0, z1] dans le repère du lit. */
  private things: Array<[number, number, number, number, number, number]> = [];
  private thingsKey = '';
  /** Le lit fait : la forme de la couette posée bien à plat (calculée une fois). */
  private made: Float32Array;
  /** Lissage en cours (faire le lit) : de la forme actuelle vers `made`. */
  private smooth: { from: Float32Array; t: number; d: number; delay: number } | null = null;
  private acc = 0;
  private still = 0;
  /** Pas depuis qu'on l'a touchée (une main, le dormeur, un objet posé). */
  private age = 0;
  private state: 'made' | 'open' | 'cover' | 'unmade' = 'made';
  private readonly geo: THREE.BufferGeometry;
  /** Pour les plis : les points rangés par case (cases de SELF m). */
  private readonly first = new Int32Array(CELLS);
  private readonly next = new Int32Array(NX * NZ);

  /** `material` : celui de l'ancienne couette du modèle (sa texture remplacée par le matelassé). */
  constructor(private readonly bed: BedShape, material: THREE.Material) {
    // posée sur le lit, ce qui dépasse du matelas retombe le long de ses côtés et du pied
    const lay = bed.top + GAP;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        let x = (i / (NX - 1) - 0.5) * WIDTH, z = MADE_Z + (j / (NZ - 1)) * LENGTH, y = lay;
        const ex = Math.abs(x) - (bed.halfWidth + GAP), ez = z - (bed.z[1] + GAP);
        // le long du matelas, puis du cadre (un peu plus large) et du pied de lit
        if (ex > 0) {
          y -= ex;
          x = Math.sign(x) * ((y < bed.frame.top + GAP ? bed.frame.halfWidth : bed.halfWidth) + GAP);
        }
        if (ez > 0) {
          y -= ez;
          z = (y < bed.frame.top + GAP ? bed.frame.foot : bed.z[1]) + GAP;
        }
        this.set(this.id(i, j), x, Math.max(y, GAP), z);
      }
    }
    this.prev.set(this.pos);
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
    // le coin du pied se tasse un peu : c'est le lit fait
    for (let s = 0; s < 150; s++) this.step(s >= 100);
    this.made = this.pos.slice();
    this.prev.set(this.pos);
    this.geo = this.buildGeometry();
    const mat = material.clone() as THREE.MeshToonMaterial;
    mat.side = THREE.DoubleSide;
    if ('map' in mat) {
      mat.map = quiltTexture();
      mat.color?.set(0xffffff);
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = 'couette-tissu';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // elle sort de sa boîte de départ (rabattue, repoussée)
    this.mesh.frustumCulled = false;
    this.render();
  }

  private id(i: number, j: number): number {
    return j * NX + i;
  }

  private set(k: number, x: number, y: number, z: number): void {
    this.pos[k * 3] = x;
    this.pos[k * 3 + 1] = y;
    this.pos[k * 3 + 2] = z;
  }

  /** Le lit défait (à faire) ? Ouvert (rabattu, ou sur un dormeur) ? */
  get unmade(): boolean {
    return this.state === 'unmade';
  }

  get open(): boolean {
    return this.state !== 'made';
  }

  /** Le corps du dormeur (repère du lit) : la couette se pose dessus. Vide : personne. */
  set bodies(list: BodySphere[]) {
    const old = this.bodyList;
    // le dormeur qui respire à peine ne réveille pas le calcul
    const moved = list.length !== old.length || list.some((b, i) => Math.abs(b.x - old[i].x) + Math.abs(b.y - old[i].y) + Math.abs(b.z - old[i].z) > 0.01);
    if (!moved) return;
    this.bodyList = list;
    this.still = this.age = 0;
  }

  /** Ce qui est posé sur le lit : la couette passe par-dessus. */
  set objects(list: Array<[number, number, number, number, number, number]>) {
    const key = list.map((b) => b.map((v) => v.toFixed(2)).join(',')).join(';');
    if (key === this.thingsKey) return;
    this.thingsKey = key;
    this.things = list;
    this.still = this.age = 0;
  }

  /**
   * Prend des points du haut de la couette (bord côté tête, colonnes `cols` en part de la largeur)
   * et les mène en `seconds` jusqu'à `to(x)` (x : leur place en largeur), en passant `lift` m
   * au-dessus du chemin ; puis les lâche : le tissu retombe comme il veut.
   */
  private pull(cols: number[], to: (x: number) => THREE.Vector3, seconds: number, lift: number, delay = 0, row = 0): void {
    this.grabs = cols.map((c) => {
      const i = Math.round(c * (NX - 1));
      const k = this.id(i, row);
      const from = new THREE.Vector3(this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]);
      return { i: k, from, to: to((i / (NX - 1) - 0.5) * WIDTH), lift, t: 0, d: Math.max(seconds, 0.05), delay };
    });
    this.still = this.age = 0;
  }

  /** Rabat le haut de la couette vers les pieds (on se couche) ; `side` : le côté du dormeur (x). */
  turnDown(seconds: number, side: number): void {
    this.smooth = null;
    const top = this.bed.top;
    // pliée en deux à mi-lit : le bord du haut retombe vers le pied, un peu de travers du côté qu'on tire
    this.pull([0.22, 0.5, 0.78], (x) => new THREE.Vector3(x * 0.92 + side * 0.08, top + 0.09, 0.42 + (x - side) * 0.06), seconds, 0.32);
    this.state = 'open';
  }

  /** Remonte la couette sur le dormeur, jusque sous le menton. */
  cover(seconds: number, side: number): void {
    this.smooth = null;
    const top = this.bed.top;
    this.pull([0.18, 0.5, 0.82], (x) => new THREE.Vector3(x * 0.98 + side * 0.04, top + 0.16, -0.36), seconds, 0.22);
    this.state = 'cover';
  }

  /** Repousse la couette en se levant, de son côté : elle retombe en tas, de travers. */
  throwBack(seconds: number, side: number): void {
    this.smooth = null;
    const top = this.bed.top;
    const s = Math.sign(side) || 1;
    this.pull([0.2, 0.5, 0.8], (x) => new THREE.Vector3(x * 0.75 - s * 0.12, top + 0.12, 0.25 + (s * x) * 0.35), seconds, 0.3);
    this.state = 'unmade';
  }

  /** Fait le lit : tire le haut de la couette vers la tête du lit, puis la lisse (toute la durée). */
  make(seconds: number): void {
    const top = this.bed.top;
    const pull = seconds * 0.45;
    this.pull([0.12, 0.5, 0.88], (x) => new THREE.Vector3(x, top + 0.1, MADE_Z), pull, 0.25);
    this.smooth = { from: this.pos.slice(), t: 0, d: seconds - pull, delay: pull };
    this.state = 'made';
  }

  /** Pose tout de suite défaite (chargement d'une partie) : comme repoussée, déjà retombée. */
  setUnmade(): void {
    this.throwBack(0.3, 0.2);
    for (let s = 0; s < 220; s++) this.step(true);
    this.grabs = [];
    this.render();
  }

  update(dt: number): void {
    if (this.still > 90 && !this.grabs.length && !this.smooth) return;
    this.acc = Math.min(this.acc + dt, STEP * 6);
    let moved = false;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      moved = this.step(true) || moved;
    }
    this.render();
  }

  /** Un pas de calcul ; vrai si le tissu a bougé. */
  private step(live: boolean): boolean {
    const p = this.pos, q = this.prev, n = this.n, held = this.held;
    const g = GRAVITY * STEP * STEP;
    this.start.set(p);
    for (let x = 0; x < n * 3; x += 3) {
      const vx = (p[x] - q[x]) * DAMP, vy = (p[x + 1] - q[x + 1]) * DAMP, vz = (p[x + 2] - q[x + 2]) * DAMP;
      q[x] = p[x];
      q[x + 1] = p[x + 1];
      q[x + 2] = p[x + 2];
      p[x] += vx;
      p[x + 1] += vy - g;
      p[x + 2] += vz;
    }
    // les mains : les points tenus suivent leur chemin
    held.fill(0);
    for (const gr of this.grabs) {
      if (gr.delay > 0) {
        gr.delay -= STEP;
        continue;
      }
      gr.t = Math.min(gr.d, gr.t + STEP);
      const k = THREE.MathUtils.smootherstep(gr.t / gr.d, 0, 1);
      const x = gr.i * 3;
      p[x] = gr.from.x + (gr.to.x - gr.from.x) * k;
      p[x + 1] = gr.from.y + (gr.to.y - gr.from.y) * k + gr.lift * Math.sin(k * Math.PI);
      p[x + 2] = gr.from.z + (gr.to.z - gr.from.z) * k;
      held[gr.i] = 1;
    }
    if (this.grabs.length && this.grabs.every((gr) => gr.t >= gr.d)) this.grabs = [];
    const la = this.la, lb = this.lb, lrest = this.lrest, lk = this.lk, lbend = this.lbend, m = la.length;
    for (let it = 0; it < ITERS; it++) {
      for (let l = 0; l < m; l++) {
        const ia = la[l], ib = lb[l];
        const a = ia * 3, b = ib * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const rest = lrest[l];
        // le pli : un lien de pliage ne s'oppose qu'à l'étirement (une couette se plie, elle ne s'allonge pas)
        if (lbend[l] && d < rest) continue;
        const ha = held[ia], hb = held[ib];
        if (ha && hb) continue;
        const f = ((d - rest) / d) * lk[l] * (ha || hb ? 1 : 0.5);
        const fx = dx * f, fy = dy * f, fz = dz * f;
        if (!ha) {
          p[a] += fx;
          p[a + 1] += fy;
          p[a + 2] += fz;
        }
        if (!hb) {
          p[b] -= fx;
          p[b + 1] -= fy;
          p[b + 2] -= fz;
        }
      }
      if (live && it === ITERS - 1) this.selfCollide();
      this.collide();
    }
    // faire le lit : on lisse vers la couette bien posée
    const sm = this.smooth;
    if (sm && live) {
      if (sm.delay > 0) sm.delay -= STEP;
      else {
        sm.t = Math.min(sm.d, sm.t + STEP);
        const done = sm.t >= sm.d;
        const w = done ? 1 : THREE.MathUtils.smoothstep(sm.t / sm.d, 0, 1) * 0.08;
        for (let x = 0; x < n * 3; x++) {
          p[x] += (this.made[x] - p[x]) * w;
          if (done) q[x] = p[x];
        }
        if (done) this.smooth = null;
      }
    }
    let most = 0;
    const st = this.start;
    for (let x = 0; x < n * 3; x++) {
      const d = Math.abs(p[x] - st[x]);
      if (d > most) most = d;
    }
    // longtemps après qu'on l'a touchée, un tas qui frémit encore s'arrête
    this.age++;
    const moved = most > (this.age > SETTLE / STEP ? 2e-3 : 4e-4);
    this.still = moved ? 0 : this.still + 1;
    return moved;
  }

  /**
   * Pousse le point `k` hors de la boîte (grossie de GAP) par son côté le plus proche, et le fait
   * frotter dessus.
   */
  private box(k: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const p = this.pos, x = k * 3;
    const px = p[x], py = p[x + 1], pz = p[x + 2];
    x0 -= GAP;
    x1 += GAP;
    y0 -= GAP;
    y1 += GAP;
    z0 -= GAP;
    z1 += GAP;
    if (px <= x0 || px >= x1 || py <= y0 || py >= y1 || pz <= z0 || pz >= z1) return;
    let best = y1 - py, side = 3;
    if (px - x0 < best) (best = px - x0), (side = 0);
    if (x1 - px < best) (best = x1 - px), (side = 1);
    if (py - y0 < best) (best = py - y0), (side = 2);
    if (pz - z0 < best) (best = pz - z0), (side = 4);
    if (z1 - pz < best) side = 5;
    if (side === 0) p[x] = x0;
    else if (side === 1) p[x] = x1;
    else if (side === 2) p[x + 1] = y0;
    else if (side === 3) p[x + 1] = y1;
    else if (side === 4) p[x + 2] = z0;
    else p[x + 2] = z1;
    this.rub(k, side >> 1);
  }

  /** Le matelas, le cadre, les oreillers, la tête de lit, le sol, le dormeur : le tissu reste dehors, et y frotte. */
  private collide(): void {
    const p = this.pos, b = this.bed, held = this.held;
    for (let k = 0; k < this.n; k++) {
      if (held[k]) continue;
      const x = k * 3;
      this.box(k, -b.halfWidth, b.halfWidth, b.bottom, b.top, b.z[0], b.z[1]);
      this.box(k, -b.frame.halfWidth, b.frame.halfWidth, b.frame.bottom, b.frame.top, b.z[0], b.frame.foot);
      for (const [x0, x1, z0, z1, y1] of b.pillows) this.box(k, x0, x1, b.top - 0.05, y1, z0, z1);
      for (const t of this.things) this.box(k, t[0], t[1], t[2], t[3], t[4], t[5]);
      if (p[x + 2] < b.head + GAP) {
        p[x + 2] = b.head + GAP;
        this.rub(k, 2);
      }
      if (p[x + 1] < GAP * 0.5) {
        p[x + 1] = GAP * 0.5;
        this.rub(k, 1);
      }
      for (const s of this.bodyList) {
        const dx = p[x] - s.x, dy = p[x + 1] - s.y, dz = p[x + 2] - s.z;
        const r = s.r + GAP;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-6;
        p[x] = s.x + (dx / d) * r;
        p[x + 1] = s.y + (dy / d) * r;
        p[x + 2] = s.z + (dz / d) * r;
        this.rub(k, -1);
      }
    }
  }

  /**
   * Frottement sur ce qu'il touche (axe : 0 x, 1 y, 2 z ; -1 tout) : lent, il accroche (le tissu ne
   * glisse pas tout seul) ; plus vite, sa vitesse s'use.
   */
  private rub(k: number, axis: number): void {
    const p = this.pos, q = this.prev, x = k * 3;
    let v2 = 0;
    for (let a = 0; a < 3; a++) if (a !== axis) v2 += (p[x + a] - q[x + a]) ** 2;
    // accroché : il reste où il était au début du pas ; sinon il glisse en freinant
    if (v2 < STICK * STICK) for (let a = 0; a < 3; a++) {
      if (a !== axis) p[x + a] = q[x + a];
    }
    else for (let a = 0; a < 3; a++) if (a !== axis) q[x + a] += (p[x + a] - q[x + a]) * FRICTION;
  }

  /** Deux bouts de la couette éloignés sur le tissu (un pli) ne se traversent pas. */
  private selfCollide(): void {
    const p = this.pos, n = this.n, held = this.held, first = this.first, next = this.next;
    const inv = 1 / SELF;
    const cell = (cx: number, cy: number, cz: number) => ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (CELLS - 1);
    // chaque point dans sa case (des listes chaînées)
    first.fill(-1);
    for (let k = 0; k < n; k++) {
      const c = cell(Math.floor(p[k * 3] * inv), Math.floor(p[k * 3 + 1] * inv), Math.floor(p[k * 3 + 2] * inv));
      next[k] = first[c];
      first[c] = k;
    }
    const min2 = SELF * SELF;
    for (let k = 0; k < n; k++) {
      const x = k * 3;
      const cx = Math.floor(p[x] * inv), cy = Math.floor(p[x + 1] * inv), cz = Math.floor(p[x + 2] * inv);
      const ik = k % NX, jk = (k / NX) | 0;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          for (let c = -1; c <= 1; c++) {
            for (let o = first[cell(cx + a, cy + b, cz + c)]; o >= 0; o = next[o]) {
              if (o <= k) continue;
              // voisins sur le tissu : déjà tenus par les liens
              if (Math.abs((o % NX) - ik) <= 2 && Math.abs(((o / NX) | 0) - jk) <= 2) continue;
              const y = o * 3;
              const dx = p[y] - p[x], dy = p[y + 1] - p[x + 1], dz = p[y + 2] - p[x + 2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= min2) continue;
              const d = Math.sqrt(d2) || 1e-6;
              const f = ((SELF - d) / d) * 0.5;
              const hk = held[k], ho = held[o];
              if (!hk) {
                const w = ho ? 2 : 1;
                p[x] -= dx * f * w;
                p[x + 1] -= dy * f * w;
                p[x + 2] -= dz * f * w;
              }
              if (!ho) {
                const w = hk ? 2 : 1;
                p[y] += dx * f * w;
                p[y + 1] += dy * f * w;
                p[y + 2] += dz * f * w;
              }
            }
          }
        }
      }
    }
  }

  /** Le dessus et le dessous de la couette (le gonflant entre les deux), et le tour qui les relie. */
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
        // dessus (vers +y à plat), dessous à l'envers
        idx.push(a, c, b, b, c, d);
        idx.push(a + n, b + n, c + n, b + n, d + n, c + n);
      }
    }
    // le tour : relie le bord du dessus à celui du dessous
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

  /** Remet le maillage sur les points du tissu : gonflé au milieu des carreaux, pincé aux coutures. */
  private render(): void {
    const n = this.n, p = this.pos;
    const out = this.geo.attributes.position.array as Float32Array;
    const nrm = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
    const at = (i: number, j: number, w: THREE.Vector3) => {
      const k = this.id(THREE.MathUtils.clamp(i, 0, NX - 1), THREE.MathUtils.clamp(j, 0, NZ - 1)) * 3;
      return w.set(p[k], p[k + 1], p[k + 2]);
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = this.id(i, j);
        u.subVectors(at(i + 1, j, a), at(i - 1, j, b));
        v.subVectors(at(i, j + 1, a), at(i, j - 1, b));
        nrm.crossVectors(v, u).normalize();
        // le matelassé : bombé au milieu de chaque carreau, pincé sur les coutures et sur le bord
        const fi = (i % QUILT) / QUILT, fj = (j % QUILT) / QUILT;
        const puff = Math.sin(fi * Math.PI) * Math.sin(fj * Math.PI);
        const edge = i === 0 || j === 0 || i === NX - 1 || j === NZ - 1 ? 0.25 : 1;
        const up = HALF * edge * (0.45 + 0.55 * puff), down = HALF * edge * 0.6;
        out[k * 3] = p[k * 3] + nrm.x * up;
        out[k * 3 + 1] = p[k * 3 + 1] + nrm.y * up;
        out[k * 3 + 2] = p[k * 3 + 2] + nrm.z * up;
        out[(k + n) * 3] = p[k * 3] - nrm.x * down;
        out[(k + n) * 3 + 1] = p[k * 3 + 1] - nrm.y * down;
        out[(k + n) * 3 + 2] = p[k * 3 + 2] - nrm.z * down;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

/** Le tissu de la couette : blanc cassé, des coutures en carreaux (une tous les QUILT points), un liseré. */
function quiltTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#eeebe4';
  g.fillRect(0, 0, 512, 512);
  // un grain de tissu
  for (let s = 0; s < 4000; s++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '160,150,140'},0.06)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 1);
  }
  g.strokeStyle = 'rgba(150,145,140,0.55)';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  const cols = (NX - 1) / QUILT, rows = (NZ - 1) / QUILT;
  for (let s = 1; s < cols; s++) {
    g.beginPath();
    g.moveTo((s / cols) * 512, 0);
    g.lineTo((s / cols) * 512, 512);
    g.stroke();
  }
  for (let s = 1; s < rows; s++) {
    g.beginPath();
    g.moveTo(0, (s / rows) * 512);
    g.lineTo(512, (s / rows) * 512);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(120,135,160,0.7)';
  g.lineWidth = 7;
  g.strokeRect(4, 4, 504, 504);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
