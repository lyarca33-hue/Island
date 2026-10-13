/**
 * Carte de test (`?test` dans l'adresse) : un sol plat quadrillé, sans île ni maison, pour
 * inspecter un par un tous les modèles du jeu, posés en rangées bien séparées :
 * - les objets du catalogue (un exemplaire de chacun) : les petits flottent à hauteur des yeux,
 *   les gros objets puis les meubles sont au sol ;
 * - derrière, la galerie : chaque modèle de chaque pack (public/packs), y compris les états des
 *   aliments (cuit, brûlé, périmé), rangés pack par pack avec une pancarte ; les petits aussi
 *   en l'air. Ce sont des modèles à regarder, pas des objets du jeu.
 * Pour rester fluide, seul ce qui est près du perso est dessiné (cullTestMap) : la galerie entière
 * fait près de 5 millions de triangles.
 * Tout au fond, la maison assemblée du kit Tripo (décor, on n'y entre pas).
 * Derrière le perso au départ, les pans de mur taillés dans le muret de la ville (pansMur.ts) : un
 * de chaque, et une petite maison montée avec, sans toit, où l'on entre par la porte.
 * La partie n'y est ni chargée ni sauvée : la vraie partie reste intacte.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LAY_FLAT, type WorldItem } from './items/carry';
import { FOOD_LOOKS } from './items/interior';
import { RETIRES } from './items/retires';
import { packModel, packSize } from './packs/assets';
import { type ModelName, PACK_SIZES, type PackId } from './packs/manifest';
import { createPan, PAN_HEIGHT, PAN_THICK, panObstacles, type PanKind } from './packs/pansMur';
import { createToonMaterial } from './toon';

export const CARTE_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

/** Adresse de la carte de test, ou de la vraie partie (`on` faux). */
export function testMapUrl(on: boolean): string {
  const url = new URL(location.href);
  if (on) url.searchParams.set('test', '');
  else url.searchParams.delete('test');
  return url.toString().replace('test=', 'test');
}

/** Bord avant de la première rangée (m) : les rangées s'enfoncent vers -z jusqu'au bout du carré où l'on marche. */
const FIRST_ROW = 42;
/** Où le perso commence : devant la première rangée, tourné vers elle. */
export const TEST_START = new THREE.Vector3(0, 0, FIRST_ROW + 3);

/** Hauteur (m) où flottent les petits objets : à hauteur du torse du perso. */
const FLOAT_H = 1.1;
/** Petit objet (qui flotte) : sa plus grande dimension (m) au plus. */
const SMALL = 0.7;
/** Demi-longueur d'une rangée (m), écarts entre deux objets (petits, gros) et allée entre deux rangées. */
const HALF_ITEMS = 20;
const HALF_GALLERY = 40;
const GAP_SMALL = 0.5;
const GAP_BIG = 1.2;
const ALLEY = 2;
/** Le pack de nourriture Quaternius est à une autre échelle (une pomme de 80 cm). */
const PACK_SCALE: Partial<Record<PackId, number>> = { nourriture: 0.12 };

/** Un modèle à ranger : l'objet, et sa boîte dans le repère du monde une fois tourné, posé à l'origine. */
interface Entry {
  obj: THREE.Object3D;
  box: THREE.Box3;
}

/** Ce que la carte ajoute à la scène (galerie, pancartes), et tout ce qui n'est dessiné que de près. */
export interface TestMap {
  group: THREE.Group;
  shown: Array<{ obj: THREE.Object3D; radius: number }>;
}

/** Le sol plat : herbe claire quadrillée tous les mètres (de quoi juger les tailles). */
export function createTestFloor(half: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9fbf7a';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#86a865';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(half * 2, half * 2);
  tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, createToonMaterial({ color: 0xffffff, map: tex, rimStrength: 0 }));
  mesh.name = 'sol-test';
  mesh.position.y = -0.002;
  return mesh;
}

/** Une pancarte debout (le nom d'un pack), tournée vers +z. */
function sign(text: string): Entry {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4ead2';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#6b4b2a';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = '#3b2a17';
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = 1.2, h = 0.225;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.y = h / 2 + 0.02;
  const obj = new THREE.Group();
  obj.add(board);
  return { obj, box: new THREE.Box3(new THREE.Vector3(-w / 2, 0, -0.01), new THREE.Vector3(w / 2, h + 0.02, 0.01)) };
}

