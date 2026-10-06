/**
 * Moteur de la map : scène Three.js, caméra iso orthographique d'Arena Tactic (30° au-dessus
 * de l'horizon, quart de tour par quart de tour), lumière de jour, post-traitement HD-2D.
 *
 * Commandes : clic sur le sol pour y aller (Maj = courir), ZQSD / WASD / flèches,
 * molette pour zoomer, rotateCamera(±1) pour tourner d'un quart de tour.
 */
import * as THREE from 'three';
import type { Recipe } from '../creator/recipe';
import { Character } from './character';
import { createGround, GROUND_HALF } from './ground';
import { createMotes } from './motes';
import { lightAllPasses, PostFx } from './postfx';

/** Élévation de la caméra iso 2:1 (30° au-dessus de l'horizon), comme Arena Tactic. */
const ISO_ELEVATION = Math.PI / 6;
/** Lacet de départ (45°), comme Arena Tactic. */
const BASE_YAW = Math.PI / 4;
/** Recul de la caméra (orthographique : n'influe pas sur l'image, seulement sur la profondeur). */
const CAM_DIST = 80;
/** Hauteur de la vue au zoom 1 (m), plus serrée qu'Arena Tactic : un seul perso à montrer. */
const VIEW_HEIGHT = 6;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
/** Hauteur du point suivi au-dessus des pieds du perso (m). */
const FOCUS_HEIGHT = 0.9;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private post: PostFx;
  private character = new Character();
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private motes: { points: THREE.Points; update: (t: number, center: THREE.Vector3) => void };
  private container: HTMLElement;
  private focus = new THREE.Vector3(0, FOCUS_HEIGHT, 0);
  private quarter = 0;
  private yaw = BASE_YAW;
  private zoom = 1;
  private keys = new Set<string>();
  private shift = false;
  private raf = 0;
  private last = performance.now();
  private resizeObs: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private disposers: Array<() => void> = [];
  /** Repère de destination du clic (anneau au sol). */
  private marker: THREE.Mesh;

  private recipe: Recipe | null;

  constructor(container: HTMLElement, recipe: Recipe | null = null) {
    this.container = container;
    this.recipe = recipe;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping; // étalonnage fait par le post-traitement
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new THREE.Color(0x2b3a2a);

    // lumière de jour : ciel bleuté + sol vert renvoyé, soleil chaud rasant (ombres longues)
    const hemi = lightAllPasses(new THREE.HemisphereLight(new THREE.Color(0.75, 0.85, 1.0), new THREE.Color(0.25, 0.32, 0.18), 0.9));
    this.sun = lightAllPasses(new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.78), 2.2));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(hemi, this.sun, this.sun.target);

    this.ground = createGround();
    this.scene.add(this.ground);
    this.scene.add(this.character.root);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.3, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.position.y = 0.01;
    this.scene.add(this.marker);

    this.motes = createMotes();
    this.scene.add(this.motes.points);

    this.post = new PostFx(this.renderer, this.scene, this.camera);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.bindInput();
  }

  /** Charge le perso puis lance la boucle de rendu. */
  async start(): Promise<void> {
    this.raf = requestAnimationFrame(this.frame);
    await this.character.load(this.recipe);
  }

  /** Quart de tour de caméra (+1 ou -1). */
  rotateCamera(dir: 1 | -1): void {
    this.quarter += dir;
  }

  setZoom(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => {
      this.shift = e.shiftKey;
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e) => {
      this.shift = e.shiftKey;
      this.keys.delete(e.code);
    });
    on(window, 'blur', () => this.keys.clear());
    on(el, 'wheel', (e) => {
      e.preventDefault();
      this.setZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    on(el, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = this.groundPoint(e.clientX, e.clientY);
      if (!p) return;
      this.character.goTo(p, e.shiftKey);
      this.marker.position.set(p.x, 0.01, p.z);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
    });
  }

  /** Point du sol sous un pixel de l'écran (ou null). */
  private groundPoint(cx: number, cy: number): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    return hit ? hit.point : null;
  }

  /** Direction clavier dans le repère monde (relative à la caméra : « haut » = vers le fond). */
  private keyboardDir(): THREE.Vector3 {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1; // Z en AZERTY = KeyW
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1; // Q en AZERTY = KeyA
    if (!f && !s) return new THREE.Vector3();
    // avant = de la caméra vers la cible, projeté au sol ; droite = perpendiculaire
    const fwd = new THREE.Vector3(-Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return fwd.multiplyScalar(f).addScaledVector(right, s).normalize();
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.character.setMoveInput(this.keyboardDir(), this.shift);
    this.character.update(dt, GROUND_HALF - 14);
    const mm = this.marker.material as THREE.MeshBasicMaterial;
    mm.opacity = Math.max(0, mm.opacity - dt * 0.9);
    this.updateCamera(dt);
    this.motes.update(now / 1000, this.character.position);
    this.post.render();
  };

  private updateCamera(dt: number): void {
    const targetYaw = BASE_YAW + this.quarter * (Math.PI / 2);
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 8);
    const p = this.character.position;
    this.focus.lerp(new THREE.Vector3(p.x, FOCUS_HEIGHT, p.z), Math.min(1, dt * 5));
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    // portrait (téléphone) : vue plus haute pour garder assez de largeur
    const viewH = (aspect >= 1 ? VIEW_HEIGHT : Math.max(VIEW_HEIGHT, 7 / aspect)) / this.zoom;
    const c = this.camera;
    c.left = -viewH * aspect / 2;
    c.right = viewH * aspect / 2;
    c.top = viewH / 2;
    c.bottom = -viewH / 2;
    c.updateProjectionMatrix();
    c.position.set(
      this.focus.x + Math.cos(this.yaw) * Math.cos(ISO_ELEVATION) * CAM_DIST,
      this.focus.y + Math.sin(ISO_ELEVATION) * CAM_DIST,
      this.focus.z + Math.sin(this.yaw) * Math.cos(ISO_ELEVATION) * CAM_DIST,
    );
    c.lookAt(this.focus);
    // soleil et carte d'ombre suivent le perso
    this.sun.position.set(this.focus.x - 8, 14, this.focus.z + 5);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);
    // flou de profondeur : net autour du perso (distance caméra -> point suivi), plus large au dézoom
    this.post.setDof({ focus: CAM_DIST, range: 2.2 / this.zoom, falloff: 6 / this.zoom, strength: 1 });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.character.dispose();
    this.resizeObs.disconnect();
    for (const d of this.disposers) d();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
