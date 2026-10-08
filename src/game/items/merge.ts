/**
 * Moins de dessins par objet. Un objet est fait de dizaines de petites pièces (boutons, pieds,
 * planches…), chacune un dessin dans l'image et un autre dans chaque carte d'ombre (six par lampe) :
 * c'est le gros du travail d'une image, surtout pour un processeur ou une carte graphique modestes.
 *
 * Les pièces fixes (sans nom, donc jamais montrées, cachées ou bougées à part) sont regroupées :
 * - pour l'image, une seule pièce par matériau identique (même couleur, même rendu) ;
 * - pour les ombres, une seule pièce « ombre seule » pour tout l'objet, montrée aux seules cartes
 *   d'ombre (voir shadowOnlyPass). Les pièces visibles ne font alors plus d'ombre.
 *
 * Les pièces nommées (porte, liquide, flamme…) et tout ce qu'elles contiennent restent intacts.
 * Le rendu ne change pas : mêmes triangles, mêmes matériaux, mêmes ombres.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Rayon (m) sous lequel une pièce d'objet ne fait pas d'ombre. */
export const SMALL_CASTER = 0.035;
/** Nom des pièces « ombre seule » (ni usure, ni éclats quand l'objet se brise). */
export const SHADOW_ONLY = 'ombre-seule';

const shadowMats = new Map<THREE.Side, THREE.MeshBasicMaterial>();
/** Matériau des pièces « ombre seule » : seule sa face (avant, arrière, les deux) compte pour l'ombre. */
function shadowMaterial(side: THREE.Side): THREE.MeshBasicMaterial {
  let m = shadowMats.get(side);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side });
    shadowMats.set(side, m);
  }
  return m;
}

/** Pièces « ombre seule » de la scène : cachées, montrées le temps de dessiner les ombres. */
const ghosts = new Set<THREE.Mesh>();

/**
 * Les pièces « ombre seule » ne sont montrées que pendant le dessin des cartes d'ombre : three
 * a déjà trié les objets de l'image (sans elles) quand il dessine les ombres.
 */
export function shadowOnlyPass(renderer: THREE.WebGLRenderer): void {
  const shadows = renderer.shadowMap;
  const render = shadows.render.bind(shadows);
  shadows.render = (lights, scene, camera) => {
    for (const g of ghosts) g.visible = true;
    try {
      render(lights, scene, camera);
    } finally {
      for (const g of ghosts) g.visible = false;
    }
  };
}

const defaultRaycast = THREE.Mesh.prototype.raycast;
const defaultBeforeRender = THREE.Object3D.prototype.onBeforeRender;

