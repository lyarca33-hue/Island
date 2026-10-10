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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_CHARACTER } from '../game/postfx';
import { ACCESSORY_BY_ID, SLOTS, type AccSlot, type BackFit, type HeadFit, type NeckFit } from './accessories';
import { paintedFace, patternedCloth, type WornPattern } from './looks';
import { DEFAULT_BODY, defaultRecipe, importedOf, type Body, type Recipe } from './recipe';
import { FaceSculpt } from './faceshape';
import { loadVrm } from './vrm';

type Part = 'face' | 'hair' | 'body';

/** Atténuation des couleurs MToon sous l'éclairage du jeu (soleil + ciel ≈ 3, VRoid ≈ 1). */
/** Coiffure posée sur un autre crâne : légèrement agrandie pour couvrir la peau. */
const HAIR_INFLATE = 1.03;

const LIGHT_COMP = 0.62;
/** Matériaux VRoid du dedans du visage (yeux, traits, cils, sourcils, bouche) : jamais visibles dans une ombre. */
const FACE_INNER = /_EYE$|FaceMouth|FaceEyeline|FaceEyelash|FaceBrow/;

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

/** Mêmes os, dans le même ordre, et même matrice de liaison : géométries fusionnables. */
function sameBinding(a: THREE.SkinnedMesh, b: THREE.SkinnedMesh): boolean {
  const ba = a.skeleton.bones, bb = b.skeleton.bones;
  return ba.length === bb.length && ba.every((bone, i) => bone === bb[i]) && a.bindMatrix.equals(b.bindMatrix);
}

/** Un groupe par matériau, couvrant toute la géométrie (contour MToon : 2 matériaux, 2 groupes). */
function fullGroups(m: THREE.SkinnedMesh): boolean {
  if (!Array.isArray(m.material)) return true;
  const n = m.geometry.index?.count ?? 0;
  return m.geometry.groups.length === m.material.length && m.geometry.groups.every((g, i) => g.start === 0 && g.count >= n && g.materialIndex === i);
}

/**
 * Fusionne les maillages d'un VRM qui partagent os et matériaux (les mèches de cheveux : jusqu'à
 * 73 maillages pour 4 matériaux) : chaque maillage est dessiné à l'écran et dans chaque carte
 * d'ombre, un par un. Pas les maillages à expressions (morph targets) ni transparents (ordre de tri).
 */
function mergeSkinned(root: THREE.Object3D): void {
  const groups = new Map<THREE.Object3D, THREE.SkinnedMesh[][]>();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !m.parent || !m.geometry.index || Object.keys(m.geometry.morphAttributes).length) return;
    const mats = materialsOf(m);
    if (mats.some((mat) => mat.transparent) || !fullGroups(m)) return;
    const lists = groups.get(m.parent) ?? groups.set(m.parent, []).get(m.parent)!;
    const key = (x: THREE.SkinnedMesh) => materialsOf(x).map((mat) => mat.uuid).join('|') + '#' + Object.keys(x.geometry.attributes).sort().join(',');
    const list = lists.find((l) => key(l[0]) === key(m) && sameBinding(l[0], m) && l[0].renderOrder === m.renderOrder && l[0].matrix.equals(m.matrix));
    if (list) list.push(m);
    else lists.push([m]);
  });
  for (const lists of groups.values()) {
    for (const list of lists) {
      if (list.length < 2) continue;
      const a = list[0];
      const geo = mergeGeometries(list.map((m) => {
        const g = m.geometry.clone();
        g.clearGroups();
        return g;
      }), false);
      if (!geo) continue;
      const mats = materialsOf(a);
      if (mats.length > 1) for (let i = 0; i < mats.length; i++) geo.addGroup(0, geo.index!.count, i);
      const merged = new THREE.SkinnedMesh(geo, a.material);
      merged.name = a.name;
      merged.position.copy(a.position);
      merged.quaternion.copy(a.quaternion);
      merged.scale.copy(a.scale);
      merged.bind(a.skeleton, a.bindMatrix);
      merged.castShadow = a.castShadow;
      merged.receiveShadow = a.receiveShadow;
      merged.frustumCulled = a.frustumCulled;
      merged.layers.mask = a.layers.mask;
      merged.renderOrder = a.renderOrder;
      a.parent!.add(merged);
      for (const m of list) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
  }
}

