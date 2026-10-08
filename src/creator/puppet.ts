/**
 * Perso animé issu du créateur : perso VRM assemblé + clips Mixamo reciblés + expressions du
 * visage (fondu doux, clignement des yeux automatique). Sert au créateur et au jeu.
 */
import * as THREE from 'three';
import { Avatar } from './avatar';
import { EXPRESSIONS } from './expressions';
import type { Recipe } from './recipe';
import { retargetClips, UAL_TO_VRM, type AnimationSource } from './retarget';
import { PoseLayer } from './pose';
import { loadAnimationSource, loadExtraAnimations, loadPoseAnimations, loadSitAnimations } from './source';

/** Retouche de pose par-dessus les clips (ex. porter un objet, voir game/items/carry.ts). */
export interface PoseHook {
  /** Après le mixeur, avant la mise à jour du VRM. */
  apply(dt: number): void;
  /** Après la mise à jour du VRM (os réels à jour). */
  after(): void;
  /** Rend aux os leur pose animée. */
  restore(): void;
}

/** Nom d'expression VRM 1.0 → nom possible dans un modèle VRM 0.x (presets « unknown »). */
const ALIASES: Record<string, string[]> = { surprised: ['surprised', 'Surprised'], extra: ['extra', 'Extra'] };

export class Puppet {
  readonly root = new THREE.Group();
  private avatar: Avatar;
  private mixer: THREE.AnimationMixer;
  private pose: PoseLayer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private exprTarget: Record<string, number> = {};
  private exprNow: Record<string, number> = {};
  private blinkIn = 2;
  private blinkT = -1;
  /** Dernière recette demandée (les reconstructions se suivent sans se chevaucher). */
  private wanted: Recipe;
  private building: Promise<void> | null = null;
  /** Appelé quand des clips arrivent après coup (poses du créateur). */
  onClips: (() => void) | null = null;

  /** Retouche de pose du jeu (le créateur n'en a pas). */
  hook: PoseHook | null = null;

  private constructor(avatar: Avatar, recipe: Recipe) {
    this.avatar = avatar;
    this.wanted = recipe;
    this.mixer = new THREE.AnimationMixer(avatar.base.scene);
    this.pose = new PoseLayer(avatar.base);
    this.root.add(avatar.root);
  }

  static async create(recipe: Recipe): Promise<Puppet> {
    const [avatar, source, sit] = await Promise.all([Avatar.build(recipe), loadAnimationSource(), loadSitAnimations()]);
    const p = new Puppet(avatar, recipe);
    p.extra = sit ? [{ ...sit, bones: UAL_TO_VRM }] : [];
    p.loadClips(source);
    p.play('idle', 0);
    // poses du créateur (1,7 Mo) : ajoutées à leur arrivée, sans retarder l'entrée dans le jeu
    void loadPoseAnimations().then((poses) => {
      for (const s of poses) {
        const src = { ...s, bones: UAL_TO_VRM };
        p.extra.push(src);
        for (const clip of retargetClips(src, p.avatar.base)) p.actions.set(clip.name, p.mixer.clipAction(clip));
      }
      p.onClips?.();
    });
    return p;
  }

  get height(): number {
    return this.avatar.height;
  }

  /** Modèle VRM qui porte le squelette. */
  get vrm() {
    return this.avatar.base;
  }

  get headBone(): THREE.Object3D | null {
    return this.avatar.headBone;
  }

  /**
   * Applique une recette : couleurs et proportions tout de suite ; si la tenue, le visage ou la
   * coiffure changent, le perso est reconstruit puis échangé (l'animation reprend où elle était).
   */
  apply(recipe: Recipe): Promise<void> {
    this.wanted = recipe;
    if (this.avatar.sameParts(recipe)) {
      this.avatar.applyLook(recipe);
      return this.building ?? Promise.resolve();
    }
    this.building ??= this.rebuild().finally(() => (this.building = null));
    return this.building;
  }

