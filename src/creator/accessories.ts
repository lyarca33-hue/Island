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

export type AccSlot = 'chapeau' | 'lunettes' | 'cheveux' | 'oreilles' | 'cou' | 'dos' | 'queue';

export const SLOTS: Array<[AccSlot, string]> = [
  ['chapeau', 'Chapeau'], ['lunettes', 'Lunettes'], ['cheveux', 'Dans les cheveux'], ['oreilles', 'Boucles d’oreilles'], ['cou', 'Cou'],
  ['dos', 'Dans le dos'], ['queue', 'Queue'],
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
  /** Rayon de la coiffure à la hauteur d'un chapeau (un peu sous le sommet). */
  hairRadius: number;
  /** Centre (x, z) de la coiffure à cette hauteur. */
  hairCenter: THREE.Vector2;
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

/**
 * Arrière du corps habillé, dans des repères posés sur l'os du buste (back) et du bassin (seat),
 * alignés sur le monde : z (négatif) de la surface du dos.
 */
export interface BackFit {
  back: number;
  seat: number;
}

export interface Accessory {
  id: string;
  label: string;
  slot: AccSlot;
  /** Couleur par défaut. */
  color: string;
  build(head: HeadFit, neck: NeckFit, color: THREE.Color, back: BackFit): THREE.Object3D;
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
  const r = Math.max(h.hairRadius * 1.1, 0.075);
  return { cx: h.hairCenter.x, cz: h.hairCenter.y, r, top: Math.max(h.hairTop, h.skull.max.y) };
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
      g.add(mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, 0.008, SEG * 2), m, cx, y0, cz));
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
      const y0 = top - 0.09;
      const cap = dome(r * 1.03, 0.12, m);
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

  // --- chapeaux (suite)
  {
    id: 'beret', label: 'Béret', slot: 'chapeau', color: '#26386b',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      // galette posée de travers sur le haut du crâne
      const y0 = top - 0.075;
      const cap = dome(r * 1.1, 0.1, m);
      cap.position.set(cx, y0, cz);
      g.add(cap);
      // bord bouffant
      const rim = mesh(new THREE.TorusGeometry(r * 1.06, 0.018, 8, SEG), m, cx, y0 + 0.008, cz);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.02, 6), m, cx, y0 + 0.105, cz));
      // penché sur le côté, en pivotant autour du sommet du crâne
      const pivot = new THREE.Group();
      pivot.position.set(cx, top - 0.06, cz);
      g.position.set(-cx, -(top - 0.06), -cz);
      pivot.add(g);
      pivot.rotation.z = -0.18;
      return pivot;
    },
  },
  {
    id: 'haut-de-forme', label: 'Haut-de-forme', slot: 'chapeau', color: '#1d1a22',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.05;
      g.add(mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.008, SEG * 2), m, cx, y0, cz));
      g.add(mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.86, 0.13, SEG), m, cx, y0 + 0.065, cz));
      g.add(mesh(new THREE.CylinderGeometry(r * 0.875, r * 0.875, 0.03, SEG), mat(0xc2413a), cx, y0 + 0.02, cz));
      return g;
    },
  },
  {
    id: 'sorciere', label: 'Chapeau de sorcière', slot: 'chapeau', color: '#3a2a55',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.06;
      g.add(mesh(new THREE.CylinderGeometry(r * 1.8, r * 1.8, 0.008, SEG * 2), m, cx, y0, cz));
      // pointe en deux morceaux, la seconde tombe en arrière
      g.add(mesh(new THREE.CylinderGeometry(r * 0.5, r * 1.02, 0.16, SEG), m, cx, y0 + 0.08, cz));
      const tip = mesh(new THREE.ConeGeometry(r * 0.5, 0.14, SEG), m, 0, 0.06, 0);
      const hinge = new THREE.Group();
      hinge.position.set(cx, y0 + 0.16, cz);
      hinge.rotation.x = -0.6;
      hinge.add(tip);
      g.add(hinge);
      g.add(mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.02, 0.03, SEG), mat(0xe9c27a), cx, y0 + 0.017, cz));
      return g;
    },
  },
  {
    id: 'bob', label: 'Bob', slot: 'chapeau', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      const y0 = top - 0.045;
      const cap = dome(r * 1.04, 0.075, m);
      cap.position.set(cx, y0, cz);
      g.add(cap);
      const brim = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.35, 0.03, SEG, 1, true), m, cx, y0 - 0.014, cz);
      (brim.material as THREE.Material).side = THREE.DoubleSide;
      g.add(brim);
      return g;
    },
  },
  {
    id: 'bandana', label: 'Bandeau noué', slot: 'chapeau', color: '#c2413a',
    build(h, _n, c) {
      // large ruban par-dessus la coiffure (même arc que le serre-tête), nœud sur le côté
      const g = headband(h, c, 0.02);
      const { cx, cz, r } = crown(h);
      const m = mat(c);
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.ConeGeometry(0.028, 0.06, 10), m, s * 0.032, 0, 0);
        loop.rotation.z = (s * Math.PI) / 2;
        loop.scale.z = 0.45;
        bow.add(loop);
      }
      bow.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), m));
      bow.position.set(cx + r * 1.0, h.eye.y + (crown(h).top - h.eye.y) * 0.55, cz + 0.02);
      bow.rotation.set(0, Math.PI / 2, -0.3);
      g.add(bow);
      return g;
    },
  },
  {
    id: 'lapin', label: 'Oreilles de lapin', slot: 'chapeau', color: '#f4efe6',
    build(h, _n, c) {
      const g = headband(h, c);
      const { cx, cz, r, top } = crown(h);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        const outer = mesh(new THREE.SphereGeometry(0.028, 12, 10), mat(c), 0, 0.07, 0);
        outer.scale.set(1, 3, 0.45);
        const inner = mesh(new THREE.SphereGeometry(0.016, 10, 8), mat(0xf6b8c8), 0, 0.07, 0.009);
        inner.scale.set(1, 3.6, 0.3);
        ear.add(outer, inner);
        ear.position.set(cx + s * r * 0.4, top - 0.01, cz);
        ear.rotation.z = -s * 0.25;
        g.add(ear);
      }
      return g;
    },
  },
  {
    id: 'cornes', label: 'Petites cornes', slot: 'chapeau', color: '#c2413a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const horn = mesh(new THREE.ConeGeometry(0.017, 0.055, 10), mat(c), cx + s * r * 0.5, top - 0.004, cz + r * 0.2);
        horn.rotation.z = -s * 0.35;
        g.add(horn);
      }
      return g;
    },
  },
  {
    id: 'aureole', label: 'Auréole', slot: 'chapeau', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const ring = mesh(new THREE.TorusGeometry(r * 0.7, 0.007, 8, SEG * 2), createToonMaterial({ color: c, rimStrength: 0.6 }), cx, top + 0.035, cz);
      ring.rotation.x = Math.PI / 2 - 0.25;
      return ring;
    },
  },
  // --- lunettes (suite)
  {
    id: 'coeur', label: 'Lunettes cœur', slot: 'lunettes', color: '#e58bb0',
    build(h, _n, c) {
      const g = new THREE.Group();
      const ex = Math.max(0.028, Math.abs(h.eye.x));
      const r = ex * 0.8;
      const z = h.eye.z + 0.022;
      const m = mat(c);
      const lens = mat(new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35));
      for (const s of [-1, 1]) {
        const frame = mesh(new THREE.ShapeGeometry(heartShape(r * 1.12), 12), m, s * ex, h.eye.y, z - 0.001);
        const glass = mesh(new THREE.ShapeGeometry(heartShape(r * 0.92), 12), lens, s * ex, h.eye.y, z);
        g.add(frame, glass);
        const back = h.skull.getCenter(new THREE.Vector3()).z;
        g.add(mesh(new THREE.BoxGeometry(0.004, 0.005, z - back), m, s * (ex + r), h.eye.y + 0.004, (z + back) / 2));
      }
      return g;
    },
  },
  {
    id: 'monocle', label: 'Monocle', slot: 'lunettes', color: '#e9c27a',
    build(h, _n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      const ex = Math.max(0.028, Math.abs(h.eye.x));
      const r = ex * 0.78;
      const z = h.eye.z + 0.02;
      g.add(mesh(new THREE.TorusGeometry(r, 0.004, 6, SEG), m, -ex, h.eye.y, z));
      // chaînette qui pend jusqu'à la joue
      const pts = [new THREE.Vector3(-ex - r, h.eye.y, z), new THREE.Vector3(-ex - r * 1.2, h.eye.y - 0.05, z - 0.01), new THREE.Vector3(-ex - r * 1.6, h.eye.y - 0.09, z - 0.03)];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0015, 4), m));
      return g;
    },
  },
  {
    id: 'loup', label: 'Masque', slot: 'lunettes', color: '#1d1a22',
    build(h, _n, c) {
      const ex = Math.max(0.028, Math.abs(h.eye.x));
      const w = ex * 1.95;
      const s = new THREE.Shape();
      s.moveTo(-w, ex * 0.35);
      s.quadraticCurveTo(-ex, ex * 1.05, 0, ex * 0.45);
      s.quadraticCurveTo(ex, ex * 1.05, w, ex * 0.35);
      s.quadraticCurveTo(w * 0.9, -ex * 0.85, ex * 0.35, -ex * 0.62);
      s.quadraticCurveTo(0, -ex * 0.35, -ex * 0.35, -ex * 0.62);
      s.quadraticCurveTo(-w * 0.9, -ex * 0.85, -w, ex * 0.35);
      for (const k of [-1, 1]) {
        const hole = new THREE.Path();
        hole.absellipse(k * ex, 0, ex * 0.5, ex * 0.3, 0, Math.PI * 2, true, 0);
        s.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(s, 16);
      // épouse l'arrondi du visage
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setZ(i, -((pos.getX(i) / w) ** 2) * w * 0.6);
      geo.computeVertexNormals();
      const m = mat(c);
      m.side = THREE.DoubleSide;
      return mesh(geo, m, 0, h.eye.y, h.eye.z + 0.016);
    },
  },
  // --- dans les cheveux (suite)
  {
    id: 'etoile', label: 'Étoile', slot: 'cheveux', color: '#e9c27a',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const geo = new THREE.ExtrudeGeometry(starShape(0.03), { depth: 0.008, bevelEnabled: false });
      const o = mesh(geo, mat(c), cx + r * 0.72, top - 0.06, cz + r * 0.35);
      o.rotation.set(0, 0.8, -0.3);
      return o;
    },
  },
  {
    id: 'couronne-fleurs', label: 'Couronne de fleurs', slot: 'cheveux', color: '#e58bb0',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const colors = [c, new THREE.Color(0xf4efe6), new THREE.Color(0xe9c27a)];
      const n = 14;
      const rr = r * 0.95;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const f = flower(0.016, colors[i % 3]);
        // un peu plus bas devant (posée en couronne sur le front)
        f.position.set(cx + Math.sin(a) * rr, top - 0.045 - Math.cos(a) * 0.025, cz + Math.cos(a) * rr);
        f.lookAt(cx + Math.sin(a) * rr * 2, top, cz + Math.cos(a) * rr * 2);
        g.add(f);
      }
      const leaf = mat(0x3c9c78);
      const ring = mesh(new THREE.TorusGeometry(rr, 0.005, 6, SEG * 2), leaf, cx, top - 0.045, cz);
      ring.rotation.x = Math.PI / 2 - Math.atan2(0.025, rr);
      g.add(ring);
      return g;
    },
  },
  {
    id: 'papillon-cheveux', label: 'Papillon', slot: 'cheveux', color: '#3e78c9',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const m = mat(c);
      for (const s of [-1, 1]) {
        const up = mesh(new THREE.SphereGeometry(0.022, 10, 8), m, s * 0.022, 0.012, 0);
        up.scale.set(1, 1.2, 0.25);
        up.rotation.z = s * 0.5;
        const down = mesh(new THREE.SphereGeometry(0.015, 10, 8), m, s * 0.016, -0.016, 0);
        down.scale.set(1, 1.1, 0.25);
        g.add(up, down);
      }
      const body = mesh(new THREE.CapsuleGeometry(0.004, 0.03, 4, 8), mat(0x1d1a22));
      g.add(body);
      g.position.set(cx - r * 0.7, top - 0.05, cz + r * 0.4);
      g.rotation.set(0, -0.9, 0.3);
      return g;
    },
  },
  {
    id: 'plume', label: 'Plume', slot: 'cheveux', color: '#3c9c78',
    build(h, _n, c) {
      const { cx, cz, r, top } = crown(h);
      const g = new THREE.Group();
      const vane = mesh(new THREE.SphereGeometry(0.02, 10, 8), mat(c), 0, 0.05, 0);
      vane.scale.set(0.8, 3.5, 0.15);
      const quill = mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.13, 4), mat(0xf4efe6), 0, 0.045, 0.002);
      g.add(vane, quill);
      g.position.set(cx + r * 0.75, top - 0.06, cz - r * 0.1);
      g.rotation.set(-0.3, 0, -0.55);
      return g;
    },
  },
  // --- boucles d'oreilles
  {
    id: 'puces', label: 'Perles', slot: 'oreilles', color: '#f4efe6',
    build(h, _n, c) {
      return pair(h, () => mesh(new THREE.SphereGeometry(0.0065, 10, 8), mat(c)));
    },
  },
  {
    id: 'anneaux', label: 'Anneaux', slot: 'oreilles', color: '#e9c27a',
    build(h, _n, c) {
      return pair(h, () => {
        const ring = mesh(new THREE.TorusGeometry(0.014, 0.0022, 6, 20), mat(c), 0, -0.012, 0);
        ring.rotation.y = Math.PI / 2;
        return ring;
      });
    },
  },
  {
    id: 'pendants', label: 'Pendants étoile', slot: 'oreilles', color: '#e9c27a',
    build(h, _n, c) {
      return pair(h, () => {
        const g = new THREE.Group();
        const m = mat(c);
        g.add(mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 4), m, 0, -0.01, 0));
        const st = mesh(new THREE.ExtrudeGeometry(starShape(0.011), { depth: 0.003, bevelEnabled: false }), m, 0, -0.028, 0);
        st.rotation.y = Math.PI / 2;
        g.add(st);
        return g;
      });
    },
  },
  {
    id: 'cerises', label: 'Cerises', slot: 'oreilles', color: '#c2413a',
    build(h, _n, c) {
      return pair(h, () => {
        const g = new THREE.Group();
        const stem = mat(0x3c9c78);
        for (const k of [-1, 1]) {
          const s = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.022, 4), stem, 0, -0.01, k * 0.004);
          s.rotation.x = k * 0.35;
          g.add(s);
          g.add(mesh(new THREE.SphereGeometry(0.0075, 10, 8), mat(c), 0, -0.022, k * 0.009));
        }
        return g;
      });
    },
  },
  // --- cou (suite)
  {
    id: 'perles', label: 'Collier de perles', slot: 'cou', color: '#f4efe6',
    build(_h, n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      const k = 22;
      const r = n.radius + 0.012;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        // le collier tombe un peu devant
        const drop = Math.max(0, Math.cos(a)) * 0.025;
        g.add(mesh(new THREE.SphereGeometry(0.0065, 8, 6), m, Math.sin(a) * r, n.base - drop, Math.cos(a) * (r + drop * 0.6)));
      }
      return g;
    },
  },
  {
    id: 'pendentif', label: 'Pendentif cœur', slot: 'cou', color: '#e9c27a',
    build(_h, n, c) {
      const g = new THREE.Group();
      const m = mat(c);
      const r = n.radius + 0.008;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const drop = Math.max(0, Math.cos(a)) ** 2 * 0.04;
        pts.push(new THREE.Vector3(Math.sin(a) * r, n.base - drop, Math.cos(a) * (r + drop * 0.5)));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.0015, 4, true), m));
      g.add(mesh(new THREE.ExtrudeGeometry(heartShape(0.014), { depth: 0.004, bevelEnabled: false }), mat(0xc2413a), 0, n.base - 0.052, r + 0.022));
      return g;
    },
  },
  {
    id: 'ras-du-cou', label: 'Ras-du-cou', slot: 'cou', color: '#1d1a22',
    build(_h, n, c) {
      const band = mesh(new THREE.CylinderGeometry(n.radius + 0.004, n.radius + 0.004, 0.014, SEG, 1, true), mat(c), 0, n.base + 0.025, 0);
      (band.material as THREE.Material).side = THREE.DoubleSide;
      return band;
    },
  },
  {
    id: 'clochette', label: 'Clochette', slot: 'cou', color: '#c2413a',
    build(_h, n, c) {
      const g = new THREE.Group();
      const band = mesh(new THREE.CylinderGeometry(n.radius + 0.005, n.radius + 0.005, 0.016, SEG, 1, true), mat(c), 0, n.base + 0.022, 0);
      (band.material as THREE.Material).side = THREE.DoubleSide;
      g.add(band);
      const gold = createToonMaterial({ color: 0xe9c27a, rimStrength: 0.5 });
      g.add(mesh(new THREE.SphereGeometry(0.013, 12, 10), gold, 0, n.base + 0.005, n.radius + 0.016));
      return g;
    },
  },

  // --- dans le dos (repère du buste)
  {
    id: 'sac', label: 'Sac à dos', slot: 'dos', color: '#d98b3a',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const m = mat(c);
      const d = 0.085;
      const z = b.back - d / 2 + 0.008;
      const bag = mesh(new THREE.BoxGeometry(0.2, 0.25, d), m, 0, -0.07, z);
      g.add(bag);
      // rabat arrondi et poche
      const flap = mesh(new THREE.CylinderGeometry(d / 2 + 0.006, d / 2 + 0.006, 0.205, 16, 1, false, 0, Math.PI), mat(new THREE.Color(c).multiplyScalar(0.8)), 0, 0.055, z);
      flap.rotation.z = Math.PI / 2;
      flap.rotation.y = Math.PI / 2;
      g.add(flap);
      g.add(mesh(new THREE.BoxGeometry(0.13, 0.09, 0.025), mat(new THREE.Color(c).multiplyScalar(0.8)), 0, -0.12, z - d / 2 - 0.01));
      g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), mat(0xe9c27a), 0, -0.085, z - d / 2 - 0.024));
      return g;
    },
  },
  {
    id: 'ailes-ange', label: 'Ailes d’ange', slot: 'dos', color: '#f4efe6',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const m = mat(c);
      for (const s of [-1, 1]) {
        const wing = new THREE.Group();
        // rangées de plumes, de plus en plus longues vers le bas
        for (let i = 0; i < 6; i++) {
          const len = 0.12 + i * 0.035;
          const f = mesh(new THREE.SphereGeometry(0.03, 10, 8), m, s * len * 0.5, -i * 0.028, -i * 0.004);
          f.scale.set(len / 0.06, 0.55, 0.22);
          f.rotation.z = s * (0.35 - i * 0.13);
          wing.add(f);
        }
        wing.position.set(s * 0.05, 0.02, b.back - 0.03);
        wing.rotation.y = s * 0.45;
        g.add(wing);
      }
      return g;
    },
  },
  {
    id: 'ailes-fee', label: 'Ailes de fée', slot: 'dos', color: '#7ec8d8',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const m = createToonMaterial({ color: c, rimStrength: 0.5 });
      m.transparent = true;
      m.opacity = 0.6;
      m.side = THREE.DoubleSide;
      m.depthWrite = false;
      for (const s of [-1, 1]) {
        const wing = new THREE.Group();
        const up = mesh(new THREE.CircleGeometry(0.1, 24), m, s * 0.09, 0.06, 0);
        up.scale.set(1, 0.6, 1);
        up.rotation.z = s * 0.6;
        const low = mesh(new THREE.CircleGeometry(0.065, 24), m, s * 0.06, -0.06, 0);
        low.scale.set(1, 0.65, 1);
        low.rotation.z = -s * 0.5;
        wing.add(up, low);
        wing.position.set(s * 0.02, 0, b.back - 0.02);
        wing.rotation.y = s * 0.5;
        g.add(wing);
      }
      return g;
    },
  },
  {
    id: 'ailes-demon', label: 'Ailes de chauve-souris', slot: 'dos', color: '#3a2a55',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const m = mat(c);
      m.side = THREE.DoubleSide;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.02);
      shape.lineTo(0.08, 0.1);
      shape.lineTo(0.24, 0.07);
      shape.quadraticCurveTo(0.21, 0.02, 0.22, -0.04);
      shape.quadraticCurveTo(0.17, -0.02, 0.15, -0.07);
      shape.quadraticCurveTo(0.1, -0.04, 0.07, -0.09);
      shape.quadraticCurveTo(0.04, -0.04, 0, -0.04);
      shape.closePath();
      for (const s of [-1, 1]) {
        const wing = mesh(new THREE.ShapeGeometry(shape, 8), m, s * 0.03, 0.02, b.back - 0.02);
        wing.scale.x = s;
        wing.rotation.y = s * 0.55;
        g.add(wing);
      }
      return g;
    },
  },
  // --- queues (repère du bassin)
  {
    id: 'queue-chat', label: 'Queue de chat', slot: 'queue', color: '#1d1a22',
    build(_h, _n, c, b) {
      const z = b.seat + 0.01;
      const pts = [
        new THREE.Vector3(0, -0.03, z), new THREE.Vector3(0, -0.1, z - 0.08), new THREE.Vector3(0.03, -0.08, z - 0.2),
        new THREE.Vector3(0.05, 0.05, z - 0.26), new THREE.Vector3(0.03, 0.14, z - 0.24),
      ];
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.014, 8), mat(c));
    },
  },
  {
    id: 'queue-renard', label: 'Queue de renard', slot: 'queue', color: '#d98b3a',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const z = b.seat + 0.01;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.04, z), new THREE.Vector3(0, -0.1, z - 0.09), new THREE.Vector3(0.04, -0.05, z - 0.2), new THREE.Vector3(0.07, 0.06, z - 0.24),
      ]);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = 0.025 + Math.sin(t * Math.PI * 0.85) * 0.04;
        g.add(mesh(new THREE.SphereGeometry(r, 12, 10), mat(i >= n - 2 ? new THREE.Color(0xf4efe6) : c), ...curve.getPoint(t).toArray()));
      }
      return g;
    },
  },
  {
    id: 'queue-lapin', label: 'Queue de lapin', slot: 'queue', color: '#f4efe6',
    build(_h, _n, c, b) {
      return mesh(new THREE.SphereGeometry(0.04, 14, 12), mat(c), 0, -0.07, b.seat - 0.02);
    },
  },
  {
    id: 'queue-diable', label: 'Queue de diable', slot: 'queue', color: '#c2413a',
    build(_h, _n, c, b) {
      const g = new THREE.Group();
      const z = b.seat + 0.01;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.05, z), new THREE.Vector3(-0.02, -0.16, z - 0.08), new THREE.Vector3(0.04, -0.2, z - 0.2), new THREE.Vector3(0.08, -0.1, z - 0.25),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.007, 6), mat(c)));
      const tip = mesh(new THREE.ExtrudeGeometry(heartShape(0.028), { depth: 0.006, bevelEnabled: false }), mat(c), ...curve.getPoint(1).toArray());
      tip.rotation.set(0, Math.PI / 2, Math.PI);
      g.add(tip);
      return g;
    },
  },
];

