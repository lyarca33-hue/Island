import { useCallback, useEffect, useRef, useState } from 'react';
import { Creator, loadSavedRecipe } from './creator/Creator';
import { defaultRecipe, type Recipe } from './creator/recipe';
import { Game, type ContextMenu as Menu3D, type HandActions } from './game/Game';
import { AiSettingsForm } from './orders/AiSettingsForm';
import { ChatBar } from './orders/ChatBar';
import { ContextMenu } from './ui/ContextMenu';
import { FeedbackPanel } from './ui/FeedbackPanel';
import { HeldBar } from './ui/HeldBar';
import { Icon } from './ui/icons';
import { InventoryPanel } from './ui/InventoryPanel';
import { RecipeBook } from './ui/RecipeBook';
import { Menu, MenuSection, Shortcuts } from './ui/Menu';
import { MissingPanel, useMissingCount } from './ui/MissingPanel';
import { NeedsHud, TimeControls } from './ui/TimeHud';

/**
 * On entre directement dans le monde avec le dernier perso créé (un perso par défaut sinon) ;
 * Menu → Personnage ouvre le créateur, et « Jouer » y revient.
 */
export function App() {
  const [mode, setMode] = useState<'creator' | 'game'>('game');
  const [recipe, setRecipe] = useState<Recipe>(() => loadSavedRecipe() ?? defaultRecipe('f'));

  if (mode === 'creator') {
    return <Creator initial={recipe} onDone={(r) => { setRecipe(r); setMode('game'); }} />;
  }
  return <World recipe={recipe} onEdit={() => setMode('creator')} />;
}

/**
 * Scène 3D plein écran + interface discrète : en haut à gauche le menu et les petits boutons
 * (caméra, masquer, signaler), en haut à droite les jauges et l'horloge, en bas ce qu'on tient
 * et la saisie. H masque le tout pour profiter de la scène.
 */
