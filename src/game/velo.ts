/**
 * Le vélo du garage : on monte dessus (clic sur le vélo, ou « Monter sur le vélo » au menu), on
 * roule, on descend (E, clic sur le vélo, ou « Descendre du vélo ») et il reste debout là où on
 * l'a laissé. Au clavier, comme un guidon : Z / ↑ pour pédaler, S / ↓ pour freiner puis reculer,
 * Q D / ← → pour tourner, Maj pour aller vite ; un clic au sol y mène le vélo.
 *
 * Le perso joue le clip assis ; par-dessus, sa pose est retouchée à chaque image : le bassin sur
 * la selle, le buste penché vers le guidon juste ce qu'il faut pour que les mains tiennent les
 * poignées, les pieds sur les pédales qui tournent (jambes et bras à deux os, ik.ts). Pour monter,
 * on se place à côté de la selle, les mains prennent le guidon et la jambe du côté opposé passe
 * par-dessus le porte-bagages ; pour descendre, le même geste à l'envers, du côté où il y a la place.
 * Le vélo penche dans les virages, le perso avec lui. Les roues et le pédalier sont les pièces du
 * modèle Tripo (rigs.ts) ; ils tournent selon la vitesse.
 *
 * Game ne fait que brancher (menu, clic, touche E) par l'interface VeloHost.
 */
import * as THREE from 'three';
import { SIT, type Character, type Ride } from './character';
import type { WorldItem } from './items/carry';
import type { ItemDef } from './items/catalog';
import { basisRotation, type Rig, solveTwoBone, twistForearm } from './items/ik';

export interface VeloHost {
  readonly character: Character;
  notice(text: string): void;
  /** Le vélo à cette place (au sol, tourné de `yaw`) toucherait-il un mur ou un meuble ? */
  blocked(bike: WorldItem, pos: THREE.Vector3, yaw: number): boolean;
  /** Peut-on se tenir debout en `p` (le vélo mis à part) ? */
  standable(p: THREE.Vector3, bike: WorldItem): boolean;
  /** On part sur le vélo `bike`, ou on en descend (null) : les chemins en tiennent compte. */
  onRide(bike: WorldItem | null): void;
  /** Usure du vélo après `meters` parcourus. */
  wear(bike: WorldItem, meters: number): void;
}

type Side = 'left' | 'right';
type V3 = [number, number, number];
type Bike = NonNullable<ItemDef['bike']>;

/** Vitesse en roulant, et en appuyant sur Maj (m/s). */
const CRUISE = 2.6;
const SPRINT = 4.5;
/** Accélération, freinage (m/s²). */
const ACCEL = 2.2;
const BRAKE = 4.5;
/** Sans pédaler ni freiner, on ralentit quand même vite : le vélo ne file pas tout seul (m/s²). */
const COAST = 2.5;
/** Virage le plus serré (rayon, m) ; vitesse de rotation la plus grande, et à l'arrêt (rad/s). */
const TURN_RADIUS = 1.3;
const TURN_MAX = 1.8;
const TURN_STILL = 0.5;
/** On s'arrête à cette distance d'un mur (m) : de quoi encore tourner le guidon pour repartir. */
const WALL_GAP = 0.15;
/** En reculant, le vélo poussé avec les pieds (m/s). */
const BACK_SPEED = 0.6;
/** Temps qu'on recule avant de réessayer d'avancer (s). */
const BACK_TIME = 0.8;
/** Vitesse dans un demi-tour (m/s). */
const U_TURN = 1.4;
/** Tours de pédalier pour un tour de roue. */
const GEAR = 0.55;
/** Inclinaison la plus forte dans un virage (rad). */
const LEAN_MAX = 0.3;
/** Durées pour monter et descendre (s). */
const MOUNT_TIME = 1.4;
const DISMOUNT_TIME = 1.2;
/** Côté de la selle où l'on se tient pour monter ou descendre (m depuis l'axe du vélo). */
const STAND_SIDE = 0.5;
/**
 * Pour un perso de 1,6 m (le reste à l'échelle) : le bassin au-dessus du creux de la selle, la
 * cheville au-dessus de la pédale et en arrière d'elle (le pied pousse de l'avant), les poignets en
 * arrière des poignées (m).
 */
