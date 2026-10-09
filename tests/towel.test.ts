import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type Ball, Towel } from '../src/game/items/towel';

/** Le plus bas et le centre du tissu (monde). */
function shape(t: Towel): { low: number; center: THREE.Vector3 } {
  const pos = t.mesh.geometry.attributes.position.array as Float32Array;
  let low = Infinity;
  const center = new THREE.Vector3();
  for (let k = 0; k < pos.length; k += 3) {
    low = Math.min(low, pos[k + 1]);
    center.x += pos[k];
    center.y += pos[k + 1];
    center.z += pos[k + 2];
  }
  return { low, center: center.divideScalar(pos.length / 3) };
}

const run = (t: Towel, seconds: number) => {
  for (let s = 0; s < seconds; s += 1 / 60) t.update(1 / 60);
};

const bar = { kind: 'hang' as const, a: new THREE.Vector3(-0.32, 0.93, 0), b: new THREE.Vector3(0.32, 0.93, 0) };

describe('la serviette en tissu', () => {
  it('pendue, elle reste pliée en deux sur la barre', () => {
    const t = new Towel(0x3b78a8, bar);
    run(t, 4);
    const { low, center } = shape(t);
    // la moitié de sa longueur (0,95 m) de chaque côté : le bas vers 0,93 − 0,47
    expect(low).toBeGreaterThan(0.4);
    expect(Math.abs(center.z)).toBeLessThan(0.03);
  });

  it('tenue à la main, elle pend dessous ; lâchée, elle tombe en tas par terre', () => {
    const t = new Towel(0x3b78a8, bar);
    t.setHold({ kind: 'hold', hand: new THREE.Vector3(0, 1.1, 0.3) });
    run(t, 3);
    expect(shape(t).low).toBeGreaterThan(0.1);
    t.setHold({ kind: 'free' });
    run(t, 4);
    expect(shape(t).center.y).toBeLessThan(0.08);
  });

  it('pour se sécher, elle passe derrière le dos, d’une main à l’autre', () => {
    const t = new Towel(0x3b78a8, bar);
    // le perso regarde vers +z ; le corps en boules, des jambes au cou
    const body: Ball[] = [0.45, 0.6, 0.75, 0.85, 1, 1.15, 1.3].map((y) => ({ x: 0, y, z: 0, r: 0.14 }));
    const a = new THREE.Vector3(-0.24, 1.1, 0.02), b = new THREE.Vector3(0.24, 1.1, 0.02);
    t.setHold({ kind: 'wrap', a, b, around: new THREE.Vector3(0, 0, -1), seed: [a, b] });
    t.setBodies(body);
    run(t, 2);
    expect(shape(t).center.z).toBeLessThan(-0.05);
  });

  it('rangée, elle est pliée en carré dans la boîte de l’objet', () => {
    const t = new Towel(0x3b78a8, { kind: 'fold', matrix: new THREE.Matrix4().makeTranslation(0, 1, 0), bottom: 0 });
    const { low } = shape(t);
    expect(low).toBeGreaterThan(0.99);
    expect(low).toBeLessThan(1.01);
  });
});
