import { useCallback, useEffect, useRef, useState } from 'react';
import { Creator, loadSavedRecipe, saveRecipe } from './creator/Creator';
import { defaultRecipe, type Recipe } from './creator/recipe';
import { loadAnimationSource, loadSitAnimations } from './creator/source';
import { Avatar } from './creator/avatar';
import { prefetchModel } from './creator/vrm';
import { batirUrl, CARTE_BATIR, CARTE_PLATE, CARTE_TEST, testMapUrl } from './game/carteTest';
import { cloud } from './game/cloud';
import { Game, type ContextMenu as Menu3D, type HandActions, loadFirstPerson } from './game/Game';
import { preloadPacks } from './game/packs/assets';
import { loadTripo } from './game/items/tripo';
import { AutoSave, clearLocal, type GameSave, loadLocal, saveLocal } from './game/save';
import { AiSettingsForm } from './orders/AiSettingsForm';
import { ChatBar } from './orders/ChatBar';
import { ContextMenu } from './ui/ContextMenu';
import { DisplayControls, FpsCounter, useFpsShown } from './ui/DisplaySettings';
import { FeedbackPanel } from './ui/FeedbackPanel';
import { HeldBar, TouchPad } from './ui/HeldBar';
import { Icon } from './ui/icons';
import { InventoryPanel } from './ui/InventoryPanel';
import { RecipeBook } from './ui/RecipeBook';
import { BookReader } from './ui/BookReader';
import { SavePanel } from './ui/SavePanel';
import { TestFlags } from './ui/TestFlags';
import { Menu, MenuSection, Shortcuts } from './ui/Menu';
import { MissingPanel, useMissingCount } from './ui/MissingPanel';
import { NeedsHud, TimeControls } from './ui/TimeHud';
import { Magasin } from './ui/Magasin';
import { PorteMonnaie } from './ui/PorteMonnaie';
import { TerraformPanel } from './ui/TerraformPanel';
import { BuildPanel } from './ui/BuildPanel';
import { CamDial } from './ui/CamDial';

/**
 * On entre directement dans le monde avec le dernier perso créé (un perso par défaut sinon) ;
 * Menu → Personnage ouvre le créateur, et « Jouer » y revient.
 */
export function App() {
  const [mode, setMode] = useState<'creator' | 'game'>('game');
  const [recipe, setRecipe] = useState<Recipe>(() => loadSavedRecipe() ?? defaultRecipe('f'));
  /** Change à chaque partie chargée (compte) ou recommencée : le monde est reconstruit. */
  const [run, setRun] = useState(0);
  const replace = useCallback((s: GameSave | null) => {
    if (s) saveLocal(s);
    else clearLocal();
    if (s?.recipe) {
      saveRecipe(s.recipe);
      setRecipe(s.recipe);
    }
    setRun((n) => n + 1);
  }, []);

  if (mode === 'creator') {
    return <Creator initial={recipe} onDone={(r) => { setRecipe(r); setMode('game'); }} />;
  }
  return <World key={run} recipe={recipe} onEdit={() => setMode('creator')} onReplace={replace} />;
}

/**
 * Scène 3D plein écran + interface discrète : en haut à gauche le menu et les petits boutons
 * (caméra, masquer, signaler), en haut à droite les jauges et l'horloge, en bas ce qu'on tient
 * et la saisie. H masque le tout pour profiter de la scène.
 */
