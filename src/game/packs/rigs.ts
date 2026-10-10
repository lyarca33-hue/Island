/**
 * Pièces mobiles des modèles des packs Tripo (ville, boulangerie, restaurant, objets des métiers),
 * prêtes à brancher quand ces objets arrivent dans le monde : la Fiche Animation de Greg en dit
 * les animations « Doit », ce fichier les fait.
 *
 * Ces modèles sont livrés d'un seul bloc : chaque pièce est découpée au chargement (`packRig`,
 * assets.ts) dans des boîtes du repère du modèle (m, posé au sol, centré, l'avant vers +Z) : les
 * triangles dont le centre tombe dans une boîte font la pièce. Ce qui manque au modèle (filet
 * d'eau, flamme, aiguilles, niveau d'un liquide) est fait par programme (`make`).
 *
 * Chaque pièce porte son mouvement, de 0 (fermé, éteint, au repos) à 1 (ouvert, allumé, plein),
 * joué par `poseRig` (items/rigs.ts) comme ceux des autres pièces de la maison ; `play` dit comment
 * le jeu le fait varier. Les axes ont été essayés sur chaque modèle (tools/rigs/jouer.html).
 */
import type { ItemDef } from '../items/catalog';
import type { Motion } from '../items/rigs';
import type { ModelName, PackId } from './manifest';

type V3 = [number, number, number];
/** Boîte (coin bas, coin haut) dans le repère du modèle. */
export type Box = [V3, V3];

/** Pièce faite par programme, posée sur son axe (`pivot`). */
export type Make =
  /** Filet qui coule vers le bas depuis l'axe (eau, café, farine), ou jaillit vers le haut (`up`). */
  | { shape: 'jet'; radius: number; length: number; color: number; opacity?: number; up?: boolean }
  /** Flamme posée sur l'axe, pointe vers le haut. */
  | { shape: 'flamme'; radius: number; height: number }
  /** Surface d'un liquide (disque horizontal) à la hauteur de l'axe. */
  | { shape: 'disque'; radius: number; color: number }
  /** Aiguille d'horloge : part de l'axe vers le haut (midi), à plat sur un cadran tourné de `yaw` (rad) depuis +Z. */
  | { shape: 'aiguille'; length: number; width: number; color: number; yaw: number }
  /** Volume d'un liquide (tronc de cône, base sur l'axe) : il monte avec le niveau (motion `fill`). */
  | { shape: 'volume'; bottom: number; top: number; height: number; color: number }
  /** Couronne de petites flammes d'un brûleur à gaz, posée sur l'axe. */
  | { shape: 'couronne'; radius: number; height: number }
  /** Bouton rond (cylindre) qui sort de l'axe vers `yaw` (rad, depuis +Z) : un interrupteur que le modèle n'a pas. */
  | { shape: 'bouton'; radius: number; depth: number; color: number; yaw: number }
  /** Disque debout tourné de `yaw` depuis +Z : le fond d'un cadran, sur les aiguilles peintes du modèle. */
  | { shape: 'cadran'; radius: number; color: number; yaw: number };

export interface PackPart {
  /** Triangles du modèle dont le centre est dans l'une de ces boîtes : la pièce. */
  boxes?: Box[];
  /** Sauf ceux qui tombent dans ces boîtes. */
  not?: Box[];
  /**
   * Seulement les triangles dont la texture, au centre, a cette luminosité (`min`, `max`, de 0 à 1)
   * ou au moins cette saturation (`sat`) : la vitre claire d'une lanterne sans son cadre, les
   * légumes vifs sans le bol.
   */
  tex?: { min?: number; max?: number; sat?: number };
  /** Pièce posée sur une autre (son nom), qui bouge avec elle : la vitre du four, sur sa porte. */
  on?: string;
  /** Pièce faite par programme, à la place (ou en plus) des triangles du modèle. */
  make?: Make;
  /** Axe de la pièce (charnière, centre de rotation, haut d'un filet) ; absent : l'origine du modèle. */
  pivot?: V3;
  /** Mouvement ; absent : pièce fixe (le fond d'un cadran). */
  motion?: Motion;
  /**
   * Comment le jeu fait varier la part de 0 à 1 :
   * - `once` : une fois, à l'action (une porte qui s'ouvre, puis se referme) ;
   * - `loop` : sans fin, une période par `period` s (un crochet qui tourne, les flammes) ;
   * - `swing` : va-et-vient de 0 à 1 et retour en `period` s (une balançoire) ;
   * - `hold` : tenue à une valeur du jeu (l'heure, un niveau, allumé ou non).
   */
  play?: 'once' | 'loop' | 'swing' | 'hold';
  period?: number;
}

