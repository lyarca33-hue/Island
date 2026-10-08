import { useEffect, useRef, useState } from 'react';
import { hhmm, SEASON_DAYS, SEASONS, TIME_SPEED, YEAR_DAYS } from '../game/clock';
import type { Game } from '../game/Game';
import { skillPerks } from '../game/items/freshness';
import { NEEDS } from '../game/needs';
import { WEATHERS, type WeatherKind } from '../game/meteo';
import { BODY_STATES, degrees, indoorTemp, NORMAL_TEMP } from '../game/temperature';
import { forecast, type GaugeKey, type GaugeState, GaugeWatch } from './gauges';
import { Icon, type IconName } from './icons';
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

type Level = 'ok' | 'mid' | 'low';
const LOW = 20;
const MID = 45;
/** Marge autour des seuils : une jauge qui oscille autour de 20 % ne clignote pas. */
const MARGIN = 2;

function levelOf(v: number, prev: Level | undefined): Level {
  const low = prev === 'low' ? LOW + MARGIN : LOW;
  const mid = prev === 'ok' || !prev ? MID : MID + MARGIN;
  return v < low ? 'low' : v < mid ? 'mid' : 'ok';
}

const ICONS: Record<GaugeKey, IconName> = { health: 'heart', fatigue: 'sleep', faim: 'food', soif: 'drop', hygiene: 'bubbles', vessie: 'toilet' };
/** Ce qui fait remonter la jauge, rappelé au survol quand elle baisse. */
const TIPS: Record<GaugeKey, string> = {
  health: 'Remonte quand tous les besoins dépassent 30 %',
  fatigue: 'Dormir dans un lit, ou boire un café',
  faim: 'Manger quelque chose (M)',
  soif: 'Boire (B)',
  hygiene: 'Se laver les mains, prendre une douche',
  vessie: 'Aller aux toilettes',
};
const GAUGES: Array<{ key: GaugeKey; label: string }> = [{ key: 'health', label: 'Santé' }, ...NEEDS.map((n) => ({ key: n.key, label: n.label }))];

