/**
 * « Recette » d'un personnage : quelques choix et nombres qui suffisent à le reconstruire
 * (pièces des modèles VRoid, couleurs, proportions). Petite, lisible, sauvegardable : c'est
 * aussi ce qu'une IA pourra générer pour créer des PNJ.
 */
import { MODELS, MODEL_BY_ID, type Gender } from './catalog';

export interface Body {
  /** Échelle de tout le corps (1 = taille du modèle d'origine). */
  height: number;
  /** Échelle de la tête (visage et cheveux suivent). */
  head: number;
  /** Allongement des jambes. */
  legs: number;
  /** Largeur du buste et des épaules. */
  build: number;
}

export interface Recipe {
  version: 2;
  name: string;
  gender: Gender;
  /** Modèle qui fournit le corps et les vêtements. */
  outfit: string;
  /** Modèle qui fournit le visage (même genre que la tenue). */
  face: string;
  /** Modèle qui fournit la coiffure (n'importe lequel). */
  hair: string;
  /** null = couleurs d'origine du modèle. */
  hairColor: string | null;
  eyeColor: string | null;
  skinTone: string | null;
  body: Body;
}

export const DEFAULT_BODY: Body = { height: 1, head: 1, legs: 1, build: 1 };

/** Bornes des curseurs du corps. */
export const BODY_RANGE: Record<keyof Body, [number, number, string]> = {
  height: [0.88, 1.1, 'Taille'],
  head: [0.88, 1.15, 'Tête'],
  legs: [0.92, 1.08, 'Jambes'],
  build: [0.88, 1.15, 'Carrure'],
};

/** Teintes de peau : multipliées à la texture d'origine (blanc = inchangé). */
export const SKIN_TONES = ['#ffffff', '#fbe3d2', '#f0c8a8', '#dba27c', '#b97c55', '#8a5638', '#5e3a26'];
export const HAIR_COLORS = ['#1d1a22', '#3b2a22', '#6b4429', '#a8743f', '#e3c27a', '#f1ece2', '#9aa3b5', '#c2413a', '#e58bb0', '#6c4ab8', '#3e78c9', '#3c9c78'];
export const EYE_COLORS = ['#6b4126', '#3f8fd6', '#3ba06a', '#9a6dd6', '#d8a234', '#cf3d3d', '#7b8796'];

export function defaultRecipe(gender: Gender = 'f'): Recipe {
  const id = gender === 'f' ? 'sample_a' : 'sample_c';
  return {
    version: 2,
    name: gender === 'f' ? 'Aiko' : 'Caleb',
    gender,
    outfit: id,
    face: id,
    hair: id,
    hairColor: null,
    eyeColor: null,
    skinTone: null,
    body: { ...DEFAULT_BODY },
  };
}

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const around = (lo: number, hi: number) => 1 + (Math.random() - 0.5) * (hi - lo) * 0.6;

export function randomRecipe(): Recipe {
  const gender: Gender = Math.random() < 0.6 ? 'f' : 'm';
  const same = MODELS.filter((m) => m.gender === gender);
  const face = pick(same);
  // coiffure : plutôt du même genre, parfois de l'autre
  const hair = Math.random() < 0.8 ? pick(same) : pick(MODELS);
  return {
    version: 2,
    name: face.label,
    gender,
    outfit: pick(same).id,
    face: face.id,
    hair: hair.id,
    hairColor: Math.random() < 0.5 ? null : pick(HAIR_COLORS),
    eyeColor: Math.random() < 0.5 ? null : pick(EYE_COLORS),
    skinTone: Math.random() < 0.6 ? null : pick(SKIN_TONES.slice(1)),
    body: {
      height: around(...(BODY_RANGE.height.slice(0, 2) as [number, number])),
      head: around(...(BODY_RANGE.head.slice(0, 2) as [number, number])),
      legs: around(...(BODY_RANGE.legs.slice(0, 2) as [number, number])),
      build: around(...(BODY_RANGE.build.slice(0, 2) as [number, number])),
    },
  };
}

/** Recette lue d'un fichier ou du stockage : complétée et corrigée (anciennes versions, ids inconnus). */
export function sanitizeRecipe(raw: unknown): Recipe | null {
  const r = raw as Partial<Recipe> | null;
  if (!r || r.version !== 2) return null;
  const gender: Gender = r.gender === 'm' ? 'm' : 'f';
  const base = defaultRecipe(gender);
  const ok = (id: unknown, g?: Gender) => typeof id === 'string' && MODEL_BY_ID.has(id) && (!g || MODEL_BY_ID.get(id)!.gender === g);
  const color = (c: unknown) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  return {
    ...base,
    name: typeof r.name === 'string' ? r.name.slice(0, 24) : base.name,
    outfit: ok(r.outfit, gender) ? r.outfit! : base.outfit,
    face: ok(r.face, gender) ? r.face! : base.face,
    hair: ok(r.hair) ? r.hair! : base.hair,
    hairColor: color(r.hairColor),
    eyeColor: color(r.eyeColor),
    skinTone: color(r.skinTone),
    body: { ...DEFAULT_BODY, ...(r.body ?? {}) },
  };
}
