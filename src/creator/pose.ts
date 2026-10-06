/**
 * Retouches de pose ajoutées par-dessus les animations Mixamo : coudes un peu pliés, poignets
 * et doigts détendus, épaules basses. Les clips d'X Bot ont les bras et les mains raides ; ces
 * petites rotations rendent la marche et les gestes plus naturels (le repos a sa propre
 * animation VRMA, voir source.ts).
 *
 * Angles en degrés, dans le repère du squelette VRM normalisé (perso face à +Z, bras gauche
 * vers +X) ; le côté droit est le miroir du gauche.
 */
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

type Side = 'left' | 'right';
/** [os (sans « left/right »), axe, angle du côté gauche] */
const SIDED: Array<[string, [number, number, number], number]> = [
  ['Shoulder', [0, 0, 1], -4],
  ['UpperArm', [0, 0, 1], 5],
  ['LowerArm', [1, 0, 0], 25],
  ['Hand', [0, 0, 1], -8],
  ['IndexProximal', [0, 0, 1], -12],
  ['IndexIntermediate', [0, 0, 1], -14],
  ['MiddleProximal', [0, 0, 1], -16],
  ['MiddleIntermediate', [0, 0, 1], -18],
  ['RingProximal', [0, 0, 1], -20],
  ['RingIntermediate', [0, 0, 1], -22],
  ['LittleProximal', [0, 0, 1], -24],
  ['LittleIntermediate', [0, 0, 1], -26],
  ['ThumbProximal', [0, 1, 0], -10],
  // jambes un peu resserrées (X Bot se tient très écarté)
  ['UpperLeg', [0, 0, 1], -3],
  ['Foot', [0, 0, 1], 3],
];

/** Retouches d'un seul côté : poids sur la jambe gauche, genou droit relâché, tête penchée. */
const SINGLE: Array<[VRMHumanBoneName, [number, number, number], number]> = [
  ['rightUpperLeg', [1, 0, 0], -6],
  ['rightLowerLeg', [1, 0, 0], 11],
  ['rightFoot', [1, 0, 0], -5],
  ['hips', [0, 0, 1], 2],
  ['spine', [0, 0, 1], -2.5],
  ['head', [0, 0, 1], 3],
];

export class PoseLayer {
  private items: Array<{ node: THREE.Object3D; q: THREE.Quaternion; now: THREE.Quaternion }> = [];
  private static readonly ID = new THREE.Quaternion();

  constructor(vrm: VRM, strength = 1) {
    const v0 = vrm.meta.metaVersion === '0';
    for (const side of ['left', 'right'] as Side[]) {
      for (const [bone, axis, deg] of SIDED) {
        const name = `${side}${bone}` as VRMHumanBoneName;
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) continue;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), THREE.MathUtils.degToRad(deg * strength));
        // miroir gauche -> droite (plan YZ), puis demi-tour des VRM 0.x (comme le reciblage)
        if (side === 'right') q.set(q.x, -q.y, -q.z, q.w);
        if (v0) q.set(-q.x, q.y, -q.z, q.w);
        this.items.push({ node, q, now: new THREE.Quaternion() });
      }
    }
    this.addSingle(vrm, strength, v0);
  }

  private addSingle(vrm: VRM, strength: number, v0: boolean): void {
    for (const [name, axis, deg] of SINGLE) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), THREE.MathUtils.degToRad(deg * strength));
      if (v0) q.set(-q.x, q.y, -q.z, q.w);
      this.items.push({ node, q, now: new THREE.Quaternion() });
    }
  }

  /**
   * À appeler après le mixeur, avant la mise à jour du VRM. `weight` : part des clips Mixamo
   * dans la pose (le repos VRMA n'a pas besoin de ces retouches).
   */
  apply(weight = 1): void {
    for (const { node, q, now } of this.items) node.quaternion.multiply(now.slerpQuaternions(PoseLayer.ID, q, weight));
  }

  /** Après la mise à jour du VRM : retire les retouches (un os sans piste ne doit pas tourner en boucle). */
  restore(): void {
    for (const { node, now } of this.items) node.quaternion.multiply(now.invert());
  }
}
