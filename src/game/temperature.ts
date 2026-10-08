/**
 * Température du corps : le perso a froid ou chaud selon le temps qu'il fait, et ça se ressent.
 *
 * Dehors, l'air suit la saison (un hiver autour de 0 °C, un été autour de 25 °C), l'heure (plus frais
 * la nuit, le plus chaud vers 15 h) et la météo (la pluie et la neige rafraîchissent). La maison est
 * chauffée : on y est entre 17 et 21 °C. Le « ressenti » ajoute ce qui réchauffe ou refroidit le
 * perso : le soleil, un feu de gazinière ou le four à côté, l'effort (courir), la couette du lit, une
 * boisson chaude ou fraîche, et surtout être mouillé (pluie, sortie de douche sans se sécher).
 *
 * Le corps tend vers 37 °C tant que le ressenti reste confortable (15 à 26 °C, habillé), et s'en éloigne
 * sinon, en une heure de jeu environ. Les conséquences :
 * - froid (sous 36,3 °C) : le perso grelotte, se fatigue et a faim plus vite ;
 * - hypothermie (sous 35 °C) : en plus, la santé baisse ;
 * - chaud (au-dessus de 37,6 °C) : il transpire, a soif et se salit plus vite ;
 * - coup de chaleur (au-dessus de 38,8 °C) : en plus, la santé baisse.
 * Hors de la normale, la santé ne remonte pas.
 */
import type { GameClock } from './clock';
import type { Weather } from './meteo';
import type { NeedKey } from './needs';

export const NORMAL_TEMP = 37;

/** Moyenne de la journée au plus chaud de l'été et au plus froid de l'hiver (°C). */
const SUMMER_MEAN = 23;
const WINTER_MEAN = 1;
/** Position dans l'année (0 à 1) du plus chaud : le milieu de l'été, comme le jour le plus long. */
const WARMEST = 1.5 / 4;
/** Écart entre la nuit et l'après-midi (°C, de part et d'autre de la moyenne), réduit par temps couvert. */
const DAY_SWING = 5;
/** Heure la plus chaude de la journée. */
const WARMEST_HOUR = 15;

/** Maison chauffée : la température visée, et la part du dehors qui passe quand même les murs. */
const HOUSE = 20;
const HOUSE_LEAK = 0.15;

/** Confort : entre ces deux ressentis, le corps reste à 37 °C. */
const COMFORT_LOW = 15;
const COMFORT_HIGH = 26;
/** Degrés de corps perdus (ou gagnés) par degré de ressenti hors du confort. */
const COLD_SLOPE = 0.12;
const HOT_SLOPE = 0.18;
/** Temps (heures de jeu) pour faire les deux tiers du chemin vers la température visée. */
const TAU = 0.75;

/** Soleil franc sur la peau, dehors en plein jour (°C de ressenti). */
const SUN = 3;
/** Effort : la marche et la course réchauffent. */
const EFFORT: Record<Gait, number> = { idle: 0, sit: -1, sleep: 0, walk: 2, run: 6 };
/** Couette du lit : ressenti en plus, jusqu'à un ressenti confortable. */
const DUVET = 8;
/** Mouillé de la tête aux pieds : ressenti en moins (l'eau qui s'évapore refroidit). */
const SOAKED = 9;
/** Sous la douche chaude : ressenti. */
const SHOWER_FELT = 30;
/** La pluie trempe en vingt minutes de jeu ; on sèche en une heure à l'abri (deux près d'un feu). */
const SOAK_PER_HOUR = 3;
const DRY_PER_HOUR = 1;

/** Une tasse pleine d'une boisson chaude (ou fraîche) : chaleur intérieure gagnée (ou perdue), en °C de ressenti. */
const HOT_CUP = 8;
const COLD_CUP = -5;
/** Un plat chaud entier. */
const HOT_MEAL = 6;
/** La chaleur intérieure retombe de tant de degrés par heure de jeu. */
const INNER_FADE = 8;
const INNER_MAX = 12;

/** Boissons chaudes, et boissons fraîches (du frigo). */
const HOT_DRINKS = new Set(['café', 'thé', 'eau chaude', 'chocolat chaud', 'soupe']);
const COLD_DRINKS = new Set(["jus d'orange", 'soda', 'eau gazeuse', 'vin', 'lait', 'jus de fruits']);

/** Seuils des états du corps (°C). */
const HYPO = 35;
const COLD = 36.3;
const HOT = 37.6;
const STROKE = 38.8;
/** Marge autour des seuils : un corps qui oscille autour de 36,3 °C ne change pas d'état sans arrêt. */
const MARGIN = 0.1;

