/**
 * Post-traitement HD-2D, repris d'Arena Tactic (client/src/render/hd2d/postfx.ts) et allégé :
 * la scène est dessinée UNE fois dans une cible qui garde sa profondeur, puis UNE passe finale
 * fait le reste (accentuation de la netteté, contours encrés depuis la profondeur, bloom,
 * étalonnage, vignettage, conversion sRGB).
 *
 * Pas de flou de profondeur : toute la scène reste nette. La passe finale accentue légèrement
 * les détails (façon AMD CAS, sur 4 voisins déjà en cache) pour compenser l'agrandissement par
 * le navigateur quand le plafond de pixels est atteint.
 *
 * Persos : seule leur silhouette est encrée (calque LAYER_CHARACTER), comme dans Arena Tactic.
 *
 * Perso caché (option seeThrough, en jeu) : derrière un mur, un toit ou un meuble, il se voit en
 * transparence, entouré d'une aura claire. Le perso est redessiné seul dans une cible à lui (couleur
 * et profondeur) ; là où le décor est devant lui, la passe finale le mêle au décor. L'aura est son
 * masque flouté, rangé dans le canal alpha du bloom (même passes, rien de plus à dessiner).
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

/** Lumières ponctuelles de la scène (lampes, frigo, lumière de nuit), cachées ou non. */
function pointLights(scene: THREE.Scene): THREE.PointLight[] {
  const out: THREE.PointLight[] = [];
  scene.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) out.push(o as THREE.PointLight);
  });
  return out;
}

/**
 * Lumière ponctuelle éteinte (intensité 0) : retirée du rendu. three la compte sinon dans le
 * shader de chaque matériau éclairé, pour chaque pixel, sans rien ajouter à l'image (le jour, les
 * lampes, la lumière de nuit et celle du frigo sont toutes éteintes). Les shaders de chaque nombre
 * de lampes allumées sont compilés d'avance (PostFx.precompile) : allumer une lampe ne fige rien.
 */
export function skipDarkLights(scene: THREE.Scene): void {
  for (const l of pointLights(scene)) l.visible = l.intensity > 0;
}

/**
 * Plafond de pixels de l'image 3D par réglage de qualité. Sur un écran Retina (ratio 2), tout
 * rendre à la résolution native multiplie par 4 le travail du GPU pour un gain peu visible avec
 * les contours encrés : au-delà du plafond, le navigateur agrandit l'image.
 */
export const QUALITY_PIXELS = { basse: 0.9e6, normale: 1.4e6, haute: 4.2e6 } as const;
export type Quality = keyof typeof QUALITY_PIXELS;

const QUALITY_KEY = 'rp-island-qualite';

/** Réglage de qualité mémorisé (normale par défaut). */
export function loadQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (q && q in QUALITY_PIXELS) return q as Quality;
  } catch {
    // stockage indisponible (navigation privée) : réglage par défaut
  }
  return 'normale';
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // tant pis : le réglage vaut pour cette partie
  }
}

