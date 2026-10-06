/**
 * Reciblage des animations Mixamo (clips de « X Bot ») sur un perso VRM.
 *
 * Méthode de l'exemple officiel de three-vrm (loadMixamoAnimation) : les VRM ont un squelette
 * « normalisé » (tous les os sans rotation au repos, en T). Pour chaque os Mixamo, on ramène sa
 * rotation animée dans ce repère (repos du parent à gauche, inverse de son repos à droite) ; le
 * déplacement du bassin est mis à l'échelle de la hauteur du bassin du perso.
 */
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

/** Os Mixamo (noms du glTF, sans « : ») → os humanoïde VRM. */
const MIXAMO_TO_VRM: Record<string, VRMHumanBoneName> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

export interface AnimationSource {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

/** Repos de la source (pose du fichier), mémorisé avant toute lecture : le mixeur du jeu ne la touche pas. */
const restCache = new WeakMap<THREE.Object3D, Map<string, { world: THREE.Quaternion; parent: THREE.Quaternion; y: number }>>();

function sourceRest(scene: THREE.Object3D) {
  let rest = restCache.get(scene);
  if (!rest) {
    rest = new Map();
    scene.updateMatrixWorld(true);
    for (const name of Object.keys(MIXAMO_TO_VRM)) {
      const node = scene.getObjectByName(name);
      if (!node?.parent) continue;
      rest.set(name, {
        world: node.getWorldQuaternion(new THREE.Quaternion()),
        parent: node.parent.getWorldQuaternion(new THREE.Quaternion()),
        y: node.position.y,
      });
    }
    restCache.set(scene, rest);
  }
  return rest;
}

/** Hauteur du bassin (repos, m) d'un VRM, mesurée sur son squelette normalisé. */
export function hipsHeight(vrm: VRM): number {
  vrm.scene.updateMatrixWorld(true);
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');
  if (!hips) return 0.9;
  return hips.getWorldPosition(new THREE.Vector3()).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y;
}

export function retargetClips(src: AnimationSource, vrm: VRM): THREE.AnimationClip[] {
  const rest = sourceRest(src.scene);
  const motionHips = rest.get('mixamorigHips')?.y ?? 1;
  const scale = hipsHeight(vrm) / motionHips;
  const v0 = vrm.meta.metaVersion === '0';
  const q = new THREE.Quaternion();
  return src.clips.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const [bone, prop] = track.name.split('.');
      const vrmBone = MIXAMO_TO_VRM[bone];
      const node = vrmBone && vrm.humanoid.getNormalizedBoneNode(vrmBone);
      const r = rest.get(bone);
      if (!node || !r) continue;
      if (prop === 'quaternion') {
        const values = new Float32Array(track.values.length);
        for (let i = 0; i < values.length; i += 4) {
          q.fromArray(track.values, i).premultiply(r.parent).multiply(q.clone().copy(r.world).invert());
          q.toArray(values, i);
          // VRM 0.x tourné d'un demi-tour : on retourne les axes X et Z
          if (v0) {
            values[i] = -values[i];
            values[i + 2] = -values[i + 2];
          }
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, track.times, values));
      } else if (prop === 'position' && vrmBone === 'hips') {
        const values = new Float32Array(track.values.length);
        for (let i = 0; i < values.length; i++) values[i] = (v0 && i % 3 !== 1 ? -track.values[i] : track.values[i]) * scale;
        tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, track.times, values));
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}
