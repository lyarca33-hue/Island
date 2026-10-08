/**
 * Détails peints dans les textures du perso : maquillage et dessins sur le visage (joues roses,
 * taches de rousseur, moustaches de chat...) et motifs des vêtements (rayures, pois, vichy...).
 *
 * Les visages VRoid partagent la même disposition de texture (visage de face au centre, yeux
 * vers 56 % de la hauteur, bouche vers 75 %) : un dessin placé en coordonnées de texture tombe
 * au même endroit sur tous les visages. Les motifs sont dessinés dans l'espace de la texture du
 * vêtement : ils suivent ses coutures comme un tissu imprimé.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ visage */

export interface FaceMark {
  id: string;
  label: string;
  /** Prend la « couleur des dessins » choisie (sinon couleur propre). */
  tinted: boolean;
  /** Dessine sur un canevas de côté 1 (coordonnées de texture, origine en haut à gauche). */
  draw(ctx: CanvasRenderingContext2D, color: string): void;
}

/** Repères de la texture du visage VRoid (côté 1). */
const EYE_Y = 0.56, EYE_X = 0.15, CHEEK_Y = 0.665, CHEEK_X = 0.16, MOUTH_Y = 0.75;

/** Composantes 0-255 d'une couleur « #rrggbb » (espace sRGB, celui des pixels du canevas). */
function srgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
}

