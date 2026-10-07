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
import { GRIPS, guessGrip, isTwoHanded, vec, type GripSpec, type GripType, type HandSpec } from './grips';
import { gradeIndex, showWear } from './durability';
import { basisRotation, Rig, solveTwoBone } from './ik';

/** Orientation de l'objet dans la prise (repère de la main, ou du buste à deux mains). */
function gripRotation(spec: GripSpec): THREE.Quaternion {
  return basisRotation(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), vec(spec.up), vec(spec.forward));
}

/** Un objet posé dans le monde (ou tenu). */
export class WorldItem {
  readonly object = new THREE.Group();
  readonly grip: GripType;
  readonly size = new THREE.Vector3();
  /** Boîte de l'objet dans son propre repère (pour le poser à plat ou debout). */
  readonly box: THREE.Box3;
  readonly gripPoint: THREE.Vector3;
  /** Niveau de remplissage d'un récipient (0 vide, 1 plein ; voir ItemDef.fill). */
  level = 0;
  /** Ce qu'il contient (« café »), ou null. */
  contents: string | null = null;
  /** Durabilité restante (points, sur maxDurability) ; à zéro, l'objet se brise. */
  durability: number;
  /** Part qui reste d'un aliment (1 entier, 0 mangé ; voir ItemDef.food). */
  portion = 1;

  private closed: THREE.Object3D;
  private opened: THREE.Object3D | null = null;

  constructor(readonly def: ItemDef) {
    const model = def.build();
    this.closed = model;
    this.object.add(model);
    this.object.name = def.id;
    this.box = new THREE.Box3().setFromObject(model);
    this.box.getSize(this.size);
    if (def.buildOpen) {
      // livre ouvert : centré sur le livre fermé, caché (hors de la boîte de l'objet)
      this.opened = def.buildOpen();
      this.opened.position.copy(this.box.getCenter(new THREE.Vector3()));
      this.opened.visible = false;
      this.object.add(this.opened);
    }
    this.grip = def.grip ?? guessGrip(this.size);
    this.gripPoint = def.gripPoint ? vec(def.gripPoint) : new THREE.Vector3(0, this.size.y / 2, 0);
    if (def.fill) this.setLevel(def.startFull ? 1 : 0);
    this.contents = def.startFull ?? null;
    this.durability = this.maxDurability;
  }

  get maxDurability(): number {
    return this.def.durability ?? 100;
  }

  /** Part de durabilité restante (1 neuf, 0 cassé). */
  get condition(): number {
    return this.durability / this.maxDurability;
  }

  /** Use l'objet de `points` ; vrai s'il change de grade (neuf → bon état…). */
  wear(points: number): boolean {
    return this.setCondition((this.durability - points) / this.maxDurability);
  }

  /** Fixe la durabilité (part de 0 à 1) et montre l'usure ; vrai si le grade change. */
  setCondition(ratio: number): boolean {
    const before = gradeIndex(this.condition);
    this.durability = THREE.MathUtils.clamp(ratio, 0, 1) * this.maxDurability;
    showWear(this.object, this.condition);
    return gradeIndex(this.condition) !== before;
  }

  /** Montre le livre ouvert (lecture) ou fermé. */
  setOpen(open: boolean): void {
    if (!this.opened) return;
    this.opened.visible = open;
    this.closed.visible = !open;
  }

  /** Pièce nommée du modèle (ex. `liquide`, `jet`). */
  part(name: string): THREE.Object3D | undefined {
    return this.object.getObjectByName(name);
  }

  /** Couleur du liquide qu'il contient (café, eau). */
  setLiquidColor(color: THREE.ColorRepresentation): void {
    const liquid = this.part('liquide') as THREE.Mesh | undefined;
    const m = liquid?.material as THREE.MeshToonMaterial | undefined;
    m?.color.set(color);
  }

  /** Remplit le récipient (0 à 1) : le liquide monte (et s'élargit, la tasse s'évase). */
  setLevel(level: number): void {
    const liquid = this.part('liquide');
    if (!this.def.fill || !liquid) return;
    this.level = THREE.MathUtils.clamp(level, 0, 1);
    liquid.visible = this.level > 0.01;
    if (liquid.userData.column) {
      // colonne (bouteille) : de fill[0] jusqu'au niveau
      liquid.position.y = this.def.fill[0];
      liquid.scale.y = Math.max(0.001, this.level * (this.def.fill[1] - this.def.fill[0]));
      return;
    }
    liquid.position.y = THREE.MathUtils.lerp(this.def.fill[0], this.def.fill[1], this.level);
    const r = THREE.MathUtils.lerp(0.87, 1, this.level);
    liquid.scale.set(r, 1, r);
  }

