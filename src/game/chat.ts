/**
 * Le chaton (objets dans items/animaux.ts) :
 * - au début, un chaton errant miaule près du potager. Il a faim et se méfie : on ne le caresse
 *   pas, mais si on lui donne à manger (croquettes, poisson pêché, steak, tenus en main) il
 *   mange, nous adopte, et rentre à la maison par la chatière de la cuisine ;
 * - à la maison, il a faim et sommeil (selon l'heure du jeu) : il se promène dans la cuisine et
 *   le salon, va manger à sa gamelle (qu'on remplit avec le sac de croquettes), la réclame en
 *   miaulant quand elle est vide, et fait la sieste roulé en boule sur le canapé ;
 * - le caresser le fait ronronner, et fait monter l'humeur du perso.
 *
 * Il est fait de quelques formes (pas de squelette) : ses poses (debout, assis, couché en boule,
 * la tête dans la gamelle) se mélangent en douceur, les pattes balancent quand il marche.
 * Game ne fait que brancher (menu, clic, image, sauvegarde) par l'interface ChatHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import { ROOM, WALL_T } from './room';
import { SALON } from './salon';
import { BAG_SERVINGS, CAT_FLAP, KITTEN_BACK, STRAY_ZONE, TAIL_SEGS, catFood, kittenWants, readKitten, tickNeeds, type KittenNeeds } from './items/animaux';

export interface ChatHost {
  readonly character: Character;
  remove(item: WorldItem): void;
  notice(text: string): void;
  say(text: string): void;
  mood(n: number): void;
  /** Chemin au sol qui contourne meubles et murs (points de passage, l'arrivée comprise). */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[];
  /** Un poisson pêché (le chaton en mange). */
  isFish(id: string): boolean;
}

/** Vitesse (m/s) au pas, en trottinant. */
const WALK = 0.45;
const TROT = 0.9;
/** Distance où le chaton errant remarque le perso et miaule. */
const HEAR_AT = 4;
/** Humeur gagnée en le caressant, et l'attente (s) avant que ça compte de nouveau. */
const PET_JOY = 4;
const PET_COOLDOWN = 40;
/** Temps (s) pour manger, pour une caresse, d'attente d'un perso qui vient le voir. */
const EAT_S = 4;
const PURR_S = 3.5;
const WAIT_S = 12;
/** Entre deux miaulements pour réclamer (s). */
const MEOW_EVERY = 45;

type Act = 'idle' | 'walk' | 'sit' | 'sleep' | 'eat';
type Plan =
  | { kind: 'rien' }
  | { kind: 'aller'; path: THREE.Vector3[]; fast: boolean; then: () => void }
  | { kind: 'pause'; t: number; act: Act; then: () => void }
  | { kind: 'sieste' }
  | { kind: 'reclame' };

/** Les poses : chaque nombre va doucement vers celui de la pose voulue. */
interface Pose {
  /** Hauteur et bascule du corps (assis : l'avant monte). */
  bodyY: number;
  pitch: number;
  /** Tête : hauteur, avance, penchée. */
  headY: number;
  headZ: number;
  headPitch: number;
  /** Pattes repliées (0 debout, 1 rentrées sous lui), pattes arrière pliées (assis). */
  tuck: number;
  hind: number;
  /** Yeux ouverts (1) ou fermés. */
  eyes: number;
  /** Queue dressée (marche), enroulée autour de lui (dort). */
  tailUp: number;
  curl: number;
}

const POSES: Record<Act, Pose> = {
  idle: { bodyY: 0, pitch: 0, headY: 0, headZ: 0, headPitch: 0, tuck: 0, hind: 0, eyes: 1, tailUp: 0.3, curl: 0 },
  walk: { bodyY: 0, pitch: 0, headY: 0, headZ: 0.005, headPitch: 0.05, tuck: 0, hind: 0, eyes: 1, tailUp: 1, curl: 0 },
  sit: { bodyY: -0.03, pitch: -0.55, headY: 0.025, headZ: -0.02, headPitch: -0.1, tuck: 0, hind: 1, eyes: 1, tailUp: 0, curl: 0.5 },
  sleep: { bodyY: -0.06, pitch: 0, headY: -0.1, headZ: -0.01, headPitch: 0.35, tuck: 1, hind: 0, eyes: 0, tailUp: 0, curl: 1 },
  eat: { bodyY: -0.01, pitch: 0.15, headY: -0.085, headZ: 0.03, headPitch: 0.7, tuck: 0, hind: 0, eyes: 0.6, tailUp: 0.5, curl: 0 },
};