/** Relève les jauges quelques fois par seconde, avec leur tendance et leur couleur. */
function useGauges(game: Game | null): { states: Record<GaugeKey, GaugeState>; levels: Record<GaugeKey, Level> } | null {
  const [read, setRead] = useState<{ states: Record<GaugeKey, GaugeState>; levels: Record<GaugeKey, Level> } | null>(null);
  useEffect(() => {
    if (!game) return;
    const watch = new GaugeWatch();
    let levels = {} as Record<GaugeKey, Level>;
    const tick = () => {
      const states = watch.read(game);
      levels = Object.fromEntries(GAUGES.map(({ key }) => [key, levelOf(states[key].value, levels[key])])) as Record<GaugeKey, Level>;
      setRead({ states, levels });
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [game]);
  return read;
}

/** Une jauge ronde ; au survol (ou au toucher) : valeur, tendance et prévision. */
function Gauge({ label, icon, state, level, open, onOpen, minutes, tip }: {
  label: string; icon: IconName; state: GaugeState; level: Level; open: boolean; onOpen: (open: boolean) => void; minutes: number; tip: string;
}) {
  const pct = Math.round(state.value);
  const f = forecast(state, minutes);
  const trend = state.trend === 'up' ? 'Remonte' : state.trend === 'fast' ? 'Baisse vite' : null;
  /** Doigt ou stylet : un appui ouvre ou ferme le détail (Safari ne donne pas le focus au toucher). */
  const touch = useRef<string | null>(null);
  return (
    <div className={`gauge ${level}`}>
      <button
        className="gauge-ring"
        aria-label={`${label} : ${pct} %${trend ? `, ${trend.toLowerCase()}` : ''}`}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onOpen(false)}
        onPointerDown={(e) => (touch.current = e.pointerType === 'mouse' ? null : e.pointerType)}
        onClick={() => {
          if (touch.current) onOpen(!open);
          touch.current = null;
        }}
        onFocus={() => !touch.current && onOpen(true)}
        onBlur={() => onOpen(false)}
      >
        <svg className="gauge-track" viewBox="0 0 36 36" aria-hidden>
          <circle className="gauge-bg" cx="18" cy="18" r="15.5" pathLength={100} />
          <circle className="gauge-fill" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${Math.max(0.01, state.value)} 100`} />
        </svg>
        <Icon name={icon} size={15} />
        {state.trend && (
          <span className={`gauge-trend ${state.trend}`}>
            <Icon name={state.trend === 'up' ? 'up' : 'down'} size={9} />
          </span>
        )}
      </button>
      {level === 'low' && !open && <span className="gauge-low" aria-hidden>{pct} %</span>}
      {open && (
        <div className="gauge-tip" role="tooltip">
          <div className="gauge-tip-head">
            <Icon name={icon} size={15} />
            <b>{label}</b>
            <span className="gauge-tip-value">{pct} %</span>
          </div>
          <div className="gauge-tip-bar"><span style={{ width: `${state.value}%` }} /></div>
          {trend && (
            <div className={`gauge-tip-row ${state.trend}`}>
              <Icon name={state.trend === 'up' ? 'up' : 'down'} size={13} /> {trend}
            </div>
          )}
          {f.text !== 'Remonte' && (
            <div className="gauge-tip-row">
              <Icon name="clock" size={13} />
              <span>
                <strong>{f.text}</strong>
                {f.when && ` · ${f.when}`}
              </span>
            </div>
          )}
          {level !== 'ok' && state.trend !== 'up' && <div className="gauge-tip-row gauge-tip-hint">{tip}</div>}
        </div>
      )}
    </div>
  );
}

/** La compétence cuisine, à côté des besoins : l'anneau montre l'avancée vers le niveau suivant. */
function SkillGauge({ game, open, onOpen }: { game: Game; open: boolean; onOpen: (open: boolean) => void }) {
  const { level, points, from, next } = game.cookingSkill;
  const pct = next === null ? 100 : Math.round(((points - from) / (next - from)) * 100);
  const touch = useRef<string | null>(null);
  return (
    <div className="gauge ok skill">
      <button
        className="gauge-ring"
        aria-label={`Compétence cuisine : niveau ${level}`}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onOpen(false)}
        onPointerDown={(e) => (touch.current = e.pointerType === 'mouse' ? null : e.pointerType)}
        onClick={() => {
          if (touch.current) onOpen(!open);
          touch.current = null;
        }}
        onFocus={() => !touch.current && onOpen(true)}
        onBlur={() => onOpen(false)}
      >
        <svg className="gauge-track" viewBox="0 0 36 36" aria-hidden>
          <circle className="gauge-bg" cx="18" cy="18" r="15.5" pathLength={100} />
          <circle className="gauge-fill" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${Math.max(0.01, pct)} 100`} />
        </svg>
        <Icon name="pot" size={15} />
        <span className="skill-level">{level}</span>
      </button>
      {open && (
        <div className="gauge-tip" role="tooltip">
          <div className="gauge-tip-head">
            <Icon name="pot" size={15} />
            <b>Cuisine</b>
            <span className="gauge-tip-value">niveau {level}</span>
          </div>
          <div className="gauge-tip-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="gauge-tip-row">{next === null ? 'Niveau maximum' : `${points - from} / ${next - from} points pour le niveau ${level + 1}`}</div>
          {level > 0 && skillPerks(level).map((p) => <div key={p} className="gauge-tip-row gauge-tip-hint">{p}</div>)}
          <div className="gauge-tip-row gauge-tip-hint">Monte en coupant, cuisant et préparant des plats</div>
        </div>
      )}
    </div>
  );
}

