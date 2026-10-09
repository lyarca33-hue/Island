/**
 * Ce que les meubles fermés (frigo, placards, tiroirs, four, armoire…) contiennent, et comment on le
 * voit.
 *
 * Un objet rangé derrière une porte ou dans un tiroir n'est pas dessiné : il est remplacé par sa
 * silhouette très simple (une boîte ou un prisme à six pans à sa taille, de sa couleur), qui montre
 * porte ouverte que le meuble n'est pas vide. On le choisit dans la fenêtre d'inventaire du meuble :
 * la porte s'ouvre, l'objet apparaît et le perso le prend (Game.take).
 *
 * Au départ, chaque meuble de rangement de la maison est rempli avec les objets du jeu (START_CONTENTS).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from '../toon';

/**
 * Contenu des meubles au départ : [meuble, n° du meuble de cette sorte (0 : le premier posé),
 * objets (ids)]. Chaque objet prend la première place libre, la plus à hauteur des mains d'abord.
 * Le four, le micro-ondes et le grille-pain restent vides : ce qu'on y met cuit.
 */
export const START_CONTENTS: Array<[string, number, string[]]> = [
  // les placards hauts : la vaisselle de tous les jours à gauche, les verres et le saladier à droite
  ['placard-haut', 0, ['assiette', 'assiette', 'assiette', 'assiette', 'bol', 'bol', 'tasse', 'tasse']],
  ['placard-haut', 1, ['verre', 'verre', 'verre', 'verre', 'tasse', 'tasse', 'carafe']],
  // sous l'évier : l'entretien, le moule, la râpe et la pierre à pizza
  ['placard', 0, ['pastilles', 'sacs-poubelle', 'spray', 'gants', 'moule', 'rape', 'pierre-pizza']],
  // sous le plan de travail, à côté de la gazinière : de quoi cuisiner
  ['plan-de-travail', 0, ['planche', 'saladier', 'passoire', 'plat-four']],
  // au mur : le couteau à sa barre aimantée, les ustensiles à leurs crochets
  ['barre-couteaux', 0, ['couteau']],
  ['barre-ustensiles', 0, ['spatule', 'louche', 'fouet', 'cuillere-bois']],
  // la poêle et la casserole pendent à leur barre, au-dessus de la gazinière
  ['barre-casseroles', 0, ['poele', 'casserole']],
  ['tiroir', 0, ['fourchette', 'fourchette', 'couteau-table', 'couteau-table', 'cuillere', 'cuillere', 'torchon']],
  // le lave-vaisselle a fini son lavage : propre, prêt à vider
  ['lave-vaisselle', 0, ['assiette', 'assiette', 'verre', 'verre', 'bol', 'fourchette', 'cuillere']],
  [
    'frigo',
    0,
    [
      'lait', 'beurre', 'fromage', 'oeuf', 'oeuf', 'oeuf', 'yaourt', 'yaourt', 'creme', 'jambon', 'steak', 'poulet', 'saucisses',
      'salade', 'tomate', 'tomate', 'carotte', 'carotte', 'concombre', 'pomme', 'pomme', 'orange', 'citron', 'fraises',
      'raisin', 'poireau', 'bouteille-eau', 'jus-orange', 'moutarde', 'ketchup', 'mayonnaise',
    ],
  ],
  ['congelateur', 0, ['bac-glacons', 'pizza', 'frites', 'legumes-surgeles', 'lasagne']],
  [
    'garde-manger',
    0,
    [
      'farine', 'sucre', 'levure', 'chocolat', 'confiture', 'miel', 'pate-tartiner', 'biscuits', 'chips', 'sauce-tomate', 'vinaigre',
      'paquet-pates', 'paquet-riz', 'brique-soupe', 'sachets-the', 'pomme-de-terre', 'pomme-de-terre', 'pomme-de-terre',
      'oignon', 'oignon', 'ail', 'banane', 'banane', 'poire', 'poire',
    ],
  ],
  // le garage : le râteau et la bêche pendus à leur rangement
  ['rangement-outils', 0, ['rateau', 'beche']],
  // la chambre : la chemise sur son cintre et le linge dans l'armoire ; un livre dans chaque table de nuit
  ['armoire', 0, ['cintre', 'pull', 'serviette']],
  ['table-de-nuit', 0, ['livre-vert']],
  ['table-de-nuit', 1, ['livre-ocre']],
];

/** Couleur d'une silhouette quand l'objet n'a qu'une texture qu'on ne peut pas lire (neutre, carton). */
const NEUTRAL = 0xc8b89a;
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<number, THREE.Material>();

/**
 * Silhouette très simple de l'objet `model` (dans son repère, boîte `box`) : un prisme à six pans s'il
 * est à peu près rond vu de dessus (assiette, tasse, bouteille, pomme), sinon une boîte ; un vêtement
 * sur cintre ou une pile de linge plié pour les habits (`shape`, ItemDef.stowedAs). Géométries et
 * matériaux sont partagés entre silhouettes pareilles. Elle ne s'use pas et ne se casse pas à part.
 */
