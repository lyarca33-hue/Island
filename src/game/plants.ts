/**
 * Les plantes du jeu, en formes douces plutôt qu'en cubes et en cônes : feuillages touffus
 * (arbres, buissons, pieds de tomates), vraies feuilles (plantes d'intérieur, fleurs, légumes),
 * têtes de fleurs à pétales, sapins à étages, pots tournés.
 *
 * Tout est fait par programme pour le jeu (aucun fichier tiers) et pensé léger : chaque plante
 * est fusionnée en une ou deux géométries (une image de plus à dessiner par plante, pas une par
 * feuille), et les feuilles portent leur couleur dans leurs sommets pour partager un même
 * matériau.
 *
 * Feuillage touffu : des « cartes » (carrés) couvertes d'une texture de feuilles peinte au
 * canevas, découpées par transparence, autour d'un cœur plein. Leurs normales partent du milieu
 * de la couronne : l'ombrage reste rond et doux comme une boule, la silhouette est feuillue.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from './toon';

/** Petit générateur pseudo-aléatoire déterministe (mêmes plantes à chaque lancement). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ——— textures peintes ———

/**
 * Les textures de feuillage sont en deux moitiés : à gauche une grappe sur fond transparent (les
 * cartes), à droite un tapis de feuilles plein (le cœur).
 */
const HALF = 0.5;

const textures = new Map<string, THREE.CanvasTexture>();

/**
 * Texture d'une grappe de feuilles (`leaves`) ou de fleurs (`blossoms`), en gris sur fond
 * transparent : la couleur du matériau la teinte (vert tendre, roux, rose...).
 */
