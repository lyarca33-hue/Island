/**
 * « Recette » d'un personnage : quelques choix et nombres qui suffisent à le reconstruire
 * (pièces des modèles VRoid, couleurs, proportions). Petite, lisible, sauvegardable : c'est
 * aussi ce qu'une IA pourra générer pour créer des PNJ.
 */
import { ACCESSORIES, ACCESSORY_BY_ID, SLOTS, type AccSlot } from './accessories';
import { MODELS, MODEL_BY_ID, type Gender } from './catalog';
import { BLUSH_COLORS, FACE_MARK_BY_ID, FACE_MARKS, MARK_COLORS, NO_MAKEUP, PATTERN_BY_ID, PATTERNS, type Makeup, type WornPattern } from './looks';

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
  /** Couleurs des vêtements (null = d'origine). Absent des anciennes recettes. */
  clothes?: Clothes;
  /** Accessoire porté par emplacement (chapeau, lunettes...). Absent des anciennes recettes. */
  accessories?: Partial<Record<AccSlot, WornAccessory>>;
  /** Joues, sourcils, cils et dessins du visage. Absent des anciennes recettes. */
  makeup?: Makeup;
  /** Motif imprimé par vêtement (rayures, pois...). Absent des anciennes recettes. */
  patterns?: Partial<Record<keyof Clothes, WornPattern>>;
}

export interface Clothes {
  top: string | null;
  bottom: string | null;
  shoes: string | null;
}

export interface WornAccessory {
  id: string;
  color: string;
}

export const NO_CLOTHES: Clothes = { top: null, bottom: null, shoes: null };

/** Teintes des vêtements : la texture passe en niveaux de gris puis prend la couleur. */
export const CLOTH_COLORS = ['#f4efe6', '#2a2a33', '#5a6478', '#c2413a', '#e58bb0', '#e9c27a', '#d98b3a', '#3c9c78', '#3e78c9', '#26386b', '#6c4ab8', '#8a5638'];

/** Prénoms pour le bouton « au hasard » du nom. */
export const NAMES: Record<Gender, string[]> = {
  f: ['Aiko', 'Lina', 'Maëlle', 'Inès', 'Yuki', 'Rose', 'Nora', 'Chloé', 'Mila', 'Sakura', 'Jade', 'Lou', 'Hana', 'Zoé', 'Margaux', 'Léa', 'Emi', 'Capucine'],
  m: ['Caleb', 'Hugo', 'Kenji', 'Louis', 'Tom', 'Ryo', 'Nathan', 'Sacha', 'Haruto', 'Gabin', 'Léo', 'Malo', 'Ren', 'Arthur', 'Noé', 'Yanis', 'Kaito', 'Basile'],
};

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
export const HAIR_COLORS = [
  '#1d1a22', '#3b2a22', '#6b4429', '#a8743f', '#e3c27a', '#f1ece2', '#9aa3b5', '#c2413a', '#e58bb0', '#6c4ab8', '#3e78c9', '#3c9c78',
  // pastels et couleurs vives
  '#f6b8c8', '#c8b4f0', '#a8d8f0', '#b8e6c4', '#f0dca0', '#ff7a45', '#2b8fa3', '#8b1e3f',
];
export const EYE_COLORS = ['#6b4126', '#3f8fd6', '#3ba06a', '#9a6dd6', '#d8a234', '#cf3d3d', '#7b8796', '#e070a8', '#40c4c4', '#1f2a5a', '#f0f0f0'];

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
    clothes: { ...NO_CLOTHES },
    accessories: {},
    makeup: { ...NO_MAKEUP, marks: [] },
    patterns: {},
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
  const accessories: Partial<Record<AccSlot, WornAccessory>> = {};
  for (const [slot] of SLOTS) {
    if (Math.random() < 0.7) continue;
    const a = pick(ACCESSORIES.filter((x) => x.slot === slot));
    accessories[slot] = { id: a.id, color: Math.random() < 0.6 ? a.color : pick(CLOTH_COLORS) };
  }
  const cloth = () => (Math.random() < 0.6 ? null : pick(CLOTH_COLORS));
  const patterns: Partial<Record<keyof Clothes, WornPattern>> = {};
  if (Math.random() < 0.3) patterns[Math.random() < 0.6 ? 'top' : 'bottom'] = { id: pick(PATTERNS).id, color: pick(CLOTH_COLORS) };
  const marks = Math.random() < 0.35 ? [pick(FACE_MARKS.filter((m) => m.id !== 'barbe' || gender === 'm')).id] : [];
  return {
    version: 2,
    name: pick(NAMES[gender]),
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
    clothes: { top: cloth(), bottom: cloth(), shoes: cloth() },
    accessories,
    makeup: {
      blush: Math.random() < 0.4 ? pick(BLUSH_COLORS) : null,
      brows: null,
      lashes: null,
      marks,
      markColor: pick(MARK_COLORS),
    },
    patterns,
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
    clothes: { top: color(r.clothes?.top), bottom: color(r.clothes?.bottom), shoes: color(r.clothes?.shoes) },
    accessories: Object.fromEntries(
      SLOTS.flatMap(([slot]) => {
        const w = r.accessories?.[slot];
        const a = w && ACCESSORY_BY_ID.get(w.id);
        return a && a.slot === slot ? [[slot, { id: a.id, color: color(w.color) ?? a.color }]] : [];
      }),
    ),
    makeup: {
      blush: color(r.makeup?.blush),
      brows: color(r.makeup?.brows),
      lashes: color(r.makeup?.lashes),
      marks: Array.isArray(r.makeup?.marks) ? [...new Set(r.makeup.marks.filter((id) => FACE_MARK_BY_ID.has(id)))] : [],
      markColor: color(r.makeup?.markColor) ?? NO_MAKEUP.markColor,
    },
    patterns: Object.fromEntries(
      (['top', 'bottom', 'shoes'] as const).flatMap((k) => {
        const p = r.patterns?.[k];
        const c = p && color(p.color);
        return p && c && PATTERN_BY_ID.has(p.id) ? [[k, { id: p.id, color: c }]] : [];
      }),
    ),
  };
}