/** Une boucle à chaque lobe d'oreille (côtés du crâne, un peu sous les yeux). */
function pair(h: HeadFit, make: () => THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const c = h.skull.getCenter(new THREE.Vector3());
  const half = (h.skull.max.x - h.skull.min.x) / 2;
  for (const s of [-1, 1]) {
    const o = make();
    o.position.set(c.x + s * (half - 0.006), h.eye.y - 0.035, c.z - 0.008);
    g.add(o);
  }
  return g;
}

function starShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

function heartShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -r * 0.9);
  s.bezierCurveTo(-r * 1.4, r * 0.1, -r * 0.7, r * 1.1, 0, r * 0.4);
  s.bezierCurveTo(r * 0.7, r * 1.1, r * 1.4, r * 0.1, 0, -r * 0.9);
  return s;
}

/** Petite fleur à cinq pétales, tournée vers +Z. */
function flower(r: number, c: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const m = mat(c);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = mesh(new THREE.SphereGeometry(r * 0.6, 8, 6), m, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 0);
    p.scale.z = 0.4;
    g.add(p);
  }
  g.add(mesh(new THREE.SphereGeometry(r * 0.4, 8, 6), mat(0xe9c27a), 0, 0, r * 0.2));
  return g;
}

function headband(h: HeadFit, c: THREE.Color, thick = 0.011): THREE.Group {
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
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, thick, 6), mat(c));
  // ruban large : aplati d'avant en arrière
  if (thick > 0.011) {
    band.scale.z = 0.45;
    band.position.z = (cz + 0.01) * 0.55;
  }
  g.add(band);
  return g;
}

export const ACCESSORY_BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));
