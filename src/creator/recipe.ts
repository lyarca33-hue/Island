/**
 * « Recette » d'un personnage : quelques nombres et choix qui suffisent à le reconstruire
 * (curseurs du créateur, couleurs, cheveux, vêtements). Petite, lisible, sauvegardable : c'est
 * aussi ce qu'une IA pourra générer pour créer des PNJ.
 */

export interface Macro {
  /** 0 = femme, 1 = homme. */
  gender: number;
  /** 0,1875 = 10 ans, 0,5 = 25 ans, 1 = 90 ans. */
  age: number;
  muscle: number;
  weight: number;
  height: number;
  proportions: number;
  african: number;
  asian: number;
  caucasian: number;
  breastSize: number;
  breastFirmness: number;
}

export interface Recipe {
  version: 1;
  name: string;
  macro: Macro;
  /** Curseurs de détail (id -> valeur, -1..1 ou 0..1 selon le curseur). */
  shape: Record<string, number>;
  skinColor: string;
  eyeColor: string;
  hair: string | null;
  hairColor: string;
  eyebrows: string;
  /** Vêtements portés (ids), du dessous vers le dessus. */
  clothes: string[];
  clothesTint: Record<string, string>;
}

export const MIN_AGE = 0.1875;

/** Âge en années <-> valeur du curseur (échelle de MakeHuman). */
export function ageYears(v: number): number {
  if (v < 0.1875) return 1 + (v / 0.1875) * 9;
  if (v < 0.5) return 10 + ((v - 0.1875) / 0.3125) * 15;
  return 25 + ((v - 0.5) / 0.5) * 65;
}

/** Taille approximative en cm (affichage). */
export function heightLabel(cm: number): string {
  return `${Math.round(cm)} cm`;
}

export function defaultRecipe(gender = 0.5): Recipe {
  const female = gender < 0.5;
  return {
    version: 1,
    name: female ? 'Lina' : 'Malo',
    macro: {
      gender,
      age: 0.5,
      muscle: 0.5,
      weight: 0.5,
      height: 0.5,
      proportions: 0.5,
      african: 1 / 3,
      asian: 1 / 3,
      caucasian: 1 / 3,
      breastSize: 0.5,
      breastFirmness: 0.5,
    },
    shape: {},
    skinColor: '#e8b896',
    eyeColor: 'brown',
    hair: female ? 'bob02' : 'short02',
    hairColor: '#4a2f1e',
    eyebrows: female ? 'eyebrow010' : 'eyebrow001',
    clothes: female ? ['female_casualsuit01', 'shoes02'] : ['male_casualsuit03', 'shoes01'],
    clothesTint: {},
  };
}

// --- curseurs de détail -------------------------------------------------------------------

export type Tab = 'corps' | 'tete' | 'visage' | 'silhouette';

export interface ShapeSlider {
  id: string;
  label: string;
  tab: Tab;
  section: string;
  /** Formes : [moins, plus] pour un curseur -1..1, ou [une seule] pour 0..1. Plusieurs
   *  couples quand un curseur agit des deux côtés (oreilles, yeux...). */
  targets: Array<[string, string] | [string]>;
}

const S: ShapeSlider[] = [];
function add(tab: Tab, section: string, id: string, label: string, targets: ShapeSlider['targets']): void {
  S.push({ id, label, tab, section, targets });
}
/** Curseur -1..1 sur une forme « nom-moins / nom-plus ». */
function pair(tab: Tab, section: string, label: string, base: string, lo = 'decr', hi = 'incr'): void {
  add(tab, section, base.split('/')[1] + (lo === 'decr' ? '' : `-${lo}-${hi}`), label, [[`${base}-${lo}`, `${base}-${hi}`]]);
}
/** Même chose, côtés gauche et droit ensemble ({s} = l ou r). */
function sym(tab: Tab, section: string, label: string, base: string, lo = 'decr', hi = 'incr'): void {
  const id = base.split('/')[1].replace('{s}-', '') + (lo === 'decr' ? '' : `-${lo}-${hi}`);
  add(tab, section, id, label, ['l', 'r'].map((s) => [`${base.replace('{s}', s)}-${lo}`, `${base.replace('{s}', s)}-${hi}`] as [string, string]));
}
function one(tab: Tab, section: string, label: string, target: string): void {
  add(tab, section, target.split('/')[1], label, [[target]]);
}