/** Range des modèles en rangées le long de x, l'avant au bord de la rangée ; en l'air à hauteur des yeux si `float`. */
class Rows {
  front = FIRST_ROW;
  readonly map: TestMap = { group: new THREE.Group(), shown: [] };

  place(list: Entry[], o: { gap: number; half: number; float: boolean }): void {
    let row: Entry[] = [];
    let width = 0;
    const flush = () => {
      if (!row.length) return;
      const lift = o.float ? FLOAT_H : 0;
      let x = -width / 2;
      let depth = 0;
      for (const { obj, box } of row) {
        obj.position.add(new THREE.Vector3(x - box.min.x, lift - box.min.y, this.front - box.max.z));
        x += box.max.x - box.min.x + o.gap;
        depth = Math.max(depth, box.max.z - box.min.z);
      }
      this.front -= depth + ALLEY;
      row = [];
      width = 0;
    };
    for (const e of list) {
      const w = e.box.max.x - e.box.min.x;
      if (row.length && width + o.gap + w > o.half * 2) flush();
      width += (row.length ? o.gap : 0) + w;
      row.push(e);
    }
    flush();
  }
}

/** Un objet du catalogue, remis droit (couverts à plat) à l'origine. */
function itemEntry(item: WorldItem): Entry {
  item.object.position.set(0, 0, 0);
  item.object.quaternion.identity();
  if (item.def.layFlat) item.object.quaternion.multiply(LAY_FLAT);
  item.object.updateMatrixWorld(true);
  return { obj: item.object, box: item.box.clone().applyMatrix4(item.object.matrixWorld) };
}

/** Un modèle de pack, à sa taille (posé au sol et centré : voir manifest.ts). */
function packEntry(pack: PackId, name: string): Entry {
  const s = PACK_SCALE[pack] ?? 1;
  const obj = packModel(pack, name as ModelName<typeof pack>, { scale: s });
  obj.name = `${pack}/${name}`;
  const size = packSize(pack, name as ModelName<typeof pack>).multiplyScalar(s);
  return { obj, box: new THREE.Box3(new THREE.Vector3(-size.x / 2, 0, -size.z / 2), new THREE.Vector3(size.x / 2, size.y, size.z / 2)) };
}

const small = (e: Entry) => {
  const s = e.box.getSize(new THREE.Vector3());
  return Math.max(s.x, s.y, s.z) <= SMALL;
};

/**
 * Pose les objets du jeu en rangées (petits en l'air, puis gros, puis meubles), puis la
 * galerie des packs. Rend ce qu'il faut ajouter à la scène.
 */
export function buildTestMap(items: WorldItem[]): TestMap {
  const rows = new Rows();
  const all = items.map((item) => ({ item, e: itemEntry(item) }));
  const isSmall = ({ item, e }: (typeof all)[number]) => item.def.portable && small(e);
  rows.place(all.filter(isSmall).map((a) => a.e), { gap: GAP_SMALL, half: HALF_ITEMS, float: true });
  rows.place(all.filter((a) => a.item.def.portable && !isSmall(a)).map((a) => a.e), { gap: GAP_BIG, half: HALF_ITEMS, float: false });
  rows.place(all.filter((a) => !a.item.def.portable).map((a) => a.e), { gap: GAP_BIG, half: HALF_ITEMS, float: false });

  // la galerie : pack par pack, une pancarte devant chaque pack
  const packs = Object.keys(PACK_SIZES) as PackId[];
  // sans les modèles qui n'habillent que des objets retirés du jeu (retires.ts)
  const look = (id: string) => `${FOOD_LOOKS[id].pack ?? 'nourriture'}/${FOOD_LOOKS[id].model}`;
  const kept = new Set(Object.keys(FOOD_LOOKS).filter((id) => !RETIRES.has(id)).map(look));
  const gone = new Set(Object.keys(FOOD_LOOKS).filter((id) => RETIRES.has(id)).map(look).filter((m) => !kept.has(m)));
  const gallery = packs.map((p) => ({ p, models: Object.keys(PACK_SIZES[p]).filter((n) => !gone.has(`${p}/${n}`)).map((n) => packEntry(p, n)) }));
  for (const tiny of [true, false]) {
    const list = gallery.flatMap(({ p, models }) => {
      const these = models.filter((m) => small(m) === tiny);
      return these.length ? [sign(p), ...these] : [];
    });
    rows.place(list, { gap: tiny ? GAP_SMALL : GAP_BIG, half: HALF_GALLERY, float: tiny });
    for (const e of list) {
      rows.map.group.add(e.obj);
      rows.map.shown.push({ obj: e.obj, radius: e.box.getSize(new THREE.Vector3()).length() / 2 });
    }
  }
  addWalls(rows.map);
  // les objets du jeu restent dans la scène du jeu ; seule la galerie est ajoutée
  return rows.map;
}

