/**
 * Vignettes des objets pour l'inventaire à cases : chaque objet rendu en petit, vu de trois quarts
 * devant, sur fond transparent, à partir de son modèle (celui du jeu, habillé Tripo s'il l'est). Une
 * vignette par sorte d'objet, faite à la première demande puis retenue.
 * Aussi celles du panneau « Modèles » de la carte de test (modelesCatalogue.ts) : objets du jeu et
 * décor des packs. Celles-là attendent leur tour (une toutes les ~16 ms, et le pack chargé) ; on est
 * prévenu quand elles arrivent (onIcons).
 */
import * as THREE from 'three';
import type { ModeleEntry } from '../modelesCatalogue';
import { loadPack, packModel, packReady } from '../packs/assets';
import type { ModelName } from '../packs/manifest';
import type { ItemDef } from './catalog';
import { WorldItem } from './carry';

/** Taille d'une vignette (px). */
const SIZE = 96;
/** Écart entre deux vignettes dessinées depuis la file (ms) : une par image, sans figer la page. */
const PAS = 16;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
/** Vignettes faites, par clé de modèle (`objet:<id>`, `pack:<pack>/<modèle>`) ; null : pas dessinable. */
const cache = new Map<string, string | null>();
/** File d'attente : clé, et de quoi bâtir le modèle. */
const file: Array<{ key: string; build: () => THREE.Object3D }> = [];
/** Clés demandées pas encore faites (dans la file, ou leur pack en chargement). */
const attendues = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Vignette de l'objet de fiche `def` (image en data URL), ou null si on ne peut pas dessiner. */
export function itemIcon(def: ItemDef): string | null {
  const key = `objet:${def.id}`;
  if (cache.has(key)) return cache.get(key)!;
  const url = drawSafe(key, () => new WorldItem(def).object);
  cache.set(key, url);
  return url;
}

/**
 * Vignette d'un modèle du catalogue : l'image (data URL), null si on ne peut pas la dessiner (pack
 * manquant, modèle vide), undefined si elle est en route (onIcons prévient quand elle est prête).
 */
export function modeleIcon(e: ModeleEntry): string | null | undefined {
  if (cache.has(e.key)) return cache.get(e.key)!;
  if (attendues.has(e.key)) return undefined;
  attendues.add(e.key);
  if (e.kind === 'objet') {
    const def = e.def!;
    queue(e.key, () => new WorldItem(def).object);
    return undefined;
  }
  const pack = e.pack!;
  const name = e.model as ModelName<typeof pack>;
  const build = () => packModel(pack, name, { scale: e.scale });
  if (packReady(pack)) queue(e.key, build);
  else
    void loadPack(pack).then(() => {
      if (packReady(pack)) queue(e.key, build);
      else done(e.key, null); // le pack n'a pas pu se charger : modèle indisponible
    });
  return undefined;
}

/** Prévient `fn` quand des vignettes en attente sont prêtes (ou oubliées) ; rend de quoi arrêter. */
export function onIcons(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Oublie les vignettes des objets (les modèles Tripo viennent d'arriver : on les refera avec eux). */
export function forgetIcons(): void {
  for (const key of [...cache.keys()]) if (key.startsWith('objet:')) cache.delete(key);
  notify();
}

function notify(): void {
  for (const fn of listeners) fn();
}

function done(key: string, url: string | null): void {
  attendues.delete(key);
  cache.set(key, url);
  notify();
}

function queue(key: string, build: () => THREE.Object3D): void {
  file.push({ key, build });
  if (!timer) timer = setTimeout(pump, PAS);
}

/** Dessine la prochaine vignette de la file, puis repasse plus tard s'il en reste. */
function pump(): void {
  timer = null;
  const job = file.shift();
  if (!job) return;
  done(job.key, drawSafe(job.key, job.build));
  if (file.length) timer = setTimeout(pump, PAS);
}

function drawSafe(key: string, build: () => THREE.Object3D): string | null {
  try {
    return drawRoot(build());
  } catch (e) {
    console.warn(`vignette de ${key} non faite`, e);
    return null;
  }
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

/** Rend `root` (l'objet tel qu'il est posé au départ, hors du monde), cadré sur sa sphère englobante. */
function drawRoot(root: THREE.Object3D): string | null {
  const ctx = setup();
  if (!ctx) return null;
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
