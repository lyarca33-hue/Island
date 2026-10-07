/**
 * Moteur de la map : scène Three.js, caméra iso orthographique d'Arena Tactic (30° au-dessus
 * de l'horizon, quart de tour par quart de tour), lumière de jour, post-traitement HD-2D.
 *
 * Commandes : clic sur le sol pour y aller (Maj = courir), ZQSD / WASD / flèches,
 * molette pour zoomer, rotateCamera(±1) pour tourner d'un quart de tour. Clic sur un objet :
 * aller le prendre ; E : reposer l'objet tenu (ou prendre le plus proche).
 */
import * as THREE from 'three';
import type { Recipe } from '../creator/recipe';
import { Character } from './character';
import { applySky, GameClock } from './clock';
import { createGround, GROUND_HALF } from './ground';
import { breakChance, Debris } from './items/breakage';
import { gradeName } from './items/durability';
import { LAY_FLAT, SPLASH_CYCLE, WorldItem } from './items/carry';
import { isTwoHanded } from './items/grips';
import { ITEM_BY_ID, SLOTS_PER_SHELF, TABLE_H } from './items/catalog';
import { createMotes } from './motes';
import { footprint, Nav, overlaps } from './nav';
import { Needs } from './needs';
import { lightAllPasses, PostFx } from './postfx';

/** Élévation de la caméra iso 2:1 (30° au-dessus de l'horizon), comme Arena Tactic. */
const UP = new THREE.Vector3(0, 1, 0);
const ISO_ELEVATION = Math.PI / 6;
/** Lacet de départ (45°), comme Arena Tactic. */
const BASE_YAW = Math.PI / 4;
/** Recul de la caméra (orthographique : n'influe pas sur l'image, seulement sur la profondeur). */
const CAM_DIST = 80;
/** Hauteur de la vue au zoom 1 (m), plus serrée qu'Arena Tactic : un seul perso à montrer. */
const VIEW_HEIGHT = 6;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
/** Hauteur du point suivi au-dessus des pieds du perso (m). */
const FOCUS_HEIGHT = 0.9;

/** Soif rendue par une tasse pleine bue en entier, et regain d'énergie si c'est du café. */
const DRINK_THIRST = 35;
const COFFEE_ENERGY = 12;
/** L'eau désaltère plus que le café : soif en plus pour une bouteille entière. */
const WATER_EXTRA = 15;

/** Porte du frigo : temps pour l'ouvrir ou la fermer (s), et distance à laquelle elle se referme seule (m). */
const DOOR_TIME = 0.6;
const DOOR_AUTOCLOSE = 1.8;
/** Où se tenir devant un meuble à porte : à cette distance (m), plus la moitié d'une porte qui s'abaisse (four). */
const DOOR_GAP = 0.3;

/** Faim rendue selon la cuisson : un aliment cuit nourrit mieux, brûlé presque plus. */
const COOKED_HUNGER = 1.5;
const BURNT_HUNGER = 0.4;
/** Usure d'un appareil (four, micro-ondes, lave-vaisselle) à chaque programme, et d'une poubelle à chaque objet jeté. */
const WEAR_RUN = 1;
const WEAR_BIN = 0.3;

/**
 * Se laver à l'évier : durée (s, mains sous l'eau) et hygiène rendue. Les mains : un petit plus ;
 * la toilette au lavabo (visage, mains, trois tours) : un vrai regain, sans valoir une douche.
 */
const WASH_HANDS = { seconds: 3, hygiene: 12 };
const WASH_FACE = { seconds: 3 * SPLASH_CYCLE, hygiene: 40 };

/** Objets de test posés autour du point de départ : [id, x, y, z, rotation (rad)]. */
const START_ITEMS: Array<[string, number, number, number, number]> = [
  // table côté caméra : le perso lui fait face en prenant la tasse ou la lettre
  ['table', 1.3, 0, 1.3, Math.PI / 4],
  ['tasse', 1.07, TABLE_H, 1.28, 0.6],
  ['lettre', 1.34, TABLE_H, 1.05, Math.PI / 3],
  ['caisse', -0.6, 0, -2.4, 0.2],
  // près de la bibliothèque, tournée vers la pièce : le coin lecture
  ['chaise', -0.71, 0, -1.48, Math.PI / 4],
  ['bibliotheque', -1.7, 0, -1.2, Math.PI / 4],
  ['machine-a-cafe', 2.1, 0, -0.8, -Math.PI / 4],
  // l'évier à côté de la machine à café, dos alignés : un coin cuisine
  ['evier', 2.56, 0, -0.24, -Math.PI / 4],
  // à côté de la machine à café, la porte vers la pièce
  ['frigo', 2.75, 0, -1.75, Math.PI / 4 - 0.45],
  // de l'autre côté de la machine à café, alignés sur elle : placard (le micro-ondes dessus),
  // four, lave-vaisselle, tiroir, puis la poubelle au bout
  ['placard', 1.616, 0, -1.178, -Math.PI / 4],
  ['micro-ondes', 1.616, 0.9, -1.178, -Math.PI / 4],
  ['four', 1.174, 0, -1.599, -Math.PI / 4],
  ['lave-vaisselle', 0.742, 0, -2.03, -Math.PI / 4],
  ['tiroir', 0.357, 0, -2.437, -Math.PI / 4],
  ['poubelle', 0.021, 0, -2.737, -Math.PI / 4],
  // de l'autre côté de l'évier, dans son alignement : de quoi couper
  ['plan-de-travail', 3.17, 0, 0.37, -Math.PI / 4],
];

/**
 * Posés sur le plan de travail au départ : [id, x, z, rotation] dans le repère du meuble (sur le
 * dessus, l'avant vers +Z).
 */
const START_ON_WORKTOP: Array<[string, number, number, number]> = [
  ['planche', -0.14, 0.02, 0],
  // couché à plat, le long de la profondeur, le manche vers l'avant
  ['couteau', 0.14, 0.04, -Math.PI / 2],
  ['pain', 0.32, -0.08, 0.3],
];

/** Rangés au départ dans un meuble : [id, meuble, place]. */
const START_STORED: Array<[string, string, number]> = [
  ['bouteille-eau', 'frigo', 8],
  ['bouteille-eau', 'frigo', 9],
  ['pomme', 'frigo', 5],
  ['pomme', 'frigo', 6],
  ['sandwich', 'frigo', 1],
  ['tomate', 'frigo', 2],
  ['carotte', 'frigo', 4],
  ['concombre', 'frigo', 7],
];

/** Objets déjà usés au départ (part de durabilité restante), pour voir les grades. */
const START_WEAR: Record<string, number> = { table: 0.55, caisse: 0.3, livre: 0.12, 'livre-vert': 0.8 };

/** Usure (points de durabilité) : par gorgée bue (tasse pleine = 1), par seconde de lecture, par mètre poussé. */
const WEAR_DRINK = 6;
const WEAR_READ = 0.15;
const WEAR_PUSH = 2;
/** Usure en prenant un objet, et à chaque café (machine, tasse). */
const WEAR_GRAB = 0.3;
const WEAR_BREW = { machine: 1.5, cup: 0.5 };
/** Usure de la porte (frigo) à chaque ouverture. */
const WEAR_DOOR = 0.4;
/** Usure de l'évier (le robinet) à chaque fois qu'on fait couler l'eau. */
const WEAR_TAP = 0.4;
/** Usure à chaque aliment coupé : le couteau (il s'émousse) et la planche. */
const WEAR_CUT = { knife: 1, board: 0.6 };
/** Distance de la face avant du meuble où se tenir pour couper sur la planche (m). */
const CUT_STAND = 0.28;

/** « le café », « l'eau » ; « de café », « d'eau » ; « du café », « de l'eau ». */
const elides = (w: string) => /^[aeiouyéèêh]/i.test(w);
const theLiquid = (w: string) => (elides(w) ? `l’${w}` : `le ${w}`);
const ofLiquid = (w: string) => (elides(w) ? `d’${w}` : `de ${w}`);
const someLiquid = (w: string) => (elides(w) ? `de l’${w}` : `du ${w}`);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Usure d'un siège chaque fois qu'on s'y assoit. */
const WEAR_SIT = 0.5;

/** Livres de départ : rangés dans la bibliothèque (place) ou posés à plat ([x, y, z, rotation]). */
const START_BOOKS: Array<[string, number | [number, number, number, number]]> = [
  ['livre-rouge', SLOTS_PER_SHELF],
  ['livre-vert', SLOTS_PER_SHELF + 1],
  ['livre-ocre', SLOTS_PER_SHELF + 2],
  ['livre-violet', 2 * SLOTS_PER_SHELF],
  ['livre', [-1.3, 0, 0.9, 0.4]],
  // de quoi demander au perso de « ranger tous les livres »
  ['livre-vert', [0.2, 0, 2.1, 1.3]],
  ['livre-ocre', [1.5, TABLE_H, 1.45, 2.2]],
];

/** Un objet de la pièce tel que les ordres le voient (voir Game.describe). */
export interface WorldObject {
  ref: string;
  nom: string;
  portable: boolean;
  /** Se porte à deux mains (caisse). */
  deuxMains?: boolean;
  /**
   * Meuble de rangement (bibliothèque), frigo, placard (porte ou tiroir), appareil (four,
   * micro-ondes, lave-vaisselle), poubelle, machine (à café), évier (eau, se laver), récipient
   * (tasse, bouteille), nourriture, siège (chaise), planche (à découper) ou couteau.
   */
  sorte?: 'rangement' | 'frigo' | 'placard' | 'appareil' | 'poubelle' | 'machine' | 'évier' | 'récipient' | 'nourriture' | 'siège' | 'planche' | 'couteau';
  /** Aliment entier qui se coupe en morceaux sur la planche (pomme, pain, légumes). */
  coupable?: boolean;
  ou: string;
  /** Grade d'usure et durabilité restante (« usé (52 %) »). */
  etat: string;
  distance: number;
}

/** Noms féminins (accord des messages). */
const FEMININE = new Set(['tasse', 'lettre', 'caisse', 'chaise', 'table', 'bibliothèque', 'machine à café', "bouteille d'eau", 'pomme', 'poubelle', 'planche à découper', 'carotte', 'tomate', 'rondelles de carotte', 'tranches de tomate', 'tranches de pain', 'rondelles de concombre']);
/** Noms au pluriel (les morceaux d'un aliment coupé). */
const PLURAL = new Set(['quartiers de pomme', 'tranches de pain', 'rondelles de carotte', 'tranches de tomate', 'rondelles de concombre']);
/** Accord d'un adjectif avec le nom (« coupée », « finis ») et article (« La pomme », « Les quartiers »). */
const agree = (name: string) => `${FEMININE.has(name) ? 'e' : ''}${PLURAL.has(name) ? 's' : ''}`;
const theName = (name: string) => `${PLURAL.has(name) ? 'Les' : FEMININE.has(name) ? 'La' : 'Le'} ${name}`;
/** « la pomme », « le four ». */
const the = (name: string) => `${FEMININE.has(name) ? 'la' : 'le'} ${name}`;

/** Pesanteur des objets lancés (m/s²). */
const GRAVITY = 9.8;

/** Le point au sol (y = 0). */
const p0 = (v: THREE.Vector3) => v.clone().setY(0);

/** Objet lancé, en vol. */
interface Flying {
  item: WorldItem;
  vel: THREE.Vector3;
  /** Rotation en vol : axe × vitesse (rad/s). */
  spin: THREE.Vector3;
  /** Déjà rebondi une fois (le premier choc seul peut le casser). */
  bounced: boolean;
}

/** Ce qu'on peut faire avec ce qu'on tient (boutons de l'interface). */
export interface HandActions {
  drink: boolean;
  /** Un aliment en main (pomme, sandwich). */
  eat: boolean;
  /** Un aliment entier à couper en main (pomme, pain, légumes). */
  cut: boolean;
  /** L'objet tenu (le dernier pris) peut être lancé. */
  throw: boolean;
  /** En train de déplacer un gros meuble. */
  moving: boolean;
  read: boolean;
  reading: boolean;
  /** Assis : on peut se lever. */
  seated: boolean;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private post: PostFx;
  private character = new Character();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** Heure du jeu (4 fois plus rapide que le temps réel) : pilote la lumière et les besoins. */
  readonly clock = new GameClock();
  /** Fatigue, faim, soif, hygiène du perso. */
  readonly needs = new Needs();
  /** Niveau des récipients tenus à l'image précédente : ce qui a été bu depuis. */
  private lastSips = new Map<WorldItem, { level: number; contents: string | null }>();
  private ground: THREE.Mesh;
  private motes: { points: THREE.Points; update: (t: number, center: THREE.Vector3) => void };
  private container: HTMLElement;
  private focus = new THREE.Vector3(0, FOCUS_HEIGHT, 0);
  private quarter = 0;
  private yaw = BASE_YAW;
  private zoom = 1;
  private keys = new Set<string>();
  private shift = false;
  private raf = 0;
  private last = performance.now();
  private resizeObs: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private disposers: Array<() => void> = [];
  /** Repère de destination du clic (anneau au sol). */
  private marker: THREE.Mesh;

