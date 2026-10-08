/**
 * La vie d'un aliment après l'achat : fraîcheur (il se périme hors du frigo), chaleur (un plat
 * cuit refroidit), qualité d'un plat préparé (étoiles), et la compétence cuisine du perso qui
 * monte à force de cuisiner. Ici les règles et les chiffres ; Game.ts les applique.
 */
import type { ItemDef } from './catalog';

/** Heures de jeu hors du frigo avant d'être périmé, par nom ; null : se garde (épicerie, condiments). */
const LIFE: Record<string, number | null> = {
  // viande et poisson crus
  steak: 12, poulet: 12, poisson: 12, saucisses: 12, jambon: 12,
  // laitages et œufs
  'œuf': 24, beurre: 24, fromage: 24, 'fromage râpé': 24, yaourt: 24, crème: 24,
  // le pain rassit
  pain: 48, 'tranches de pain': 24, 'pain grillé': 24,
  // ce qui se garde
  farine: null, sucre: null, 'tablette de chocolat': null, confiture: null, miel: null, 'pâte à tartiner': null,
  'sauce tomate': null, vinaigre: null, levure: null, biscuits: null, chips: null, moutarde: null, ketchup: null,
  mayonnaise: null, oignon: 336, ail: 336, 'pomme de terre': 336,
};
/** Les morceaux coupés se gardent moins longtemps que l'aliment entier. */
const CUT_LIFE = 24;
/** Un plat préparé ou cuit. */
const DISH_LIFE = 24;
/** Fruits, légumes et le reste. */
const DEFAULT_LIFE = 72;

/** Durée de vie hors du frigo (heures de jeu), ou null si l'aliment se garde. */
export function shelfLife(def: ItemDef): number | null {
  if (!def.food) return null;
  if (def.name in LIFE) return LIFE[def.name];
  if (/^(rondelles|quartiers|tranches|feuilles|morceaux)\b/.test(def.name)) return CUT_LIFE;
  if (def.cook) return DISH_LIFE;
  return DEFAULT_LIFE;
}

/** Vitesse du vieillissement : au frigo dix fois moins vite, au congélateur plus du tout. */
export const AGE_FRIDGE = 0.1;
/** Part de la vie à partir de laquelle il faut le manger vite. */
export const SOON = 0.75;

export type Freshness = 'frais' | 'à manger vite' | 'périmé';

export function freshness(def: ItemDef, age: number): Freshness {
  const life = shelfLife(def);
  if (life === null) return 'frais';
  const k = age / life;
  return k >= 1 ? 'périmé' : k >= SOON ? 'à manger vite' : 'frais';
}

/** Chaleur perdue par heure de jeu : un plat chaud est froid en une demi-heure (trois fois plus vite au frigo). */
export const COOL_PER_HOUR = 2;
export const COOL_FRIDGE = 3;
export type Warmth = 'chaud' | 'tiède' | 'froid';
export function warmth(heat: number): Warmth {
  return heat > 0.5 ? 'chaud' : heat > 0.15 ? 'tiède' : 'froid';
}

/** Ce que rapporte une bouchée selon l'état : froid, pas frais, périmé, et les étoiles du plat. */
export const WARMTH_HUNGER: Record<Warmth, number> = { chaud: 1, tiède: 0.9, froid: 0.8 };
export const FRESH_HUNGER: Record<Freshness, number> = { frais: 1, 'à manger vite': 0.9, périmé: 0.5 };
/** Santé perdue en mangeant un aliment périmé (une fois par aliment). */
export const SPOILED_HARM = 8;
/** Un plat 5 étoiles fait du bien : santé rendue (une fois par plat). */
export const STAR_HEAL = 3;
export const starsHunger = (stars: number) => 0.8 + 0.1 * stars;

/** « ★★★☆☆ » */
export const starText = (stars: number) => '★'.repeat(stars) + '☆'.repeat(5 - stars);

/** Ce que dit le perso à la première bouchée d'un plat, selon ses étoiles. */
export const STAR_VERDICT = ['', 'Bof, pas terrible.', 'Mangeable.', 'C’est bon.', 'Très bon !', 'Délicieux !'];

/**
 * Compétence cuisine : des points à chaque geste et chaque plat ; le niveau n demande
 * POINTS_STEP × n(n+1)/2 points (niveau 1 : 15 points, niveau 10 : 825).
 */
export const SKILL_MAX = 10;
const POINTS_STEP = 15;
export const pointsFor = (level: number) => (POINTS_STEP * level * (level + 1)) / 2;
export function skillLevel(points: number): number {
  let n = 0;
  while (n < SKILL_MAX && points >= pointsFor(n + 1)) n++;
  return n;
}
/** Points gagnés : un geste (couper, casser, fouetter, remuer, assaisonner…), un aliment cuit à point, un plat réuni. */
export const XP_GESTURE = 1;
export const XP_COOKED = 3;
export const XP_DISH = 5;
/** Ce que change le niveau, rappelé au survol de la jauge. */
export function skillPerks(level: number): string[] {
  return [
    `Plats mieux réussis : +${(level / 4).toFixed(level % 4 ? 2 : 0).replace('.', ',')} étoile`,
    `Brûle ${Math.round(level * 5)} % moins vite`,
    `Rate ${Math.round(level * 7)} % moins de sauts de poêle`,
  ];
}
