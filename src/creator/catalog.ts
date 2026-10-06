/**
 * Persos de base du créateur : les modèles d'exemple officiels de VRoid Studio (style anime,
 * shader toon MToon, expressions, cheveux à ressorts). Chacun fournit trois pièces que l'on
 * peut mélanger : sa tenue (corps + vêtements), son visage et sa coiffure.
 *
 * Fichiers : public/vrm/<id>.vrm (+ vignette <id>.webp), produits par tools/build_vrm_assets.py.
 */

export type Gender = 'f' | 'm';

export interface BaseModel {
  id: string;
  label: string;
  gender: Gender;
  /** Courte description de la tenue (choix « Tenue »). */
  outfit: string;
  /** Courte description de la coiffure (choix « Coiffure »). */
  hair: string;
}

export const MODELS: BaseModel[] = [
  { id: 'sample_a', label: 'Aiko', gender: 'f', outfit: 'Gilet et short', hair: 'Carré brun' },
  { id: 'sample_b', label: 'Bérénice', gender: 'f', outfit: 'Blouson et jupe rose', hair: 'Longs, couettes' },
  { id: 'shino', label: 'Shino', gender: 'f', outfit: 'Uniforme, nœud bleu', hair: 'Longs et raides' },
  { id: 'shibu', label: 'Shibu', gender: 'f', outfit: 'Uniforme, nœud orange', hair: 'Courts, mèches longues' },
  { id: 'darkness', label: 'Nuit', gender: 'f', outfit: 'Robe gothique', hair: 'Carré rouge' },
  { id: 'victoria', label: 'Victoria', gender: 'f', outfit: 'Robe de princesse', hair: 'Longs, queue de côté' },
  { id: 'vita', label: 'Vita', gender: 'f', outfit: 'Combinaison futuriste', hair: 'Courts blancs' },
  { id: 'vivi', label: 'Vivi', gender: 'f', outfit: 'Robe de campagne', hair: 'Carré à frange' },
  { id: 'hair_f', label: 'Lina', gender: 'f', outfit: 'Robe blanche', hair: 'Couettes, oreilles de chat' },
  { id: 'sample_c', label: 'Caleb', gender: 'm', outfit: 'Veste technique', hair: 'Courts, mèche' },
  { id: 'fumiriya', label: 'Fumiya', gender: 'm', outfit: 'Uniforme et cravate', hair: 'Courts, en bataille' },
  { id: 'hair_m', label: 'Hugo', gender: 'm', outfit: 'Sweat à capuche', hair: 'Courts, en pointes' },
];

export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

const BASE = `${import.meta.env.BASE_URL}vrm/`;
export const modelUrl = (id: string) => `${BASE}${id}.vrm`;
export const thumbUrl = (id: string) => `${BASE}${id}.webp`;
