import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { buildFiller, START_CONTENTS } from '../src/game/items/remplissage';

describe('meubles remplis au départ', () => {
  it('chaque objet existe et va dans son meuble, qui a assez de places', () => {
    for (const [holder, , ids] of START_CONTENTS) {
      const shelf = ITEM_BY_ID.get(holder);
      expect(shelf?.slots, holder).toBeTruthy();
      expect(!!(shelf!.door || shelf!.drawer), `${holder} se ferme`).toBe(true);
      expect(ids.length, holder).toBeLessThanOrEqual(shelf!.slots!.length);
      for (const id of ids) {
        const def = ITEM_BY_ID.get(id);
        expect(def?.portable, id).toBe(true);
        const fits = shelf!.holds ? shelf!.holds.includes(def!.name) : def!.stack === 'livre';
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
