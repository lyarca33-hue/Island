import { useEffect, useRef, useState } from 'react';
import { Creator, loadSavedRecipe } from './creator/Creator';
import type { Recipe } from './creator/recipe';
import { Game } from './game/Game';
import { ChatBar } from './orders/ChatBar';

/** On commence par le créateur de personnage, puis « Jouer » ouvre la map avec ce perso. */
export function App() {
  const [mode, setMode] = useState<'creator' | 'game'>('creator');
  const [recipe, setRecipe] = useState<Recipe | null>(() => loadSavedRecipe());

  if (mode === 'creator') {
    return <Creator initial={recipe} onDone={(r) => { setRecipe(r); setMode('game'); }} />;
  }
  return <World recipe={recipe} onEdit={() => setMode('creator')} />;
}

/** Scène 3D plein écran + interface minimale (titre, aide, rotation de caméra). */
function World({ recipe, onEdit }: { recipe: Recipe | null; onEdit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [drinkable, setDrinkable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const g = new Game(host.current, recipe);
    game.current = g;
    setReady(g);
    (window as unknown as { game: Game }).game = g; // console : game.rotateCamera(1), game.pickUp('tasse')...
    g.onHeldChange = (name, canDrink) => {
      setHeld(name);
      setDrinkable(canDrink);
    };
    let timer = 0;
    g.onNotice = (text) => {
      setNotice(text);
      clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 2500);
    };
    g.start().then(() => setLoading(false)).catch((e) => {
      console.error(e);
      setError('Le personnage n’a pas pu être chargé.');
    });
    return () => {
      clearTimeout(timer);
      g.dispose();
      game.current = null;
      setReady(null);
    };
  }, [recipe]);

  return (
    <div className="app">
      <div ref={host} className="viewport" />
      <header className="hud-title">Rp Island{recipe ? ` · ${recipe.name}` : ''}</header>
      <button className="hud-edit" onClick={onEdit}>✎ Perso</button>
      <div className="hud-cam">
        <button onClick={() => game.current?.rotateCamera(-1)} aria-label="Tourner la caméra à gauche">⟲</button>
        <button onClick={() => game.current?.rotateCamera(1)} aria-label="Tourner la caméra à droite">⟳</button>
      </div>
      {held && (
        <div className="hud-held">
          <button onClick={() => game.current?.drop()}>
            En main : {held} · <b>Poser (E)</b>
          </button>
          {drinkable && (
            <button onClick={() => game.current?.drink()}>
              <b>Boire (B)</b>
            </button>
          )}
        </div>
      )}
      {notice && <div className="hud-notice">{notice}</div>}
      <div className="hud-help">
        Clic : aller ici · Clic sur un objet : le prendre · E : poser · B : boire · ZQSD : marcher · Maj : courir · Entrée : écrire
      </div>
      <ChatBar game={ready} />
      {(loading || error) && <div className="hud-loading">{error ?? 'Chargement…'}</div>}
    </div>
  );
}
