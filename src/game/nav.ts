/**
 * Contourner les meubles : chaque meuble est un rectangle au sol (sa boîte, tournée comme lui),
 * élargi du rayon du perso. Le perso n'y entre pas (il glisse le long au clavier), et un clic
 * de l'autre côté donne un chemin qui passe par les coins des rectangles (plus court chemin entre
 * les coins qui se voient).
 */
import * as THREE from 'three';

/** Rayon du perso au sol (m). */
const RADIUS = 0.22;
/** Marge des coins de contournement, un peu hors du rectangle élargi. */
const CORNER = 0.06;

interface Rect {
  x: number;
  z: number;
  /** Axes du rectangle (cos, sin de sa rotation). */
  c: number;
  s: number;
  hx: number;
  hz: number;
}

export class Nav {
  private rects: Rect[] = [];

  /** Ajoute un meuble : sa boîte (repère du meuble), sa position et sa rotation (lacet). */
  add(box: THREE.Box3, pos: THREE.Vector3, yaw: number): void {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.rects.push({
      // centre de la boîte tourné comme le meuble (rotation autour de Y)
      x: pos.x + cx * c + cz * s,
      z: pos.z - cx * s + cz * c,
      c,
      s,
      hx: (box.max.x - box.min.x) / 2 + RADIUS,
      hz: (box.max.z - box.min.z) / 2 + RADIUS,
    });
  }

  /** Point dans le repère du rectangle. */
  private local(r: Rect, x: number, z: number): [number, number] {
    const dx = x - r.x, dz = z - r.z;
    return [dx * r.c - dz * r.s, dx * r.s + dz * r.c];
  }

  private world(r: Rect, lx: number, lz: number): THREE.Vector3 {
    return new THREE.Vector3(r.x + lx * r.c + lz * r.s, 0, r.z - lx * r.s + lz * r.c);
  }

  /** Le point est-il dans un meuble (élargi du rayon du perso) ? */
  blocked(p: THREE.Vector3): boolean {
    return !!this.inside(p);
  }

  private inside(p: THREE.Vector3, margin = 0): Rect | null {
    for (const r of this.rects) {
      const [lx, lz] = this.local(r, p.x, p.z);
      if (Math.abs(lx) < r.hx - margin && Math.abs(lz) < r.hz - margin) return r;
    }
    return null;
  }

  /** Sort `p` des meubles (vers le bord le plus proche). Modifie et renvoie `p`. */
  pushOut(p: THREE.Vector3): THREE.Vector3 {
    for (let k = 0; k < 3; k++) {
      const r = this.inside(p);
      if (!r) break;
      let [lx, lz] = this.local(r, p.x, p.z);
      if (r.hx - Math.abs(lx) < r.hz - Math.abs(lz)) lx = Math.sign(lx || 1) * (r.hx + 1e-3);
      else lz = Math.sign(lz || 1) * (r.hz + 1e-3);
      const w = this.world(r, lx, lz);
      p.x = w.x;
      p.z = w.z;
    }
    return p;
  }

  /** Le segment a→b évite-t-il tous les meubles ? */
  clear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    for (const r of this.rects) {
      const [ax, az] = this.local(r, a.x, a.z);
      const [bx, bz] = this.local(r, b.x, b.z);
      // test des « dalles » : intervalle du segment dans le rectangle (légèrement rétréci,
      // pour qu'un trajet le long d'un bord passe)
      let t0 = 0, t1 = 1;
      const e = 1e-3;
      for (const [p, d, h] of [[ax, bx - ax, r.hx - e], [az, bz - az, r.hz - e]]) {
        if (Math.abs(d) < 1e-9) {
          if (Math.abs(p) >= h) { t0 = 1; t1 = 0; }
          continue;
        }
        let u = (-h - p) / d, v = (h - p) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
      }
      if (t0 < t1) return false;
    }
    return true;
  }

  /**
   * Chemin de `from` à `to` (points de passage, `to` compris) qui contourne les meubles. `to`
   * est d'abord sorti des meubles.
   */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const goal = this.pushOut(to.clone().setY(0));
    const start = this.pushOut(from.clone().setY(0));
    if (this.clear(start, goal)) return [goal];
    const nodes: THREE.Vector3[] = [start, goal];
    for (const r of this.rects) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const p = this.world(r, sx * (r.hx + CORNER), sz * (r.hz + CORNER));
        if (!this.inside(p)) nodes.push(p);
      }
    }
    // plus court chemin (Dijkstra, peu de points)
    const n = nodes.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === 1) break;
      done[u] = true;
      for (let v = 0; v < n; v++) {
        if (done[v] || v === u) continue;
        const d = dist[u] + nodes[u].distanceTo(nodes[v]);
        if (d < dist[v] && this.clear(nodes[u], nodes[v])) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    if (prev[1] < 0) return [goal];
    const path: THREE.Vector3[] = [];
    for (let v = 1; v > 0; v = prev[v]) path.unshift(nodes[v]);
    return path;
  }
}
