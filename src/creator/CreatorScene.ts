/**
 * Scène du créateur de personnage : le perso sur un socle, vu de face (caméra orthographique,
 * même rendu HD-2D que le jeu). Glisser pour le faire tourner, molette pour zoomer,
 * cadrage « corps entier » ou « visage ».
 */
import * as THREE from 'three';
import { lightAllPasses, PostFx } from '../game/postfx';
import { createToonMaterial } from '../game/toon';
import { Puppet } from './puppet';
import type { Recipe } from './recipe';

export type Framing = 'corps' | 'visage';

export class CreatorScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private post: PostFx;
  private container: HTMLElement;
  private resizeObs: ResizeObserver;
  private raf = 0;
  private last = performance.now();
  private puppet: Puppet | null = null;
  private creating: Promise<void> | null = null;
  private disposed = false;
  private turntable = new THREE.Group();
  private yaw = 0.35;
  private yawVel = 0;
  private framing: Framing = 'corps';
  private zoom = 1;
  private view = { y: 0.95, h: 2.3 };
  private disposers: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.scene.background = new THREE.Color(0x283247);

    const hemi = lightAllPasses(new THREE.HemisphereLight(new THREE.Color(0.8, 0.86, 1.0), new THREE.Color(0.3, 0.28, 0.26), 1.0));
    const key = lightAllPasses(new THREE.DirectionalLight(new THREE.Color(1.0, 0.94, 0.84), 2.1));
    key.position.set(-2.2, 4, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -1.5; sc.right = 1.5; sc.top = 2.5; sc.bottom = -0.5; sc.near = 0.5; sc.far = 12;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    const back = lightAllPasses(new THREE.DirectionalLight(new THREE.Color(0.65, 0.75, 1.0), 0.9));
    back.position.set(2.5, 2.5, -3);
    this.scene.add(hemi, key, back);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.12, 48), createToonMaterial({ color: 0x5b6680, rimStrength: 0 }));
    plinth.position.y = -0.06;
    plinth.receiveShadow = true;
    this.scene.add(plinth, this.turntable);

    this.camera.position.set(0, 1.1, 10);
    this.camera.lookAt(0, 1.1, 0);
    this.post = new PostFx(this.renderer, this.scene, this.camera);
    this.post.setDof({ focus: 10, range: 3, falloff: 3, strength: 0 });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Crée le perso (premier appel) ou applique la nouvelle recette. */
  async setRecipe(r: Recipe): Promise<void> {
    // un seul perso, même si une nouvelle recette arrive pendant le premier chargement
    this.creating ??= Puppet.create(r).then((p) => {
      if (this.disposed) return p.dispose();
      this.puppet = p;
      this.turntable.add(p.root);
    });
    await this.creating;
    await this.puppet?.apply(r);
  }

  setFraming(f: Framing): void {
    this.framing = f;
    this.zoom = 1;
  }

  setExpression(key: string): void {
    this.puppet?.setExpression(key);
  }

  play(clip: string): void {
    this.puppet?.play(clip, 0.3);
  }

  get height(): number {
    return this.puppet?.height ?? 1.6;
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    let drag: { x: number; t: number } | null = null;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => {
      drag = { x: e.clientX, t: performance.now() };
      el.setPointerCapture(e.pointerId);
    });
    on('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const now = performance.now();
      this.yaw += dx * 0.012;
      this.yawVel = (dx * 0.012) / Math.max(0.008, (now - drag.t) / 1000);
      drag = { x: e.clientX, t: now };
    });
    on('pointerup', () => (drag = null));
    on('pointercancel', () => (drag = null));
    on('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.7, 4);
    }, { passive: false });
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // inertie de rotation après un glisser
    this.yawVel *= Math.exp(-dt * 5);
    this.yaw += this.yawVel * dt * 0.15;
    this.turntable.rotation.y = this.yaw;
    this.puppet?.update(dt);

    // cadrage : corps entier ou visage (tête suivie pendant l'animation)
    const H = this.height;
    let target = { y: H * 0.53, h: H * 1.3 };
    if (this.framing === 'visage' && this.puppet) {
      const head = this.puppet.headBone;
      const p = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, H * 0.93, 0);
      target = { y: p.y + 0.08, h: 0.48 };
    }
    const k = Math.min(1, dt * 6);
    this.view.y += (target.y - this.view.y) * k;
    this.view.h += (target.h / this.zoom - this.view.h) * k;
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    const vh = aspect >= 0.75 ? this.view.h : this.view.h * (0.75 / aspect);
    const c = this.camera;
    c.left = (-vh * aspect) / 2;
    c.right = (vh * aspect) / 2;
    c.top = vh / 2;
    c.bottom = -vh / 2;
    c.position.set(0, this.view.y + 0.4, 10);
    c.lookAt(0, this.view.y, 0);
    c.updateProjectionMatrix();
    this.post.render();
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    for (const d of this.disposers) d();
    this.puppet?.dispose();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
