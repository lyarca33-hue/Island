/**
 * Source des animations : le fichier « X Bot » (Mixamo) et ses clips (repos, marche, course,
 * gestes). Chargé une fois, partagé par le créateur et le jeu.
 */
import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_URL } from '../game/character';

let source: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> | null = null;

export function loadAnimationSource(): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  source ??= new GLTFLoader().loadAsync(CHARACTER_URL).then((g) => ({ scene: g.scene, clips: g.animations }));
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
