/**
 * Catalogue des objets. Chaque objet a une petite fiche : peut-il être porté, avec quelle prise
 * (sinon devinée d'après sa taille) et par quel point la main le saisit. Pas d'animation par
 * objet : la pose vient du type de prise (grips.ts).
 *
 * Les objets de test sont faits de formes simples ; un objet importé (.glb) aura la même fiche.
 */
import * as THREE from 'three';
import { lightAllPasses } from '../postfx';
import { createToonMaterial } from '../toon';
import type { GripType } from './grips';
import { KITCHEN_ITEMS } from './kitchen';
import { BEDROOM_ITEMS } from './bedroom';
import { DISHES } from './recipes';
import { SALON_ITEMS } from './salon';
import { FRESH_THINGS, PAN_FOOD, PANTRY_ITEMS } from './pantry';
import { BATHROOM_ITEMS } from './bathroom';
import { PREP_FRESH, PREP_ITEMS, PREP_PAN_FOOD } from './prep';
import { UPKEEP_ITEMS } from './upkeep';

export interface ItemDef {
  id: string;
  /** Nom affiché (et compris par l'IA de RP : « prend: tasse »). */
  name: string;
  portable: boolean;
  /** Type de prise ; absent = deviné d'après la taille. */
  grip?: GripType;
  /**
   * Point saisi par la main, dans le repère de l'objet (posé au sol, haut vers +Y) ; absent =
   * centre de l'objet. Pour une prise à deux mains : centre de la prise.
   */
  gripPoint?: [number, number, number];
  /**
   * Fragilité, de 1 (se brise presque à coup sûr si on le lance) à 10 (ne casse jamais).
   * Défaut : 5.
   */
  fragility?: number;
  /**
   * Durabilité : points d'usure avant de casser (boire, lire, pousser, chocs en retirent).
   * Défaut : 100.
   */
  durability?: number;
  /** Siège : hauteur de l'assise (m). Le perso peut s'y asseoir, dos au dossier (-Z), face à +Z. */
  seat?: number;
  /** Gros meuble qu'on peut déplacer : le perso l'agrippe et le pousse au clavier. */
  movable?: boolean;
  /** Objets d'une même sorte qui s'empilent (les livres) : on peut en porter plusieurs. */
  stack?: string;
  /** Se pose couché (un livre à plat sur sa couverture), sauf rangé debout dans un meuble. */
  layFlat?: boolean;
  /**
   * Meuble de rangement : places où poser un objet debout (repère du meuble, base de l'objet),
   * l'objet tourné vers l'avant du meuble (+Z).
   */
  slots?: Array<[number, number, number]>;
  /** Ce qui va à chaque place (noms ; absent = tout ce que le meuble accepte) : l'assiette devant, les couverts au panier. */
  slotHolds?: Array<string[] | undefined>;
  /**
   * Se lit : le modèle du livre ouvert (pages vers +Z, haut vers +Y, centré), montré à la place
   * du livre fermé pendant la lecture.
   */
  buildOpen?(): THREE.Object3D;
  /**
   * Récipient qui se remplit (tasse) : sa pièce nommée `liquide` monte avec le niveau, de
   * `fill[0]` (vide) à `fill[1]` (plein) en hauteur dans l'objet. Vide au départ.
   */
  fill?: [number, number];
  /**
   * Machine qui remplit un récipient (machine à café) : où poser le récipient (repère de la
   * machine, base de l'objet, l'avant vers +Z). La pièce `jet` est l'écoulement, cachée au repos.
   */
  pour?: {
    at: [number, number, number];
    /** Récipients qu'on y remplit (le premier est celui qu'on cite : « prends la tasse »). */
    fills: string[];
    liquid: string;
    seconds: number;
    /** Couleur du liquide dans le récipient (et de la flaque s'il se renverse). */
    color: THREE.ColorRepresentation;
    /** On peut y vider un récipient qui contient autre chose (évier) ; sinon il faut le boire d'abord. */
    drain?: boolean;
  };
  /**
   * Point d'eau où se laver (évier) : où vont les mains sous le robinet (repère du meuble). La
   * pièce `jet` (l'eau qui coule) sert aussi pendant qu'on se lave.
   */
  wash?: {
    hands: [number, number, number];
    /** Où poser la vaisselle à laver au fond de la cuve (repère du meuble), une place par main. */
    dishes?: Array<[number, number, number]>;
  };
  /** Contenance d'un récipient (litres) : ce qui passe de l'un à l'autre quand on verse. Défaut : 0,25. */
  volume?: number;
  /**
   * Réservoir d'eau d'un appareil fixe (bouilloire) : contenance (litres). Il se remplit en y
   * versant de l'eau ; chaque tasse servie en prend 0,25 l.
   */
  tank?: number;
  /** Récipient déjà plein au départ (bouteille d'eau) : ce qu'il contient. */
  startFull?: string;
  /**
   * Point de l'objet qui va aux lèvres pour boire ou manger (goulot, bord de la pomme) ; absent =
   * le bord de la tasse, à l'opposé de l'anse.
   */
  mouth?: [number, number, number];
  /**
   * Récipient sans anse (verre) : le bord qui va aux lèvres pour boire, comme la tasse (sans
   * basculer comme au goulot) ; absent = le bord de la tasse, à l'opposé de l'anse.
   */
  lip?: [number, number, number];
  /** Carafe : on la remplit et on verse avec, on ne boit pas dedans. */
  jug?: boolean;
  /**
   * Se mange en `bites` bouchées ; la faim remonte de `hunger` points pour l'objet entier.
   * `color` : la bouchée piquée sur la fourchette quand on le mange dans l'assiette.
   */
  food?: { hunger: number; bites: number; color?: THREE.ColorRepresentation };
  /**
   * Vaisselle (assiette, bol, couverts, tasse, verre, carafe) : se salit quand on s'en sert et se
   * lave à l'évier (elle en ressort mouillée : voir `rack` et `towel`). Sa pièce nommée `sale`
   * (taches) n'est montrée que sale.
   */
  dish?: boolean;
  /** Assiette, bol : hauteur (m) où se pose un plat qu'on y sert. */
  plate?: number;
  /** Creux (le bol) : ne s'empile pas avec les assiettes plates. */
  deep?: boolean;
  /**
   * Couvert pour manger dans l'assiette ou le bol (fourchette, cuillère) : sa pièce `bouchee` porte
   * la bouchée jusqu'à la bouche (le point `mouth`).
   */
  utensil?: boolean;
  /**
   * Porte qui s'ouvre (frigo) : la pièce nommée `porte`, posée sur sa charnière, tourne autour de
   * Y de cet angle (rad) quand on l'ouvre.
   */
  door?: number;
  /** Meuble de rangement : noms des objets qu'on peut y ranger (absent = les livres). */
  holds?: string[];
  /** Mot du message quand il casse (« écrasé » pour une pomme) ; défaut : « brisé ». */
  breakWord?: string;
  /** Garde au frais (frigo) : on y range ce qui se mange et se boit. */
  cold?: boolean;
  /** Congélateur : garde au froid ce qu'on y range (glaçons, plats surgelés). */
  freezer?: boolean;
  /** État avant cuisson s'il ne se dit pas « cru » (« congelé » pour un plat surgelé). */
  rawWord?: string;
  /**
   * Axe de la charnière de la porte : 'y' (défaut : frigo, placard, micro-ondes) ou 'x' (posée
   * en bas, elle s'abaisse vers l'avant : four, lave-vaisselle ; en haut, angle négatif : couvercle).
   */
  doorAxis?: 'x' | 'y';
  /**
   * Tiroir : la pièce `porte` glisse vers l'avant (+Z) de cette distance (m) au lieu de tourner ;
   * ce qui est rangé dedans (`slots`, tiroir fermé) sort avec lui.
   */
  drawer?: number;
  /**
   * Appareil qui chauffe ce qu'on y range (four, micro-ondes), porte fermée : durée d'un
   * programme (s). `burns` : une deuxième cuisson brûle (four) ; sinon, on réchauffe seulement.
   * La pièce `lumiere` s'allume pendant qu'il tourne. `turns` : ce qui ressort changé (grille-pain :
   * les tranches de pain deviennent du pain grillé), nom de l'objet rangé → id de la fiche obtenue.
   * Sans porte, on le lance d'un clic mains vides ; la pièce `levier` s'abaisse pendant qu'il tourne.
   */
  heats?: { seconds: number; burns: boolean; turns?: Record<string, string> };
  /** Lave-vaisselle : durée d'un lavage (s) ; ce qui est rangé dedans ressort propre. */
  washes?: { seconds: number };
  /**
   * Mixeur : durée d'un mixage (s). Les fruits rangés dans le bol deviennent le liquide de sa fiche
   * `pour` (une tasse par fruit) ; la pièce `liquide` du bol se montre tant qu'il en reste.
   */
  blends?: { seconds: number };
  /** Éponge, torchon : essuie la table et les flaques (le geste va et vient comme un couteau). */
  wipes?: boolean;
  /** Torchon : sèche la vaisselle mouillée (lavée à la main) et les mains. */
  towel?: boolean;
  /**
   * Égouttoir : la vaisselle mouillée qu'on y range sèche en `minutes` de jeu (ailleurs, deux fois
   * plus lentement). Il n'est pas « sa place » quand on range : elle va au placard une fois sèche.
   */
  rack?: { minutes: number };
  /** Poubelle : nombre d'objets jetés avant qu'il faille la vider. La pièce `dechets` monte avec. */
  bin?: number;
  /**
   * Appareil qui chauffe (gazinière, machine à café) : il s'allume et s'éteint. `spots` : les feux
   * où poser un ustensile (repère de l'appareil, base de l'ustensile) ; la pièce `${lit}-${i}`
   * (flamme, voyant) se montre quand le feu n° i est allumé, et un clic sur la pièce `bouton-${i}`
   * l'allume ou l'éteint. Il lui faut `warmup` secondes pour chauffer ; `autoOff` : s'éteint seul
   * après autant de secondes sans servir.
   */
  heat?: { spots: Array<[number, number, number]>; lit: string; warmup: number; autoOff?: number };
  /** Ustensile qui va sur le feu (poêle, casserole) : ce qu'on y met (noms), et où (repère de l'ustensile, base de l'ingrédient). */
  cookware?: { holds: string[]; places: Array<[number, number, number]> };
  /**
   * Ingrédient qui cuit (cooking.ts) : `seconds` sur un feu bien chaud pour être cuit, puis `burn`
   * de plus pour brûler ; couleurs cru, cuit et brûlé des pièces nommées `cuit`.
   */
  cook?: { seconds: number; burn: number; colors: [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation] };
  /** Aliment qui se coupe sur la planche : l'id de l'objet qu'il devient (ses morceaux). */
  cut?: string;
  /** Planche à découper : on y pose l'aliment pour le couper. */
  board?: boolean;
  /** Couteau : sert à couper sur la planche. */
  knife?: boolean;
  /**
   * Lit : on s'y couche pour dormir (la tête à -Z, sur l'oreiller). `top` : dessus du matelas (m),
   * `length` : longueur du lit. La pièce `couette-dormeur` se montre sur le dormeur, à la place
   * de la pièce `couette`.
   */
  bed?: { top: number; length: number };
  /**
   * Lampe qu'on allume d'un clic (lampe de chevet) : la lumière part à `y` (m) au-dessus du pied ;
   * la pièce `ampoule` brille et la pièce `abat-jour` s'éclaire quand elle est allumée.
   */
  lamp?: { y: number; color: THREE.ColorRepresentation; intensity: number; range: number };
  /** Télé : s'allume et s'éteint ; sa pièce `ecran` montre un programme allumée, le `voyant` de veille éteinte. */
  screen?: boolean;
  /** Lavabo : un miroir où se regarder (hauteur de son milieu, m) ; sa pièce `buee` se couvre après la douche. */
  mirror?: { y: number };
  /**
   * Douche : on y entre pour se laver de la tête aux pieds en `seconds` secondes. `stand` : où se
   * tenir sous l'eau (x, z, repère de la douche) ; `head` : le pommeau. La pièce `jet` (les filets
   * d'eau) et la pièce `vapeur` se montrent pendant la douche.
   */
  shower?: { seconds: number; stand: [number, number]; head: [number, number, number] };
  /** Toilettes : on s'y assoit pour se soulager (besoin « vessie »), puis on tire la chasse. Pièces `couvercle` et `eau`. */
  toilet?: boolean;
  /** Fouet, spatule, cuillère en bois, louche : mélange, remue, sert (le geste va et vient comme un couteau). */
  stirs?: boolean;
  /** Râpe : râpe le fromage tenu dans l'autre main au-dessus d'un plat. */
  grates?: boolean;
  /** Pot de l'étagère à épices : le mot du geste (« du sel ») quand on assaisonne avec. */
  spice?: string;
  /** Saladier : on y casse les œufs, verse lait et farine, puis on mélange (Game.mixes). */
  mixes?: boolean;
  /** Serviette de bain : sert à se sécher après la douche ; sa pièce `mouillee` se montre ensuite, le temps qu'elle sèche. */
  bathTowel?: boolean;
  /**
   * Rangement au mur (barre à couteaux, crochets) : ce qui est rangé pend, tourné de cet angle
   * (Euler YXZ, rad) en plus de l'orientation du meuble.
   */
  slotTilt?: [number, number, number];
  /** Horloge : ses pièces `aiguille-heures` et `aiguille-minutes` tournent avec l'heure du jeu (autour de Z). */
  clock?: boolean;
  /** Fenêtre qui s'ouvre (pièce `porte`, le battant) : ouverte, elle aère la pièce. */
  window?: boolean;
  /** Où l'on mange assis : `repas` (la table, on y met le couvert) ou `comptoir` (l'îlot, sur le pouce). */
  table?: 'repas' | 'comptoir';
  /** Balai (et sa pelle) : ramasse les éclats et les miettes au sol. */
  sweeps?: boolean;
  /** Serpillière : essuie d'un coup les grandes flaques. */
  mops?: boolean;
  /** Conteneur dehors : on y jette les sacs poubelle ; le camion le vide chaque matin. */
  outdoor?: boolean;
  /** Spray nettoyant : avec l'éponge, nettoie le plan de travail et la gazinière sales. */
  spray?: boolean;
  /** Gants de ménage : on les enfile pour laver et nettoyer sans s'abîmer ni se salir les mains. */
  gloves?: boolean;
  /** Savon à côté de l'évier : on se lave les mains avec. */
  soap?: boolean;
  build(): THREE.Object3D;
}

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

