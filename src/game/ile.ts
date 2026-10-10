/**
 * L'île autour de la maison : la pelouse, la plage, les falaises, la mer et les routes, tout fait
 * par le jeu (relief, textures peintes par programme, eau animée), sans modèle à charger.
 *
 * - Le terrain où l'on marche (le carré de ±WALK_HALF m) reste plat, à y = 0 : le perso, la
 *   navigation et les meubles n'ont rien à savoir du relief. Le relief commence juste au-delà.
 * - Au sud et au sud-ouest, la plage : une bande de sable dans le carré, qui descend doucement
 *   dans la mer passé le bord (on marche jusqu'au bord de l'eau). Au nord et au nord-ouest, les
 *   falaises : au bord du carré, une paroi de roche monte de 7 à 11 m par paliers, une bande
 *   d'herbe en haut, et de l'autre côté elle tombe dans la mer. Comme le plateau où l'on marche
 *   est au ras de l'eau, c'est la seule façon d'avoir des falaises sans relief sous les pieds du
 *   perso ; vue de la caméra de départ, la paroi fait le fond du décor. À l'est, une côte rocheuse
 *   basse (une marche de roche d'1,5 m). Les trois se fondent les unes dans les autres.
 * - L'herbe façon animé : trois aplats de vert aux bords nets, des touffes de brins dessinées et
 *   quelques fleurs ; autour de la maison, une pelouse tondue (bandes claires et foncées).
 * - La mer : un grand plan opaque dont la couleur dit la profondeur (turquoise au bord, bleu
 *   profond au large, le sable qui transparaît dans les premiers centimètres), avec l'écume du
 *   rivage, des vagues qui arrivent sur la plage et l'écume au pied des rochers. Plus agitée par
 *   temps de pluie.
 * - Les routes : une route côtière goudronnée qui fait le tour de l'île (lignes blanches), une
 *   allée goudronnée du garage à la route et un chemin de terre de la porte d'entrée à la route.
 *
 * Saisons et météo comme l'ancien sol d'herbe : teinte de l'herbe, neige (herbe d'abord, puis
 * sable, routes et haut des rochers ; jamais les parois), sol plus sombre quand il est mouillé.
 */
import * as THREE from 'three';
import { createToonMaterial } from './toon';

/** Demi-côté du carré où l'on marche (m), plat à y = 0 (voir Game : GROUND_HALF - 14). */
export const WALK_HALF = 46;
/** Niveau de la mer (m). */
export const SEA_LEVEL = -0.18;
/** Demi-côté couvert par le relief (m) : au-delà, la mer est profonde et cache le fond. */
const RELIEF_HALF = 70;
/** Demi-côté du carré intérieur tout plat, fait d'un seul quadrilatère. */
const FLAT_HALF = 43;
/** Pas de la grille du relief (m). */
const CELL = 0.5;

// ---------------------------------------------------------------- bruit déterministe

function hash2(ix: number, iz: number, salt: number): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur lissé, de 0 à 1. */
function noise(x: number, z: number, salt = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt), c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Trois octaves de bruit, de 0 à 1. */
function fbm(x: number, z: number, salt = 0): number {
  return (noise(x, z, salt) * 4 + noise(x * 2.1, z * 2.1, salt + 1) * 2 + noise(x * 4.3, z * 4.3, salt + 2)) / 7;
}

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

// ---------------------------------------------------------------- forme de l'île

/** Écart (en degrés, de 0 à 180) entre deux angles. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Part de chaque genre de côte au point (x, z), selon la direction depuis le centre. */
export function coastKind(x: number, z: number): { plage: number; falaise: number; rochers: number } {
  // angle : 0° à l'est (+x), 90° au sud (+z, côté de la porte d'entrée), -90° au nord
  const a = (Math.atan2(z, x) * 180) / Math.PI;
  const plage = 1 - smooth(50, 80, angleGap(a, 112));
  const falaise = (1 - smooth(55, 85, angleGap(a, -120))) * (1 - plage);
  return { plage, falaise, rochers: Math.max(0, 1 - plage - falaise) };
}

/**
 * Distance au carré où l'on marche : négative dedans (distance au bord le plus proche), positive
 * dehors (distance au carré : les coins de l'île sont arrondis).
 */
export function edgeDistance(x: number, z: number): number {
  const ax = Math.abs(x) - WALK_HALF, az = Math.abs(z) - WALK_HALF;
  if (ax <= 0 && az <= 0) return Math.max(ax, az);
  return Math.hypot(Math.max(ax, 0), Math.max(az, 0));
}

/** De 0 à 1 par `steps` paliers (pentes raides, replats courts) : les strates d'une paroi. */
function stepped(t: number, steps: number): number {
  const s = THREE.MathUtils.clamp(t, 0, 1) * steps, i = Math.floor(s);
  return Math.min(1, (i + smooth(0.3, 0.8, s - i)) / steps) * 0.8 + THREE.MathUtils.clamp(t, 0, 1) * 0.2;
}

