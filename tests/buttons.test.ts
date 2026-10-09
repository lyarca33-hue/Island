import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KNOB_TURN, moveButton, PRESS_DEPTH } from '../src/game/items/buttons';

/** Fait avancer le bouton une seconde, par images de 1/60 s. */
function run(b: THREE.Object3D, on: boolean, turn: boolean): void {
  for (let i = 0; i < 60; i++) moveButton(b, on, turn, 1 / 60);
}

describe('boutons des appareils', () => {
  it('un bouton de feu tourne d’un quart de tour, puis revient', () => {
    const knob = new THREE.Group();
    knob.position.set(-0.2, 0.77, 0.3);
    run(knob, true, true);
    expect(knob.rotation.z).toBeCloseTo(KNOB_TURN, 3);
    expect(knob.position.toArray()).toEqual([-0.2, 0.77, 0.3]);
    run(knob, false, true);
    expect(knob.rotation.z).toBeCloseTo(0, 3);
  });

  it('un bouton marche s’enfonce vers le centre de l’appareil, puis ressort', () => {
    const button = new THREE.Group();
    button.position.set(0, 0.29, 0.13);
    run(button, true, false);
    expect(button.position.z).toBeCloseTo(0.13 - PRESS_DEPTH, 4);
    expect(button.position.y).toBeCloseTo(0.29, 6);
    run(button, false, false);
    expect(button.position.z).toBeCloseTo(0.13, 4);
  });

  it('un bouton posé à l’origine s’enfonce vers l’arrière', () => {
    const button = new THREE.Group();
    run(button, true, false);
    expect(button.position.z).toBeCloseTo(-PRESS_DEPTH, 4);
  });
});