/** Hauteur du plateau de la table (m). */
export const TABLE_H = 0.74;
/** Épaisseur d'un livre (m) : les places d'un rayon sont collées les unes aux autres. */
const BOOK_T = 0.045;
/** Bibliothèque : trois rayons (dessus des planches), places de gauche à droite sur chacun. */
const SHELF_W = 1.0;
const SHELF_D = 0.3;
const SHELF_H = 1.42;
const SHELVES = [0.06, 0.5, 0.94];
export const SLOTS_PER_SHELF = 20;
const SHELF_SLOTS = SHELVES.flatMap((y) =>
  Array.from({ length: SLOTS_PER_SHELF }, (_, i): [number, number, number] => [-0.47 + BOOK_T / 2 + 0.002 + i * (BOOK_T + 0.001), y, 0]),
);

/**
 * Un livre (fiche commune, couleurs différentes). Debout, haut vers +Y, dos vers -Z ; la paume
 * se pose à plat sur la couverture.
 */
/** Le livre de recettes de la cuisine : un livre rouge à bandeau crème ; le lire ouvre la liste des recettes. */
function recipeBook(): ItemDef {
  const base = book('livre-recettes', 0xb8432f);
  return {
    ...base,
    name: 'livre de recettes',
    stack: undefined,
    build: () => {
      const g = base.build();
      g.add(mesh(new THREE.BoxGeometry(BOOK_T + 0.002, 0.05, 0.12), 0xf1e2c0, 0, 0.16, 0));
      return g;
    },
  };
}

function book(id: string, color: THREE.ColorRepresentation): ItemDef {
  return {
    id,
    name: 'livre',
    portable: true,
    grip: 'chest',
    gripPoint: [-BOOK_T / 2, 0.13, 0],
    stack: 'livre',
    layFlat: true,
    fragility: 8,
    durability: 100,
    buildOpen: () => {
      // deux moitiés en léger V autour du dos, pages crème côté lecteur
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const half = new THREE.Group();
        half.add(mesh(new THREE.BoxGeometry(0.17, 0.24, 0.006), color, (s * 0.17) / 2, 0, -0.003));
        half.add(mesh(new THREE.BoxGeometry(0.16, 0.226, 0.016), 0xf1e7cf, (s * 0.16) / 2, 0, 0.008));
        half.rotation.y = -s * 0.18;
        g.add(half);
      }
      return g;
    },
    build: () => {
      const cover = mesh(new THREE.BoxGeometry(BOOK_T, 0.24, 0.17), color, 0, 0.12, 0);
      const pages = mesh(new THREE.BoxGeometry(0.038, 0.226, 0.16), 0xf1e7cf, 0, 0.12, 0.007);
      return group(cover, pages);
    },
  };
}

/** Hauteur du plan de travail sous la machine à café (m). */
const COUNTER_H = 0.9;
const CUP_R = 0.042;
/** Évier : largeur et profondeur du meuble, cuve (ouverture, profondeur, centre en z), bout du robinet. */
const SINK_W = 0.8;
const SINK_D = 0.5;
const BASIN_W = 0.48;
const BASIN_D = 0.32;
const BASIN_H = 0.18;
const BASIN_Z = 0.065;
const TAP_Z = 0.03;
const TAP_Y = COUNTER_H + 0.25;
const CUP_H = 0.1;

/** Frigo : largeur, profondeur (sans la porte), hauteur, épaisseur des parois et de la porte (m). */
const FRIDGE_W = 0.6;
const FRIDGE_D = 0.6;
const FRIDGE_H = 1.55;
const FRIDGE_T = 0.03;
const FRIDGE_DOOR_T = 0.05;
/** Dessus des clayettes (le bas du frigo compris) ; places de gauche à droite, près de la porte. */
const FRIDGE_SHELVES = [FRIDGE_T + 0.03, 0.55, 0.98, 1.25];
const FRIDGE_ROW = (z: number, shelves: number[]) => shelves.flatMap((y) => [-0.19, -0.065, 0.065, 0.19].map((x): [number, number, number] => [x, y, z]));
/**
 * Devant sur les trois premières clayettes (places 0 à 11), puis au fond, puis la clayette du haut,
 * puis une rangée au milieu des deux clayettes du haut (32 à 39 : les œufs, le beurre…).
 */
const FRIDGE_SLOTS = [...FRIDGE_ROW(0.13, FRIDGE_SHELVES.slice(0, 3)), ...FRIDGE_ROW(-0.1, FRIDGE_SHELVES.slice(0, 3)), ...FRIDGE_ROW(0.13, [1.25]), ...FRIDGE_ROW(-0.1, [1.25]), ...FRIDGE_ROW(0.015, [0.98, 1.25])];