function World({ recipe, onEdit }: { recipe: Recipe; onEdit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [can, setCan] = useState<HandActions>({ drink: false, eat: false, serve: false, dishes: false, cut: false, prepare: false, throw: false, moving: false, read: false, reading: false, recipes: false, seated: false, sleeping: false });
  const [notice, setNotice] = useState<string | null>(null);
  /** Objet sous la souris : sa jauge de durabilité. */
  const [drag, setDrag] = useState<{ name: string; over: string | null; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ name: string; grade: string; condition: number; state: string; x: number; y: number } | null>(null);
  /** Menu au clic droit ouvert. */
  const [ctx, setCtx] = useState<Menu3D | null>(null);
  /** Meuble dont la fenêtre d'inventaire est ouverte. */
  const [inv, setInv] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const missing = useMissingCount();
  /** Fenêtre « Signaler » ouverte, avec son texte de départ. */
  const [report, setReport] = useState<string | null>(null);
  /** Partie du menu dépliée. */
  const [section, setSection] = useState<string | null>('raccourcis');
  const fold = (id: string) => () => setSection((s) => (s === id ? null : id));
  /** Interface masquée (touche H) : il ne reste que la scène, les messages et les menus ouverts exprès. */
  const [hidden, setHidden] = useState(false);
  const noticeTimer = useRef(0);
  const flash = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);
  const toggleHud = useCallback(() => setHidden((h) => !h), []);
  const shown = useRef(false);
  useEffect(() => {
    if (!shown.current) {
      shown.current = true;
      return;
    }
    if (hidden) flash(matchMedia('(pointer: coarse)').matches ? 'Interface masquée : l’œil en haut à gauche la ramène.' : 'Interface masquée : H pour la retrouver.');
  }, [hidden, flash]);

  // H (hors saisie) : masquer / afficher l'interface
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyH') toggleHud();
      // Échap (menu) et Entrée (écrire) ramènent l'interface masquée
      else if (e.code === 'Escape' || e.code === 'Enter') setHidden(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleHud]);

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
    g.onInventory = setInv;
    g.onDrag = setDrag;
    g.onMenu = (m) => {
      setCtx(m);
      if (m) setHover(null);
    };
    g.onNotice = flash;
    g.start().then(() => setLoading(false)).catch((e) => {
      console.error(e);
      setError('Le personnage n’a pas pu être chargé.');
    });
    return () => {
      clearTimeout(noticeTimer.current);
      g.dispose();
      game.current = null;
      setReady(null);
    };
  }, [recipe, flash]);

  return (
    <div className={`app${hidden ? ' hud-off' : ''}`}>
      <div ref={host} className="viewport" />
      <div className="hud">
        <Menu
          open={menuOpen}
          onToggle={(o) => {
            setMenuOpen(o);
            if (o) setReport(null);
          }}
          tools={
            <>
              <span className="hud-sep" />
              <button className="hud-icon" onClick={() => game.current?.rotateCamera(-1)} aria-label="Tourner la caméra à gauche" title="Tourner la caméra à gauche">
                <Icon name="rotateLeft" />
              </button>
              <button className="hud-icon" onClick={() => game.current?.rotateCamera(1)} aria-label="Tourner la caméra à droite" title="Tourner la caméra à droite">
                <Icon name="rotateRight" />
              </button>
              <span className="hud-sep" />
              <button className="hud-icon" onClick={toggleHud} aria-label="Masquer l’interface" title="Masquer l’interface (H)">
                <Icon name="eyeOff" />
              </button>
              <button
                className={`hud-icon${report !== null ? ' on' : ''}`}
                onClick={() => {
                  setMenuOpen(false);
                  setReport((r) => (r === null ? '' : null));
                }}
                aria-expanded={report !== null}
                aria-label="Signaler"
                title="Signaler : écrire un retour et l’envoyer"
              >
                <Icon name="flag" />
              </button>
            </>
          }
        >
          <MenuSection title="Raccourcis" icon="keyboard" open={section === 'raccourcis'} onToggle={fold('raccourcis')}>
            <Shortcuts />
          </MenuSection>
          <MenuSection title="Recettes" icon="book" open={section === 'recettes'} onToggle={fold('recettes')}>
            {ready && <RecipeBook game={ready} inline />}
          </MenuSection>
          <MenuSection title="Heure" icon="clock" open={section === 'heure'} onToggle={fold('heure')}>
            <TimeControls game={ready} />
          </MenuSection>
          <MenuSection title="Manques" icon="list" badge={missing} open={section === 'manques'} onToggle={fold('manques')}>
            <MissingPanel
              onReport={(text) => {
                setMenuOpen(false);
                setReport(text);
              }}
            />
          </MenuSection>
          <MenuSection title="IA des ordres" icon="sparkles" open={section === 'ia'} onToggle={fold('ia')}>
            <AiSettingsForm />
          </MenuSection>
          <MenuSection title="Personnage" icon="user" open={section === 'perso'} onToggle={fold('perso')}>
            <button className="menu-action" onClick={onEdit}>Modifier le personnage</button>
          </MenuSection>
        </Menu>
        <NeedsHud
          game={ready}
          onClock={() => {
            setSection('heure');
            setMenuOpen(true);
          }}
        />
        {report !== null && <FeedbackPanel initial={report} onClose={() => setReport(null)} />}
        {hover && !ctx && !drag && (
          <div className="hud-wear" style={{ left: hover.x, top: hover.y }}>
            <div>
              <b>{hover.name}</b> <span className="hud-wear-grade">{hover.grade}</span>
            </div>
            {hover.state && <div className="hud-wear-state">{hover.state}</div>}
            <div className="hud-wear-bar">
              <span style={{ width: `${Math.round(hover.condition * 100)}%`, background: `hsl(${Math.round(hover.condition * 110)}, 62%, 58%)` }} />
            </div>
          </div>
        )}
      </div>
      {hidden && (
        <button className="hud-icon hud-show" onClick={toggleHud} aria-label="Afficher l’interface" title="Afficher l’interface (H)">
          <Icon name="eye" />
        </button>
      )}
      <div className="hud-bottom">
        {notice && (
          <div className="hud-notice" key={notice}>
            <Icon name="alert" size={15} />
            {notice}
          </div>
        )}
        <div className="hud-bottom-main">
          <HeldBar game={ready} held={held} can={can} />
          <ChatBar
            game={ready}
            onNeedSettings={() => {
              setSection('ia');
              setMenuOpen(true);
            }}
          />
        </div>
      </div>
      {can.recipes && ready && !inv && <RecipeBook game={ready} onClose={() => ready.stopReading()} />}
      {inv && ready && <InventoryPanel game={ready} refId={inv} onClose={() => setInv(null)} />}
      {ctx && <ContextMenu menu={ctx} onClose={() => setCtx(null)} />}
      {drag && (
        <div className="hud-drag" style={{ left: drag.x, top: drag.y }}>
          {drag.name}
          {drag.over && <span> → {drag.over}</span>}
        </div>
      )}
      {(loading || error) && <div className="hud-loading">{error ?? 'Chargement…'}</div>}
    </div>
  );
}