/** Les pièces qui bougent, retrouvées une fois. */
interface Rig {
  body: THREE.Object3D;
  head: THREE.Object3D;
  eyes: THREE.Object3D;
  legs: THREE.Object3D[];
  tail: THREE.Object3D[];
  pose: Pose;
  /** Avance de la marche (rad), temps (s). */
  gait: number;
  t: number;
}

export class Chat {
  private host: ChatHost;
  private kitten: WorldItem | null = null;
  private rig: Rig | null = null;
  private bowl: WorldItem | null = null;
  private sofa: WorldItem | null = null;
  private flaps: THREE.Object3D[] = [];
  private adopted = false;
  private needs: KittenNeeds = { hunger: 0.8, sleepy: 0 };
  /** Gamelle remplie. */
  private full = false;
  private plan: Plan = { kind: 'rien' };
  private act: Act = 'sit';
  /** Sur le canapé : la place du dessus, et celle au sol d'où il saute. */
  private perch: { top: THREE.Vector3; floor: THREE.Vector3; yaw: number } | null = null;
  /** Saut en cours (canapé). */
  private hop: { from: THREE.Vector3; to: THREE.Vector3; t: number; then: () => void } | null = null;
  private lastPet = -Infinity;
  private lastMeow = -Infinity;
  private heard = false;
  private clock = 0;
  /** Le chaton ronronne (caresse) : jusqu'à quand. */
  private purrUntil = 0;
  private flapSwing = 0;

  constructor(host: ChatHost) {
    this.host = host;
  }

