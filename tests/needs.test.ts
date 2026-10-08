import { describe, expect, it } from 'vitest';
import { NEEDS, Needs } from '../src/game/needs';

const rate = (key: string) => NEEDS.find((n) => n.key === key)!.perHour;

describe('besoins du perso', () => {
  it('commence avec des jauges entre 0 et 100 et la santé pleine', () => {
    const n = new Needs();
    for (const def of NEEDS) expect(n.values[def.key]).toBeGreaterThan(0);
    for (const def of NEEDS) expect(n.values[def.key]).toBeLessThanOrEqual(100);
    expect(n.health).toBe(100);
  });

  it('les jauges baissent avec le temps, au rythme de chaque besoin', () => {
    const n = new Needs();
    const before = { ...n.values };
    n.tick(1, 'idle', false);
    for (const def of NEEDS) expect(n.values[def.key]).toBeCloseTo(before[def.key] - def.perHour, 5);
  });

  it('courir creuse plus vite que marcher, qui creuse plus vite que rester immobile', () => {
    const lost = (gait: 'idle' | 'walk' | 'run') => {
      const n = new Needs();
      n.tick(1, gait, false);
      return 70 - n.values.faim;
    };
    expect(lost('walk')).toBeGreaterThan(lost('idle'));
    expect(lost('run')).toBeGreaterThan(lost('walk'));
  });

  it('assis, on se fatigue deux fois moins vite ; la nuit, plus vite', () => {
    const fatigue = (gait: 'idle' | 'sit', night: boolean) => {
      const n = new Needs();
      n.set('fatigue', 80);
      n.tick(1, gait, night);
      return 80 - n.values.fatigue;
    };
    expect(fatigue('sit', false)).toBeCloseTo(fatigue('idle', false) / 2, 5);
    expect(fatigue('idle', true)).toBeGreaterThan(fatigue('idle', false));
  });

  it('le sommeil remonte la fatigue et ralentit les autres besoins', () => {
    const n = new Needs();
    n.set('fatigue', 20);
    n.set('faim', 50);
    n.tick(1, 'sleep', true);
    expect(n.values.fatigue).toBeGreaterThan(20);
    expect(50 - n.values.faim).toBeCloseTo(rate('faim') / 2, 5);
  });

  it('les jauges ne descendent pas sous 0 et ne montent pas au-dessus de 100', () => {
    const n = new Needs();
    n.tick(500, 'run', true);
    for (const def of NEEDS) expect(n.values[def.key]).toBe(0);
    n.restore('faim', 500);
    expect(n.values.faim).toBe(100);
    n.set('soif', -20);
    expect(n.values.soif).toBe(0);
  });

  it('boire remplit la vessie', () => {
    const n = new Needs();
    n.set('soif', 20);
    n.set('vessie', 80);
    n.restore('soif', 30);
    expect(n.values.soif).toBe(50);
    expect(n.values.vessie).toBeLessThan(80);
  });

  it('un besoin à zéro fait perdre de la santé, des besoins satisfaits en rendent', () => {
    const n = new Needs();
    n.set('soif', 0);
    n.tick(1, 'idle', false);
    expect(n.health).toBeLessThan(100);
    const hurt = n.health;
    for (const def of NEEDS) n.set(def.key, 100);
    n.tick(1, 'idle', false);
    expect(n.health).toBeGreaterThan(hurt);
  });

  it('sans guérison possible (trop froid), la santé ne remonte pas', () => {
    const n = new Needs();
    n.hurt(30);
    n.canHeal = false;
    n.tick(1, 'idle', false);
    expect(n.health).toBe(70);
  });

  it('un facteur (le froid) accélère la baisse d’un besoin', () => {
    const plain = new Needs();
    const cold = new Needs();
    cold.factors = { fatigue: 2 };
    plain.tick(1, 'idle', false);
    cold.tick(1, 'idle', false);
    expect(85 - cold.values.fatigue).toBeCloseTo(2 * (85 - plain.values.fatigue), 5);
  });

  it('la santé reste entre 0 et 100', () => {
    const n = new Needs();
    n.hurt(500);
    expect(n.health).toBe(0);
    n.heal(500);
    expect(n.health).toBe(100);
  });
});

describe('besoins en pause (cuisine seule)', () => {
  it('restent pleins, et boire ne remplit plus la vessie', () => {
    const n = new Needs();
    n.pause(['fatigue', 'hygiene', 'vessie']);
    n.tick(10, 'run', true);
    expect(n.values.fatigue).toBe(100);
    expect(n.values.hygiene).toBe(100);
    expect(n.values.vessie).toBe(100);
    expect(n.values.faim).toBeLessThan(70);
    n.restore('soif', 50);
    expect(n.values.vessie).toBe(100);
  });
});
