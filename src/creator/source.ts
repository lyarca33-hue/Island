/**
 * Source des animations : les clips du fichier « X Bot » (Mixamo : repos, marche, course, gestes),
 * extraits sans le mannequin par tools/build_anim_assets.py (400 ko au lieu de 2,9 Mo). Chargé
 * une fois, partagé par le créateur et le jeu.
 */
import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ANIM_URL = `${import.meta.env.BASE_URL}anim/mixamo.glb`;

let source: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> | null = null;

export function loadAnimationSource(): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  source ??= new GLTFLoader().loadAsync(ANIM_URL).then((g) => ({ scene: g.scene, clips: g.animations }));
  return source;
}

/**
 * S'asseoir, rester assis (avec ou sans parler), se relever : clips de la « Universal Animation
 * Library » de Quaternius (CC0), extraits par tools/build_anim_assets.py. null si le fichier manque.
 */
export const SIT_URL = `${import.meta.env.BASE_URL}anim/ual_sit.glb`;
let sit: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> | null = null;

export function loadSitAnimations(): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> {
  sit ??= new GLTFLoader()
    .loadAsync(SIT_URL)
    .then((g) => ({ scene: g.scene, clips: g.animations }))
    .catch(() => null);
  return sit;
}

/**
 * Poses du créateur (danser, bavarder, bras croisés...) et gestes de cuisine (tendre la main,
 * prendre sur la table, s'agenouiller, pousser) : autres clips de la même bibliothèque Quaternius
 * (CC0), un fichier par usage et par volume. Fichiers manquants ignorés.
 */
const POSE_URLS = ['ual_poses1.glb', 'ual_poses2.glb', 'ual_kitchen.glb'].map((f) => `${import.meta.env.BASE_URL}anim/${f}`);
let poses: Promise<Array<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>> | null = null;

export function loadPoseAnimations(): Promise<Array<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>> {
  poses ??= Promise.all(
    POSE_URLS.map((url) =>
      new GLTFLoader()
        .loadAsync(url)
        .then((g) => [{ scene: g.scene, clips: g.animations }])
        .catch(() => []),
    ),
  ).then((all) => all.flat());
  return poses;
}
