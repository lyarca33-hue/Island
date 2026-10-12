import { describe, expect, it } from 'vitest';
import { AUTO_MAX, AUTO_MIN, AutoQuality } from '../src/game/autoQuality';

/** Relevés d'images par seconde, après le temps de chauffe du lancement. */
function feed(q: AutoQuality, fps: number, n: number): void {
  for (let i = 0; i < n; i++) q.sample(fps);
}

describe('qualité auto', () => {
  it('garde la qualité normale sur un ordinateur rapide', () => {
    const q = new AutoQuality();
    feed(q, 60, 200);
    expect(q.budget).toBe(AUTO_MAX);
  });

  it('ignore les à-coups du chargement', () => {
    const q = new AutoQuality();
    feed(q, 5, 8);
    expect(q.budget).toBe(AUTO_MAX);
  });

  it('baisse la finesse quand le jeu rame, jusqu’au plancher', () => {
    const q = new AutoQuality();
    feed(q, 60, 8);
    feed(q, 20, 4);
    expect(q.budget).toBeLessThan(AUTO_MAX);
    feed(q, 10, 40);
    expect(q.budget).toBe(AUTO_MIN);
  });

  it('remonte sans retourner là où il ramait', () => {
    const q = new AutoQuality();
    feed(q, 60, 8);
    feed(q, 30, 2);
    const slowAt = AUTO_MAX;
    feed(q, 60, 30);
    expect(q.budget).toBeLessThanOrEqual(slowAt * 0.9);
    expect(q.budget).toBeGreaterThan(AUTO_MAX * 0.7);
  });

  it('un seul relevé lent ne change rien', () => {
    const q = new AutoQuality();
    feed(q, 60, 8);
    for (let i = 0; i < 20; i++) feed(q, i % 2 ? 30 : 60, 1);
    expect(q.budget).toBe(AUTO_MAX);
  });
});