/** Hauteur du sol de l'île au point (x, z) (m) ; sous SEA_LEVEL, c'est la mer. */
export function heightAt(x: number, z: number): number {
  const d = edgeDistance(x, z);
  if (d <= 0.15) return 0;
  const k = coastKind(x, z);
  // bruits le long de la côte : le bord avance et recule, les parois sont plus ou moins hautes
  const n = fbm(x * 0.06, z * 0.06, 11);
  const n2 = fbm(x * 0.045 + 7, z * 0.045, 13);
  const rough = noise(x * 0.9, z * 0.9, 12) - 0.5;
  let h = 0;
  if (k.plage > 0) {
    // sable : à plat sur un à quatre mètres, puis une pente douce jusqu'à l'eau et un fond qui s'enfonce
    const t = Math.max(0, d - (0.4 + n * 3.5));
    h += k.plage * Math.max(-7, -0.07 * t - 0.012 * t * t);
  }
  if (k.falaise > 0) {
    // falaises : au bord du carré, une paroi de roche monte de 7 à 11 m par paliers ; en haut,
    // une bande d'herbe ; de l'autre côté, la paroi tombe dans la mer
    const foot = 0.2 + n * 2.5 + n2 * 1.5;
    const high = 7 + 4 * n2;
    const up = 2.6 + n * 1.6;
    const top = 3 + 8 * n2;
    const rise = stepped((d - foot) / up, 3);
    const past = d - foot - up - top;
    const fall = stepped(past / 3.5, 3);
    const face = Math.sin(Math.PI * THREE.MathUtils.clamp((d - foot) / up, 0, 1)) + Math.sin(Math.PI * THREE.MathUtils.clamp(past / 3.5, 0, 1));
    h += k.falaise * (high * rise - (high + 5) * fall - 0.4 * Math.max(0, past - 3.5) + rough * 0.9 * face);
  }
  if (k.rochers > 0) {
    // côte rocheuse basse : une marche de roche d'un mètre et demi, puis le fond
    const edge = 0.3 + n * 1.5;
    const step = 1.5 * smooth(edge, edge + 1.3, d) + 0.3 * n2 * smooth(edge, edge + 2, d) + rough * 0.4 * smooth(edge, edge + 0.6, d);
    const t = Math.max(0, d - edge - 1.3);
    h += k.rochers * Math.max(-9, -step - 0.12 * t - 0.01 * t * t);
  }
  // au large : le fond descend partout à 14 m (la mer y est d'un bleu profond)
  return THREE.MathUtils.lerp(h, -14, smooth(19, 24, d));
}

/** Ce qu'il y a au sol au point (x, z), sans les routes : herbe, sable, roche ou mer. */
export function groundKind(x: number, z: number): 'herbe' | 'sable' | 'roche' | 'mer' {
  const h = heightAt(x, z);
  if (h < SEA_LEVEL) return 'mer';
  const s = splatAt(x, z);
  if (s.roche > 0.5) return 'roche';
  return s.sable > 0.5 ? 'sable' : 'herbe';
}

/** Parts du sol (0 à 1) : sable, roche (côte rocheuse, falaise), terre (bord des falaises), pelouse tondue. */
function splatAt(x: number, z: number): { sable: number; roche: number; terre: number; pelouse: number } {
  const d = edgeDistance(x, z);
  const k = coastKind(x, z);
  const n = fbm(x * 0.09, z * 0.09, 21);
  const fine = noise(x * 0.8, z * 0.8, 22);
  // sable : une bande de 6 à 10 m dans le carré, côté plage, au bord ébouriffé (touffes d'herbe)
  const sable = k.plage * smooth(-9.5 + n * 4 + fine * 0.8, -8 + n * 4 + fine * 0.8, d);
  // roche : passé le bord, sur la côte rocheuse (les parois des falaises : par la pente, dans le shader)
  const roche = k.rochers * smooth(0.3, 1.1, d - n * 0.6);
  // éboulis de terre au pied des falaises, entre l'herbe et la paroi
  const terre = k.falaise * smooth(-2.4 - n * 1.5 + fine * 0.6, -0.6, d) * (1 - smooth(1.5, 2.5, d));
  // pelouse tondue autour de la maison (un rectangle aux coins arrondis, bord adouci)
  const px = Math.max(Math.abs(x + 0.5) - 13, 0), pz = Math.max(Math.abs(z + 2) - 9, 0);
  const pelouse = 1 - smooth(2, 3.2, Math.hypot(px, pz) + fine * 0.8);
  return { sable, roche, terre, pelouse };
}

// ---------------------------------------------------------------- routes

/** Une route ou un chemin : sa ligne (points au sol), sa largeur et son revêtement. */
interface Way {
  points: Array<[number, number]>;
  closed: boolean;
  width: number;
  kind: 'route' | 'allee' | 'chemin';
}