  private recipe: Recipe | null;
  private items: WorldItem[] = [];
  private heldLabel: string | null = null;
  private actionsKey = '';
  /** Objets posés sur un objet tenu (ex. tasse sur la caisse) : ils suivent `base`. */
  private riders: Array<{ base: WorldItem; item: WorldItem; rel: THREE.Matrix4 }> = [];
  /** Objets tenus à l'image précédente (les objets posés dessus suivent jusqu'à la dépose). */
  private prevHeld: WorldItem[] = [];
  /** Obstacles pris en compte par les chemins (voir updateNav). */
  private navKey = '';
  /** Gros meuble en train d'être déplacé, et ce qui est posé ou rangé dedans (suit le meuble). */
  private moving: { item: WorldItem; riders: Array<{ item: WorldItem; rel: THREE.Matrix4 }> } | null = null;
  /** Objets lancés en vol, et éclats des objets brisés. */
  private flying: Flying[] = [];
  private debris: Debris[] = [];
  /** Café en train de couler : la machine, la tasse posée dessous, le temps écoulé (s) ; `rinse` : on rince la tasse (évier). */
  private brew: { machine: WorldItem; cup: WorldItem; t: number; rinse?: boolean } | null = null;
  /**
   * Portes (frigo, placard, four…), tiroirs et couvercles : ouverture de 0 à 1, où elle va, quoi
   * faire une fois ouverte, et longueur d'une porte qui s'abaisse (m, 0 sinon).
   */
  private doors = new Map<WorldItem, { open: number; target: 0 | 1; then: (() => void) | null; reach: number }>();
  /** Appareils en marche (four, micro-ondes, lave-vaisselle) : temps écoulé (s), cuisson de départ de ce qui est dedans. */
  private appliances = new Map<WorldItem, { t: number; start: Map<WorldItem, number> }>();
  /** Objets jetés dans chaque poubelle. */
  private binFill = new Map<WorldItem, number>();
  /** Part de chaque aliment tenu à l'image précédente : ce qui a été mangé depuis. */
  private lastBite = new Map<WorldItem, number>();
  /** En train de se laver à l'évier : temps écoulé, durée, hygiène rendue en tout. */
  private washing: { sink: WorldItem; t: number; seconds: number; hygiene: number; face: boolean } | null = null;
  /** Objet tenu qui change (nom ou null) : pour l'interface. */
  onHeldChange: ((name: string | null, can: HandActions) => void) | null = null;
  /** Objet sous la souris (nom, grade, durabilité de 0 à 1, position à l'écran), ou null. */
  onHover: ((info: { name: string; grade: string; condition: number; x: number; y: number } | null) => void) | null = null;
  /** Petit message à afficher (ex. objet non portable). */
  onNotice: ((text: string) => void) | null = null;
  /** Bulle de parole au-dessus du perso, et quand elle disparaît (ms, horloge de la page). */
  private bubble: HTMLDivElement;
  private bubbleUntil = 0;

