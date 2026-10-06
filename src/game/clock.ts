/**
 * Horloge du jeu et lumière du jour.
 *
 * Le temps du jeu passe 4 fois plus vite que le temps réel (une journée = 6 h de jeu réel).
 * L'heure peut être changée à la volée (setHour) pour régler l'éclairage : ce saut ne compte
 * pas comme du temps écoulé, les besoins du perso n'en sont pas affectés.
 */
import * as THREE from 'three';

/** Vitesse normale : 4 minutes de jeu par minute réelle. */
export const TIME_SPEED = 4;
/** Lever et coucher du soleil (heures). */
export const SUNRISE = 6;
export const SUNSET = 20;

export class GameClock {
  /** Minutes de jeu depuis le jour 1 à 0 h. */
  minutes: number;
  /** Minutes de jeu par minute réelle (0 = pause). */
  speed = TIME_SPEED;

  constructor(startHour = 9) {
    this.minutes = startHour * 60;
  }

  /** Avance l'horloge de `dt` secondes réelles ; rend les heures de jeu écoulées. */
  tick(dt: number): number {
    const minutes = (dt * this.speed) / 60;
    this.minutes += minutes;
    return minutes / 60;
  }

  /** Heure du jour, de 0 à 24 (décimale). */
  get hour(): number {
    return (this.minutes / 60) % 24;
  }

  get day(): number {
    return Math.floor(this.minutes / 1440) + 1;
  }

  /** Règle l'heure du jour en cours (0 à 24). */
  setHour(h: number): void {
    this.minutes = (this.day - 1) * 1440 + THREE.MathUtils.clamp(h, 0, 23.999) * 60;
  }

  /** « 08:05 » */
  get label(): string {
    const m = Math.floor(this.minutes) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  get isNight(): boolean {
    const h = this.hour;
    return h < SUNRISE || h >= SUNSET;
  }
}

/** Ambiance d'une heure de la journée. */
interface SkyKey {
  h: number;
  /** Lumière principale (soleil, ou lune la nuit) : couleur et intensité. */
  key: [number, number, number];
  keyI: number;
  /** Lumière d'ambiance : ciel, sol renvoyé, intensité. */
  sky: [number, number, number];
  ground: [number, number, number];
  hemiI: number;
  /** Fond de scène (sRGB, comme un code couleur). */
  bg: [number, number, number];
  /** Étalonnage : gain par couleur et saturation. */
  gain: [number, number, number];
  sat: number;
}

const NIGHT: Omit<SkyKey, 'h'> = {
  key: [0.55, 0.66, 1.0], keyI: 0.5,
  sky: [0.3, 0.38, 0.62], ground: [0.06, 0.08, 0.11], hemiI: 0.6,
  bg: [0.03, 0.05, 0.1], gain: [0.8, 0.9, 1.18], sat: 0.7,
};
const DAY: Omit<SkyKey, 'h'> = {
  key: [1.0, 0.92, 0.78], keyI: 2.2,
  sky: [0.75, 0.85, 1.0], ground: [0.25, 0.32, 0.18], hemiI: 0.9,
  bg: [0.17, 0.23, 0.16], gain: [1.05, 1.0, 0.95], sat: 1.12,
};

/** Images clés de la journée, interpolées entre elles. */
const KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 4.5, ...NIGHT },
  // aube : lumière rose orangé, le soleil au ras de l'horizon
  { h: SUNRISE, key: [1.0, 0.55, 0.38], keyI: 0.05, sky: [0.56, 0.5, 0.64], ground: [0.16, 0.15, 0.14], hemiI: 0.6,
    bg: [0.22, 0.18, 0.26], gain: [1.0, 0.92, 0.96], sat: 0.95 },
  { h: 7.5, key: [1.0, 0.7, 0.48], keyI: 1.4, sky: [0.75, 0.74, 0.84], ground: [0.24, 0.26, 0.18], hemiI: 0.78,
    bg: [0.3, 0.28, 0.24], gain: [1.08, 0.98, 0.92], sat: 1.06 },
  { h: 10, ...DAY },
  { h: 15.5, ...DAY },
  // fin d'après-midi dorée puis coucher de soleil
  { h: 18.5, key: [1.0, 0.66, 0.4], keyI: 1.7, sky: [0.82, 0.72, 0.72], ground: [0.28, 0.24, 0.16], hemiI: 0.78,
    bg: [0.3, 0.22, 0.16], gain: [1.12, 0.96, 0.86], sat: 1.15 },
  { h: SUNSET, key: [1.0, 0.45, 0.3], keyI: 0.05, sky: [0.46, 0.38, 0.58], ground: [0.13, 0.11, 0.14], hemiI: 0.62,
    bg: [0.14, 0.1, 0.18], gain: [0.98, 0.9, 1.0], sat: 0.95 },
  { h: 21.5, ...NIGHT },
  { h: 24, ...NIGHT },
];

function lerp3(a: [number, number, number], b: [number, number, number], t: number, out: THREE.Color | THREE.Vector3, space: THREE.ColorSpace = THREE.LinearSRGBColorSpace): void {
  const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
  if (out instanceof THREE.Color) out.setRGB(x, y, z, space);
  else out.set(x, y, z);
}

/** Lumières et étalonnage pilotés par l'heure. */
export interface SkyTargets {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  scene: THREE.Scene;
  grade: (gain: THREE.Vector3, saturation: number) => void;
}

/** Plus haut point du soleil à midi (rad), comme l'éclairage d'origine. */
const SUN_MAX_ELEV = THREE.MathUtils.degToRad(56);
/** Hauteur minimale de la lumière : ombres longues mais pas infinies. */
const MIN_ELEV = THREE.MathUtils.degToRad(9);
/** Direction de la lune (vers la lumière), fixe. */
const MOON_DIR = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(42), THREE.MathUtils.degToRad(30));
/** Distance de la lumière au point suivi (dans la portée de la carte d'ombre). */
const LIGHT_DIST = 20;

const gain = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Règle la lumière pour l'heure `hour` ; la lumière principale reste centrée sur `focus`. */
export function applySky(hour: number, t: SkyTargets, focus: THREE.Vector3): void {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(hour, a.h, b.h);

  lerp3(a.key, b.key, k, t.sun.color);
  t.sun.intensity = a.keyI + (b.keyI - a.keyI) * k;
  lerp3(a.sky, b.sky, k, t.hemi.color);
  lerp3(a.ground, b.ground, k, t.hemi.groundColor);
  t.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * k;
  if (t.scene.background instanceof THREE.Color) lerp3(a.bg, b.bg, k, t.scene.background, THREE.SRGBColorSpace);
  lerp3(a.gain, b.gain, k, gain);
  t.grade(gain, a.sat + (b.sat - a.sat) * k);

  if (hour > SUNRISE && hour < SUNSET) {
    // le soleil se lève à l'est, passe au sud, se couche à l'ouest ; à midi il vient du même côté
    // que la lumière d'origine (arrière gauche du perso vu par la caméra de départ)
    const day = (hour - SUNRISE) / (SUNSET - SUNRISE);
    const elev = Math.max(MIN_ELEV, Math.sin(Math.PI * day) * SUN_MAX_ELEV);
    const az = THREE.MathUtils.degToRad(148 + (day - 0.5) * 160);
    dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
  } else {
    dir.copy(MOON_DIR);
  }
  t.sun.position.copy(focus).addScaledVector(dir, LIGHT_DIST).setY(dir.y * LIGHT_DIST);
  t.sun.target.position.set(focus.x, 0, focus.z);
}
