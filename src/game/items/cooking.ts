/**
 * Cuisson : un ingrédient (steak, pomme de terre) posé dans un ustensile (poêle, casserole) sur
 * un feu allumé cuit peu à peu, de cru à cuit puis brûlé si on l'oublie. Dans l'eau (casserole),
 * il ne brûle pas tant qu'il en reste. La couleur des pièces nommées `cuit` suit la cuisson.
 *
 * Les appareils qui chauffent (gazinière, machine à café) s'allument et s'éteignent par la même
 * mécanique : voir ItemDef.heat et Game.tickHeat.
 */
import * as THREE from 'three';
import type { ItemDef } from './catalog';
import type { WorldItem } from './carry';
import { showWear } from './durability';

export type Doneness = 'cru' | 'cuit' | 'brûlé';

/** Où en est la cuisson après `t` secondes sur un feu à pleine chaleur. */
export function doneness(def: ItemDef, t: number): Doneness | null {
  const cook = def.cook;
  if (!cook) return null;
  return t < cook.seconds ? 'cru' : t < cook.seconds + cook.burn ? 'cuit' : 'brûlé';
}

/** Cuisson au plus haut dans l'eau : bien cuit, jamais brûlé. */
export function waterCap(def: ItemDef): number {
  const cook = def.cook!;
  return cook.seconds + cook.burn * 0.5;
}

/** « cru », « cuite », « brûlés »… accordé au nom. */
export function donenessWord(d: Doneness, feminine: boolean): string {
  return feminine ? `${d}e` : d;
}

/** Part de la faim rendue en mangeant : cru, ça ne se mange pas ; brûlé, presque rien. */
export const DONENESS_HUNGER: Record<Doneness, number> = { cru: 0, cuit: 1, 'brûlé': 0.3 };

const c0 = new THREE.Color();
const c1 = new THREE.Color();
const ratio = (now: number, raw: number) => Math.min(1, now / Math.max(raw, 0.05));

/** Couleur des pièces `cuit` : cru → cuit pendant la cuisson, puis cuit → brûlé sur la fin. */
export function showDoneness(item: WorldItem): void {
  const cook = item.def.cook;
  if (!cook) return;
  const t = item.cooking;
  const [raw, cooked, burnt] = cook.colors;
  if (t < cook.seconds) c0.set(raw).lerp(c1.set(cooked), t / cook.seconds);
  else {
    const k = THREE.MathUtils.clamp((t - waterCap(item.def)) / (cook.burn * 0.5), 0, 1);
    c0.set(cooked).lerp(c1.set(burnt), k);
  }
  // un aliment peint (modèle Tripo) : la texture est sa couleur crue, teintée de ce qui la sépare de la cuisson
  const tint = c1.set(raw);
  tint.setRGB(ratio(c0.r, tint.r), ratio(c0.g, tint.g), ratio(c0.b, tint.b));
  item.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.name !== 'cuit') return;
    const m = mesh.material as THREE.MeshToonMaterial;
    if (m.userData.cookTint) m.color.copy(tint);
    // showWear part de cette couleur de base (l'usure ternit par-dessus)
    else (m.userData.baseColor ??= new THREE.Color()).copy(c0);
  });
  showWear(item.object, item.condition);
}

/** Fumée (brûlé) ou vapeur (eau qui bout) : des bouffées qui montent, grossissent et s'effacent. */
export class Puffs {
  readonly group = new THREE.Group();
  private list: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; t: number; life: number; opacity: number }> = [];
  private geo = new THREE.SphereGeometry(0.03, 8, 6);
  /** Bouffées à lancer par source (temps accumulé). */
  private due = new Map<string, number>();

  /** Lance des bouffées depuis `at` (`perSecond` par seconde), sous la clé `key`. */
  emit(key: string, at: THREE.Vector3, dt: number, perSecond: number, color: THREE.ColorRepresentation, opacity: number): void {
    let due = (this.due.get(key) ?? Math.random()) + dt * perSecond;
    for (; due >= 1; due--) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
      this.group.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08);
      this.list.push({ mesh, vel, t: 0, life: 1.4 + Math.random() * 0.8, opacity });
    }
    this.due.set(key, due);
  }

  update(dt: number): void {
    for (const p of [...this.list]) {
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.list = this.list.filter((x) => x !== p);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(1 + k * 2.5);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.opacity * (1 - k);
    }
  }
}
