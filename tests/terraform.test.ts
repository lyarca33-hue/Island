import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { groundKind, heightAt, RELIEF, type Island } from '../src/game/ile';
import { Terraform } from '../src/game/terraform';

/** Une île sans rendu : on note seulement ce qui a été remis à jour. */
function fakeIsland(): Island & { calls: Array<[number, number, number, number, boolean]> } {
  const calls: Array<[number, number, number, number, boolean]> = [];
  return {
    calls,
    root: new THREE.Group(),
    terrain: new THREE.Mesh(),
    update() {},
    setGrassDensity() {},
    clearGrass() {},
    resetGrass() {},
    setSeason() {},
    reshape(x0, x1, z0, z1, done) {
      calls.push([x0, x1, z0, z1, !!done]);
    },
  };
}

/** Un rayon qui tombe tout droit sur (x, z). */
const down = (x: number, z: number) => new THREE.Ray(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));

/** Tenir le pinceau `seconds` s au-dessus de (x, z). */
function stroke(t: Terraform, x: number, z: number, seconds: number): void {
  t.aim(down(x, z));
  t.press();
  for (let k = 0; k < seconds * 30; k++) t.update(1 / 30);
  t.release();
}

afterEach(() => {
  RELIEF.edits.fill(0);
  RELIEF.paint.fill(0);
  RELIEF.paintW.fill(0);
});

describe('terraformation', () => {
  it('monte et creuse le sol sous le pinceau, plus au centre qu’au bord', () => {
    const island = fakeIsland();
    const t = new Terraform(island, []);
    t.on = true;
    const before = heightAt(30, 0), edge = heightAt(33, 0);
    stroke(t, 30, 0, 1);
    expect(heightAt(30, 0) - before).toBeGreaterThan(1);
    expect(heightAt(33, 0) - edge).toBeLessThan(heightAt(30, 0) - before);
    expect(heightAt(40, 0)).toBeCloseTo(heightAt(40, 0), 5);
    // le geste fini : le terrain est remis au relief (routes comprises)
    expect(island.calls.at(-1)?.[4]).toBe(true);
    t.setTool('creuser');
    stroke(t, 30, 0, 2);
    expect(heightAt(30, 0)).toBeLessThan(before);
  });

  it('aplanit à la hauteur du clic, adoucit et rétablit le relief d’origine', () => {
    const t = new Terraform(fakeIsland(), []);
    t.on = true;
    const before = heightAt(-20, 20);
    stroke(t, -20, 20, 1);
    t.setTool('aplanir');
    const y = heightAt(-17, 20);
    stroke(t, -17, 20, 2);
    expect(heightAt(-17.5, 20)).toBeCloseTo(y, 1);
    t.setTool('retablir');
    t.setStrength(1);
    t.setRadius(10);
    stroke(t, -19, 20, 3);
    expect(heightAt(-20, 20)).toBeCloseTo(before, 2);
  });

  it('ne touche pas au sol des pièces', () => {
    const t = new Terraform(fakeIsland(), [{ x0: -2, x1: 2, z0: -2, z1: 2 }]);
    t.on = true;
    t.setRadius(6);
    stroke(t, 0, 0, 1);
    expect(heightAt(0, 0)).toBe(0);
    expect(heightAt(1.9, 0)).toBe(0);
    expect(heightAt(3.5, 0)).toBeGreaterThan(0.1);
  });

  it('peint le sol : du sable dans l’herbe', () => {
    const t = new Terraform(fakeIsland(), []);
    t.on = true;
    expect(groundKind(-25, -10)).toBe('herbe');
    t.setGround('sable');
    t.setStrength(1);
    stroke(t, -25, -10, 1);
    expect(groundKind(-25, -10)).toBe('sable');
    t.setGround('roche');
    stroke(t, -25, -10, 1);
    expect(groundKind(-25, -10)).toBe('roche');
  });

  it('garde les retouches dans la sauvegarde et les reprend', () => {
    const t = new Terraform(fakeIsland(), []);
    t.on = true;
    stroke(t, 25, 25, 1);
    t.setGround('terre');
    stroke(t, 25, 25, 1);
    const h = heightAt(25, 25), kind = groundKind(25, 25);
    const saved = JSON.parse(JSON.stringify(t.save()));
    expect(saved.relief.length).toBeLessThan(20000);
    RELIEF.edits.fill(0);
    RELIEF.paintW.fill(0);
    const u = new Terraform(fakeIsland(), []);
    u.load(saved);
    expect(heightAt(25, 25)).toBeCloseTo(h, 2);
    expect(groundKind(25, 25)).toBe(kind);
    // une partie sans retouches : l'île d'origine
    u.load(undefined);
    expect(RELIEF.edits.every((v) => v === 0)).toBe(true);
    expect(u.save()).toBeNull();
  });
});
