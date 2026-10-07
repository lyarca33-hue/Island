import { useEffect, useState } from 'react';
import { hhmm, SEASON_DAYS, SEASONS, TIME_SPEED, YEAR_DAYS } from '../game/clock';
import type { Game } from '../game/Game';
import { NEEDS } from '../game/needs';
import './time.css';

/** Relit l'horloge et les besoins du jeu quelques fois par seconde. */
function useTick(game: Game | null): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!game) return;
    const id = window.setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [game]);
}

/** En haut à droite, sous la caméra : date, saison, heure et jauges de besoins du perso. */
export function NeedsHud({ game }: { game: Game | null }) {
  useTick(game);
  if (!game) return null;
  const { clock, needs } = game;
  const season = SEASONS[clock.season];
  const sun = clock.sun;
  return (
    <div className="hud-needs">
      <div className="hud-clock">
        <span aria-hidden>{clock.isNight ? '🌙' : '☀️'}</span> <b>{clock.label}</b>
        {clock.speed === 0 && <span className="hud-paused"> ⏸</span>}
      </div>
      <div className="hud-date" title={`Jour ${clock.day} · lever ${hhmm(sun.rise)}, coucher ${hhmm(sun.set)}`}>
        <span aria-hidden>{season.icon}</span> {clock.dateLabel}
      </div>
      <div className="need need-health" title={`Santé : ${Math.round(needs.health)} / 100`}>
        <span className="need-label"><span aria-hidden>❤️</span> Santé</span>
        <span className="need-bar"><span className="need-fill health" style={{ width: `${needs.health}%` }} /></span>
      </div>
      {NEEDS.map((n) => {
        const v = needs.values[n.key];
        const level = v < 20 ? 'low' : v < 45 ? 'mid' : 'ok';
        return (
          <div key={n.key} className="need" title={`${n.label} : ${Math.round(v)} / 100`}>
            <span className="need-label"><span aria-hidden>{n.icon}</span> {n.label}</span>
            <span className="need-bar"><span className={`need-fill ${level}`} style={{ width: `${v}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

const SPEEDS: Array<[number, string]> = [[0, '⏸ Pause'], [TIME_SPEED, '×4'], [60, '×60']];

/** Réglage de l'heure et de la date (dans le menu) : curseurs, saisons et vitesse du temps. */
export function TimeControls({ game }: { game: Game | null }) {
  useTick(game);
  if (!game) return null;
  const { clock } = game;
  const sun = clock.sun;
  return (
    <div className="menu-form time-controls">
      <label>
        <span>Date : <b>{clock.dateLabel}</b></span>
        <input
          type="range" min={0} max={YEAR_DAYS - 1} step={1} value={clock.dayOfYear}
          onChange={(e) => clock.setDayOfYear(Number(e.target.value))}
        />
      </label>
      <div className="time-speeds">
        {SEASONS.map((s, i) => (
          <button key={s.name} className={clock.season === i ? 'active' : ''} title={s.name}
            onClick={() => clock.setDayOfYear(i * SEASON_DAYS + Math.floor(SEASON_DAYS / 2))}>
            {s.icon} {s.name}
          </button>
        ))}
      </div>
      <small>Soleil : lever {hhmm(sun.rise)}, coucher {hhmm(sun.set)}. Une saison dure {SEASON_DAYS} jours.</small>
      <label>
        <span>Heure : <b>{clock.label}</b></span>
        <input
          type="range" min={0} max={23.75} step={0.25} value={Math.floor(clock.hour * 4) / 4}
          onChange={(e) => clock.setHour(Number(e.target.value))}
        />
      </label>
      <div className="time-speeds">
        {SPEEDS.map(([s, label]) => (
          <button key={s} className={clock.speed === s ? 'active' : ''} onClick={() => (clock.speed = s)}>{label}</button>
        ))}
      </div>
      <small>×4 : vitesse normale (1 journée = 6 h réelles). Changer l’heure ne fait pas baisser les besoins.</small>
    </div>
  );
}