/** Santé perdue par heure de jeu en hypothermie ou en coup de chaleur. */
const HARM = 6;

type Gait = 'idle' | 'walk' | 'run' | 'sit' | 'sleep';

export type BodyState = 'hypothermie' | 'froid' | 'normal' | 'chaud' | 'coup de chaleur';

export const BODY_STATES: Record<BodyState, { label: string; tip: string }> = {
  hypothermie: { label: 'Hypothermie', tip: 'Vite, au chaud : rentrer, se sécher, une boisson chaude, le lit' },
  froid: { label: 'A froid', tip: 'Rentrer au chaud, se sécher, boire un café ou un thé, se mettre près du feu' },
  normal: { label: 'Normale', tip: '' },
  chaud: { label: 'A chaud', tip: 'Se mettre à l’ombre ou à l’intérieur, boire frais, ne pas courir' },
  'coup de chaleur': { label: 'Coup de chaleur', tip: 'Vite, au frais : à l’intérieur, boire beaucoup, se reposer' },
};

/** Multiplicateurs de baisse des besoins selon l'état du corps (voir Needs.factors). */
const NEED_FACTORS: Record<BodyState, Partial<Record<NeedKey, number>>> = {
  hypothermie: { fatigue: 2, faim: 1.6 },
  froid: { fatigue: 1.4, faim: 1.3 },
  normal: {},
  chaud: { soif: 1.6, hygiene: 1.5, fatigue: 1.15 },
  'coup de chaleur': { soif: 2.2, hygiene: 1.8, fatigue: 1.5 },
};

/** Température de l'air dehors (°C) à l'heure du jeu, selon la saison et la météo. */
export function outdoorTemp(clock: GameClock, weather: Weather): number {
  const mean = (SUMMER_MEAN + WINTER_MEAN) / 2 + ((SUMMER_MEAN - WINTER_MEAN) / 2) * Math.cos(2 * Math.PI * (clock.yearPos - WARMEST));
  const swing = DAY_SWING * (1 - 0.5 * weather.cloud) * Math.cos((2 * Math.PI * (clock.hour - WARMEST_HOUR)) / 24);
  // la neige ne tombe que par temps froid : au plus 1 °C quand elle tombe fort
  const t = mean + swing - 3 * weather.rain;
  return weather.snow > 0.05 ? Math.min(t, 1 + 3 * (1 - weather.snow)) : t;
}

/** Température dans la maison chauffée, selon celle du dehors. */
export function indoorTemp(outdoor: number): number {
  return HOUSE + (outdoor - HOUSE) * HOUSE_LEAK;
}

/** Ce que le jeu dit au corps à chaque image. */
export interface BodyInput {
  clock: GameClock;
  weather: Weather;
  /** Le perso est dehors (pas sous un toit). */
  outdoors: boolean;
  gait: Gait;
  /** Couché dans un lit (sous la couette). */
  inBed: boolean;
  /** Sous la douche (chaude). */
  showering: boolean;
  /** Sorti de la douche sans s'être séché. */
  showerWet: boolean;
  /** Chaleur des appareils allumés tout près (°C de ressenti). */
  nearHeat: number;
}

export class BodyTemp {
  /** Température du corps (°C). */
  temp = NORMAL_TEMP;
  /** Trempé par la pluie (0 à 1) ; sèche à l'abri, ou d'un coup à la serviette. */
  soaked = 0;
  /** Chaleur (ou fraîcheur) intérieure d'une boisson ou d'un plat, en °C de ressenti : retombe en une heure. */
  inner = 0;
  /** Air dehors, air autour du perso, et ce qu'il ressent (°C), à la dernière mise à jour. */
  outdoor = 15;
  air = 20;
  felt = 20;
  /** Température vers laquelle va le corps. */
  target = NORMAL_TEMP;
  /** Ce qui compte dans le ressenti : « dehors », « mouillé », « près du feu »… */
  causes: string[] = [];
  state: BodyState = 'normal';

