/**
 * Les loisirs du plein air (objets dans items/plein-air.ts, modèles de Quaternius) :
 * - la pêche : canne en main, un clic sur l'étang (ou le ponton) et le perso va au bout du
 *   ponton lancer sa ligne ; le bouchon plonge et un poisson arrive, plus ou moins rare selon la
 *   canne. Il se vide sur la planche de la cuisine (le poisson qui se cuit) ou se vend au marché ;
 * - le coin camping : le feu de camp s'allume d'un clic sur les bûches (on y pose une poêle comme
 *   sur la gazinière, et il réchauffe), les torches brûlent la nuit, la trousse de secours et les
 *   pansements soignent ;
 * - deux petits monstres se promènent (le puglin près du jardin, le diablotin dans la station) :
 *   animés avec les clips de la Universal Animation Library (même squelette), ils s'arrêtent
 *   pour regarder le perso qui approche, et dansent quand on les salue d'un clic.
 *
 * Game ne fait que brancher (menu, clic, image, sauvegarde) par l'interface LoisirsHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import { loadPoseAnimations } from '../creator/source';
import { DOCK_L, DOCK_TOP, FISH, FISH_BY_ID, POND, ROAMS, ROD_H, WATER_Y, rodLevel, type FishKind, type Rarity } from './items/plein-air';

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

/** Un monstre qui se promène : son objet, ses gestes, où il va, ce qu'il fait. */
interface Roamer {
  item: WorldItem;
  zone: { x: number; z: number; r: number };
  mixer: THREE.AnimationMixer | null;
  acts: Partial<Record<'walk' | 'idle' | 'look' | 'dance', THREE.AnimationAction>>;
  playing: string;
  target: THREE.Vector3 | null;
  /** Temps qui reste à attendre (ou à danser). */
  wait: number;
  dancing: boolean;
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
      if (zone) this.roamers.push({ item: it, zone, mixer: null, acts: {}, playing: '', target: null, wait: 1 + Math.random() * 3, dancing: false });
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
    return (item.def.id === 'trousse-de-secours' || item.def.id === 'pansements') && this.host.health() < 99.5;
  }

  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    if (item === this.pond || item === this.dock) add('Pêcher', () => this.fish(false));
    if (item.def.id in ROAMS) add(`Saluer le ${item.name}`, () => this.greet(item));
    if ((item.def.id === 'trousse-de-secours' || item.def.id === 'pansements') && this.host.health() < 99.5) add('Se soigner', () => this.care(item, false));
  }

  click(item: WorldItem, running: boolean): boolean {
    if (item === this.pond || item === this.dock) return this.fish(running);
    if (item.def.id in ROAMS) return this.greet(item);
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
    return null;
  }

  /** Sauvegarde : sur l'étang, le compte des prises et les espèces vues. */
  extras(item: WorldItem): Record<string, unknown> {
    if (item !== this.pond || !this.caught) return {};
    return { peche: { pris: this.caught, especes: [...this.species] } };
  }

  setExtras(item: WorldItem, x: Record<string, unknown>): void {
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
  }

  // ——— les monstres ———

  /** Les clips de la Universal Animation Library vont tels quels sur les monstres (mêmes os) : rotations seules. */
  private animate(clips: THREE.AnimationClip[]): void {
    const pick = (name: string) => {
      const c = clips.find((k) => k.name === name);
      return c && new THREE.AnimationClip(name, c.duration, c.tracks.filter((t) => t.name.endsWith('.quaternion')));
    };
    const want = { walk: pick('Walk_Formal_Loop'), idle: pick('Idle_FoldArms_Loop'), look: pick('Idle_Talking_Loop'), dance: pick('Dance_Loop') };
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

  /** Le monstre se promène dans sa zone, s'arrête pour regarder le perso qui approche, danse quand on le salue. */
  private roam(r: Roamer, dt: number): void {
    dt = Math.max(0, Math.min(dt, 0.1));
    r.mixer?.update(dt);
    const o = r.item.object;
    if (!o.parent) return;
    const me = this.host.character.position;
    const near = Math.hypot(me.x - o.position.x, me.z - o.position.z) < NOTICE_AT;
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
    if (near) {
      faceTo(me.x, me.z);
      return this.play(r, 'look');
    }
    if (!r.target) {
      if ((r.wait -= dt) > 0) return this.play(r, 'idle');
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r.zone.r;
      r.target = new THREE.Vector3(r.zone.x + Math.cos(a) * d, 0, r.zone.z + Math.sin(a) * d);
    }
    const to = r.target.clone().sub(o.position).setY(0);
    const dist = to.length();
    if (dist < 0.1) {
      r.target = null;
      r.wait = 2 + Math.random() * 5;
      return this.play(r, 'idle');
    }
    faceTo(r.target.x, r.target.z);
    o.position.addScaledVector(to.normalize(), Math.min(dist, ROAM_SPEED * dt));
    this.play(r, 'walk');
  }

  /** Un clic sur un monstre : il danse de joie (et ça fait sourire). */
  private greet(item: WorldItem): boolean {
    const r = this.roamers.find((x) => x.item === item);
    if (!r) return false;
    r.dancing = true;
    r.wait = DANCE_S;
    r.target = null;
    this.host.mood(2);
    this.host.notice(`Le ${item.name} danse de joie !`);
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
