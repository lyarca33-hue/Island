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
import { breakChance, Debris, Spill } from './items/breakage';
import { gradeName } from './items/durability';
import { LAY_FLAT, SPLASH_CYCLE, WorldItem } from './items/carry';
import { isTwoHanded } from './items/grips';
import { ITEM_BY_ID, SLOTS_PER_SHELF, TABLE_H, type ItemDef } from './items/catalog';
import { type Doneness, doneness, DONENESS_HUNGER, donenessWord, Puffs, showDoneness, waterCap } from './items/cooking';
import { DISH_FEMININE, RECIPE_BY_DISH, RECIPES, type Recipe as DishRecipe } from './items/recipes';
import { createMotes } from './motes';
import { footprint, Nav, overlaps } from './nav';
import { Needs } from './needs';
import { placeRuns, Room, WALL_T } from './room';
import { ROOMS } from './rooms';
import { CHANNELS, Tv } from './tv';
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

/** Soif rendue par une tasse pleine bue en entier, et regain d'énergie si c'est du café (moitié moins pour le thé). */
const DRINK_THIRST = 35;
const COFFEE_ENERGY = 12;
/**
 * Dormir : vitesse de l'horloge pendant le sommeil (minutes de jeu par minute réelle : une nuit de
 * 8 h passe en une douzaine de secondes), durée des fondus au noir (s), noir de la chambre pendant
 * le sommeil (opacité du voile), et au-dessus de quelle fatigue on n'a pas sommeil.
 */
const SLEEP_SPEED = 2400;
const SLEEP_FADE = 0.7;
const SLEEP_DIM = 0.55;
const NOT_SLEEPY = 90;
const TEA_ENERGY = 6;
/** Un jus de fruits (mixeur) nourrit un peu : faim rendue par tasse pleine. */
const JUICE_HUNGER = 12;
/** L'eau désaltère plus que le café : soif en plus pour une bouteille entière. */
const WATER_EXTRA = 15;

/** Porte du frigo : temps pour l'ouvrir ou la fermer (s), et distance à laquelle elle se referme seule (m). */
const DOOR_TIME = 0.6;
const DOOR_AUTOCLOSE = 1.8;
/** Où se tenir devant un meuble à porte : à cette distance (m), plus la moitié d'une porte qui s'abaisse (four). */
const DOOR_GAP = 0.3;

/** Usure d'un appareil (four, micro-ondes, lave-vaisselle) à chaque programme, et d'une poubelle à chaque objet jeté. */
const WEAR_RUN = 1;
const WEAR_BIN = 0.3;

/**
 * Se laver à l'évier : durée (s, mains sous l'eau) et hygiène rendue. Les mains : un petit plus ;
 * la toilette au lavabo (visage, mains, trois tours) : un vrai regain, sans valoir une douche.
 */
const WASH_HANDS = { seconds: 3, hygiene: 12 };
/** Boire au robinet, dans le creux des mains : soif rendue en tout. */
const TAP_DRINK = { seconds: 3 * SPLASH_CYCLE, thirst: 25 };
/** Vaisselle mouillée hors de l'égouttoir : sèche en tant de minutes de jeu. */
const AIR_DRY_MINUTES = 120;
/** Mains mouillées après les avoir lavées : sèchent seules en tant de minutes de jeu. */
const HANDS_DRY_MINUTES = 10;
/** Verser : litres par seconde quand le récipient est incliné. */
const POUR_RATE = 0.45;
/** Ce que prend une tasse servie au réservoir d'une bouilloire (litres). */
const SERVING = 0.25;
/** Évier bouché, robinet ouvert : temps pour remplir la cuve (s), puis une flaque toutes les OVERFLOW secondes. */
const SINK_FILL = 20;
const OVERFLOW = 1.4;
/** Évier débouché : temps pour que la cuve pleine se vide (s). */
const SINK_DRAIN = 4;
/** Glaçons : combien par récipient, et combien de temps ils tiennent avant d'avoir fondu (s). */
const ICE_CUBES = 3;
const ICE_MELT = 120;
/** Couleur de chaque liquide (celle du jet de la machine qui le donne). */
const LIQUID_COLOR = new Map([...ITEM_BY_ID.values()].flatMap((d) => (d.pour ? [[d.pour.liquid, d.pour.color] as const] : [])));
const liquidColor = (liquid: string): THREE.ColorRepresentation => LIQUID_COLOR.get(liquid) ?? 0x9fcde6;
/** Contenance d'un récipient (litres). */
const volumeOf = (item: WorldItem) => item.def.tank ?? item.def.volume ?? 0.25;
const WASH_FACE = { seconds: 3 * SPLASH_CYCLE, hygiene: 40 };
/** Vaisselle : temps à frotter sous l'eau par pièce (s). */
const DISH_SECONDS = 2.5;

/** Un repas assis à table, dans l'assiette, rassasie un peu plus que debout, l'aliment à la main. */
const TABLE_MEAL = 1.25;
/** Assis, distance (m, au sol) jusqu'où une assiette est à portée de fourchette. */
const TABLE_REACH = 1.1;

/**
 * Objets posés au départ dans la cuisine, hors des meubles rangés contre les murs (voir les
 * fiches des pièces, rooms.ts) : [id, x, y, z, rotation (rad)].
 */
const START_ITEMS: Array<[string, number, number, number, number]> = [
  // coin repas, côté caméra : la table, sa chaise au fond (on s'y assoit face à la caméra)
  ['table', 1, 0, 1, 0],
  ['chaise', 1, 0, -0.02, 0],
  // le couvert devant la chaise : l'assiette, la fourchette à gauche et le couteau à droite de qui
  // s'assoit (assez écartés de l'assiette pour ne pas partir avec elle quand on la prend)
  ['assiette', 1, TABLE_H, 0.88, 0],
  ['fourchette', 1.22, TABLE_H, 0.786, -Math.PI / 2],
  ['couteau-table', 0.78, TABLE_H, 0.786, -Math.PI / 2],
  ['tasse', 0.64, TABLE_H, 0.852, -0.19],
  ['lettre', 1.36, TABLE_H, 0.852, 0.26],
  // le plateau, de l'autre côté de la table
  ['plateau', 1, TABLE_H, 1.13, 0],
  // la carafe d'eau, au bout de la table
  ['carafe', 1.36, TABLE_H, 1.13, -Math.PI / 2],
  // la caisse rangée dans le coin, près de la fenêtre
  ['caisse', 2.85, 0, 2.45, 0],
];

/** Ustensiles posés au départ sur un feu : [id, appareil, n° du feu]. */
const START_ON_STOVE: Array<[string, string, number]> = [
  ['poele', 'gaziniere', 0],
  ['casserole', 'gaziniere', 3],
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
  // l'éponge, près de l'évier
  ['eponge', -0.42, 0.1, 0.2],
];

/** Rangés au départ dans un meuble : [id, meuble, place]. */
const START_STORED: Array<[string, string, number]> = [
  // les pulls pliés dans l'armoire de la chambre
  ['pull', 'armoire', 0],
  ['pull-bleu', 'armoire', 1],
  ['pull-vert', 'armoire', 4],
  ['bouteille-eau', 'frigo', 8],
  ['bouteille-eau', 'frigo', 9],
  ['pomme', 'frigo', 5],
  ['pomme', 'frigo', 6],
  ['sandwich', 'frigo', 1],
  ['steak', 'frigo', 0],
  ['steak', 'frigo', 3],
  ['pomme-de-terre', 'frigo', 10],
  ['pomme-de-terre', 'frigo', 11],
  ['tomate', 'frigo', 2],
  ['carotte', 'frigo', 4],
  ['concombre', 'frigo', 7],
  ['bac-glacons', 'congelateur', 0],
  ['lasagne', 'congelateur', 1],
  ['lasagne', 'congelateur', 3],
  // sous l'évier, en vrai ; ici au placard
  ['pastilles', 'placard', 2],
  // deux assiettes de plus, pour recevoir (et empiler)
  ['assiette', 'placard', 0],
  ['assiette', 'placard', 1],
  // verres et bols au fond du placard, cuillères au tiroir
  ['verre', 'placard', 6],
  ['verre', 'placard', 7],
  ['bol', 'placard', 8],
  ['bol', 'placard', 9],
  ['cuillere', 'tiroir', 4],
  ['cuillere', 'tiroir', 5],
  // un verre et une cuillère qui sèchent déjà sur l'égouttoir
  ['verre', 'egouttoir', 0],
  ['cuillere', 'egouttoir', 4],
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
/** Chaise et table : écart entre la chaise et le bord de la table, rangée dessous ou tirée (m), et profondeur de l'assise. */
const CHAIR_TUCKED = 0.08;
const CHAIR_PULLED = 0.74;
const SEAT_DEPTH = 0.4;
/** Vitesse de la chaise tirée sans la saisir (m/s). */
const CHAIR_SLIDE = 0.6;
/** Distance (px) à partir de laquelle un clic enfoncé devient un glisser-déposer. */
const DRAG_START = 10;
/** Pastilles dans une boîte neuve (lave-vaisselle). */
const TABLETS = 12;
/** Usure de l'évier (le robinet) à chaque fois qu'on fait couler l'eau. */
const WEAR_TAP = 0.4;
/** Usure d'un appareil (bouton du feu, de la machine) à chaque allumage, et de l'ustensile à chaque plat cuit. */
const WEAR_KNOB = 0.3;
const WEAR_COOK = 0.5;
/** Eau de la casserole qui bout : secondes pour qu'une casserole pleine s'évapore. */
const BOIL_AWAY = 70;
/** Écart (m) entre un ustensile et le feu pour qu'il soit dessus. */
const ON_SPOT = 0.07;
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
/** Usure de la fourchette à chaque bouchée, et de la vaisselle à chaque lavage. */
const WEAR_FORK = 0.2;
const WEAR_DISHWASH = 0.3;
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
  ['livre-ocre', [1.04, TABLE_H, 1.25, 1.42]],
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
   * micro-ondes, lave-vaisselle), poubelle, machine (à café), évier (eau, se laver, vaisselle),
   * gazinière, ustensile (poêle, casserole), récipient (tasse, bouteille), nourriture, siège
   * (chaise), planche (à découper), couteau (de cuisine) ou vaisselle (assiette, fourchette,
   * couteau de table).
   */
  sorte?: 'rangement' | 'frigo' | 'placard' | 'appareil' | 'poubelle' | 'machine' | 'évier' | 'gazinière' | 'ustensile' | 'récipient' | 'nourriture' | 'siège' | 'planche' | 'couteau' | 'vaisselle' | 'lit' | 'lampe' | 'égouttoir';
  /** Ingrédient : cru, cuit ou brûlé. */
  cuisson?: 'cru' | 'cuit' | 'brûlé';
  /** Aliment entier qui se coupe en morceaux sur la planche (pomme, pain, légumes). */
  coupable?: boolean;
  ou: string;
  /** Grade d'usure et durabilité restante (« usé (52 %) »). */
  etat: string;
  distance: number;
}

/** Programme d'un appareil qu'on met en marche (four, micro-ondes, grille-pain, lave-vaisselle, mixeur), ou undefined. */
const program = (def: ItemDef) => def.heats ?? def.washes ?? def.blends;

/** Noms féminins (accord des messages). */
const FEMININE = new Set(['tasse', 'lettre', 'caisse', 'chaise', 'table', 'bibliothèque', 'machine à café', "bouteille d'eau", 'pomme', 'poubelle', 'planche à découper', 'carotte', 'tomate', 'rondelles de carotte', 'tranches de tomate', 'tranches de pain', 'rondelles de concombre', 'gazinière', 'poêle', 'casserole', 'pomme de terre', 'assiette', 'fourchette', 'bouilloire', 'lasagne', 'boîte de pastilles', 'éponge', 'cuillère', 'carafe', ...DISH_FEMININE]);
/** Noms au pluriel (les morceaux d'un aliment coupé). */
const PLURAL = new Set(['quartiers de pomme', 'tranches de pain', 'rondelles de carotte', 'tranches de tomate', 'rondelles de concombre']);
/** Accord d'un adjectif avec le nom (« coupée », « finis ») et article (« La pomme », « Les quartiers »). */
/** Pronom de l'objet : « lave-la », « lave-le », « lave-les ». */
const it = (name: string) => (PLURAL.has(name) ? 'les' : FEMININE.has(name) ? 'la' : 'le');
/** Assiette plate (pas le bol) : elles s'empilent. */
const flat = (i: WorldItem) => !!i.def.plate && !i.def.deep;
const agree = (name: string) => `${FEMININE.has(name) ? 'e' : ''}${PLURAL.has(name) ? 's' : ''}`;
/** « cuit », « congelée » (un plat surgelé pas encore réchauffé : ItemDef.rawWord). */
const doneWord = (item: WorldItem, d: Doneness) => (d === 'cru' && item.def.rawWord ? `${item.def.rawWord}${FEMININE.has(item.name) ? 'e' : ''}` : donenessWord(d, FEMININE.has(item.name)));
const theName = (name: string) => `${PLURAL.has(name) ? 'Les' : FEMININE.has(name) ? 'La' : 'Le'} ${name}`;
/** « le steak », « la poêle », « l’évier ». */
const the = (name: string) => (elides(name) ? `l’${name}` : FEMININE.has(name) ? `la ${name}` : `le ${name}`);
/** « au frigo », « à la table », « à l’évier », « aux quartiers de pomme ». */
const toThe = (name: string) => (PLURAL.has(name) ? `aux ${name}` : elides(name) ? `à l’${name}` : FEMININE.has(name) ? `à la ${name}` : `au ${name}`);

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

/** Un geste du menu au clic droit : son nom et ce qu'il lance (faux si rien ne se lance). */
export interface MenuEntry {
  label: string;
  run: () => boolean;
}

/** Menu au clic droit : où l'ouvrir (px, dans la vue), sur quoi, et les gestes possibles. */
export interface ContextMenu {
  x: number;
  y: number;
  title: string;
  entries: MenuEntry[];
}