export interface PackRig {
  parts: Record<string, PackPart>;
  /** Parois vues des deux côtés : on voit dedans quand la porte s'ouvre (le modèle n'est qu'une coque). */
  inside?: boolean;
  /** Le modèle en verre, à cette opacité : on voit le liquide dedans. */
  opacity?: number;
  /** Réglages de la fiche du jeu mesurés sur le modèle (hauteur d'assise, angle de la porte…). */
  def?: Partial<ItemDef>;
}

const deg = (d: number) => (d * Math.PI) / 180;
/** Tout le modèle. */
const ALL: Box = [[-9, -9, -9], [9, 9, 9]];
/** Lumière chaude d'une lanterne, d'un lampadaire. */
const WARM = 0xffb54a;

/** L'horloge de rue : son cadran (devant seulement, le dos est plein) est tourné de 34° vers +X (mesuré sur le modèle). */
const CLOCK_YAW = deg(34);
const CLOCK_AT: V3 = [0.02 + 0.15 * Math.sin(CLOCK_YAW), 3.2, -0.01 + 0.15 * Math.cos(CLOCK_YAW)];
/** Aiguille sur ce cadran, tournée en sens horaire vu de face : 1 = un tour. */
const clockHand = (length: number, width: number): PackPart => ({
  make: { shape: 'aiguille', length, width, color: 0x1d1f1c, yaw: CLOCK_YAW },
  pivot: CLOCK_AT,
  motion: { kind: 'spin', axis: [Math.sin(CLOCK_YAW), 0, Math.cos(CLOCK_YAW)], angle: -2 * Math.PI },
  play: 'hold',
});

/** Le seau du puits : au-dessus du trou, au fond (0,95 m plus bas), puis retour à sa place. */
const WELL_PATH: V3[] = [[0, 0, 0], [0, 0, 0.52], [0, -0.95, 0.52], [0, 0, 0.52], [0, 0, 0]];

/** Eau, café, vin, lait, farine. */
const WATER = 0x9fd4ff;
const COFFEE = 0x4a2a16;
const WINE = 0x6e1027;

/** Bouton qui tourne d'un quart de tour sur son axe `axis` (vers l'avant de l'appareil), allumé à 1. */
const knob = (box: Box, pivot: V3, axis: 'x' | 'z'): PackPart => ({ boxes: [box], pivot, motion: { kind: 'turn', axis, angle: deg(-90) }, play: 'hold' });

/** Les quatre feux du piano de cuisson (à gaz, couronne de flammes) : centre et bouton de chacun. */
const PIANO_FIRES: Array<{ at: V3; z: number }> = [
  { at: [-0.35, 0.8, -0.55], z: -0.65 },
  { at: [0.2, 0.8, -0.55], z: -0.55 },
  { at: [-0.35, 0.8, 0.5], z: 0.55 },
  { at: [0.2, 0.8, 0.5], z: 0.65 },
];

