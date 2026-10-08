/**
 * La lessive. Chaque douche laisse une tenue sale dans le panier à linge de la salle de bain (et en
 * prend une propre dans l'armoire de la chambre). Panier plein, le perso le dit et l'humeur baisse ;
 * plus rien de propre dans l'armoire non plus.
 *
 * On porte le panier à la machine à laver (au fond de la salle de bain, à côté du lavabo), on y vide le
 * linge sale et on lance un lavage. Le linge en sort mouillé : soit on l'étend sur l'étendoir (il
 * sèche vite dehors au soleil, lentement dedans ou la nuit, et la pluie le remouille), soit on le
 * met dans le sèche-linge à côté (rapide, par tous les temps). Le linge sec, plié, retourne dans
 * l'armoire : de bonne humeur, on a de nouveau de quoi se changer.
 *
 * Les fiches des objets sont dans items/linge.ts ; Game ne fait que brancher la buanderie (menu,
 * clic, douche, temps qui passe, sauvegarde) par l'interface BuanderieHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import type { SoundName } from './sound';

/** Tenues sales qui remplissent le panier ; au-delà, il déborde. */
export const BASKET_FULL = 4;
/** Au départ : tenues propres dans l'armoire, tenues sales dans le panier. */
export const START_CLEAN = 5;
export const START_DIRTY = 1;
/** Durée d'un lavage, d'un séchage en machine (s, à la vitesse normale du temps). */
export const WASH_SECONDS = 40;
export const DRYER_SECONDS = 30;
/** Étendoir : secondes pour sécher dehors au soleil, dehors la nuit, dedans ; pluie forte qui remouille tout (s). */
export const DRY_SUN = 60;
export const DRY_NIGHT = 240;
export const DRY_INSIDE = 300;
export const REWET = 20;
/** Au-delà de cette pluie, le linge étendu dehors se mouille. */
const RAIN_WETS = 0.15;
/** Panier plein : le perso râle de nouveau au bout de tant de secondes. */
const FULL_NAG = 300;
/** Temps (s) que le hublot reste ouvert quand on charge ou vide une machine. */
const PORT_OPEN = 1.2;

/** Où sèche l'étendoir : dehors ou non, la pluie, la neige et les nuages (0 à 1), la nuit, l'air (°C). */
export interface DryingSpot {
  outdoors: boolean;
  rain: number;
  snow: number;
  cloud: number;
  night: boolean;
  air: number;
}

/**
 * Vitesse de séchage du linge étendu (part d'humidité perdue par seconde) ; négative sous la
 * pluie : le linge se remouille.
 */
export function dryRate(s: DryingSpot): number {
  if (!s.outdoors) return 1 / DRY_INSIDE;
  if (s.rain > RAIN_WETS) return -s.rain / REWET;
  let rate = s.night ? 1 / DRY_NIGHT : (1 - 0.6 * s.cloud) / DRY_SUN;
  // il gèle ou il neige : ça sèche à peine
  if (s.snow > 0.1 || s.air < 2) rate *= 0.4;
  return Math.max(rate, 1 / DRY_NIGHT);
}

/** Linge dans une machine : tenues, où il en est (sale, mouillé, sec), avancée du programme (0 à 1), en marche. */
interface Load {
  n: number;
  stage: 'sale' | 'mouillé' | 'sec';
  t: number;
  on: boolean;
}

/** Ce dont la buanderie a besoin de Game. */
export interface BuanderieHost {
  readonly character: Character;
  /** Fait apparaître l'objet `id` posé en `at` (monde), tourné de `yaw`. */
  spawn(id: string, at: THREE.Vector3, yaw: number): WorldItem | null;
  /** L'objet quitte la scène (vidé dans une machine, étendu, rangé). */
  remove(item: WorldItem): void;
  notice(text: string): void;
  say(text: string): void;
  mood(n: number): void;
  /** Joue le son `name` entendu depuis `at`. */
  sound(name: SoundName, at: THREE.Vector3): void;
  /** Le point est-il dehors (hors des pièces, sous le ciel) ? */
  outdoors(at: THREE.Vector3): boolean;
  /** La météo : pluie, neige, nuages (0 à 1). */
  weather(): { rain: number; snow: number; cloud: number };
  night(): boolean;
  /** Température de l'air dehors (°C). */
  outdoorAir(): number;
}

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

