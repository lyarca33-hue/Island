/**
 * Perso animé issu du créateur : perso VRM assemblé + clips Mixamo reciblés + expressions du
 * visage (fondu doux, clignement des yeux automatique). Sert au créateur et au jeu.
 */
import * as THREE from 'three';
import { Avatar } from './avatar';
import { EXPRESSIONS } from './expressions';
import type { Recipe } from './recipe';
import { retargetClips, UAL_TO_VRM } from './retarget';
import { createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { PoseLayer } from './pose';
import { loadAnimationSource, loadIdleAnimation, loadUalAnimations } from './source';

interface Sources {
  mixamo: Awaited<ReturnType<typeof loadAnimationSource>>;
  vrma: VRMAnimation | null;
  ual: Awaited<ReturnType<typeof loadUalAnimations>>;
}

async function loadSources(): Promise<Sources> {
  const [mixamo, vrma, ual] = await Promise.all([loadAnimationSource(), loadIdleAnimation(), loadUalAnimations()]);
  return { mixamo, vrma, ual };
}

/** Quaternius se tient jambes écartées et bras un peu ouverts : on resserre (degrés, côté gauche). */
const UAL_ADJUST: Record<string, [number, number, number]> = {
  leftUpperLeg: [0, 0, -7],
  leftFoot: [0, 0, 7],
  leftUpperArm: [0, 0, -6],
};

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
const ALIASES: Record<string, string[]> = { surprised: ['surprised', 'Surprised'] };

export class Puppet {
  readonly root = new THREE.Group();
  private avatar: Avatar;
  private mixer: THREE.AnimationMixer;
  private pose: PoseLayer;
  private actions = new Map<string, THREE.AnimationAction>();
  private mixamo = new Set<THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = 'idle';
  private exprTarget: Record<string, number> = {};
  private exprNow: Record<string, number> = {};
  private blinkIn = 2;
  private blinkT = -1;
  /** Dernière recette demandée (les reconstructions se suivent sans se chevaucher). */
  private wanted: Recipe;
  private building: Promise<void> | null = null;
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
    const [avatar, sources] = await Promise.all([Avatar.build(recipe), loadSources()]);
    const p = new Puppet(avatar, recipe);
    p.loadClips(sources);
    p.play('idle', 0);
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
    const sources = await loadSources();
    while (!this.avatar.sameParts(this.wanted)) {
      const r = this.wanted;
      const next = await Avatar.build(r);
      const playing = this.currentName;
      const time = this.current?.time ?? 0;
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.avatar.base.scene);
      this.avatar.dispose();
      this.avatar = next;
      this.root.add(next.root);
      this.mixer = new THREE.AnimationMixer(next.base.scene);
      this.pose = new PoseLayer(next.base);
      this.loadClips(sources);
      this.current = null;
      this.play(playing, 0);
      if (this.current) (this.current as THREE.AnimationAction).time = time;
      this.applyExpressions();
    }
    this.avatar.applyLook(this.wanted);
  }

  private loadClips({ mixamo, vrma, ual }: Sources): void {
    this.actions.clear();
    this.mixamo.clear();
    const vrm = this.avatar.base;
    const add = (name: string, clip: THREE.AnimationClip, fromMixamo = false) => {
      clip.name = name;
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
      if (fromMixamo) this.mixamo.add(action);
    };
    for (const clip of retargetClips(mixamo, vrm)) add(clip.name, clip, true);
    // repos à l'essai (celui d'X Bot est raide) : pixiv (VRMA) et Quaternius
    const xbot = this.actions.get('idle');
    if (xbot) this.actions.set('idle_xbot', xbot);
    if (vrma) add('idle_pixiv', createVRMAnimationClip(vrma, vrm));
    if (ual) {
      const clips = retargetClips({ ...ual, bones: UAL_TO_VRM, adjust: UAL_ADJUST }, vrm);
      const pick = (n: string) => clips.find((c) => c.name === n);
      const idle = pick('Idle_Loop');
      const talk = pick('Idle_Talking_Loop');
      if (idle) add('idle', idle);
      if (talk) add('idle_talk', talk);
    }
  }

  get clips(): string[] {
    return [...this.actions.keys()];
  }

  /** Joue un clip en fondu enchaîné depuis le clip courant. */
  play(name: string, fade: number): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    this.currentName = name;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  /** Expression du visage (clé de EXPRESSIONS), atteinte en fondu. */
  setExpression(key: string): void {
    this.exprTarget = { ...(EXPRESSIONS[key]?.weights ?? {}) };
  }

  private applyExpressions(blink = 0): void {
    const em = this.avatar.expressions;
    if (!em) return;
    const names = new Set([...Object.keys(this.exprNow), 'blink']);
    for (const n of names) {
      const v = n === 'blink' ? Math.max(this.exprNow.blink ?? 0, blink) : this.exprNow[n];
      for (const alias of ALIASES[n] ?? [n]) if (em.getExpression(alias)) em.setValue(alias, v);
    }
  }

  update(dt: number): void {
    this.mixer.update(dt);
    // retouches de pose : seulement pour les clips d'X Bot
    let w = 0;
    for (const a of this.mixamo) if (a.isRunning()) w += a.getEffectiveWeight();
    this.pose.apply(Math.min(1, w));
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
    if ((this.exprNow.happy ?? 0) > 0.5 || (this.exprNow.blinkLeft ?? 0) > 0.5) blink = 0;
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