/** Petit générateur pseudo-aléatoire : les taches de rousseur restent les mêmes d'une fois à l'autre. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const FACE_MARKS: FaceMark[] = [
  {
    id: 'rousseur', label: 'Taches de rousseur', tinted: false,
    draw(ctx) {
      const rnd = seeded(7);
      ctx.fillStyle = 'rgba(160, 92, 58, 0.45)';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 18; i++) {
          const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
          dot(ctx, 0.5 + s * (CHEEK_X - 0.02) + Math.cos(a) * d * 0.075, CHEEK_Y - 0.02 + Math.sin(a) * d * 0.03, 0.0025 + rnd() * 0.002);
        }
      }
      // quelques-unes sur le nez
      for (let i = 0; i < 8; i++) dot(ctx, 0.5 + (rnd() - 0.5) * 0.07, 0.635 + rnd() * 0.03, 0.0022 + rnd() * 0.0015);
    },
  },
  {
    id: 'grain', label: 'Grain de beauté', tinted: false,
    draw(ctx) {
      ctx.fillStyle = 'rgba(70, 40, 30, 0.9)';
      dot(ctx, 0.5 + 0.065, MOUTH_Y - 0.012, 0.006);
    },
  },
  {
    id: 'pansement', label: 'Pansement', tinted: false,
    draw(ctx) {
      ctx.save();
      ctx.translate(0.5 - CHEEK_X - 0.01, CHEEK_Y - 0.005);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#f0d2ae';
      ctx.fillRect(-0.05, -0.014, 0.1, 0.028);
      ctx.fillStyle = '#e2b88f';
      ctx.fillRect(-0.016, -0.014, 0.032, 0.028);
      ctx.fillStyle = 'rgba(160, 110, 80, 0.5)';
      for (const x of [-0.035, -0.025, 0.025, 0.035]) for (const y of [-0.006, 0.006]) dot(ctx, x, y, 0.0018);
      ctx.restore();
    },
  },
  {
    id: 'rougeur-nez', label: 'Nez rouge', tinted: false,
    draw(ctx) {
      const g = ctx.createRadialGradient(0.5, 0.645, 0, 0.5, 0.645, 0.035);
      g.addColorStop(0, 'rgba(230, 90, 90, 0.55)');
      g.addColorStop(1, 'rgba(230, 90, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0.45, 0.6, 0.1, 0.1);
    },
  },
  {
    id: 'barbe', label: 'Barbe naissante', tinted: false,
    draw(ctx) {
      const rnd = seeded(11);
      ctx.fillStyle = 'rgba(60, 50, 50, 0.2)';
      for (let i = 0; i < 1100; i++) {
        const x = 0.5 + (rnd() - 0.5) * 0.36;
        const y = 0.7 + rnd() * 0.16;
        // menton et mâchoire, pas les joues ni les lèvres
        const dx = (x - 0.5) / 0.18, dy = (y - 0.86) / 0.17;
        if (dx * dx + dy * dy > 1 || (Math.abs(x - 0.5) < 0.05 && Math.abs(y - MOUTH_Y) < 0.012)) continue;
        if (y < 0.725 && Math.abs(x - 0.5) > 0.06) continue;
        dot(ctx, x, y, 0.0018);
      }
    },
  },
  {
    id: 'moustache', label: 'Moustache', tinted: true,
    draw(ctx, c) {
      ctx.fillStyle = c;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0.5, 0.715);
        ctx.quadraticCurveTo(0.5 + s * 0.04, 0.7, 0.5 + s * 0.075, 0.735);
        ctx.quadraticCurveTo(0.5 + s * 0.04, 0.722, 0.5, 0.728);
        ctx.fill();
      }
    },
  },
  {
    id: 'chat', label: 'Moustaches de chat', tinted: true,
    draw(ctx, c) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.006;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        for (const k of [-1, 0, 1]) {
          ctx.beginPath();
          ctx.moveTo(0.5 + s * 0.09, CHEEK_Y + 0.01 + k * 0.012);
          ctx.lineTo(0.5 + s * 0.2, CHEEK_Y + 0.01 + k * 0.026);
          ctx.stroke();
        }
      }
      ctx.fillStyle = c;
      dot(ctx, 0.5, 0.65, 0.012);
    },
  },
  {
    id: 'etoile', label: 'Étoile', tinted: true,
    draw(ctx, c) {
      ctx.fillStyle = c;
      star(ctx, 0.5 + EYE_X + 0.03, EYE_Y + 0.085, 0.022);
    },
  },
  {
    id: 'coeur', label: 'Cœur', tinted: true,
    draw(ctx, c) {
      ctx.fillStyle = c;
      heart(ctx, 0.5 - CHEEK_X, CHEEK_Y, 0.02);
    },
  },
  {
    id: 'larme', label: 'Larme', tinted: true,
    draw(ctx, c) {
      ctx.fillStyle = c;
      const x = 0.5 + EYE_X - 0.01, y = EYE_Y + 0.07;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.022);
      ctx.quadraticCurveTo(x + 0.014, y, x, y + 0.01);
      ctx.quadraticCurveTo(x - 0.014, y, x, y - 0.022);
      ctx.fill();
    },
  },
  {
    id: 'traits', label: 'Peinture de guerre', tinted: true,
    draw(ctx, c) {
      ctx.fillStyle = c;
      for (const s of [-1, 1]) for (const k of [0, 1]) ctx.fillRect(0.5 + s * CHEEK_X - 0.04, CHEEK_Y - 0.02 + k * 0.03, 0.08, 0.012);
    },
  },
  {
    id: 'cicatrice', label: 'Cicatrice', tinted: false,
    draw(ctx) {
      ctx.strokeStyle = 'rgba(170, 90, 80, 0.75)';
      ctx.lineWidth = 0.006;
      ctx.lineCap = 'round';
      const x = 0.5 - EYE_X;
      ctx.beginPath();
      ctx.moveTo(x + 0.02, EYE_Y - 0.09);
      ctx.lineTo(x - 0.015, EYE_Y - 0.035);
      ctx.moveTo(x + 0.012, EYE_Y + 0.035);
      ctx.lineTo(x - 0.008, EYE_Y + 0.07);
      ctx.stroke();
    },
  },
  {
    id: 'cernes', label: 'Cernes', tinted: false,
    draw(ctx) {
      for (const s of [-1, 1]) {
        const x = 0.5 + s * EYE_X, y = EYE_Y + 0.045;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 0.05);
        g.addColorStop(0, 'rgba(110, 80, 120, 0.45)');
        g.addColorStop(1, 'rgba(110, 80, 120, 0)');
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1.3, 0.45);
        ctx.translate(-x, -y);
        ctx.fillRect(x - 0.06, y - 0.06, 0.12, 0.12);
        ctx.restore();
      }
    },
  },
  {
    id: 'paillettes', label: 'Paillettes', tinted: true,
    draw(ctx, c) {
      const rnd = seeded(23);
      ctx.fillStyle = c;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x = 0.5 + s * (EYE_X + 0.06 + rnd() * 0.035), y = EYE_Y - 0.02 + rnd() * 0.07;
          if (i % 3 === 0) star(ctx, x, y, 0.009);
          else dot(ctx, x, y, 0.0035);
        }
      }
    },
  },
  {
    id: 'fleur', label: 'Fleur', tinted: true,
    draw(ctx, c) {
      const x = 0.5 + CHEEK_X + 0.01, y = CHEEK_Y + 0.005;
      ctx.fillStyle = c;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        dot(ctx, x + Math.cos(a) * 0.012, y + Math.sin(a) * 0.012, 0.009);
      }
      ctx.fillStyle = '#f2d06b';
      dot(ctx, x, y, 0.006);
    },
  },
  {
    id: 'lune', label: 'Lune sur le front', tinted: true,
    draw(ctx, c) {
      const x = 0.5, y = 0.43;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 0.022, 0, Math.PI * 2);
      ctx.arc(x + 0.011, y - 0.006, 0.019, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    },
  },
];

export const FACE_MARK_BY_ID = new Map(FACE_MARKS.map((m) => [m.id, m]));

/** Couleurs des joues et des dessins du visage. */
export const BLUSH_COLORS = ['#ff9aa8', '#ff7f7f', '#f7a072', '#e58bb0', '#c86b9a', '#d9775e'];
export const MARK_COLORS = ['#1d1a22', '#7a4a33', '#c2413a', '#e58bb0', '#e9c27a', '#3e78c9', '#3c9c78', '#6c4ab8', '#f4efe6'];
/** Sourcils et cils (sinon couleur d'origine). */
/** Fard à paupières et rouge à lèvres. */
export const SHADOW_COLORS = ['#c88a9e', '#b06a5a', '#d9a35b', '#8a6bc0', '#5a8fd0', '#4fa08a', '#7a5a4a', '#3a3040'];
export const LIP_COLORS = ['#e07a86', '#c2413a', '#9c2a3a', '#e58bb0', '#d98b6a', '#b05a8a', '#6c4ab8', '#3a2030'];
export const BROW_COLORS = ['#1d1a22', '#3b2a22', '#6b4429', '#a8743f', '#e3c27a', '#f1ece2', '#9aa3b5', '#c2413a', '#e58bb0', '#6c4ab8', '#3e78c9'];

