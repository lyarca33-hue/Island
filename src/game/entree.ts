/**
 * L'entrée, à l'ouest de la cuisine : la porte de la maison (mur sud, vers le chemin du jardin),
 * le passage vers la cuisine (mur est), une petite fenêtre à l'ouest. Le banc à chaussures contre
 * le fond (on s'y assoit pour passer des chaussons aux chaussures), le portemanteau au mur ouest
 * (manteau, écharpe, bonnet), le miroir au mur est. Les courses livrées sont posées ici, et dehors,
 * au bout du chemin, la boîte aux lettres reçoit une lettre chaque matin.
 *
 * Ce qu'on y fait : mettre son manteau, son écharpe et son bonnet pour sortir (ils tiennent chaud
 * dehors, trop chaud dedans), changer de chaussures assis sur le banc, relever le courrier et lire
 * les lettres (cartes postales, factures, nouvelles de Mamie… qui font varier l'humeur).
 *
 * Les fiches des objets sont dans items/entree.ts ; Game ne fait que brancher l'entrée (menu, clic,
 * heures qui passent, chaleur des vêtements) par l'interface EntreeHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import { wearCoat } from './manteau';
import { box, DARK_WOOD, DOOR, ROOM, tiles, toon, WALL_T, WIN_HIGH, type Rect, type Room, type RoomSpec } from './room';

/** Intérieur de l'entrée : son mur est est dos au mur ouest de la cuisine. */
export const ENTREE: Rect = { x0: ROOM.x0 - 2 * WALL_T - 2.3, x1: ROOM.x0 - 2 * WALL_T, z0: 0.45, z1: ROOM.z1 };
/** Porte de la maison (mur sud de l'entrée), de x0 à x1 : le chemin du jardin part de là. */
export const FRONT_DOOR = { x0: -5.0, x1: -4.1 };
/** Où le livreur pose le sac de courses : dans l'entrée, à côté de la porte. */
export const DELIVERY_SPOT = new THREE.Vector3(FRONT_DOOR.x0 - 0.2, 0, ENTREE.z1 - 0.5);

/** Le facteur passe à cette heure ; la boîte aux lettres garde au plus tant de lettres. */
const MAIL_HOUR = 9;
const MAIL_MAX = 4;
/** Chaleur des vêtements (°C de ressenti) : dehors, et dedans (la maison est chauffée : on a vite trop chaud). */
const WARMTH: Record<Clothes, { out: number; in: number }> = {
  manteau: { out: 7, in: 4 },
  echarpe: { out: 3, in: 1.5 },
  bonnet: { out: 2, in: 1 },
};
/** En dessous de cette température dehors, sortir sans manteau fait frissonner. */
const COAT_BELOW = 10;
/** Heures passées dedans en manteau avant que le perso le remarque. */
const COAT_INSIDE = 0.4;

type Clothes = 'manteau' | 'echarpe' | 'bonnet';
const CLOTHES: Clothes[] = ['manteau', 'echarpe', 'bonnet'];
const CLOTHES_NAME: Record<Clothes, string> = { manteau: 'le manteau', echarpe: 'l’écharpe', bonnet: 'le bonnet' };

/** Une lettre : qui l'envoie, ce qu'elle dit, ce qu'en dit le perso, et l'humeur gagnée (ou perdue) à la lecture. */
interface Letter {
  from: string;
  text: string;
  say: string;
  mood: number;
}

/** La lettre posée sur la table au départ. */
const WELCOME: Letter = {
  from: 'la mairie de l’île',
  text: 'Bienvenue dans votre nouvelle maison ! Le facteur passe chaque matin : pensez à relever votre boîte aux lettres, au bout du chemin.',
  say: 'Une lettre de bienvenue, c’est gentil.',
  mood: 2,
};

