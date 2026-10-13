/**
 * Filtre des mouvements de la souris capturée (première personne). Certains navigateurs (Chrome
 * sous Linux, Firefox) ramènent le curseur caché au centre de l'écran et laissent parfois passer
 * ce retour dans movementX / movementY : un saut de plusieurs centaines de pixels dans le sens
 * opposé au geste. Glissé vers la droite, la vue repartait alors en arrière d'un coup, et donnait
 * l'impression de se bloquer. Un grand saut à contre-sens d'un geste en cours est ignoré ; un
 * grand saut dans le sens du geste (geste rapide sur un jeu qui rame) est gardé, plafonné.
 */
export const MOVE_JUMP = 120;
export const MOVE_MAX = 400;

export class MouseLookFilter {
  /** Mouvement récent lissé, par axe (px par évènement). */
  private avg = [0, 0];
  /** Sauts à contre-sens ignorés d'affilée, par axe : au-delà d'un, c'est un vrai demi-tour. */
  private dropped = [0, 0];

  filter(dx: number, dy: number): { x: number; y: number } {
    return { x: this.axis(0, dx), y: this.axis(1, dy) };
  }

  reset(): void {
    this.avg = [0, 0];
    this.dropped = [0, 0];
  }

  private axis(i: number, v: number): number {
    if (!Number.isFinite(v)) return 0;
    const a = this.avg[i];
    if (Math.abs(v) > MOVE_JUMP && Math.abs(a) > 2 && Math.sign(v) !== Math.sign(a) && this.dropped[i] < 1) {
      this.dropped[i]++;
      return 0;
    }
    this.dropped[i] = 0;
    const out = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, v));
    this.avg[i] = a * 0.6 + out * 0.4;
    return out;
  }
}

/**
 * La souris capturée bute à droite et en bas. Firefox sous Linux (X11) sur un écran haute
 * définition (échelle 2 : Mac Retina sous Linux Mint…) enferme le curseur caché dans une boîte
 * comptée en pixels logiques au lieu de physiques : le quart haut-gauche de la fenêtre, dont le
 * coin bas-droit est justement le centre où Firefox ramène le curseur. Glissé vers la droite ou
 * vers le bas, le curseur bute aussitôt : movementX / movementY restent à 0 et la vue se bloque,
 * sans rien que la page puisse rattraper (les Firefox d'avant la 154 y perdent, eux, les petits
 * pas d'un côté). Là, on regarde sans capture : en glissant, ou à deux doigts.
 */
export function captureBlocked(ua: string, dpr: number): boolean {
  return /Firefox\//.test(ua) && /Linux|X11/.test(ua) && !/Android/.test(ua) && dpr >= 1.5;
}

/** Part de la scène, sur chaque bord, où la souris libre fait tourner la vue (et minimum en px). */
export const PAN_ZONE = 0.12;
export const PAN_MIN = 36;

/**
 * Souris libre (non capturée) à la première personne : poussée vers un bord de la scène, la vue
 * tourne de ce côté, d'autant plus vite qu'elle s'en approche. De -1 à 1 par axe (droite et bas
 * positifs), 0 loin des bords. Un seul doigt sur le pavé tactile suffit : pas de clic à tenir.
 */
export function edgePan(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const axis = (v: number, size: number) => {
    const z = Math.max(PAN_MIN, size * PAN_ZONE);
    if (v < z) return -Math.min(1, (z - v) / z);
    if (v > size - z) return Math.min(1, (v - (size - z)) / z);
    return 0;
  };
  return { x: axis(x, w), y: axis(y, h) };
}
