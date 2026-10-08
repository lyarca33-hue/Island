/**
 * Horloge du jeu, calendrier, saisons et lumière du jour.
 *
 * Le temps du jeu passe 4 fois plus vite que le temps réel (une journée = 6 h de jeu réel).
 * L'heure et la date peuvent être changées à la volée (setHour, setDayOfYear) : ce saut ne compte
 * pas comme du temps écoulé, les besoins du perso n'en sont pas affectés.
 *
 * Calendrier : semaines de 7 jours, 4 saisons d'une semaine chacune (année de 28 jours), le jeu
 * commence le lundi 1er du printemps. Les jours rallongent jusqu'au milieu de l'été et raccourcissent
 * jusqu'au milieu de l'hiver.
 */
import * as THREE from 'three';

/** Vitesse normale : 4 minutes de jeu par minute réelle. */
export const TIME_SPEED = 4;
/**
 * Lever et coucher du soleil de l'« heure solaire » : la lumière (ciel, lampes, fenêtres) est réglée
 * pour une journée de 6 h à 20 h, et l'heure réelle y est ramenée selon la saison (solarHour).
 */
export const SUNRISE = 6;
export const SUNSET = 20;

/** Jours par saison, et par année. */
export const SEASON_DAYS = 7;
export const YEAR_DAYS = 4 * SEASON_DAYS;
export const SEASONS = [
  { name: 'Printemps', icon: '🌸' },
  { name: 'Été', icon: '🌻' },
  { name: 'Automne', icon: '🍂' },
  { name: 'Hiver', icon: '❄️' },
] as const;
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Position dans l'année (0 à 1) où le jour est le plus long : le milieu de l'été. */
const LONGEST = 1.5 / 4;
/** Lever et coucher aux équinoxes, et leur écart au plus long et au plus court des jours (heures). */
const RISE_MID = 6.5, RISE_SWING = 1.75;
const SET_MID = 19.5, SET_SWING = 2;
/** Hauteur du soleil à midi (degrés) : moyenne et écart entre l'été et l'hiver. */
const ELEV_MID = 54, ELEV_SWING = 14;

/** Longueur du jour à la position `yearPos` dans l'année : 1 au plus long, -1 au plus court. */
function daylight(yearPos: number): number {
  return Math.cos(2 * Math.PI * (yearPos - LONGEST));
}

/** Heure de lever et de coucher du soleil à la position `yearPos` dans l'année. */
export function sunTimes(yearPos: number): { rise: number; set: number } {
  const d = daylight(yearPos);
  return { rise: RISE_MID - RISE_SWING * d, set: SET_MID + SET_SWING * d };
}

/** « 05:45 » */
export function hhmm(h: number): string {
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

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

  /** Jour dans l'année, de 0 à YEAR_DAYS - 1. */
  get dayOfYear(): number {
    return (this.day - 1) % YEAR_DAYS;
  }

  get year(): number {
    return Math.floor((this.day - 1) / YEAR_DAYS) + 1;
  }

  /** Saison : 0 printemps, 1 été, 2 automne, 3 hiver. */
  get season(): number {
    return Math.floor(this.dayOfYear / SEASON_DAYS);
  }

  /** Jour dans la saison, de 1 à SEASON_DAYS. */
  get dayOfSeason(): number {
    return (this.dayOfYear % SEASON_DAYS) + 1;
  }

  get weekday(): string {
    return WEEKDAYS[(this.day - 1) % 7];
  }

  /** « Lundi 3 printemps, an 1 » */
  get dateLabel(): string {
    return `${this.weekday} ${this.dayOfSeason === 1 ? '1er' : this.dayOfSeason} ${SEASONS[this.season].name.toLowerCase()}, an ${this.year}`;
  }

  /** Position dans l'année, de 0 (début du printemps) à 1, qui avance aussi avec les heures. */
  get yearPos(): number {
    return ((this.minutes / 1440) % YEAR_DAYS) / YEAR_DAYS;
  }

  /** Lever et coucher du soleil aujourd'hui. */
  get sun(): { rise: number; set: number } {
    return sunTimes(this.yearPos);
  }

  /**
   * Heure ramenée à une journée de SUNRISE à SUNSET : en été, 5 h du matin donne déjà l'aube de
   * 6 h ; en hiver, il fait encore nuit à 7 h. Sert à toute la lumière (ciel, lampes, fenêtres).
   */
  get solarHour(): number {
    const h = this.hour, { rise, set } = this.sun;
    if (h < rise) return (h / rise) * SUNRISE;
    if (h < set) return SUNRISE + ((h - rise) / (set - rise)) * (SUNSET - SUNRISE);
    return SUNSET + ((h - set) / (24 - set)) * (24 - SUNSET);
  }

  /** Hauteur du soleil à midi aujourd'hui (rad) : haut l'été, bas l'hiver. */
  get noonElevation(): number {
    return THREE.MathUtils.degToRad(ELEV_MID + ELEV_SWING * daylight(this.yearPos));
  }

  /** Va au jour `d` de l'année en cours (0 à YEAR_DAYS - 1), à la même heure. */
  setDayOfYear(d: number): void {
    const day = (this.year - 1) * YEAR_DAYS + THREE.MathUtils.clamp(Math.round(d), 0, YEAR_DAYS - 1);
    this.minutes = day * 1440 + (this.minutes % 1440);
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
    const h = this.solarHour;
    return h < SUNRISE || h >= SUNSET;
  }
}

