/**
 * Les boutons des appareils suivent leur état : celui d'un feu de la gazinière tourne d'un quart
 * de tour quand le feu est allumé, un bouton marche (machine à café, bouilloire) reste enfoncé
 * tant que l'appareil est en marche. La pièce `bouton-i` est posée sur son axe : elle tourne sur
 * elle-même, ou s'enfonce vers le centre de l'appareil.
 */
import * as THREE from 'three';

/** Quart de tour d'un bouton de feu (sens des aiguilles d'une montre, vu de face). */
export const KNOB_TURN = -Math.PI / 2;
/** De combien un bouton marche s'enfonce (m). */
export const PRESS_DEPTH = 0.004;
/** Vitesse à laquelle le bouton rejoint sa position (par seconde). */
const RATE = 12;

const toward = new THREE.Vector3();

/**
 * Avance le bouton vers sa position, allumé (`on`) ou éteint : `turn` pour un bouton qui tourne
 * (feu), sinon il s'enfonce. Sa position de repos est gardée la première fois.
 */
export function moveButton(button: THREE.Object3D, on: boolean, turn: boolean, dt: number): void {
  const rest = (button.userData.rest ??= button.position.clone()) as THREE.Vector3;
  const k = 1 - Math.exp(-RATE * Math.max(0, dt));
  if (turn) {
    button.rotation.z += ((on ? KNOB_TURN : 0) - button.rotation.z) * k;
    return;
  }
  // vers le centre de l'appareil, à l'horizontale (un bouton posé à l'origine s'enfonce vers l'arrière)
  toward.set(-rest.x, 0, -rest.z);
  if (toward.lengthSq() < 1e-8) toward.set(0, 0, -1);
  toward.normalize().multiplyScalar(on ? PRESS_DEPTH : 0).add(rest);
  button.position.lerp(toward, k);
}
