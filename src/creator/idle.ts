/**
 * Animation de repos écrite pour les persos VRM (remplace le « idle » d'X Bot, raide et jambes
 * écartées) : poids sur la jambe gauche, genou droit relâché, bras le long du corps, coudes et
 * doigts détendus, respiration, léger balancement et petits mouvements de tête. Boucle de 8 s.
 *
 * Angles en degrés (ordre XYZ), dans le repère du squelette VRM normalisé : perso face à +Z,
 * bras gauche vers +X, os sans rotation au repos (pose en T). Le côté droit est le miroir du
 * gauche ; les VRM 0.x sont retournés comme dans le reciblage.
 */
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

const PERIOD = 8;
const FPS = 15;

type Euler3 = [number, number, number];
type Pose = Partial<Record<VRMHumanBoneName, Euler3>>;

/** Doigts du côté gauche : flexion (Z négatif = vers la paume), de l'index à l'auriculaire. */
const FINGERS: Array<[string, number]> = [
  ['Index', 14],
  ['Middle', 18],
  ['Ring', 22],
  ['Little', 26],
];

function side(pose: Pose, s: 'left' | 'right', bone: string, e: Euler3): void {
  const [x, y, z] = e;
  pose[`${s}${bone}` as VRMHumanBoneName] = s === 'left' ? [x, y, z] : [x, -y, -z];
}

/** Pose à l'instant t (s) : angles par os et décalage du bassin (m). */
function poseAt(t: number): { pose: Pose; hips: THREE.Vector3 } {
  const a = (t / PERIOD) * Math.PI * 2;
  const breath = Math.sin(2 * a); // une respiration toutes les 4 s
  const sway = Math.sin(a); // balancement d'une jambe à l'autre
  const look = Math.sin(a + 1.2);
  const pose: Pose = {};

  // bassin : poids sur la jambe gauche (hanche gauche haute), léger quart de tour
  pose.hips = [0, -4, 2.5 + 0.6 * sway];
  pose.spine = [-1, 1.5, -1.8 - 0.4 * sway];
  pose.chest = [-0.8 * breath, 1, -1.2 - 0.2 * sway];
  pose.upperChest = [-0.5 * breath, 0.5, -0.4];
  pose.neck = [2, 1, 0.5];
  pose.head = [1.5 + 0.8 * Math.sin(2 * a + 0.5), 4 + 3 * look, 2.5 + 0.5 * sway];

  // bras : le long du corps, un peu en avant, coudes pliés ; les épaules suivent la respiration
  for (const s of ['left', 'right'] as const) {
    const r = s === 'right';
    side(pose, s, 'Shoulder', [0, 0, -3 + 0.8 * breath]);
    side(pose, s, 'UpperArm', [r ? -7 : -4, r ? 6 : 2, -77 - 0.8 * breath + (r ? -0.6 : 0.6) * sway]);
    side(pose, s, 'LowerArm', [22, r ? -12 : -8, -8]);
    side(pose, s, 'Hand', [0, 0, -4]);
    FINGERS.forEach(([f, k], i) => {
      side(pose, s, `${f}Proximal`, [0, (i - 1.5) * 2, -k]);
      side(pose, s, `${f}Intermediate`, [0, 0, -k - 10]);
      side(pose, s, `${f}Distal`, [0, 0, -k * 0.6]);
    });
    side(pose, s, 'ThumbMetacarpal', [18, 20, 0]);
    side(pose, s, 'ThumbProximal', [0, 12, 0]);
    side(pose, s, 'ThumbDistal', [0, 14, 0]);
  }

  // jambes : la gauche porte (droite, compense le bassin) ; la droite est relâchée, genou en avant
  const roll = 2.5 + 0.6 * sway;
  pose.leftUpperLeg = [0, 0, -roll + 1];
  pose.leftFoot = [0, 0, -1];
  pose.rightUpperLeg = [-8, -8, -roll - 3];
  pose.rightLowerLeg = [14, 0, 0];
  pose.rightFoot = [-4, 0, 3];

  const hips = new THREE.Vector3(0.012 + 0.006 * sway, -0.004, 0);
  return { pose, hips };
}

/** Clip « idle » pour ce VRM (pistes nommées comme celles du reciblage). */
export function idleClip(vrm: VRM): THREE.AnimationClip {
  const v0 = vrm.meta.metaVersion === '0';
  const n = PERIOD * FPS + 1;
  const times = Float32Array.from({ length: n }, (_, i) => i / FPS);
  const quats = new Map<VRMHumanBoneName, Float32Array>();
  const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
  const hipsRest = hipsNode?.position.clone() ?? new THREE.Vector3();
  const hipsPos = new Float32Array(n * 3);
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const d = THREE.MathUtils.degToRad;
  for (let i = 0; i < n; i++) {
    const { pose, hips } = poseAt(times[i]);
    for (const [bone, [x, y, z]] of Object.entries(pose) as Array<[VRMHumanBoneName, Euler3]>) {
      let arr = quats.get(bone);
      if (!arr) quats.set(bone, (arr = new Float32Array(n * 4)));
      q.setFromEuler(e.set(d(x), d(y), d(z), 'XYZ'));
      // VRM 0.x tourné d'un demi-tour : axes X et Z retournés
      if (v0) q.set(-q.x, q.y, -q.z, q.w);
      q.toArray(arr, i * 4);
    }
    if (v0) hips.set(-hips.x, hips.y, -hips.z);
    hips.add(hipsRest).toArray(hipsPos, i * 3);
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, values] of quats) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);
    if (node) tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
  }
  if (hipsNode) tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, hipsPos));
  return new THREE.AnimationClip('idle', PERIOD, tracks);
}
