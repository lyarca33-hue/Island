import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Pond } from '../src/game/nage';
import { DOCK_L, POND } from '../src/game/items/plein-air';

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const dockX = POND.x - 1.2;
const pond = new Pond({ x: dockX, end: POND.z - POND.rz + DOCK_L - 0.6 });

describe('nager dans l’étang', () => {
  it('on nage au milieu, pas sur la rive ni sous le ponton', () => {
    expect(pond.swimmable(v(POND.x + 2, POND.z + 1))).toBe(true);
    expect(pond.swimmable(v(POND.x + POND.rx, POND.z))).toBe(false);
    expect(pond.swimmable(v(POND.x - 30, POND.z))).toBe(false);
    expect(pond.swimmable(v(dockX, POND.z - POND.rz + 1))).toBe(false);
  });

  it('on plonge depuis la rive en face du perso, vers l’eau où l’on nage', () => {
    const spot = pond.entry(v(POND.x + POND.rx + 3, POND.z), () => true)!;
    expect(spot.bank.x).toBeGreaterThan(POND.x + POND.rx);
    expect(Math.abs(spot.bank.z - POND.z)).toBeLessThan(0.5);
    expect(pond.swimmable(spot.water)).toBe(true);
  });

  it('rive prise : on plonge un peu plus loin ; nulle part : null', () => {
    const from = v(POND.x + POND.rx + 3, POND.z);
    const spot = pond.entry(from, (p) => Math.abs(p.z - POND.z) > 1)!;
    expect(Math.abs(spot.bank.z - POND.z)).toBeGreaterThan(1);
    expect(pond.entry(from, () => false)).toBeNull();
  });

  it('en nageant vers la rive, on en sort sur la berge ; vers le ponton, non', () => {
    const bank = pond.exit(v(POND.x, POND.z + POND.rz * 0.9))!;
    expect(bank.z).toBeGreaterThan(POND.z + POND.rz);
    expect(pond.exit(v(dockX, POND.z - POND.rz + 1))).toBeNull();
  });

  it('la rive la plus proche pour sortir de l’eau', () => {
    const bank = pond.shore(v(POND.x + 3, POND.z), () => true)!;
    expect(bank.x).toBeGreaterThan(POND.x + POND.rx);
  });
});