// Tête
pair('tete', 'Forme', 'Âge du visage', 'head/head-age');
pair('tete', 'Forme', 'Visage plein', 'head/head-fat');
pair('tete', 'Forme', 'Largeur', 'head/head-scale-horiz');
pair('tete', 'Forme', 'Hauteur', 'head/head-scale-vert');
pair('tete', 'Forme', 'Profondeur', 'head/head-scale-depth');
pair('tete', 'Forme', 'Arrière du crâne', 'head/head-back-scale-depth');
one('tete', 'Forme', 'Ovale', 'head/head-oval');
one('tete', 'Forme', 'Rond', 'head/head-round');
one('tete', 'Forme', 'Carré', 'head/head-square');
one('tete', 'Forme', 'Rectangulaire', 'head/head-rectangular');
one('tete', 'Forme', 'Triangulaire', 'head/head-triangular');
one('tete', 'Forme', 'Triangle inversé', 'head/head-invertedtriangular');
one('tete', 'Forme', 'Diamant', 'head/head-diamond');
pair('tete', 'Front', 'Hauteur du front', 'forehead/forehead-scale-vert');
pair('tete', 'Front', 'Front bombé', 'forehead/forehead-nubian');
pair('tete', 'Front', 'Tempes', 'forehead/forehead-temple');
pair('tete', 'Front', 'Front en avant', 'forehead/forehead-trans', 'backward', 'forward');
sym('tete', 'Oreilles', 'Taille', 'ears/{s}-ear-scale');
sym('tete', 'Oreilles', 'Hauteur', 'ears/{s}-ear-scale-vert');
sym('tete', 'Oreilles', 'Décollées', 'ears/{s}-ear-flap');
sym('tete', 'Oreilles', 'Lobe', 'ears/{s}-ear-lobe');
sym('tete', 'Oreilles', 'Rotation', 'ears/{s}-ear-rot', 'backward', 'forward');
sym('tete', 'Oreilles', 'Position', 'ears/{s}-ear-trans', 'down', 'up');
add('tete', 'Oreilles', 'ear-pointed', 'Pointues (elfe)', [['ears/l-ear-shape-pointed'], ['ears/r-ear-shape-pointed']]);
add('tete', 'Oreilles', 'ear-round', 'Rondes', [['ears/l-ear-shape-round'], ['ears/r-ear-shape-round']]);
pair('tete', 'Cou', 'Longueur du cou', 'measure/measure-neck-height');
pair('tete', 'Cou', 'Largeur du cou', 'neck/neck-scale-horiz');
pair('tete', 'Cou', 'Double menton', 'neck/neck-double');

