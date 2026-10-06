/**
 * Types de prise : quelques façons de tenir un objet, communes à tous les objets. Un objet dit
 * seulement laquelle il utilise (voir catalog.ts) ; la pose du bras et des doigts est ici.
 *
 * Tous les chiffres sont dans le repère du buste du perso (face à +Z, sa gauche vers +X) et
 * pour la main droite ; la main gauche est le miroir. Les positions de main sont données
 * depuis l'épaule, en longueurs de bras (ce qui s'adapte à la taille du perso).
 */
import * as THREE from 'three';

export type GripType = 'pinch' | 'fist' | 'side' | 'chest' | 'twoHands';

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
  /** Prise à deux mains seulement. */
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
    right: { reach: [0.05, -0.55, 0.52], pole: [-0.5, -0.3, -0.8], fingers: [0.1, -0.15, 1], palm: [1, 0, 0], curl: 70, thumb: 35 },
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
};

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