const HIP_UP = 0.12;
const ANKLE_UP = 0.09;
const ANKLE_BACK = 0.06;
const WRIST_BACK = 0.04;
/** Buste penché vers le guidon : au plus (rad), et bras tendus à cette part de leur longueur. */
const LEAN_BODY_MAX = THREE.MathUtils.degToRad(60);
const ARM_REACH = 0.9;

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const LEG_DIR = new THREE.Vector3(0, -1, 0);
const LEG_HINGE = new THREE.Vector3(1, 0, 0);
/** Axe gauche-droite du perso (repère canonique) : le buste se penche autour. */
const ACROSS = new THREE.Vector3(1, 0, 0);
const ARM_REST: Record<Side, { dir: THREE.Vector3; hinge: THREE.Vector3; fingers: THREE.Vector3 }> = {
  right: { dir: new THREE.Vector3(-1, 0, 0), hinge: new THREE.Vector3(0, 1, 0), fingers: new THREE.Vector3(-1, 0, 0) },
  left: { dir: new THREE.Vector3(1, 0, 0), hinge: new THREE.Vector3(0, -1, 0), fingers: new THREE.Vector3(1, 0, 0) },
};
const PALM_REST = new THREE.Vector3(0, -1, 0);
const SIDES: Side[] = ['left', 'right'];
/** Os retouchés (rendus tels quels après le rendu). */
const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
] as const;

const ease = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Part de `s` entre `a` et `b`, adoucie. */
const span = (s: number, a: number, b: number) => ease((s - a) / (b - a));
/** Courbe de Bézier (a, b, c) en `t`. */
const bezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) =>
  a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(c, t * t);
/** Angle ramené entre -π et π. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Velo {
  private host: VeloHost;
  private ride: BikeRide | null = null;

  constructor(host: VeloHost) {
    this.host = host;
  }

  /** Le vélo sur lequel on est (en montant, en roulant ou en descendant), sinon null. */
  get riding(): WorldItem | null {
    return this.ride?.bike ?? null;
  }

  /** En selle, prêt à rouler (ni en train de monter, ni de descendre). */
  get inSaddle(): boolean {
    return this.ride?.stage === 'ride';
  }

  menu(item: WorldItem | null, add: (label: string, run: () => boolean) => void): void {
    if (this.ride) {
      if (!item || item === this.ride.bike) add('Descendre du vélo', () => this.dismount());
      return;
    }
    if (item?.def.bike) add('Monter sur le vélo', () => this.mount(item, false));
  }

  /** Va à côté de la selle du vélo `bike` et monte dessus. */
  mount(bike: WorldItem, running: boolean): boolean {
    const c = this.host.character;
    const fail = (t: string) => {
      this.host.notice(t);
      return false;
    };
    if (!bike.def.bike || this.ride) return false;
    if (!c.canSit) return fail('Crée un perso pour pouvoir faire du vélo.');
    if (c.heldItems.length || c.bracing) return fail('Pose d’abord ce que tu tiens : il faut les deux mains pour le guidon.');
    if (c.seated) return c.standUp(() => this.mount(bike, running));
    if (!c.free) return false;
    const o = bike.object;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
    if (o.position.y > 0.05 || up.y < 0.95) return fail('Le vélo n’est pas debout par terre.');
    // à côté de la selle, du côté où l'on est (s'il y a la place), tourné comme le vélo
    o.updateMatrixWorld(true);
    const local = o.worldToLocal(c.position.clone());
    const sides = local.z >= 0 ? [1, -1] : [-1, 1];
    const side = sides.find((s) => this.host.standable(standPoint(bike, s), bike));
    if (side === undefined) return fail('Pas assez de place à côté du vélo pour monter dessus.');
    const stand = standPoint(bike, side);
    const ahead = stand.clone().add(bikeForward(bike));
    c.approachThen(stand, ahead, () => {
      if (this.ride || !c.free) return;
      this.ride = new BikeRide(this.host, bike, side, () => {
        this.ride = null;
      });
      c.ride = this.ride;
      c.playClip(SIT.idle, 0.6);
      this.host.onRide(bike);
    }, running);
    return true;
  }

  /** Touches tenues : `ahead` 1 (↑ pédaler), -1 (↓ freiner, reculer) ou 0 ; `steer` 1 (→), -1 (←) ou 0. */
  steer(ahead: number, steer: number): void {
    if (this.ride) this.ride.keys = { ahead, steer };
  }

  /** Freine, puis descend du vélo du côté où il y a la place ; le vélo reste debout là. */
  dismount(): boolean {
    const r = this.ride;
    if (!r) return false;
    return r.getOff();
  }
}

