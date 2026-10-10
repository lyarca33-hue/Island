/**
 * Touffes d'herbe en 3D façon Genshin : des brins pointus, plus clairs à la pointe, qui ondulent au
 * vent. Une grille fixe de touffes suit la caméra (pas de 0,25 m) ; chaque touffe tire sa place, sa
 * taille et son angle d'un hasard attaché à sa case du monde, donc l'herbe ne « glisse » pas quand
 * la grille se déplace. Le shader lit le relief, les sols (pas d'herbe sur le sable, la roche, les
 * routes ni dans la maison) et la couleur du sol en dessous, pour que la touffe s'y fonde.
 */
import * as THREE from 'three';
import { createToonMaterial } from './toon';

/** Pas de la grille des touffes (m) et nombre de touffes par côté. */
const STEP = 0.25;
const COUNT = 200;
/** Brins par touffe, hauteur et largeur d'un brin (m). */
const BLADES = 5;
const BLADE_H = 0.32;
const BLADE_W = 0.045;

export interface GrassInputs {
  /** Relief (m), sols (sable, roche, terre), « pas d'herbe » (routes, maison), bruit doux. */
  height: THREE.Texture;
  splat: THREE.Texture;
  mask: THREE.Texture;
  tone: THREE.Texture;
  /** Vert profond, vert vif, vert-jaune : les mêmes que le sol. */
  colors: [THREE.Color, THREE.Color, THREE.Color];
  /** Ramène (x, z) monde aux coordonnées des textures du relief. */
  mapHalf: number;
  shared: { uTime: { value: number }; uSnow: { value: number }; uWet: { value: number }; uGrass: { value: THREE.Color } };
}

export interface Grass {
  mesh: THREE.Mesh;
  /** Recentre la grille sur le point regardé ; force du vent (0 à 1) ; zoom de la caméra (1 : normal). */
  follow(x: number, z: number, wind: number, zoom: number): void;
}