/** Allure d'une saison dehors. */
interface SeasonLook {
  /** Teinte de l'herbe (multipliée à sa texture). */
  grass: [number, number, number];
  /** Part de neige au sol (0 à 1). */
  snow: number;
  /** Poussières dehors : couleur (au-dessus de 1 pour le bloom) et vitesse de chute (m/s). */
  motes: [number, number, number];
  fall: number;
}

const LOOKS: SeasonLook[] = [
  // printemps : herbe fraîche, pétales roses qui flottent
  { grass: [0.92, 1.08, 0.92], snow: 0, motes: [2.3, 1.35, 1.75], fall: 0.12 },
  // été : herbe dorée, poussières de lumière
  { grass: [1.12, 1.02, 0.7], snow: 0, motes: [2.2, 1.9, 1.2], fall: 0 },
  // automne : herbe rousse, feuilles qui tombent
  { grass: [1.55, 0.78, 0.38], snow: 0, motes: [2.3, 1.05, 0.35], fall: 0.35 },
  // hiver : neige au sol, flocons
  { grass: [1.0, 1.0, 1.05], snow: 0.85, motes: [2.1, 2.2, 2.5], fall: 0.7 },
];

/** Allure du dehors à la position `yearPos` dans l'année : chaque saison passe à la suivante en un jour ou deux. */
export function seasonLook(yearPos: number): SeasonLook {
  // de milieu de saison en milieu de saison
  const f = (((yearPos * 4 - 0.5) % 4) + 4) % 4;
  const i = Math.floor(f);
  const a = LOOKS[i], b = LOOKS[(i + 1) % 4];
  const t = THREE.MathUtils.smoothstep(f - i, 0.35, 0.65);
  const mix3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] =>
    [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  return { grass: mix3(a.grass, b.grass), snow: a.snow + (b.snow - a.snow) * t, motes: mix3(a.motes, b.motes), fall: a.fall + (b.fall - a.fall) * t };
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

/** Hauteur minimale de la lumière : ombres longues mais pas infinies. */
const MIN_ELEV = THREE.MathUtils.degToRad(9);
/** Direction de la lune (vers la lumière), fixe. */
const MOON_DIR = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(42), THREE.MathUtils.degToRad(30));
/** Distance de la lumière au point suivi (dans la portée de la carte d'ombre). */
const LIGHT_DIST = 20;

const gain = new THREE.Vector3();
const dir = new THREE.Vector3();

const grey = new THREE.Color();
/** Étalonnage sous un ciel couvert : un peu froid. */
const OVERCAST_GAIN = new THREE.Vector3(0.94, 0.96, 1.0);

/**
 * Règle la lumière pour l'heure solaire `hour` (voir GameClock.solarHour), avec le soleil à
 * `noonElev` (rad) à midi ; la lumière principale reste centrée sur `focus`. `overcast` (0 à 1) :
 * ciel couvert (météo), soleil voilé, lumière grise et couleurs ternes.
 */
export function applySky(hour: number, noonElev: number, t: SkyTargets, focus: THREE.Vector3, overcast = 0): void {
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
  let sat = a.sat + (b.sat - a.sat) * k;
  if (overcast > 0) {
    // nuages : le soleil ne fait plus d'ombre franche, tout tire vers le gris
    t.sun.intensity *= 1 - 0.85 * overcast;
    t.hemi.intensity *= 1 + 0.2 * overcast;
    const toGrey = (c: THREE.Color, f: number, dim = 1) => {
      const l = (c.r * 0.3 + c.g * 0.55 + c.b * 0.15) * dim;
      c.lerp(grey.setRGB(l, l, l * 1.04), f);
    };
    toGrey(t.sun.color, 0.6 * overcast);
    toGrey(t.hemi.color, 0.55 * overcast);
    if (t.scene.background instanceof THREE.Color) toGrey(t.scene.background, 0.7 * overcast, 0.85);
    gain.lerp(OVERCAST_GAIN, 0.6 * overcast);
    sat *= 1 - 0.35 * overcast;
  }
  t.grade(gain, sat);

  if (hour > SUNRISE && hour < SUNSET) {
    // le soleil se lève à l'est, passe au sud, se couche à l'ouest ; à midi il vient du même côté
    // que la lumière d'origine (arrière gauche du perso vu par la caméra de départ)
    const day = (hour - SUNRISE) / (SUNSET - SUNRISE);
    const elev = Math.max(MIN_ELEV, Math.sin(Math.PI * day) * noonElev);
    const az = THREE.MathUtils.degToRad(148 + (day - 0.5) * 160);
    dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
  } else {
    dir.copy(MOON_DIR);
  }
  t.sun.position.copy(focus).addScaledVector(dir, LIGHT_DIST).setY(dir.y * LIGHT_DIST);
  t.sun.target.position.set(focus.x, 0, focus.z);
}
