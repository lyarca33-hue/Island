/**
 * Sauter, grimper (les clips et la physique sont dans character.ts) :
 * - sauter : Espace, ou « Sauter » au menu du perso ; on retombe sur un meuble bas si on passe
 *   au-dessus ;
 * - grimper : « Grimper dessus » au menu d'un meuble d'une hauteur de table (les mains vides) ;
 *   au bord, on retombe.
 *
 * Game ne fait que brancher (menu, touche) par l'interface MouvementsHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';

export interface MouvementsHost {
  readonly character: Character;
  items(): WorldItem[];
  notice(text: string): void;
  /** Meuble (ou gros objet posé) qu'on contourne : on peut tenir dessus. */
  obstacle(item: WorldItem): boolean;
}

/** Hauteurs (m) d'un dessus sur lequel on grimpe : d'un banc à un plan de travail. */
const CLIMB_MIN = 0.35;
const CLIMB_MAX = 1.25;
/** Dessus assez grand pour y tenir debout (m, dans les deux sens). */
const CLIMB_SIZE = 0.4;
/** Au pied du meuble pour grimper, et sur le dessus une fois monté : distance au bord (m). */
const CLIMB_STAND = 0.38;
const CLIMB_IN = 0.28;
/** Plus grand demi-côté d'un meuble (m) : au-delà, il ne peut pas être sous le perso. */
const ITEM_REACH = 3;

export class Mouvements {
  private host: MouvementsHost;

  constructor(host: MouvementsHost) {
    this.host = host;
  }

  /** Branche les dessus des meubles au perso. */
  attach(): void {
    const c = this.host.character;
    c.ground = (x, z) => this.topAt(x, z);
  }

  /** Hauteur où l'on tient debout en (x, z) : le dessus du plus haut meuble, sinon le sol. */
  private topAt(x: number, z: number): number {
    let top = 0;
    const p = new THREE.Vector3();
    for (const it of this.host.items()) {
      const o = it.object.position;
      if (Math.abs(o.x - x) > ITEM_REACH || Math.abs(o.z - z) > ITEM_REACH || !this.host.obstacle(it)) continue;
      it.object.worldToLocal(p.set(x, o.y, z));
      const b = it.box;
      if (p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z) top = Math.max(top, o.y + b.max.y);
    }
    return top;
  }

  /** Peut-on grimper sur `item` ? (un meuble à hauteur de table, assez grand pour y tenir) */
  private climbable(item: WorldItem): boolean {
    if (!this.host.obstacle(item) || item.def.shower || item.def.heat || item.def.bike) return false;
    const b = item.box, top = item.object.position.y + b.max.y;
    return top >= CLIMB_MIN && top <= CLIMB_MAX && b.max.x - b.min.x >= CLIMB_SIZE && b.max.z - b.min.z >= CLIMB_SIZE;
  }

  menu(item: WorldItem | null, add: (label: string, run: () => boolean) => void): void {
    const c = this.host.character;
    if (!item) {
      if (c.canJump) add('Sauter', () => this.jump());
      return;
    }
    if (this.climbable(item)) add('Grimper dessus', () => this.climb(item, false));
  }

  jump(): boolean {
    return this.host.character.jump();
  }

  /** Va au pied de `item`, du côté le plus proche où il y a la place, et grimpe dessus. */
  climb(item: WorldItem, running: boolean): boolean {
    const c = this.host.character;
    if (c.carried.length) {
      this.host.notice('Pose d’abord ce que tu tiens pour grimper.');
      return false;
    }
    if (!c.canJump || !this.climbable(item)) return false;
    const o = item.object, b = item.box;
    const top = o.position.y + b.max.y;
    const mid = new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2);
    const half = new THREE.Vector3((b.max.x - b.min.x) / 2, 0, (b.max.z - b.min.z) / 2);
    // les quatre côtés (repère du meuble), le plus proche du perso d'abord
    const me = o.worldToLocal(c.position.clone().setY(o.position.y));
    const sides = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
    const world = (v: THREE.Vector3) => o.localToWorld(v.clone().setY(0)).setY(0);
    const spots = sides.map((n) => {
      const edge = mid.clone().add(new THREE.Vector3(n.x * half.x, 0, n.z * half.z));
      // en face du perso le long du côté, sans sortir du dessus
      if (n.x) edge.z = THREE.MathUtils.clamp(me.z, b.min.z + CLIMB_IN, b.max.z - CLIMB_IN);
      else edge.x = THREE.MathUtils.clamp(me.x, b.min.x + CLIMB_IN, b.max.x - CLIMB_IN);
      const inward = Math.min(CLIMB_IN, (n.x ? half.x : half.z) * 0.8);
      return { stand: world(edge.clone().addScaledVector(n, CLIMB_STAND)), on: world(edge.clone().addScaledVector(n, -inward)).setY(top) };
    });
    spots.sort((a, b2) => a.stand.distanceTo(c.position) - b2.stand.distanceTo(c.position));
    const spot = spots.find((s) => !c.nav?.blocked(s.stand) && !c.nav?.blockedAbove(s.on, top + 0.02));
    if (!spot) {
      this.host.notice('Pas de place pour grimper là.');
      return false;
    }
    return c.climbOnto(spot.stand, spot.on, running);
  }
}
