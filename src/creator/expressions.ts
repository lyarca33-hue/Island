/**
 * Expressions du visage toutes faites, à partir des expressions VRM du modèle (joie, colère,
 * tristesse, détente, surprise, voyelles de la bouche, clignements).
 * Ce sont les « balises d'émotion » que l'IA de RP pourra renvoyer.
 */
export const EXPRESSIONS: Record<string, { label: string; weights: Record<string, number> }> = {
  neutre: { label: 'Neutre', weights: {} },
  sourire: { label: 'Sourire', weights: { relaxed: 0.7 } },
  rire: { label: 'Rire', weights: { happy: 1, aa: 0.2 } },
  triste: { label: 'Triste', weights: { sad: 1 } },
  colere: { label: 'Colère', weights: { angry: 1 } },
  surprise: { label: 'Surprise', weights: { surprised: 1, oh: 0.4 } },
  peur: { label: 'Peur', weights: { sad: 0.55, surprised: 0.5, ih: 0.3 } },
  degout: { label: 'Dégoût', weights: { angry: 0.45, sad: 0.3, ee: 0.3 } },
  clin: { label: 'Clin d’œil', weights: { blinkLeft: 1, happy: 0.35 } },
};
