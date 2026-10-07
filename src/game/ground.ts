/**
 * Sol de la map vide : un grand plan d'herbe, texture peinte par programme (taches de
 * couleur douces + petits brins), en cel shading comme les persos pour recevoir des ombres nettes.
 */
import * as THREE from 'three';
import { createToonMaterial } from './toon';

/** Demi-côté du sol (m) : le perso ne peut pas sortir de [-GROUND_HALF + 2, GROUND_HALF - 2]. */
export const GROUND_HALF = 60;
/** Côté couvert par une répétition de la texture (m). */
const TILE_M = 8;

/** Petit générateur pseudo-aléatoire déterministe (même sol à chaque lancement). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function grassTexture(): THREE.CanvasTexture {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#6f9a4a';
  g.fillRect(0, 0, size, size);
  const rand = rng(7);
  // taches douces, dessinées 9 fois décalées d'un côté de texture : la répétition est sans couture
  const blot = (x: number, y: number, r: number, color: string) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const gr = g.createRadialGradient(x + dx * size, y + dy * size, 0, x + dx * size, y + dy * size, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + dx * size, y + dy * size, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  const tones = ['rgba(150,190,90,0.35)', 'rgba(70,110,50,0.3)', 'rgba(170,175,90,0.22)', 'rgba(95,140,70,0.3)'];
  for (let i = 0; i < 70; i++) blot(rand() * size, rand() * size, 20 + rand() * 70, tones[i % tones.length]);
  // brins : petits traits clairs et sombres
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size, y = rand() * size, h = 3 + rand() * 5;
    g.strokeStyle = rand() < 0.5 ? 'rgba(185,215,120,0.3)' : 'rgba(50,85,40,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 2, y - h);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((GROUND_HALF * 2) / TILE_M, (GROUND_HALF * 2) / TILE_M);
  tex.anisotropy = 8;
  return tex;
}

export function createGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = createToonMaterial({ color: 0xffffff, map: grassTexture(), rimStrength: 0 });
  // neige : l'herbe blanchit, d'abord ses touffes claires, puis tout le sol
  const snow = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = snow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float grassL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.84, 0.92), clamp(uSnow * (0.7 + grassL * 2.5), 0.0, 1.0));`,
      );
  };
  mat.customProgramCacheKey = () => 'ground-snow';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.snow = snow;
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

/** Saison du sol : teinte de l'herbe (multipliée à sa texture) et part de neige (0 à 1). */
export function setGroundSeason(ground: THREE.Mesh, grass: [number, number, number], snow: number): void {
  (ground.material as THREE.MeshToonMaterial).color.setRGB(grass[0], grass[1], grass[2]);
  (ground.userData.snow as { value: number }).value = snow;
}
