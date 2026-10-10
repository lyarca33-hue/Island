import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DIRTY, FloorDirt, itemDirtWords, Salissure, STRIDE } from '../src/game/salissure';

const RECT = { x0: 0, x1: 4, z0: 0, z1: 3 };

describe('salissure : le sol', () => {
  it('la poussière tombe avec le temps, plus le long des murs', () => {
    const f = new FloorDirt('cuisine', RECT);
    f.age(48);
    expect(f.level().poussiere).toBeGreaterThan(0.2);
    expect(f.dustAt(0.1, 1.5)).toBeGreaterThan(f.dustAt(2, 1.5));
  });

  it('le balai enlève la poussière là où il passe', () => {
    const f = new FloorDirt('cuisine', RECT);
    f.age(72);
    const before = f.dustAt(2, 1.5);
    const removed = f.clean(2, 1.5, 0.55, 'balai');
    expect(removed).toBeGreaterThan(0);
    expect(f.dustAt(2, 1.5)).toBeLessThan(before * 0.3);
    // loin du coup de balai, rien ne change
    expect(f.dustAt(0.2, 0.2)).toBeGreaterThan(0.3);
  });

  it('une empreinte salit sous le pied, la serpillière l’efface', () => {
    const f = new FloorDirt('entrée', RECT);
    f.stamp(2, 1.5, 0, 0.5);
    expect(f.tracesAt(2, 1.53)).toBeGreaterThan(0.3);
    expect(f.tracesAt(2.5, 1.5)).toBe(0);
    f.clean(2, 1.5, 0.55, 'serpillière');
    expect(f.tracesAt(2, 1.53)).toBeLessThan(0.05);
  });

  it('le carré le plus sale : le balai vise la poussière, la serpillière les traces', () => {
    const f = new FloorDirt('salon', RECT);
    expect(f.dirtiest('balai', undefined, 0.1)).toBeNull();
    f.soil(3, 1, 0.3, 0.8, 'boue');
    const spot = f.dirtiest('serpillière', undefined, 0.1);
    expect(spot).not.toBeNull();
    expect(Math.hypot(spot!.x - 3, spot!.z - 1)).toBeLessThan(0.5);
    // un carré écarté (sous un meuble) n'est pas proposé
    expect(f.dirtiest('serpillière', (x, z) => Math.hypot(x - 3, z - 1) < 0.5, 0.1)).toBeNull();
  });

  it('la sauvegarde garde poussière et traces', () => {
    const f = new FloorDirt('cuisine', RECT);
    f.age(40);
    f.soil(1, 1, 0.4, 0.6, 'boue');
    const g = new FloorDirt('cuisine', RECT);
    g.load(JSON.parse(JSON.stringify(f.save())));
    expect(g.dustAt(1, 2)).toBeCloseTo(f.dustAt(1, 2), 2);
    expect(g.level().traces).toBeGreaterThan(f.level().traces * 0.5);
  });

  it('le calque reste caché tant que le sol est propre', () => {
    const f = new FloorDirt('cuisine', RECT);
    const mesh = f.build();
    expect(mesh.visible).toBe(false);
    f.soil(2, 1.5, 0.4, 0.8, 'boue');
    f.render();
    expect(mesh.visible).toBe(true);
  });
});

describe('salissure : les pas', () => {
  it('dehors la boue colle aux semelles, dedans elle laisse des empreintes qui s’estompent', () => {
    const s = new Salissure([{ name: 'entrée', rect: RECT }]);
    const walker = { position: new THREE.Vector3(-3, 0, 1.5), yaw: Math.PI / 2, walking: true, outsideMud: 0.2 };
    // dehors : dix pas
    for (let i = 0; i < 10 * 4; i++) {
      walker.position.x += STRIDE / 4;
      s.tick(0.05, 0, walker);
    }
    expect(s.shoes).toBeGreaterThan(0.5);
    // dedans : la boue part en empreintes
    for (let i = 0; i < 40; i++) {
      walker.position.x = Math.min(3.9, walker.position.x + STRIDE / 4);
      s.tick(0.05, 0, walker);
    }
    expect(s.shoes).toBeLessThan(0.5);
    expect(s.floors[0].level().traces).toBeGreaterThan(0);
  });
});

describe('salissure : les mots', () => {
  it('dit poussiéreux ou sale au-delà du seuil', () => {
    expect(itemDirtWords({ dust: 0, grime: 0 }, false)).toEqual([]);
    expect(itemDirtWords({ dust: DIRTY + 0.05, grime: 0 }, false)).toEqual(['poussiéreux']);
    expect(itemDirtWords({ dust: 0.7, grime: 0 }, true)).toEqual(['couverte de poussière']);
    expect(itemDirtWords({ dust: 0, grime: 0.3 }, false)[0]).toMatch(/sale/);
  });
});
