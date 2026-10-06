/**
 * Porter un objet : le perso se penche (ou s'accroupit) vers l'objet, le saisit, le garde en
 * main en marchant, puis le repose. Aucune animation par objet : les bras sont placés par calcul
 * (bras à deux os, ik.ts) d'après le type de prise de l'objet, par-dessus les clips Mixamo (les
 * jambes continuent de marcher).
 *
 * S'insère dans la mise à jour du perso (Puppet) : apply() après le mixeur, after() une fois le
 * VRM mis à jour (l'objet suit la main), restore() pour rendre aux os leur pose animée.
 */
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';
import type { ItemDef } from './catalog';
import { GRIPS, guessGrip, vec, type GripSpec, type GripType, type HandSpec } from './grips';
import { basisRotation, Rig, solveTwoBone } from './ik';

/** Un objet posé dans le monde (ou tenu). */
export class WorldItem {
  readonly object = new THREE.Group();
  readonly grip: GripType;
  readonly size = new THREE.Vector3();
  readonly gripPoint: THREE.Vector3;

  constructor(readonly def: ItemDef) {
    const model = def.build();
    this.object.add(model);
    this.object.name = def.id;
    new THREE.Box3().setFromObject(model).getSize(this.size);
    this.grip = def.grip ?? guessGrip(this.size);
    this.gripPoint = def.gripPoint ? vec(def.gripPoint) : new THREE.Vector3(0, this.size.y / 2, 0);
  }

  get name(): string {
    return this.def.name;
  }

  /** Point saisi, en coordonnées du monde. */
  gripWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return out.copy(this.gripPoint).applyMatrix4(this.object.matrixWorld);
  }
}

type Phase = 'idle' | 'reach' | 'lift' | 'hold' | 'lower' | 'release';

const DURATION: Record<Phase, number> = { idle: 0, reach: 0.6, lift: 0.6, hold: 0, lower: 0.6, release: 0.5 };
/** Temps de fondu de l'objet entre sa pose au sol et sa pose en main (s). */
const SNAP = 0.25;

const ease = (t: number) => t * t * (3 - 2 * t);

const SIDES = ['right', 'left'] as const;
type Side = (typeof SIDES)[number];
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

/** Directions de repos des os du bras (canonique) et axe de pliage du coude. */
const ARM_REST: Record<Side, { dir: THREE.Vector3; hinge: THREE.Vector3; fingers: THREE.Vector3 }> = {
  right: { dir: new THREE.Vector3(-1, 0, 0), hinge: new THREE.Vector3(0, 1, 0), fingers: new THREE.Vector3(-1, 0, 0) },
  left: { dir: new THREE.Vector3(1, 0, 0), hinge: new THREE.Vector3(0, -1, 0), fingers: new THREE.Vector3(1, 0, 0) },
};
const PALM_REST = new THREE.Vector3(0, -1, 0);
const LEG_DIR = new THREE.Vector3(0, -1, 0);
const LEG_HINGE = new THREE.Vector3(1, 0, 0);

const mirror = (v: THREE.Vector3, side: Side) => (side === 'left' ? v.set(-v.x, v.y, v.z) : v);

export class Carry {
  private rig: Rig;
  private phase: Phase = 'idle';
  private t = 0;
  private item: WorldItem | null = null;
  /** Où va la main pendant la saisie ou la dépose (monde). */
  private target = new THREE.Vector3();
  /** Pose de l'objet au sol au moment de la saisie / de la dépose (fondu). */
  private groundPos = new THREE.Vector3();
  private groundRot = new THREE.Quaternion();
  private heldPos = new THREE.Vector3();
  private heldRot = new THREE.Quaternion();
  private onDone: (() => void) | null = null;
  private saved: Array<{ node: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }> = [];
  private touched: THREE.Object3D[] = [];
  /** Os du bras et de la main, par côté (fondu avec la pose animée). */
  private armNodes: Record<Side, Set<THREE.Object3D>> = { right: new Set(), left: new Set() };
  /** Centre des paumes calculé à cette image (pour placer l'objet tenu). */
  private palms: Partial<Record<Side, THREE.Vector3>> = {};
  private chestRot = new THREE.Quaternion();

