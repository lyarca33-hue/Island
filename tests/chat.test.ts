import { describe, expect, it } from 'vitest';
import { ANIMAL_ITEMS, HUNGRY, catFood, kittenWants, readKitten, tickNeeds } from '../src/game/items/animaux';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { priceOf } from '../src/game/argent';

describe('le chaton', () => {
  it('a faim au bout de quelques heures de jeu, et sommeil', () => {
    let n = { hunger: 0, sleepy: 0 };
    n = tickNeeds(n, 60, false);
    expect(kittenWants(n)).toBe('balade');
    n = tickNeeds(n, 10, false);
    expect(n.sleepy).toBe(1);
    expect(kittenWants(n)).toBe('dormir');
    n = tickNeeds(n, 20, false);
    expect(n.hunger).toBeGreaterThanOrEqual(HUNGRY);
    // la faim passe avant le sommeil
    expect(kittenWants(n)).toBe('manger');
  });

  it('se repose en dormant, et a moins vite faim', () => {
    const n = tickNeeds({ hunger: 0.2, sleepy: 1 }, 30, true);
    expect(n.sleepy).toBe(0);
    expect(n.hunger).toBeLessThan(tickNeeds({ hunger: 0.2, sleepy: 1 }, 30, false).hunger);
  });

  it('mange des croquettes, du poisson et du steak, pas des carottes', () => {
    const fish = (id: string) => id === 'truite';
    expect(catFood('croquettes', fish)).toBe(true);
    expect(catFood('truite', fish)).toBe(true);
    expect(catFood('steak', fish)).toBe(true);
    expect(catFood('carotte', fish)).toBe(false);
  });

  it('relit sa sauvegarde, même abîmée', () => {
    expect(readKitten({ adopte: true, faim: 0.4, sommeil: 2 })).toEqual({ adopte: true, faim: 0.4, sommeil: 1 });
    expect(readKitten({ faim: 'beaucoup' })).toEqual({ adopte: false, faim: 0, sommeil: 0 });
    expect(readKitten(undefined)).toBeNull();
  });

  it('a ses objets au catalogue, la gamelle et les croquettes au magasin', () => {
    for (const d of ANIMAL_ITEMS) expect(ITEM_BY_ID.get(d.id)).toBe(d);
    expect(priceOf(ITEM_BY_ID.get('croquettes')!)).toBe(450);
    expect(priceOf(ITEM_BY_ID.get('gamelle')!)).toBe(600);
  });

  it('a un chaton qui se construit avec ses pièces qui bougent', () => {
    const cat = ITEM_BY_ID.get('chaton')!.build();
    for (const n of ['chat', 'corps', 'tete', 'yeux', 'patte-ag', 'patte-pd', 'queue-0', 'queue-4']) expect(cat.getObjectByName(n)).toBeTruthy();
    const bowl = ITEM_BY_ID.get('gamelle')!.build();
    expect(bowl.getObjectByName('croquettes')?.visible).toBe(false);
  });
});
