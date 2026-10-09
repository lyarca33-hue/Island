/**
 * Ombres cuites dans la texture d'un modèle Tripo, éclaircies. Le modèle est livré avec son
 * éclairage peint dans la texture : l'abattant des toilettes, modélisé relevé contre le réservoir,
 * y garde une ombre qui se voit une fois rabattu, comme celle qu'il faisait sur le réservoir. Dans
 * une zone (boîte du repère du modèle), chaque texel est remonté vers la luminosité voulue, d'après
 * la moyenne de la texture autour de lui (le détail reste), fondu au bord de la boîte.
 */
import * as THREE from 'three';

type V3 = [number, number, number];

/** Une zone à éclaircir : la boîte, la luminosité visée (0-255), le fondu au bord (m) ; `part` : cette pièce mobile seulement. */
export interface ShadeZone {
  part?: string;
  min: V3;
  max: V3;
  to: number;
  feather?: number;
}

/** Rayon (texels) de la moyenne locale ; gain le plus fort. */
const BLUR = 10;
const MAX_GAIN = 2.2;
/** Part du grain adoucie là où la texture est le plus éclaircie. */
const SMOOTH = 0.6;

/**
 * Le matériau avec une copie éclaircie de sa texture. `zoned` : les géométries (repère du modèle,
 * avec leurs coordonnées de texture) et leurs zones ; `all` : toutes celles du modèle (où la texture
 * sert, pour que la moyenne ignore le fond). Sans image lisible (tests), rend le matériau tel quel.
 */
export function unshadeMaterial(material: THREE.Material, zoned: Array<{ g: THREE.BufferGeometry; zones: ShadeZone[] }>, all: THREE.BufferGeometry[]): THREE.Material {
  const map = (material as THREE.MeshToonMaterial).map;
  const img = map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!map || !img || typeof document === 'undefined') return material;
  const w = img.width, h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return material;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // où la texture sert, et le poids de la zone (et sa luminosité visée) par texel
  const used = new Float32Array(w * h);
  for (const g of all) raster(g, w, h, () => 1, (k) => (used[k] = 1));
  const weight = new Float32Array(w * h);
  const target = new Float32Array(w * h);
  for (const { g, zones } of zoned) {
    for (const zone of zones) {
      const f = zone.feather ?? 0.03;
      const inside = (v: number, a: number, b: number) => THREE.MathUtils.smoothstep(Math.min(v - a, b - v), -f, 0);
      raster(
        g,
        w,
        h,
        (x, y, z) => inside(x, zone.min[0], zone.max[0]) * inside(y, zone.min[1], zone.max[1]) * inside(z, zone.min[2], zone.max[2]),
        (k, v) => {
          if (v <= weight[k]) return;
          weight[k] = v;
          target[k] = zone.to;
        },
      );
    }
  }

  // moyenne locale de la couleur, sur les seuls texels utilisés (images intégrales)
  const W = w + 1;
  const sums = [0, 1, 2, 3].map(() => new Float64Array(W * (h + 1)));
  const row = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    row.fill(0);
    for (let x = 0; x < w; x++) {
      const k = y * w + x, u = used[k];
      for (let c = 0; c < 4; c++) {
        row[c] += c < 3 ? px[k * 4 + c] * u : u;
        sums[c][(y + 1) * W + x + 1] = sums[c][y * W + x + 1] + row[c];
      }
    }
  }
  const box = (s: Float64Array, x0: number, y0: number, x1: number, y1: number) => s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
  const mean = [0, 0, 0];
  let changed = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x, a = weight[k];
      if (a <= 0) continue;
      const x0 = Math.max(0, x - BLUR), x1 = Math.min(w, x + BLUR + 1), y0 = Math.max(0, y - BLUR), y1 = Math.min(h, y + BLUR + 1);
      const n = box(sums[3], x0, y0, x1, y1);
      if (n < 1) continue;
      for (let c = 0; c < 3; c++) mean[c] = box(sums[c], x0, y0, x1, y1) / n;
      const luma = (mean[0] + mean[1] + mean[2]) / 3;
      const gain = 1 + (THREE.MathUtils.clamp(target[k] / Math.max(1, luma), 1, MAX_GAIN) - 1) * a;
      if (gain <= 1.001) continue;
      // éclairci, le grain de la texture grossirait d'autant : il est adouci vers la moyenne
      const smooth = SMOOTH * a * Math.min(1, (gain - 1) * 2);
      for (let c = 0; c < 3; c++) px[k * 4 + c] = Math.min(255, THREE.MathUtils.lerp(px[k * 4 + c], mean[c], smooth) * gain);
      changed = true;
    }
  }
  if (!changed) return material;
  ctx.putImageData(data, 0, 0);
  const tex = map.clone();
  tex.image = canvas;
  tex.needsUpdate = true;
  const out = material.clone();
  out.userData = { ...material.userData };
  (out as THREE.MeshToonMaterial).map = tex;
  return out;
}

/**
 * Parcourt les texels couverts par les triangles de `g` (géométrie sans index) : `value` donne une
 * valeur par sommet (sa position), interpolée ; `put(texel, valeur)`.
 */
function raster(g: THREE.BufferGeometry, w: number, h: number, value: (x: number, y: number, z: number) => number, put: (k: number, v: number) => void): void {
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  if (!uv) return;
  const U = [0, 0, 0], V = [0, 0, 0], S = [0, 0, 0];
  for (let t = 0; t + 2 < p.count; t += 3) {
    let any = false;
    for (let j = 0; j < 3; j++) {
      const i = t + j;
      U[j] = (uv.getX(i) - Math.floor(uv.getX(t))) * w;
      V[j] = (uv.getY(i) - Math.floor(uv.getY(t))) * h;
      S[j] = value(p.getX(i), p.getY(i), p.getZ(i));
      if (S[j] > 0) any = true;
    }
    if (!any) continue;
    const det = (V[1] - V[2]) * (U[0] - U[2]) + (U[2] - U[1]) * (V[0] - V[2]);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...U)) - 1), x1 = Math.min(w - 1, Math.ceil(Math.max(...U)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...V)) - 1), y1 = Math.min(h - 1, Math.ceil(Math.max(...V)) + 1);
    // un demi-texel de marge : les bords des triangles sont couverts
    const e = 1.5 / Math.max(1, Math.sqrt(Math.abs(det)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const a = ((V[1] - V[2]) * (cx - U[2]) + (U[2] - U[1]) * (cy - V[2])) / det;
        const b = ((V[2] - V[0]) * (cx - U[2]) + (U[0] - U[2]) * (cy - V[2])) / det;
        const c = 1 - a - b;
        if (a < -e || b < -e || c < -e) continue;
        const v = Math.max(0, a) * S[0] + Math.max(0, b) * S[1] + Math.max(0, c) * S[2];
        if (v > 0) put(y * w + x, v);
      }
    }
  }
}
