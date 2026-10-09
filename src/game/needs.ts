/**
 * Besoins du perso : fatigue, faim, soif, hygiène, vessie. Chaque jauge va de 100 (tout va bien) à 0
 * et baisse avec le temps du jeu (GameClock), plus vite quand le perso marche ou court.
 *
 * Rythmes choisis pour une journée « normale » : on tient environ 16 h éveillé, on a faim
 * toutes les 5-6 h (vide en 14 h sans manger), soif plus souvent (vide en 10 h), et on se lave
 * une fois par jour. La vessie se remplit en 8 h environ, plus vite quand on boit : il faut
 * passer aux toilettes. Les actions du jeu remontent les jauges avec restore() (boire un café…).
 */

export type NeedKey = 'fatigue' | 'faim' | 'soif' | 'hygiene' | 'vessie';

export interface NeedDef {
  key: NeedKey;
  label: string;
  icon: string;
  /** Points perdus par heure de jeu, perso immobile. */
  perHour: number;
  /** Multiplicateurs quand le perso marche / court. */
  walk: number;
  run: number;
}

export const NEEDS: NeedDef[] = [
  { key: 'fatigue', label: 'Fatigue', icon: '😴', perHour: 100 / 16, walk: 1.2, run: 2 },
  { key: 'faim', label: 'Faim', icon: '🍞', perHour: 100 / 14, walk: 1.1, run: 1.4 },
  { key: 'soif', label: 'Soif', icon: '💧', perHour: 100 / 10, walk: 1.2, run: 1.8 },
  { key: 'hygiene', label: 'Hygiène', icon: '🧼', perHour: 100 / 24, walk: 1.1, run: 1.6 },
  { key: 'vessie', label: 'Vessie', icon: '🚽', perHour: 100 / 8, walk: 1, run: 1.2 },
];

/** Ce qui est bu remplit la vessie : part de la soif rendue qui s'y retrouve. */
const DRINK_TO_BLADDER = 0.4;

/** Assis, on se fatigue deux fois moins vite. */
const SIT_FATIGUE = 0.5;

/** Endormi : la fatigue remonte (pleine en 7 h de sommeil), les autres besoins baissent deux fois moins vite. */
const SLEEP_REST = 100 / 7;
const SLEEP_SLOW = 0.5;

/** La nuit (heure du coucher passée), la fatigue se fait sentir plus vite. */
const NIGHT_FATIGUE = 1.4;

/**
 * Santé perdue par heure de jeu quand un besoin est à zéro : la soif fait le plus de mal, puis
 * la faim, puis l'épuisement ; une hygiène à zéro use très lentement (petits bobos, infections).
 */
const HARM_AT_ZERO: Record<NeedKey, number> = { soif: 12, faim: 6, fatigue: 4, hygiene: 1, vessie: 0 };
/** Santé regagnée par heure quand tous les besoins sont au-dessus de HEAL_ABOVE. */
const HEAL_PER_HOUR = 3;
const HEAL_ABOVE = 30;

export class Needs {
  values: Record<NeedKey, number> = { fatigue: 85, faim: 70, soif: 65, hygiene: 90, vessie: 75 };
  /**
   * Santé, de 100 à 0. Elle baisse quand un besoin reste à zéro (ou sur un coup : hurt), et
   * remonte doucement tant que tous les besoins vont bien.
   */
  health = 100;
  /** Multiplicateurs de baisse en plus (ex. le froid fatigue : { fatigue: 1.4 }, voir temperature.ts). */
  factors: Partial<Record<NeedKey, number>> = {};
  /** La santé peut remonter (faux quand le corps a trop froid ou trop chaud). */
  canHeal = true;
  /** Besoins en pause (cuisine seule, sans lit ni salle de bain : voir carte.ts) : restent pleins. */
  readonly paused = new Set<NeedKey>();

  /** Met des besoins en pause : ils restent à 100 jusqu'à nouvel ordre. */
  pause(keys: NeedKey[]): void {
    for (const k of keys) this.paused.add(k);
    this.hold();
  }

  private hold(): void {
    for (const k of this.paused) this.values[k] = 100;
  }

  /** Fait passer `hours` heures de jeu ; `gait` : ce que fait le perso pendant ce temps. */
  tick(hours: number, gait: 'idle' | 'walk' | 'run' | 'sit' | 'sleep', night: boolean): void {
    if (hours <= 0) return;
    this.hold();
    for (const n of NEEDS) {
      if (this.paused.has(n.key)) continue;
      if (gait === 'sleep') {
        this.values[n.key] = n.key === 'fatigue' ? Math.min(100, this.values[n.key] + SLEEP_REST * hours) : Math.max(0, this.values[n.key] - n.perHour * SLEEP_SLOW * hours);
        continue;
      }
      let rate = n.perHour * (gait === 'run' ? n.run : gait === 'walk' ? n.walk : 1);
      if (n.key === 'fatigue' && night) rate *= NIGHT_FATIGUE;
      if (n.key === 'fatigue' && gait === 'sit') rate *= SIT_FATIGUE;
      rate *= this.factors[n.key] ?? 1;
      this.values[n.key] = Math.max(0, this.values[n.key] - rate * hours);
    }
    let harm = 0;
    for (const n of NEEDS) if (this.values[n.key] <= 0) harm += HARM_AT_ZERO[n.key];
    if (harm > 0) this.hurt(harm * hours);
    else if (this.canHeal && NEEDS.every((n) => this.values[n.key] >= HEAL_ABOVE)) this.heal(HEAL_PER_HOUR * hours);
  }

  /** Fait perdre de la santé (chute, objet cassé qui blesse…). */
  hurt(amount: number): void {
    this.health = Math.min(100, Math.max(0, this.health - amount));
  }

  /** Rend de la santé (soin, repas…). */
  heal(amount: number): void {
    this.hurt(-amount);
  }

  /** Remonte une jauge (ex. restore('soif', 30) en buvant). */
  restore(key: NeedKey, amount: number): void {
    this.values[key] = Math.min(100, Math.max(0, this.values[key] + amount));
    if (key === 'soif' && amount > 0) this.values.vessie = Math.max(0, this.values.vessie - amount * DRINK_TO_BLADDER);
    this.hold();
  }

  /** Règle une jauge directement (tests, console : game.needs.set('faim', 10)). */
  set(key: NeedKey, value: number): void {
    this.values[key] = Math.min(100, Math.max(0, value));
    this.hold();
  }
}
