/**
 * Types de prise : quelques façons de tenir un objet, communes à tous les objets. Un objet dit
 * seulement laquelle il utilise (voir catalog.ts) ; la pose du bras et des doigts est ici.
 *
 * Tous les chiffres sont dans le repère du buste du perso (face à +Z, sa gauche vers +X) et
 * pour la main droite ; la main gauche est le miroir. Les positions de main sont données
 * depuis l'épaule, en longueurs de bras (ce qui s'adapte à la taille du perso).
 */
import * as THREE from 'three';

export type GripType = 'pinch' | 'fist' | 'side' | 'chest' | 'twoHands' | 'stack' | 'read' | 'push';

export interface HandSpec {
  /** Où va la main, depuis l'épaule (longueurs de bras, repère du buste). */
  reach: [number, number, number];
  /** Vers où pointe le coude. */
  pole: [number, number, number];
  /** Direction des doigts tendus, et vers où regarde la paume. */
  fingers: [number, number, number];
  palm: [number, number, number];
  /** Pliage des doigts (degrés par phalange) et du pouce. */
  curl: number;
  index?: number;
  thumb: number;
}

export interface GripSpec {
  label: string;
  right: HandSpec;
  /** Prise à deux mains seulement (l'objet est alors placé dans le repère du buste). */
  left?: HandSpec;
  /**
   * Orientation de l'objet dans la main : axes de la main (repère de la main droite au repos :
   * doigts vers -X, paume vers -Y, pouce vers +Z) que prennent le haut (+Y) et l'avant (+Z) de
   * l'objet.
   */
  up: [number, number, number];
  forward: [number, number, number];
  /** Centre de la prise par rapport à l'os de la main (m, même repère). */
  hold: [number, number, number];
  /** À deux mains : écart entre les paumes (m) ; sinon, la largeur de l'objet. */
  width?: number;
  /**
   * Tenu de la main gauche : où va la main (sinon le miroir de la main droite). Le livre contre
   * la poitrine reste ainsi du côté gauche, sans croiser le bras devant l'autre main.
   */
  leftReach?: [number, number, number];
}