/** Pièce fixe, sans rien de particulier : peut être fondue avec d'autres. */
function isPlain(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (mesh.constructor !== THREE.Mesh || mesh.name || !mesh.visible || mesh.children.length) return false;
  if (Array.isArray(mesh.material) || mesh.material.transparent) return false;
  if (mesh.raycast !== defaultRaycast || mesh.onBeforeRender !== defaultBeforeRender || !mesh.frustumCulled || mesh.renderOrder !== 0 || mesh.layers.mask !== 1) return false;
  if (Object.keys(mesh.userData).length) return false;
  const g = mesh.geometry;
  // (les groupes d'une géométrie ne servent qu'avec plusieurs matériaux : ignorés ici)
  if (Object.keys(g.morphAttributes).length || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (Object.values(g.attributes).some((a) => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)) return false;
  for (let p = mesh.parent; p && p !== root; p = p.parent) {
    if (p.name || !p.visible || p.layers.mask !== 1) return false;
  }
  return true;
}

/** Matériaux interchangeables : même rendu à l'écran (le liseré des persos est dans userData.rim). */
function materialKey(m: THREE.Material): string {
  const custom = m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
  const rim = m.userData.rim as string | undefined;
  const extra = Object.keys(m.userData).filter((k) => k !== 'rim');
  if (!(m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshBasicMaterial) || (custom && rim === undefined) || extra.length) return m.uuid;
  const t = m as THREE.MeshToonMaterial & THREE.MeshBasicMaterial & { flatShading?: boolean };
  return [
    m.type, t.color.getHexString(), t.map?.uuid, t.alphaMap?.uuid, t.gradientMap?.uuid, t.aoMap?.uuid, t.lightMap?.uuid,
    t.emissive?.getHexString(), t.emissiveIntensity, t.emissiveMap?.uuid, t.normalMap?.uuid, t.bumpMap?.uuid,
    m.side, m.shadowSide, m.opacity, m.alphaTest, m.blending, m.depthTest, m.depthWrite, m.colorWrite, m.vertexColors,
    t.flatShading, t.wireframe, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, t.fog, m.toneMapped,
    m.premultipliedAlpha, m.dithering, m.visible, m.customProgramCacheKey(), rim,
  ].join('|');
}

function geometryKey(g: THREE.BufferGeometry): string {
  const attrs = Object.entries(g.attributes).map(([n, a]) => `${n}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort();
  return `${attrs.join(',')}|${g.index ? 'i' : 'n'}`;
}

/** Position seule, indexée (les cartes d'ombre n'ont besoin de rien d'autre). */
function positionsOnly(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos = g.attributes.position;
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3).copy(pos as THREE.BufferAttribute));
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  out.setIndex(index);
  return out.applyMatrix4(m);
}

/** Oublie les pièces « ombre seule » de `root`, retiré de la scène (meuble rhabillé). */
export function forgetGhosts(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) ghosts.delete(o);
  });
}

/**
 * Regroupe les pièces fixes de `root` (le modèle d'un objet) : moins de dessins dans l'image et
 * dans les ombres, pour le même rendu.
 */
export function mergeStaticParts(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const all: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) all.push(o as THREE.Mesh);
  });
  const plain = all.filter((m) => isPlain(m, root));
  const plainSet = new Set(plain);
  // un matériau aussi porté par une pièce nommée (couleur de cuisson, lumière…) garde son identité
  const tied = new Set<THREE.Material>();
  for (const m of all) if (!plainSet.has(m)) for (const mat of [m.material].flat()) tied.add(mat);

  const rel = new Map<THREE.Mesh, THREE.Matrix4>();
  for (const m of plain) rel.set(m, new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
  // une pièce retournée (échelle négative) changerait de face visible une fois fondue : laissée telle quelle
  const parts = plain.filter((m) => rel.get(m)!.determinant() > 0);

  // ombres : toutes les pièces fixes qui en font, en une (ou deux, selon la face qui compte)
  const casters = new Map<THREE.Side, THREE.BufferGeometry[]>();
  const sphere = new THREE.Sphere();
  for (const m of parts) {
    if (!m.castShadow) continue;
    m.castShadow = false;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if (sphere.copy(m.geometry.boundingSphere!).applyMatrix4(rel.get(m)!).radius < SMALL_CASTER) continue;
    const mat = m.material as THREE.Material;
    const side = mat.shadowSide ?? mat.side;
    const list = casters.get(side) ?? [];
    list.push(positionsOnly(m.geometry, rel.get(m)!));
    casters.set(side, list);
  }
  for (const [side, list] of casters) {
    const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (!geo) continue;
    const ghost = new THREE.Mesh(geo, shadowMaterial(side));
    ghost.name = SHADOW_ONLY;
    ghost.castShadow = true;
    ghost.receiveShadow = false;
    ghost.visible = false;
    ghost.raycast = () => {};
    ghosts.add(ghost);
    root.add(ghost);
  }

  // image : une pièce par matériau identique
  const groups = new Map<string, THREE.Mesh[]>();
  for (const m of parts) {
    const mat = m.material as THREE.Material;
    const key = `${tied.has(mat) ? mat.uuid : materialKey(mat)}|${m.receiveShadow}|${geometryKey(m.geometry)}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map((m) => m.geometry.clone().applyMatrix4(rel.get(m)!)), false);
    if (!geo) continue;
    const first = list[0].material as THREE.Material;
    // des matériaux jumeaux deviennent un seul, propre à cet objet (l'usure le ternit pour lui seul)
    const material = list.every((m) => m.material === first) ? first : cloneMaterial(first);
    const one = new THREE.Mesh(geo, material);
    one.receiveShadow = list[0].receiveShadow;
    one.castShadow = false;
    for (const m of list) m.removeFromParent();
    root.add(one);
  }
}

function cloneMaterial(m: THREE.Material): THREE.Material {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}
