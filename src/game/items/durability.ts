/**
 * Durabilité des objets : une jauge (points, maximum donné par la fiche) qui baisse à l'usage
 * (boire, lire, pousser un meuble, faire un café…) et sur les chocs. À zéro, l'objet se brise.
 *
 * Plus elle baisse, plus l'objet paraît usé : couleurs ternies et assombries, taches et rayures,
 * bords plus sombres (texture « d'usure » posée sur ses pièces).
 */
import * as THREE from 'three';

/** Grades d'usure, du meilleur au pire : à partir de quelle part de la jauge (0 à 1). */
export const GRADES = [
  { min: 0.9, name: 'neuf', fem: 'neuve' },
  { min: 0.65, name: 'bon état', fem: 'bon état' },
  { min: 0.4, name: 'usé', fem: 'usée' },
  { min: 0.15, name: 'abîmé', fem: 'abîmée' },
  { min: 0, name: 'très abîmé', fem: 'très abîmée' },
] as const;

/** Rang du grade (0 neuf … 4 très abîmé) pour une jauge de 0 à 1. */
export function gradeIndex(ratio: number): number {
  const i = GRADES.findIndex((g) => ratio >= g.min);
  return i < 0 ? GRADES.length - 1 : i;
}

/** Nom du grade (accordé si le nom de l'objet est féminin). */
export function gradeName(ratio: number, feminine = false): string {
  const g = GRADES[gradeIndex(ratio)];
  return feminine ? g.fem : g.name;
}

/** Pièces qui ne s'usent pas (le café, le jet de la machine). */
const NO_WEAR = new Set(['liquide', 'jet']);

const textures: Array<THREE.CanvasTexture | null> = [];

/** Petit générateur pseudo-aléatoire fixe : la même texture d'une partie à l'autre. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Texture d'usure du grade `level` (1 à 4) : blanche (couleur d'origine) avec des bords
 * assombris, des taches et des rayures, de plus en plus marqués. Elle multiplie la couleur.
 */
function wearTexture(level: number): THREE.CanvasTexture | null {
  if (level <= 0) return null;
  if (textures[level]) return textures[level];
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const rand = rng(17 + level * 31);
  const k = level / 4;
  // bords et coins assombris (chaque face d'une boîte a toute la texture)
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  edge.addColorStop(0, 'rgba(70,50,30,0)');
  edge.addColorStop(1, `rgba(70,50,30,${0.08 + 0.32 * k})`);
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
  // taches
  for (let i = 0; i < 6 + level * 10; i++) {
    const x = rand() * S, y = rand() * S, r = 3 + rand() * (6 + level * 4);
    const spot = g.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, `rgba(60,42,25,${0.06 + 0.24 * k * rand()})`);
    spot.addColorStop(1, 'rgba(60,42,25,0)');
    g.fillStyle = spot;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // rayures, claires (matière à nu) et sombres
  g.lineCap = 'round';
  for (let i = 0; i < level * level * 3; i++) {
    const x = rand() * S, y = rand() * S, a = rand() * Math.PI, len = 6 + rand() * (10 + level * 6);
    g.strokeStyle = rand() < 0.5 ? `rgba(255,250,235,${0.5 + 0.4 * k})` : `rgba(40,28,18,${0.25 + 0.35 * k})`;
    g.lineWidth = 0.6 + rand() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  textures[level] = tex;
  return tex;
}

const hsl = { h: 0, s: 0, l: 0 };

/**
 * Montre l'usure de l'objet (jauge `ratio` de 0 à 1) : couleurs ternies et assombries, et la
 * texture d'usure de son grade sur chaque pièce (cachées comprises : le livre ouvert).
 */
export function showWear(root: THREE.Object3D, ratio: number): void {
  const w = 1 - THREE.MathUtils.clamp(ratio, 0, 1);
  const map = wearTexture(gradeIndex(ratio));
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || NO_WEAR.has(mesh.name)) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const m = mat as THREE.MeshToonMaterial;
      if (!m.color) continue;
      const base: THREE.Color = (m.userData.baseColor ??= m.color.clone());
      base.getHSL(hsl);
      m.color.setHSL(hsl.h, hsl.s * (1 - 0.5 * w), hsl.l * (1 - 0.2 * w));
      if (m.map !== map) {
        m.map = map;
        m.needsUpdate = true;
      }
    }
  });
}