/** Route côtière : un carré aux coins arrondis à ±33 m, qui ondule un peu. */
function coastRoadPoints(): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const half = 33, r = 13;
  const inner = half - r;
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // point du carré arrondi dans la direction a
    const cx = Math.cos(a), cz = Math.sin(a);
    const m = Math.max(Math.abs(cx), Math.abs(cz));
    let x = (cx / m) * half, z = (cz / m) * half;
    const qx = Math.abs(x) - inner, qz = Math.abs(z) - inner;
    if (qx > 0 && qz > 0) {
      const l = Math.hypot(qx, qz);
      x = Math.sign(x) * (inner + (qx / l) * r);
      z = Math.sign(z) * (inner + (qz / l) * r);
    }
    const wob = (fbm(x * 0.05, z * 0.05, 31) - 0.5) * 3;
    const l = Math.hypot(x, z);
    pts.push([x + (x / l) * wob, z + (z / l) * wob]);
  }
  return pts;
}

export const WAYS: Way[] = [
  { points: coastRoadPoints(), closed: true, width: 6, kind: 'route' },
  // allée du garage : de la porte basculante, plein sud jusqu'à la route
  { points: [[-8.6, 2.9], [-8.6, 9], [-8.2, 16], [-7, 24], [-6.4, 33]], closed: false, width: 3.4, kind: 'allee' },
  // chemin de la porte d'entrée : il part vers le sud-est et rejoint la route
  { points: [[-4.7, 2.9], [-4.5, 6], [-2.5, 10], [1.5, 15], [4, 22], [5, 28], [5.5, 33]], closed: false, width: 1.6, kind: 'chemin' },
];

/** Hauteur au-dessus du sol de chaque revêtement : la route passe sur l'allée et le chemin là où ils la rejoignent. */
const WAY_LIFT = { chemin: 0.008, allee: 0.012, route: 0.018 } as const;

function wayCurve(w: Way): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(w.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), w.closed, 'centripetal');
}

const wayPoints = new Map<Way, THREE.Vector3[]>();

/** Le point (x, z) est-il sur une route ou un chemin ? */
export function wayAt(x: number, z: number): Way['kind'] | null {
  const p = new THREE.Vector3(x, 0, z);
  for (const w of WAYS) {
    let pts = wayPoints.get(w);
    if (!pts) {
      const c = wayCurve(w);
      wayPoints.set(w, (pts = c.getSpacedPoints(Math.ceil(c.getLength() / 0.4))));
    }
    if (pts.some((q) => q.distanceToSquared(p) < (w.width / 2) ** 2)) return w.kind;
  }
  return null;
}

/** Ruban d'une route : u en travers (0 à 1), v le long (m / longueur d'une répétition de texture). */
function wayGeometry(w: Way, repeat: number): THREE.BufferGeometry {
  const curve = wayCurve(w);
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / 0.8));
  const pts = curve.getSpacedPoints(n);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i];
    const t = curve.getTangentAt(Math.min(i / n, 1)).setY(0).normalize();
    const side = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(w.width / 2);
    const y = WAY_LIFT[w.kind];
    pos.push(p.x - side.x, y, p.z - side.z, p.x + side.x, y, p.z + side.z);
    // longueur pile multiple d'une répétition : la route qui fait le tour se referme sans raccord
    const v = (i / n) * Math.max(1, Math.round(len / repeat));
    uv.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((n + 1) * 2).fill([0, 1, 0]).flat(), 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- textures peintes

type Painter = (g: CanvasRenderingContext2D, size: number, rand: () => number) => void;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tache douce dessinée 9 fois décalée d'un côté de texture : la répétition est sans couture. */
function blot(g: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, r: number, color: string): void {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const cx = x + dx * w, cy = y + dy * h;
    if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, color);
    // même couleur, transparente : un dégradé vers « transparent » (noir) laisserait un halo sombre
    gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
}

