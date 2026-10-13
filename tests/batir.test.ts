import { describe, expect, it } from 'vitest';
import { decodePieces, encodePieces, PIECE_BY_ID, PIECES, slotOf, snapPiece } from '../src/game/batir';

const def = (id: Parameters<typeof PIECE_BY_ID.get>[0]) => PIECE_BY_ID.get(id)!;

describe('créateur de bâtiment : la grille', () => {
  it('un mur se cale sur le bord de case le plus proche, au milieu du bord', () => {
    const a = snapPiece(def('mur'), 0.7, 0.2);
    expect([a.x, a.z, a.yaw]).toEqual([1, 0, 0]);
    // plus près d'une ligne le long de z : le mur est tourné d'un quart
    const b = snapPiece(def('mur'), 3.9, 2.6);
    expect([b.x, b.z]).toEqual([4, 3]);
    expect(b.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('le pignon se centre sur un croisement, le sol sur une case', () => {
    const p = snapPiece(def('pignon'), 0.7, 3.8);
    expect([p.x, p.z]).toEqual([0, 4]);
    const f = snapPiece(def('parquet'), 0.3, -0.4);
    expect([f.x, f.z]).toEqual([1, -1]);
  });

  it('tourner : un demi-tour pour un mur, un quart pour une case, un huitième pour le décor', () => {
    expect(snapPiece(def('mur'), 1, 0.1, 1).yaw).toBeCloseTo(Math.PI);
    expect(snapPiece(def('parquet'), 1, 1, 1).yaw).toBeCloseTo(Math.PI / 2);
    expect(snapPiece(def('banc'), 1.13, 0, 1).yaw).toBeCloseTo(Math.PI / 4);
    expect(snapPiece(def('banc'), 1.13, 0).x).toBe(1.25);
  });

  it('une place par couche : un mur et un toit au même bord ne se gênent pas, deux murs si', () => {
    const wall = snapPiece(def('mur'), 1, 0.1), win = snapPiece(def('mur-fenetre'), 1.2, -0.2), roof = snapPiece(def('toit'), 1, 0.1);
    expect(wall.slot).toBe(win.slot);
    expect(wall.slot).not.toBe(roof.slot);
    // un mur retourné garde sa place
    const flipped = snapPiece(def('mur'), 1, 0.1, 1);
    expect(slotOf({ id: 'mur', x: flipped.x, z: flipped.z, yaw: flipped.yaw, y: 0 })).toBe(wall.slot);
    expect(snapPiece(def('banc'), 1, 1).slot).toBe('');
  });

  it('chaque pièce a sa famille et son mot d’aide', () => {
    for (const p of PIECES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.hint.length).toBeGreaterThan(0);
    }
    for (const cat of ['murs', 'sols', 'toits', 'decor']) expect(PIECES.filter((p) => p.cat === cat).length).toBeLessThanOrEqual(9);
  });
});

describe('créateur de bâtiment : la sauvegarde', () => {
  it('relit ce qu’elle a écrit, et laisse de côté l’illisible', () => {
    const list = [
      { id: 'mur' as const, x: 1, z: 0, yaw: Math.PI / 2, y: 0.5 },
      { id: 'toit' as const, x: 2, z: 1, yaw: 0, y: 0.5 },
    ];
    const back = decodePieces(JSON.parse(JSON.stringify(encodePieces(list))));
    expect(back.map((p) => p.id)).toEqual(['mur', 'toit']);
    expect(back[0].yaw).toBeCloseTo(Math.PI / 2, 3);
    expect(decodePieces([['inconnu', 0, 0, 0, 0], ['mur', 'x', 0, 0, 0], 'rien', ['sol']])).toEqual([]);
    expect(decodePieces(undefined)).toEqual([]);
  });
});
