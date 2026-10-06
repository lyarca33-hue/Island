/**
 * Perso animé issu du créateur : corps paramétrable + clips Mixamo reciblés + expressions du
 * visage (fondu doux, clignement des yeux automatique). Sert au créateur et au jeu.
 */
import * as THREE from 'three';
import { loadHumanAssets } from './assets';
import { EXPRESSIONS } from './expressions';
import { HumanModel } from './human';
import type { Recipe } from './recipe';
import { retargetClips } from './retarget';
import { loadAnimationSource } from './source';

export class Puppet {
  readonly human: HumanModel;
  readonly root: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private source: { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
  private exprTarget: Record<string, number> = {};
  private exprNow: Record<string, number> = {};
  private blinkIn = 2;
  private blinkT = -1;

  private constructor(human: HumanModel, source: { scene: THREE.Object3D; clips: THREE.AnimationClip[] }) {
    this.human = human;
    this.root = human.root;
    this.source = source;
    this.mixer = new THREE.AnimationMixer(human.root);
  }

  static async create(recipe: Recipe): Promise<Puppet> {
    const [assets, source] = await Promise.all([loadHumanAssets(), loadAnimationSource()]);
    const p = new Puppet(new HumanModel(assets), source);
    p.apply(recipe);
    p.retarget();
    return p;
  }

  /** Change la recette (rapide). Appeler `retarget()` ensuite si la taille a changé. */
  apply(recipe: Recipe): void {
    this.human.apply(recipe);
  }

  /** Recalcule les animations pour le corps actuel (longueur des jambes, hauteur du bassin). */
  retarget(): void {
    const playing = this.current?.getClip().name ?? 'idle';
    const time = this.current?.time ?? 0;
    this.mixer.stopAllAction();
    for (const a of this.actions.values()) this.mixer.uncacheClip(a.getClip());
    this.actions.clear();
    this.current = null;
    for (const clip of retargetClips(this.source, this.human)) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play(playing, 0);
    if (this.current) (this.current as THREE.AnimationAction).time = time;
  }

  get clips(): string[] {
    return [...this.actions.keys()];
  }

  /** Joue un clip en fondu enchaîné depuis le clip courant. */
  play(name: string, fade: number): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  /** Expression du visage (clé de EXPRESSIONS), atteinte en fondu. */
  setExpression(key: string): void {
    this.exprTarget = { ...(EXPRESSIONS[key]?.units ?? {}) };
  }

  update(dt: number): void {
    this.mixer.update(dt);
    // fondu des expressions
    const k = Math.min(1, dt * 10);
    const names = new Set([...Object.keys(this.exprNow), ...Object.keys(this.exprTarget)]);
    for (const n of names) this.exprNow[n] = (this.exprNow[n] ?? 0) + ((this.exprTarget[n] ?? 0) - (this.exprNow[n] ?? 0)) * k;
    // clignement : toutes les 2 à 6 s, 0,15 s
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) this.blinkT = 0;
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.sin(Math.min(1, this.blinkT / 0.15) * Math.PI);
      if (this.blinkT >= 0.15) {
        this.blinkT = -1;
        this.blinkIn = 2 + Math.random() * 4;
      }
    }
    const units = { ...this.exprNow };
    for (const eye of ['eye-left-closure', 'eye-right-closure']) units[eye] = Math.max(units[eye] ?? 0, blink);
    this.human.setExpression(units);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.human.dispose();
  }
}
