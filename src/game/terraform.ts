/**
 * Mode terraformation : on retouche l'île au pinceau. Monter, creuser, aplanir (à la hauteur du
 * point où l'on a cliqué), adoucir, peindre le sol (herbe, sable, terre, roche) et rétablir le
 * relief d'origine. Taille et force du pinceau réglables ; un cercle suit la souris sur le relief.
 *
 * Les retouches vivent dans RELIEF (ile.ts) : une hauteur ajoutée à chaque sommet de la grille du
 * relief et une couche de peinture sur la carte des sols. Tout ce qui lit le relief les voit (le
 * perso qui marche, l'herbe, la mer qui remplit un trou creusé, les routes à la fin du geste). Les
 * pièces des maisons sont protégées : leur sol reste à plat. Les retouches partent avec la sauvegarde.
 */
import * as THREE from 'three';
import { heightAt, naturalGridHeight, naturalSplatMap, RELIEF, type Island } from './ile';

export type TerraTool = 'monter' | 'creuser' | 'aplanir' | 'adoucir' | 'peindre' | 'retablir';
export type TerraGround = 'herbe' | 'sable' | 'terre' | 'roche';

/** Les pinceaux, dans l'ordre des touches 1 à 6. */
export const TERRA_TOOLS: Array<{ id: TerraTool; label: string; hint: string }> = [
  { id: 'monter', label: 'Monter', hint: 'Élève le sol sous le pinceau' },
  { id: 'creuser', label: 'Creuser', hint: 'Abaisse le sol (sous le niveau de la mer, l’eau remplit le trou)' },
  { id: 'aplanir', label: 'Aplanir', hint: 'Met le sol à la hauteur du point où l’on a cliqué' },
  { id: 'adoucir', label: 'Adoucir', hint: 'Arrondit les bosses et les creux' },
  { id: 'peindre', label: 'Peindre', hint: 'Change le sol : herbe, sable, terre ou roche' },
  { id: 'retablir', label: 'Rétablir', hint: 'Rend au sol son relief et sa couleur d’origine' },
];

export const TERRA_GROUNDS: Array<{ id: TerraGround; label: string; color: string }> = [
  { id: 'herbe', label: 'Herbe', color: '#74c535' },
  { id: 'sable', label: 'Sable', color: '#e6d2a0' },
  { id: 'terre', label: 'Terre', color: '#9b7a54' },
  { id: 'roche', label: 'Roche', color: '#8d877c' },
];

/** Parts voulues (sable, roche, terre, pelouse) de chaque sol peint, comme la carte des sols. */
const GROUND_SPLAT: Record<TerraGround, [number, number, number, number]> = {
  herbe: [0, 0, 0, 0],
  sable: [255, 0, 0, 0],
  terre: [0, 0, 255, 0],
  roche: [0, 255, 0, 0],
};

/** Couleur du cercle du pinceau. */
const TOOL_COLOR: Record<TerraTool, string> = {
  monter: '#9ad67a',
  creuser: '#f2795b',
  aplanir: '#f5be5b',
  adoucir: '#7cc4f2',
  peindre: '#ffffff',
  retablir: '#ffffff',
};

export const RADIUS_MIN = 1;
export const RADIUS_MAX = 15;
/** Vitesse de Monter / Creuser au centre du pinceau, à pleine force (m/s). */
const RAISE_SPEED = 3;
/** Le sol retouché reste entre le fond de la mer et le haut d'une grande colline (m). */
const FLOOR = -14;
const CEILING = 40;
/** Autour d'une pièce : le sol est figé jusqu'à `PROTECT_IN` m du mur, libre passé `PROTECT_OUT` m. */
const PROTECT_IN = 0.6;
const PROTECT_OUT = 2;
/** Points du cercle du pinceau. */
const RING_POINTS = 72;

/** Bornes d'un rectangle du monde (m). */
interface Box { x0: number; x1: number; z0: number; z1: number }

