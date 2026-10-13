/**
 * Carte de test (`?test` dans l'adresse) : un sol plat quadrillé, sans île ni maison, pour
 * inspecter un par un tous les modèles du jeu, posés en rangées bien séparées :
 * - les objets du catalogue (un exemplaire de chacun) : les petits sur des présentoirs à hauteur
 *   des yeux, les gros objets puis les meubles au sol ;
 * - derrière, la galerie : chaque modèle de chaque pack (public/packs), y compris les états des
 *   aliments (cuit, brûlé, périmé), rangés pack par pack avec une pancarte ; les petits aussi
 *   sur présentoirs. Ce sont des modèles à regarder, pas des objets du jeu.
 * La partie n'y est ni chargée ni sauvée : la vraie partie reste intacte.
 */
import * as THREE from 'three';
import { LAY_FLAT, type WorldItem } from './items/carry';
import { packModel, packSize } from './packs/assets';
import { type ModelName, PACK_SIZES, type PackId } from './packs/manifest';
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
const FIRST_ROW = 38;
/** Où le perso commence : devant la première rangée, tourné vers elle. */
export const TEST_START = new THREE.Vector3(0, 0, FIRST_ROW + 3);

/** Dessus des présentoirs (m) : les petits objets à hauteur des yeux du perso. */
const COUNTER_H = 1.35;
/** Épaisseur de la planche des présentoirs (m). */
const SHELF_T = 0.04;
/** Petit objet (sur présentoir) : sa plus grande dimension (m) au plus. */
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

/** Ce que la carte ajoute à la scène : présentoirs, galerie, pancartes ; et les présentoirs à contourner. */
export interface TestMap {
  group: THREE.Group;
  obstacles: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number }>;
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

/** Range des modèles en rangées le long de x, l'avant au bord de la rangée ; sur présentoirs si `counter`. */
class Rows {
  front = FIRST_ROW;
  readonly map: TestMap = { group: new THREE.Group(), obstacles: [] };
  private wood = createToonMaterial({ color: 0x9a7650, rimStrength: 0 });

  place(list: Entry[], o: { gap: number; half: number; counter: boolean }): void {
    let row: Entry[] = [];
    let width = 0;
    const flush = () => {
      if (!row.length) return;
      const lift = o.counter ? COUNTER_H : 0;
      const inset = o.counter ? 0.12 : 0;
      let x = -width / 2;
      let depth = 0;
      for (const { obj, box } of row) {
        obj.position.add(new THREE.Vector3(x - box.min.x, lift - box.min.y, this.front - inset - box.max.z));
        x += box.max.x - box.min.x + o.gap;
        depth = Math.max(depth, box.max.z - box.min.z);
      }
      if (o.counter) {
        // le présentoir : une longue planche à hauteur des yeux sur des pieds fins (on voit
        // dessous les rangées d'après), à contourner
        depth += inset * 2;
        const w = width + 0.6;
        const z = this.front - depth / 2;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, SHELF_T, depth), this.wood);
        top.position.set(0, COUNTER_H - SHELF_T / 2, z);
        this.map.group.add(top);
        const legs = Math.max(2, Math.ceil(w / 2) + 1);
        const leg = new THREE.BoxGeometry(0.04, COUNTER_H - SHELF_T, 0.04);
        for (let i = 0; i < legs; i++) {
          for (const dz of [-1, 1]) {
            const m = new THREE.Mesh(leg, this.wood);
            m.position.set(-w / 2 + 0.05 + ((w - 0.1) * i) / (legs - 1), (COUNTER_H - SHELF_T) / 2, z + dz * (depth / 2 - 0.04));
            this.map.group.add(m);
          }
        }
        const half = new THREE.Vector3(w / 2, 0, depth / 2);
        this.map.obstacles.push({ box: new THREE.Box3(half.clone().negate(), half.clone().setY(COUNTER_H)), pos: new THREE.Vector3(0, 0, z), yaw: 0 });
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
 * Pose les objets du jeu en rangées (petits sur présentoirs, puis gros, puis meubles), puis la
 * galerie des packs. Rend ce qu'il faut ajouter à la scène.
 */
export function buildTestMap(items: WorldItem[]): TestMap {
  const rows = new Rows();
  const all = items.map((item) => ({ item, e: itemEntry(item) }));
  const isSmall = ({ item, e }: (typeof all)[number]) => item.def.portable && small(e);
  rows.place(all.filter(isSmall).map((a) => a.e), { gap: GAP_SMALL, half: HALF_ITEMS, counter: true });
  rows.place(all.filter((a) => a.item.def.portable && !isSmall(a)).map((a) => a.e), { gap: GAP_BIG, half: HALF_ITEMS, counter: false });
  rows.place(all.filter((a) => !a.item.def.portable).map((a) => a.e), { gap: GAP_BIG, half: HALF_ITEMS, counter: false });

  // la galerie : pack par pack, une pancarte devant chaque pack
  const packs = Object.keys(PACK_SIZES) as PackId[];
  const gallery = packs.map((p) => ({ p, models: Object.keys(PACK_SIZES[p]).map((n) => packEntry(p, n)) }));
  for (const tiny of [true, false]) {
    const list = gallery.flatMap(({ p, models }) => {
      const these = models.filter((m) => small(m) === tiny);
      return these.length ? [sign(p), ...these] : [];
    });
    rows.place(list, { gap: tiny ? GAP_SMALL : GAP_BIG, half: HALF_GALLERY, counter: tiny });
    for (const e of list) rows.map.group.add(e.obj);
  }
  // les objets du jeu restent dans la scène du jeu ; seuls présentoirs et galerie sont ajoutés
  return rows.map;
}
