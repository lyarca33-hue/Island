/**
 * Post-traitement HD-2D, repris d'Arena Tactic (client/src/render/hd2d/postfx.ts) et allégé :
 * la scène est dessinée UNE fois dans une cible qui garde sa profondeur, puis UNE passe finale
 * fait le reste (contours encrés depuis la profondeur, flou de profondeur façon maquette,
 * bloom, étalonnage, vignettage, conversion sRGB).
 *
 * Ajout par rapport à Arena Tactic : le flou de profondeur (« tilt-shift » du style HD-2D).
 * L'image de scène est réduite de moitié et floutée ; la passe finale mélange image nette et
 * image floue selon l'écart entre la profondeur du pixel et celle du perso suivi.
 *
 * Persos : seule leur silhouette est encrée (calque LAYER_CHARACTER), comme dans Arena Tactic.
 */
import * as THREE from 'three';

/** Calque des maillages de persos : contour limité à la silhouette. */
export const LAYER_CHARACTER = 4;

/**
 * Lumière visible aussi de la passe de profondeur des persos : sans elle, three voit la
 * configuration d'éclairage changer deux fois par image et revérifie chaque shader éclairé.
 */
export function lightAllPasses<T extends THREE.Light>(light: T): T {
  light.layers.enable(LAYER_CHARACTER);
  return light;
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Flou gaussien séparable à 9 prises (pas = `dir`, en texels de la cible lue). */
const BLUR_FS = `
  uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
    c += (texture2D(tSrc, vUv + dir * 1.385).rgb + texture2D(tSrc, vUv - dir * 1.385).rgb) * 0.316;
    c += (texture2D(tSrc, vUv + dir * 3.231).rgb + texture2D(tSrc, vUv - dir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`;

export interface DofSettings {
  /** Distance caméra -> point net (unités de scène). */
  focus: number;
  /** Demi-épaisseur de la zone parfaitement nette. */
  range: number;
  /** Distance supplémentaire sur laquelle le flou monte à son maximum. */
  falloff: number;
  /** Force du flou (0 = désactivé, 1 = plein). */
  strength: number;
}

export class PostFx {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private sceneRT: THREE.WebGLRenderTarget;
  /** Bloom (quart de résolution). */
  private brightRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  /** Flou de profondeur (demi-résolution). */
  private dofA: THREE.WebGLRenderTarget;
  private dofB: THREE.WebGLRenderTarget;
  /** Profondeur des persos seuls (sans décor), comparée à celle de la scène. */
  private charRT: THREE.WebGLRenderTarget;
  private charMat = new THREE.MeshBasicMaterial({ colorWrite: false, fog: false });
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  private pw = 1;
  private ph = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const opts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.brightRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.dofA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.dofB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.charRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, threshold: { value: 0.85 } },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene; uniform float threshold; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          float l = max(max(c.r, c.g), c.b);
          gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.4, l), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
    });
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }',
      depthTest: false, depthWrite: false,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture }, tDepth: { value: this.sceneRT.depthTexture },
        tCharDepth: { value: this.charRT.depthTexture }, tBloom: { value: this.brightRT.texture }, tDof: { value: this.dofA.texture },
        texel: { value: new THREE.Vector2() }, near: { value: 0.1 }, range: { value: 399.9 },
        ink: { value: 0.8 }, bloom: { value: 0.5 }, aspect: { value: 1 },
        focus: { value: 80 }, focusRange: { value: 3 }, focusFalloff: { value: 7 }, dofStrength: { value: 1 },
        lift: { value: new THREE.Vector3(0.0, 0.004, 0.014) }, gain: { value: new THREE.Vector3(1.05, 1.0, 0.95) },
        saturation: { value: 1.12 },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tCharDepth; uniform sampler2D tBloom; uniform sampler2D tDof;
        uniform vec2 texel; uniform float near; uniform float range; uniform float ink; uniform float bloom; uniform float aspect;
        uniform float focus; uniform float focusRange; uniform float focusFalloff; uniform float dofStrength;
        uniform vec3 lift; uniform vec3 gain; uniform float saturation; varying vec2 vUv;
        // caméra orthographique : profondeur linéaire
        float lin(float raw){ return near + raw * range; }
        float d(vec2 o){ return lin(texture2D(tDepth, vUv + o * texel).r); }
        // 1 si le pixel montre un perso : sa profondeur seule égale celle de la scène (pas masqué par un décor)
        float ch(vec2 o){
          vec2 uv = vUv + o * texel;
          float cd = texture2D(tCharDepth, uv).r;
          return step(cd, 0.9999) * step(abs(lin(cd) - lin(texture2D(tDepth, uv).r)), 0.02);
        }
        vec3 toSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          float c0 = d(vec2(0.0));
          // flou de profondeur : nul autour du point net, maximal au-delà de range + falloff
          float coc = smoothstep(focusRange, focusRange + focusFalloff, abs(c0 - focus)) * dofStrength;
          vec3 c = mix(texture2D(tScene, vUv).rgb, texture2D(tDof, vUv).rgb, coc);
          // contours : dérivée SECONDE de la profondeur, nulle sur toute surface plane (sol vu en
          // biais), forte seulement sur les vraies arêtes et silhouettes
          float lx = abs(d(vec2(1.0,0.0)) + d(vec2(-1.0,0.0)) - 2.0 * c0);
          float ly = abs(d(vec2(0.0,1.0)) + d(vec2(0.0,-1.0)) - 2.0 * c0);
          float e = max(lx, ly);
          // persos : arêtes intérieures ignorées, seule la silhouette reste encrée
          e *= 1.0 - ch(vec2(0.0)) * ch(vec2(1.0,0.0)) * ch(vec2(-1.0,0.0)) * ch(vec2(0.0,1.0)) * ch(vec2(0.0,-1.0));
          // pas de trait net dans les zones floues
          c = mix(c, vec3(0.02, 0.018, 0.035), smoothstep(0.16, 0.4, e) * ink * (1.0 - coc));
          c += texture2D(tBloom, vUv).rgb * bloom;
          c = c * gain + lift;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, saturation);
          vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
          c *= mix(1.0, 0.5, smoothstep(0.45, 1.1, length(p)));
          gl_FragColor = vec4(toSrgb(c), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setDof(s: DofSettings): void {
    const u = this.finalMat.uniforms;
    u.focus.value = s.focus;
    u.focusRange.value = s.range;
    u.focusFalloff.value = s.falloff;
    u.dofStrength.value = s.strength;
  }

  /** Étalonnage : gain par couleur et saturation (le cycle jour/nuit les fait varier). */
  setGrade(gain: THREE.Vector3, saturation: number): void {
    const u = this.finalMat.uniforms;
    (u.gain.value as THREE.Vector3).copy(gain);
    u.saturation.value = saturation;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
    this.pw = pw;
    this.ph = ph;
    this.sceneRT.setSize(pw, ph);
    this.charRT.setSize(pw, ph);
    const hw = Math.max(1, Math.round(pw / 2)), hh = Math.max(1, Math.round(ph / 2));
    this.dofA.setSize(hw, hh);
    this.dofB.setSize(hw, hh);
    const qw = Math.max(1, Math.round(pw / 4)), qh = Math.max(1, Math.round(ph / 4));
    this.brightRT.setSize(qw, qh);
    this.blurRT.setSize(qw, qh);
    (this.finalMat.uniforms.texel.value as THREE.Vector2).set(1 / pw, 1 / ph);
    this.finalMat.uniforms.aspect.value = w / h;
  }

  private pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** Flou séparable de `a` (résultat dans `a`, `b` sert d'intermédiaire). */
  private blur(a: THREE.WebGLRenderTarget, b: THREE.WebGLRenderTarget, step: number): void {
    const dir = this.blurMat.uniforms.dir.value as THREE.Vector2;
    this.blurMat.uniforms.tSrc.value = a.texture;
    dir.set(step / a.width, 0);
    this.pass(this.blurMat, b);
    this.blurMat.uniforms.tSrc.value = b.texture;
    dir.set(0, step / a.height);
    this.pass(this.blurMat, a);
  }

  render(): void {
    const r = this.renderer;
    const u = this.finalMat.uniforms;
    u.near.value = this.camera.near;
    u.range.value = this.camera.far - this.camera.near;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    // bloom
    this.brightMat.uniforms.tScene.value = this.sceneRT.texture;
    this.pass(this.brightMat, this.brightRT);
    this.blur(this.brightRT, this.blurRT, 1);
    // flou de profondeur : image réduite de moitié, floutée deux fois (rayon croissant)
    this.copyMat.uniforms.tSrc.value = this.sceneRT.texture;
    this.pass(this.copyMat, this.dofA);
    this.blur(this.dofA, this.dofB, 1);
    this.blur(this.dofA, this.dofB, 2);
    this.renderCharacterDepth();
    this.pass(this.finalMat, null);
  }

  /** Profondeur des seuls maillages de persos (calque LAYER_CHARACTER). */
  private renderCharacterDepth(): void {
    const r = this.renderer, cam = this.camera, scene = this.scene;
    const bg = scene.background, layers = cam.layers.mask;
    scene.background = null;
    scene.overrideMaterial = this.charMat;
    cam.layers.set(LAYER_CHARACTER);
    r.setRenderTarget(this.charRT);
    r.clear();
    scene.matrixWorldAutoUpdate = false; // positions déjà calculées par le rendu principal
    r.render(scene, cam);
    scene.matrixWorldAutoUpdate = true;
    scene.overrideMaterial = null;
    scene.background = bg;
    cam.layers.mask = layers;
  }

  /** Taille de l'image de scène en pixels (pour les captures). */
  get size(): { w: number; h: number } {
    return { w: this.pw, h: this.ph };
  }

  dispose(): void {
    for (const t of [this.sceneRT, this.brightRT, this.blurRT, this.dofA, this.dofB, this.charRT]) t.dispose();
    for (const m of [this.charMat, this.brightMat, this.blurMat, this.copyMat, this.finalMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}
