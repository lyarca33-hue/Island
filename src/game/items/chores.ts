/**
 * Gestes de ménage : balayer, passer la serpillière, l'aspirateur, épousseter, frotter, laver une
 * vitre, vaporiser, brosser la cuvette. Pas de clip animé : comme pour couper ou verser (carry.ts),
 * la main (ou les deux) suit un mouvement calculé au-dessus d'un point du monde, et l'outil suit
 * la main.
 *
 * Chaque geste dit où va la tête de l'outil (ou la main) à l'instant t, dans le repère de la zone
 * nettoyée : origine au point visé, x vers la gauche du perso, y vers le haut, z droit devant lui.
 * Les chiffres sont en mètres.
 */

export type ChoreKind = 'sweep' | 'mop' | 'vacuum' | 'dust' | 'scrub' | 'wipeUp' | 'spray' | 'brush';

export interface ChoreStyle {
  label: string;
  /**
   * Outil à long manche, tête au sol (balai, serpillière, aspirateur) : la main de l'outil tient
   * le haut du manche, l'autre main le tient plus bas (si elle est libre).
   */
  pole?: {
    /** Axe de l'outil (repère de l'objet) qui se couche dans le sens du geste : la brosse du balai se tient de côté, celle de l'aspirateur de face. */
    head: 'across' | 'forward';
    /** Où va la main du haut, depuis l'épaule (longueurs de bras, repère du buste, main droite). */
    reach: [number, number, number];
    /** Part du manche (depuis la tête) où l'autre main le tient. */
    lower: number;
  };
  /**
   * Outil tenu d'une main dont le bout touche le point visé (plumeau, brosse des WC, spray) :
   * direction de l'outil, de la main vers le bout (repère de la zone).
   */
  wand?: [number, number, number];
  /** Éponge ou chiffon à plat sous la paume : `down` sur un dessus, `front` contre une vitre. */
  flat?: 'down' | 'front';
  /** Temps pour amener l'outil en place, et pour le ramener (s). */
  ease: number;
  /** Durée d'un coup (s) : la tête de l'outil repasse au même endroit, et Game nettoie un peu (onStroke). */
  beat: number;
  /** Combien le perso se penche vers le point visé (0 debout, 1 comme pour prendre un objet). */
  lean: number;
  /** Position de la tête de l'outil (ou de la main) à l'instant t, repère de la zone. */
  stroke(t: number): [number, number, number];
}

const TAU = Math.PI * 2;
/** Dent de scie (0 → 1 sur chaque période `p`). */
const saw = (t: number, p: number) => (t / p) % 1;
const smooth = (u: number) => u * u * (3 - 2 * u);