export interface Makeup {
  /** Joues roses (null = aucune). */
  blush: string | null;
  brows: string | null;
  lashes: string | null;
  /** Fard à paupières (null = aucun). */
  shadow: string | null;
  /** Rouge à lèvres (null = aucun). */
  lips: string | null;
  /** Dessins portés (ids de FACE_MARKS). */
  marks: string[];
  markColor: string;
}

export const NO_MAKEUP: Makeup = { blush: null, brows: null, lashes: null, shadow: null, lips: null, marks: [], markColor: '#1d1a22' };

/** Tache de couleur douce, ellipse étirée (rx, ry) autour de (x, y). */
function softSpot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, hex: string, alpha: number) {
  const rgb = srgb(hex).join(', ');
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.6, `rgba(${rgb}, ${alpha / 2})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
}

const faceCache = new Map<string, THREE.Texture>();

/** Texture du visage avec joues et dessins ; null = rien à peindre (texture d'origine). */
export function paintedFace(tex: THREE.Texture, m: Makeup | undefined): THREE.Texture | null {
  if (!m || (!m.blush && !m.shadow && !m.lips && !m.marks.length)) return null;
  const key = `${tex.uuid}|${m.blush}|${m.shadow}|${m.lips}|${m.marks.join(',')}|${m.markColor}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.save();
  // les textures glTF ne sont pas retournées : (0, 0) en haut à gauche, comme le canevas
  ctx.scale(canvas.width, canvas.height);
  for (const s of [-1, 1]) {
    if (m.blush) softSpot(ctx, 0.5 + s * CHEEK_X, CHEEK_Y, 0.075, 0.045, m.blush, 0.6);
    // fard : au-dessus de l'œil, la paupière (le globe de l'œil cache le bas)
    if (m.shadow) softSpot(ctx, 0.5 + s * (EYE_X + 0.008), EYE_Y - 0.022, 0.075, 0.042, m.shadow, 0.75);
  }
  if (m.lips) {
    const [r, g, b] = srgb(m.lips);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
    const y = MOUTH_Y;
    ctx.beginPath();
    ctx.moveTo(0.5 - 0.038, y);
    ctx.quadraticCurveTo(0.5 - 0.02, y - 0.016, 0.5, y - 0.008);
    ctx.quadraticCurveTo(0.5 + 0.02, y - 0.016, 0.5 + 0.038, y);
    ctx.quadraticCurveTo(0.5, y + 0.024, 0.5 - 0.038, y);
    ctx.fill();
  }
  for (const id of m.marks) FACE_MARK_BY_ID.get(id)?.draw(ctx, m.markColor);
  ctx.restore();
  const out = tex.clone();
  out.image = canvas;
  out.needsUpdate = true;
  remember(faceCache, key, out);
  return out;
}

