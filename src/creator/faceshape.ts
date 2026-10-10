/**
 * Forme du visage façon VRoid Studio : un .vrm exporté n'a plus les curseurs du visage (sa forme
 * est figée dans le maillage), on les refait ici en déformant le visage par zones. Les repères
 * (yeux, bouche, menton, oreilles) sont mesurés sur le modèle d'après ses matériaux VRoid
 * (EyeWhite, FaceMouth, Face_SKIN) ; chaque curseur déplace les sommets proches d'un repère,
 * avec un fondu doux. Les formes d'expressions (clignement, bouche...) sont déformées pareil :
 * un œil agrandi se ferme encore en entier.
 */
import * as THREE from 'three';
import { DEFAULT_FACE, type FaceShape } from './recipe';

interface Landmarks {
  /** Profondeur de l'avant du visage : z du repère, multiplié par `fz` (VRM 0 regarde vers -Z). */
  fz: number;
  headZ: number;
  /** Axe du visage (x) et hauteur des yeux. */
  cx: number;
  eyeY: number;
  /** Centre de l'œil gauche (x positif, par rapport à l'axe) et rayon de l'œil. */
  eyeX: number;
  eyeR: number;
  eyeF: number;
  mouthY: number;
  mouthW: number;
  chinY: number;
  /** Demi-largeur de la tête (bout des oreilles). */
  maxX: number;
}

const MAT = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? '';

