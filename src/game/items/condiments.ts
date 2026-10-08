/**
 * Sauces et condiments : ketchup, mayonnaise, moutarde, vinaigre, crème, citron et ail
 * s'utilisent comme les pots de l'étagère à épices (« Assaisonner », en les tenant). Chacun a ses
 * accords : sur ce qui lui va (ketchup et frites, citron et poisson, crème et fraises), le plat
 * gagne une étoile et le perso dit « Parfait ! » ; sur ce qui ne va pas (moutarde sur des fraises),
 * il grimace. Les objets eux-mêmes viennent des provisions (pantry.ts) : ici, seulement les règles,
 * rangées par nom.
 */

export interface Condiment {
  /** Le mot du geste (« un trait de ketchup »). */
  word: string;
  /** Ce qui lui va : des mots qu'on cherche dans le nom de l'aliment ou du plat. */
  good: string[];
  /** Ce qui ne va pas avec. */
  odd: string[];
}

/** Ce qui est sucré : aucune sauce salée ne s'y accorde. */
const SWEET = ['fruits', 'fraise', 'banane', 'orange', 'yaourt', 'chocolat', 'confiture', 'miel', 'crêpe', 'biscuits', 'pomme', 'gâteau'];
/** Les pommes de terre ne sont pas des pommes : on les cherche sous ce mot. */
const POTATO = 'patate';

export const CONDIMENTS: Record<string, Condiment> = {
  ketchup: { word: 'un trait de ketchup', good: ['frites', 'hot-dog', 'saucisse', 'steak', 'sandwich', 'pâtes'], odd: [...SWEET, 'poisson', 'salade'] },
  mayonnaise: { word: 'une noix de mayonnaise', good: ['frites', 'œuf', 'poulet', 'sandwich', 'poisson'], odd: [...SWEET] },
  moutarde: { word: 'un peu de moutarde', good: ['steak', 'saucisse', 'jambon', 'hot-dog', 'sandwich', 'vinaigrette'], odd: [...SWEET, 'poisson'] },
  vinaigre: { word: 'un filet de vinaigre', good: ['salade', 'crudités', 'concombre', 'tomate', 'carotte', 'frites'], odd: [...SWEET, 'steak', 'œuf', 'omelette'] },
  crème: { word: 'une cuillère de crème', good: ['fraise', 'fruits', 'champignons', 'pâtes', 'crêpe', 'poêlée', POTATO], odd: ['salade verte', 'salade composée', 'sandwich', 'hot-dog', 'frites'] },
  citron: { word: 'un filet de citron', good: ['poisson', 'salade', 'crêpe', 'fruits', 'poulet'], odd: ['steak', 'chocolat', 'saucisse', 'hot-dog', 'pâtes', 'yaourt'] },
  'rondelles de citron': { word: 'un filet de citron', good: ['poisson', 'salade', 'crêpe', 'fruits', 'poulet'], odd: ['steak', 'chocolat', 'saucisse', 'hot-dog', 'pâtes', 'yaourt'] },
  ail: { word: 'une gousse d’ail', good: ['steak', 'poulet', 'champignons', 'poêlée', 'courgette', POTATO, 'tartine', 'pâtes'], odd: [...SWEET] },
};

/** Le mot du geste pour assaisonner avec `name` (pot d'épices ou condiment), s'il assaisonne. */
export function seasonWord(def: { name: string; spice?: string }): string | undefined {
  return def.spice ?? CONDIMENTS[def.name]?.word;
}

/** Accord des condiments d'un aliment : +1 si l'un lui va (et aucun ne jure), −1 si l'un jure, 0 sinon. */
export function pairing(name: string, used: Iterable<string>): -1 | 0 | 1 {
  const food = name.replace(/pommes? de terre/g, POTATO);
  let good = false;
  for (const n of used) {
    const c = CONDIMENTS[n];
    if (!c) continue;
    if (c.odd.some((w) => food.includes(w))) return -1;
    if (c.good.some((w) => food.includes(w))) good = true;
  }
  return good ? 1 : 0;
}

/** Ce que dit le perso à la première bouchée d'un accord réussi ou raté. */
export const PAIRING_SAY = { good: 'Parfait !', odd: 'Beurk… drôle de mélange.' };
