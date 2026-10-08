/**
 * Les loisirs du plein air (objets dans items/plein-air.ts, modèles de Quaternius) :
 * - la pêche : canne en main, un clic sur l'étang (ou le ponton) et le perso va au bout du
 *   ponton lancer sa ligne ; le bouchon plonge et un poisson arrive, plus ou moins rare selon la
 *   canne. Il se vide sur la planche de la cuisine (le poisson qui se cuit) ou se vend au marché ;
 * - le coin camping : le feu de camp s'allume d'un clic sur les bûches (on y pose une poêle comme
 *   sur la gazinière, et il réchauffe). Sa grille reçoit le poisson pêché, entier : il grille
 *   (Game.heatPan, comme dans la poêle), dore puis noircit si on l'oublie, et se mange tel quel.
 *   On dort sous la tente comme dans un lit. Les torches brûlent la nuit, la trousse de secours
 *   et les pansements soignent ;
 * - deux petits monstres se promènent (le puglin près du jardin, le diablotin dans la station) :
 *   animés avec les clips de la Universal Animation Library (même squelette), ils regardent le
 *   perso qui approche et dansent quand on les salue d'un clic. Le puglin, curieux, suit le perso
 *   un moment après un salut (et vient de lui-même le voir une fois ami) ; le diablotin, farouche,
 *   s'enfuit quand on l'approche (vite si l'on court) et se tapit s'il est acculé, jusqu'à ce que
 *   trois saluts l'apprivoisent : il suit alors comme le puglin.
 *
 * Game ne fait que brancher (menu, clic, image, sauvegarde) par l'interface LoisirsHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import { waterCap } from './items/cooking';
import { showWear } from './items/durability';
import { loadPoseAnimations } from '../creator/source';
import { DOCK_L, DOCK_TOP, FIRE_SPOT_Y, FISH, FISH_BY_ID, GRILL_FOOD, POND, ROAMS, ROD_H, WATER_Y, OUTDOOR_FEMININE, rodLevel, type FishKind, type Rarity, type Temper } from './items/plein-air';

/** « le poisson rouge », « la carpe koï », « l’espadon », « les saucisses ». */
const theName = (n: string) => (n.endsWith('s') && !n.includes(' ') ? `les ${n}` : /^[aeiouéèêœ]/i.test(n) ? `l’${n}` : OUTDOOR_FEMININE.includes(n) ? `la ${n}` : `le ${n}`);

export interface LoisirsHost {
  readonly character: Character;
  spawn(id: string, at: THREE.Vector3, yaw: number): WorldItem | null;
  remove(item: WorldItem): void;
  notice(text: string): void;
  say(text: string): void;
  mood(n: number): void;
  /** Santé du perso (0 à 100), et la soigner. */
  health(): number;
  heal(n: number): void;
  /** Il fait nuit (les torches brûlent). */
  night(): boolean;
  /** Tous les objets du monde (pour dorer les poissons qui grillent). */
  items(): readonly WorldItem[];
  /** Le feu de camp est-il allumé ? */
  lit(fire: WorldItem): boolean;
  /** Clic sur le feu de camp (Game.useStove) : y poser ce qu'on tient, sur la grille. */
  useFire(fire: WorldItem): boolean;
}