/** 1 au centre, 0 à partir de t = 1, sans cassure. */
const fall = (t: number) => (t >= 1 ? 0 : (1 - t * t) ** 2);
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class FaceSculpt {
  private constructor(
    private readonly lm: Landmarks,
    /** Tableaux à déformer, avec leur copie d'origine ; `base` = positions dont ce sont les écarts (formes). */
    private readonly arrays: Array<{ attr: THREE.BufferAttribute; orig: Float32Array; base: Float32Array | null }>,
    private readonly geometries: THREE.BufferGeometry[],
  ) {}

  private shape: FaceShape = { ...DEFAULT_FACE };

  /** Repères mesurés sur les maillages du visage ; null si ce n'est pas un visage VRoid. */
  static from(faces: THREE.SkinnedMesh[], head: THREE.Object3D | null): FaceSculpt | null {
    if (!faces.length || !head) return null;
    const v = new THREE.Vector3();
    const pts = (re: RegExp) => {
      const out: THREE.Vector3[] = [];
      for (const m of faces) {
        if (!re.test(MAT(m))) continue;
        const pos = m.geometry.getAttribute('position');
        const index = m.geometry.getIndex();
        const seen = new Set<number>();
        const n = index ? index.count : pos.count;
        for (let i = 0; i < n; i++) {
          const k = index ? index.getX(i) : i;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(new THREE.Vector3().fromBufferAttribute(pos, k));
        }
      }
      return out;
    };
    const whites = pts(/EyeWhite/);
    const eyes = whites.length ? whites : pts(/EyeIris/);
    const mouth = pts(/FaceMouth/);
    const skin = pts(/Face_\d+_SKIN/);
    if (eyes.length < 8 || mouth.length < 8 || skin.length < 50) return null;

    // tête au moment de la liaison, dans le repère de la géométrie
    const m0 = faces[0];
    const hi = m0.skeleton.bones.indexOf(head as THREE.Bone);
    if (hi < 0) return null;
    const headPos = new THREE.Vector3().setFromMatrixPosition(m0.skeleton.boneInverses[hi].clone().invert()).applyMatrix4(m0.bindMatrixInverse);

    const left = eyes.filter((p) => p.x > 0), right = eyes.filter((p) => p.x < 0);
    if (!left.length || !right.length) return null;
    const box = (a: THREE.Vector3[]) => new THREE.Box3().setFromPoints(a);
    const bl = box(left), br = box(right);
    const cl = bl.getCenter(new THREE.Vector3()), cr = br.getCenter(new THREE.Vector3());
    const cx = (cl.x + cr.x) / 2;
    const fz = Math.sign((cl.z + cr.z) / 2 - headPos.z) || 1;
    const eyeF = ((cl.z + cr.z) / 2 - headPos.z) * fz;
    const bm = box(mouth);
    const mouthC = bm.getCenter(v);
    const mouthY = mouthC.y;
    // menton : le plus bas de la peau, sur l'axe, à l'avant du visage
    let chinY = Infinity, maxX = 0;
    for (const p of skin) {
      const f = (p.z - headPos.z) * fz;
      if (Math.abs(p.x - cx) < 0.015 && f > eyeF * 0.5) chinY = Math.min(chinY, p.y);
      maxX = Math.max(maxX, Math.abs(p.x - cx));
    }
    if (!Number.isFinite(chinY) || chinY >= mouthY) return null;
    const lm: Landmarks = {
      fz,
      headZ: headPos.z,
      cx,
      eyeY: (cl.y + cr.y) / 2,
      eyeX: (cl.x - cr.x) / 2,
      eyeR: ((bl.max.x - bl.min.x) + (br.max.x - br.min.x)) / 4,
      eyeF,
      mouthY,
      mouthW: Math.max(0.01, (bm.max.x - bm.min.x) / 2),
      chinY,
      maxX,
    };

    // positions et formes d'expressions (écarts relatifs), chacune une seule fois
    const arrays: Array<{ attr: THREE.BufferAttribute; orig: Float32Array; base: Float32Array | null }> = [];
    const seen = new Set<THREE.BufferAttribute>();
    const geometries = new Set<THREE.BufferGeometry>();
    for (const m of faces) {
      const g = m.geometry;
      geometries.add(g);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      if (!(pos.array instanceof Float32Array)) return null;
      if (!seen.has(pos)) {
        seen.add(pos);
        arrays.push({ attr: pos, orig: pos.array.slice(), base: null });
      }
      if (!g.morphTargetsRelative) continue;
      for (const a of (g.morphAttributes.position ?? []) as THREE.BufferAttribute[]) {
        if (seen.has(a) || !(a.array instanceof Float32Array) || a.count !== pos.count) continue;
        seen.add(a);
        arrays.push({ attr: a, orig: a.array.slice(), base: arrays.find((x) => x.attr === pos)!.orig });
      }
    }
    return new FaceSculpt(lm, arrays, [...geometries]);
  }

  /** Déplacement d'un point (repère de la géométrie) pour la forme `s`. */
  private deform(p: THREE.Vector3, s: FaceShape, out: THREE.Vector3): THREE.Vector3 {
    const L = this.lm;
    const x = p.x - L.cx, y = p.y, f = (p.z - L.headZ) * L.fz;
    let dx = 0, dy = 0, df = 0;
    const front = smooth(L.eyeF * 0.25, L.eyeF * 0.6, f);
    const faceH = L.eyeY - L.chinY;
    // yeux : taille autour du centre de chaque œil, écart et hauteur de toute la zone (sourcils compris)
    for (const sx of [1, -1]) {
      const ex = sx * L.eyeX;
      const d = Math.hypot(x - ex, y - L.eyeY);
      const w = fall(d / (L.eyeR * 2.4)) * front;
      dx += (x - ex) * (s.eyeSize - 1) * w;
      dy += (y - L.eyeY) * (s.eyeSize - 1) * w;
      const w2 = fall(d / (L.eyeR * 3.2)) * front;
      dx += sx * (s.eyeSpacing - 1) * L.eyeX * w2;
      dy += (s.eyeHeight - 1) * faceH * 0.45 * w2;
    }
    // bouche : largeur et hauteur (dents et langue suivent)
    {
      const d = Math.hypot(x / (L.mouthW * 2.4), (y - L.mouthY) / (L.mouthW * 1.8));
      const w = fall(d) * front;
      dx += x * (s.mouthSize - 1) * w;
      dy += (s.mouthHeight - 1) * faceH * 0.35 * w;
    }
    // joues : le bas du visage s'élargit, rien au-dessus des yeux ni derrière les oreilles
    {
      const t = (L.eyeY - y) / faceH;
      const wy = smooth(0, 0.45, t) * (1 - 0.35 * smooth(0.7, 1.1, t));
      dx += x * (s.faceWidth - 1) * wy * smooth(0, L.eyeF * 0.5, f);
    }
    // menton : le bas du visage descend sous la bouche, et avance un peu
    {
      const len = L.mouthY - L.chinY;
      const w = smooth(0, 1, (L.mouthY - y) / len) * fall(Math.abs(x) / (L.mouthW * 3.5)) * smooth(L.eyeF * 0.3, L.eyeF * 0.7, f);
      dy -= (s.chin - 1) * len * w;
      df += (s.chin - 1) * len * 0.3 * w;
    }
    // oreilles pointues : le bout de l'oreille monte, s'écarte et part vers l'arrière
    if (s.ears > 0) {
      const w = smooth(L.maxX * 0.8, L.maxX, Math.abs(x)) ** 2 * fall(Math.abs(y - L.eyeY) / 0.05) * (1 - smooth(L.eyeF * 0.2, L.eyeF * 0.5, f)) * s.ears;
      dy += 0.03 * w;
      dx += Math.sign(x) * 0.012 * w;
      df -= 0.014 * w;
    }
    return out.set(p.x + dx, p.y + dy, p.z + df * L.fz);
  }

  apply(shape: FaceShape | undefined): void {
    const s = { ...DEFAULT_FACE, ...shape };
    if ((Object.keys(s) as Array<keyof FaceShape>).every((k) => Math.abs(s[k] - this.shape[k]) < 1e-4)) return;
    this.shape = s;
    const p = new THREE.Vector3(), q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    const plain = (Object.keys(s) as Array<keyof FaceShape>).every((k) => s[k] === DEFAULT_FACE[k]);
    for (const { attr, orig, base } of this.arrays) {
      const out = attr.array as Float32Array;
      if (plain) {
        out.set(orig);
      } else if (!base) {
        for (let i = 0; i < orig.length; i += 3) {
          this.deform(p.set(orig[i], orig[i + 1], orig[i + 2]), s, q);
          out[i] = q.x; out[i + 1] = q.y; out[i + 2] = q.z;
        }
      } else {
        // écart d'une forme : déformé comme la différence entre le point bougé et le point au repos
        for (let i = 0; i < orig.length; i += 3) {
          if (orig[i] === 0 && orig[i + 1] === 0 && orig[i + 2] === 0) {
            out[i] = out[i + 1] = out[i + 2] = 0;
            continue;
          }
          p.set(base[i], base[i + 1], base[i + 2]);
          this.deform(p, s, a);
          this.deform(p.add(q.set(orig[i], orig[i + 1], orig[i + 2])), s, b);
          out[i] = b.x - a.x; out[i + 1] = b.y - a.y; out[i + 2] = b.z - a.z;
        }
      }
      attr.needsUpdate = true;
    }
    // les formes d'expressions vivent dans une texture que three.js ne refait qu'à la création :
    // la géométrie libérée est renvoyée en entier à la carte graphique au prochain dessin
    for (const g of this.geometries) g.dispose();
  }
}
