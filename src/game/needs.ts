/**
 * Besoins du perso : fatigue, faim, soif, hygiène. Chaque jauge va de 100 (tout va bien) à 0
 * et baisse avec le temps du jeu (GameClock), plus vite quand le perso marche ou court.
 *
 * Rythmes choisis pour une journée « normale » : on tient environ 16 h éveillé, on a faim
 * toutes les 5-6 h (vide en 14 h sans manger), soif plus souvent (vide en 10 h), et on se lave
 * une fois par jour. Les actions du jeu remontent les jauges avec restore() (boire un café…).
 */

export type NeedKey = 'fatigue' | 'faim' | 'soif' | 'hygiene';

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
];

/** La nuit (heure du coucher passée), la fatigue se fait sentir plus vite. */
const NIGHT_FATIGUE = 1.4;

export class Needs {
  values: Record<NeedKey, number> = { fatigue: 85, faim: 70, soif: 65, hygiene: 90 };

  /** Fait passer `hours` heures de jeu ; `gait` : ce que fait le perso pendant ce temps. */
  tick(hours: number, gait: 'idle' | 'walk' | 'run', night: boolean): void {
    if (hours <= 0) return;
    for (const n of NEEDS) {
      let rate = n.perHour * (gait === 'run' ? n.run : gait === 'walk' ? n.walk : 1);
      if (n.key === 'fatigue' && night) rate *= NIGHT_FATIGUE;
      this.values[n.key] = Math.max(0, this.values[n.key] - rate * hours);
    }
  }

  /** Remonte une jauge (ex. restore('soif', 30) en buvant). */
  restore(key: NeedKey, amount: number): void {
    this.values[key] = Math.min(100, Math.max(0, this.values[key] + amount));
  }

  /** Règle une jauge directement (tests, console : game.needs.set('faim', 10)). */
  set(key: NeedKey, value: number): void {
    this.values[key] = Math.min(100, Math.max(0, value));
  }
}