/** Où se tenir à côté de la selle, du côté `side` (+1 : à gauche du cycliste, vers +Z du modèle). */
function standPoint(bike: WorldItem, side: number): THREE.Vector3 {
  const s = bike.def.bike!.saddle;
  bike.object.updateMatrixWorld(true);
  return bike.object.localToWorld(new THREE.Vector3(s[0] - 0.1, 0, side * STAND_SIDE)).setY(0);
}

/** L'avant du vélo, au sol (le modèle a l'avant vers -X). */
function bikeForward(bike: WorldItem): THREE.Vector3 {
  return new THREE.Vector3(-1, 0, 0).applyQuaternion(bike.object.quaternion).setY(0).normalize();
}

class BikeRide implements Ride {
  readonly bike: WorldItem;
  private host: VeloHost;
  private def: Bike;
  private phase: 'mount' | 'ride' | 'dismount' = 'mount';

  /** Où en est la balade : on monte, on roule, on descend. */
  get stage(): 'mount' | 'ride' | 'dismount' {
    return this.phase;
  }
  private t = 0;
  speed = 0;
  /** Cap du perso (celui du vélo : l'avant du modèle, vers -X, est le devant du perso). */
  private heading: number;
  private lean = 0;
  private crank = 0;
  /** Touches tenues (Velo.steer). */
  keys = { ahead: 0, steer: 0 };
  /** Temps qu'il reste à reculer pour se dégager d'un mur (s). */
  private backing = 0;
  /** Descente demandée : on freine d'abord. */
  private leaving = false;
  /** Côté où l'on se tient à pied (+1 : gauche du cycliste), et où l'on se tient debout. */
  private side: number;
  private stand: THREE.Vector3;
  /** Pose debout au moment de monter, dans le repère du perso : le bassin, les chevilles. */
  private rest: { hips: THREE.Vector3; feet: Record<Side, THREE.Vector3> } | null = null;
  private saved: Array<{ node: THREE.Object3D; q: THREE.Quaternion }> = [];
  private hipsAt: THREE.Vector3 | null = null;
  private hipsNode: THREE.Object3D | null = null;
  private done: () => void;

  constructor(host: VeloHost, bike: WorldItem, side: number, done: () => void) {
    this.host = host;
    this.bike = bike;
    this.def = bike.def.bike!;
    this.side = side;
    this.stand = host.character.position.clone().setY(0);
    const f = bikeForward(bike);
    this.heading = Math.atan2(f.x, f.z);
    this.done = done;
  }

  /** Les pièces qui tournent (absentes tant que le modèle n'est pas chargé). */
  private part(name: string): THREE.Object3D | undefined {
    return this.bike.object.getObjectByName(name);
  }

  getOff(): boolean {
    if (this.phase === 'dismount') return true;
    if (this.phase === 'mount') return false;
    // du côté d'où l'on est monté, sinon de l'autre
    const side = [this.side, -this.side].find((s) => this.host.standable(standPoint(this.bike, s), this.bike));
    if (side === undefined) {
      this.host.notice('Pas la place de descendre ici : avance un peu.');
      return false;
    }
    this.side = side;
    this.leaving = true;
    return true;
  }