/** Le courrier du matin, dans l'ordre où il arrive (puis on recommence). */
const LETTERS: Letter[] = [
  { from: 'Léa', text: 'Coucou ! Ici la mer est turquoise et il fait un temps magnifique. Je pense bien à toi. Bisous !', say: 'Oh, une carte postale de Léa !', mood: 4 },
  { from: 'la compagnie d’électricité', text: 'Votre facture du mois : 42,17 €, à régler avant la fin du mois.', say: 'Une facture… ça ne fait jamais plaisir.', mood: -2 },
  { from: 'Mamie', text: 'Mon petit, mange bien, couvre-toi quand il fait froid et n’oublie pas d’arroser tes tomates. Je t’embrasse fort.', say: 'Une lettre de Mamie !', mood: 5 },
  { from: 'la boulangerie du port', text: 'Cette semaine : deux croissants achetés, le troisième offert !', say: 'De la pub. Ça ira au recyclage.', mood: 0 },
  { from: 'le journal du quartier', text: 'La fête de l’île aura lieu samedi sur la place du port. Concours de tartes : à vos fourneaux !', say: 'Un concours de tartes ? Il faut que je m’entraîne.', mood: 2 },
  { from: 'Tom', text: 'Salut ! On fait un pique-nique au phare dimanche, tu viens ? Apporte un dessert !', say: 'Un pique-nique au phare, chouette !', mood: 3 },
  { from: 'la bibliothèque', text: 'Rappel : le livre emprunté est à rendre avant vendredi.', say: 'Ah oui, le livre… il faut que je le finisse.', mood: -1 },
  { from: 'un magazine de cuisine', text: 'Ce mois-ci : la soupe de légumes du potager, simple et réconfortante.', say: 'Ça donne faim.', mood: 1 },
];

/** Carrelage de terre cuite, carreaux de 30 cm. */
function terracotta(r: Rect): THREE.Material {
  const tex = tiles(256, 4, '#b8654a', '#a95b41', '#dccbb4', 3);
  tex.repeat.set((r.x1 - r.x0) / 1.2, (r.z1 - r.z0) / 1.2);
  return toon(0xffffff, tex);
}

/** Tableau au-dessus du banc, porte-parapluies dans le coin à côté de la porte. */
function entreeDecor(room: Room, anchor: (id: string) => THREE.Vector3 | undefined): void {
  const { x0, z1 } = room.rect;
  const bench = anchor('banc-chaussures');
  // un petit tableau : le phare de l'île
  const pic = room.wallFrame('nord', bench?.x ?? x0 + 0.8, 1.45);
  pic.add(
    box(0.03, 0.46, 0.36, toon(DARK_WOOD), 0.015, 0, 0, false),
    box(0.01, 0.2, 0.3, toon(0x9fd0e8), 0.032, 0.1, 0, false),
    box(0.01, 0.18, 0.3, toon(0x3f7fa8), 0.032, -0.1, 0, false),
    box(0.012, 0.24, 0.05, toon(0xf6f3ec), 0.034, 0.02, 0.06, false),
    box(0.013, 0.05, 0.05, toon(0xc0392b), 0.035, 0.08, 0.06, false),
  );
  room.wallGroup('nord').add(pic);
  // porte-parapluies, deux parapluies dedans
  const stand = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.5, 16, 1, true), toon(0x2f4f6f));
  pot.position.y = 0.25;
  stand.add(pot);
  for (const [x, z, c, tilt] of [[0.03, 0.02, 0xc0392b, 0.12], [-0.04, -0.02, 0x2a2b2e, -0.1]] as const) {
    const u = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.012, 0.62, 8), toon(c));
    cone.position.y = 0.35;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10, Math.PI), toon(0x5d4129));
    handle.position.set(0.03, 0.72, 0);
    const rod = box(0.012, 0.12, 0.012, toon(0x5d4129), 0, 0.68, 0);
    u.add(cone, rod, handle);
    u.position.set(x, 0.02, z);
    u.rotation.z = tilt;
    stand.add(u);
  }
  stand.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  stand.position.set(x0 + 0.2, 0, z1 - 0.2);
  room.group.add(stand);
  room.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-0.13, 0, -0.13), new THREE.Vector3(0.13, 0.6, 0.13)), pos: stand.position.clone(), yaw: 0, wall: false });
}

