import { describe, expect, it } from 'vitest';
import { CHORES, choreAmount, choreFor, type ChoreKind } from '../src/game/items/chores';
import { ITEM_BY_ID } from '../src/game/items/catalog';

describe('gestes de ménage', () => {
  const kinds = Object.keys(CHORES) as ChoreKind[];

  it('chaque geste a une façon de tenir l’outil', () => {
    for (const k of kinds) {
      const s = CHORES[k];
      const ways = [s.pole, s.wand, s.flat].filter(Boolean).length;
      // le spray seul n'en a pas : la main va où dit le geste
      expect(ways, k).toBe(k === 'spray' ? 0 : 1);
    }
  });

  it('la tête de l’outil reste près du point visé, sans s’envoler', () => {
    for (const k of kinds) {
      const s = CHORES[k];
      for (let t = 0; t < 6; t += 0.05) {
        const [x, y, z] = s.stroke(t);
        for (const v of [x, y, z]) expect(Number.isFinite(v), k).toBe(true);
        expect(Math.hypot(x, z), k).toBeLessThan(0.5);
        // les outils à manche ne quittent presque pas le sol
        if (s.pole) expect(y, k).toBeLessThan(0.05);
      }
    }
  });

  it('le geste se met en place puis revient en douceur', () => {
    const s = CHORES.sweep;
    expect(choreAmount(s, 0, 3)).toBe(0);
    expect(choreAmount(s, 1.5, 3)).toBe(1);
    expect(choreAmount(s, 3, 3)).toBe(0);
    expect(choreAmount(s, s.ease / 2, 3)).toBeGreaterThan(0);
    expect(choreAmount(s, s.ease / 2, 3)).toBeLessThan(1);
  });

  it('chaque outil de ménage du jeu a son geste', () => {
    const want: Record<string, ChoreKind> = {
      balai: 'sweep',
      serpilliere: 'mop',
      aspirateur: 'vacuum',
      plumeau: 'dust',
      'brosse-wc': 'brush',
      spray: 'spray',
      eponge: 'scrub',
      chiffon: 'scrub',
    };
    for (const [id, kind] of Object.entries(want)) {
      const def = ITEM_BY_ID.get(id);
      expect(def, id).toBeDefined();
      expect(choreFor(def!), id).toBe(kind);
      expect(def!.portable, id).toBe(true);
    }
    expect(choreFor(ITEM_BY_ID.get('chiffon')!, true)).toBe('wipeUp');
    expect(choreFor(ITEM_BY_ID.get('tasse')!)).toBeNull();
  });
});
