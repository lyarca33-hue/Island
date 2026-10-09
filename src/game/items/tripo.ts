/**
 * Meubles et appareils de la cuisine faits avec Tripo (licence d'usage commercial), regroupés dans
 * `public/models/cuisine.glb` par `tools/build_cuisine_assets.mjs` : un nœud par modèle (« placard-bas »),
 * à sa vraie taille (1 unité = 1 m), posé au sol, l'avant vers +Z ; ses pièces mobiles sont des
 * nœuds enfants (« porte », « tiroir-1 », « bouton-0 »…), leur géométrie dans le repère du modèle.
 *
 * Un objet habillé garde tout ce qui sert au jeu : sa fiche, et les pièces nommées faites par
 * programme qui ne sont pas dans le modèle (flammes, filet d'eau, lueur du four, étagères `dedans`).
 * Le modèle remplace les pièces sans nom, et chaque pièce mobile qu'il fournit prend la place de
 * celle du jeu : la porte du placard est la porte du modèle, posée sur sa charnière (`pivot`). Les
 * fiches de ces objets ont les mesures du modèle (places de rangement, feux, robinet), si bien que
 * le jeu marche pareil avant le chargement (modèle fait par programme) et après.
 *
 * Le fichier est chargé avant la maison (App.tsx) : la boîte de chaque meuble (rangement contre
 * les murs, chemins) est celle du modèle.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createToonMaterial } from '../toon';
import { poseMotion, ROOM_RIGS, type Motion } from './rigs';

/** Les fichiers de modèles, un par pièce (public/models/<pièce>.glb). */
export const TRIPO_PACKS = ['cuisine', 'salon', 'chambre', 'salle-de-bain', 'entree', 'garage'];
export const TRIPO_URL = `${import.meta.env.BASE_URL}models/cuisine.glb`;
const packUrl = (pack: string) => `${import.meta.env.BASE_URL}models/${pack}.glb`;

type V3 = [number, number, number];

/** Une pièce mobile du jeu, faite d'un nœud du modèle. */
interface PartLook {
  /** Nœud du modèle. */
  from: string;
  /**
   * Axe de la pièce dans le repère du modèle (charnière d'une porte, centre d'un bouton) : la pièce
   * du jeu y est posée et tourne autour. Absent : la pièce reste à l'origine (tiroir, levier : le
   * jeu les déplace en absolu).
   */
  pivot?: V3;
  /** Levier : de combien il descend quand l'appareil tourne (m ; défaut du jeu : 6 cm). */
  drop?: number;
  /** Mouvement de la pièce, joué par `poseRig` (rigs.ts) : l'abattant des toilettes, le drapeau. */
  motion?: Motion;
}

export interface TripoLook {
  /** Nœud du modèle dans cuisine.glb. */
  model: string;
  /** Pièces du jeu (« porte », « bouton-0 ») faites des pièces mobiles du modèle. Les autres restent fixes. */
  parts?: Record<string, PartLook>;
  /** Tranche du modèle gardée, en hauteur (repère du modèle), posée au sol : le bas ou le haut du frigo. */
  clip?: [number, number];
  /** Échelle (x, y, z) : la gazinière, trop profonde, ramenée à la profondeur des meubles bas. */
  scale?: V3;
  /** Rotation autour de Y (rad), puis décalage dans la fiche. */
  turn?: number;
  at?: V3;
  /** Socle sous le modèle (m) : le four, plus bas que le plan de travail, monté dessus. */
  plinth?: number;
  /** Allonge ce qui est sous la hauteur y (repère du modèle) de `by` mètres : les pieds de la table basse. */
  stretch?: [y: number, by: number];
}