export class Buanderie {
  private host: BuanderieHost;
  private basket: WorldItem | null = null;
  private washer: WorldItem | null = null;
  private dryer: WorldItem | null = null;
  private rack: WorldItem | null = null;
  private wardrobe: WorldItem | null = null;
  /** Tenues sales dans le panier, propres dans l'armoire. */
  private dirty = START_DIRTY;
  private clean = START_CLEAN;
  /** Le linge dans chaque machine. */
  private loads = new Map<WorldItem, Load>();
  /** Le linge étendu : tenues, et humidité (1 trempé, 0 sec). */
  private hung: { n: number; wet: number } | null = null;
  /** Tenues que porte chaque tas de linge (mouillé ou propre). */
  private piles = new Map<WorldItem, number>();
  /** Hublots ouverts (temps restant). */
  private ports = new Map<WorldItem, number>();
  /** Secondes depuis que le perso a râlé du panier plein ; pluie déjà signalée sur l'étendoir. */
  private nag = 0;
  private rainWarned = false;

  constructor(host: BuanderieHost) {
    this.host = host;
  }

  /** Branche les objets de la lessive posés dans la scène. */
  attach(items: WorldItem[]): void {
    const find = (id: string) => items.find((i) => i.def.id === id) ?? null;
    this.basket = find('panier-linge');
    this.washer = find('machine-a-laver');
    this.dryer = find('seche-linge');
    this.rack = find('etendoir');
    this.wardrobe = find('armoire');
    this.showAll();
  }

  /** Objets dont Game laisse le clic à la buanderie : les machines, l'étendoir garni (ou quand on tient du linge mouillé), l'armoire quand on tient du linge propre. */
  owns(item: WorldItem): boolean {
    if (item === this.washer || item === this.dryer) return true;
    if (item === this.rack) return !!this.hung || !!this.held('linge-mouille');
    return item === this.wardrobe && !!this.held('linge-propre');
  }

  // ——— la douche ———

  /** Le perso sort de la douche : une tenue propre de l'armoire, une sale au panier. */
  showered(): void {
    if (this.clean <= 0) {
      this.host.say('Plus rien de propre à me mettre… je remets mes vêtements d’hier.');
      this.host.notice('L’armoire est vide : lave le linge sale du panier (machine à laver de la salle de bain).');
      this.host.mood(-3);
      return;
    }
    this.clean--;
    this.dirty++;
    this.showBasket();
    if (this.dirty > BASKET_FULL) {
      this.host.say('Le panier à linge déborde !');
      this.host.mood(-3);
    } else if (this.dirty === BASKET_FULL) {
      this.host.say('Le panier à linge est plein : il faudrait lancer une machine.');
      this.host.notice('Panier à linge plein : porte-le à la machine à laver, contre le mur de la salle de bain.');
      this.host.mood(-2);
    }
    this.nag = 0;
    if (this.clean === 0) this.host.notice('C’était la dernière tenue propre de l’armoire.');
  }

  // ——— le temps qui passe ———

  /** `dt` secondes réelles passent, le temps du jeu va `speed` fois plus vite que d'habitude. */
  update(dt: number, speed: number): void {
    const s = dt * speed;
    for (const [m, load] of this.loads) {
      if (!load.on) continue;
      const washer = m === this.washer;
      load.t = Math.min(1, load.t + s / (washer ? WASH_SECONDS : DRYER_SECONDS));
      // le tambour tourne (le lavage change de sens de temps en temps)
      const drum = m.part('tambour');
      if (drum) drum.rotation.z += dt * (washer ? (Math.sin(load.t * 40) > 0 ? 5 : -5) : 7);
      if (load.t < 1) continue;
      load.on = false;
      load.t = 0;
      load.stage = washer ? 'mouillé' : 'sec';
      this.showMachine(m);
      this.host.sound('ding', m.object.position);
      this.host.notice(washer
        ? 'La machine à laver a fini : sors le linge mouillé pour l’étendre ou le mettre au sèche-linge.'
        : 'Le sèche-linge a fini : le linge est sec, il n’y a plus qu’à le ranger dans l’armoire.');
    }
    for (const [m, t] of this.ports) {
      const left = t - dt;
      const port = m.part('hublot');
      if (port) port.rotation.y = left > 0 ? -1.7 : 0;
      if (left > 0) this.ports.set(m, left);
      else this.ports.delete(m);
    }
    this.dryRack(s);
    if (this.dirty >= BASKET_FULL) {
      this.nag += s;
      if (this.nag > FULL_NAG) {
        this.nag = 0;
        this.host.say('Ce panier de linge sale déborde…');
        this.host.mood(-1);
      }
    }
  }