// Visage
sym('visage', 'Yeux', 'Taille', 'eyes/{s}-eye-scale');
sym('visage', 'Yeux', 'Écartement', 'eyes/{s}-eye-trans', 'in', 'out');
sym('visage', 'Yeux', 'Hauteur', 'eyes/{s}-eye-trans', 'down', 'up');
sym('visage', 'Yeux', 'Ouverture', 'eyes/{s}-eye-height2');
sym('visage', 'Yeux', 'Coin extérieur', 'eyes/{s}-eye-corner1', 'down', 'up');
sym('visage', 'Yeux', 'Coin intérieur', 'eyes/{s}-eye-corner2', 'down', 'up');
sym('visage', 'Yeux', 'Paupière (bridé)', 'eyes/{s}-eye-epicanthus', 'in', 'out');
sym('visage', 'Yeux', 'Pli de paupière', 'eyes/{s}-eye-eyefold', 'down', 'up');
sym('visage', 'Yeux', 'Cernes', 'eyes/{s}-eye-bag');
pair('visage', 'Sourcils', 'Hauteur', 'eyebrows/eyebrows-trans', 'down', 'up');
pair('visage', 'Sourcils', 'Angle', 'eyebrows/eyebrows-angle', 'down', 'up');
pair('visage', 'Sourcils', 'Arcade', 'eyebrows/eyebrows-trans', 'backward', 'forward');
pair('visage', 'Nez', 'Taille', 'nose/nose-volume');
pair('visage', 'Nez', 'Largeur', 'nose/nose-scale-horiz');
pair('visage', 'Nez', 'Longueur', 'nose/nose-scale-vert');
pair('visage', 'Nez', 'Saillie', 'nose/nose-scale-depth');
pair('visage', 'Nez', 'Hauteur', 'nose/nose-trans', 'down', 'up');
pair('visage', 'Nez', 'Bosse', 'nose/nose-hump');
pair('visage', 'Nez', 'Pointe', 'nose/nose-point', 'down', 'up');
pair('visage', 'Nez', 'Pointe large', 'nose/nose-point-width');
pair('visage', 'Nez', 'Narines', 'nose/nose-nostrils-width');
pair('visage', 'Nez', 'Courbe', 'nose/nose-curve', 'concave', 'convex');
pair('visage', 'Nez', 'Nez grec', 'nose/nose-greek');
pair('visage', 'Bouche', 'Largeur', 'mouth/mouth-scale-horiz');
pair('visage', 'Bouche', 'Hauteur', 'mouth/mouth-trans', 'down', 'up');
pair('visage', 'Bouche', 'En avant', 'mouth/mouth-trans', 'backward', 'forward');
pair('visage', 'Bouche', 'Lèvre du haut', 'mouth/mouth-upperlip-volume');
pair('visage', 'Bouche', 'Lèvre du bas', 'mouth/mouth-lowerlip-volume');
pair('visage', 'Bouche', 'Coins de la bouche', 'mouth/mouth-angles', 'down', 'up');
pair('visage', 'Bouche', 'Fossettes', 'mouth/mouth-dimples', 'in', 'out');
pair('visage', 'Menton', 'Saillie', 'chin/chin-prominent');
pair('visage', 'Menton', 'Largeur', 'chin/chin-width');
pair('visage', 'Menton', 'Hauteur', 'chin/chin-height');
pair('visage', 'Menton', 'Mâchoire', 'chin/chin-bones');
pair('visage', 'Menton', 'Prognathe', 'chin/chin-prognathism');
pair('visage', 'Menton', 'Fossette', 'chin/chin-cleft');
sym('visage', 'Joues', 'Pommettes', 'cheek/{s}-cheek-bones');
sym('visage', 'Joues', 'Volume', 'cheek/{s}-cheek-volume');
sym('visage', 'Joues', 'Creusées', 'cheek/{s}-cheek-inner');

