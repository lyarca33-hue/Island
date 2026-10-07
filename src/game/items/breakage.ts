/**
 * Objet qui se brise : il disparaît et laisse des éclats de ses propres couleurs, projetés
 * autour du point d'impact, qui rebondissent, glissent puis s'effacent. Un récipient plein
 * laisse aussi une flaque (café renversé).
 *
 * Fragilité (fiche de l'objet) : 1 très fragile, 10 très solide. Chance de casser en tombant :
 * breakChance().
 */
import * as THREE from 'three';
import type { WorldItem } from './carry';

const GRAVITY = 9.8;
/** Durée de vie des éclats (s), dont la fin passée à rétrécir. */
const LIFE = 3.2;
const FADE = 0.6;

/**
 * Chance qu'un objet lancé se casse en touchant le sol, selon sa fragilité (1 à 10) et la
 * vitesse du choc : 1 casse presque à coup sûr, 10 jamais ; un choc doux casse moins.
 */
export function breakChance(fragility: number, speed: number): number {
  const f = THREE.MathUtils.clamp(fragility, 1, 10);
  const base = (10 - f) / 9;
  const hard = THREE.MathUtils.clamp((speed - 1.5) / 3, 0, 1);
  return base * (0.35 + 0.65 * hard);
}

interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
}

/** Éclats d'un objet brisé ; update() rend faux quand tout a disparu. */
export class Debris {
  private shards: Shard[] = [];
  private puddle: THREE.Mesh | null = null;
  private t = 0;
  /** Hauteur de la surface où les éclats retombent. */
  private floor: number;
  readonly group = new THREE.Group();

  /**
   * `floor` : hauteur de la surface touchée ; `push` : vitesse de l'objet au choc (les éclats
   * continuent un peu dans ce sens). `shatter` faux : seulement le liquide renversé (objet intact).
   */
  constructor(item: WorldItem, floor: number, push = new THREE.Vector3(), shatter = true) {
    this.floor = floor;
    item.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(item.object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    // les pièces visibles de l'objet, et leur part de la taille : chacune donne des éclats
    const parts: THREE.Mesh[] = [];
    item.object.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && o.name !== 'liquide') parts.push(o as THREE.Mesh);
    });
    const count = shatter ? THREE.MathUtils.clamp(Math.round(span * 90), 8, 22) : 0;
    for (let i = 0; i < count; i++) {
      const part = parts[i % parts.length];
      const s = span * (0.16 + Math.random() * 0.2);
      const geo = Math.random() < 0.5 ? new THREE.TetrahedronGeometry(s * 0.6) : new THREE.BoxGeometry(s, s * 0.35, s * 0.7);
      const mesh = new THREE.Mesh(geo, part.material);
      mesh.castShadow = true;
      mesh.position.set(
        center.x + (Math.random() - 0.5) * size.x,
        Math.max(floor + s * 0.3, center.y + (Math.random() - 0.5) * size.y),
        center.z + (Math.random() - 0.5) * size.z,
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const out = mesh.position.clone().sub(center).setY(0);
      if (out.lengthSq() < 1e-6) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(0.8 + Math.random() * 1.6);
      const vel = new THREE.Vector3(out.x, 1 + Math.random() * 2, out.z).addScaledVector(push.clone().setY(0), 0.3);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(20);
      this.shards.push({ mesh, vel, spin, size: s });
      this.group.add(mesh);
    }
    // récipient plein : le liquide se répand en flaque
    if (item.contents && item.level > 0.05) {
      const liquid = item.part('liquide') as THREE.Mesh | undefined;
      const color = (liquid?.material as THREE.MeshToonMaterial | undefined)?.color ?? new THREE.Color(0x4a2c1a);
      this.puddle = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      this.puddle.position.set(center.x, floor + 0.004, center.z);
      this.puddle.scale.setScalar(0.01);
      this.puddle.userData.size = 0.07 + 0.09 * item.level;
      this.group.add(this.puddle);
    }
  }

  update(dt: number): boolean {
    this.t += dt;
    for (const s of this.shards) {
      const m = s.mesh;
      if (s.vel.lengthSq() > 1e-4 || m.position.y > this.floor + s.size * 0.2) {
        s.vel.y -= GRAVITY * dt;
        m.position.addScaledVector(s.vel, dt);
        m.rotation.x += s.spin.x * dt;
        m.rotation.y += s.spin.y * dt;
        m.rotation.z += s.spin.z * dt;
        // rebond amorti sur la surface, puis glissade freinée
        const low = this.floor + s.size * 0.2;
        if (m.position.y < low) {
          m.position.y = low;
          s.vel.y = Math.abs(s.vel.y) > 0.6 ? -s.vel.y * 0.3 : 0;
          s.vel.x *= 0.55;
          s.vel.z *= 0.55;
          s.spin.multiplyScalar(0.5);
          if (s.vel.y === 0 && s.vel.lengthSq() < 0.01) s.vel.set(0, 0, 0);
        }
      }
      const k = THREE.MathUtils.clamp((LIFE - this.t) / FADE, 0, 1);
      m.scale.setScalar(k);
    }
    if (this.puddle) {
      const grow = 1 - Math.pow(1 - Math.min(1, this.t / 1.2), 3);
      this.puddle.scale.setScalar(Math.max(0.01, this.puddle.userData.size * grow));
      // la flaque reste plus longtemps que les éclats, puis sèche
      const mat = this.puddle.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * THREE.MathUtils.clamp((LIFE * 2.5 - this.t) / 2, 0, 1);
    }
    const alive = this.t < (this.puddle ? LIFE * 2.5 : LIFE);
    if (!alive) this.dispose();
    return alive;
  }

  dispose(): void {
    for (const s of this.shards) s.mesh.geometry.dispose();
    if (this.puddle) {
      this.puddle.geometry.dispose();
      (this.puddle.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}

/**
 * Flaque d'eau seule, sans objet brisé (l'évier qui déborde) : elle s'étale, reste un moment,
 * puis sèche. Même usage que Debris (group, update, dispose).
 */
export class Spill {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private t = 0;
  private size: number;

  constructor(at: THREE.Vector3, color: THREE.ColorRepresentation, size: number) {
    this.size = size;
    this.mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.mesh.position.set(at.x, at.y + 0.004, at.z);
    this.mesh.scale.setScalar(0.01);
    this.group.add(this.mesh);
  }

  update(dt: number): boolean {
    this.t += dt;
    const grow = 1 - Math.pow(1 - Math.min(1, this.t / 1.5), 3);
    this.mesh.scale.setScalar(Math.max(0.01, this.size * grow));
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.8 * THREE.MathUtils.clamp((LIFE * 3 - this.t) / 2, 0, 1);
    const alive = this.t < LIFE * 3;
    if (!alive) this.dispose();
    return alive;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
