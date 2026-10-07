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
import { LAY_FLAT, WorldItem } from './items/carry';
import { isTwoHanded } from './items/grips';
import { ITEM_BY_ID, SLOTS_PER_SHELF, TABLE_H } from './items/catalog';
import { createMotes } from './motes';
import { footprint, Nav, overlaps } from './nav';
import { Needs } from './needs';
import { lightAllPasses, PostFx } from './postfx';

/** Élévation de la caméra iso 2:1 (30° au-dessus de l'horizon), comme Arena Tactic. */
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

/** Objets de test posés autour du point de départ : [id, x, y, z, rotation (rad)]. */
const START_ITEMS: Array<[string, number, number, number, number]> = [
  // table côté caméra : le perso lui fait face en prenant la tasse ou la lettre
  ['table', 1.3, 0, 1.3, Math.PI / 4],
  ['tasse', 1.07, TABLE_H, 1.28, 0.6],
  ['lettre', 1.34, TABLE_H, 1.05, Math.PI / 3],
  ['caisse', 0.6, 0, -1.9, 0.2],
  ['bibliotheque', -1.7, 0, -1.2, Math.PI / 4],
  ['machine-a-cafe', 2.1, 0, -0.8, -Math.PI / 4],
];

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
  /** Meuble de rangement, machine (à café) ou récipient (tasse). */
  sorte?: 'rangement' | 'machine' | 'récipient';
  ou: string;
  distance: number;
}

