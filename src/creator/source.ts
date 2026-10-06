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