/** Une touffe : BLADES brins en éventail, chacun un triangle effilé en deux étages. */
function tuftGeometry(): THREE.InstancedBufferGeometry {
  const pos: number[] = [], h: number[] = [], idx: number[] = [];
  const rand = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + rand(b) * 0.8;
    const r = 0.03 + rand(b + 10) * 0.07;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    // brin tourné au hasard, penché vers l'extérieur
    const t = a + Math.PI / 2 + (rand(b + 20) - 0.5);
    const wx = Math.cos(t) * BLADE_W * 0.5, wz = Math.sin(t) * BLADE_W * 0.5;
    const lean = 0.25 + rand(b + 30) * 0.35;
    const hh = 0.7 + rand(b + 40) * 0.5;
    const ox = Math.cos(a) * lean, oz = Math.sin(a) * lean;
    const base = pos.length / 3;
    // bas gauche, bas droite, milieu gauche, milieu droite, pointe
    pos.push(cx - wx, 0, cz - wz, cx + wx, 0, cz + wz);
    pos.push(cx - wx * 0.7 + ox * 0.45 * hh * BLADE_H, 0.5 * hh, cz - wz * 0.7 + oz * 0.45 * hh * BLADE_H);
    pos.push(cx + wx * 0.7 + ox * 0.45 * hh * BLADE_H, 0.5 * hh, cz + wz * 0.7 + oz * 0.45 * hh * BLADE_H);
    pos.push(cx + ox * hh * BLADE_H, hh, cz + oz * hh * BLADE_H);
    h.push(0, 0, 0.5, 0.5, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const cells = new Float32Array(COUNT * COUNT * 2);
  for (let j = 0; j < COUNT; j++) for (let i = 0; i < COUNT; i++) cells.set([i, j], (j * COUNT + i) * 2);
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  g.instanceCount = COUNT * COUNT;
  return g;
}

export function createGrass(o: GrassInputs): Grass {
  const mat = createToonMaterial({ color: 0xffffff, rimStrength: 0, soft: true });
  mat.side = THREE.DoubleSide;
  const u = {
    uOrigin: { value: new THREE.Vector2() },
    uFocus: { value: new THREE.Vector2() },
    uWind: { value: 0.3 },
    uFar: { value: 0 },
    uHeight: { value: o.height },
    uSplat: { value: o.splat },
    uMask: { value: o.mask },
    uTone: { value: o.tone },
    uG0: { value: o.colors[0] },
    uG1: { value: o.colors[1] },
    uG2: { value: o.colors[2] },
  };
  const half = o.mapHalf.toFixed(1);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, o.shared, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec2 aCell; attribute float aH;
         uniform vec2 uOrigin; uniform vec2 uFocus; uniform float uWind; uniform float uFar; uniform float uTime; uniform float uSnow;
         uniform sampler2D uHeight; uniform sampler2D uSplat; uniform sampler2D uMask; uniform sampler2D uTone;
         uniform vec3 uG0; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uGrass;
         varying vec3 vGrassCol;
         vec2 ileMap(vec2 xz) { return (xz + ${half}) / (2.0 * ${half}); }
         float gh(vec2 xz) { return texture2D(uHeight, ileMap(xz)).r; }
         float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 cell = uOrigin + aCell;
         vec2 base = (cell + vec2(hash(cell), hash(cell + 17.3)) ) * ${STEP.toFixed(2)};
         // normale du relief : la touffe s'éclaire comme le sol sous elle
         float e = 0.4;
         vec3 objectNormal = normalize(vec3(gh(base - vec2(e, 0.0)) - gh(base + vec2(e, 0.0)), 2.0 * e, gh(base - vec2(0.0, e)) - gh(base + vec2(0.0, e))));
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3(1.0, 0.0, 0.0);
         #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec4 sp = texture2D(uSplat, ileMap(base));
         float bare = max(max(sp.r, sp.g), max(sp.b, texture2D(uMask, ileMap(base)).r));
         // au bord de la grille, les touffes rapetissent : pas de bord visible quand elle se déplace
         vec2 off = abs(base - uFocus) / (${(COUNT * STEP * 0.5).toFixed(1)});
         float edge = 1.0 - smoothstep(0.7, 0.98, max(off.x, off.y));
         float size = smoothstep(0.55, 0.3, bare) * edge * (1.0 - uSnow) * (0.7 + 0.6 * hash(cell + 3.1));
         // pente raide (falaises) : pas d'herbe
         size *= smoothstep(0.55, 0.75, objectNormal.y);
         // vue de loin : brins plus courts (ils scintilleraient, plus fins qu'un pixel)
         size *= 1.0 - 0.75 * uFar;
         float ang = hash(cell + 41.1) * 6.2832;
         float c = cos(ang), s = sin(ang);
         vec2 local = mat2(c, -s, s, c) * position.xz * (0.8 + 0.5 * hash(cell + 9.7));
         // vent : une houle lente qui traverse le pré, plus des rafales
         float gust = texture2D(uTone, base / 30.0 + vec2(uTime * 0.04, uTime * 0.025)).r;
         float sway = sin(uTime * 1.8 + base.x * 0.5 + base.y * 0.3) * 0.5 + 0.5;
         float bend = aH * aH * (0.03 + (0.06 * sway + 0.12 * gust) * (0.3 + uWind)) * size;
         vec3 transformed = vec3(base.x + local.x * size + bend * 0.9, gh(base) + position.y * ${BLADE_H.toFixed(2)} * size * (1.0 - 0.15 * gust * uWind), base.y + local.y * size + bend * 0.4);
         // la couleur du sol sous la touffe (comme le terrain), plus claire vers la pointe
         float tone = texture2D(uTone, base / 48.0).r * 0.65 + texture2D(uTone, base / 17.0 + vec2(0.31, 0.77)).r * 0.35;
         vec3 ground = mix(uG0, uG1, smoothstep(0.25, 0.55, tone));
         ground = mix(ground, uG2, smoothstep(0.58, 0.85, tone) * 0.7);
         ground *= 0.94 + 0.12 * texture2D(uTone, base / 2.2).r;
         vec3 sunDir = normalize(vec3(-0.45, 0.75, -0.5));
         float shade = clamp(1.0 + (dot(objectNormal, sunDir) - sunDir.y) * 1.8, 0.6, 1.25);
         vGrassCol = mix(ground * mix(0.9, 1.0, uFar), mix(ground, uG2, mix(0.55, 0.15, uFar)) * mix(1.12, 1.03, uFar), aH) * uGrass * shade;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol; uniform float uWet;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vGrassCol * (1.0 - 0.25 * uWet);')
      // les deux faces d'un brin s'éclairent comme le sol (sinon le revers, retourné, fonce)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'ile-herbe';
  const mesh = new THREE.Mesh(tuftGeometry(), mat);
  mesh.name = 'herbe';
  mesh.frustumCulled = false;
  // dessinée après le reste, sans écrire la profondeur : les contours à l'encre (tirés de la
  // profondeur) ignorent les brins, sinon tout le pré se couvre de traits noirs
  mat.depthWrite = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    follow(x, z, wind, zoom) {
      u.uFar.value = 1 - THREE.MathUtils.smoothstep(zoom, 0.25, 0.55);
      u.uFocus.value.set(x, z);
      u.uOrigin.value.set(Math.floor(x / STEP) - COUNT / 2, Math.floor(z / STEP) - COUNT / 2);
      u.uWind.value = wind;
    },
  };
}