export const ENTREE_SPEC: RoomSpec = {
  name: 'entrée',
  rect: ENTREE,
  floor: () => terracotta(ENTREE),
  // passage vers la cuisine (est), la porte de la maison (sud)
  doors: [
    { wall: 'est', u0: DOOR.z0, u1: DOOR.z1 },
    { wall: 'sud', u0: FRONT_DOOR.x0, u1: FRONT_DOOR.x1, leaf: true },
  ],
  joined: ['est'],
  windows: () => [{ wall: 'ouest', u0: 0.8, u1: 1.4, y0: 0.95, y1: WIN_HIGH }],
  lamps: () => [{ x: (ENTREE.x0 + ENTREE.x1) / 2, z: (ENTREE.z0 + ENTREE.z1) / 2, kind: 'suspension', shade: 0x9a6a3c }],
  lightSwitch: { wall: 'sud', u: FRONT_DOOR.x1 + 0.2 },
  runs: [{ wall: 'nord', from: ENTREE.x0 + 0.3, items: ['banc-chaussures'] }],
  items: [
    // le portemanteau au mur ouest, le miroir au mur est (à côté du passage)
    ['portemanteau', ENTREE.x0 + 0.004, 0, 2.15, Math.PI / 2],
    ['miroir', ENTREE.x1 - 0.004, 1.0, 0.9, -Math.PI / 2],
    // les vêtements : accrochés au portemanteau au départ (Entree.attach)
    ['manteau', ENTREE.x0 + 0.4, 0, 2.15, 0],
    ['echarpe', ENTREE.x0 + 0.4, 0, 2.45, 0],
    ['bonnet', ENTREE.x0 + 0.4, 0, 1.85, 0],
    // dehors, au bord du chemin, la boîte aux lettres tournée vers lui
    ['boite-aux-lettres', -3.3, 0, 3.45, 0],
  ],
  decor: entreeDecor,
};

/** Ce dont l'entrée a besoin de Game. */
export interface EntreeHost {
  readonly character: Character;
  /** Les objets de la scène. */
  items(): WorldItem[];
  /** Fait apparaître l'objet `id` posé en `at` (monde), tourné de `yaw`. */
  spawn(id: string, at: THREE.Vector3, yaw: number): WorldItem | null;
  /** L'objet quitte la scène (enfilé). */
  remove(item: WorldItem): void;
  notice(text: string): void;
  say(text: string): void;
  mood(n: number): void;
  /** Le siège où le perso est assis. */
  sitting(): WorldItem | null;
  /** S'asseoir sur `seat`, puis `then`. */
  sit(seat: WorldItem, then: () => void): boolean;
  /** Le perso est-il dehors ? */
  outdoors(): boolean;
  /** Température de l'air dehors (°C). */
  outdoorAir(): number;
  /** Il pleut (0 à 1). */
  rain(): number;
}

export class Entree {
  private host: EntreeHost;
  private rack: WorldItem | null = null;
  private bench: WorldItem | null = null;
  private mailbox: WorldItem | null = null;
  /** Lettres qui attendent dans la boîte, dernier jour où le facteur est passé, prochaine lettre de LETTERS. */
  private mail = 1;
  private mailDay = -1;
  private nextLetter = 0;
  /** Ce que dit chaque lettre (donné à la première lecture pour celle de départ), et celles déjà lues. */
  private letters = new Map<WorldItem, Letter>();
  private read = new Set<WorldItem>();
  /** Vêtements portés, et ce qu'ils ajoutent au perso (pour les retirer). */
  private worn = new Map<Clothes, THREE.Object3D[]>();
  /** Vêtements portés à la sauvegarde, à raccrocher après le chargement. */
  private pending: Clothes[] = [];
  /** Aux pieds : les chaussons (dedans) ou les chaussures. */
  private shoes: 'chaussons' | 'chaussures' = 'chaussons';
  /** Dehors en ce moment, ce qu'on a déjà remarqué depuis qu'on est sorti, heures passées dedans en manteau. */
  private out = false;
  private warned = new Set<'chaussons' | 'froid' | 'pluie'>();
  private coatInside = 0;

  constructor(host: EntreeHost) {
    this.host = host;
  }

