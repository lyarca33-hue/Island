import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ModeleEntry } from '../src/game/modelesCatalogue';

// un catalogue réduit à un banc de la ville : le reste est inconnu (retiré, pack disparu)
vi.mock('../src/game/modelesCatalogue', () => {
  const banc = {
    key: 'pack:ville/banc-public',
    kind: 'pack',
    source: 'decor',
    cat: 'ville',
    label: 'Banc public',
    pack: 'ville',
    model: 'banc-public',
    scale: 1,
    signal: 'pack ville/banc-public',
    search: 'banc public',
  } as ModeleEntry;
  return { entree: (key: string) => (key === banc.key ? banc : null) };
});

const { decodePoses, encodePoses, Modeles } = await import('../src/game/modeles');

/** Un hôte sans rendu, à plat : on compte les changements signalés. */
function stubHost() {
  const host = {
    changes: 0,
    notices: [] as string[],
    ground: () => 0,
    surfaces: () => [],
    perso: () => new THREE.Vector3(0, 0, 0),
    changed() {
      host.changes++;
    },
    notice(t: string) {
      host.notices.push(t);
    },
  };
  return host;
}

// le pack ne se charge pas sans navigateur : son avertissement est tu
let warn: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => warn.mockRestore());

describe('poses des modèles', () => {
  it('arrondit au millimètre et au millième de radian, lacet dans [-π, π]', () => {
    const [p] = encodePoses([{ key: 'objet:tasse', x: 1.23456, y: -0.00004, z: 2.0005, yaw: 2 * Math.PI + 0.12345 }]);
    expect(p).toEqual(['objet:tasse', 1.235, 0, 2.001, 0.123]);
    expect(Object.is(p[2], -0)).toBe(false);
    const [q] = encodePoses([{ key: 'k', x: 0, y: 0, z: 0, yaw: -3 * Math.PI / 2 }]);
    expect(q[4]).toBeCloseTo(Math.PI / 2, 3);
  });

  it('relit les poses, laisse de côté les lignes illisibles et compte les modèles inconnus', () => {
    const { poses, ignores } = decodePoses(
      [
        ['pack:ville/banc-public', 1, 0, 2, 0.5],
        ['objet:retire', 0, 0, 0, 0],
        ['pack:ville/banc-public', 'x', 0, 0, 0],
        ['pack:ville/banc-public', 1, 0, Number.NaN, 0],
        [42, 0, 0, 0, 0],
        ['court', 1, 2],
        'pas une ligne',
      ],
      (k) => k.startsWith('pack:'),
    );
    expect(poses).toEqual([['pack:ville/banc-public', 1, 0, 2, 0.5]]);
    expect(ignores).toBe(1);
    expect(decodePoses(null)).toEqual({ poses: [], ignores: 0 });
    expect(decodePoses({ a: 1 })).toEqual({ poses: [], ignores: 0 });
  });

  it('Modeles.load compte les inconnus, ne signale pas de changement, et se resauve à l’identique', () => {
    const host = stubHost();
    const m = new Modeles(host);
    const { ignores } = m.load([
      ['pack:ville/banc-public', 1.5, 0, -2, 0.785],
      ['objet:disparu', 0, 0, 0, 0],
      ['pack:ville/disparu', 0, 0, 0, 0],
      ['pack:ville/banc-public', 3, 0.25, 4, -1.571],
    ]);
    expect(ignores).toBe(2);
    expect(m.count).toBe(2);
    expect(m.canUndo).toBe(false);
    expect(host.changes).toBe(0);
    expect(m.save()).toEqual([
      ['pack:ville/banc-public', 1.5, 0, -2, 0.785],
      ['pack:ville/banc-public', 3, 0.25, 4, -1.571],
    ]);
    // gardé tant que rien ne change
    expect(m.save()).toBe(m.save());
    m.load(null);
    expect(m.count).toBe(0);
    expect(m.save()).toBeNull();
  });

  it('tout enlever s’annule, et chaque geste prévient l’hôte une fois', () => {
    const host = stubHost();
    const m = new Modeles(host);
    m.load([['pack:ville/banc-public', 1, 0, 1, 0], ['pack:ville/banc-public', 5, 0, 1, 0]]);
    m.toutEnlever();
    expect(m.count).toBe(0);
    expect(host.changes).toBe(1);
    m.annuler();
    expect(m.count).toBe(2);
    expect(host.changes).toBe(2);
    expect(m.save()).toEqual([['pack:ville/banc-public', 1, 0, 1, 0], ['pack:ville/banc-public', 5, 0, 1, 0]]);
  });

  it('pose au clic ce qui est en main, choisit et déplace un modèle posé', () => {
    const host = stubHost();
    const m = new Modeles(host);
    m.on = true;
    m.prendre('pack:ville/banc-public');
    expect(m.enMain?.entry.key).toBe('pack:ville/banc-public');
    const down = (x: number, z: number) => new THREE.Ray(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    m.aim(down(4, 4));
    m.press();
    m.release();
    expect(m.count).toBe(1);
    // sur le perso : refusé (le banc bloque le passage)
    m.aim(down(0, 0));
    m.press();
    m.release();
    expect(m.count).toBe(1);
    expect(host.notices).toContain('Pas ici : trop loin, ou sur le perso.');
    m.lacher();
    expect(m.enMain).toBeNull();
    // clic sur le banc posé : il est choisi ; glissé de 2 m
    m.aim(down(4, 4));
    m.press();
    expect(m.selection?.entry.key).toBe('pack:ville/banc-public');
    m.aim(down(6, 4));
    m.update(1 / 60);
    m.release();
    expect(m.save()).toEqual([['pack:ville/banc-public', 6, 0, 4, 0]]);
    m.tourner(1);
    m.monter(0.5);
    expect(m.save()).toEqual([['pack:ville/banc-public', 6, 0.5, 4, 0.785]]);
    m.annuler();
    m.annuler();
    m.annuler();
    expect(m.save()).toEqual([['pack:ville/banc-public', 4, 0, 4, 0]]);
    expect(m.obstacles()).toHaveLength(1);
  });
});