function World({ recipe, onEdit, onReplace }: { recipe: Recipe; onEdit: () => void; onReplace: (s: GameSave | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState<Game | null>(null);
  /**
   * Vue à la première personne (touche X ou bouton de la barre). Lue tout de suite, pas à la
   * création du jeu : sinon, pendant le chargement, la barre du bas s'affiche un instant au centre
   * (disposition de la vue de dessus) puis disparaît.
   */
  const [firstPerson, setFirstPerson] = useState(loadFirstPerson);
  /** Mode terraformation ouvert (touche U ou bouton montagne). */
  const [terra, setTerra] = useState(false);
  useEffect(() => (ready ? ready.terraform.listen(() => setTerra(ready.terraforming)) : undefined), [ready]);
  /** Mode construction ouvert (touche N ou bouton maison). */
  const [build, setBuild] = useState(false);
  useEffect(() => (ready ? ready.construction.listen(() => setBuild(ready.building)) : undefined), [ready]);
  /** Souris capturée par la première personne (elle oriente la vue) : viseur au centre. */
  const [locked, setLocked] = useState(false);
  /** La souris peut être capturée (sinon on regarde en glissant ou à deux doigts). */
  const [capture, setCapture] = useState(true);
  useEffect(() => {
    if (!ready) return;
    setFirstPerson(ready.firstPerson);
    setCapture(ready.mouseCapture);
    ready.onViewChange = setFirstPerson;
    ready.onPointerLock = setLocked;
    ready.onMouseCapture = setCapture;
    return () => {
      ready.onViewChange = null;
      ready.onPointerLock = null;
      ready.onMouseCapture = null;
    };
  }, [ready]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // les modèles dont sont faits des objets (aliments, meubles de la cuisine) : chargés avant de construire la maison
  const [packsReady, setPacksReady] = useState(false);
  useEffect(() => {
    void Promise.all([preloadPacks(['aliments', 'plats']), loadTripo()]).then(() => setPacksReady(true));
  }, []);
  const [held, setHeld] = useState<string | null>(null);
  const [can, setCan] = useState<HandActions>({ drink: false, eat: false, serve: false, dishes: false, cut: false, prepare: false, throw: false, moving: false, read: false, reading: false, recipes: false, book: null, seated: false });
  const [notice, setNotice] = useState<string | null>(null);
  /** Objet sous la souris : sa jauge de durabilité. */
  const [drag, setDrag] = useState<{ name: string; over: string | null; x: number; y: number } | null>(null);
  /** Menu au clic droit ouvert. */
  const [ctx, setCtx] = useState<Menu3D | null>(null);
  /** Meuble dont la fenêtre d'inventaire est ouverte. */
  const [inv, setInv] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const missing = useMissingCount();
  const [fpsShown, setFpsShown] = useFpsShown();
  /** Fenêtre « Signaler » ouverte, avec son texte de départ. */
  const [report, setReport] = useState<string | null>(null);
  /** Partie du menu dépliée. */
  const [section, setSection] = useState<string | null>(null);
  const fold = (id: string) => () => setSection((s) => (s === id ? null : id));
  /** Interface masquée (touche H) : il ne reste que la scène, les messages et les menus ouverts exprès. */
  const [hidden, setHidden] = useState(false);
  /** Dernière sauvegarde automatique (ms). */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const autosave = useRef<AutoSave | null>(null);
  /** Quitte cette partie sans la sauver, pour en charger une autre (ou recommencer). */
  const replaceGame = useCallback((s: GameSave | null) => {
    autosave.current?.cancel();
    onReplace(s);
  }, [onReplace]);
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
    // téléchargements lancés avant de construire la maison, qui occupe le processeur un moment
    for (const id of new Set([recipe.outfit, recipe.face, recipe.hair])) prefetchModel(id);
    void loadAnimationSource().catch(() => {});
    void loadSitAnimations().catch(() => {});
    if (!packsReady) return;
    const g = new Game(host.current, recipe);
    game.current = g;
    setReady(g);
    (window as unknown as { game: Game }).game = g; // console : game.rotateCamera(1), game.pickUp('tasse')...
    g.onHeldChange = (name, actions) => {
      setHeld(name);
      setCan(actions);
    };
    g.onInventory = setInv;
    g.onDrag = setDrag;
    g.onMenu = (m) => {
      setCtx(m);
      if (m) g.onHover?.(null);
    };
    g.onNotice = flash;
    Avatar.onMissingImport = () => flash('Ton perso VRoid importé n’est pas sur cet appareil : perso de base en attendant.');
    // la partie gardée dans le navigateur, puis sauvée toute seule (et envoyée au compte Google)
    // carte de test : ni chargée ni sauvée, la vraie partie reste intacte
    const saved = CARTE_PLATE ? null : loadLocal();
    if (saved) {
      try {
        g.loadState(saved);
        setSavedAt(saved.savedAt);
      } catch (e) {
        console.error('Partie sauvée illisible', e);
      }
    }
    const capture = () => (CARTE_PLATE ? null : { ...g.saveState(), recipe });
    const auto = new AutoSave(capture, (s, leaving) => {
      setSavedAt(s.savedAt);
      cloud.push(s, leaving);
    });
    autosave.current = auto;
    cloud.current = capture;
    cloud.adopt = (s) => {
      replaceGame(s);
      flash('Partie du compte chargée.');
    };
    g.start().then(() => {
      setLoading(false);
      if (CARTE_TEST) flash('Carte de test : rien n’est sauvé. Menu → Partie pour revenir à l’île.');
      // créateur de bâtiment : on arrive directement en construction
      if (CARTE_BATIR) g.building = true;
    }).catch((e) => {
      console.error(e);
      setError('Le personnage n’a pas pu être chargé.');
    });
    return () => {
      clearTimeout(noticeTimer.current);
      auto.stop();
      if (cloud.current === capture) cloud.current = null;
      g.dispose();
      game.current = null;
      setReady(null);
    };
  }, [recipe, flash, replaceGame, packsReady]);

  // le compte a une partie plus récente : le menu s'ouvre sur la question
  useEffect(() => cloud.subscribe((st) => {
    if (!st.conflict) return;
    setSection('partie');
    setMenuOpen(true);
  }), []);

  return (
    <div className={`app${hidden ? ' hud-off' : ''}${firstPerson ? ' fp' : ''}`}>
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
              <CamDial game={ready} />
              <button
                className={`hud-icon${firstPerson ? ' on' : ''}`}
                onClick={(e) => {
                  if (game.current) game.current.firstPerson = !game.current.firstPerson;
                  // rendre le clavier au perso (ZQSD)
                  e.currentTarget.blur();
                }}
                aria-pressed={firstPerson}
                aria-label="Vue à la première personne"
                title={firstPerson ? 'Revenir à la vue de dessus (X)' : 'Vue à la première personne (X) : glisser pour regarder autour'}
              >
                <Icon name="user" />
              </button>
              <button
                className={`hud-icon${terra ? ' on' : ''}`}
                onClick={(e) => {
                  if (game.current) game.current.terraforming = !game.current.terraforming;
                  e.currentTarget.blur();
                }}
                aria-pressed={terra}
                aria-label="Terraformation"
                title={terra ? 'Fermer la terraformation (U)' : 'Terraformation (U) : façonner l’île au pinceau'}
              >
                <Icon name="mountain" />
              </button>
              {CARTE_BATIR && <button
                className={`hud-icon${build ? ' on' : ''}`}
                onClick={(e) => {
                  if (game.current) game.current.building = !game.current.building;
                  e.currentTarget.blur();
                }}
                aria-pressed={build}
                aria-label="Construction"
                title={build ? 'Fermer la construction (N)' : 'Construction (N) : monter un bâtiment pièce par pièce'}
              >
                <Icon name="house" />
              </button>}
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
          <MenuSection title="Partie" icon="cloud" open={section === 'partie'} onToggle={fold('partie')}>
            {CARTE_BATIR ? (
              <p>Créateur de bâtiment : un sol plat pour construire. Tes bâtiments sont gardés sur cet appareil ; ta partie t’attend sur l’île.</p>
            ) : CARTE_TEST ? (
              <>
                <p>Carte de test : un sol plat et chaque modèle du jeu en rangées. Rien n’y est sauvé, ta partie t’attend sur l’île.</p>
                {(['retirer', 'corriger'] as const).map((kind) => (
                  <TestFlags
                    key={kind}
                    kind={kind}
                    onSend={(text) => {
                      setMenuOpen(false);
                      setReport(text);
                    }}
                  />
                ))}
              </>
            ) : (
              <SavePanel savedAt={savedAt} onNewGame={() => replaceGame(null)} />
            )}
            {CARTE_BATIR ? (
              <button type="button" className="menu-action" onClick={() => location.assign(batirUrl(false))}>Retour à l’île</button>
            ) : (
              <button type="button" className="menu-action" onClick={() => location.assign(testMapUrl(!CARTE_TEST))}>
                {CARTE_TEST ? 'Retour à l’île' : 'Carte de test (objets en rangées)'}
              </button>
            )}
          </MenuSection>
          <MenuSection title="Raccourcis" icon="keyboard" open={section === 'raccourcis'} onToggle={fold('raccourcis')}>
            <Shortcuts />
          </MenuSection>
          <MenuSection title="Recettes" icon="book" open={section === 'recettes'} onToggle={fold('recettes')}>
            {ready && <RecipeBook game={ready} inline />}
          </MenuSection>
          <MenuSection title="Heure" icon="clock" open={section === 'heure'} onToggle={fold('heure')}>
            <TimeControls game={ready} />
          </MenuSection>
          <MenuSection title="Affichage" icon="eye" open={section === 'affichage'} onToggle={fold('affichage')}>
            <DisplayControls game={ready} fps={fpsShown} onFps={setFpsShown} />
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
          <MenuSection title="Construction" icon="house" open={section === 'construction'} onToggle={fold('construction')}>
            <p>Monte un bâtiment pièce par pièce sur sa propre page : murs en pierre, portes, fenêtres, sols, toits et décor, calés sur une grille de 2 m.</p>
            {CARTE_BATIR ? (
              <button
                className="menu-action"
                onClick={() => {
                  if (game.current) game.current.building = true;
                  setMenuOpen(false);
                }}
              >
                {build ? 'Construction ouverte' : 'Reprendre la construction (N)'}
              </button>
            ) : (
              <button className="menu-action" onClick={() => location.assign(batirUrl(true))}>Ouvrir le créateur de bâtiment</button>
            )}
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
        <PorteMonnaie game={ready} />
        {terra && ready && <TerraformPanel game={ready} />}
        {build && ready && <BuildPanel game={ready} />}
        {report !== null && <FeedbackPanel initial={report} onClose={() => setReport(null)} />}
        <HoverTip game={ready} hidden={!!ctx || !!drag} />
        {fpsShown && <FpsCounter game={ready} />}
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
          <TouchPad game={ready} can={can} />
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
      {can.book && ready && !inv && <BookReader key={can.book} game={ready} id={can.book} onClose={() => ready.stopReading()} />}
      {inv && ready && <InventoryPanel game={ready} refId={inv} onClose={() => setInv(null)} />}
      <Magasin game={ready} />
      {firstPerson && !loading && (
        <div className={`fp-aim${locked ? ' locked' : ''}`} aria-hidden>
          <span className="fp-dot" />
          {!locked && capture && <span className="fp-hint">Clic : la souris oriente la vue · Échap : la libérer</span>}
          {!locked && !capture && <span className="fp-hint fades">Souris au bord de l’écran : la vue tourne · glisser ou deux doigts aussi</span>}
        </div>
      )}
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

type HoverInfo = { name: string; grade: string; condition: number; state: string; x: number; y: number };

/**
 * Jauge d'usure de l'objet sous la souris. Composant à part : elle suit la souris, et un état
 * dans World re-rendrait toute l'interface à chaque mouvement.
 */
function HoverTip({ game, hidden }: { game: Game | null; hidden: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  useEffect(() => {
    if (!game) return;
    game.onHover = setHover;
    return () => {
      game.onHover = null;
    };
  }, [game]);
  if (!hover || hidden) return null;
  return (
    <div className="hud-wear" style={{ left: hover.x, top: hover.y }}>
      <div>
        <b>{hover.name}</b> <span className="hud-wear-grade">{hover.grade}</span>
      </div>
      {hover.state && <div className="hud-wear-state">{hover.state}</div>}
      <div className="hud-wear-bar">
        <span style={{ width: `${Math.round(hover.condition * 100)}%`, background: `hsl(${Math.round(hover.condition * 110)}, 62%, 58%)` }} />
      </div>
    </div>
  );
}
