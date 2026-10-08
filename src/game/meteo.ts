/**
 * La météo : ciel clair, nuageux (gris), pluie ou neige, selon la saison.
 *
 * Le temps qu'il fait change par tranches de 6 h de jeu, tiré au sort d'après la date (le même jour
 * donne toujours la même météo) avec des chances propres à chaque saison : pluies de printemps,
 * été plutôt beau, automne pluvieux, neige l'hiver. On passe d'une tranche à la suivante en
 * fondu. Le menu Heure peut forcer un temps (force).
 *
 * Ce module rend aussi la pluie et les flocons autour du perso (dehors seulement : pas sous les
 * toits) et les gouttes qui coulent sur les vitres des fenêtres.
 *
 * L'état se lit dans `Weather` : `rain` et `snow` (0 à 1) servent par exemple au bruit de la pluie.
 */
import * as THREE from 'three';
import { SEASON_DAYS, YEAR_DAYS, type GameClock } from './clock';

export type WeatherKind = 'clair' | 'nuageux' | 'pluie' | 'neige';

export const WEATHERS: Record<WeatherKind, { name: string; icon: string }> = {
  clair: { name: 'Beau temps', icon: '☀️' },
  nuageux: { name: 'Nuageux', icon: '☁️' },
  pluie: { name: 'Pluie', icon: '🌧️' },
  neige: { name: 'Neige', icon: '❄️' },
};

/** Chances de chaque temps (sur 100), par saison : printemps, été, automne, hiver. */
const ODDS: Array<Array<[WeatherKind, number]>> = [
  [['clair', 45], ['nuageux', 30], ['pluie', 25]],
  [['clair', 70], ['nuageux', 18], ['pluie', 12]],
  [['clair', 30], ['nuageux', 30], ['pluie', 40]],
  [['clair', 30], ['nuageux', 25], ['neige', 35], ['pluie', 10]],
];

/** Durée d'une tranche de météo (minutes de jeu), et du fondu vers la suivante. */
const BLOCK = 6 * 60;
const BLEND = 75;

interface Sky {
  cloud: number;
  rain: number;
  snow: number;
}

