import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlasterSheet } from '../src/game/kit';

/** Plaque d'essai comme celle du kit : 1 × 1 m, x de -0,5 à 0,5, y de 0 à 1, relief vers +z. */
function plaque(): THREE.Object3D {
  const g = new THREE.PlaneGeometry(1, 1, 10, 10).translate(0, 0.5, 0.01);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial());
}

const bornes = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('enduit des murs (kit Tripo)', () => {
  it('couvre tout le mur, carreaux en miroir sans fente', () => {
    const mur = new PlasterSheet(plaque(), 6.64, 2.5).piece(0, 6.64, 0, 2.5)!;
    const b = bornes(mur);
    expect(b.min.x).toBeCloseTo(0, 5);
    expect(b.max.x).toBeCloseTo(6.64, 5);
    expect(b.min.y).toBeCloseTo(0, 5);
    expect(b.max.y).toBeCloseTo(2.5, 5);
    // toutes les faces regardent vers +z, même dans les carreaux retournés
    const n = mur.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBeGreaterThan(0.9);
  });

  it('serre un morceau dans son rectangle, bords nets', () => {
    const sheet = new PlasterSheet(plaque(), 6.64, 2.5);
    const allege = sheet.piece(1.13, 2.23, 0, 0.95)!;
    const b = bornes(allege);
    expect(b.min.x).toBeCloseTo(1.13, 5);
    expect(b.max.x).toBeCloseTo(2.23, 5);
    expect(b.min.y).toBeCloseTo(0, 5);
    expect(b.max.y).toBeCloseTo(0.95, 5);
  });

  it('rien hors du mur', () => {
    expect(new PlasterSheet(plaque(), 2, 2.5).piece(3, 4, 0, 1)).toBeNull();
  });
});
