/**
 * Vignettes des objets pour l'inventaire à cases : chaque objet rendu en petit, vu de trois quarts
 * devant, sur fond transparent, à partir de son modèle (celui du jeu, habillé Tripo s'il l'est). Une
 * vignette par sorte d'objet, faite à la première demande puis retenue.
 */
import * as THREE from 'three';
import type { ItemDef } from './catalog';
import { WorldItem } from './carry';

/** Taille d'une vignette (px). */
const SIZE = 96;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
const cache = new Map<string, string | null>();

/** Vignette de l'objet de fiche `def` (image en data URL), ou null si on ne peut pas dessiner. */
export function itemIcon(def: ItemDef): string | null {
  if (cache.has(def.id)) return cache.get(def.id)!;
  let url: string | null = null;
  try {
    url = draw(def);
  } catch (e) {
    console.warn(`vignette de ${def.id} non faite`, e);
  }
  cache.set(def.id, url);
  return url;
}

/** Oublie les vignettes (les modèles Tripo viennent d'arriver : on les refera avec eux). */
export function forgetIcons(): void {
  cache.clear();
}

function setup(): { r: THREE.WebGLRenderer; s: THREE.Scene } | null {
  if (typeof document === 'undefined') return null;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(1.5, 3, 2.5);
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x6a5a48, 1.4), sun);
  }
  return { r: renderer, s: scene! };
}

function draw(def: ItemDef): string | null {
  const ctx = setup();
  if (!ctx) return null;
  // l'objet tel qu'il est posé au départ (vide, propre), sans être ajouté au monde
  const item = new WorldItem(def);
  const root = item.object;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = new THREE.Vector3(0.75, 0.6, 1.3).normalize();
  const dist = (sphere.radius * 1.08) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = dist / 20;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);
  ctx.s.add(root);
  try {
    ctx.r.render(ctx.s, camera);
    return ctx.r.domElement.toDataURL('image/png');
  } finally {
    ctx.s.remove(root);
  }
}
