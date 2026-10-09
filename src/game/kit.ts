/**
 * Le kit Tripo de la maison (public/kit/maison.glb, voir tools/build_kit_assets.mjs) : enduit des
 * murs, carreau du sol, pan de toit, porte d'entrée et fenêtre en bois. La cuisine s'en habille :
 * Room.dress remplace le sol, le toit, le battant de la porte et les fenêtres faits par programme,
 * et pose l'enduit sur les murs.
 *
 * Repère des pièces dans le fichier :
 * - mur : plaque de 1 × 1 m, x le long du mur, y de 0 à 1, relief tourné vers +z (z de 0 à 2 cm) ;
 * - sol : carreau de 1 × 1 m à plat, dessus à y = 0,03 ;
 * - toit : pan de 1 × 1, faîtage à z = -0,5, égout à z = +0,5, bas à y = 0 ;
 * - porte : battant de 88 × 205 cm, poignée à +x, bas à y = 0 ;
 * - fenetre : fenêtre de 86 × 115 cm (cadre, croisillon, appui), bas à y = 0.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createToonMaterial } from './toon';

export const KIT_URL = `${import.meta.env.BASE_URL}kit/maison.glb`;

export type KitPiece = 'mur' | 'sol' | 'toit' | 'porte' | 'fenetre';

/** Une pièce du kit : ses maillages, matériaux devenus du cel shading. */
export type Kit = Record<KitPiece, THREE.Object3D>;

let loading: Promise<Kit> | null = null;

/** Charge le kit une seule fois. */
export function loadKit(): Promise<Kit> {
  loading ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(KIT_URL)
    .then((gltf) => {
      const mats = new Map<THREE.Material | string, THREE.Material>();
      const kit = {} as Kit;
      for (const node of [...gltf.scene.children]) {
        node.position.set(0, 0, 0);
        node.updateMatrixWorld(true);
        node.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const m = o.material as THREE.MeshStandardMaterial;
          // tuiles du toit : creux assombris (couleurs aux sommets), sinon le cel shading les aplatit
          const tiles = node.name === 'toit';
          const key = tiles ? 'toit' : m;
          if (!mats.has(key)) {
            const t = createToonMaterial({ color: m.color, map: m.map, rimStrength: 0 });
            t.vertexColors = tiles;
            mats.set(key, t);
          }
          if (tiles) {
            o.geometry = plain(o.geometry).applyMatrix4(o.matrixWorld);
            o.position.set(0, 0, 0);
            o.quaternion.identity();
            o.scale.set(1, 1, 1);
            shadeTiles(o.geometry);
          }
          o.material = mats.get(key)!;
          o.castShadow = o.receiveShadow = true;
        });
        node.removeFromParent();
        node.updateMatrixWorld(true);
        kit[node.name as KitPiece] = node;
      }
      return kit;
    });
  return loading;
}

/** Les maillages d'une pièce du kit, leur géométrie ramenée dans le repère de la pièce. */
export function kitParts(piece: THREE.Object3D): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
  const out: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];
  piece.updateMatrixWorld(true);
  piece.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push({ geometry: plain(o.geometry).applyMatrix4(o.matrixWorld), material: o.material as THREE.Material });
  });
  return out;
}

/** Tuiles : ombre des creux selon la hauteur (le dessus des tuiles clair, le fond des rangs sombre) et la pente. */
const TILE_DARK = 0.45;

function shadeTiles(g: THREE.BufferGeometry): void {
  g.computeVertexNormals();
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    lo = Math.min(lo, p.getY(i));
    hi = Math.max(hi, p.getY(i));
  }
  // les tuiles occupent le haut du pan (le dessous est la volige) : creux à mi-hauteur, crêtes en haut
  const base = lo + (hi - lo) * 0.5;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const h = THREE.MathUtils.smoothstep(p.getY(i), base, hi);
    const k = (TILE_DARK + (1 - TILE_DARK) * h) * (0.7 + 0.3 * Math.max(0, n.getY(i)));
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Copie en nombres simples (la compression meshopt rend des attributs quantifiés et entrelacés). */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (g.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  return out;
}

/** Taille des carreaux d'enduit posés sur les murs (m) : la plaque du kit, en miroir d'un carreau à l'autre. */
const PLASTER_TILE = 1.25;

