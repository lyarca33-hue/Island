import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WorldItem } from '../src/game/items/carry';
import { extraYield, Garden, gardenLevel, gardenPerks, gardenPointsFor, GARDEN_SKILL_MAX, growthBoost, readBedSave, weedSlowdown, type GardenHost } from '../src/game/jardin';

describe('compétence jardinage', () => {
  it('va de 0 à 10, chaque niveau demande plus de points que le précédent', () => {
    expect(gardenLevel(0)).toBe(0);
    expect(gardenLevel(gardenPointsFor(1) - 0.1)).toBe(0);
    expect(gardenLevel(gardenPointsFor(1))).toBe(1);
    expect(gardenLevel(gardenPointsFor(4) + 1)).toBe(4);
    expect(gardenLevel(1e9)).toBe(GARDEN_SKILL_MAX);
    for (let n = 1; n < GARDEN_SKILL_MAX; n++) expect(gardenPointsFor(n + 1) - gardenPointsFor(n)).toBeGreaterThan(gardenPointsFor(n) - gardenPointsFor(n - 1));
  });

  it('donne de meilleures récoltes et une pousse plus rapide en montant', () => {
    expect(extraYield(0)).toBe(0);
    expect(extraYield(3)).toBe(1);
    expect(extraYield(10)).toBe(3);
    expect(growthBoost(0)).toBe(1);
    expect(growthBoost(10)).toBeGreaterThan(growthBoost(5));
    expect(weedSlowdown(5)).toBeGreaterThan(weedSlowdown(4));
  });

  it('dit ses avantages dans l’infobulle', () => {
    expect(gardenPerks(1)).toHaveLength(1);
    expect(gardenPerks(6).join(' ')).toContain('+2 légumes par récolte');
  });
});

describe('sauvegarde du potager', () => {
  it('relit les carrés, la terre et la compétence', () => {
    const s = readBedSave({ carres: [[1, 3], [null, 0], [0.42, 0], [0.9, 0]], eau: 0.3, herbes: 0.8, points: 57 });
    expect(s).toEqual({ carres: [[1, 3], [null, 0], [0.42, 0], [0.9, 0]], eau: 0.3, herbes: 0.8, points: 57 });
  });

  it('ignore une sauvegarde sans potager (ancienne partie)', () => {
    expect(readBedSave(undefined)).toBeNull();
    expect(readBedSave({ eau: 1 })).toBeNull();
  });

  it('ramène dans les bornes ce qui est abîmé', () => {
    const s = readBedSave({ carres: [[2, -4], ['x', 'y']], eau: 5, herbes: Number.NaN, points: -3 })!;
    expect(s.carres).toEqual([[1, 0], [null, 0]]);
    expect(s.eau).toBe(1);
    expect(s.herbes).toBe(0.35);
    expect(s.points).toBe(0);
  });
});

describe('le jardin gardé avec la partie', () => {
  // les feuillages se peignent sur une toile : une toile muette suffit ici
  const mute: object = new Proxy(function () {}, { get: () => mute, apply: () => mute, set: () => true });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => mute }) } as unknown as Document;
  const host = { character: {}, spawn: () => null, notice: () => {}, say: () => {}, mood: () => {}, soilHands: () => {}, pour: () => false, pouring: () => false, sitting: () => null } as unknown as GardenHost;
  const item = (id: string) => ({ def: { id }, object: new THREE.Group() }) as unknown as WorldItem;
  const make = () => {
    const g = new Garden(host);
    const items = [item('potager'), item('pommier'), item('massif-fleurs')];
    g.attach(items);
    return { g, items };
  };

  it('retrouve au chargement le potager, les pommes et les fleurs cueillies', () => {
    const a = make();
    a.g.tick(30, 1); // l'été passe : les pommes poussent, la terre sèche, les herbes montent
    const saved = a.items.map((it) => a.g.extras(it));
    const b = make();
    expect(b.g.stateOf(b.items[1])).not.toBe(a.g.stateOf(a.items[1])); // sans la sauvegarde, le pommier repartirait à 4 pommes
    b.items.forEach((it, i) => Object.keys(saved[i]).length && b.g.setExtras(it, saved[i]));
    expect(b.items.map((it) => b.g.stateOf(it))).toEqual(a.items.map((it) => a.g.stateOf(it)));
    expect(b.g.extras(b.items[0])).toEqual(saved[0]);
    expect(b.g.extras(b.items[1])).toEqual(saved[1]);
  });
});
