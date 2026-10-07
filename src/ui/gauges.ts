import type { Game } from '../game/Game';
import { NEEDS, type NeedKey } from '../game/needs';

/** Une jauge du HUD : les quatre besoins et la santé. */
export type GaugeKey = NeedKey | 'health';

/** « remonte » (manger, boire, dormir…), « baisse vite » (courir, la nuit…), ou rien de notable. */
export type Trend = 'up' | 'fast' | null;

export interface GaugeState {
  value: number;
  trend: Trend;
  /** Points gagnés (> 0) ou perdus (< 0) par heure de jeu ces dernières secondes ; null : temps arrêté. */
  rate: number | null;
}

/** Fenêtre d'observation, en millisecondes réelles. */
const WINDOW = 3000;
/** Gain d'un coup entre deux relevés (une gorgée, une bouchée) : la jauge remonte. */
const STEP_UP = 0.02;
/** Une remontée reste signalée un moment après la dernière gorgée. */
const UP_HOLD = 1500;
/** Chute d'un coup entre deux relevés (jauge réglée à la main, coup) : pas un rythme de fond. */
const STEP_DOWN = 0.5;
/** Remontée lente mais continue (sommeil), en points par heure de jeu. */
const SLOW_UP = 0.3;
/** Baisse plus rapide que le rythme de base de ce facteur : « baisse vite ». */
const FAST = 1.5;
/** La santé ne baisse que quand ça va mal : toute baisse se voit. */
const HEALTH_FAST = 0.5;
/** Un saut d'heure (curseur du menu) plus grand que ça n'est pas du temps vécu. */
const MAX_STEP_HOURS = 0.5;

const BASE: Record<NeedKey, number> = Object.fromEntries(NEEDS.map((n) => [n.key, n.perHour])) as Record<NeedKey, number>;

interface Step {
  t: number;
  dh: number;
  dv: Record<GaugeKey, number>;
}

/**
 * Suit les jauges au fil des relevés du HUD (quelques fois par seconde) pour dire si elles
 * remontent ou baissent vite, et à quel rythme : de quoi afficher une flèche de tendance et une
 * prévision (« à zéro dans 3 h 20 »). Ne touche pas au jeu, ne fait que lire.
 */
export class GaugeWatch {
  private last: { t: number; minutes: number; v: Record<GaugeKey, number> } | null = null;
  private steps: Step[] = [];
  private upUntil: Partial<Record<GaugeKey, number>> = {};
  private downUntil = 0;

  read(game: Game, now = performance.now()): Record<GaugeKey, GaugeState> {
    const v = { ...game.needs.values, health: game.needs.health } as Record<GaugeKey, number>;
    const minutes = game.clock.minutes;
    const last = this.last;
    this.last = { t: now, minutes, v };
    if (last) {
      const dh = (minutes - last.minutes) / 60;
      if (dh < 0 || dh > MAX_STEP_HOURS) this.steps = [];
      else {
        const dv = {} as Record<GaugeKey, number>;
        for (const k of Object.keys(v) as GaugeKey[]) {
          dv[k] = v[k] - last.v[k];
          if (dv[k] > STEP_UP) this.upUntil[k] = now + UP_HOLD;
        }
        if (dv.health < -STEP_UP) this.downUntil = now + UP_HOLD;
        this.steps.push({ t: now, dh, dv });
      }
    }
    while (this.steps.length && this.steps[0].t < now - WINDOW) this.steps.shift();

    const out = {} as Record<GaugeKey, GaugeState>;
    const hours = this.steps.reduce((s, x) => s + x.dh, 0);
    for (const k of Object.keys(v) as GaugeKey[]) {
      // le rythme de fond : les gorgées, bouchées et chutes d'un coup n'y comptent pas
      let dv = 0;
      let dh = 0;
      for (const s of this.steps) {
        if (s.dv[k] > STEP_UP || s.dv[k] < -STEP_DOWN) continue;
        dv += s.dv[k];
        dh += s.dh;
      }
      const rate = hours > 0 && dh > 0 ? dv / dh : null;
      const up = (this.upUntil[k] ?? 0) > now || (rate !== null && rate > SLOW_UP);
      let fast = false;
      if (!up && rate !== null) fast = k === 'health' ? rate < -HEALTH_FAST : rate < -FAST * BASE[k];
      if (k === 'health' && this.downUntil > now) fast = true;
      out[k] = { value: v[k], trend: up ? 'up' : fast ? 'fast' : null, rate };
    }
    return out;
  }
}

/** « 3 h 20 », « 45 min », « plus de 2 jours ». */
export function duration(hours: number): string {
  if (hours > 48) return `plus de ${Math.floor(hours / 24)} jours`;
  const total = Math.max(1, Math.round((hours * 60) / 5) * 5);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** L'heure du jeu dans `hours` heures : « vers 12:20 », « demain vers 07:10 » (rien au-delà). */
export function clockAt(minutes: number, hours: number): string {
  const t = minutes + hours * 60;
  const days = Math.floor(t / 1440) - Math.floor(minutes / 1440);
  const m = Math.floor(t) % 1440;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return days === 0 ? `vers ${hhmm}` : days === 1 ? `demain vers ${hhmm}` : '';
}

/**
 * Prévision au survol d'une jauge, au rythme actuel : « À zéro dans 3 h 20 » et l'heure du jeu
 * correspondante, « Au maximum dans 40 min » quand elle remonte. `minutes` : l'horloge du jeu.
 */
export function forecast(g: GaugeState, minutes: number): { text: string; when: string } {
  if (g.rate === null) return { text: 'Temps en pause', when: '' };
  if (g.trend === 'up' && g.rate > SLOW_UP) {
    if (g.value >= 99.5) return { text: 'Au maximum', when: '' };
    const h = (100 - g.value) / g.rate;
    return { text: `Au maximum dans ${duration(h)}`, when: clockAt(minutes, h) };
  }
  if (g.trend === 'up') return { text: 'Remonte', when: '' };
  if (g.value <= 0.5) return { text: 'À zéro', when: '' };
  if (g.rate > -0.05) return { text: 'Stable', when: '' };
  const h = g.value / -g.rate;
  return { text: `À zéro dans ${duration(h)}`, when: clockAt(minutes, h) };
}