  /** Une bouchée : l'aliment rétrécit (autour du point tenu, il reste dans la main). */
  bite(): void {
    if (!this.def.food) return;
    this.portion = Math.max(0, this.portion - 1 / this.def.food.bites);
    const s = 0.4 + 0.6 * this.portion;
    this.closed.scale.setScalar(s);
    this.closed.position.copy(this.gripPoint).multiplyScalar(1 - s);
  }

  get name(): string {
    return this.def.name;
  }

  /** Hauteur dont il faut le lever pour qu'il repose sur le sol, tourné de `rot`. */
  restLift(rot: THREE.Quaternion): number {
    let min = Infinity;
    const b = this.box, v = new THREE.Vector3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      min = Math.min(min, v.set(x, y, z).applyQuaternion(rot).y);
    }
    return -min;
  }

  /** Point saisi, en coordonnées du monde. */
  gripWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.object.updateMatrixWorld(true);
    return out.copy(this.gripPoint).applyMatrix4(this.object.matrixWorld);
  }
}

type Phase = 'idle' | 'reach' | 'lift' | 'hold' | 'lower' | 'release' | 'add' | 'store' | 'drink' | 'eat' | 'open' | 'read' | 'close' | 'throw' | 'brace' | 'push' | 'unbrace' | 'let';

const DURATION: Record<Phase, number> = { idle: 0, reach: 0.6, lift: 0.6, hold: 0, lower: 0.6, release: 0.5, add: 0.6, store: 0.6, drink: 2.4, eat: 1.8, open: 0.7, read: 0, close: 0.6, throw: 0.95, brace: 0.5, push: 0, unbrace: 0.4, let: 0.45 };
/** Temps pour qu'un objet ajouté à la pile y trouve sa place (s). */
const STACK_BLEND = 0.4;
/** Nombre maximal d'objets empilés sur celui qu'on tient. */
const STACK_MAX = 5;
/**
 * Couché à plat : l'objet basculé sur son flanc +X, son axe -X (l'épaisseur d'un livre, côté où
 * la main se pose) vers le haut. Une pile monte dans ce sens.
 */
export const LAY_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

/** Objet posé sur la pile tenue (livres) ; il vient de `from`, et en part vers `leaving`. */
interface StackEntry {
  item: WorldItem;
  age: number;
  fromPos: THREE.Vector3;
  fromRot: THREE.Quaternion;
  leaving: { pos: THREE.Vector3; rot: THREE.Quaternion } | null;
}
/** Boire : montée de la tasse à la bouche, gorgée, descente (s, dans DURATION.drink). */
const SIP_UP = 0.7;
const SIP_DOWN = 0.6;
/** Part du contenu bue par seconde de gorgée. */
const SIP_RATE = 0.28;
/** Tasse inclinée vers la bouche (rad). */
/** Main pendant la gorgée, depuis l'os de la tête (m, repère du buste). */
const SIP_MOUTH: [number, number, number] = [-0.05, -0.02, 0.13];
/** Vers où pointe le coude pendant la gorgée (repère du buste). */
const SIP_POLE: [number, number, number] = [-0.35, -0.9, 0.25];
const SIP_TILT = THREE.MathUtils.degToRad(55);
/** Aliment porté à la bouche : à peine incliné (rad). */
const BITE_TILT = THREE.MathUtils.degToRad(12);
/**
 * Bord de la tasse qui touche les lèvres, depuis l'anse (repère de la tasse) : SIP_MOUTH est
 * réglé pour lui. Un objet qui a son propre point `mouth` (goulot) est décalé d'autant.
 */
const CUP_LIP = new THREE.Vector3(0, 0.045, -0.104);
/** Goulot (bouteille) : plus près des lèvres que le bord large d'une tasse (repère du buste), et plus incliné. */
const NECK_IN: [number, number, number] = [0, -0.035, -0.06];
const NECK_TILT = THREE.MathUtils.degToRad(85);

/**
 * Se laver sous le robinet : les mains se frottent (amplitude en m, vitesse en rad/s) ; pour la
 * toilette, elles montent au visage à chaque tour (durées en s : sous l'eau, montée, au visage,
 * descente).
 */
const RUB = 0.025;
const RUB_SPEED = 9;
const SPLASH = { basin: 1.1, up: 0.45, face: 0.7, down: 0.45 };
/** Durée d'un tour de toilette (s) : se laver dure un nombre entier de tours. */
export const SPLASH_CYCLE = SPLASH.basin + SPLASH.up + SPLASH.face + SPLASH.down;
/** Mains devant le visage (depuis l'os de la tête, m, repère du buste, main droite). */
const FACE_HOLD: [number, number, number] = [-0.045, -0.03, 0.1];
const FACE_HAND = { fingers: [0.2, 1, 0.1] as [number, number, number], palm: [0.15, 0, -1] as [number, number, number] };

