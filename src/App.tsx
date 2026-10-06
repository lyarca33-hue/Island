import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';

/** Scène 3D plein écran + interface minimale (titre, aide, rotation de caméra). */
export function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const g = new Game(host.current);
    game.current = g;
    (window as unknown as { game: Game }).game = g; // console : game.rotateCamera(1)...
    g.start().then(() => setLoading(false)).catch((e) => {
      console.error(e);
      setError('Le personnage n’a pas pu être chargé.');
    });
    return () => {
      g.dispose();
      game.current = null;
    };
  }, []);

  return (
    <div className="app">
      <div ref={host} className="viewport" />
      <header className="hud-title">Rp Island</header>
      <div className="hud-cam">
        <button onClick={() => game.current?.rotateCamera(-1)} aria-label="Tourner la caméra à gauche">⟲</button>
        <button onClick={() => game.current?.rotateCamera(1)} aria-label="Tourner la caméra à droite">⟳</button>
      </div>
      <footer className="hud-help">
        Clic : aller ici · ZQSD / flèches : marcher · Maj : courir · Molette : zoom
      </footer>
      {(loading || error) && <div className="hud-loading">{error ?? 'Chargement…'}</div>}
    </div>
  );
}
