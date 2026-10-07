import { useEffect, useRef, useState } from 'react';
import { Creator, loadSavedRecipe } from './creator/Creator';
import type { Recipe } from './creator/recipe';
import { Game, type HandActions } from './game/Game';
import { AiSettingsForm } from './orders/AiSettingsForm';
import { ChatBar } from './orders/ChatBar';
import { Menu, MenuSection, SHORTCUTS } from './ui/Menu';
import { MissingPanel, useMissingCount } from './ui/MissingPanel';
import { NeedsHud, TimeControls } from './ui/TimeHud';

/** On commence par le créateur de personnage, puis « Jouer » ouvre la map avec ce perso. */
export function App() {
  const [mode, setMode] = useState<'creator' | 'game'>('creator');
  const [recipe, setRecipe] = useState<Recipe | null>(() => loadSavedRecipe());

  if (mode === 'creator') {
    return <Creator initial={recipe} onDone={(r) => { setRecipe(r); setMode('game'); }} />;
  }
  return <World recipe={recipe} onEdit={() => setMode('creator')} />;
}

/** Scène 3D plein écran + interface minimale (menu, rotation de caméra, saisie). */
function World({ recipe, onEdit }: { recipe: Recipe | null; onEdit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [can, setCan] = useState<HandActions>({ drink: false, eat: false, throw: false, moving: false, read: false, reading: false, seated: false });
  const [notice, setNotice] = useState<string | null>(null);
  /** Objet sous la souris : sa jauge de durabilité. */
  const [hover, setHover] = useState<{ name: string; grade: string; condition: number; x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const missing = useMissingCount();
  /** Partie du menu dépliée. */
  const [section, setSection] = useState<string | null>('raccourcis');
  const fold = (id: string) => () => setSection((s) => (s === id ? null : id));

  useEffect(() => {
    if (!host.current) return;
    const g = new Game(host.current, recipe);
    game.current = g;
    setReady(g);
    (window as unknown as { game: Game }).game = g; // console : game.rotateCamera(1), game.pickUp('tasse')...
    g.onHeldChange = (name, actions) => {
      setHeld(name);
      setCan(actions);
    };
    g.onHover = setHover;
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
      <Menu open={menuOpen} onToggle={setMenuOpen}>
        <MenuSection title="Raccourcis" open={section === 'raccourcis'} onToggle={fold('raccourcis')}>
          <dl className="menu-keys">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </MenuSection>
        <MenuSection title="Heure" open={section === 'heure'} onToggle={fold('heure')}>
          <TimeControls game={ready} />
        </MenuSection>
        <MenuSection title={`Manques${missing ? ` (${missing})` : ''}`} open={section === 'manques'} onToggle={fold('manques')}>
          <MissingPanel />
        </MenuSection>
        <MenuSection title="IA des ordres" open={section === 'ia'} onToggle={fold('ia')}>
          <AiSettingsForm />
        </MenuSection>
        <MenuSection title="Personnage" open={section === 'perso'} onToggle={fold('perso')}>
          <button className="menu-action" onClick={onEdit}>✎ Modifier le personnage</button>
        </MenuSection>
      </Menu>
      <div className="hud-cam">
        <button onClick={() => game.current?.rotateCamera(-1)} aria-label="Tourner la caméra à gauche">⟲</button>
        <button onClick={() => game.current?.rotateCamera(1)} aria-label="Tourner la caméra à droite">⟳</button>
      </div>
      <NeedsHud game={ready} />
      {held && (
        <div className="hud-held">
          <button onClick={() => game.current?.drop()}>
            {can.moving ? (
              <>
                Déplace : {held} (Z Q S D) · <b>Lâcher (E)</b>
              </>
            ) : (
              <>
                En main : {held} · <b>Poser (E)</b>
              </>
            )}
          </button>
          {can.drink && !can.reading && (
            <button onClick={() => game.current?.drink()}>
              <b>Boire (B)</b>
            </button>
          )}
          {can.eat && !can.reading && (
            <button onClick={() => game.current?.eat()}>
              <b>Manger (M)</b>
            </button>
          )}
          {can.throw && !can.reading && (
            <button onClick={() => game.current?.throwItem()}>
              <b>Lancer (T)</b>
            </button>
          )}
          {can.seated && (
            <button onClick={() => game.current?.standUp()}>
              <b>Se lever (C)</b>
            </button>
          )}
          {(can.read || can.reading) && (
            <button onClick={() => (can.reading ? game.current?.stopReading() : game.current?.read())}>
              <b>{can.reading ? 'Fermer le livre (L)' : 'Lire (L)'}</b>
            </button>
          )}
        </div>
      )}
      {!held && can.seated && (
        <div className="hud-held">
          <button onClick={() => game.current?.standUp()}>
            Assis · <b>Se lever (C)</b>
          </button>
        </div>
      )}
      {notice && <div className="hud-notice">{notice}</div>}
      {hover && (
        <div className="hud-wear" style={{ left: hover.x, top: hover.y }}>
          <div>
            {hover.name} · <b>{hover.grade}</b>
          </div>
          <div className="hud-wear-bar">
            <span style={{ width: `${Math.round(hover.condition * 100)}%`, background: `hsl(${Math.round(hover.condition * 110)}, 65%, 50%)` }} />
          </div>
        </div>
      )}
      <ChatBar
        game={ready}
        onNeedSettings={() => {
          setSection('ia');
          setMenuOpen(true);
        }}
      />
      {(loading || error) && <div className="hud-loading">{error ?? 'Chargement…'}</div>}
    </div>
  );
}
