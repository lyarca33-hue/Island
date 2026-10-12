import { describe, expect, it } from 'vitest';
import { groundKind, heightAt, SEA_LEVEL, WALK_HALF, WAYS, wayAt } from '../src/game/ile';

describe("l'île", () => {
  it('le terrain de la maison est plat, à y = 0', () => {
    for (let x = -17; x <= 16; x += 0.5) {
      for (let z = -14; z <= 10; z += 0.5) {
        if (heightAt(x, z) !== 0) throw new Error(`relief en (${x}, ${z}) : ${heightAt(x, z)}`);
      }
    }
  });

  it('ailleurs, le carré où l’on marche a des collines, toujours hors de l’eau', () => {
    let top = 0;
    for (let x = -WALK_HALF; x <= WALK_HALF; x += 0.5) {
      for (let z = -WALK_HALF; z <= WALK_HALF; z += 0.5) {
        const h = heightAt(x, z);
        if (h < 0) throw new Error(`creux en (${x}, ${z}) : ${h}`);
        top = Math.max(top, h);
      }
    }
    expect(top).toBeGreaterThan(3);
  });

  it('au sud, la plage descend dans la mer juste après le bord', () => {
    expect(groundKind(-6, 43)).toBe('sable');
    // à 8 m du bord, on a les pieds dans l'eau
    expect(heightAt(-6, WALK_HALF + 8)).toBeLessThan(SEA_LEVEL);
  });

  it('au nord-ouest, une falaise monte au bord du carré puis tombe dans la mer', () => {
    const profile = Array.from({ length: 30 }, (_, i) => heightAt(-25, -WALK_HALF - i));
    expect(Math.max(...profile)).toBeGreaterThan(6);
    expect(profile[profile.length - 1]).toBeLessThan(SEA_LEVEL);
  });

  it('à l’est, une côte rocheuse basse : une marche de roche, pas une pente de sable', () => {
    expect(groundKind(WALK_HALF + 1, 0)).toBe('roche');
    expect(heightAt(WALK_HALF + 3, 0)).toBeLessThan(-1);
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => heightAt(WALK_HALF + i * 0.5, 0)))).toBeLessThanOrEqual(0.5);
  });

  it('autour de la maison, de l’herbe ; les routes et les chemins restent là où l’on marche', () => {
    expect(groundKind(0, 8)).toBe('herbe');
    expect(wayAt(-8.6, 6)).toBe('allee');
    expect(wayAt(-4.6, 4)).toBe('chemin');
    expect(wayAt(0, 33)).toBe('route');
    expect(wayAt(0, 0)).toBeNull();
    for (const w of WAYS) for (const [x, z] of w.points) expect(Math.max(Math.abs(x), Math.abs(z)) + w.width / 2).toBeLessThan(WALK_HALF);
  });
});