  constructor(rig: Rig) {
    this.rig = rig;
    const add = (n: VRMHumanBoneName, side?: Side) => {
      const node = rig.node(n);
      if (!node) return;
      this.touched.push(node);
      if (side) this.armNodes[side].add(node);
    };
    for (const n of ['hips', 'spine', 'chest'] as const) add(n);
    for (const side of SIDES) {
      for (const n of ['UpperLeg', 'LowerLeg', 'Foot']) add(`${side}${n}` as VRMHumanBoneName);
      const arm = ['UpperArm', 'LowerArm', 'Hand', 'ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'];
      for (const f of FINGERS) for (const j of JOINTS) arm.push(`${f}${j}`);
      for (const n of arm) add(`${side}${n}` as VRMHumanBoneName, side);
    }
  }

  /** Objet tenu (ou en train d'être saisi / reposé). */
  get held(): WorldItem | null {
    return this.item;
  }

  /** Vrai pendant une saisie ou une dépose : le perso ne bouge pas. */
  get busy(): boolean {
    return this.phase === 'reach' || this.phase === 'lift' || this.phase === 'lower' || this.phase === 'release';
  }

  /** Saisit un objet à portée (le perso doit déjà lui faire face). */
  pickUp(item: WorldItem, onDone?: () => void): boolean {
    if (this.item || this.busy || !item.def.portable) return false;
    this.item = item;
    item.gripWorld(this.target);
    this.groundPos.copy(item.object.position);
    this.groundRot.copy(item.object.quaternion);
    this.start('reach', onDone);
    return true;
  }

  /** Repose l'objet tenu à l'endroit `spot` (sol ou dessus d'un meuble), tourné de `yaw`. */
  drop(spot: THREE.Vector3, yaw: number, onDone?: () => void): boolean {
    if (!this.item || this.phase !== 'hold') return false;
    this.groundPos.copy(spot);
    this.groundRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.target.copy(this.item.gripPoint).applyQuaternion(this.groundRot).add(this.groundPos);
    this.start('lower', onDone);
    return true;
  }

  private start(phase: Phase, onDone?: () => void): void {
    this.phase = phase;
    this.t = 0;
    this.onDone = onDone ?? null;
  }

  private advance(dt: number): void {
    if (!DURATION[this.phase]) return;
    this.t += dt;
    if (this.t < DURATION[this.phase]) return;
    const next: Partial<Record<Phase, Phase>> = { reach: 'lift', lift: 'hold', lower: 'release', release: 'idle' };
    const n = next[this.phase]!;
    if (this.phase === 'lower' && this.item) {
      // l'objet quitte la main : on part de sa pose en main pour le fondu vers le sol
      this.heldPos.copy(this.item.object.position);
      this.heldRot.copy(this.item.object.quaternion);
    }
    this.phase = n;
    this.t = 0;
    if (n === 'idle') this.item = null;
    if (n === 'hold' || n === 'idle') {
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }
  }

  /**
   * Après le mixeur : poids des bras (w), part de la main tirée vers la cible au sol (r) et
   * accroupissement (c), selon la phase.
   */
  private weights(): { w: number; r: number; c: number } {
    const k = DURATION[this.phase] ? ease(Math.min(1, this.t / DURATION[this.phase])) : 0;
    switch (this.phase) {
      case 'reach': return { w: k, r: 1, c: k };
      case 'lift': return { w: 1, r: 1 - k, c: 1 - k };
      case 'hold': return { w: 1, r: 0, c: 0 };
      case 'lower': return { w: 1, r: k, c: k };
      case 'release': return { w: 1 - k, r: 1, c: 1 - k };
      default: return { w: 0, r: 0, c: 0 };
    }
  }

