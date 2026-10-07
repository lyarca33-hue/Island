/**
 * Poussières de lumière qui flottent autour du perso (touche d'ambiance HD-2D) : quelques
 * centaines de points additifs, assez lumineux pour accrocher le bloom.
 */
import * as THREE from 'three';

const COUNT = 90;

/** Couleur des poussières (au-dessus de 1 : le bloom les fait briller) et vitesse de chute (m/s). */
export interface MotesLook {
  motes: [number, number, number];
  fall: number;
}
/** Poussières de lumière dorées, sans chute (dans les pièces). */
export const INDOOR_MOTES: MotesLook = { motes: [2.2, 1.9, 1.2], fall: 0 };
/** Hauteurs où flottent les poussières (m) : elles retombent en haut quand elles touchent le bas. */
const LOW = 0.3, HIGH = 3.3;
/** Demi-côté de la boîte de poussières autour du perso (m). */
const SPREAD = 9;

export function createMotes(): { points: THREE.Points; update: (t: number, center: THREE.Vector3, look: MotesLook) => void } {
  const base = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    base[i * 3] = (Math.random() * 2 - 1) * SPREAD;
    base[i * 3 + 1] = LOW + Math.random() * (HIGH - LOW);
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
  let fallen = 0, last = 0;
  const wrap = (v: number) => ((((v + SPREAD) % (2 * SPREAD)) + 2 * SPREAD) % (2 * SPREAD)) - SPREAD;
  return {
    points,
    update(t, center, look) {
      mat.color.setRGB(look.motes[0], look.motes[1], look.motes[2]);
      // chute cumulée : changer de vitesse ne fait pas sauter les poussières
      fallen += look.fall * Math.max(0, Math.min(0.1, t - last));
      last = t;
      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        // dérive lente + ondulation ; recadrées autour du perso (boîte qui le suit sans saut)
        const x = base[i * 3] + Math.sin(t * 0.3 + ph) * 0.6 + t * 0.15;
        const z = base[i * 3 + 2] + Math.cos(t * 0.25 + ph) * 0.6;
        pos[i * 3] = center.x + wrap(x - center.x);
        const y = base[i * 3 + 1] - fallen * (0.8 + 0.4 * Math.sin(ph));
        pos[i * 3 + 1] = LOW + ((((y - LOW) % (HIGH - LOW)) + (HIGH - LOW)) % (HIGH - LOW)) + Math.sin(t * 0.7 + ph * 2) * 0.25;
        pos[i * 3 + 2] = center.z + wrap(z - center.z);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