/** Gazinière : largeur, profondeur ; feux (avant gauche, avant droit, arrière gauche, arrière droit), dessus des grilles. */
const STOVE_W = 0.6;
const STOVE_D = 0.58;
const GRATE_H = 0.03;
const STOVE_SPOTS: Array<[number, number, number]> = [[-0.14, 0.1], [0.14, 0.1], [-0.14, -0.13], [0.14, -0.13]].map(([x, z]): [number, number, number] => [x, COUNTER_H + GRATE_H, z]);
/** Boutons des feux, de gauche à droite : arrière gauche, avant gauche, avant droit, arrière droit. */
const STOVE_KNOBS = [-0.07, 0.07, -0.21, 0.21];
/** Poêle et casserole : rayon, hauteur du bord, longueur du manche (m). */
const PAN_R = 0.1;
const PAN_H = 0.04;
const POT_R = 0.085;
const POT_H = 0.11;
const HANDLE_L = 0.17;
/** Épaisseur du fond des ustensiles : les ingrédients reposent dessus. */
const PAN_FLOOR = 0.008;
/** Plan de travail : largeur et profondeur du meuble (m), à la hauteur de l'évier. */
const WORKTOP_W = 0.9;
const WORKTOP_D = 0.5;
/** Planche à découper : longueur, épaisseur, largeur (m). */
const BOARD_W = 0.36;
const BOARD_T = 0.02;
const BOARD_D = 0.24;

const BOTTLE_R = 0.033;
const BOTTLE_H = 0.24;
const APPLE_R = 0.04;
/** Assiette : rayon, hauteur du bord, hauteur du fond où l'on sert (m). */
const PLATE_R = 0.12;
const PLATE_H = 0.022;
const PLATE_IN = 0.012;
/** Couverts : longueur et épaisseur ; couchés à plat, le plat du manche tourné vers le haut. */
const CUTLERY_L = 0.19;
const CUTLERY_T = 0.004;
/** Taches de repas sur la vaisselle sale. */
const STAIN = 0x8a5a2b;
/** Verre : rayon du bord, du pied, hauteur (m). */
const GLASS_R = 0.036;
const GLASS_RB = 0.031;
const GLASS_H = 0.11;
/** Bol : rayon du bord, du pied, hauteur, fond où l'on sert (m). */
const BOWL_R = 0.072;
const BOWL_RB = 0.04;
const BOWL_H = 0.065;
const BOWL_IN = 0.01;
/** Carafe : rayon, haut de la partie droite, rayon du col, hauteur (m). */
const CARAFE_R = 0.048;
const CARAFE_BODY = 0.17;
const CARAFE_NECK = 0.028;
const CARAFE_H = 0.24;
/** Chaise en bois : assise (hauteur, largeur, profondeur), haut du dossier, section des pieds (m). */
const SEAT_H = 0.45;
const SEAT_W = 0.42;
const SEAT_D = 0.4;
const CHAIR_H = 0.9;
const LEG = 0.036;

/**
 * Morceaux d'un aliment coupé sur la planche (quartiers, tranches, rondelles) : se mangent comme
 * l'aliment entier, pris entre les doigts.
 */
function pieces(id: string, name: string, food: { hunger: number; bites: number }, build: () => THREE.Object3D): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.01, 0.04],
    mouth: [0, 0.015, -0.04],
    food,
    fragility: 10,
    durability: 15,
    breakWord: 'écrasé',
    build,
  };
}

/** `n` rondelles couchées en petit tas : peau `skin` sur le bord, chair `flesh` dessus. */
function disks(n: number, r: number, h: number, skin: THREE.ColorRepresentation, flesh: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    // en spirale serrée, un peu les unes sur les autres
    const a = i * 2.4, d = Math.sqrt(i / n) * r * 2.2;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = (i % 3) * h * 0.6;
    g.add(mesh(new THREE.CylinderGeometry(r, r, h, 16), skin, x, y + h / 2, z));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, h + 0.001, 16), flesh, x, y + h / 2, z));
  }
  return g;
}

