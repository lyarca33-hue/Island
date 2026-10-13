/**
 * Carte de test (`?test` dans l'adresse) : un sol plat quadrillé, sans île ni maison, avec un
 * exemplaire de chaque objet du catalogue posé en rangées, bien séparés, pour les inspecter un par
 * un. Les petits objets devant, les meubles et appareils derrière. La partie n'y est ni chargée ni
 * sauvée : la vraie partie reste intacte.
 */
import * as THREE from 'three';
import { LAY_FLAT, type WorldItem } from './items/carry';
import { createToonMaterial } from './toon';

export const CARTE_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');

/** Adresse de la carte de test, ou de la vraie partie (`on` faux). */
export function testMapUrl(on: boolean): string {
  const url = new URL(location.href);
  if (on) url.searchParams.set('test', '');
  else url.searchParams.delete('test');
  return url.toString().replace('test=', 'test');
}

/** Où le perso commence : au sud des rangées, tourné vers elles. */
export const TEST_START = new THREE.Vector3(0, 0, 3);

/** Demi-longueur d'une rangée (m), écart entre deux objets (petits, meubles) et allée entre deux rangées. */
const HALF = 12;
const GAP_SMALL = 0.8;
const GAP_BIG = 1.2;
const ALLEY = 2;
/** Bord avant de la première rangée (m, vers -z). */
const FIRST_ROW = 0;

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

/**
 * Range les objets en rangées le long de x, l'avant tourné vers le perso (+z) : d'abord les
 * portables, puis les meubles, dans l'ordre du catalogue (rangés par thème).
 */
export function layoutTestMap(items: WorldItem[]): void {
  let front = FIRST_ROW;
  for (const [list, gap] of [[items.filter((i) => i.def.portable), GAP_SMALL], [items.filter((i) => !i.def.portable), GAP_BIG]] as const) {
    let row: Array<{ item: WorldItem; box: THREE.Box3 }> = [];
    let width = 0;
    const flush = () => {
      if (!row.length) return;
      // la rangée centrée en x, chaque objet l'avant au bord de la rangée
      let x = -width / 2;
      let depth = 0;
      for (const { item, box } of row) {
        item.object.position.set(x - box.min.x, -box.min.y, front - box.max.z);
        x += box.max.x - box.min.x + gap;
        depth = Math.max(depth, box.max.z - box.min.z);
      }
      front -= depth + ALLEY;
      row = [];
      width = 0;
    };
    for (const item of list) {
      item.object.position.set(0, 0, 0);
      item.object.quaternion.identity();
      // couverts couchés à plat, comme dans la maison
      if (item.def.layFlat) item.object.quaternion.multiply(LAY_FLAT);
      item.object.updateMatrixWorld(true);
      const box = item.box.clone().applyMatrix4(item.object.matrixWorld);
      const w = box.max.x - box.min.x;
      if (row.length && width + gap + w > HALF * 2) flush();
      width += (row.length ? gap : 0) + w;
      row.push({ item, box });
    }
    flush();
  }
}
