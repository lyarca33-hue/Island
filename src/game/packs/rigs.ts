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
  /** Disque debout tourné de `yaw` depuis +Z : le fond d'un cadran, sur les aiguilles peintes du modèle. */
  | { shape: 'cadran'; radius: number; color: number; yaw: number };

export interface PackPart {
  /** Triangles du modèle dont le centre est dans l'une de ces boîtes : la pièce. */
  boxes?: Box[];
  /** Sauf ceux qui tombent dans ces boîtes. */
  not?: Box[];
  /** Seulement les triangles clairs (luminosité de la texture au-dessus de 0 à 1) : la vitre d'une lanterne, pas son cadre. */
  bright?: number;
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
      parts: { lanterne: { boxes: [[[-0.3, 2.92, -0.3], [0.3, 3.48, 0.3]]], bright: 0.55, motion: { kind: 'glow', color: WARM }, play: 'hold' } },
      def: { lamp: { y: 3.2, color: 0xffd6a0, intensity: 1.2, range: 8 } },
    },
    // la flamme au milieu de la lanterne, les vitres s'éclairent
    'applique-rue': {
      parts: {
        lumiere: { boxes: [[[-0.03, 0.06, -0.12], [0.24, 0.27, 0.12]]], bright: 0.6, motion: { kind: 'glow', color: WARM }, play: 'hold' },
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
};

/** Le rig du modèle `name` du pack `id`, s'il en a un. */
export function packRigOf(id: PackId, name: string): PackRig | undefined {
  return (PACK_RIGS[id] as Record<string, PackRig> | undefined)?.[name];
}
