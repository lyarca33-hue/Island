import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { buildFiller, START_CONTENTS } from '../src/game/items/remplissage';
import { cellsOf, GRIDS, pack } from '../src/game/items/cases';

describe('meubles remplis au départ', () => {
  it('chaque objet existe et va dans son meuble, qui a assez de places', () => {
    for (const [holder, , ids] of START_CONTENTS) {
      const shelf = ITEM_BY_ID.get(holder);
      expect(shelf?.slots, holder).toBeTruthy();
      expect(ids.length, holder).toBeLessThanOrEqual(shelf!.slots!.length);
      for (const id of ids) {
        const def = ITEM_BY_ID.get(id);
        expect(def?.portable, id).toBe(true);
        const fits = shelf!.holds ? shelf!.holds.includes(def!.name) : def!.stack === 'livre' || !!def!.buildOpen;
        expect(fits, `${id} dans ${holder}`).toBe(true);
      }
    }
  });
});

describe('silhouette d’un objet rangé', () => {
  it('à la taille de l’objet, ronde ou en boîte, et pas cliquable', () => {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 24).translate(0, 0.01, 0), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
    const box = new THREE.Box3().setFromObject(plate);
    const f = buildFiller(plate, box);
    expect(f.geometry.type).toBe('CylinderGeometry');
    expect(f.position.y).toBeCloseTo(0.01);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.03), new THREE.MeshBasicMaterial({ color: 0x884422 }));
    const g = buildFiller(book, new THREE.Box3().setFromObject(book));
    expect(g.geometry.type).toBe('BoxGeometry');
    expect((g.material as THREE.MeshToonMaterial).color.getHex()).toBe(0x884422);
    const hits: THREE.Intersection[] = [];
    g.raycast(new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1)), hits);
    expect(hits).toHaveLength(0);
  });
});

describe('inventaire à cases', () => {
  it('range des rectangles sans chevauchement, et refuse ce qui ne tient pas', () => {
    const cells = pack(4, 2, [[1, 1], [2, 2], [1, 2], [1, 1]])!;
    expect(cells).not.toBeNull();
    const seen = new Set<string>();
    for (const c of cells) for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
      expect(x < 4 && y < 2).toBe(true);
      expect(seen.has(`${x},${y}`)).toBe(false);
      seen.add(`${x},${y}`);
    }
    expect(pack(2, 2, [[2, 2], [1, 1]])).toBeNull();
  });

  it('un objet prend des cases selon sa taille', () => {
    expect(cellsOf(new THREE.Vector3(0.08, 0.1, 0.08))).toEqual([1, 1]);
    expect(cellsOf(new THREE.Vector3(0.26, 0.02, 0.26))).toEqual([2, 1]);
    expect(cellsOf(new THREE.Vector3(1, 1, 1))).toEqual([3, 3]);
  });

  it('le contenu de départ tient dans la grille de chaque meuble', () => {
    for (const [holder, , ids] of START_CONTENTS) {
      const grid = GRIDS[holder];
      // un meuble qui se ferme a sa grille ; une barre au mur, ouverte, n'en a pas besoin
      const def = ITEM_BY_ID.get(holder)!;
      if (!def.door && !def.drawer) continue;
      expect(grid, holder).toBeTruthy();
      const sizes = ids.map((id) => cellsOf(new THREE.Box3().setFromObject(ITEM_BY_ID.get(id)!.build()).getSize(new THREE.Vector3())));
      expect(pack(grid[0], grid[1], sizes), holder).not.toBeNull();
    }
  });
});
