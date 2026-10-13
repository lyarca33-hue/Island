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
