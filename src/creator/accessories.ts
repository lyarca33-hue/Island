/**
 * Accessoires du créateur : chapeaux, lunettes, ornements de cheveux, écharpe. Petites formes
 * three.js (aucun fichier à télécharger) posées sur la tête ou le cou du perso et mises à la
 * mesure de son crâne et de sa coiffure (voir HeadFit, mesuré par avatar.ts).
 *
 * Idées piochées dans les créateurs de persos des jeux « cosy » (Animal Crossing, Stardew
 * Valley, Sims) et dans les accessoires de VRoid Studio ; toque et tablier pour la cuisine.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../game/toon';

export type AccSlot = 'chapeau' | 'lunettes' | 'cheveux' | 'cou';

export const SLOTS: Array<[AccSlot, string]> = [
  ['chapeau', 'Chapeau'], ['lunettes', 'Lunettes'], ['cheveux', 'Dans les cheveux'], ['cou', 'Cou'],
];

/**
 * Mesures de la tête au repos, dans un repère posé sur l'os de la tête et aligné sur le monde
 * (+Y en haut, +Z vers l'avant du visage), en mètres.
 */
export interface HeadFit {
  /** Peau du visage et du crâne. */
  skull: THREE.Box3;
  /** Haut de la coiffure. */
  hairTop: number;
  /** Rayon de la coiffure autour du crâne, à mi-hauteur entre les yeux et le sommet. */
  hairRadius: number;
  /** Avant de la coiffure (frange), au même niveau. */
  hairFront: number;
  /** Centre des yeux : x = écart d'un œil, y = hauteur, z = avant. */
  eye: THREE.Vector3;
}

/** Mesures du cou, dans le même genre de repère posé sur l'os du cou. */
export interface NeckFit {
  /** Rayon du cou (peau). */
  radius: number;
  /** Hauteur du bas du cou (épaules) au-dessus de l'os. */
  base: number;
}

export interface Accessory {
  id: string;
  label: string;
  slot: AccSlot;
  /** Couleur par défaut. */
  color: string;
  build(head: HeadFit, neck: NeckFit, color: THREE.Color): THREE.Object3D;
}

/** Couleurs proposées pour les accessoires. */
export const ACC_COLORS = [
  '#f4efe6', '#1d1a22', '#c2413a', '#e58bb0', '#e9c27a', '#d98b3a', '#3e78c9', '#3c9c78', '#6c4ab8', '#8a5638', '#9aa3b5', '#7ec8d8',
];

const mat = (c: THREE.ColorRepresentation) => createToonMaterial({ color: c, rimStrength: 0.15 });
const SEG = 28;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/** Calotte (demi-sphère aplatie) qui couvre la coiffure. */
function dome(r: number, h: number, m: THREE.Material, from = 0, to = Math.PI / 2): THREE.Mesh {
  const g = new THREE.SphereGeometry(r, SEG, 12, 0, Math.PI * 2, from, to);
  const o = new THREE.Mesh(g, m);
  o.scale.y = h / r;
  return o;
}

/** Ce que les chapeaux doivent recouvrir : centre, rayon et sommet de la coiffure. */
function crown(h: HeadFit) {
  const c = h.skull.getCenter(new THREE.Vector3());
  const r = Math.max(h.hairRadius, (h.skull.max.x - h.skull.min.x) / 2) * 1.02;
  return { cx: c.x, cz: c.z, r, top: Math.max(h.hairTop, h.skull.max.y) };
}

/** Repère des lunettes : z de l'avant du visage au niveau des yeux. */
function glassesFrame(h: HeadFit, lens: (m: THREE.Material) => THREE.Mesh | null, color: THREE.Color, shape: 'round' | 'square') {
  const g = new THREE.Group();
  const m = mat(color);
  const ex = Math.max(0.028, Math.abs(h.eye.x));
  const r = ex * 0.78;
  const z = h.eye.z + 0.022;
  for (const s of [-1, 1]) {
    const rim = shape === 'round'
      ? mesh(new THREE.TorusGeometry(r, 0.0035, 6, SEG), m, s * ex, h.eye.y, z)
      : mesh(new THREE.TorusGeometry(r * 1.05, 0.004, 4, 4), m, s * ex, h.eye.y, z);
    if (shape === 'square') rim.rotation.z = Math.PI / 4;
    g.add(rim);
    const l = lens(m);
    if (l) {
      l.position.set(s * ex, h.eye.y, z - 0.001);
      g.add(l);
    }
    // branche jusqu'au-dessus de l'oreille
    const back = h.skull.getCenter(new THREE.Vector3()).z;
    const len = z - back;
    const arm = mesh(new THREE.BoxGeometry(0.004, 0.005, len), m, s * (ex + r), h.eye.y + 0.004, z - len / 2);
    g.add(arm);
  }
  const bridge = mesh(new THREE.CylinderGeometry(0.003, 0.003, Math.max(0.004, 2 * (ex - r)) + 0.004, 6), m, 0, h.eye.y + r * 0.25, z);
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  return g;
}