/**
 * L'enduit d'un pan de mur : la face avant de la plaque du kit, répétée en miroir (pas de couture
 * visible) sur un rectangle de `len` × `h` m, puis serrée dans le morceau [u0, u1] × [y0, y1] (bords
 * nets autour des portes et des fenêtres). x le long du mur (0 à len), y en hauteur, relief vers +z.
 */
export class PlasterSheet {
  private pos: Float32Array;
  private index: Uint32Array;

  constructor(wall: THREE.Object3D, len: number, h: number) {
    // face avant seulement (relief tourné vers +z), sommets partagés
    const src = kitParts(wall)[0].geometry;
    const p = src.getAttribute('position');
    const idx = src.index!.array;
    const keep: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(p, idx[t]);
      b.fromBufferAttribute(p, idx[t + 1]);
      c.fromBufferAttribute(p, idx[t + 2]);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (n.z > 0.3 && Math.min(a.z, b.z, c.z) > 0.001) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    // bords de la face avant ramenés exactement à 0 et 1 : les carreaux se touchent sans fente
    const used = [...new Set(keep)];
    const [xa, xb] = [Math.min(...used.map((k) => p.getX(k))), Math.max(...used.map((k) => p.getX(k)))];
    const [ya, yb] = [Math.min(...used.map((k) => p.getY(k))), Math.max(...used.map((k) => p.getY(k)))];
    const nu = Math.max(1, Math.round(len / PLASTER_TILE)), nv = Math.max(1, Math.round(h / PLASTER_TILE));
    const su = len / nu, sv = h / nv;
    const pos: number[] = [], index: number[] = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      // un carreau sur deux en miroir : le relief se raccorde au bord commun
      const fu = i % 2 ? -1 : 1, fv = j % 2 ? -1 : 1;
      const base = pos.length / 3;
      for (let k = 0; k < p.count; k++) {
        const x = (p.getX(k) - xa) / (xb - xa), y = (p.getY(k) - ya) / (yb - ya);
        pos.push((i + (fu > 0 ? x : 1 - x)) * su, (j + (fv > 0 ? y : 1 - y)) * sv, p.getZ(k));
      }
      // en miroir sur un seul axe, le triangle se retourne : on le remet face à +z
      const flip = fu * fv < 0;
      for (let t = 0; t < keep.length; t += 3) index.push(base + keep[t], base + keep[t + (flip ? 2 : 1)], base + keep[t + (flip ? 1 : 2)]);
    }
    this.pos = new Float32Array(pos);
    this.index = new Uint32Array(index);
  }

  /**
   * Le morceau [u0, u1] × [y0, y1] : triangles dedans, ceux à cheval serrés sur le bord. `ceil(u)`
   * abaisse le haut du morceau (le triangle d'un pignon).
   */
  piece(u0: number, u1: number, y0: number, y1: number, ceil?: (u: number) => number): THREE.BufferGeometry | null {
    const pos = this.pos, idx = this.index;
    const top = (k: number) => Math.min(y1, ceil ? ceil(THREE.MathUtils.clamp(pos[k * 3], u0, u1)) : y1);
    const remap = new Map<number, number>();
    const out: number[] = [], index: number[] = [];
    const inside = (k: number) => pos[k * 3] >= u0 && pos[k * 3] <= u1 && pos[k * 3 + 1] >= y0 && pos[k * 3 + 1] <= y1;
    const vert = (k: number) => {
      let v = remap.get(k);
      if (v === undefined) {
        v = out.length / 3;
        out.push(THREE.MathUtils.clamp(pos[k * 3], u0, u1), THREE.MathUtils.clamp(pos[k * 3 + 1], y0, Math.max(y0, top(k))), pos[k * 3 + 2]);
        remap.set(k, v);
      }
      return v;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      if (!inside(a) && !inside(b) && !inside(c)) {
        // tout dehors : gardé seulement s'il chevauche le morceau (grand triangle sur un petit morceau)
        const xs = [pos[a * 3], pos[b * 3], pos[c * 3]], ys = [pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]];
        if (Math.max(...xs) < u0 || Math.min(...xs) > u1 || Math.max(...ys) < y0 || Math.min(...ys) > y1) continue;
      }
      if (ceil && [a, b, c].every((k) => pos[k * 3 + 1] > top(k))) continue;
      index.push(vert(a), vert(b), vert(c));
    }
    if (!index.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }
}
