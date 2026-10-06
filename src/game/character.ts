/**
 * Perso 3D jouable : un modèle glTF skinné (squelette aux noms d'os Mixamo, comme les héros
 * d'Arena Tactic), repeint en cel shading, avec ses clips (repos, marche, course...).
 *
 * Modèle de départ : « X Bot » (Mixamo, fourni avec les exemples de three.js), en attendant
 * nos propres persos. Tout modèle au squelette Mixamo peut le remplacer sans toucher au code
 * des déplacements.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Puppet } from '../creator/puppet';
import type { Recipe } from '../creator/recipe';
import { Carry, type WorldItem } from './items/carry';
import { Rig } from './items/ik';
import type { Nav } from './nav';
import { LAYER_CHARACTER } from './postfx';
import { createToonMaterial } from './toon';

export const CHARACTER_URL = `${import.meta.env.BASE_URL}models/xbot.glb`;

/** Vitesses de déplacement (m/s) accordées aux clips du modèle (pieds qui ne glissent pas). */
const WALK_SPEED = 1.6;
const RUN_SPEED = 4.2;
/** Vitesse de rotation vers la direction de marche (rad/s, lissage exponentiel). */
const TURN_RATE = 12;

/** Couleurs cel shading par matériau d'origine du modèle (corps clair, articulations sombres). */
const PALETTE: Record<string, THREE.ColorRepresentation> = {
  Beta_Joints_MAT: 0x3b3f6e,
  'asdf1:Beta_HighLimbsGeoSG2': 0xe0cfb4,
};

type Gait = 'idle' | 'walk' | 'run';

export class Character {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private gait: Gait = 'idle';
  private current: THREE.AnimationAction | null = null;
  /** Direction de déplacement voulue (plan XZ, normée ou nulle) et allure. */
  private move = new THREE.Vector3();
  private running = false;
  /** Point visé par un clic (null : pas de destination), puis les suivants pour contourner. */
  private target: THREE.Vector3 | null = null;
  private path: THREE.Vector3[] = [];
  /** Meubles à contourner. */
  nav: Nav | null = null;
  private heading = 0;
  /** Perso du créateur (sinon : X Bot). */
  private puppet: Puppet | null = null;
  /** Porter des objets (perso du créateur seulement). */
  private carry: Carry | null = null;
  /** Appelé quand la main se tend vers un objet (il est encore posé). */
  onGrab: ((item: WorldItem) => void) | null = null;
  /** En marche vers un objet ou un meuble : on se tourne vers `face` puis on fait `then`. */
  private approach: { face: THREE.Vector3; then: () => void } | null = null;

  /** Charge le perso du créateur (recette) ou, à défaut, X Bot. */
  async load(recipe?: Recipe | null): Promise<void> {
    if (recipe) {
      this.puppet = await Puppet.create(recipe);
      this.carry = new Carry(new Rig(this.puppet.vrm));
      this.puppet.hook = this.carry;
      this.root.add(this.puppet.root);
      this.play('idle', 0);
      return;
    }
    const gltf = await new GLTFLoader().loadAsync(CHARACTER_URL);
    const model = gltf.scene;
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = createToonMaterial({ color: PALETTE[old.name] ?? old.color });
      old.dispose();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(LAYER_CHARACTER);
      // le modèle ne sort pas de sa boîte de repos tant qu'il est animé sur place
      mesh.frustumCulled = false;
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle', 0);
  }

  /** Noms des clips disponibles (gestes futurs de l'IA de RP : agree, headShake...). */
  get clips(): string[] {
    return this.puppet ? this.puppet.clips : [...this.actions.keys()];
  }

  /** Direction voulue au clavier (repère monde, plan XZ) ; annule la destination de clic. */
  setMoveInput(dir: THREE.Vector3, running: boolean): void {
    this.move.copy(dir);
    if (dir.lengthSq() > 0) {
      this.running = running;
      this.target = null;
      this.path = [];
      this.approach = null;
    }
  }

  /** Marche jusqu'à un point du sol (clic). */
  goTo(p: THREE.Vector3, running: boolean): void {
    this.setRoute(p);
    this.running = running;
    this.approach = null;
  }

  /** Chemin vers `to` en contournant les meubles (null : on s'arrête). */
  private setRoute(to: THREE.Vector3 | null): void {
    this.path = to ? (this.nav?.route(this.root.position, to) ?? [to.clone().setY(0)]) : [];
    this.target = this.path.shift() ?? null;
  }

  /** Objet tenu en main (ou null). */
  get held(): WorldItem | null {
    return this.carry?.held ?? null;
  }

  /** Objets portés : celui qu'on tient et ceux empilés dessus. */
  get carried(): WorldItem[] {
    return this.carry?.carried ?? [];
  }

  /** Accès à la prise (piles, rangement) ; null pour X Bot. */
  get hands(): Carry | null {
    return this.carry;
  }

  /**
   * Marche jusqu'à `stand` (null : ne bouge pas), se tourne vers `face`, puis appelle `then`.
   */
  approachThen(stand: THREE.Vector3 | null, face: THREE.Vector3, then: () => void, running = false): void {
    this.setRoute(stand);
    this.running = running;
    this.approach = { face: face.clone(), then };
  }

