/**
 * Assemble un perso à partir de plusieurs modèles VRoid : le corps et les vêtements d'un modèle,
 * le visage d'un deuxième, la coiffure d'un troisième. Les modèles VRoid partagent les mêmes noms
 * d'os (J_Bip_...), on peut donc rattacher le visage et les cheveux d'un modèle au squelette d'un
 * autre : chaque maillage garde ses matrices de liaison d'origine et suit les os de même nom.
 *
 * Réglages rapides sans rechargement : proportions (échelle de quelques os) et couleurs (peau,
 * cheveux, yeux).
 */
import type { VRM, VRMExpressionManager, VRMSpringBoneManager } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { LAYER_CHARACTER } from '../game/postfx';
import type { Body, Recipe } from './recipe';
import { loadVrm } from './vrm';

type Part = 'face' | 'hair' | 'body';

/** Atténuation des couleurs MToon sous l'éclairage du jeu (soleil + ciel ≈ 3, VRoid ≈ 1). */
/** Coiffure posée sur un autre crâne : légèrement agrandie pour couvrir la peau. */
const HAIR_INFLATE = 1.03;

const LIGHT_COMP = 0.62;

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Partie d'un maillage VRoid, d'après le nom de son matériau (…_HAIR, …_FACE, …_EYE). */
function partOf(mesh: THREE.Mesh): Part {
  const name = materialsOf(mesh)[0]?.name ?? '';
  if (name.includes('_HAIR')) return 'hair';
  if (name.includes('_FACE') || name.includes('_EYE') || /Face_\d+_SKIN/.test(name)) return 'face';
  return 'body';
}

function meshes(vrm: VRM, part: Part): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && partOf(m) === part) out.push(m);
  });
  return out;
}

function namedNodes(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name && !map.has(o.name)) map.set(o.name, o);
  });
  return map;
}

/**
 * Rattache des maillages de `src` au squelette de `base`. Les os de même nom sont remplacés par
 * ceux de `base` ; les os propres à la pièce (`own`, ou absents de `base`) sont déplacés sous
 * l'os de `base` qui portait leur parent. Renvoie les racines déplacées.
 */
function graft(parts: THREE.SkinnedMesh[], src: VRM, base: VRM, own: (name: string) => boolean): Set<THREE.Object3D> {
  const baseNodes = namedNodes(base.scene);
  const isOwn = (o: THREE.Object3D) => own(o.name) || !baseNodes.has(o.name);
  const roots = new Set<THREE.Object3D>();
  for (const mesh of parts) {
    const bones = mesh.skeleton.bones.map((b) => {
      if (!isOwn(b)) return baseNodes.get(b.name) as THREE.Bone;
      let top: THREE.Object3D = b;
      while (top.parent && top.parent !== src.scene && isOwn(top.parent)) top = top.parent;
      roots.add(top);
      return b;
    });
    mesh.removeFromParent();
    base.scene.add(mesh);
    mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  }
  for (const top of roots) {
    const anchor = top.parent && baseNodes.get(top.parent.name);
    // add() garde la transformation locale : la pièce reste placée pareil par rapport à l'os
    if (anchor) anchor.add(top);
  }
  return roots;
}

/** Boîte du crâne (peau du visage) dans le repère de l'os de la tête, pose de liaison. */
function skullBox(vrm: VRM): THREE.Box3 | null {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of meshes(vrm, 'face')) {
    if (!materialsOf(m).some((mat) => /_SKIN/.test(mat.name))) continue;
    const hi = m.skeleton.bones.findIndex((b) => b.name === 'J_Bip_C_Head');
    if (hi < 0) continue;
    // position de la tête au moment de la liaison = inverse de sa matrice inverse
    const headBind = new THREE.Vector3().setFromMatrixPosition(m.skeleton.boneInverses[hi].clone().invert());
    const pos = m.geometry.getAttribute('position');
    const index = m.geometry.getIndex();
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).sub(headBind);
      box.expandByPoint(v);
    }
  }
  return box.isEmpty() ? null : box;
}

/**
 * Cale une coiffure faite pour le crâne `from` sur le crâne `to` : un os intermédiaire sous la
 * tête la décale et l'étire selon chaque axe, un peu plus large pour ne pas laisser la peau
 * passer à travers les cheveux.
 */
