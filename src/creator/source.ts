/**
 * Source des animations : le fichier « X Bot » (Mixamo) et ses clips (repos, marche, course,
 * gestes). Chargé une fois, partagé par le créateur et le jeu.
 */
import { VRMAnimationLoaderPlugin, type VRMAnimation } from '@pixiv/three-vrm-animation';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_URL } from '../game/character';

let source: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> | null = null;
let idle: Promise<VRMAnimation | null> | null = null;

/** Repos de pixiv (ChatVRM, licence MIT), fait pour les persos VRoid : voir CREDITS.md. */
export const IDLE_URL = `${import.meta.env.BASE_URL}anim/idle_loop.vrma`;

export function loadAnimationSource(): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  source ??= new GLTFLoader().loadAsync(CHARACTER_URL).then((g) => ({ scene: g.scene, clips: g.animations }));
  return source;
}

/** Repos de Quaternius (« Universal Animation Library », CC0), extraits par tools/build_anim_assets.py. */
export const UAL_URL = `${import.meta.env.BASE_URL}anim/ual_idle.glb`;
let ual: Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> | null = null;

export function loadUalAnimations(): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null> {
  ual ??= new GLTFLoader()
    .loadAsync(UAL_URL)
    .then((g) => ({ scene: g.scene, clips: g.animations }))
    .catch(() => null);
  return ual;
}

/** Animation de repos au format VRMA (null si le fichier manque : on garde celle d'X Bot). */
export function loadIdleAnimation(): Promise<VRMAnimation | null> {
  if (!idle) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    idle = loader
      .loadAsync(IDLE_URL)
      .then((g) => (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0] ?? null)
      .catch(() => null);
  }
  return idle;
}