/** Les fiches habillées et leur modèle. */
export const TRIPO_LOOKS: Record<string, TripoLook> = {
  placard: { model: 'placard-bas', parts: { porte: { from: 'porte', pivot: [0.34, 0, 0.22] } } },
  'placard-haut': {
    model: 'placard-haut',
    parts: { porte: { from: 'porte-droite', pivot: [0.35, 0, 0.13] }, 'porte-2': { from: 'porte-gauche', pivot: [-0.35, 0, 0.13] } },
  },
  'plan-de-travail': { model: 'placard-bas' },
  tiroir: { model: 'meuble-tiroirs', parts: { porte: { from: 'tiroir-1' } } },
  // le frigo-congélateur coupé en deux objets : le congélateur (le tiroir du bas), le frigo posé dessus
  congelateur: { model: 'frigo', clip: [0, 0.625], parts: { porte: { from: 'tiroir' } } },
  frigo: { model: 'frigo', clip: [0.625, 2], parts: { porte: { from: 'porte', pivot: [0.34, 0.625, 0.26] } } },
  'garde-manger': { model: 'garde-manger', parts: { porte: { from: 'porte', pivot: [0.26, 0, 0.25] } } },
  four: { model: 'four', plinth: 0.12, parts: { porte: { from: 'porte', pivot: [0, 0.045, 0.26] } } },
  'lave-vaisselle': { model: 'lave-vaisselle', parts: { porte: { from: 'porte', pivot: [0, 0.09, 0.25] } } },
  'micro-ondes': { model: 'micro-ondes', parts: { porte: { from: 'porte', pivot: [-0.25, 0, 0.17] } } },
  evier: { model: 'evier' },
  // 6 boutons pour 4 feux : les deux du milieu restent pour le décor
  gaziniere: {
    model: 'gaziniere',
    scale: [0.9, 0.955, 0.68],
    parts: {
      'bouton-0': { from: 'bouton-1', pivot: [-0.211, 0.765, 0.45] },
      'bouton-1': { from: 'bouton-4', pivot: [0.216, 0.765, 0.45] },
      'bouton-2': { from: 'bouton-0', pivot: [-0.322, 0.765, 0.45] },
      'bouton-3': { from: 'bouton-5', pivot: [0.324, 0.765, 0.45] },
    },
  },
  'machine-a-cafe': { model: 'machine-cafe', parts: { 'bouton-0': { from: 'bouton-0', pivot: [-0.056, 0.29, 0.134] } } },
  // le bec vers la tasse (+X), la poignée et son interrupteur de l'autre côté
  bouilloire: { model: 'bouilloire', turn: Math.PI, at: [-0.05, 0, 0], parts: { 'bouton-0': { from: 'bouton-0', pivot: [0.082, 0.055, 0] } } },
  // couché en travers : les fentes le long de X, le levier sur le côté (+X)
  'grille-pain': { model: 'grille-pain', turn: Math.PI / 2, parts: { levier: { from: 'levier', drop: 0.04 } } },
  poubelle: { model: 'poubelle' },
  chaise: { model: 'chaise-cuisine' },
  // la table basse de Tripo, montée à hauteur de table : seuls les pieds s'allongent, le plateau garde son épaisseur
  table: { model: 'table-basse', turn: Math.PI / 2, stretch: [0.3, 0.37] },

  // —— les autres pièces (pieces.ts) ; leurs pièces mobiles sont réglées dans rigs.ts
  ...Object.fromEntries(Object.entries(ROOM_RIGS).filter(([id]) => id !== 'rideau').map(([id, rig]) => [id, rig.look])),
  canape: { model: 'canape' },
  fauteuil: { model: 'fauteuil' },
  'table-basse': { model: 'table-basse-salon' },
  'meuble-tele': { model: 'console' },
  // un peu réduite : sur le meuble télé, l'écran arrive à hauteur des yeux du canapé
  television: { model: 'television', scale: [0.8, 0.8, 0.8], parts: { ecran: { from: 'ecran' } } },
  bibliotheque: { model: 'bibliotheque' },
  coussin: { model: 'coussin' },
  telecommande: { model: 'telecommande' },
  reveil: { model: 'reveil' },
  sansevieria: { model: 'sansevieria' },
  pull: { model: 'pull-plie' },
  cintre: { model: 'vetement-cintre' },
  lavabo: { model: 'lavabo' },
  'porte-serviettes': { model: 'porte-serviettes' },
  serviette: { model: 'serviette-etendue' },
  'verre-dents': { model: 'verre-dents' },
  'brosse-dents': { model: 'brosse-dents' },
  'savon-pain': { model: 'savon-pain' },
  'gel-douche': { model: 'flacon-douche' },
  'papier-toilette': { model: 'papier-toilette' },
  'porte-parapluies': { model: 'porte-parapluies' },
  parapluie: { model: 'parapluie' },
  chaussure: { model: 'chaussure' },
  chausson: { model: 'chausson' },
  botte: { model: 'botte-pluie' },
  // la lettre du jeu est en long selon Z
  lettre: { model: 'lettre', turn: Math.PI / 2 },
  etabli: { model: 'etabli' },
  'etagere-garage': { model: 'etagere-garage' },
  carton: { model: 'carton' },
  beche: { model: 'beche' },
  rateau: { model: 'rateau' },
};