/**
 * La maison assemblée du kit Tripo (`public/models/maison-kit.glb` : murs, toits, lucarnes,
 * cheminées, porte, fenêtres, volets, porche, marches, balcon, jardinières, glycine), posée au fond,
 * derrière la galerie, porte vers les rangées (+z). Elle sort du modèle à l'échelle du jeu, le bas à y = 0, le
 * corps de logis (14 m) centré en x = z = 0 et l'aile vers +x : on la déplace seulement. Décor : on
 * n'y entre pas.
 */
export const TEST_HOUSE = new THREE.Vector3(-2, 0, -40);

/** Ce qui bloque le passage : les murs du corps de logis et de l'aile (le porche et les marches restent libres). */
export const TEST_HOUSE_BOX = new THREE.Box3(new THREE.Vector3(-7, 0, -3.9), new THREE.Vector3(11.3, 8, 3.5));

/** Charge la maison de test dans un groupe déjà posé à sa place (vide tant qu'elle n'est pas chargée). */
export function createTestHouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'maison-test';
  group.position.copy(TEST_HOUSE);
  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(`${import.meta.env.BASE_URL}models/maison-kit.glb`)
    .then((gltf) => {
      const mats = new Map<THREE.Material, THREE.Material>();
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        // le modèle allégé n'a plus ses normales : sans elles, tout sort noir
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        const m = o.material as THREE.MeshStandardMaterial;
        if (!mats.has(m)) {
          if (m.map) m.map.anisotropy = 8;
          mats.set(m, createToonMaterial({ color: m.color, map: m.map, rimStrength: 0, soft: true }));
        }
        o.material = mats.get(m)!;
        o.castShadow = o.receiveShadow = true;
      });
      group.add(gltf.scene);
    })
    .catch((e) => console.warn('maison de test non chargée', e));
  return group;
}

/** Un pan de mur posé (repère de la carte) : centre au sol, lacet, hauteur du bas. */
interface PanSpot {
  kind: PanKind;
  x: number;
  z: number;
  yaw?: number;
  y?: number;
}

/** Où sont les pans de mur : en rangée, puis la maison montée avec (centre, en m). */
const PANS_ROW_Z = 50;
const PANS_HOUSE = new THREE.Vector3(7, 0, 53);

/**
 * Les pans de mur de la carte de test : un de chaque en rangée, puis une maison de 6 × 4 m (dedans)
 * montée avec, porte vers le départ du perso (-z), un pignon sur chaque petit côté.
 */
export const TEST_PANS: PanSpot[] = (() => {
  const row: PanSpot[] = [
    { kind: 'mur', x: -14, z: PANS_ROW_Z },
    { kind: 'mur-fenetre', x: -11.5, z: PANS_ROW_Z },
    { kind: 'mur-porte', x: -9, z: PANS_ROW_Z },
    { kind: 'pignon', x: -5, z: PANS_ROW_Z },
  ];
  // les grands côtés passent devant les bouts des petits : les coins se ferment
  const d = 2 + PAN_THICK / 2, side = 3 - PAN_THICK / 2, q = Math.PI / 2;
  const house: PanSpot[] = [
    { kind: 'mur-fenetre', x: -2, z: -d },
    { kind: 'mur-porte', x: 0, z: -d },
    { kind: 'mur-fenetre', x: 2, z: -d },
    { kind: 'mur', x: -2, z: d },
    { kind: 'mur-fenetre', x: 0, z: d },
    { kind: 'mur', x: 2, z: d },
    { kind: 'mur', x: -side, z: -1, yaw: q },
    { kind: 'mur-fenetre', x: -side, z: 1, yaw: q },
    { kind: 'mur-fenetre', x: side, z: -1, yaw: q },
    { kind: 'mur', x: side, z: 1, yaw: q },
    { kind: 'pignon', x: -side, z: 0, yaw: q, y: PAN_HEIGHT },
    { kind: 'pignon', x: side, z: 0, yaw: q, y: PAN_HEIGHT },
  ];
  return [...row, ...house.map((p) => ({ ...p, x: p.x + PANS_HOUSE.x, z: p.z + PANS_HOUSE.z }))];
})();

