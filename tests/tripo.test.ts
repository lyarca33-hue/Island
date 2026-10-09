import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { clipY, TRIPO_LOOKS } from '../src/game/items/tripo';

/** Aire totale des triangles d'une géométrie sans index. */
function area(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;
}

describe('modèles Tripo de la cuisine', () => {
  it('chaque fiche habillée existe dans le catalogue', () => {
    for (const id of Object.keys(TRIPO_LOOKS)) expect(ITEM_BY_ID.has(id), id).toBe(true);
  });

  it('une porte du modèle remplace une pièce mobile que le jeu sait bouger', () => {
    for (const [id, look] of Object.entries(TRIPO_LOOKS)) {
      const def = ITEM_BY_ID.get(id)!;
      for (const name of Object.keys(look.parts ?? {})) {
        if (name === 'porte' || name === 'porte-2') expect(!!(def.door || def.drawer), `${id} : ${name}`).toBe(true);
        else if (name.startsWith('bouton-')) expect(+name.slice(7), `${id} : ${name}`).toBeLessThan(def.heat!.spots.length);
        else expect(name, id).toBe('levier');
      }
    }
  });

  it('coupe le frigo en deux tranches qui se raccordent sans fente', () => {
    const g = new THREE.BoxGeometry(0.6, 1.8, 0.6, 3, 7, 3).translate(0, 0.9, 0).toNonIndexed();
    const bas = clipY(g, -Infinity, 0.625), haut = clipY(g, 0.625, Infinity);
    bas.computeBoundingBox();
    haut.computeBoundingBox();
    expect(bas.boundingBox!.max.y).toBeCloseTo(0.625, 6);
    expect(haut.boundingBox!.min.y).toBeCloseTo(0.625, 6);
    // rien de perdu ni d'ajouté : les deux tranches font la boîte entière
    expect(area(bas) + area(haut)).toBeCloseTo(area(g), 6);
    // les coordonnées de texture suivent la coupe
    expect(bas.getAttribute('uv').count).toBe(bas.getAttribute('position').count);
  });
});