  /** Branche les objets de l'entrée posés dans la scène, et accroche les vêtements au portemanteau. */
  attach(items: WorldItem[]): void {
    this.rack = items.find((i) => i.def.id === 'portemanteau') ?? null;
    this.bench = items.find((i) => i.def.id === 'banc-chaussures') ?? null;
    this.mailbox = items.find((i) => i.def.id === 'boite-aux-lettres') ?? null;
    for (const id of CLOTHES) {
      const it = items.find((i) => i.def.id === id);
      if (it) this.hang(it);
    }
    this.showMail();
    this.showShoes();
  }

  /** Objet dont Game laisse le clic à l'entrée : la boîte aux lettres. */
  owns(item: WorldItem): boolean {
    return item === this.mailbox;
  }

  /** Chaleur des vêtements portés (°C de ressenti), dehors ou dedans. */
  warmth(outdoors: boolean): number {
    let n = 0;
    for (const k of this.worn.keys()) n += outdoors ? WARMTH[k].out : WARMTH[k].in;
    return n;
  }

  // ——— la sauvegarde (rangé avec les objets : voir Game.saveAccess) ———

  /** États de l'entrée gardés avec l'objet `item` (vêtements portés, chaussures, courrier, lettre lue). */
  extras(item: WorldItem): Record<string, unknown> {
    if (item === this.rack && this.worn.size) return { porte: [...this.worn.keys()] };
    if (item === this.bench && this.shoes === 'chaussures') return { chaussures: true };
    if (item === this.mailbox) return { courrier: this.mail, suivante: this.nextLetter, facteur: this.mailDay };
    const l = this.letters.get(item);
    if (l) return { lettre: LETTERS.indexOf(l), lue: this.read.has(item) };
    return {};
  }

  /** Remet les états gardés par `extras`. Les vêtements portés reviennent au portemanteau (voir restored). */
  setExtras(item: WorldItem, x: Record<string, unknown>): void {
    if (item === this.rack && Array.isArray(x.porte)) this.pending = x.porte.filter((k): k is Clothes => CLOTHES.includes(k as Clothes));
    if (item === this.bench) {
      this.shoes = x.chaussures ? 'chaussures' : 'chaussons';
      this.showShoes();
    }
    if (item === this.mailbox) {
      if (typeof x.courrier === 'number') this.mail = x.courrier;
      if (typeof x.suivante === 'number') this.nextLetter = x.suivante;
      if (typeof x.facteur === 'number') this.mailDay = x.facteur;
      this.showMail();
    }
    if (item.def.id === 'lettre' && typeof x.lettre === 'number') {
      this.letters.set(item, LETTERS[x.lettre] ?? WELCOME);
      if (x.lue) this.read.add(item);
    }
  }

  /** Après le chargement : les vêtements qu'on portait sont raccrochés au portemanteau (comme ce qu'on tenait est posé). */
  restored(): void {
    for (const parts of this.worn.values()) for (const p of parts) p.removeFromParent();
    this.worn.clear();
    const rack = this.rack;
    for (const k of this.pending) {
      const it = rack && this.host.spawn(k, rack.object.position, 0);
      if (it) this.hang(it);
    }
    this.pending = [];
  }

  // ——— les heures qui passent ———