/** Les modèles chargés : chaque pièce (nœud) avec sa géométrie dans le repère du modèle. */
interface Model {
  parts: Map<string, THREE.BufferGeometry>;
  material: THREE.Material;
}
let models: Map<string, Model> | null = null;
let loading: Promise<void> | null = null;

/** Charge les fichiers une seule fois ; s'il en manque (tests, hors ligne), ces objets restent faits par programme. */
export function loadTripo(): Promise<void> {
  const out = new Map<string, Model>();
  loading ??= Promise.all(TRIPO_PACKS.map((pack) => loadPack(pack, out))).then(() => {
    models = out;
  });
  return loading;
}

function loadPack(pack: string, out: Map<string, Model>): Promise<void> {
  return new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(packUrl(pack))
    .then((gltf) => {
      for (const node of gltf.scene.children) {
        node.updateMatrixWorld(true);
        const parts = new Map<string, THREE.BufferGeometry>();
        let material: THREE.Material | null = null;
        node.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const m = o.material as THREE.MeshStandardMaterial;
          // le modèle est une coque : ses faces se voient aussi de dedans, porte ouverte
          material ??= Object.assign(createToonMaterial({ color: 0xffffff, map: m.map, rimStrength: 0, soft: true }), { side: THREE.DoubleSide });
          parts.set(o === node || o.parent === gltf.scene ? node.name : nodeName(gltf, o), plain(o.geometry).applyMatrix4(o.matrixWorld));
        });
        // l'usure (durability.ts) change la texture : pas sur un modèle peint
        if (material) {
          (material as THREE.Material).userData.noWear = true;
          out.set(node.name, { parts, material });
        }
      }
    })
    .catch((e) => console.warn(`modèles Tripo (${pack}) non chargés`, e));
}

/**
 * Nom d'un nœud tel qu'écrit dans le fichier. Le chargeur rend uniques les noms répétés d'un même
 * fichier (la deuxième « porte » devient « porte_1 ») : sans le vrai nom, la porte du modèle ne serait
 * pas reconnue, resterait collée au meuble et la porte faite par programme s'ajouterait par-dessus.
 */
function nodeName(gltf: GLTF, o: THREE.Object3D): string {
  const i = gltf.parser.associations.get(o)?.nodes;
  return (i !== undefined && (gltf.parser.json.nodes[i]?.name as string | undefined)) || o.name;
}

/**
 * Le modèle `name` en entier (toutes ses pièces), pour le décor fixe d'une pièce : tapis, miroir,
 * patères. Repère du modèle : posé au sol, l'avant vers +Z. Null s'il n'est pas chargé.
 */
export function tripoDecor(name: string): THREE.Group | null {
  const src = models?.get(name);
  if (!src) return null;
  const g = new THREE.Group();
  g.name = `decor-${name}`;
  for (const geo of src.parts.values()) g.add(meshOf(geo, src.material));
  return g;
}