// Silhouette
pair('silhouette', 'Torse', 'Largeur', 'torso/torso-scale-horiz');
pair('silhouette', 'Torse', 'Profondeur', 'torso/torso-scale-depth');
pair('silhouette', 'Torse', 'Longueur', 'torso/torso-scale-vert');
pair('silhouette', 'Torse', 'En V', 'torso/torso-vshape');
pair('silhouette', 'Torse', 'Pectoraux', 'torso/torso-muscle-pectoral');
pair('silhouette', 'Torse', 'Dorsaux', 'torso/torso-muscle-dorsi');
pair('silhouette', 'Torse', 'Épaules', 'measure/measure-shoulder-dist');
pair('silhouette', 'Taille et hanches', 'Tour de taille', 'measure/measure-waist-circ');
pair('silhouette', 'Taille et hanches', 'Tour de hanches', 'measure/measure-hips-circ');
pair('silhouette', 'Taille et hanches', 'Largeur des hanches', 'hip/hip-scale-horiz');
pair('silhouette', 'Taille et hanches', 'Fesses', 'buttocks/buttocks-volume');
pair('silhouette', 'Taille et hanches', 'Ventre', 'stomach/stomach-pregnant');
pair('silhouette', 'Poitrine', 'Écartement', 'breast/breast-dist');
pair('silhouette', 'Poitrine', 'Hauteur', 'breast/breast-trans', 'down', 'up');
pair('silhouette', 'Poitrine', 'Pointe', 'breast/breast-point');
pair('silhouette', 'Bras', 'Longueur bras', 'measure/measure-upperarm-length');
pair('silhouette', 'Bras', 'Longueur avant-bras', 'measure/measure-lowerarm-length');
sym('silhouette', 'Bras', 'Biceps', 'armslegs/{s}-upperarm-muscle');
sym('silhouette', 'Bras', 'Bras enrobés', 'armslegs/{s}-upperarm-fat');
sym('silhouette', 'Bras', 'Avant-bras musclés', 'armslegs/{s}-lowerarm-muscle');
sym('silhouette', 'Bras', 'Mains', 'armslegs/{s}-hand-scale');
pair('silhouette', 'Jambes', 'Longueur cuisses', 'measure/measure-upperleg-height');
pair('silhouette', 'Jambes', 'Longueur mollets', 'measure/measure-lowerleg-height');
sym('silhouette', 'Jambes', 'Cuisses musclées', 'armslegs/{s}-upperleg-muscle');
sym('silhouette', 'Jambes', 'Cuisses enrobées', 'armslegs/{s}-upperleg-fat');
sym('silhouette', 'Jambes', 'Mollets', 'armslegs/{s}-lowerleg-muscle');
sym('silhouette', 'Jambes', 'Pieds', 'armslegs/{s}-foot-scale');

export const SHAPE_SLIDERS: readonly ShapeSlider[] = S;

/** Un curseur à deux formes va de -1 à 1, sinon de 0 à 1. */
export function sliderMin(s: ShapeSlider): number {
  return s.targets[0].length === 2 ? -1 : 0;
}

// --- choix d'apparence ---------------------------------------------------------------------

export const SKIN_TONES = ['#f6d7c3', '#efc3a4', '#e8b896', '#d39f78', '#b97d56', '#9a6142', '#7a472d', '#57301e', '#c9d8e8', '#a7c49a'];
export const HAIR_COLORS = ['#141010', '#2e1d14', '#4a2f1e', '#7a4b2a', '#a8703f', '#d9a35c', '#ecd08a', '#b83a22', '#9b9b9b', '#ece8e0', '#3a5fb8', '#d9578f'];
export const EYE_COLORS: Array<[string, string]> = [
  ['brown', 'Marron'], ['brownlight', 'Noisette'], ['green', 'Vert'], ['bluegreen', 'Bleu-vert'],
  ['blue', 'Bleu'], ['lightblue', 'Bleu clair'], ['deepblue', 'Bleu nuit'], ['grey', 'Gris'], ['ice', 'Glacier'],
];