  /** `hours` de jeu passent ; `day` et `hour` : le jour et l'heure de l'horloge du jeu. */
  tick(hours: number, day: number, hour: number): void {
    // le facteur passe le matin
    if (this.mailDay < 0) this.mailDay = hour >= MAIL_HOUR ? day : day - 1;
    if (hour >= MAIL_HOUR && day !== this.mailDay) {
      this.mailDay = day;
      if (this.mail < MAIL_MAX) {
        this.mail++;
        this.showMail();
        this.host.notice('Le facteur est passé : il y a du courrier dans la boîte aux lettres, au bout du chemin.');
      }
    }
    if (hours <= 0) return;
    // sortir, rentrer
    const out = this.host.outdoors();
    if (out !== this.out) {
      this.out = out;
      this.warned.clear();
      this.coatInside = 0;
    }
    if (out) {
      // une remarque à la fois : la suivante un instant après
      if (this.shoes === 'chaussons' && !this.warned.has('chaussons')) {
        this.warned.add('chaussons');
        this.host.say('Oups, je suis sorti en chaussons !');
        this.host.notice('En chaussons dehors : assieds-toi sur le banc de l’entrée pour mettre tes chaussures.');
        this.host.mood(-1);
      } else if (this.shoes === 'chaussons' && this.host.rain() > 0.2 && !this.warned.has('pluie')) {
        this.warned.add('pluie');
        this.host.say('Beurk, mes chaussons sont trempés…');
        this.host.mood(-2);
      } else if (!this.worn.has('manteau') && this.host.outdoorAir() < COAT_BELOW && !this.warned.has('froid')) {
        this.warned.add('froid');
        this.host.say('Brr ! J’aurais dû prendre mon manteau.');
        this.host.notice('Il fait froid dehors : le manteau, l’écharpe et le bonnet sont au portemanteau de l’entrée.');
      }
    } else if (this.worn.has('manteau')) {
      this.coatInside += hours;
      if (this.coatInside > COAT_INSIDE && !this.warned.has('froid')) {
        this.warned.add('froid');
        this.host.say('Il fait chaud ici, avec ce manteau.');
        this.host.notice('Dedans, le manteau tient trop chaud : accroche-le au portemanteau de l’entrée.');
      }
    }
  }

  // ——— ce qu'on y fait ———

  /** Les actions du menu (clic droit) sur un objet de l'entrée, une lettre ou un vêtement. */
  menu(item: WorldItem, add: (label: string, run: () => boolean) => void): void {
    if (item === this.mailbox) {
      if (this.mail > 0) add(`Relever le courrier (${this.mail})`, () => this.fetchMail(false));
    } else if (item === this.rack) {
      for (const k of CLOTHES) if (this.worn.has(k)) add(`Accrocher ${CLOTHES_NAME[k]}`, () => this.takeOff(k, false));
    } else if (item === this.bench) {
      add(this.shoes === 'chaussons' ? 'Mettre les chaussures' : 'Mettre les chaussons', () => this.changeShoes());
    } else if (item.def.id === 'lettre') {
      add('Lire la lettre', () => this.readLetter(item, false));
    } else if (CLOTHES.includes(item.def.id as Clothes)) {
      add(`Mettre ${CLOTHES_NAME[item.def.id as Clothes]}`, () => this.putOn(item, false));
    }
  }

  /** Clic sur la boîte aux lettres : relever le courrier. */
  click(item: WorldItem, running: boolean): boolean {
    if (item === this.mailbox) return this.fetchMail(running);
    return false;
  }

  /** État visible pour l'infobulle (null : rien à dire). */
  stateOf(item: WorldItem): string | null {
    if (item === this.mailbox) return this.mail ? `${this.mail} lettre${this.mail > 1 ? 's' : ''}` : 'vide';
    if (item === this.bench) return this.shoes === 'chaussons' ? 'en chaussons' : 'en chaussures';
    if (item === this.rack && this.worn.size) return `porté : ${[...this.worn.keys()].map((k) => CLOTHES_NAME[k].replace(/^(le |l’)/, '')).join(', ')}`;
    if (item.def.id === 'lettre') return this.read.has(item) ? 'lue' : 'pas encore lue';
    return null;
  }

  private tell(text: string): boolean {
    this.host.notice(text);
    return false;
  }

  /** Le perso peut-il aller faire quelque chose de ses mains ? Sinon dit pourquoi. */
  private ready(again: () => boolean): boolean | null {
    const c = this.host.character;
    if (!c.canCarry) return this.tell('Crée un perso pour faire ça.');
    if (c.busy) return false;
    if (c.seated) return c.standUp(() => void again());
    return null;
  }

