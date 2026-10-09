import { describe, expect, it } from 'vitest';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { LEEK_SOUP, SOUP_VEG, SOUPS } from '../src/game/items/feculents';
import { JUICES, juiceFor } from '../src/game/items/pantry';
import { STRAINED } from '../src/game/items/patisserie';
import { OMELETTE_FILLINGS, omeletteFor, PREP_PAN_FOOD } from '../src/game/items/prep';

describe('recettes du tour d’octobre', () => {
  it('le jus du mixeur prend le nom de ses fruits', () => {
    expect(juiceFor(['pomme'])).toBe('jus de pomme');
    expect(juiceFor(['quartiers de pomme', 'pomme'])).toBe('jus de pomme');
    expect(juiceFor(['poire', 'poire'])).toBe('jus de poire');
    expect(juiceFor(['raisin'])).toBe('jus de raisin');
    expect(juiceFor(['banane'])).toBe('smoothie à la banane');
    expect(juiceFor(['banane', 'fraises'])).toBe('smoothie');
    expect(juiceFor(['pomme', 'poire'])).toBe('jus de fruits');
    for (const f of [['pomme'], ['banane', 'pomme'], ['orange'], ['fraises']]) expect(JUICES).toContain(juiceFor(f));
  });

  it('les œufs battus avec une garniture donnent l’omelette garnie, qui cuit à la poêle', () => {
    expect(omeletteFor(['œuf', 'œuf'])).toBe('omelette');
    expect(omeletteFor(['œuf', 'fromage râpé', 'œuf'])).toBe('omelette-fromage');
    expect(omeletteFor(['œuf', 'jambon'])).toBe('omelette-jambon');
    for (const id of Object.values(OMELETTE_FILLINGS)) {
      const def = ITEM_BY_ID.get(id);
      expect(def, id).toBeDefined();
      expect(PREP_PAN_FOOD, id).toContain(def!.name);
      expect(def!.cook, id).toBeDefined();
    }
  });

  it('le poireau fait une soupe de poireaux, servie comme les autres soupes', () => {
    expect(SOUP_VEG).toContain('poireau');
    expect(SOUP_VEG).toContain('pomme de terre');
    expect(SOUPS).toContain(ITEM_BY_ID.get(LEEK_SOUP.to)!.name);
    expect(ITEM_BY_ID.get(LEEK_SOUP.from)).toBeDefined();
  });

  it('la passoire garde les pâtes, le riz et les pommes de terre, et ne va pas sur le feu', () => {
    const passoire = ITEM_BY_ID.get('passoire')!;
    expect(passoire.strains).toBe(true);
    expect(passoire.cookware?.holds).toEqual(STRAINED);
    for (const n of ['pâtes', 'riz', 'pomme de terre']) expect(STRAINED).toContain(n);
  });
});