export const HAIR_LABELS: Record<string, string> = {
  short01: 'Court en arrière', short02: 'Court', short03: 'Très court', short04: 'Coupe militaire',
  bob01: 'Carré long', bob02: 'Carré', long01: 'Longs', ponytail01: 'Queue de cheval',
  Braid01: 'Tresse', afro01: 'Afro',
};
export const EYEBROW_LABELS: Record<string, string> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`eyebrow${String(i + 1).padStart(3, '0')}`, `Style ${i + 1}`]),
);
/** Vêtements : nom affiché + emplacement (un seul haut, un seul bas... à la fois). */
export const CLOTHES: Record<string, { label: string; slot: 'tenue' | 'haut' | 'bas' | 'chaussures' | 'chapeau' }> = {
  male_casualsuit01: { label: 'Tenue décontractée 1', slot: 'tenue' },
  male_casualsuit02: { label: 'Tenue décontractée 2', slot: 'tenue' },
  male_casualsuit03: { label: 'Tenue décontractée 3', slot: 'tenue' },
  male_casualsuit04: { label: 'Tenue décontractée 4', slot: 'tenue' },
  male_casualsuit05: { label: 'Tenue décontractée 5', slot: 'tenue' },
  male_casualsuit06: { label: 'Tenue décontractée 6', slot: 'tenue' },
  male_elegantsuit01: { label: 'Costume', slot: 'tenue' },
  male_worksuit01: { label: 'Bleu de travail', slot: 'tenue' },
  female_casualsuit01: { label: 'Tenue décontractée F1', slot: 'tenue' },
  female_casualsuit02: { label: 'Tenue décontractée F2', slot: 'tenue' },
  female_elegantsuit01: { label: 'Tenue élégante', slot: 'tenue' },
  female_sportsuit01: { label: 'Tenue de sport', slot: 'tenue' },
  female_top_01: { label: 'Débardeur', slot: 'haut' },
  female_panties_01: { label: 'Culotte', slot: 'bas' },
  shoes01: { label: 'Baskets', slot: 'chaussures' },
  shoes02: { label: 'Ballerines', slot: 'chaussures' },
  shoes03: { label: 'Bottines', slot: 'chaussures' },
  shoes04: { label: 'Chaussures 4', slot: 'chaussures' },
  shoes05: { label: 'Chaussures 5', slot: 'chaussures' },
  shoes06: { label: 'Chaussures 6', slot: 'chaussures' },
  fedora: { label: 'Fedora', slot: 'chapeau' },
  fedora_cocked: { label: 'Fedora penché', slot: 'chapeau' },
};

/** Personnage au hasard (proportions plausibles : curseurs de détail modérés). */
export function randomRecipe(): Recipe {
  const r = Math.random;
  const gender = r() < 0.5 ? 0.05 + r() * 0.15 : 0.8 + r() * 0.2;
  const base = defaultRecipe(gender);
  const eth = [r(), r(), r()].map((x) => x * x);
  const sum = eth[0] + eth[1] + eth[2];
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const female = gender < 0.5;
  base.macro = {
    ...base.macro,
    age: 0.4 + r() * 0.45,
    muscle: 0.25 + r() * 0.6,
    weight: 0.2 + r() * 0.6,
    height: 0.3 + r() * 0.45,
    proportions: 0.4 + r() * 0.6,
    african: eth[0] / sum,
    asian: eth[1] / sum,
    caucasian: eth[2] / sum,
    breastSize: r(),
    breastFirmness: 0.3 + r() * 0.7,
  };
  for (const s of SHAPE_SLIDERS) {
    if (s.tab === 'silhouette' && r() < 0.6) continue;
    const v = (r() + r() + r() - 1.5) * 0.45; // en cloche, rarement extrême
    base.shape[s.id] = sliderMin(s) < 0 ? v : Math.max(0, v);
  }
  base.skinColor = pick(SKIN_TONES.slice(0, 8));
  base.hairColor = pick(HAIR_COLORS);
  base.eyeColor = pick(EYE_COLORS)[0];
  const hairs = female ? ['bob01', 'bob02', 'long01', 'ponytail01', 'Braid01', 'afro01', 'short01'] : ['short01', 'short02', 'short03', 'short04', 'afro01', 'bob02'];
  base.hair = pick(hairs);
  base.eyebrows = pick(Object.keys(EYEBROW_LABELS));
  const outfits = Object.entries(CLOTHES).filter(([id, c]) => c.slot === 'tenue' && id.startsWith(female ? 'female' : 'male')).map(([id]) => id);
  base.clothes = [pick(outfits), pick(['shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06'])];
  base.name = pick(female ? ['Lina', 'Maëlle', 'Inès', 'Rose', 'Yuna', 'Ambre', 'Nora', 'Zélie'] : ['Malo', 'Ilyes', 'Tom', 'Ewen', 'Sacha', 'Noé', 'Kenji', 'Aurèle']);
  return base;
}