/** Temps de fondu de l'objet entre sa pose au sol et sa pose en main (s). */
const SNAP = 0.25;

const ease = (t: number) => t * t * (3 - 2 * t);

const SIDES = ['right', 'left'] as const;
export type Side = (typeof SIDES)[number];
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
const flip = (v: [number, number, number], side: Side): [number, number, number] => (side === 'left' ? [-v[0], v[1], v[2]] : v);

/** Prise à une main tenue de la main gauche : le miroir de la prise de la main droite. */
function sided(spec: GripSpec, side: Side): GripSpec {
  if (side === 'right' || spec.left) return spec;
  const h = spec.right;
  return {
    ...spec,
    right: { ...h, reach: spec.leftReach ?? flip(h.reach, side), pole: flip(h.pole, side), fingers: flip(h.fingers, side), palm: flip(h.palm, side) },
    up: flip(spec.up, side),
    forward: flip(spec.forward, side),
  };
}

/**
 * Lancer : la main part en arrière au-dessus de l'épaule, puis fouette vers l'avant ; l'objet
 * part à THROW_RELEASE. Positions de la main depuis l'épaule (longueurs de bras, repère du buste,
 * main droite) et direction du coude.
 */
const THROW_BACK = { reach: [-0.3, 0.35, -0.3] as [number, number, number], pole: [-1, -0.4, -0.2] as [number, number, number] };
const THROW_FRONT = { reach: [0.05, 0.12, 0.85] as [number, number, number], pole: [-0.6, -0.6, -0.3] as [number, number, number] };
const THROW_WIND = 0.42;
const THROW_SWING = 0.56;
const THROW_RELEASE = 0.5;
/** Vitesse de l'objet lancé (m/s) : vers l'avant, et vers le haut. */
const THROW_SPEED = 4.2;
const THROW_LIFT = 2.4;

/** Pencher la tête vers le livre pendant la lecture (rad). */
const READ_NOD = THREE.MathUtils.degToRad(16);

export class Carry {
  private rig: Rig;
  private phase: Phase = 'idle';
  private t = 0;
  private item: WorldItem | null = null;
  /** Objets empilés sur celui qu'on tient (du bas vers le haut). */
  private stack: StackEntry[] = [];
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
  /** Part du geste « boire » ou « manger » (0 : objet tenu, 1 : à la bouche). */
  private sip = 0;
  /** La bouchée de ce geste « manger » est prise. */
  private bitten = false;
  /** Orientation de chaque main calculée à cette image. */
  private handRots: Partial<Record<Side, THREE.Quaternion>> = {};
  /** Pose de l'objet pendant l'ouverture / la fermeture du livre (fondu entre les deux prises). */
  private blendPose: { pos: THREE.Vector3; rot: THREE.Quaternion } | null = null;
  /** Lancer : prise de l'objet lancé (il a quitté la main avant la fin du geste) et suite. */
  private throwGrip: GripType = 'fist';
  private onThrow: ((item: WorldItem, vel: THREE.Vector3) => void) | null = null;
  /** Mains à plat contre un meuble (pousser) : points d'appui, en monde, recalculés à chaque image. */
  private braceAt: (() => Record<Side, THREE.Vector3>) | null = null;
  /** Prise des mains en appui : contre un meuble (pousser) ou sous le robinet (se laver). */
  private braceGrip: 'push' | 'wash' = 'push';
  /** Se laver : la toilette (mains au visage) ou les mains seulement, et le temps sous l'eau (s). */
  private washFace = false;
  private washT = 0;
  /** Main imposée par un geste (lancer) : position depuis l'épaule et coude. */
  private swing: { reach: THREE.Vector3; pole: THREE.Vector3 } | null = null;

  /** `side` : la main qui tient l'objet (une prise à deux mains prend aussi l'autre). */
  constructor(rig: Rig, readonly side: Side = 'right') {
    this.rig = rig;
    const add = (n: VRMHumanBoneName, side?: Side) => {
      const node = rig.node(n);
      if (!node) return;
      this.touched.push(node);
      if (side) this.armNodes[side].add(node);
    };
    for (const n of ['hips', 'spine', 'chest', 'neck'] as const) add(n);
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

  /** Objets portés : celui qu'on tient et ceux empilés dessus. */
  get carried(): WorldItem[] {
    return this.item ? [this.item, ...this.stack.map((e) => e.item)] : [];
  }

  /** Nombre d'objets empilés sur celui qu'on tient. */
  get stacked(): number {
    return this.stack.length;
  }

  /** Vrai pendant une saisie, un ajout à la pile ou une dépose : le perso ne bouge pas. */
  get busy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'hold' && this.phase !== 'read' && this.phase !== 'push';
  }