/** Les modèles des packs qui ont une pièce qui bouge ou s'allume. */
export const PACK_RIGS: { [P in PackId]?: Partial<Record<ModelName<P>, PackRig>> } = {
  ville: {
    // le siège et ses chaînes, sous la barre du haut (le long de Z, à 1,98 m) : va-et-vient de ±25°
    balancoire: {
      parts: { siege: { boxes: [[[-0.5, 0.2, -0.5], [0.5, 1.94, 0.5]]], pivot: [0, 1.98, 0], motion: { kind: 'turn', axis: 'z', rest: deg(-25), angle: deg(50) }, play: 'swing', period: 2.4 } },
      def: { seat: 0.55 },
    },
    // la porte vitrée de devant (+Z), charnière à gauche ; elle s'ouvre vers l'extérieur
    'cabine-telephone': {
      inside: true,
      parts: { porte: { boxes: [[[-0.41, 0.06, 0.4], [0.41, 1.96, 0.6]]], pivot: [-0.41, 0, 0.47], motion: { kind: 'turn', axis: 'y', angle: deg(-100) }, play: 'once' } },
      def: { door: deg(-100) },
    },
    // le cheval et son ressort basculent d'avant en arrière sur le socle (la tête vers -Z)
    'cheval-ressort': {
      parts: { cheval: { boxes: [[[-1, 0.05, -1], [1, 2, 1]]], pivot: [0, 0.03, 0], motion: { kind: 'turn', axis: 'x', rest: deg(-12), angle: deg(24) }, play: 'swing', period: 1.4 } },
      def: { seat: 0.5 },
    },
    // la croix (sans sa potence) s'allume en vert et clignote la nuit
    'enseigne-croix': {
      parts: { croix: { boxes: [[[0.03, -1, -1], [1, 1, 1]]], motion: { kind: 'glow', color: 0x36d16a }, play: 'loop', period: 1.6 } },
    },
    // le bouton blanc sur le dessus ; un petit jet monte du bec, au centre
    'fontaine-boire': {
      parts: {
        'bouton-0': { boxes: [[[-0.09, 1.0, -0.075], [-0.03, 1.06, -0.015]]], pivot: [-0.06, 1.03, -0.045], motion: { kind: 'slide', axis: 'y', distance: -0.008 }, play: 'once' },
        jet: { make: { shape: 'jet', radius: 0.006, length: 0.1, color: 0x9fd4ff, up: true }, pivot: [0, 1.085, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
      },
    },
    // l'eau tombe de la vasque du haut dans le bassin, qui ondule
    fontaine: {
      parts: {
        jet: { make: { shape: 'jet', radius: 0.045, length: 0.45, color: 0x9fd4ff, up: true }, pivot: [0, 1.9, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
        'eau-haut': { make: { shape: 'disque', radius: 0.42, color: 0x6fa9c9 }, pivot: [0, 1.93, 0] },
        eau: { make: { shape: 'disque', radius: 1.22, color: 0x6fa9c9 }, pivot: [0, 0.52, 0], motion: { kind: 'wave', along: 'x', push: 'y', amp: 0.02, waves: 3 }, play: 'loop', period: 3 },
      },
    },
    // aiguilles faites par le jeu (celles peintes sur le cadran sont couvertes d'un disque de sa couleur)
    'horloge-rue': {
      parts: {
        cadran: { make: { shape: 'cadran', radius: 0.19, color: 0xe3cd9e, yaw: CLOCK_YAW }, pivot: CLOCK_AT },
        'aiguille-heures': clockHand(0.11, 0.016),
        'aiguille-minutes': clockHand(0.16, 0.01),
      },
    },
    // les vitres de la lanterne s'éclairent la nuit (le cadre reste sombre) ; lumière vers 3,2 m
    'lampadaire-rue': {
      parts: { lanterne: { boxes: [[[-0.3, 2.92, -0.3], [0.3, 3.48, 0.3]]], tex: { min: 0.55 }, motion: { kind: 'glow', color: WARM }, play: 'hold' } },
      def: { lamp: { y: 3.2, color: 0xffd6a0, intensity: 1.2, range: 8 } },
    },
    // la flamme au milieu de la lanterne, les vitres s'éclairent
    'applique-rue': {
      parts: {
        lumiere: { boxes: [[[-0.03, 0.06, -0.12], [0.24, 0.27, 0.12]]], tex: { min: 0.6 }, motion: { kind: 'glow', color: WARM }, play: 'hold' },
        'flamme-0': { make: { shape: 'flamme', radius: 0.012, height: 0.05 }, pivot: [0.105, 0.11, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
      },
      def: { lamp: { y: 0.15, color: 0xffd6a0, intensity: 0.5, range: 4 } },
    },
    // la devanture verte regarde vers +X : la porte du milieu, au fond d'une entrée en retrait
    // (x -0,15), poignée à droite, charnière à gauche (z +0,27) ; elle s'ouvre dans l'entrée
    devanture: {
      inside: true,
      parts: { porte: { boxes: [[[-0.25, 0.02, -0.275], [0.0, 1.62, 0.275]]], pivot: [-0.15, 0, 0.27], motion: { kind: 'turn', axis: 'y', angle: deg(-95) }, play: 'once' } },
      def: { door: deg(-95) },
    },
    // le magasin d'angle regarde vers +X (en biais) : la porte vitrée, poignée côté +Z, charnière à z +0,27
    'devanture-angle': {
      inside: true,
      parts: { porte: { boxes: [[[0.38, 0.02, 0.27], [0.7, 1.27, 0.63]]], pivot: [0.57, 0, 0.27], motion: { kind: 'turn', axis: 'y', angle: deg(95) }, play: 'once' } },
      def: { door: deg(95) },
    },
    // le drapeau flotte au vent, accroché au mât (x -0,38)
    'mat-drapeau': {
      parts: { drapeau: { boxes: [[[-0.32, 3.85, -1], [1.1, 5.25, 1]]], pivot: [-0.4, 0, 0.1], motion: { kind: 'wave', along: 'x', push: 'z', amp: 0.12, waves: 1.2 }, play: 'loop', period: 2.2 } },
    },
    // la porte regarde vers +X, poignée côté +Z : charnière côté -Z, elle s'ouvre vers l'avant
    'porte-boutique': {
      parts: { porte: { boxes: [[[-0.3, 0.0, -0.47], [0.3, 2.04, 0.47]]], pivot: [0, 0, -0.47], motion: { kind: 'turn', axis: 'y', angle: deg(100) }, play: 'once' } },
      def: { door: deg(100) },
    },
    // le seau pend à côté du puits (z -0,52) : il passe au-dessus du trou, descend au fond et
    // remonte plein ; la corde se déroule du toit (le modèle n'a pas de treuil : pas de manivelle)
    puits: {
      parts: {
        seau: {
          boxes: [[[-0.25, 0.66, -0.85], [0.25, 1.39, -0.31]]],
          not: [[[-0.1, 0.6, -0.345], [0.1, 1.45, -0.15]]],
          motion: { kind: 'path', points: WELL_PATH },
          play: 'once',
          period: 6,
        },
        corde: {
          make: { shape: 'jet', radius: 0.008, length: 1, color: 0x8a6a45, opacity: 1 },
          pivot: [0, 1.45, 0],
          motion: { kind: 'reel', axis: 'y', sizes: [0.001, 0.07, 1.02, 0.07, 0.001] },
          play: 'once',
          period: 6,
        },
      },
    },
    // le couvercle bombé se relève sur une charnière derrière (-Z)
    'poubelle-rue': {
      parts: { couvercle: { boxes: [[[-1, 0.685, -1], [1, 2, 1]]], pivot: [0, 0.7, -0.31], motion: { kind: 'turn', axis: 'x', angle: deg(-100) }, play: 'once' } },
      def: { door: deg(-100), doorAxis: 'x' },
    },
    // tout le volet tourne sur ses gonds (z +0,6) et se rabat contre le mur, ouvert le jour
    volet: {
      parts: { volet: { boxes: [ALL], pivot: [0, 0, 0.6], motion: { kind: 'turn', axis: 'y', angle: deg(-170) }, play: 'hold' } },
    },
  },
  boulangerie: {
    // le couvercle (avec le nœud) se relève vers l'arrière
    'boite-gateau': {
      inside: true,
      parts: { couvercle: { boxes: [[[-1, 0.088, -1], [1, 1, 1]]], pivot: [0, 0.09, -0.125], motion: { kind: 'turn', axis: 'x', angle: deg(-110) }, play: 'once' } },
      def: { door: deg(-110), doorAxis: 'x' },
    },
    // la vitrine regarde vers +X (vitre bombée) : côté vendeur (-X), la vitre arrière de droite glisse derrière l'autre
    'vitrine-patisserie': {
      inside: true,
      parts: { porte: { boxes: [[[-0.52, 0.3, 0.0], [-0.42, 1.15, 0.84]]], motion: { kind: 'slide', axis: 'z', distance: -0.78 }, play: 'once' } },
      def: { drawer: 0.78 },
    },
    // trois fours l'un sur l'autre, devant à +X : chaque porte s'abaisse sur sa charnière du bas ; la
    // vitre de chaque porte s'éclaire pendant la cuisson (le bouton du haut à droite allume)
    'four-pain': {
      inside: true,
      parts: {
        lumiere: { boxes: [[[0.55, 0.95, -0.45], [0.75, 1.3, 0.45]]], tex: { max: 0.35 }, on: 'porte', motion: { kind: 'glow', color: 0xff7a1e }, play: 'hold' },
        'lumiere-2': { boxes: [[[0.55, 0.38, -0.45], [0.75, 0.74, 0.45]]], tex: { max: 0.35 }, on: 'porte-2', motion: { kind: 'glow', color: 0xff7a1e }, play: 'hold' },
        'lumiere-3': { boxes: [[[0.55, 1.5, -0.45], [0.75, 1.82, 0.45]]], tex: { max: 0.35 }, on: 'porte-3', motion: { kind: 'glow', color: 0xff7a1e }, play: 'hold' },
        porte: { boxes: [[[0.55, 0.9, -0.47], [0.75, 1.43, 0.47]]], pivot: [0.62, 0.9, 0], motion: { kind: 'turn', axis: 'z', angle: deg(-80) }, play: 'once' },
        'porte-2': { boxes: [[[0.55, 0.33, -0.47], [0.75, 0.885, 0.47]]], pivot: [0.62, 0.33, 0], motion: { kind: 'turn', axis: 'z', angle: deg(-80) }, play: 'once' },
        'porte-3': { boxes: [[[0.55, 1.45, -0.47], [0.75, 1.86, 0.47]]], pivot: [0.62, 1.45, 0], motion: { kind: 'turn', axis: 'z', angle: deg(-80) }, play: 'once' },
        'bouton-0': knob([[0.55, 1.58, -0.7], [0.7, 1.67, -0.55]], [0.6, 1.62, -0.62], 'x'),
      },
      def: { door: deg(-80), doorAxis: 'x' },
    },
    // le crochet en spirale tourne dans la cuve ; le bouton rond, sur le flanc, met en marche
    petrin: {
      parts: {
        crochet: { boxes: [[[-0.08, 0.55, 0.1], [0.08, 0.8, 0.3]]], pivot: [0, 0.7, 0.21], motion: { kind: 'turn', axis: 'y', angle: 2 * Math.PI }, play: 'loop', period: 0.8 },
        'bouton-0': knob([[0.15, 0.5, -0.36], [0.26, 0.7, -0.2]], [0.2, 0.6, -0.28], 'x'),
      },
    },
    // la cloche de verre se soulève
    'presentoir-cloche': {
      parts: {
        cloche: { boxes: [[[-1, 0.165, -1], [1, 1, 1]]], motion: { kind: 'path', points: [[0, 0, 0], [0, 0.2, 0], [0.12, 0.24, 0]] }, play: 'once' },
        // le dessus du plateau, sous la cloche (le modèle n'en a pas : c'était le fond de la cloche)
        plateau: { make: { shape: 'disque', radius: 0.155, color: 0xe8c99a }, pivot: [0, 0.163, 0] },
      },
    },
    // le cylindre roule entre les poignées (le long de Z)
    'rouleau-patisserie': {
      parts: { rouleau: { boxes: [[[-1, -1, -0.155], [1, 1, 0.155]]], pivot: [0, 0.038, 0], motion: { kind: 'turn', axis: 'z', angle: 2 * Math.PI }, play: 'loop', period: 1 } },
    },
    // la farine sort par le haut du sac (le perso le penche pour verser) : le filet suit le sac
    'sac-farine': {
      parts: { jet: { make: { shape: 'jet', radius: 0.03, length: 0.45, color: 0xf6f1e6, opacity: 0.85, up: true }, pivot: [-0.04, 0.66, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' } },
    },
  },
  restaurant: {
    // devant à +X : quatre boutons pour les quatre feux (couronnes de flammes), les deux portes du four s'abaissent
    'piano-cuisson': {
      inside: true,
      parts: {
        ...Object.fromEntries(
          PIANO_FIRES.flatMap(({ at, z }, i) => [
            [`bouton-${i}`, knob([[0.6, 0.58, z - 0.045], [0.75, 0.7, z + 0.045]], [0.68, 0.638, z], 'x')],
            [`flamme-${i}`, { make: { shape: 'couronne', radius: 0.07, height: 0.03 }, pivot: at, motion: { kind: 'grow', axis: 'y' }, play: 'hold' }],
          ]),
        ),
        porte: { boxes: [[[0.62, 0.15, 0.1], [0.82, 0.56, 0.7]]], pivot: [0.7, 0.15, 0.4], motion: { kind: 'turn', axis: 'z', angle: deg(-80) }, play: 'once' },
        'porte-2': { boxes: [[[0.62, 0.15, -0.7], [0.82, 0.56, -0.1]]], pivot: [0.7, 0.15, -0.4], motion: { kind: 'turn', axis: 'z', angle: deg(-80) }, play: 'once' },
      },
      def: { door: deg(-80), doorAxis: 'x' },
    },
    // un robinet par bac : l'eau coule du bec (x 0) jusqu'au fond
    plonge: {
      parts: {
        jet: { make: { shape: 'jet', radius: 0.008, length: 0.52, color: WATER }, pivot: [0.02, 1.265, -0.385], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
        'jet-2': { make: { shape: 'jet', radius: 0.008, length: 0.52, color: WATER }, pivot: [0.02, 1.265, 0.385], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
      },
    },
    // une coque sans bouton : le jeu ajoute l'interrupteur devant, et deux lampes sous la hotte
    'hotte-pro': {
      parts: {
        'bouton-0': { make: { shape: 'bouton', radius: 0.018, depth: 0.012, color: 0x2b2b2b, yaw: 0 }, pivot: [0.45, 0.06, 0.8], motion: { kind: 'slide', axis: 'z', distance: -0.006 }, play: 'once' },
        lumiere: { make: { shape: 'disque', radius: 0.07, color: 0xf2efe6 }, pivot: [-0.3, 0.02, 0.2], motion: { kind: 'glow', color: 0xfff1c8 }, play: 'hold' },
        'lumiere-2': { make: { shape: 'disque', radius: 0.07, color: 0xf2efe6 }, pivot: [0.3, 0.02, 0.2], motion: { kind: 'glow', color: 0xfff1c8 }, play: 'hold' },
      },
    },
    // devant à +X : le bouton noir du flanc (+Z) lance le café, qui coule du porte-filtre
    'machine-expresso': {
      parts: {
        'bouton-0': knob([[0.15, 0.55, 0.24], [0.33, 0.68, 0.33]], [0.24, 0.615, 0.28], 'z'),
        jet: { make: { shape: 'jet', radius: 0.005, length: 0.17, color: COFFEE, opacity: 1 }, pivot: [0.22, 0.3, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' },
      },
    },
    // le couvercle se soulève et se pose de biais ; l'eau monte dans la marmite
    marmite: {
      inside: true,
      parts: {
        couvercle: { boxes: [[[-1, 0.186, -1], [1, 1, 1]]], motion: { kind: 'path', points: [[0, 0, 0], [0, 0.1, 0], [0.06, 0.12, 0]] }, play: 'once' },
        liquide: { make: { shape: 'volume', bottom: 0.13, top: 0.14, height: 0.15, color: 0x8fb7c9 }, pivot: [0, 0.02, 0], motion: { kind: 'fill', from: 1 }, play: 'hold' },
      },
    },
    // la toile se replie le long du mât (ouverte à 1)
    'parasol-terrasse': {
      parts: { toile: { boxes: [[[-2, 1.13, -2], [2, 3, 2]]], not: [[[-0.04, 1.13, -0.04], [0.04, 1.3, 0.04]]], pivot: [0, 1.85, 0], motion: { kind: 'fold', to: 0.1 }, play: 'hold' } },
    },
    // devant à +X : deux portes battantes sous le casier du haut, poignées au milieu ; une lampe dedans
    'frigo-pro': {
      inside: true,
      parts: {
        porte: { boxes: [[[0.3, 0.1, 0.0], [0.6, 1.63, 0.6]]], pivot: [0.4, 0, 0.56], motion: { kind: 'turn', axis: 'y', angle: deg(-105) }, play: 'once' },
        'porte-2': { boxes: [[[0.3, 0.1, -0.6], [0.6, 1.63, 0.0]]], pivot: [0.4, 0, -0.56], motion: { kind: 'turn', axis: 'y', angle: deg(105) }, play: 'once' },
        lampe: { make: { shape: 'disque', radius: 0.05, color: 0xeef4ff }, pivot: [0.1, 1.58, 0], motion: { kind: 'glow', color: 0xdce8ff }, play: 'hold' },
      },
      def: { door: deg(-105), cold: true },
    },
    // le couvercle se soulève
    sucrier: {
      inside: true,
      parts: { couvercle: { boxes: [[[-1, 0.052, -1], [1, 1, 1]]], motion: { kind: 'path', points: [[0, 0, 0], [0, 0.04, 0], [0.03, 0.05, 0]] }, play: 'once' } },
    },
    // les deux ardoises du chevalet : le jeu y peint le menu du jour (pièce sans mouvement)
    'ardoise-menu': { parts: { ardoise: { boxes: [ALL], tex: { max: 0.2 } } } },
    // la soupe baisse dans le bol à chaque cuillère (1 : mangée)
    'soupe-poisson': {
      inside: true,
      parts: { contenu: { boxes: [[[-0.058, 0.036, -0.058], [0.058, 1, 0.058]]], motion: { kind: 'slide', axis: 'y', distance: -0.028 }, play: 'hold' } },
    },
    // les moules s'enfoncent dans la cocotte, les frites rapetissent (1 : mangées)
    'moules-frites': {
      parts: {
        contenu: { boxes: [[[-0.1, 0.075, -0.085], [0.09, 1, 0.085]]], not: [[[0.05, 0, -0.14], [0.2, 1, 0.02]]], motion: { kind: 'slide', axis: 'y', distance: -0.045 }, play: 'hold' },
        frites: { boxes: [[[0.05, 0.012, -0.14], [0.2, 1, 0.02]]], tex: { sat: 0.6 }, pivot: [0.11, 0.015, -0.07], motion: { kind: 'shrink', to: 0.2 }, play: 'hold' },
      },
    },
    // les légumes (vifs, pas le bol) rapetissent vers le fond (1 : mangés)
    ratatouille: {
      inside: true,
      parts: {
        contenu: { boxes: [[[-0.09, 0.02, -0.09], [0.09, 1, 0.09]]], tex: { sat: 0.62 }, pivot: [0, 0.03, 0], motion: { kind: 'shrink', to: 0.3 }, play: 'hold' },
        // le fond du bol, que les légumes cachaient (le modèle n'en a pas)
        fond: { make: { shape: 'disque', radius: 0.08, color: 0xc28a55 }, pivot: [0, 0.035, 0] },
      },
    },
    // le café monte dans la tasse (1 : pleine)
    'tasse-expresso': {
      parts: { liquide: { make: { shape: 'volume', bottom: 0.015, top: 0.025, height: 0.022, color: COFFEE }, pivot: [0, 0.022, 0], motion: { kind: 'fill', from: 0.6 }, play: 'hold' } },
    },
    // le vin monte dans le verre, rendu translucide (1 : plein)
    'verre-vin': {
      opacity: 0.45,
      parts: { liquide: { make: { shape: 'volume', bottom: 0.012, top: 0.047, height: 0.055, color: WINE }, pivot: [0, 0.085, 0], motion: { kind: 'fill', from: 0.35 }, play: 'hold' } },
    },
    // le vin sort par le goulot (le perso penche la bouteille pour verser) : le filet la suit
    'bouteille-vin': {
      parts: { jet: { make: { shape: 'jet', radius: 0.006, length: 0.25, color: WINE, opacity: 1, up: true }, pivot: [0, 0.3, 0], motion: { kind: 'grow', axis: 'y' }, play: 'hold' } },
    },
  },
};

/** Le rig du modèle `name` du pack `id`, s'il en a un. */
export function packRigOf(id: PackId, name: string): PackRig | undefined {
  return (PACK_RIGS[id] as Record<string, PackRig> | undefined)?.[name];
}
