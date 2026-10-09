import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Duvet, LIT_SHAPE } from '../src/game/items/duvet';

/** Le plus bas du tissu au-dessus du matelas (hors bords qui pendent). */
function lowestOnMattress(d: Duvet): number {
  const pos = d.mesh.geometry.attributes.position.array as Float32Array;
  let low = Infinity;
  for (let k = 0; k < pos.length; k += 3) {
    const x = pos[k], y = pos[k + 1], z = pos[k + 2];
    if (Math.abs(x) < LIT_SHAPE.halfWidth - 0.05 && z > LIT_SHAPE.z[0] + 0.6 && z < LIT_SHAPE.z[1] - 0.05) low = Math.min(low, y);
  }
  return low;
}

const run = (d: Duvet, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) d.update(1 / 60);
};

describe('la couette en tissu', () => {
  it('posée, elle couvre le lit sans passer à travers le matelas', () => {
    const d = new Duvet(LIT_SHAPE, new THREE.MeshToonMaterial());
    expect(d.open).toBe(false);
    expect(lowestOnMattress(d)).toBeGreaterThan(LIT_SHAPE.top);
  });

  it('se rabat, se repousse (défaite), et se refait', () => {
    const d = new Duvet(LIT_SHAPE, new THREE.MeshToonMaterial());
    const made = (d.mesh.geometry.attributes.position.array as Float32Array).slice();
    d.turnDown(1, 0.2);
    run(d, 2);
    expect(d.open).toBe(true);
    expect(lowestOnMattress(d)).toBeGreaterThan(LIT_SHAPE.top - 0.01);
    d.throwBack(1, 0.2);
    run(d, 2);
    expect(d.unmade).toBe(true);
    d.make(3);
    run(d, 4);
    expect(d.open).toBe(false);
    const now = d.mesh.geometry.attributes.position.array as Float32Array;
    let far = 0;
    for (let k = 0; k < now.length; k++) far = Math.max(far, Math.abs(now[k] - made[k]));
    expect(far).toBeLessThan(0.02);
  });
});
