/**
 * Les textures d'état d'un aliment Tripo (pack `aliments`, voir tools/build_aliments_etats.mjs) :
 * cru, cuit, brûlé, périmé. Le matériau de l'aliment mélange deux d'entre elles (cru → cuit, puis
 * cuit → brûlé) pendant la cuisson (cooking.ts), et prend la texture périmée quand il se gâte
 * (WorldItem.setMoldy). Les textures sont rangées à côté du matériau, pas dans son userData
 * (copié en JSON quand on clone un matériau).
 */
import * as THREE from 'three';

export interface FoodMaps {
  raw: THREE.Texture;
  cooked?: THREE.Texture;
  burnt?: THREE.Texture;
  spoiled?: THREE.Texture;
}

interface State {
  maps: FoodMaps;
  /** Deuxième texture et part de celle-ci (0 : la première seule). */
  blend: { value: THREE.Texture };
  mix: { value: number };
  spoiled: boolean;
}

const states = new WeakMap<THREE.Material, State>();

/** Donne ses textures d'état au matériau (peint) d'un aliment ; le mélange se fait dans le shader. */
export function setFoodMaps(m: THREE.MeshToonMaterial, maps: FoodMaps): void {
  const s: State = { maps, blend: { value: maps.raw }, mix: { value: 0 }, spoiled: false };
  states.set(m, s);
  m.map = maps.raw;
  const before = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    before.call(m, sh, r);
    sh.uniforms.uBlendMap = s.blend;
    sh.uniforms.uBlendMix = s.mix;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBlendMap; uniform float uBlendMix;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           diffuseColor *= mix(texture2D(map, vMapUv), texture2D(uBlendMap, vMapUv), uBlendMix);
         #endif`,
      );
  };
  m.customProgramCacheKey = () => `${key}-etats`;
}

export const hasFoodMaps = (m: THREE.Material) => states.has(m);

/**
 * Cuisson `k` : 0 cru, 1 cuit, 2 brûlé (entre les deux, le mélange). Cru, l'aliment garde sa texture
 * périmée s'il s'est gâté.
 */
export function showCooked(m: THREE.MeshToonMaterial, k: number): void {
  const s = states.get(m);
  if (!s) return;
  const { raw, cooked, burnt } = s.maps;
  if (k <= 0 || !cooked) {
    m.map = s.spoiled && s.maps.spoiled ? s.maps.spoiled : raw;
    s.mix.value = 0;
  } else if (k <= 1 || !burnt) {
    m.map = raw;
    s.blend.value = cooked;
    s.mix.value = Math.min(k, 1);
  } else {
    m.map = cooked;
    s.blend.value = burnt;
    s.mix.value = Math.min(k - 1, 1);
  }
}

/** Gâté ou pas : vrai si le matériau a une texture périmée (alors pas besoin de taches). */
export function showSpoiled(m: THREE.MeshToonMaterial, on: boolean): boolean {
  const s = states.get(m);
  if (!s?.maps.spoiled) return false;
  s.spoiled = on;
  if (s.mix.value === 0 && m.map !== s.maps.cooked) m.map = on ? s.maps.spoiled : s.maps.raw;
  return true;
}
