import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hasFoodMaps, setFoodMaps, showCooked, showSpoiled } from '../src/game/items/foodstates';

const tex = (name: string) => Object.assign(new THREE.Texture(), { name });

describe('textures d’état d’un aliment', () => {
  const maps = { raw: tex('cru'), cooked: tex('cuit'), burnt: tex('brule'), spoiled: tex('perime') };
  // le mélange se lit dans le shader : texture de base (map) + deuxième texture et sa part
  const state = (m: THREE.MeshToonMaterial) => {
    const sh = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <common>\n#include <map_fragment>', vertexShader: '' };
    m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    return { map: m.map?.name, blend: (sh.uniforms.uBlendMap.value as THREE.Texture).name, mix: sh.uniforms.uBlendMix.value as number, shader: sh.fragmentShader };
  };

  it('passe de cru à cuit puis à brûlé', () => {
    const m = new THREE.MeshToonMaterial();
    setFoodMaps(m, maps);
    expect(hasFoodMaps(m)).toBe(true);
    expect(state(m).shader).toContain('uBlendMix');
    showCooked(m, 0);
    expect(state(m)).toMatchObject({ map: 'cru', mix: 0 });
    showCooked(m, 0.5);
    expect(state(m)).toMatchObject({ map: 'cru', blend: 'cuit', mix: 0.5 });
    showCooked(m, 1);
    expect(state(m)).toMatchObject({ map: 'cru', blend: 'cuit', mix: 1 });
    showCooked(m, 1.25);
    expect(state(m)).toMatchObject({ map: 'cuit', blend: 'brule', mix: 0.25 });
  });

  it('prend la texture périmée quand il est cru, pas une fois cuit', () => {
    const m = new THREE.MeshToonMaterial();
    setFoodMaps(m, maps);
    expect(showSpoiled(m, true)).toBe(true);
    expect(m.map?.name).toBe('perime');
    showCooked(m, 1);
    expect(state(m)).toMatchObject({ map: 'cru', blend: 'cuit', mix: 1 });
    showCooked(m, 0);
    expect(m.map?.name).toBe('perime');
    showSpoiled(m, false);
    expect(m.map?.name).toBe('cru');
  });

  it('sans texture périmée, les taches restent', () => {
    const m = new THREE.MeshToonMaterial();
    setFoodMaps(m, { raw: tex('cru'), cooked: tex('cuit') });
    expect(showSpoiled(m, true)).toBe(false);
    expect(showSpoiled(new THREE.MeshToonMaterial(), true)).toBe(false);
  });
});