/** L'humeur, à côté de la compétence : l'anneau se remplit, sa couleur dit si ça va. */
function MoodGauge({ game, open, onOpen }: { game: Game; open: boolean; onOpen: (open: boolean) => void }) {
  const pct = Math.round(game.mood);
  const word = pct >= 70 ? 'Joyeux' : pct >= 45 ? 'Ça va' : pct >= 30 ? 'Bof' : 'Morose';
  const tone = pct >= 70 ? 'happy' : pct < 30 ? 'low' : 'ok';
  const touch = useRef<string | null>(null);
  return (
    <div className={`gauge mood ${tone}`}>
      <button
        className="gauge-ring"
        aria-label={`Humeur : ${pct} sur 100, ${word.toLowerCase()}`}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onOpen(false)}
        onPointerDown={(e) => (touch.current = e.pointerType === 'mouse' ? null : e.pointerType)}
        onClick={() => {
          if (touch.current) onOpen(!open);
          touch.current = null;
        }}
        onFocus={() => !touch.current && onOpen(true)}
        onBlur={() => onOpen(false)}
      >
        <svg className="gauge-track" viewBox="0 0 36 36" aria-hidden>
          <circle className="gauge-bg" cx="18" cy="18" r="15.5" pathLength={100} />
          <circle className="gauge-fill" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${Math.max(0.01, pct)} 100`} />
        </svg>
        <Icon name="smile" size={15} />
      </button>
      {open && (
        <div className="gauge-tip" role="tooltip">
          <div className="gauge-tip-head">
            <Icon name="smile" size={15} />
            <b>Humeur</b>
            <span className="gauge-tip-value">{word}</span>
          </div>
          <div className="gauge-tip-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="gauge-tip-row">{pct} / 100</div>
          {game.moodFactor !== 1 && <div className="gauge-tip-row gauge-tip-hint">{game.moodFactor > 1 ? 'Apprend la cuisine plus vite' : 'Apprend la cuisine moins vite'}</div>}
          <div className="gauge-tip-row gauge-tip-hint">Monte en mangeant assis à table, avec de bons plats et un vrai petit-déjeuner</div>
        </div>
      )}
    </div>
  );
}

/**
 * La température du corps : l'anneau est plein à 37 °C et se vide en s'en éloignant ; bleu quand
 * le perso a froid, orangé quand il a chaud. Au survol : la température, le ressenti et pourquoi.
 */
function BodyGauge({ game, open, onOpen }: { game: Game; open: boolean; onOpen: (open: boolean) => void }) {
  const b = game.body;
  const { label, tip } = BODY_STATES[b.state];
  const pct = Math.max(0, 100 - (Math.abs(b.temp - NORMAL_TEMP) / 4) * 100);
  const tone = b.state === 'normal' ? 'ok' : b.state === 'froid' || b.state === 'hypothermie' ? 'cold' : 'hot';
  const danger = b.state === 'hypothermie' || b.state === 'coup de chaleur';
  const trend = b.trend > 0 ? 'Se réchauffe' : b.trend < 0 ? 'Se refroidit' : null;
  const touch = useRef<string | null>(null);
  return (
    <div className={`gauge body ${tone}${danger ? ' low' : ''}`}>
      <button
        className="gauge-ring"
        aria-label={`Température : ${b.label}, ${label.toLowerCase()}`}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onOpen(false)}
        onPointerDown={(e) => (touch.current = e.pointerType === 'mouse' ? null : e.pointerType)}
        onClick={() => {
          if (touch.current) onOpen(!open);
          touch.current = null;
        }}
        onFocus={() => !touch.current && onOpen(true)}
        onBlur={() => onOpen(false)}
      >
        <svg className="gauge-track" viewBox="0 0 36 36" aria-hidden>
          <circle className="gauge-bg" cx="18" cy="18" r="15.5" pathLength={100} />
          <circle className="gauge-fill" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${Math.max(0.01, pct)} 100`} />
        </svg>
        <Icon name="thermo" size={15} />
        {b.state !== 'normal' && b.trend !== 0 && (
          <span className={`gauge-trend ${(b.trend > 0) === (tone === 'cold') ? 'up' : 'fast'}`}>
            <Icon name={b.trend > 0 ? 'up' : 'down'} size={9} />
          </span>
        )}
      </button>
      {tone !== 'ok' && !open && <span className="gauge-low" aria-hidden>{b.label}</span>}
      {open && (
        <div className="gauge-tip" role="tooltip">
          <div className="gauge-tip-head">
            <Icon name="thermo" size={15} />
            <b>Température</b>
            <span className="gauge-tip-value">{b.label}</span>
          </div>
          <div className="gauge-tip-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="gauge-tip-row">{label}{trend && ` · ${trend.toLowerCase()}`}</div>
          <div className="gauge-tip-row">
            Ressenti {degrees(b.felt)} · {b.causes.join(', ')}
          </div>
          <div className="gauge-tip-row gauge-tip-hint">Dehors {degrees(b.outdoor)}, maison {degrees(indoorTemp(b.outdoor))}</div>
          {tip && <div className="gauge-tip-row gauge-tip-hint">{tip}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * En haut à droite : les jauges de besoins (rondes, sans texte ; le détail au survol) et
 * l'horloge, qui ouvre le réglage de l'heure.
 */
export function NeedsHud({ game, onClock }: { game: Game | null; onClock: () => void }) {
  const read = useGauges(game);
  const [open, setOpen] = useState<GaugeKey | 'body' | 'skill' | 'mood' | null>(null);
  if (!game || !read) return null;
  const { clock } = game;
  return (
    <div className="hud-status">
      <div className="hud-gauges" role="group" aria-label="Besoins du perso">
        {GAUGES.map(({ key, label }) => (
          <Gauge
            key={key}
            label={label}
            icon={ICONS[key]}
            tip={TIPS[key]}
            state={read.states[key]}
            level={read.levels[key]}
            open={open === key}
            onOpen={(o) => setOpen((cur) => (o ? key : cur === key ? null : cur))}
            minutes={clock.minutes}
          />
        ))}
        <BodyGauge game={game} open={open === 'body'} onOpen={(o) => setOpen((cur) => (o ? 'body' : cur === 'body' ? null : cur))} />
        <SkillGauge game={game} open={open === 'skill'} onOpen={(o) => setOpen((cur) => (o ? 'skill' : cur === 'skill' ? null : cur))} />
        <MoodGauge game={game} open={open === 'mood'} onOpen={(o) => setOpen((cur) => (o ? 'mood' : cur === 'mood' ? null : cur))} />
      </div>
      <button className="hud-clock" onClick={onClock} title="Régler l’heure (Menu → Heure)">
        <span className={`hud-sky${clock.isNight ? ' night' : ''}`}>
          <Icon name={clock.isNight ? 'moon' : 'sun'} size={14} />
        </span>
        <b>{clock.label}</b>
        {clock.speed === 0 && <Icon name="pause" size={13} className="hud-paused" />}
        <span className="hud-day" title={`Jour ${clock.day} · lever ${hhmm(clock.sun.rise)}, coucher ${hhmm(clock.sun.set)}`}>{clock.dateLabel}</span>
        <span className="hud-weather" title={`${game.weather.label}, ${degrees(game.body.outdoor)} dehors`}>{game.weather.icon}</span>
        <span className="hud-outdoor">{degrees(game.body.outdoor)}</span>
      </button>
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
      <span>Météo : <b>{game.weather.label}</b>, {degrees(game.body.outdoor)} dehors</span>
      <div className="time-speeds">
        <button className={game.weather.force === null ? 'active' : ''} title="Selon la saison" onClick={() => (game.weather.force = null)}>Auto</button>
        {(Object.keys(WEATHERS) as WeatherKind[]).map((k) => (
          <button key={k} className={game.weather.force === k ? 'active' : ''} title={WEATHERS[k].name} onClick={() => (game.weather.force = k)}>
            {WEATHERS[k].icon}
          </button>
        ))}
      </div>
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
