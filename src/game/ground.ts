/**
 * Le sol : le plan invisible qui reçoit les clics. Le terrain qu'on voit est l'île (ile.ts).
 */
import * as THREE from 'three';

/** Demi-côté du sol (m) : le perso ne peut pas sortir de [-GROUND_HALF + 2, GROUND_HALF - 2]. */
export const GROUND_HALF = 60;

/**
 * Le sol sous la souris : un grand plan à y = 0, invisible (le terrain visible est l'île, voir
 * ile.ts). Le carré où l'on marche est plat : un plan suffit pour savoir où l'on clique.
 */
export function createGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(GROUND_HALF * 8, GROUND_HALF * 8);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.visible = false;
  mesh.name = 'ground';
  return mesh;
}