  /** Fait passer `hours` heures de jeu ; rend l'état précédent quand il change, sinon null. */
  update(hours: number, i: BodyInput): BodyState | null {
    const w = i.weather;
    this.outdoor = outdoorTemp(i.clock, w);
    this.air = i.outdoors ? this.outdoor : indoorTemp(this.outdoor);
    const causes: string[] = [i.outdoors ? 'dehors' : 'à l’intérieur'];
    let felt = this.air;
    if (i.outdoors) {
      const day = !i.clock.isNight ? Math.max(0, Math.sin((Math.PI * (i.clock.hour - 6)) / 14)) : 0;
      const sun = SUN * day * (1 - w.cloud);
      if (sun > 1) causes.push('au soleil');
      felt += sun;
      if (w.rain > 0.05) causes.push('sous la pluie');
      if (w.snow > 0.05) causes.push('sous la neige');
    }
    // trempé par la pluie (la neige mouille moins) ; on sèche à l'abri, plus vite près d'un feu
    const h = Math.max(0, hours);
    const falling = i.outdoors ? w.rain + 0.4 * w.snow : 0;
    if (falling > 0.05) this.soaked = Math.min(1, this.soaked + SOAK_PER_HOUR * falling * h);
    else this.soaked = Math.max(0, this.soaked - DRY_PER_HOUR * (i.nearHeat > 0 ? 2 : 1) * h);
    const wet = Math.max(this.soaked, i.showerWet ? 1 : 0);
    if (wet > 0.15) causes.push(wet > 0.6 ? 'trempé' : 'mouillé');
    felt -= SOAKED * wet;
    if (i.nearHeat > 0.5) causes.push('près d’un feu');
    felt += i.nearHeat;
    if (EFFORT[i.gait] > 2) causes.push('en courant');
    felt += EFFORT[i.gait];
    if (i.inBed && felt < COMFORT_LOW + 4) {
      causes.push('sous la couette');
      felt = Math.min(COMFORT_LOW + 4, felt + DUVET);
    }
    this.inner = Math.sign(this.inner) * Math.max(0, Math.abs(this.inner) - INNER_FADE * h);
    if (this.inner > 1) causes.push('boisson chaude');
    else if (this.inner < -1) causes.push('boisson fraîche');
    felt += this.inner;
    if (i.showering) {
      felt = SHOWER_FELT;
      causes.splice(0, causes.length, 'sous la douche chaude');
    }
    this.felt = felt;
    this.causes = causes;

    this.target = felt < COMFORT_LOW ? NORMAL_TEMP - (COMFORT_LOW - felt) * COLD_SLOPE
      : felt > COMFORT_HIGH ? NORMAL_TEMP + (felt - COMFORT_HIGH) * HOT_SLOPE : NORMAL_TEMP;
    this.target = Math.min(41, Math.max(32, this.target));
    this.temp += (this.target - this.temp) * (1 - Math.exp(-h / TAU));

    const before = this.state;
    this.state = this.stateOf(before);
    return this.state !== before ? before : null;
  }

  /** L'état du corps, avec une marge pour ne pas changer d'état à chaque image autour d'un seuil. */
  private stateOf(prev: BodyState): BodyState {
    const t = this.temp;
    // rester dans l'état où l'on est demande de dépasser le seuil de MARGIN pour en sortir
    const e = (s: BodyState) => (prev === s ? MARGIN : 0);
    if (t < HYPO + e('hypothermie')) return 'hypothermie';
    if (t < COLD + e('froid')) return 'froid';
    if (t > STROKE - e('coup de chaleur')) return 'coup de chaleur';
    if (t > HOT - e('chaud')) return 'chaud';
    return 'normal';
  }

  /** Le corps se réchauffe (> 0), se refroidit (< 0) ou reste stable (0). */
  get trend(): number {
    const d = this.target - this.temp;
    return Math.abs(d) < 0.08 ? 0 : Math.sign(d);
  }

  /** Multiplicateurs de baisse des besoins (grelotter fatigue, transpirer donne soif). */
  get needFactors(): Partial<Record<NeedKey, number>> {
    return NEED_FACTORS[this.state];
  }

  /** Santé perdue par heure de jeu. */
  get harm(): number {
    return this.state === 'hypothermie' || this.state === 'coup de chaleur' ? HARM : 0;
  }

  /** Une gorgée de `contents` (part d'une tasse pleine) : une boisson chaude réchauffe, une fraîche rafraîchit. */
  drink(contents: string, amount: number): void {
    if (HOT_DRINKS.has(contents)) this.addInner(HOT_CUP * amount);
    else if (COLD_DRINKS.has(contents)) this.addInner(COLD_CUP * amount);
  }

  /** Une bouchée (part d'un plat entier) d'un aliment de chaleur `heat` (1 sort du feu, 0 froid). */
  eat(heat: number, amount: number): void {
    if (heat > 0.15) this.addInner(HOT_MEAL * heat * amount);
  }

  /** Séché à la serviette. */
  dry(): void {
    this.soaked = 0;
  }

  private addInner(n: number): void {
    this.inner = Math.min(INNER_MAX, Math.max(-INNER_MAX, this.inner + n));
  }

  /** « 36,8 °C » */
  get label(): string {
    return `${this.temp.toFixed(1).replace('.', ',')} °C`;
  }
}

/** « 12 °C » */
export const degrees = (t: number) => `${Math.round(t)} °C`;