  /** Branche les objets posés dans la scène, et pose la chatière dans le mur de la cuisine. */
  attach(items: WorldItem[], scene: THREE.Object3D): void {
    this.kitten = items.find((i) => i.def.id === 'chaton') ?? null;
    this.bowl = items.find((i) => i.def.id === 'gamelle') ?? null;
    this.sofa = items.find((i) => i.def.id === 'canape') ?? null;
    if (this.kitten) this.rig = rigOf(this.kitten.object);
    this.showBowl();
    // la chatière : un battant sombre de chaque côté du mur sud, près de la table
    const frame = new THREE.MeshToonMaterial({ color: 0xd8cfc0 });
    const door = new THREE.MeshToonMaterial({ color: 0x4a3b2e });
    for (const [z, s] of [[ROOM.z1 - 0.004, -1], [ROOM.z1 + WALL_T + 0.004, 1]] as const) {
      const g = new THREE.Group();
      g.position.set(CAT_FLAP.x, 0, z);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.008), frame);
      f.position.y = 0.15;
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.25, s * 0.005);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.006), door);
      d.position.y = -0.1;
      hinge.add(d);
      g.add(f, hinge);
      scene.add(g);
      this.flaps.push(hinge);
    }
    if (this.adopted && this.kitten && !this.indoors(this.kitten.object.position)) this.kitten.object.position.set(CAT_FLAP.x, 0, CAT_FLAP.inside);
  }

  /** On ne se cogne pas au chaton (et il ne bloque pas les chemins à chaque pas). */
  walkable(item: WorldItem): boolean {
    return item === this.kitten;
  }

  private foodHeld(): WorldItem | undefined {
    return this.host.character.heldItems.find((h) => catFood(h.def.id, this.host.isFish));
  }

  owns(item: WorldItem): boolean {
    if (item === this.kitten) return true;
    return item === this.bowl && !this.full && !!this.foodHeld();
  }

  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    if (item === this.kitten) {
      if (this.foodHeld() && (!this.adopted || this.needs.hunger > 0.3)) add('Donner à manger au chaton', () => this.feedFromHand(false));
      add('Caresser le chaton', () => this.pet(false));
    }
    if (item === this.bowl && !this.full && this.foodHeld()) add('Remplir la gamelle', () => this.fillBowl(false));
  }

  click(item: WorldItem, running: boolean): boolean {
    if (item === this.bowl) return this.fillBowl(running);
    if (!this.adopted && this.foodHeld()) return this.feedFromHand(running);
    return this.pet(running);
  }

  stateOf(item: WorldItem): string | null {
    if (item === this.bowl) return this.full ? 'remplie de croquettes' : 'vide';
    if (item.def.id === 'croquettes') {
      const n = Math.max(0, Math.round(item.durability));
      return `encore ${n} portion${n > 1 ? 's' : ''} sur ${BAG_SERVINGS}`;
    }
    if (item !== this.kitten) return null;
    if (!this.adopted) return 'errant, il a faim et se méfie';
    if (this.plan.kind === 'sieste') return 'fait la sieste';
    if (this.plan.kind === 'reclame') return 'réclame sa gamelle';
    if (this.act === 'eat') return 'mange';
    return this.needs.hunger >= 0.5 ? 'a un petit creux' : this.needs.sleepy > 0.7 ? 'a sommeil' : 'en pleine forme';
  }

  /** Sauvegarde : sur le chaton, s'il est adopté, sa faim, son sommeil ; sur la gamelle, si elle est remplie. */
  extras(item: WorldItem): Record<string, unknown> {
    if (item === this.kitten) return { chat: { adopte: this.adopted, faim: round(this.needs.hunger), sommeil: round(this.needs.sleepy) } };
    if (item === this.bowl && this.full) return { gamelle: true };
    return {};
  }

  setExtras(item: WorldItem, x: Record<string, unknown>): void {
    if (item.def.id === 'gamelle' && x.gamelle === true) {
      this.full = true;
      this.showBowl(item);
    }
    if (item.def.id !== 'chaton') return;
    const s = readKitten(x.chat);
    if (!s) return;
    this.adopted = s.adopte;
    this.needs = { hunger: s.faim, sleepy: s.sommeil };
    // il était sur le canapé : on le retrouve par terre, il y remontera
    if (item.object.position.y > 0.01) item.object.position.y = 0;
  }

  /** À chaque image : `dt` en secondes réelles, `minutes` de jeu écoulées. */
  update(dt: number, minutes: number): void {
    const k = this.kitten;
    const r = this.rig;
    if (!k || !r || !k.object.parent) return;
    dt = Math.max(0, Math.min(dt, 0.1));
    this.clock += dt;
    if (this.adopted) this.needs = tickNeeds(this.needs, Math.max(0, minutes), this.plan.kind === 'sieste');
    this.flapSwing = Math.max(0, this.flapSwing - dt);
    for (const f of this.flaps) f.rotation.x = this.flapSwing > 0 ? Math.sin(this.flapSwing * 14) * 0.6 * this.flapSwing : 0;
    if (this.hop) this.tickHop(dt);
    else this.think(dt);
    this.animate(r, dt);
  }

  // ——— ce qu'il fait ———

  private think(dt: number): void {
    const k = this.kitten!;
    const p = this.plan;
    const me = this.host.character.position;
    const o = k.object.position;
    const near = Math.hypot(me.x - o.x, me.z - o.z);
    // le chaton errant s'arrête de se promener quand le perso approche, et miaule
    if (!this.adopted && near < HEAR_AT && (p.kind === 'aller' || (p.kind === 'pause' && p.act !== 'eat'))) this.plan = { kind: 'rien' };
    else if (p.kind === 'aller') return this.walk(p, dt);
    else if (p.kind === 'pause') {
      if ((p.t -= dt) <= 0) {
        this.plan = { kind: 'rien' };
        p.then();
      }
      return void (this.act = p.act);
    }
    if (p.kind === 'sieste') {
      this.act = 'sleep';
      if (this.needs.sleepy <= 0) this.wake();
      return;
    }
    if (p.kind === 'reclame') {
      this.act = 'sit';
      if (this.bowl) this.face(this.bowl.object.position, dt);
      if (this.full) return this.goEat();
      if (this.clock - this.lastMeow > MEOW_EVERY && near < 8) {
        this.lastMeow = this.clock;
        this.host.notice('Miaou ! Le chaton réclame sa gamelle : elle est vide.');
      }
      return;
    }
    // le chaton errant : il attend près du potager, miaule quand le perso approche
    if (!this.adopted) {
      if (near < HEAR_AT) {
        this.face(me, dt);
        this.act = 'sit';
        if (!this.heard) {
          this.heard = true;
          this.host.notice('Miaou ! Un petit chaton miaule près du potager. Il a l’air d’avoir faim…');
        }
        return;
      }
      if (near > HEAR_AT + 2) this.heard = false;
      return this.wander(true);
    }
    const want = kittenWants(this.needs);
    if (want === 'manger') return this.goEat();
    if (want === 'dormir') return this.goNap();
    this.wander(false);
  }

  /** Une petite promenade : un endroit au hasard (près du potager, ou dans la cuisine et le salon), puis une pause. */
  private wander(stray: boolean): void {
    const k = this.kitten!;
    let to: THREE.Vector3;
    if (stray) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * STRAY_ZONE.r;
      to = new THREE.Vector3(STRAY_ZONE.x + Math.cos(a) * d, 0, STRAY_ZONE.z + Math.sin(a) * d);
    } else {
      const rect = Math.random() < 0.5 ? ROOM : SALON;
      to = new THREE.Vector3(THREE.MathUtils.randFloat(rect.x0 + 0.5, rect.x1 - 0.5), 0, THREE.MathUtils.randFloat(rect.z0 + 0.5, rect.z1 - 0.5));
    }
    const rest = (): void => {
      this.plan = { kind: 'pause', t: THREE.MathUtils.randFloat(3, 9), act: Math.random() < 0.6 ? 'sit' : 'idle', then: () => undefined };
    };
    this.go(stray ? to : this.host.route(k.object.position, to), false, rest);
  }

  private go(to: THREE.Vector3 | THREE.Vector3[], fast: boolean, then: () => void): void {
    const path = Array.isArray(to) ? to.map((v) => v.clone().setY(0)) : [to.clone().setY(0)];
    this.plan = { kind: 'aller', path, fast, then };
  }

  private walk(p: Extract<Plan, { kind: 'aller' }>, dt: number): void {
    const o = this.kitten!.object;
    const target = p.path[0];
    if (!target) {
      this.plan = { kind: 'rien' };
      return p.then();
    }
    const to = target.clone().sub(o.position).setY(0);
    const dist = to.length();
    if (dist < 0.05) {
      p.path.shift();
      return;
    }
    this.face(target, dt);
    const speed = p.fast ? TROT : WALK;
    o.position.addScaledVector(to.normalize(), Math.min(dist, speed * dt));
    this.act = 'walk';
    this.rig!.gait += dt * speed * 22;
  }

  private face(at: THREE.Vector3, dt: number): void {
    const o = this.kitten!.object;
    const want = Math.atan2(at.x - o.position.x, at.z - o.position.z);
    const d = Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y));
    o.rotation.y += d * Math.min(1, dt * 7);
  }

  private indoors(p: THREE.Vector3): boolean {
    const inside = (r: { x0: number; x1: number; z0: number; z1: number }) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
    return inside(ROOM) || inside(SALON);
  }

  /** Va à sa gamelle : mange si elle est remplie, sinon s'assoit à côté et la réclame. */
  private goEat(): void {
    const b = this.bowl;
    if (!b || !b.object.parent || this.host.character.heldItems.includes(b)) {
      this.plan = { kind: 'reclame' };
      return;
    }
    const at = b.object.position.clone().setY(0);
    const k = this.kitten!.object.position;
    const stand = at.clone().add(k.clone().sub(at).setY(0).normalize().multiplyScalar(0.2));
    this.go(this.host.route(k, stand), this.needs.hunger > 0.9, () => {
      if (!this.full) {
        this.plan = { kind: 'reclame' };
        this.lastMeow = -Infinity;
        return;
      }
      this.face(at, 1);
      this.plan = {
        kind: 'pause', t: EAT_S, act: 'eat', then: () => {
          this.full = false;
          this.showBowl();
          this.needs = { hunger: 0, sleepy: Math.max(this.needs.sleepy, 0.75) };
        },
      };
    });
  }

  /** Va faire la sieste sur le canapé (par terre s'il n'y en a pas). */
  private goNap(): void {
    const perch = this.perchOn();
    if (!perch) {
      this.plan = { kind: 'sieste' };
      return;
    }
    this.go(this.host.route(this.kitten!.object.position, perch.floor), false, () => {
      this.face(perch.top, 1);
      this.jump(perch.top, () => {
        this.kitten!.object.rotation.y = perch.yaw;
        this.plan = { kind: 'sieste' };
      });
    });
  }

  /** Sa place sur le canapé (un bout de l'assise) ; null si le canapé a disparu ou que le perso y est assis à cet endroit. */
  private perchOn(): Chat['perch'] {
    const s = this.sofa;
    if (!s || !s.object.parent || !s.def.seat) return null;
    const b = s.box;
    const o = s.object;
    o.updateMatrixWorld(true);
    const zMid = (b.min.z + b.max.z) / 2;
    const top = o.localToWorld(new THREE.Vector3(b.max.x - 0.32, s.def.seat, zMid + 0.06));
    const floor = o.localToWorld(new THREE.Vector3(b.max.x - 0.32, 0, b.max.z + 0.3)).setY(0);
    // le perso est assis juste là : l'autre bout
    if (this.host.character.seated && this.host.character.position.distanceTo(top.clone().setY(this.host.character.position.y)) < 0.5) {
      top.copy(o.localToWorld(new THREE.Vector3(b.min.x + 0.32, s.def.seat, zMid + 0.06)));
      floor.copy(o.localToWorld(new THREE.Vector3(b.min.x + 0.32, 0, b.max.z + 0.3)).setY(0));
    }
    // le dessus du coussin (le modèle du pack peut être plus haut que l'assise de la fiche)
    const hit = new THREE.Raycaster(top.clone().setY(2), new THREE.Vector3(0, -1, 0)).intersectObject(o, true)[0];
    if (hit) top.y = hit.point.y;
    this.perch = { top, floor, yaw: o.rotation.y + Math.PI / 2 };
    return this.perch;
  }

  private jump(to: THREE.Vector3, then: () => void): void {
    this.hop = { from: this.kitten!.object.position.clone(), to: to.clone(), t: 0, then };
  }

  private tickHop(dt: number): void {
    const h = this.hop!;
    h.t = Math.min(1, h.t + dt / 0.45);
    const o = this.kitten!.object.position;
    o.lerpVectors(h.from, h.to, h.t);
    o.y += Math.sin(h.t * Math.PI) * 0.25;
    this.act = 'walk';
    if (h.t >= 1) {
      this.hop = null;
      h.then();
    }
  }

  /** Fin de la sieste : il s'étire, saute du canapé. */
  private wake(): void {
    const k = this.kitten!.object;
    this.plan = { kind: 'rien' };
    if (k.position.y > 0.01) {
      const floor = this.perch?.floor ?? k.position.clone().setY(0);
      this.plan = { kind: 'pause', t: 1.2, act: 'idle', then: () => this.jump(floor, () => undefined) };
    }
  }

  // ——— avec le perso ———

  private tell(text: string): boolean {
    this.host.notice(text);
    return false;
  }

  /** Le chaton attend le perso qui vient vers lui (il ne file pas pendant qu'on approche). */
  private hold(): void {
    if (this.plan.kind === 'sieste' || this.plan.kind === 'reclame' || this.hop) return;
    if (this.plan.kind === 'pause' && this.act === 'eat') return;
    this.plan = { kind: 'pause', t: WAIT_S, act: 'sit', then: () => undefined };
  }

  private reach(running: boolean, then: () => void): boolean {
    const c = this.host.character;
    const k = this.kitten!;
    if (c.busy) return false;
    if (c.seated) {
      // assis sur le canapé, à côté de lui : on le caresse sans se lever
      if (c.position.distanceTo(k.object.position) < 1.1) {
        then();
        return true;
      }
      return c.standUp(() => void this.reach(running, then));
    }
    this.hold();
    const at = k.object.position.clone().setY(0);
    const from = c.position.clone().setY(0);
    const stand = at.clone().add(from.sub(at).normalize().multiplyScalar(0.45));
    c.approachThen(stand, at, then, running);
    return true;
  }

  private pet(running: boolean): boolean {
    if (!this.kitten) return false;
    if (!this.adopted) {
      this.hold();
      return this.tell('Le chaton recule, méfiant. Il a faim : des croquettes, un poisson ou un steak en main, et il viendra peut-être.');
    }
    return this.reach(running, () => {
      const asleep = this.plan.kind === 'sieste';
      this.purrUntil = this.clock + PURR_S;
      if (!asleep && this.plan.kind !== 'reclame' && !this.hop) {
        this.face(this.host.character.position, 1);
        this.plan = { kind: 'pause', t: PURR_S, act: 'sit', then: () => undefined };
      }
      const counts = this.clock - this.lastPet > PET_COOLDOWN;
      if (counts) {
        this.lastPet = this.clock;
        this.host.mood(PET_JOY);
      }
      const hungry = this.plan.kind === 'reclame';
      this.host.notice(asleep ? 'Rrrr… Le chaton ronronne dans son sommeil.' : hungry ? 'Le chaton ronronne… mais sa gamelle est vide.' : 'Rrrr… Le chaton ronronne et se frotte contre ta main.');
      if (counts) this.host.say(asleep ? 'Chut, il dort…' : ['Qui c’est le plus mignon ?', 'Tout doux, mon petit.', 'Tu es tout chaud.'][Math.floor(Math.random() * 3)]);
    });
  }

  /** Prend une portion : le sac de croquettes en perd une (vide, il part à la poubelle), le reste est mangé entier. */
  private serve(food: WorldItem): void {
    const c = this.host.character;
    if (food.def.id === 'croquettes') {
      food.durability -= 1;
      if (food.durability > 0.5) return;
      this.host.notice('Le sac de croquettes est vide : il en faudra un autre au magasin.');
    }
    c.loseItem(food);
    this.host.remove(food);
  }

  /** Lui donner à manger dans la main : le chaton errant nous adopte. */
  private feedFromHand(running: boolean): boolean {
    const food = this.foodHeld();
    if (!food) return this.tell('Il faut quelque chose à lui donner en main : des croquettes (le sac est dans la cuisine), un poisson ou un steak.');
    if (this.adopted && this.needs.hunger <= 0.3) return this.tell('Le chaton n’a pas faim : il renifle et détourne la tête.');
    // le chaton errant attend, il a vu à manger
    if (!this.adopted) this.hold();
    return this.reach(running, () => {
      if (!this.host.character.heldItems.includes(food)) return;
      this.face(this.host.character.position, 1);
      this.serve(food);
      const first = !this.adopted;
      this.plan = {
        kind: 'pause', t: EAT_S, act: 'eat', then: () => {
          this.needs = { hunger: 0, sleepy: this.needs.sleepy };
          if (first) this.adopt();
        },
      };
      this.host.mood(first ? 6 : 2);
      if (first) this.host.say('Tiens, mon petit. Mange, n’aie pas peur.');
    });
  }

  /** Adopté : il trottine jusqu'à la chatière et entre dans la cuisine. */
  private adopt(): void {
    this.adopted = true;
    this.host.notice('Le chaton a tout mangé, et il ronronne : il t’a adopté ! Il file vers la maison par la chatière de la cuisine.');
    const o = this.kitten!.object;
    this.go(this.host.route(o.position, new THREE.Vector3(CAT_FLAP.x, 0, CAT_FLAP.outside)), true, () => {
      this.flapSwing = 1;
      o.position.set(CAT_FLAP.x, 0, CAT_FLAP.inside);
      o.rotation.y = Math.PI;
      this.plan = { kind: 'pause', t: 2, act: 'sit', then: () => undefined };
    });
  }

  /** Remplir la gamelle avec ce qu'on tient. */
  private fillBowl(running: boolean): boolean {
    const b = this.bowl;
    if (!b) return false;
    if (this.full) return this.tell('La gamelle est déjà pleine.');
    const food = this.foodHeld();
    if (!food) return this.tell('Il faut le sac de croquettes en main (ou un poisson, un steak) pour remplir la gamelle.');
    const c = this.host.character;
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void this.fillBowl(running));
    c.approachThen(c.standFor(b), b.object.position, () => {
      if (!c.heldItems.includes(food) || this.full) return;
      this.serve(food);
      this.full = true;
      this.showBowl();
      this.host.notice(this.adopted ? 'La gamelle est remplie. Le chaton va venir manger quand il aura faim.' : 'La gamelle est remplie.');
    }, running);
    return true;
  }

  private showBowl(bowl = this.bowl): void {
    const f = bowl?.part('croquettes');
    if (f) f.visible = this.full;
  }

  // ——— les poses ———

  private animate(r: Rig, dt: number): void {
    r.t += dt;
    const want = POSES[this.act];
    const a = 1 - Math.exp(-dt * 6);
    for (const key of Object.keys(want) as Array<keyof Pose>) r.pose[key] += (want[key] - r.pose[key]) * a;
    const p = r.pose;
    const walking = this.act === 'walk';
    const asleep = this.act === 'sleep';
    // le souffle (plus lent en dormant), le ronron fait vibrer un peu
    const breath = Math.sin(r.t * (asleep ? 1.6 : 3)) * (asleep ? 0.045 : 0.02);
    const purr = this.clock < this.purrUntil ? Math.sin(r.t * 60) * 0.006 : 0;
    r.body.position.y = KITTEN_BACK - 0.05 + p.bodyY + (walking ? Math.abs(Math.sin(r.gait)) * 0.01 : 0);
    r.body.rotation.x = p.pitch * 0.6;
    r.body.position.z = p.pitch * 0.04;
    r.body.scale.set(1 + p.tuck * 0.15, 1 + breath + purr, 1 - p.tuck * 0.1);
    r.head.position.y = KITTEN_BACK + 0.035 + p.headY + p.bodyY * 0.3 - p.pitch * 0.07;
    r.head.position.z = 0.12 + p.headZ - p.tuck * 0.02;
    r.head.rotation.x = p.headPitch + purr * 3;
    r.head.rotation.y = asleep ? 0.9 * p.curl : Math.sin(r.t * 0.7) * 0.15 * (1 - p.curl);
    r.head.rotation.z = asleep ? 0.3 * p.curl : 0;
    // les yeux clignent de temps en temps
    const blink = (r.t % 4.3) < 0.12 ? 0.1 : 1;
    r.eyes.scale.y = Math.max(0.12, p.eyes * blink);
    // pattes : balancées en marchant (en diagonale), repliées dessous en dormant, l'arrière plié assis
    const swing = walking ? Math.sin(r.gait) * 0.6 : 0;
    r.legs.forEach((leg, i) => {
      const front = i < 2;
      const phase = i === 0 || i === 3 ? 1 : -1;
      leg.rotation.x = swing * phase + (front ? p.pitch * -0.3 : p.hind * -1.2);
      leg.scale.y = 1 - p.tuck * 0.75;
      leg.position.y = 0.11 + p.bodyY * 0.5 + (front ? 0 : -p.hind * 0.045);
      leg.position.z = front ? 0.075 : -0.075 + p.hind * 0.03;
    });
    // queue : ondule doucement, dressée en marchant, enroulée autour de lui en dormant
    r.tail.forEach((seg, i) => {
      const wave = Math.sin(r.t * (walking ? 5 : 2) - i * 0.7) * (asleep ? 0.05 : 0.22);
      seg.rotation.y = wave + p.curl * 0.55;
      // (un angle positif autour de x relève le bout de la queue)
      seg.rotation.x = i === 0 ? p.tailUp * 1.1 - p.curl * 0.35 : p.tailUp * 0.12 - p.curl * 0.04;
    });
    r.tail[0].position.y = KITTEN_BACK - 0.03 + p.bodyY;
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Retrouve les pièces du chaton (voir buildKitten). */
function rigOf(root: THREE.Object3D): Rig | null {
  const body = root.getObjectByName('corps');
  const head = root.getObjectByName('tete');
  const eyes = root.getObjectByName('yeux');
  if (!body || !head || !eyes) return null;
  const legs = ['patte-ag', 'patte-ad', 'patte-pg', 'patte-pd'].map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  const tail: THREE.Object3D[] = [];
  for (let i = 0; i < TAIL_SEGS; i++) {
    const s = root.getObjectByName(`queue-${i}`);
    if (s) tail.push(s);
  }
  return { body, head, eyes, legs, tail, pose: { ...POSES.sit }, gait: 0, t: Math.random() * 10 };
}