  constructor(container: HTMLElement, recipe: Recipe | null = null) {
    this.container = container;
    this.recipe = recipe;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping; // étalonnage fait par le post-traitement
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new THREE.Color(0x2b3a2a);

    // ciel + sol renvoyé, et soleil (ou lune) : couleurs et direction réglées par l'heure (applySky)
    const hemi = this.hemi = lightAllPasses(new THREE.HemisphereLight(new THREE.Color(0.75, 0.85, 1.0), new THREE.Color(0.25, 0.32, 0.18), 0.9));
    this.sun = lightAllPasses(new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.78), 2.2));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(hemi, this.sun, this.sun.target);

    this.ground = createGround();
    this.scene.add(this.ground);
    this.scene.add(this.character.root);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.3, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.position.y = 0.01;
    this.scene.add(this.marker);

    // au moment de la prise, l'objet est encore posé : on note ce qui est dessus ; les livres
    // posés sur un livre forment la pile qu'on emporte
    this.character.onGrab = (item, hand) => {
      this.wearItem(item, WEAR_GRAB);
      const riders = this.ridersOf(item);
      // une pile se porte à deux mains : seulement si l'autre main est libre
      const same = item.def.stack && this.character.otherFree(hand) ? riders.filter((r) => r.item.def.stack === item.def.stack) : [];
      same.sort((a, b) => a.item.object.position.y - b.item.object.position.y);
      hand.adopt(same.map((r) => r.item));
      const kept = new Set(this.character.carried);
      this.riders = [...this.riders.filter((r) => r.base !== item), ...riders.filter((r) => !kept.has(r.item)).map((r) => ({ base: item, ...r }))];
    };
    const add = (id: string) => {
      const item = new WorldItem(ITEM_BY_ID.get(id)!);
      this.items.push(item);
      this.scene.add(item.object);
      return item;
    };
    for (const [id, x, y, z, rot] of START_ITEMS) {
      const item = add(id);
      item.object.position.set(x, y, z);
      item.object.rotation.y = rot;
    }
    // les meubles (objets non portables) se contournent
    this.character.nav = this.buildNav();
    for (const item of this.items) if (item.def.door || item.def.drawer) this.doors.set(item, { open: 0, target: 0, then: null, reach: this.doorReach(item) });
    for (const [id, holder, i] of START_STORED) {
      const where = this.items.find((it) => it.def.id === holder);
      if (!where) continue;
      const it = add(id);
      const slot = this.slot(where, i);
      it.object.position.copy(slot.pos);
      it.object.quaternion.copy(slot.rot);
    }
    const worktop = this.items.find((i) => i.def.id === 'plan-de-travail');
    if (worktop) {
      worktop.object.updateMatrixWorld(true);
      for (const [id, x, z, rot] of START_ON_WORKTOP) {
        const it = add(id);
        it.object.quaternion.setFromAxisAngle(UP, worktop.object.rotation.y + rot);
        if (it.def.layFlat) it.object.quaternion.multiply(LAY_FLAT);
        const at = new THREE.Vector3(x, worktop.box.max.y, z).applyMatrix4(worktop.object.matrixWorld);
        it.object.position.copy(at).setY(at.y + it.restLift(it.object.quaternion));
      }
    }
    const shelf = this.items.find((i) => i.def.id === 'bibliotheque')!;
    for (const [id, at] of START_BOOKS) {
      const book = add(id);
      if (typeof at === 'number') {
        const slot = this.slot(shelf, at);
        book.object.position.copy(slot.pos);
        book.object.quaternion.copy(slot.rot);
      } else {
        book.object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), at[3]).multiply(LAY_FLAT);
        book.object.position.set(at[0], at[1] + book.restLift(book.object.quaternion), at[2]);
      }
    }

    for (const item of this.items) item.setCondition(START_WEAR[item.def.id] ?? 1);

    this.motes = createMotes();
    this.scene.add(this.motes.points);

    this.bubble = document.createElement('div');
    this.bubble.className = 'speech-bubble';
    this.bubble.hidden = true;
    container.appendChild(this.bubble);

    this.post = new PostFx(this.renderer, this.scene, this.camera);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.bindInput();
  }

  /** Charge le perso puis lance la boucle de rendu. */
  async start(): Promise<void> {
    this.raf = requestAnimationFrame(this.frame);
    await this.character.load(this.recipe);
  }

  /** Quart de tour de caméra (+1 ou -1). */
  rotateCamera(dir: 1 | -1): void {
    this.quarter += dir;
  }

  /**
   * Va prendre l'objet nommé le plus proche (« prend: tasse » de l'IA de RP). Faux si aucun
   * objet de ce nom, s'il n'est pas portable ou si les mains sont prises.
   */
  pickUp(name: string): boolean {
    const p = this.character.position;
    const found = this.items
      .filter((i) => i.name === name && !this.character.carried.includes(i))
      .sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    return found ? this.tryPickUp(found, false) : false;
  }

  /**
   * Repose un objet tenu devant le perso (le dernier pris, ou celui nommé : « pose: tasse ») : sur
   * le meuble qui s'y trouve (table), sinon au sol.
   */
  drop(name?: string): boolean {
    if (this.moving) return this.release();
    const held = name ? this.character.heldItems.find((i) => i.name === name) : this.character.held;
    if (!held) return false;
    if (this.closeBookThen(() => this.drop(name))) return true;
    // assis : on se lève d'abord pour poser
    if (this.character.seated) return this.character.standUp(() => this.drop(name));
    const spot = this.character.dropSpot(held);
    if (!spot) return false;
    this.raycaster.set(new THREE.Vector3(spot.x, 3, spot.z), new THREE.Vector3(0, -1, 0));
    const carried = this.character.carried;
    const others = this.items.filter((i) => !carried.includes(i)).map((i) => i.object);
    const hit = this.raycaster.intersectObjects(others, true).find((h) => (h.face?.normal.y ?? 0) > 0.7);
    if (hit) spot.y = hit.point.y;
    return this.character.drop(spot, undefined, undefined, false, held);
  }

  /** Noms des objets tenus (un par main). */
  get heldNames(): string[] {
    return this.character.heldItems.map((i) => i.name);
  }

  /** Ouvre le livre tenu et le lit (l'autre main doit être libre). */
  read(): boolean {
    const c = this.character;
    if (c.reading) return true;
    const book = c.heldItems.find((i) => i.def.buildOpen);
    const hand = book && c.handOf(book);
    if (!book || !hand) this.onNotice?.('Prends un livre pour le lire.');
    else if (hand.stacked) this.onNotice?.('Pose les autres livres pour en lire un.');
    else if (!c.otherFree(hand)) this.onNotice?.('Il faut une main libre pour lire.');
    else if (c.busy) return false;
    else return hand.read();
    return false;
  }

  /** Ferme le livre qu'on lit. */
  stopReading(): boolean {
    return !!this.character.reading?.stopReading();
  }

  /** Livre ouvert : le referme, puis fait `then` (vrai si on a dû le refermer). */
  private closeBookThen(then: () => void): boolean {
    const r = this.character.reading;
    if (!r) return false;
    r.stopReading(then);
    return true;
  }

  /** Noms des objets de la scène (pour l'IA de RP). */
  get itemNames(): string[] {
    return this.items.map((i) => i.name);
  }

  /** Le perso dit quelque chose : bulle au-dessus de sa tête, le temps de la lire. */
  say(text: string): void {
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubbleUntil = performance.now() + 2500 + text.length * 70;
    this.placeBubble();
    this.character.talk((2500 + text.length * 70) / 1000);
  }

  /** Plus rien en cours : le perso est arrivé, ses mains sont libres de tout geste, le café a coulé. */
  get idle(): boolean {
    return this.character.idle && !this.brew && !this.washing && !this.flying.length && !this.appliances.size && ![...this.doors.values()].some((d) => d.then || d.open !== d.target);
  }

  /** Les obstacles à contourner, sauf `skip`. */
  private buildNav(skip?: WorldItem): Nav {
    const nav = new Nav();
    for (const it of this.items) if (it !== skip && this.isObstacle(it)) nav.add(it.box, it.object.position, it.object.rotation.y);
    return nav;
  }

  /** Obstacle : un meuble, ou un gros objet (porté à deux mains : chaise, caisse) posé au sol. */
  private isObstacle(it: WorldItem): boolean {
    if (!it.def.portable) return true;
    return isTwoHanded(it.grip) && it.object.position.y < 0.05 && !this.character.carried.includes(it) && !this.flying.some((f) => f.item === it);
  }

  /** Recalcule les chemins quand un obstacle apparaît, disparaît ou bouge (gros objet pris ou posé). */
  private updateNav(): void {
    if (this.moving) return;
    const key = this.items
      .filter((it) => this.isObstacle(it))
      .map((it) => `${it.object.id}:${it.object.position.x.toFixed(2)},${it.object.position.z.toFixed(2)}`)
      .join('|');
    if (key === this.navKey) return;
    this.navKey = key;
    this.character.nav = this.buildNav();
  }

  /**
   * Agrippe le gros meuble `ref` (ou le plus proche déplaçable) : le perso va se placer contre
   * le côté le plus proche et y pose les mains ; ensuite les touches le déplacent, E le lâche.
   */
  grab(ref?: string, running = false): boolean {
    const p = this.character.position;
    const item = ref
      ? this.byRef(ref)
      : this.items.filter((i) => i.def.movable).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!item) {
      this.onNotice?.(ref ? `Aucun objet « ${ref} ».` : 'Aucun meuble à déplacer.');
      return false;
    }
    return this.grabFurniture(item, running);
  }

  /** Lâche le meuble qu'on déplace. */
  release(): boolean {
    const m = this.moving;
    if (!m) return false;
    this.moving = null;
    // les meubles ont bougé : les chemins les contournent à leur nouvelle place
    this.character.nav = this.buildNav();
    return this.character.stopPush();
  }

  /**
   * Fait pivoter le meuble qu'on déplace de `degrees` (positif : vers la droite, sens des
   * aiguilles d'une montre vu du dessus). Au clavier : R et F.
   */
  turnMoving(degrees = 90): boolean {
    if (!this.moving) {
      this.onNotice?.('Aucun meuble agrippé à faire pivoter.');
      return false;
    }
    return this.character.turnPushed(-THREE.MathUtils.degToRad(degrees));
  }

  /** Nom du meuble qu'on déplace (ou null). */
  get movingName(): string | null {
    return this.moving?.item.name ?? null;
  }

  private grabFurniture(item: WorldItem, running: boolean): boolean {
    const c = this.character;
    if (!c.canCarry) {
      this.onNotice?.('Crée un perso pour pouvoir déplacer des meubles.');
      return false;
    }
    if (!item.def.movable) {
      this.onNotice?.(`On ne peut pas déplacer : ${item.name}.`);
      return false;
    }
    if (c.heldItems.length || c.bracing) {
      this.onNotice?.('Il faut les deux mains libres pour déplacer un meuble.');
      return false;
    }
    if (this.brew?.machine === item) {
      this.onNotice?.(`${cap(theLiquid(item.def.pour!.liquid))} coule encore.`);
      return false;
    }
    // on referme la porte avant de pousser ; un tiroir ouvert, lui, se referme d'abord (ce qu'il contient glisse avec)
    const door = this.doors.get(item);
    if (door && item.def.drawer && door.open > 0) {
      door.target = 0;
      door.then = null;
      this.onNotice?.('Le tiroir se referme : recommence pour déplacer le meuble.');
      return false;
    }
    if (door) {
      door.target = 0;
      door.then = null;
    }
    // le côté du meuble le plus proche du perso (repère du meuble)
    const o = item.object;
    o.updateMatrixWorld(true);
    const b = item.box;
    const ctr = b.getCenter(new THREE.Vector3());
    const half = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const local = o.worldToLocal(p0(c.position)).sub(ctr);
    const alongX = Math.abs(local.x) / half.x > Math.abs(local.z) / half.z;
    const normal = alongX ? new THREE.Vector3(Math.sign(local.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(local.z) || 1);
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const faceHalf = alongX ? half.x : half.z;
    const spread = Math.min(0.2, (alongX ? half.z : half.x) - 0.04);
    // mains un peu sous le dessus du meuble (au plus à hauteur de poitrine)
    const handY = Math.min(b.max.y - 0.02, 0.95);
    const face = ctr.clone().addScaledVector(normal, faceHalf + 0.01).setY(handY);
    const hands = {
      // le perso fait face au meuble : sa droite est du côté -tangent
      right: face.clone().addScaledVector(tangent, -spread),
      left: face.clone().addScaledVector(tangent, spread),
    };
    const at = () => ({ right: o.localToWorld(hands.right.clone()), left: o.localToWorld(hands.left.clone()) });
    const stand = o.localToWorld(ctr.clone().addScaledVector(normal, faceHalf + 0.42).setY(0)).setY(0);
    const faceAt = o.localToWorld(ctr.clone().setY(0)).setY(0);
    // ce qui est posé dessus ou rangé dedans part avec lui
    const riders = this.items
      .filter((it) => it !== item && it.def.portable && !c.carried.includes(it) && !this.flying.some((f) => f.item === it))
      .filter((it) => {
        const q = o.worldToLocal(new THREE.Box3().setFromObject(it.object).getCenter(new THREE.Vector3()));
        return q.x > b.min.x && q.x < b.max.x && q.z > b.min.z && q.z < b.max.z && q.y > b.min.y && q.y < b.max.y + 0.6;
      })
      .map((it) => {
        it.object.updateMatrixWorld(true);
        return { item: it, rel: o.matrixWorld.clone().invert().multiply(it.object.matrixWorld) };
      });
    const others = this.buildNav(item);
    const move = (step: THREE.Vector3): boolean => {
      // le meuble à sa nouvelle place ne doit pas entrer dans un autre, ni le perso dans un meuble
      const next = o.position.clone().add(step);
      const rect = footprint(b, next, o.rotation.y);
      const blocked = this.items.some((it) => it !== item && (!it.def.portable || isTwoHanded(it.grip)) && !riders.some((r) => r.item === it)
        && overlaps(rect, footprint(it.box, it.object.position, it.object.rotation.y)));
      if (blocked || others.blocked(c.position.clone().add(step))) return false;
      o.position.copy(next);
      this.wearItem(item, step.length() * WEAR_PUSH);
      o.updateMatrixWorld(true);
      for (const r of riders) {
        const ro = r.item.object;
        ro.matrix.multiplyMatrices(o.matrixWorld, r.rel);
        ro.matrix.decompose(ro.position, ro.quaternion, ro.scale);
      }
      return true;
    };
    // pivoter de `angle` autour du centre du meuble ; le perso tourne autour avec lui
    const turn = (angle: number): THREE.Vector3 | null => {
      const pivot = o.localToWorld(ctr.clone()).setY(0);
      const yaw = o.rotation.y + angle;
      const next = o.position.clone().sub(pivot).applyAxisAngle(UP, angle).add(pivot);
      const rect = footprint(b, next, yaw);
      const blocked = this.items.some((it) => it !== item && (!it.def.portable || isTwoHanded(it.grip)) && !riders.some((r) => r.item === it)
        && overlaps(rect, footprint(it.box, it.object.position, it.object.rotation.y)));
      const stand = c.position.clone().sub(pivot).applyAxisAngle(UP, angle).add(pivot);
      const bound = GROUND_HALF - 14;
      if (blocked || others.blocked(stand) || Math.abs(stand.x) >= bound || Math.abs(stand.z) >= bound) return null;
      o.position.copy(next);
      o.rotation.y = yaw;
      this.wearItem(item, Math.abs(angle) * half.length() * WEAR_PUSH);
      o.updateMatrixWorld(true);
      for (const r of riders) {
        const ro = r.item.object;
        ro.matrix.multiplyMatrices(o.matrixWorld, r.rel);
        ro.matrix.decompose(ro.position, ro.quaternion, ro.scale);
      }
      return pivot;
    };
    const ok = c.startPush(stand, faceAt, at, move, turn, running);
    if (ok) this.moving = { item, riders };
    return ok;
  }

  /**
   * Lance devant le perso l'objet tenu (le dernier pris, ou celui nommé) : petit ou moyen, tenu
   * d'une main. En retombant, il peut se briser selon sa fragilité (fiche, 1 à 10).
   */
  throwItem(name?: string): boolean {
    const c = this.character;
    const held = name ? c.heldItems.find((i) => i.name === name) : c.held;
    if (!held) {
      this.onNotice?.(name ? `Pas de ${name} en main.` : 'Rien à lancer.');
      return false;
    }
    if (this.closeBookThen(() => this.throwItem(name))) return true;
    const hand = c.handOf(held);
    if (hand?.stacked) this.onNotice?.('On ne lance pas une pile de livres.');
    else if (isTwoHanded(held.grip)) this.onNotice?.(`Trop gros pour être lancé : ${held.name}.`);
    else if (c.busy) return false;
    else return c.throwItem(held, (item, vel) => this.launch(item, vel));
    return false;
  }

  /** L'objet quitte la main : il vole en tournant sur lui-même. */
  private launch(item: WorldItem, vel: THREE.Vector3): void {
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 6);
    this.flying.push({ item, vel, spin, bounced: false });
  }

  /** Hauteur de la surface sous (x, z) : dessus d'un meuble ou d'une caisse, sinon le sol. */
  private surfaceAt(x: number, z: number, skip: WorldItem): number {
    let top = 0;
    const p = new THREE.Vector3();
    for (const it of this.items) {
      if (it === skip || (it.def.portable && !isTwoHanded(it.grip)) || this.character.carried.includes(it)) continue;
      it.object.worldToLocal(p.set(x, 0, z));
      const b = it.box;
      if (p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z) top = Math.max(top, it.object.position.y + b.max.y);
    }
    return top;
  }

  /** Objets en vol : pesanteur, chocs sur le sol et les meubles, casse ou rebond puis repos. */
  private tickFlying(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / steps;
    const q = new THREE.Quaternion();
    for (const f of [...this.flying]) {
      const o = f.item.object;
      for (let i = 0; i < steps && this.flying.includes(f); i++) {
        const prev = o.position.clone();
        const prevBottom = prev.y - f.item.restLift(o.quaternion);
        f.vel.y -= GRAVITY * h;
        o.position.addScaledVector(f.vel, h);
        const w = f.spin.length();
        if (w > 0) o.quaternion.premultiply(q.setFromAxisAngle(f.spin.clone().divideScalar(w), w * h));
        const lim = GROUND_HALF - 14;
        o.position.x = THREE.MathUtils.clamp(o.position.x, -lim, lim);
        o.position.z = THREE.MathUtils.clamp(o.position.z, -lim, lim);
        const surf = this.surfaceAt(o.position.x, o.position.z, f.item);
        const lift = f.item.restLift(o.quaternion);
        if (o.position.y - lift >= surf) continue;
        if (prevBottom < surf - 0.02) {
          // heurte le flanc d'un meuble : repart en arrière, ralenti
          o.position.set(prev.x, o.position.y, prev.z);
          f.vel.x *= -0.3;
          f.vel.z *= -0.3;
          continue;
        }
        o.position.y = surf + lift;
        this.impact(f, surf);
      }
    }
  }

  /** Choc d'un objet lancé : il se brise (selon sa fragilité), rebondit ou se pose. */
  private impact(f: Flying, surf: number): void {
    const item = f.item;
    const speed = f.vel.length();
    // un objet usé casse plus facilement
    const fragility = (item.def.fragility ?? 5) * (0.4 + 0.6 * item.condition);
    if (!f.bounced && Math.random() < breakChance(fragility, speed)) {
      this.flying = this.flying.filter((x) => x !== f);
      this.shatter(item, surf, f.vel);
      return;
    }
    // le choc l'use (moins s'il est solide) ; à zéro, il se brise
    this.wearItem(item, speed * (11 - (item.def.fragility ?? 5)) * 0.6, false);
    if (item.durability <= 0) {
      this.flying = this.flying.filter((x) => x !== f);
      this.shatter(item, surf, f.vel);
      return;
    }
    if (Math.abs(f.vel.y) > 1.2) {
      f.bounced = true;
      f.vel.set(f.vel.x * 0.5, -f.vel.y * 0.3, f.vel.z * 0.5);
      f.spin.multiplyScalar(0.5);
      return;
    }
    // se pose : à plat (livre) ou debout, tourné comme il est arrivé
    this.flying = this.flying.filter((x) => x !== f);
    const o = item.object;
    const yaw = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ').y;
    o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (item.def.layFlat) o.quaternion.multiply(LAY_FLAT);
    o.position.y = surf + item.restLift(o.quaternion);
    // un récipient lancé se renverse
    if (item.contents) {
      this.addDebris(new Debris(item, surf, f.vel, false));
      item.setLevel(0);
      item.contents = null;
    }
  }

  /** L'objet se brise : il disparaît de la pièce, ses éclats s'éparpillent. */
  private shatter(item: WorldItem, floor: number, vel = new THREE.Vector3(), worn = false, note?: string): void {
    // ce qui était posé dessus ou rangé dedans tombe
    const above = item.def.portable && !isTwoHanded(item.grip) ? [] : this.itemsOn(item);
    this.addDebris(new Debris(item, floor, vel));
    this.items = this.items.filter((i) => i !== item);
    this.riders = this.riders.filter((r) => r.base !== item && r.item !== item);
    if (this.brew && (this.brew.machine === item || this.brew.cup === item)) {
      const jet = this.brew.machine.part('jet');
      if (jet) jet.visible = false;
      this.brew = null;
    }
    item.object.removeFromParent();
    for (const it of above) this.flying.push({ item: it, vel: new THREE.Vector3(), spin: new THREE.Vector3(), bounced: false });
    if (this.isObstacle(item)) this.character.nav = this.buildNav();
    const name = `${item.name[0].toUpperCase()}${item.name.slice(1)}`;
    const e = agree(item.name);
    const broke = item.def.breakWord ?? 'brisé';
    const se = PLURAL.has(item.name) ? 'se sont' : 's\'est';
    this.doors.delete(item);
    this.appliances.delete(item);
    this.binFill.delete(item);
    this.onNotice?.(note ?? (worn ? `${name}, trop usé${e}, ${se} ${broke}${e} !` : `${name} ${se} ${broke}${e} !`));
  }

  /** Objets posés sur `base` ou rangés dedans (pas ceux qu'on tient). */
  private itemsOn(base: WorldItem): WorldItem[] {
    const o = base.object;
    o.updateMatrixWorld(true);
    const b = base.box;
    const carried = this.character.carried;
    return this.items.filter((it) => {
      if (it === base || carried.includes(it) || this.flying.some((f) => f.item === it)) return false;
      const q = o.worldToLocal(new THREE.Box3().setFromObject(it.object).getCenter(new THREE.Vector3()));
      return q.x > b.min.x && q.x < b.max.x && q.z > b.min.z && q.z < b.max.z && q.y > b.min.y + 0.02 && q.y < b.max.y + 0.6;
    });
  }

  /**
   * Use un objet de `points` de durabilité ; prévient quand il change de grade (sauf `tell`
   * faux). À zéro, il se brise (checkWorn, dès qu'il n'est plus en plein geste).
   */
  wearItem(item: WorldItem, points: number, tell = true): void {
    if (points <= 0 || item.durability <= 0) return;
    const changed = item.wear(points);
    if (changed && tell && item.durability > 0) {
      this.onNotice?.(`${theName(item.name)} ${PLURAL.has(item.name) ? 'sont' : 'est'} maintenant ${gradeName(item.condition, FEMININE.has(item.name))}.`);
    }
  }

  /** Objets usés jusqu'à zéro : ils se brisent, en main (le bras retombe) ou là où ils sont. */
  private checkWorn(): void {
    const c = this.character;
    for (const item of this.items) {
      if (item.durability > 0 || this.flying.some((f) => f.item === item)) continue;
      if (this.moving?.item === item) this.release();
      if (c.carried.includes(item)) {
        // en main : seulement une fois le geste fini (gorgée, livre refermé)
        if (c.reading?.held === item) {
          c.reading.stopReading();
          continue;
        }
        if (!c.loseItem(item)) continue;
        const p = item.object.position;
        // un objet fragile qui casse dans la main blesse un peu
        const hurts = (item.def.fragility ?? 5) <= 4;
        const fem = FEMININE.has(item.name);
        if (hurts) this.needs.hurt(3);
        const note = hurts ? `Aïe ! ${fem ? 'La' : 'Le'} ${item.name}, trop usé${fem ? 'e' : ''}, s'est brisé${fem ? 'e' : ''} dans la main.` : undefined;
        this.shatter(item, this.surfaceAt(p.x, p.z, item), new THREE.Vector3(), true, note);
      } else {
        const p = item.object.position;
        this.shatter(item, this.surfaceAt(p.x, p.z, item), new THREE.Vector3(), true);
      }
      return;
    }
  }

  /** Durabilité de l'objet `ref` : grade et part restante (0 à 1). */
  conditionOf(ref: string): { grade: string; condition: number } | null {
    const item = this.byRef(ref);
    return item ? { grade: gradeName(item.condition, FEMININE.has(item.name)), condition: item.condition } : null;
  }

  /** Fixe la durabilité de l'objet `ref` (0 à 1 ; 0 le brise). Faux si aucun objet de ce nom. */
  setCondition(ref: string, condition: number): boolean {
    const item = this.byRef(ref);
    if (!item) return false;
    item.setCondition(condition);
    return true;
  }

  private addDebris(d: Debris): void {
    this.debris.push(d);
    this.scene.add(d.group);
  }

  /**
   * Repère unique de chaque objet pour les ordres et l’IA : l'id de sa fiche, suivi d'un numéro s'il y en a
   * plusieurs du même genre (« tasse », « tasse-2 »).
   */
  private ref(item: WorldItem): string {
    const same = this.items.filter((i) => i.def.id === item.def.id);
    return same.length > 1 ? `${item.def.id}-${same.indexOf(item) + 1}` : item.def.id;
  }

  private byRef(ref: string): WorldItem | undefined {
    return this.items.find((i) => this.ref(i) === ref);
  }

  /** État de la pièce pour les ordres et l’IA : chaque objet, où il est, et ce qu'on tient. */
  describe(): { perso: string; enMain: string[]; mains: string[][]; mainsLibres: number; lit: string | null; objets: WorldObject[] } {
    const p = this.character.position;
    const carried = this.character.carried;
    const hands = this.character.hands;
    const reading = this.character.reading;
    const objets = this.items.map((item) => {
      let ou = 'au sol';
      const shelf = this.shelfOf(item);
      if (carried.includes(item)) ou = 'en main';
      else if (shelf) ou = `rangé dans ${this.ref(shelf.shelf)}`;
      else if (item.object.position.y > 0.05) {
        const under = this.items.find((o) => o !== item && !carried.includes(o) && o.object.position.y < item.object.position.y && this.isAbove(item, o));
        ou = under ? `posé sur ${this.ref(under)}` : 'posé en hauteur';
      }
      if (item === this.brew?.cup) ou += ` (${theLiquid(this.brew.machine.def.pour!.liquid)} coule dedans)`;
      const door = this.doors.get(item);
      if (door) {
        const part = item.def.drawer ? 'tiroir' : item.def.bin ? 'couvercle' : 'porte';
        ou += `, ${part} ${door.target ? 'ouvert' : 'fermé'}${part === 'porte' ? 'e' : ''}`;
      }
      if (this.appliances.has(item)) ou += ', en marche';
      if (item.def.bin) {
        const n = this.binFill.get(item) ?? 0;
        ou += n >= item.def.bin ? ', pleine' : n ? `, ${n} objet${n > 1 ? 's' : ''} jeté${n > 1 ? 's' : ''}` : ', vide';
      }
      if (item.def.food && item.portion < 1) ou += `, entamé${agree(item.name)}`;
      const cooked = this.cookedWord(item);
      if (cooked) ou += `, ${cooked}`;
      if (item.contents) ou += `, contient ${someLiquid(item.contents)}`;
      else if (item.def.startFull) ou += ', vide';
      if (item.dirty) ou += ', sale';
      const sorte: WorldObject['sorte'] = item.def.bin ? 'poubelle' : item.def.heats || item.def.washes ? 'appareil' : item.def.cold ? 'frigo'
        : item.def.door || item.def.drawer ? 'placard' : item.def.slots ? 'rangement' : item.def.wash ? 'évier' : item.def.pour ? 'machine'
        : item.def.fill ? 'récipient' : item.def.food ? 'nourriture' : item.def.seat ? 'siège' : item.def.board ? 'planche' : item.def.knife ? 'couteau' : undefined;
      if (item === this.sitting) ou += ', le perso est assis dessus';
      if (item === reading?.held) ou += ', ouvert (le perso le lit)';
      const etat = `${gradeName(item.condition, FEMININE.has(item.name))} (${Math.round(item.condition * 100)} %)`;
      const coupable = (!!item.def.cut && item.portion === 1) || undefined;
      return { ref: this.ref(item), nom: item.name, portable: item.def.portable, deuxMains: isTwoHanded(item.grip) || undefined, sorte, coupable, ou, etat, distance: Math.round(item.object.position.distanceTo(p) * 10) / 10 };
    });
    const perso = this.character.canCarry ? 'peut porter des objets' : 'ne peut pas porter d’objets (perso par défaut)';
    return {
      perso: this.sitting ? `${perso}, assis sur ${this.ref(this.sitting)}` : perso,
      enMain: carried.map((i) => this.ref(i)),
      mains: hands.loads.map((l) => l.map((i) => this.ref(i))),
      mainsLibres: hands.free,
      lit: reading?.held ? this.ref(reading.held) : null,
      objets,
    };
  }

  private isAbove(item: WorldItem, base: WorldItem): boolean {
    const b = new THREE.Box3().setFromObject(base.object);
    const p = item.object.position;
    return p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z;
  }

  /**
   * Comme un clic sur l'objet `ref` : le prendre, l'ajouter à la pile tenue, y ranger ce qu'on
   * tient (bibliothèque) ou s'y faire un café (machine). Faux si rien ne se lance.
   */
  use(ref: string): boolean {
    const item = this.byRef(ref);
    if (!item) {
      this.onNotice?.(`Aucun objet « ${ref} ».`);
      return false;
    }
    if (this.character.carried.includes(item)) {
      this.onNotice?.(`${ref} est déjà en main.`);
      return false;
    }
    return this.tryPickUp(item, false);
  }

  /** Marche jusqu'à l'objet `ref` (s'arrête devant lui). */
  walkTo(ref: string): boolean {
    const item = this.byRef(ref);
    if (!item) {
      this.onNotice?.(`Aucun objet « ${ref} ».`);
      return false;
    }
    this.character.approachThen(this.character.standFor(item), item.object.position, () => {});
    return true;
  }

  /** Siège où le perso est assis (ou s'assoit). */
  private sitting: WorldItem | null = null;

  /**
   * S'asseoir sur le siège `ref` (sinon le plus proche) : le perso y va, se tourne dos au
   * dossier et s'assoit. Les objets tenus d'une main restent en main.
   */
  sit(ref?: string, running = false): boolean {
    const c = this.character;
    const p = c.position;
    const seat = ref
      ? this.byRef(ref)
      : this.items.filter((i) => i.def.seat && !c.carried.includes(i)).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!seat) return fail(ref ? `Aucun objet « ${ref} ».` : 'Aucun siège où s’asseoir.');
    const name = `${FEMININE.has(seat.name) ? 'la' : 'le'} ${seat.name}`;
    if (!seat.def.seat) return fail(`On ne s’assoit pas sur ${name}.`);
    if (!c.canSit) return fail('Crée un perso pour pouvoir t’asseoir.');
    if (seat === this.sitting) return true;
    if (this.moving) return fail(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    if (c.carried.includes(seat)) return fail(`Pose d’abord ${name}.`);
    if (c.hands.loads.some((l) => l.length > 1 || isTwoHanded(l[0].grip))) return fail('Pose d’abord ce que tu portes à deux mains.');
    if (c.reading) return fail('Ferme d’abord le livre.');
    // debout, au sol, et rien dessus
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(seat.object.quaternion);
    if (seat.object.position.y > 0.05 || up.y < 0.95) return fail(`${name[0].toUpperCase()}${name.slice(1)} n’est pas debout par terre.`);
    const on = this.itemsOn(seat);
    if (on.length) return fail(`Il y a ${on.map((i) => `${FEMININE.has(i.name) ? 'une' : 'un'} ${i.name}`).join(' et ')} sur ${name}.`);
    if (c.seated) return c.standUp(() => this.sit(this.ref(seat), running));
    const o = seat.object;
    o.updateMatrixWorld(true);
    const center = seat.box.getCenter(new THREE.Vector3()).setY(0).applyMatrix4(o.matrixWorld).setY(0);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    const r = c.sitOn(center, forward, seat.def.seat, seat.size.z, () => this.wearItem(seat, WEAR_SIT), running);
    if (r === 'place') return fail(`Pas assez de place devant ${name} pour s’asseoir.`);
    if (r === 'ok') this.sitting = seat;
    return r === 'ok';
  }

  /** Se lever (faux si le perso n'est pas assis). */
  standUp(): boolean {
    return this.character.standUp();
  }

  /**
   * Range ce qu'on tient dans le meuble `ref` (sinon la bibliothèque la plus proche) ; `only` : ne
   * ranger que cet objet tenu.
   */
  store(ref?: string, only?: string): boolean {
    const p = this.character.position;
    const shelf = ref
      ? this.byRef(ref)
      : this.items.filter((i) => i.def.slots && !i.def.holds).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!shelf?.def.slots) {
      this.onNotice?.(ref ? `On ne range rien dans : ${ref}.` : 'Pas de meuble où ranger.');
      return false;
    }
    const item = only ? this.byRef(only) : undefined;
    if (only && (!item || !this.character.carried.includes(item))) {
      this.onNotice?.(`Pas de ${only} en main.`);
      return false;
    }
    return this.storeIn(shelf, false, item);
  }

  /** Boit une gorgée de ce que contient l'objet tenu (tasse de café, bouteille d'eau). */
  drink(): boolean {
    const c = this.character;
    const containers = c.heldItems.filter((i) => i.def.fill);
    const cup = containers.find((i) => i.contents) ?? containers[0];
    if (!cup) this.onNotice?.('Prends une tasse ou une bouteille pour boire.');
    else if (!cup.contents) this.onNotice?.(`${FEMININE.has(cup.name) ? 'La' : 'Le'} ${cup.name} est vide.`);
    else if (this.closeBookThen(() => this.drink())) return true;
    else return !!c.handOf(cup)?.drink();
    return false;
  }

  /** Prend une bouchée de l'aliment tenu (pomme, sandwich) ; une fois fini, il disparaît. */
  eat(): boolean {
    const c = this.character;
    const food = c.heldItems.find((i) => i.def.food);
    if (!food) this.onNotice?.('Prends quelque chose à manger (il y en a dans le frigo).');
    else if (this.closeBookThen(() => this.eat())) return true;
    else return !!c.handOf(food)?.eat();
    return false;
  }

  /**
   * Ouvre la porte du meuble `ref` (le frigo le plus proche sans ref) : le perso va devant et
   * l'ouvre.
   */
  openDoor(ref?: string, running = false): boolean {
    const item = this.doorItem(ref);
    if (!item) return false;
    if (this.doors.get(item)!.target === 1) return true;
    return this.withDoorOpen(item, () => {}, running);
  }

  /** Ferme la porte du meuble `ref` (le frigo le plus proche sans ref). */
  closeDoor(ref?: string): boolean {
    const item = this.doorItem(ref);
    if (!item) return false;
    const d = this.doors.get(item)!;
    d.target = 0;
    d.then = null;
    return true;
  }

  private doorItem(ref?: string): WorldItem | null {
    const p = this.character.position;
    const item = ref ? this.byRef(ref) : [...this.doors.keys()].sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!item || !this.doors.has(item)) {
      this.onNotice?.(ref ? `Pas de porte à ouvrir : ${ref}.` : 'Pas de porte à ouvrir ici.');
      return null;
    }
    return item;
  }

  /** Où se tenir devant un meuble (frigo, bibliothèque), à `gap` m de sa face avant. */
  private standBefore(item: WorldItem, gap: number): THREE.Vector3 {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(item.object.quaternion);
    return item.object.position.clone().addScaledVector(fwd, item.box.max.z + gap).setY(0);
  }

  /** La porte du meuble ouverte (le perso va d'abord devant et l'ouvre), puis `then`. */
  private withDoorOpen(item: WorldItem, then: () => void, running = false): boolean {
    const d = this.doors.get(item);
    if (!d || d.target === 1) {
      then();
      return true;
    }
    if (this.moving) {
      this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
      return false;
    }
    this.character.approachThen(this.doorStand(item), item.object.position, () => {
      d.target = 1;
      d.then = then;
      this.wearItem(item, WEAR_DOOR);
    }, running);
    return true;
  }

  /** Longueur d'une porte qui s'abaisse vers l'avant (four, lave-vaisselle), 0 sinon (mesurée porte fermée). */
  private doorReach(item: WorldItem): number {
    const part = item.part('porte');
    if (item.def.doorAxis !== 'x' || (item.def.door ?? 0) <= 0 || !part) return 0;
    return new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3()).y;
  }

  /** Où se tenir pour ouvrir un meuble et s'en servir : en retrait d'une porte qui s'abaisse. */
  private doorStand(item: WorldItem): THREE.Vector3 {
    const reach = this.doors.get(item)?.reach ?? 0;
    return this.standBefore(item, reach ? DOOR_GAP + reach / 2 : 0.45);
  }

  /** Ouverture d'une porte ou d'un tiroir (0 à 1), adoucie. */
  private openness(item: WorldItem): number {
    return THREE.MathUtils.smoothstep(this.doors.get(item)?.open ?? 0, 0, 1);
  }

  /**
   * Portes qui s'ouvrent ou se ferment (et tiroirs qui glissent, avec ce qu'ils contiennent) ;
   * elles se referment quand le perso s'éloigne.
   */
  private tickDoors(dt: number): void {
    // la toute première image peut avoir un dt négatif (horloge de la page) : la porte bougerait seule
    dt = Math.max(0, dt);
    const p = this.character.position;
    for (const [item, d] of this.doors) {
      if (d.target === 1 && !d.then && this.character.idle && p0(item.object.position).distanceTo(p0(p)) > DOOR_AUTOCLOSE) d.target = 0;
      const next = THREE.MathUtils.clamp(d.open + (d.target ? dt : -dt) / DOOR_TIME, 0, 1);
      const drawer = item.def.drawer;
      // ce qui est rangé dans le tiroir glisse avec lui
      const inside = drawer && next !== d.open ? this.storedIn(item) : [];
      const before = this.openness(item);
      d.open = next;
      const k = this.openness(item);
      const part = item.part('porte');
      if (part && drawer) part.position.z = k * drawer;
      else if (part && item.def.doorAxis === 'x') part.rotation.x = k * item.def.door!;
      else if (part) part.rotation.y = k * item.def.door!;
      if (inside.length) {
        const step = new THREE.Vector3(0, 0, 1).applyQuaternion(item.object.quaternion).multiplyScalar((k - before) * drawer!);
        for (const it of inside) it.object.position.add(step);
      }
      if (d.open === 1 && d.then) {
        const then = d.then;
        d.then = null;
        then();
      }
    }
  }

  /** Aliments finis : la main se vide, l'objet disparaît ; la faim remonte bouchée après bouchée. */
  private tickEating(): void {
    const c = this.character;
    for (const item of c.heldItems) {
      const food = item.def.food;
      if (!food) continue;
      const before = this.lastBite.get(item) ?? item.portion;
      if (before > item.portion) this.needs.restore('faim', (before - item.portion) * food.hunger * this.cookFactor(item));
      this.lastBite.set(item, item.portion);
      if (item.portion > 0 || !c.loseItem(item)) continue;
      this.lastBite.delete(item);
      this.items = this.items.filter((i) => i !== item);
      item.object.removeFromParent();
      this.onNotice?.(`${theName(item.name)} ${PLURAL.has(item.name) ? 'sont' : 'est'} fini${agree(item.name)}. Miam !`);
    }
  }

  /** « cuit », « brûlée »… : la cuisson d'un aliment, ou null s'il est cru. */
  private cookedWord(item: WorldItem): string | null {
    if (!item.def.food || item.cooked < 1) return null;
    return `${item.cooked >= 1.5 ? 'brûlé' : 'cuit'}${agree(item.name)}`;
  }

  /** Faim rendue par un aliment selon sa cuisson (part de sa valeur crue). */
  private cookFactor(item: WorldItem): number {
    return item.cooked >= 1.5 ? BURNT_HUNGER : item.cooked >= 1 ? COOKED_HUNGER : 1;
  }

  /**
   * Met en marche l'appareil `ref` (four, micro-ondes, lave-vaisselle ; sans ref, le plus proche) :
   * le perso va devant, ferme la porte et le lance. Il cuit ou lave ce qui est rangé dedans.
   */
  startAppliance(ref?: string, running = false): boolean {
    const item = ref ? this.byRef(ref) : this.nearest((i) => !!(i.def.heats || i.def.washes));
    if (!item) this.onNotice?.(ref ? `Aucun objet « ${ref} ».` : 'Il n’y a pas d’appareil à mettre en marche.');
    else if (!item.def.heats && !item.def.washes) this.onNotice?.(`On ne met pas en marche ${the(item.name)}.`);
    else if (this.appliances.has(item)) return true;
    else return this.runAppliance(item, running);
    return false;
  }

  /** Arrête l'appareil `ref` (sans ref, le plus proche en marche). */
  stopAppliance(ref?: string): boolean {
    const item = ref ? this.byRef(ref) : this.nearest((i) => this.appliances.has(i));
    if (!item || !this.appliances.has(item)) {
      this.onNotice?.('Aucun appareil en marche.');
      return false;
    }
    this.endAppliance(item, `${cap(the(item.name))} est arrêté${FEMININE.has(item.name) ? 'e' : ''}.`);
    return true;
  }

  private runAppliance(item: WorldItem, running: boolean): boolean {
    if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (!this.storedIn(item).length) this.onNotice?.(`${cap(the(item.name))} est vide : mets-y d’abord quelque chose ${item.def.heats ? 'à cuire' : 'à laver'}.`);
    else {
      this.character.approachThen(this.doorStand(item), item.object.position, () => {
        // on ferme la porte ; il démarre une fois fermée (tickAppliances)
        const d = this.doors.get(item);
        if (d) {
          d.target = 0;
          d.then = null;
        }
        const inside = this.storedIn(item);
        if (!inside.length || this.appliances.has(item)) return;
        this.appliances.set(item, { t: 0, start: new Map(inside.map((it) => [it, it.cooked])) });
        this.wearItem(item, WEAR_RUN);
        this.onNotice?.(`${cap(the(item.name))} ${item.def.heats ? 'chauffe' : 'tourne'}…`);
      }, running);
      return true;
    }
    return false;
  }

  /** L'appareil s'arrête : sa lumière s'éteint. */
  private endAppliance(item: WorldItem, note: string): void {
    this.appliances.delete(item);
    const light = item.part('lumiere');
    if (light) light.visible = false;
    this.onNotice?.(note);
  }

  /**
   * Appareils en marche, porte fermée : le four cuit d'un cran ce qu'il contient (deux fois :
   * brûlé), le micro-ondes le réchauffe sans le brûler, le lave-vaisselle rend la vaisselle propre.
   * Ouvrir la porte les arrête.
   */
  private tickAppliances(dt: number): void {
    for (const [item, r] of [...this.appliances]) {
      const d = this.doors.get(item);
      if (d?.target === 1) {
        this.endAppliance(item, `Porte ouverte : ${the(item.name)} s’arrête.`);
        continue;
      }
      // la porte finit de se fermer
      if (d && d.open > 0) continue;
      const light = item.part('lumiere');
      if (light) light.visible = true;
      const program = (item.def.heats ?? item.def.washes)!;
      r.t += Math.max(0, dt);
      const k = Math.min(1, r.t / program.seconds);
      const heats = item.def.heats;
      if (heats) {
        for (const [it, c0] of r.start) if (it.def.food && this.items.includes(it)) it.setCooked(heats.burns ? c0 + k : Math.max(c0, k));
      }
      if (k < 1) continue;
      const inside = [...r.start.keys()].filter((it) => this.items.includes(it));
      if (item.def.washes) {
        for (const it of inside) {
          it.dirty = false;
          it.setLevel(0);
          it.contents = null;
        }
        this.endAppliance(item, 'Ding ! La vaisselle est propre.');
        continue;
      }
      const done = inside.filter((it) => this.cookedWord(it)).map((it) => `${cap(the(it.name))} est ${this.cookedWord(it)}.`);
      this.endAppliance(item, `Ding ! ${done.join(' ') || 'C’est chaud.'}`);
    }
  }

  /** Jette l'objet tenu (le dernier pris, ou celui nommé) dans la poubelle la plus proche. */
  throwAway(name?: string, running = false): boolean {
    const c = this.character;
    const held = name ? c.heldItems.find((i) => i.name === name) : c.held;
    const bin = this.nearest((i) => !!i.def.bin);
    if (!held) this.onNotice?.(name ? `Pas de ${name} en main.` : 'Rien en main à jeter.');
    else if (!bin) this.onNotice?.('Il n’y a pas de poubelle.');
    else return this.throwInto(bin, held, running);
    return false;
  }

  /** Va à la poubelle, soulève le couvercle et y lâche `held`, qui disparaît de la pièce. */
  private throwInto(bin: WorldItem, held: WorldItem, running: boolean): boolean {
    const c = this.character;
    if (c.handOf(held)?.stacked) this.onNotice?.('On ne jette pas une pile de livres.');
    else if (isTwoHanded(held.grip)) this.onNotice?.(`Trop gros pour la poubelle : ${held.name}.`);
    else if ((this.binFill.get(bin) ?? 0) >= bin.def.bin!) this.onNotice?.('La poubelle est pleine : vide-la d’abord.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.closeBookThen(() => this.throwInto(bin, held, running))) return true;
    else {
      const put = () => {
        bin.object.updateMatrixWorld(true);
        const spot = new THREE.Vector3(0, bin.size.y * 0.45, 0).applyMatrix4(bin.object.matrixWorld);
        c.drop(spot, bin.object.rotation.y, () => {
          this.discard(held);
          this.binFill.set(bin, (this.binFill.get(bin) ?? 0) + 1);
          this.showTrash(bin);
          this.wearItem(bin, WEAR_BIN);
          const d = this.doors.get(bin);
          if (d) d.target = 0;
          this.onNotice?.(`${cap(the(held.name))} est à la poubelle.`);
        }, true, held);
      };
      c.approachThen(this.doorStand(bin), bin.object.position, () => this.withDoorOpen(bin, put), running);
      return true;
    }
    return false;
  }

  /** Vide la poubelle `ref` (sans ref, la plus proche) : on sort le sac. */
  emptyBin(ref?: string, running = false): boolean {
    const bin = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.bin);
    if (!bin?.def.bin) this.onNotice?.(ref ? `Ce n’est pas une poubelle : ${ref}.` : 'Il n’y a pas de poubelle.');
    else if (!this.binFill.get(bin)) this.onNotice?.('La poubelle est déjà vide.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else {
      this.character.approachThen(this.doorStand(bin), bin.object.position, () => {
        this.binFill.set(bin, 0);
        this.showTrash(bin);
        this.onNotice?.('Sac poubelle sorti : la poubelle est vide.');
      }, running);
      return true;
    }
    return false;
  }

  /** Les déchets montent dans la poubelle à mesure qu'on la remplit. */
  private showTrash(bin: WorldItem): void {
    const trash = bin.part('dechets');
    if (!trash) return;
    const n = this.binFill.get(bin) ?? 0;
    trash.visible = n > 0;
    trash.scale.y = Math.max(0.001, (n / bin.def.bin!) * bin.size.y * 0.8);
  }

  /** L'objet quitte la pièce (jeté). */
  private discard(item: WorldItem): void {
    this.items = this.items.filter((i) => i !== item);
    this.riders = this.riders.filter((r) => r.base !== item && r.item !== item);
    this.lastBite.delete(item);
    this.lastSips.delete(item);
    item.object.removeFromParent();
  }

  /**
   * Coupe en morceaux l'aliment tenu (`ref`, sinon le premier qui se coupe) sur la planche la plus
   * proche : le perso le pose sur la planche, prend le couteau, coupe, puis repose le couteau.
   */
  cut(ref?: string, running = false): boolean {
    const c = this.character;
    const food = ref ? this.byRef(ref) : undefined;
    if (ref && (!food || !c.heldItems.includes(food))) {
      this.onNotice?.(`Pas de ${food?.name ?? ref} en main.`);
      return false;
    }
    const board = this.nearest((i) => !!i.def.board && !c.carried.includes(i) && !this.flying.some((f) => f.item === i));
    return this.cutOn(board, running, food);
  }

  /** Planche à découper posée sur le meuble `item` (ou null). */
  private boardOn(item: WorldItem): WorldItem | null {
    if (item.def.portable && !isTwoHanded(item.grip)) return null;
    const carried = this.character.carried;
    return this.items.find((b) => b.def.board && !carried.includes(b) && b.object.position.y > item.object.position.y && this.isAbove(b, item)) ?? null;
  }

  /** Dessus de la planche (monde) : au milieu, ou décalé de `dx`, `dz` dans le repère de la planche. */
  private boardTop(board: WorldItem, dx = 0, dz = 0): THREE.Vector3 {
    board.object.updateMatrixWorld(true);
    const c = board.box.getCenter(new THREE.Vector3());
    return new THREE.Vector3(c.x + dx, board.box.max.y, c.z + dz).applyMatrix4(board.object.matrixWorld);
  }

  /** Une place libre sur la planche (pas sur les morceaux déjà coupés), le milieu d'abord. */
  private boardSpot(board: WorldItem, skip: WorldItem): THREE.Vector3 {
    const spots = [[0, 0], [-0.1, 0], [0.1, 0], [-0.1, 0.05], [0.1, -0.05]].map(([x, z]) => this.boardTop(board, x, z));
    const taken = (v: THREE.Vector3) => this.items.some((i) => i !== skip && i !== board && i.def.food && p0(i.object.position).distanceTo(p0(v)) < 0.07);
    return spots.find((v) => !taken(v)) ?? spots[0];
  }

  /**
   * Où se tenir pour couper sur la planche : devant le meuble qui la porte (plan de travail,
   * table), face à elle ; sinon tout près d'elle.
   */
  private cutStand(board: WorldItem): THREE.Vector3 {
    const under = this.items.find((o) => o !== board && (!o.def.portable || isTwoHanded(o.grip)) && !this.character.carried.includes(o) && o.object.position.y < board.object.position.y && this.isAbove(board, o));
    if (!under) return this.character.standFor(board);
    const o = under.object;
    o.updateMatrixWorld(true);
    const b = under.box;
    const at = o.worldToLocal(board.object.position.clone());
    // l'avant du meuble d'abord, sinon le côté libre le plus proche du perso
    const sides = [
      new THREE.Vector3(at.x, 0, b.max.z + CUT_STAND),
      new THREE.Vector3(b.max.x + CUT_STAND, 0, at.z),
      new THREE.Vector3(b.min.x - CUT_STAND, 0, at.z),
      new THREE.Vector3(at.x, 0, b.min.z - CUT_STAND),
    ].map((v) => o.localToWorld(v).setY(0));
    const nav = this.character.nav;
    if (!nav?.blocked(sides[0])) return sides[0];
    const p = this.character.position;
    return sides.filter((v) => !nav.blocked(v)).sort((u, v) => u.distanceTo(p) - v.distanceTo(p))[0] ?? sides[0];
  }

  private cutOn(board: WorldItem | null | undefined, running: boolean, only?: WorldItem): boolean {
    const c = this.character;
    const held = c.heldItems;
    const food = only ?? held.find((i) => i.def.cut);
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!c.canCarry) return fail('Crée un perso pour pouvoir cuisiner.');
    if (this.moving) return fail(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    if (this.washing || c.washing) return fail('Tu te laves, un instant.');
    if (!food) {
      const other = held.find((h) => h.def.food);
      return fail(other ? `${theName(other.name)} ne se coupe${PLURAL.has(other.name) ? 'nt' : ''} pas.` : 'Prends un aliment à couper : pomme, pain, carotte, tomate ou concombre (le frigo en a).');
    }
    if (!food.def.cut) return fail(`${theName(food.name)} ne se coupe pas.`);
    if (food.portion < 1) return fail(`${theName(food.name)} est entamé${agree(food.name)} : mange-l${FEMININE.has(food.name) ? 'a' : 'e'} plutôt.`);
    if (!board) return fail(held.some((h) => h.def.board) ? 'Pose d’abord la planche sur le plan de travail.' : 'Il n’y a pas de planche à découper.');
    if (board.object.position.y < 0.5) return fail('Pose d’abord la planche sur le plan de travail (ou une table).');
    const knife = held.find((h) => h.def.knife) ?? this.nearest((i) => !!i.def.knife && !c.carried.includes(i) && !this.flying.some((f) => f.item === i));
    if (!knife) return fail('Il n’y a pas de couteau.');
    if (c.busy || c.bracing) return false;
    if (this.closeBookThen(() => this.cutOn(board, running, only))) return true;
    if (c.seated) return c.standUp(() => this.cutOn(board, running, only));
    const stand = this.cutStand(board);
    const face = board.object.position;
    // 3. la lame va et vient au-dessus de l'aliment ; ensuite il est en morceaux
    const chop = (from: { pos: THREE.Vector3; yaw: number } | null) => {
      const hand = c.handOf(knife);
      const top = () => food.object.position.clone().setY(food.object.position.y + food.size.y * 0.6);
      if (!hand?.cut(top, () => {
        this.slice(food, board);
        this.wearItem(knife, WEAR_CUT.knife);
        this.wearItem(board, WEAR_CUT.board);
        // le couteau retourne à sa place s'il est à portée, sinon il reste en main
        if (from && p0(from.pos).distanceTo(p0(c.position)) < 0.9) c.drop(from.pos, from.yaw, undefined, false, knife);
      })) this.onNotice?.('Impossible de couper pour l’instant.');
    };
    // 2. le couteau : déjà en main, sinon on va le prendre, puis on revient devant la planche
    const takeKnife = () => {
      if (c.handOf(knife)) return chop(null);
      const q = knife.object.quaternion.clone();
      if (knife.def.layFlat) q.multiply(LAY_FLAT.clone().invert());
      const from = {
        pos: knife.object.position.clone().setY(knife.object.position.y - knife.restLift(knife.object.quaternion)),
        yaw: new THREE.Euler().setFromQuaternion(q, 'YXZ').y,
      };
      if (!c.pickUp(knife, running, undefined, () => c.approachThen(stand, face, () => chop(from), running))) this.onNotice?.('Il faut une main libre pour prendre le couteau.');
    };
    // 1. devant la planche, l'aliment posé dessus
    c.approachThen(stand, face, () => {
      if (!c.drop(this.boardSpot(board, food), undefined, takeKnife, false, food)) this.onNotice?.(`Impossible de poser ${food.name} sur la planche.`);
    }, running);
    return true;
  }

  /** L'aliment posé sur la planche devient ses morceaux (quartiers, tranches, rondelles). */
  private slice(food: WorldItem, board: WorldItem): void {
    const def = ITEM_BY_ID.get(food.def.cut!);
    if (!def || !this.items.includes(food)) return;
    const pieces = new WorldItem(def);
    const yaw = new THREE.Euler().setFromQuaternion(food.object.quaternion, 'YXZ').y;
    pieces.object.quaternion.setFromAxisAngle(UP, yaw);
    const top = this.boardTop(board);
    pieces.object.position.set(food.object.position.x, top.y + pieces.restLift(pieces.object.quaternion), food.object.position.z);
    pieces.setCondition(food.condition);
    this.items = this.items.filter((i) => i !== food);
    this.riders = this.riders.filter((r) => r.item !== food && r.base !== food);
    this.lastBite.delete(food);
    food.object.removeFromParent();
    this.items.push(pieces);
    this.scene.add(pieces.object);
    this.onNotice?.(`${cap(food.name)} coupé${agree(food.name)} : ${pieces.name} sur la planche.`);
  }

  /** Se fait un café à la machine la plus proche (il faut tenir la tasse). */
  makeCoffee(running = false): boolean {
    const machine = this.nearest((i) => i.def.pour?.liquid === 'café');
    if (!machine) this.onNotice?.('Il n’y a pas de machine à café.');
    return machine ? this.pourAt(machine, running) : false;
  }

  /** Remplit d'eau la tasse tenue à l'évier le plus proche (ce qu'elle contenait est vidé dans l'évier). */
  fillWater(running = false): boolean {
    const sink = this.nearest((i) => i.def.pour?.liquid === 'eau');
    if (!sink) this.onNotice?.('Il n’y a pas d’évier.');
    return sink ? this.pourAt(sink, running) : false;
  }

  /** Se lave les mains à l'évier le plus proche (il faut les mains libres). */
  washHands(running = false): boolean {
    return this.washAt(this.nearest((i) => !!i.def.wash), false, running);
  }

  /** Fait sa toilette à l'évier : de l'eau sur les mains et le visage (il faut les mains libres). */
  wash(running = false): boolean {
    return this.washAt(this.nearest((i) => !!i.def.wash), true, running);
  }

  /** L'objet le plus proche du perso qui vérifie `ok`. */
  private nearest(ok: (i: WorldItem) => boolean): WorldItem | undefined {
    const p = this.character.position;
    return this.items.filter(ok).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
  }

  /** Où se tenir devant un meuble (machine, évier) pour s'en servir. */
  private frontOf(item: WorldItem): THREE.Vector3 {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(item.object.quaternion);
    // contre l'évier pour atteindre le robinet (le perso se penche un peu)
    return item.object.position.clone().addScaledVector(fwd, item.box.max.z + (item.def.wash ? 0.22 : 0.26));
  }

  /**
   * Va à l'évier et met les mains sous le robinet : l'eau coule, les mains se frottent (et
   * montent au visage pour la toilette) ; l'hygiène remonte pendant ce temps (tickWash).
   */
  private washAt(sink: WorldItem | undefined, face: boolean, running: boolean): boolean {
    const c = this.character;
    const held = c.heldItems;
    if (!sink) this.onNotice?.('Il n’y a pas d’évier.');
    else if (!c.canCarry) this.onNotice?.('Crée un perso pour pouvoir te laver.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing) this.onNotice?.('Tu te laves déjà.');
    else if (this.brew?.machine === sink) this.onNotice?.(`${cap(theLiquid(sink.def.pour!.liquid))} coule déjà.`);
    else if (held.length) this.onNotice?.(`Pose d’abord ce que tu tiens (${held.map((h) => h.name).join(' et ')}) pour te laver.`);
    else if (c.busy || c.bracing) return false;
    else {
      const o = sink.object;
      const mid = new THREE.Vector3(...sink.def.wash!.hands);
      const at = () => {
        o.updateMatrixWorld(true);
        // mains de part et d'autre du filet d'eau ; la droite du perso est du côté -X de l'évier
        return { right: mid.clone().setX(mid.x - 0.05).applyMatrix4(o.matrixWorld), left: mid.clone().setX(mid.x + 0.05).applyMatrix4(o.matrixWorld) };
      };
      const how = face ? WASH_FACE : WASH_HANDS;
      return c.startWash(this.frontOf(sink), o.position, at, face, () => {
        this.washing = { sink, t: 0, seconds: how.seconds, hygiene: how.hygiene, face };
      }, running);
    }
    return false;
  }

  /** L'eau coule sur les mains ; l'hygiène remonte peu à peu ; à la fin, le perso se redresse. */
  private tickWash(dt: number): void {
    const w = this.washing;
    if (!w) return;
    const jet = w.sink.part('jet');
    const before = Math.min(1, w.t / w.seconds);
    w.t += dt;
    const done = Math.min(1, w.t / w.seconds);
    this.needs.restore('hygiene', (done - before) * w.hygiene);
    if (jet) {
      // l'eau tombe du robinet jusqu'aux mains
      jet.userData.top ??= jet.position.y;
      const top: number = jet.userData.top;
      const len = Math.max(0.001, top - w.sink.def.wash!.hands[1] - 0.02);
      jet.visible = done < 1;
      jet.scale.y = len;
      jet.position.y = top - len / 2;
    }
    if (done < 1) return;
    this.washing = null;
    this.wearItem(w.sink, WEAR_TAP);
    this.character.stopWash();
    this.onNotice?.(w.face ? 'Toilette faite : visage et mains propres.' : 'Mains lavées.');
  }

  /**
   * Va à la machine, pose la tasse sous le bec ; le café coule (frame → tickBrew), puis le perso
   * reprend la tasse pleine.
   */
  private pourAt(machine: WorldItem, running: boolean): boolean {
    const pour = machine.def.pour!;
    const cup = this.character.heldItems.find((i) => i.name === pour.fills);
    // autre chose dedans : vidé dans l'évier, sinon il faut d'abord le boire
    const other = cup?.contents && cup.contents !== pour.liquid ? cup.contents : null;
    if (this.brew) this.onNotice?.(`${cap(theLiquid(this.brew.machine.def.pour!.liquid))} coule déjà.`);
    else if (this.washing) this.onNotice?.('Tu te laves.');
    else if (!cup) this.onNotice?.(`Prends la ${pour.fills} pour la remplir ${ofLiquid(pour.liquid)}.`);
    else if (cup.dirty && !pour.drain) this.onNotice?.(`La ${cup.name} est sale : rince-la à l’évier ou passe-la au lave-vaisselle.`);
    else if (other && !pour.drain) this.onNotice?.(`La ${cup.name} contient encore ${someLiquid(other)} : bois-la ou vide-la à l’évier d’abord.`);
    else if (!other && !cup.dirty && cup.level > 0.99) this.onNotice?.(`La ${cup.name} est déjà pleine.`);
    else if (this.closeBookThen(() => this.pourAt(machine, running))) return true;
    else {
      this.character.approachThen(this.frontOf(machine), machine.object.position, () => {
        machine.object.updateMatrixWorld(true);
        const spot = new THREE.Vector3(...pour.at).applyMatrix4(machine.object.matrixWorld);
        // la tasse sous le bec, l'anse vers le perso
        this.character.drop(spot, machine.object.rotation.y, () => {
          if (other) {
            cup.setLevel(0);
            cup.contents = null;
            this.onNotice?.(`${cap(theLiquid(other))} est vidé${elides(other) ? 'e' : ''} dans l’${machine.name}.`);
          }
          cup.setLiquidColor(pour.color);
          // sale : sous le robinet, on la rince seulement
          this.brew = { machine, cup, t: 0, rinse: cup.dirty };
          this.wearItem(machine, machine.def.wash ? WEAR_TAP : WEAR_BREW.machine);
          this.wearItem(cup, WEAR_BREW.cup);
        }, true, cup);
      }, running);
      return true;
    }
    return false;
  }

  /** Le café coule du bec et remplit la tasse ; ensuite le perso la reprend s'il est resté là. */
  private tickBrew(dt: number): void {
    const b = this.brew;
    if (!b) return;
    const pour = b.machine.def.pour!;
    const T = pour.seconds;
    b.t += dt;
    const jet = b.machine.part('jet');
    if (jet) {
      jet.userData.top ??= jet.position.y;
      const top: number = jet.userData.top;
      // le jet descend jusqu'au café dans la tasse (repère de la machine)
      const fill = b.cup.def.fill;
      const bottom = pour.at[1] + (fill ? THREE.MathUtils.lerp(fill[0], fill[1], b.cup.level) : 0);
      const len = (top - bottom) * THREE.MathUtils.clamp((b.t - 0.3) / 0.15, 0, 1);
      // à la fin, la dernière goutte tombe
      const cut = THREE.MathUtils.clamp((b.t - T) / 0.15, 0, 1) * (top - bottom);
      jet.visible = len - cut > 0.002;
      jet.scale.y = Math.max(0.001, len - cut);
      jet.position.y = top - cut - jet.scale.y / 2;
    }
    b.cup.setLevel(b.rinse ? 0 : (b.t - 0.5) / (T - 0.6));
    if (b.t < T + 0.4) return;
    if (b.rinse) {
      b.cup.dirty = false;
      b.cup.contents = null;
      this.onNotice?.(`${cap(the(b.cup.name))} est rincé${FEMININE.has(b.cup.name) ? 'e' : ''}.`);
    } else {
      b.cup.setLevel(1);
      b.cup.contents = pour.liquid;
    }
    if (jet) jet.visible = false;
    this.brew = null;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.machine.object.quaternion);
    const stand = this.frontOf(b.machine);
    if (this.character.freeHand(b.cup) && this.character.position.distanceTo(stand) < 0.8) this.character.pickUp(b.cup, false, fwd);
  }

  /** Clic sur un objet : le prendre, l'ajouter à la pile tenue, ou y ranger ce qu'on tient. */
  private tryPickUp(item: WorldItem, running: boolean, opts: { body?: boolean } = {}): boolean {
    const c = this.character;
    const held = c.heldItems;
    const sameStack = held.find((h) => item.def.stack && h.def.stack === item.def.stack);
    // un livre rangé se prend par l'avant du meuble
    const stored = this.shelfOf(item);
    const from = stored?.forward;
    const door = this.doors.get(item);
    if (!c.canCarry) this.onNotice?.('Crée un perso pour pouvoir porter des objets.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing || this.character.washing) this.onNotice?.('Tu te laves, un instant.');
    // poubelle : on y jette ce qu'on tient
    else if (item.def.bin && held.length) return this.throwInto(item, c.held!, running);
    // frigo : on y range ce qu'on tient ; mains vides, on l'ouvre (clic sur le côté : on le pousse)
    else if (door && held.length) return this.storeIn(item, running);
    // porte ouverte (ou pas encore refermée) : tout clic sur le frigo la ferme, même là où la porte
    // n'est plus (l'intérieur, le côté) ; sinon ce clic agrippait le frigo pour le pousser
    else if (door && (door.target === 1 || door.open > 0)) return this.closeDoor(this.ref(item));
    else if (door && !opts.body) {
      return this.withDoorOpen(item, () => {}, running);
    }
    // un aliment à couper en main : clic sur la planche, ou sur le meuble où elle est posée
    else if (held.some((h) => h.def.cut) && (item.def.board || this.boardOn(item))) return this.cutOn(item.def.board ? item : this.boardOn(item), running);
    // appareil (four, micro-ondes, lave-vaisselle) : clic sur le côté, on le met en marche ou on l'arrête
    else if (item.def.heats || item.def.washes) return this.appliances.has(item) ? this.stopAppliance(this.ref(item)) : this.runAppliance(item, running);
    // poubelle pas vide : clic sur le côté, on la vide
    else if (item.def.bin && this.binFill.get(item)) return this.emptyBin(this.ref(item), running);
    // mains vides : un gros meuble s'agrippe pour le déplacer
    else if (item.def.movable && !held.length) return this.grabFurniture(item, running);
    // évier : la tasse en main se remplit d'eau, sinon on se lave les mains
    else if (item.def.wash && !held.some((h) => h.name === item.def.pour?.fills)) return this.washAt(item, false, running);
    else if (item.def.pour) return this.pourAt(item, running);
    else if (this.flying.some((f) => f.item === item)) return false;
    else if (item === this.brew?.cup) this.onNotice?.(`${cap(theLiquid(this.brew.machine.def.pour!.liquid))} coule encore.`);
    else if (item.def.slots && held.length) return this.storeIn(item, running);
    else if (item.def.slots) this.onNotice?.('Clique sur un livre pour le prendre, ou apporte des livres à ranger.');
    else if (!item.def.portable) this.onNotice?.(`On ne peut pas porter : ${item.name}.`);
    else if (this.closeBookThen(() => this.tryPickUp(item, running))) return true;
    // dans le frigo fermé : on ouvre d'abord
    else if (stored && this.doors.get(stored.shelf)?.target === 0 && (c.stackHand(item) || c.freeHand(item))) return this.withDoorOpen(stored.shelf, () => this.tryPickUp(item, running), running);
    // un livre de plus sur la pile tenue (l'autre main libre), sinon dans l'autre main
    else if (c.stackHand(item)) return c.collect(item, running, from);
    else if (c.freeHand(item)) return c.pickUp(item, running, from);
    else if (sameStack && c.handOf(sameStack)?.stacked) this.onNotice?.('La pile est complète.');
    else this.onNotice?.(`Les mains sont prises (${held.map((h) => h.name).join(' et ')}). E pour poser.`);
    return false;
  }

  /** Place n° `i` d'un meuble de rangement : base de l'objet et orientation (debout, face à l'avant). */
  private slot(shelf: WorldItem, i: number): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    shelf.object.updateMatrixWorld(true);
    // la place d'un tiroir sort avec lui
    const [x, y, z] = shelf.def.slots![i];
    const out = shelf.def.drawer ? this.openness(shelf) * shelf.def.drawer : 0;
    const pos = new THREE.Vector3(x, y, z + out).applyMatrix4(shelf.object.matrixWorld);
    // dos du livre (-Z) vers l'avant du meuble ; dans un frigo, l'avant de l'objet vers la porte
    const turn = shelf.def.holds ? 0 : Math.PI;
    const rot = shelf.object.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
    return { pos, rot };
  }

  /**
   * Places libres d'un meuble : sur le rayon le plus à hauteur des mains d'abord, puis de gauche
   * à droite (les livres se serrent contre les autres, un trou laissé se comble).
   */
  private freeSlots(shelf: WorldItem): number[] {
    const carried = this.character.carried;
    const height = (i: number) => Math.abs(shelf.def.slots![i][1] + 0.12 - 1);
    return shelf.def.slots!
      .map((_, i) => i)
      .filter((i) => {
        const at = this.slot(shelf, i).pos;
        return !this.items.some((it) => !carried.includes(it) && it.object.position.distanceTo(at) < 0.02);
      })
      .sort((a, b) => height(a) - height(b) || a - b);
  }

  /** Meuble où l'objet est rangé (et l'avant du meuble), ou null. */
  private shelfOf(item: WorldItem): { shelf: WorldItem; forward: THREE.Vector3 } | null {
    for (const shelf of this.items) {
      if (!shelf.def.slots) continue;
      for (let i = 0; i < shelf.def.slots.length; i++) {
        if (this.slot(shelf, i).pos.distanceTo(item.object.position) < 0.02) {
          return { shelf, forward: new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.object.quaternion) };
        }
      }
    }
    return null;
  }

  /** Objets rangés dans le meuble `shelf` (pas ceux qu'on tient ni ceux en vol). */
  private storedIn(shelf: WorldItem): WorldItem[] {
    const carried = this.character.carried;
    return this.items.filter((it) => it !== shelf && !carried.includes(it) && !this.flying.some((f) => f.item === it) && this.shelfOf(it)?.shelf === shelf);
  }

  /** Ce qu'on peut ranger dans ce meuble (sa fiche `holds`, sinon les livres). */
  private fits(shelf: WorldItem, item: WorldItem): boolean {
    return shelf.def.holds ? shelf.def.holds.includes(item.name) : item.def.stack === 'livre';
  }

  /** Va devant le meuble (ouvre sa porte s'il en a une) et y range, un par un, les objets tenus. */
  private storeIn(shelf: WorldItem, running: boolean, only?: WorldItem): boolean {
    const held = only ? this.character.heldItems.filter((i) => this.character.handOf(i) === this.character.handOf(only)) : this.character.heldItems;
    const first = held.find((i) => this.fits(shelf, i));
    const art = FEMININE.has(shelf.name) ? 'La' : 'Le';
    if (!first) {
      const what = shelf.def.holds ? shelf.def.holds.join(', ') : 'des livres';
      if (held.length) this.onNotice?.(`On ne range que ${shelf.def.holds ? `: ${what}` : what} ici (${held.map((h) => h.name).join(' et ')} en main).`);
      return false;
    }
    if (this.closeBookThen(() => this.storeIn(shelf, running, only))) return true;
    if (!this.freeSlots(shelf).length) {
      this.onNotice?.(`${art} ${shelf.name} est plein${FEMININE.has(shelf.name) ? 'e' : ''}.`);
      return false;
    }
    if (this.doors.has(shelf)) return this.withDoorOpen(shelf, () => this.storeNext(shelf, first, !only), running);
    this.character.approachThen(this.standBefore(shelf, 0.4), shelf.object.position, () => this.storeNext(shelf, first, !only), running);
    return true;
  }

  /** Range un par un les objets de la main qui tient `item` (et ceux empilés dessus), puis ceux de l'autre main. */
  private storeNext(shelf: WorldItem, item: WorldItem, both = true): void {
    const hands = this.character.handOf(item);
    if (!hands?.held) return;
    const free = this.freeSlots(shelf);
    if (!free.length) {
      this.onNotice?.(`${FEMININE.has(shelf.name) ? 'La' : 'Le'} ${shelf.name} est plein${FEMININE.has(shelf.name) ? 'e' : ''}.`);
      return;
    }
    const { pos, rot } = this.slot(shelf, free[0]);
    if (hands.stacked) hands.storeTop(pos, rot, () => this.storeNext(shelf, item, both));
    else {
      // puis ce que tient l'autre main, si ça se range aussi ici
      const next = () => {
        const other = both && this.character.heldItems.find((i) => this.fits(shelf, i));
        if (other) this.storeNext(shelf, other);
      };
      this.character.drop(pos, new THREE.Euler().setFromQuaternion(rot, 'YXZ').y, next, true, item);
    }
  }

  setZoom(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    // pas de déplacement pendant qu'on écrit dans la zone de saisie
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    on(window, 'keydown', (e) => {
      if (typing(e)) return;
      this.shift = e.shiftKey;
      this.keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) this.useKey();
      if (e.code === 'KeyB' && !e.repeat) this.drink();
      // M : la lettre, quelle que soit la disposition du clavier (AZERTY ou QWERTY)
      if (e.key.toLowerCase() === 'm' && !e.repeat) this.eat();
      if (e.code === 'KeyT' && !e.repeat) this.throwItem();
      if (e.code === 'KeyK' && !e.repeat) this.cut();
      if (e.code === 'KeyC' && !e.repeat) {
        if (this.character.seated) this.standUp();
        else this.sit();
      }
      if (e.code === 'KeyL' && !e.repeat) {
        if (this.character.reading) this.stopReading();
        else this.read();
      }
    });
    on(window, 'keyup', (e) => {
      this.shift = e.shiftKey;
      this.keys.delete(e.code);
    });
    on(window, 'blur', () => this.keys.clear());
    on(el, 'wheel', (e) => {
      e.preventDefault();
      this.setZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    on(el, 'pointermove', (e) => {
      const item = e.buttons ? null : this.itemAt(e.clientX, e.clientY);
      if (!item) {
        this.onHover?.(null);
        return;
      }
      const r = el.getBoundingClientRect();
      this.onHover?.({ name: item.name, grade: gradeName(item.condition, FEMININE.has(item.name)), condition: item.condition, x: e.clientX - r.left, y: e.clientY - r.top });
    });
    on(el, 'pointerleave', () => this.onHover?.(null));
    on(el, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      const hit = this.hitAt(e.clientX, e.clientY);
      if (hit) {
        // frigo : clic sur la porte = l'ouvrir ou la fermer, sur le côté = le pousser
        this.tryPickUp(hit.item, e.shiftKey, { body: !!(hit.item.def.door || hit.item.def.drawer) && !hit.door });
        return;
      }
      const p = this.groundPoint(e.clientX, e.clientY);
      if (!p) return;
      if (this.moving) {
        this.onNotice?.('Z Q S D pour déplacer le meuble, R / F pour le pivoter, E pour le lâcher.');
        return;
      }
      this.character.goTo(p, e.shiftKey);
      this.marker.position.set(p.x, 0.01, p.z);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
    });
  }

  /**
   * Objets posés sur `base` (et ceux posés sur eux), avec leur place par rapport à `base`.
   * « Posé dessus » : la base de l'objet touche le dessus de `base`, et il est au-dessus de lui.
   */
  private ridersOf(base: WorldItem): Array<{ item: WorldItem; rel: THREE.Matrix4 }> {
    const out: Array<{ item: WorldItem; rel: THREE.Matrix4 }> = [];
    base.object.updateMatrixWorld(true);
    const inv = base.object.matrixWorld.clone().invert();
    const stack = [base];
    while (stack.length) {
      const under = stack.pop()!;
      const box = new THREE.Box3().setFromObject(under.object);
      for (const it of this.items) {
        if (it === base || out.some((r) => r.item === it)) continue;
        const b = new THREE.Box3().setFromObject(it.object);
        const c = b.getCenter(new THREE.Vector3());
        if (c.x < box.min.x || c.x > box.max.x || c.z < box.min.z || c.z > box.max.z) continue;
        // posé sur le dessus, ou sur une surface plus basse (l'assise d'une chaise, sous le dossier)
        if (Math.abs(b.min.y - box.max.y) > 0.03 && !this.restsOn(c.setY(b.min.y), under)) continue;
        it.object.updateMatrixWorld(true);
        out.push({ item: it, rel: inv.clone().multiply(it.object.matrixWorld) });
        stack.push(it);
      }
    }
    return out;
  }

  /** Le point `base` (dessous d'un objet) repose-t-il sur une surface de `under` ? */
  private restsOn(base: THREE.Vector3, under: WorldItem): boolean {
    this.raycaster.set(base.clone().setY(base.y + 0.02), new THREE.Vector3(0, -1, 0));
    const hit = this.raycaster.intersectObject(under.object, true)[0];
    return !!hit && hit.distance < 0.05;
  }

  /** E : reposer l'objet tenu, sinon prendre l'objet portable le plus proche (à 1,5 m). */
  private useKey(): void {
    if (this.moving) {
      this.release();
      return;
    }
    if (this.washing || this.character.washing) return;
    if (this.character.held) {
      this.drop();
      return;
    }
    if (this.character.busy) return;
    const p = this.character.position;
    const near = this.items
      .filter((i) => i.def.portable && i.object.position.distanceTo(p) < 1.5 + i.object.position.y)
      .sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (near) this.tryPickUp(near, false);
  }

  private aim(cx: number, cy: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /** Objet sous un pixel de l'écran (sauf celui qu'on tient). */
  private itemAt(cx: number, cy: number): WorldItem | null {
    return this.hitAt(cx, cy)?.item ?? null;
  }

  /** Objet sous un pixel de l'écran, et si c'est sa porte qui est touchée. */
  private hitAt(cx: number, cy: number): { item: WorldItem; door: boolean } | null {
    this.aim(cx, cy);
    const carried = this.character.carried;
    const objects = this.items.filter((i) => !carried.includes(i)).map((i) => i.object);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    let door = false;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.name === 'porte') door = true;
      const item = this.items.find((i) => i.object === o);
      if (item) return { item, door };
    }
    return null;
  }

  /** Point du sol sous un pixel de l'écran (ou null). */
  private groundPoint(cx: number, cy: number): THREE.Vector3 | null {
    this.aim(cx, cy);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    return hit ? hit.point : null;
  }

  /** Direction clavier dans le repère monde (relative à la caméra : « haut » = vers le fond). */
  private keyboardDir(): THREE.Vector3 {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1; // Z en AZERTY = KeyW
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1; // Q en AZERTY = KeyA
    if (!f && !s) return new THREE.Vector3();
    // avant = de la caméra vers la cible, projeté au sol ; droite = perpendiculaire
    const fwd = new THREE.Vector3(-Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return fwd.multiplyScalar(f).addScaledVector(right, s).normalize();
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.character.setMoveInput(this.keyboardDir(), this.shift);
    // R : pivoter le meuble vers la droite, F : vers la gauche
    this.character.setTurnInput((this.keys.has('KeyF') ? 1 : 0) - (this.keys.has('KeyR') ? 1 : 0));
    this.character.update(dt, GROUND_HALF - 14);
    const c = this.character;
    const held = c.heldItems;
    // les objets posés dessus suivent l'objet tenu, jusqu'à sa dernière position une fois reposé
    for (const r of this.riders) {
      if (!held.includes(r.base) && !this.prevHeld.includes(r.base)) continue;
      r.base.object.updateMatrixWorld(true);
      const o = r.item.object;
      o.matrix.multiplyMatrices(r.base.object.matrixWorld, r.rel);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
    }
    this.riders = this.riders.filter((r) => held.includes(r.base));
    this.prevHeld = held;
    this.updateNav();
    this.tickBrew(dt);
    this.tickDoors(dt);
    this.tickAppliances(dt);
    this.tickEating();
    this.tickWash(dt);
    this.tickFlying(dt);
    this.debris = this.debris.filter((d) => d.update(dt));
    this.tickNeeds(dt);
    const book = held.find((h) => h.def.buildOpen);
    if (book && c.reading?.held === book) this.wearItem(book, dt * WEAR_READ);
    this.checkWorn();
    // avec le grade d'usure de chacun (« tasse de café, usée »)
    const grade = (i: WorldItem) => gradeName(i.condition, FEMININE.has(i.name));
    const names = held.map((h) => {
      // « tasse de café », « bouteille d'eau » (l'eau est déjà dans le nom), « bouteille d'eau vide »
      const base = h.contents ? (h.name.includes(h.contents) ? h.name : `${h.name} ${ofLiquid(h.contents)}`) : h.def.startFull ? `${h.name} vide` : h.name;
      // « pomme cuite », « tasse sale »
      const n = [base, this.cookedWord(h), h.dirty ? 'sale' : null].filter(Boolean).join(' ');
      const count = c.handOf(h)?.carried.length ?? 1;
      return count > 1 ? `${n} ×${count}` : `${n}, ${grade(h)}`;
    });
    if (this.sitting && !c.seated && (c.idle || c.washing)) this.sitting = null;
    const label = this.moving ? `${this.moving.item.name}, ${grade(this.moving.item)}` : names.length ? names.join(' et ') : null;
    const bookHand = book ? c.handOf(book) : null;
    const last = c.held;
    const can: HandActions = {
      drink: held.some((h) => !!h.contents),
      eat: held.some((h) => !!h.def.food),
      cut: held.some((h) => !!h.def.cut && h.portion === 1),
      throw: !!last && !!c.handOf(last)?.canThrow,
      moving: !!this.moving,
      read: !!bookHand && !bookHand.stacked && c.otherFree(bookHand),
      reading: !!c.reading,
      seated: !!this.sitting,
    };
    const key = JSON.stringify(can);
    if (label !== this.heldLabel || key !== this.actionsKey) {
      this.heldLabel = label;
      this.actionsKey = key;
      this.onHeldChange?.(label, can);
    }
    const mm = this.marker.material as THREE.MeshBasicMaterial;
    mm.opacity = Math.max(0, mm.opacity - dt * 0.9);
    this.updateCamera(dt);
    this.placeBubble();
    this.motes.update(now / 1000, this.character.position);
    this.post.render();
  };

  /** Le temps passe : les besoins baissent ; boire (café) remonte la soif et réveille un peu. */
  private tickNeeds(dt: number): void {
    const hours = this.clock.tick(dt);
    const before = this.needs.health;
    this.needs.tick(hours, this.character.seated ? 'sit' : this.character.moveGait, this.clock.isNight);
    // prévenir le joueur quand la santé passe sous un seuil
    const after = this.needs.health;
    if (before > 0 && after <= 0) this.onNotice?.('Santé à zéro : le perso est à bout de forces.');
    else if (before >= 25 && after < 25) this.onNotice?.('Santé faible : un besoin est à zéro depuis trop longtemps.');
    // les récipients tenus (tasse, bouteille), dans l'une ou l'autre main
    const sips = new Map<WorldItem, { level: number; contents: string | null }>();
    for (const held of this.character.heldItems.filter((i) => i.def.fill)) {
      const last = this.lastSips.get(held);
      const drunk = last ? last.level - held.level : 0;
      if (drunk > 0) {
        this.wearItem(held, drunk * WEAR_DRINK);
        this.needs.restore('soif', drunk * DRINK_THIRST);
        if (last?.contents === 'eau') this.needs.restore('soif', drunk * WATER_EXTRA);
        if (last?.contents === 'café') this.needs.restore('fatigue', drunk * COFFEE_ENERGY);
        // une tasse bue jusqu'au bout est sale (pas la bouteille, qu'on jette)
        if (held.level <= 0 && !held.def.startFull) held.dirty = true;
      }
      sips.set(held, { level: held.level, contents: held.contents });
    }
    this.lastSips = sips;
  }

  /** Bulle de parole : suit la tête du perso à l'écran, puis disparaît. */
  private placeBubble(): void {
    if (this.bubble.hidden) return;
    if (performance.now() > this.bubbleUntil) {
      this.bubble.hidden = true;
      return;
    }
    const head = this.character.position.clone().setY(1.75).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.bubble.style.left = `${((head.x + 1) / 2) * w}px`;
    this.bubble.style.top = `${((1 - head.y) / 2) * h}px`;
  }

  private updateCamera(dt: number): void {
    const targetYaw = BASE_YAW + this.quarter * (Math.PI / 2);
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 8);
    const p = this.character.position;
    this.focus.lerp(new THREE.Vector3(p.x, FOCUS_HEIGHT, p.z), Math.min(1, dt * 5));
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    // portrait (téléphone) : vue plus haute pour garder assez de largeur
    const viewH = (aspect >= 1 ? VIEW_HEIGHT : Math.max(VIEW_HEIGHT, 7 / aspect)) / this.zoom;
    const c = this.camera;
    c.left = -viewH * aspect / 2;
    c.right = viewH * aspect / 2;
    c.top = viewH / 2;
    c.bottom = -viewH / 2;
    c.updateProjectionMatrix();
    c.position.set(
      this.focus.x + Math.cos(this.yaw) * Math.cos(ISO_ELEVATION) * CAM_DIST,
      this.focus.y + Math.sin(ISO_ELEVATION) * CAM_DIST,
      this.focus.z + Math.sin(this.yaw) * Math.cos(ISO_ELEVATION) * CAM_DIST,
    );
    c.lookAt(this.focus);
    // lumière selon l'heure ; soleil et carte d'ombre suivent le perso
    applySky(this.clock.hour, { sun: this.sun, hemi: this.hemi, scene: this.scene, grade: (g, s) => this.post.setGrade(g, s) }, this.focus);
    // flou de profondeur : net autour du perso (distance caméra -> point suivi), plus large au dézoom
    this.post.setDof({ focus: CAM_DIST, range: 2.2 / this.zoom, falloff: 6 / this.zoom, strength: 1 });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.character.dispose();
    this.resizeObs.disconnect();
    for (const d of this.disposers) d();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.bubble.remove();
  }
}
