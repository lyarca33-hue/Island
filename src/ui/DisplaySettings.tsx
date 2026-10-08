import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import type { Quality } from '../game/postfx';
import './time.css';

const QUALITIES: Array<[Quality, string]> = [['basse', 'Basse'], ['normale', 'Normale'], ['haute', 'Haute']];
const FPS_KEY = 'rp-island-fps';

/** Compteur d'images affiché ou non (mémorisé). */
export function useFpsShown(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(FPS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(FPS_KEY, v ? '1' : '0');
    } catch {
      // stockage indisponible : réglage pour cette partie seulement
    }
  };
  return [on, set];
}

/** Réglages d'affichage (dans le menu) : qualité d'image et compteur d'images. */
export function DisplayControls({ game, fps, onFps }: { game: Game | null; fps: boolean; onFps: (on: boolean) => void }) {
  const [quality, setQuality] = useState<Quality | null>(game?.quality ?? null);
  useEffect(() => setQuality(game?.quality ?? null), [game]);
  if (!game) return null;
  return (
    <div className="menu-form time-controls">
      <span>Qualité d’image</span>
      <div className="time-speeds">
        {QUALITIES.map(([q, label]) => (
          <button key={q} className={quality === q ? 'active' : ''} onClick={() => { game.quality = q; setQuality(q); }}>{label}</button>
        ))}
      </div>
      <small>Basse : plus fluide sur un ordinateur portable ou un écran Retina, image un peu plus douce.</small>
      <label className="menu-check">
        <input type="checkbox" checked={fps} onChange={(e) => onFps(e.target.checked)} />
        <span>Afficher les images par seconde</span>
      </label>
      <SoundControls game={game} />
    </div>
  );
}

/** Sons de cuisine : activés ou coupés, et leur volume (mémorisés). */
function SoundControls({ game }: { game: Game }) {
  const [on, setOn] = useState(game.sound.on);
  const [volume, setVolume] = useState(game.sound.volume);
  return (
    <>
      <label className="menu-check">
        <input type="checkbox" checked={on} onChange={(e) => { game.sound.on = e.target.checked; setOn(e.target.checked); }} />
        <span>Sons de cuisine</span>
      </label>
      {on && (
        <label className="menu-check">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume des sons" onChange={(e) => { game.sound.volume = +e.target.value; setVolume(+e.target.value); }} />
        </label>
      )}
    </>
  );
}

/** Images par seconde, durée d'une image et taille de l'image 3D, relues deux fois par seconde. */
export function FpsCounter({ game }: { game: Game | null }) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!game) return;
    const id = window.setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [game]);
  if (!game) return null;
  const { fps, ms, pixels } = game.fps;
  const level = fps >= 50 ? 'ok' : fps >= 28 ? 'mid' : 'low';
  return (
    <div className={`hud-fps ${level}`} title="Images par seconde · durée moyenne d’une image · pixels de l’image 3D">
      <b>{Math.round(fps)}</b> i/s · {ms.toFixed(1)} ms · {(pixels / 1e6).toFixed(1)} Mpx
    </div>
  );
}