function fitHair(base: VRM, hair: THREE.SkinnedMesh[], from: THREE.Box3, to: THREE.Box3): void {
  const head = base.humanoid.getRawBoneNode('head');
  if (!head) return;
  const sf = from.getSize(new THREE.Vector3());
  const st = to.getSize(new THREE.Vector3());
  const k = new THREE.Vector3(st.x / sf.x, st.y / sf.y, st.z / sf.z);
  for (const a of ['x', 'y', 'z'] as const) k[a] = THREE.MathUtils.clamp(k[a], 0.8, 1.25) * HAIR_INFLATE;
  const fit = new THREE.Bone();
  fit.name = 'HairFit';
  fit.scale.copy(k);
  // le centre du crâne d'origine arrive sur le centre du nouveau
  fit.position.copy(to.getCenter(new THREE.Vector3())).sub(from.getCenter(new THREE.Vector3()).multiply(k));
  head.add(fit);
  for (const m of hair) {
    const bones = m.skeleton.bones.map((b) => (b === head ? (fit as THREE.Bone) : b));
    m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix);
  }
  // les mèches (et leurs ressorts) suivent le même calage
  for (const c of [...head.children]) if (c.name.startsWith('HairJoint')) fit.add(c);
}

function isInside(o: THREE.Object3D, roots: Set<THREE.Object3D>): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (roots.has(p)) return true;
  return false;
}

/** Couleur d'origine d'un matériau MToon (multipliée par les teintes). */
interface Tintable extends THREE.Material {
  color: THREE.Color;
  shadeColorFactor?: THREE.Color;
  map: THREE.Texture | null;
  shadeMultiplyTexture?: THREE.Texture | null;
}

/**
 * Rendu mat, en aplats : VRoid ajoute des reflets brillants (matcap), un liseré lumineux et
 * des dégradés doux. On les retire pour un cel shading net, comme les décors.
 */
function matte(mat: THREE.Material): void {
  const m = mat as THREE.Material & {
    isMToonMaterial?: boolean;
    matcapFactor: THREE.Color;
    parametricRimColorFactor: THREE.Color;
    rimLightingMixFactor: number;
    shadingToonyFactor: number;
  };
  if (!m.isMToonMaterial) return;
  m.matcapFactor.setRGB(0, 0, 0);
  m.parametricRimColorFactor.setRGB(0, 0, 0);
  m.rimLightingMixFactor = 0;
  m.shadingToonyFactor = Math.max(m.shadingToonyFactor, 0.95);
}

const grayCache = new WeakMap<THREE.Texture, THREE.Texture>();

/**
 * Version en niveaux de gris d'une texture (cheveux, iris), éclaircie pour que la teinte choisie
 * ressorte telle quelle sur les zones moyennes.
 */
function grayTexture(tex: THREE.Texture): THREE.Texture {
  const cached = grayCache.get(tex);
  if (cached) return cached;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    n++;
  }
  const k = n ? 200 / Math.max(20, sum / n) : 1;
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.min(255, (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * k);
    px[i] = px[i + 1] = px[i + 2] = l;
  }
  ctx.putImageData(data, 0, 0);
  const out = tex.clone();
  out.image = canvas;
  out.needsUpdate = true;
  grayCache.set(tex, out);
  return out;
}

export class Avatar {
  /** À placer dans la scène ; son échelle donne la taille. */
  readonly root = new THREE.Group();
  readonly base: VRM;
  readonly ids: { outfit: string; face: string; hair: string };
  /** Expressions du visage porté (celui du modèle « visage »). */
  readonly expressions: VRMExpressionManager | null;
  private faceVrm: VRM | null = null;
  private hairSprings: VRMSpringBoneManager | null = null;
  private head: THREE.Object3D | null;
  private legLength = 0;
  private restTop = 1.5;
  private restHeadY = 1.4;
  private body: Body = { height: 1, head: 1, legs: 1, build: 1 };
  private tinted = new Map<Tintable, { color: THREE.Color; shade: THREE.Color | null; map: THREE.Texture | null; shadeMap: THREE.Texture | null }>();
  private others: VRM[] = [];