  private async rebuild(): Promise<void> {
    const source = await loadAnimationSource();
    while (!this.avatar.sameParts(this.wanted)) {
      const r = this.wanted;
      const next = await Avatar.build(r);
      const playing = this.current?.getClip().name ?? 'idle';
      const time = this.current?.time ?? 0;
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.avatar.base.scene);
      this.avatar.dispose();
      this.avatar = next;
      this.root.add(next.root);
      this.mixer = new THREE.AnimationMixer(next.base.scene);
      this.pose = new PoseLayer(next.base);
      this.loadClips(source);
      this.current = null;
      this.play(playing, 0);
      if (this.current) (this.current as THREE.AnimationAction).time = time;
      this.applyExpressions();
    }
    this.avatar.applyLook(this.wanted);
  }

  private loadClips(source: AnimationSource): void {
    this.actions.clear();
    for (const clip of retargetClips(source, this.avatar.base)) this.actions.set(clip.name, this.mixer.clipAction(clip));
    for (const src of this.extra) for (const clip of retargetClips(src, this.avatar.base)) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  /** Clips Quaternius (s'asseoir, poses du créateur), ceux qui ont pu être chargés. */
  private extra: AnimationSource[] = [];

  /**
   * Déplacement du bassin entre le début et la fin d'un clip (repère du perso, m) et hauteur du
   * bassin à la fin (au-dessus des pieds) : où le perso finit assis par rapport à où il était.
   */
  hipsMotion(name: string): { shift: THREE.Vector3; endY: number } | null {
    const hips = this.avatar.base.humanoid.getNormalizedBoneNode('hips');
    const track = hips && this.actions.get(name)?.getClip().tracks.find((t) => t.name === `${hips.name}.position`);
    if (!hips?.parent || !track) return null;
    const v = track.values;
    const first = new THREE.Vector3().fromArray(v, 0), last = new THREE.Vector3().fromArray(v, v.length - 3);
    // repère du parent du bassin → repère du perso (rotation et échelle)
    this.root.updateMatrixWorld(true);
    const toRoot = this.root.matrixWorld.clone().invert().multiply(hips.parent.matrixWorld);
    const a = first.applyMatrix4(toRoot), b = last.applyMatrix4(toRoot);
    return { shift: b.clone().sub(a), endY: b.y };
  }

  /**
   * Charge la réserve de clips pas encore utilisés (sauter, nager, se battre...) et les ajoute au
   * perso ; rend leurs noms. Console : game.character.puppet.loadExtraAnimations().then(console.log)
   */
  async loadExtraAnimations(): Promise<string[]> {
    const names: string[] = [];
    for (const s of await loadExtraAnimations()) {
      const src = { ...s, bones: UAL_TO_VRM };
      if (!this.extra.some((e) => e.scene === s.scene)) this.extra.push(src);
      for (const clip of retargetClips(src, this.avatar.base)) {
        this.actions.set(clip.name, this.mixer.clipAction(clip));
        names.push(clip.name);
      }
    }
    return names;
  }

  /** Durée d'un clip (s), 0 s'il manque. */
  clipDuration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 0;
  }

  get clips(): string[] {
    return [...this.actions.keys()];
  }

  /** Joue un clip en fondu enchaîné depuis le clip courant (`once` : une fois, arrêté sur la fin). */
  play(name: string, fade: number, once = false): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  /** Expression du visage (clé de EXPRESSIONS), atteinte en fondu. */
  setExpression(key: string): void {
    const e = EXPRESSIONS[key];
    this.exprTarget = { ...(e?.weights ?? {}) };
    for (const [k, v] of Object.entries(e?.morphs ?? {})) this.exprTarget[`m:${k}`] = v;
  }

  private applyExpressions(blink = 0): void {
    const em = this.avatar.expressions;
    if (!em) return;
    const names = new Set([...Object.keys(this.exprNow), 'blink']);
    const morphs: Record<string, number> = {};
    for (const n of names) {
      if (n.startsWith('m:')) {
        morphs[n.slice(2)] = this.exprNow[n];
        continue;
      }
      const v = n === 'blink' ? Math.max(this.exprNow.blink ?? 0, blink) : this.exprNow[n];
      for (const alias of ALIASES[n] ?? [n]) if (em.getExpression(alias)) em.setValue(alias, v);
    }
    this.avatar.setMorphs(morphs);
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.pose.apply();
    this.hook?.apply(dt);
    // fondu des expressions
    const k = Math.min(1, dt * 10);
    const names = new Set([...Object.keys(this.exprNow), ...Object.keys(this.exprTarget)]);
    for (const n of names) this.exprNow[n] = (this.exprNow[n] ?? 0) + ((this.exprTarget[n] ?? 0) - (this.exprNow[n] ?? 0)) * k;
    // clignement : toutes les 2 à 6 s, 0,15 s (sauf yeux déjà fermés par l'expression)
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
    const n = this.exprNow;
    if ((n.happy ?? 0) > 0.5 || (n.blinkLeft ?? 0) > 0.5 || (n.extra ?? 0) > 0.5 || (n['m:EYE_Close'] ?? 0) > 0.5) blink = 0;
    this.applyExpressions(blink);
    this.avatar.update(dt);
    this.hook?.after();
    this.hook?.restore();
    this.pose.restore();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.avatar.dispose();
  }
}