/** Noms féminins (accord des messages). */
const FEMININE = new Set(['tasse', 'lettre', 'caisse', 'table', 'bibliothèque', 'machine à café']);

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
  /** L'objet tenu (le dernier pris) peut être lancé. */
  throw: boolean;
  /** En train de déplacer un gros meuble. */
  moving: boolean;
  read: boolean;
  reading: boolean;
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
  /** Niveau de la tasse tenue à l'image précédente : ce qui a été bu depuis. */
  private lastSip: { item: WorldItem; level: number; contents: string | null } | null = null;
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
  /** Gros meuble en train d'être déplacé, et ce qui est posé ou rangé dedans (suit le meuble). */
  private moving: { item: WorldItem; riders: Array<{ item: WorldItem; rel: THREE.Matrix4 }> } | null = null;
  /** Objets lancés en vol, et éclats des objets brisés. */
  private flying: Flying[] = [];
  private debris: Debris[] = [];
  /** Café en train de couler : la machine, la tasse posée dessous, le temps écoulé (s). */
  private brew: { machine: WorldItem; cup: WorldItem; t: number } | null = null;
  /** Objet tenu qui change (nom ou null) : pour l'interface. */
  onHeldChange: ((name: string | null, can: HandActions) => void) | null = null;
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
    const shelf = this.items.find((i) => i.def.slots)!;
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
  }

  /** Plus rien en cours : le perso est arrivé, ses mains sont libres de tout geste, le café a coulé. */
  get idle(): boolean {
    return this.character.idle && !this.brew && !this.flying.length;
  }

  /** Les meubles (objets non portables) à contourner, sauf `skip`. */
  private buildNav(skip?: WorldItem): Nav {
    const nav = new Nav();
    for (const it of this.items) if (!it.def.portable && it !== skip) nav.add(it.box, it.object.position, it.object.rotation.y);
    return nav;
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
      this.onNotice?.(`Le ${item.def.pour!.liquid} coule encore.`);
      return false;
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
      o.updateMatrixWorld(true);
      for (const r of riders) {
        const ro = r.item.object;
        ro.matrix.multiplyMatrices(o.matrixWorld, r.rel);
        ro.matrix.decompose(ro.position, ro.quaternion, ro.scale);
      }
      return true;
    };
    const ok = c.startPush(stand, faceAt, at, move, running);
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
    if (!f.bounced && Math.random() < breakChance(item.def.fragility ?? 5, speed)) {
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
  private shatter(item: WorldItem, floor: number, vel = new THREE.Vector3()): void {
    this.addDebris(new Debris(item, floor, vel));
    this.items = this.items.filter((i) => i !== item);
    item.object.removeFromParent();
    this.onNotice?.(`${item.name[0].toUpperCase()}${item.name.slice(1)} s'est brisé${FEMININE.has(item.name) ? 'e' : ''} !`);
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
      if (item === this.brew?.cup) ou += ' (le café coule dedans)';
      if (item.contents) ou += `, contient du ${item.contents}`;
      const sorte: WorldObject['sorte'] = item.def.slots ? 'rangement' : item.def.pour ? 'machine' : item.def.fill ? 'récipient' : undefined;
      if (item === reading?.held) ou += ', ouvert (le perso le lit)';
      return { ref: this.ref(item), nom: item.name, portable: item.def.portable, deuxMains: isTwoHanded(item.grip) || undefined, sorte, ou, distance: Math.round(item.object.position.distanceTo(p) * 10) / 10 };
    });
    return {
      perso: this.character.canCarry ? 'peut porter des objets' : 'ne peut pas porter d’objets (perso par défaut)',
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

  /** Range dans la bibliothèque la plus proche les livres tenus. */
  store(): boolean {
    const p = this.character.position;
    const shelf = this.items
      .filter((i) => i.def.slots)
      .sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    return shelf ? this.storeIn(shelf, false) : false;
  }

  /** Boit une gorgée de ce que contient l'objet tenu (tasse de café). */
  drink(): boolean {
    const c = this.character;
    const cup = c.heldItems.find((i) => i.def.fill);
    if (!cup) this.onNotice?.('Prends une tasse pour boire.');
    else if (!cup.contents) this.onNotice?.(`La ${cup.name} est vide.`);
    else if (this.closeBookThen(() => this.drink())) return true;
    else return !!c.handOf(cup)?.drink();
    return false;
  }

  /** Se fait un café à la machine la plus proche (il faut tenir la tasse). */
  makeCoffee(running = false): boolean {
    const p = this.character.position;
    const machine = this.items
      .filter((i) => i.def.pour)
      .sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    return machine ? this.pourAt(machine, running) : false;
  }

  /**
   * Va à la machine, pose la tasse sous le bec ; le café coule (frame → tickBrew), puis le perso
   * reprend la tasse pleine.
   */
  private pourAt(machine: WorldItem, running: boolean): boolean {
    const pour = machine.def.pour!;
    const cup = this.character.heldItems.find((i) => i.name === pour.fills);
    if (this.brew) this.onNotice?.(`Le ${pour.liquid} coule déjà.`);
    else if (!cup) this.onNotice?.(`Prends la ${pour.fills} pour te faire un ${pour.liquid}.`);
    else if (cup.level > 0.99) this.onNotice?.(`La ${cup.name} est déjà pleine.`);
    else if (this.closeBookThen(() => this.pourAt(machine, running))) return true;
    else {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(machine.object.quaternion);
      const stand = machine.object.position.clone().addScaledVector(fwd, 0.47);
      this.character.approachThen(stand, machine.object.position, () => {
        machine.object.updateMatrixWorld(true);
        const spot = new THREE.Vector3(...pour.at).applyMatrix4(machine.object.matrixWorld);
        // la tasse sous le bec, l'anse vers le perso
        this.character.drop(spot, machine.object.rotation.y, () => {
          this.brew = { machine, cup, t: 0 };
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
    b.cup.setLevel((b.t - 0.5) / (T - 0.6));
    if (b.t < T + 0.4) return;
    b.cup.setLevel(1);
    b.cup.contents = pour.liquid;
    if (jet) jet.visible = false;
    this.brew = null;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.machine.object.quaternion);
    const stand = b.machine.object.position.clone().addScaledVector(fwd, 0.47);
    if (this.character.freeHand(b.cup) && this.character.position.distanceTo(stand) < 0.8) this.character.pickUp(b.cup, false, fwd);
  }

  /** Clic sur un objet : le prendre, l'ajouter à la pile tenue, ou y ranger ce qu'on tient. */
  private tryPickUp(item: WorldItem, running: boolean): boolean {
    const c = this.character;
    const held = c.heldItems;
    const sameStack = held.find((h) => item.def.stack && h.def.stack === item.def.stack);
    // un livre rangé se prend par l'avant du meuble
    const from = this.shelfOf(item)?.forward;
    if (!c.canCarry) this.onNotice?.('Crée un perso pour pouvoir porter des objets.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    // mains vides : un gros meuble s'agrippe pour le déplacer
    else if (item.def.movable && !held.length) return this.grabFurniture(item, running);
    else if (item.def.pour) return this.pourAt(item, running);
    else if (this.flying.some((f) => f.item === item)) return false;
    else if (item === this.brew?.cup) this.onNotice?.(`Le ${this.brew.machine.def.pour!.liquid} coule encore.`);
    else if (item.def.slots && held.length) return this.storeIn(item, running);
    else if (item.def.slots) this.onNotice?.('Clique sur un livre pour le prendre, ou apporte des livres à ranger.');
    else if (!item.def.portable) this.onNotice?.(`On ne peut pas porter : ${item.name}.`);
    else if (this.closeBookThen(() => this.tryPickUp(item, running))) return true;
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
    const pos = new THREE.Vector3(...shelf.def.slots![i]).applyMatrix4(shelf.object.matrixWorld);
    // dos du livre (-Z) vers l'avant du meuble
    const rot = shelf.object.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
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

  /** Va devant le meuble et y range, un par un, les objets tenus. */
  private storeIn(shelf: WorldItem, running: boolean): boolean {
    const held = this.character.heldItems;
    const books = held.find((i) => i.def.stack === 'livre');
    if (!books) {
      if (held.length) this.onNotice?.(`On ne range que des livres ici (${held.map((h) => h.name).join(' et ')} en main).`);
      return false;
    }
    if (this.closeBookThen(() => this.storeIn(shelf, running))) return true;
    if (!this.freeSlots(shelf).length) {
      this.onNotice?.('La bibliothèque est pleine.');
      return false;
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.object.quaternion);
    const stand = shelf.object.position.clone().addScaledVector(fwd, 0.55);
    this.character.approachThen(stand, shelf.object.position, () => this.storeNext(shelf, books), running);
    return true;
  }

  /** Range un par un les livres de la main qui tient `books` (et ceux empilés dessus). */
  private storeNext(shelf: WorldItem, books: WorldItem): void {
    const hands = this.character.handOf(books);
    if (!hands?.held) return;
    const free = this.freeSlots(shelf);
    if (!free.length) {
      this.onNotice?.('La bibliothèque est pleine.');
      return;
    }
    const { pos, rot } = this.slot(shelf, free[0]);
    if (hands.stacked) hands.storeTop(pos, rot, () => this.storeNext(shelf, books));
    else this.character.drop(pos, new THREE.Euler().setFromQuaternion(rot, 'YXZ').y, undefined, true, books);
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
      if (e.code === 'KeyT' && !e.repeat) this.throwItem();
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
    on(el, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      const item = this.itemAt(e.clientX, e.clientY);
      if (item) {
        this.tryPickUp(item, e.shiftKey);
        return;
      }
      const p = this.groundPoint(e.clientX, e.clientY);
      if (!p) return;
      if (this.moving) {
        this.onNotice?.('Z Q S D pour déplacer le meuble, E pour le lâcher.');
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
        if (Math.abs(b.min.y - box.max.y) > 0.03 || c.x < box.min.x || c.x > box.max.x || c.z < box.min.z || c.z > box.max.z) continue;
        it.object.updateMatrixWorld(true);
        out.push({ item: it, rel: inv.clone().multiply(it.object.matrixWorld) });
        stack.push(it);
      }
    }
    return out;
  }

  /** E : reposer l'objet tenu, sinon prendre l'objet portable le plus proche (à 1,5 m). */
  private useKey(): void {
    if (this.moving) {
      this.release();
      return;
    }
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
    this.aim(cx, cy);
    const carried = this.character.carried;
    const objects = this.items.filter((i) => !carried.includes(i)).map((i) => i.object);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      const item = this.items.find((i) => i.object === o);
      if (item) return item;
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
    this.tickBrew(dt);
    this.tickFlying(dt);
    this.debris = this.debris.filter((d) => d.update(dt));
    this.tickNeeds(dt);
    const names = held.map((h) => {
      const n = h.contents ? `${h.name} de ${h.contents}` : h.name;
      const count = c.handOf(h)?.carried.length ?? 1;
      return count > 1 ? `${n} ×${count}` : n;
    });
    const label = this.moving ? this.moving.item.name : names.length ? names.join(' et ') : null;
    const book = held.find((h) => h.def.buildOpen);
    const bookHand = book ? c.handOf(book) : null;
    const last = c.held;
    const can: HandActions = {
      drink: held.some((h) => !!h.contents),
      throw: !!last && !!c.handOf(last)?.canThrow,
      moving: !!this.moving,
      read: !!bookHand && !bookHand.stacked && c.otherFree(bookHand),
      reading: !!c.reading,
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
    this.needs.tick(hours, this.character.moveGait, this.clock.isNight);
    // la tasse, dans l'une ou l'autre main
    const held = this.character.heldItems.find((i) => i.def.fill);
    if (held) {
      const drunk = this.lastSip?.item === held ? this.lastSip.level - held.level : 0;
      if (drunk > 0) {
        this.needs.restore('soif', drunk * DRINK_THIRST);
        if (this.lastSip?.contents === 'café') this.needs.restore('fatigue', drunk * COFFEE_ENERGY);
      }
      this.lastSip = { item: held, level: held.level, contents: held.contents };
    } else this.lastSip = null;
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