/** Règle le tampon de dessin du canevas pour une vue de `w` x `h` px CSS, sous `maxPixels`. */
export function fitRenderer(renderer: THREE.WebGLRenderer, w: number, h: number, maxPixels: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // jamais plus fin que l'écran, ni plus grossier que la moitié de ses pixels CSS
  const ratio = Math.max(0.5, Math.min(dpr, Math.sqrt(maxPixels / (w * h))));
  renderer.setDrawingBufferSize(w, h, ratio);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Flou gaussien séparable à 9 prises (pas = `dir`, en texels de la cible lue), alpha compris (l'aura). */
const BLUR_FS = `
  uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tSrc, vUv) * 0.227;
    c += (texture2D(tSrc, vUv + dir * 1.385) + texture2D(tSrc, vUv - dir * 1.385)) * 0.316;
    c += (texture2D(tSrc, vUv + dir * 3.231) + texture2D(tSrc, vUv - dir * 3.231)) * 0.070;
    gl_FragColor = c;
  }`;

/**
 * Écart de profondeur (m) au-delà duquel le décor devant le perso le cache : assez pour qu'un
 * objet tenu en main, contre lui, ne le fasse pas voir en transparence.
 */
const HIDDEN_GAP = 0.3;

export class PostFx {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private sceneRT: THREE.WebGLRenderTarget;
  /** Bloom (quart de résolution). */
  private brightRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  /** Persos seuls (sans décor) : profondeur comparée à celle de la scène, et couleur (perso caché). */
  private charRT: THREE.WebGLRenderTarget;
  /** Perso caché vu en transparence avec une aura (en jeu ; inutile dans le créateur). */
  private seeThrough: boolean;
  /** Perso couché sous la couette : on ne le montre pas à travers (elle le cache pour de vrai). */
  tucked = false;
  private charMat = new THREE.MeshBasicMaterial({ colorWrite: false, fog: false });
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  private pw = 1;
  /** Programmes de shaders déjà compilés pour chaque nombre de lampes allumées (voir precompile). */
  private warmed = -1;
  private ph = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, seeThrough = false) {
    this.renderer = renderer;
    this.seeThrough = seeThrough;
    this.scene = scene;
    this.camera = camera;
    // cibles des flous sans tampon de profondeur : seuls des quads plein écran y sont dessinés
    const opts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false };
    // pas de MSAA : les contours encrés viennent de la profondeur (non lissée de toute façon), et sur
    // un GPU intégré une cible HalfFloat multi-échantillons coûte très cher en mémoire et en débit
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: true, samples: 0, depthTexture: new THREE.DepthTexture(1, 1) });
    this.brightRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, opts);
    // couleur en HalfFloat linéaire comme la scène : les persos y gardent les mêmes shaders
    this.charRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: true, samples: 0, depthTexture: new THREE.DepthTexture(1, 1) });

    // bloom en rgb ; en alpha, le masque du perso caché (flouté ensuite avec le bloom : l'aura)
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, threshold: { value: 0.85 },
        tDepth: { value: this.sceneRT.depthTexture }, tCharDepth: { value: this.charRT.depthTexture },
        fullTexel: { value: new THREE.Vector2() }, gap: { value: 0 },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene; uniform float threshold; varying vec2 vUv;
        uniform sampler2D tDepth; uniform sampler2D tCharDepth; uniform vec2 fullTexel; uniform float gap;
        // perso caché en ce point de l'image pleine : décor devant lui d'au moins gap (profondeur brute)
        float hidden(vec2 o){
          vec2 uv = vUv + o * fullTexel;
          float cd = texture2D(tCharDepth, uv).r;
          return step(cd, 0.9999) * step(texture2D(tDepth, uv).r + gap, cd);
        }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          float l = max(max(c.r, c.g), c.b);
          // 4 prises sur les 16 pixels pleins de ce pixel au quart : les bras fins ne disparaissent pas
          float h = gap > 0.0 ? max(max(hidden(vec2(-1.0)), hidden(vec2(1.0))), max(hidden(vec2(-1.0, 1.0)), hidden(vec2(1.0, -1.0)))) : 0.0;
          gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.4, l), h);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture }, tDepth: { value: this.sceneRT.depthTexture },
        tCharDepth: { value: this.charRT.depthTexture }, tBloom: { value: this.brightRT.texture },
        tChar: { value: this.charRT.texture }, seeThrough: { value: seeThrough ? 1 : 0 },
        texel: { value: new THREE.Vector2() }, near: { value: 0.1 }, range: { value: 399.9 },
        ink: { value: 0.8 }, bloom: { value: 0.5 }, aspect: { value: 1 },
        sharpen: { value: 0.5 },
        lift: { value: new THREE.Vector3(0.0, 0.004, 0.014) }, gain: { value: new THREE.Vector3(1.05, 1.0, 0.95) },
        saturation: { value: 1.12 },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tCharDepth; uniform sampler2D tBloom;
        uniform sampler2D tChar; uniform float seeThrough;
        uniform vec2 texel; uniform float near; uniform float range; uniform float ink; uniform float bloom; uniform float aspect;
        uniform float sharpen;
        uniform vec3 lift; uniform vec3 gain; uniform float saturation; varying vec2 vUv;
        // caméra orthographique : profondeur linéaire
        float lin(float raw){ return near + raw * range; }
        float raw(vec2 o){ return texture2D(tDepth, vUv + o * texel).r; }
        // 1 si le pixel montre un perso : sa profondeur seule égale celle de la scène (pas masqué par un
        // décor) ; textureLod car appelé dans une branche (pas de dérivées implicites)
        float ch(vec2 o, float sceneRaw){
          float cd = textureLod(tCharDepth, vUv + o * texel, 0.0).r;
          return step(cd, 0.9999) * step(abs(lin(cd) - lin(sceneRaw)), 0.02);
        }
        vec3 toSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          // profondeur du pixel et de ses 4 voisins, lue une seule fois
          float r0 = raw(vec2(0.0)), rxp = raw(vec2(1.0,0.0)), rxm = raw(vec2(-1.0,0.0)), ryp = raw(vec2(0.0,1.0)), rym = raw(vec2(0.0,-1.0));
          float c0 = lin(r0);
          // netteté adaptative (AMD CAS simplifié) : renforce les détails peu contrastés, épargne
          // les bords déjà francs (pas de halo) ; poids négatif sur la croix des 4 voisins
          vec3 c = texture2D(tScene, vUv).rgb;
          vec3 nE = texture2D(tScene, vUv + vec2(texel.x, 0.0)).rgb, nW = texture2D(tScene, vUv - vec2(texel.x, 0.0)).rgb;
          vec3 nN = texture2D(tScene, vUv + vec2(0.0, texel.y)).rgb, nS = texture2D(tScene, vUv - vec2(0.0, texel.y)).rgb;
          vec3 mn = min(c, min(min(nE, nW), min(nN, nS))), mx = max(c, max(max(nE, nW), max(nN, nS)));
          vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
          vec3 wgt = -amp * mix(0.125, 0.2, sharpen);
          c = max((c + (nE + nW + nN + nS) * wgt) / (1.0 + 4.0 * wgt), 0.0);
          // contours : dérivée SECONDE de la profondeur, nulle sur toute surface plane (sol vu en
          // biais), forte seulement sur les vraies arêtes et silhouettes
          float lx = abs(lin(rxp) + lin(rxm) - 2.0 * c0);
          float ly = abs(lin(ryp) + lin(rym) - 2.0 * c0);
          float e = max(lx, ly);
          // persos : arêtes intérieures ignorées, seule la silhouette reste encrée (le masque ne sert
          // qu'au-dessus du seuil d'encre : calculé seulement là)
          if (e > 0.16) e *= 1.0 - ch(vec2(0.0), r0) * ch(vec2(1.0,0.0), rxp) * ch(vec2(-1.0,0.0), rxm) * ch(vec2(0.0,1.0), ryp) * ch(vec2(0.0,-1.0), rym);
          c = mix(c, vec3(0.02, 0.018, 0.035), smoothstep(0.16, 0.4, e) * ink);
          vec4 b = texture2D(tBloom, vUv);
          c += b.rgb * bloom;
          if (seeThrough > 0.5) {
            // perso caché : vu en transparence à travers le décor, dans une aura claire
            float cd = texture2D(tCharDepth, vUv).r;
            float hid = step(cd, 0.9999) * step(lin(r0) + ${HIDDEN_GAP.toFixed(2)}, lin(cd));
            vec3 aura = vec3(1.0, 0.93, 0.72);
            c = mix(c, texture2D(tChar, vUv).rgb * 0.9 + aura * 0.1, hid * 0.7);
            c += aura * smoothstep(0.0, 0.5, b.a) * (1.0 - hid * 0.8) * 0.45;
          }
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

  /** Étalonnage : gain par couleur et saturation (le cycle jour/nuit les fait varier). */
  setGrade(gain: THREE.Vector3, saturation: number): void {
    const u = this.finalMat.uniforms;
    (u.gain.value as THREE.Vector3).copy(gain);
    u.saturation.value = saturation;
  }

  /**
   * Taille de la vue en pixels CSS : les cibles suivent le tampon de dessin du canevas (réglé par
   * fitRenderer), au pixel près pour que la passe finale ne rééchantillonne pas l'image.
   */
  setSize(w: number, h: number): void {
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const pw = Math.max(1, buf.x), ph = Math.max(1, buf.y);
    this.pw = pw;
    this.ph = ph;
    this.sceneRT.setSize(pw, ph);
    this.charRT.setSize(pw, ph);
    const qw = Math.max(1, Math.round(pw / 4)), qh = Math.max(1, Math.round(ph / 4));
    this.brightRT.setSize(qw, qh);
    this.blurRT.setSize(qw, qh);
    (this.finalMat.uniforms.texel.value as THREE.Vector2).set(1 / pw, 1 / ph);
    (this.brightMat.uniforms.fullTexel.value as THREE.Vector2).set(1 / pw, 1 / ph);
    this.finalMat.uniforms.aspect.value = w / h;
  }

  private pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    const r = this.renderer, clear = r.autoClear;
    this.quad.material = mat;
    r.setRenderTarget(target);
    // le quad recouvre toute la cible : inutile de l'effacer avant
    r.autoClear = false;
    r.render(this.quadScene, this.quadCam);
    r.autoClear = clear;
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
    this.renderCharacter();
    // bloom (et masque du perso caché, en alpha)
    this.brightMat.uniforms.tScene.value = this.sceneRT.texture;
    const through = this.seeThrough && !this.tucked;
    this.brightMat.uniforms.gap.value = through ? HIDDEN_GAP / (this.camera.far - this.camera.near) : 0;
    this.finalMat.uniforms.seeThrough.value = through ? 1 : 0;
    this.pass(this.brightMat, this.brightRT);
    this.blur(this.brightRT, this.blurRT, 1);
    this.pass(this.finalMat, null);
    // nouveaux shaders depuis la dernière précompilation (un objet chargé ensuite) : leurs variantes
    // pour chaque nombre de lampes allumées, compilées en fond avant qu'on allume une lampe
    if (this.warmed >= 0 && r.info.programs && r.info.programs.length > this.warmed) void this.precompile();
  }

  /**
   * Compile d'avance les shaders de toute la scène (objets cachés compris), sans attendre leur
   * premier affichage : sinon chaque nouveau matériau à l'écran fige le jeu le temps de sa
   * compilation. Avec KHR_parallel_shader_compile, le pilote compile en parallèle.
   */
  async precompile(): Promise<void> {
    const r = this.renderer, prev = r.getRenderTarget();
    // même cible que le vrai rendu : l'espace de couleur de sortie fait partie de la clé du shader
    r.setRenderTarget(this.sceneRT);
    // une fois par nombre de lumières ponctuelles allumées (voir skipDarkLights) : de 0 à toutes
    const points = pointLights(this.scene), shown = points.map((l) => l.visible);
    const ready: Promise<unknown>[] = [];
    try {
      for (let n = 0; n <= points.length; n++) {
        points.forEach((l, i) => (l.visible = i < n));
        ready.push(r.compileAsync(this.scene, this.camera));
      }
    } finally {
      points.forEach((l, i) => (l.visible = shown[i]));
      r.setRenderTarget(prev);
    }
    this.warmed = r.info.programs?.length ?? 0;
    await Promise.all(ready);
  }

  /**
   * Les seuls maillages de persos (calque LAYER_CHARACTER) : leur profondeur, et en jeu leur couleur
   * (vue à travers le décor quand il les cache) ; sinon un matériau sans couleur, moins cher.
   */
  private renderCharacter(): void {
    const r = this.renderer, cam = this.camera, scene = this.scene;
    const bg = scene.background, layers = cam.layers.mask;
    scene.background = null;
    scene.overrideMaterial = this.seeThrough ? null : this.charMat;
    cam.layers.set(LAYER_CHARACTER);
    r.setRenderTarget(this.charRT);
    scene.matrixWorldAutoUpdate = false; // positions déjà calculées par le rendu principal
    // les cartes d'ombre sont déjà faites par le rendu principal : sans ça, three les efface et y
    // redessine le perso seul (les lumières sont aussi sur ce calque, voir lightAllPasses)
    const shadows = r.shadowMap, autoShadows = shadows.autoUpdate;
    shadows.autoUpdate = false;
    try {
      r.render(scene, cam);
    } finally {
      shadows.autoUpdate = autoShadows;
      scene.matrixWorldAutoUpdate = true;
      scene.overrideMaterial = null;
      scene.background = bg;
      cam.layers.mask = layers;
    }
  }

  /** Taille de l'image de scène en pixels (pour les captures). */
  get size(): { w: number; h: number } {
    return { w: this.pw, h: this.ph };
  }

  dispose(): void {
    for (const t of [this.sceneRT, this.brightRT, this.blurRT, this.charRT]) t.dispose();
    for (const m of [this.charMat, this.brightMat, this.blurMat, this.finalMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}
