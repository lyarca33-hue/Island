/**
 * Outils de pose pour tenir des objets : calcul d'un bras (ou d'une jambe) à deux os qui amène
 * la main (le pied) sur un point voulu, et passage entre le repère du jeu et les os VRM.
 *
 * « Repère canonique » : celui du squelette VRM normalisé d'un perso face à +Z, au repos en T
 * (bras gauche vers +X, paume vers le bas). Les modèles VRM 0.x sont tournés d'un demi-tour
 * (VRMUtils.rotateVRM0) : leurs os normalisés portent ce demi-tour, qu'on retire ici, pour que
 * tous les persos s'animent avec les mêmes chiffres.
 */
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';

const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const IDENTITY = new THREE.Quaternion();

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Rig {
  /** Demi-tour des VRM 0.x (identité sinon). */
  readonly k: THREE.Quaternion;
  readonly kInv: THREE.Quaternion;

  constructor(readonly vrm: VRM) {
    this.k = vrm.meta.metaVersion === '0' ? HALF_TURN.clone() : IDENTITY.clone();
    this.kInv = this.k.clone().invert();
  }

  node(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  raw(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid.getRawBoneNode(name);
  }

  /** Orientation monde d'un os, dans le repère canonique. */
  worldRot(node: THREE.Object3D, out = new THREE.Quaternion()): THREE.Quaternion {
    return node.getWorldQuaternion(out).multiply(this.k);
  }

  worldPos(node: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
    return node.getWorldPosition(out);
  }

  /** Donne à `node` l'orientation monde canonique `rot` (son parent restant tel quel). */
  setWorldRot(node: THREE.Object3D, rot: THREE.Quaternion): void {
    node.parent!.getWorldQuaternion(_q).invert();
    node.quaternion.copy(_q).multiply(rot).multiply(this.kInv);
    node.updateMatrixWorld(true);
  }

  /** Rotation locale exprimée dans le repère canonique → rotation de l'os normalisé. */
  local(q: THREE.Quaternion): THREE.Quaternion {
    return q.premultiply(this.k).multiply(this.kInv);
  }
}

/**
 * Orientation qui envoie deux axes de repos (`restA`, puis `restB` rendu perpendiculaire) sur
 * deux axes voulus (`a`, `b`).
 */
export function basisRotation(restA: THREE.Vector3, restB: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const from = frame(restA, restB, new THREE.Matrix4());
  const to = frame(a, b, _m);
  return out.setFromRotationMatrix(to.multiply(from.transpose()));
}

function frame(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  const x = _a.copy(a).normalize();
  const y = _b.copy(b).addScaledVector(x, -b.dot(x)).normalize();
  const z = _c.crossVectors(x, y);
  return out.makeBasis(x, y, z);
}

/**
 * Bras (ou jambe) à deux os : place l'os du haut et l'os du milieu pour que le bout atteigne
 * `target` (ou s'en approche bras tendu), le coude partant vers `pole`.
 *
 * `restDir` : direction de l'os du haut au repos (canonique) ; `restHinge` : axe autour duquel
 * le coude plie au repos. Renvoie la position atteinte par le bout.
 */
export function solveTwoBone(
  rig: Rig,
  upper: THREE.Object3D,
  middle: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  restDir: THREE.Vector3,
  restHinge: THREE.Vector3,
): void {
  const s = rig.worldPos(upper);
  const e = rig.worldPos(middle);
  const w = rig.worldPos(end);
  const la = s.distanceTo(e);
  const lb = e.distanceTo(w);
  const toT = new THREE.Vector3().subVectors(target, s);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const dir = toT.normalize();
  // angle à l'épaule (loi des cosinus), coude écarté vers le pôle
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (side.lengthSq() < 1e-8) side.set(0, -1, 0).addScaledVector(dir, -dir.y);
  side.normalize();
  const elbow = s.clone()
    .addScaledVector(dir, la * cosA)
    .addScaledVector(side, la * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  const hand = s.clone().addScaledVector(dir, d);
  const upDir = elbow.clone().sub(s).normalize();
  const lowDir = hand.clone().sub(elbow).normalize();
  // axe de pliage : perpendiculaire au plan du bras ; tendu, on garde le côté du pôle
  const hinge = new THREE.Vector3().crossVectors(upDir, lowDir);
  if (hinge.lengthSq() < 1e-6) hinge.crossVectors(upDir, side.clone().negate());
  hinge.normalize();
  rig.setWorldRot(upper, basisRotation(restDir, restHinge, upDir, hinge));
  rig.setWorldRot(middle, basisRotation(restDir, restHinge, lowDir, hinge));
}