/** Nombre pseudo-aléatoire stable (0 à 1) pour l'entier `n`. */
function hash(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function kindAt(block: number): { kind: WeatherKind; strength: number } {
  const day = Math.floor((block * BLOCK) / 1440);
  const season = Math.floor((day % YEAR_DAYS) / SEASON_DAYS);
  let r = hash(block, 1) * 100;
  let kind: WeatherKind = 'clair';
  for (const [k, p] of ODDS[season]) {
    kind = k;
    if ((r -= p) < 0) break;
  }
  return { kind, strength: 0.55 + 0.45 * hash(block, 2) };
}

function skyOf(kind: WeatherKind, strength = 1): Sky {
  switch (kind) {
    case 'clair': return { cloud: 0, rain: 0, snow: 0 };
    case 'nuageux': return { cloud: 0.45 + 0.3 * strength, rain: 0, snow: 0 };
    case 'pluie': return { cloud: 1, rain: strength, snow: 0 };
    case 'neige': return { cloud: 0.85, rain: 0, snow: strength };
  }
}

export class Weather {
  /** Temps imposé depuis le menu ; null : selon la saison. */
  force: WeatherKind | null = null;
  /** Ciel couvert (0 : bleu, 1 : gris). */
  cloud = 0;
  /** Force de la pluie (0 à 1). */
  rain = 0;
  /** Force de la neige qui tombe (0 à 1). */
  snow = 0;
  /** Sol mouillé par la pluie (0 à 1) : sèche en quelques heures. */
  wet = 0;
  /** Neige tombée au sol (0 à 1) : fond en quelques heures. */
  cover = 0;
  /** Temps du moment (ou à venir, pendant le fondu). */
  kind: WeatherKind = 'clair';
  private started = false;

  get label(): string {
    return WEATHERS[this.kind].name;
  }

  get icon(): string {
    return WEATHERS[this.kind].icon;
  }

  /** Avance la météo : `dt` secondes réelles, `hours` heures de jeu écoulées. */
  update(clock: GameClock, dt: number, hours: number): void {
    let target: Sky;
    if (this.force) {
      this.kind = this.force;
      target = skyOf(this.force);
    } else {
      const block = Math.floor(clock.minutes / BLOCK);
      const a = kindAt(block), b = kindAt(block + 1);
      const sa = skyOf(a.kind, a.strength), sb = skyOf(b.kind, b.strength);
      const t = THREE.MathUtils.smoothstep(clock.minutes - block * BLOCK, BLOCK - BLEND, BLOCK);
      this.kind = t < 0.5 ? a.kind : b.kind;
      target = { cloud: sa.cloud + (sb.cloud - sa.cloud) * t, rain: sa.rain + (sb.rain - sa.rain) * t, snow: sa.snow + (sb.snow - sa.snow) * t };
    }
    // fondu en temps réel : changer d'heure ou de temps dans le menu ne fait pas sauter le ciel
    const k = this.started ? Math.min(1, dt * 0.7) : 1;
    this.started = true;
    this.cloud += (target.cloud - this.cloud) * k;
    this.rain += (target.rain - this.rain) * k;
    this.snow += (target.snow - this.snow) * k;
    // le sol se mouille en une demi-heure de pluie et sèche en ~3 h ; la neige tient ~2 h après
    const h = Math.max(0, hours);
    this.wet = this.rain > 0.05 ? Math.min(1, this.wet + h * 2 * this.rain) : Math.max(0, this.wet - h / 3);
    this.cover = this.snow > 0.05 ? Math.min(1, this.cover + h * 0.8 * this.snow) : Math.max(0, this.cover - (this.rain > 0.05 ? h : h / 2.5));
  }
}

// ——— pluie et flocons ———

const DROPS = 1500;
const FLAKES = 1000;
/** Demi-côté de la boîte de pluie autour du perso (m), et hauteur d'où elle tombe. */
const SPREAD = 12;
const TOP = 9;
/** Vitesse de chute (m/s) et longueur des traits de pluie (m). */
const RAIN_SPEED = 9;
const STREAK = 0.8;
const SNOW_SPEED = 0.9;

export interface Precipitation {
  group: THREE.Group;
  /** `hidden(x, y, z)` : rien ne tombe là (sous un toit, ou devant la pièce coupée où est le perso). */
  update(dt: number, center: THREE.Vector3, w: Weather, hidden: (x: number, y: number, z: number) => boolean): void;
}

export function createPrecipitation(): Precipitation {
  const group = new THREE.Group();
  const wrap = (v: number) => ((((v + SPREAD) % (2 * SPREAD)) + 2 * SPREAD) % (2 * SPREAD)) - SPREAD;

  // pluie : des traits fins, légèrement penchés par le vent
  const drop = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i++) {
    drop[i * 3] = (Math.random() * 2 - 1) * SPREAD;
    drop[i * 3 + 1] = Math.random() * TOP;
    drop[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD;
  }
  const rainPos = new Float32Array(DROPS * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xd2e2f2, transparent: true, opacity: 0.7, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);

  // neige : des points blancs qui tombent en se balançant
  const flake = new Float32Array(FLAKES * 3);
  const phase = new Float32Array(FLAKES);
  for (let i = 0; i < FLAKES; i++) {
    flake[i * 3] = (Math.random() * 2 - 1) * SPREAD;
    flake[i * 3 + 1] = Math.random() * TOP;
    flake[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const snowPos = new Float32Array(FLAKES * 3);
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({ color: new THREE.Color(1.5, 1.55, 1.65), size: 4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  group.add(snow);

  const wind = new THREE.Vector2(0.9, 0.35);
  let t = 0;
  const HIDE = -50;
  return {
    group,
    update(dt, center, w, hidden) {
      t += dt;
      // pluie : on ne dessine qu'une part des gouttes, selon la force
      const nRain = Math.round(DROPS * w.rain);
      rain.visible = nRain > 0;
      if (rain.visible) {
        rainMat.opacity = 0.45 + 0.4 * w.rain;
        for (let i = 0; i < nRain; i++) {
          let y = drop[i * 3 + 1] - RAIN_SPEED * dt;
          if (y < 0) y += TOP;
          drop[i * 3 + 1] = y;
          drop[i * 3] += wind.x * dt;
          drop[i * 3 + 2] += wind.y * dt;
          const x = center.x + wrap(drop[i * 3] - center.x);
          const z = center.z + wrap(drop[i * 3 + 2] - center.z);
          const o = i * 6;
          if (hidden(x, y, z)) {
            rainPos.fill(HIDE, o, o + 6);
            continue;
          }
          const k = STREAK / RAIN_SPEED;
          rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
          rainPos[o + 3] = x - wind.x * k; rainPos[o + 4] = y + STREAK; rainPos[o + 5] = z - wind.y * k;
        }
        rainGeo.setDrawRange(0, nRain * 2);
        rainGeo.attributes.position.needsUpdate = true;
      }
      const nSnow = Math.round(FLAKES * w.snow);
      snow.visible = nSnow > 0;
      if (snow.visible) {
        for (let i = 0; i < nSnow; i++) {
          let y = flake[i * 3 + 1] - SNOW_SPEED * (0.7 + 0.6 * Math.sin(phase[i]) ** 2) * dt;
          if (y < 0) y += TOP;
          flake[i * 3 + 1] = y;
          flake[i * 3] += wind.x * 0.4 * dt;
          const ph = phase[i];
          const x = center.x + wrap(flake[i * 3] + Math.sin(t * 0.8 + ph) * 0.4 - center.x);
          const z = center.z + wrap(flake[i * 3 + 2] + Math.cos(t * 0.6 + ph) * 0.4 - center.z);
          const o = i * 3;
          if (hidden(x, y, z)) snowPos.fill(HIDE, o, o + 3);
          else { snowPos[o] = x; snowPos[o + 1] = y; snowPos[o + 2] = z; }
        }
        snowGeo.setDrawRange(0, nSnow);
        snowGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}

// ——— gouttes sur les vitres ———

/** Texture de gouttes : des perles et quelques traînées, qui se répète de haut en bas. */
function dropsTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bead = (x: number, y: number, r: number) => {
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(210,228,245,0.55)');
    grad.addColorStop(1, 'rgba(160,190,220,0)');
    g.fillStyle = grad;
    // dessinée aussi décalée d'un côté : la texture se raccorde en se répétant
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 70; i++) bead(rnd() * S, rnd() * S, 1.2 + rnd() * 2.2);
  // traînées : une goutte qui a coulé laisse un filet au-dessus d'elle
  for (let i = 0; i < 7; i++) {
    const x = rnd() * S, y = rnd() * S, len = 18 + rnd() * 40;
    g.strokeStyle = 'rgba(220,235,250,0.35)';
    g.lineWidth = 1.2;
    for (const dy of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(x, y + dy);
      g.bezierCurveTo(x + 2, y - len * 0.3 + dy, x - 2, y - len * 0.7 + dy, x + 1, y - len + dy);
      g.stroke();
    }
    bead(x, y, 2.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface WindowDrops {
  update(dt: number, w: Weather): void;
}

/**
 * Gouttes de pluie sur les vitres `panes` : un calque posé sur chaque vitre, qui glisse lentement
 * vers le bas (les gouttes coulent) et apparaît avec la pluie, puis sèche quand elle s'arrête.
 */
export function createWindowDrops(panes: THREE.Mesh[]): WindowDrops {
  const near = dropsTexture(), far = near.clone();
  near.repeat.set(1.5, 1.5);
  far.repeat.set(2.3, 2.3);
  far.offset.set(0.37, 0.2);
  const mat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, color: 0xdfeaf5 });
  const layers = [mat(near), mat(far)];
  for (const pane of panes) {
    for (const [i, m] of layers.entries()) {
      const film = new THREE.Mesh(pane.geometry, m);
      // plus épais que la vitre : le calque passe devant elle, des deux côtés
      const box = pane.geometry.boundingBox ?? (pane.geometry.computeBoundingBox(), pane.geometry.boundingBox!);
      const size = box.getSize(new THREE.Vector3());
      const thin = Math.min(size.x, size.y, size.z), k = 1.6 + i * 0.4;
      film.scale.set(size.x === thin ? k : 1, size.y === thin ? k : 1, size.z === thin ? k : 1);
      film.name = 'gouttes';
      film.castShadow = film.receiveShadow = false;
      film.renderOrder = 1;
      pane.add(film);
    }
  }
  let level = 0;
  return {
    update(dt, w) {
      // les vitres se couvrent vite sous la pluie, sèchent lentement
      const target = Math.min(1, w.rain * 1.4);
      level += (target - level) * Math.min(1, dt * (target > level ? 0.5 : 0.08));
      for (const m of layers) {
        m.opacity = level;
        m.visible = level > 0.01;
      }
      // les gouttes coulent : la plus proche vite, l'autre plus lentement
      near.offset.y += dt * 0.05 * (0.4 + w.rain);
      far.offset.y += dt * 0.02 * (0.4 + w.rain);
    },
  };
}

/**
 * Vitres de fenêtre parmi les objets `vitre` de la scène : celles qui donnent dehors (d'un côté
 * de la vitre, on est hors de toute pièce). La paroi de douche, toute dans la pièce, n'en est pas.
 */
export function outdoorPanes(scene: THREE.Object3D, inside: (x: number, z: number) => boolean): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'vitre') return;
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const size = geo.boundingBox!.getSize(new THREE.Vector3());
    const thin = Math.min(size.x, size.y, size.z);
    n.set(size.x === thin ? 1 : 0, size.y === thin && size.x !== thin ? 1 : 0, size.z === thin && size.x !== thin && size.y !== thin ? 1 : 0);
    m.getWorldPosition(p);
    m.getWorldQuaternion(q);
    n.applyQuaternion(q).setY(0);
    if (n.lengthSq() < 0.01) return;
    n.normalize().multiplyScalar(0.45);
    if (!inside(p.x + n.x, p.z + n.z) || !inside(p.x - n.x, p.z - n.z)) out.push(m);
  });
  return out;
}