const smooth01 = (t: number) => t * t * (3 - 2 * t);

export class Terraform {
  tool: TerraTool = 'monter';
  ground: TerraGround = 'sable';
  /** Rayon du pinceau (m). */
  radius = 4;
  /** Force du pinceau (0,1 à 1). */
  strength = 0.5;
  /** Le mode est ouvert (le jeu donne alors le clic gauche au pinceau). */
  private open = false;
  /** Bouton appuyé : le pinceau agit à chaque image. */
  private pressing = false;
  /** Point du relief sous la souris. */
  private point: THREE.Vector3 | null = null;
  /** Hauteur visée par Aplanir (prise au clic). */
  private flatY = 0;
  /** Ce que le geste en cours a touché (pour finir : routes, triangles du fond). */
  private stroke: Box | null = null;
  private readonly ring: THREE.LineLoop;
  private readonly dot: THREE.Mesh;
  readonly root = new THREE.Group();
  /** Appelés quand le mode s'ouvre ou se ferme, ou qu'un réglage change (l'interface). */
  private readonly listeners = new Set<() => void>();
  /** Quelque chose a été retouché depuis le dernier enregistrement. */
  dirty = false;

  constructor(private readonly island: Island, private readonly protect: Box[]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
    this.ring = new THREE.LineLoop(geo, lineMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 20;
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.dot.renderOrder = 20;
    this.root.add(this.ring, this.dot);
    this.root.name = 'terraformation';
    this.root.visible = false;
  }

  get on(): boolean {
    return this.open;
  }

  /** Suivre les changements (mode, pinceau, réglages) ; rend de quoi arrêter. */
  listen(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  /** Le bouton est tenu (un geste en cours). */
  get pressed(): boolean {
    return this.pressing;
  }

  set on(v: boolean) {
    if (v === this.open) return;
    this.open = v;
    if (!v) this.release();
    this.point = null;
    this.root.visible = false;
    this.changed();
  }

  setTool(t: TerraTool): void {
    this.tool = t;
    this.changed();
  }

  setGround(g: TerraGround): void {
    this.ground = g;
    this.tool = 'peindre';
    this.changed();
  }

  setRadius(r: number): void {
    this.radius = THREE.MathUtils.clamp(r, RADIUS_MIN, RADIUS_MAX);
    this.changed();
  }

  setStrength(s: number): void {
    this.strength = THREE.MathUtils.clamp(s, 0.1, 1);
    this.changed();
  }

  /** Le rayon sous la souris (ou null : hors de la vue) ; trouve le point du relief visé. */
  aim(ray: THREE.Ray | null): void {
    this.point = ray ? hitRelief(ray) : null;
  }

  /** Bouton appuyé : le geste commence. */
  press(): void {
    if (!this.point) return;
    this.pressing = true;
    this.flatY = this.point.y;
    this.stroke = null;
  }

  /** Bouton relâché : le geste se termine (routes et contours remis au relief). */
  release(): void {
    this.pressing = false;
    const s = this.stroke;
    this.stroke = null;
    if (s) this.island.reshape(s.x0, s.x1, s.z0, s.z1, true);
  }

  update(dt: number): void {
    if (!this.open) return;
    const p = this.point;
    this.root.visible = !!p;
    if (!p) return;
    if (this.pressing) this.brush(p.x, p.z, Math.min(dt, 0.1));
    this.drawCursor(p.x, p.z);
  }

  /** Le relief et les sols redeviennent ceux d'origine, partout. */
  resetAll(): void {
    RELIEF.edits.fill(0);
    RELIEF.paintW.fill(0);
    RELIEF.paint.fill(0);
    const h = RELIEF.half;
    this.island.reshape(-h, h, -h, h, true);
    this.dirty = true;
  }

  /** Y a-t-il des retouches ? */
  get edited(): boolean {
    return RELIEF.edits.some((v) => v !== 0) || RELIEF.paintW.some((v) => v !== 0);
  }

  // ---------------------------------------------------------------- pinceau

  /** Part du pinceau au point (x, z) : 0 dans une pièce (et tout autour), 1 au large. */
  private freedom(x: number, z: number): number {
    let f = 1;
    for (const r of this.protect) {
      const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
      const d = Math.hypot(dx, dz);
      if (d >= PROTECT_OUT) continue;
      f = Math.min(f, d <= PROTECT_IN ? 0 : smooth01((d - PROTECT_IN) / (PROTECT_OUT - PROTECT_IN)));
    }
    return f;
  }

  /** Poids du pinceau à `d` m de son centre : 1 au milieu, fondu jusqu'au bord. */
  private falloff(d: number): number {
    const t = d / this.radius;
    return t >= 1 ? 0 : (1 - t * t) ** 2;
  }

  private brush(cx: number, cz: number, dt: number): void {
    const r = this.radius;
    const box: Box = { x0: cx - r, x1: cx + r, z0: cz - r, z1: cz + r };
    if (this.tool === 'peindre' || this.tool === 'retablir') this.paintAt(cx, cz, dt);
    if (this.tool !== 'peindre') this.sculptAt(cx, cz, dt);
    this.island.reshape(box.x0, box.x1, box.z0, box.z1);
    const s = this.stroke;
    this.stroke = s ? { x0: Math.min(s.x0, box.x0), x1: Math.max(s.x1, box.x1), z0: Math.min(s.z0, box.z0), z1: Math.max(s.z1, box.z1) } : box;
    this.dirty = true;
  }

  /** Monter, creuser, aplanir, adoucir, rétablir : les sommets de la grille sous le pinceau. */
  private sculptAt(cx: number, cz: number, dt: number): void {
    const { n, cell, half, edits } = RELIEF;
    const m = n + 1, r = this.radius;
    const i0 = Math.max(0, Math.floor((cx - r + half) / cell)), i1 = Math.min(n, Math.ceil((cx + r + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - r + half) / cell)), j1 = Math.min(n, Math.ceil((cz + r + half) / cell));
    if (i0 > i1 || j0 > j1) return;
    const total = (i: number, j: number) => naturalGridHeight(i, j) + edits[j * m + i];
    // Adoucir : la moyenne des voisins, lue avant de toucher à quoi que ce soit
    let avg: Float32Array | null = null;
    if (this.tool === 'adoucir') {
      const w = i1 - i0 + 1;
      avg = new Float32Array(w * (j1 - j0 + 1));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        let sum = 0, cnt = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a > n || b > n) continue;
          sum += total(a, b);
          cnt++;
        }
        avg[(j - j0) * w + (i - i0)] = sum / cnt;
      }
    }
    const s = this.strength;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -half + i * cell, z = -half + j * cell;
      const f = this.falloff(Math.hypot(x - cx, z - cz)) * this.freedom(x, z);
      if (f <= 0) continue;
      const k = j * m + i, base = naturalGridHeight(i, j);
      let h = base + edits[k];
      switch (this.tool) {
        case 'monter': h += RAISE_SPEED * s * f * dt; break;
        case 'creuser': h -= RAISE_SPEED * s * f * dt; break;
        case 'aplanir': h += (this.flatY - h) * Math.min(1, 6 * s * f * dt); break;
        case 'adoucir': h += (avg![(j - j0) * (i1 - i0 + 1) + (i - i0)] - h) * Math.min(1, 10 * s * f * dt); break;
        case 'retablir': h += (base - h) * Math.min(1, 5 * s * f * dt); break;
        default: break;
      }
      h = THREE.MathUtils.clamp(h, Math.min(FLOOR, base), Math.max(CEILING, base));
      // une retouche de quelques millimètres revenue à rien : plus de retouche du tout
      const e = h - base;
      edits[k] = Math.abs(e) < 0.002 && this.tool === 'retablir' ? 0 : e;
    }
  }

  /** Peindre (ou rétablir) les texels de la carte des sols sous le pinceau. */
  private paintAt(cx: number, cz: number, dt: number): void {
    const { half, mapSize: n, paint, paintW } = RELIEF;
    const base = naturalSplatMap();
    const texel = (2 * half) / n, r = this.radius;
    const i0 = Math.max(0, Math.floor((cx - r + half) / texel)), i1 = Math.min(n - 1, Math.ceil((cx + r + half) / texel));
    const j0 = Math.max(0, Math.floor((cz - r + half) / texel)), j1 = Math.min(n - 1, Math.ceil((cz + r + half) / texel));
    const target = GROUND_SPLAT[this.ground], s = this.strength;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -half + (i + 0.5) * texel, z = -half + (j + 0.5) * texel;
      const f = this.falloff(Math.hypot(x - cx, z - cz)) * this.freedom(x, z);
      if (f <= 0) continue;
      const k = j * n + i;
      if (this.tool === 'retablir') {
        const w = paintW[k] / 255;
        if (!w) continue;
        const nw = w - w * Math.min(1, 5 * s * f * dt) - 0.004;
        paintW[k] = nw <= 0 ? 0 : Math.round(nw * 255);
        continue;
      }
      // le sol tel qu'il se voit, poussé vers le sol choisi ; la peinture le remplace alors en entier
      const a = Math.min(1, 4 * s * f * dt), w = paintW[k] / 255;
      for (let c = 0; c < 4; c++) {
        const seen = base[k * 4 + c] + (paint[k * 4 + c] - base[k * 4 + c]) * w;
        const v = seen + (target[c] - seen) * a;
        // un pas trop petit pour changer l'octet : on l'arrondit vers la cible (le sol finit par y arriver)
        paint[k * 4 + c] = Math.abs(target[c] - v) < 1 ? target[c] : Math.round(v + Math.sign(target[c] - v) * 0.5);
      }
      paintW[k] = 255;
    }
  }

  // ---------------------------------------------------------------- cercle du pinceau

  private drawCursor(cx: number, cz: number): void {
    const pos = this.ring.geometry.getAttribute('position') as THREE.BufferAttribute;
    const r = this.radius;
    for (let k = 0; k < RING_POINTS; k++) {
      const a = (k / RING_POINTS) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pos.setXYZ(k, x, heightAt(x, z) + 0.06, z);
    }
    pos.needsUpdate = true;
    const color = this.tool === 'peindre' ? TERRA_GROUNDS.find((g) => g.id === this.ground)!.color : TOOL_COLOR[this.tool];
    (this.ring.material as THREE.LineBasicMaterial).color.set(color);
    (this.dot.material as THREE.MeshBasicMaterial).color.set(color);
    this.dot.position.set(cx, heightAt(cx, cz) + 0.06, cz);
    this.dot.scale.setScalar(Math.max(1, r / 4));
  }

  // ---------------------------------------------------------------- sauvegarde

  /** Les retouches, en texte compact (null : île d'origine). */
  save(): { relief?: string; sols?: string } | null {
    // la sauvegarde automatique passe toutes les quelques secondes : rien de neuf, le même texte
    if (!this.dirty && this.saved !== undefined) return this.saved;
    this.dirty = false;
    return (this.saved = this.encodeAll());
  }

  /** Dernier texte des retouches (undefined : pas encore calculé). */
  private saved: { relief?: string; sols?: string } | null | undefined = undefined;

  private encodeAll(): { relief?: string; sols?: string } | null {
    const out: { relief?: string; sols?: string } = {};
    if (RELIEF.edits.some((v) => v !== 0)) {
      // au centimètre, sur 16 bits
      const cm = new Int16Array(RELIEF.edits.length);
      for (let k = 0; k < cm.length; k++) cm[k] = Math.round(THREE.MathUtils.clamp(RELIEF.edits[k] * 100, -32767, 32767));
      out.relief = encode(new Uint8Array(cm.buffer));
    }
    if (RELIEF.paintW.some((v) => v !== 0)) {
      const n = RELIEF.paintW.length, bytes = new Uint8Array(n * 5);
      bytes.set(RELIEF.paintW);
      // pas de couleur sous un texel non peint : des zéros, que l'encodage écrase
      for (let k = 0; k < n; k++) if (RELIEF.paintW[k]) bytes.set(RELIEF.paint.subarray(k * 4, k * 4 + 4), n + k * 4);
      out.sols = encode(bytes);
    }
    return out.relief || out.sols ? out : null;
  }

  /** Reprend les retouches d'une sauvegarde (rien : l'île d'origine). */
  load(x: unknown): void {
    const s = (x ?? {}) as { relief?: unknown; sols?: unknown };
    this.saved = undefined;
    // l'île d'origine, déjà là : rien à refaire
    if (typeof s.relief !== 'string' && typeof s.sols !== 'string' && !this.edited) return;
    RELIEF.edits.fill(0);
    RELIEF.paintW.fill(0);
    RELIEF.paint.fill(0);
    try {
      if (typeof s.relief === 'string') {
        const bytes = decode(s.relief, RELIEF.edits.length * 2);
        const cm = new Int16Array(bytes.buffer);
        for (let k = 0; k < cm.length; k++) RELIEF.edits[k] = cm[k] / 100;
      }
      if (typeof s.sols === 'string') {
        const n = RELIEF.paintW.length, bytes = decode(s.sols, n * 5);
        RELIEF.paintW.set(bytes.subarray(0, n));
        RELIEF.paint.set(bytes.subarray(n));
      }
    } catch (e) {
      console.warn('retouches du relief illisibles', e);
      RELIEF.edits.fill(0);
      RELIEF.paintW.fill(0);
    }
    const h = RELIEF.half;
    this.island.reshape(-h, h, -h, h, true);
    this.dirty = false;
  }
}

