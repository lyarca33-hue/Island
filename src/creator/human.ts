/**
 * Corps humain paramétrable (moteur du créateur de personnage), d'après MakeHuman :
 * maillage de base + formes (« targets ») pondérées par les curseurs, squelette Mixamo dont
 * les os suivent les formes, cheveux / vêtements / yeux ajustés sur le corps, expressions du
 * visage en morphs (peu coûteuses, prêtes pour l'IA de RP).
 *
 * Le squelette a la pose de repos sans rotation : l'os i est juste une translation, son
 * inverse de liaison aussi. Changer de forme = recalculer positions, normales et os, sans
 * reconstruire les maillages.
 */
import * as THREE from 'three';
import { LAYER_CHARACTER } from '../game/postfx';
import { createToonMaterial } from '../game/toon';
import type { HumanAssets, ProxyAsset, Target } from './assets';
import { SHAPE_SLIDERS, type Macro, type Recipe } from './recipe';

// --- poids des formes « macro » (sexe, âge, muscle, poids, taille, proportions, origine) ----

type Vals = Record<string, number>;

function macroValues(m: Macro): Vals {
  const v: Vals = { universal: 1 };
  v.female = 1 - m.gender;
  v.male = m.gender;
  const age = Math.max(0.1875, m.age);
  if (age < 0.5) {
    v.old = 0;
    v.young = Math.max(0, (age - 0.1875) * 3.2);
    v.child = Math.max(0, Math.min(1, 5.333 * age) - v.young);
  } else {
    v.child = 0;
    v.old = Math.max(0, age * 2 - 1);
    v.young = 1 - v.old;
  }
  const tri = (x: number, lo: string, mid: string, hi: string, midRule: 'sum' | 'max') => {
    v[hi] = Math.max(0, x * 2 - 1);
    v[lo] = Math.max(0, 1 - x * 2);
    v[mid] = midRule === 'sum' ? 1 - (v[hi] + v[lo]) : 1 - Math.max(v[hi], v[lo]);
  };
  tri(m.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle', 'sum');
  tri(m.weight, 'minweight', 'averageweight', 'maxweight', 'sum');
  tri(m.height, 'minheight', 'averageheight', 'maxheight', 'max');
  tri(m.proportions, 'uncommonproportions', 'regularproportions', 'idealproportions', 'max');
  tri(m.breastSize, 'mincup', 'averagecup', 'maxcup', 'max');
  tri(m.breastFirmness, 'minfirmness', 'averagefirmness', 'maxfirmness', 'max');
  const eth = m.african + m.asian + m.caucasian || 1;
  v.african = m.african / eth;
  v.asian = m.asian / eth;
  v.caucasian = m.caucasian / eth;
  return v;
}

/** Formes macro : nom -> mots-clés dont le produit des valeurs donne le poids. */
function macroTokens(name: string): string[] | null {
  if (name.startsWith('macrodetails/')) return name.slice(name.lastIndexOf('/') + 1).split('-');
  if (name.startsWith('breast/') && name.includes('cup')) return name.slice(7).split('-');
  return null;
}

/** Poids de chaque forme pour une recette. */
export function targetWeights(r: Recipe, macroTargets: Map<string, string[]>): Map<string, number> {
  const w = new Map<string, number>();
  const add = (t: string, x: number) => {
    if (x > 1e-4) w.set(t, (w.get(t) ?? 0) + x);
  };
  const v = macroValues(r.macro);
  for (const [name, tokens] of macroTargets) {
    let p = 1;
    for (const t of tokens) p *= v[t] ?? 0;
    add(name, p);
  }
  for (const s of SHAPE_SLIDERS) {
    const x = r.shape[s.id] ?? 0;
    if (!x) continue;
    for (const t of s.targets) {
      if (t.length === 2) add(x < 0 ? t[0] : t[1], Math.abs(x));
      else add(t[0], Math.max(0, x));
    }
  }
  return w;
}

// --- parties ajustées (cheveux, vêtements, yeux...) -------------------------------------

interface Part {
  asset: ProxyAsset;
  mesh: THREE.SkinnedMesh;
  /** Boîte englobante des sommets de référence sur le corps de base (échelle des décalages). */
  baseBox: THREE.Box3;
  verts: Float32Array;
}

const tmpBox = new THREE.Box3();
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
function texture(url: string): THREE.Texture {
  let t = textureCache.get(url);
  if (!t) {
    t = textureLoader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textureCache.set(url, t);
  }
  return t;
}

/** Parties dont la texture est une découpe (alpha) : pas de contour encré de silhouette. */
const CUTOUT = new Set(['hair', 'eyebrows', 'eyelashes']);
/** Parties qui suivent les expressions du visage (paupières, sourcils). */
const FOLLOW_FACE = new Set(['eyebrows', 'eyelashes']);

export class HumanModel {
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[] = [];
  readonly skeleton: THREE.Skeleton;
  readonly body: THREE.SkinnedMesh;
  /** Taille du perso (m), pieds au sol. */
  height = 1.7;
  /** Positions du corps de base après formes (m, pieds à y = 0). */
  readonly positions: Float32Array;

  private assets: HumanAssets;
  private macroTargets = new Map<string, string[]>();
  private bodyBaseVerts: Uint32Array;
  private baseNormals: Float32Array;
  private parts = new Map<string, Part>();
  private recipe: Recipe | null = null;
  private bodyMat: THREE.MeshToonMaterial;
  private expressionNames: string[];
  /** Écarts d'expression par sommet de base (pour transmettre aux sourcils, cils). */
  private expressionDense: Float32Array[];

  constructor(assets: HumanAssets) {
    this.assets = assets;
    this.root.name = 'human';
    for (const name of assets.targets.keys()) {
      const tk = macroTokens(name);
      if (tk) this.macroTargets.set(name, tk);
    }
    const n = assets.vertexCount;
    this.positions = new Float32Array(n * 3);
    this.baseNormals = new Float32Array(n * 3);
    this.bodyBaseVerts = Uint32Array.from(new Set(assets.body.toBase));

    // squelette (parents avant enfants dans le fichier)
    const byName = new Map<string, THREE.Bone>();
    for (const def of assets.bones) {
      const b = new THREE.Bone();
      b.name = def.name;
      byName.set(def.name, b);
      this.bones.push(b);
      if (def.parent) byName.get(def.parent)!.add(b);
      else this.root.add(b);
    }
    this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));

    // corps
    const g = new THREE.BufferGeometry();
    const nr = assets.body.toBase.length;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nr * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nr * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(assets.body.uv, 2));
    const [si, sw] = this.skinFor(Array.from(assets.body.toBase, (v) => [[v, 1]] as Array<[number, number]>));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(assets.body.index.slice(), 1));
    // expressions : morphs relatifs
    this.expressionNames = [...assets.expressions.keys()];
    this.expressionDense = this.expressionNames.map((k) => dense(assets.expressions.get(k)!, n));
    g.morphAttributes.position = this.expressionDense.map((d) => {
      const a = new Float32Array(nr * 3);
      assets.body.toBase.forEach((v, i) => a.set(d.subarray(v * 3, v * 3 + 3), i * 3));
      return new THREE.BufferAttribute(a, 3);
    });
    g.morphTargetsRelative = true;
    this.bodyMat = createToonMaterial({ color: 0xe8b896, rimStrength: 0.22 });
    this.body = this.skinned(g, this.bodyMat, 'body');
    this.body.layers.enable(LAYER_CHARACTER);
  }

  get expressionUnits(): readonly string[] {
    return this.expressionNames;
  }

  /** Applique une recette (formes, couleurs, cheveux, vêtements). */
  apply(r: Recipe): void {
    const prev = this.recipe;
    this.recipe = structuredClone(r);
    this.updateShape(r);
    this.updateParts(r, prev);
    this.updateMaterials(r);
    this.fitAll();
  }

  /** Poids des unités d'expression (nom -> 0..1) ; les autres reviennent à 0. */
  setExpression(units: Record<string, number>): void {
    const meshes = [this.body, ...[...this.parts.values()].filter((p) => FOLLOW_FACE.has(p.asset.kind)).map((p) => p.mesh)];
    for (const m of meshes) {
      const inf = m.morphTargetInfluences;
      if (!inf) continue;
      this.expressionNames.forEach((name, i) => (inf[i] = units[name] ?? 0));
    }
  }

  // --- formes et squelette ------------------------------------------------------------------

  private updateShape(r: Recipe): void {
    const a = this.assets;
    const p = this.positions;
    p.set(a.basePositions);
    for (const [name, w] of targetWeights(r, this.macroTargets)) {
      const t = a.targets.get(name);
      if (t) addTarget(p, t, w);
    }
    // pieds au sol
    let minY = Infinity, maxY = -Infinity;
    for (const v of this.bodyBaseVerts) {
      minY = Math.min(minY, p[v * 3 + 1]);
      maxY = Math.max(maxY, p[v * 3 + 1]);
    }
    for (let i = 1; i < p.length; i += 3) p[i] -= minY;
    this.height = maxY - minY;

    // normales lissées sur le maillage de base (pas de coutures aux bords d'UV)
    computeNormals(p, a.body.toBase, a.body.index, this.baseNormals);
    const g = this.body.geometry;
    const pos = g.attributes.position.array as Float32Array;
    const nor = g.attributes.normal.array as Float32Array;
    a.body.toBase.forEach((v, i) => {
      pos.set(p.subarray(v * 3, v * 3 + 3), i * 3);
      nor.set(this.baseNormals.subarray(v * 3, v * 3 + 3), i * 3);
    });
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();

    // os : tête = moyenne de ses sommets ; pose de repos sans rotation
    const heads = a.bones.map((def) => mean(p, def.head));
    a.bones.forEach((def, i) => {
      const b = this.bones[i];
      const pi = def.parent ? a.bones.findIndex((d) => d.name === def.parent) : -1;
      b.position.copy(heads[i]);
      if (pi >= 0) b.position.sub(heads[pi]);
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
      this.skeleton.boneInverses[i].makeTranslation(-heads[i].x, -heads[i].y, -heads[i].z);
    });
    this.root.updateMatrixWorld(true);
  }

  /** Positions de repos des os (repère du modèle) : tête et queue, pour le reciblage. */
  restJoints(): Map<string, { head: THREE.Vector3; tail: THREE.Vector3 }> {
    const m = new Map<string, { head: THREE.Vector3; tail: THREE.Vector3 }>();
    for (const def of this.assets.bones) m.set(def.name, { head: mean(this.positions, def.head), tail: mean(this.positions, def.tail) });
    return m;
  }

  // --- cheveux, vêtements... ----------------------------------------------------------------

  private updateParts(r: Recipe, prev: Recipe | null): void {
    const want = new Set<string>(['HighPolyEyes', 'Eyelashes01', 'Teeth_Base', r.eyebrows, ...r.clothes]);
    if (r.hair) want.add(r.hair);
    for (const [id, part] of this.parts) {
      if (want.has(id)) continue;
      this.root.remove(part.mesh);
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
      this.parts.delete(id);
    }
    for (const id of want) {
      if (this.parts.has(id)) continue;
      const asset = this.assets.proxies.find((p) => p.id === id);
      if (asset) this.parts.set(id, this.createPart(asset));
    }
    if (!prev || prev.clothes.join() !== r.clothes.join()) this.updateHiddenSkin(r);
  }

  private createPart(asset: ProxyAsset): Part {
    const n = asset.toProxy.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(asset.uv, 2));
    g.setIndex(new THREE.BufferAttribute(asset.index, 1));
    // poids de peau : mélange de ceux des 3 sommets du corps de référence
    const refsPerVertex: Array<Array<[number, number]>> = [];
    for (let i = 0; i < n; i++) {
      const pv = asset.toProxy[i];
      refsPerVertex.push([0, 1, 2].map((k) => [asset.refs[pv * 3 + k], asset.weights[pv * 3 + k]] as [number, number]));
    }
    const [si, sw] = this.skinFor(refsPerVertex);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (FOLLOW_FACE.has(asset.kind)) {
      g.morphAttributes.position = this.expressionDense.map((d) => {
        const out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const pv = asset.toProxy[i];
          for (let k = 0; k < 3; k++) {
            const v = asset.refs[pv * 3 + k], w = asset.weights[pv * 3 + k];
            out[i * 3] += d[v * 3] * w;
            out[i * 3 + 1] += d[v * 3 + 1] * w;
            out[i * 3 + 2] += d[v * 3 + 2] * w;
          }
        }
        return new THREE.BufferAttribute(out, 3);
      });
      g.morphTargetsRelative = true;
    }
    const cutout = CUTOUT.has(asset.kind);
    const map = asset.textures[0] ? texture(asset.textures[0].url) : null;
    let mat: THREE.Material;
    if (asset.kind === 'eyes') {
      // la cornée (sphère extérieure) est transparente dans la texture : on la découpe
      mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 });
    } else if (asset.kind === 'teeth') {
      mat = createToonMaterial({ color: 0xf2eee4, rimStrength: 0 });
    } else {
      mat = createToonMaterial({ color: 0xffffff, map, rimStrength: cutout ? 0 : 0.18 });
    }
    if (cutout) {
      mat.alphaTest = 0.45;
      mat.side = THREE.DoubleSide;
    }
    // vêtements par-dessus la peau : léger décalage de profondeur selon la couche
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -Math.max(1, asset.zDepth / 10);
    const mesh = this.skinned(g, mat, asset.id);
    if (!cutout && asset.kind !== 'eyes' && asset.kind !== 'teeth') mesh.layers.enable(LAYER_CHARACTER);
    if (cutout && map) mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
    if (asset.kind === 'eyes' || asset.kind === 'teeth') mesh.castShadow = false;
    // boîte des sommets de référence sur le corps de base : mesure le changement d'échelle local
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < asset.refs.length; i++) box.expandByPoint(v.fromArray(this.assets.basePositions, asset.refs[i] * 3));
    return { asset, mesh, baseBox: box, verts: new Float32Array(asset.vertexCount * 3) };
  }

  /** Ajuste toutes les parties sur le corps actuel. */
  private fitAll(): void {
    const p = this.positions;
    const v = new THREE.Vector3();
    const baseSize = new THREE.Vector3(), size = new THREE.Vector3();
    for (const part of this.parts.values()) {
      const a = part.asset;
      tmpBox.makeEmpty();
      for (let i = 0; i < a.refs.length; i++) tmpBox.expandByPoint(v.fromArray(p, a.refs[i] * 3));
      part.baseBox.getSize(baseSize);
      tmpBox.getSize(size);
      const sx = clampScale(size.x / baseSize.x), sy = clampScale(size.y / baseSize.y), sz = clampScale(size.z / baseSize.z);
      const out = part.verts;
      for (let j = 0; j < a.vertexCount; j++) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 3; k++) {
          const r = a.refs[j * 3 + k] * 3, w = a.weights[j * 3 + k];
          x += p[r] * w;
          y += p[r + 1] * w;
          z += p[r + 2] * w;
        }
        out[j * 3] = x + a.offsets[j * 3] * sx;
        out[j * 3 + 1] = y + a.offsets[j * 3 + 1] * sy;
        out[j * 3 + 2] = z + a.offsets[j * 3 + 2] * sz;
      }
      const g = part.mesh.geometry;
      const pos = g.attributes.position.array as Float32Array;
      a.toProxy.forEach((pv, i) => pos.set(out.subarray(pv * 3, pv * 3 + 3), i * 3));
      g.attributes.position.needsUpdate = true;
      // normales lissées par sommet du proxy (pas de coutures aux bords d'UV)
      const pn = new Float32Array(a.vertexCount * 3);
      computeNormals(out, a.toProxy, a.index, pn);
      const nor = g.attributes.normal.array as Float32Array;
      a.toProxy.forEach((pv, i) => nor.set(pn.subarray(pv * 3, pv * 3 + 3), i * 3));
      g.attributes.normal.needsUpdate = true;
      g.computeBoundingSphere();
    }
  }

  /** Cache la peau sous les vêtements portés (triangles dont un sommet est recouvert). */
  private updateHiddenSkin(r: Recipe): void {
    const hidden = new Uint8Array(this.assets.vertexCount);
    for (const id of r.clothes) {
      const d = this.parts.get(id)?.asset.deleteVerts;
      if (d) for (const v of d) hidden[v] = 1;
    }
    const src = this.assets.body.index, toBase = this.assets.body.toBase;
    const out: number[] = [];
    for (let i = 0; i < src.length; i += 3) {
      const a = src[i], b = src[i + 1], c = src[i + 2];
      if (hidden[toBase[a]] || hidden[toBase[b]] || hidden[toBase[c]]) continue;
      out.push(a, b, c);
    }
    this.body.geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(out), 1));
  }

  private updateMaterials(r: Recipe): void {
    this.bodyMat.color.set(r.skinColor);
    const tex = texture(r.macro.gender < 0.5 ? this.assets.skinTextures.female : this.assets.skinTextures.male);
    if (this.bodyMat.map !== tex) {
      this.bodyMat.map = tex;
      this.bodyMat.needsUpdate = true;
    }
    for (const part of this.parts.values()) {
      const m = part.mesh.material as THREE.MeshToonMaterial | THREE.MeshBasicMaterial;
      if (part.asset.kind === 'hair' || part.asset.kind === 'eyebrows' || part.asset.kind === 'eyelashes') {
        m.color.set(part.asset.kind === 'eyelashes' ? darker(r.hairColor) : r.hairColor);
      } else if (part.asset.kind === 'eyes') {
        const t = part.asset.textures.find((x) => x.name === r.eyeColor) ?? part.asset.textures[0];
        const tx = texture(t.url);
        if (m.map !== tx) {
          m.map = tx;
          m.needsUpdate = true;
        }
      } else if (part.asset.kind === 'clothes') {
        m.color.set(r.clothesTint[part.asset.id] ?? '#ffffff');
      }
    }
  }

  // --- outils -------------------------------------------------------------------------------

  private skinned(g: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.SkinnedMesh {
    const m = new THREE.SkinnedMesh(g, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.root.add(m);
    m.bind(this.skeleton, new THREE.Matrix4());
    return m;
  }

  /** Poids de peau (4 os) d'un mélange de sommets du corps de base. */
  private skinFor(mixes: Array<Array<[number, number]>>): [Uint16Array, Float32Array] {
    const { skinIndex, skinWeight } = this.assets;
    const si = new Uint16Array(mixes.length * 4), sw = new Float32Array(mixes.length * 4);
    const acc = new Map<number, number>();
    mixes.forEach((mix, i) => {
      acc.clear();
      for (const [v, w] of mix) {
        if (w <= 0) continue;
        for (let k = 0; k < 4; k++) {
          const bw = skinWeight[v * 4 + k];
          if (bw) acc.set(skinIndex[v * 4 + k], (acc.get(skinIndex[v * 4 + k]) ?? 0) + (bw / 255) * w);
        }
      }
      const top = [...acc].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const tot = top.reduce((s, x) => s + x[1], 0) || 1;
      top.forEach(([b, w], k) => {
        si[i * 4 + k] = b;
        sw[i * 4 + k] = w / tot;
      });
      if (!top.length) sw[i * 4] = 1; // sommet sans poids : suit la racine
    });
    return [si, sw];
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }
}

function addTarget(p: Float32Array, t: Target, w: number): void {
  const { indices, deltas } = t;
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3;
    p[v] += deltas[i * 3] * w;
    p[v + 1] += deltas[i * 3 + 1] * w;
    p[v + 2] += deltas[i * 3 + 2] * w;
  }
}

function dense(t: Target, n: number): Float32Array {
  const d = new Float32Array(n * 3);
  addTarget(d, t, 1);
  return d;
}

function mean(p: Float32Array, verts: number[]): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (const i of verts) v.x += p[i * 3], v.y += p[i * 3 + 1], v.z += p[i * 3 + 2];
  return v.multiplyScalar(1 / Math.max(1, verts.length));
}

/** Normales lissées par sommet « source » (index de rendu -> sommet source via `toSrc`). */
function computeNormals(p: Float32Array, toSrc: ArrayLike<number>, index: ArrayLike<number>, out: Float32Array): void {
  out.fill(0);
  for (let i = 0; i < index.length; i += 3) {
    const a = toSrc[index[i]] * 3, b = toSrc[index[i + 1]] * 3, c = toSrc[index[i + 2]] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      out[v] += nx;
      out[v + 1] += ny;
      out[v + 2] += nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l;
    out[i + 1] /= l;
    out[i + 2] /= l;
  }
}

function clampScale(s: number): number {
  return Number.isFinite(s) ? THREE.MathUtils.clamp(s, 0.4, 2.5) : 1;
}

function darker(hex: string): string {
  return '#' + new THREE.Color(hex).multiplyScalar(0.55).getHexString();
}
