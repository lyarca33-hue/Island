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
export const MIXAMO_TO_VRM: Record<string, VRMHumanBoneName> = {
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

/** Os du squelette Quaternius (« Universal Animation Library », façon Unreal) → os VRM. */
export const UAL_TO_VRM: Record<string, VRMHumanBoneName> = (() => {
  const map: Record<string, VRMHumanBoneName> = {
    pelvis: 'hips',
    spine_01: 'spine',
    spine_02: 'chest',
    spine_03: 'upperChest',
    neck_01: 'neck',
    Head: 'head',
  };
  const fingers: Array<[string, string]> = [
    ['index', 'Index'],
    ['middle', 'Middle'],
    ['ring', 'Ring'],
    ['pinky', 'Little'],
  ];
  for (const [s, side] of [
    ['l', 'left'],
    ['r', 'right'],
  ] as const) {
    const add = (from: string, to: string) => (map[`${from}_${s}`] = `${side}${to}` as VRMHumanBoneName);
    add('clavicle', 'Shoulder');
    add('upperarm', 'UpperArm');
    add('lowerarm', 'LowerArm');
    add('hand', 'Hand');
    add('thigh', 'UpperLeg');
    add('calf', 'LowerLeg');
    add('foot', 'Foot');
    add('ball', 'Toes');
    for (const [f, F] of fingers) {
      add(`${f}_01`, `${F}Proximal`);
      add(`${f}_02`, `${F}Intermediate`);
      add(`${f}_03`, `${F}Distal`);
    }
    add('thumb_01', 'ThumbMetacarpal');
    add('thumb_02', 'ThumbProximal');
    add('thumb_03', 'ThumbDistal');
  }
  return map;
})();

export interface AnimationSource {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Noms des os de la source → os VRM (Mixamo par défaut). */
  bones?: Record<string, VRMHumanBoneName>;
  /** Petites corrections (degrés, XYZ, repère VRM normalisé) ajoutées aux os gauches, en miroir à droite. */
  adjust?: Partial<Record<string, [number, number, number]>>;
}

function adjustment(src: AnimationSource, bone: VRMHumanBoneName): THREE.Quaternion | null {
  const right = bone.startsWith('right');
  const e = src.adjust?.[right ? `left${bone.slice(5)}` : bone];
  if (!e) return null;
  const d = THREE.MathUtils.degToRad;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(d(e[0]), d(right ? -e[1] : e[1]), d(right ? -e[2] : e[2])));
}

/** Repos de la source (pose du fichier), mémorisé avant toute lecture : le mixeur du jeu ne la touche pas. */
const restCache = new WeakMap<THREE.Object3D, Map<string, { world: THREE.Quaternion; parent: THREE.Quaternion; pos: THREE.Vector3 }>>();

function sourceRest(scene: THREE.Object3D, bones: Record<string, VRMHumanBoneName>) {
  let rest = restCache.get(scene);
  if (!rest) {
    rest = new Map();
    scene.updateMatrixWorld(true);
    for (const name of Object.keys(bones)) {
      const node = scene.getObjectByName(name);
      if (!node?.parent) continue;
      rest.set(name, {
        world: node.getWorldQuaternion(new THREE.Quaternion()),
        parent: node.parent.getWorldQuaternion(new THREE.Quaternion()),
        // position dans le repère du parent ramenée à la verticale du monde (squelettes « Z en haut »)
        pos: node.position.clone().applyQuaternion(node.parent.getWorldQuaternion(new THREE.Quaternion())),
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
  const bones = src.bones ?? MIXAMO_TO_VRM;
  const rest = sourceRest(src.scene, bones);
  const hipsName = Object.keys(bones).find((k) => bones[k] === 'hips')!;
  const hipsRest = rest.get(hipsName)?.pos ?? new THREE.Vector3(0, 1, 0);
  const motionHips = hipsRest.y;
  const scale = hipsHeight(vrm) / motionHips;
  const v0 = vrm.meta.metaVersion === '0';
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  return src.clips.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const [bone, prop] = track.name.split('.');
      const vrmBone = bones[bone];
      const node = vrmBone && vrm.humanoid.getNormalizedBoneNode(vrmBone);
      const r = rest.get(bone);
      if (!node || !r) continue;
      if (prop === 'quaternion') {
        const values = new Float32Array(track.values.length);
        const fix = adjustment(src, vrmBone);
        for (let i = 0; i < values.length; i += 4) {
          q.fromArray(track.values, i).premultiply(r.parent).multiply(q.clone().copy(r.world).invert());
          if (fix) q.multiply(fix);
          q.toArray(values, i);
          // VRM 0.x tourné d'un demi-tour : on retourne les axes X et Z
          if (v0) {
            values[i] = -values[i];
            values[i + 2] = -values[i + 2];
          }
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, track.times, values));
      } else if (prop === 'position' && vrmBone === 'hips') {
        // hauteur absolue, déplacements horizontaux comptés depuis le repos ; à l'échelle du perso
        const values = new Float32Array(track.values.length);
        for (let i = 0; i < values.length; i += 3) {
          v.fromArray(track.values, i).applyQuaternion(r.parent);
          v.x -= hipsRest.x;
          v.z -= hipsRest.z;
          v.multiplyScalar(scale);
          if (v0) v.set(-v.x, v.y, -v.z);
          v.toArray(values, i);
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, track.times, values));
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}