/**
 * Une seule sphère englobante, large, pour tous les maillages du perso : il est éliminé d'une
 * carte d'ombre (face de lampe, cône de fenêtre) qui ne le voit pas, en entier ou pas du tout.
 * Calculée en pose de repos, agrandie pour les poses (assis, couché, bras tendus).
 */
function cullAsOne(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  const all = new THREE.Sphere();
  for (const m of skinned) {
    m.computeBoundingSphere();
    const s = m.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
    if (all.isEmpty()) all.copy(s);
    else all.union(s);
  }
  if (all.isEmpty()) return;
  all.radius += 0.6;
  for (const m of skinned) {
    m.boundingSphere = all.clone().applyMatrix4(m.matrixWorld.clone().invert());
    m.frustumCulled = true;
  }
}

function isInside(o: THREE.Object3D, roots: Set<THREE.Object3D>): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (roots.has(p)) return true;
  return false;
}

/**
 * Morceau du corps posé sur le crâne (certains modèles VRoid ont un « cuir chevelu » couleur
 * peau sous leurs cheveux) : presque tous ses sommets suivent la tête.
 */
function onHead(mesh: THREE.SkinnedMesh, head: THREE.Object3D): boolean {
  const g = mesh.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  if (!si || !sw) return false;
  const used = g.index ? new Set(Array.from(g.index.array)) : null;
  const roots = new Set([head]);
  let n = 0;
  let inside = 0;
  for (let v = 0; v < si.count; v++) {
    if (used && !used.has(v)) continue;
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(v, k) > sw.getComponent(v, best)) best = k;
    const bone = mesh.skeleton.bones[si.getComponent(v, best)];
    n++;
    if (bone && isInside(bone, roots)) inside++;
  }
  return n > 0 && inside / n > 0.9;
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

const partsOf = (r: Recipe) => ({ outfit: r.outfit, face: r.face, hair: r.hair });