  /** Va à la boîte aux lettres et en sort une lettre (une par une). */
  private fetchMail(running: boolean): boolean {
    const box = this.mailbox;
    if (!box) return false;
    if (!this.mail) return this.tell('La boîte aux lettres est vide : le facteur passe chaque matin.');
    const wait = this.ready(() => this.fetchMail(running));
    if (wait !== null) return wait;
    const c = this.host.character;
    if (c.hands.free < 1) return this.tell('Les mains sont prises : pose quelque chose pour relever le courrier.');
    c.approachThen(c.standFor(box), box.object.position, () => {
      if (!this.mail) return;
      box.object.updateMatrixWorld(true);
      const at = new THREE.Vector3(0, 1.17, 0.24).applyMatrix4(box.object.matrixWorld);
      const letter = this.host.spawn('lettre', at, box.object.rotation.y);
      if (!letter) return;
      this.mail--;
      this.showMail();
      this.letters.set(letter, LETTERS[this.nextLetter++ % LETTERS.length]);
      if (!c.pickUp(letter, running)) this.host.notice('Une lettre : elle attend sur la boîte aux lettres.');
      else if (this.mail) this.host.notice(`Une lettre ! Il en reste ${this.mail} dans la boîte.`);
    }, running);
    return true;
  }

  /** Lit la lettre `item` : en main, tout de suite ; sinon on va la lire là où elle est. */
  private readLetter(item: WorldItem, running: boolean): boolean {
    const c = this.host.character;
    const show = () => {
      const l = this.letters.get(item) ?? WELCOME;
      this.letters.set(item, l);
      this.host.notice(`Lettre de ${l.from} : « ${l.text} »`);
      if (this.read.has(item)) return;
      this.read.add(item);
      this.host.say(l.say);
      if (l.mood) this.host.mood(l.mood);
    };
    if (c.handOf(item)) {
      show();
      return true;
    }
    if (c.busy) return false;
    c.approachThen(c.standFor(item), item.object.position, show, running);
    return true;
  }

  /** Enfile le vêtement `item` (pris où il est : à la patère, posé, ou en main). */
  private putOn(item: WorldItem, running: boolean): boolean {
    const k = item.def.id as Clothes;
    if (this.worn.has(k)) return this.tell(`Tu portes déjà ${CLOTHES_NAME[k]}.`);
    const c = this.host.character;
    const wear = () => {
      if (c.handOf(item) && !c.loseItem(item)) return;
      this.host.remove(item);
      this.worn.set(k, this.dress(k));
      this.host.say(k === 'manteau' ? 'Bien au chaud.' : k === 'echarpe' ? 'L’écharpe autour du cou.' : 'Le bonnet sur la tête.');
    };
    if (c.handOf(item)) {
      wear();
      return true;
    }
    const wait = this.ready(() => this.putOn(item, running));
    if (wait !== null) return wait;
    c.approachThen(c.standFor(item), item.object.position, wear, running);
    return true;
  }

  /** Retire le vêtement `k` et l'accroche au portemanteau. */
  private takeOff(k: Clothes, running: boolean): boolean {
    const rack = this.rack;
    if (!this.worn.has(k) || !rack) return false;
    const wait = this.ready(() => this.takeOff(k, running));
    if (wait !== null) return wait;
    const c = this.host.character;
    c.approachThen(c.standFor(rack), rack.object.position, () => {
      const parts = this.worn.get(k);
      if (!parts) return;
      const it = this.host.spawn(k, rack.object.position, 0);
      if (!it) return;
      for (const p of parts) p.removeFromParent();
      this.worn.delete(k);
      if (!this.hang(it)) this.host.notice(`Plus de patère libre : ${CLOTHES_NAME[k]} est posé${k === 'echarpe' ? 'e' : ''} par terre.`);
    }, running);
    return true;
  }