  update(dt: number, want: THREE.Vector3 | null, running: boolean): boolean {
    this.t += dt;
    if (this.phase === 'mount') {
      // la pose debout est notée à la première image ; le perso passe ensuite sur le vélo
      if (this.rest) this.place();
      if (this.t >= MOUNT_TIME) {
        this.phase = 'ride';
        this.t = 0;
        this.host.notice('Z / ↑ pédaler, S / ↓ freiner, Q D / ← → tourner, E pour descendre.');
      }
      return true;
    }
    if (this.phase === 'dismount') {
      if (this.t >= DISMOUNT_TIME) this.finish();
      return true;
    }
    // —— en selle
    const { ahead, steer } = this.keys;
    const keyed = !this.leaving && (ahead !== 0 || steer !== 0);
    if (this.leaving || keyed) want = null;
    let target = want ? (running ? SPRINT : CRUISE) : 0;
    let turn = 0;
    let delta = 0;
    // pas de commande : on roule en roue libre et on ralentit doucement ; ↓ ou une descente : on freine
    let rate = this.leaving || ahead < 0 ? BRAKE : COAST;
    if (keyed) {
      // au clavier, comme un vrai vélo : ↑ pédaler, ↓ freiner puis reculer, ← → tourner
      if (ahead > 0) target = running ? SPRINT : CRUISE;
      else if (ahead < 0 && this.speed <= 0.05) target = -BACK_SPEED;
      const r = Math.min(TURN_MAX, Math.abs(this.speed) / TURN_RADIUS) + TURN_STILL * Math.max(0, 1 - Math.abs(this.speed));
      turn = -steer * r * dt;
    } else if (want) {
      delta = wrap(Math.atan2(want.x, want.z) - this.heading);
      // demi-tour : on ralentit pour tourner court
      if (Math.abs(delta) > 1.6) target = Math.min(target, U_TURN);
      const r = Math.min(TURN_MAX, this.speed / TURN_RADIUS) + TURN_STILL * Math.max(0, 1 - this.speed);
      turn = THREE.MathUtils.clamp(delta, -r * dt, r * dt);
    }
    // plus vite dans le même sens : on pédale ; sinon on freine (ou on se laisse ralentir)
    if (target !== 0 && Math.sign(target) === Math.sign(this.speed || target) && Math.abs(target) > Math.abs(this.speed)) rate = ACCEL;
    else if (target !== 0) rate = BRAKE;
    const dv = target - this.speed;
    this.speed += THREE.MathUtils.clamp(dv, -rate * dt, rate * dt);
    const heading = this.heading + turn;
    const o = this.bike.object;
    const free = (p: THREE.Vector3, h: number) => !this.host.blocked(this.bike, p, h + Math.PI / 2);
    const along = (h: number, d: number) => o.position.clone().addScaledVector(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), d);
    let travel = this.speed * dt;
    let moved = true;
    // contre un mur, pour aller ailleurs : on recule un moment (les pieds poussent le vélo), en
    // tournant si la place le permet
    if (this.backing > 0 && want) {
      this.backing -= dt;
      this.speed = 0;
      travel = -BACK_SPEED * dt;
      const h = [heading, this.heading].find((h) => free(along(h, travel), h));
      if (h === undefined) {
        this.backing = 0;
        travel = 0;
        moved = false;
      } else {
        o.position.copy(along(h, travel));
        this.heading = h;
      }
    } else if (!free(o.position, this.heading) || free(along(heading, travel + Math.sign(travel) * WALL_GAP), heading)) {
      // (garé tout contre un mur, on peut en sortir)
      this.backing = 0;
      o.position.copy(along(heading, travel));
      this.heading = heading;
    } else {
      // contre un mur : on s'arrête net (en allant vers un clic, on recule pour se dégager)
      this.speed = 0;
      travel = 0;
      if (free(o.position, heading)) this.heading = heading;
      else if (want && Math.abs(delta) > 0.3) this.backing = BACK_TIME;
      else moved = false;
    }
    this.host.wear(this.bike, Math.abs(travel));
    // penché dans le virage (vers la gauche quand le cap augmente)
    const w = dt > 0 ? turn / dt : 0;
    const lean = THREE.MathUtils.clamp(Math.atan((Math.max(0, this.speed) * w) / 9.8), -LEAN_MAX, LEAN_MAX);
    this.lean += (lean - this.lean) * Math.min(1, dt * 6);
    const roll = travel / this.def.wheel;
    // roue libre : en reculant, les pédales ne tournent pas
    this.crank += Math.max(0, roll) * GEAR;
    this.place();
    for (const name of ['roue-avant', 'roue-arriere']) {
      const p = this.part(name);
      if (p) p.rotation.z += roll;
    }
    const pedals = this.part('pedalier');
    if (pedals) pedals.rotation.z = this.crank;
    if (this.leaving && Math.abs(this.speed) < 0.05) {
      this.speed = 0;
      this.lean = 0;
      this.place();
      this.phase = 'dismount';
      this.t = 0;
      this.stand = standPoint(this.bike, this.side);
    }
    return moved;
  }

  /** Le vélo à sa place et à son cap (penché), le perso dessus. */
  private place(): void {
    const o = this.bike.object;
    o.rotation.set(this.lean, this.heading + Math.PI / 2, 0, 'YXZ');
    o.updateMatrixWorld(true);
    const s = this.def.saddle;
    const at = o.localToWorld(new THREE.Vector3(s[0], 0, 0)).setY(0);
    this.host.character.setPlace(at, this.heading, this.lean);
  }

  /** Arrivé à pied à côté du vélo : le vélo reste là, debout, et le perso reprend la main. */
  private finish(): void {
    const c = this.host.character;
    const o = this.bike.object;
    o.rotation.set(0, this.heading + Math.PI / 2, 0, 'XYZ');
    o.updateMatrixWorld(true);
    c.setPlace(this.stand, this.heading);
    c.ride = null;
    c.playClip('idle', 0.3);
    this.done();
    this.host.onRide(null);
  }

  // ——— la pose ———

  pose(rig: Rig): void {
    const vrm = rig.vrm;
    const hips = rig.node('hips');
    if (!hips?.parent) return;
    this.hipsNode = hips;
    this.saved = [];
    for (const name of BONES) {
      const node = rig.node(name);
      if (node) this.saved.push({ node, q: node.quaternion.clone() });
    }
    this.hipsAt = hips.position.clone();
    vrm.scene.updateMatrixWorld(true);
    const c = this.host.character;
    if (!this.rest) {
      // pose debout de départ, dans le repère du perso (on la retrouve en descendant)
      const inv = c.root.matrixWorld.clone().invert();
      const foot = (side: Side) => rig.worldPos(rig.node(`${side}Foot`)!).applyMatrix4(inv);
      this.rest = { hips: rig.worldPos(hips).applyMatrix4(inv), feet: { left: foot('left'), right: foot('right') } };
      return;
    }
    // part du geste : 0 debout à côté, 1 en selle
    const s = this.phase === 'mount' ? this.t / MOUNT_TIME : this.phase === 'dismount' ? 1 - this.t / DISMOUNT_TIME : 1;
    const scale = c.height / 1.6;
    const o = this.bike.object;
    o.updateMatrixWorld(true);
    const at = (p: V3 | THREE.Vector3) => o.localToWorld(Array.isArray(p) ? new THREE.Vector3(...p) : p.clone());
    const d = this.def;
    // —— debout (au départ du geste) : là où l'on était à pied, ou là où l'on va se tenir
    const standM = new THREE.Matrix4().compose(this.stand, new THREE.Quaternion().setFromAxisAngle(UP, this.heading), new THREE.Vector3(1, 1, 1));
    const restHips = this.rest.hips.clone().applyMatrix4(standM);
    const restFeet = { left: this.rest.feet.left.clone().applyMatrix4(standM), right: this.rest.feet.right.clone().applyMatrix4(standM) };
    // —— en selle : les chevilles sur les pédales
    const pedal = (i: number) => {
      const [ox, oy, oz] = d.pedals[i];
      const ca = Math.cos(this.crank), sa = Math.sin(this.crank);
      return new THREE.Vector3(d.crank[0] + ox * ca - oy * sa + ANKLE_BACK * scale, d.crank[1] + ox * sa + oy * ca + ANKLE_UP * scale, oz);
    };
    const pedals = { left: pedal(0), right: pedal(1) };
    // jambes trop courtes pour la pédale du bas : le bassin descend un peu (dans le modèle)
    // assis sur la selle (jamais dedans) : une jambe trop courte se tend vers la pédale du bas
    const seatHips = at([d.saddle[0], d.saddle[1] + HIP_UP * scale, 0]);
    // —— le bassin : de debout à la selle, en se soulevant pendant que la jambe passe
    const near: Side = this.side > 0 ? 'left' : 'right';
    const far: Side = near === 'left' ? 'right' : 'left';
    const hipsTarget = restHips.clone().lerp(seatHips, span(s, 0.2, 0.85)).addScaledVector(UP, 0.08 * scale * Math.sin(Math.PI * THREE.MathUtils.clamp((s - 0.15) / 0.6, 0, 1)));
    hips.position.copy(hips.parent.worldToLocal(hipsTarget.clone()));
    vrm.scene.updateMatrixWorld(true);
    // —— les pieds : le pied du côté opposé passe par-dessus le porte-bagages, l'autre suit
    const overRack = at([d.saddle[0] + 0.35, d.saddle[1] + 0.2, 0]);
    const footAt: Record<Side, THREE.Vector3> = {
      [far]: bezier(restFeet[far], overRack, at(pedals[far]), span(s, 0.15, 0.8)),
      [near]: (() => {
        const from = restFeet[near], to = at(pedals[near]);
        const mid = from.clone().lerp(to, 0.5).addScaledVector(UP, 0.15);
        return bezier(from, mid, to, span(s, 0.6, 1));
      })(),
    } as Record<Side, THREE.Vector3>;
    // —— le buste penché vers le guidon, juste assez pour que les mains y arrivent
    const grips = { left: at([d.grip[0] + WRIST_BACK * scale, d.grip[1], d.grip[2]]), right: at([d.grip[0] + WRIST_BACK * scale, d.grip[1], -d.grip[2]]) };
    const spine = (['spine', 'chest'] as const).map((n) => rig.node(n)).filter((n): n is THREE.Object3D => !!n);
    const head = (['neck', 'head'] as const).map((n) => rig.node(n)).filter((n): n is THREE.Object3D => !!n);
    const spineRest = spine.map((n) => n.quaternion.clone());
    const headRest = head.map((n) => n.quaternion.clone());
    const armLen = (side: Side) =>
      rig.worldPos(rig.node(`${side}UpperArm`)!).distanceTo(rig.worldPos(rig.node(`${side}LowerArm`)!)) +
      rig.worldPos(rig.node(`${side}LowerArm`)!).distanceTo(rig.worldPos(rig.node(`${side}Hand`)!));
    const reach = Math.min(armLen('left'), armLen('right')) * ARM_REACH;
    const bend = (a: number) => {
      spine.forEach((n, j) => n.quaternion.copy(spineRest[j]).multiply(rig.local(new THREE.Quaternion().setFromAxisAngle(ACROSS, a / spine.length))));
      // le regard reste vers l'avant
      head.forEach((n, j) => n.quaternion.copy(headRest[j]).multiply(rig.local(new THREE.Quaternion().setFromAxisAngle(ACROSS, (-0.7 * a) / head.length))));
      vrm.scene.updateMatrixWorld(true);
    };
    const short = () => Math.max(...SIDES.map((side) => rig.worldPos(rig.node(`${side}UpperArm`)!).distanceTo(grips[side]))) - reach;
    let lo = 0, hi = LEAN_BODY_MAX;
    bend(hi);
    if (short() > 0) lo = hi;
    else {
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        bend(mid);
        if (short() > 0) lo = mid;
        else hi = mid;
      }
    }
    bend(hi * span(s, 0.1, 0.7));
    // —— les jambes, genoux vers l'avant
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const body = c.root.getWorldQuaternion(new THREE.Quaternion());
    for (const side of SIDES) {
      const up = rig.node(`${side}UpperLeg`)!, mid = rig.node(`${side}LowerLeg`)!, foot = rig.node(`${side}Foot`)!;
      solveTwoBone(rig, up, mid, foot, footAt[side], fwd.clone().addScaledVector(UP, 0.3), LEG_DIR, LEG_HINGE);
      rig.setWorldRot(foot, body);
    }
    // —— les mains au guidon (prises dès le début du geste pour monter)
    const k = span(s, 0, 0.35);
    for (const side of SIDES) {
      const nodes = (['UpperArm', 'LowerArm', 'Hand'] as const).map((n) => rig.node(`${side}${n}`)!);
      const before = nodes.map((n) => n.quaternion.clone());
      const out = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(body);
      const rest = ARM_REST[side];
      solveTwoBone(rig, nodes[0], nodes[1], nodes[2], grips[side], DOWN.clone().addScaledVector(out, 0.7).addScaledVector(fwd, -0.3), rest.dir, rest.hinge, ARM_REACH);
      const fingers = fwd.clone().addScaledVector(out, 0.25).addScaledVector(DOWN, 0.2).normalize();
      twistForearm(rig, nodes[1], nodes[2], basisRotation(rest.fingers, PALM_REST, fingers, DOWN.clone().addScaledVector(fwd, 0.3).normalize()));
      nodes.forEach((n, i) => n.quaternion.copy(before[i].slerp(n.quaternion, k)));
      vrm.scene.updateMatrixWorld(true);
    }
  }

  restore(): void {
    for (const { node, q } of this.saved) node.quaternion.copy(q);
    if (this.hipsNode && this.hipsAt) this.hipsNode.position.copy(this.hipsAt);
    this.saved = [];
  }
}