/* ------------------------------------------------------------------ vêtements */

export interface Pattern {
  id: string;
  label: string;
  /** Dessine le motif en blanc (opacité = couverture) sur un carré de côté `p` répété. */
  tile(ctx: CanvasRenderingContext2D, p: number): void;
}

export const PATTERNS: Pattern[] = [
  {
    id: 'rayures', label: 'Rayures',
    tile(ctx, p) {
      ctx.fillRect(0, 0, p, p * 0.4);
    },
  },
  {
    id: 'marin', label: 'Marinière',
    tile(ctx, p) {
      ctx.fillRect(0, 0, p, p * 0.2);
    },
  },
  {
    id: 'pois', label: 'Pois',
    tile(ctx, p) {
      dot(ctx, p * 0.25, p * 0.25, p * 0.14);
      dot(ctx, p * 0.75, p * 0.75, p * 0.14);
    },
  },
  {
    id: 'vichy', label: 'Vichy',
    tile(ctx, p) {
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, p, p / 2);
      ctx.fillRect(0, 0, p / 2, p);
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'ecossais', label: 'Écossais',
    tile(ctx, p) {
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, p * 0.1, p, p * 0.3);
      ctx.fillRect(p * 0.1, 0, p * 0.3, p);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, p * 0.7, p, p * 0.05);
      ctx.fillRect(p * 0.7, 0, p * 0.05, p);
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'etoiles', label: 'Étoiles',
    tile(ctx, p) {
      star(ctx, p * 0.25, p * 0.3, p * 0.17);
      star(ctx, p * 0.75, p * 0.8, p * 0.12);
    },
  },
  {
    id: 'coeurs', label: 'Cœurs',
    tile(ctx, p) {
      heart(ctx, p * 0.25, p * 0.28, p * 0.14);
      heart(ctx, p * 0.75, p * 0.78, p * 0.14);
    },
  },
  {
    id: 'fleurs', label: 'Fleurs',
    tile(ctx, p) {
      for (const [x, y, r] of [[0.28, 0.3, 0.1], [0.76, 0.76, 0.08]]) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          dot(ctx, p * (x + Math.cos(a) * r), p * (y + Math.sin(a) * r), p * r * 0.75);
        }
      }
    },
  },
  {
    id: 'damier', label: 'Damier',
    tile(ctx, p) {
      ctx.fillRect(0, 0, p / 2, p / 2);
      ctx.fillRect(p / 2, p / 2, p / 2, p / 2);
    },
  },
  {
    id: 'losanges', label: 'Losanges',
    tile(ctx, p) {
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(p / 2, 0);
      ctx.lineTo(p, p / 2);
      ctx.lineTo(p / 2, p);
      ctx.lineTo(0, p / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'zigzag', label: 'Zigzag',
    tile(ctx, p) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = p * 0.16;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-p * 0.25, p * 0.55);
      ctx.lineTo(0, p * 0.3);
      ctx.lineTo(p / 2, p * 0.7);
      ctx.lineTo(p, p * 0.3);
      ctx.lineTo(p * 1.25, p * 0.55);
      ctx.stroke();
    },
  },
  {
    id: 'leopard', label: 'Léopard',
    tile(ctx, p) {
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.lineWidth = p * 0.07;
      const rnd = seeded(5);
      // taches en anneaux ouverts, gardées loin des bords (le motif se répète)
      for (const [x, y] of [[0.25, 0.25], [0.72, 0.3], [0.3, 0.72], [0.75, 0.78]]) {
        const a = rnd() * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(p * x, p * y, p * 0.1, p * 0.075, a, 0.3, Math.PI * 2 - 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p * (x + 0.01), p * y, p * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
];

export const PATTERN_BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));

export interface WornPattern {
  id: string;
  color: string;
}

const clothCache = new Map<string, THREE.Texture>();

/** Garde peu de textures peintes en mémoire (chacune peut peser 16 Mo en 2048²). */
function remember(cache: Map<string, THREE.Texture>, key: string, tex: THREE.Texture) {
  cache.set(key, tex);
  while (cache.size > 6) {
    const [k, old] = cache.entries().next().value!;
    cache.delete(k);
    old.dispose();
  }
}

/**
 * Tissu imprimé : la texture d'origine (teinte `base` en niveaux de gris si choisie) recouverte
 * du motif dans la couleur `p.color`, qui garde les plis et les ombres peintes du tissu.
 */
export function patternedCloth(tex: THREE.Texture, base: string | null, p: WornPattern): THREE.Texture {
  const key = `${tex.uuid}|${base}|${p.id}|${p.color}`;
  const hit = clothCache.get(key);
  if (hit) return hit;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const w = img.width, h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  // motif répété sur toute la texture
  const period = Math.max(16, Math.round(w / 32));
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = period;
  const tctx = tileCanvas.getContext('2d')!;
  tctx.fillStyle = '#fff';
  PATTERN_BY_ID.get(p.id)?.tile(tctx, period);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  mctx.fillStyle = mctx.createPattern(tileCanvas, 'repeat')!;
  mctx.fillRect(0, 0, w, h);
  const mask = mctx.getImageData(0, 0, w, h).data;
  const px = data.data;
  // luminosité moyenne du tissu : le gris est ramené vers 200 pour que les teintes ressortent
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    n++;
  }
  const k = n ? 200 / Math.max(20, sum / n) / 255 : 1 / 255;
  const b = base ? srgb(base) : null;
  const c = srgb(p.color);
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.min(1, (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * k);
    let r = px[i], g = px[i + 1], bl = px[i + 2];
    if (b) (r = l * b[0]), (g = l * b[1]), (bl = l * b[2]);
    const a = mask[i + 3] / 255;
    if (a > 0) {
      r += (l * c[0] - r) * a;
      g += (l * c[1] - g) * a;
      bl += (l * c[2] - bl) * a;
    }
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = bl;
  }
  ctx.putImageData(data, 0, 0);
  const out = tex.clone();
  out.image = canvas;
  out.needsUpdate = true;
  remember(clothCache, key, out);
  return out;
}
