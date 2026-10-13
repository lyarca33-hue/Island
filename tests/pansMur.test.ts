import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOLES, PAN_HEIGHT, PIGNON_BASE, PIGNON_HEIGHT, panGeometry, panObstacles } from '../src/game/packs/pansMur';

/** Un faux muret : une boîte finement découpée de la taille du vrai (longueur sur z). */
function muret(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.694, 1.1327, 2, 8, 8, 16).translate(0, 1.1327 / 2, 0).toNonIndexed();
}

function points(g: THREE.BufferGeometry): THREE.Vector3[] {
  const p = g.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
}

describe('pans de mur taillés dans le muret', () => {
  it('un pan droit fait 2 m de long sur 2,80 m de haut, couché le long de x', () => {
    const box = new THREE.Box3().setFromPoints(points(panGeometry(muret(), 'mur')));
    expect(box.max.y).toBeCloseTo(PAN_HEIGHT, 2);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.x - box.min.x).toBeGreaterThan(2);
    expect(box.max.x - box.min.x).toBeLessThan(2.1);
    expect(box.max.z - box.min.z).toBeLessThan(0.6);
  });

  it('la porte et la fenêtre sont découpées : aucune pierre dans l’ouverture', () => {
    for (const kind of ['mur-porte', 'mur-fenetre'] as const) {
      const h = HOLES[kind]!;
      const g = panGeometry(muret(), kind);
      const p = g.getAttribute('position');
      // le centre de chaque triangle restant est hors de l'ouverture
      for (let i = 0; i < p.count; i += 3) {
        const c = new THREE.Vector3().fromBufferAttribute(p, i).add(new THREE.Vector3().fromBufferAttribute(p, i + 1)).add(new THREE.Vector3().fromBufferAttribute(p, i + 2)).divideScalar(3);
        const inside = c.x > h.x0 + 1e-4 && c.x < h.x1 - 1e-4 && c.y > h.y0 + 1e-4 && c.y < h.y1 - 1e-4;
        expect(inside, `${kind} : triangle en ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).toBe(false);
      }
      // et le reste du mur est là, jusqu'au bord de l'ouverture
      expect(points(g).some((v) => Math.abs(v.x - h.x0) < 1e-4 && v.y > h.y0 && v.y < h.y1)).toBe(true);
    }
  });

  it('le pignon reste sous ses deux pentes', () => {
    const k = (2 * PIGNON_HEIGHT) / PIGNON_BASE;
    const pts = points(panGeometry(muret(), 'pignon'));
    expect(pts.length).toBeGreaterThan(0);
    for (const v of pts) expect(v.y).toBeLessThanOrEqual(k * (PIGNON_BASE / 2 - Math.abs(v.x)) + 1e-4);
    expect(Math.max(...pts.map((v) => v.y))).toBeGreaterThan(PIGNON_HEIGHT - 0.1);
  });

  it('on passe par la porte, pas à travers le mur', () => {
    const [left, right] = panObstacles('mur-porte');
    expect(right.min.x - left.max.x).toBeGreaterThan(0.9);
    expect(panObstacles('mur')).toHaveLength(1);
  });
});