/** Ce qu'on peut faire avec ce qu'on tient (boutons de l'interface). */
export interface HandActions {
  drink: boolean;
  /** Un aliment en main (pomme, sandwich), ou assis devant une assiette servie, la fourchette en main. */
  eat: boolean;
  /** Un aliment en main et une assiette libre où le servir. */
  serve: boolean;
  /** De la vaisselle sale en main (assiette, couverts, tasse). */
  dishes: boolean;
  /** Un aliment entier à couper en main (pomme, pain, légumes). */
  cut: boolean;
  /** De quoi préparer un plat : les ingrédients d'une recette sur la planche ou dans l'assiette, ou en main. */
  prepare: boolean;
  /** L'objet tenu (le dernier pris) peut être lancé. */
  throw: boolean;
  /** En train de déplacer un gros meuble. */
  moving: boolean;
  read: boolean;
  reading: boolean;
  /** Assis : on peut se lever. */
  seated: boolean;
  /** Couché dans le lit (endormi) : on peut se réveiller. */
  sleeping: boolean;
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
  /** Mains mouillées après les avoir lavées (1), sèches (0) : le torchon les sèche d'un coup. */
  private wetHands = 0;
  private ground: THREE.Mesh;
  /** La pièce : sol, murs (abaissés côté caméra), porte, fenêtres. */
  private rooms: Room[] = [];
  /** Pièce où est le perso (gardée dans les passages), null dehors. */
  private activeRoom: Room | null = null;
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
  private debris: Array<Debris | Spill> = [];
  /** Café en train de couler : la machine, la tasse posée dessous, le temps écoulé (s). */
  private brew: { machine: WorldItem; cup: WorldItem; t: number } | null = null;
  /**
   * Portes (frigo, placard, four…), tiroirs et couvercles : ouverture de 0 à 1, où elle va, quoi
   * faire une fois ouverte, et longueur d'une porte qui s'abaisse (m, 0 sinon).
   */
  private doors = new Map<WorldItem, { open: number; target: 0 | 1; then: (() => void) | null; reach: number; keep: boolean }>();
  /** Appareils en marche (four, micro-ondes, lave-vaisselle) : temps écoulé (s), cuisson de départ de ce qui est dedans. */
  private appliances = new Map<WorldItem, { t: number; start: Map<WorldItem, number> }>();
  /** Mixeur : tasses de jus prêtes dans le bol. */
  private blended = new Map<WorldItem, number>();
  /** Objets jetés dans chaque poubelle. */
  private binFill = new Map<WorldItem, number>();
  /** Part de chaque aliment tenu à l'image précédente : ce qui a été mangé depuis. */
  private lastBite = new Map<WorldItem, number>();
  /** En train de se laver à l'évier : temps écoulé, durée, hygiène rendue en tout. */
  private washing: { sink: WorldItem; t: number; seconds: number; hygiene: number; face: boolean; dishes?: WorldItem[]; thirst?: number } | null = null;
  /** Vaisselle lavée à reprendre en main, une pièce après l'autre (et d'où la prendre). */
  private pickQueue: Array<{ item: WorldItem; from: THREE.Vector3 }> = [];
  /** Appareils qui chauffent (gazinière, machine à café) : feux allumés, chaleur de chaque feu (0 à 1), temps allumé sans servir (s). */
  private heaters = new Map<WorldItem, { on: boolean[]; warm: number[]; unused: number }>();
  /** Fumée (ça brûle) et vapeur (l'eau bout) au-dessus des ustensiles. */
  private puffs = new Puffs();
  /**
   * Liquide versé du récipient tenu `from` : dans `into` (autre récipient, réservoir de la
   * bouilloire), ou dans l'évier `sink` (vider). Le filet tombe de `from` vers `at()`.
   */
  private pouring: { from: WorldItem; into: WorldItem | null; sink: WorldItem | null; at: () => THREE.Vector3; liquid: string } | null = null;
  /** Le filet de liquide qu'on verse (caché sinon). */
  private stream: THREE.Mesh;
  /** Évier : bouchon mis, robinet ouvert, eau dans la cuve (0 à 1), temps avant la prochaine flaque (s). */
  private sinks = new Map<WorldItem, { plug: boolean; tap: boolean; water: number; spill: number; warned: boolean }>();
  /** Télés du salon : allumées ou non, chaîne, écran et lueur (tv.ts). */
  private tvs = new Map<WorldItem, Tv>();
  /** Glaçons dans un récipient : les cubes (enfants de son modèle) et le temps avant qu'ils fondent (s). */
  private iced = new Map<WorldItem, { cubes: THREE.Mesh[]; t: number; fresh: boolean }>();
  /** Plats coupés en bouchées dans l'assiette (cutInPlate) : chaque bouchée compte double. */
  private cutUp = new WeakSet<WorldItem>();
  /** Pastilles qui restent dans chaque boîte ; lave-vaisselle où l'on en a mis une (consommée au lavage). */
  private tablets = new Map<WorldItem, number>();
  private tabletIn = new Set<WorldItem>();
  /** Miettes laissées sur une table après un repas (à essuyer avec l'éponge). */
  private crumbs = new Map<WorldItem, THREE.Group>();
  /** Une chaise glisse (tirée sans la saisir) : pas encore fini. */
  private sliding = false;
  /** Fenêtre « ce qu'il y a dedans » ouverte sur un meuble (null : la fermer). */
  onInventory: ((ref: string | null) => void) | null = null;
  /** Ingrédient dont on attend la cuisson (ordre « cuire »). */
  private cookWait: WorldItem | null = null;
  /** Objet tenu qui change (nom ou null) : pour l'interface. */
  onHeldChange: ((name: string | null, can: HandActions) => void) | null = null;
  /** Objet sous la souris (nom, grade, durabilité de 0 à 1, position à l'écran), ou null. */
  onHover: ((info: { name: string; grade: string; condition: number; state: string; x: number; y: number } | null) => void) | null = null;
  /** Menu au clic droit à ouvrir (null : le fermer). */
  onMenu: ((menu: ContextMenu | null) => void) | null = null;
  /** Glisser-déposer en cours : l'objet traîné et la cible sous la souris (null : fini). */
  onDrag: ((drag: { name: string; over: string | null; x: number; y: number } | null) => void) | null = null;
  /** Clic gauche enfoncé sur un objet : un glisser s'il bouge assez avant d'être relâché. */
  private press: { hit: NonNullable<ReturnType<Game['hitAt']>>; x: number; y: number; shift: boolean; dragging: boolean } | null = null;
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
    for (const [id, x, y, z, rot] of [...START_ITEMS, ...ROOMS.flatMap((r) => r.items ?? [])]) {
      const item = add(id);
      item.object.position.set(x, y, z);
      item.object.rotation.y = rot;
      // couverts couchés à plat
      if (item.def.layFlat) {
        item.object.quaternion.multiply(LAY_FLAT);
        item.object.position.y += item.restLift(item.object.quaternion);
      }
    }
    // les meubles rangés contre les murs, et ce qui est posé dessus (micro-ondes sur le placard)
    for (const spec of ROOMS) {
      const runItems = spec.runs.flatMap((r) => r.items.filter((id): id is string => typeof id === 'string').map(add));
      const placed = new Set<WorldItem>();
      placeRuns(spec, (id) => {
        const it = runItems.find((i) => i.def.id === id && !placed.has(i));
        if (it) placed.add(it);
        return it;
      });
    }
    for (const [id, under, x = 0, z = 0, rot = 0] of ROOMS.flatMap((r) => r.onTop ?? [])) {
      const base = this.items.find((i) => i.def.id === under);
      if (!base) continue;
      const it = add(id);
      // décalé de (x, z) sur le dessus, dans le repère du meuble dessous
      base.object.updateMatrixWorld(true);
      it.object.position.copy(new THREE.Vector3(x, base.box.max.y, z).applyMatrix4(base.object.matrixWorld));
      it.object.rotation.y = base.object.rotation.y + rot;
    }
    for (const spec of ROOMS) {
      const room = new Room(spec, (id) => this.items.find((i) => i.def.id === id)?.object.position);
      this.rooms.push(room);
      this.scene.add(room.group);
    }
    // les meubles (objets non portables) et les murs se contournent
    this.character.nav = this.buildNav();
    for (const item of this.items) if (item.def.door || item.def.drawer) this.doors.set(item, { open: 0, target: 0, then: null, reach: this.doorReach(item), keep: false });
    for (const item of this.items) if (item.def.lamp) this.addLampLight(item);
    for (const item of this.items) if (item.def.wash) this.sinks.set(item, { plug: false, tap: false, water: 0, spill: 0, warned: false });
    for (const item of this.items) {
      if (!item.def.screen) continue;
      const tv = new Tv(item);
      this.tvs.set(item, tv);
      this.scene.add(tv.light);
    }
    // la carafe d'eau, presque pleine
    for (const item of this.items) {
      if (!item.def.jug) continue;
      item.setLevel(0.8);
      item.contents = 'eau';
      item.setLiquidColor(liquidColor('eau'));
    }
    // la bouilloire a de quoi faire deux tasses au départ
    for (const item of this.items) {
      if (!item.def.tank) continue;
      item.level = 0.5;
      item.contents = 'eau';
    }
    for (const item of this.items) {
      const n = item.def.heat?.spots.length ?? 0;
      if (n) this.heaters.set(item, { on: Array(n).fill(false), warm: Array(n).fill(0), unused: 0 });
    }
    for (const [id, stove, i] of START_ON_STOVE) {
      const where = this.items.find((it) => it.def.id === stove);
      if (!where) continue;
      const it = add(id);
      it.object.position.copy(this.spotWorld(where, i));
      it.object.rotation.y = where.object.rotation.y;
    }
    for (const [id, holder, i] of START_STORED) {
      const where = this.items.find((it) => it.def.id === holder);
      if (!where) continue;
      const it = add(id);
      const slot = this.slot(where, i);
      it.object.position.copy(slot.pos);
      it.object.quaternion.copy(slot.rot);
      if (id === 'pastilles') this.tablets.set(it, TABLETS);
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
    this.scene.add(this.puffs.group);
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 1, 8), new THREE.MeshBasicMaterial({ color: 0x9fcde6, transparent: true, opacity: 0.85 }));
    this.stream.visible = false;
    this.scene.add(this.stream);

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
    // endormi, c'est fini : on ne bouge plus jusqu'au réveil
    if (this.sleep) return this.sleep.phase === 'asleep';
    return this.character.idle && !this.sliding && !this.brew && !this.washing && !this.cookWait && !this.appliances.size && !this.pickQueue.length && !this.flying.length && ![...this.doors.values()].some((d) => d.then || d.open !== d.target);
  }

  /** Les obstacles à contourner, sauf `skip`. */
  private buildNav(skip?: WorldItem): Nav {
    const nav = new Nav();
    for (const o of this.rooms.flatMap((r) => r.obstacles)) nav.add(o.box, o.pos, o.yaw, o.wall);
    for (const it of this.items) if (it !== skip && this.isObstacle(it)) nav.add(it.box, it.object.position, it.object.rotation.y);
    return nav;
  }

  /** Le rectangle au sol d'un meuble déplacé entre-t-il dans un mur ? */
  private hitsWall(rect: ReturnType<typeof footprint>): boolean {
    return this.rooms.flatMap((r) => r.obstacles).some((w) => overlaps(rect, footprint(w.box, w.pos, w.yaw)));
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
      const blocked = this.hitsWall(rect) || this.items.some((it) => it !== item && (!it.def.portable || isTwoHanded(it.grip)) && !riders.some((r) => r.item === it)
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
      const blocked = this.hitsWall(rect) || this.items.some((it) => it !== item && (!it.def.portable || isTwoHanded(it.grip)) && !riders.some((r) => r.item === it)
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
        for (const r of this.rooms) r.bounce(prev, o.position, f.vel);
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
    this.heaters.delete(item);
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

  private addDebris(d: Debris | Spill): void {
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
      const pan = item.def.cook && !carried.includes(item) ? this.panOf(item) : undefined;
      const rider = this.riders.find((r) => r.item === item);
      if (carried.includes(item)) ou = 'en main';
      else if (rider) ou = `porté sur ${this.ref(rider.base)}`;
      else if (shelf) ou = `rangé dans ${this.ref(shelf.shelf)}`;
      else if (pan) ou = `dans ${this.ref(pan)}`;
      else if (item.object.position.y > 0.05) {
        // le plus haut de ceux du dessous : le sandwich est sur l'assiette, pas sur la table
        const under = this.items
          .filter((o) => o !== item && !carried.includes(o) && !this.shelfOf(o) && o.object.position.y < item.object.position.y && this.isAbove(item, o))
          .sort((a, b) => b.object.position.y - a.object.position.y)[0];
        ou = under ? `posé sur ${this.ref(under)}` : 'posé en hauteur';
      }
      if (item === this.brew?.cup) ou += ` (${theLiquid(this.brew.machine.def.pour!.liquid)} coule dedans)`;
      const door = this.doors.get(item);
      if (door) {
        const part = item.def.drawer ? 'tiroir' : item.def.bin ? 'couvercle' : 'porte';
        ou += `, ${part} ${door.target ? 'ouvert' : 'fermé'}${part === 'porte' ? 'e' : ''}`;
      }
      if (this.appliances.has(item)) ou += ', en marche';
      const tv = this.tvs.get(item);
      if (tv) ou += tv.on ? `, allumée (${CHANNELS[tv.channel]})` : ', éteinte';
      if (this.crumbs.has(item)) ou += ', des miettes (à essuyer)';
      if (item.def.seat && this.tucked(item)) ou += ', rangée sous la table';
      if (item.def.blends) {
        const n = this.blended.get(item) ?? 0;
        ou += n ? `, ${item.def.pour!.liquid} prêt (${n} tasse${n > 1 ? 's' : ''})` : this.storedIn(item).length ? '' : ', vide';
      }
      if (item.def.washes) ou += this.tabletIn.has(item) ? ', pastille mise' : ', sans pastille';
      if (this.tablets.has(item)) ou += `, ${this.tablets.get(item)} pastille${this.tablets.get(item)! > 1 ? 's' : ''}`;
      if (item.def.bin) {
        const n = this.binFill.get(item) ?? 0;
        ou += n >= item.def.bin ? ', pleine' : n ? `, ${n} objet${n > 1 ? 's' : ''} jeté${n > 1 ? 's' : ''}` : ', vide';
      }
      if (item.def.food && item.portion < 1) ou += `, entamé${agree(item.name)}`;
      if (item.def.tank) {
        const cups = Math.floor((item.level * item.def.tank) / SERVING + 0.2);
        ou += cups ? `, assez d’eau pour ${cups} tasse${cups > 1 ? 's' : ''}` : ', vide (verser de l’eau dedans)';
      } else if (item.contents) ou += `, contient ${someLiquid(item.contents)}`;
      else if (item.def.startFull || (item.def.cookware && !this.inPan(item).length)) ou += ', vide';
      const heat = this.heaters.get(item);
      if (heat) {
        const fem = FEMININE.has(item.name);
        const lit = heat.on.filter(Boolean).length;
        if (heat.on.length > 1) ou += lit ? `, ${lit} feu${lit > 1 ? 'x' : ''} allumé${lit > 1 ? 's' : ''}` : ', feux éteints';
        else ou += lit ? (heat.warm[0] < 1 ? `, allumé${fem ? 'e' : ''} (chauffe)` : `, allumé${fem ? 'e' : ''}`) : `, éteint${fem ? 'e' : ''}`;
      }
      const stove = item.def.cookware ? this.stoveUnder(item) : null;
      if (stove) ou += this.heaters.get(stove.heater)!.on[stove.i] ? ', sur le feu allumé' : ', sur un feu éteint';
      const cuisson = doneness(item.def, item.cooking) ?? undefined;
      if (cuisson) ou += `, ${doneWord(item, cuisson)}`;
      if (item.dirty) ou += ', sale';
      if (item.wet > 0) ou += `, mouillé${agree(item.name)}`;
      const sink = this.sinks.get(item);
      if (sink?.tap) ou += ', robinet ouvert';
      if (sink?.plug) ou += sink.water > 0.98 ? ', bouché, la cuve déborde' : ', bouché';
      const sorte: WorldObject['sorte'] = item.def.bed ? 'lit' : item.def.lamp ? 'lampe' : item.def.bin ? 'poubelle' : program(item.def) ? 'appareil' : item.def.cold ? 'frigo' : item.def.rack ? 'égouttoir'
        : item.def.door || item.def.drawer ? 'placard' : item.def.slots ? 'rangement' : item.def.wash ? 'évier' : item.def.pour ? 'machine' : item.def.heat ? 'gazinière' : item.def.cookware ? 'ustensile' : item.def.fill ? 'récipient' : item.def.food ? 'nourriture' : item.def.seat ? 'siège' : item.def.board ? 'planche' : item.def.knife ? 'couteau' : item.def.dish ? 'vaisselle' : undefined;
      if (item === this.sitting) ou += ', le perso est assis dessus';
      if (item === this.sleep?.bed) ou += ', le perso dort dedans';
      const lamp = this.lamps.get(item);
      if (lamp) ou += lamp.on ? ', allumée' : ', éteinte';
      if (item === reading?.held) ou += ', ouvert (le perso le lit)';
      const etat = `${gradeName(item.condition, FEMININE.has(item.name))} (${Math.round(item.condition * 100)} %)`;
      const coupable = (!!item.def.cut && item.portion === 1) || undefined;
      return { ref: this.ref(item), nom: item.name, portable: item.def.portable, deuxMains: isTwoHanded(item.grip) || undefined, sorte, cuisson, coupable, ou, etat, distance: Math.round(item.object.position.distanceTo(p) * 10) / 10 };
    });
    const perso = this.character.canCarry ? 'peut porter des objets' : 'ne peut pas porter d’objets (perso par défaut)';
    return {
      perso: this.sleep ? `${perso}, endormi dans ${this.ref(this.sleep.bed)}` : this.sitting ? `${perso}, assis sur ${this.ref(this.sitting)}` : perso,
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

  /**
   * Allume (`on`) ou éteint la télé `item` ; sans `on`, inverse. Assis, le perso a la télécommande ;
   * debout, il va devant la télé.
   */
  private setTv(item: WorldItem, on: boolean | undefined, running: boolean): boolean {
    const tv = this.tvs.get(item)!;
    if (this.moving) {
      this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
      return false;
    }
    const want = on ?? !tv.on;
    const done = () => {
      tv.set(want);
      this.onNotice?.(want ? `Télé allumée : ${CHANNELS[tv.channel]}.` : 'Télé éteinte.');
    };
    if (this.sitting) done();
    else this.character.approachThen(this.standBefore(item, 0.45), item.object.position, done, running);
    return true;
  }

  /** Chaîne suivante (à la télécommande si le perso est assis). */
  private zapTv(item: WorldItem, running: boolean): boolean {
    const tv = this.tvs.get(item)!;
    if (!tv.on) return this.setTv(item, true, running);
    const done = () => {
      tv.zap();
      this.onNotice?.(`Chaîne : ${CHANNELS[tv.channel]}.`);
    };
    if (this.sitting) done();
    else this.character.approachThen(this.standBefore(item, 0.45), item.object.position, done, running);
    return true;
  }

  /** La pièce où est le perso ; dehors, celle dont l'interrupteur est le plus proche. */
  private hereRoom(): Room {
    const p = this.character.position;
    return this.rooms.find((r) => r.contains(p))
      ?? [...this.rooms].sort((a, b) => a.switchSpot().stand.distanceTo(p) - b.switchSpot().stand.distanceTo(p))[0];
  }

  /**
   * Va à l'interrupteur de la pièce `room` (celle où est le perso, sans `room`) et allume (`on`)
   * ou éteint ses lampes ; sans `on`, inverse.
   */
  switchLights(on?: boolean, running = false, room = this.hereRoom()): boolean {
    if (this.moving) {
      this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
      return false;
    }
    const want = on ?? !room.lightsOn;
    const { stand, face } = room.switchSpot();
    this.character.approachThen(stand, face, () => {
      room.setLights(want);
      this.onNotice?.(want ? `Lumière allumée (${room.spec.name}).` : `Lumière éteinte (${room.spec.name}).`);
    }, running);
    return true;
  }

  /** L'interrupteur sous ce pixel (avant tout objet), et sa pièce. */
  private switchAt(cx: number, cy: number): Room | null {
    this.aim(cx, cy);
    let best: { room: Room; d: number } | null = null;
    for (const room of this.rooms) {
      const d = room.switchHit(this.raycaster);
      if (d !== null && (!best || d < best.d)) best = { room, d };
    }
    if (!best) return null;
    const carried = this.character.carried;
    const item = this.raycaster.intersectObjects(this.items.filter((i) => !carried.includes(i)).map((i) => i.object), true)[0];
    return !item || item.distance > best.d ? best.room : null;
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

  /** Lampes qu'on allume d'un clic (lampe de chevet) : leur lumière, allumée ou non. */
  private lamps = new Map<WorldItem, { light: THREE.PointLight; on: boolean; bulb: THREE.MeshBasicMaterial | null; shade: THREE.MeshBasicMaterial | null }>();

  /** Lumière d'une lampe (fiche `lamp`), éteinte au départ, qui suit la lampe si on la déplace. */
  private addLampLight(item: WorldItem): void {
    const def = item.def.lamp!;
    const light = lightAllPasses(new THREE.PointLight(def.color, 0, def.range, 2));
    light.position.y = def.y;
    light.castShadow = false;
    light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = def.range;
    light.shadow.bias = -0.003;
    light.shadow.autoUpdate = false;
    item.object.add(light);
    const part = (name: string) => {
      const m = item.object.getObjectByName(name);
      return m instanceof THREE.Mesh && m.material instanceof THREE.MeshBasicMaterial ? m.material : null;
    };
    this.lamps.set(item, { light, on: false, bulb: part('ampoule'), shade: part('abat-jour') });
  }

  private setLamp(item: WorldItem, on: boolean): void {
    const lamp = this.lamps.get(item);
    if (!lamp) return;
    lamp.on = on;
    lamp.light.intensity = on ? item.def.lamp!.intensity : 0;
    // ombres seulement allumée : une ombre de plus prend une texture à tous les matériaux
    lamp.light.castShadow = on;
    lamp.light.shadow.autoUpdate = on;
    lamp.light.shadow.needsUpdate = on;
    // ampoule allumée au-dessus de 1 : le bloom la fait briller ; abat-jour éclairé par-dessous
    lamp.bulb?.color.setRGB(on ? 2.6 : 0.23, on ? 2.1 : 0.2, on ? 1.3 : 0.17);
    lamp.shade?.color.set(on ? 0xfff3d6 : 0xe9dcc0);
  }

  /** Va allumer (`on`) ou éteindre la lampe `ref` (sinon la plus proche) ; sans `on`, inverse. */
  switchLamp(ref?: string, on?: boolean, running = false): boolean {
    const item = ref ? this.byRef(ref) : this.nearest((i) => this.lamps.has(i));
    const lamp = item && this.lamps.get(item);
    if (!item || !lamp) {
      this.onNotice?.(ref ? `${ref} ne s’allume pas.` : 'Pas de lampe à allumer.');
      return false;
    }
    if (this.sleep) return this.wakeUp(() => this.switchLamp(this.ref(item), on, running));
    const want = on ?? !lamp.on;
    const c = this.character;
    if (c.seated) return c.standUp(() => this.switchLamp(this.ref(item), want, running));
    // tenue en main : on appuie sur l'interrupteur sans bouger
    const press = () => {
      this.setLamp(item, want);
      this.onNotice?.(want ? 'Lampe allumée.' : 'Lampe éteinte.');
    };
    if (c.carried.includes(item)) press();
    else c.approachThen(c.standFor(item), item.object.position, press, running);
    return true;
  }

  /**
   * Sommeil en cours : le lit, la phase (fondu vers le noir, endormi, fondu au réveil), le temps
   * passé dans la phase, la vitesse de l'horloge à rendre au réveil, et quoi faire une fois levé.
   */
  private sleep: { bed: WorldItem; phase: 'down' | 'asleep' | 'up'; t: number; speed: number; then?: () => void } | null = null;
  /** Voile noir devant la scène : s'endormir et se réveiller passent par le noir. */
  private veil: HTMLDivElement | null = null;

  /**
   * Va se coucher dans le lit `ref` (sinon le plus proche) et dort : l'écran passe au noir, le perso
   * est couché sous la couette, le temps file et la fatigue remonte. Il se réveille seul une fois
   * reposé, ou quand on le demande (C, clic, touches de déplacement).
   */
  sleepIn(ref?: string, running = false): boolean {
    const bed = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.bed);
    const c = this.character;
    const fail = (msg: string) => {
      this.onNotice?.(msg);
      return false;
    };
    if (!bed?.def.bed) return fail(ref ? `On ne dort pas dans : ${ref}.` : 'Il n’y a pas de lit.');
    if (this.sleep) return fail('Le perso dort déjà.');
    if (this.moving) return fail(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    if (c.carried.length) return fail('Pose d’abord ce que tu tiens pour te coucher.');
    if (this.needs.values.fatigue >= NOT_SLEEPY) return fail('Le perso n’a pas sommeil (fatigue presque pleine).');
    if (c.seated) return c.standUp(() => this.sleepIn(this.ref(bed), running));
    const side = this.bedSide(bed);
    if (!side) return fail('Pas de place à côté du lit pour s’y coucher.');
    c.approachThen(side.stand, side.feet.clone().setY(0), () => {
      this.sleep = { bed, phase: 'down', t: 0, speed: this.clock.speed };
    }, running);
    return true;
  }

  /** Se réveille et sort du lit (puis `then`) ; faux si le perso ne dort pas. */
  wakeUp(then?: () => void): boolean {
    const s = this.sleep;
    if (!s) return false;
    if (then) s.then = then;
    if (s.phase === 'asleep') {
      s.phase = 'up';
      s.t = 0;
    }
    return true;
  }

  /**
   * Où se coucher dans le lit : le côté libre (droite ou gauche du lit, vu du pied), où se tenir à
   * côté, les pieds du dormeur sur le matelas et la direction de l'oreiller.
   */
  private bedSide(bed: WorldItem): { stand: THREE.Vector3; feet: THREE.Vector3; head: THREE.Vector3 } | null {
    const o = bed.object;
    o.updateMatrixWorld(true);
    const def = bed.def.bed!;
    const b = bed.box;
    const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
    const head = new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion).setY(0).normalize();
    // de préférence du côté de la lampe de chevet
    const lamp = [...this.lamps.keys()].sort((a, c) => a.object.position.distanceTo(o.position) - c.object.position.distanceTo(o.position))[0];
    const lampX = lamp ? o.worldToLocal(lamp.object.position.clone()).x : 1;
    for (const sx of lampX < 0 ? [-1, 1] : [1, -1]) {
      const edge = sx > 0 ? b.max.x : b.min.x;
      const stand = toWorld(edge + sx * 0.38, 0, 0.1).setY(0);
      if (this.character.nav?.blocked(stand)) continue;
      // couché de son côté du lit, la tête sur l'oreiller (le haut du crâne à 25 cm de la tête de lit)
      const feet = toWorld(sx * (b.max.x - b.min.x) * 0.22, def.top + 0.08, b.min.z + 0.25 + 1.62);
      return { stand, feet, head };
    }
    return null;
  }

  /** Fondu au noir, coucher, nuit qui file, réveil. */
  private tickSleep(dt: number): void {
    const s = this.sleep;
    if (!this.veil) {
      const v = this.veil = document.createElement('div');
      v.style.cssText = 'position:absolute;inset:0;background:#05070d;opacity:0;pointer-events:none;z-index:1';
      this.container.appendChild(v);
    }
    if (!s) {
      this.veil.style.opacity = '0';
      return;
    }
    s.t += dt;
    const c = this.character;
    const night = (on: boolean) => {
      const duvet = s.bed.object.getObjectByName('couette');
      const cover = s.bed.object.getObjectByName('couette-dormeur');
      if (duvet) duvet.visible = !on;
      if (cover) cover.visible = on;
    };
    if (s.phase === 'down') {
      // une envie de bouger avant d'être couché : on renonce
      if (c.wantsToMove) {
        this.sleep = null;
        return;
      }
      this.veil.style.opacity = String(Math.min(1, s.t / SLEEP_FADE));
      if (s.t < SLEEP_FADE) return;
      const side = this.bedSide(s.bed);
      if (!side || !c.lieDown(side.feet, side.head, side.stand)) {
        this.sleep = null;
        this.onNotice?.('Impossible de se coucher ici.');
        return;
      }
      night(true);
      // on éteint la lampe de chevet en se couchant
      for (const [item, lamp] of this.lamps) if (lamp.on && item.object.position.distanceTo(s.bed.object.position) < 2.5) this.setLamp(item, false);
      this.clock.speed = SLEEP_SPEED;
      s.phase = 'asleep';
      s.t = 0;
      this.onNotice?.('Zzz… (C pour se réveiller)');
    } else if (s.phase === 'asleep') {
      // le noir s'éclaircit un peu : on voit le perso dormir
      this.veil.style.opacity = String(Math.max(SLEEP_DIM, 1 - s.t / SLEEP_FADE));
      const rested = this.needs.values.fatigue >= 100;
      if (rested || c.wantsToMove) {
        s.phase = 'up';
        s.t = 0;
        if (rested) this.onNotice?.(`Bien reposé : réveillé à ${this.clock.label}.`);
      }
    } else {
      this.clock.speed = s.speed;
      const k = Math.min(1, s.t / SLEEP_FADE);
      if (c.lying) {
        this.veil.style.opacity = String(Math.max(SLEEP_DIM, k));
        if (k < 1) return;
        c.getUp();
        night(false);
        s.t = 0;
        return;
      }
      this.veil.style.opacity = String(1 - k);
      if (k < 1) return;
      this.sleep = null;
      s.then?.();
    }
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
    // rangée sous la table : on la tire d'abord
    if (this.tucked(seat)) return this.slideChair(this.ref(seat), false, running, () => this.sit(this.ref(seat), running));
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
    // on ne boit pas dans la casserole
    const containers = c.heldItems.filter((i) => i.def.fill && !i.def.cookware && !i.def.jug);
    const cup = containers.find((i) => i.contents) ?? containers[0];
    const jug = c.heldItems.find((i) => i.def.jug);
    if (!cup) this.onNotice?.(jug ? `On ne boit pas à ${the(jug.name)} : verse-${it(jug.name)} dans un verre.` : 'Prends une tasse ou une bouteille pour boire.');
    else if (!cup.contents) this.onNotice?.(`${FEMININE.has(cup.name) ? 'La' : 'Le'} ${cup.name} est vide.`);
    else if (this.closeBookThen(() => this.drink())) return true;
    else {
      const ice = this.iced.get(cup);
      if (ice?.fresh) {
        ice.fresh = false;
        this.needs.restore('soif', 5);
        this.onNotice?.('Bien frais, avec les glaçons !');
      }
      return !!c.handOf(cup)?.drink();
    }
    return false;
  }

  /**
   * Prend une bouchée de l'aliment tenu (pomme, sandwich) ; une fois fini, il disparaît. Sans
   * aliment en main, assis à table : une bouchée de l'assiette servie, à la fourchette.
   */
  eat(): boolean {
    const c = this.character;
    const food = c.heldItems.find((i) => i.def.food);
    const fem = !!food && FEMININE.has(food.name);
    if (!food) return this.eatFromPlate();
    if (doneness(food.def, food.cooking) === 'cru') this.onNotice?.(food.def.rawWord ? `${cap(the(food.name))} est ${doneWord(food, 'cru')} : réchauffe-${fem ? 'la' : 'le'} d’abord (micro-ondes ou four).` : `${cap(the(food.name))} est cru${fem ? 'e' : ''} : fais-${fem ? 'la' : 'le'} cuire d’abord (poêle ou casserole sur la gazinière).`);
    else if (this.closeBookThen(() => this.eat())) return true;
    else return !!c.handOf(food)?.eat();
    return false;
  }

  /** Aliment servi dans l'assiette (ou null). */
  private foodOn(plate: WorldItem): WorldItem | null {
    return this.itemsOn(plate).find((i) => i.def.food) ?? null;
  }

  /** Assis : l'assiette servie la plus proche, à portée de fourchette. */
  private tablePlate(): WorldItem | null {
    if (!this.sitting) return null;
    const p = p0(this.character.position);
    const carried = this.character.carried;
    return this.items
      .filter((i) => i.def.plate && !carried.includes(i) && p0(i.object.position).distanceTo(p) < TABLE_REACH && this.foodOn(i))
      .sort((a, b) => p0(a.object.position).distanceTo(p) - p0(b.object.position).distanceTo(p))[0] ?? null;
  }

  /**
   * Sert l'aliment tenu (pomme, sandwich) dans l'assiette `ref`, sinon dans la plus proche qui est
   * posée, propre et vide : le perso va jusqu'à elle et l'y pose.
   */
  serve(ref?: string, running = false): boolean {
    const c = this.character;
    const food = c.heldItems.find((i) => i.def.food);
    const plate = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.plate && !c.carried.includes(i) && !i.dirty && !this.foodOn(i));
    if (!food) this.onNotice?.('Prends de quoi manger (il y en a dans le frigo) pour le servir.');
    else if (!plate) this.onNotice?.(ref ? `Aucun objet « ${ref} ».` : 'Pas d’assiette propre et vide où servir.');
    else return this.serveOn(plate, food, running);
    return false;
  }

  private serveOn(plate: WorldItem, food: WorldItem, running: boolean): boolean {
    const c = this.character;
    const there = this.foodOn(plate);
    if (!plate.def.plate) this.onNotice?.(`On ne sert pas dans ${the(plate.name)}.`);
    else if (c.carried.includes(plate)) this.onNotice?.('Pose d’abord l’assiette (sur la table) pour y servir.');
    else if (plate.dirty) this.onNotice?.('L’assiette est sale : lave-la d’abord à l’évier.');
    else if (there) this.onNotice?.(`Il y a déjà ${FEMININE.has(there.name) ? 'une' : 'un'} ${there.name} dans l’assiette.`);
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing || c.washing) this.onNotice?.('Tu es à l’évier, un instant.');
    else if (c.busy) return false;
    else if (this.closeBookThen(() => this.serveOn(plate, food, running))) return true;
    // assis : on se lève d'abord, comme pour poser
    else if (c.seated) return c.standUp(() => this.serveOn(plate, food, running));
    else {
      c.approachThen(c.standFor(plate), plate.object.position, () => {
        // au fond de l'assiette, là où elle est à présent
        plate.object.updateMatrixWorld(true);
        const spot = new THREE.Vector3(0, plate.def.plate!, 0).applyMatrix4(plate.object.matrixWorld);
        c.drop(spot, undefined, () => this.onNotice?.(`${cap(the(food.name))} est servi${FEMININE.has(food.name) ? 'e' : ''} dans l’assiette.`), false, food);
      }, running);
      return true;
    }
    return false;
  }

  /**
   * Assis devant une assiette servie, la fourchette en main : une bouchée piquée dans l'assiette
   * monte à la bouche. Fourchette, assiette (et couteau tenu) se salissent.
   */
  private eatFromPlate(): boolean {
    const c = this.character;
    const plate = this.tablePlate();
    const fork = c.heldItems.find((i) => i.def.utensil);
    const hand = fork && c.handOf(fork);
    const food = plate && this.foodOn(plate);
    if (!this.sitting) this.onNotice?.('Prends quelque chose à manger (il y en a dans le frigo), ou assieds-toi devant une assiette servie.');
    else if (!plate || !food) this.onNotice?.('Pas d’assiette servie à portée : sers un plat dans l’assiette, devant ta chaise.');
    else if (!fork || !hand) this.onNotice?.('Prends une fourchette pour manger dans l’assiette.');
    else if (doneness(food.def, food.cooking) === 'cru') this.onNotice?.(`${cap(the(food.name))} est ${doneWord(food, 'cru')} : fais-${FEMININE.has(food.name) ? 'la' : 'le'} ${food.def.rawWord ? 'réchauffer' : 'cuire'} d’abord.`);
    else if (c.busy) return false;
    else {
      const morsel = fork.part('bouchee') as THREE.Mesh | undefined;
      const color = food.def.food!.color;
      if (morsel && color !== undefined) (morsel.material as THREE.MeshToonMaterial).color.set(color);
      const ok = hand.eat(undefined, () => {
        if (morsel) morsel.visible = false;
        this.biteFromPlate(plate, food, fork);
      });
      if (ok && morsel) morsel.visible = true;
      return ok;
    }
    return false;
  }

  /** La bouchée arrive à la bouche : l'aliment de l'assiette diminue, la faim remonte. */
  private biteFromPlate(plate: WorldItem, food: WorldItem, fork: WorldItem): void {
    if (!this.items.includes(food) || food.portion <= 0) return;
    const f = food.def.food!;
    const n = this.cutUp.has(food) ? 2 : 1;
    for (let i = 0; i < n; i++) food.bite();
    this.needs.restore('faim', ((f.hunger * n) / f.bites) * TABLE_MEAL);
    plate.setDirty(true);
    fork.setDirty(true);
    this.wearItem(fork, WEAR_FORK);
    // le couteau dans l'autre main a servi à couper
    for (const other of this.character.heldItems) if (other.def.dish && !other.def.utensil && !other.def.fill && !other.def.plate) other.setDirty(true);
    if (food.portion > 0) return;
    this.items = this.items.filter((i) => i !== food);
    this.lastBite.delete(food);
    food.object.removeFromParent();
    this.dropCrumbs(plate, f.color);
    const fem = FEMININE.has(food.name);
    this.onNotice?.(`${fem ? 'La' : 'Le'} ${food.name} est fini${fem ? 'e' : ''}. Miam ! Reste la vaisselle.`);
  }

  /**
   * Assis à table devant l'assiette `ref` (sinon la plus proche) : sur le siège le plus proche
   * d'elle.
   */
  sitAtTable(ref?: string, running = false): boolean {
    const carried = this.character.carried;
    const plate = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.plate && !carried.includes(i));
    if (!plate?.def.plate) {
      this.onNotice?.(ref ? `Pas d’assiette « ${ref} ».` : 'Pas d’assiette sur la table.');
      return false;
    }
    const at = plate.object.position;
    const seat = this.items.filter((i) => i.def.seat && !carried.includes(i)).sort((a, b) => a.object.position.distanceTo(at) - b.object.position.distanceTo(at))[0];
    if (!seat) {
      this.onNotice?.('Pas de chaise où s’asseoir.');
      return false;
    }
    return this.sit(this.ref(seat), running);
  }

  /**
   * Enchaîne des gestes : chacun démarre quand le précédent est fini (plus rien ne bouge quelques
   * images d'affilée) ; un geste qui échoue (false) arrête la suite.
   */
  private chain(steps: Array<() => boolean>, onEnd?: () => void): boolean {
    const [first, ...rest] = steps;
    if (!first) {
      onEnd?.();
      return true;
    }
    if (!first()) return false;
    // l'étape suivante attend que le geste ait commencé (ou un court délai), puis qu'il soit fini
    let calm = 0;
    let frames = 0;
    let moved = !this.idle;
    const next = () => {
      frames++;
      if (!this.idle) moved = true;
      calm = this.idle && (moved || frames > 20) ? calm + 1 : 0;
      if (calm < 3) requestAnimationFrame(next);
      else this.chain(rest, onEnd);
    };
    requestAnimationFrame(next);
    return true;
  }

  /** La table et la chaise d'où l'on y mange (la plus proche d'elle). */
  private dinnerTable(): { table: WorldItem; seat: WorldItem } | null {
    const table = this.nearest((i) => i.name === 'table' && !this.character.carried.includes(i));
    if (!table) return null;
    const at = table.object.position;
    const seat = this.items.filter((i) => i.def.seat && !this.character.carried.includes(i)).sort((a, b) => a.object.position.distanceTo(at) - b.object.position.distanceTo(at))[0];
    return seat ? { table, seat } : null;
  }

  /**
   * Les places du couvert devant la chaise, comme au départ : l'assiette au bord de la table, la
   * fourchette à gauche et le couteau à droite de qui s'assoit, couchés en travers.
   */
  private placeSetting(table: WorldItem, seat: WorldItem): Map<string, { pos: THREE.Vector3; yaw: number }> {
    const o = table.object;
    o.updateMatrixWorld(true);
    // le côté de la table vers la chaise, ramené au bord le plus proche
    const local = o.worldToLocal(seat.object.position.clone());
    const b = table.box;
    const alongX = Math.abs(local.x) / (b.max.x - b.min.x) > Math.abs(local.z) / (b.max.z - b.min.z);
    const f = alongX ? new THREE.Vector3(Math.sign(local.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(local.z) || -1);
    const edge = alongX ? (local.x > 0 ? b.max.x : -b.min.x) : local.z > 0 ? b.max.z : -b.min.z;
    const left = new THREE.Vector3(-f.z, 0, f.x);
    const top = b.max.y;
    const at = (inset: number, side: number) => o.localToWorld(f.clone().multiplyScalar(edge - inset).addScaledVector(left, side).setY(top));
    // tourné comme qui s'assoit (face à la table, donc vers -f)
    const facing = f.clone().negate().transformDirection(o.matrixWorld);
    const yaw = Math.atan2(facing.x, facing.z);
    return new Map([
      ['assiette', { pos: at(0.18, 0), yaw }],
      ['fourchette', { pos: at(0.086, 0.22), yaw: yaw - Math.PI / 2 }],
      ['couteau de table', { pos: at(0.086, -0.22), yaw: yaw - Math.PI / 2 }],
    ]);
  }

  /** Où se tenir pour poser quelque chose en `spot` (sur la table) : le côté libre le plus proche. */
  private standNear(spot: THREE.Vector3, size: number): THREE.Vector3 {
    const at = spot.clone().setY(0);
    const p = this.character.position;
    const nav = this.character.nav;
    let best: THREE.Vector3 | null = null;
    for (const r of [0.36 + size / 2, 0.5 + size / 2, 0.62 + size / 2]) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const v = at.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
        if (nav?.blocked(v)) continue;
        if (!best || v.distanceTo(p) < best.distanceTo(p)) best = v;
      }
      if (best) return best;
    }
    return at;
  }

  /** Pose l'objet tenu `item` à sa place du couvert. */
  private lay(item: WorldItem, place: { pos: THREE.Vector3; yaw: number }, running: boolean): boolean {
    const c = this.character;
    if (!c.handOf(item)) return false;
    c.approachThen(this.standNear(place.pos, Math.max(item.size.x, item.size.z)), place.pos, () => {
      if (!c.drop(place.pos.clone(), place.yaw, undefined, false, item)) this.onNotice?.(`Impossible de poser ${the(item.name)} sur la table.`);
    }, running);
    return true;
  }

  /**
   * Met la table devant la chaise : une assiette, une fourchette et un couteau de table propres,
   * pris au placard et au tiroir (deux à la fois), chacun posé à sa place.
   */
  setTable(running = false): boolean {
    const c = this.character;
    const spot = this.dinnerTable();
    if (!spot) {
      this.onNotice?.('Il faut une table et une chaise pour mettre la table.');
      return false;
    }
    if (c.busy || c.bracing || this.moving) return false;
    if (c.heldItems.length) {
      this.onNotice?.('Pose d’abord ce que tu tiens pour mettre la table.');
      return false;
    }
    const places = this.placeSetting(spot.table, spot.seat);
    const used = new Set<WorldItem>();
    const todo: WorldItem[] = [];
    for (const [name, place] of places) {
      const all = this.items.filter((i) => i.name === name && !i.dirty);
      // déjà à sa place : rien à faire
      if (all.some((i) => p0(i.object.position).distanceTo(p0(place.pos)) < 0.08 && Math.abs(i.object.position.y - place.pos.y) < 0.1)) continue;
      const pick = all.filter((i) => !used.has(i)).sort((a, b) => +!this.shelfOf(a) - +!this.shelfOf(b))[0];
      if (!pick) {
        this.onNotice?.(`Pas ${FEMININE.has(name) ? 'd’' : 'de '}${name} propre pour mettre la table.`);
        continue;
      }
      used.add(pick);
      todo.push(pick);
    }
    if (!todo.length) {
      this.onNotice?.('La table est déjà mise.');
      return false;
    }
    const steps: Array<() => boolean> = [];
    for (let i = 0; i < todo.length; i += 2) {
      const pair = todo.slice(i, i + 2);
      for (const it of pair) steps.push(() => this.take(it, running));
      for (const it of pair) steps.push(() => this.lay(it, places.get(it.name)!, running));
    }
    return this.chain(steps, () => this.onNotice?.('La table est mise.'));
  }

  /**
   * Débarrasse la table : la vaisselle qui y traîne part deux par deux, la sale au lave-vaisselle
   * (s'il a de la place), la propre à sa place. Une assiette où il reste à manger reste là.
   */
  clearTable(running = false): boolean {
    const c = this.character;
    const spot = this.dinnerTable();
    if (!spot) {
      this.onNotice?.('Pas de table à débarrasser.');
      return false;
    }
    if (c.busy || c.bracing || this.moving) return false;
    if (c.heldItems.length) {
      this.onNotice?.('Pose d’abord ce que tu tiens pour débarrasser.');
      return false;
    }
    const { table } = spot;
    const onTable = this.items.filter((i) => i.def.dish && !c.carried.includes(i) && !this.shelfOf(i) && i.object.position.y > table.object.position.y && this.isAbove(i, table));
    // assiettes et bols entamés restent, avec ce qui est posé dedans
    const lefts = onTable.filter((i) => i.def.plate && this.foodOn(i));
    const left = lefts[0];
    const dishes = onTable.filter((i) => !lefts.includes(i) && !this.riders.some((r) => lefts.includes(r.base) && r.item === i));
    if (!dishes.length) {
      this.onNotice?.(left ? `Il reste ${FEMININE.has(this.foodOn(left)!.name) ? 'une' : 'un'} ${this.foodOn(left)!.name} dans l’assiette : finis-l${FEMININE.has(this.foodOn(left)!.name) ? 'a' : 'e'} d’abord.` : 'La table est déjà débarrassée.');
      return false;
    }
    if (c.seated) return c.standUp(() => this.clearTable(running));
    // ce qui va au même endroit ensemble : les couverts, puis l'assiette et la tasse
    dishes.sort((a, b) => +!!a.def.plate - +!!b.def.plate || +!!a.def.fill - +!!b.def.fill);
    const why = (it: WorldItem) => `${cap(the(it.name))} est sale et le lave-vaisselle est plein (ou en marche) : lave-l${FEMININE.has(it.name) ? 'a' : 'e'} à l’évier.`;
    return this.ferry(dishes, (it) => this.homeOf(it), why, running, () => this.onNotice?.(left ? `Table débarrassée (il reste ${lefts.map((l) => `${l.name === 'bol' ? 'le bol entamé' : 'l’assiette entamée'}`).join(' et ')}).` : 'Table débarrassée.'));
  }

  /**
   * Porte les objets `items` deux par deux (une main chacun) jusqu'au meuble que `dest` choisit
   * pour chacun, où ils sont rangés ; un objet sans meuble arrête la suite (`stuck` dit pourquoi).
   */
  private ferry(items: WorldItem[], dest: (it: WorldItem) => WorldItem | undefined, stuck: (it: WorldItem) => string, running: boolean, onEnd?: () => void): boolean {
    const c = this.character;
    const store = (it: WorldItem) => () => {
      if (!c.handOf(it)) return true;
      const home = dest(it);
      if (home) return this.storeIn(home, running, it);
      this.onNotice?.(stuck(it));
      return false;
    };
    const steps: Array<() => boolean> = [];
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      for (const it of pair) steps.push(() => c.handOf(it) ? true : this.take(it, running));
      for (const it of pair) steps.push(store(it));
    }
    return this.chain(steps, onEnd);
  }

  /** Le lave-vaisselle `ref`, sinon le plus proche. */
  private dishwasher(ref?: string): WorldItem | undefined {
    const it = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.washes);
    return it?.def.washes ? it : undefined;
  }

  /** Vaisselle sale qui traîne (pas rangée), tenue comprise. */
  private looseDirtyDishes(): WorldItem[] {
    return this.items.filter((i) => i.def.dish && i.dirty && !this.shelfOf(i) && !this.flying.some((f) => f.item === i));
  }

  /** Charge d'un coup au lave-vaisselle toute la vaisselle sale qui traîne (deux pièces par voyage). */
  loadDishwasher(ref?: string, running = false): boolean {
    const c = this.character;
    const dw = this.dishwasher(ref);
    const p = c.position;
    // l'assiette en dernier : un couvert posé dessus partirait avec elle
    const dirty = this.looseDirtyDishes().filter((i) => !(i.def.plate && this.foodOn(i))).sort((a, b) => +!c.carried.includes(a) - +!c.carried.includes(b) || +!!a.def.plate - +!!b.def.plate || a.object.position.distanceTo(p) - b.object.position.distanceTo(p));
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!dw) return fail('Il n’y a pas de lave-vaisselle.');
    if (this.appliances.has(dw)) return fail('Le lave-vaisselle tourne déjà.');
    if (!dirty.length) return fail('Pas de vaisselle sale qui traîne.');
    if (c.heldItems.some((h) => !dirty.includes(h))) return fail('Pose d’abord ce que tu tiens.');
    if (c.busy || c.bracing || this.moving) return false;
    if (c.seated) return c.standUp(() => this.loadDishwasher(ref, running));
    const room = this.freeSlots(dw).length;
    const todo = dirty.slice(0, room);
    if (!todo.length) return fail('Le lave-vaisselle est plein.');
    return this.ferry(todo, () => (this.freeSlots(dw).length ? dw : undefined), () => 'Le lave-vaisselle est plein.', running, () => {
      const left = dirty.length - todo.length;
      this.onNotice?.(`Vaisselle sale chargée${left ? ` (plus de place pour ${left} pièce${left > 1 ? 's' : ''})` : ''}.${this.tabletIn.has(dw) ? '' : ' Pense à la pastille.'}`);
    });
  }

  /** Met une pastille (boîte tenue) dans le lave-vaisselle `ref` : sans elle, le lavage rate. */
  addTablet(ref?: string, running = false): boolean {
    const c = this.character;
    const dw = this.dishwasher(ref);
    const box = c.heldItems.find((h) => h.def.id === 'pastilles');
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!dw) return fail('Il n’y a pas de lave-vaisselle.');
    if (!box) return fail('Prends la boîte de pastilles (au placard).');
    if (!(this.tablets.get(box) ?? 0)) return fail('La boîte de pastilles est vide.');
    if (this.tabletIn.has(dw)) return fail('Il y a déjà une pastille dans le lave-vaisselle.');
    if (this.appliances.has(dw)) return fail('Le lave-vaisselle tourne : attends la fin.');
    if (c.busy || c.bracing) return false;
    // porte ouverte, la boîte penchée au-dessus du bac à pastille (sur la porte), puis refermée
    const put = () => {
      dw.object.updateMatrixWorld(true);
      const at = () => new THREE.Vector3(0, 0.45, 0.35).applyMatrix4(dw.object.matrixWorld);
      if (!c.handOf(box)?.pour(at, () => {
        this.tablets.set(box, (this.tablets.get(box) ?? 1) - 1);
        this.tabletIn.add(dw);
        this.onNotice?.(`Pastille mise (il en reste ${this.tablets.get(box)}).`);
      })) this.onNotice?.('Impossible pour l’instant.');
      return true;
    };
    if (this.doors.get(dw)?.target === 1) {
      c.approachThen(this.doorStand(dw), dw.object.position, put, running);
      return true;
    }
    return this.withDoorOpen(dw, put, running);
  }

  /**
   * Vide le lave-vaisselle `ref` (arrêté) : la vaisselle propre part à sa place, au placard et au
   * tiroir, deux pièces par voyage.
   */
  unloadDishwasher(ref?: string, running = false): boolean {
    const c = this.character;
    const dw = this.dishwasher(ref);
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!dw) return fail('Il n’y a pas de lave-vaisselle.');
    if (this.appliances.has(dw)) return fail('Le lave-vaisselle tourne : attends la fin.');
    const inside = this.storedIn(dw);
    const clean = inside.filter((i) => !i.dirty);
    if (!inside.length) return fail('Le lave-vaisselle est vide.');
    if (!clean.length) return fail('Tout est encore sale dans le lave-vaisselle : lance-le (avec une pastille).');
    if (c.heldItems.length) return fail('Pose d’abord ce que tu tiens pour vider le lave-vaisselle.');
    if (c.busy || c.bracing || this.moving) return false;
    if (c.seated) return c.standUp(() => this.unloadDishwasher(ref, running));
    clean.sort((a, b) => +!!a.def.plate - +!!b.def.plate);
    return this.ferry(clean, (it) => this.homeOf(it), (it) => `Plus de place où ranger ${the(it.name)}.`, running, () => {
      const dirty = inside.length - clean.length;
      this.onNotice?.(`Lave-vaisselle vidé, tout est rangé.${dirty ? ` Il reste ${dirty} pièce${dirty > 1 ? 's' : ''} sale${dirty > 1 ? 's' : ''}.` : ''}`);
    });
  }

  /** Quelques miettes sur la table autour de l'assiette `plate`, à la fin d'un repas. */
  private dropCrumbs(plate: WorldItem, color: THREE.ColorRepresentation = 0xc89a5a): void {
    const table = this.items.find((t) => t.name === 'table' && plate.object.position.y > t.object.position.y && this.isAbove(plate, t));
    if (!table) return;
    let g = this.crumbs.get(table);
    if (!g) {
      g = new THREE.Group();
      g.name = 'miettes';
      table.object.add(g);
      this.crumbs.set(table, g);
    }
    table.object.updateMatrixWorld(true);
    const at = table.object.worldToLocal(plate.object.position.clone());
    const mat = new THREE.MeshToonMaterial({ color });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.13 + Math.random() * 0.1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.01), mat);
      m.position.set(at.x + Math.cos(a) * r, table.box.max.y + 0.003, at.z + Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      g.add(m);
    }
  }

  /** Essuie la table `ref` (sinon la plus proche qui a des miettes) avec l'éponge tenue. */
  wipeTable(ref?: string, running = false): boolean {
    const c = this.character;
    const table = ref ? this.byRef(ref) : (this.nearest((i) => this.crumbs.has(i)) ?? this.nearest((i) => i.name === 'table'));
    const sponge = c.heldItems.find((h) => h.def.wipes);
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!table || table.name !== 'table') return fail('Il n’y a pas de table à essuyer.');
    if (!sponge) return fail('Prends l’éponge (près de l’évier) pour essuyer la table.');
    if (!this.crumbs.has(table)) return fail('La table est propre, pas une miette.');
    if (c.busy || c.bracing || this.moving) return false;
    if (c.seated) return c.standUp(() => this.wipeTable(ref, running));
    const g = this.crumbs.get(table)!;
    // au milieu des miettes, du côté libre le plus proche
    table.object.updateMatrixWorld(true);
    const mid = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    const top = () => mid.clone().setY(mid.y + 0.04);
    c.approachThen(this.standNear(mid, 0.3), mid, () => {
      if (!c.handOf(sponge)?.cut(top, () => {
        g.removeFromParent();
        this.crumbs.delete(table);
        this.wearItem(sponge, 2);
        this.onNotice?.('La table est essuyée.');
      })) this.onNotice?.('Impossible d’essuyer pour l’instant.');
    }, running);
    return true;
  }

  /**
   * Essuie au torchon tenu la vaisselle mouillée `ref` (tenue dans l'autre main ou posée ; sinon
   * celle qu'on tient, ou la plus proche).
   */
  dryDish(ref?: string, running = false): boolean {
    const c = this.character;
    const towel = c.heldItems.find((h) => h.def.towel);
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!towel) return fail('Prends le torchon (sur le lave-vaisselle) pour essuyer.');
    const wet = (i: WorldItem) => !!i.def.dish && i.wet > 0;
    const dish = ref ? this.byRef(ref) : (c.heldItems.find(wet) ?? this.nearest((i) => wet(i) && !c.carried.includes(i)));
    if (!dish) return fail(ref ? `Aucun objet « ${ref} ».` : 'Rien de mouillé à essuyer.');
    if (!wet(dish)) return fail(dish.def.dish ? `${cap(the(dish.name))} est déjà ${FEMININE.has(dish.name) ? 'sèche' : 'sec'}${PLURAL.has(dish.name) ? 's' : ''}.` : `On n’essuie pas ${the(dish.name)} au torchon.`);
    if (c.busy || c.bracing || this.moving) return false;
    const at = () => {
      dish.object.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(dish.object).getCenter(new THREE.Vector3());
    };
    const rub = () => {
      const ok = c.handOf(towel)?.cut(at, () => {
        dish.setWet(0);
        this.wearItem(towel, 0.5);
        this.onNotice?.(`${cap(the(dish.name))} est essuyé${agree(dish.name)}.`);
      });
      if (!ok) this.onNotice?.('Impossible d’essuyer pour l’instant.');
    };
    if (c.carried.includes(dish)) rub();
    else if (c.seated) return c.standUp(() => this.dryDish(ref, running));
    else c.approachThen(this.frontOf(dish), dish.object.position, rub, running);
    return true;
  }

  /** S'essuie les mains au torchon tenu (après les avoir lavées). */
  dryHands(): boolean {
    const c = this.character;
    const towel = c.heldItems.find((h) => h.def.towel);
    if (!towel) {
      this.onNotice?.('Prends le torchon (sur le lave-vaisselle) pour t’essuyer les mains.');
      return false;
    }
    if (this.wetHands <= 0) {
      this.onNotice?.('Tes mains sont sèches.');
      return false;
    }
    if (c.busy || c.bracing || this.moving) return false;
    // le torchon frotte devant le ventre
    const at = () => new THREE.Vector3(0, 0, 0.25).applyQuaternion(c.root.quaternion).add(c.position).setY(1);
    const ok = c.handOf(towel)?.cut(at, () => {
      this.wetHands = 0;
      this.wearItem(towel, 0.2);
      this.onNotice?.('Mains essuyées.');
    });
    if (!ok) this.onNotice?.('Impossible de t’essuyer les mains pour l’instant.');
    return !!ok;
  }

  /**
   * Pose l'objet tenu `item` sur `target` (plateau, assiette, table…), au point `at` s'il est donné
   * (le dessus de `target` à cet endroit), sinon au milieu.
   */
  private placeOn(item: WorldItem, target: WorldItem, at?: THREE.Vector3, running = false): boolean {
    const c = this.character;
    if (!c.handOf(item) || target === item) return false;
    if (c.seated) return c.standUp(() => this.placeOn(item, target, at, running));
    target.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(target.object);
    const p = (at ?? box.getCenter(new THREE.Vector3())).clone();
    this.raycaster.set(new THREE.Vector3(p.x, box.max.y + 1, p.z), new THREE.Vector3(0, -1, 0));
    const hit = this.raycaster.intersectObject(target.object, true).find((h) => (h.face?.normal.y ?? 0) > 0.7);
    const spot = new THREE.Vector3(p.x, hit ? hit.point.y : box.max.y, p.z);
    c.approachThen(this.standNear(spot, Math.max(item.size.x, item.size.z)), spot, () => {
      if (!c.drop(spot, undefined, undefined, false, item)) this.onNotice?.(`Impossible de poser ${the(item.name)} sur ${the(target.name)}.`);
    }, running);
    return true;
  }

  /** Pose l'objet tenu `ref` (sinon le dernier pris) sur l'objet `on` (plateau, assiette…). */
  putOn(on: string, ref?: string, running = false): boolean {
    const c = this.character;
    const target = this.byRef(on);
    const item = ref ? this.byRef(ref) : c.held;
    if (!target) return this.onNotice?.(`Aucun objet « ${on} ».`), false;
    if (!item || !c.handOf(item)) return this.onNotice?.('Rien en main à poser.'), false;
    if (c.busy) return false;
    return this.placeOn(item, target, undefined, running);
  }

  /** Empile les assiettes propres qui traînent sur celle de la pile la plus proche (on emporte la pile en prenant celle du dessous). */
  stackPlates(running = false): boolean {
    const c = this.character;
    const p = c.position;
    // les assiettes propres et vides, celles du placard comprises
    const loose = this.items.filter((i) => flat(i) && !i.dirty && !this.foodOn(i) && !this.flying.some((f) => f.item === i));
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (loose.length < 2) return fail('Il faut au moins deux assiettes propres (le placard en a) pour les empiler.');
    if (c.heldItems.some((h) => !loose.includes(h))) return fail('Pose d’abord ce que tu tiens.');
    if (c.busy || c.bracing || this.moving) return false;
    // la base : celle qui porte déjà la pile la plus haute, sinon la plus proche posée
    const onTop = (b: WorldItem) => this.ridersOf(b).filter((r) => flat(r.item)).length;
    const base = loose.filter((i) => !c.carried.includes(i) && !this.shelfOf(i)).sort((a, b) => onTop(b) - onTop(a) || a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!base) return fail('Pose d’abord une assiette pour commencer la pile.');
    const inPile = new Set([base, ...this.ridersOf(base).map((r) => r.item)]);
    const todo = loose.filter((i) => !inPile.has(i));
    if (!todo.length) return fail('Les assiettes sont déjà empilées.');
    const top = () => [base, ...this.ridersOf(base).map((r) => r.item)].filter(flat).sort((a, b) => b.object.position.y - a.object.position.y)[0];
    const steps: Array<() => boolean> = [];
    for (const it of todo) {
      steps.push(() => (c.handOf(it) ? true : this.take(it, running)));
      steps.push(() => this.placeOn(it, top(), top().object.position, running));
    }
    return this.chain(steps, () => this.onNotice?.(`${todo.length + inPile.size} assiettes empilées : prends celle du dessous pour emporter la pile.`));
  }

  /** Flaques encore par terre. */
  private puddles(): Spill[] {
    return this.debris.filter((d): d is Spill => d instanceof Spill && d.wet);
  }

  /** Essuie les flaques par terre avec l'éponge tenue, l'une après l'autre (la plus proche d'abord). */
  cleanFloor(running = false): boolean {
    const c = this.character;
    const sponge = c.heldItems.find((h) => h.def.wipes);
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!this.puddles().length) return fail('Pas de flaque par terre.');
    if (!sponge) return fail('Prends l’éponge (près de l’évier) pour essuyer la flaque.');
    if (c.busy || c.bracing || this.moving) return false;
    if (c.seated) return c.standUp(() => this.cleanFloor(running));
    const p = c.position;
    const spill = this.puddles().sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
    const at = spill.position.clone();
    c.approachThen(this.standNear(at, 0.2), at, () => {
      if (!c.handOf(sponge)?.cut(() => at.clone().setY(0.03), () => {
        spill.wipe();
        this.wearItem(sponge, 1);
        // la suivante, s'il en reste
        if (this.puddles().length) requestAnimationFrame(() => this.cleanFloor(running));
        else this.onNotice?.('Le sol est sec.');
      })) this.onNotice?.('Impossible d’essuyer pour l’instant.');
    }, running);
    return true;
  }

  /**
   * Glisser-déposer : `item` lâché sur `target` (ou par terre en `ground`). Le perso le prend si
   * besoin, puis fait le geste qui va de soi (ranger, servir, verser, jeter, poser dessus…).
   */
  dragDrop(item: WorldItem, target: WorldItem | null, point: THREE.Vector3 | null): boolean {
    const c = this.character;
    if (target === item) return false;
    if (!item.def.portable) return this.onNotice?.(`On ne porte pas : ${item.name}.`), false;
    const use = () => {
      if (!c.handOf(item)) return false;
      if (!target) {
        if (!point) return false;
        c.approachThen(this.standNear(point, Math.max(item.size.x, item.size.z)), point, () => c.drop(point.clone().setY(0), undefined, undefined, false, item), false);
        return true;
      }
      // le geste du menu de la cible qui sert l'objet tenu ; sinon on le pose dessus
      const skip = /^(Prendre|Aller|Déplacer|S’asseoir|S’attabler|Regarder|Laisser|Mettre la table|Débarrasser|Ouvrir|Fermer|Tirer|Ranger sous|Allumer|Éteindre|Arrêter|Changer|Lancer un lavage|Mettre en marche|Vider la poubelle|Vider et ranger|Charger|Ouvrir le robinet|Fermer le robinet|Boire au robinet|Se lever|Couper ici|Préparer)/;
      const entry = this.menuFor(target).find((e) => !skip.test(e.label));
      if (entry) return entry.run();
      if (target.def.slots) return this.storeIn(target, false, item);
      return this.placeOn(item, target, point ?? undefined);
    };
    if (c.handOf(item)) return use();
    return this.chain([() => this.take(item, false), use]);
  }

  /** La table devant la chaise `seat` (à portée), son bord côté chaise et l'écart chaise–bord. */
  private chairTable(seat: WorldItem): { table: WorldItem; dir: THREE.Vector3; gap: number } | null {
    const p = seat.object.position;
    const table = this.items.filter((t) => t.name === 'table' && !this.character.carried.includes(t) && t.object.position.distanceTo(p) < 1.6).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!table) return null;
    const o = table.object;
    o.updateMatrixWorld(true);
    const local = o.worldToLocal(p.clone());
    const b = table.box;
    const alongX = Math.abs(local.x) / (b.max.x - b.min.x) > Math.abs(local.z) / (b.max.z - b.min.z);
    // de la chaise vers la table, le long de l'axe de la table
    const out = alongX ? new THREE.Vector3(Math.sign(local.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(local.z) || -1);
    const edge = alongX ? (local.x > 0 ? b.max.x : -b.min.x) : local.z > 0 ? b.max.z : -b.min.z;
    const gap = (alongX ? Math.abs(local.x) : Math.abs(local.z)) - edge;
    return { table, dir: out.negate().transformDirection(o.matrixWorld).setY(0).normalize(), gap };
  }

  /** La chaise est-elle rangée sous la table ? */
  private tucked(seat: WorldItem): boolean {
    const t = seat.def.seat ? this.chairTable(seat) : null;
    return !!t && t.gap < CHAIR_TUCKED + 0.1;
  }

  /**
   * Range la chaise `ref` sous la table (`under`), ou la tire pour s'asseoir : le perso la prend
   * par le dossier et la fait glisser. `then` : la suite une fois lâchée.
   */
  slideChair(ref: string | undefined, under: boolean, running = false, then?: () => void): boolean {
    const c = this.character;
    const p = c.position;
    const seat = ref ? this.byRef(ref) : this.items.filter((i) => i.def.seat && this.chairTable(i)).sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!seat?.def.seat) return fail('Pas de chaise à pousser.');
    const t = this.chairTable(seat);
    if (!t) return fail('La chaise n’est pas à une table.');
    if (seat === this.sitting) return fail('Lève-toi d’abord.');
    if (c.bracing || this.moving) return fail('Lâche d’abord ce que tu déplaces.');
    if (this.itemsOn(seat).length) return fail('Il y a quelque chose sur la chaise.');
    const want = under ? CHAIR_TUCKED : CHAIR_PULLED;
    const dist = t.gap - want;
    if (Math.abs(dist) < 0.05) return fail(under ? 'La chaise est déjà rangée sous la table.' : 'La chaise est déjà tirée.');
    if (c.busy) return false;
    const o = seat.object;
    o.updateMatrixWorld(true);
    // derrière le dossier, les mains en haut des montants
    const back = o.position.clone().addScaledVector(t.dir, -(SEAT_DEPTH / 2 + 0.42)).setY(0);
    const local = (v: THREE.Vector3) => o.worldToLocal(v.clone());
    const top = o.localToWorld(new THREE.Vector3(0, 0.82, -SEAT_DEPTH / 2 + 0.02));
    const side = new THREE.Vector3(-t.dir.z, 0, t.dir.x).multiplyScalar(0.16);
    const hands = { right: local(top.clone().sub(side)), left: local(top.clone().add(side)) };
    const at = () => ({ right: o.localToWorld(hands.right.clone()), left: o.localToWorld(hands.left.clone()) });
    const move = (step: THREE.Vector3) => {
      o.position.add(step);
      o.updateMatrixWorld(true);
      return true;
    };
    // les mains prises (couverts, assiette) : on la tire du bout des doigts, sans la saisir
    if (c.heldItems.length) {
      c.approachThen(back, o.position.clone().setY(0), () => {
        this.sliding = true;
        const left = t.dir.clone().multiplyScalar(dist);
        let last = performance.now();
        const slide = (now: number) => {
          const d = Math.min(left.length(), (CHAIR_SLIDE * (now - last)) / 1000);
          last = now;
          const s = left.clone().setLength(d);
          move(s);
          left.sub(s);
          if (left.length() > 1e-4) return void requestAnimationFrame(slide);
          this.sliding = false;
          c.nav = this.buildNav();
          then?.();
        };
        requestAnimationFrame(slide);
      }, running);
      return true;
    }
    const ok = c.startPush(back, o.position.clone().setY(0), at, move, () => null, running, () => {
      c.pushBy(t.dir.clone().multiplyScalar(dist), () => c.stopPush(() => {
        c.nav = this.buildNav();
        then?.();
      }));
    });
    return ok;
  }

  /**
   * Assis devant l'assiette servie, le couteau de table (ou de cuisine) en main : le plat est coupé
   * en bouchées, qui se mangent ensuite deux fois plus vite.
   */
  cutInPlate(): boolean {
    const c = this.character;
    const plate = this.tablePlate();
    const food = plate && this.foodOn(plate);
    const knife = c.heldItems.find((i) => i.name === 'couteau de table' || i.def.knife);
    if (!plate || !food) this.onNotice?.('Assieds-toi devant une assiette servie pour couper dedans.');
    else if (!knife) this.onNotice?.('Prends le couteau de table pour couper dans l’assiette.');
    else if (this.cutUp.has(food)) this.onNotice?.(`${cap(the(food.name))} est déjà coupé${agree(food.name)}.`);
    else if (c.busy) return false;
    else {
      const top = () => food.object.position.clone().setY(food.object.position.y + food.size.y * 0.6);
      const ok = !!c.handOf(knife)?.cut(top, () => {
        this.cutUp.add(food);
        knife.setDirty(true);
        plate.setDirty(true);
        this.onNotice?.(`${cap(the(food.name))} est coupé${agree(food.name)} en bouchées.`);
      });
      if (!ok) this.onNotice?.('Impossible de couper pour l’instant.');
      return ok;
    }
    return false;
  }

  /**
   * Fait la vaisselle tenue (assiette, couverts, tasse) à l'évier le plus proche : le perso la pose
   * au fond de la cuve, la frotte sous l'eau, puis la reprend propre.
   */
  washDishes(running = false): boolean {
    return this.washDishesAt(this.nearest((i) => !!i.def.wash?.dishes), running);
  }

  private washDishesAt(sink: WorldItem | undefined, running: boolean): boolean {
    const c = this.character;
    const held = c.heldItems;
    // l'assiette d'abord (la place la plus large)
    const dishes = held.filter((i) => i.def.dish).sort((a, b) => +!a.def.plate - +!b.def.plate);
    const others = held.filter((i) => !i.def.dish);
    const left = this.riders.find((r) => dishes.includes(r.base))?.item;
    if (!sink?.def.wash?.dishes) this.onNotice?.('Il n’y a pas d’évier.');
    else if (!c.canCarry) this.onNotice?.('Crée un perso pour pouvoir faire la vaisselle.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing || c.washing) this.onNotice?.('Tu es déjà à l’évier.');
    else if (this.brew?.machine === sink) this.onNotice?.(`${cap(theLiquid(sink.def.pour!.liquid))} coule déjà.`);
    else if (!dishes.length) this.onNotice?.('Prends la vaisselle à laver (assiette, couverts, tasse).');
    else if (!dishes.some((d) => d.dirty)) this.onNotice?.(dishes.length > 1 ? 'Cette vaisselle est déjà propre.' : `${cap(the(dishes[0].name))} est déjà propre.`);
    else if (others.length) this.onNotice?.(`Pose d’abord ${others.map((o) => the(o.name)).join(' et ')} pour faire la vaisselle.`);
    else if (left) this.onNotice?.(`Il reste ${FEMININE.has(left.name) ? 'une' : 'un'} ${left.name} dans l’assiette.`);
    else if (c.busy || c.bracing) return false;
    else if (c.seated) return c.standUp(() => this.washDishesAt(sink, running));
    else {
      const o = sink.object;
      const spots = sink.def.wash.dishes;
      c.approachThen(this.frontOf(sink), o.position, () => {
        // une pièce après l'autre au fond de la cuve ; un couvert couché dans la longueur de la cuve
        const put = (i: number) => {
          if (i >= dishes.length) {
            c.startWash(this.frontOf(sink), o.position, this.handsUnderTap(sink), false, () => {
              this.washing = { sink, t: 0, seconds: DISH_SECONDS * dishes.length, hygiene: 0, face: false, dishes };
            });
            return;
          }
          const d = dishes[i];
          const flat = !!d.def.layFlat;
          const at = new THREE.Vector3(...spots[i % spots.length]);
          if (flat) at.z -= d.size.y / 2;
          o.updateMatrixWorld(true);
          at.applyMatrix4(o.matrixWorld);
          const yaw = o.rotation.y - (flat ? Math.PI / 2 : 0);
          c.drop(at, yaw, () => {
            // un reste de boisson part dans l'évier
            if (d.contents) {
              d.setLevel(0);
              d.contents = null;
            }
            put(i + 1);
          }, false, d);
        };
        put(0);
      }, running);
      return true;
    }
    return false;
  }

  /** Vaisselle lavée : le perso la reprend, une pièce après l'autre, s'il est resté devant l'évier. */
  private tickPickQueue(): void {
    const c = this.character;
    if (!this.pickQueue.length || !c.idle) return;
    const { item, from } = this.pickQueue.shift()!;
    if (!this.items.includes(item) || c.carried.includes(item) || p0(item.object.position).distanceTo(p0(c.position)) > 1.2) return;
    if (c.freeHand(item)) c.pickUp(item, false, from);
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
    d.keep = false;
    return true;
  }

  /** Ouvre la porte (ou le tiroir) du meuble `ref` et la laisse ouverte : elle ne se referme plus seule quand on s'éloigne. */
  keepOpen(ref?: string, running = false): boolean {
    const item = this.doorItem(ref);
    if (!item) return false;
    const d = this.doors.get(item)!;
    return this.withDoorOpen(item, () => {
      d.keep = true;
      const of = elides(item.name) ? `de l’${item.name}` : FEMININE.has(item.name) ? `de la ${item.name}` : `du ${item.name}`;
      this.onNotice?.(item.def.drawer ? `${cap(the(item.name))} reste ouvert.` : item.def.bin ? `Le couvercle ${of} reste ouvert.` : `La porte ${of} reste ouverte.`);
    }, running);
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
    return item.object.position.clone().addScaledVector(fwd, this.frontDepth(item) + gap).setY(0);
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
      if (d.target === 1 && !d.then && !d.keep && this.character.idle && p0(item.object.position).distanceTo(p0(p)) > DOOR_AUTOCLOSE) d.target = 0;
      const next = THREE.MathUtils.clamp(d.open + (d.target ? dt : -dt) / DOOR_TIME, 0, 1);
      const drawer = item.def.drawer;
      // ce qui est rangé dans le tiroir glisse avec lui
      const inside = drawer && next !== d.open ? this.storedIn(item) : [];
      const before = this.openness(item);
      d.open = next;
      const k = this.openness(item);
      // la lampe du frigo s'allume avec la porte
      const lamp = item.part('lampe');
      if (lamp) {
        lamp.visible = k > 0.02;
        const glow = item.part('lampe-lumiere') as THREE.PointLight | undefined;
        if (glow) glow.intensity = 0.15 * k;
      }
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
      // brûlé, ça ne nourrit presque plus
      const done = doneness(item.def, item.cooking);
      if (before > item.portion) this.needs.restore('faim', (before - item.portion) * food.hunger * (done ? DONENESS_HUNGER[done] : 1));
      if (before === 1 && item.portion < 1 && done === 'brûlé') this.onNotice?.('Beurk, c’est brûlé…');
      this.lastBite.set(item, item.portion);
      if (item.portion > 0 || !c.loseItem(item)) continue;
      this.lastBite.delete(item);
      this.items = this.items.filter((i) => i !== item);
      item.object.removeFromParent();
      this.onNotice?.(`${theName(item.name)} ${PLURAL.has(item.name) ? 'sont' : 'est'} fini${agree(item.name)}. Miam !`);
    }
  }

  /** Four, micro-ondes ou lave-vaisselle : ce qu'on allume par startAppliance. */
  /** L'objet `ref` est-il une lampe qu'on allume d'un clic (lampe de chevet) ? */
  isLamp(ref?: string): boolean {
    const item = ref ? this.byRef(ref) : undefined;
    return !!item && this.lamps.has(item);
  }

  isAppliance(ref?: string): boolean {
    const item = ref ? this.byRef(ref) : null;
    return !!(item && program(item.def));
  }

  /**
   * Met en marche l'appareil `ref` (four, micro-ondes, lave-vaisselle ; sans ref, le plus proche) :
   * le perso va devant, ferme la porte et le lance. Il cuit ou lave ce qui est rangé dedans.
   */
  startAppliance(ref?: string, running = false): boolean {
    const item = ref ? this.byRef(ref) : this.nearest((i) => !!program(i.def));
    if (!item) this.onNotice?.(ref ? `Aucun objet « ${ref} ».` : 'Il n’y a pas d’appareil à mettre en marche.');
    else if (!program(item.def)) this.onNotice?.(`On ne met pas en marche ${the(item.name)}.`);
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
    else if (!this.storedIn(item).length) this.onNotice?.(`${cap(the(item.name))} est vide : mets-y d’abord quelque chose ${item.def.blends ? 'à mixer' : item.def.heats?.turns ? 'à griller' : item.def.heats ? 'à cuire' : 'à laver'}.`);
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
        this.appliances.set(item, { t: 0, start: new Map(inside.map((it) => [it, it.cooking])) });
        this.wearItem(item, WEAR_RUN);
        const lever = item.part('levier');
        if (lever) lever.position.y = -0.06;
        const bare = item.def.washes && !this.tabletIn.has(item);
        this.onNotice?.(`${cap(the(item.name))} ${item.def.heats ? 'chauffe' : 'tourne'}…${bare ? ' Mais sans pastille !' : ''}`);
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
    const lever = item.part('levier');
    if (lever) lever.position.y = 0;
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
      const prog = program(item.def)!;
      r.t += Math.max(0, dt);
      const k = Math.min(1, r.t / prog.seconds);
      const heats = item.def.heats;
      if (heats) {
        for (const [it, c0] of r.start) {
          const cook = it.def.cook;
          if (!cook || !this.items.includes(it)) continue;
          // le four cuit d'un cran (cru → cuit, cuit → brûlé) ; le micro-ondes cuit sans jamais brûler
          const to = !heats.burns ? Math.max(c0, waterCap(it.def)) : c0 < cook.seconds ? waterCap(it.def) : cook.seconds + cook.burn;
          it.cooking = c0 + (to - c0) * k;
          showDoneness(it);
        }
      }
      if (k < 1) continue;
      const inside = [...r.start.keys()].filter((it) => this.items.includes(it));
      if (item.def.washes) {
        // sans pastille, l'eau passe mais la vaisselle reste sale
        const tablet = this.tabletIn.delete(item);
        for (const it of inside) {
          if (it.def.dish && tablet) it.setDirty(false);
          it.setLevel(0);
          it.contents = null;
        }
        this.endAppliance(item, tablet ? 'Ding ! La vaisselle est propre.' : 'Ding ! Lavage raté : sans pastille, la vaisselle est encore sale.');
        continue;
      }
      // mixeur : les fruits deviennent du jus, une tasse par fruit
      if (item.def.blends) {
        for (const it of inside) this.removeItem(it);
        this.blended.set(item, (this.blended.get(item) ?? 0) + inside.length);
        this.showBlend(item);
        this.endAppliance(item, `Ding ! ${cap(theLiquid(item.def.pour!.liquid))} est prêt : apporte une tasse.`);
        continue;
      }
      // grille-pain : les tranches ressortent en pain grillé
      const turns = heats?.turns;
      if (turns && inside.some((it) => turns[it.name])) {
        const made = inside.flatMap((it) => (turns[it.name] ? [this.turnInto(it, turns[it.name])] : [])).filter((x): x is WorldItem => !!x);
        this.endAppliance(item, `Ding ! ${made.map((it) => `${cap(the(it.name))} est prêt${agree(it.name)}.`).join(' ')}`);
        continue;
      }
      const done = inside.flatMap((it) => {
        const d = doneness(it.def, it.cooking);
        if (!d || d === 'cru') return [];
        return [`${cap(the(it.name))} ${PLURAL.has(it.name) ? 'sont' : 'est'} ${doneWord(it, d)}${PLURAL.has(it.name) ? 's' : ''}.`];
      });
      this.endAppliance(item, `Ding ! ${done.join(' ') || 'C’est chaud.'}`);
    }
  }

  /** L'objet devient celui de la fiche `id`, à la même place (les tranches de pain grillées). */
  private turnInto(item: WorldItem, id: string): WorldItem | null {
    const def = ITEM_BY_ID.get(id);
    if (!def || !this.items.includes(item)) return null;
    const made = new WorldItem(def);
    made.object.position.copy(item.object.position);
    made.object.quaternion.copy(item.object.quaternion);
    made.setCondition(item.condition);
    this.removeItem(item);
    this.items.push(made);
    this.scene.add(made.object);
    return made;
  }

  /** L'objet quitte la pièce (mixé, transformé). */
  private removeItem(item: WorldItem): void {
    this.items = this.items.filter((i) => i !== item);
    this.riders = this.riders.filter((r) => r.item !== item && r.base !== item);
    this.lastBite.delete(item);
    item.object.removeFromParent();
  }

  /** Le bol du mixeur montre le jus tant qu'il en reste. */
  private showBlend(mixer: WorldItem): void {
    const juice = mixer.part('liquide');
    if (juice) juice.visible = (this.blended.get(mixer) ?? 0) > 0;
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

  /**
   * Prépare un plat (recipes.ts) : les ingrédients réunis sur une planche à découper ou dans une
   * assiette, avec ceux qu'on tient, deviennent le plat. Le perso va jusqu'à la planche (ou
   * l'assiette), y pose ce qu'il tient, et le plat apparaît à la place des ingrédients.
   * `plat` : l'id du plat voulu (sinon le plus complet possible) ; `ref` : la planche ou l'assiette.
   */
  prepare(plat?: string, ref?: string, running = false): boolean {
    const c = this.character;
    const fail = (t: string) => {
      this.onNotice?.(t);
      return false;
    };
    if (!c.canCarry) return fail('Crée un perso pour pouvoir cuisiner.');
    if (plat && !RECIPE_BY_DISH.has(plat)) return fail(`Pas de recette « ${plat} ».`);
    if (ref && !this.byRef(ref)) return fail(`Aucun objet « ${ref} ».`);
    const plan = this.dishPlan(plat, ref ? this.byRef(ref) : undefined);
    if (!plan) return fail(this.dishHint(plat));
    if (this.moving) return fail(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    if (this.washing || c.washing) return fail('Tu te laves, un instant.');
    if (c.busy || c.bracing) return false;
    if (this.closeBookThen(() => this.prepare(plat, ref, running))) return true;
    if (c.seated) return c.standUp(() => this.prepare(plat, ref, running));
    const { base, recipe, use } = plan;
    const toDrop = use.filter((i) => c.carried.includes(i));
    // 2. ce qu'on tient, posé sur la planche (ou dans l'assiette) l'un après l'autre ; puis le plat
    const next = () => {
      const item = toDrop.shift();
      if (!item) return this.assemble(base, recipe, use);
      const spot = base.def.board ? this.boardSpot(base, item) : this.plateFloor(base);
      if (!c.drop(spot, undefined, next, false, item)) this.onNotice?.(`Impossible de poser ${the(item.name)}.`);
    };
    // 1. devant la planche ou l'assiette
    if (!toDrop.length && base.object.position.distanceTo(c.position) < 1.2) next();
    else c.approachThen(base.def.board ? this.cutStand(base) : c.standFor(base), base.object.position, next, running);
    return true;
  }

  /** Fond de l'assiette (monde), là où l'on sert. */
  private plateFloor(plate: WorldItem): THREE.Vector3 {
    plate.object.updateMatrixWorld(true);
    return new THREE.Vector3(0, plate.def.plate!, 0).applyMatrix4(plate.object.matrixWorld);
  }

  /** Planches et assiettes posées (pas en main, pas au sol) où l'on peut préparer un plat. */
  private dishBases(): WorldItem[] {
    const carried = this.character.carried;
    return this.items.filter((i) => (i.def.board || (i.def.plate && !i.dirty)) && !carried.includes(i) && i.object.position.y > 0.5 && !this.flying.some((f) => f.item === i));
  }

  /** Ingrédient utilisable dans une recette : entier (pas entamé) et, s'il cuit, cuit. */
  private ingredientOk(i: WorldItem): boolean {
    return i.portion === 1 && doneness(i.def, i.cooking) !== 'cru';
  }

  /** Les ingrédients de `recipe` pris parmi `pool` (null s'il en manque un obligatoire). */
  private recipeUse(recipe: DishRecipe, pool: WorldItem[]): WorldItem[] | null {
    const left = pool.filter((i) => this.ingredientOk(i));
    const take = (name: string) => {
      const i = left.findIndex((x) => x.name === name);
      return i < 0 ? null : left.splice(i, 1)[0];
    };
    const use: WorldItem[] = [];
    for (const name of recipe.needs) {
      const got = take(name);
      if (!got) return null;
      use.push(got);
    }
    for (const name of recipe.extras ?? []) {
      const got = take(name);
      if (got) use.push(got);
    }
    return use;
  }

  /**
   * Le plat qu'on peut préparer maintenant : sur quelle planche ou assiette, avec quels
   * ingrédients (posés dessus, ou en main). Le plus complet d'abord, puis celui où il y a déjà le
   * plus d'ingrédients posés, puis le bon support, puis le plus proche.
   */
  private dishPlan(plat?: string, only?: WorldItem): { base: WorldItem; recipe: DishRecipe; use: WorldItem[] } | null {
    const held = this.character.heldItems.filter((i) => i.def.food);
    const bases = only ? [only].filter((b) => this.dishBases().includes(b)) : this.dishBases();
    const recipes = plat ? RECIPES.filter((r) => r.dish === plat) : RECIPES;
    const p = this.character.position;
    let best: { base: WorldItem; recipe: DishRecipe; use: WorldItem[]; score: number[] } | null = null;
    for (const base of bases) {
      const on = this.itemsOn(base).filter((i) => i.def.food);
      for (const recipe of recipes) {
        const use = this.recipeUse(recipe, [...on, ...held]);
        if (!use) continue;
        const kind = base.def.board ? 'planche' : 'assiette';
        // un plat déjà servi dans l'assiette ne se mélange pas à autre chose
        if (kind === 'assiette' && on.some((i) => !use.includes(i))) continue;
        const score = [use.length, use.filter((i) => on.includes(i)).length, +(recipe.on === kind), -base.object.position.distanceTo(p)];
        // comparés dans l'ordre : le premier critère qui diffère décide
        const k = best ? score.findIndex((v, i) => v !== best!.score[i]) : -1;
        if (!best || (k >= 0 && score[k] > best.score[k])) best = { base, recipe, use, score };
      }
    }
    return best && { base: best.base, recipe: best.recipe, use: best.use };
  }

  /** Pourquoi on ne peut rien préparer : ce qui manque (au plat voulu, ou au plus proche d'être prêt). */
  private dishHint(plat?: string): string {
    if (!this.dishBases().length) return 'Pose une planche à découper ou une assiette propre (plan de travail, table) pour y préparer un plat.';
    const pool = this.items.filter((i) => i.def.food && !this.shelfOf(i));
    const list = plat ? RECIPES.filter((r) => r.dish === plat) : RECIPES;
    const missing = (r: DishRecipe) => r.needs.filter((n) => !pool.some((i) => i.name === n && this.ingredientOk(i)));
    const r = [...list].sort((a, b) => missing(a).length - missing(b).length)[0];
    const name = ITEM_BY_ID.get(r.dish)!.name;
    const raw = r.needs.map((n) => pool.find((i) => i.name === n && doneness(i.def, i.cooking) === 'cru')).find(Boolean);
    if (raw && missing(r).length === 1) return `${cap(the(raw.name))} est cru${agree(raw.name)} : fais-${FEMININE.has(raw.name) ? 'la' : 'le'} cuire d’abord.`;
    const miss = missing(r);
    if (miss.length) return `Pour ${FEMININE.has(name) ? 'une' : 'un'} ${name}, il manque : ${miss.join(', ')} (coupe ou cuis les ingrédients du frigo).`;
    return `Pour ${FEMININE.has(name) ? 'une' : 'un'} ${name} : réunis ${r.needs.join(' et ')} sur la planche (ou prends-les en main).`;
  }

  /** Les ingrédients posés sur `base` deviennent le plat. */
  private assemble(base: WorldItem, recipe: DishRecipe, use: WorldItem[]): void {
    const c = this.character;
    if (use.some((i) => !this.items.includes(i) || c.carried.includes(i))) {
      this.onNotice?.('Il manque un ingrédient sur la planche : recommence.');
      return;
    }
    const proto = ITEM_BY_ID.get(recipe.dish)!;
    // autant que ses ingrédients (brûlés : presque rien), plus le bonus de la recette
    const hunger = use.reduce((sum, i) => {
      const done = doneness(i.def, i.cooking);
      return sum + i.def.food!.hunger * i.portion * (done ? DONENESS_HUNGER[done] : 1);
    }, recipe.bonus);
    const burnt = use.some((i) => doneness(i.def, i.cooking) === 'brûlé');
    const dish = new WorldItem({ ...proto, food: { ...proto.food!, hunger: Math.round(hunger) } });
    const yaw = new THREE.Euler().setFromQuaternion(base.object.quaternion, 'YXZ').y;
    dish.object.quaternion.setFromAxisAngle(UP, yaw);
    const at = base.def.board ? this.boardTop(base) : this.plateFloor(base);
    dish.object.position.set(at.x, at.y + dish.restLift(dish.object.quaternion), at.z);
    for (const i of use) {
      this.items = this.items.filter((x) => x !== i);
      this.riders = this.riders.filter((r) => r.item !== i && r.base !== i);
      this.lastBite.delete(i);
      i.object.removeFromParent();
    }
    this.items.push(dish);
    this.scene.add(dish.object);
    if (base.def.board) this.wearItem(base, WEAR_CUT.board);
    const fem = FEMININE.has(dish.name);
    const where = base.def.board ? 'sur la planche' : 'dans l’assiette';
    const then = base.def.board ? ` Sers-l${fem ? 'a' : 'e'} dans l’assiette (P) ou mange-l${fem ? 'a' : 'e'} (M).` : ' Bon appétit !';
    this.onNotice?.(`${cap(dish.name)} prêt${fem ? 'e' : ''} ${where}${burnt ? ' (un peu brûlé…)' : ''}.${then}`);
  }

  /** Se fait un café à la machine la plus proche (il faut tenir la tasse). */
  makeCoffee(running = false): boolean {
    const machine = this.nearest((i) => i.def.pour?.liquid === 'café');
    if (!machine) this.onNotice?.('Il n’y a pas de machine à café.');
    return machine ? this.pourAt(machine, running) : false;
  }

  /** Se sert un jus de fruits au mixeur le plus proche (il faut tenir la tasse ; le jus doit être prêt). */
  makeJuice(running = false): boolean {
    const mixer = this.nearest((i) => !!i.def.blends);
    if (!mixer) this.onNotice?.('Il n’y a pas de mixeur.');
    return mixer ? this.pourAt(mixer, running) : false;
  }

  /** Se fait un thé à la bouilloire la plus proche (il faut tenir la tasse). */
  makeTea(running = false): boolean {
    const kettle = this.nearest((i) => i.def.pour?.liquid === 'thé');
    if (!kettle) this.onNotice?.('Il n’y a pas de bouilloire.');
    return kettle ? this.pourAt(kettle, running) : false;
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
    // contre l'évier pour atteindre le robinet, contre la gazinière pour atteindre les feux du fond (le perso se penche un peu)
    const gap = item.def.wash ? 0.22 : item.def.heat && !item.def.pour ? 0.16 : 0.26;
    return item.object.position.clone().addScaledVector(fwd, this.frontDepth(item) + gap).setY(0);
  }

  /**
   * Distance de l'objet à son avant, le long de son axe Z ; posé sur un meuble (la bouilloire sur
   * le tiroir, le grille-pain sur le lave-vaisselle), jusqu'à l'avant du meuble : on se tient devant, pas dedans.
   */
  private frontDepth(item: WorldItem): number {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(item.object.quaternion);
    const p = item.object.position;
    const under = p.y > 0.05 ? this.items.find((o) => o !== item && o.object.position.y < p.y && this.isAbove(item, o)) : undefined;
    return under ? Math.max(item.box.max.z, under.box.max.z + fwd.dot(under.object.position.clone().sub(p))) : item.box.max.z;
  }

  /**
   * Va à l'évier et met les mains sous le robinet : l'eau coule, les mains se frottent (et
   * montent au visage pour la toilette) ; l'hygiène remonte pendant ce temps (tickWash).
   */
  private washAt(sink: WorldItem | undefined, face: boolean, running: boolean, drink = false): boolean {
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
      // boire : les mains en coupe sous l'eau, puis à la bouche (même geste que la toilette)
      const how = drink ? { seconds: TAP_DRINK.seconds, hygiene: 0 } : face ? WASH_FACE : WASH_HANDS;
      return c.startWash(this.frontOf(sink), sink.object.position, this.handsUnderTap(sink), face, () => {
        this.washing = { sink, t: 0, seconds: how.seconds, hygiene: how.hygiene, face, thirst: drink ? TAP_DRINK.thirst : undefined };
      }, running);
    }
    return false;
  }

  /** Ce qu'il y a dans le meuble `ref` (frigo, placard, tiroir, congélateur…), pour la fenêtre d'inventaire. */
  inventory(ref: string): { title: string; open: boolean; items: Array<{ ref: string; name: string; state: string; count: number }> } | null {
    const shelf = this.byRef(ref);
    if (!shelf?.def.slots) return null;
    const door = this.doors.get(shelf);
    // les pareils ensemble (« pomme ×2 ») ; « au frais » va sans dire dans le frigo
    const items: Array<{ ref: string; name: string; state: string; count: number }> = [];
    for (const i of this.storedIn(shelf)) {
      const state = this.stateOf(i).split(' · ').filter((w) => w !== 'au frais' && !w.startsWith('gelé')).join(' · ');
      const same = items.find((x) => x.name === i.name && x.state === state);
      if (same) same.count++;
      else items.push({ ref: this.ref(i), name: i.name, state, count: 1 });
    }
    return { title: cap(shelf.name), open: !door || door.target === 1, items };
  }

  /** Va ouvrir le meuble `ref` et montre ce qu'il contient (fenêtre d'inventaire). */
  lookInside(ref?: string, running = false): boolean {
    const shelf = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.cold);
    if (!shelf?.def.slots) {
      this.onNotice?.(ref ? `On ne range rien dans : ${ref}.` : 'Pas de meuble où regarder.');
      return false;
    }
    const show = () => {
      this.onInventory?.(this.ref(shelf));
      const n = this.storedIn(shelf);
      this.onNotice?.(n.length ? `Dans ${the(shelf.name)} : ${n.map((i) => i.name).join(', ')}.` : `${cap(the(shelf.name))} est vide.`);
    };
    if (this.doors.has(shelf)) return this.withDoorOpen(shelf, show, running);
    this.character.approachThen(this.frontOf(shelf), shelf.object.position, show, running);
    return true;
  }

  /** Prend l'objet `ref` (depuis la fenêtre d'inventaire : sans s'en servir, comme « Prendre » au clic droit). */
  takeOut(ref: string): boolean {
    const item = this.byRef(ref);
    if (!item) return false;
    return this.take(item, false);
  }

  /**
   * Meuble où ranger l'objet tenu `item` sans qu'on le nomme : au congélateur ce qui en vient,
   * au frais ce qui se mange et se boit, sinon le meuble qui le prend (placard, tiroir, bibliothèque).
   */
  private homeOf(item: WorldItem): WorldItem | undefined {
    // l'égouttoir ne prend que la vaisselle mouillée
    const ok = (s: WorldItem) => !!s.def.slots && this.fits(s, item) && this.freeSlots(s, item).length > 0 && !program(s.def) && (!s.def.rack || item.wet > 0);
    const p = this.character.position;
    const near = (a: WorldItem, b: WorldItem) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p);
    const all = this.items.filter(ok).sort(near);
    // la vaisselle sale : au lave-vaisselle (arrêté), sinon nulle part (à laver d'abord)
    if (item.dirty && item.def.dish) return this.items.filter((s) => s.def.washes && !this.appliances.has(s) && this.fits(s, item) && this.freeSlots(s).length > 0).sort(near)[0];
    const frozen = all.find((s) => s.def.freezer && (item.name === 'bac à glaçons' || item.def.rawWord));
    const cold = (item.def.food || item.def.startFull) && !item.dirty ? all.find((s) => s.def.cold && !s.def.freezer) : undefined;
    const rack = item.def.dish && item.wet > 0 ? all.find((s) => s.def.rack) : undefined;
    return rack ?? frozen ?? cold ?? all.find((s) => !s.def.cold) ?? all[0];
  }

  /** Range ce qu'on tient à sa place (meuble choisi par homeOf), un objet après l'autre. */
  storeAway(running = false): boolean {
    const c = this.character;
    const held = c.held ?? c.heldItems[0];
    if (!held) {
      this.onNotice?.('Rien en main à ranger.');
      return false;
    }
    const home = this.homeOf(held);
    if (!home) {
      this.onNotice?.(held.dirty && held.def.dish ? `${cap(the(held.name))} est sale et le lave-vaisselle est plein (ou en marche) : lave-l${FEMININE.has(held.name) ? 'a' : 'e'} à l’évier.` : `Aucun meuble où ranger ${the(held.name)}.`);
      return false;
    }
    // ce qui va au même meuble y part d'un coup ; le reste ensuite
    const rest = c.heldItems.filter((h) => h !== held && this.homeOf(h) !== home);
    const ok = this.storeIn(home, running);
    if (ok && rest.length) {
      const again = () => (this.character.idle && !this.character.busy ? this.storeAway(running) : requestAnimationFrame(again));
      requestAnimationFrame(again);
    }
    return ok;
  }

  /** Met des glaçons (bac tenu) dans le récipient `ref` (posé, ou tenu dans l'autre main ; sinon le plus proche). */
  addIce(ref?: string, running = false): boolean {
    const c = this.character;
    const tray = c.heldItems.find((h) => h.name === 'bac à glaçons');
    if (!tray) {
      this.onNotice?.('Prends le bac à glaçons (au congélateur).');
      return false;
    }
    const fits = (i: WorldItem) => !!i.def.fill && !i.def.cookware && !i.def.mouth && i !== tray;
    const cup = ref ? this.byRef(ref) : (c.heldItems.find(fits) ?? this.nearest((i) => fits(i) && !c.carried.includes(i)));
    if (!cup || !fits(cup)) {
      this.onNotice?.(cup ? `Les glaçons ne vont pas dans ${the(cup.name)}.` : 'Pas de tasse où mettre les glaçons.');
      return false;
    }
    if (this.iced.has(cup)) {
      this.onNotice?.(`Il y a déjà des glaçons dans ${the(cup.name)}.`);
      return false;
    }
    if (c.busy || c.bracing) return false;
    const at = () => this.pourPoint(cup);
    const start = () => {
      // le bac basculé au-dessus de la tasse, les glaçons y tombent à mi-geste
      if (!c.handOf(tray)?.pour(at, () => {})) return;
      setTimeout(() => this.dropIce(cup), 900);
    };
    if (c.carried.includes(cup)) start();
    else c.approachThen(this.frontOf(cup), cup.object.position, start, running);
    return true;
  }

  private dropIce(cup: WorldItem): void {
    const fill = cup.def.fill!;
    const mat = new THREE.MeshBasicMaterial({ color: 0xf2f9fc, transparent: true, opacity: 0.85 });
    const cubes = Array.from({ length: ICE_CUBES }, (_, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), mat);
      const a = (i / ICE_CUBES) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.012, THREE.MathUtils.lerp(fill[0], fill[1], Math.max(0.3, cup.level)), Math.sin(a) * 0.012);
      m.rotation.set(a, a * 2, 0);
      m.name = 'glacon';
      cup.object.add(m);
      return m;
    });
    this.iced.set(cup, { cubes, t: ICE_MELT, fresh: true });
    this.onNotice?.(`Glaçons dans ${the(cup.name)}.`);
  }

  /** Les glaçons fondent peu à peu ; ils partent avec ce qu'on vide, boit jusqu'au bout ou lave. */
  private tickIce(dt: number): void {
    for (const [cup, ice] of this.iced) {
      ice.t -= Math.max(0, dt);
      const gone = ice.t <= 0 || !this.items.includes(cup) || cup.dirty || (!cup.contents && !ice.fresh);
      const fill = cup.def.fill!;
      for (const m of ice.cubes) {
        m.scale.setScalar(Math.max(0.2, ice.t / ICE_MELT));
        // ils flottent à la surface du liquide
        m.position.y = THREE.MathUtils.lerp(fill[0], fill[1], Math.max(0.15, cup.level)) - 0.004;
      }
      if (!gone) continue;
      for (const m of ice.cubes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      (ice.cubes[0]?.material as THREE.Material | undefined)?.dispose();
      this.iced.delete(cup);
    }
  }

  /** Récipient tenu dont on peut verser le contenu (le dernier pris d'abord). */
  private pourable(): WorldItem | undefined {
    const c = this.character;
    return [c.held, ...c.heldItems].find((i): i is WorldItem => !!i && !!i.contents && i.level > 0.01 && !!i.def.fill && !c.handOf(i)?.stacked);
  }

  /** Peut-on verser `liquid` dans `into` (récipient ou réservoir) ? Sinon, pourquoi. */
  private pourRefusal(from: WorldItem, into: WorldItem): string | null {
    const liquid = from.contents!;
    if (into === from) return 'On ne verse pas un récipient dans lui-même.';
    if (into.def.tank) return liquid === 'eau' ? (into.level > 0.98 ? `${cap(the(into.name))} est déjà plein${agree(into.name)}.` : null) : `On ne met que de l’eau dans ${the(into.name)}.`;
    if (!into.def.fill || !into.def.portable) return `On ne verse rien dans ${the(into.name)}.`;
    if (into.dirty) return `${cap(the(into.name))} est sale : lave-${it(into.name)} d’abord.`;
    if (into.contents && into.contents !== liquid) return `${cap(the(into.name))} contient déjà ${someLiquid(into.contents)}.`;
    if (into.level > 0.98) return `${cap(the(into.name))} est déjà plein${agree(into.name)}.`;
    if (this.inPan(into).length && liquid !== 'eau') return `Il y a déjà ${this.inPan(into).map((i) => i.name).join(' et ')} dans ${the(into.name)}.`;
    return null;
  }

  /** Où tombe le liquide dans `into` (monde) : la surface du liquide, ou le haut du réservoir. */
  private pourPoint(into: WorldItem): THREE.Vector3 {
    into.object.updateMatrixWorld(true);
    if (into.def.tank) {
      const box = new THREE.Box3().setFromObject(into.object);
      // le couvercle de la bouilloire, au-dessus de la verseuse (pas le socle où va la tasse)
      return box.getCenter(new THREE.Vector3()).setY(box.max.y);
    }
    const fill = into.def.fill!;
    return new THREE.Vector3(0, THREE.MathUtils.lerp(fill[0], fill[1], into.level), 0).applyMatrix4(into.object.matrixWorld);
  }

  /**
   * Verse le récipient tenu (bouteille, tasse, casserole) dans `ref` : un autre récipient, posé ou
   * tenu dans l'autre main, ou la bouilloire (de l'eau seulement). Sans `ref` : dans l'autre main,
   * sinon dans le récipient le plus proche qui peut le recevoir.
   */
  pourInto(ref?: string, running = false): boolean {
    const c = this.character;
    const from = this.pourable();
    if (!from) {
      this.onNotice?.('Prends un récipient plein (bouteille, tasse, casserole) pour verser.');
      return false;
    }
    let into = ref ? this.byRef(ref) : undefined;
    if (ref && !into) {
      this.onNotice?.(`Aucun objet « ${ref} ».`);
      return false;
    }
    if (!into) {
      const other = c.heldItems.find((h) => h !== from && !this.pourRefusal(from, h));
      into = other ?? this.nearest((i) => i !== from && !c.carried.includes(i) && (!!i.def.tank || (!!i.def.fill && i.def.portable)) && !this.pourRefusal(from, i));
    }
    if (!into) {
      this.onNotice?.(`Rien où verser ${theLiquid(from.contents!)}.`);
      return false;
    }
    // l'évier : c'est vider
    if (into.def.wash) return this.emptyInto(into, running);
    const no = this.pourRefusal(from, into);
    if (no) {
      this.onNotice?.(no);
      return false;
    }
    const target = into;
    return this.pourThen(from, target, null, () => this.pourPoint(target), c.carried.includes(target) ? null : this.frontOf(target), target.object.position, running);
  }

  /** Vide le récipient tenu dans l'évier le plus proche (dans la casserole, les pommes de terre restent : on égoutte). */
  emptyHeld(running = false): boolean {
    const sink = this.nearest((i) => !!i.def.wash);
    if (!sink) {
      this.onNotice?.('Il n’y a pas d’évier.');
      return false;
    }
    return this.emptyInto(sink, running);
  }

  private emptyInto(sink: WorldItem, running: boolean): boolean {
    const from = this.pourable();
    if (!from) {
      this.onNotice?.('Rien à vider : le récipient tenu est vide.');
      return false;
    }
    const at = () => {
      sink.object.updateMatrixWorld(true);
      const [x, y, z] = sink.def.pour?.at ?? sink.def.wash!.hands;
      const st = this.sinks.get(sink);
      const top = sink.part('cuve')?.userData;
      const surface = st && top ? top.floor + st.water * top.depth : y;
      return new THREE.Vector3(x + 0.08, surface, z + 0.05).applyMatrix4(sink.object.matrixWorld);
    };
    return this.pourThen(from, null, sink, at, this.frontOf(sink), sink.object.position, running);
  }

  /** Va devant `stand` (si besoin), puis incline le récipient au-dessus de `at()` ; tickPour fait couler. */
  private pourThen(from: WorldItem, into: WorldItem | null, sink: WorldItem | null, at: () => THREE.Vector3, stand: THREE.Vector3 | null, face: THREE.Vector3, running: boolean): boolean {
    const c = this.character;
    if (this.pouring) this.onNotice?.('Tu verses déjà.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing || c.washing) this.onNotice?.('Tu te laves, un instant.');
    else if (c.busy || c.bracing) return false;
    else if (this.closeBookThen(() => this.pourThen(from, into, sink, at, stand, face, running))) return true;
    else {
      const start = () => {
        const hand = c.handOf(from);
        if (!hand?.pour(at, () => this.endPour())) return;
        this.pouring = { from, into, sink, at, liquid: from.contents! };
        (this.stream.material as THREE.MeshBasicMaterial).color.set(liquidColor(from.contents!));
      };
      if (stand) c.approachThen(stand, face, start, running);
      else start();
      return true;
    }
    return false;
  }

  /** Le liquide passe du récipient incliné à l'autre (ou part dans l'évier), le filet tombe entre les deux. */
  private tickPour(dt: number): void {
    const p = this.pouring;
    if (!p) return;
    const k = this.character.handOf(p.from)?.pouring ?? 0;
    const room = p.into ? (1 - p.into.level) * volumeOf(p.into) : Infinity;
    const flowing = k > 0.85 && p.from.level > 0.001 && room > 0.001;
    if (flowing) {
      const litres = Math.min(POUR_RATE * dt, p.from.level * volumeOf(p.from), room);
      p.from.setLevel(p.from.level - litres / volumeOf(p.from));
      if (p.from.level <= 0.001) p.from.contents = null;
      if (p.into) {
        const level = p.into.level + litres / volumeOf(p.into);
        if (p.into.def.fill) p.into.setLevel(level);
        else p.into.level = Math.min(1, level);
        if (!p.into.contents) p.into.setLiquidColor(liquidColor(p.liquid));
        p.into.contents = p.liquid;
      }
      if (p.sink) {
        // évier bouché : l'eau versée monte dans la cuve
        const st = this.sinks.get(p.sink);
        if (st?.plug) st.water = Math.min(1, st.water + litres / 8);
      }
    }
    this.stream.visible = flowing;
    if (!flowing) return;
    // le filet tombe du goulot (ou du bord) du récipient incliné jusqu'à la surface en dessous
    const def = p.from.def;
    p.from.object.updateMatrixWorld(true);
    const lip = new THREE.Vector3(...(def.mouth ?? [0, def.fill![1], 0])).applyMatrix4(p.from.object.matrixWorld);
    const to = p.at();
    const len = Math.max(0.01, lip.y - to.y);
    this.stream.position.set(lip.x, lip.y - len / 2, lip.z);
    this.stream.scale.set(1, len, 1);
  }

  private endPour(): void {
    const p = this.pouring;
    this.pouring = null;
    this.stream.visible = false;
    if (!p) return;
    const what = theLiquid(p.liquid);
    if (p.sink) {
      const kept = this.inPan(p.from);
      this.onNotice?.(kept.length ? `${cap(what)} est égoutté${elides(p.liquid) ? 'e' : ''} : ${kept.map((i) => the(i.name)).join(' et ')} reste${kept.length > 1 ? 'nt' : ''} dans ${the(p.from.name)}.` : `${cap(the(p.from.name))} est vidé${FEMININE.has(p.from.name) ? 'e' : ''} dans l’évier.`);
    } else if (p.into) {
      const full = p.into.level > 0.98;
      this.onNotice?.(`${cap(what)} est versé${elides(p.liquid) ? 'e' : ''} dans ${the(p.into.name)}${full ? ` (plein${agree(p.into.name)})` : ''}.`);
    }
  }

  /** Évier `ref` (sinon le plus proche). */
  private sinkItem(ref?: string): WorldItem | undefined {
    const item = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.wash);
    if (!item?.def.wash) this.onNotice?.(ref ? `${ref} n’est pas un évier.` : 'Il n’y a pas d’évier.');
    return item?.def.wash ? item : undefined;
  }

  /** Ouvre (ou ferme) le robinet de l'évier : il coule jusqu'à ce qu'on le ferme. */
  setTap(open: boolean, ref?: string, running = false): boolean {
    const sink = this.sinkItem(ref);
    const st = sink && this.sinks.get(sink);
    if (!sink || !st) return false;
    if (st.tap === open) {
      this.onNotice?.(open ? 'Le robinet coule déjà.' : 'Le robinet est déjà fermé.');
      return false;
    }
    if (this.character.busy || this.washing) return false;
    this.character.approachThen(this.frontOf(sink), sink.object.position, () => {
      st.tap = open;
      if (!open) st.warned = false;
      this.wearItem(sink, WEAR_TAP);
      this.onNotice?.(open ? (st.plug ? 'Le robinet coule : la cuve se remplit.' : 'Le robinet coule.') : 'Robinet fermé.');
    }, running);
    return true;
  }

  /** Met (ou enlève) le bouchon de l'évier : bouché, l'eau du robinet monte dans la cuve ; débouché, elle s'écoule. */
  setPlug(on: boolean, ref?: string, running = false): boolean {
    const sink = this.sinkItem(ref);
    const st = sink && this.sinks.get(sink);
    if (!sink || !st) return false;
    if (st.plug === on) {
      this.onNotice?.(on ? 'L’évier est déjà bouché.' : 'Il n’y a pas de bouchon.');
      return false;
    }
    if (this.character.busy || this.washing) return false;
    this.character.approachThen(this.frontOf(sink), sink.object.position, () => {
      st.plug = on;
      const plug = sink.part('bouchon');
      if (plug) plug.visible = on;
      this.onNotice?.(on ? 'Évier bouché.' : st.water > 0.02 ? 'Bouchon enlevé : l’eau s’écoule.' : 'Bouchon enlevé.');
    }, running);
    return true;
  }

  /** Robinet ouvert : le filet coule ; bouché, la cuve se remplit puis déborde (flaques par terre). */
  private tickSinks(dt: number): void {
    for (const [sink, st] of this.sinks) {
      const busy = this.brew?.machine === sink || this.washing?.sink === sink;
      if (st.tap && st.plug) st.water = Math.min(1, st.water + dt / SINK_FILL);
      else if (!st.plug) st.water = Math.max(0, st.water - dt / SINK_DRAIN);
      const pool = sink.part('cuve');
      if (pool) {
        pool.visible = st.water > 0.01;
        const { floor, depth } = pool.userData as { floor: number; depth: number };
        const h = Math.max(0.002, st.water * depth);
        pool.scale.y = h;
        pool.position.y = floor + h / 2;
      }
      const jet = sink.part('jet');
      if (jet && st.tap && !busy) {
        // le filet du robinet jusqu'au fond de la cuve (ou jusqu'à l'eau)
        jet.userData.top ??= jet.position.y;
        const top: number = jet.userData.top;
        const bottom = (pool?.userData.floor ?? 0) + st.water * (pool?.userData.depth ?? 0);
        const len = Math.max(0.001, top - bottom);
        jet.visible = true;
        jet.scale.y = len;
        jet.position.y = top - len / 2;
      } else if (jet && !busy) jet.visible = false;
      if (!(st.tap && st.plug && st.water >= 1)) continue;
      // la cuve déborde : l'eau coule par terre devant l'évier
      if (!st.warned) {
        st.warned = true;
        this.onNotice?.('L’évier déborde ! Ferme le robinet ou enlève le bouchon.');
      }
      st.spill -= dt;
      if (st.spill > 0) continue;
      st.spill = OVERFLOW;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sink.object.quaternion);
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const at = sink.object.position.clone().addScaledVector(fwd, sink.box.max.z + 0.12 + Math.random() * 0.25).addScaledVector(side, (Math.random() - 0.5) * 0.5).setY(0);
      this.addDebris(new Spill(at, 0x9fcde6, 0.18 + Math.random() * 0.14));
    }
  }

  /** Boit au robinet, l'eau dans le creux des mains (les mains doivent être libres). */
  drinkAtTap(running = false): boolean {
    return this.washAt(this.nearest((i) => !!i.def.wash), true, running, true);
  }

  /** Où vont les mains sous le robinet de l'évier (monde), de part et d'autre du filet d'eau. */
  private handsUnderTap(sink: WorldItem): () => Record<'right' | 'left', THREE.Vector3> {
    const o = sink.object;
    const mid = new THREE.Vector3(...sink.def.wash!.hands);
    return () => {
      o.updateMatrixWorld(true);
      // la droite du perso est du côté -X de l'évier
      return { right: mid.clone().setX(mid.x - 0.05).applyMatrix4(o.matrixWorld), left: mid.clone().setX(mid.x + 0.05).applyMatrix4(o.matrixWorld) };
    };
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
    if (w.thirst) this.needs.restore('soif', (done - before) * w.thirst);
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
    if (w.dishes) {
      for (const d of w.dishes) {
        d.setDirty(false);
        // elle sort de l'eau mouillée : à l'égouttoir ou au torchon
        d.setWet(1);
        this.wearItem(d, WEAR_DISHWASH);
      }
      // puis le perso reprend la vaisselle propre
      const from = new THREE.Vector3(0, 0, 1).applyQuaternion(w.sink.object.quaternion);
      const dishes = w.dishes;
      this.character.stopWash(() => this.pickQueue.push(...dishes.map((item) => ({ item, from }))));
      const wet = dishes.length > 1 ? 'sont propres et mouillés' : `est propre et mouillé${agree(dishes[0].name)}`;
      const pro = dishes.length > 1 ? 'les' : it(dishes[0].name);
      const rack = this.items.some((i) => i.def.rack) ? ` : mets-${pro} à égoutter ou essuie-${pro} au torchon` : '';
      this.onNotice?.(`Vaisselle faite : ${dishes.map((d) => the(d.name)).join(' et ')} ${wet}${rack}.`);
      return;
    }
    this.character.stopWash();
    if (!w.thirst) this.wetHands = 1;
    this.onNotice?.(w.thirst ? 'Tu as bu au robinet.' : w.face ? 'Toilette faite : visage et mains propres.' : 'Mains lavées.');
  }

  /**
   * Va à la machine, pose la tasse sous le bec ; le café coule (frame → tickBrew), puis le perso
   * reprend la tasse pleine.
   */
  private pourAt(machine: WorldItem, running: boolean): boolean {
    const pour = machine.def.pour!;
    // le dernier pris d'abord (la casserole qu'on vient de prendre plutôt que la tasse)
    const c = this.character;
    const cup = [c.held, ...c.heldItems].find((i): i is WorldItem => !!i && pour.fills.includes(i.name));
    // autre chose dedans : vidé dans l'évier, sinon il faut d'abord le boire
    const other = cup?.contents && cup.contents !== pour.liquid ? cup.contents : null;
    if (this.brew) this.onNotice?.(`${cap(theLiquid(this.brew.machine.def.pour!.liquid))} coule déjà.`);
    else if (this.washing) this.onNotice?.('Tu te laves.');
    else if (!cup) this.onNotice?.(`Prends ${the(pour.fills[0])} pour la remplir ${ofLiquid(pour.liquid)}.`);
    else if (cup.dirty && !pour.drain) this.onNotice?.(`${cap(the(cup.name))} est sale : lave-${it(cup.name)} à l’évier ou passe-${it(cup.name)} au lave-vaisselle.`);
    else if (other && !pour.drain) this.onNotice?.(`${cap(the(cup.name))} contient encore ${someLiquid(other)} : bois-${it(cup.name)} ou vide-${it(cup.name)} à l’évier d’abord.`);
    else if (!other && cup.level > 0.99) this.onNotice?.(`${cap(the(cup.name))} est déjà plein${agree(cup.name)}.`);
    else if (machine.def.blends && !this.blended.get(machine)) this.onNotice?.(`${cap(the(machine.name))} est vide : mets-y des fruits et lance-le.`);
    else if (machine.def.tank && machine.level * machine.def.tank < SERVING * 0.8) this.onNotice?.(`${cap(the(machine.name))} est vide : verses-y de l’eau (casserole, bouteille ou tasse remplie à l’évier).`);
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
          this.brew = { machine, cup, t: 0 };
          // machine éteinte : on l'allume, le café coulera une fois qu'elle aura chauffé
          const heat = this.heaters.get(machine);
          if (heat && !heat.on[0]) {
            heat.on[0] = true;
            this.wearItem(machine, WEAR_KNOB);
            this.onNotice?.(`${cap(the(machine.name))} chauffe…`);
          }
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
    // une machine qui chauffe (voir tickHeat) : le café attend qu'elle soit chaude
    const heat = this.heaters.get(b.machine);
    if (heat && heat.warm[0] < 1) return;
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
    // la bouilloire : l'eau de la tasse est prise au réservoir
    if (b.machine.def.tank) b.machine.level = Math.max(0, b.machine.level - SERVING / b.machine.def.tank);
    // le mixeur : une tasse de moins dans le bol
    if (b.machine.def.blends) {
      this.blended.set(b.machine, Math.max(0, (this.blended.get(b.machine) ?? 0) - 1));
      this.showBlend(b.machine);
    }
    this.brew = null;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.machine.object.quaternion);
    const stand = this.frontOf(b.machine);
    if (this.character.freeHand(b.cup) && this.character.position.distanceTo(stand) < 0.8) this.character.pickUp(b.cup, false, fwd);
  }

  /** Feu n° `i` de l'appareil : où se pose la base de l'ustensile (monde). */
  private spotWorld(heater: WorldItem, i: number): THREE.Vector3 {
    heater.object.updateMatrixWorld(true);
    return new THREE.Vector3(...heater.def.heat!.spots[i]).applyMatrix4(heater.object.matrixWorld);
  }

  /** Ce qui est posé sur le feu n° `i` : l'ustensile (ou n'importe quel objet si `any`). */
  private onSpot(heater: WorldItem, i: number, any = false): WorldItem | undefined {
    const at = this.spotWorld(heater, i);
    const carried = this.character.carried;
    return this.items.find((it) => it !== heater && (any || it.def.cookware) && !carried.includes(it) && !this.flying.some((f) => f.item === it)
      && Math.hypot(it.object.position.x - at.x, it.object.position.z - at.z) < ON_SPOT && Math.abs(it.object.position.y - at.y) < 0.04);
  }

  /** Gazinière sur laquelle l'ustensile est posé, et le n° du feu. */
  private stoveUnder(pan: WorldItem): { heater: WorldItem; i: number } | null {
    for (const [heater, h] of this.heaters) {
      if (heater.def.pour) continue;
      for (let i = 0; i < h.on.length; i++) if (this.onSpot(heater, i) === pan) return { heater, i };
    }
    return null;
  }

  /** Ingrédients posés dans l'ustensile. */
  private inPan(pan: WorldItem): WorldItem[] {
    pan.object.updateMatrixWorld(true);
    const carried = this.character.carried;
    // le récipient : un cylindre autour de l'origine, de rayon la demi-largeur (le manche est vers +Z)
    const r = pan.box.max.x;
    const q = new THREE.Vector3();
    return this.items.filter((it) => {
      if (!it.def.cook || carried.includes(it) || this.flying.some((f) => f.item === it)) return false;
      pan.object.worldToLocal(q.copy(it.object.position));
      return Math.hypot(q.x, q.z) < r && q.y > -0.01 && q.y < pan.box.max.y;
    });
  }

  /** Ustensile où l'ingrédient est posé. */
  private panOf(food: WorldItem): WorldItem | undefined {
    return this.items.find((p) => p.def.cookware && this.inPan(p).includes(food));
  }

  /** L'ustensile reçoit-il cet ingrédient (le steak dans la poêle, la pomme de terre dans la casserole) ? */
  private cookFits(pan: WorldItem, food: WorldItem): boolean {
    return !!pan.def.cookware?.holds.includes(food.name);
  }

  /** Première place libre dans l'ustensile (-1 s'il est plein). */
  private freePlace(pan: WorldItem): number {
    pan.object.updateMatrixWorld(true);
    const carried = this.character.carried;
    return pan.def.cookware!.places.findIndex((p) => {
      const at = new THREE.Vector3(...p).applyMatrix4(pan.object.matrixWorld);
      return !this.items.some((it) => it !== pan && !carried.includes(it) && it.object.position.distanceTo(at) < 0.03);
    });
  }

  /** Clic sur la gazinière : y poser l'ustensile tenu, mettre l'ingrédient tenu dans un ustensile posé dessus, sinon allumer ou éteindre. */
  private useStove(stove: WorldItem, running: boolean): boolean {
    const held = this.character.heldItems;
    const pan = held.find((h) => h.def.cookware);
    if (pan) return this.putOnStove(stove, pan, running);
    const food = held.find((h) => h.def.cook);
    const target = food && this.heaters.get(stove)!.on
      .map((_, i) => this.onSpot(stove, i))
      .find((p): p is WorldItem => !!p && this.cookFits(p, food) && this.freePlace(p) >= 0);
    if (food && target) return this.putIn(target, food, running);
    return this.toggleHeat(stove, running);
  }

  /** Pose l'ustensile tenu sur un feu libre de la gazinière (ceux de devant d'abord). */
  private putOnStove(stove: WorldItem, pan: WorldItem, running: boolean): boolean {
    const free = () => this.heaters.get(stove)!.on.map((_, i) => i).find((i) => !this.onSpot(stove, i, true));
    if (free() === undefined) {
      this.onNotice?.('Tous les feux sont pris.');
      return false;
    }
    if (this.closeBookThen(() => this.putOnStove(stove, pan, running))) return true;
    this.character.approachThen(this.frontOf(stove), stove.object.position, () => {
      const i = free();
      if (i === undefined || !this.character.carried.includes(pan)) return;
      // le manche vers le perso
      this.character.drop(this.spotWorld(stove, i), stove.object.rotation.y, undefined, true, pan);
    }, running);
    return true;
  }

  /** Met l'ingrédient tenu dans l'ustensile (posé : sur le feu, la table…). */
  private putIn(pan: WorldItem, food: WorldItem, running: boolean): boolean {
    const fem = FEMININE.has(pan.name);
    if (this.character.carried.includes(pan)) this.onNotice?.(`Pose d’abord ${the(pan.name)}, puis mets-y ${the(food.name)}.`);
    else if (this.freePlace(pan) < 0) this.onNotice?.(`${cap(the(pan.name))} est plein${fem ? 'e' : ''}.`);
    else if (this.closeBookThen(() => this.putIn(pan, food, running))) return true;
    else {
      const under = this.stoveUnder(pan);
      const stand = under ? this.frontOf(under.heater) : this.character.standFor(pan);
      this.character.approachThen(stand, pan.object.position, () => {
        const j = this.freePlace(pan);
        if (j < 0 || !this.character.carried.includes(food)) return;
        pan.object.updateMatrixWorld(true);
        const spot = new THREE.Vector3(...pan.def.cookware!.places[j]).applyMatrix4(pan.object.matrixWorld);
        this.character.drop(spot, pan.object.rotation.y, undefined, true, food);
      }, running);
      return true;
    }
    return false;
  }

  /**
   * Allume ou éteint l'appareil : le feu n° `burner`, sinon tout (éteint s'il y a un feu allumé ;
   * sinon allume les feux où un ustensile est posé).
   */
  private toggleHeat(item: WorldItem, running: boolean, burner?: number): boolean {
    const h = this.heaters.get(item);
    if (!h) return false;
    const on = burner !== undefined ? !h.on[burner] : !h.on.some(Boolean);
    return this.setHeat(item, on, running, burner);
  }

  /** Le perso va devant l'appareil et tourne le bouton : allume (`on`) ou éteint le feu n° `burner`, ou tous. */
  private setHeat(item: WorldItem, on: boolean, running: boolean, burner?: number): boolean {
    const h = this.heaters.get(item)!;
    const fem = FEMININE.has(item.name);
    const stove = h.on.length > 1;
    // sans n° : allumer les feux qui ont un ustensile (de préférence garni : eau ou ingrédient), éteindre tout
    const pans = h.on.map((_, i) => i).filter((i) => this.onSpot(item, i));
    const full = pans.filter((i) => {
      const pan = this.onSpot(item, i)!;
      return !!pan.contents || this.inPan(pan).length > 0;
    });
    const which = burner !== undefined ? [burner] : on && stove ? (full.length ? full : pans) : h.on.map((_, i) => i);
    if (!which.length) {
      this.onNotice?.('Pose d’abord une poêle ou une casserole sur un feu.');
      return false;
    }
    if (which.every((i) => h.on[i] === on)) return true;
    if (this.moving) {
      this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
      return false;
    }
    this.character.approachThen(this.frontOf(item), item.object.position, () => {
      for (const i of which) h.on[i] = on;
      h.unused = 0;
      this.wearItem(item, WEAR_KNOB);
      const pan = which.length === 1 ? this.onSpot(item, which[0]) : undefined;
      if (!stove) this.onNotice?.(on ? `${cap(the(item.name))} est allumé${fem ? 'e' : ''} : elle chauffe.` : `${cap(the(item.name))} est éteint${fem ? 'e' : ''}.`);
      else if (on) this.onNotice?.(pan ? `Feu allumé sous ${the(pan.name)}.` : which.length > 1 ? 'Feux allumés.' : 'Feu allumé.');
      else this.onNotice?.(h.on.some(Boolean) ? 'Feu éteint.' : `${cap(the(item.name))} est éteinte.`);
    }, running);
    return true;
  }

  /** L'appareil `ref`, sinon la gazinière la plus proche (sinon la machine). */
  private heaterItem(ref?: string): WorldItem | null {
    const item = ref ? this.byRef(ref) : (this.nearest((i) => this.heaters.has(i) && !i.def.pour) ?? this.nearest((i) => this.heaters.has(i)));
    if (!item || !this.heaters.has(item)) {
      this.onNotice?.(ref ? `Ça ne s’allume pas : ${ref}.` : 'Il n’y a pas de gazinière.');
      return null;
    }
    return item;
  }

  /**
   * Allume l'appareil `ref` (la gazinière la plus proche sans ref) : les feux où un ustensile garni
   * est posé, ou seulement celui sous l'ustensile `pan`.
   */
  switchOn(ref?: string, running = false, pan?: string): boolean {
    return this.switchTo(true, ref, running, pan);
  }

  /** Éteint l'appareil `ref` (la gazinière la plus proche sans ref) : tous ses feux, ou seulement celui sous l'ustensile `pan`. */
  switchOff(ref?: string, running = false, pan?: string): boolean {
    return this.switchTo(false, ref, running, pan);
  }

  private switchTo(on: boolean, ref?: string, running = false, pan?: string): boolean {
    const screen = ref ? this.byRef(ref) : undefined;
    if (screen && this.tvs.has(screen)) return this.setTv(screen, on, running);
    const item = this.heaterItem(ref);
    if (!item) return false;
    const under = pan ? this.byRef(pan) : undefined;
    const spot = under && this.stoveUnder(under);
    if (pan && spot?.heater !== item) {
      this.onNotice?.(`${pan} n’est pas sur ${this.ref(item)}.`);
      return false;
    }
    return this.setHeat(item, on, running, spot?.i);
  }

  /** Pose l'ustensile tenu sur la gazinière `ref` (la plus proche sans ref). */
  putOnFire(ref?: string, running = false): boolean {
    const stove = ref ? this.byRef(ref) : this.nearest((i) => !!i.def.heat && !i.def.pour);
    const pan = this.character.heldItems.find((h) => h.def.cookware);
    if (!stove?.def.heat || stove.def.pour) this.onNotice?.(ref ? `On ne met rien sur le feu de : ${ref}.` : 'Il n’y a pas de gazinière.');
    else if (!pan) this.onNotice?.('Prends une poêle ou une casserole pour la mettre sur le feu.');
    else return this.putOnStove(stove, pan, running);
    return false;
  }

  /** Met l'ingrédient tenu (qui y va) dans l'ustensile `ref`. */
  putInPan(ref: string, running = false): boolean {
    const pan = this.byRef(ref);
    if (!pan?.def.cookware) {
      this.onNotice?.(`Ce n’est pas un ustensile : ${ref}.`);
      return false;
    }
    const food = this.character.heldItems.find((h) => this.cookFits(pan, h));
    if (!food) {
      this.onNotice?.(`Rien en main qui va dans ${the(pan.name)} (${pan.def.cookware.holds.join(', ')}).`);
      return false;
    }
    return this.putIn(pan, food, running);
  }

  /** Attend que l'ingrédient `ref`, sur un feu allumé, soit cuit (vrai tout de suite s'il l'est déjà). */
  waitCooked(ref: string): boolean {
    const food = this.byRef(ref);
    if (!food?.def.cook) {
      this.onNotice?.(`On ne fait pas cuire : ${ref}.`);
      return false;
    }
    if (doneness(food.def, food.cooking) !== 'cru') return true;
    if (!this.heating(food)) {
      this.onNotice?.(`${cap(the(food.name))} n’est pas sur un feu allumé.`);
      return false;
    }
    this.cookWait = food;
    return true;
  }

  /** L'ingrédient est-il dans un ustensile posé sur un feu allumé ? */
  private heating(food: WorldItem): boolean {
    const pan = this.panOf(food);
    const under = pan && this.stoveUnder(pan);
    return !!under && this.heaters.get(under.heater)!.on[under.i];
  }

  /**
   * Pour l'ordre « cuire » : l'ustensile qui reçoit l'ingrédient `ref` (celui où il est déjà, sinon
   * un déjà sur le feu, sinon le plus proche), s'il lui faut de l'eau, la gazinière, et où ils en sont.
   */
  cookPlan(ref: string): { ustensile: string; eau: boolean; gaziniere: string | null; surLeFeu: boolean; dedans: boolean } | null {
    const food = this.byRef(ref);
    if (!food?.def.cook) return null;
    const p = this.character.position;
    const pans = this.items.filter((i) => this.cookFits(i, food));
    const inside = this.panOf(food);
    const pan = (inside && this.cookFits(inside, food) ? inside : undefined)
      ?? pans.find((i) => this.stoveUnder(i) && this.freePlace(i) >= 0)
      ?? pans.sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p))[0];
    if (!pan) return null;
    const under = this.stoveUnder(pan);
    const stove = under?.heater ?? this.nearest((i) => !!i.def.heat && !i.def.pour);
    return {
      ustensile: this.ref(pan),
      // la casserole se remplit d'eau à l'évier
      eau: !!pan.def.fill && pan.contents !== 'eau',
      gaziniere: stove ? this.ref(stove) : null,
      surLeFeu: !!under,
      dedans: inside === pan,
    };
  }

  /**
   * Appareils allumés : ils chauffent peu à peu (flammes, voyant) ; sur un feu chaud, l'ustensile
   * cuit ce qu'il contient (heatPan). La machine à café se met en veille si on l'oublie.
   */
  private tickHeat(dt: number): void {
    dt = Math.max(0, dt);
    for (const [item, h] of this.heaters) {
      const heat = item.def.heat!;
      if (!heat.autoOff || !h.on.some(Boolean) || this.brew?.machine === item) h.unused = 0;
      else if ((h.unused += dt) > heat.autoOff) {
        h.on.fill(false);
        h.unused = 0;
        this.onNotice?.(`${cap(the(item.name))} s’est mise en veille.`);
      }
      h.on.forEach((on, i) => {
        h.warm[i] = THREE.MathUtils.clamp(h.warm[i] + (on ? dt : -dt) / heat.warmup, 0, 1);
        const lit = item.part(`${heat.lit}-${i}`);
        if (lit) {
          lit.visible = on;
          // les flammes vacillent, et grandissent à mesure que le feu prend
          if (on && heat.lit === 'flamme') lit.scale.set(1, (0.5 + 0.5 * h.warm[i]) * (0.85 + 0.3 * Math.random()), 1);
        }
        if (h.warm[i] <= 0 || heat.lit !== 'flamme') return;
        const pan = this.onSpot(item, i);
        if (pan) this.heatPan(pan, h.warm[i], dt);
      });
    }
    const w = this.cookWait;
    if (w && (!this.items.includes(w) || doneness(w.def, w.cooking) !== 'cru' || !this.heating(w))) this.cookWait = null;
  }

  /** Un ustensile sur le feu : l'eau bout et s'évapore, les ingrédients cuisent, puis brûlent (fumée). */
  private heatPan(pan: WorldItem, warm: number, dt: number): void {
    const o = pan.object;
    const water = pan.contents === 'eau' && pan.level > 0;
    if (water && warm > 0.6) {
      this.puffs.emit(`vapeur-${o.id}`, o.position.clone().setY(o.position.y + pan.box.max.y), dt, 5 * warm, 0xffffff, 0.4);
      pan.setLevel(pan.level - (dt * warm) / BOIL_AWAY);
      if (pan.level <= 0) {
        pan.contents = null;
        this.onNotice?.(`L’eau de ${the(pan.name)} s’est évaporée !`);
      }
    }
    for (const food of this.inPan(pan)) {
      const before = food.cooking;
      // dans l'eau, ça cuit sans jamais brûler
      const t = water ? Math.min(before + dt * warm, Math.max(before, waterCap(food.def))) : before + dt * warm;
      if (t === before) continue;
      food.cooking = t;
      showDoneness(food);
      const name = cap(the(food.name));
      const fem = FEMININE.has(food.name) ? 'e' : '';
      const was = doneness(food.def, before), now = doneness(food.def, t);
      const cap0 = waterCap(food.def);
      if (now === 'cuit' && was === 'cru') {
        this.onNotice?.(`${name} est cuit${fem}.`);
        this.wearItem(pan, WEAR_COOK);
      } else if (before < cap0 && t >= cap0) this.onNotice?.(`Ça sent le brûlé : retire ${the(food.name)} du feu !`);
      else if (now === 'brûlé' && was !== 'brûlé') this.onNotice?.(`${name} a brûlé.`);
      // ça fume dès que ça commence à brûler, de plus en plus
      if (t > cap0) {
        const at = food.object.position.clone().setY(food.object.position.y + 0.03);
        this.puffs.emit(`fumee-${food.object.id}`, at, dt, (now === 'brûlé' ? 8 : 3) * warm, 0x3b3735, 0.55);
      }
    }
  }

  /** Clic sur un objet : le prendre, l'ajouter à la pile tenue, ou y ranger ce qu'on tient. */
  private tryPickUp(item: WorldItem, running: boolean, opts: { body?: boolean; button?: number } = {}): boolean {
    const c = this.character;
    const held = c.heldItems;
    const door = this.doors.get(item);
    if (!c.canCarry) this.onNotice?.('Crée un perso pour pouvoir porter des objets.');
    else if (this.moving) this.onNotice?.(`Tu déplaces : ${this.moving.item.name}. E pour lâcher.`);
    else if (this.washing || this.character.washing) this.onNotice?.('Tu te laves, un instant.');
    // bouton d'un appareil (un feu de la gazinière, la machine à café) : l'allumer ou l'éteindre
    else if (opts.button !== undefined && item.def.heat) return this.toggleHeat(item, running, opts.button);
    // poubelle : on y jette ce qu'on tient
    else if (item.def.bin && held.length) return this.throwInto(item, c.held!, running);
    // gazinière : y poser l'ustensile tenu, mettre l'ingrédient dans l'ustensile qui est dessus, sinon allumer ou éteindre
    else if (item.def.heat && !item.def.pour) return this.useStove(item, running);
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
    // appareil sans porte (grille-pain) : on y met ce qu'on tient
    else if (program(item.def) && !door && held.some((h) => this.fits(item, h))) return this.storeIn(item, running);
    // mixeur prêt, tasse en main : on la remplit
    else if (item.def.blends && item.def.pour && held.some((h) => item.def.pour!.fills.includes(h.name))) return this.pourAt(item, running);
    // appareil (four, micro-ondes, lave-vaisselle) : clic sur le côté, on le met en marche ou on l'arrête
    else if (program(item.def)) return this.appliances.has(item) ? this.stopAppliance(this.ref(item)) : this.runAppliance(item, running);
    // poubelle pas vide : clic sur le côté, on la vide
    else if (item.def.bin && this.binFill.get(item)) return this.emptyBin(this.ref(item), running);
    // télé, mains vides : on l'allume ou on l'éteint
    else if (item.def.screen && !held.length) return this.setTv(item, undefined, running);
    // mains vides : un gros meuble s'agrippe pour le déplacer
    else if (item.def.movable && !held.length) return this.grabFurniture(item, running);
    // évier : la vaisselle sale en main se lave ; la tasse (propre) se remplit d'eau ; sinon on se lave les mains
    else if (item.def.wash?.dishes && held.some((h) => h.def.dish && h.dirty)) return this.washDishesAt(item, running);
    else if (item.def.wash && !held.some((h) => item.def.pour?.fills.includes(h.name))) return this.washAt(item, false, running);
    else if (item.def.pour) return this.pourAt(item, running);
    else if (this.flying.some((f) => f.item === item)) return false;
    // un ingrédient en main, clic sur l'ustensile qui le reçoit : on l'y met
    else if (item.def.cookware && held.some((h) => this.cookFits(item, h))) return this.putIn(item, held.find((h) => this.cookFits(item, h))!, running);
    else if (item === this.brew?.cup) this.onNotice?.(`${cap(theLiquid(this.brew.machine.def.pour!.liquid))} coule encore.`);
    // un aliment en main : on le sert dans l'assiette cliquée
    else if (item.def.plate && held.some((h) => h.def.food)) return this.serveOn(item, held.find((h) => h.def.food)!, running);
    else if (item.def.slots && held.length) return this.storeIn(item, running);
    else if (item.def.slots) this.onNotice?.('Clique sur un livre pour le prendre, ou apporte des livres à ranger.');
    else return this.take(item, running);
    return false;
  }

  /** Prendre l'objet en main, sans s'en servir (menu au clic droit : « Prendre »). */
  private take(item: WorldItem, running: boolean): boolean {
    const c = this.character;
    const held = c.heldItems;
    const sameStack = held.find((h) => item.def.stack && h.def.stack === item.def.stack);
    // un livre rangé se prend par l'avant du meuble
    const stored = this.shelfOf(item);
    const from = stored?.forward;
    if (!item.def.portable) this.onNotice?.(`On ne peut pas porter : ${item.name}.`);
    else if (this.closeBookThen(() => this.take(item, running))) return true;
    // dans le frigo fermé : on ouvre d'abord
    else if (stored && this.doors.get(stored.shelf)?.target === 0 && (c.stackHand(item) || c.freeHand(item))) return this.withDoorOpen(stored.shelf, () => this.take(item, running), running);
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
  private freeSlots(shelf: WorldItem, item?: WorldItem): number[] {
    const carried = this.character.carried;
    const height = (i: number) => Math.abs(shelf.def.slots![i][1] + 0.12 - 1);
    // places réservées (égouttoir : verres au fond, couverts au panier)
    const takes = (i: number) => !item || !shelf.def.slotHolds?.[i] || shelf.def.slotHolds[i]!.includes(item.name);
    return shelf.def.slots!
      .map((_, i) => i)
      .filter((i) => {
        if (!takes(i)) return false;
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
    if (!this.freeSlots(shelf, first).length) {
      this.onNotice?.(shelf.def.slotHolds && this.freeSlots(shelf).length ? `Plus de place pour ${the(first.name)} sur ${the(shelf.name)}.` : `${art} ${shelf.name} est plein${FEMININE.has(shelf.name) ? 'e' : ''}.`);
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
    // la place se choisit pour l'objet qui part (le haut de la pile, s'il y en a une)
    const free = this.freeSlots(shelf, hands.stacked ? hands.held : item);
    if (!free.length) {
      this.onNotice?.(shelf.def.slotHolds ? `Plus de place pour ${the(item.name)} sur ${the(shelf.name)}.` : `${FEMININE.has(shelf.name) ? 'La' : 'Le'} ${shelf.name} est plein${FEMININE.has(shelf.name) ? 'e' : ''}.`);
      return;
    }
    const { pos, rot } = this.slot(shelf, free[0]);
    if (hands.stacked) hands.storeTop(pos, rot, () => this.storeNext(shelf, item, both));
    else {
      // puis ce que tient l'autre main, si ça se range aussi ici
      const next = () => {
        const other = both && this.character.heldItems.find((i) => this.fits(shelf, i) && this.freeSlots(shelf, i).length > 0);
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
      if (e.code === 'KeyP' && !e.repeat) this.serve();
      if (e.code === 'KeyV' && !e.repeat) this.washDishes();
      if (e.code === 'KeyK' && !e.repeat) this.cut();
      if (e.code === 'KeyG' && !e.repeat) this.prepare();
      if (e.code === 'KeyC' && !e.repeat) {
        if (this.sleep) this.wakeUp();
        else if (this.character.seated) this.standUp();
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
      const pr = this.press;
      if (pr && e.buttons & 1) {
        if (!pr.dragging && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > DRAG_START) pr.dragging = true;
        if (pr.dragging) {
          const r = el.getBoundingClientRect();
          const over = this.hitAt(e.clientX, e.clientY)?.item;
          this.onHover?.(null);
          this.onDrag?.({ name: pr.hit.item.name, over: over && over !== pr.hit.item ? over.name : null, x: e.clientX - r.left, y: e.clientY - r.top });
          return;
        }
      }
      const hovered = e.buttons ? null : this.switchAt(e.clientX, e.clientY);
      if (hovered) {
        const r = el.getBoundingClientRect();
        this.onHover?.({ name: 'interrupteur', grade: gradeName(1, false), condition: 1, state: hovered.lightsOn ? 'lumière allumée' : 'lumière éteinte', x: e.clientX - r.left, y: e.clientY - r.top });
        return;
      }
      const item = e.buttons ? null : this.itemAt(e.clientX, e.clientY);
      if (!item) {
        this.onHover?.(null);
        return;
      }
      const r = el.getBoundingClientRect();
      this.onHover?.({ name: item.name, grade: gradeName(item.condition, FEMININE.has(item.name)), condition: item.condition, state: this.stateOf(item), x: e.clientX - r.left, y: e.clientY - r.top });
    });
    on(el, 'pointerleave', () => this.onHover?.(null));
    on(el, 'contextmenu', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sw = this.switchAt(e.clientX, e.clientY);
      if (sw) {
        const on = sw.lightsOn;
        this.onMenu?.({ x: e.clientX - r.left, y: e.clientY - r.top, title: 'interrupteur', entries: [{ label: on ? 'Éteindre la lumière' : 'Allumer la lumière', run: () => this.switchLights(!on, false, sw) }] });
        return;
      }
      const item = this.hitAt(e.clientX, e.clientY)?.item ?? null;
      const entries = this.menuFor(item);
      if (!entries.length) {
        this.onMenu?.(null);
        return;
      }
      const title = item ? item.name : this.heldLabel ?? 'Le perso';
      this.onMenu?.({ x: e.clientX - r.left, y: e.clientY - r.top, title, entries });
    });
    on(el, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this.onMenu?.(null);
      const sw = this.switchAt(e.clientX, e.clientY);
      if (sw) {
        this.switchLights(undefined, e.shiftKey, sw);
        return;
      }
      const hit = this.hitAt(e.clientX, e.clientY);
      if (hit) {
        // un objet qu'on porte peut être traîné (glisser-déposer) : on attend de savoir si c'est un clic
        if (hit.item.def.portable && !this.moving) {
          this.press = { hit, x: e.clientX, y: e.clientY, shift: e.shiftKey, dragging: false };
          return;
        }
        this.clickItem(hit, e.shiftKey);
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
    on(window, 'pointerup', (e) => {
      const pr = this.press;
      if (!pr || e.button !== 0) return;
      this.press = null;
      if (!pr.dragging) return this.clickItem(pr.hit, pr.shift);
      this.onDrag?.(null);
      const target = this.hitAt(e.clientX, e.clientY);
      // sur un objet : le geste qui va de soi ; sinon par terre, là où on lâche
      this.dragDrop(pr.hit.item, target?.item ?? null, target ? target.point : this.groundPoint(e.clientX, e.clientY));
    });
  }

  /** Clic gauche sur un objet : le prendre (ou ouvrir la porte, appuyer sur le bouton…). */
  private clickItem(hit: NonNullable<ReturnType<Game['hitAt']>>, shift: boolean): void {
    // frigo : clic sur la porte = l'ouvrir ou la fermer, sur le côté = le pousser
    this.tryPickUp(hit.item, shift, { body: !!(hit.item.def.door || hit.item.def.drawer) && !hit.door, button: hit.button });
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
        // ce qui est dessous n'est pas posé dessus (la poêle sous le steak qu'on y prend)
        if (b.min.y < box.min.y + 0.005) continue;
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

  /**
   * Gestes possibles sur l'objet visé (clic droit), ou avec ce qu'on tient (clic droit sur le sol
   * ou sur le perso). Chaque geste reprend une action existante ; le clic gauche garde le geste
   * le plus courant.
   */
  menuFor(item: WorldItem | null): MenuEntry[] {
    const c = this.character;
    const held = c.heldItems;
    const out: MenuEntry[] = [];
    const add = (label: string, run: () => boolean) => out.push({ label, run });
    if (!c.canCarry) return out;
    if (this.moving) {
      add(`Lâcher : ${this.moving.item.name}`, () => this.release());
      return out;
    }
    if (!item) {
      const can = this.handActions();
      if (can.drink) add('Boire', () => this.drink());
      if (can.eat) add('Manger', () => this.eat());
      if (can.serve) add('Servir dans l’assiette', () => this.serve());
      if (can.cut) add('Couper', () => this.cut());
      const served = this.tablePlate();
      if (served && held.some((h) => h.name === 'couteau de table' || h.def.knife) && !this.cutUp.has(this.foodOn(served)!)) add('Couper dans l’assiette', () => this.cutInPlate());
      if (can.prepare) add('Préparer le plat', () => this.prepare());
      if (can.dishes) add('Faire la vaisselle', () => this.washDishes());
      const full = this.pourable();
      if (full) {
        add(`Verser ${theLiquid(full.contents!)}`, () => this.pourInto());
        if (this.sinks.size) add(`Vider ${the(full.name)} dans l’évier`, () => this.emptyHeld());
      }
      if (can.read) add('Lire', () => this.read());
      if (can.reading) add('Fermer le livre', () => this.stopReading());
      if (can.throw) add(`Lancer : ${c.held!.name}`, () => this.throwItem());
      if (held.length && this.items.some((i) => i.def.bin)) add(`Jeter : ${c.held!.name}`, () => this.throwAway());
      if (held.some((h) => this.homeOf(h))) add('Ranger à sa place', () => this.storeAway());
      const tray = held.find((h) => h.name === 'bac à glaçons');
      const cup = held.find((h) => h !== tray && h.def.fill && !h.def.cookware && !h.def.mouth);
      if (tray && cup && !this.iced.has(cup)) add(`Glaçons dans ${the(cup.name)}`, () => this.addIce(this.ref(cup)));
      if (held.some((h) => h.def.wipes) && this.puddles().length) add('Essuyer la flaque', () => this.cleanFloor());
      // le torchon : la vaisselle mouillée qu'on tient, les mains après les avoir lavées
      const towel = held.find((h) => h.def.towel);
      const wetDish = held.find((h) => h.def.dish && h.wet > 0);
      if (towel && wetDish) add(`Essuyer ${the(wetDish.name)}`, () => this.dryDish(this.ref(wetDish)));
      if (towel && this.wetHands > 0) add('S’essuyer les mains', () => this.dryHands());
      const rack = wetDish && this.homeOf(wetDish);
      if (rack?.def.rack) add(`Mettre ${the(wetDish!.name)} à égoutter`, () => this.storeIn(rack, false, wetDish));
      for (const h of new Set(held.map((i) => i.name))) add(`Poser : ${h}`, () => this.drop(h));
      if (can.seated) add('Se lever', () => this.standUp());
      if (can.sleeping) add('Se réveiller', () => this.wakeUp());
      return out;
    }
    const ref = this.ref(item);
    const door = this.doors.get(item);
    const heat = this.heaters.get(item);
    // porte, tiroir, couvercle
    if (door) {
      const part = item.def.drawer ? 'le tiroir' : item.def.bin ? 'le couvercle' : 'la porte';
      if (door.target || door.open > 0) add(`Fermer ${part}`, () => this.closeDoor(ref));
      else add(`Ouvrir ${part}`, () => this.openDoor(ref));
    }
    // ranger ce qu'on tient
    if (item.def.slots && held.some((h) => this.fits(item, h))) add('Ranger ici ce que je tiens', () => this.storeIn(item, false));
    if (item.def.slots && !program(item.def)) add('Regarder dedans', () => this.lookInside(ref));
    if (door && (door.target || door.open > 0) && !door.keep) add('Laisser ouvert', () => this.keepOpen(ref));
    // essuyer au torchon la vaisselle mouillée posée là
    if (item.def.dish && item.wet > 0 && held.some((h) => h.def.towel)) add('Essuyer avec le torchon', () => this.dryDish(ref));
    // glaçons (bac tenu) dans une tasse
    if (held.some((h) => h.name === 'bac à glaçons') && item.def.fill && !item.def.cookware && !item.def.mouth && !this.iced.has(item)) add('Mettre des glaçons', () => this.addIce(ref));
    // gazinière, bouilloire, machine à café : poser l'ustensile, allumer, éteindre
    const pan = held.find((h) => h.def.cookware);
    if (heat && pan && !item.def.pour) add(`Poser ${the(pan.name)} sur le feu`, () => this.putOnStove(item, pan, false));
    if (heat && !item.def.pour) {
      if (heat.on.some(Boolean)) add('Éteindre', () => this.switchOff(ref));
      else add('Allumer', () => this.switchOn(ref));
    }
    // télé : allumer, éteindre, changer de chaîne
    const tv = this.tvs.get(item);
    if (tv) {
      add(tv.on ? 'Éteindre la télé' : 'Allumer la télé', () => this.setTv(item, !tv.on, false));
      if (tv.on) add('Changer de chaîne', () => this.zapTv(item, false));
    }
    // four, micro-ondes, lave-vaisselle, grille-pain, mixeur
    if (program(item.def)) {
      if (this.appliances.has(item)) add('Arrêter', () => this.stopAppliance(ref));
      else add(item.def.washes ? 'Lancer un lavage' : 'Mettre en marche', () => this.startAppliance(ref));
    }
    if (item.def.washes && !this.appliances.has(item)) {
      const box = held.find((h) => h.def.id === 'pastilles');
      if (box && !this.tabletIn.has(item)) add('Mettre une pastille', () => this.addTablet(ref));
      if (this.looseDirtyDishes().length && !held.some((h) => !h.def.dish || !h.dirty)) add('Charger la vaisselle sale', () => this.loadDishwasher(ref));
      if (!held.length && this.storedIn(item).some((i) => !i.dirty)) add('Vider et ranger', () => this.unloadDishwasher(ref));
    }
    // poubelle
    if (item.def.bin && held.length) add(`Jeter : ${c.held!.name}`, () => this.throwInto(item, c.held!, false));
    if (item.def.bin && this.binFill.get(item)) add('Vider la poubelle', () => this.emptyBin(ref));
    // évier
    if (item.def.wash?.dishes && held.some((h) => h.def.dish && h.dirty)) add('Faire la vaisselle', () => this.washDishesAt(item, false));
    // machine qui remplit (café, thé, eau du robinet)
    const cup = item.def.pour && held.find((h) => item.def.pour!.fills.includes(h.name));
    if (cup) {
      const liquid = item.def.pour!.liquid;
      add(liquid === 'eau' ? (cup.name.includes('eau') ? `Remplir ${the(cup.name)}` : `Remplir ${the(cup.name)} d’eau`) : `Faire un ${liquid}`, () => this.pourAt(item, false));
    }
    if (item.def.wash && !held.length) {
      add('Se laver les mains', () => this.washAt(item, false, false));
      add('Faire sa toilette', () => this.washAt(item, true, false));
    }
    // verser ce qu'on tient dedans (récipient, bouilloire) ; le vider dans l'évier
    const full = this.pourable();
    if (full && !item.def.wash && (item.def.tank || item.def.fill) && !this.pourRefusal(full, item)) {
      add(item.def.tank ? `Remplir ${the(item.name)}` : `Verser ${theLiquid(full.contents!)} dedans`, () => this.pourInto(ref));
    }
    const sink = this.sinks.get(item);
    if (sink) {
      if (full) add(`Vider ${the(full.name)}`, () => this.emptyInto(item, false));
      add(sink.tap ? 'Fermer le robinet' : 'Ouvrir le robinet', () => this.setTap(!sink.tap, ref));
      add(sink.plug ? 'Enlever le bouchon' : 'Boucher l’évier', () => this.setPlug(!sink.plug, ref));
      if (!held.length) add('Boire au robinet', () => this.washAt(item, true, false, true));
    }
    // ustensile : y mettre l'ingrédient tenu
    const food = item.def.cookware && held.find((h) => this.cookFits(item, h));
    if (food) add(`Mettre ${the(food.name)} dedans`, () => this.putIn(item, food, false));
    // planche, assiette : couper, servir, préparer
    const board = item.def.board ? item : this.boardOn(item);
    if (board && held.some((h) => h.def.cut && h.portion === 1)) add('Couper ici', () => this.cutOn(board, false));
    if ((item.def.board || item.def.plate) && this.dishPlan(undefined, item)) add('Préparer le plat ici', () => this.prepare(undefined, ref));
    const dish = item.def.plate && held.find((h) => h.def.food);
    if (dish && !item.dirty && !this.foodOn(item)) add(`Servir ${the(dish.name)} ici`, () => this.serveOn(item, dish, false));
    if (item.def.plate && this.foodOn(item)) add('S’attabler', () => this.sitAtTable(ref));
    // poser dessus ce qu'on tient (plateau, assiette vide : empiler)
    const putable = held.find((h) => h !== item && !isTwoHanded(h.grip));
    if (putable && (item.def.id === 'plateau' || (item.def.plate && putable.def.plate && !this.foodOn(item)))) add(`Poser ${the(putable.name)} dessus`, () => this.placeOn(putable, item));
    if (item.def.plate && !held.length && !this.shelfOf(item) && this.items.filter((i) => i.def.plate && !i.dirty && !this.foodOn(i)).length > 1) add('Empiler les assiettes', () => this.stackPlates());
    // la table : mettre le couvert, débarrasser
    if (item.name === 'table' && !held.length) {
      add('Mettre la table', () => this.setTable());
      add('Débarrasser', () => this.clearTable());
    }
    // lit, lampe de chevet
    if (item.def.bed) {
      if (this.sleep?.bed === item) add('Se réveiller', () => this.wakeUp());
      else if (!this.sleep) add('Dormir', () => this.sleepIn(ref));
    }
    const lamp = this.lamps.get(item);
    if (lamp) add(lamp.on ? 'Éteindre la lampe' : 'Allumer la lampe', () => this.switchLamp(ref, !lamp.on));
    // siège
    if (item.def.seat && item !== this.sitting) add('S’asseoir', () => this.sit(ref));
    if (item.def.seat && item !== this.sitting && this.chairTable(item)) {
      if (this.tucked(item)) add('Tirer la chaise', () => this.slideChair(ref, false));
      else add('Ranger sous la table', () => this.slideChair(ref, true));
    }
    if (item.name === 'table' && this.crumbs.has(item) && held.some((h) => h.def.wipes)) add('Essuyer la table', () => this.wipeTable(ref));
    if (item === this.sitting) add('Se lever', () => this.standUp());
    // prendre (sans s'en servir), déplacer un meuble
    if (item.def.portable) add(`Prendre ${the(item.name)}`, () => this.take(item, false));
    if (item.def.movable && !held.length) add(`Déplacer ${the(item.name)}`, () => this.grabFurniture(item, false));
    add(`Aller ${toThe(item.name)}`, () => this.walkTo(ref));
    return out;
  }

  /** État visible d'un objet pour l'infobulle : « cuit », « sale », « plein de café », « en marche »… */
  private stateOf(item: WorldItem): string {
    const words: string[] = [];
    const a = agree(item.name);
    const cuisson = doneness(item.def, item.cooking);
    if (cuisson) words.push(doneWord(item, cuisson) + (PLURAL.has(item.name) ? 's' : ''));
    if (item.def.food && item.portion < 1) words.push(`entamé${a}`);
    if (item.name === 'table' && this.crumbs.has(item)) words.push('des miettes');
    if (item.def.seat && this.tucked(item)) words.push('rangée sous la table');
    if (this.tablets.has(item)) words.push(`${this.tablets.get(item)} pastille${this.tablets.get(item)! > 1 ? 's' : ''}`);
    if (item.def.washes && this.tabletIn.has(item)) words.push('pastille mise');
    if (item.def.tank) {
      const cups = Math.floor((item.level * item.def.tank) / SERVING + 0.2);
      words.push(cups ? `eau pour ${cups} tasse${cups > 1 ? 's' : ''}` : 'vide');
    } else if (item.contents) words.push(item.level >= 0.95 ? `plein${FEMININE.has(item.name) ? 'e' : ''} ${ofLiquid(item.contents)}` : `un reste ${ofLiquid(item.contents)}`);
    else if (item.def.fill && !item.def.pour) words.push(`vide${PLURAL.has(item.name) ? 's' : ''}`);
    if (item.def.cookware) {
      const inside = this.inPan(item);
      if (inside.length) words.push(`contient ${inside.map((i) => i.name).join(', ')}`);
    }
    if (item.dirty) words.push(`sale${PLURAL.has(item.name) ? 's' : ''}`);
    if (item.wet > 0) words.push(`mouillé${a}`);
    const door = this.doors.get(item);
    if (door?.target) words.push(`${item.def.drawer ? 'tiroir' : item.def.bin ? 'couvercle' : 'porte'} ouvert${item.def.drawer || item.def.bin ? '' : 'e'}`);
    if (this.iced.has(item)) words.push('avec glaçons');
    if (door?.keep) words.push('laissé ouvert');
    if (this.appliances.has(item)) words.push('en marche');
    if (this.heaters.get(item)?.on.some(Boolean)) words.push(`allumé${a}`);
    if (item.def.bin) {
      const n = this.binFill.get(item) ?? 0;
      words.push(n >= item.def.bin ? 'pleine' : n ? `${n} déchet${n > 1 ? 's' : ''}` : 'vide');
    }
    const sink = this.sinks.get(item);
    if (sink?.tap) words.push('robinet ouvert');
    if (sink?.plug) words.push(sink.water > 0.98 ? 'bouché, déborde' : 'bouché');
    if (this.cutUp.has(item)) words.push(`coupé${agree(item.name)} en bouchées`);
    // au congélateur : « congelée » vient déjà de la cuisson (lasagne), sinon « gelé »
    const box = this.shelfOf(item)?.shelf.def;
    if (box?.freezer) {
      if (!item.def.rawWord) words.push(`gelé${agree(item.name)}`);
    } else if (box?.cold) words.push('au frais');
    return words.join(' · ');
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

  /** Objet sous un pixel de l'écran, et si c'est sa porte ou l'un de ses boutons (n°) qui est touché. */
  private hitAt(cx: number, cy: number): { item: WorldItem; door: boolean; button?: number; point: THREE.Vector3 } | null {
    this.aim(cx, cy);
    const carried = this.character.carried;
    const objects = this.items.filter((i) => !carried.includes(i)).map((i) => i.object);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    let door = false;
    let button: number | undefined;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.name === 'porte') door = true;
      const knob = /^bouton-(\d+)$/.exec(o.name);
      if (knob) button = +knob[1];
      const item = this.items.find((i) => i.object === o);
      if (item) return { item, door, button, point: hit.point.clone() };
    }
    return null;
  }

  /** Point du sol sous un pixel de l'écran (ou null). */
  private groundPoint(cx: number, cy: number): THREE.Vector3 | null {
    this.aim(cx, cy);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    if (!hit) return null;
    // un clic sur un mur : au pied du mur, dans la pièce
    let point = hit.point, distance = hit.distance;
    for (const r of this.rooms) {
      const w = r.wallHit(this.raycaster, distance);
      if (w) ({ point, distance } = w);
    }
    return point;
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
    this.tickHeat(dt);
    this.puffs.update(Math.max(0, dt));
    this.tickDoors(dt);
    this.tickAppliances(dt);
    this.tickEating();
    this.tickWash(dt);
    this.tickPour(dt);
    this.tickSinks(dt);
    this.tickIce(dt);
    this.tickPickQueue();
    this.tickFlying(dt);
    this.debris = this.debris.filter((d) => d.update(dt));
    this.tickSleep(dt);
    this.tickNeeds(dt);
    const book = held.find((h) => h.def.buildOpen);
    if (book && c.reading?.held === book) this.wearItem(book, dt * WEAR_READ);
    this.checkWorn();
    // avec le grade d'usure de chacun (« tasse de café, usée »)
    const grade = (i: WorldItem) => gradeName(i.condition, FEMININE.has(i.name));
    const names = held.map((h) => {
      // « tasse de café », « bouteille d'eau » (l'eau est déjà dans le nom), « bouteille d'eau vide »
      const done = doneness(h.def, h.cooking);
      const base = h.contents ? (h.name.includes(h.contents) ? h.name : `${h.name} ${ofLiquid(h.contents)}`) : h.def.startFull ? `${h.name} vide` : done ? `${h.name} ${doneWord(h, done)}` : h.name;
      const n = h.dirty ? `${base} sale` : base;
      const count = c.handOf(h)?.carried.length ?? 1;
      return count > 1 ? `${n} ×${count}` : `${n}, ${grade(h)}`;
    });
    if (this.sitting && !c.seated && (c.idle || c.washing)) this.sitting = null;
    const label = this.moving ? `${this.moving.item.name}, ${grade(this.moving.item)}` : names.length ? names.join(' et ') : null;
    const can = this.handActions();
    const key = JSON.stringify(can);
    if (label !== this.heldLabel || key !== this.actionsKey) {
      this.heldLabel = label;
      this.actionsKey = key;
      this.onHeldChange?.(label, can);
    }
    const mm = this.marker.material as THREE.MeshBasicMaterial;
    mm.opacity = Math.max(0, mm.opacity - dt * 0.9);
    this.updateCamera(dt);
    const toCamera = this.camera.position.clone().sub(this.focus).normalize();
    // pièce du perso ; dans un passage (entre deux pièces, dans l'épaisseur des murs), il reste dans
    // la dernière : sans ça, le toit et les murs se relèvent le temps de traverser
    const inRoom = this.rooms.find((r) => r.contains(c.position));
    if (inRoom) this.activeRoom = inRoom;
    else if (this.activeRoom && !this.activeRoom.contains(c.position, 2 * WALL_T + 0.15)) this.activeRoom = null;
    for (const r of this.rooms) r.update(dt, this.yaw, c.position, this.clock.hour, toCamera, this.activeRoom?.rect ?? null);
    for (const tv of this.tvs.values()) tv.tick(dt);
    this.placeBubble();
    this.motes.update(now / 1000, this.character.position);
    this.post.render();
  };

  /** Ce qu'on peut faire avec ce qu'on tient (boutons de l'interface, menu au clic droit). */
  private handActions(): HandActions {
    const c = this.character;
    const held = c.heldItems;
    const book = held.find((h) => h.def.buildOpen);
    const bookHand = book ? c.handOf(book) : null;
    const last = c.held;
    return {
      drink: held.some((h) => !!h.contents && !h.def.cookware && !h.def.jug),
      eat: held.some((h) => !!h.def.food) || (held.some((h) => !!h.def.utensil) && !!this.tablePlate()),
      serve: held.some((h) => !!h.def.food) && this.items.some((i) => i.def.plate && !c.carried.includes(i) && !i.dirty && !this.foodOn(i)),
      dishes: held.some((h) => h.def.dish && h.dirty),
      cut: held.some((h) => !!h.def.cut && h.portion === 1),
      prepare: !!this.dishPlan(),
      throw: !!last && !!c.handOf(last)?.canThrow,
      moving: !!this.moving,
      read: !!bookHand && !bookHand.stacked && c.otherFree(bookHand),
      reading: !!c.reading,
      seated: !!this.sitting,
      sleeping: !!this.sleep,
    };
  }

  /** Le temps passe : les besoins baissent ; boire (café) remonte la soif et réveille un peu. */
  private tickNeeds(dt: number): void {
    const hours = this.clock.tick(dt);
    const before = this.needs.health;
    this.needs.tick(hours, this.character.lying ? 'sleep' : this.character.seated ? 'sit' : this.character.moveGait, this.clock.isNight);
    // prévenir le joueur quand la santé passe sous un seuil
    const after = this.needs.health;
    if (before > 0 && after <= 0) this.onNotice?.('Santé à zéro : le perso est à bout de forces.');
    else if (before >= 25 && after < 25) this.onNotice?.('Santé faible : un besoin est à zéro depuis trop longtemps.');
    // les récipients tenus (tasse, bouteille), dans l'une ou l'autre main
    const sips = new Map<WorldItem, { level: number; contents: string | null }>();
    for (const held of this.character.heldItems.filter((i) => i.def.fill && !i.def.cookware)) {
      const last = this.lastSips.get(held);
      // verser dans un autre récipient n'est pas boire
      const drunk = last && this.pouring?.from !== held ? last.level - held.level : 0;
      if (drunk > 0) {
        this.wearItem(held, drunk * WEAR_DRINK);
        this.needs.restore('soif', drunk * DRINK_THIRST);
        if (last?.contents === 'eau') this.needs.restore('soif', drunk * WATER_EXTRA);
        if (last?.contents === 'café') this.needs.restore('fatigue', drunk * COFFEE_ENERGY);
        if (last?.contents === 'thé') this.needs.restore('fatigue', drunk * TEA_ENERGY);
        if (last?.contents === 'jus de fruits') this.needs.restore('faim', drunk * JUICE_HUNGER);
        // un café ou un thé bu jusqu'au bout laisse un fond dans la tasse
        if ((last?.contents === 'café' || last?.contents === 'thé' || last?.contents === 'jus de fruits') && !held.contents && held.def.dish) held.setDirty(true);
      }
      sips.set(held, { level: held.level, contents: held.contents });
    }
    this.lastSips = sips;
    this.tickDry(hours);
  }

  /** La vaisselle mouillée sèche : vite sur l'égouttoir, lentement ailleurs ; les mains aussi. */
  private tickDry(hours: number): void {
    if (hours <= 0) return;
    for (const item of this.items) {
      if (item.wet <= 0) continue;
      const rack = this.shelfOf(item)?.shelf.def.rack;
      const minutes = rack ? rack.minutes : AIR_DRY_MINUTES;
      item.setWet(Math.max(0, item.wet - (hours * 60) / minutes));
    }
    if (this.wetHands > 0) this.wetHands = Math.max(0, this.wetHands - (hours * 60) / HANDS_DRY_MINUTES);
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
