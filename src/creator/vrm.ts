/**
 * Chargement des modèles VRM (bibliothèque @pixiv/three-vrm). Le fichier est téléchargé une
 * fois puis relu à chaque besoin : chaque perso du jeu a ainsi ses propres objets (os, maillages,
 * matériaux), qu'on peut découper et recombiner sans toucher aux autres.
 */
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { modelUrl } from './catalog';
import { importedData, isImportedId, MAX_IMPORT_MB, storeImported, type ImportedModel } from './imported';

const files = new Map<string, Promise<ArrayBuffer>>();

function fetchModel(id: string): Promise<ArrayBuffer> {
  let p = files.get(id);
  if (!p) {
    p = isImportedId(id)
      ? importedData(id).then((d) => {
          if (!d) throw new Error(`perso importé ${id} absent de cet appareil`);
          return d;
        })
      : fetch(modelUrl(id)).then((r) => {
          if (!r.ok) throw new Error(`modèle ${id} : HTTP ${r.status}`);
          return r.arrayBuffer();
        });
    p.catch(() => files.delete(id));
    files.set(id, p);
  }
  return p;
}

/** Télécharge un modèle à l'avance (aperçus du créateur). */
export function prefetchModel(id: string): void {
  void fetchModel(id);
}

/** Nouvelle copie du modèle `id`, tournée face à +Z comme les persos du jeu. */
export async function loadVrm(id: string): Promise<VRM> {
  const vrm = await parseVrm(await fetchModel(id));
  // fichiers du joueur : textures parfois énormes (4096 ou 8192 px), réduites pour garder les FPS
  if (isImportedId(id)) capTextures(vrm.scene, MAX_TEXTURE);
  return vrm;
}

async function parseVrm(data: ArrayBuffer): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => {
    // images du fichier lues par <img> plutôt que par fetch() : certaines pages (aperçu
    // claude.ai) interdisent fetch() sur les adresses blob:, et les textures manquaient
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'rp_island_image_element' };
  });
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(data.slice(0), '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error('pas un modèle VRM');
  nameMorphTargets(gltf.scene, gltf.parser);
  // VRM 0.x regarde vers -Z : demi-tour pour faire face à +Z comme X Bot
  VRMUtils.rotateVRM0(vrm);
  return vrm;
}

/**
 * Noms des formes du visage (Fcl_EYE_Close...) : VRoid les range dans les « extras » de chaque
 * primitive, que GLTFLoader ne lit pas (il ne regarde que ceux du maillage). On les ajoute au
 * dictionnaire des formes, à côté des numéros.
 */
function nameMorphTargets(scene: THREE.Object3D, parser: GLTFParser): void {
  const meshesJson = (parser.json as { meshes?: Array<{ primitives: Array<{ extras?: { targetNames?: string[] } }> }> }).meshes ?? [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.morphTargetDictionary) return;
    const a = parser.associations.get(m) as { meshes?: number; primitives?: number } | undefined;
    if (a?.meshes === undefined) return;
    const prims = meshesJson[a.meshes]?.primitives ?? [];
    const names = prims[a.primitives ?? 0]?.extras?.targetNames ?? prims[0]?.extras?.targetNames;
    names?.forEach((n, i) => {
      if (m.morphTargetDictionary![n] === undefined) m.morphTargetDictionary![n] = i;
    });
  });
}

/** Côté maximal des textures d'un perso importé (celles des modèles du créateur font 2048). */
const MAX_TEXTURE = 2048;

function capTextures(root: THREE.Object3D, max: number): void {
  const done = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(mat)) {
        const tex = v as THREE.Texture | null;
        if (!tex?.isTexture || done.has(tex)) continue;
        done.add(tex);
        const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
        if (!img?.width || Math.max(img.width, img.height) <= max) continue;
        const k = max / Math.max(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * k);
        canvas.height = Math.round(img.height * k);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        tex.image = canvas;
        tex.needsUpdate = true;
      }
    }
  });
}

/** Vignette carrée (adresse data:) tirée de l'image d'aperçu du fichier, si elle existe. */
function thumbnailOf(vrm: VRM): string | null {
  const meta = vrm.meta as { thumbnailImage?: HTMLImageElement; texture?: THREE.Texture };
  const img = (meta.thumbnailImage ?? meta.texture?.image) as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img?.width) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const side = Math.min(img.width, img.height);
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
  try {
    return canvas.toDataURL('image/webp', 0.85);
  } catch {
    return null;
  }
}

/**
 * Importe un fichier .vrm choisi par le joueur : vérifié (modèle humanoïde lisible), puis gardé
 * sur l'appareil. Lève une erreur en français si le fichier ne convient pas.
 */
export async function importVrmFile(file: File): Promise<ImportedModel> {
  if (file.size > MAX_IMPORT_MB * 1024 * 1024) throw new Error(`Fichier trop gros (plus de ${MAX_IMPORT_MB} Mo).`);
  const data = await file.arrayBuffer();
  let vrm: VRM;
  try {
    vrm = await parseVrm(data);
  } catch {
    throw new Error('Ce fichier n’est pas un perso VRM lisible (export .vrm de VRoid Studio).');
  }
  const h = vrm.humanoid;
  if (!h.getNormalizedBoneNode('hips') || !h.getNormalizedBoneNode('head') || !h.getNormalizedBoneNode('leftUpperLeg')) {
    VRMUtils.deepDispose(vrm.scene);
    throw new Error('Ce modèle n’a pas de squelette humain complet : les animations ne pourraient pas le faire bouger.');
  }
  const meta = vrm.meta as { name?: string; title?: string };
  const label = (meta.name || meta.title || file.name.replace(/\.vrm$/i, '')).trim();
  const thumb = thumbnailOf(vrm);
  VRMUtils.deepDispose(vrm.scene);
  return storeImported(data, label, thumb);
}