export function buildFiller(model: THREE.Object3D, box: THREE.Box3, shape?: 'cintre' | 'plie'): THREE.Mesh {
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.92).max(new THREE.Vector3(0.01, 0.01, 0.01));
  const round = !shape && Math.abs(size.x - size.z) < 0.15 * Math.max(size.x, size.z);
  const cm = (v: number) => Math.round(v * 100);
  const key = `${shape ?? (round ? 'o' : 'b')}${cm(size.x)}-${cm(size.y)}-${cm(size.z)}`;
  let geo = geometries.get(key);
  if (!geo) {
    geo =
      shape === 'cintre'
        ? hangerGeometry(size)
        : shape === 'plie'
          ? foldedGeometry(size)
          : round
            ? new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y, 6)
            : new THREE.BoxGeometry(size.x, size.y, size.z);
    geometries.set(key, geo);
  }
  const hex = mainColor(model);
  let mat = materials.get(hex);
  if (!mat) {
    mat = createToonMaterial({ color: hex, rimStrength: 0 });
    mat.userData.noWear = true;
    materials.set(hex, mat);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'remplissage';
  mesh.position.copy(box.getCenter(new THREE.Vector3()));
  // l'objet reste cliquable par son propre modèle (caché) : la silhouette ne fait que se montrer
  mesh.raycast = () => {};
  return mesh;
}

/** Boîte `w`×`h`×`d` centrée en (x, y, z) dans la silhouette (centrée sur la boîte de l'objet). */
function slab(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Vêtement suspendu : le crochet, la barre du cintre, les épaules, puis le corps un peu plus étroit. */
function hangerGeometry(size: THREE.Vector3): THREE.BufferGeometry {
  const top = size.y / 2;
  const d = Math.min(size.z, 0.05);
  const body = size.y - 0.14;
  return mergeGeometries([
    slab(0.012, 0.05, 0.012, 0, top - 0.025, 0),
    slab(size.x, 0.015, 0.015, 0, top - 0.06, 0),
    slab(size.x * 0.92, 0.08, d, 0, top - 0.1, 0),
    slab(size.x * 0.8, body, d * 0.85, 0, top - 0.14 - body / 2, 0),
  ])!;
}

/**
 * Linge plié : deux ou trois plis empilés, un peu décalés, posés au fond de la boîte de l'objet (une
 * serviette étendue, plus haute que large, devient une pile à plat).
 */
function foldedGeometry(size: THREE.Vector3): THREE.BufferGeometry {
  const w = Math.min(size.x, 0.28);
  const d = Math.min(Math.max(size.z, 0.2), 0.24);
  const h = Math.min(size.y, 0.12);
  const n = h > 0.08 ? 3 : 2;
  const layer = h / n;
  const parts = Array.from({ length: n }, (_, k) => slab(w - k * 0.01, layer * 0.94, d - k * 0.008, (k % 2 ? 1 : -1) * 0.004, -size.y / 2 + layer * (k + 0.5), (k % 2 ? -1 : 1) * 0.003));
  return mergeGeometries(parts)!;
}

const colors = new WeakMap<THREE.Object3D, number>();

/** Couleur d'un objet pour sa silhouette et sa case d'inventaire (0xrrggbb), retenue. */
export function fillerColor(object: THREE.Object3D): number {
  let hex = colors.get(object);
  if (hex === undefined) colors.set(object, (hex = mainColor(object)));
  return hex;
}

/** Couleur de la plus grande pièce visible de l'objet (sa couleur d'origine, hors usure). */
function mainColor(model: THREE.Object3D): number {
  let best = -1;
  let hex = NEUTRAL;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // (la pièce qui cuit est souvent tout l'aliment)
    if (!mesh.isMesh || !mesh.visible || (mesh.name && mesh.name !== 'cuit')) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshToonMaterial;
    if (!mat?.color || mat.colorWrite === false) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere?.radius ?? 0;
    if (r <= best) return;
    const base: THREE.Color = mat.userData.baseColor ?? mat.color;
    const tint = mat.map ? textureColor(mat.map) : null;
    if (mat.map && !tint) return;
    best = r;
    hex = tint ? tint.multiply(base).getHex() : base.getHex();
  });
  return hex;
}

const averages = new WeakMap<THREE.Texture, THREE.Color | null>();

/** Couleur moyenne d'une texture (l'image réduite à un pixel), ou null si elle ne se lit pas. */
function textureColor(tex: THREE.Texture): THREE.Color | null {
  if (!averages.has(tex)) averages.set(tex, readAverage(tex));
  return averages.get(tex)?.clone() ?? null;
}

function readAverage(tex: THREE.Texture): THREE.Color | null {
  const img = tex.image as CanvasImageSource | undefined;
  if (!img || typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return null;
  }
}