export class Avatar {
  /** Prévenu quand un perso importé manque et que le perso de base le remplace. */
  static onMissingImport: (() => void) | null = null;
  /** À placer dans la scène ; son échelle donne la taille. */
  readonly root = new THREE.Group();
  readonly base: VRM;
  readonly ids: { outfit: string; face: string; hair: string };
  /** Expressions du visage porté (celui du modèle « visage »). */
  readonly expressions: VRMExpressionManager | null;
  private faceVrm: VRM | null = null;
  /** Curseurs du visage (null : visage qui n'est pas un visage VRoid). */
  private sculpt: FaceSculpt | null = null;
  private hairSprings: VRMSpringBoneManager | null = null;
  private head: THREE.Object3D | null;
  private legLength = 0;
  private restTop = 1.5;
  private restHeadY = 1.4;
  private body: Body = { ...DEFAULT_BODY };
  /** Os de la poitrine (J_Sec_…_Bust1) : absents des modèles masculins. */
  private bust: THREE.Object3D[] = [];
  /** Longueurs du torse et du cou au repos (taille du perso). */
  private torsoLength = 0;
  private neckLength = 0;
  private tinted = new Map<Tintable, { color: THREE.Color; shade: THREE.Color | null; map: THREE.Texture | null; shadeMap: THREE.Texture | null }>();
  private others: VRM[] = [];
  /** Maillages retirés (visage, coiffure ou cuir chevelu remplacés) : libérés avec le perso. */
  private dropped = new THREE.Group();
  /** Accessoires : repères posés sur la tête et le cou, mesures, objets portés par emplacement. */
  private headAnchor = new THREE.Group();
  private neckAnchor = new THREE.Group();
  private headFit: HeadFit | null = null;
  private neckFit: NeckFit = { radius: 0.05, base: 0 };
  private chestAnchor = new THREE.Group();
  private hipsAnchor = new THREE.Group();
  private backFit: BackFit = { back: -0.1, seat: -0.1 };
  private worn = new Map<AccSlot, { key: string; obj: THREE.Object3D }>();
  /** Formes du visage pilotées directement (Fcl_…), et ce qui leur a été ajouté à la dernière image. */
  private morphs: Record<string, number> = {};
  private morphAdded: Array<[number[], number, number]> = [];

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
      for (const m of meshes(base, 'face')) this.drop(m);
      graft(meshes(faceVrm, 'face'), faceVrm, base, (n) => n.startsWith('J_Adj_') && n.includes('FaceEye'));
      this.faceVrm = faceVrm;
    }
    this.expressions = (this.faceVrm ?? base).expressionManager ?? null;
    this.sculpt = FaceSculpt.from(meshes(base, 'face'), this.head);

    // coiffure d'un autre modèle : ses os de mèches (HairJoint-…) et leurs ressorts viennent avec
    if (r.hair !== r.outfit) {
      const hairVrm = vrms.get(r.hair)!;
      for (const m of meshes(base, 'hair')) this.drop(m);
      // cuir chevelu du modèle de la tenue : fait pour sa propre coiffure, il dépasserait de l'autre
      const head = base.humanoid.getRawBoneNode('head');
      if (head) for (const m of meshes(base, 'body')) if (onHead(m, head)) this.drop(m);
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
      // yeux, cils, sourcils, bouche : dans l'ombre de la tête, un dessin de moins par carte d'ombre
      m.castShadow = !materialsOf(m).every((mat) => FACE_INNER.test(mat.name));
      m.receiveShadow = true;
      m.frustumCulled = false; // animé hors de sa boîte de repos (sphère large posée par cullAsOne)
      m.layers.enable(LAYER_CHARACTER);
      for (const mat of materialsOf(m)) matte(mat);
    });
    this.root.add(base.scene);
    this.measureRest();
    this.measureFits();
    mergeSkinned(base.scene);
    cullAsOne(base.scene);
    base.springBoneManager?.setInitState();
    this.hairSprings?.setInitState();
  }

  static async build(r: Recipe): Promise<Avatar> {
    const own = importedOf(r);
    if (own) {
      // perso importé absent de cet appareil (partie venue du compte) ou devenu illisible : perso de base
      const vrm = await loadVrm(own).catch((e) => {
        console.warn('Perso VRoid importé indisponible, perso de base à la place', e);
        Avatar.onMissingImport?.();
        return null;
      });
      if (!vrm) return Avatar.build({ ...r, ...partsOf(defaultRecipe(r.gender)) });
      const a = new Avatar(new Map([[own, vrm]]), r);
      a.applyLook(r);
      return a;
    }
    const ids = [...new Set([r.outfit, r.face, r.hair])];
    const vrms = await Promise.all(ids.map((id) => loadVrm(id)));
    const a = new Avatar(new Map(ids.map((id, i) => [id, vrms[i]])), r);
    a.applyLook(r);
    return a;
  }

  private drop(m: THREE.Object3D): void {
    this.dropped.add(m);
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
    this.torsoLength = y('neck') - y('spine');
    this.neckLength = y('head') - y('neck');
    this.bust = [];
    this.base.scene.traverse((o) => {
      if (/^J_Sec_[LR]_Bust1$/.test(o.name)) this.bust.push(o);
    });
    // haut du crâne (sans la coiffure, qui peut monter haut) : boîte du visage, os appliqués
    const face = new THREE.Box3();
    for (const m of meshes(this.base, 'face')) {
      m.skeleton.update();
      m.computeBoundingBox();
      face.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    }
    this.restTop = face.isEmpty() ? this.restHeadY + 0.2 : face.max.y;
  }

  /**
   * Mesure la tête et le cou au repos (pour caler les accessoires) et pose sur leurs os des
   * repères alignés sur le monde : +Y en haut, +Z vers l'avant.
   */
  private measureFits(): void {
    const h = this.base.humanoid;
    const head = h.getRawBoneNode('head');
    const neck = h.getRawBoneNode('neck');
    this.base.scene.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const pinOn = (bone: THREE.Object3D, anchor: THREE.Group) => {
      anchor.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      bone.add(anchor);
      return bone.getWorldPosition(new THREE.Vector3());
    };
    // sommets d'un maillage en pose de repos (os appliqués), repère monde
    const eachVertex = (m: THREE.SkinnedMesh, fn: (p: THREE.Vector3) => void) => {
      m.skeleton.update();
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        m.getVertexPosition(i, v);
        m.applyBoneTransform(i, v);
        fn(v.applyMatrix4(m.matrixWorld));
      }
    };
    if (head) {
      const o = pinOn(head, this.headAnchor);
      const skull = new THREE.Box3();
      for (const m of meshes(this.base, 'face')) {
        if (!materialsOf(m).some((mat) => /_SKIN/.test(mat.name))) continue;
        eachVertex(m, (p) => skull.expandByPoint(p.sub(o)));
      }
      if (skull.isEmpty()) skull.setFromCenterAndSize(new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.18, 0.22, 0.2));
      const eyeBone = h.getRawBoneNode('leftEye');
      const eye = eyeBone
        ? eyeBone.getWorldPosition(new THREE.Vector3()).sub(o)
        : new THREE.Vector3(0.03, skull.min.y + (skull.max.y - skull.min.y) * 0.45, skull.max.z - 0.03);
      eye.x = Math.abs(eye.x);
      // avant des yeux : la peau du visage devant l'œil
      eye.z = Math.max(eye.z, skull.max.z - 0.02);
      const mid = (eye.y + skull.max.y) / 2;
      const c = skull.getCenter(new THREE.Vector3());
      const ys: number[] = [], zs: number[] = [];
      const pts: THREE.Vector3[] = [];
      for (const m of meshes(this.base, 'hair')) {
        eachVertex(m, (p) => {
          p.sub(o);
          // les mèches qui tombent (couettes, queues) ne comptent pas
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (p.y < mid || d > 0.25) return;
          ys.push(p.y);
          zs.push(p.z);
          pts.push(p.clone());
        });
      }
      // centiles plutôt que maximums : une mèche rebelle (épi) ne soulève pas le chapeau
      const pct = (a: number[], q: number, min: number) => {
        if (!a.length) return min;
        a.sort((x, y) => x - y);
        return Math.max(min, a[Math.min(a.length - 1, Math.floor(a.length * q))]);
      };
      const hairTop = pct(ys, 0.97, skull.max.y);
      const hairFront = pct(zs, 0.95, skull.max.z);
      // tour de la coiffure là où se pose un chapeau (un peu sous le sommet) : centre et rayon
      // mesurés sur la coiffure elle-même, souvent plus en arrière que le crâne
      const band = pts.filter((p) => p.y > hairTop - 0.1 && p.y < hairTop - 0.04);
      const bx = band.map((p) => p.x), bz = band.map((p) => p.z);
      const hairCenter = new THREE.Vector2(c.x, c.z);
      let hairRadius = (skull.max.x - skull.min.x) * 0.4;
      if (band.length > 20) {
        const [x0, x1, z0, z1] = [pct(bx, 0.02, -1), pct(bx, 0.98, -1), pct(bz, 0.02, -1), pct(bz, 0.98, -1)];
        hairCenter.set((x0 + x1) / 2, (z0 + z1) / 2);
        hairRadius = ((x1 - x0) / 2 + (z1 - z0) / 2) / 2;
      }
      this.headFit = { skull, hairTop, hairRadius, hairCenter, hairFront, eye };
    }
    if (neck) {
      const o = pinOn(neck, this.neckAnchor);
      let radius = 0, n = 0, sum = 0;
      for (const m of meshes(this.base, 'body')) {
        if (!materialsOf(m).some((mat) => /Body_.*_SKIN/.test(mat.name))) continue;
        eachVertex(m, (p) => {
          p.sub(o);
          if (p.y < 0.01 || p.y > 0.05) return;
          const d = Math.hypot(p.x, p.z);
          if (d > 0.09) return;
          radius = Math.max(radius, d);
          sum += d;
          n++;
        });
      }
      this.neckFit = { radius: n ? Math.min(radius, (sum / n) * 1.25) : 0.05, base: 0 };
    }
    // dos (sac, ailes) et bas du dos (queue) : surface arrière du corps habillé, au niveau des os
    const backOf = (bone: THREE.Object3D | null, anchor: THREE.Group, fallback: number) => {
      if (!bone) return fallback;
      const o = pinOn(bone, anchor);
      let z = 0;
      for (const m of meshes(this.base, 'body')) {
        eachVertex(m, (p) => {
          p.sub(o);
          if (Math.abs(p.y) < 0.05 && Math.abs(p.x) < 0.08) z = Math.min(z, p.z);
        });
      }
      return z < -0.02 ? z : fallback;
    };
    this.backFit = {
      back: backOf(h.getRawBoneNode('upperChest') ?? h.getRawBoneNode('chest'), this.chestAnchor, -0.1),
      seat: backOf(h.getRawBoneNode('hips'), this.hipsAnchor, -0.1),
    };
  }

  private applyAccessories(r: Recipe): void {
    for (const [slot] of SLOTS) {
      const w = r.accessories?.[slot];
      const acc = w && ACCESSORY_BY_ID.get(w.id);
      const key = acc ? `${acc.id}:${w.color}` : '';
      const cur = this.worn.get(slot);
      if ((cur?.key ?? '') === key) continue;
      if (cur) {
        cur.obj.removeFromParent();
        freeObject(cur.obj);
        this.worn.delete(slot);
      }
      if (!acc || !this.headFit) continue;
      const obj = acc.build(this.headFit, this.neckFit, new THREE.Color(w.color).multiplyScalar(0.85), this.backFit);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        m.layers.enable(LAYER_CHARACTER);
      });
      const anchor = { cou: this.neckAnchor, dos: this.chestAnchor, queue: this.hipsAnchor }[slot as string] ?? this.headAnchor;
      anchor.add(obj);
      this.worn.set(slot, { key, obj });
    }
  }

  /** Formes du visage VRoid pilotées directement : clé = fin du nom (« EYE_Close », « HA_Fung1 »...). */
  setMorphs(w: Record<string, number>): void {
    this.morphs = w;
  }

  private applyMorphs(): void {
    for (const [inf, i, add] of this.morphAdded) inf[i] -= add;
    this.morphAdded = [];
    const keys = Object.keys(this.morphs);
    if (!keys.length) return;
    for (const m of meshes(this.base, 'face')) {
      const dict = m.morphTargetDictionary;
      const inf = m.morphTargetInfluences;
      if (!dict || !inf) continue;
      for (const k of keys) {
        const w = this.morphs[k];
        if (w <= 0.001) continue;
        const name = Object.keys(dict).find((n) => n.endsWith(`_Fcl_${k}`));
        if (name === undefined) continue;
        const i = dict[name];
        const add = Math.max(0, Math.min(1, w) - inf[i]);
        inf[i] += add;
        this.morphAdded.push([inf, i, add]);
      }
    }
  }

  /** Taille approximative (m), du sol au sommet du crâne. */
  get height(): number {
    const b = this.body;
    const top = this.restTop + (this.restTop - this.restHeadY) * (b.head - 1);
    return (top + this.legLength * (b.legs - 1) + this.torsoLength * (b.torso - 1) + this.neckLength * (b.neck - 1)) * b.height;
  }

  /** Os de la tête (cadrage « visage » du créateur). */
  get headBone(): THREE.Object3D | null {
    return this.head;
  }

  /** Proportions et couleurs (rapide, sans rechargement). */
  applyLook(r: Recipe): void {
    this.applyBody(r.body);
    this.sculpt?.apply(r.faceShape);
    this.applyColors(r);
    this.applyAccessories(r);
  }

  private applyBody(b: Body): void {
    this.body = { ...b };
    const h = this.base.humanoid;
    this.root.scale.setScalar(b.height);
    // échelle voulue de chaque os dans le repère du corps ; l'os reçoit le rapport à celle de son
    // parent (os VRoid sans rotation au repos : les axes locaux sont ceux du corps). X = largeur
    // (et longueur des bras, tendus à l'horizontale), Y = hauteur, Z = épaisseur.
    const want = new Map<THREE.Object3D, THREE.Vector3>();
    const set = (bone: THREE.Object3D | null | undefined, x: number, y: number, z: number) => {
      if (bone) want.set(bone, new THREE.Vector3(x, y, z));
    };
    const raw = (n: Parameters<typeof h.getRawBoneNode>[0]) => h.getRawBoneNode(n);
    const upper = raw('upperChest');
    set(raw('hips'), b.hips, 1, b.hips);
    set(raw('spine'), b.waist, b.torso, b.waist);
    // carrure : buste élargi ; le cou et les épaules gardent leur épaisseur (mais s'écartent)
    set(raw('chest'), upper ? (b.waist + b.build) / 2 : b.build, b.torso, upper ? (b.waist + b.build) / 2 : b.build);
    set(upper, b.build, b.torso, b.build);
    set(raw('neck'), 1, b.neck, 1);
    set(raw('head'), b.head, b.head, b.head);
    for (const side of ['left', 'right'] as const) {
      set(raw(`${side}Shoulder`), b.shoulders, 1, 1);
      set(raw(`${side}UpperArm`), b.arms, b.armSize, b.armSize);
      set(raw(`${side}LowerArm`), b.arms, b.armSize, b.armSize);
      set(raw(`${side}Hand`), b.hands, b.hands, b.hands);
      // jambes : on étire la cuisse et le tibia, le pied garde sa hauteur
      set(raw(`${side}UpperLeg`), b.thighs, b.legs, b.thighs);
      set(raw(`${side}LowerLeg`), 1, b.legs, 1);
      set(raw(`${side}Foot`), b.feet, 1, b.feet);
    }
    for (const bone of this.bust) set(bone, b.bust, b.bust, b.bust);
    const one = new THREE.Vector3(1, 1, 1);
    const worldOf = (o: THREE.Object3D | null): THREE.Vector3 => {
      for (let p = o; p && p !== this.base.scene; p = p.parent) {
        const w = want.get(p);
        if (w) return w;
      }
      return one;
    };
    for (const [bone, w] of want) bone.scale.copy(w).divide(worldOf(bone.parent));
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
    // vêtement imprimé : couleur et motif peints dans la texture, couleurs du matériau d'origine
    const cloth = (mat: Tintable, color: string | null, p: WornPattern | undefined) => {
      if (!p) return tint(mat, color, true);
      tint(mat, null, true);
      const o = this.remember(mat);
      if (o.map) mat.map = patternedCloth(o.map, color, p);
      if ('shadeMultiplyTexture' in mat && o.shadeMap) mat.shadeMultiplyTexture = patternedCloth(o.shadeMap, color, p);
    };
    // visage : teinte de peau, puis joues et dessins peints par-dessus
    const face = (mat: Tintable) => {
      tint(mat, r.skinTone, false);
      const o = this.remember(mat);
      mat.map = (o.map && paintedFace(o.map, r.makeup)) ?? o.map;
      if ('shadeMultiplyTexture' in mat) mat.shadeMultiplyTexture = (o.shadeMap && paintedFace(o.shadeMap, r.makeup)) ?? o.shadeMap;
    };
    const m = r.makeup;
    this.base.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of materialsOf(mesh) as Tintable[]) {
        if (!mat.color) continue;
        const n = mat.name;
        if (/Face_\d+_SKIN/.test(n)) face(mat);
        else if (/_SKIN/.test(n)) tint(mat, r.skinTone, false);
        else if (/_HAIR/.test(n)) tint(mat, r.hairColor, true);
        else if (/EyeIris/.test(n)) tint(mat, r.eyeColor, true);
        else if (/FaceBrow/.test(n)) tint(mat, m?.brows ?? null, true);
        else if (/FaceEyelash|FaceEyeline/.test(n)) tint(mat, m?.lashes ?? null, true);
        else if (/^.*Tops_.*_CLOTH/.test(n)) cloth(mat, r.clothes?.top ?? null, r.patterns?.top);
        else if (/Bottoms_.*_CLOTH/.test(n)) cloth(mat, r.clothes?.bottom ?? null, r.patterns?.bottom);
        else if (/Shoes_.*_CLOTH/.test(n)) cloth(mat, r.clothes?.shoes ?? null, r.patterns?.shoes);
        else tint(mat, null, false);
      }
    });
  }

  /** À appeler à chaque image, après le mixeur d'animation. */
  update(dt: number): void {
    // les gestionnaires d'expressions ajoutent et retirent leurs propres poids : on retire les
    // nôtres avant eux, on les remet après
    for (const [inf, i, add] of this.morphAdded) inf[i] -= add;
    this.morphAdded = [];
    this.base.update(dt);
    this.faceVrm?.expressionManager?.update();
    this.applyMorphs();
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
      // texture des matrices d'os de chaque squelette
      const sk = (m as THREE.SkinnedMesh).skeleton;
      if (sk && !seen.has(sk)) (seen.add(sk), sk.dispose());
      for (const mat of materialsOf(m)) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        // textures aussi : chaque modèle chargé a les siennes (40 à 50 par perso), sinon la
        // mémoire du GPU grossit à chaque changement de tenue et tout ralentit
        for (const t of texturesOf(mat)) freeTex(t);
        mat.dispose();
      }
    };
    const freeTex = (t: THREE.Texture | null | undefined) => {
      if (t && !seen.has(t)) (seen.add(t), t.dispose());
    };
    this.base.scene.traverse(free);
    this.dropped.traverse(free);
    for (const v of this.others) v.scene.traverse(free);
    // textures d'origine mises de côté par les teintes, et leurs versions en gris
    for (const o of this.tinted.values()) {
      for (const t of [o.map, o.shadeMap]) {
        freeTex(t);
        if (t) freeTex(grayCache.get(t));
      }
    }
  }
}

/** Textures d'un matériau : propriétés (map...) et uniforms (matériaux MToon). */
function texturesOf(mat: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const add = (v: unknown) => {
    if (v && (v as THREE.Texture).isTexture) out.push(v as THREE.Texture);
  };
  for (const v of Object.values(mat)) add(v);
  const uniforms = (mat as THREE.Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) add(u?.value);
  return out;
}

function freeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of materialsOf(m)) mat.dispose();
  });
}
