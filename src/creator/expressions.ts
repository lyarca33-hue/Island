/**
 * Expressions du visage toutes faites, à partir des unités d'expression de MakeHuman.
 * Ce sont les « balises d'émotion » que l'IA de RP pourra renvoyer.
 */
export const EXPRESSIONS: Record<string, { label: string; units: Record<string, number> }> = {
  neutre: { label: 'Neutre', units: {} },
  sourire: {
    label: 'Sourire',
    units: { 'mouth-corner-puller': 0.9, 'mouth-upward-retraction': 0.25, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25 },
  },
  rire: {
    label: 'Rire',
    units: { 'mouth-corner-puller': 1, 'mouth-open': 0.45, 'eye-left-slit': 0.55, 'eye-right-slit': 0.55, 'eyebrows-left-up': 0.2, 'eyebrows-right-up': 0.2 },
  },
  triste: {
    label: 'Triste',
    units: { 'eyebrows-left-inner-up': 0.9, 'eyebrows-right-inner-up': 0.9, 'mouth-depression': 0.7, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2 },
  },
  colere: {
    label: 'Colère',
    units: { 'eyebrows-left-down': 1, 'eyebrows-right-down': 1, 'mouth-compression': 0.6, 'nose-left-elevation': 0.4, 'nose-right-elevation': 0.4 },
  },
  surprise: {
    label: 'Surprise',
    units: { 'eyebrows-left-up': 1, 'eyebrows-right-up': 1, 'eye-left-opened-up': 0.8, 'eye-right-opened-up': 0.8, 'mouth-open': 0.55 },
  },
  peur: {
    label: 'Peur',
    units: { 'eyebrows-left-inner-up': 0.8, 'eyebrows-right-inner-up': 0.8, 'eye-left-opened-up': 0.7, 'eye-right-opened-up': 0.7, 'mouth-retraction': 0.6, 'neck-platysma': 0.4 },
  },
  degout: {
    label: 'Dégoût',
    units: { 'nose-left-elevation': 0.9, 'nose-right-elevation': 0.9, 'mouth-upward-retraction': 0.5, 'eyebrows-left-down': 0.5, 'eyebrows-right-down': 0.5 },
  },
  clin: {
    label: 'Clin d’œil',
    units: { 'eye-left-closure': 1, 'mouth-corner-puller': 0.6 },
  },
};