export const ITEMS: ItemDef[] = [
  {
    id: 'tasse',
    name: 'tasse',
    portable: true,
    grip: 'fist',
    // tenue par l'anse
    gripPoint: [0, CUP_H * 0.55, CUP_R + 0.02],
    fill: [0.012, CUP_H - 0.012],
    // un café bu laisse un fond : elle se lave à l'évier
    dish: true,
    fragility: 2,
    durability: 40,
    build: () => {
      // ouverte en haut (on voit le café dedans), parois visibles des deux côtés
      const body = mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.85, CUP_H, 20, 1, true), 0xe9e2d0, 0, CUP_H / 2, 0);
      (body.material as THREE.Material).side = THREE.DoubleSide;
      const bottom = mesh(new THREE.CircleGeometry(CUP_R * 0.85, 20).rotateX(-Math.PI / 2), 0xd8d0bc, 0, 0.006, 0);
      const coffee = mesh(new THREE.CircleGeometry(CUP_R * 0.97, 20).rotateX(-Math.PI / 2), 0x4a2c1a, 0, CUP_H - 0.012, 0);
      coffee.name = 'liquide';
      const handle = mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), 0xe9e2d0, 0, CUP_H * 0.55, CUP_R + 0.012);
      handle.rotation.y = Math.PI / 2;
      // fond de café séché, caché sous le liquide quand elle est pleine
      const stain = mesh(new THREE.RingGeometry(CUP_R * 0.45, CUP_R * 0.82, 20).rotateX(-Math.PI / 2), 0x5a3a22, 0, 0.008, 0);
      stain.name = 'sale';
      return group(body, bottom, coffee, handle, stain);
    },
  },
  {
    id: 'lettre',
    name: 'lettre',
    portable: true,
    fragility: 10,
    durability: 30,
    // pas de prise indiquée : devinée (petite et fine → entre les doigts)
    gripPoint: [0, 0.015, -0.05],
    build: () => {
      const paper = mesh(new THREE.BoxGeometry(0.11, 0.004, 0.15), 0xf4ead2, 0, 0.002, 0);
      const seal = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), 0xb0302a, 0, 0.005, 0.02);
      return group(paper, seal);
    },
  },
  book('livre', 0x3e5d8a),
  book('livre-rouge', 0x9a3b34),
  book('livre-vert', 0x3f6e48),
  book('livre-ocre', 0xb08a3a),
  recipeBook(),
  book('livre-violet', 0x5e4a86),
  {
    id: 'caisse',
    name: 'caisse',
    portable: true,
    grip: 'twoHands',
    gripPoint: [0, 0.17, 0],
    fragility: 5,
    durability: 150,
    build: () => {
      const s = 0.34;
      const box = mesh(new THREE.BoxGeometry(s, s, s), 0xa8743f, 0, s / 2, 0);
      const plankMat = toon(0x7a4f2a);
      const g = group(box);
      for (const y of [0.04, s - 0.04]) {
        for (const [rx, rz, sx, sz] of [[0, s / 2, s + 0.01, 0.01], [0, -s / 2, s + 0.01, 0.01], [s / 2, 0, 0.01, s + 0.01], [-s / 2, 0, 0.01, s + 0.01]]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), plankMat);
          p.position.set(rx, y, rz);
          p.castShadow = true;
          g.add(p);
        }
      }
      return g;
    },
  },
  {
    id: 'chaise',
    name: 'chaise',
    portable: true,
    // à deux mains, par les montants du dossier : la chaise devant soi, l'assise vers l'avant
    grip: 'twoHands',
    gripPoint: [0, 0.66, -SEAT_D / 2 + LEG / 2],
    fragility: 6,
    durability: 150,
    seat: SEAT_H,
    build: () => {
      // l'avant de l'assise vers +Z, le dossier côté -Z
      const wood = 0x8a5a34, seat = 0xa26e40;
      const x = SEAT_W / 2 - LEG / 2, z = SEAT_D / 2 - LEG / 2;
      const g = group(mesh(new THREE.BoxGeometry(SEAT_W, 0.035, SEAT_D), seat, 0, SEAT_H - 0.0175, 0));
      // pieds avant ; pieds arrière prolongés en montants du dossier
      for (const sx of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(LEG, SEAT_H - 0.035, LEG), wood, sx * x, (SEAT_H - 0.035) / 2, z));
        g.add(mesh(new THREE.BoxGeometry(LEG, CHAIR_H, LEG), wood, sx * x, CHAIR_H / 2, -z));
      }
      // traverses sous l'assise, haut du dossier et barreau du milieu
      g.add(mesh(new THREE.BoxGeometry(SEAT_W - 2 * LEG, 0.05, 0.02), wood, 0, SEAT_H - 0.06, z));
      g.add(mesh(new THREE.BoxGeometry(SEAT_W - 2 * LEG, 0.1, 0.022), wood, 0, CHAIR_H - 0.07, -z));
      g.add(mesh(new THREE.BoxGeometry(SEAT_W - 2 * LEG, 0.045, 0.02), wood, 0, SEAT_H + 0.17, -z));
      return g;
    },
  },
  {
    id: 'bibliotheque',
    name: 'bibliothèque',
    portable: false,
    movable: true,
    durability: 400,
    slots: SHELF_SLOTS,
    build: () => {
      const wood = 0x7a5232, dark = 0x5b3b22;
      const t = 0.03;
      const g = group(
        mesh(new THREE.BoxGeometry(t, SHELF_H, SHELF_D), wood, -SHELF_W / 2 + t / 2, SHELF_H / 2, 0),
        mesh(new THREE.BoxGeometry(t, SHELF_H, SHELF_D), wood, SHELF_W / 2 - t / 2, SHELF_H / 2, 0),
        mesh(new THREE.BoxGeometry(SHELF_W, SHELF_H, 0.015), dark, 0, SHELF_H / 2, -SHELF_D / 2 + 0.0075),
        mesh(new THREE.BoxGeometry(SHELF_W, t, SHELF_D), wood, 0, SHELF_H - t / 2, 0),
      );
      for (const y of SHELVES) g.add(mesh(new THREE.BoxGeometry(SHELF_W - 2 * t, t, SHELF_D - 0.015), wood, 0, y - t / 2, 0.0075));
      return g;
    },
  },
  {
    id: 'machine-a-cafe',
    name: 'machine à café',
    portable: false,
    movable: true,
    durability: 250,
    // la tasse se pose sur la grille, sous le bec, l'anse vers l'avant
    pour: { at: [0, COUNTER_H + 0.016, 0.1], fills: ['tasse'], liquid: 'café', seconds: 2.6, color: 0x4a2c1a },
    // comme un feu de la gazinière : le bouton rouge l'allume, il chauffe, puis le café coule ;
    // le voyant reste allumé, et elle se met en veille si on l'oublie
    heat: { spots: [[0, COUNTER_H + 0.016, 0.1]], lit: 'voyant', warmup: 3, autoOff: 45 },
    build: () => {
      const H = COUNTER_H;
      const body = 0x2e3135, metal = 0xb9bfc6;
      const g = group(
        // petit meuble de cuisine
        mesh(new THREE.BoxGeometry(0.6, H - 0.03, 0.4), 0x8a6440, 0, (H - 0.03) / 2, 0),
        mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), 0xd9d3c5, 0, H - 0.015, 0),
        mesh(new THREE.BoxGeometry(0.5, 0.006, 0.01), 0x5d4129, 0, H - 0.12, 0.2),
        // machine : colonne, tête avec le bec, grille d'égouttage, réservoir d'eau
        mesh(new THREE.BoxGeometry(0.24, 0.36, 0.16), body, 0, H + 0.18, -0.1),
        mesh(new THREE.BoxGeometry(0.24, 0.08, 0.32), body, 0, H + 0.32, -0.02),
        mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.03, 12), metal, 0, H + 0.265, 0.1),
        mesh(new THREE.BoxGeometry(0.2, 0.016, 0.16), metal, 0, H + 0.008, 0.08),
        mesh(new THREE.BoxGeometry(0.07, 0.3, 0.12), 0x7fb2c9, 0.155, H + 0.16, -0.1),
      );
      // bouton marche / arrêt, et son voyant (allumé quand la machine chauffe)
      const button = group(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 14).rotateX(Math.PI / 2), 0xd0463a, 0.07, H + 0.32, 0.142));
      button.name = 'bouton-0';
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      lamp.name = 'voyant';
      lamp.position.set(-0.07, H + 0.32, 0.142);
      const lit = group(lamp);
      lit.name = 'voyant-0';
      lit.visible = false;
      g.add(button, lit);
      // café qui coule du bec dans la tasse
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), toon(0x3b2213));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(0, H + 0.25, 0.1);
      g.add(jet);
      return g;
    },
  },
  {
    id: 'evier',
    name: 'évier',
    portable: false,
    // raccordé à l'eau : il ne se déplace pas
    movable: false,
    // inox et meuble en bois : solide (il ne se lance pas, la fragilité ne joue pas encore)
    fragility: 7,
    durability: 300,
    // la tasse se pose au fond de la cuve, sous le robinet, l'anse vers l'avant
    // la tasse, la bouteille, ou la casserole pour faire cuire à l'eau
    pour: { at: [0, COUNTER_H - BASIN_H, TAP_Z], fills: ['tasse', 'verre', 'carafe', 'casserole', "bouteille d'eau"], liquid: 'eau', seconds: 2, color: 0x9fcde6, drain: true },
    // la vaisselle au fond de la cuve, de part et d'autre du filet d'eau
    wash: { hands: [0, COUNTER_H + 0.08, TAP_Z + 0.05], dishes: [[-0.11, COUNTER_H - BASIN_H, BASIN_Z + 0.02], [0.11, COUNTER_H - BASIN_H, BASIN_Z - 0.04]] },
    build: () => {
      const H = COUNTER_H, top = 0.04;
      const wood = 0x8a6440, counter = 0xd9d3c5, steel = 0xb9bfc6, inside = 0x98a1aa;
      const z0 = BASIN_Z - BASIN_D / 2, z1 = BASIN_Z + BASIN_D / 2, x1 = BASIN_W / 2;
      const cw = SINK_W + 0.02, cd = SINK_D + 0.02;
      const g = group(
        // meuble bas, deux portes
        mesh(new THREE.BoxGeometry(SINK_W, H - top, SINK_D), wood, 0, (H - top) / 2, 0),
        mesh(new THREE.BoxGeometry(0.006, H - top - 0.1, 0.01), 0x5d4129, 0, (H - top) / 2, SINK_D / 2),
        mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), 0xc9c2b0, -0.04, H - 0.2, SINK_D / 2 + 0.008),
        mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), 0xc9c2b0, 0.04, H - 0.2, SINK_D / 2 + 0.008),
        // plan de travail percé pour la cuve
        mesh(new THREE.BoxGeometry(cw, top, z0 + cd / 2), counter, 0, H - top / 2, (z0 - cd / 2) / 2),
        mesh(new THREE.BoxGeometry(cw, top, cd / 2 - z1), counter, 0, H - top / 2, (z1 + cd / 2) / 2),
        mesh(new THREE.BoxGeometry(cw / 2 - x1, top, BASIN_D), counter, -(x1 + cw / 2) / 2, H - top / 2, BASIN_Z),
        mesh(new THREE.BoxGeometry(cw / 2 - x1, top, BASIN_D), counter, (x1 + cw / 2) / 2, H - top / 2, BASIN_Z),
        // cuve en inox : fond, bonde, quatre parois
        mesh(new THREE.BoxGeometry(BASIN_W, 0.01, BASIN_D), inside, 0, H - BASIN_H - 0.005, BASIN_Z),
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16), 0x55595e, 0.12, H - BASIN_H + 0.002, BASIN_Z + 0.04),
        mesh(new THREE.BoxGeometry(0.01, BASIN_H, BASIN_D), inside, -x1, H - BASIN_H / 2, BASIN_Z),
        mesh(new THREE.BoxGeometry(0.01, BASIN_H, BASIN_D), inside, x1, H - BASIN_H / 2, BASIN_Z),
        mesh(new THREE.BoxGeometry(BASIN_W, BASIN_H, 0.01), inside, 0, H - BASIN_H / 2, z0),
        mesh(new THREE.BoxGeometry(BASIN_W, BASIN_H, 0.01), inside, 0, H - BASIN_H / 2, z1),
        // robinet col de cygne : pied, colonne, bec, manette
        mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 16), steel, 0, H + 0.015, -0.2),
        mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 12), steel, 0, H + 0.15, -0.2),
        mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.24, 12).rotateX(Math.PI / 2), steel, 0, H + 0.29, (-0.2 + TAP_Z) / 2),
        mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.04, 12), steel, 0, TAP_Y + 0.02, TAP_Z),
        mesh(new THREE.BoxGeometry(0.016, 0.016, 0.08).rotateX(-0.5), steel, 0, H + 0.33, -0.225),
      );
      // l'eau qui monte dans la cuve bouchée (Game.tickSinks), et le bouchon sur la bonde
      const pool = new THREE.Mesh(new THREE.BoxGeometry(BASIN_W - 0.012, 1, BASIN_D - 0.012), new THREE.MeshBasicMaterial({ color: 0x8fc3e0, transparent: true, opacity: 0.7, depthWrite: false }));
      pool.name = 'cuve';
      pool.visible = false;
      pool.position.set(0, H - BASIN_H, BASIN_Z);
      pool.userData = { floor: H - BASIN_H, depth: BASIN_H - 0.01 };
      const plug = mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.012, 16), 0x2a2b2e, 0.12, H - BASIN_H + 0.008, BASIN_Z + 0.04);
      plug.name = 'bouchon';
      plug.visible = false;
      g.add(pool, plug);
      // l'eau qui coule du robinet
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), toon(0x9fd3ef));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(0, TAP_Y, TAP_Z);
      g.add(jet);
      return g;
    },
  },
  {
    id: 'frigo',
    name: 'frigo',
    portable: false,
    movable: true,
    // métal et plastique épais : ne se brise pas d'un choc, mais finit par lâcher à force d'être ouvert et poussé
    fragility: 8,
    durability: 350,
    door: THREE.MathUtils.degToRad(105),
    cold: true,
    holds: ["bouteille d'eau", 'pomme', 'sandwich', 'pain', 'carotte', 'tomate', 'concombre', 'quartiers de pomme', 'tranches de pain', 'rondelles de carotte', 'tranches de tomate', 'rondelles de concombre', 'steak', ...FRESH_THINGS, ...PREP_FRESH],
    slots: FRIDGE_SLOTS,
    build: () => {
      const W = FRIDGE_W, D = FRIDGE_D, H = FRIDGE_H, t = FRIDGE_T;
      const shell = 0xe9e6de, inside = 0xf3f5f4, glass = 0xc9dfe6;
      const g = group(
        // caisse ouverte à l'avant : côtés, fond, dessus, bas
        mesh(new THREE.BoxGeometry(t, H, D), shell, -W / 2 + t / 2, H / 2, 0),
        mesh(new THREE.BoxGeometry(t, H, D), shell, W / 2 - t / 2, H / 2, 0),
        mesh(new THREE.BoxGeometry(W, H, t), shell, 0, H / 2, -D / 2 + t / 2),
        mesh(new THREE.BoxGeometry(W, t, D), shell, 0, H - t / 2, 0),
        mesh(new THREE.BoxGeometry(W, t, D), shell, 0, t / 2, 0),
        // intérieur plus clair, socle sombre
        mesh(new THREE.BoxGeometry(W - 2 * t, H - 2 * t, 0.004), inside, 0, H / 2, -D / 2 + t + 0.002),
        mesh(new THREE.BoxGeometry(W + 0.004, 0.05, 0.04), 0x8d9093, 0, 0.025, D / 2 - 0.02),
      );
      for (const y of FRIDGE_SHELVES.slice(1)) g.add(mesh(new THREE.BoxGeometry(W - 2 * t, 0.012, D - t - 0.02), glass, 0, y - 0.006, 0.0));
      // porte : la charnière à droite (+X), à l'avant ; elle s'ouvre vers l'avant
      const door = new THREE.Group();
      door.name = 'porte';
      door.position.set(W / 2, 0, D / 2);
      door.add(
        mesh(new THREE.BoxGeometry(W, H - 0.06, FRIDGE_DOOR_T), shell, -W / 2, 0.06 + (H - 0.06) / 2, FRIDGE_DOOR_T / 2),
        // joint et bacs de porte, vus quand elle est ouverte
        mesh(new THREE.BoxGeometry(W - 0.06, H - 0.16, 0.006), 0xd5d8d6, -W / 2, 0.06 + (H - 0.06) / 2, -0.003),
        // poignée côté gauche, à hauteur de main
        mesh(new THREE.BoxGeometry(0.025, 0.36, 0.03), 0x9ea4aa, -W + 0.05, 1.02, FRIDGE_DOOR_T + 0.025),
        mesh(new THREE.BoxGeometry(0.025, 0.025, 0.03), 0x9ea4aa, -W + 0.05, 1.19, FRIDGE_DOOR_T + 0.01),
        mesh(new THREE.BoxGeometry(0.025, 0.025, 0.03), 0x9ea4aa, -W + 0.05, 0.85, FRIDGE_DOOR_T + 0.01),
      );
      g.add(door);
      // la lampe du frigo, sous le dessus : allumée quand la porte s'ouvre (Game.tickDoors)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xe8e2d0 }));
      lamp.name = 'lampe';
      lamp.position.set(0, H - t - 0.012, -D / 2 + 0.12);
      lamp.visible = false;
      // sur tous les calques comme les autres lumières (sinon recompilation de chaque matériau à chaque image)
      const glow = lightAllPasses(new THREE.PointLight(0xfff3d6, 0, 0.45, 2));
      glow.name = 'lampe-lumiere';
      glow.position.set(0, H - t - 0.1, -0.05);
      g.add(lamp, glow);
      return g;
    },
  },
  {
    id: 'bouteille-eau',
    name: "bouteille d'eau",
    portable: true,
    grip: 'fist',
    // tenue par le milieu, côté +Z dans le poing ; on boit au goulot
    gripPoint: [0, 0.1, BOTTLE_R],
    mouth: [0, BOTTLE_H, 0],
    fill: [0.008, 0.18],
    volume: 0.5,
    startFull: 'eau',
    // plastique : se cabosse plus qu'il ne casse
    fragility: 9,
    durability: 40,
    breakWord: 'fendu',
    build: () => {
      const R = BOTTLE_R;
      // plastique transparent : on voit le niveau de l'eau baisser
      const body = mesh(new THREE.CylinderGeometry(R, R, 0.19, 18, 1, true), 0xd6ecf5, 0, 0.095, 0);
      const bm = body.material as THREE.MeshToonMaterial;
      bm.transparent = true;
      bm.opacity = 0.45;
      bm.depthWrite = false;
      bm.side = THREE.DoubleSide;
      const bottom = mesh(new THREE.CircleGeometry(R, 18).rotateX(-Math.PI / 2), 0xbcd9e6, 0, 0.002, 0);
      const shoulder = mesh(new THREE.CylinderGeometry(0.012, R, 0.035, 18), 0xd6ecf5, 0, 0.2075, 0);
      const sm = shoulder.material as THREE.MeshToonMaterial;
      sm.transparent = true;
      sm.opacity = 0.55;
      sm.depthWrite = false;
      const cap = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.015, 12), 0x2f6fb3, 0, BOTTLE_H - 0.0075, 0);
      const label = mesh(new THREE.CylinderGeometry(R + 0.001, R + 0.001, 0.05, 18, 1, true), 0x3d86c6, 0, 0.13, 0);
      // colonne d'eau : hauteur 1 de 0 à 1, mise à l'échelle par le niveau (ItemDef.fill)
      const water = mesh(new THREE.CylinderGeometry(R * 0.92, R * 0.92, 1, 18).translate(0, 0.5, 0), 0x7fbde0, 0, 0.008, 0);
      water.name = 'liquide';
      water.userData.column = true;
      water.renderOrder = -1;
      return group(water, bottom, body, shoulder, cap, label);
    },
  },
  {
    id: 'pomme',
    name: 'pomme',
    portable: true,
    grip: 'fist',
    gripPoint: [0, APPLE_R, APPLE_R],
    // on croque le côté opposé à la paume
    mouth: [0, APPLE_R * 1.2, -APPLE_R],
    food: { hunger: 12, bites: 4, color: 0xf3e3b0 },
    cut: 'quartiers-pomme',
    // un fruit ne se brise pas : il s'écrase s'il tombe fort
    fragility: 6,
    durability: 20,
    breakWord: 'écrasé',
    build: () => {
      const fruit = mesh(new THREE.SphereGeometry(APPLE_R, 16, 12).scale(1, 0.92, 1), 0xc0392b, 0, APPLE_R * 0.92, 0);
      const stem = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 6), 0x6b4a2b, 0, APPLE_R * 1.84 + 0.006, 0);
      const leaf = mesh(new THREE.SphereGeometry(0.009, 8, 6).scale(1.6, 0.35, 0.8), 0x4f8a3a, 0.01, APPLE_R * 1.84 + 0.008, 0);
      return group(fruit, stem, leaf);
    },
  },
  {
    id: 'sandwich',
    name: 'sandwich',
    portable: true,
    grip: 'fist',
    // tenu par un bord, croqué par l'autre
    gripPoint: [0, 0.025, 0.045],
    mouth: [0, 0.03, -0.045],
    food: { hunger: 30, bites: 4, color: 0xe2b871 },
    // pain et garniture : rien à casser
    fragility: 10,
    durability: 20,
    build: () => {
      const bread = 0xe2b871, crust = 0xb98a4a;
      return group(
        mesh(new THREE.BoxGeometry(0.11, 0.016, 0.09), bread, 0, 0.008, 0),
        mesh(new THREE.BoxGeometry(0.115, 0.006, 0.095), 0x6fae4b, 0, 0.019, 0),
        mesh(new THREE.BoxGeometry(0.105, 0.008, 0.085), 0xe7a3a0, 0, 0.026, 0),
        mesh(new THREE.BoxGeometry(0.108, 0.005, 0.088), 0xf2cf5b, 0, 0.0325, 0),
        mesh(new THREE.BoxGeometry(0.11, 0.016, 0.09), bread, 0, 0.043, 0),
        mesh(new THREE.BoxGeometry(0.112, 0.004, 0.092), crust, 0, 0.0515, 0),
      );
    },
  },
  {
    id: 'plan-de-travail',
    name: 'plan de travail',
    portable: false,
    movable: true,
    // bois et stratifié : solide
    fragility: 7,
    durability: 300,
    build: () => {
      const H = COUNTER_H, top = 0.04;
      const wood = 0x8a6440, counter = 0xd9d3c5, line = 0x5d4129, knob = 0xc9c2b0;
      return group(
        // meuble bas : un tiroir en haut, deux portes dessous
        mesh(new THREE.BoxGeometry(WORKTOP_W, H - top, WORKTOP_D), wood, 0, (H - top) / 2, 0),
        mesh(new THREE.BoxGeometry(WORKTOP_W + 0.02, top, WORKTOP_D + 0.02), counter, 0, H - top / 2, 0),
        mesh(new THREE.BoxGeometry(WORKTOP_W - 0.08, 0.006, 0.01), line, 0, H - 0.17, WORKTOP_D / 2),
        mesh(new THREE.BoxGeometry(0.006, H - top - 0.24, 0.01), line, 0, (H - top - 0.15) / 2, WORKTOP_D / 2),
        mesh(new THREE.BoxGeometry(0.12, 0.014, 0.014), knob, 0, H - 0.1, WORKTOP_D / 2 + 0.008),
        mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), knob, -0.04, H - 0.3, WORKTOP_D / 2 + 0.008),
        mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), knob, 0.04, H - 0.3, WORKTOP_D / 2 + 0.008),
      );
    },
  },
  {
    id: 'planche',
    name: 'planche à découper',
    portable: true,
    // tenue par la poignée, le long du corps
    grip: 'side',
    gripPoint: [-BOARD_W / 2 - 0.02, BOARD_T / 2, 0],
    board: true,
    // du bois : ne casse pas, s'use à force de coups de couteau
    fragility: 10,
    durability: 150,
    build: () => {
      const wood = 0xc89b62;
      return group(
        mesh(new THREE.BoxGeometry(BOARD_W, BOARD_T, BOARD_D), wood, 0, BOARD_T / 2, 0),
        // rigole à jus, et la poignée percée
        mesh(new THREE.BoxGeometry(BOARD_W - 0.04, 0.002, 0.006), 0xa97c48, 0, BOARD_T + 0.001, BOARD_D / 2 - 0.02),
        mesh(new THREE.BoxGeometry(BOARD_W - 0.04, 0.002, 0.006), 0xa97c48, 0, BOARD_T + 0.001, -BOARD_D / 2 + 0.02),
        mesh(new THREE.BoxGeometry(0.05, BOARD_T, 0.08), wood, -BOARD_W / 2 - 0.025, BOARD_T / 2, 0),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.002, 12), 0x6b4a2b, -BOARD_W / 2 - 0.03, BOARD_T + 0.001, 0),
      );
    },
  },
  {
    id: 'couteau',
    name: 'couteau',
    portable: true,
    // en poing par le manche, la lame dépasse côté pouce
    grip: 'fist',
    gripPoint: [0, 0.055, 0],
    knife: true,
    // posé à plat sur le côté de la lame
    layFlat: true,
    fragility: 9,
    durability: 200,
    build: () => {
      // le long de +Y : le manche en bas, la lame au-dessus, le tranchant vers -Z
      const steel = 0xc8ced4;
      return group(
        mesh(new THREE.BoxGeometry(0.016, 0.11, 0.024), 0x3a2a20, 0, 0.055, 0),
        mesh(new THREE.BoxGeometry(0.018, 0.012, 0.03), 0x9ea4aa, 0, 0.116, -0.003),
        mesh(new THREE.BoxGeometry(0.003, 0.13, 0.036), steel, 0, 0.187, -0.008),
        // la pointe : le dos de la lame descend vers le tranchant
        mesh(new THREE.BoxGeometry(0.003, 0.03, 0.022), steel, 0, 0.267, -0.015),
      );
    },
  },
  {
    id: 'pain',
    name: 'pain',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.04, 0.05],
    mouth: [0, 0.05, -0.09],
    food: { hunger: 25, bites: 5 },
    cut: 'tranches-pain',
    fragility: 10,
    durability: 20,
    build: () => {
      // un bâtard doré, entaillé sur le dessus, couché le long de Z
      const loaf = mesh(new THREE.SphereGeometry(0.05, 16, 10).scale(1, 0.8, 2), 0xd39a52, 0, 0.04, 0);
      const g = group(loaf);
      for (const z of [-0.05, 0, 0.05]) {
        const cutMark = mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), 0xf0d29a, 0, 0.078, z);
        cutMark.rotation.y = 0.5;
        g.add(cutMark);
      }
      return g;
    },
  },
  {
    id: 'gaziniere',
    name: 'gazinière',
    portable: false,
    // raccordée au gaz : elle ne se déplace pas
    movable: false,
    fragility: 8,
    durability: 300,
    heat: { spots: STOVE_SPOTS, lit: 'flamme', warmup: 2.5 },
    build: () => {
      const H = COUNTER_H, W = STOVE_W, D = STOVE_D;
      const enamel = 0xe6e2d8, top = 0x2a2b2e, iron = 0x1e1f21, steel = 0xb9bfc6;
      const g = group(
        // caisse émaillée, dessus noir, four : porte vitrée et barre
        mesh(new THREE.BoxGeometry(W, H - 0.02, D), enamel, 0, (H - 0.02) / 2, 0),
        mesh(new THREE.BoxGeometry(W + 0.01, 0.02, D + 0.01), top, 0, H - 0.01, 0),
        mesh(new THREE.BoxGeometry(W - 0.1, 0.42, 0.01), 0x2d3034, 0, 0.4, D / 2 + 0.005),
        mesh(new THREE.BoxGeometry(W - 0.18, 0.02, 0.02), steel, 0, 0.68, D / 2 + 0.03),
        mesh(new THREE.BoxGeometry(W, 0.012, 0.01), 0xc9c4b8, 0, H - 0.1, D / 2 + 0.005),
      );
      STOVE_SPOTS.forEach(([x, , z], i) => {
        // brûleur (couronne et chapeau), grille en croix où se pose l'ustensile
        g.add(mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.012, 20), 0x3a3b3e, x, H + 0.006, z));
        g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.008, 16), iron, x, H + 0.016, z));
        g.add(mesh(new THREE.BoxGeometry(0.22, 0.01, 0.012), iron, x, H + GRATE_H - 0.005, z));
        g.add(mesh(new THREE.BoxGeometry(0.012, 0.01, 0.22), iron, x, H + GRATE_H - 0.005, z));
        // flammes bleues autour de la couronne (montrées quand le feu est allumé)
        const flame = new THREE.Group();
        flame.name = `flamme-${i}`;
        flame.position.set(x, H + 0.016, z);
        flame.visible = false;
        const mat = new THREE.MeshBasicMaterial({ color: 0x4d8bff, transparent: true, opacity: 0.85, depthWrite: false });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.026, 6), mat);
          cone.name = 'flamme';
          cone.position.set(Math.cos(a) * 0.05, 0.013, Math.sin(a) * 0.05);
          flame.add(cone);
        }
        g.add(flame);
        // bouton du feu, sur la façade
        const knob = group(
          mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.022, 16).rotateX(Math.PI / 2), 0x2a2b2e, 0, 0, 0.011),
          mesh(new THREE.BoxGeometry(0.004, 0.026, 0.004), 0xf2efe6, 0, 0.004, 0.023),
        );
        knob.name = `bouton-${i}`;
        knob.position.set(STOVE_KNOBS[i], H - 0.055, D / 2);
        g.add(knob);
      });
      return g;
    },
  },
  {
    id: 'poele',
    name: 'poêle',
    portable: true,
    grip: 'fist',
    // tenue par le bout du manche
    gripPoint: [0, PAN_H, PAN_R + 0.015 + HANDLE_L * 0.7],
    cookware: { holds: ['steak', ...PAN_FOOD, ...PREP_PAN_FOOD], places: [[-0.045, PAN_FLOOR, 0], [0.045, PAN_FLOOR, 0]] },
    // fonte : ne casse pas
    fragility: 10,
    durability: 200,
    build: () => {
      const iron = 0x2f3134;
      const floor = mesh(new THREE.CylinderGeometry(PAN_R, PAN_R, PAN_FLOOR, 24), iron, 0, PAN_FLOOR / 2, 0);
      const wall = mesh(new THREE.CylinderGeometry(PAN_R + 0.015, PAN_R, PAN_H, 24, 1, true), iron, 0, PAN_H / 2, 0);
      (wall.material as THREE.Material).side = THREE.DoubleSide;
      // manche en bois, un peu relevé, vers l'avant (+Z)
      const handle = mesh(new THREE.BoxGeometry(0.024, 0.016, HANDLE_L).rotateX(-0.12), 0x5b3b22, 0, PAN_H - 0.005, PAN_R + 0.015 + HANDLE_L / 2);
      return group(floor, wall, handle);
    },
  },
  {
    id: 'casserole',
    name: 'casserole',
    portable: true,
    grip: 'fist',
    gripPoint: [0, POT_H - 0.02, POT_R + HANDLE_L * 0.7],
    // se remplit d'eau à l'évier ; sur le feu, l'eau bout puis s'évapore
    fill: [PAN_FLOOR + 0.004, POT_H - 0.025],
    volume: 1.5,
    cookware: { holds: ['pomme de terre'], places: [[-0.033, PAN_FLOOR, 0], [0.033, PAN_FLOOR, 0]] },
    fragility: 9,
    durability: 180,
    build: () => {
      const steel = 0xb9bfc6;
      const floor = mesh(new THREE.CylinderGeometry(POT_R, POT_R, PAN_FLOOR, 24), 0x98a1aa, 0, PAN_FLOOR / 2, 0);
      const wall = mesh(new THREE.CylinderGeometry(POT_R, POT_R, POT_H, 24, 1, true), steel, 0, POT_H / 2, 0);
      (wall.material as THREE.Material).side = THREE.DoubleSide;
      const water = mesh(new THREE.CircleGeometry(POT_R * 0.98, 24).rotateX(-Math.PI / 2), 0x9fcde6, 0, PAN_FLOOR + 0.004, 0);
      water.name = 'liquide';
      const handle = mesh(new THREE.BoxGeometry(0.022, 0.014, HANDLE_L), 0x2a2b2e, 0, POT_H - 0.02, POT_R + HANDLE_L / 2);
      return group(floor, wall, water, handle);
    },
  },
  {
    id: 'steak',
    name: 'steak',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.01, 0.035],
    mouth: [0, 0.012, -0.035],
    food: { hunger: 35, bites: 4 },
    cook: { seconds: 18, burn: 30, colors: [0xc0475a, 0x7b4a2c, 0x231c17] },
    fragility: 10,
    durability: 20,
    breakWord: 'écrasé',
    build: () => {
      const meat = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 18).scale(1, 1, 0.8), 0xc0475a, 0, 0.009, 0);
      meat.name = 'cuit';
      const fat = mesh(new THREE.BoxGeometry(0.05, 0.016, 0.008), 0xf0dccb, 0, 0.009, -0.037);
      return group(meat, fat);
    },
  },
  {
    id: 'pomme-de-terre',
    name: 'pomme de terre',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.025, 0.03],
    mouth: [0, 0.03, -0.03],
    food: { hunger: 25, bites: 3 },
    cook: { seconds: 25, burn: 25, colors: [0xb08a52, 0xe6cf8a, 0x2e2419] },
    fragility: 9,
    durability: 20,
    breakWord: 'écrasé',
    build: () => {
      const potato = mesh(new THREE.SphereGeometry(0.03, 14, 10).scale(1.25, 0.85, 1), 0xb08a52, 0, 0.0255, 0);
      potato.name = 'cuit';
      return group(potato);
    },
  },
  {
    id: 'carotte',
    name: 'carotte',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.015, 0.05],
    mouth: [0, 0.015, -0.09],
    food: { hunger: 6, bites: 3 },
    cut: 'rondelles-carotte',
    fragility: 10,
    durability: 20,
    build: () => {
      // couchée le long de Z : la pointe vers -Z, les fanes vers +Z
      const body = mesh(new THREE.ConeGeometry(0.016, 0.17, 12).rotateX(-Math.PI / 2), 0xe8792a, 0, 0.016, -0.01);
      const tops = mesh(new THREE.ConeGeometry(0.012, 0.05, 6).rotateX(Math.PI / 2), 0x4f8a3a, 0, 0.016, 0.1);
      return group(body, tops);
    },
  },
  {
    id: 'tomate',
    name: 'tomate',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.03, 0.033],
    mouth: [0, 0.035, -0.033],
    food: { hunger: 6, bites: 3 },
    cut: 'tranches-tomate',
    // un fruit tendre : il s'écrase
    fragility: 5,
    durability: 15,
    breakWord: 'écrasé',
    build: () => {
      const fruit = mesh(new THREE.SphereGeometry(0.035, 16, 12).scale(1, 0.85, 1), 0xd8352a, 0, 0.03, 0);
      const stem = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 6), 0x4f8a3a, 0, 0.06, 0);
      return group(fruit, stem);
    },
  },
  {
    id: 'concombre',
    name: 'concombre',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.022, 0.05],
    mouth: [0, 0.022, -0.09],
    food: { hunger: 5, bites: 3 },
    cut: 'rondelles-concombre',
    fragility: 10,
    durability: 20,
    build: () => {
      // couché le long de Z
      const body = mesh(new THREE.CapsuleGeometry(0.022, 0.16, 6, 12).rotateX(Math.PI / 2), 0x3f7a35, 0, 0.022, 0);
      return group(body);
    },
  },
  pieces('quartiers-pomme', 'quartiers de pomme', { hunger: 12, bites: 4 }, () => {
    // quatre quartiers couchés, chair vers le haut, en éventail
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const q = new THREE.Group();
      q.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.07, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), 0xf3e2b5, 0, 0.012, 0));
      q.add(mesh(new THREE.BoxGeometry(0.07, 0.006, 0.008), 0xc0392b, 0, 0.003, -0.012));
      q.position.set(-0.03 + i * 0.02, 0, (i % 2) * 0.02 - 0.01);
      q.rotation.y = -0.3 + i * 0.2;
      g.add(q);
    }
    return g;
  }),
  pieces('tranches-pain', 'tranches de pain', { hunger: 25, bites: 5 }, () => {
    // les tranches couchées les unes sur les autres, décalées
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Group();
      s.add(mesh(new THREE.BoxGeometry(0.075, 0.01, 0.065), 0xb98a4a, 0, 0.005, 0));
      s.add(mesh(new THREE.BoxGeometry(0.065, 0.011, 0.055), 0xf2dca8, 0, 0.0055, 0));
      s.position.set(-0.04 + i * 0.02, i * 0.009, 0);
      g.add(s);
    }
    return g;
  }),
  pieces('pain-grille', 'pain grillé', { hunger: 30, bites: 5 }, () => {
    // les tranches sorties du grille-pain : dorées, la croûte plus foncée
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Group();
      s.add(mesh(new THREE.BoxGeometry(0.075, 0.01, 0.065), 0x8a5a2b, 0, 0.005, 0));
      s.add(mesh(new THREE.BoxGeometry(0.065, 0.011, 0.055), 0xd9a45c, 0, 0.0055, 0));
      s.position.set(-0.04 + i * 0.02, i * 0.009, 0);
      g.add(s);
    }
    return g;
  }),
  pieces('rondelles-carotte', 'rondelles de carotte', { hunger: 6, bites: 3 }, () => disks(9, 0.015, 0.006, 0xe8792a, 0xf2a35a)),
  pieces('tranches-tomate', 'tranches de tomate', { hunger: 6, bites: 3 }, () => disks(4, 0.032, 0.008, 0xd8352a, 0xf07a5f)),
  pieces('rondelles-concombre', 'rondelles de concombre', { hunger: 5, bites: 3 }, () => disks(7, 0.021, 0.006, 0x3f7a35, 0xd9ecb0)),
  {
    id: 'assiette',
    name: 'assiette',
    portable: true,
    // tenue par le bord, à plat, comme une tasse par l'anse
    grip: 'fist',
    gripPoint: [0, PLATE_H / 2, PLATE_R - 0.01],
    dish: true,
    plate: PLATE_IN,
    // porcelaine
    fragility: 2,
    durability: 60,
    build: () => {
      const white = 0xf2efe8;
      const rim = mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.62, PLATE_H, 28, 1, true), white, 0, PLATE_H / 2, 0);
      (rim.material as THREE.Material).side = THREE.DoubleSide;
      const well = mesh(new THREE.CylinderGeometry(PLATE_R * 0.66, PLATE_R * 0.6, PLATE_IN, 28), 0xe8e3d8, 0, PLATE_IN / 2, 0);
      const band = mesh(new THREE.RingGeometry(PLATE_R * 0.9, PLATE_R * 0.95, 32).rotateX(-Math.PI / 2), 0x3e6f9e, 0, PLATE_H * 0.8, 0);
      // restes de sauce et miettes
      const stain = group(
        mesh(new THREE.CircleGeometry(0.035, 14).rotateX(-Math.PI / 2), STAIN, -0.02, PLATE_IN + 0.0015, 0.01),
        mesh(new THREE.CircleGeometry(0.018, 10).rotateX(-Math.PI / 2), STAIN, 0.035, PLATE_IN + 0.0015, -0.025),
        mesh(new THREE.CircleGeometry(0.008, 8).rotateX(-Math.PI / 2), 0xc79a5a, 0.01, PLATE_IN + 0.002, 0.045),
      );
      stain.name = 'sale';
      return group(rim, well, band, stain);
    },
  },
  {
    id: 'fourchette',
    name: 'fourchette',
    portable: true,
    // par le bout du manche, les dents vers le haut ; elles vont aux lèvres
    grip: 'fist',
    gripPoint: [0, 0.035, 0],
    mouth: [0, CUTLERY_L, 0],
    // couchée à plat sur la table (le long de +Y quand on la tient)
    layFlat: true,
    dish: true,
    utensil: true,
    fragility: 10,
    durability: 200,
    breakWord: 'tordu',
    build: () => {
      const steel = 0xc3c8ce;
      const T = CUTLERY_T, L = CUTLERY_L;
      const g = group(
        // manche, col, tête, quatre dents (dans le plan YZ : le plat de la fourchette regarde ±X)
        mesh(new THREE.BoxGeometry(T, 0.11, 0.016), steel, 0, 0.055, 0),
        mesh(new THREE.BoxGeometry(T, 0.025, 0.008), steel, 0, 0.1225, 0),
        mesh(new THREE.BoxGeometry(T, 0.015, 0.024), steel, 0, 0.1425, 0),
      );
      for (const z of [-0.0105, -0.0035, 0.0035, 0.0105]) g.add(mesh(new THREE.BoxGeometry(T, L - 0.15, 0.003), steel, 0, (0.15 + L) / 2, z));
      const stain = mesh(new THREE.BoxGeometry(T + 0.002, 0.02, 0.022), STAIN, 0, L - 0.02, 0);
      stain.name = 'sale';
      // la bouchée piquée au bout des dents (montrée pendant qu'on mange dans l'assiette)
      const morsel = mesh(new THREE.BoxGeometry(0.018, 0.016, 0.02), 0xe2b871, 0, L - 0.012, 0);
      morsel.name = 'bouchee';
      g.add(stain, morsel);
      return g;
    },
  },
  {
    id: 'couteau-table',
    // couteau de table (le couteau de cuisine, pour couper sur la planche, est « couteau »)
    name: 'couteau de table',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.035, 0],
    layFlat: true,
    dish: true,
    fragility: 10,
    durability: 200,
    breakWord: 'tordu',
    build: () => {
      const T = CUTLERY_T;
      const stain = mesh(new THREE.BoxGeometry(T + 0.002, 0.04, 0.012), STAIN, 0, 0.15, 0.002);
      stain.name = 'sale';
      return group(
        // manche en bois, lame d'acier (le tranchant côté -Z)
        mesh(new THREE.BoxGeometry(T * 2.5, 0.095, 0.017), 0x6b4a2b, 0, 0.0475, 0),
        mesh(new THREE.BoxGeometry(T, 0.095, 0.016), 0xc3c8ce, 0, 0.1425, 0.001),
        stain,
      );
    },
  },
  {
    id: 'verre',
    name: 'verre',
    portable: true,
    // sans anse : tenu par le corps, côté +Z dans le poing ; on boit au bord opposé
    grip: 'fist',
    gripPoint: [0, GLASS_H * 0.45, GLASS_R],
    lip: [0, GLASS_H, -GLASS_R],
    fill: [0.006, GLASS_H - 0.012],
    volume: 0.25,
    dish: true,
    // verre fin : se brise facilement
    fragility: 2,
    durability: 35,
    build: () => {
      // verre transparent : on voit l'eau dedans
      const body = mesh(new THREE.CylinderGeometry(GLASS_R, GLASS_RB, GLASS_H, 20, 1, true), 0xdcecf2, 0, GLASS_H / 2, 0);
      const bm = body.material as THREE.MeshToonMaterial;
      bm.transparent = true;
      bm.opacity = 0.35;
      bm.depthWrite = false;
      bm.side = THREE.DoubleSide;
      const foot = mesh(new THREE.CylinderGeometry(GLASS_RB, GLASS_RB, 0.006, 20), 0xc9e0e8, 0, 0.003, 0);
      // colonne de liquide (comme la bouteille), étroite pour ne pas sortir du verre évasé
      const water = mesh(new THREE.CylinderGeometry(GLASS_RB * 0.93, GLASS_RB * 0.93, 1, 20).translate(0, 0.5, 0), 0x9fcde6, 0, 0.006, 0);
      water.name = 'liquide';
      water.userData.column = true;
      water.renderOrder = -1;
      // garde la boîte de l'objet à sa vraie hauteur (setLevel la règle ensuite)
      water.scale.y = 0.001;
      // dépôt au fond et trace sur le bord où l'on a bu
      const stain = group(
        mesh(new THREE.RingGeometry(GLASS_RB * 0.4, GLASS_RB * 0.85, 20).rotateX(-Math.PI / 2), 0xb9b2a0, 0, 0.0065, 0),
        mesh(new THREE.CylinderGeometry(GLASS_R + 0.0006, GLASS_R + 0.0006, 0.012, 12, 1, true, Math.PI - 0.35, 0.7), 0xc98a8a, 0, GLASS_H - 0.008, 0),
      );
      stain.name = 'sale';
      return group(water, foot, body, stain);
    },
  },
  {
    id: 'bol',
    name: 'bol',
    portable: true,
    // tenu par le bord, comme l'assiette
    grip: 'fist',
    gripPoint: [0, BOWL_H - 0.012, BOWL_R - 0.004],
    dish: true,
    plate: BOWL_IN,
    deep: true,
    fragility: 2,
    durability: 60,
    build: () => {
      const wall = mesh(new THREE.CylinderGeometry(BOWL_R, BOWL_RB, BOWL_H, 28, 1, true), 0xf2efe8, 0, BOWL_H / 2, 0);
      (wall.material as THREE.Material).side = THREE.DoubleSide;
      const floor = mesh(new THREE.CylinderGeometry(BOWL_RB, BOWL_RB * 0.92, BOWL_IN, 28), 0xe8e3d8, 0, BOWL_IN / 2, 0);
      // le même liseré bleu que l'assiette
      const band = mesh(new THREE.TorusGeometry(BOWL_R - 0.002, 0.0025, 6, 32).rotateX(Math.PI / 2), 0x3e6f9e, 0, BOWL_H - 0.008, 0);
      const stain = group(
        mesh(new THREE.CircleGeometry(0.022, 14).rotateX(-Math.PI / 2), STAIN, -0.008, BOWL_IN + 0.0015, 0.006),
        mesh(new THREE.CircleGeometry(0.01, 10).rotateX(-Math.PI / 2), STAIN, 0.018, BOWL_IN + 0.0015, -0.012),
      );
      stain.name = 'sale';
      return group(wall, floor, band, stain);
    },
  },
  {
    id: 'cuillere',
    name: 'cuillère',
    portable: true,
    // par le bout du manche, le creux vers le haut ; le cuilleron va aux lèvres
    grip: 'fist',
    gripPoint: [0, 0.035, 0],
    mouth: [0, CUTLERY_L - 0.022, 0],
    layFlat: true,
    dish: true,
    utensil: true,
    fragility: 10,
    durability: 200,
    breakWord: 'tordu',
    build: () => {
      const steel = 0xc3c8ce;
      const T = CUTLERY_T, L = CUTLERY_L;
      const g = group(
        // manche et col (dans le plan YZ, comme la fourchette)
        mesh(new THREE.BoxGeometry(T, 0.12, 0.014), steel, 0, 0.06, 0),
        mesh(new THREE.BoxGeometry(T, 0.025, 0.007), steel, 0, 0.1325, 0),
      );
      // cuilleron : un ovale aplati au bout
      const bowl = mesh(new THREE.SphereGeometry(0.5, 16, 10).scale(0.008, 0.045, 0.034), steel, 0.001, L - 0.0225, 0);
      const stain = mesh(new THREE.SphereGeometry(0.5, 12, 8).scale(0.006, 0.03, 0.022), STAIN, -0.002, L - 0.0225, 0);
      stain.name = 'sale';
      // la bouchée dans le creux (montrée pendant qu'on mange dans le bol)
      const morsel = mesh(new THREE.SphereGeometry(0.5, 12, 8).scale(0.008, 0.03, 0.024), 0xe2b871, -0.004, L - 0.0225, 0);
      morsel.name = 'bouchee';
      g.add(bowl, stain, morsel);
      return g;
    },
  },
  {
    id: 'carafe',
    name: 'carafe',
    portable: true,
    // tenue par l'anse (côté +Z) ; on verse par le bec (côté -Z), on ne boit pas dedans
    grip: 'fist',
    gripPoint: [0, CARAFE_H * 0.55, CARAFE_R + 0.03],
    mouth: [0, CARAFE_H, -CARAFE_NECK - 0.012],
    jug: true,
    fill: [0.006, CARAFE_BODY - 0.01],
    volume: 1,
    dish: true,
    fragility: 2,
    durability: 50,
    build: () => {
      const R = CARAFE_R, N = CARAFE_NECK;
      const clear = (m: THREE.Mesh, opacity: number) => {
        const mat = m.material as THREE.MeshToonMaterial;
        mat.transparent = true;
        mat.opacity = opacity;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
        return m;
      };
      // verre transparent : corps droit, épaule qui se resserre, col
      const body = clear(mesh(new THREE.CylinderGeometry(R, R, CARAFE_BODY, 22, 1, true), 0xdcecf2, 0, CARAFE_BODY / 2, 0), 0.35);
      const shoulder = clear(mesh(new THREE.CylinderGeometry(N, R, CARAFE_H - CARAFE_BODY - 0.02, 22, 1, true), 0xdcecf2, 0, (CARAFE_BODY + CARAFE_H - 0.02) / 2, 0), 0.4);
      const neck = clear(mesh(new THREE.CylinderGeometry(N * 1.05, N, 0.02, 22, 1, true), 0xdcecf2, 0, CARAFE_H - 0.01, 0), 0.45);
      const bottom = mesh(new THREE.CircleGeometry(R, 22).rotateX(-Math.PI / 2), 0xc9e0e8, 0, 0.003, 0);
      // le bec, à l'avant
      const spout = clear(mesh(new THREE.BoxGeometry(0.018, 0.006, 0.024), 0xdcecf2, 0, CARAFE_H - 0.002, -N - 0.008), 0.6);
      // l'anse : un demi-anneau à l'arrière, ses deux bouts sur le corps
      const handle = mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 16, Math.PI), 0xc9e0e8, 0, CARAFE_H * 0.55, R - 0.004);
      handle.rotation.set(0, -Math.PI / 2, Math.PI / 2);
      // colonne d'eau (comme la bouteille) dans la partie droite
      const water = mesh(new THREE.CylinderGeometry(R * 0.92, R * 0.92, 1, 22).translate(0, 0.5, 0), 0x9fcde6, 0, 0.006, 0);
      water.name = 'liquide';
      water.userData.column = true;
      water.renderOrder = -1;
      water.scale.y = 0.001;
      // trace de calcaire au fond
      const stain = mesh(new THREE.RingGeometry(R * 0.5, R * 0.9, 22).rotateX(-Math.PI / 2), 0xb9b2a0, 0, 0.007, 0);
      stain.name = 'sale';
      return group(water, bottom, body, shoulder, neck, spout, handle, stain);
    },
  },
  {
    id: 'table',
    name: 'table',
    portable: false,
    movable: true,
    durability: 300,
    table: 'repas',
    build: () => {
      const top = mesh(new THREE.BoxGeometry(1, 0.05, 0.6), 0x9b6a3c, 0, TABLE_H - 0.025, 0);
      const g = group(top);
      for (const [x, z] of [[-0.44, -0.24], [0.44, -0.24], [-0.44, 0.24], [0.44, 0.24]]) g.add(mesh(new THREE.BoxGeometry(0.06, TABLE_H - 0.05, 0.06), 0x6e4626, x, (TABLE_H - 0.05) / 2, z));
      return g;
    },
  },
  // la cuisine : rangements et appareils (kitchen.ts)
  ...KITCHEN_ITEMS,
  // la chambre : lit, table de nuit, lampe de chevet, armoire (bedroom.ts)
  ...BEDROOM_ITEMS,
  // les plats des recettes (recipes.ts)
  ...DISHES,
  // le salon : canapé, table basse, télé (salon.ts)
  ...SALON_ITEMS,
  // les provisions, le garde-manger et les courses (pantry.ts)
  ...PANTRY_ITEMS,
  // la salle de bain : lavabo, douche, toilettes, serviette (bathroom.ts)
  ...BATHROOM_ITEMS,
  // les gestes de cuisine : œufs, lait, saladier, ustensiles, épices (prep.ts)
  ...PREP_ITEMS,
  // meubles et entretien : barre à couteaux, crochets, horloge, fenêtre, îlot, balai… (upkeep.ts)
  ...UPKEEP_ITEMS,
];

export const ITEM_BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
