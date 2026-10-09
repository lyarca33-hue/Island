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
import { basisRotation, Rig, solveTwoBone, twistForearm } from './ik';
import { buildModel, hasLook } from './interior';
import { forgetGhosts, mergeStaticParts } from './merge';
import { buildFiller } from './remplissage';
import { showSpoiled } from './foodstates';

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
  /** Point calé dans la main une fois tenu (le dessous sur la paume, sinon le point saisi). */
  readonly holdPoint: THREE.Vector3;
  /** Niveau de remplissage d'un récipient (0 vide, 1 plein ; voir ItemDef.fill). */
  level = 0;
  /** Ce qu'il contient (« café »), ou null. */
  contents: string | null = null;
  /** Durabilité restante (points, sur maxDurability) ; à zéro, l'objet se brise. */
  durability: number;
  /** Part qui reste d'un aliment (1 entier, 0 mangé ; voir ItemDef.food). */
  portion = 1;
  /** Vaisselle sale (voir ItemDef.dish) : sa pièce `sale` est montrée. */
  dirty = false;
  /**
   * Vaisselle lavée à la main, encore mouillée (1 sortie de l'eau, 0 sèche) : des gouttes perlent
   * dessus. Elle sèche toute seule (vite à l'égouttoir) ou d'un coup de torchon.
   */
  wet = 0;
  /** Temps passé sur le feu (s, à pleine chaleur) d'un ingrédient : voir ItemDef.cook. */
  cooking = 0;
  /** Âge d'un aliment (heures de jeu hors du frigo, voir freshness.ts) : il finit périmé. */
  age = 0;
  /** Chaleur d'un aliment (1 sort du feu, 0 froid) ; `warmed` : il a été chauffé une fois (on peut dire « froid »). */
  heat = 0;
  warmed = false;
  /** Étoiles de base d'un plat préparé (1 à 5) ; 0 : pas un plat (une pomme, une carotte crue). */
  stars = 0;

  private closed: THREE.Object3D;
  private opened: THREE.Object3D | null = null;
  /** Silhouette montrée à la place de l'objet rangé hors de vue (voir setStowed). */
  private filler: THREE.Mesh | null = null;

  constructor(readonly def: ItemDef) {
    // le modèle du pack intérieur s'il habille cette fiche (interior.ts), sinon celui fait par programme
    const model = buildModel(def);
    // pièces fixes regroupées : bien moins de dessins (voir merge.ts)
    mergeStaticParts(model);
    this.closed = model;
    this.object.add(model);
    this.object.name = def.id;
    this.box = new THREE.Box3().setFromObject(model);
    this.box.getSize(this.size);
    if (def.buildOpen) {
      // livre ouvert : centré sur le livre fermé, caché (hors de la boîte de l'objet)
      this.opened = def.buildOpen();
      mergeStaticParts(this.opened);
      this.opened.position.copy(this.box.getCenter(new THREE.Vector3()));
      this.opened.visible = false;
      this.object.add(this.opened);
    }
    this.grip = def.grip ?? guessGrip(this.size);
    this.gripPoint = def.gripPoint ? vec(def.gripPoint) : new THREE.Vector3(0, this.size.y / 2, 0);
    const c = this.box.getCenter(new THREE.Vector3());
    this.holdPoint = GRIPS[this.grip].point === 'bottom' ? new THREE.Vector3(c.x, this.box.min.y, c.z) : this.gripPoint.clone();
    if (def.fill) this.setLevel(def.startFull ? 1 : 0);
    this.contents = def.startFull ?? null;
    this.durability = this.maxDurability;
    if (def.dish) this.setDirty(false);
    const morsel = this.part('bouchee');
    if (morsel) morsel.visible = false;
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

  /**
   * Rhabille l'objet avec le modèle du pack intérieur, une fois chargé (interior.ts) : même boîte,
   * mêmes pièces nommées, même usure. Sans effet sur les fiches que le pack n'habille pas.
   */
  restyle(): void {
    if (!hasLook(this.def)) return;
    const model = buildModel(this.def);
    mergeStaticParts(model);
    model.visible = this.closed.visible;
    forgetGhosts(this.closed);
    this.object.remove(this.closed);
    this.closed = model;
    this.object.add(model);
    showWear(this.object, this.condition);
  }

  /** Rangé derrière une porte ou dans un tiroir : seule sa silhouette se voit (remplissage.ts). */
  get stowed(): boolean {
    return !!this.filler?.visible;
  }

  /** Range l'objet hors de vue (sa silhouette à sa place) ou le montre. */
  setStowed(stowed: boolean): void {
    if (stowed === this.stowed) return;
    if (stowed && !this.filler) {
      this.filler = buildFiller(this.closed, this.box);
      this.object.add(this.filler);
    }
    if (this.filler) this.filler.visible = stowed;
    this.closed.visible = !stowed && !this.opened?.visible;
    if (stowed && this.opened) this.opened.visible = false;
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

  /** Salit ou lave la vaisselle (assiette, couverts, tasse). */
  setDirty(dirty: boolean): void {
    this.dirty = dirty;
    const stain = this.part('sale');
    if (stain) stain.visible = dirty;
  }

  /** Mouille (1) ou sèche (0) la vaisselle : les gouttes se montrent tant qu'il en reste. */
  setWet(wet: number): void {
    this.wet = THREE.MathUtils.clamp(wet, 0, 1);
    let drops = this.part('gouttes');
    if (!drops && this.wet > 0) drops = this.addDrops();
    if (drops) drops.visible = this.wet > 0;
  }

  /** Taches de moisissure sur un aliment périmé (créées la première fois). */
  setMoldy(on: boolean): void {
    // un aliment Tripo qui a sa texture périmée (foodstates.ts) la prend à la place des taches
    let painted = false;
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh && showSpoiled(o.material as THREE.MeshToonMaterial, on)) painted = true;
    });
    if (painted) return;
    let spots = this.part('moisi');
    if (!spots && on) spots = this.addSpots('moisi', 0x7d8f5a, 9, 0.006);
    if (spots) spots.visible = on;
  }

  /** Volutes de vapeur au-dessus d'un plat chaud ; `k` de 0 (rien) à 1. */
  setSteam(k: number): void {
    let steam = this.part('vapeur');
    if (!steam && k > 0) {
      steam = new THREE.Group();
      steam.name = 'vapeur';
      const b = this.box;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
      const geo = new THREE.CylinderGeometry(0.003, 0.006, 0.06, 6);
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(geo, mat);
        w.name = 'vapeur';
        w.position.set((i - 1) * 0.025, b.max.y + 0.035, ((i % 2) - 0.5) * 0.02);
        w.raycast = () => {};
        steam.add(w);
      }
      this.object.add(steam);
    }
    if (!steam) return;
    steam.visible = k > 0.02;
    for (const w of steam.children) ((w as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 * k;
  }

  /** Petites taches rondes posées sur le dessus de l'objet (moisissure). */
  private addSpots(name: string, color: THREE.ColorRepresentation, n: number, r: number): THREE.Object3D {
    const g = new THREE.Group();
    g.name = name;
    const b = this.box, c = b.getCenter(new THREE.Vector3());
    const rx = (b.max.x - b.min.x) / 2, rz = (b.max.z - b.min.z) / 2;
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, k = 0.2 + 0.6 * ((i * 0.618) % 1);
      const spot = new THREE.Mesh(geo, mat);
      spot.name = name;
      const s = r * (0.7 + 0.6 * ((i * 0.382) % 1));
      spot.scale.set(s, s * 0.4, s);
      spot.position.set(c.x + Math.cos(a) * rx * k, b.max.y, c.z + Math.sin(a) * rz * k);
      g.add(spot);
    }
    this.object.add(g);
    return g;
  }

  /** Gouttes d'eau sur le bord et le fond (créées à la première vaisselle, hors de la boîte de l'objet). */
  private addDrops(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'gouttes';
    const b = this.box, c = b.getCenter(new THREE.Vector3());
    const rx = (b.max.x - b.min.x) / 2, rz = (b.max.z - b.min.z) / 2;
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.8, depthWrite: false });
    const geo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 7; i++) {
      // réparties en spirale (angle d'or), entre le bord et le haut de l'objet
      const a = i * 2.39996, k = 0.55 + 0.4 * ((i * 0.618) % 1);
      const drop = new THREE.Mesh(geo, mat);
      drop.name = 'gouttes';
      const r = 0.0035 + 0.0015 * (i % 3);
      drop.scale.set(r, r * 1.3, r);
      drop.position.set(c.x + Math.cos(a) * rx * k, b.min.y + (b.max.y - b.min.y) * (0.35 + 0.6 * ((i * 0.382) % 1)), c.z + Math.sin(a) * rz * k);
      g.add(drop);
    }
    this.object.add(g);
    return g;
  }

  /** Une bouchée : l'aliment rétrécit (autour du point tenu, il reste dans la main). */
  bite(): void {
    if (!this.def.food) return;
    this.setPortion(this.portion - 1 / this.def.food.bites);
  }

  /** Part qui reste (1 entier, 0 mangé) : l'aliment rétrécit d'autant. */
  setPortion(portion: number): void {
    if (!this.def.food) return;
    this.portion = THREE.MathUtils.clamp(portion, 0, 1);
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

type Phase = 'idle' | 'reach' | 'lift' | 'hold' | 'lower' | 'release' | 'add' | 'store' | 'drink' | 'eat' | 'open' | 'read' | 'close' | 'throw' | 'brace' | 'push' | 'unbrace' | 'let' | 'cut' | 'pour';

const DURATION: Record<Phase, number> = { idle: 0, reach: 0.6, lift: 0.6, hold: 0, lower: 0.6, release: 0.5, add: 0.9, store: 0.9, drink: 2.4, eat: 1.8, open: 0.7, read: 0, close: 0.6, throw: 0.95, brace: 0.5, push: 0, unbrace: 0.4, let: 0.45, cut: 2.6, pour: 2.4 };
/** Temps pour qu'un objet ajouté à la pile y trouve sa place (s) : la main l'y ramène (moitié de DURATION.add). */
const STACK_BLEND = 0.45;
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
 * réglé pour lui. Un objet qui a son propre point `mouth` (goulot) ou `lip` (bord du verre) est
 * décalé d'autant.
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

/** Lâché : temps pour que l'objet finisse de se poser, s'il n'y était pas tout à fait (s). */
const SNAP = 0.25;
/**
 * Saisie : l'objet reste collé à la main tel qu'elle l'a touché, puis glisse dans la prise
 * pendant ce temps (s) ; à la dépose, il prend sa pose au sol dans la main avant d'être lâché.
 */
const SETTLE = 0.35;
/** Main ouverte, en approche d'un objet ou en le lâchant (degrés par phalange, pouce). */
const OPEN_HAND = { curl: 6, thumb: 8 };
/** Les doigts se referment sur l'objet sur la fin de l'approche (part de DURATION.reach). */
const CLOSE_FROM = 0.72;
/** Temps pour ouvrir la main en lâchant un objet (s). */
const OPEN_TIME = 0.18;
/** Poignet tourné vers l'objet pendant l'approche (part de l'angle entre la prise et le bras). */
const WRIST_FOLLOW = 0.4;
/**
 * S'accroupir plus bas si la main n'atteint pas l'objet (au sol) : descente du bassin et flexion
 * du buste en plus, au plus (part de la taille, degrés).
 */
const CROUCH_DROP_MAX = 0.55;
const CROUCH_BEND_MAX = 35;

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
const DOWN = new THREE.Vector3(0, -1, 0);
/** Les bras approchent leur cible en douceur au-delà de cette part de leur longueur (voir solveTwoBone). */
const ARM_SOFT = 0.9;
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

/**
 * Couper sur la planche : le couteau tenu pointe vers l'avant et le bas (doigts vers le bas, paume
 * vers l'intérieur, repère du buste, main droite) ; la main monte et descend au-dessus de
 * l'aliment (hauteur au-dessus de lui en bas du geste et course en m, vitesse en rad/s), un peu
 * en retrait pour que la lame, pas le poing, arrive dessus.
 */
const CUT_HAND = { fingers: [0, -0.92, -0.38] as [number, number, number], palm: [1, 0, 0] as [number, number, number] };
/** Se frotter avec la serviette : doigts vers le haut, paume vers le corps (main droite, repère du buste). */
const RUB_HAND = { fingers: [0, 0.8, -0.6] as [number, number, number], palm: [1, 0, -0.3] as [number, number, number] };
const CUT_ABOVE = 0.07;
const CUT_LIFT = 0.06;
const CUT_BACK = 0.12;
const CUT_SPEED = 11;
/** Temps pour amener le couteau au-dessus de l'aliment, et pour le ramener (s). */
const CUT_EASE = 0.35;

/** Verser : le récipient au-dessus de l'autre, incliné (rad), le temps d'y aller et d'en revenir (s). */
const POUR_TILT = THREE.MathUtils.degToRad(95);
const POUR_EASE = 0.55;
/** Hauteur du poing au-dessus du point où l'on verse (m). */
const POUR_ABOVE = 0.16;

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
  /** Bouchée prise avec un couvert (manger dans l'assiette) : appelée à la place de bite(). */
  private onBite: (() => void) | null = null;
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
  /** Couper : le point de l'aliment (monde) au-dessus duquel va la lame. */
  private cutAt: (() => THREE.Vector3) | null = null;
  /** Se frotter (serviette) : où vont les deux mains pendant le geste (monde), l'autre main comprise. */
  private rubAt: (() => Record<Side, THREE.Vector3>) | null = null;
  /** Le frottement continue d'un geste à l'autre : les mains n'y reviennent pas (début), ne repartent pas (fin). */
  private rubFrom = false;
  private rubOn = false;
  /** Verser : au-dessus de quel point (monde) on incline le récipient tenu. */
  private pourAt: (() => THREE.Vector3) | null = null;
  /** Main imposée par un geste (lancer) : position depuis l'épaule et coude. */
  private swing: { reach: THREE.Vector3; pole: THREE.Vector3 } | null = null;
  /** Pose de l'objet dans la main au moment où elle le touche (voir SETTLE). */
  private contact: { pos: THREE.Vector3; rot: THREE.Quaternion } | null = null;

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
  /** Où est la paume de cette main (monde), si elle a été placée. */
  palm(side: Side): THREE.Vector3 | null {
    return this.palms[side]?.clone() ?? null;
  }

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

  /**
   * Prend une bouchée de l'aliment tenu (pomme, sandwich) ; avec un couvert (fourchette),
   * `onBite` est appelé quand il arrive à la bouche (la bouchée vient de l'assiette).
   */
  eat(onDone?: () => void, onBite?: () => void): boolean {
    if (!this.item || this.phase !== 'hold' || this.stack.length) return false;
    if (!onBite && (!this.item.def.food || this.item.portion <= 0)) return false;
    this.bitten = false;
    this.onBite = onBite ?? null;
    this.start('eat', onDone);
    return true;
  }

  /**
   * Coupe avec le couteau tenu : la lame va et vient au-dessus du point `at()` (monde, le dessus de
   * l'aliment posé sur la planche, ou dans l'assiette pour le couteau de table) ; `onDone` une fois
   * le couteau revenu en main.
   */
  cut(at: () => THREE.Vector3, onDone?: () => void, rub?: { at: () => Record<Side, THREE.Vector3>; from: boolean; on: boolean }): boolean {
    if (!(this.item?.def.knife || this.item?.def.wipes || this.item?.def.towel || this.item?.def.bathTowel || this.item?.def.stirs || this.item?.def.grates || this.item?.def.sweeps || this.item?.def.mops || this.item?.def.spray || this.item?.name === 'couteau de table') || this.phase !== 'hold' || this.stack.length) return false;
    this.cutAt = at;
    this.rubAt = rub?.at ?? null;
    this.rubFrom = !!rub?.from;
    this.rubOn = !!rub?.on;
    // le buste se penche vers la planche (voir weights)
    this.target.copy(at());
    this.start('cut', onDone);
    return true;
  }

  /**
   * Verse le contenu du récipient tenu : la main l'amène au-dessus du point `at()` (monde) et
   * l'incline, puis le ramène ; `onDone` une fois revenu en main. Le niveau, c'est Game qui le règle.
   */
  pour(at: () => THREE.Vector3, onDone?: () => void): boolean {
    if (!this.item || this.phase !== 'hold' || this.stack.length) return false;
    this.pourAt = at;
    this.target.copy(at());
    this.start('pour', onDone);
    return true;
  }

  /** Part du geste « verser » : 0 tenu normalement, 1 incliné au-dessus (fondu au début et à la fin). */
  get pouring(): number {
    if (this.phase !== 'pour') return 0;
    const t = this.t, T = DURATION.pour;
    return ease(THREE.MathUtils.clamp(Math.min(t / POUR_EASE, (T - t) / POUR_EASE), 0, 1));
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
   * se repose à plat, telle quelle ; `upright` : debout (livre rangé). `hung` : accroché au mur
   * (barre à couteaux, porte-papier), tourné ainsi, son origine en `spot`.
   */
  drop(spot: THREE.Vector3, yaw: number, onDone?: () => void, upright = false, hung?: THREE.Quaternion): boolean {
    if (!this.item || this.phase !== 'hold') return false;
    this.groundRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // à plat : une pile, ou un objet qui se pose couché (livre), sauf rangé debout (bibliothèque)
    if (!upright && (this.stack.length || this.item.def.layFlat)) this.groundRot.multiply(LAY_FLAT);
    if (hung) this.groundRot.copy(hung);
    this.groundPos.copy(spot).setY(spot.y + (hung ? 0 : this.item.restLift(this.groundRot)));
    this.target.copy(this.item.gripPoint).applyQuaternion(this.groundRot).add(this.groundPos);
    this.start('lower', onDone);
    return true;
  }

  private start(phase: Phase, onDone?: () => void): void {
    this.phase = phase;
    this.t = 0;
    this.onDone = onDone ?? null;
    this.contact = null;
  }

  private advance(dt: number): void {
    if (!DURATION[this.phase]) return;
    this.t += dt;
    if (this.t < DURATION[this.phase]) return;
    const next: Partial<Record<Phase, Phase>> = { reach: 'lift', lift: 'hold', lower: 'release', release: 'idle', add: 'hold', store: 'hold', cut: 'hold', pour: 'hold', drink: 'hold', eat: 'hold', open: 'read', close: 'hold', throw: 'idle', brace: 'push', unbrace: 'idle', let: 'idle' };
    const n = next[this.phase]!;
    if (this.phase === 'lower' && this.item) {
      // l'objet quitte la main : on part de sa pose en main pour le fondu vers le sol
      this.heldPos.copy(this.item.object.position);
      this.heldRot.copy(this.item.object.quaternion);
    }
    if (this.phase === 'cut') this.cutAt = this.rubAt = null;
    if (this.phase === 'pour') this.pourAt = null;
    if (this.phase === 'store') {
      const top = this.stack.pop()!;
      top.item.object.position.copy(top.leaving!.pos);
      top.item.object.quaternion.copy(top.leaving!.rot);
    }
    this.phase = n;
    this.t = 0;
    this.contact = null;
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
      // au-dessus de la planche, le buste se penche un peu
      case 'cut': return { w: 1, r: 0, c: this.cutAmount() };
      case 'pour': return { w: 1, r: 0, c: 0.5 * this.pouring };
      // l'objet s'est brisé en main : le bras retombe
      case 'let': return { w: 1 - k, r: 0, c: 0 };
      case 'throw': return { w: 1 - ease(THREE.MathUtils.clamp((this.t - THROW_SWING) / (DURATION.throw - THROW_SWING), 0, 1)), r: 0, c: 0 };
      case 'lower': return { w: 1, r: k, c: k };
      case 'release': return { w: 1 - k, r: 1, c: 1 - k };
      // on se penche pour attraper / poser un livre sans lâcher la pile (une main va le chercher)
      case 'add':
      case 'store': return { w: 1, r: 0, c: Math.sin(Math.PI * Math.min(1, this.t / DURATION[this.phase])) };
      default: return { w: 0, r: 0, c: 0 };
    }
  }

  apply(dt: number): void {
    this.advance(dt);
    if (this.phase === 'idle' || (!this.item && this.phase !== 'throw' && this.phase !== 'let' && !this.bracing)) return;
    // le livre ajouté attend que la main l'ait rejoint
    const adding = this.phase === 'add' && this.t < DURATION.add / 2 ? this.stack[this.stack.length - 1] : null;
    if (this.phase !== 'reach') for (const e of this.stack) if (e !== adding) e.age += dt;
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
      if (this.onBite) this.onBite();
      else this.item.bite();
      this.onBite = null;
    }
    this.saved = this.touched.map((node) => ({ node, q: node.quaternion.clone(), p: node.position.clone() }));
    const root = this.rig.vrm.scene;
    root.updateMatrixWorld(true);
    const scale = root.getWorldScale(new THREE.Vector3()).y;
    const bent = c > 0 ? this.crouch(c, scale, this.reachesTarget ? this.side : null) : 0;
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
    // penché en avant, la main libre pend au lieu de partir en arrière avec le buste
    const hang = THREE.MathUtils.clamp(bent / 60, 0, 1);
    if (hang > 0) for (const side of SIDES) if (!hands.includes(side)) this.hangArm(side, hang);
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
    const center = this.twoHandCenter(spec, r);
    if (!spec.left && this.rubAt) {
      // se frotter : l'autre main vient tenir l'autre bout (sa prise en miroir)
      const other: Side = this.side === 'right' ? 'left' : 'right';
      const mirrored = sided(GRIPS[this.grip], other);
      this.arm(this.side, spec.right, spec, r, scale, center);
      this.arm(other, mirrored.right, mirrored, r, scale, center);
      return [this.side, other];
    }
    const hands: Side[] = spec.left ? ['right', 'left'] : [this.side];
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

  /** Couteau au-dessus de l'aliment : 0 tenu normalement, 1 en train de couper (fondu au début et à la fin). */
  private cutAmount(): number {
    if (this.phase !== 'cut') return 0;
    const t = this.t, T = DURATION.cut;
    return ease(Math.min(1, t / CUT_EASE, (T - t) / CUT_EASE));
  }

  /** Mains aux points du frottement : comme couper, sans retour entre deux gestes enchaînés. */
  rubAmount(): number {
    if (this.phase !== 'cut' || !this.rubAt) return 0;
    const t = this.t, T = DURATION.cut;
    return ease(Math.min(1, this.rubFrom ? 1 : t / CUT_EASE, this.rubOn ? 1 : (T - t) / CUT_EASE));
  }

  /** Tasse vers la bouche : monte, reste le temps de la gorgée, redescend. */
  private sipAmount(): number {
    const t = this.t, T = DURATION[this.phase];
    if (t < SIP_UP) return ease(t / SIP_UP);
    if (t > T - SIP_DOWN) return ease(Math.max(0, (T - t) / SIP_DOWN));
    return 1;
  }

  /** La main va-t-elle vers la cible (objet à prendre, endroit où le poser, livre de la pile) ? */
  private get reachesTarget(): boolean {
    return this.phase === 'reach' || this.phase === 'lift' || this.phase === 'lower' || this.phase === 'release' || this.phase === 'add' || this.phase === 'store';
  }

  /**
   * Penche le buste et plie les jambes (pieds fixes) selon la hauteur de la cible ; si la main
   * de `reach` n'y arrive pas encore (objet au sol), on descend plus bas.
   */
  private crouch(c: number, scale: number, reach: Side | null): number {
    const rig = this.rig;
    const low = THREE.MathUtils.clamp((0.85 * scale - this.target.y) / (0.75 * scale), 0, 1);
    const feet = SIDES.map((side) => {
      const foot = rig.node(`${side}Foot`)!;
      return { side, pos: rig.worldPos(foot), rot: rig.worldRot(foot) };
    });
    const hips = rig.node('hips')!;
    const hipsScale = hips.parent!.getWorldScale(new THREE.Vector3()).y;
    const hipsY = hips.position.y;
    const spine = (['spine', 'chest'] as const).map((n) => rig.node(n)).filter((n): n is THREE.Object3D => !!n);
    const rest = spine.map((n) => n.quaternion.clone());
    const armLen = reach ? this.armLength(reach) : 0;
    let drop = 0.3 * low, bendMore = 0, deg = 0;
    for (let i = 0; i < 6; i++) {
      hips.position.y = hipsY - (drop * scale * c) / hipsScale;
      deg = (15 + 50 * low + bendMore) * c;
      const bend = THREE.MathUtils.degToRad(deg);
      spine.forEach((node, j) => node.quaternion.copy(rest[j]).multiply(rig.local(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend / 2))));
      this.rig.vrm.scene.updateMatrixWorld(true);
      if (!reach) break;
      // ce qui manque au bras (presque tendu) pour toucher la cible
      const short = rig.worldPos(rig.node(`${reach}UpperArm`)!).distanceTo(this.target) - 0.92 * armLen;
      if (short < 0.005 * scale || (drop >= CROUCH_DROP_MAX && bendMore >= CROUCH_BEND_MAX)) break;
      // objet en hauteur (table) : on se penche plutôt ; au sol, on plie aussi les genoux
      drop = Math.min(CROUCH_DROP_MAX, drop + (short * low) / scale);
      bendMore = Math.min(CROUCH_BEND_MAX, bendMore + (40 * (2 - low) * short) / scale);
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.worldRot(hips));
    for (const f of feet) {
      const up = rig.node(`${f.side}UpperLeg`)!, mid = rig.node(`${f.side}LowerLeg`)!, foot = rig.node(`${f.side}Foot`)!;
      solveTwoBone(rig, up, mid, foot, f.pos, fwd, LEG_DIR, LEG_HINGE);
      rig.setWorldRot(foot, f.rot);
    }
    return deg;
  }

  /** Bras libre qui pend sous l'épaule, coude vers l'arrière (fondu `k` avec la pose animée). */
  private hangArm(side: Side, k: number): void {
    const rig = this.rig;
    const nodes = (['UpperArm', 'LowerArm', 'Hand'] as const).map((n) => rig.node(`${side}${n}`)!);
    const [upper, lower, hand] = nodes;
    const before = nodes.map((n) => n.quaternion.clone());
    const len = this.armLength(side);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.chestRot).setY(0).normalize();
    const out = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(this.chestRot).setY(0).normalize();
    const wrist = rig.worldPos(upper).addScaledVector(DOWN, 0.9 * len).addScaledVector(fwd, 0.15 * len).addScaledVector(out, 0.08 * len);
    const pole = fwd.clone().negate().addScaledVector(out, 0.4).normalize();
    const rest = ARM_REST[side];
    solveTwoBone(rig, upper, lower, hand, wrist, pole, rest.dir, rest.hinge, ARM_SOFT);
    twistForearm(rig, lower, hand, basisRotation(rest.fingers, PALM_REST, DOWN.clone().addScaledVector(fwd, 0.25).normalize(), out.clone().negate()));
    nodes.forEach((n, i) => n.quaternion.copy(before[i].slerp(n.quaternion, k)));
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
    const fetch = (this.phase === 'add' || this.phase === 'store') && side === this.side && !!spec.left;
    let anchorPalm: THREE.Vector3 | null = null;
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
      if (fetch) {
        // la prise reste où elle était (la pile ne bouge pas), la main va chercher le livre
        anchorPalm = palmTarget.clone();
        palmTarget.lerp(this.target, this.fetchAmount());
      }
    } else {
      const shoulder = rig.worldPos(upper);
      const reach = this.swing && side === this.side ? this.swing.reach : vec(hand.reach);
      const hold = shoulder.add(reach.clone().multiplyScalar(this.armLength(side)).applyQuaternion(this.chestRot));
      palmTarget = hold.lerp(this.target, r);
      if (r > 0 && !this.swing) {
        // en approche, le poignet suit un peu le bras : les doigts vers l'objet
        const along = palmTarget.clone().sub(rig.worldPos(upper)).normalize();
        const now = rest.fingers.clone().applyQuaternion(handRot);
        const turn = new THREE.Quaternion().setFromUnitVectors(now, along);
        handRot.premultiply(new THREE.Quaternion().slerp(turn, WRIST_FOLLOW * r));
      }
      const cutting = side === this.side && this.cutAt ? this.cutAmount() : 0;
      if (cutting > 0) {
        // la lame monte et descend au-dessus de l'aliment, le poing un peu en retrait
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.chestRot).setY(0).normalize();
        const lift = CUT_ABOVE + CUT_LIFT * (0.5 + 0.5 * Math.cos(this.t * CUT_SPEED));
        const food = this.cutAt!();
        const at = food.clone().addScaledVector(back, -CUT_BACK).setY(food.y + lift);
        palmTarget.lerp(at, cutting);
        const cutRot = basisRotation(rest.fingers, PALM_REST, vec(flip(CUT_HAND.fingers, side)).normalize().applyQuaternion(this.chestRot), vec(flip(CUT_HAND.palm, side)).normalize().applyQuaternion(this.chestRot));
        handRot.slerp(cutRot, cutting);
      }
      const pouring = side === this.side && this.pourAt ? this.pouring : 0;
      if (pouring > 0) {
        // le récipient au-dessus de l'autre, basculé vers l'avant
        const at = this.pourAt!();
        palmTarget.lerp(at.clone().setY(at.y + POUR_ABOVE), pouring);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.chestRot).setY(0).normalize();
        const axis = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
        handRot.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, POUR_TILT * pouring));
        // le goulot (ou le bord) au-dessus du point, pas le poing
        const item = this.item!;
        const lip = item.def.mouth ? vec(item.def.mouth) : new THREE.Vector3(0, item.def.fill?.[1] ?? item.size.y, 0);
        const off = lip.sub(item.holdPoint).applyQuaternion(handRot.clone().multiply(gripRotation(spec)));
        palmTarget.x -= off.x * pouring;
        palmTarget.z -= off.z * pouring;
      }
      if (sipping) {
        palmTarget.lerp(this.mouthHold(scale, side), this.sip);
        // le goulot (ou le bord croqué) aux lèvres plutôt que le bord de la tasse
        // un verre sans anse : son bord (ItemDef.lip) aux lèvres, incliné comme une tasse
        const neck = this.item?.def.mouth;
        const mouth = neck ?? (this.phase === 'drink' ? this.item?.def.lip : undefined);
        if (mouth) {
          const extra = vec(mouth).sub(this.item!.holdPoint).sub(CUP_LIP).applyQuaternion(handRot.clone().multiply(gripRotation(spec)));
          palmTarget.addScaledVector(extra, -this.sip);
          if (this.phase === 'drink' && neck) palmTarget.addScaledVector(vec(flip(NECK_IN, side)).multiplyScalar(scale).applyQuaternion(this.chestRot), this.sip);
        }
      }
    }
    const rubbing = this.rubAt ? this.rubAmount() : 0;
    if (rubbing > 0) {
      // les deux mains aux points donnés, paumes vers le corps
      palmTarget.lerp(this.rubAt!()[side], rubbing);
      const rubRot = basisRotation(rest.fingers, PALM_REST, vec(flip(RUB_HAND.fingers, side)).normalize().applyQuaternion(this.chestRot), vec(flip(RUB_HAND.palm, side)).normalize().applyQuaternion(this.chestRot));
      handRot.slerp(rubRot, rubbing);
    }
    const offset = mirror(vec(spec.hold), side).multiplyScalar(scale).applyQuaternion(handRot);
    const wrist = palmTarget.clone().sub(offset);
    const pole = (this.swing && side === this.side && !spec.left ? this.swing.pole.clone() : vec(hand.pole)).normalize();
    // gorgée : le coude descend sous la tasse
    if (sipping) pole.lerp(vec(flip(SIP_POLE, side)).normalize(), this.sip).normalize();
    pole.applyQuaternion(this.chestRot);
    solveTwoBone(rig, upper, lower, handNode, wrist, pole, rest.dir, rest.hinge, ARM_SOFT);
    twistForearm(rig, lower, handNode, handRot);
    this.palms[side] = anchorPalm ?? palmTarget;
    this.handRots[side] = handRot;
    this.curl(side, hand, this.grasp(fetch));
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

  /**
   * Main refermée sur l'objet (1) ou ouverte (0) : elle s'ouvre en approchant, se referme au
   * contact, se rouvre en le lâchant. `fetch` : la main qui va chercher un livre pour la pile.
   */
  private grasp(fetch = false): number {
    const T = DURATION[this.phase], u = T ? Math.min(1, this.t / T) : 1;
    switch (this.phase) {
      case 'reach': return ease(THREE.MathUtils.clamp((u - CLOSE_FROM) / (1 - CLOSE_FROM), 0, 1));
      case 'release':
      case 'let': return 1 - ease(Math.min(1, this.t / OPEN_TIME));
      case 'throw': return this.t < THROW_RELEASE ? 1 : 1 - ease(Math.min(1, (this.t - THROW_RELEASE) / OPEN_TIME));
      // la main s'ouvre en partant, se referme sur le livre (ajout) ; le lâche puis revient (rangement)
      case 'add': return fetch && u < 0.5 ? 1 - Math.sin(Math.PI * u * 2) : 1;
      case 'store': return fetch && u > 0.5 ? 1 - Math.sin(Math.PI * (u - 0.5) * 2) : 1;
      default: return 1;
    }
  }

  /** Main tendue vers la cible puis revenue (aller jusqu'à la moitié du geste, retour ensuite). */
  private fetchAmount(): number {
    const u = Math.min(1, this.t / DURATION[this.phase]);
    return u < 0.5 ? ease(u * 2) : 1 - ease((u - 0.5) * 2);
  }

  private curl(side: Side, hand: HandSpec, grasp = 1): void {
    const rig = this.rig;
    const sign = side === 'right' ? 1 : -1;
    for (const f of FINGERS) {
      const shut = f === 'Index' && hand.index !== undefined ? hand.index : hand.curl;
      const deg = THREE.MathUtils.lerp(OPEN_HAND.curl, shut, grasp);
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
      node.quaternion.copy(rig.local(new THREE.Quaternion().setFromAxisAngle(axis, sign * THREE.MathUtils.degToRad(THREE.MathUtils.lerp(OPEN_HAND.thumb, hand.thumb, grasp)))));
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
    if ((this.phase === 'lift' || this.phase === 'lower') && !this.blendPose) {
      // l'objet suit la main (ou les deux) : il ne glisse plus tout seul vers elle ni vers le sol
      const anchor = this.anchor(spec);
      const inHand = this.relative(anchor, pos, rot);
      let rel = inHand;
      if (this.phase === 'lift') {
        // tel que la main l'a touché, puis il se cale dans la prise
        this.contact ??= this.relative(anchor, o.position, o.quaternion);
        const k = ease(Math.min(1, this.t / SETTLE));
        rel = { pos: this.contact.pos.clone().lerp(inHand.pos, k), rot: this.contact.rot.clone().slerp(inHand.rot, k) };
      } else {
        // il prend dans la main sa pose au sol, pour être lâché sans bouger
        const k = ease(Math.min(1, this.t / DURATION.lower));
        const down = this.relative(anchor, this.groundPos, this.groundRot);
        rel = { pos: inHand.pos.lerp(down.pos, k), rot: inHand.rot.slerp(down.rot, k) };
      }
      o.position.copy(rel.pos).applyQuaternion(anchor.rot).add(anchor.pos);
      o.quaternion.copy(anchor.rot).multiply(rel.rot);
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

  /** Repère qui porte l'objet : l'os de la main, ou le buste entre les deux paumes. */
  private anchor(spec: GripSpec): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    if (spec.left) return { pos: this.palms.left!.clone().add(this.palms.right!).multiplyScalar(0.5), rot: this.chestRot.clone() };
    const hand = `${this.side}Hand` as const;
    return { pos: this.rig.worldPos(this.rig.raw(hand)!), rot: this.rig.worldRot(this.rig.node(hand)!) };
  }

  /** Pose (`pos`, `rot`, monde) exprimée dans le repère `anchor`. */
  private relative(anchor: { pos: THREE.Vector3; rot: THREE.Quaternion }, pos: THREE.Vector3, rot: THREE.Quaternion): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    const inv = anchor.rot.clone().invert();
    return { pos: pos.clone().sub(anchor.pos).applyQuaternion(inv), rot: inv.multiply(rot) };
  }

  /** Point de l'objet tenu calé dans la main ; une pile se porte par en dessous (face opposée, +X). */
  private gripPoint(): THREE.Vector3 {
    const p = this.item!.holdPoint.clone();
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
        // la main l'emporte pendant la première moitié du geste
        const k = ease(Math.min(1, (2 * this.t) / DURATION.store));
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
