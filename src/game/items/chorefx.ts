/**
 * Ce qu'on voit pendant le ménage, à la tête de l'outil (voir chores.ts) : un peu de poussière qui
 * se soulève au balai, au plumeau ou à l'aspirateur, de la mousse sous l'éponge et la brosse, des
 * gouttes au passage de la serpillière, un nuage fin devant le spray. Quelques petites particules
 * qui s'effacent seules ; rien quand on ne fait pas le ménage.
 */
import * as THREE from 'three';
import type { ChoreKind } from './chores';

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  life: number;
  grow: number;
  opacity: number;
}

/** Par geste : particules par seconde, couleur, taille (m), durée de vie (s), opacité, vitesse de départ. */
const KINDS: Partial<Record<ChoreKind, { rate: number; color: number; size: number; life: number; opacity: number; rise: number; spread: number; grow: number }>> = {
  sweep: { rate: 9, color: 0xb9ae9c, size: 0.03, life: 1.1, opacity: 0.45, rise: 0.12, spread: 0.12, grow: 1.6 },
  vacuum: { rate: 4, color: 0xc9c2b6, size: 0.02, life: 0.5, opacity: 0.35, rise: 0.05, spread: 0.06, grow: 0.6 },
  dust: { rate: 12, color: 0xd8d2c6, size: 0.022, life: 1.4, opacity: 0.5, rise: 0.05, spread: 0.1, grow: 1.4 },
  mop: { rate: 6, color: 0xbfe0f2, size: 0.018, life: 0.7, opacity: 0.55, rise: 0.02, spread: 0.08, grow: 0.3 },
  scrub: { rate: 10, color: 0xffffff, size: 0.016, life: 1.2, opacity: 0.85, rise: 0.015, spread: 0.04, grow: 0.5 },
  wipeUp: { rate: 6, color: 0xffffff, size: 0.014, life: 1.0, opacity: 0.7, rise: -0.02, spread: 0.03, grow: 0.4 },
  brush: { rate: 10, color: 0xf2f8fb, size: 0.018, life: 1.0, opacity: 0.8, rise: 0.03, spread: 0.05, grow: 0.5 },
  spray: { rate: 30, color: 0xe6f4fb, size: 0.012, life: 0.45, opacity: 0.55, rise: 0, spread: 0.05, grow: 2.2 },
};

const MAX_BITS = 90;

export class ChoreFx {
  readonly group = new THREE.Group();
  private bits: Bit[] = [];
  private due = 0;
  private geo = new THREE.SphereGeometry(1, 6, 4);

  constructor() {
    this.group.name = 'menage-effets';
  }

  /**
   * Une image : `kind` le geste en cours (null : aucun), `head` la tête de l'outil (monde),
   * `aim` le point visé (le spray y envoie son nuage), `k` la part du geste (0 à 1).
   */
  update(dt: number, kind: ChoreKind | null, head: THREE.Vector3 | null, aim: THREE.Vector3 | null, k: number): void {
    const spec = kind ? KINDS[kind] : undefined;
    if (spec && head && k > 0.6) {
      this.due += spec.rate * dt;
      while (this.due >= 1 && this.bits.length < MAX_BITS) {
        this.due--;
        this.spawn(kind!, spec, head, aim);
      }
    } else this.due = 0;
    for (const b of this.bits) {
      b.age += dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      const u = b.age / b.life;
      b.mesh.scale.setScalar(b.mesh.userData.size * (1 + b.grow * u));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = b.opacity * (1 - u) * Math.min(1, b.age * 8);
    }
    const dead = this.bits.filter((b) => b.age >= b.life);
    for (const b of dead) {
      b.mesh.removeFromParent();
      (b.mesh.material as THREE.Material).dispose();
    }
    if (dead.length) this.bits = this.bits.filter((b) => b.age < b.life);
  }

  private spawn(kind: ChoreKind, spec: NonNullable<(typeof KINDS)[ChoreKind]>, head: THREE.Vector3, aim: THREE.Vector3 | null): void {
    const mat = new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo, mat);
    const r = () => (Math.random() - 0.5) * 2;
    mesh.position.copy(head).add(new THREE.Vector3(r() * spec.spread, Math.random() * 0.02, r() * spec.spread));
    const size = spec.size * (0.6 + 0.8 * Math.random());
    mesh.userData.size = size;
    mesh.scale.setScalar(size);
    mesh.renderOrder = 2;
    const vel = new THREE.Vector3(r() * 0.08, spec.rise * (0.5 + Math.random()), r() * 0.08);
    if (kind === 'spray' && aim) {
      // le nuage part de la buse vers la surface, en s'élargissant
      const dir = aim.clone().sub(head).normalize();
      mesh.position.copy(head).addScaledVector(dir, 0.08).setY(head.y + 0.1);
      vel.copy(dir).multiplyScalar(1.2 + Math.random() * 0.5).add(new THREE.Vector3(r() * 0.15, r() * 0.1 - 0.15, r() * 0.15));
    }
    this.group.add(mesh);
    this.bits.push({ mesh, vel, age: 0, life: spec.life * (0.7 + 0.6 * Math.random()), grow: spec.grow, opacity: spec.opacity });
  }

  /** Nombre de particules en vie (banc de test). */
  get count(): number {
    return this.bits.length;
  }
}