export const GRIPS: Record<GripType, GripSpec> = {
  // petit objet entre le pouce et l'index (clé, lettre, téléphone), montré devant soi
  pinch: {
    label: 'entre les doigts',
    right: { reach: [0.12, -0.45, 0.62], pole: [-0.6, -0.4, -0.6], fingers: [0.2, 0.25, 1], palm: [1, 0.2, 0], curl: 55, index: 25, thumb: 20 },
    up: [0, 0, 1],
    forward: [0, -1, 0],
    hold: [-0.1, -0.015, 0.035],
  },
  // en poing (tasse par l'anse, bouteille, épée) : l'avant de l'objet part vers le dos de la
  // main, son côté +Z (l'anse) reste dans le poing
  fist: {
    label: 'en poing',
    right: { reach: [-0.15, -0.6, 0.45], pole: [-0.5, -0.3, -0.8], fingers: [0.1, -0.15, 1], palm: [1, 0, 0], curl: 70, thumb: 35 },
    up: [0, 0, 1],
    forward: [1, 0, 0],
    hold: [-0.07, -0.03, 0.01],
  },
  // le long du corps, bras tendu (livre, sac, seau)
  side: {
    label: 'le long du corps',
    right: { reach: [-0.2, -0.95, 0.06], pole: [-0.3, 0, -1], fingers: [0, -1, 0.15], palm: [1, 0, 0], curl: 75, thumb: 40 },
    up: [1, 0, 0],
    forward: [0, 0, 1],
    hold: [-0.07, -0.025, 0.01],
  },
  // serré contre la poitrine, la paume à plat dessus (livre, cahier, dossier)
  chest: {
    label: 'contre la poitrine',
    right: { reach: [0.32, -0.42, 0.34], pole: [-0.6, -0.8, -0.2], fingers: [0.85, 0.5, 0], palm: [0, 0, -1], curl: 15, thumb: 10 },
    up: [-0.53, 0, 0.85],
    forward: [-0.85, 0, -0.53],
    hold: [-0.07, -0.03, 0],
    leftReach: [0.14, -0.32, 0.26],
  },
  // à deux mains devant soi (caisse, panier) : les mains se placent sur les côtés de l'objet
  twoHands: {
    label: 'à deux mains',
    right: { reach: [0, -0.4, 0.55], pole: [-0.6, -0.6, -0.4], fingers: [0.2, 0, 1], palm: [1, 0, 0], curl: 20, thumb: 10 },
    left: { reach: [0, -0.4, 0.55], pole: [0.6, -0.6, -0.4], fingers: [-0.2, 0, 1], palm: [-1, 0, 0], curl: 20, thumb: 10 },
    up: [0, 1, 0],
    forward: [0, 0, 1],
    hold: [-0.06, -0.03, 0],
  },
  // pile d'objets à plat (livres), portée à deux mains par en dessous ; l'objet tenu est le
  // premier de la pile, couché : son axe -X (épaisseur) vers le haut, comme posé (LAY_FLAT)
  stack: {
    label: 'en pile, à plat',
    right: { reach: [0, -0.52, 0.42], pole: [-0.6, -0.7, -0.3], fingers: [0.25, 0, 1], palm: [1, 0.45, 0], curl: 25, thumb: 10 },
    left: { reach: [0, -0.52, 0.42], pole: [0.6, -0.7, -0.3], fingers: [-0.25, 0, 1], palm: [-1, 0.45, 0], curl: 25, thumb: 10 },
    up: [0, 0, 1],
    forward: [-1, 0, 0],
    hold: [-0.06, -0.03, 0],
  },
  // livre ouvert, tenu à deux mains par le bas des pages, incliné vers le visage (lecture) ;
  // l'objet est ici le livre ouvert : pages vers +Z, haut du texte vers +Y
  read: {
    label: 'ouvert, pour lire',
    right: { reach: [0, -0.32, 0.62], pole: [-0.5, -0.8, -0.3], fingers: [0.35, 0.35, 1], palm: [0.55, 0.8, 0], curl: 20, thumb: 0 },
    left: { reach: [0, -0.32, 0.62], pole: [0.5, -0.8, -0.3], fingers: [-0.35, 0.35, 1], palm: [-0.55, 0.8, 0], curl: 20, thumb: 0 },
    up: [0, 0.82, 0.57],
    forward: [0, 0.57, -0.82],
    hold: [-0.06, -0.02, 0],
    width: 0.3,
  },
  // mains à plat contre un gros meuble pour le pousser ou le tirer (les mains vont aux points
  // d'appui donnés, voir Carry.brace)
  push: {
    label: 'contre un meuble',
    right: { reach: [0, -0.3, 0.7], pole: [-0.7, -0.7, -0.2], fingers: [0.25, 1, 0.1], palm: [0, 0, 1], curl: 10, thumb: 15 },
    left: { reach: [0, -0.3, 0.7], pole: [0.7, -0.7, -0.2], fingers: [-0.25, 1, 0.1], palm: [0, 0, 1], curl: 10, thumb: 15 },
    up: [0, 1, 0],
    forward: [0, 0, 1],
    hold: [-0.05, -0.02, 0],
  },
};

/** Les prises qui occupent les deux mains. */
export const isTwoHanded = (g: GripType) => !!GRIPS[g].left;

export const vec = (v: [number, number, number]) => new THREE.Vector3(...v);

/**
 * Prise devinée d'après la taille de l'objet (m) quand sa fiche n'en donne pas : petit et fin
 * entre les doigts, moyen en poing, plat et assez grand le long du corps, gros à deux mains.
 */
export function guessGrip(size: THREE.Vector3): GripType {
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
  const [small, , big] = dims;
  if (big > 0.45 || small > 0.2) return 'twoHands';
  if (big < 0.16 && small < 0.03) return 'pinch';
  if (big > 0.22 && small < 0.08) return 'side';
  return 'fist';
}
