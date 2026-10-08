import { describe, expect, it } from 'vitest';
import { monsterMind, pickFish } from '../src/game/loisirs';
import { FISH, fishGrill, fishMeal, GRILL_FOOD, OUTDOOR_ITEMS, ROAMS } from '../src/game/items/plein-air';

const base = { dist: 10, home: 0, zone: 3, running: false, friend: 0, follow: 0, cornered: false };

describe('les monstres', () => {
  it('le puglin est curieux, le diablotin farouche', () => {
    expect(ROAMS.puglin.temper).toBe('curieux');
    expect(ROAMS.diablotin.temper).toBe('farouche');
  });

  it('le curieux regarde le perso qui approche, et le suit après un salut', () => {
    expect(monsterMind('curieux', base)).toBe('promène');
    expect(monsterMind('curieux', { ...base, dist: 1.5 })).toBe('regarde');
    expect(monsterMind('curieux', { ...base, dist: 8, follow: 30 })).toBe('suit');
    // à deux pas : il s'arrête et le regarde
    expect(monsterMind('curieux', { ...base, dist: 1, follow: 30 })).toBe('regarde');
  });

  it('un ami vient de lui-même voir le perso qui passe près', () => {
    expect(monsterMind('curieux', { ...base, dist: 5 })).toBe('promène');
    expect(monsterMind('curieux', { ...base, dist: 5, friend: 1 })).toBe('suit');
  });

  it('il lâche le perso trop loin, ou trop loin de chez lui, et rentre', () => {
    expect(monsterMind('curieux', { ...base, dist: 13, follow: 30 })).toBe('promène');
    expect(monsterMind('curieux', { ...base, dist: 5, home: 20, follow: 30 })).toBe('promène');
    expect(monsterMind('curieux', { ...base, dist: 5, follow: 30, homing: true })).toBe('promène');
  });

  it('le farouche fuit le perso qui approche, de plus loin s’il court, et se tapit acculé', () => {
    expect(monsterMind('farouche', base)).toBe('promène');
    expect(monsterMind('farouche', { ...base, dist: 4 })).toBe('regarde');
    expect(monsterMind('farouche', { ...base, dist: 4, running: true })).toBe('fuit');
    expect(monsterMind('farouche', { ...base, dist: 2 })).toBe('fuit');
    expect(monsterMind('farouche', { ...base, dist: 2, cornered: true })).toBe('tapi');
  });

  it('apprivoisé (trois saluts), le farouche suit comme le curieux', () => {
    expect(monsterMind('farouche', { ...base, dist: 2, friend: 2, follow: 30 })).toBe('fuit');
    expect(monsterMind('farouche', { ...base, dist: 2, friend: 3, follow: 30 })).toBe('suit');
  });
});

describe('griller le poisson au feu de camp', () => {
  it('chaque poisson pêché se grille entier et se mange', () => {
    for (const f of FISH) {
      const def = OUTDOOR_ITEMS.find((d) => d.id === f.id)!;
      expect(def.cook?.seconds).toBe(fishGrill(f.length));
      expect(def.food?.hunger).toBeGreaterThan(0);
      expect(GRILL_FOOD).toContain(f.name);
    }
  });

  it('un gros poisson nourrit plus et grille plus longtemps', () => {
    expect(fishMeal(0.9).hunger).toBeGreaterThan(fishMeal(0.12).hunger);
    expect(fishGrill(0.9)).toBeGreaterThan(fishGrill(0.12));
  });

  it('la grille reçoit les poissons, la tente est un lit', () => {
    const grill = OUTDOOR_ITEMS.find((d) => d.id === 'grille-camping')!;
    expect(grill.cookware?.holds).toEqual(GRILL_FOOD);
    expect(grill.cookware?.places.length).toBe(2);
    expect(OUTDOOR_ITEMS.find((d) => d.id === 'tente')?.bed).toBeTruthy();
  });

  it('la pêche tire toujours un poisson', () => {
    expect(FISH).toContain(pickFish(3, () => 0.5, () => 0.5));
  });
});