  /** Mains contre un meuble (en train de l'agripper, de le pousser ou de le lâcher). */
  get bracing(): boolean {
    return this.phase === 'brace' || this.phase === 'push' || this.phase === 'unbrace';
  }

  /**
   * Pose les deux mains à plat sur un meuble, aux points `at()` (monde) ; `onDone` une fois en
   * appui. Les mains doivent être vides.
   */
  brace(at: () => Record<Side, THREE.Vector3>, onDone?: () => void, grip: 'push' | 'wash' = 'push', face = false): boolean {
    if (this.item || this.phase !== 'idle') return false;
    this.braceAt = at;
    this.braceGrip = grip;
    this.washFace = face;
    this.washT = 0;
    // le buste se penche vers l'évier (voir weights)
    this.target.copy(at().right);
    this.start('brace', onDone);
    return true;
  }

  /** Lâche le meuble ; `onDone` une fois les bras revenus. */
  unbrace(onDone?: () => void): boolean {
    if (this.phase !== 'push') return false;
    this.start('unbrace', onDone);
    return true;
  }

  /** En train de lire (livre ouvert, ou qui s'ouvre / se ferme). */
  get reading(): boolean {
    return this.phase === 'open' || this.phase === 'read' || this.phase === 'close';
  }

  /** L'objet tenu occupe-t-il les deux mains (caisse, pile, livre ouvert) ? */
  get bothHands(): boolean {
    return this.bracing || (!!this.item && (this.reading || isTwoHanded(this.grip)));
  }

  /** Prise utilisée : une pile se porte à plat, à deux mains. */
  private get grip(): GripType {
    return this.stack.length ? 'stack' : (this.item?.grip ?? this.throwGrip);
  }

  /** L'objet tenu peut-il être lancé (à une main, pas une pile) ? */
  get canThrow(): boolean {
    return !!this.item && this.phase === 'hold' && !this.stack.length && !isTwoHanded(this.item.grip);
  }

  /**
   * Lance l'objet tenu devant soi. `onRelease` reçoit l'objet et sa vitesse (monde) quand il
   * quitte la main ; la main est alors libre (le bras finit son geste).
   */
  throw(onRelease: (item: WorldItem, vel: THREE.Vector3) => void): boolean {
    if (!this.canThrow) return false;
    this.throwGrip = this.item!.grip;
    this.onThrow = onRelease;
    this.start('throw');
    return true;
  }

  /**
   * L'objet tenu disparaît de la main (il s'est brisé) : le bras retombe. Seulement quand il est
   * simplement tenu (pas en plein geste, pas de pile).
   */
  /** Objet brisé en main (phase `let`) : les mains gardent son écartement en retombant. */
  private lost: WorldItem | null = null;

  lose(): WorldItem | null {
    const item = this.item;
    if (!item || this.phase !== 'hold' || this.stack.length) return null;
    this.throwGrip = item.grip;
    this.lost = item;
    this.item = null;
    this.start('let');
    return item;
  }

  /** Prise (main gauche : miroir). */
  private spec(grip: GripType = this.grip): GripSpec {
    return sided(GRIPS[grip], this.side);
  }

  /** Ouvre le livre tenu pour le lire (il faut l'autre main libre). */
  read(): boolean {
    if (!this.item?.def.buildOpen || this.phase !== 'hold' || this.stack.length) return false;
    this.start('open');
    return true;
  }

  /** Ferme le livre ; `onDone` une fois revenu à la prise normale. */
  stopReading(onDone?: () => void): boolean {
    if (this.phase !== 'read') return false;
    this.start('close', onDone);
    return true;
  }

  /** Peut-on ajouter `item` à ce qu'on tient (même sorte d'objet empilable, pile pas pleine) ? */
  canStack(item: WorldItem): boolean {
    return !!this.item && this.phase === 'hold' && !!item.def.stack && item.def.stack === this.item.def.stack && this.stack.length < STACK_MAX;
  }

  /** Ajoute un objet à portée sur la pile tenue (il vient s'y poser). */
  addToStack(item: WorldItem, onDone?: () => void): boolean {
    if (!this.canStack(item)) return false;
    this.stack.push(this.entry(item));
    item.gripWorld(this.target);
    this.start('add', onDone);
    return true;
  }

  /** Objets déjà posés sur celui qu'on prend (pile de livres au sol) : ils viennent avec. */
  adopt(items: WorldItem[]): void {
    for (const it of items) if (this.stack.length < STACK_MAX) this.stack.push(this.entry(it));
  }

  private entry(item: WorldItem): StackEntry {
    return { item, age: 0, fromPos: item.object.position.clone(), fromRot: item.object.quaternion.clone(), leaving: null };
  }