/** Chance de chaque rareté selon la canne (niveau 1 à 5). */
const ODDS: Record<Rarity, number[]> = {
  commun: [70, 60, 50, 42, 35],
  'peu commun': [24, 28, 32, 33, 33],
  rare: [5.5, 10, 14, 19, 24],
  légendaire: [0.5, 2, 4, 6, 8],
};
/** Attente avant que ça morde (s), selon la canne. */
const BITE: Array<[number, number]> = [[6, 14], [5, 12], [4, 10], [3, 8], [2.5, 6]];
/** Humeur gagnée selon la rareté. */
const JOY: Record<Rarity, number> = { commun: 2, 'peu commun': 3, rare: 6, légendaire: 12 };
/** Soins de la trousse et d'un pansement (points de santé). */
const KIT_HEAL = 35;
const BANDAGE_HEAL = 12;
/** Monstres : vitesse de marche (m/s), distance où ils s'arrêtent pour regarder le perso, durée d'une danse (s). */
const ROAM_SPEED = 0.7;
const NOTICE_AT = 2.2;
const DANCE_S = 5;
/** Le suivre : combien de temps après un salut (s), à quelle distance il se tient (m), d'où un ami vient voir le perso (m). */
const FOLLOW_S = 45;
const FOLLOW_GAP = 1.3;
const CALL_AT = 6;
/** Il lâche le perso parti trop loin (m), et ne s'éloigne pas de chez lui de plus que sa zone plus ça (m). */
const LOSE_AT = 12;
const LEASH = 9;
/** Le farouche : il fuit le perso qui marche à moins de ça (m), qui court à moins de ça (m) ; saluts pour l'apprivoiser. */
const SHY_WALK = 2.6;
const SHY_RUN = 5;
const TAME = 3;
/** Vitesses (m/s) pour suivre et pour fuir. */
const FOLLOW_SPEED = 1.5;
const CATCH_UP = 2.6;
const FLEE_SPEED = 2.2;
/** Poisson qui grille : on revoit sa couleur tous les tant (s). */
const TINT_EVERY = 0.4;
const GRILLED = new THREE.Color(0xb07a48);
const CHARRED = new THREE.Color(0x2e241c);

type Gesture = 'walk' | 'idle' | 'look' | 'dance' | 'cower';

/** Un monstre qui se promène : son objet, ses gestes, où il va, ce qu'il fait. */
interface Roamer {
  item: WorldItem;
  zone: { x: number; z: number; r: number; temper: Temper };
  mixer: THREE.AnimationMixer | null;
  acts: Partial<Record<Gesture, THREE.AnimationAction>>;
  playing: string;
  target: THREE.Vector3 | null;
  /** Temps qui reste à attendre (ou à danser). */
  wait: number;
  dancing: boolean;
  /** Saluts reçus (gardés avec la partie) : le farouche s'apprivoise, le curieux devient ami. */
  friend: number;
  /** Temps qui reste à suivre le perso (s). */
  follow: number;
  /** Ce qu'il faisait à l'image d'avant (pour ne le dire qu'une fois). */
  mind: Mind;
  /** Il rentre chez lui (perdu de vue, trop loin) : il ne suit plus avant d'y être. */
  homing: boolean;
  /** Temps avant de pouvoir redire qu'il s'enfuit (s). */
  quiet: number;
}

/** Ce que fait un monstre, selon le perso. */
export type Mind = 'promène' | 'regarde' | 'suit' | 'fuit' | 'tapi';

/**
 * Ce que décide le monstre : `dist` du perso, `home` sa distance à son coin, `running` le perso
 * qui court, `friend` les saluts reçus, `follow` le temps de suivi qui reste, `cornered` plus de
 * place pour fuir.
 */
export function monsterMind(temper: Temper, o: { dist: number; home: number; zone: number; running: boolean; friend: number; follow: number; cornered: boolean; homing?: boolean }): Mind {
  const tame = temper === 'curieux' || o.friend >= TAME;
  const leashed = !!o.homing || o.home > o.zone + LEASH;
  if (!tame) {
    if (o.dist < (o.running ? SHY_RUN : SHY_WALK)) return o.cornered ? 'tapi' : 'fuit';
    return o.dist < SHY_RUN ? 'regarde' : 'promène';
  }
  // l'ami suit le perso après un salut, ou vient de lui-même s'il passe tout près
  const wants = o.follow > 0 || (o.friend >= 1 && o.dist < CALL_AT);
  if (wants && o.dist < LOSE_AT && !leashed) return o.dist > FOLLOW_GAP ? 'suit' : 'regarde';
  return o.dist < NOTICE_AT ? 'regarde' : 'promène';
}

export class Loisirs {
  private host: LoisirsHost;
  private pond: WorldItem | null = null;
  private dock: WorldItem | null = null;
  private torches: THREE.Object3D[] = [];
  /** Partie de pêche en cours : la canne, le temps passé, quand ça mord, la ligne et le bouchon. */
  private fishing: { rod: WorldItem; t: number; bite: number; from: THREE.Vector3; line: THREE.Line; bobber: THREE.Mesh; spot: THREE.Vector3 } | null = null;
  /** Poissons pris, et les espèces déjà vues (gardés avec la partie, sur l'étang). */
  private caught = 0;
  private species = new Set<string>();
  private roamers: Roamer[] = [];

