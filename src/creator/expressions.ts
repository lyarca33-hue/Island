/**
 * Expressions du visage toutes faites, à partir des expressions VRM du modèle (joie, colère,
 * tristesse, détente, surprise, voyelles de la bouche, clignements).
 * Ce sont les « balises d'émotion » que l'IA de RP pourra renvoyer.
 *
 * `morphs` : formes du visage VRoid pilotées directement (fin du nom, ex. « EYE_Close » pour
 * Fcl_EYE_Close) ; un modèle qui n'a pas la forme l'ignore.
 */
export const EXPRESSIONS: Record<string, { label: string; weights: Record<string, number>; morphs?: Record<string, number> }> = {
  neutre: { label: 'Neutre', weights: {} },
  sourire: { label: 'Sourire', weights: { relaxed: 0.7 } },
  rire: { label: 'Rire', weights: { happy: 1, aa: 0.2 } },
  triste: { label: 'Triste', weights: { sad: 1 } },
  colere: { label: 'Colère', weights: { angry: 1 } },
  surprise: { label: 'Surprise', weights: { surprised: 1, oh: 0.4 } },
  peur: { label: 'Peur', weights: { sad: 0.55, surprised: 0.5, ih: 0.3 } },
  degout: { label: 'Dégoût', weights: { angry: 0.45, sad: 0.3, ee: 0.3 } },
  clin: { label: 'Clin d’œil', weights: { blinkLeft: 1, happy: 0.35 } },
  espiegle: { label: 'Espiègle', weights: { relaxed: 0.5 }, morphs: { HA_Fung1: 1, BRW_Angry: 0.35 } },
  fier: { label: 'Fier', weights: { relaxed: 0.45 }, morphs: { EYE_Close: 0.35, BRW_Fun: 0.6 } },
  gene: { label: 'Gêné', weights: { extra: 1, sad: 0.2 } },
  somnolent: { label: 'Somnolent', weights: { relaxed: 0.2 }, morphs: { EYE_Close: 0.7, MTH_Neutral: 0.5 } },
  ebahi: { label: 'Ébahi', weights: { surprised: 0.4, oh: 0.6 }, morphs: { EYE_Spread: 1 } },
  boudeur: { label: 'Boudeur', weights: { angry: 0.3, sad: 0.25 }, morphs: { MTH_Up: 0.6 } },
  reveur: { label: 'Rêveur', weights: { relaxed: 0.6 }, morphs: { EYE_Highlight_Hide: 1, BRW_Sorrow: 0.3 } },
};