  private constructor(vrms: Map<string, VRM>, r: Recipe) {
    this.ids = { outfit: r.outfit, face: r.face, hair: r.hair };
    const base = vrms.get(r.outfit)!;
    this.base = base;
    this.head = base.humanoid.getRawBoneNode('head');
    // crânes mesurés avant tout déplacement : celui du visage porté, celui de la coiffure
    const skullTo = r.hair !== r.face ? skullBox(vrms.get(r.face)!) : null;
    const skullFrom = r.hair !== r.face ? skullBox(vrms.get(r.hair)!) : null;

    // visage d'un autre modèle : ses yeux gardent leurs propres os (place des yeux propre au visage)
    if (r.face !== r.outfit) {
      const faceVrm = vrms.get(r.face)!;
      for (const m of meshes(base, 'face')) m.removeFromParent();
      graft(meshes(faceVrm, 'face'), faceVrm, base, (n) => n.startsWith('J_Adj_') && n.includes('FaceEye'));
      this.faceVrm = faceVrm;
    }
    this.expressions = (this.faceVrm ?? base).expressionManager ?? null;

    // coiffure d'un autre modèle : ses os de mèches (HairJoint-…) et leurs ressorts viennent avec
    if (r.hair !== r.outfit) {
      const hairVrm = vrms.get(r.hair)!;
      for (const m of meshes(base, 'hair')) m.removeFromParent();
      const springs = base.springBoneManager;
      if (springs) for (const j of [...springs.joints]) if (j.bone.name.startsWith('HairJoint')) springs.deleteJoint(j);
      const roots = graft(meshes(hairVrm, 'hair'), hairVrm, base, (n) => n.startsWith('HairJoint'));
      const hs = hairVrm.springBoneManager;
      if (hs) {
        for (const j of [...hs.joints]) if (!isInside(j.bone, roots)) hs.deleteJoint(j);
        // les volumes de collision (tête, buste, bras) suivent les os du nouveau corps
        const baseNodes = namedNodes(base.scene);
        for (const c of hs.colliders) {
          const anchor = c.parent && baseNodes.get(c.parent.name);
          if (anchor) anchor.add(c);
        }
        this.hairSprings = hs;
      }
    }
    // coiffure et visage de modèles différents : la coiffure se cale sur le crâne du visage
    if (skullFrom && skullTo) fitHair(base, meshes(base, 'hair'), skullFrom, skullTo);
    for (const v of vrms.values()) if (v !== base) this.others.push(v);

    base.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // animé hors de sa boîte de repos
      m.layers.enable(LAYER_CHARACTER);
      for (const mat of materialsOf(m)) matte(mat);
    });
    this.root.add(base.scene);
    this.measureRest();
    base.springBoneManager?.setInitState();
    this.hairSprings?.setInitState();
  }

  static async build(r: Recipe): Promise<Avatar> {
    const ids = [...new Set([r.outfit, r.face, r.hair])];
    const vrms = await Promise.all(ids.map((id) => loadVrm(id)));
    const a = new Avatar(new Map(ids.map((id, i) => [id, vrms[i]])), r);
    a.applyLook(r);
    return a;
  }

  /** Mêmes pièces que la recette (sinon il faut reconstruire le perso). */
  sameParts(r: Recipe): boolean {
    return r.outfit === this.ids.outfit && r.face === this.ids.face && r.hair === this.ids.hair;
  }

  private measureRest(): void {
    const h = this.base.humanoid;
    this.base.scene.updateMatrixWorld(true);
    const y = (n: Parameters<typeof h.getRawBoneNode>[0]) => h.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3()).y ?? 0;
    this.legLength = y('leftUpperLeg') - y('leftFoot');
    this.restHeadY = y('head');
    // haut du crâne (sans la coiffure, qui peut monter haut) : boîte du visage, os appliqués
    const face = new THREE.Box3();
    for (const m of meshes(this.base, 'face')) {
      m.skeleton.update();
      m.computeBoundingBox();
      face.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    }
    this.restTop = face.isEmpty() ? this.restHeadY + 0.2 : face.max.y;
  }

  /** Taille approximative (m), du sol au sommet du crâne. */
  get height(): number {
    const b = this.body;
    return (this.restTop + (this.restTop - this.restHeadY) * (b.head - 1) + this.legLength * (b.legs - 1)) * b.height;
  }

  /** Os de la tête (cadrage « visage » du créateur). */
  get headBone(): THREE.Object3D | null {
    return this.head;
  }

  /** Proportions et couleurs (rapide, sans rechargement). */
  applyLook(r: Recipe): void {
    this.applyBody(r.body);
    this.applyColors(r);
  }

  private applyBody(b: Body): void {
    this.body = { ...b };
    const h = this.base.humanoid;
    const raw = (n: Parameters<typeof h.getRawBoneNode>[0]) => h.getRawBoneNode(n);
    this.root.scale.setScalar(b.height);
    raw('head')?.scale.setScalar(b.head);
    // jambes : on étire la cuisse (le tibia suit), le pied garde sa forme
    for (const side of ['left', 'right'] as const) {
      raw(`${side}UpperLeg`)?.scale.set(1, b.legs, 1);
      raw(`${side}Foot`)?.scale.set(1, 1 / b.legs, 1);
    }
    // carrure : buste élargi, cou et épaules gardent leur épaisseur (mais s'écartent)
    const chest = raw('upperChest') ?? raw('chest');
    chest?.scale.set(b.build, 1, b.build);
    for (const n of ['neck', 'leftShoulder', 'rightShoulder'] as const) raw(n)?.scale.set(1 / b.build, 1, 1 / b.build);
    // les pieds restent au sol
    this.base.scene.position.y = this.legLength * (b.legs - 1);
  }

  private remember(mat: Tintable) {
    let o = this.tinted.get(mat);
    if (!o) {
      o = {
        color: mat.color.clone(),
        shade: mat.shadeColorFactor?.clone() ?? null,
        map: mat.map,
        shadeMap: mat.shadeMultiplyTexture ?? null,
      };
      this.tinted.set(mat, o);
    }
    return o;
  }

  private applyColors(r: Recipe): void {
    const tint = (mat: Tintable, color: string | null, gray: boolean) => {
      const o = this.remember(mat);
      const c = color ? new THREE.Color(color) : null;
      mat.color.copy(o.color);
      if (o.shade) mat.shadeColorFactor!.copy(o.shade);
      if (gray) {
        mat.map = c && o.map ? grayTexture(o.map) : o.map;
        if ('shadeMultiplyTexture' in mat) mat.shadeMultiplyTexture = c && o.shadeMap ? grayTexture(o.shadeMap) : o.shadeMap;
      }
      if (c) {
        mat.color.multiply(c);
        if (o.shade) mat.shadeColorFactor!.multiply(c);
      }
      // les lumières du jeu (réglées pour les décors) sont plus fortes que celles de VRoid
      mat.color.multiplyScalar(LIGHT_COMP);
      if (o.shade) mat.shadeColorFactor!.multiplyScalar(LIGHT_COMP);
      mat.needsUpdate = true;
    };
    this.base.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of materialsOf(m) as Tintable[]) {
        if (!mat.color) continue;
        const n = mat.name;
        if (/_SKIN/.test(n)) tint(mat, r.skinTone, false);
        else if (/_HAIR/.test(n)) tint(mat, r.hairColor, true);
        else if (/EyeIris/.test(n)) tint(mat, r.eyeColor, true);
        else tint(mat, null, false);
      }
    });
  }

  /** À appeler à chaque image, après le mixeur d'animation. */
  update(dt: number): void {
    this.base.update(dt);
    this.faceVrm?.expressionManager?.update();
    if (this.hairSprings) {
      this.head?.updateWorldMatrix(true, false);
      this.hairSprings.update(dt);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    const seen = new Set<unknown>();
    const free = (o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!seen.has(m.geometry)) (seen.add(m.geometry), m.geometry.dispose());
      for (const mat of materialsOf(m)) if (!seen.has(mat)) (seen.add(mat), mat.dispose());
    };
    this.base.scene.traverse(free);
    for (const v of this.others) v.scene.traverse(free);
  }
}