/** Vrai si la fiche est habillée par un modèle Tripo (et qu'il est chargé). */
export function hasTripoLook(id: string): boolean {
  return !!models && id in TRIPO_LOOKS && models.has(TRIPO_LOOKS[id].model);
}

/** Géométries du modèle d'une fiche, dans le repère de la fiche : le corps fixe, et chaque pièce mobile. */
const baked = new Map<string, { body: THREE.BufferGeometry; parts: Map<string, THREE.BufferGeometry>; pivots: Map<string, THREE.Vector3 | null> }>();

function bake(id: string, look: TripoLook, model: Model) {
  let b = baked.get(id);
  if (b) return b;
  const [s0, s1] = look.clip ?? [-Infinity, Infinity];
  const m = new THREE.Matrix4()
    .makeTranslation(...(look.at ?? [0, 0, 0]))
    .multiply(new THREE.Matrix4().makeTranslation(0, look.plinth ?? 0, 0))
    .multiply(new THREE.Matrix4().makeRotationY(look.turn ?? 0))
    .multiply(new THREE.Matrix4().makeScale(...(look.scale ?? [1, 1, 1])))
    .multiply(new THREE.Matrix4().makeTranslation(0, look.clip ? -s0 : 0, 0));
  const place = (g: THREE.BufferGeometry) => {
    const out = look.clip ? clipY(g, s0, s1) : g.clone();
    if (look.stretch) stretchY(out, ...look.stretch);
    return out.applyMatrix4(m);
  };
  const moving = new Set(Object.values(look.parts ?? {}).map((p) => p.from));
  const fixed = [...model.parts].filter(([name]) => !moving.has(name)).map(([, g]) => place(g));
  const parts = new Map<string, THREE.BufferGeometry>();
  const pivots = new Map<string, THREE.Vector3 | null>();
  for (const [name, p] of Object.entries(look.parts ?? {})) {
    const g = model.parts.get(p.from);
    if (!g) continue;
    parts.set(name, place(g));
    pivots.set(name, p.pivot ? new THREE.Vector3(...p.pivot).applyMatrix4(m) : null);
  }
  b = { body: merge(fixed), parts, pivots };
  baked.set(id, b);
  return b;
}

/** Les maillages sans nom sous `root` (hors des pièces nommées) : ceux que le modèle remplace. */
function plainMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.name) continue;
      if (c instanceof THREE.Mesh) out.push(c);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

function drop(meshes: THREE.Mesh[]): void {
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
}

function meshOf(g: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Habille le modèle `model` fait par programme pour la fiche `id` : le corps du modèle Tripo à la
 * place des pièces sans nom, ses pièces mobiles à la place de celles du jeu (même nom, posées sur
 * leur axe). Sans modèle chargé, rend `model` tel quel.
 */
export function dressTripo(id: string, model: THREE.Object3D): THREE.Object3D {
  const look = TRIPO_LOOKS[id];
  const src = look && models?.get(look.model);
  if (!src) return model;
  const b = bake(id, look, src);
  drop(plainMeshes(model));
  model.add(meshOf(b.body, src.material));
  if (look.plinth) {
    // socle sombre, en retrait sous l'appareil
    const box = new THREE.Box3().setFromBufferAttribute(b.body.getAttribute('position') as THREE.BufferAttribute);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(box.max.x - box.min.x - 0.02, look.plinth, box.max.z - box.min.z - 0.05), createToonMaterial({ color: 0x3a3330, rimStrength: 0 }));
    plinth.position.set((box.min.x + box.max.x) / 2, look.plinth / 2, (box.min.z + box.max.z) / 2 - 0.025);
    plinth.castShadow = plinth.receiveShadow = true;
    model.add(plinth);
  }
  for (const [name, g] of b.parts) {
    let part = model.getObjectByName(name);
    if (!part) {
      part = new THREE.Group();
      part.name = name;
      model.add(part);
    }
    drop(plainMeshes(part));
    const pivot = b.pivots.get(name);
    if (pivot) part.position.copy(pivot);
    else part.position.set(0, 0, 0);
    const mesh = meshOf(g, src.material);
    if (pivot) mesh.position.copy(pivot).negate();
    part.add(mesh);
    const d = look.parts?.[name]?.drop;
    if (d !== undefined) part.userData.drop = d;
    const motion = look.parts?.[name]?.motion;
    if (motion) {
      part.userData.motion = motion;
      // au repos (fermé, baissé) : l'abattant des toilettes, modélisé relevé, est rabattu
      poseMotion(part, motion, 0);
    }
  }
  // l'intérieur fait par programme (étagères, paniers) devient une pièce fixe comme les autres : regroupée (merge.ts)
  const inner: THREE.Object3D[] = [];
  model.traverse((o) => {
    if (o.name === 'dedans') inner.push(o);
  });
  for (const o of inner) o.name = '';
  return model;
}

