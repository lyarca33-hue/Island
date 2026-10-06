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
  /** Point visé par un clic (null : pas de destination). */
  private target: THREE.Vector3 | null = null;
  private heading = 0;
  /** Perso du créateur (sinon : X Bot). */
  private puppet: Puppet | null = null;

  /** Charge le perso du créateur (recette) ou, à défaut, X Bot. */
  async load(recipe?: Recipe | null): Promise<void> {
    if (recipe) {
      this.puppet = await Puppet.create(recipe);
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
    this.running = running;
    if (dir.lengthSq() > 0) this.target = null;
  }

  /** Marche jusqu'à un point du sol (clic). */
  goTo(p: THREE.Vector3, running: boolean): void {
    this.target = p.clone().setY(0);
    this.running = running;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  update(dt: number, bounds: number): void {
    const dir = new THREE.Vector3();
    if (this.move.lengthSq() > 0) dir.copy(this.move).normalize();
    else if (this.target) {
      dir.subVectors(this.target, this.root.position).setY(0);
      if (dir.length() < 0.08) this.target = null;
      dir.normalize();
      if (!this.target) dir.set(0, 0, 0);
    }
    const moving = dir.lengthSq() > 0;
    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    if (moving) {
      const step = this.target ? Math.min(speed * dt, this.root.position.distanceTo(this.target)) : speed * dt;
      this.root.position.addScaledVector(dir, step);
      this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -bounds, bounds);
      this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -bounds, bounds);
      const want = Math.atan2(dir.x, dir.z);
      let delta = want - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, dt * TURN_RATE);
      this.root.rotation.y = this.heading;
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
