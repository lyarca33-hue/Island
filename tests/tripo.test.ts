import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { clipY, gatherXZ, stretchY, TRIPO_LOOKS } from '../src/game/items/tripo';

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

describe('modèles Tripo de la maison', () => {
  it('chaque fiche habillée existe dans le catalogue', () => {
    for (const id of Object.keys(TRIPO_LOOKS)) expect(ITEM_BY_ID.has(id), id).toBe(true);
  });

  it('une porte du modèle remplace une pièce mobile que le jeu sait bouger', () => {
    for (const [id, look] of Object.entries(TRIPO_LOOKS)) {
      const def = ITEM_BY_ID.get(id)!;
      for (const name of Object.keys(look.parts ?? {})) {
        if (name === 'porte' || name === 'porte-2') expect(!!(def.door || def.drawer), `${id} : ${name}`).toBe(true);
        else if (name.startsWith('bouton-')) expect(+name.slice(7), `${id} : ${name}`).toBeLessThan(def.heat!.spots.length);
        // les roues et le pédalier du vélo tournent quand on roule (velo.ts)
        else if (def.bike) expect(['roue-avant', 'roue-arriere', 'pedalier'], `${id} : ${name}`).toContain(name);
        // les autres pièces que le jeu montre, allume ou bouge : levier, abat-jour, couette, écran, abattant, drapeau
        else expect(['levier', 'abat-jour', 'couette', 'ecran', 'couvercle', 'drapeau'], `${id} : ${name}`).toContain(name);
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

  it('monte la table basse à hauteur de table sans épaissir le plateau', () => {
    const g = stretchY(new THREE.BoxGeometry(1, 0.37, 1).translate(0, 0.185, 0), 0.3, 0.37);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.74, 6);
  });

  it('resserre les franges de la serpillière pour qu’elles tiennent dans le seau', () => {
    // franges étalées sur 45 cm au sol, le manche (4 cm) au-dessus de 30 cm
    const g = gatherXZ(new THREE.CylinderGeometry(0.02, 0.22, 1.3, 16, 1, true).translate(0, 0.65, 0), 0.3, 0.5);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (p.getY(i) < 0.01) expect(r).toBeCloseTo(0.11, 6);
    }
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(1.3, 6);
    // rangée dans le seau, elle trempe dans l'eau, pas sous son fond
    expect(ITEM_BY_ID.get('seau')!.slots![0][1]).toBeGreaterThanOrEqual(0.11);
  });
});