  constructor(host: LoisirsHost) {
    this.host = host;
  }

  /** Branche les objets posés dans la scène. */
  attach(items: WorldItem[]): void {
    this.pond = items.find((i) => i.def.id === 'etang') ?? null;
    this.dock = items.find((i) => i.def.id === 'ponton') ?? null;
    for (const it of items) {
      const zone = ROAMS[it.def.id];
      if (zone) this.roamers.push({ item: it, zone, mixer: null, acts: {}, playing: '', target: null, wait: 1 + Math.random() * 3, dancing: false, friend: 0, follow: 0, mind: 'promène', homing: false, quiet: 0 });
    }
    if (this.roamers.length) void loadPoseAnimations().then((sets) => this.animate(sets.flatMap((s) => s.clips)));
    for (const t of items.filter((i) => i.def.id === 'torche-bois')) {
      const f = t.part('flamme');
      if (f) this.torches.push(f);
    }
    // les flammes brillent (le bloom les fait rayonner, sans lumière de plus à calculer)
    for (const it of items) {
      const f = it.def.id === 'feu-de-camp' ? it.part('flamme-0') : it.def.id === 'torche-bois' ? it.part('flamme') : undefined;
      f?.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = (o.material as THREE.MeshToonMaterial).clone();
        m.emissive.copy(m.color).multiplyScalar(1.6);
        o.material = m;
        o.castShadow = false;
      });
    }
  }

  /** On marche sur le ponton et on ne se cogne pas à l'étang (ses rives sont dans `obstacles`). */
  walkable(item: WorldItem): boolean {
    return item.def.id === 'ponton' || item.def.id === 'etang' || item.def.id in ROAMS;
  }

  /** Ce qui bloque le passage : l'eau de l'étang, sauf le passage du ponton. */
  get obstacles(): Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number }> {
    const out: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number }> = [];
    // l'ellipse en tranches nord-sud de 1 m, sauf la tranche du ponton près de la rive nord
    const dockX = this.dock?.object.position.x ?? POND.x - 1.2;
    const dockEnd = (this.dock?.object.position.z ?? 0) + DOCK_L / 2;
    for (let x = -POND.rx + 0.5; x < POND.rx; x += 1) {
      const half = POND.rz * Math.sqrt(Math.max(0, 1 - (x / POND.rx) ** 2)) - 0.3;
      if (half <= 0.1) continue;
      const wx = POND.x + x;
      let z0 = POND.z - half;
      if (Math.abs(wx - dockX) < 0.9) z0 = Math.max(z0, dockEnd + 0.1);
      const z1 = POND.z + half;
      if (z1 - z0 < 0.2) continue;
      out.push({ box: new THREE.Box3(new THREE.Vector3(-0.5, 0, -(z1 - z0) / 2), new THREE.Vector3(0.5, 0.3, (z1 - z0) / 2)), pos: new THREE.Vector3(wx, 0, (z0 + z1) / 2), yaw: 0 });
    }
    return out;
  }

  owns(item: WorldItem): boolean {
    if (item === this.pond || item === this.dock || item.def.id in ROAMS) return true;
    // un poisson en main et la grille sur le feu : le clic sur le feu l'y pose (Game.useStove)
    if (item.def.id === 'feu-de-camp') return !!this.grillable() && !this.grillOn(item);
    return (item.def.id === 'trousse-de-secours' || item.def.id === 'pansements') && this.host.health() < 99.5;
  }

  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    if (item === this.pond || item === this.dock) add('Pêcher', () => this.fish(false));
    if (item.def.id in ROAMS) add(`Saluer le ${item.name}`, () => this.greet(item));
    const food = this.grillable();
    if (item.def.id === 'feu-de-camp' && food) add(`Griller ${theName(food.name)}`, () => this.grill(item));
    if ((item.def.id === 'trousse-de-secours' || item.def.id === 'pansements') && this.host.health() < 99.5) add('Se soigner', () => this.care(item, false));
  }

  click(item: WorldItem, running: boolean): boolean {
    if (item === this.pond || item === this.dock) return this.fish(running);
    if (item.def.id in ROAMS) return this.greet(item);
    if (item.def.id === 'feu-de-camp') return this.grill(item);
    if (item.def.id === 'trousse-de-secours' || item.def.id === 'pansements') return this.care(item, running);
    return false;
  }

  stateOf(item: WorldItem): string | null {
    if (item === this.pond) {
      const n = this.species.size;
      return this.caught ? `${this.caught} poisson${this.caught > 1 ? 's' : ''} pêché${this.caught > 1 ? 's' : ''}, ${n} espèce${n > 1 ? 's' : ''} sur ${FISH.length}` : 'on y pêche avec une canne';
    }
    const fish = FISH_BY_ID.get(item.def.id);
    if (fish) return `${fish.rarity}, ${Math.round(fish.length * 100)} cm`;
    if (item.def.id === 'tente') return 'on peut y dormir';
    const r = this.roamers.find((x) => x.item === item);
    if (r) {
      const tame = r.zone.temper === 'curieux' || r.friend >= TAME;
      const what = r.mind === 'suit' ? 'te suit' : r.mind === 'fuit' ? 's’enfuit' : r.mind === 'tapi' ? 'se tapit, apeuré' : r.dancing ? 'danse' : 'se promène';
      return r.zone.temper === 'farouche' && !tame ? `farouche (apprivoisé ${r.friend}/${TAME}), ${what}` : `${r.friend ? 'ami' : 'curieux'}, ${what}`;
    }
    return null;
  }

  /** Sauvegarde : sur l'étang, le compte des prises et les espèces vues ; sur un monstre, ses saluts. */
  extras(item: WorldItem): Record<string, unknown> {
    const r = this.roamers.find((x) => x.item === item);
    if (r) return r.friend ? { monstre: { amitie: r.friend } } : {};
    if (item !== this.pond || !this.caught) return {};
    return { peche: { pris: this.caught, especes: [...this.species] } };
  }

  setExtras(item: WorldItem, x: Record<string, unknown>): void {
    const m = x.monstre as { amitie?: unknown } | undefined;
    const r = this.roamers.find((y) => y.item === item);
    if (r && typeof m?.amitie === 'number' && m.amitie >= 0) r.friend = Math.min(99, Math.round(m.amitie));
    if (item.def.id !== 'etang') return;
    const p = x.peche as { pris?: unknown; especes?: unknown } | undefined;
    if (!p) return;
    if (typeof p.pris === 'number' && p.pris >= 0) this.caught = Math.round(p.pris);
    if (Array.isArray(p.especes)) this.species = new Set(p.especes.filter((s): s is string => typeof s === 'string' && FISH_BY_ID.has(s)));
  }

  /** À chaque image : les torches la nuit, la ligne qui attend que ça morde. */
  update(dt: number): void {
    const night = this.host.night();
    for (const f of this.torches) {
      f.visible = night;
      if (night) f.scale.set(1, 0.9 + 0.2 * Math.random(), 1);
    }
    this.tickFishing(dt);
    for (const r of this.roamers) this.roam(r, dt);
    if ((this.tintT -= dt) <= 0) {
      this.tintT = TINT_EVERY;
      this.tintGrilled();
    }
  }

  // ——— griller au feu de camp ———

  private tintT = 0;
  /** Cuisson à laquelle chaque poisson a été teinté la dernière fois. */
  private tinted = new WeakMap<WorldItem, number>();

  /** Ce qu'on tient qui se grille (le poisson pêché, la viande). */
  private grillable(): WorldItem | undefined {
    return this.host.character.heldItems.find((h) => GRILL_FOOD.includes(h.name) && !!h.def.cook);
  }

  /** La grille posée sur ce feu de camp (s'il y en a une). */
  private grillOn(fire: WorldItem): WorldItem | undefined {
    const at = fire.object.position;
    const carried = this.host.character.carried;
    return this.host.items().find((i) => i.def.id === 'grille-camping' && !carried.includes(i)
      && Math.hypot(i.object.position.x - at.x, i.object.position.z - at.z) < 0.07 && Math.abs(i.object.position.y - at.y - FIRE_SPOT_Y) < 0.04);
  }

  /** Poser sur la grille ce qu'on tient (Game s'en charge) ; sans grille sur le feu, on le dit. */
  private grill(fire: WorldItem): boolean {
    const food = this.grillable();
    if (!food) return false;
    const grille = this.grillOn(fire);
    if (!grille) return this.tell(`Pose d’abord la grille de camping sur le feu de camp pour y griller ${theName(food.name)}.`);
    const carried = this.host.character.carried;
    const on = this.host.items().filter((i) => i.def.cook && !carried.includes(i) && i.object.position.distanceTo(grille.object.position) < 0.2);
    if (on.length >= grille.def.cookware!.places.length) return this.tell('La grille est pleine : retire d’abord ce qui y grille.');
    const ok = this.host.useFire(fire);
    if (ok && !this.host.lit(fire)) this.host.notice('Allume le feu de camp (clic sur les bûches) pour que ça grille.');
    return ok;
  }

  /**
   * Un poisson entier qui grille dore, puis noircit s'il reste trop longtemps (ses couleurs à lui,
   * pas une teinte unie : voir showDoneness pour les pièces `cuit` de la cuisine).
   */
  private tintGrilled(): void {
    for (const it of this.host.items()) {
      if (!FISH_BY_ID.has(it.def.id)) continue;
      const t = it.cooking;
      if (t === (this.tinted.get(it) ?? 0)) continue;
      this.tinted.set(it, t);
      const cook = it.def.cook!;
      const golden = THREE.MathUtils.clamp(t / cook.seconds, 0, 1) * 0.6;
      const burnt = THREE.MathUtils.clamp((t - waterCap(it.def)) / (cook.burn * 0.5), 0, 1);
      it.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const m = mat as THREE.MeshToonMaterial;
          if (!m.color) continue;
          const raw: THREE.Color = (m.userData.rawColor ??= (m.userData.baseColor ?? m.color).clone());
          const base: THREE.Color = (m.userData.baseColor ??= new THREE.Color());
          base.copy(raw).lerp(GRILLED, golden).lerp(CHARRED, burnt);
          if (m.userData.noWear) m.color.copy(base);
        }
      });
      showWear(it.object, it.condition);
    }
  }

  // ——— les monstres ———

  /** Les clips de la Universal Animation Library vont tels quels sur les monstres (mêmes os) : rotations seules. */
  private animate(clips: THREE.AnimationClip[]): void {
    const pick = (name: string) => {
      const c = clips.find((k) => k.name === name);
      return c && new THREE.AnimationClip(name, c.duration, c.tracks.filter((t) => t.name.endsWith('.quaternion')));
    };
    const want = { walk: pick('Walk_Formal_Loop'), idle: pick('Idle_FoldArms_Loop'), look: pick('Idle_Talking_Loop'), dance: pick('Dance_Loop'), cower: pick('Crouch_Idle_Loop') };
    for (const r of this.roamers) {
      const body = r.item.object.getObjectByName('monstre');
      if (!body) continue;
      r.mixer = new THREE.AnimationMixer(body);
      for (const [k, clip] of Object.entries(want) as Array<[keyof Roamer['acts'], THREE.AnimationClip | undefined]>) if (clip) r.acts[k] = r.mixer.clipAction(clip);
      // chacun à son rythme
      r.mixer.setTime(Math.random() * 3);
    }
  }

  private play(r: Roamer, key: keyof Roamer['acts']): void {
    if (r.playing === key) return;
    const next = r.acts[key];
    if (!next) return;
    const prev = r.playing ? r.acts[r.playing as keyof Roamer['acts']] : undefined;
    next.reset().fadeIn(0.3).play();
    prev?.fadeOut(0.3);
    r.playing = key;
  }

  /** Le pas du monstre : vers `to` à `speed` m/s, sans entrer dans un meuble ni un mur (faux s'il est bloqué). */
  private step(r: Roamer, to: THREE.Vector3, speed: number, dt: number): boolean {
    const o = r.item.object;
    const d = to.clone().sub(o.position).setY(0);
    const len = d.length();
    if (len < 1e-3) return true;
    const next = o.position.clone().addScaledVector(d.divideScalar(len), Math.min(len, speed * dt));
    if (this.host.character.nav?.blocked(next)) return false;
    o.position.copy(next);
    // le pas suit la vitesse
    const walk = r.acts.walk;
    if (walk) walk.timeScale = Math.min(2.6, speed / ROAM_SPEED);
    this.play(r, 'walk');
    return true;
  }

  /** Le monstre se promène dans sa zone, regarde le perso qui approche, danse quand on le salue, le suit ou le fuit selon son caractère. */
  private roam(r: Roamer, dt: number): void {
    dt = Math.max(0, Math.min(dt, 0.1));
    r.mixer?.update(dt);
    const o = r.item.object;
    if (!o.parent) return;
    const c = this.host.character;
    const me = c.position;
    const dist = Math.hypot(me.x - o.position.x, me.z - o.position.z);
    const faceTo = (x: number, z: number) => {
      const want = Math.atan2(x - o.position.x, z - o.position.z);
      const d = Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y));
      o.rotation.y += d * Math.min(1, dt * 6);
    };
    if (r.dancing) {
      faceTo(me.x, me.z);
      if ((r.wait -= dt) <= 0) {
        r.dancing = false;
        r.wait = 2;
      }
      return this.play(r, 'dance');
    }
    r.follow = Math.max(0, r.follow - dt);
    const home = Math.hypot(o.position.x - r.zone.x, o.position.z - r.zone.z);
    // fuir : à l'opposé du perso, sans quitter son coin (plus un peu)
    const away = new THREE.Vector3(o.position.x - me.x, 0, o.position.z - me.z).normalize();
    const flee = o.position.clone().addScaledVector(away, 1.2);
    const cornered = Math.hypot(flee.x - r.zone.x, flee.z - r.zone.z) > r.zone.r + 1.5 || !!c.nav?.blocked(flee);
    if (r.homing && home < r.zone.r) r.homing = false;
    r.quiet = Math.max(0, r.quiet - dt);
    const mind = monsterMind(r.zone.temper, { dist, home, zone: r.zone.r, running: c.moveGait === 'run', friend: r.friend, follow: r.follow, cornered, homing: r.homing });
    const was = r.mind;
    r.mind = mind;
    if (was === 'suit' && mind === 'promène') {
      // perdu de vue, ou trop loin de chez lui : il y retourne avant de suivre à nouveau
      const lost = dist >= LOSE_AT, far = home > r.zone.r + LEASH;
      r.follow = 0;
      r.homing = lost || far;
      this.host.notice(lost ? `Le ${r.item.name} t’a perdu de vue : il rentre chez lui.` : far ? `Le ${r.item.name} ne va pas plus loin : il rentre chez lui.` : `Le ${r.item.name} retourne à ses affaires.`);
    } else if (mind === 'fuit' && was !== 'fuit' && was !== 'tapi' && !r.quiet) {
      r.quiet = 20;
      this.host.notice(`Le ${r.item.name} s’enfuit en ricanant !`);
    }
    if (mind !== 'promène') r.target = null;
    if (mind === 'regarde') {
      faceTo(me.x, me.z);
      return this.play(r, 'look');
    }
    if (mind === 'tapi') {
      faceTo(me.x, me.z);
      return this.play(r, r.acts.cower ? 'cower' : 'look');
    }
    if (mind === 'fuit') {
      faceTo(flee.x, flee.z);
      if (!this.step(r, flee, FLEE_SPEED, dt)) this.play(r, r.acts.cower ? 'cower' : 'look');
      return;
    }
    if (mind === 'suit') {
      // derrière le perso, à quelques pas ; il trottine pour rattraper
      const spot = new THREE.Vector3(me.x, 0, me.z).addScaledVector(away, FOLLOW_GAP * 0.9);
      faceTo(spot.x, spot.z);
      if (!this.step(r, spot, dist > 4 ? CATCH_UP : FOLLOW_SPEED, dt)) {
        faceTo(me.x, me.z);
        this.play(r, 'look');
      }
      return;
    }
    // la promenade : retour dans son coin d'abord s'il en est sorti
    if (!r.target && home > r.zone.r) r.target = new THREE.Vector3(r.zone.x, 0, r.zone.z);
    if (!r.target) {
      if ((r.wait -= dt) > 0) return this.play(r, 'idle');
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r.zone.r;
      r.target = new THREE.Vector3(r.zone.x + Math.cos(a) * d, 0, r.zone.z + Math.sin(a) * d);
    }
    if (Math.hypot(r.target.x - o.position.x, r.target.z - o.position.z) < 0.1) {
      r.target = null;
      r.wait = 2 + Math.random() * 5;
      return this.play(r, 'idle');
    }
    faceTo(r.target.x, r.target.z);
    if (!this.step(r, r.target, ROAM_SPEED, dt)) {
      r.target = null;
      r.wait = 1;
    }
  }

  /**
   * Un clic sur un monstre : le curieux danse de joie puis suit le perso un moment ; le farouche
   * pas encore apprivoisé, s'il n'est pas déjà en fuite, danse et se méfie un peu moins.
   */
  private greet(item: WorldItem): boolean {
    const r = this.roamers.find((x) => x.item === item);
    if (!r) return false;
    const shy = r.zone.temper === 'farouche' && r.friend < TAME;
    if (shy && (r.mind === 'fuit' || r.mind === 'tapi')) return this.tell(`Le ${item.name} a trop peur : reste un peu à l’écart (et sans courir) avant de le saluer.`);
    r.friend++;
    r.dancing = true;
    r.wait = DANCE_S;
    r.target = null;
    this.host.mood(2);
    if (shy && r.friend >= TAME) {
      r.follow = FOLLOW_S;
      this.host.mood(3);
      this.host.notice(`Le ${item.name} est apprivoisé ! Il danse, puis il te suivra.`);
    } else if (shy) this.host.notice(`Le ${item.name} danse, un peu moins méfiant (${r.friend}/${TAME}).`);
    else {
      r.follow = FOLLOW_S;
      this.host.notice(`Le ${item.name} danse de joie ! Il va te suivre un moment.`);
    }
    return true;
  }

  // ——— la pêche ———

  private tell(text: string): boolean {
    this.host.notice(text);
    return false;
  }

  private rodHeld(): WorldItem | undefined {
    return this.host.character.heldItems.find((h) => rodLevel(h.def.id) > 0);
  }

  /** Bout du ponton, où l'on se tient pour pêcher, et le point de l'eau où va le bouchon. */
  private dockEnd(): { stand: THREE.Vector3; cast: THREE.Vector3 } {
    const d = this.dock;
    const p = d ? d.object.position : new THREE.Vector3(POND.x, 0, POND.z - POND.rz);
    const stand = new THREE.Vector3(p.x, 0, p.z + DOCK_L / 2 - 0.45);
    const cast = new THREE.Vector3(p.x + 0.6, WATER_Y, p.z + DOCK_L / 2 + 1.8);
    return { stand, cast };
  }

  private fish(running: boolean): boolean {
    const c = this.host.character;
    const rod = this.rodHeld();
    if (!rod) return this.tell('Il faut une canne à pêche en main : il y en a une au bord de l’étang, près du ponton.');
    if (this.fishing) return this.tell('La ligne est déjà à l’eau : patience…');
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void this.fish(running));
    const { stand, cast } = this.dockEnd();
    c.approachThen(stand, cast, () => this.cast(rod, cast), running);
    return true;
  }

  /** Lance la ligne : le bouchon se pose sur l'eau, on attend que ça morde. */
  private cast(rod: WorldItem, spot: THREE.Vector3): void {
    if (!this.host.character.heldItems.includes(rod)) return;
    const level = rodLevel(rod.def.id);
    const [a, b] = BITE[level - 1];
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshToonMaterial({ color: 0xe0392b }));
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xffffff }));
    bobber.add(white);
    bobber.position.copy(spot).setY(WATER_Y + 0.02);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf4f4f0 }));
    line.frustumCulled = false;
    const scene = this.host.character.root.parent;
    scene?.add(bobber, line);
    this.fishing = { rod, t: 0, bite: THREE.MathUtils.randFloat(a, b), from: this.host.character.position.clone(), line, bobber, spot: spot.clone() };
    this.host.say(['Allez, mordez…', 'Un peu de calme au bord de l’eau.', 'Ça va mordre, je le sens.'][Math.floor(Math.random() * 3)]);
  }

  private stopFishing(): void {
    const f = this.fishing;
    if (!f) return;
    f.line.removeFromParent();
    f.bobber.removeFromParent();
    f.line.geometry.dispose();
    f.bobber.geometry.dispose();
    this.fishing = null;
  }

  private tickFishing(dt: number): void {
    const f = this.fishing;
    if (!f) return;
    const c = this.host.character;
    // la canne posée, ou le perso qui s'en va : la ligne est remontée
    if (!c.heldItems.includes(f.rod) || c.position.distanceTo(f.from) > 0.4) {
      this.stopFishing();
      return void this.host.notice('Ligne remontée : rien de pris cette fois.');
    }
    f.t += Math.max(0, dt);
    // le bouchon flotte, puis plonge par à-coups quand ça mord
    const biting = f.t > f.bite;
    const bob = biting ? -0.05 * Math.abs(Math.sin(f.t * 18)) : 0.008 * Math.sin(f.t * 2.4);
    f.bobber.position.set(f.spot.x, WATER_Y + 0.02 + bob, f.spot.z);
    f.rod.object.updateMatrixWorld(true);
    const tip = f.rod.object.localToWorld(new THREE.Vector3(0, ROD_H * 0.98, 0));
    const pos = f.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, f.bobber.position.x, f.bobber.position.y + 0.03, f.bobber.position.z);
    pos.needsUpdate = true;
    if (f.t > f.bite + 0.9) this.land(f.rod);
  }

  /** Ça a mordu : un poisson tiré au sort selon la canne arrive dans l'autre main (ou sur le ponton). */
  private land(rod: WorldItem): void {
    this.stopFishing();
    const level = rodLevel(rod.def.id);
    const kind = pickFish(level, Math.random, Math.random);
    const c = this.host.character;
    const at = c.position.clone().add(c.forward.clone().multiplyScalar(0.35)).setY(DOCK_TOP);
    const fish = this.host.spawn(kind.id, at, c.yaw + Math.PI / 2);
    if (!fish) return;
    rod.wear(1);
    const first = !this.species.has(kind.id);
    this.caught++;
    this.species.add(kind.id);
    this.host.mood(JOY[kind.rarity] + (first ? 2 : 0));
    const cm = Math.round(kind.length * 100);
    const what = `${kind.name} (${cm} cm, ${kind.rarity})`;
    this.host.notice(`Pris : ${what}${first ? `. Nouvelle espèce : ${this.species.size} sur ${FISH.length} !` : '.'}`);
    this.host.say(kind.rarity === 'légendaire' ? 'Incroyable ! Regarde-moi ce poisson !' : kind.rarity === 'rare' ? 'Oh, un beau poisson !' : 'Et un de plus !');
    if (c.hands.free > 0) c.pickUp(fish);
  }

  // ——— la trousse de secours ———

  private care(item: WorldItem, running: boolean): boolean {
    const c = this.host.character;
    if (this.host.health() >= 99.5) return this.tell('Le perso est en pleine forme : pas besoin de se soigner.');
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void this.care(item, running));
    const kit = item.def.id === 'trousse-de-secours';
    const use = () => {
      if (!item.object.parent) return;
      const before = this.host.health();
      this.host.heal(kit ? KIT_HEAL : BANDAGE_HEAL);
      const gained = Math.round(this.host.health() - before);
      this.host.say(kit ? 'Voilà, c’est soigné.' : 'Un pansement, et ça ira mieux.');
      // une trousse sert trois fois, une boîte de pansements cinq fois (leur durabilité)
      item.durability -= 1;
      const left = Math.round(item.durability);
      if (left <= 0) {
        this.host.remove(item);
        this.host.notice(`Santé +${gained}. ${kit ? 'La trousse de secours est vide' : 'Plus de pansements'} : il en faudra d’autres au magasin.`);
      } else this.host.notice(`Santé +${gained}. Encore ${left} ${kit ? 'soin' : 'pansement'}${left > 1 ? 's' : ''}.`);
    };
    if (c.heldItems.includes(item)) {
      use();
      return true;
    }
    c.approachThen(c.standFor(item), item.object.position, use, running);
    return true;
  }
}

/** Tire un poisson au sort : d'abord la rareté (selon la canne, 1 à 5), puis l'espèce. */
export function pickFish(level: number, r1: () => number, r2: () => number): FishKind {
  const i = THREE.MathUtils.clamp(level, 1, 5) - 1;
  const rarities = Object.keys(ODDS) as Rarity[];
  const total = rarities.reduce((s, r) => s + ODDS[r][i], 0);
  let roll = r1() * total;
  let rarity: Rarity = 'commun';
  for (const r of rarities) {
    roll -= ODDS[r][i];
    if (roll <= 0) {
      rarity = r;
      break;
    }
  }
  const pool = FISH.filter((f) => f.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(r2() * pool.length))];
}
