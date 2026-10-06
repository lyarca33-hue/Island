/**
 * Bras du repos : remplace les bras raides du « idle » d'X Bot par une position choisie, le
 * reste du corps (jambes, buste, tête) garde l'animation Mixamo.
 *
 * Angles en degrés (ordre XYZ), dans le repère du squelette VRM normalisé : perso face à +Z,
 * bras gauche vers +X, os sans rotation au repos (pose en T). Le côté droit est le miroir du
 * gauche ; les VRM 0.x sont retournés comme dans le reciblage.
 */
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

/** [x, y, z] (ordre XYZ), et en option une torsion autour de l'os, appliquée en premier. */
type Euler3 = [number, number, number] | [number, number, number, number];
type ArmPose = Record<string, Euler3>;

const FINGERS: Array<[string, number]> = [
  ['Index', 14],
  ['Middle', 18],
  ['Ring', 22],
  ['Little', 26],
];

function relaxedFingers(extra = 0): ArmPose {
  const p: ArmPose = {};
  FINGERS.forEach(([f, k], i) => {
    p[`${f}Proximal`] = [0, (i - 1.5) * 2, -k - extra];
    p[`${f}Intermediate`] = [0, 0, -k - 10 - extra];
    p[`${f}Distal`] = [0, 0, -k * 0.6];
  });
  p.ThumbMetacarpal = [18, 20, 0];
  p.ThumbProximal = [0, 12, 0];
  p.ThumbDistal = [0, 14, 0];
  return p;
}

export const ARM_POSES: Record<string, ArmPose> = {
  /** le long du corps, coudes à peine pliés, paumes vers les cuisses */
  side: {
    Shoulder: [0, 0, -3],
    UpperArm: [-4, 2, -77],
    LowerArm: [22, -8, -8],
    Hand: [0, 0, -4],
    ...relaxedFingers(),
  },
  /** mains posées l'une sur l'autre devant le ventre */
  front: {
    Shoulder: [0, 0, -2],
    UpperArm: [-14, 0, -74, 50],
    LowerArm: [0, -72, 0],
    Hand: [0, 10, -10],
    ...relaxedFingers(4),
  },
  /** mains jointes dans le dos */
  back: {
    Shoulder: [0, 0, -4],
    UpperArm: [12, 0, -78, 100],
    LowerArm: [0, -55, 0],
    Hand: [0, 0, -10],
    ...relaxedFingers(4),
  },
};

/** Position des bras au repos (clé de ARM_POSES). */
export const ARM_POSE = 'front';

/** Pistes des bras (pour un clip de PERIOD s), nommées comme celles du reciblage. */
export function armTracks(vrm: VRM, duration: number, pose = ARM_POSES[ARM_POSE]): THREE.KeyframeTrack[] {
  const v0 = vrm.meta.metaVersion === '0';
  const n = Math.max(2, Math.round(duration * 10) + 1);
  const times = Float32Array.from({ length: n }, (_, i) => (i / (n - 1)) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const tw = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const d = THREE.MathUtils.degToRad;
  for (const side of ['left', 'right'] as const) {
    for (const [bone, [x, y, z, twist = 0]] of Object.entries(pose)) {
      const node = vrm.humanoid.getNormalizedBoneNode(`${side}${bone}` as VRMHumanBoneName);
      if (!node) continue;
      const values = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        // respiration : les épaules montent un peu, le bras compense
        const b = Math.sin((times[i] / duration) * Math.PI * 2);
        const k = bone === 'Shoulder' ? 0.8 * b : bone === 'UpperArm' ? -0.8 * b : 0;
        q.setFromEuler(e.set(d(x), d(side === 'left' ? y : -y), d((side === 'left' ? 1 : -1) * (z + k)), 'XYZ'));
        q.multiply(tw.setFromAxisAngle(X, d(twist)));
        if (v0) q.set(-q.x, q.y, -q.z, q.w);
        q.toArray(values, i * 4);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
    }
  }
  return tracks;
}

/** Os des bras (épaules, bras, mains, doigts) pour ce VRM : noms des nœuds normalisés. */
export function armNodeNames(vrm: VRM): Set<string> {
  const names = new Set<string>();
  for (const side of ['left', 'right'] as const) {
    for (const bone of Object.keys(ARM_POSES.side)) {
      const node = vrm.humanoid.getNormalizedBoneNode(`${side}${bone}` as VRMHumanBoneName);
      if (node) names.add(node.name);
    }
  }
  return names;
}