export const CHORES: Record<ChoreKind, ChoreStyle> = {
  // coups courts vers la gauche, la brosse frotte le sol en allant, se soulève au retour ; la zone
  // avance un peu à chaque coup
  sweep: {
    label: 'balayer',
    pole: { head: 'across', reach: [-0.02, -0.42, 0.42], lower: 0.5 },
    ease: 0.4,
    beat: 0.9,
    lean: 0.2,
    stroke: (t) => {
      const u = saw(t, 0.9);
      const go = u < 0.68;
      const k = go ? smooth(u / 0.68) : 1 - smooth((u - 0.68) / 0.32);
      return [-0.22 + 0.44 * k, go ? 0 : 0.04 * Math.sin(Math.PI * (u - 0.68) / 0.32), 0.08 * Math.sin((TAU * t) / 3.6)];
    },
  },
  // en huit, la tête toujours au sol, de gauche à droite devant soi
  mop: {
    label: 'passer la serpillière',
    pole: { head: 'across', reach: [0.05, -0.4, 0.45], lower: 0.55 },
    ease: 0.45,
    beat: 1.6,
    lean: 0.2,
    stroke: (t) => {
      const w = TAU / 1.6;
      return [0.32 * Math.sin(w * t), 0, 0.1 * Math.sin(2 * w * t)];
    },
  },
  // va-et-vient devant soi, qui balaie lentement de côté
  vacuum: {
    label: 'passer l’aspirateur',
    pole: { head: 'forward', reach: [-0.08, -0.5, 0.36], lower: 0.62 },
    ease: 0.4,
    beat: 1.2,
    lean: 0.18,
    stroke: (t) => {
      const w = TAU / 1.2;
      return [0.22 * Math.sin((w * t) / 3), 0, -0.05 + 0.3 * (0.5 - 0.5 * Math.cos(w * t))];
    },
  },
  // le plumeau balaie le dessus du meuble de droite à gauche, en effleurant
  dust: {
    label: 'épousseter',
    wand: [0, -0.45, 1],
    ease: 0.35,
    beat: 0.8,
    lean: 0.6,
    stroke: (t) => {
      const w = TAU / 0.8;
      return [0.24 * Math.sin(w * t), 0.03 + 0.03 * Math.abs(Math.cos(w * t)), 0.06 * Math.sin((w * t) / 2)];
    },
  },
  // petits cercles appuyés, qui se déplacent d'un bout à l'autre de la tache
  scrub: {
    label: 'frotter',
    flat: 'down',
    ease: 0.35,
    beat: 0.5,
    lean: 1,
    stroke: (t) => {
      const w = TAU / 0.5;
      return [0.06 * Math.cos(w * t) + 0.12 * Math.sin((TAU * t) / 4), 0, 0.045 * Math.sin(w * t)];
    },
  },
  // contre une vitre ou un miroir : des cercles, la paume à plat
  wipeUp: {
    label: 'laver la vitre',
    flat: 'front',
    ease: 0.4,
    beat: 0.7,
    lean: 0,
    stroke: (t) => {
      const w = TAU / 0.7;
      return [0.11 * Math.cos(w * t) + 0.12 * Math.sin((TAU * t) / 5), 0.09 * Math.sin(w * t) + 0.08 * Math.cos((TAU * t) / 5), 0];
    },
  },
  // bras tendu vers la surface, le spray qui recule un peu à chaque pression, en balayant de côté
  spray: {
    label: 'vaporiser',
    ease: 0.35,
    beat: 0.55,
    lean: 0.4,
    stroke: (t) => {
      const u = saw(t, 0.55);
      return [0.15 * Math.sin((TAU * t) / 2.2), 0.3, -0.32 - 0.025 * Math.sin(Math.PI * Math.min(1, u / 0.3))];
    },
  },
  // la brosse tourne dans la cuvette, de haut en bas
  brush: {
    label: 'brosser',
    wand: [0, -1, 0.35],
    ease: 0.4,
    beat: 0.6,
    lean: 0.8,
    stroke: (t) => {
      const w = TAU / 0.6;
      return [0.07 * Math.cos(w * t), -0.05 + 0.05 * Math.sin((w * t) / 2), 0.05 * Math.sin(w * t)];
    },
  },
};

/** Part du geste en cours (0 outil tenu normalement, 1 en plein geste) : fondu au début et à la fin. */
export function choreAmount(style: ChoreStyle, t: number, total: number): number {
  return smooth(Math.max(0, Math.min(1, t / style.ease, (total - t) / style.ease)));
}

/** Le geste de l'outil `def` (ses drapeaux de fiche), ou null s'il ne sert pas au ménage. */
export function choreFor(def: { sweeps?: boolean; mops?: boolean; vacuums?: boolean; dusts?: boolean; spray?: boolean; scrubsBowl?: boolean; wipes?: boolean }, vertical = false): ChoreKind | null {
  if (def.sweeps) return 'sweep';
  if (def.mops) return 'mop';
  if (def.vacuums) return 'vacuum';
  if (def.dusts) return 'dust';
  if (def.scrubsBowl) return 'brush';
  if (def.spray) return 'spray';
  if (def.wipes) return vertical ? 'wipeUp' : 'scrub';
  return null;
}