  /** Le linge étendu sèche (ou se remouille sous la pluie). */
  private dryRack(s: number): void {
    const rack = this.rack, hung = this.hung;
    if (!rack || !hung || hung.wet <= 0) return;
    const w = this.host.weather();
    const outdoors = this.host.outdoors(rack.object.position);
    const rate = dryRate({ outdoors, rain: w.rain, snow: w.snow, cloud: w.cloud, night: this.host.night(), air: this.host.outdoorAir() });
    if (rate < 0 && !this.rainWarned) {
      this.rainWarned = true;
      this.host.say('Oh non, il pleut sur le linge !');
      this.host.notice('Il pleut sur l’étendoir : rentre-le (déplace-le à l’intérieur) ou passe le linge au sèche-linge.');
      this.host.mood(-1);
    }
    if (rate > 0) this.rainWarned = false;
    hung.wet = THREE.MathUtils.clamp(hung.wet - rate * s, 0, 1);
    this.showRack();
    if (hung.wet > 0) return;
    this.host.notice('Le linge étendu est sec : ramasse-le et range-le dans l’armoire.');
  }

  // ——— ce qu'on y fait ———

  /** Les actions du menu (clic droit) sur un objet de la lessive, ou sur l'armoire. */
  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    const wet = this.held('linge-mouille');
    if (item === this.washer) {
      const load = this.loads.get(item);
      if (!load && this.dirty > 0) add('Mettre le linge sale', () => this.loadWasher(false));
      else if (load?.stage === 'sale' && !load.on) add('Lancer un lavage', () => this.start(item));
      else if (load?.stage === 'mouillé') add('Sortir le linge mouillé', () => this.takeOut(item, false));
    } else if (item === this.dryer) {
      const load = this.loads.get(item);
      if (!load && wet) add('Mettre le linge au sèche-linge', () => this.loadDryer(wet, false));
      else if (load?.stage === 'mouillé' && !load.on) add('Lancer le séchage', () => this.start(item));
      else if (load?.stage === 'sec') add('Sortir le linge sec', () => this.takeOut(item, false));
    } else if (item === this.rack) {
      if (!this.hung && wet) add('Étendre le linge', () => this.hang(wet, false));
      else if (this.hung && this.hung.wet <= 0) add('Ramasser le linge sec', () => this.collect(false));
    } else if (item === this.wardrobe) {
      const clean = this.held('linge-propre');
      if (clean) add('Ranger le linge propre', () => this.putAway(clean, false));
    }
  }

  /** Clic : l'étape suivante de la lessive sur cet objet. */
  click(item: WorldItem, running: boolean): boolean {
    const wet = this.held('linge-mouille');
    if (item === this.washer) {
      const load = this.loads.get(item);
      if (!load) return this.loadWasher(running);
      if (load.on) return this.tell(`Lavage en cours (${Math.round(load.t * 100)} %).`);
      return load.stage === 'sale' ? this.start(item) : this.takeOut(item, running);
    }
    if (item === this.dryer) {
      const load = this.loads.get(item);
      if (!load) return wet ? this.loadDryer(wet, running) : this.tell('Le sèche-linge est vide : mets-y le linge mouillé de la machine à laver.');
      if (load.on) return this.tell(`Séchage en cours (${Math.round(load.t * 100)} %).`);
      return load.stage === 'mouillé' ? this.start(item) : this.takeOut(item, running);
    }
    if (item === this.rack) {
      if (!this.hung) return wet ? this.hang(wet, running) : false;
      if (this.hung.wet > 0) return this.tell(`Le linge sèche (${Math.round((1 - this.hung.wet) * 100)} %).`);
      return this.collect(running);
    }
    const clean = this.held('linge-propre');
    if (item === this.wardrobe && clean) return this.putAway(clean, running);
    return false;
  }

  /** Tenues propres qui restent dans l'armoire. */
  get cleanLeft(): number {
    return this.clean;
  }

  /** État visible pour l'infobulle (null : rien à dire ; l'armoire garde le sien, porte ouverte ou non). */
  stateOf(item: WorldItem): string | null {
    if (item === this.basket) {
      if (!this.dirty) return 'vide';
      const n = plural(this.dirty, 'tenue') + ` sale${this.dirty > 1 ? 's' : ''}`;
      return this.dirty > BASKET_FULL ? `déborde (${n})` : this.dirty === BASKET_FULL ? `plein (${n})` : n;
    }
    if (item === this.washer || item === this.dryer) {
      const load = this.loads.get(item);
      if (!load) return 'vide';
      if (load.on) return `${item === this.washer ? 'lavage' : 'séchage'} en cours (${Math.round(load.t * 100)} %)`;
      if (load.stage === 'sale') return 'linge sale, prêt à laver';
      if (load.stage === 'mouillé') return item === this.washer ? 'linge lavé, mouillé' : 'linge mouillé, prêt à sécher';
      return 'linge sec';
    }
    if (item === this.rack && this.hung) {
      if (this.hung.wet <= 0) return 'linge sec';
      const w = this.host.weather();
      const out = this.host.outdoors(item.object.position);
      const where = !out ? 'dedans' : w.rain > RAIN_WETS ? 'sous la pluie !' : this.host.night() ? 'dehors, la nuit' : 'au soleil';
      return `linge qui sèche (${Math.round((1 - this.hung.wet) * 100)} %), ${where}`;
    }
    const n = this.piles.get(item);
    if (n) return plural(n, 'tenue');
    return null;
  }

  // ——— la sauvegarde (rangé avec les objets : voir Game.saveAccess) ———

  /** États de la lessive gardés avec l'objet `item`. Une machine en marche est retrouvée arrêtée. */
  extras(item: WorldItem): Record<string, unknown> {
    if (item === this.basket) return { linSale: this.dirty };
    if (item === this.wardrobe) return { linPropre: this.clean };
    if (item === this.rack) return { linEtendu: this.hung };
    const load = this.loads.get(item);
    if (item === this.washer || item === this.dryer) return { linMachine: load ? { n: load.n, stage: load.stage, t: load.t } : null };
    const n = this.piles.get(item);
    return n ? { linTenues: n } : {};
  }

  /** Remet les états gardés par `extras`. */
  setExtras(item: WorldItem, x: Record<string, unknown>): void {
    if (typeof x.linSale === 'number') this.dirty = x.linSale;
    if (typeof x.linPropre === 'number') this.clean = x.linPropre;
    if ('linEtendu' in x) {
      const h = x.linEtendu as { n?: unknown; wet?: unknown } | null;
      this.hung = h && typeof h.n === 'number' && typeof h.wet === 'number' ? { n: h.n, wet: h.wet } : null;
    }
    if ('linMachine' in x) {
      const m = x.linMachine as { n?: unknown; stage?: unknown; t?: unknown } | null;
      if (m && typeof m.n === 'number' && (m.stage === 'sale' || m.stage === 'mouillé' || m.stage === 'sec')) {
        this.loads.set(item, { n: m.n, stage: m.stage, t: typeof m.t === 'number' ? m.t : 0, on: false });
      } else this.loads.delete(item);
    }
    if (typeof x.linTenues === 'number') this.piles.set(item, x.linTenues);
    this.showAll();
  }

  // ——— les gestes ———

  private tell(text: string): boolean {
    this.host.notice(text);
    return false;
  }

  /** L'objet tenu en main dont la fiche est `id`. */
  private held(id: string): WorldItem | null {
    return this.host.character.heldItems.find((h) => h.def.id === id) ?? null;
  }

  /** Le perso peut-il aller faire quelque chose de ses mains ? Sinon dit pourquoi. */
  private ready(again: () => boolean): boolean | null {
    const c = this.host.character;
    if (!c.canCarry) return this.tell('Crée un perso pour faire la lessive.');
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void again());
    return null;
  }

  /** Ouvre le hublot un instant (on charge ou on vide la machine). */
  private openPort(m: WorldItem): void {
    this.ports.set(m, PORT_OPEN);
    const port = m.part('hublot');
    if (port) port.rotation.y = -1.7;
  }

  /** Va vider le panier à linge dans la machine à laver (en allant d'abord chercher le panier). */
  private loadWasher(running: boolean): boolean {
    const m = this.washer, basket = this.basket;
    if (!m || !basket) return false;
    if (this.loads.has(m)) return this.tell('La machine à laver est déjà pleine.');
    if (!this.dirty) return this.tell('Le panier à linge est vide : rien à laver.');
    const wait = this.ready(() => this.loadWasher(running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (!c.handOf(basket)) {
      // on va d'abord chercher le panier
      if (!c.freeHand(basket)) return this.tell('Il faut les deux mains libres pour porter le panier à linge.');
      return c.pickUp(basket, running, undefined, () => void this.loadWasher(running));
    }
    c.approachThen(c.standFor(m), m.object.position, () => {
      if (this.loads.has(m) || !this.dirty) return;
      this.loads.set(m, { n: this.dirty, stage: 'sale', t: 0, on: false });
      this.host.notice(`${plural(this.dirty, 'tenue')} dans la machine. Lance un lavage (clic sur la machine).`);
      this.dirty = 0;
      this.nag = 0;
      this.openPort(m);
      this.showBasket();
      this.showMachine(m);
    }, running);
    return true;
  }

  /** Lance la machine `m` (lavage ou séchage). */
  private start(m: WorldItem): boolean {
    const load = this.loads.get(m);
    if (!load || load.on) return false;
    load.on = true;
    load.t = 0;
    this.ports.delete(m);
    const port = m.part('hublot');
    if (port) port.rotation.y = 0;
    this.showMachine(m);
    this.host.sound('bip', m.object.position);
    this.host.notice(m === this.washer ? 'Lavage lancé.' : 'Séchage lancé.');
    return true;
  }

  /** Sort le linge de la machine `m` (mouillé ou sec) et le prend contre soi. */
  private takeOut(m: WorldItem, running: boolean): boolean {
    const load = this.loads.get(m);
    if (!load || load.on || load.stage === 'sale') return false;
    const wait = this.ready(() => this.takeOut(m, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell(`Les mains sont prises (${c.heldItems.map((h) => h.name).join(' et ')}) : pose-les pour sortir le linge.`);
    c.approachThen(c.standFor(m), m.object.position, () => {
      if (this.loads.get(m) !== load) return;
      m.object.updateMatrixWorld(true);
      const at = new THREE.Vector3(0, m.box.max.y, 0).applyMatrix4(m.object.matrixWorld);
      const pile = this.host.spawn(load.stage === 'sec' ? 'linge-propre' : 'linge-mouille', at, m.object.rotation.y);
      if (!pile) return;
      this.loads.delete(m);
      this.piles.set(pile, load.n);
      this.openPort(m);
      this.showMachine(m);
      if (load.stage === 'sec') this.host.say('Tout chaud, tout doux.');
      if (!c.pickUp(pile, running)) this.host.notice(`Le linge est posé sur ${m === this.washer ? 'la machine' : 'le sèche-linge'}.`);
      else if (load.stage === 'mouillé') this.host.notice('Linge mouillé en main : étends-le sur l’étendoir (dehors au soleil, c’est rapide) ou mets-le au sèche-linge.');
    }, running);
    return true;
  }

  /** Met le linge mouillé tenu dans le sèche-linge. */
  private loadDryer(wet: WorldItem, running: boolean): boolean {
    const m = this.dryer;
    if (!m) return false;
    if (this.loads.has(m)) return this.tell('Le sèche-linge est déjà plein.');
    const wait = this.ready(() => this.loadDryer(wet, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    c.approachThen(c.standFor(m), m.object.position, () => {
      if (this.loads.has(m) || !c.handOf(wet) || !c.loseItem(wet)) return;
      this.loads.set(m, { n: this.piles.get(wet) ?? 1, stage: 'mouillé', t: 0, on: false });
      this.drop(wet);
      this.openPort(m);
      this.showMachine(m);
      this.host.notice('Le linge est dans le sèche-linge. Lance le séchage (clic sur le sèche-linge).');
    }, running);
    return true;
  }

  /** Étend le linge mouillé tenu sur l'étendoir. */
  private hang(wet: WorldItem, running: boolean): boolean {
    const rack = this.rack;
    if (!rack) return false;
    if (this.hung) return this.tell('L’étendoir est déjà plein.');
    const wait = this.ready(() => this.hang(wet, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    c.approachThen(c.standFor(rack), rack.object.position, () => {
      if (this.hung || !c.handOf(wet) || !c.loseItem(wet)) return;
      this.hung = { n: this.piles.get(wet) ?? 1, wet: 1 };
      this.rainWarned = false;
      this.drop(wet);
      this.showRack();
      const out = this.host.outdoors(rack.object.position);
      const w = this.host.weather();
      if (out && w.rain > RAIN_WETS) this.host.say('Étendre sous la pluie… pas malin.');
      else if (out && !this.host.night()) this.host.say('Avec ce soleil, ça va sécher en un rien de temps.');
      else if (!out) this.host.say('Dedans, ça va mettre un moment à sécher.');
      this.host.notice(out ? 'Linge étendu dehors : il sèche vite au soleil, mais rentre-le s’il pleut.' : 'Linge étendu dedans : il sèche lentement (dehors au soleil, c’est bien plus rapide).');
    }, running);
    return true;
  }

  /** Ramasse le linge sec de l'étendoir, plié contre soi. */
  private collect(running: boolean): boolean {
    const rack = this.rack, hung = this.hung;
    if (!rack || !hung || hung.wet > 0) return false;
    const wait = this.ready(() => this.collect(running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell('Les mains sont prises : pose ce que tu tiens pour ramasser le linge.');
    c.approachThen(c.standFor(rack), rack.object.position, () => {
      if (this.hung !== hung) return;
      rack.object.updateMatrixWorld(true);
      const at = new THREE.Vector3(0, 0, 0.45).applyMatrix4(rack.object.matrixWorld).setY(0);
      const pile = this.host.spawn('linge-propre', at, rack.object.rotation.y);
      if (!pile) return;
      this.hung = null;
      this.piles.set(pile, hung.n);
      this.showRack();
      this.host.say('Ça sent bon le linge séché au grand air.');
      if (!c.pickUp(pile, running)) this.host.notice('Le linge plié est posé au pied de l’étendoir.');
    }, running);
    return true;
  }

  /** Range le linge propre tenu dans l'armoire. */
  private putAway(clean: WorldItem, running: boolean): boolean {
    const ward = this.wardrobe;
    if (!ward) return false;
    const wait = this.ready(() => this.putAway(clean, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    c.approachThen(c.standFor(ward), ward.object.position, () => {
      if (!c.handOf(clean) || !c.loseItem(clean)) return;
      this.clean += this.piles.get(clean) ?? 1;
      this.drop(clean);
      this.host.say('Ça sent bon le propre !');
      this.host.mood(3);
      this.host.notice(`Linge rangé : ${plural(this.clean, 'tenue')} propre${this.clean > 1 ? 's' : ''} dans l’armoire.`);
    }, running);
    return true;
  }

  /** Le tas de linge quitte la scène (dans une machine, sur l'étendoir, dans l'armoire). */
  private drop(pile: WorldItem): void {
    this.piles.delete(pile);
    this.host.remove(pile);
  }

  // ——— ce qu'on voit ———

  private showAll(): void {
    this.showBasket();
    for (const m of [this.washer, this.dryer]) if (m) this.showMachine(m);
    this.showRack();
  }

  /** Le tas de linge sale monte dans le panier ; plein, des vêtements dépassent. */
  private showBasket(): void {
    const b = this.basket;
    if (!b) return;
    const pile = b.part('linge');
    if (pile) {
      pile.visible = this.dirty > 0;
      pile.scale.y = 0.3 + 0.7 * Math.min(1, this.dirty / BASKET_FULL);
    }
    const over = b.part('deborde');
    if (over) over.visible = this.dirty >= BASKET_FULL;
  }

  /** Le linge dans le tambour, l'eau du lavage, le voyant vert en marche. */
  private showMachine(m: WorldItem): void {
    const load = this.loads.get(m);
    const drum = m.part('tambour');
    if (drum) drum.visible = !!load;
    const water = m.part('eau');
    if (water) water.visible = !!load?.on;
    const led = m.part('voyant') as THREE.Mesh | undefined;
    if (led) (led.material as THREE.MeshBasicMaterial).color.set(load?.on ? 0x5fe36a : 0x48524c);
  }

  /** Les vêtements étendus, plus foncés tant qu'ils sont mouillés. */
  private showRack(): void {
    const rack = this.rack;
    const laundry = rack?.part('linge');
    if (!laundry) return;
    laundry.visible = !!this.hung;
    const dark = 1 - 0.3 * (this.hung?.wet ?? 0);
    laundry.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.MeshToonMaterial;
      const base = (o.userData.base ??= mat.color.getHex()) as number;
      mat.color.setHex(base).multiplyScalar(dark);
    });
  }
}
