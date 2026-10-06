/**
 * Chargement des modèles VRM (bibliothèque @pixiv/three-vrm). Le fichier est téléchargé une
 * fois puis relu à chaque besoin : chaque perso du jeu a ainsi ses propres objets (os, maillages,
 * matériaux), qu'on peut découper et recombiner sans toucher aux autres.
 */
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelUrl } from './catalog';

const files = new Map<string, Promise<ArrayBuffer>>();

function fetchModel(id: string): Promise<ArrayBuffer> {
  let p = files.get(id);
  if (!p) {
    p = fetch(modelUrl(id)).then((r) => {
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
  const data = await fetchModel(id);
  const loader = new GLTFLoader();
  loader.register((parser) => {
    // images du fichier lues par <img> plutôt que par fetch() : certaines pages (aperçu
    // claude.ai) interdisent fetch() sur les adresses blob:, et les textures manquaient
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'rp_island_image_element' };
  });
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(data.slice(0), '');
  const vrm = gltf.userData.vrm as VRM;
  // VRM 0.x regarde vers -Z : demi-tour pour faire face à +Z comme X Bot
  VRMUtils.rotateVRM0(vrm);
  return vrm;
}