/** Premier point du relief touché par le rayon (pas de 0,4 m, puis affiné), ou null. */
function hitRelief(ray: THREE.Ray): THREE.Vector3 | null {
  const o = ray.origin, d = ray.direction;
  const p = new THREE.Vector3();
  const above = (t: number) => {
    p.copy(o).addScaledVector(d, t);
    return p.y - heightAt(p.x, p.z);
  };
  let prev = 0;
  if (above(0) < 0) return null;
  for (let t = 0.4; t < 600; t += 0.4) {
    if (above(t) < 0) {
      // entre prev et t : on resserre
      let lo = prev, hi = t;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) < 0) hi = mid;
        else lo = mid;
      }
      above(hi);
      return Math.abs(p.x) > RELIEF.half || Math.abs(p.z) > RELIEF.half ? null : p.clone();
    }
    // sous le fond de la mer, plus rien à toucher
    if (p.y < FLOOR - 1 && d.y < 0) return null;
    prev = t;
  }
  return null;
}

/** Octets → texte : les suites de zéros comptées (0, longueur sur 2 octets), puis base64. */
function encode(bytes: Uint8Array): string {
  const out: number[] = [];
  for (let k = 0; k < bytes.length;) {
    if (bytes[k] !== 0) {
      out.push(bytes[k++]);
      continue;
    }
    let run = 0;
    while (k < bytes.length && bytes[k] === 0 && run < 65535) {
      run++;
      k++;
    }
    out.push(0, run & 255, run >> 8);
  }
  let bin = '';
  for (let k = 0; k < out.length; k += 8192) bin += String.fromCharCode(...out.slice(k, k + 8192));
  return btoa(bin);
}

function decode(text: string, size: number): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(size);
  let o = 0;
  for (let k = 0; k < bin.length && o < size;) {
    const b = bin.charCodeAt(k++);
    if (b !== 0) {
      out[o++] = b;
      continue;
    }
    o += bin.charCodeAt(k) | (bin.charCodeAt(k + 1) << 8);
    k += 2;
  }
  return out;
}
