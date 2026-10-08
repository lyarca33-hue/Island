import { describe, expect, it } from 'vitest';
import { DISHES, RECIPE_BY_DISH, RECIPES } from '../src/game/items/recipes';
import { normalize } from '../src/orders/parser';

describe('recettes', () => {
  it('chaque recette donne un plat qui existe', () => {
    const ids = new Set(DISHES.map((d) => d.id));
    for (const r of RECIPES) expect(ids, r.dish).toContain(r.dish);
  });

  it('chaque plat a sa recette', () => {
    for (const d of DISHES) expect(RECIPE_BY_DISH.get(d.id), d.id).toBeDefined();
  });

  it('pas deux recettes pour le même plat', () => {
    expect(RECIPE_BY_DISH.size).toBe(RECIPES.length);
  });

  it('chaque recette a des ingrédients et des mots pour la demander', () => {
    for (const r of RECIPES) {
      expect(r.needs.length, r.dish).toBeGreaterThan(0);
      expect(r.words.length, r.dish).toBeGreaterThan(0);
      expect(r.bonus, r.dish).toBeGreaterThan(0);
    }
  });

  it('les mots des recettes sont déjà normalisés (sans accents ni majuscules)', () => {
    for (const r of RECIPES) for (const w of r.words) expect(normalize(w), r.dish).toBe(w);
  });

  it('un ingrédient obligatoire n’est pas aussi en option', () => {
    for (const r of RECIPES) for (const x of r.extras ?? []) expect(r.needs, r.dish).not.toContain(x);
  });

  it('chaque plat se mange : faim rendue et bouchées', () => {
    for (const d of DISHES) {
      expect(d.food?.hunger, d.id).toBeGreaterThan(0);
      expect(d.food?.bites, d.id).toBeGreaterThan(0);
      expect(d.portable, d.id).toBe(true);
    }
  });

  it('le modèle 3D d’un plat se construit', () => {
    for (const d of DISHES) expect(d.build().children.length, d.id).toBeGreaterThan(0);
  });
});