function clusterTexture(kind: 'leaves' | 'blossoms'): THREE.CanvasTexture {
  const cached = textures.get(kind);
  if (cached) return cached;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S;
  const g = c.getContext('2d')!;
  const rand = rng(kind === 'leaves' ? 41 : 77);
  const gray = (v: number) => `rgb(${v},${v},${v})`;
  /** Une feuille pointue en (x, y), tournée de `rot`, nervure plus sombre. */
  const leaf = (x: number, y: number, len: number, rot: number, v: number) => {
    const w = len * 0.42;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = gray(v);
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.quadraticCurveTo(w, 0, 0, len / 2);
    g.quadraticCurveTo(-w, 0, 0, -len / 2);
    g.fill();
    g.strokeStyle = gray(Math.round(v * 0.78));
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.lineTo(0, len / 2);
    g.stroke();
    g.restore();
  };
  // à droite, le tapis plein du cœur : fond plus sombre (l'ombre sous les feuilles), feuilles serrées
  g.save();
  g.beginPath();
  g.rect(S, 0, S, S);
  g.clip();
  g.fillStyle = gray(kind === 'leaves' ? 150 : 235);
  g.fillRect(S, 0, S, S);
  if (kind === 'leaves') for (let i = 0; i < 150; i++) leaf(S + rand() * S, rand() * S, S * (0.1 + rand() * 0.06), rand() * Math.PI * 2, Math.round(165 + rand() * 80));
  g.restore();
  if (kind === 'leaves') {
    // des feuilles pointues en éventail, plus denses au milieu, nervure plus sombre
    for (let i = 0; i < 64; i++) {
      const a = rand() * Math.PI * 2, d = Math.pow(rand(), 0.8) * S * 0.3;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      leaf(x, y, S * (0.11 + rand() * 0.06), a + Math.PI / 2 + (rand() - 0.5) * 1.2, Math.round(170 + rand() * 85));
    }
  } else {
    // des fleurs à cinq pétales, cœur doré
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * S * 0.34;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const r = S * (0.045 + rand() * 0.02);
      g.fillStyle = gray(Math.round(225 + rand() * 30));
      for (let k = 0; k < 5; k++) {
        const t = (k / 5) * Math.PI * 2 + a;
        g.beginPath();
        g.ellipse(x + Math.cos(t) * r * 0.75, y + Math.sin(t) * r * 0.75, r * 0.7, r * 0.5, t, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgb(255,214,120)';
      g.beginPath();
      g.arc(x, y, r * 0.35, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  textures.set(kind, tex);
  return tex;
}

// ——— matériaux ———

/** Matériau d'un feuillage touffu (cartes de feuilles) : sa couleur peut changer avec la saison. */
export function foliageMaterial(color: THREE.ColorRepresentation, kind: 'leaves' | 'blossoms' = 'leaves'): THREE.MeshToonMaterial {
  const m = createToonMaterial({ color, rimStrength: 0.12, map: clusterTexture(kind) });
  m.alphaTest = 0.5;
  // l'usure des objets (durability.ts) ne doit pas remplacer la texture qui découpe les feuilles
  m.userData.noWear = true;
  return m;
}

let leafMat: THREE.MeshToonMaterial | null = null;
/** Matériau commun des vraies feuilles et des fleurs (couleurs dans les sommets, deux faces). */
export function leafMaterial(): THREE.MeshToonMaterial {
  if (leafMat) return leafMat;
  leafMat = createToonMaterial({ color: 0xffffff, rimStrength: 0.12 });
  leafMat.vertexColors = true;
  leafMat.side = THREE.DoubleSide;
  // partagé par toutes les plantes : l'usure d'un objet ne doit pas ternir les autres
  leafMat.userData.noWear = true;
  return leafMat;
}

// ——— outils de géométrie ———

/** Géométrie sans index, sans UV, d'une seule couleur (pour fusionner avec les feuilles). */
export function painted(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Fusionne des géométries peintes (position, normale, couleur). */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return out;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
/** Place une géométrie : rotation (x, y, z, ordre YXZ), puis translation. */
export function place(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.BufferGeometry {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ'));
  return geo.applyMatrix4(tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(s, s, s)));
}

export interface LeafOpts {
  /** Segments sur la longueur. */
  seg?: number;
  /** Courbure (rad) de la base à la pointe : la feuille se penche vers +Z. */
  bend?: number;
  /** Pli en V le long de la nervure (part de la largeur). */
  fold?: number;
  /** Largeur à la position t (0 base, 1 pointe), de 0 à 1. */
  shape?: (t: number) => number;
  /** Couleurs : le milieu (nervure) et les bords. */
  color?: THREE.ColorRepresentation;
  edge?: THREE.ColorRepresentation;
  /** Ondulation des bords (amplitude, part de la largeur) et nombre de vagues. */
  wave?: number;
  waves?: number;
}

/** Forme de feuille par défaut : étroite à la base, large au tiers, pointue. */
const LEAF_SHAPE = (t: number) => Math.sin(Math.PI * Math.pow(t, 0.75));

/**
 * Une feuille de `len` de long, `wid` de large, qui part de l'origine vers +Y et se courbe vers
 * +Z ; pliée en V le long de la nervure. Peinte (couleurs aux sommets), sans index.
 */
export function leafGeo(len: number, wid: number, o: LeafOpts = {}): THREE.BufferGeometry {
  const seg = o.seg ?? 5, bend = o.bend ?? 0.5, fold = o.fold ?? 0.18, shape = o.shape ?? LEAF_SHAPE;
  const mid = new THREE.Color(o.color ?? 0x4f8a3c), edge = new THREE.Color(o.edge ?? o.color ?? 0x5f9c48);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let y = 0, z = 0;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    if (i > 0) {
      const a = bend * (t - 0.5 / seg);
      y += Math.cos(a) * (len / seg);
      z += Math.sin(a) * (len / seg);
    }
    const w = (wid / 2) * shape(t);
    const wv = o.wave ? Math.sin(t * Math.PI * (o.waves ?? 4)) * o.wave * wid : 0;
    for (const s of [-1, 0, 1]) {
      pos.push(s * w, y, z - (s ? fold * w * 2 : 0) + (s ? wv * s : 0));
      const c = s ? edge : mid;
      col.push(c.r, c.g, c.b);
    }
    if (i < seg) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

// ——— feuillage touffu ———

export interface Lobe {
  x: number;
  y: number;
  z: number;
  /** Rayon. */
  r: number;
  /** Aplatissement vertical (1 rond). */
  sy?: number;
}

/**
 * Feuillage touffu fait de `lobes` (boules de feuilles) : un cœur plein un peu bosselé et des
 * cartes de feuilles orientées au hasard qui débordent. Les normales partent du milieu de l'ensemble (`center`) : un seul volume doux à l'ombrage.
 */
export interface FoliageOpts {
  /** Cartes par unité de surface (1 par défaut). */
  density?: number;
  /** Milieu de l'ensemble, d'où partent les normales (par défaut, le milieu des lobes). */
  center?: THREE.Vector3;
  /** Cœur plein sous les cartes (oui par défaut ; non pour des fleurs posées sur un feuillage). */
  core?: boolean;
  /** Taille des cartes (part du rayon du lobe). */
  card?: number;
}

export function foliageGeo(lobes: Lobe[], seed: number, o: FoliageOpts = {}): THREE.BufferGeometry {
  const rand = rng(seed);
  const density = o.density ?? 1, center = o.center;
  const mid = center ?? lobes.reduce((s, l) => s.add(new THREE.Vector3(l.x, l.y, l.z)), new THREE.Vector3()).divideScalar(lobes.length);
  const span = Math.max(...lobes.map((l) => new THREE.Vector3(l.x, l.y, l.z).distanceTo(mid) + l.r));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
  /** Normale d'un point : mélange de la direction depuis le lobe et depuis le milieu. */
  const normalAt = (p: THREE.Vector3, l: Lobe) => {
    d.set(p.x - l.x, (p.y - l.y) / (l.sy ?? 1), p.z - l.z).normalize();
    n.copy(p).sub(mid).divideScalar(span);
    return n.multiplyScalar(0.9).add(d.multiplyScalar(0.55)).add(v.set(0, 0.25, 0)).normalize();
  };
  const push = (p: THREE.Vector3, l: Lobe, u: number, w: number) => {
    pos.push(p.x, p.y, p.z);
    const nn = normalAt(p, l);
    nor.push(nn.x, nn.y, nn.z);
    uv.push(u, w);
  };
  for (const l of lobes) {
    const sy = l.sy ?? 1;
    // le cœur : une boule bosselée (bosses fixées par la position, sans fissure entre faces)
    // texture : chaque triangle projeté sur le plan qui lui fait face, posé au hasard dans le tapis
    if (o.core ?? true) {
      const core = new THREE.IcosahedronGeometry(l.r * 0.72, l.r > 0.9 ? 2 : 1);
      const cp = core.getAttribute('position');
      const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      /** Taille du tapis de feuilles (m) : les feuilles du cœur gardent la taille de celles des cartes. */
      const tile = l.r * (o.card ?? 0.95) * 1.2;
      for (let i = 0; i < cp.count; i += 3) {
        for (let k = 0; k < 3; k++) {
          const p = tri[k].fromBufferAttribute(cp, i + k);
          const u = p.clone().normalize();
          const h = Math.sin(u.x * 5.1 + seed) * Math.sin(u.y * 4.7) * Math.sin(u.z * 5.3 + seed * 0.3);
          p.multiplyScalar(1 + h * 0.18);
          p.y *= sy;
          p.add(new THREE.Vector3(l.x, l.y, l.z));
        }
        fn.crossVectors(e1.subVectors(tri[1], tri[0]), e2.subVectors(tri[2], tri[0]));
        const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
        const uvs = tri.map((p) => (ax > ay && ax > az ? [p.z, p.y] : ay > az ? [p.x, p.z] : [p.x, p.y]).map((c) => c / tile));
        const u0 = Math.min(...uvs.map((t) => t[0])), v0 = Math.min(...uvs.map((t) => t[1]));
        const su = Math.min(1, Math.max(...uvs.map((t) => t[0])) - u0), sv = Math.min(1, Math.max(...uvs.map((t) => t[1])) - v0);
        const du = rand() * (1 - su), dv = rand() * (1 - sv);
        for (let k = 0; k < 3; k++) {
          const tu = Math.min(1, uvs[k][0] - u0 + du), tv = Math.min(1, uvs[k][1] - v0 + dv);
          push(tri[k], l, HALF + 0.01 + tu * (HALF - 0.02), 0.01 + tv * 0.98);
        }
      }
      core.dispose();
    }
    // les cartes de feuilles : en nombre selon la surface du lobe
    const cards = Math.max(10, Math.round(l.r * l.r * 40 * density));
    const size = l.r * (o.card ?? 0.95);
    const t = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
    for (let k = 0; k < cards; k++) {
      // un point au bord du lobe, plutôt en haut et sur les côtés qu'en dessous
      const yv = rand() * 1.6 - 0.6;
      const a = rand() * Math.PI * 2, ring = Math.sqrt(Math.max(0, 1 - yv * yv));
      const rr = l.r * (0.62 + rand() * 0.3);
      c.set(l.x + Math.cos(a) * ring * rr, l.y + yv * rr * sy, l.z + Math.sin(a) * ring * rr);
      // orientation au hasard, plutôt tournée vers l'extérieur
      q.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().add(new THREE.Vector3(Math.cos(a) * ring, yv, Math.sin(a) * ring).multiplyScalar(0.8)).normalize();
      t.set(0, 1, 0).cross(q);
      if (t.lengthSq() < 1e-4) t.set(1, 0, 0);
      t.normalize().multiplyScalar(size / 2);
      b.copy(q).cross(t).normalize().multiplyScalar(size / 2);
      const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const at = (i: number) => c.clone().addScaledVector(t, corners[i][0]).addScaledVector(b, corners[i][1]);
      const uvs = (i: number): [number, number] => [0.01 + ((corners[i][0] + 1) / 2) * (HALF - 0.02), (corners[i][1] + 1) / 2];
      // recto et verso (mêmes normales : pas de face sombre vue de dos)
      for (const tri of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) for (const i of tri) push(at(i), l, ...uvs(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** Maillage d'un feuillage touffu (ombre portée découpée comme les feuilles). */
export function foliage(lobes: Lobe[], mat: THREE.Material, seed: number, o: FoliageOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(foliageGeo(lobes, seed, o), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ——— sapins ———

/**
 * Un étage de sapin : cône aux bords dentelés et tombants, ombrage lisse, dessous fermé.
 * Base au niveau 0, pointe à `h`.
 */
function pineTier(r: number, h: number, seed: number): THREE.BufferGeometry {
  const rand = rng(seed);
  const n = 11;
  const pos: number[] = [0, h, 0];
  const idx: number[] = [];
  // anneau du milieu (galbe concave), puis le bord : pointes basses et creux plus hauts
  const rot = rand() * Math.PI;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    pos.push(Math.cos(a) * r * 0.5, h * 0.42, Math.sin(a) * r * 0.5);
  }
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const tip = i % 2 === 0;
    const rr = r * (tip ? 1 + (rand() - 0.5) * 0.12 : 0.8);
    pos.push(Math.cos(a) * rr, tip ? -h * 0.06 : h * 0.08, Math.sin(a) * rr);
  }
  pos.push(0, h * 0.18, 0);
  const M = 1, B = 1 + n * 2, C = 1 + n * 4;
  for (let i = 0; i < n * 2; i++) {
    const j = (i + 1) % (n * 2);
    idx.push(0, M + j, M + i);
    idx.push(M + i, M + j, B + i, B + i, M + j, B + j);
    idx.push(C, B + i, B + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Les étages d'un sapin, fusionnés (une seule géométrie, pointe vers 3.4 m). */
export function pineGeo(seed: number): THREE.BufferGeometry {
  const tiers: Array<[number, number, number]> = [[0.75, 1.15, 1.25], [1.35, 0.92, 1.1], [1.95, 0.68, 0.95], [2.5, 0.42, 0.85]];
  const geos = tiers.map(([y, r, h], i) => pineTier(r, h, seed * 7 + i).translate(0, y, 0));
  return mergeGeometries(geos.map((g) => g.toNonIndexed()));
}

// ——— fleurs ———

export type FlowerKind = 'marguerite' | 'tulipe' | 'cosmos';
export const FLOWER_KINDS: FlowerKind[] = ['cosmos', 'tulipe', 'marguerite'];

/**
 * Tête de fleur de rayon `r`, posée à l'origine, tournée vers le haut : pétales de la couleur
 * `color`, cœur `heart`. Peinte, sans index.
 */
export function flowerHeadGeo(kind: FlowerKind, r: number, color: THREE.ColorRepresentation, heart: THREE.ColorRepresentation = 0xf2c23c): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const tip = c.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const geos: THREE.BufferGeometry[] = [];
  if (kind === 'tulipe') {
    // six pétales en coupe, bien relevés
    for (let i = 0; i < 6; i++) {
      const p = leafGeo(r * 1.5, r * 1.15, { seg: 3, bend: -0.5, fold: 0.1, color: c.clone().multiplyScalar(0.85), edge: tip, shape: (t) => Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) });
      geos.push(place(p, 0, 0, 0, 0.32 + (i % 2) * 0.08, (i / 6) * Math.PI * 2 + (i % 2) * 0.3, 0).translate(0, -r * 0.1, 0));
    }
  } else {
    const petals = kind === 'marguerite' ? 12 : 8;
    const w = kind === 'marguerite' ? r * 0.38 : r * 0.75;
    for (let i = 0; i < petals; i++) {
      const p = leafGeo(r, w, { seg: 2, bend: -0.3, fold: 0.05, color: c, edge: tip, shape: kind === 'cosmos' ? (t) => Math.sin(Math.PI * Math.pow(t, 0.5)) * 0.8 + 0.2 * t : undefined });
      // couchée à l'horizontale, ouverte en corolle
      geos.push(place(p, 0, 0, 0, Math.PI / 2 - 0.35, (i / petals) * Math.PI * 2, 0));
    }
    geos.push(painted(new THREE.SphereGeometry(r * 0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), heart));
  }
  return merge(geos);
}

/** Une fleur entière : tige, une ou deux feuilles, tête. Hauteur `h`. Peinte, sans index. */
export function flowerGeo(kind: FlowerKind, h: number, color: THREE.ColorRepresentation, seed: number, headR = 0.045, head = true): THREE.BufferGeometry {
  const rand = rng(seed);
  const stem = 0x4f8a3c;
  const geos = [painted(new THREE.CylinderGeometry(0.004, 0.006, h, 4, 1, true).translate(0, h / 2, 0), stem)];
  const leaves = kind === 'tulipe' ? 2 : 1 + Math.round(rand());
  for (let i = 0; i < leaves; i++) {
    const long = kind === 'tulipe' ? h * 0.7 : h * 0.4;
    geos.push(place(leafGeo(long, kind === 'tulipe' ? 0.035 : 0.03, { seg: 3, bend: 0.9, color: 0x4a8a36, edge: 0x6aa64c }), 0, h * (kind === 'tulipe' ? 0.02 : 0.25 + i * 0.2), 0, 0.35, rand() * Math.PI * 2 + i * Math.PI, 0));
  }
  if (head) geos.push(flowerHeadGeo(kind, headR, color).translate(0, h, 0));
  return merge(geos);
}

// ——— pots ———

/** Pot tourné (bord roulé, terre dedans) : hauteur `h`, rayon du haut `r`. Peint, sans index. */
export function potGeo(h: number, r: number, color: THREE.ColorRepresentation, soil: THREE.ColorRepresentation = 0x4a3222): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.72, 0), new THREE.Vector2(r * 0.76, h * 0.06),
    new THREE.Vector2(r * 0.92, h * 0.8), new THREE.Vector2(r * 1.04, h * 0.82), new THREE.Vector2(r * 1.05, h),
    new THREE.Vector2(r * 0.92, h), new THREE.Vector2(r * 0.9, h * 0.9),
  ];
  const pot = painted(new THREE.LatheGeometry(prof, 20), color);
  const dirt = painted(new THREE.CircleGeometry(r * 0.9, 16).rotateX(-Math.PI / 2).translate(0, h * 0.9, 0), soil);
  return merge([pot, dirt]);
}

/** Maillage peint (matériau commun des feuilles). */
export function leafMesh(geo: THREE.BufferGeometry, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, leafMaterial());
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// ——— plantes d'intérieur ———

/**
 * Palmier d'appartement (kentia) en pot : de longues palmes arquées. Environ 1.3 m. Dans un coin,
 * les palmes s'ouvrent vers `facing` (rad, 0 vers +Z) sur l'angle `spread`, pour ne pas traverser
 * les murs.
 */
export function kentia(facing = 0, spread = Math.PI * 2): THREE.Group {
  const rand = rng(23);
  const geos = [potGeo(0.36, 0.17, 0xb5653a)];
  const fronds = 10;
  for (let f = 0; f < fronds; f++) {
    const yaw = spread >= Math.PI * 2 ? (f / fronds) * Math.PI * 2 + rand() * 0.4 : facing + ((f + rand() * 0.6) / fronds - 0.5) * spread;
    const len = 0.75 + rand() * 0.35;
    const lean = 0.35 + rand() * 0.35;
    // la tige de la palme : arquée, des folioles de chaque côté
    const steps = 11;
    const rach: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = lean + t * t * 1.5;
      const prev = rach[i - 1] ?? new THREE.Vector3(0, 0.36, 0);
      rach.push(i ? prev.clone().add(new THREE.Vector3(0, Math.cos(a), Math.sin(a)).multiplyScalar(len / steps)) : prev);
    }
    const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rach), 8, 0.006, 4);
    geos.push(place(painted(stem, 0x5a7a34), 0, 0, 0, 0, yaw, 0));
    for (let i = 2; i <= steps; i++) {
      const t = i / steps;
      const p = rach[i];
      const dir = rach[i].clone().sub(rach[i - 1]).normalize();
      const pitch = Math.atan2(dir.z, dir.y);
      const flen = 0.26 * Math.sin(Math.PI * (0.15 + t * 0.75)) + 0.05;
      for (const s of [-1, 1]) {
        const leaf = leafGeo(flen, 0.034, { seg: 3, bend: 0.8, fold: 0.25, color: 0x3f7a32, edge: 0x5b9a40 });
        // foliole tournée sur le côté, vers l'avant, retombante
        place(leaf, 0, 0, 0, 0.5, 0, s * 1.15);
        place(leaf, 0, 0, 0, pitch, 0, 0);
        geos.push(place(leaf.translate(p.x, p.y, p.z), 0, 0, 0, 0, yaw, 0));
      }
    }
  }
  const g = new THREE.Group();
  g.add(leafMesh(merge(geos)));
  return g;
}

/** Sansevieria en pot : des feuilles en lame dressées, bordées de jaune. Environ 0.9 m. */
export function sansevieria(potColor: THREE.ColorRepresentation = 0xd9d3c5): THREE.Group {
  const rand = rng(31);
  const geos = [potGeo(0.3, 0.14, potColor)];
  const blades = 13;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand() * 0.4, d = 0.02 + rand() * 0.07;
    const len = 0.4 + rand() * 0.38;
    const leaf = leafGeo(len, 0.09 + rand() * 0.04, {
      seg: 6, bend: 0.15 + rand() * 0.25, fold: 0.22,
      color: rand() < 0.5 ? 0x2f5f2a : 0x3b6e30, edge: 0xc9c25a,
      shape: (t) => Math.min(1, 0.55 + t * 1.8) * (1 - Math.pow(t, 3)),
      wave: 0.06, waves: 3,
    });
    // lame tournée vers l'extérieur, un peu penchée
    geos.push(place(leaf, Math.cos(a) * d, 0.27, Math.sin(a) * d, 0.06 + d * 2.5, -a + Math.PI / 2, 0));
  }
  const g = new THREE.Group();
  g.add(leafMesh(merge(geos)));
  return g;
}

// ——— petites pousses (potager, mauvaises herbes) ———

/** Une touffe de brins d'herbe (mauvaise herbe). Peinte, sans index. */
export function tuftGeo(seed: number, h = 0.1, blades = 6, color: THREE.ColorRepresentation = 0x6f9a34): THREE.BufferGeometry {
  const rand = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand();
    geos.push(place(leafGeo(h * (0.6 + rand() * 0.6), 0.014, { seg: 3, bend: 0.9 + rand() * 0.6, fold: 0.1, color, edge: 0x8cb24a }), 0, 0, 0, 0.15, a, 0));
  }
  return merge(geos);
}

/** Fanes de carotte : des tiges fines, chacune garnie de petites folioles. Peintes, sans index. */
export function carrotTopGeo(seed: number, h = 0.2): THREE.BufferGeometry {
  const rand = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 5; f++) {
    const yaw = (f / 5) * Math.PI * 2 + rand() * 0.6;
    const lean = 0.25 + rand() * 0.3;
    const len = h * (0.75 + rand() * 0.35);
    const frond: THREE.BufferGeometry[] = [painted(new THREE.CylinderGeometry(0.0025, 0.0035, len, 3, 1, true).translate(0, len / 2, 0), 0x5d9a3a)];
    for (let i = 0; i < 4; i++) {
      const y = len * (0.4 + i * 0.18);
      for (const s of [-1, 1]) frond.push(place(leafGeo(0.045 - i * 0.006, 0.026, { seg: 2, bend: 0.4, fold: 0.2, color: 0x4f9a3c, edge: 0x6cb04c }), 0, y, 0, 0.9, 0, s * 0.9));
    }
    frond.push(place(leafGeo(0.035, 0.024, { seg: 2, bend: 0.3, color: 0x4f9a3c, edge: 0x6cb04c }), 0, len, 0));
    geos.push(place(merge(frond), 0, 0, 0, lean, yaw, 0));
  }
  return merge(geos);
}

/** Grandes feuilles de concombre étalées au ras du sol, autour de (0, 0). Peintes, sans index. */
export function vineLeavesGeo(seed: number, n = 5): THREE.BufferGeometry {
  const rand = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.5;
    const leaf = leafGeo(0.13, 0.15, { seg: 4, bend: 1.2, fold: 0.12, color: 0x3f7f30, edge: 0x5c9c42, shape: (t) => Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.9)), wave: 0.04, waves: 5 });
    geos.push(place(leaf, 0, 0.005, 0, 0.55, a, 0));
  }
  return merge(geos);
}

/** Pied de tomate (sans son tuteur) : une tige qui monte, des feuilles dentelées tout du long. Peint, sans index. */
export function tomatoPlantGeo(seed: number, h = 0.7): THREE.BufferGeometry {
  const rand = rng(seed);
  const geos = [painted(new THREE.CylinderGeometry(0.006, 0.009, h, 4, 1, true).translate(0.015, h / 2, 0), 0x4f8030)];
  const n = 20;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const len = 0.19 - t * 0.08 + rand() * 0.03;
    const leaf = leafGeo(len, len * 0.55, { seg: 4, bend: 1.0, fold: 0.2, color: 0x3f7e2e, edge: 0x5e9c40, wave: 0.12, waves: 4 });
    geos.push(place(leaf, 0.015, 0.06 + t * (h - 0.08), 0, 0.7 + rand() * 0.4, i * 2.4 + rand() * 0.5, 0));
  }
  return merge(geos);
}