  /** Accroche `item` à une patère libre du portemanteau (faux s'il n'y en a pas : il reste où il est). */
  private hang(item: WorldItem): boolean {
    const rack = this.rack;
    if (!rack?.def.slots) return false;
    rack.object.updateMatrixWorld(true);
    const others = this.host.items().filter((i) => i !== item);
    const tilt = rack.def.slotTilt ?? [0, 0, 0];
    for (const [x, y, z] of rack.def.slots) {
      const at = new THREE.Vector3(x, y, z).applyMatrix4(rack.object.matrixWorld);
      if (others.some((o) => o.object.position.distanceTo(at) < 0.02)) continue;
      item.object.position.copy(at);
      item.object.quaternion.copy(rack.object.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], tilt[1], tilt[2], 'YXZ')));
      return true;
    }
    return false;
  }

  /** S'assoit sur le banc et change de chaussures. */
  private changeShoes(): boolean {
    const bench = this.bench;
    if (!bench) return false;
    const swap = () => {
      this.shoes = this.shoes === 'chaussons' ? 'chaussures' : 'chaussons';
      this.showShoes();
      this.host.say(this.shoes === 'chaussures' ? 'Chaussures lacées, prêt à sortir !' : 'Ah, les chaussons, quel confort.');
      if (this.shoes === 'chaussons') this.host.mood(1);
    };
    if (this.host.sitting() === bench) {
      swap();
      return true;
    }
    return this.host.sit(bench, swap);
  }

  /** La boîte aux lettres montre le courrier qui dépasse et lève son drapeau quand il y en a. */
  private showMail(): void {
    const box = this.mailbox;
    if (!box) return;
    const mail = box.part('courrier');
    if (mail) mail.visible = this.mail > 0;
    const flag = box.part('drapeau');
    if (flag) flag.rotation.x = this.mail > 0 ? 0 : Math.PI / 2;
  }

  /** Sous le banc : les chaussures de dehors, ou les chaussons quand on est sorti en chaussures. */
  private showShoes(): void {
    const bench = this.bench;
    if (!bench) return;
    const out = bench.part('chaussures'), home = bench.part('chaussons');
    if (out) out.visible = this.shoes === 'chaussons';
    if (home) home.visible = this.shoes === 'chaussures';
  }

  /**
   * Habille le perso du vêtement `k` : le manteau est taillé sur son corps et suit ses gestes
   * (manteau.ts) ; l'écharpe et le bonnet sont des formes simples accrochées au cou et à la tête, à
   * sa taille (mesurée du bassin au cou). Rien sans perso du créateur.
   */
  private dress(k: Clothes): THREE.Object3D[] {
    const c = this.host.character;
    const hips = c.bone('hips'), neck = c.bone('neck'), head = c.bone('head');
    if (!hips || !neck || !head) return [];
    c.root.updateMatrixWorld(true);
    const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
    // unité : du bassin au cou (≈ 0,4 m pour un perso de 1,6 m)
    const u = at(neck).y - at(hips).y;
    const facing = c.root.getWorldQuaternion(new THREE.Quaternion());
    const out: THREE.Object3D[] = [];
    const part = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, toon(color));
      m.position.set(x, y, z);
      return m;
    };
    const put = (bone: THREE.Object3D | null, o: THREE.Object3D, pos: THREE.Vector3, rot = facing) => {
      if (!bone) return;
      o.position.copy(pos);
      o.quaternion.copy(rot);
      o.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = true; });
      // attach garde la place et la taille dans le monde, quelle que soit l'échelle de l'os
      bone.attach(o);
      out.push(o);
    };
    if (k === 'manteau') {
      // un vrai manteau, taillé sur le corps du perso et animé avec lui (manteau.ts)
      const coat = wearCoat(c);
      if (coat) out.push(coat);
    } else if (k === 'echarpe') {
      const scarf = new THREE.Group();
      scarf.add(part(new THREE.TorusGeometry(0.17 * u, 0.07 * u, 8, 16).rotateX(Math.PI / 2), 0x2f6f8f));
      // le pan qui tombe devant
      scarf.add(part(new THREE.BoxGeometry(0.16 * u, 0.6 * u, 0.05 * u), 0xf2c94c, 0.06 * u, -0.3 * u, 0.2 * u));
      put(neck, scarf, at(neck).add(new THREE.Vector3(0, -0.02 * u, 0)));
    } else {
      // assez grand pour coiffer les cheveux
      const hat = new THREE.Group();
      hat.add(
        part(new THREE.SphereGeometry(0.33 * u, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xb8432f),
        part(new THREE.CylinderGeometry(0.34 * u, 0.34 * u, 0.1 * u, 16), 0xf1e2c0),
        part(new THREE.SphereGeometry(0.09 * u, 10, 8), 0xf1e2c0, 0, 0.33 * u, 0),
      );
      put(head, hat, at(head).add(new THREE.Vector3(0, 0.37 * u, 0)));
    }
    return out;
  }
}