/** Ce qui bloque le passage dans les pans de mur (la porte de la maison laisse entrer). */
export const TEST_PAN_OBSTACLES = TEST_PANS.flatMap((p) =>
  panObstacles(p.kind).map((box) => ({ box, pos: new THREE.Vector3(p.x, p.y ?? 0, p.z), yaw: p.yaw ?? 0 })),
);

/** Pose les pans de mur (et leur pancarte) sur la carte. */
function addWalls(map: TestMap): void {
  const label = sign('pans de mur');
  label.obj.position.set(-16.5, FLOAT_H, PANS_ROW_Z + 0.6);
  label.obj.rotation.y = Math.PI;
  map.group.add(label.obj);
  map.shown.push({ obj: label.obj, radius: 1 });
  for (const p of TEST_PANS) {
    const pan = createPan(p.kind);
    pan.position.set(p.x, p.y ?? 0, p.z);
    pan.rotation.y = p.yaw ?? 0;
    map.group.add(pan);
    map.shown.push({ obj: pan, radius: p.kind === 'pignon' ? 2.2 : 1.8 });
  }
}

/** Distance (m, au sol) jusqu'où les modèles de la carte de test sont dessinés autour du perso. */
const SHOW_RADIUS = 18;

/**
 * Ne dessine que les modèles de la galerie et les objets du jeu proches de `at` (le perso) : les
 * autres sont cachés, ils réapparaissent quand on s'approche.
 */
export function cullTestMap(map: TestMap, items: WorldItem[], at: THREE.Vector3): void {
  const near = (o: THREE.Object3D, radius: number) => Math.hypot(o.position.x - at.x, o.position.z - at.z) - radius < SHOW_RADIUS;
  for (const { obj, radius } of map.shown) obj.visible = near(obj, radius);
  for (const it of items) it.object.visible = near(it.object, it.size.length() / 2);
}

/**
 * Modèles signalés « à retirer du jeu » sur la carte de test (touche A sur le modèle visé), gardés
 * dans le navigateur. Menu → Partie les envoie à Claude, qui les retire ensuite.
 * Un repère par modèle : `objet <id> (<nom>)` pour un objet du jeu, `pack <pack>/<modèle>` pour la galerie.
 */
/** Les deux listes : à retirer du jeu (touche A), à corriger (touche E). */
export type FlagKind = 'retirer' | 'corriger';
const FLAGS_KEY: Record<FlagKind, string> = { retirer: 'rp-island-a-retirer', corriger: 'rp-island-a-corriger' };
const flagListeners = new Set<() => void>();

export function loadFlags(kind: FlagKind = 'retirer'): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FLAGS_KEY[kind]) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveFlags(kind: FlagKind, flags: string[]): void {
  try {
    localStorage.setItem(FLAGS_KEY[kind], JSON.stringify(flags));
  } catch {
    // stockage indisponible : la liste dure le temps de la page
  }
  for (const f of flagListeners) f();
}

/** Signale le modèle `ref`, ou le retire de la liste s'il y était ; vrai s'il est maintenant signalé. */
export function toggleFlag(ref: string, kind: FlagKind = 'retirer'): boolean {
  const flags = loadFlags(kind);
  const on = !flags.includes(ref);
  saveFlags(kind, on ? [...flags, ref] : flags.filter((f) => f !== ref));
  return on;
}

export function clearFlags(kind: FlagKind = 'retirer'): void {
  saveFlags(kind, []);
}

/** Prévient `fn` à chaque changement de la liste ; rend de quoi arrêter. */
export function onFlags(fn: () => void): () => void {
  flagListeners.add(fn);
  return () => flagListeners.delete(fn);
}

/** Le repère du modèle de la galerie touché par le rayon (null : aucun), et sa distance. */
export function galleryHit(map: TestMap, ray: THREE.Raycaster): { ref: string; distance: number } | null {
  const shown = map.shown.filter((s) => s.obj.visible && s.obj.name).map((s) => s.obj);
  const hit = ray.intersectObjects(shown, true)[0];
  if (!hit) return null;
  let o: THREE.Object3D | null = hit.object;
  while (o && o.parent !== map.group) o = o.parent;
  return o?.name ? { ref: `pack ${o.name}`, distance: hit.distance } : null;
}
