/**
 * Objet qui se brise : il disparaît et laisse des éclats de ses propres couleurs, projetés
 * autour du point d'impact, qui rebondissent, glissent puis s'effacent. Tombés par terre, ils
 * restent au sol jusqu'à ce qu'on les balaie (sweep). Un récipient plein laisse aussi une flaque
 * (café renversé).
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
/** Une flaque essuyée s'efface en ce temps (s). */
const WIPE_FADE = 0.8;
/** Sous cette hauteur, la surface touchée est le sol : les éclats y restent (à balayer). */
const FLOOR_Y = 0.05;
/** Éclats ou miettes balayés : ils s'effacent en ce temps (s). */
const SWEEP_FADE = 0.4;

/** Saleté au sol qui se ramasse au balai : éclats d'un objet brisé, miettes. */
export interface FloorMess {
  readonly kind: 'éclats' | 'miettes';
  /** Coupant (verre, porcelaine) : marcher dessus fait mal. */
  readonly sharp: boolean;
  /** Où elle est, au sol. */
  readonly position: THREE.Vector3;
  /** Encore par terre (pas balayée). */
  readonly dirty: boolean;
  sweep(): void;
}

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
export class Debris implements FloorMess {
  private shards: Shard[] = [];
  private puddle: THREE.Mesh | null = null;
  private t = 0;
  readonly kind = 'éclats';
  /** Les éclats sont tombés par terre : ils restent jusqu'au coup de balai. */
  readonly keep: boolean;
  readonly sharp: boolean;
  readonly position: THREE.Vector3;
  /** Balayés : le temps de s'effacer (s), sinon null. */
  private sweeping: number | null = null;
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
    this.keep = shatter && floor < FLOOR_Y;
    this.sharp = (item.def.fragility ?? 5) <= 4;
    this.position = center.clone().setY(floor);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    // les pièces visibles de l'objet, et leur part de la taille : chacune donne des éclats
    const parts: THREE.Mesh[] = [];
    item.object.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && o.name !== 'liquide' && o.name !== 'gouttes') parts.push(o as THREE.Mesh);
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
      const k = this.keep ? (this.sweeping === null ? 1 : THREE.MathUtils.clamp(this.sweeping / SWEEP_FADE, 0, 1)) : THREE.MathUtils.clamp((LIFE - this.t) / FADE, 0, 1);
      m.scale.setScalar(k);
    }
    if (this.sweeping !== null) this.sweeping -= dt;
    if (this.puddle) {
      const grow = 1 - Math.pow(1 - Math.min(1, this.t / 1.2), 3);
      this.puddle.scale.setScalar(Math.max(0.01, this.puddle.userData.size * grow));
      // la flaque reste plus longtemps que les éclats, puis sèche
      const mat = this.puddle.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * THREE.MathUtils.clamp((LIFE * 2.5 - this.t) / 2, 0, 1);
    }
    const shardsLeft = this.keep ? this.sweeping === null || this.sweeping > 0 : this.t < LIFE;
    const alive = shardsLeft || (!!this.puddle && this.t < LIFE * 2.5);
    if (!alive) this.dispose();
    return alive;
  }

  /** Éclats encore par terre (à balayer). */
  get dirty(): boolean {
    return this.keep && this.sweeping === null && this.shards.length > 0;
  }

  /** Les éclats tombés par terre, en monde (pour s'y couper en marchant dessus). */
  get spread(): number {
    let r = 0.1;
    for (const s of this.shards) r = Math.max(r, Math.hypot(s.mesh.position.x - this.position.x, s.mesh.position.z - this.position.z));
    return Math.min(r, 0.6);
  }

  /** Balayés : ils s'effacent. */
  sweep(): void {
    if (this.sweeping === null) this.sweeping = SWEEP_FADE;
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
 * Flaque d'eau seule, sans objet brisé (l'évier qui déborde) : elle s'étale et reste là jusqu'à
 * ce qu'on l'essuie (wipe). Même usage que Debris (group, update, dispose).
 */
export class Spill {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private t = 0;
  private size: number;
  /** Essuyée : le temps de s'effacer (s), sinon null. */
  private fading: number | null = null;

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
    if (this.fading !== null) this.fading -= dt;
    mat.opacity = 0.8 * (this.fading === null ? 1 : THREE.MathUtils.clamp(this.fading / WIPE_FADE, 0, 1));
    const alive = this.fading === null || this.fading > 0;
    if (!alive) this.dispose();
    return alive;
  }

  /** Rayon de la flaque une fois étalée (m) : grande, elle demande la serpillière. */
  get radius(): number {
    return this.size;
  }

  /** Où est la flaque (au sol). */
  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  /** Encore là (pas essuyée) ? */
  get wet(): boolean {
    return this.fading === null;
  }

  /** Essuyée à l'éponge : elle s'efface. */
  wipe(): void {
    if (this.fading === null) this.fading = WIPE_FADE;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}

/** Miettes tombées par terre (manger debout) : elles restent jusqu'au coup de balai. */
export class Crumbs implements FloorMess {
  readonly group = new THREE.Group();
  readonly kind = 'miettes';
  readonly sharp = false;
  readonly position: THREE.Vector3;
  private sweeping: number | null = null;

  constructor(at: THREE.Vector3, color: THREE.ColorRepresentation) {
    this.position = at.clone().setY(0);
    const mat = new THREE.MeshToonMaterial({ color });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.16;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.011), mat);
      m.position.set(at.x + Math.cos(a) * r, 0.004, at.z + Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      this.group.add(m);
    }
  }

  update(dt: number): boolean {
    if (this.sweeping === null) return true;
    this.sweeping -= dt;
    const k = THREE.MathUtils.clamp(this.sweeping / SWEEP_FADE, 0, 1);
    for (const m of this.group.children) m.scale.setScalar(k);
    const alive = this.sweeping > 0;
    if (!alive) this.dispose();
    return alive;
  }

  get dirty(): boolean {
    return this.sweeping === null;
  }

  sweep(): void {
    if (this.sweeping === null) this.sweeping = SWEEP_FADE;
  }

  dispose(): void {
    for (const m of this.group.children) (m as THREE.Mesh).geometry.dispose();
    this.group.removeFromParent();
  }
}
