/**
 * Sauter, nager, grimper (les clips et la physique sont dans character.ts, l'étang dans nage.ts) :
 * - sauter : Espace, ou « Sauter » au menu du perso ; on retombe sur un meuble bas si on passe
 *   au-dessus ;
 * - nager : « Nager » au menu de l'étang (les mains vides) : le perso plonge depuis la rive, nage
 *   au clavier ou au clic, et remonte sur la rive en y arrivant ;
 * - grimper : « Grimper dessus » au menu d'un meuble d'une hauteur de table (les mains vides) ;
 *   au bord, on retombe ;
 * - couper du bois : la hache en main, « Couper du bois » au menu du perso près d'un arbre du
 *   jardin : quelques coups, et une bûche (un siège à pousser près du feu) tombe au pied de l'arbre.
 *
 * Game ne fait que brancher (menu, touche) par l'interface MouvementsHost.
 */
import * as THREE from 'three';
import type { Character } from './character';
import type { WorldItem } from './items/carry';
import { Pond } from './nage';
import { DOCK_L } from './items/plein-air';
import { OAKS, PINES } from './jardin';

export interface MouvementsHost {
  readonly character: Character;
  items(): WorldItem[];
  notice(text: string): void;
  /** Meuble (ou gros objet posé) qu'on contourne : on peut tenir dessus. */
  obstacle(item: WorldItem): boolean;
  /** Fait apparaître l'objet `id` posé en `at` (monde), tourné de `yaw`. */
  spawn(id: string, at: THREE.Vector3, yaw: number): WorldItem | null;
  mood(n: number): void;
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
/** Couper du bois : distance max à l'arbre pour le proposer (m), où se tenir (m du tronc), durée (s). */
const TREE_NEAR = 6;
const CHOP_STAND = 1.05;
const CHOP_TIME = 3.9;
/** Au-delà de tant de bûches posées dans le jardin, on a assez de bois. */
const LOGS_MAX = 12;
const TREES = [...OAKS, ...PINES].map(([x, z]) => new THREE.Vector3(x, 0, z));

export class Mouvements {
  private host: MouvementsHost;
  private pond: WorldItem | null = null;

  constructor(host: MouvementsHost) {
    this.host = host;
  }

  /** Branche l'étang et les dessus des meubles au perso. */
  attach(items: WorldItem[]): void {
    const c = this.host.character;
    this.pond = items.find((i) => i.def.id === 'etang') ?? null;
    const dock = items.find((i) => i.def.id === 'ponton');
    c.water = this.pond ? new Pond(dock ? { x: dock.object.position.x, end: dock.object.position.z + DOCK_L / 2 } : null) : null;
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
    if (!this.host.obstacle(item) || item.def.shower || item.def.heat) return false;
    const b = item.box, top = item.object.position.y + b.max.y;
    return top >= CLIMB_MIN && top <= CLIMB_MAX && b.max.x - b.min.x >= CLIMB_SIZE && b.max.z - b.min.z >= CLIMB_SIZE;
  }

  menu(item: WorldItem | null, add: (label: string, run: () => boolean) => void): void {
    const c = this.host.character;
    if (!item) {
      if (c.swimming) add('Sortir de l’eau', () => this.leaveWater());
      else if (c.canJump) add('Sauter', () => this.jump());
      if (this.axe() && this.nearestTree()) add('Couper du bois', () => this.chop(false));
      return;
    }
    if (item === this.pond && !c.swimming) add('Nager', () => this.swim(false));
    if (this.climbable(item) && !c.swimming) add('Grimper dessus', () => this.climb(item, false));
  }

  /** La hache tenue (seule dans la main). */
  private axe(): WorldItem | undefined {
    return this.host.character.heldItems.find((h) => h.def.id === 'hache');
  }

  /** L'arbre le plus proche du perso, s'il est assez près. */
  private nearestTree(): THREE.Vector3 | null {
    const at = this.host.character.position;
    const tree = TREES.reduce<THREE.Vector3 | null>((best, t) => (!best || t.distanceTo(at) < best.distanceTo(at) ? t : best), null);
    return tree && tree.distanceTo(at) < TREE_NEAR ? tree : null;
  }

  /** Va au pied de l'arbre le plus proche, la hache en main, et en coupe une bûche. */
  chop(running: boolean): boolean {
    const c = this.host.character;
    const axe = this.axe();
    if (!axe) {
      this.host.notice('Prends la hache pour couper du bois.');
      return false;
    }
    const tree = this.nearestTree();
    if (!tree) {
      this.host.notice('Approche-toi d’un arbre pour couper du bois.');
      return false;
    }
    if (this.host.items().filter((i) => i.def.id === 'buche').length >= LOGS_MAX) {
      this.host.notice('Il y a déjà bien assez de bois coupé.');
      return false;
    }
    if (c.swimming || c.busy) return false;
    // du côté d'où l'on vient (sinon le premier côté libre autour du tronc)
    const from = c.position.clone().sub(tree).setY(0);
    const a0 = Math.atan2(from.x, from.z);
    let stand: THREE.Vector3 | null = null;
    for (let i = 0; i < 12 && !stand; i++) {
      const a = a0 + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * (Math.PI / 6);
      const p = tree.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(CHOP_STAND));
      if (!c.nav?.blocked(p)) stand = p;
    }
    if (!stand) {
      this.host.notice('Pas de place autour de cet arbre.');
      return false;
    }
    const spot = stand;
    c.approachThen(spot, tree, () => {
      if (!this.axe()) return;
      c.work('chop', () => {
        // la bûche tombe à côté du perso, au pied de l'arbre
        const side = new THREE.Vector3(spot.z - tree.z, 0, tree.x - spot.x).normalize();
        const at = tree.clone().lerp(spot, 0.5).addScaledVector(side, 0.55);
        if (!this.host.spawn('buche', at, Math.atan2(side.x, side.z))) return;
        this.host.mood(1);
        this.host.notice('Une bûche de plus : pousse-la près du feu de camp pour t’y asseoir.');
      }, CHOP_TIME, axe);
    }, running);
    return true;
  }

  jump(): boolean {
    const c = this.host.character;
    if (c.swimming) return false;
    return c.jump();
  }

  leaveWater(): boolean {
    const c = this.host.character;
    if (c.leaveWater()) return true;
    this.host.notice('Pas de place sur la rive pour sortir de l’eau.');
    return false;
  }

  /** Va plonger dans l'étang depuis la rive la plus proche. */
  swim(running: boolean): boolean {
    const c = this.host.character;
    const water = c.water;
    if (!water || c.swimming) return false;
    if (c.carried.length) {
      this.host.notice('Pose d’abord ce que tu tiens pour nager.');
      return false;
    }
    if (!c.canJump) return false;
    const spot = water.entry(c.position, (p) => !c.nav?.blocked(p));
    if (!spot) {
      this.host.notice('Pas de place sur la rive pour plonger.');
      return false;
    }
    return c.swimIn(spot.bank, spot.water, running);
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
