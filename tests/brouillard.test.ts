import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FogOfWar, type SightWall } from '../src/game/brouillard';
import { heightAt } from '../src/game/ile';

/** Une pièce carrée de -2 à 2 (x et z), percée d'une porte au sud (x de -0.5 à 0.5) ouverte ou fermée. */
function box(door: { open: number }): SightWall[] {
  const w = (ax: number, az: number, bx: number, bz: number, clear = () => 0): SightWall => ({ ax, az, bx, bz, room: 0, clear });
  return [
    w(-2, -2, 2, -2),
    w(-2, -2, -2, 2),
    w(2, -2, 2, 2),
    w(-2, 2, -0.5, 2),
    w(-0.5, 2, 0.5, 2, () => door.open),
    w(0.5, 2, 2, 2),
  ];
}

const ROOM = { x0: -2, x1: 2, z0: -2, z1: 2 };

function settle(fog: FogOfWar, at: THREE.Vector3, walls: SightWall[], indoors: boolean, s = 1.5): void {
  for (let t = 0; t < s; t += 0.05) fog.update(0.05, at, walls, indoors);
}

describe('brouillard de guerre', () => {
  it('dans une pièce : on voit la pièce, pas le dehors derrière les murs', () => {
    const fog = new FogOfWar(() => 0, [ROOM]);
    const door = { open: 0 };
    const walls = box(door);
    settle(fog, new THREE.Vector3(0, 0, 0), walls, true);
    expect(fog.at(1.5, -1.5).seen).toBe(1);
    expect(fog.at(-1.5, 1.5).seen).toBe(1);
    expect(fog.at(0, 4).seen).toBe(0);
    expect(fog.at(5, 0).seen).toBe(0);
  });

  it('une porte ouverte laisse voir dehors, et ce qui a été vu reste en souvenir', () => {
    const fog = new FogOfWar(() => 0, [ROOM]);
    const door = { open: 1 };
    const walls = box(door);
    settle(fog, new THREE.Vector3(0, 0, 0), walls, true);
    expect(fog.at(0, 4).seen).toBe(1);
    // à côté de la porte, toujours caché par le mur
    expect(fog.at(4, 2.5).seen).toBe(0);
    door.open = 0;
    settle(fog, new THREE.Vector3(0, 0, 0), walls, true);
    expect(fog.at(0, 4).seen).toBe(0);
    expect(fog.at(0, 4).known).toBe(1);
    expect(fog.at(4, 2.5).known).toBe(0);
  });

  it('dehors : le toit de la maison se voit, sans compter l’intérieur comme visité', () => {
    const fog = new FogOfWar(() => 0, [ROOM]);
    const walls = box({ open: 0 });
    settle(fog, new THREE.Vector3(0, 0, 8), walls, false);
    expect(fog.at(0, 0).seen).toBe(1);
    expect(fog.at(0, 0).known).toBe(0);
    expect(fog.at(0, 6).known).toBe(1);
  });

  it('une colline cache ce qui est derrière son sommet', () => {
    // butte de 4 m entre x = 8 et x = 12
    const hill = (x: number) => (x > 8 && x < 12 ? 4 * Math.sin(((x - 8) / 4) * Math.PI) : 0);
    const fog = new FogOfWar((x) => hill(x), []);
    settle(fog, new THREE.Vector3(0, 0, 0), [], false);
    expect(fog.at(9, 0).seen).toBe(1);
    expect(fog.at(14, 0).seen).toBe(0);
    expect(fog.at(-14, 0).seen).toBe(1);
  });

  it('sur la vraie île, un tracé de rayons reste rapide', () => {
    const fog = new FogOfWar(heightAt, []);
    const at = new THREE.Vector3(20, 0, -20);
    fog.update(1, at, [], false);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      at.x += 0.5;
      fog.update(0.1, at, [], false);
    }
    const ms = (performance.now() - t0) / 10;
    expect(ms).toBeLessThan(40);
    console.log(`brouillard : ${ms.toFixed(1)} ms par tracé`);
  });
});
