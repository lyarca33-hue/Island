/**
 * Matériau cel shading des persos : MeshToonMaterial à paliers nets + liseré de lumière sur
 * les bords (rim light), qui détache le perso du sol comme dans les jeux HD-2D.
 */
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Rampe d'ombrage en 3 paliers (ombre, mi-ton, lumière), filtrée au plus proche : bords nets. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [70, 160, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

let softGradient: THREE.DataTexture | null = null;

/**
 * Rampe douce (ombre claire, fondue) : pour les modèles Tripo, dont la texture porte déjà ses
 * ombres et dont la surface bosselée ferait des taches avec des paliers nets.
 */
export function softToonGradient(): THREE.DataTexture {
  if (softGradient) return softGradient;
  const steps = [135, 185, 225, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  softGradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  softGradient.minFilter = THREE.LinearFilter;
  softGradient.magFilter = THREE.LinearFilter;
  softGradient.generateMipmaps = false;
  softGradient.needsUpdate = true;
  return softGradient;
}

export interface ToonOptions {
  color: THREE.ColorRepresentation;
  /** Couleur du liseré (rim light). */
  rim?: THREE.ColorRepresentation;
  /** Force du liseré (0 = aucun). */
  rimStrength?: number;
  map?: THREE.Texture | null;
  /** Ombrage fondu (softToonGradient) au lieu des paliers nets. */
  soft?: boolean;
}

export function createToonMaterial(o: ToonOptions): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: o.color, map: o.map ?? null, gradientMap: o.soft ? softToonGradient() : toonGradient() });
  const rim = new THREE.Color(o.rim ?? 0xfff1d6);
  const strength = o.rimStrength ?? 0.3;
  if (strength > 0) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRimColor = { value: rim };
      sh.uniforms.uRimStrength = { value: strength };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength;')
        .replace(
          '#include <opaque_fragment>',
          // liseré en palier (pas de dégradé) : même langage graphique que l'ombrage
          `vec3 rimV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
           float rimF = 1.0 - max(dot(rimV, normal), 0.0);
           outgoingLight += uRimColor * step(0.62, rimF) * uRimStrength;
           #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => `toon-rim-${strength}`;
    // réglages du liseré, cachés dans onBeforeCompile : deux matériaux pareils se reconnaissent (merge.ts)
    m.userData.rim = `${rim.getHexString()}-${strength}`;
  }
  return m;
}