  /** Pose l'objet du haut de la pile en `pos` (base de l'objet), tourné de `rot`. */
  storeTop(pos: THREE.Vector3, rot: THREE.Quaternion, onDone?: () => void): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top || this.phase !== 'hold') return false;
    top.leaving = { pos: pos.clone(), rot: rot.clone() };
    this.target.copy(top.item.gripPoint).applyQuaternion(rot).add(pos);
    this.start('store', onDone);
    return true;
  }

  /** Boit une gorgée de ce que contient l'objet tenu (tasse de café). */
  drink(onDone?: () => void): boolean {
    if (!this.item || this.phase !== 'hold' || this.stack.length || !this.item.contents || this.item.level <= 0) return false;
    this.start('drink', onDone);
    return true;
  }

  /** Prend une bouchée de l'aliment tenu (pomme, sandwich). */
  eat(onDone?: () => void): boolean {
    if (!this.item?.def.food || this.phase !== 'hold' || this.stack.length || this.item.portion <= 0) return false;
    this.bitten = false;
    this.start('eat', onDone);
    return true;
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

  /**
   * Repose l'objet tenu à l'endroit `spot` (sol ou dessus d'un meuble), tourné de `yaw`. Une pile
   * se repose à plat, telle quelle ; `upright` : debout (livre rangé).
   */
  drop(spot: THREE.Vector3, yaw: number, onDone?: () => void, upright = false): boolean {
    if (!this.item || this.phase !== 'hold') return false;
    this.groundRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // à plat : une pile, ou un objet qui se pose couché (livre), sauf rangé debout (bibliothèque)
    if (!upright && (this.stack.length || this.item.def.layFlat)) this.groundRot.multiply(LAY_FLAT);
    this.groundPos.copy(spot).setY(spot.y + this.item.restLift(this.groundRot));
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
    const next: Partial<Record<Phase, Phase>> = { reach: 'lift', lift: 'hold', lower: 'release', release: 'idle', add: 'hold', store: 'hold', drink: 'hold', eat: 'hold', open: 'read', close: 'hold', throw: 'idle', brace: 'push', unbrace: 'idle', let: 'idle' };
    const n = next[this.phase]!;
    if (this.phase === 'lower' && this.item) {
      // l'objet quitte la main : on part de sa pose en main pour le fondu vers le sol
      this.heldPos.copy(this.item.object.position);
      this.heldRot.copy(this.item.object.quaternion);
    }
    if (this.phase === 'store') {
      const top = this.stack.pop()!;
      top.item.object.position.copy(top.leaving!.pos);
      top.item.object.quaternion.copy(top.leaving!.rot);
    }
    this.phase = n;
    this.t = 0;
    if (n === 'idle' && this.item) {
      this.item.object.position.copy(this.groundPos);
      this.item.object.quaternion.copy(this.groundRot);
      this.placeStack(this.groundPos, this.groundRot, true);
      this.stack = [];
      this.item = null;
    }
    if (n === 'idle') this.braceAt = null;
    if (n === 'hold' || n === 'idle' || n === 'push') {
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
      case 'hold':
      case 'drink':
      case 'eat':
      case 'open':
      case 'read':
      case 'close': return { w: 1, r: 0, c: 0 };
      // le bras revient à la pose animée après le lancer
      // au-dessus de l'évier, le buste se penche un peu
      case 'brace': return { w: k, r: 0, c: this.braceGrip === 'wash' ? k : 0 };
      case 'push': return { w: 1, r: 0, c: this.braceGrip === 'wash' ? 1 - 0.6 * this.splashAmount() : 0 };
      case 'unbrace': return { w: 1 - k, r: 0, c: this.braceGrip === 'wash' ? 1 - k : 0 };
      // l'objet s'est brisé en main : le bras retombe
      case 'let': return { w: 1 - k, r: 0, c: 0 };
      case 'throw': return { w: 1 - ease(THREE.MathUtils.clamp((this.t - THROW_SWING) / (DURATION.throw - THROW_SWING), 0, 1)), r: 0, c: 0 };
      case 'lower': return { w: 1, r: k, c: k };
      case 'release': return { w: 1 - k, r: 1, c: 1 - k };
      // on se penche un peu pour attraper / poser un livre sans lâcher la pile
      case 'add':
      case 'store': return { w: 1, r: 0, c: 0.6 * Math.sin(Math.PI * Math.min(1, this.t / DURATION[this.phase])) };
      default: return { w: 0, r: 0, c: 0 };
    }
  }

  apply(dt: number): void {
    this.advance(dt);
    if (this.phase === 'idle' || (!this.item && this.phase !== 'throw' && this.phase !== 'let' && !this.bracing)) return;
    if (this.phase !== 'reach') for (const e of this.stack) e.age += dt;
    if (this.bracing) this.washT += dt;
    const { w, r, c } = this.weights();
    this.sip = this.phase === 'drink' || this.phase === 'eat' ? this.sipAmount() : 0;
    this.swing = this.phase === 'throw' ? this.throwSwing() : null;
    // gorgée : le niveau baisse quand la tasse est à la bouche
    if (this.sip > 0.9 && this.item?.contents) {
      this.item.setLevel(this.item.level - SIP_RATE * dt);
      if (this.item.level <= 0) this.item.contents = null;
    }
    // bouchée : une fois l'aliment à la bouche
    if (this.phase === 'eat' && this.sip > 0.95 && !this.bitten && this.item) {
      this.bitten = true;
      this.item.bite();
    }
    this.saved = this.touched.map((node) => ({ node, q: node.quaternion.clone(), p: node.position.clone() }));
    const root = this.rig.vrm.scene;
    root.updateMatrixWorld(true);
    const scale = root.getWorldScale(new THREE.Vector3()).y;
    if (c > 0) this.crouch(c, scale);
    // lecture : la tête se penche vers le livre
    const open = this.openAmount();
    const neck = this.rig.node('neck');
    if (open > 0 && neck) neck.quaternion.multiply(this.rig.local(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), READ_NOD * open)));
    // repère du buste (après la flexion)
    const chest = this.rig.node('upperChest') ?? this.rig.node('chest')!;
    this.rig.worldRot(chest, this.chestRot);
    this.blendPose = null;
    let hands: Side[];
    if (this.phase === 'open' || this.phase === 'close') {
      // fondu entre la prise normale et la lecture : on calcule les deux poses des bras
      const a = this.spec();
      this.pose(a, r, scale);
      const poseA = this.itemPose(a);
      const armA = new Map<THREE.Object3D, THREE.Quaternion>();
      for (const side of SIDES) for (const n of this.armNodes[side]) armA.set(n, n.quaternion.clone());
      for (const sv of this.saved) if (armA.has(sv.node)) sv.node.quaternion.copy(sv.q);
      const b = GRIPS.read;
      this.pose(b, r, scale);
      const poseB = this.itemPose(b);
      for (const [n, q] of armA) n.quaternion.copy(q.slerp(n.quaternion, open));
      this.blendPose = { pos: poseA.pos.lerp(poseB.pos, open), rot: poseA.rot.slerp(poseB.rot, open) };
      this.item!.setOpen(open > 0.5);
      hands = [...SIDES];
    } else {
      const spec = this.bracing ? GRIPS[this.braceGrip] : this.phase === 'read' ? GRIPS.read : this.spec();
      hands = this.pose(spec, r, scale);
    }
    // fondu entre la pose animée et la pose calculée
    if (w < 1) {
      for (const s of this.saved) {
        if (hands.some((h) => this.armNodes[h].has(s.node))) s.node.quaternion.copy(s.q.clone().slerp(s.node.quaternion, w));
      }
    }
    root.updateMatrixWorld(true);
    if (this.phase === 'throw' && this.item && this.t >= THROW_RELEASE) this.release();
  }

  /** Position de la main pendant le lancer : en arrière, puis le fouetté vers l'avant. */
  private throwSwing(): { reach: THREE.Vector3; pole: THREE.Vector3 } {
    const hold = vec(this.spec().right.reach);
    const holdPole = vec(this.spec().right.pole);
    const back = vec(flip(THROW_BACK.reach, this.side)), backPole = vec(flip(THROW_BACK.pole, this.side));
    const front = vec(flip(THROW_FRONT.reach, this.side)), frontPole = vec(flip(THROW_FRONT.pole, this.side));
    const t = this.t;
    if (t < THROW_WIND) {
      const k = ease(t / THROW_WIND);
      return { reach: hold.lerp(back, k), pole: holdPole.lerp(backPole, k) };
    }
    // le fouetté accélère
    const k = Math.pow(Math.min(1, (t - THROW_WIND) / (THROW_SWING - THROW_WIND)), 2);
    return { reach: back.lerp(front, k), pole: backPole.lerp(frontPole, k) };
  }

  /** L'objet quitte la main : vers l'avant du perso, en cloche. */
  private release(): void {
    const item = this.item!;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.chestRot).setY(0).normalize();
    const vel = fwd.multiplyScalar(THROW_SPEED).setY(THROW_LIFT);
    this.item = null;
    const cb = this.onThrow;
    this.onThrow = null;
    cb?.(item, vel);
  }

  /** Place les bras pour la prise `spec` ; renvoie les mains utilisées. */
  private pose(spec: GripSpec, r: number, scale: number): Side[] {
    const hands: Side[] = spec.left ? ['right', 'left'] : [this.side];
    const center = this.twoHandCenter(spec, r);
    for (const side of hands) this.arm(side, side === 'left' && spec.left ? spec.left : spec.right, spec, r, scale, center);
    return hands;
  }

  /** Livre ouvert : 0 fermé, 1 ouvert (fondu pendant l'ouverture et la fermeture). */
  private openAmount(): number {
    const k = ease(Math.min(1, this.t / (DURATION[this.phase] || 1)));
    if (this.phase === 'open') return k;
    if (this.phase === 'close') return 1 - k;
    return this.phase === 'read' ? 1 : 0;
  }

  /** Pose de l'objet d'après les cibles des mains de cette image (prise `spec`). */
  private itemPose(spec: GripSpec): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion();
    if (spec.left) {
      pos.copy(this.palms.left!).add(this.palms.right!).multiplyScalar(0.5);
      rot.copy(this.chestRot).multiply(gripRotation(spec));
    } else {
      pos.copy(this.palms[this.side]!);
      rot.copy(this.handRots[this.side]!).multiply(gripRotation(spec));
    }
    pos.sub(this.pointFor(spec).applyQuaternion(rot));
    return { pos, rot };
  }

  /** Point de l'objet placé au centre de la prise : le milieu du livre ouvert, sinon le point saisi. */
  private pointFor(spec: GripSpec): THREE.Vector3 {
    return spec === GRIPS.read ? this.item!.box.getCenter(new THREE.Vector3()) : this.gripPoint();
  }

  /** Toilette : 0 mains sous l'eau, 1 mains au visage (en boucle, seulement une fois en appui). */
  private splashAmount(): number {
    if (!this.washFace || this.phase !== 'push') return 0;
    const S = SPLASH, T = S.basin + S.up + S.face + S.down;
    // le temps compté depuis la fin de la pose des mains
    const t = Math.max(0, this.washT - DURATION.brace) % T;
    if (t < S.basin) return 0;
    if (t < S.basin + S.up) return ease((t - S.basin) / S.up);
    if (t < S.basin + S.up + S.face) return 1;
    return ease(1 - (t - S.basin - S.up - S.face) / S.down);
  }

  /** Tasse vers la bouche : monte, reste le temps de la gorgée, redescend. */
  private sipAmount(): number {
    const t = this.t, T = DURATION[this.phase];
    if (t < SIP_UP) return ease(t / SIP_UP);
    if (t > T - SIP_DOWN) return ease(Math.max(0, (T - t) / SIP_DOWN));
    return 1;
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
    const sipping = this.sip > 0 && side === this.side && !spec.left;
    if (sipping) {
      // tasse inclinée vers la bouche : rotation autour de l'axe gauche-droite du buste
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(this.chestRot);
      handRot.premultiply(new THREE.Quaternion().setFromAxisAngle(across, -(this.phase === 'eat' ? BITE_TILT : this.item?.def.mouth ? NECK_TILT : SIP_TILT) * this.sip));
    }
    // où va le centre de la paume
    let palmTarget: THREE.Vector3;
    if (this.braceAt && spec === GRIPS.push) {
      palmTarget = this.braceAt()[side];
    } else if (this.braceAt && spec === GRIPS.wash) {
      // les mains se frottent l'une contre l'autre sous l'eau
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(this.chestRot);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.chestRot);
      const s = Math.sin(this.washT * RUB_SPEED) * (side === 'right' ? 1 : -1);
      palmTarget = this.braceAt()[side].addScaledVector(fwd, RUB * s).addScaledVector(across, RUB * 0.3 * s);
      // toilette : de l'eau dans les mains, puis au visage
      const k = this.splashAmount();
      if (k > 0) {
        const rig = this.rig;
        const faceAt = rig.worldPos(rig.node('head')!).add(vec(flip(FACE_HOLD, side)).multiplyScalar(scale).applyQuaternion(this.chestRot));
        palmTarget.lerp(faceAt, k);
        const faceRot = basisRotation(rest.fingers, PALM_REST, vec(flip(FACE_HAND.fingers, side)).normalize().applyQuaternion(this.chestRot), vec(flip(FACE_HAND.palm, side)).normalize().applyQuaternion(this.chestRot));
        handRot.slerp(faceRot, k);
      }
    } else if (spec.left) {
      // les mains sur les flancs de l'objet : son axe qui va de gauche à droite une fois en main
      const inHands = gripRotation(spec);
      const across = new THREE.Vector3(1, 0, 0).applyQuaternion(inHands.clone().invert());
      const half = spec.width ? spec.width / 2 : Math.abs((this.item ?? this.lost)!.size.clone().applyQuaternion(inHands).x) / 2 + 0.015;
      let sideDir = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(this.chestRot);
      if (r > 0.5) {
        // objet encore posé : ses flancs, s'ils sont à peu près verticaux
        const onGround = across.clone().multiplyScalar(side === 'left' ? 1 : -1).applyQuaternion(this.itemRot());
        if (Math.abs(onGround.y) < 0.5) sideDir = onGround.setY(0).normalize();
      }
      palmTarget = center.clone().addScaledVector(sideDir, half);
    } else {
      const shoulder = rig.worldPos(upper);
      const reach = this.swing && side === this.side ? this.swing.reach : vec(hand.reach);
      const hold = shoulder.add(reach.clone().multiplyScalar(this.armLength(side)).applyQuaternion(this.chestRot));
      palmTarget = hold.lerp(this.target, r);
      if (sipping) {
        palmTarget.lerp(this.mouthHold(scale, side), this.sip);
        // le goulot (ou le bord croqué) aux lèvres plutôt que le bord de la tasse
        const mouth = this.item?.def.mouth;
        if (mouth) {
          const extra = vec(mouth).sub(this.item!.gripPoint).sub(CUP_LIP).applyQuaternion(handRot.clone().multiply(gripRotation(spec)));
          palmTarget.addScaledVector(extra, -this.sip);
          if (this.phase === 'drink') palmTarget.addScaledVector(vec(flip(NECK_IN, side)).multiplyScalar(scale).applyQuaternion(this.chestRot), this.sip);
        }
      }
    }
    const offset = mirror(vec(spec.hold), side).multiplyScalar(scale).applyQuaternion(handRot);
    const wrist = palmTarget.clone().sub(offset);
    const pole = (this.swing && side === this.side && !spec.left ? this.swing.pole.clone() : vec(hand.pole)).normalize();
    // gorgée : le coude descend sous la tasse
    if (sipping) pole.lerp(vec(flip(SIP_POLE, side)).normalize(), this.sip).normalize();
    pole.applyQuaternion(this.chestRot);
    solveTwoBone(rig, upper, lower, handNode, wrist, pole, rest.dir, rest.hinge);
    rig.setWorldRot(handNode, handRot);
    this.palms[side] = palmTarget;
    this.handRots[side] = handRot;
    this.curl(side, hand);
  }

  /** Où tenir la main pour que le bord de la tasse touche les lèvres (monde). */
  private mouthHold(scale: number, side: Side): THREE.Vector3 {
    const rig = this.rig;
    const head = rig.worldPos(rig.node('head')!);
    return head.add(vec(flip(SIP_MOUTH, side)).multiplyScalar(scale).applyQuaternion(this.chestRot));
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
    const spec = this.phase === 'read' ? GRIPS.read : this.spec();
    const rig = this.rig;
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion();
    if (this.blendPose) {
      pos.copy(this.blendPose.pos);
      rot.copy(this.blendPose.rot);
    } else {
      if (spec.left) {
        pos.copy(this.palms.left!).add(this.palms.right!).multiplyScalar(0.5);
        rot.copy(this.chestRot).multiply(gripRotation(spec));
      } else {
        const hand = `${this.side}Hand` as const;
        const handRot = rig.worldRot(rig.node(hand)!);
        const scale = rig.vrm.scene.getWorldScale(new THREE.Vector3()).y;
        pos.copy(rig.worldPos(rig.raw(hand)!)).add(mirror(vec(spec.hold), this.side).multiplyScalar(scale).applyQuaternion(handRot));
        rot.copy(handRot).multiply(gripRotation(spec));
      }
      // le point saisi de l'objet va au centre de la prise
      pos.sub(this.pointFor(spec).applyQuaternion(rot));
    }
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
    this.placeStack(o.position, o.quaternion, false);
  }

  /** Point saisi de l'objet tenu ; une pile se porte par en dessous (face opposée, +X). */
  private gripPoint(): THREE.Vector3 {
    const p = this.item!.gripPoint.clone();
    if (this.stack.length) p.x = this.item!.box.max.x;
    return p;
  }

  /** Place la pile sur l'objet tenu (pose `pos`, `rot`) : chaque objet sur le précédent. */
  private placeStack(pos: THREE.Vector3, rot: THREE.Quaternion, final: boolean): void {
    // chaque objet sur le précédent, vers -X (le haut, objet couché)
    let h = this.item!.box.min.x;
    for (const e of this.stack) {
      const o = e.item.object;
      const local = new THREE.Vector3(h - e.item.box.max.x, 0, 0);
      h -= e.item.size.x;
      const at = local.applyQuaternion(rot).add(pos);
      if (e.leaving && !final) {
        const k = ease(Math.min(1, this.t / DURATION.store));
        o.position.copy(at).lerp(e.leaving.pos, k);
        o.quaternion.copy(rot).slerp(e.leaving.rot, k);
      } else if (e.age < STACK_BLEND && !final) {
        const k = ease(e.age / STACK_BLEND);
        o.position.copy(e.fromPos).lerp(at, k);
        o.quaternion.copy(e.fromRot).slerp(rot, k);
      } else {
        o.position.copy(at);
        o.quaternion.copy(rot);
      }
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
