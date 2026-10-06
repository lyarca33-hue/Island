/**
 * Poussières de lumière qui flottent autour du perso (touche d'ambiance HD-2D) : quelques
 * centaines de points additifs, assez lumineux pour accrocher le bloom.
 */
import * as THREE from 'three';

const COUNT = 90;
/** Demi-côté de la boîte de poussières autour du perso (m). */
const SPREAD = 9;

export function createMotes(): { points: THREE.Points; update: (t: number, center: THREE.Vector3) => void } {
  const base = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    base[i * 3] = (Math.random() * 2 - 1) * SPREAD;
    base[i * 3 + 1] = 0.3 + Math.random() * 3;
    base[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(2.2, 1.9, 1.2), // au-dessus de 1 : le bloom les fait briller
    size: 2.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const wrap = (v: number) => ((((v + SPREAD) % (2 * SPREAD)) + 2 * SPREAD) % (2 * SPREAD)) - SPREAD;
  return {
    points,
    update(t, center) {
      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        // dérive lente + ondulation ; recadrées autour du perso (boîte qui le suit sans saut)
        const x = base[i * 3] + Math.sin(t * 0.3 + ph) * 0.6 + t * 0.15;
        const z = base[i * 3 + 2] + Math.cos(t * 0.25 + ph) * 0.6;
        pos[i * 3] = center.x + wrap(x - center.x);
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + ph * 2) * 0.25;
        pos[i * 3 + 2] = center.z + wrap(z - center.z);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