  apply(dt: number): void {
    this.advance(dt);
    if (this.phase === 'idle' || !this.item) return;
    const { w, r, c } = this.weights();
    this.saved = this.touched.map((node) => ({ node, q: node.quaternion.clone(), p: node.position.clone() }));
    const root = this.rig.vrm.scene;
    root.updateMatrixWorld(true);
    const scale = root.getWorldScale(new THREE.Vector3()).y;
    const spec = GRIPS[this.item.grip];
    if (c > 0) this.crouch(c, scale);
    // repère du buste (après la flexion)
    const chest = this.rig.node('upperChest') ?? this.rig.node('chest')!;
    this.rig.worldRot(chest, this.chestRot);
    const hands: Side[] = spec.left ? ['right', 'left'] : ['right'];
    const center = this.twoHandCenter(spec, r);
    for (const side of hands) this.arm(side, side === 'left' ? spec.left! : spec.right, spec, r, scale, center);
    // fondu entre la pose animée et la pose calculée
    if (w < 1) {
      for (const s of this.saved) {
        if (hands.some((h) => this.armNodes[h].has(s.node))) s.node.quaternion.copy(s.q.clone().slerp(s.node.quaternion, w));
      }
    }
    root.updateMatrixWorld(true);
  }

  /** Penche le buste et plie les jambes (pieds fixes) selon la hauteur de la cible. */
  private crouch(c: number, scale: number): void {
    const rig = this.rig;
    const low = THREE.MathUtils.clamp((0.85 * scale - this.target.y) / (0.75 * scale), 0, 1);
    const feet = SIDES.map((side) => {
      const foot = rig.node(`${side}Foot`)!;
      return { side, pos: rig.worldPos(foot), rot: rig.worldRot(foot) };
    });
    const hips = rig.node('hips')!;
    const hipsScale = hips.parent!.getWorldScale(new THREE.Vector3()).y;
    hips.position.y -= (0.3 * scale * low * c) / hipsScale;
    const bend = THREE.MathUtils.degToRad((15 + 50 * low) * c);
    for (const n of ['spine', 'chest'] as const) {
      const node = rig.node(n);
      if (node) node.quaternion.multiply(rig.local(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend / 2)));
    }
    this.rig.vrm.scene.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.worldRot(hips));
    for (const f of feet) {
      const up = rig.node(`${f.side}UpperLeg`)!, mid = rig.node(`${f.side}LowerLeg`)!, foot = rig.node(`${f.side}Foot`)!;
      solveTwoBone(rig, up, mid, foot, f.pos, fwd, LEG_DIR, LEG_HINGE);
      rig.setWorldRot(foot, f.rot);
    }
  }

  /** Centre de la prise à deux mains (monde) : devant le buste, ou sur l'objet au sol. */
  private twoHandCenter(spec: GripSpec, r: number): THREE.Vector3 {
    const rig = this.rig;
    const ls = rig.worldPos(rig.node('leftUpperArm')!), rs = rig.worldPos(rig.node('rightUpperArm')!);
    const len = this.armLength('right');
    const hold = ls.clone().add(rs).multiplyScalar(0.5).add(vec(spec.right.reach).multiplyScalar(len).applyQuaternion(this.chestRot));
    return hold.lerp(this.target, r);
  }

  private armLength(side: Side): number {
    const rig = this.rig;
    const a = rig.worldPos(rig.node(`${side}UpperArm`)!), b = rig.worldPos(rig.node(`${side}LowerArm`)!), c = rig.worldPos(rig.node(`${side}Hand`)!);
    return a.distanceTo(b) + b.distanceTo(c);
  }

  private arm(side: Side, hand: HandSpec, spec: GripSpec, r: number, scale: number, center: THREE.Vector3): void {
    const rig = this.rig;
    const upper = rig.node(`${side}UpperArm`)!, lower = rig.node(`${side}LowerArm`)!, handNode = rig.node(`${side}Hand`)!;
    const rest = ARM_REST[side];
    // orientation de la main (repère du buste)
    const fingers = vec(hand.fingers).normalize().applyQuaternion(this.chestRot);
    const palm = vec(hand.palm).normalize().applyQuaternion(this.chestRot);
    const handRot = basisRotation(rest.fingers, PALM_REST, fingers, palm);
    // où va le centre de la paume
    let palmTarget: THREE.Vector3;
    if (spec.left) {
      const half = this.item!.size.x / 2 + 0.015;
      const sideDir = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(r > 0.5 ? this.itemRot() : this.chestRot);
      palmTarget = center.clone().addScaledVector(sideDir, half);
    } else {
      const shoulder = rig.worldPos(upper);
      const hold = shoulder.add(vec(hand.reach).multiplyScalar(this.armLength(side)).applyQuaternion(this.chestRot));
      palmTarget = hold.lerp(this.target, r);
    }
    const offset = mirror(vec(spec.hold), side).multiplyScalar(scale).applyQuaternion(handRot);
    const wrist = palmTarget.clone().sub(offset);
    const pole = vec(hand.pole).normalize().applyQuaternion(this.chestRot);
    solveTwoBone(rig, upper, lower, handNode, wrist, pole, rest.dir, rest.hinge);
    rig.setWorldRot(handNode, handRot);
    this.palms[side] = palmTarget;
    this.curl(side, hand);
  }

  /** Orientation de l'objet au sol (pour poser les mains sur ses flancs). */
  private itemRot(): THREE.Quaternion {
    return this.phase === 'lower' || this.phase === 'release' ? this.groundRot : this.item!.object.quaternion;
  }

  private curl(side: Side, hand: HandSpec): void {
    const rig = this.rig;
    const sign = side === 'right' ? 1 : -1;
    for (const f of FINGERS) {
      const deg = f === 'Index' && hand.index !== undefined ? hand.index : hand.curl;
      for (const j of JOINTS) {
        const node = rig.node(`${side}${f}${j}` as VRMHumanBoneName);
        if (!node) continue;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sign * THREE.MathUtils.degToRad(deg * (j === 'Distal' ? 0.7 : 1)));
        node.quaternion.copy(rig.local(q));
      }
    }
    // pouce : se replie vers la paume
    const axis = new THREE.Vector3(0.6 * sign, 0, 0.8).normalize();
    for (const j of ['Proximal', 'Distal'] as const) {
      const node = rig.node(`${side}Thumb${j}` as VRMHumanBoneName);
      if (!node) continue;
      node.quaternion.copy(rig.local(new THREE.Quaternion().setFromAxisAngle(axis, sign * THREE.MathUtils.degToRad(hand.thumb))));
    }
  }

  /** Une fois le VRM mis à jour : l'objet suit la main (ou les deux mains). */
  after(): void {
    const item = this.item;
    if (!item || this.phase === 'idle' || this.phase === 'reach') return;
    const spec = GRIPS[item.grip];
    const rig = this.rig;
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion();
    if (spec.left) {
      pos.copy(this.palms.left!).add(this.palms.right!).multiplyScalar(0.5);
      rot.copy(this.chestRot);
    } else {
      const handRot = rig.worldRot(rig.node('rightHand')!);
      const scale = rig.vrm.scene.getWorldScale(new THREE.Vector3()).y;
      pos.copy(rig.worldPos(rig.raw('rightHand')!)).add(vec(spec.hold).multiplyScalar(scale).applyQuaternion(handRot));
      rot.copy(handRot).multiply(basisRotation(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), vec(spec.up), vec(spec.forward)));
    }
    // le point saisi de l'objet va au centre de la prise
    pos.sub(item.gripPoint.clone().applyQuaternion(rot));
    const o = item.object;
    if (this.phase === 'lift' && this.t < SNAP) {
      const k = ease(this.t / SNAP);
      o.position.copy(this.groundPos).lerp(pos, k);
      o.quaternion.copy(this.groundRot).slerp(rot, k);
    } else if (this.phase === 'release') {
      const k = ease(Math.min(1, this.t / SNAP));
      o.position.copy(this.heldPos).lerp(this.groundPos, k);
      o.quaternion.copy(this.heldRot).slerp(this.groundRot, k);
    } else {
      o.position.copy(pos);
      o.quaternion.copy(rot);
    }
  }

  /** Rend aux os leur pose animée (les os sans piste ne doivent pas garder nos retouches). */
  restore(): void {
    for (const s of this.saved) {
      s.node.quaternion.copy(s.q);
      s.node.position.copy(s.p);
    }
    this.saved = [];
  }
}