export const ACCESSORIES: Accessory[] = [
  {
    id: 'toque', label: 'Toque de chef', slot: 'chapeau', color: '#f4efe6',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const bandH = 0.06;
      const y0 = top - 0.06;
      g.add(mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, bandH, SEG), m, cx, y0 + bandH / 2, cz));
      g.add(mesh(new THREE.CylinderGeometry(r * 1.12, r * 0.98, 0.08, SEG), m, cx, y0 + bandH + 0.04, cz));
      // dessus bouffant : plusieurs boules
      const puff = r * 0.48;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(puff, 14, 10), m, cx + Math.cos(a) * r * 0.65, y0 + bandH + 0.1, cz + Math.sin(a) * r * 0.65));
      }
      g.add(mesh(new THREE.SphereGeometry(puff * 1.15, 14, 10), m, cx, y0 + bandH + 0.13, cz));
      return g;
    },
  },
  {
    id: 'paille', label: 'Chapeau de paille', slot: 'chapeau', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.075;
      g.add(mesh(new THREE.CylinderGeometry(r * 2.3, r * 2.3, 0.008, SEG * 2), m, cx, y0, cz));
      const cap = dome(r * 1.02, 0.1, m);
      cap.position.set(cx, y0, cz);
      g.add(cap);
      g.add(mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.025, SEG, 1, true), mat(0xc2413a), cx, y0 + 0.013, cz));
      return g;
    },
  },
  {
    id: 'casquette', label: 'Casquette', slot: 'chapeau', color: '#3e78c9',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.1;
      const cap = dome(r * 1.03, 0.115, m);
      cap.position.set(cx, y0, cz);
      g.add(cap);
      // visière : demi-disque devant
      const visor = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.008, SEG, 1, false, -Math.PI / 2, Math.PI), m, cx, y0 + 0.004, cz + r * 0.75);
      visor.rotation.x = 0.3;
      g.add(visor);
      g.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), m, cx, y0 + 0.115, cz));
      return g;
    },
  },
  {
    id: 'bonnet', label: 'Bonnet', slot: 'chapeau', color: '#c2413a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.1;
      const cap = dome(r * 1.04, 0.14, m);
      cap.position.set(cx, y0, cz);
      g.add(cap);
      g.add(mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.04, SEG), m, cx, y0 + 0.01, cz));
      g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), mat(0xf4efe6), cx, y0 + 0.15, cz));
      return g;
    },
  },
  {
    id: 'couronne', label: 'Couronne', slot: 'chapeau', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const rr = r * 0.62;
      const y0 = top - 0.012;
      const band = mesh(new THREE.CylinderGeometry(rr, rr * 0.92, 0.035, SEG, 1, true), m, cx, y0 + 0.017, cz);
      (band.material as THREE.Material).side = THREE.DoubleSide;
      g.add(band);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
        g.add(mesh(new THREE.ConeGeometry(0.012, 0.035, 4), m, x, y0 + 0.05, z));
        if (i % 2 === 0) g.add(mesh(new THREE.SphereGeometry(0.007, 8, 6), mat(i % 4 ? 0x3e78c9 : 0xc2413a), cx + Math.sin(a) * rr * 1.04, y0 + 0.017, cz + Math.cos(a) * rr * 1.04));
      }
      return g;
    },
  },
  {
    id: 'serre-tete', label: 'Serre-tête', slot: 'chapeau', color: '#1d1a22',
    build(h, _n, c) {
      return headband(h, c);
    },
  },
  {
    id: 'chat', label: 'Oreilles de chat', slot: 'chapeau', color: '#1d1a22',
    build(h, _n, c) {
      const g = headband(h, c);
      const { cx, cz, r, top } = crown(h);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.add(mesh(new THREE.ConeGeometry(0.04, 0.075, 4), mat(c)));
        const inner = mesh(new THREE.ConeGeometry(0.024, 0.05, 4), mat(0xe58bb0), 0, -0.008, 0.016);
        ear.add(inner);
        ear.position.set(cx + s * r * 0.55, top - 0.005, cz + 0.005);
        ear.rotation.set(0, Math.PI / 4, -s * 0.35);
        g.add(ear);
      }
      return g;
    },
  },
  {
    id: 'rondes', label: 'Lunettes rondes', slot: 'lunettes', color: '#1d1a22',
    build: (h, _n, c) => glassesFrame(h, () => null, c, 'round'),
  },
  {
    id: 'carrees', label: 'Lunettes carrées', slot: 'lunettes', color: '#8a5638',
    build: (h, _n, c) => glassesFrame(h, () => null, c, 'square'),
  },
  {
    id: 'soleil', label: 'Lunettes de soleil', slot: 'lunettes', color: '#1d1a22',
    build: (h, _n, c) =>
      glassesFrame(h, () => {
        const r = Math.max(0.028, Math.abs(h.eye.x)) * 0.78;
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r, SEG), mat(0x23262e));
        return lens;
      }, c, 'round'),
  },
  {
    id: 'noeud', label: 'Nœud', slot: 'cheveux', color: '#c2413a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.ConeGeometry(0.035, 0.07, 10), m, s * 0.035, 0, 0);
        loop.rotation.z = (s * Math.PI) / 2;
        loop.scale.z = 0.45;
        g.add(loop);
      }
      g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), m));
      g.position.set(cx + r * 0.62, top - 0.04, cz + 0.01);
      g.rotation.z = -0.5;
      return g;
    },
  },
  {
    id: 'fleur', label: 'Fleur', slot: 'cheveux', color: '#e58bb0',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = mesh(new THREE.SphereGeometry(0.019, 10, 8), m, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0);
        p.scale.z = 0.4;
        g.add(p);
      }
      g.add(mesh(new THREE.SphereGeometry(0.013, 10, 8), mat(0xe9c27a), 0, 0, 0.006));
      g.position.set(cx + r * 0.78, top - 0.07, cz + r * 0.2);
      g.rotation.y = 0.9;
      return g;
    },
  },
  {
    id: 'barrettes', label: 'Barrettes', slot: 'cheveux', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      for (let i = 0; i < 2; i++) {
        const b = mesh(new THREE.BoxGeometry(0.06, 0.009, 0.008), m);
        b.position.set(cx - r * 0.55, top - 0.045 - i * 0.022, cz + r * 0.55);
        b.rotation.set(0, -0.7, 0.5);
        g.add(b);
      }
      return g;
    },
  },
  {
    id: 'echarpe', label: 'Écharpe', slot: 'cou', color: '#c2413a',
    build(_h, n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      const ring = mesh(new THREE.TorusGeometry(n.radius + 0.022, 0.026, 10, SEG), m, 0, n.base + 0.02, 0);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const tail = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.025), m, n.radius * 0.6, n.base - 0.09, n.radius + 0.03);
      tail.rotation.z = 0.12;
      g.add(tail);
      return g;
    },
  },
  {
    id: 'foulard', label: 'Foulard', slot: 'cou', color: '#3e78c9',
    build(_h, n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      const ring = mesh(new THREE.TorusGeometry(n.radius + 0.012, 0.014, 8, SEG), m, 0, n.base + 0.02, 0);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      // pointe du foulard devant
      const tip = mesh(new THREE.ConeGeometry(0.05, 0.08, 3), m, 0, n.base - 0.02, n.radius + 0.01);
      tip.rotation.set(Math.PI, 0, 0);
      tip.scale.z = 0.3;
      g.add(tip);
      return g;
    },
  },
  {
    id: 'papillon', label: 'Nœud papillon', slot: 'cou', color: '#1d1a22',
    build(_h, n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.ConeGeometry(0.022, 0.045, 3), m, s * 0.022, 0, 0);
        w.rotation.z = (s * Math.PI) / 2;
        w.scale.z = 0.5;
        g.add(w);
      }
      g.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), m));
      g.position.set(0, n.base - 0.005, n.radius + 0.018);
      return g;
    },
  },
];

function headband(h: HeadFit, c: THREE.Color): THREE.Group {
  const { cx, cz, r, top } = crown(h);
  const g = new THREE.Group();
  // arc d'une oreille à l'autre, par-dessus la coiffure
  const ry = top - h.eye.y + 0.008;
  const rx = r * 1.02;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * rx, h.eye.y + Math.sin(a) * ry, cz + 0.01));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.011, 6), mat(c)));
  return g;
}

export const ACCESSORY_BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));