  /**
   * Où se placer pour attraper `item` : devant lui, du côté `from` (direction depuis l'objet ;
   * par défaut, celui d'où l'on vient).
   */
  standFor(item: WorldItem, from?: THREE.Vector3): THREE.Vector3 {
    const at = item.object.position.clone().setY(0);
    // plus près pour un objet au sol (on se penche moins loin)
    const stop = (item.object.position.y > 0.3 ? 0.36 : 0.22) + Math.max(item.size.x, item.size.z) / 2;
    const spot = (d: THREE.Vector3) => at.clone().addScaledVector(d.setY(0).normalize(), stop);
    if (from) return spot(from.clone());
    // du côté d'où l'on vient, sinon le côté libre (hors des meubles) le plus proche du perso
    const mine = this.root.position.clone().sub(at);
    if (mine.lengthSq() < 1e-6) mine.set(Math.sin(this.heading), 0, Math.cos(this.heading)).negate();
    const best = spot(mine.clone());
    if (!this.nav?.blocked(best)) return best;
    let pick: THREE.Vector3 | null = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = spot(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
      if (this.nav.blocked(p)) continue;
      if (!pick || p.distanceTo(this.root.position) < pick.distanceTo(this.root.position)) pick = p;
    }
    return pick ?? best;
  }

  /** Peut-on porter des objets avec ce perso ? (pas X Bot) */
  get canCarry(): boolean {
    return !!this.carry;
  }

  /** Va jusqu'à l'objet et le prend en main. Faux si impossible (mains prises, non portable). */
  pickUp(item: WorldItem, running = false, from?: THREE.Vector3): boolean {
    if (!this.carry || this.carry.held || this.carry.busy || !item.def.portable) return false;
    this.approachThen(this.standFor(item, from), item.object.position, () => {
      if (this.carry?.pickUp(item)) this.onGrab?.(item);
    }, running);
    return true;
  }

  /** Va prendre `item` pour l'ajouter à la pile tenue (livres). */
  collect(item: WorldItem, running = false, from?: THREE.Vector3): boolean {
    if (!this.carry?.canStack(item)) return false;
    this.approachThen(this.standFor(item, from), item.object.position, () => this.carry?.addToStack(item), running);
    return true;
  }

  /** Endroit où reposer l'objet tenu : devant soi (hauteur du sol, à corriger s'il y a un meuble). */
  dropSpot(): THREE.Vector3 | null {
    const item = this.carry?.held;
    if (!item || this.carry!.busy) return null;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    return this.root.position.clone().addScaledVector(fwd, 0.36 + Math.max(item.size.x, item.size.z) / 2).setY(0);
  }

  /** Repose l'objet tenu en `spot` (voir dropSpot), tourné comme le perso ou de `yaw`. */
  drop(spot: THREE.Vector3, yaw = this.heading, onDone?: () => void, upright = false): boolean {
    return !!this.carry && !this.carry.busy && this.carry.drop(spot, yaw, onDone, upright);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  update(dt: number, bounds: number): void {
    const dir = new THREE.Vector3();
    if (this.carry?.busy) {
      // pendant une saisie ou une dépose, le perso reste sur place
    } else if (this.move.lengthSq() > 0) dir.copy(this.move).normalize();
    else if (this.target) {
      dir.subVectors(this.target, this.root.position).setY(0);
      // point de passage atteint : le suivant (on coupe un peu les virages)
      if (dir.length() < (this.path.length ? 0.15 : 0.08)) {
        this.target = this.path.shift() ?? null;
        if (this.target) dir.subVectors(this.target, this.root.position).setY(0);
      }
      dir.normalize();
      if (!this.target) dir.set(0, 0, 0);
    }
    const moving = dir.lengthSq() > 0;
    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    if (moving) {
      const step = this.target ? Math.min(speed * dt, this.root.position.distanceTo(this.target)) : speed * dt;
      this.root.position.addScaledVector(dir, step);
      // au clavier, on glisse le long des meubles au lieu d'y entrer
      this.nav?.pushOut(this.root.position);
      this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -bounds, bounds);
      this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -bounds, bounds);
      const want = Math.atan2(dir.x, dir.z);
      let delta = want - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, dt * TURN_RATE);
      this.root.rotation.y = this.heading;
    } else if (this.approach) {
      // arrivé : se tourner vers l'objet (ou le meuble), puis agir
      const to = this.approach.face.clone().sub(this.root.position);
      let delta = Math.atan2(to.x, to.z) - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, dt * TURN_RATE * 0.6);
      this.root.rotation.y = this.heading;
      if (Math.abs(delta) < 0.06) {
        const then = this.approach.then;
        this.approach = null;
        then();
      }
    }
    this.setGait(moving ? (this.running ? 'run' : 'walk') : 'idle');
    this.mixer?.update(dt);
    this.puppet?.update(dt);
  }

  /** Expression du visage (perso du créateur seulement) : neutre, sourire, triste... */
  setExpression(key: string): void {
    this.puppet?.setExpression(key);
  }

  dispose(): void {
    this.puppet?.dispose();
  }

  private setGait(g: Gait): void {
    if (g === this.gait) return;
    this.gait = g;
    this.play(g, 0.25);
  }

  /** Joue un clip en fondu enchaîné depuis le clip courant. */
  play(name: string, fade: number): void {
    if (this.puppet) return this.puppet.play(name, fade);
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }
}