function paint(w: number, h: number, base: string, seed: number, draw: Painter, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  draw(g, w, rng(seed));
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Herbe façon animé : touffes de brins pointus dessinées une à une (un trait sombre à la base, une
 * pointe claire), sur un fond uni, en gris (valeurs brutes, pas sRGB) : la couleur vient des aplats
 * du shader. Quelques fleurs jaunes et roses, elles, en couleur. Une répétition couvre 4 m.
 */
function animeGrassTexture(): THREE.CanvasTexture {
  return paint(512, 512, 'rgb(204,204,204)', 101, (g, s, rand) => {
    const blade = (x: number, y: number, h: number, lean: number, w: number, shade: number) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const bx = x + dx * s, by = y + dy * s;
        if (bx < -30 || bx > s + 30 || by < -30 || by > s + 30) continue;
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.beginPath();
        g.moveTo(bx - w, by);
        g.quadraticCurveTo(bx + lean * 0.3, by - h * 0.6, bx + lean, by - h);
        g.quadraticCurveTo(bx + lean * 0.4 + w * 0.3, by - h * 0.5, bx + w, by);
        g.closePath();
        g.fill();
      }
    };
    // grandes nappes un peu plus sombres et plus claires, à bords nets
    for (let i = 0; i < 26; i++) {
      const x = rand() * s, y = rand() * s, r = 18 + rand() * 40, v = rand() < 0.5 ? 188 : 218;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.ellipse(x + dx * s, y + dy * s, r, r * 0.6, rand() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // touffes : 3 à 5 brins, d'abord leur ombre (sombre), puis le brin, puis sa pointe claire
    const tufts: Array<[number, number]> = [];
    for (let i = 0; i < 170; i++) tufts.push([rand() * s, rand() * s]);
    tufts.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of tufts) {
      const n = 4 + Math.floor(rand() * 3), h = 24 + rand() * 20;
      for (let k = 0; k < n; k++) {
        const ox = (k - (n - 1) / 2) * 5 + (rand() - 0.5) * 3, lean = (k - (n - 1) / 2) * 6 + (rand() - 0.5) * 8;
        blade(x + ox + 2.5, y + 2, h * 0.9, lean, 4.2, 140);
        blade(x + ox, y, h, lean, 3.6, 172 + Math.floor(rand() * 25));
        blade(x + ox + lean * 0.55, y - h * 0.55, h * 0.45, lean * 0.45, 2, 248);
      }
    }
    // petites fleurs (en couleur : le shader les garde telles quelles)
    for (let i = 0; i < 9; i++) {
      const x = 10 + rand() * (s - 20), y = 10 + rand() * (s - 20);
      const petal = rand() < 0.6 ? 'rgb(255,226,92)' : 'rgb(255,170,200)';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.fillStyle = petal;
        g.beginPath();
        g.arc(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5, 3.8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgb(255,140,60)';
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
}

/** Bruit doux en gris (valeurs brutes), pour les grandes nappes de couleur de l'herbe. */
function toneTexture(): THREE.CanvasTexture {
  return paint(256, 256, 'rgb(128,128,128)', 111, (g, s, rand) => {
    for (let i = 0; i < 70; i++) {
      const v = rand() < 0.5 ? '255,255,255' : '0,0,0';
      blot(g, s, s, rand() * s, rand() * s, 20 + rand() * 50, `rgba(${v},${0.25 + rand() * 0.25})`);
    }
  }, false);
}

/** Sable : beige chaud, taches claires et sombres, petits grains et rides laissées par le vent. */
function sandTexture(): THREE.CanvasTexture {
  return paint(512, 512, '#e6d2a0', 41, (g, s, rand) => {
    const tones = ['rgba(248,234,196,0.4)', 'rgba(205,178,125,0.16)', 'rgba(238,220,170,0.35)'];
    for (let i = 0; i < 50; i++) blot(g, s, s, rand() * s, rand() * s, 30 + rand() * 80, tones[i % 3]);
    // rides laissées par le vent : traits clairs et ondulés, périodiques sur la largeur
    g.lineWidth = 3;
    for (let j = 0; j < 16; j++) {
      const y0 = (j / 16) * s + rand() * 10;
      g.strokeStyle = 'rgba(252,242,212,0.22)';
      g.beginPath();
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y0 + Math.sin((x / s) * Math.PI * 6 + j * 1.7) * 7);
      g.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rand() < 0.4 ? 'rgba(165,135,90,0.4)' : 'rgba(255,250,232,0.6)';
      g.fillRect(rand() * s, rand() * s, 1.5, 1.5);
    }
  });
}

/** Roche : strates horizontales grises et beiges, fissures verticales (vue de côté sur les parois). */
function rockTexture(): THREE.CanvasTexture {
  return paint(512, 512, '#8d877c', 51, (g, s, rand) => {
    // strates : bandes de hauteur variable qui couvrent tout le côté, répétées sans couture
    let y = 0;
    const tones = ['#9a9385', '#857e72', '#a39c8c', '#7c766b', '#948c7d'];
    let i = 0;
    while (y < s) {
      const hb = 24 + rand() * 50;
      g.fillStyle = tones[i++ % tones.length];
      g.fillRect(0, y, s, Math.min(hb, s - y));
      // bord de strate : une ligne sombre, un liseré clair
      g.fillStyle = 'rgba(50,45,40,0.45)';
      g.fillRect(0, y, s, 2);
      g.fillStyle = 'rgba(210,200,180,0.25)';
      g.fillRect(0, y + 2, s, 2);
      y += hb;
    }
    for (let k = 0; k < 40; k++) blot(g, s, s, rand() * s, rand() * s, 20 + rand() * 60, rand() < 0.5 ? 'rgba(60,55,50,0.22)' : 'rgba(200,190,170,0.2)');
    // fissures
    g.strokeStyle = 'rgba(45,40,35,0.55)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 70; k++) {
      let x = rand() * s, yy = rand() * s;
      g.beginPath();
      g.moveTo(x, yy);
      for (let m = 0; m < 4; m++) {
        x += (rand() - 0.5) * 10;
        yy += 6 + rand() * 12;
        g.lineTo(x, yy);
      }
      g.stroke();
    }
  });
}

/** Terre nue : brun clair, taches, petits cailloux. */
function dirtTexture(): THREE.CanvasTexture {
  return paint(256, 256, '#9b7a54', 61, (g, s, rand) => {
    for (let i = 0; i < 40; i++) blot(g, s, s, rand() * s, rand() * s, 12 + rand() * 40, i % 2 ? 'rgba(120,90,60,0.35)' : 'rgba(185,155,115,0.3)');
    for (let i = 0; i < 160; i++) {
      const r = 1 + rand() * 2.5;
      g.fillStyle = rand() < 0.5 ? 'rgba(200,190,170,0.8)' : 'rgba(110,95,80,0.7)';
      g.beginPath();
      g.ellipse(rand() * s, rand() * s, r, r * 0.75, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/**
 * Goudron (une répétition : la largeur de la route sur deux fois sa largeur). Route : lignes de
 * rive blanches et ligne du milieu en tirets ; allée : goudron seul, bords un peu plus sombres.
 */
function asphaltTexture(markings: boolean): THREE.CanvasTexture {
  return paint(256, 512, '#5d5f62', markings ? 71 : 72, (g, s, rand) => {
    const w = s, h = 512;
    for (let i = 0; i < 30; i++) blot(g, w, h, rand() * w, rand() * h, 20 + rand() * 50, i % 2 ? 'rgba(80,82,86,0.4)' : 'rgba(115,117,120,0.3)');
    for (let i = 0; i < 3500; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(40,40,42,0.6)' : 'rgba(150,150,150,0.45)';
      g.fillRect(rand() * w, rand() * h, 1.2, 1.2);
    }
    // bords : un peu de terre et d'usure
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(70,62,50,0.55)');
    edge.addColorStop(0.04, 'rgba(70,62,50,0)');
    edge.addColorStop(0.96, 'rgba(70,62,50,0)');
    edge.addColorStop(1, 'rgba(70,62,50,0.55)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    if (!markings) return;
    g.fillStyle = 'rgba(240,238,228,0.92)';
    g.fillRect(w * 0.06, 0, w * 0.025, h);
    g.fillRect(w * 0.915, 0, w * 0.025, h);
    // tirets du milieu : 3 m de trait, 3 m d'espace (une répétition fait 12 m)
    for (let k = 0; k < 2; k++) g.fillRect(w * 0.4875, k * (h / 2), w * 0.025, h / 4);
  });
}

/** Chemin de terre : terre tassée, deux traces plus claires, bords irréguliers (transparents). */
function pathTexture(): THREE.CanvasTexture {
  const tex = paint(128, 512, '#a3825a', 81, (g, w, rand) => {
    const h = 512;
    for (let i = 0; i < 30; i++) blot(g, w, h, rand() * w, rand() * h, 10 + rand() * 30, i % 2 ? 'rgba(125,95,62,0.4)' : 'rgba(190,160,120,0.35)');
    for (let i = 0; i < 220; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(205,195,175,0.85)' : 'rgba(105,90,72,0.7)';
      g.beginPath();
      g.arc(rand() * w, rand() * h, 0.8 + rand() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // bords ébouriffés : on efface au bord, sur une largeur qui ondule (périodique le long du chemin)
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < h; y += 2) {
      const a = (y / h) * Math.PI * 2;
      const l = 8 + 7 * Math.sin(a * 3 + 1) + 5 * Math.sin(a * 7) + rand() * 4;
      const r = 8 + 7 * Math.sin(a * 4 + 2) + 5 * Math.sin(a * 9 + 1) + rand() * 4;
      g.fillRect(0, y, l, 2);
      g.fillRect(w - r, y, r, 2);
    }
    g.globalCompositeOperation = 'source-over';
  });
  return tex;
}

/** Rides de l'eau : petites lignes claires en arc, sur fond noir (on n'en lit que le rouge). */
function rippleTexture(): THREE.CanvasTexture {
  return paint(256, 256, '#000', 91, (g, s, rand) => {
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = rand() * s, y = rand() * s, l = 6 + rand() * 16;
      g.strokeStyle = `rgba(255,255,255,${0.35 + rand() * 0.6})`;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        g.beginPath();
        g.arc(x + dx * s, y + dy * s + l, l, Math.PI * 1.25, Math.PI * 1.75);
        g.stroke();
      }
    }
  }, false);
}

// ---------------------------------------------------------------- cartes du relief

/** Côté (texels) des cartes de hauteur et de sols, sur ±RELIEF_HALF. */
const MAP_SIZE = 256;

/** Hauteurs (pour l'eau : la profondeur) et parts des sols (pour le terrain), en textures. */
function bakeMaps(): { height: THREE.DataTexture; splat: THREE.DataTexture } {
  const n = MAP_SIZE;
  const hData = new Uint16Array(n * n);
  const sData = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * 2 * RELIEF_HALF - RELIEF_HALF;
    const z = ((j + 0.5) / n) * 2 * RELIEF_HALF - RELIEF_HALF;
    const k = j * n + i;
    hData[k] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    const s = splatAt(x, z);
    sData[k * 4] = Math.round(s.sable * 255);
    sData[k * 4 + 1] = Math.round(s.roche * 255);
    sData[k * 4 + 2] = Math.round(s.terre * 255);
    sData[k * 4 + 3] = Math.round(s.pelouse * 255);
  }
  const height = new THREE.DataTexture(hData, n, n, THREE.RedFormat, THREE.HalfFloatType);
  const splat = new THREE.DataTexture(sData, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const t of [height, splat]) {
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
  }
  return { height, splat };
}

/** Grille du relief : la couronne entre le carré plat et le bord, plus un seul quadrilatère au milieu. */
function terrainGeometry(): THREE.BufferGeometry {
  const n = Math.round((2 * RELIEF_HALF) / CELL);
  const pos = new Float32Array((n + 1) * (n + 1) * 3 + 12);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -RELIEF_HALF + i * CELL, z = -RELIEF_HALF + j * CELL;
    const k = (j * (n + 1) + i) * 3;
    pos[k] = x;
    pos[k + 1] = heightAt(x, z);
    pos[k + 2] = z;
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -RELIEF_HALF + (i + 0.5) * CELL, z = -RELIEF_HALF + (j + 0.5) * CELL;
    if (Math.abs(x) < FLAT_HALF && Math.abs(z) < FLAT_HALF) continue;
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    // tout au fond, sous l'eau opaque : rien à dessiner
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -3) continue;
    idx.push(a, c, b, b, c, d);
  }
  // le milieu, plat : un quadrilatère (ses bords tombent sur des sommets de la grille, tous à y = 0)
  const q = (n + 1) * (n + 1);
  pos.set([-FLAT_HALF, 0, -FLAT_HALF, FLAT_HALF, 0, -FLAT_HALF, -FLAT_HALF, 0, FLAT_HALF, FLAT_HALF, 0, FLAT_HALF], q * 3);
  idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- matériaux

/** Réglages partagés par le terrain, les routes et la mer. */
interface IslandUniforms {
  uTime: { value: number };
  uSnow: { value: number };
  uWet: { value: number };
  uRough: { value: number };
  uGrass: { value: THREE.Color };
  uHeight: { value: THREE.Texture };
  uSplat: { value: THREE.Texture };
}

const MAP_GLSL = `
  uniform sampler2D uHeight; uniform sampler2D uSplat;
  uniform float uTime; uniform float uSnow; uniform float uWet; uniform float uRough;
  uniform vec3 uGrass;
  varying vec3 vIleW; varying vec3 vIleN;
  vec2 ileMap(vec2 xz) { return (xz + ${RELIEF_HALF.toFixed(1)}) / ${(2 * RELIEF_HALF).toFixed(1)}; }
`;

/** Ajoute aux shaders la position et la normale dans le monde (vIleW, vIleN). */
function worldVaryings(sh: THREE.WebGLProgramParametersWithUniforms, u: IslandUniforms): void {
  Object.assign(sh.uniforms, u);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vIleW; varying vec3 vIleN;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vIleW = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vIleN = normalize(mat3(modelMatrix) * objectNormal);`,
    );
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${MAP_GLSL}`);
}

function terrainMaterial(u: IslandUniforms): THREE.MeshToonMaterial {
  // ombrage fondu : les paliers nets feraient des bandes sur les pentes de la plage
  const mat = createToonMaterial({ color: 0xffffff, rimStrength: 0, soft: true });
  const tripoGrass = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}ile/herbe.webp`);
  tripoGrass.colorSpace = THREE.SRGBColorSpace;
  tripoGrass.wrapS = tripoGrass.wrapT = THREE.RepeatWrapping;
  tripoGrass.anisotropy = 8;
  const tex = { uTripoGrass: { value: tripoGrass }, uGrassTex: { value: animeGrassTexture() }, uTone: { value: toneTexture() }, uG0: { value: new THREE.Color('#4a9f33') }, uG1: { value: new THREE.Color('#6cc540') }, uG2: { value: new THREE.Color('#a2dc50') }, uLawn: { value: new THREE.Color('#74cc45') }, uSand: { value: sandTexture() }, uRock: { value: rockTexture() }, uDirt: { value: dirtTexture() } };
  mat.onBeforeCompile = (sh) => {
    worldVaryings(sh, u);
    Object.assign(sh.uniforms, tex);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uTripoGrass; uniform sampler2D uGrassTex; uniform sampler2D uTone; uniform vec3 uG0; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uLawn; uniform sampler2D uSand; uniform sampler2D uRock; uniform sampler2D uDirt;')
      .replace(
        '#include <map_fragment>',
        `vec2 xz = vIleW.xz;
         vec4 sp = texture2D(uSplat, ileMap(xz));
         // herbe : la tuile Tripo (3 m), tirée deux fois à des échelles et décalages différents,
         // mêlées par grandes nappes pour que la répétition ne se voie pas
         float tone = texture2D(uTone, xz / 48.0).r * 0.65 + texture2D(uTone, xz / 17.0 + vec2(0.31, 0.77)).r * 0.35;
         vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * xz;
         vec3 g1 = texture2D(uTripoGrass, xz / 3.0).rgb;
         vec3 g2 = texture2D(uTripoGrass, ruv / 3.7 + 0.41).rgb;
         vec3 grass = mix(g1, g2, smoothstep(0.45, 0.55, tone));
         // pelouse tondue : bandes de 1,2 m un peu plus claires et plus foncées
         float stripe = step(0.5, fract((xz.x + xz.y * 0.02) / 2.4));
         grass = mix(grass, grass * mix(0.9, 1.08, stripe), sp.a) * uGrass;
         vec3 sand = texture2D(uSand, xz / 6.0).rgb;
         // sable mouillé près de l'eau
         sand *= mix(1.0, 0.72, smoothstep(${(SEA_LEVEL + 0.35).toFixed(2)}, ${(SEA_LEVEL + 0.02).toFixed(2)}, vIleW.y));
         vec3 dirt = texture2D(uDirt, xz / 4.0).rgb;
         // roche : projetée sur les trois axes (les parois verticales gardent leurs strates)
         vec3 bl = pow(abs(vIleN), vec3(4.0)); bl /= bl.x + bl.y + bl.z;
         vec3 rock = texture2D(uRock, vIleW.zy / 6.0).rgb * bl.x + texture2D(uRock, xz / 6.0 + 0.5).rgb * bl.y + texture2D(uRock, vIleW.xy / 6.0).rgb * bl.z;
         float slope = 1.0 - vIleN.y;
         float rockW = max(sp.g, smoothstep(0.28, 0.45, slope));
         // bords nets mais ébouriffés : la part de chaque sol, bousculée par le grain de l'herbe
         float tuft = (texture2D(uTone, xz / 1.3).r - texture2D(uTone, xz / 3.1 + 0.21).r) * 1.6;
         float sandW = smoothstep(0.4, 0.6, sp.r + tuft) * step(0.02, sp.r);
         float dirtW = smoothstep(0.35, 0.6, sp.b + tuft) * step(0.02, sp.b);
         vec3 col = mix(grass, sand, sandW);
         col = mix(col, dirt, dirtW);
         col = mix(col, rock, rockW);
         // sol mouillé : plus sombre ; neige : l'herbe blanchit d'abord, jamais les parois
         col *= 1.0 - 0.25 * uWet;
         float flat_ = 1.0 - smoothstep(0.3, 0.42, slope);
         float grassL = dot(grass, vec3(0.3, 0.59, 0.11));
         float snowW = uSnow * flat_ * mix(0.7 + grassL * 2.5, 0.85, max(sandW, rockW));
         col = mix(col, vec3(0.8, 0.84, 0.92), clamp(snowW, 0.0, 1.0));
         diffuseColor.rgb *= col;`,
      );
  };
  mat.customProgramCacheKey = () => 'ile-terrain';
  return mat;
}

function wayMaterial(u: IslandUniforms, map: THREE.Texture, cutout: boolean): THREE.MeshToonMaterial {
  const mat = createToonMaterial({ color: 0xffffff, map, rimStrength: 0 });
  if (cutout) mat.alphaTest = 0.5;
  mat.onBeforeCompile = (sh) => {
    worldVaryings(sh, u);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.rgb *= 1.0 - 0.3 * uWet;
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.84, 0.92), clamp(uSnow * 0.85, 0.0, 1.0));`,
    );
  };
  mat.customProgramCacheKey = () => `ile-voie-${cutout}`;
  return mat;
}

function seaMaterial(u: IslandUniforms): THREE.MeshToonMaterial {
  const mat = createToonMaterial({ color: 0xffffff, rimStrength: 0 });
  const tex = { uRipple: { value: rippleTexture() }, uSandSea: { value: sandTexture() } };
  mat.onBeforeCompile = (sh) => {
    worldVaryings(sh, u);
    Object.assign(sh.uniforms, tex);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uRipple; uniform sampler2D uSandSea;')
      .replace(
        '#include <map_fragment>',
        `vec2 xz = vIleW.xz;
         vec2 m = ileMap(xz);
         float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
         float ground = mix(-30.0, texture2D(uHeight, m).r, inside);
         float depth = ${SEA_LEVEL.toFixed(2)} - ground;
         // terre toute proche (pied des rochers et des falaises) : la plus haute des voisines à 0,8 et 1,8 m
         float near1 = -30.0, near2 = -30.0;
         for (int k = 0; k < 8; k++) {
           float a = float(k) * 0.785398;
           vec2 o = vec2(cos(a), sin(a));
           near1 = max(near1, texture2D(uHeight, ileMap(xz + o * 0.8)).r);
           near2 = max(near2, texture2D(uHeight, ileMap(xz + o * 1.8)).r);
         }
         // couleur : turquoise au bord, bleu profond au large ; le sable transparaît au ras de l'eau
         vec3 shallow = vec3(0.30, 0.74, 0.72), mid = vec3(0.10, 0.45, 0.62), deep = vec3(0.05, 0.25, 0.47);
         vec3 col = mix(shallow, mid, smoothstep(0.2, 3.0, depth));
         col = mix(col, deep, smoothstep(3.0, 12.0, depth));
         col = mix(col, col * vec3(0.75, 0.82, 0.9), uRough * 0.6);
         // le fond transparaît au ras de l'eau : du sable côté plage, de la roche ailleurs
         vec3 bed = mix(vec3(0.32, 0.42, 0.4), texture2D(uSandSea, xz / 6.0).rgb * vec3(0.62, 0.84, 0.8), texture2D(uSplat, m).r);
         col = mix(bed, col, smoothstep(0.0, 0.4, depth));
         // rides qui glissent (deux couches croisées)
         float rip = texture2D(uRipple, xz / 9.0 + vec2(uTime * 0.012, uTime * 0.007)).r * texture2D(uRipple, xz / 13.0 + vec2(-uTime * 0.009, uTime * 0.011)).r;
         col += vec3(0.75, 0.9, 1.0) * smoothstep(0.15, 0.5, rip) * 0.22 * (0.6 + uRough);
         // vagues qui arrivent sur la plage : des lignes d'écume qui avancent vers le bord
         float wob = texture2D(uRipple, xz / 40.0).r;
         float phase = depth * 3.0 - uTime * 0.55 + wob * 1.2;
         float band = smoothstep(0.93, 0.98, sin(phase) * 0.5 + 0.5) * (1.0 - smoothstep(0.15, 0.8 + uRough * 0.6, depth));
         band *= smoothstep(0.3, 0.6, texture2D(uRipple, xz / 17.0 + vec2(0.3, uTime * 0.004)).r + 0.3);
         // écume du rivage, qui monte et descend sur le sable
         float lap = 0.04 + 0.04 * sin(uTime * 0.8 + wob * 6.0);
         float shore = 1.0 - smoothstep(lap, lap + 0.04, depth);
         // écume au pied des rochers (pente raide : le bord est loin en profondeur mais près en distance)
         float land1 = smoothstep(${(SEA_LEVEL - 0.3).toFixed(2)}, ${(SEA_LEVEL + 0.3).toFixed(2)}, near1);
         float land2 = smoothstep(${(SEA_LEVEL - 0.3).toFixed(2)}, ${(SEA_LEVEL + 0.3).toFixed(2)}, near2);
         float rocks = max(land1, land2 * (0.35 + 0.25 * uRough)) * smoothstep(0.25, 0.8, depth) * inside;
         rocks *= 0.65 + 0.35 * sin(uTime * 1.3 + wob * 9.0 + xz.x * 0.4);
         float foam = max(max(band * 0.85, shore), rocks);
         foam *= mix(0.55, 1.0, texture2D(uRipple, xz / 4.0 + uTime * 0.01).r);
         col = mix(col, vec3(0.94, 0.97, 1.0), clamp(foam, 0.0, 1.0));
         diffuseColor.rgb *= col;`,
      );
  };
  mat.customProgramCacheKey = () => 'ile-mer';
  return mat;
}

// ---------------------------------------------------------------- l'île

export interface Island {
  root: THREE.Group;
  /** Avance l'eau (dt en s) ; `rough` : mer agitée (0 à 1, pluie et vent). */
  update(dt: number, rough: number): void;
  /** Teinte de l'herbe, part de neige (0 à 1), sol mouillé (0 à 1). */
  setSeason(grass: [number, number, number], snow: number, wet: number): void;
}

export function createIsland(): Island {
  const { height, splat } = bakeMaps();
  const u: IslandUniforms = {
    uTime: { value: 0 },
    uSnow: { value: 0 },
    uWet: { value: 0 },
    uRough: { value: 0 },
    uGrass: { value: new THREE.Color(1, 1, 1) },
    uHeight: { value: height },
    uSplat: { value: splat },
  };
  const root = new THREE.Group();
  root.name = 'ile';

  const terrain = new THREE.Mesh(terrainGeometry(), terrainMaterial(u));
  terrain.name = 'terrain';
  terrain.receiveShadow = true;
  root.add(terrain);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), seaMaterial(u));
  sea.position.y = SEA_LEVEL;
  sea.name = 'mer';
  root.add(sea);

  const road = asphaltTexture(true), lane = asphaltTexture(false), path = pathTexture();
  for (const w of WAYS) {
    const map = w.kind === 'route' ? road : w.kind === 'allee' ? lane : path;
    const mesh = new THREE.Mesh(wayGeometry(w, w.kind === 'chemin' ? w.width * 4 : w.width * 2), wayMaterial(u, map, w.kind === 'chemin'));
    mesh.name = w.kind;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  let rough = 0;
  return {
    root,
    update(dt, r) {
      u.uTime.value = (u.uTime.value + dt) % 10000;
      rough += (r - rough) * Math.min(1, dt * 0.5);
      u.uRough.value = rough;
    },
    setSeason(grass, snow, wet) {
      u.uGrass.value.setRGB(grass[0], grass[1], grass[2]);
      u.uSnow.value = snow;
      u.uWet.value = wet;
    },
  };
}