/** Copie en nombres simples (la compression meshopt rend des attributs quantifiés et entrelacés), sans index. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

/** Fusion de géométries sans index aux mêmes attributs. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    if (!list.every((g) => g.getAttribute(name))) continue;
    const size = list[0].getAttribute(name).itemSize;
    const arr = new Float32Array(list.reduce((n, g) => n + g.getAttribute(name).count * size, 0));
    let k = 0;
    for (const g of list) {
      arr.set(g.getAttribute(name).array as Float32Array, k);
      k += g.getAttribute(name).count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** Allonge une géométrie en hauteur sous y : ce qui est dessous s'étire de `by`, ce qui est dessus monte d'autant. */
export function stretchY(g: THREE.BufferGeometry, y: number, by: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i);
    p.setY(i, v < y ? (v * (y + by)) / y : v + by);
  }
  p.needsUpdate = true;
  return g;
}

/**
 * Garde la tranche y0 ≤ y ≤ y1 d'une géométrie sans index : les triangles à cheval sont coupés net
 * (position, normale et coordonnées de texture interpolées), sans fente entre les deux tranches.
 */
export function clipY(g: THREE.BufferGeometry, y0: number, y1: number): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'].filter((n) => g.getAttribute(n));
  const attrs = names.map((n) => g.getAttribute(n));
  const sizes = attrs.map((a) => a.itemSize);
  const out: number[][] = names.map(() => []);
  type Vert = number[][];
  const vert = (i: number): Vert => attrs.map((a, k) => Array.from({ length: sizes[k] }, (_, c) => a.getComponent(i, c)));
  const lerp = (a: Vert, b: Vert, t: number): Vert => a.map((v, k) => v.map((x, c) => x + (b[k][c] - x) * t));
  // découpe d'un polygone par le plan y = h (garde le côté sign * (y - h) ≥ 0)
  const cut = (poly: Vert[], h: number, sign: number): Vert[] => {
    const res: Vert[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = sign * (a[0][1] - h), db = sign * (b[0][1] - h);
      if (da >= 0) res.push(a);
      if ((da >= 0) !== (db >= 0)) res.push(lerp(a, b, da / (da - db)));
    }
    return res;
  };
  const count = g.getAttribute('position').count;
  for (let i = 0; i < count; i += 3) {
    let poly = [vert(i), vert(i + 1), vert(i + 2)];
    if (Number.isFinite(y0)) poly = cut(poly, y0, 1);
    if (Number.isFinite(y1)) poly = cut(poly, y1, -1);
    for (let j = 1; j + 1 < poly.length; j++) {
      for (const v of [poly[0], poly[j], poly[j + 1]]) v.forEach((x, k) => out[k].push(...x));
    }
  }
  const res = new THREE.BufferGeometry();
  names.forEach((n, k) => res.setAttribute(n, new THREE.BufferAttribute(new Float32Array(out[k]), sizes[k])));
  return res;
}
