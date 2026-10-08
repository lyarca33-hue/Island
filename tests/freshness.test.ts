import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/game/items/catalog';
import { freshness, pointsFor, shelfLife, skillLevel, skillPerks, SKILL_MAX, starText, warmth } from '../src/game/items/freshness';

/** Une fiche d'aliment réduite à ce que regarde freshness.ts. */
const food = (name: string, extra: Partial<ItemDef> = {}) => ({ name, food: { hunger: 10, bites: 1, color: 0 }, ...extra }) as unknown as ItemDef;

describe('fraîcheur des aliments', () => {
  it('la viande crue se garde 12 h, le sucre se garde toujours', () => {
    expect(shelfLife(food('steak'))).toBe(12);
    expect(shelfLife(food('sucre'))).toBeNull();
  });

  it('ce qui ne se mange pas n’a pas de date', () => {
    expect(shelfLife({ name: 'tasse' } as unknown as ItemDef)).toBeNull();
  });

  it('les morceaux coupés se gardent moins longtemps que le fruit entier', () => {
    expect(shelfLife(food('quartiers de pomme'))!).toBeLessThan(shelfLife(food('pomme'))!);
  });

  it('un plat cuit se garde un jour', () => {
    expect(shelfLife(food('gratin', { cook: {} } as Partial<ItemDef>))).toBe(24);
  });

  it('frais, puis à manger vite, puis périmé', () => {
    const steak = food('steak');
    expect(freshness(steak, 0)).toBe('frais');
    expect(freshness(steak, 10)).toBe('à manger vite');
    expect(freshness(steak, 12)).toBe('périmé');
    expect(freshness(food('miel'), 10_000)).toBe('frais');
  });

  it('un plat refroidit : chaud, tiède, froid', () => {
    expect(warmth(1)).toBe('chaud');
    expect(warmth(0.3)).toBe('tiède');
    expect(warmth(0)).toBe('froid');
  });

  it('étoiles d’un plat', () => {
    expect(starText(3)).toBe('★★★☆☆');
    expect(starText(0)).toBe('☆☆☆☆☆');
  });
});

describe('compétence cuisine', () => {
  it('niveau 1 à 15 points, niveau 10 à 825', () => {
    expect(pointsFor(1)).toBe(15);
    expect(pointsFor(10)).toBe(825);
    expect(skillLevel(0)).toBe(0);
    expect(skillLevel(14)).toBe(0);
    expect(skillLevel(15)).toBe(1);
    expect(skillLevel(824)).toBe(9);
  });

  it('plafonne au niveau maximum', () => {
    expect(skillLevel(1e9)).toBe(SKILL_MAX);
  });

  it('les niveaux montent toujours', () => {
    for (let n = 1; n < SKILL_MAX; n++) expect(pointsFor(n + 1)).toBeGreaterThan(pointsFor(n));
  });

  it('décrit ce que change le niveau', () => {
    expect(skillPerks(0)).toHaveLength(3);
    expect(skillPerks(4)[0]).toContain('+1 étoile');
    expect(skillPerks(2)[1]).toContain('10 %');
  });
});
