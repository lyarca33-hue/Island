import { memo, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { type FlagKind, loadFlags, onFlags, toggleFlag } from '../game/carteTest';
import { modeleIcon, onIcons } from '../game/items/vignettes';
import { catalogue, CHERCHER_MAX, chercher, entree, MODELE_CATS, type ModeleEntry, type ModeleSource } from '../game/modelesCatalogue';
import { packReady } from '../game/packs/assets';
import { Icon } from './icons';
import { blur, useListen } from './TestHud';
import './terraform.css';
import './build.css';
import './modeles.css';

type Onglet = ModeleSource | 'recents';
const ONGLET_KEY = 'island-modeles-onglet';
const TOUS = 'tous';

/** Le dernier onglet et la dernière famille ouverts (gardés dans le navigateur, s'il veut bien). */
function lireOnglet(): { onglet: Onglet; puce: string } {
  try {
    const v = JSON.parse(localStorage.getItem(ONGLET_KEY) ?? 'null');
    if (v && (v.onglet === 'objets' || v.onglet === 'decor' || v.onglet === 'recents') && typeof v.puce === 'string') return v;
  } catch {
    // stockage indisponible ou abîmé : l'onglet de départ
  }
  return { onglet: 'objets', puce: TOUS };
}

function ecrireOnglet(v: { onglet: Onglet; puce: string }): void {
  try {
    localStorage.setItem(ONGLET_KEY, JSON.stringify(v));
  } catch {
    // stockage indisponible : on l'oubliera au rechargement
  }
}

const plur = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const metres = (m: number) => `${m.toFixed(2).replace('.', ',')} m`;

/**
 * La vignette d'un modèle, demandée seulement quand sa case se voit (la file des vignettes reste
 * courte, et un pack de décor ne se charge que si l'un de ses modèles est à l'écran). `rev` change
 * quand des vignettes arrivent. Rend la référence à poser sur la case, et l'image (undefined : en route).
 */
function useVignette<T extends HTMLElement>(entry: ModeleEntry, rev: number) {
  const ref = useRef<T>(null);
  const [vue, setVue] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (vue || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVue(true);
      return;
    }
    const io = new IntersectionObserver((list) => {
      if (list.some((x) => x.isIntersecting)) {
        setVue(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [vue]);
  void rev;
  return { ref, url: vue ? modeleIcon(entry) : undefined };
}

function Vignette({ url }: { url: string | null | undefined }) {
  return (
    <span className={`modele-thumb${url === undefined ? ' wait' : ''}`}>
      {url ? <img src={url} alt="" draggable={false} /> : url === null ? <Icon name="cube" size={20} /> : null}
    </span>
  );
}

/** Une case de la grille : vignette, nom, point si le modèle est signalé. */
const Tuile = memo(function Tuile({ entry, actif, signale, rev, onPick }: {
  entry: ModeleEntry;
  actif: boolean;
  signale: FlagKind | null;
  rev: number;
  onPick: (e: ModeleEntry) => void;
}) {
  const { ref, url } = useVignette<HTMLButtonElement>(entry, rev);
  // pack introuvable (ou modèle vide) : rien à poser
  const indispo = entry.kind === 'pack' && url === null;
  const titre = indispo ? 'Modèle indisponible' : entry.pack ? `${entry.label} · ${entry.pack}` : entry.label;
  return (
    <button
      ref={ref}
      className={`modele-tile${actif ? ' active' : ''}`}
      disabled={indispo}
      title={signale && !indispo ? `${titre} (signalé : à ${signale})` : titre}
      aria-pressed={actif}
      onClick={(e) => {
        onPick(entry);
        blur(e);
      }}
    >
      <Vignette url={url} />
      <span className="modele-name">{entry.label}</span>
      {signale && <span className={`modele-flag ${signale}`} aria-label={`Signalé : à ${signale}`} />}
    </button>
  );
});

/** Le modèle en main ou choisi, en petit (re-créé pour chaque modèle : key={entry.key}). */
function VignetteCourante({ entry, rev }: { entry: ModeleEntry; rev: number }) {
  const { ref, url } = useVignette<HTMLSpanElement>(entry, rev);
  return <span ref={ref} className="modele-current-thumb"><Vignette url={url} /></span>;
}

/**
 * Le panneau « Modèles » de la carte de test (bouton cube ou touche O) : chercher un modèle parmi
 * les objets du jeu et le décor des packs, le prendre en main pour le poser autant de fois qu'on
 * veut, régler le modèle en main ou choisi (tourner, hauteur, dupliquer, enlever), le signaler,
 * annuler, tout enlever.
 */
export function ModelesPanel({ game }: { game: Game }) {
  const m = game.modeles;
  useListen(m);
  // signalements (A / E) et vignettes arrivées : redessiner
  const [flagRev, setFlagRev] = useState(0);
  useEffect(() => onFlags(() => setFlagRev((n) => n + 1)), []);
  const [iconRev, setIconRev] = useState(0);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onIcons(() => setIconRev((n) => n + 1)), []);

  const [{ onglet, puce }, setOnglet] = useState(lireOnglet);
  const choisir = (o: Onglet, p = TOUS) => {
    setOnglet({ onglet: o, puce: p });
    ecrireOnglet({ onglet: o, puce: p });
  };
  const [q, setQ] = useState('');
  /** « Tout enlever » demande confirmation. */
  const [asking, setAsking] = useState(false);

  // Échap : lâcher le modèle en main, ou le modèle choisi, avant que le menu ne s'ouvre
  useEffect(() => {
    if (!m) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || !m.on || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!m.enMain && !m.selection) return;
      e.stopImmediatePropagation();
      m.lacher();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [m]);

  const tout = useMemo(() => catalogue(), []);
  const nObjets = useMemo(() => tout.filter((e) => e.source === 'objets').length, [tout]);
  const recents = m ? m.recents() : [];
  const recentsKey = recents.join('|');
  const recentsList = useMemo(
    () => recentsKey.split('|').filter(Boolean).map(entree).filter((e): e is ModeleEntry => !!e),
    [recentsKey],
  );

  const cherche = q.trim() !== '';
  const { list, trop } = useMemo(() => {
    if (cherche) {
      const r = chercher(q, tout, CHERCHER_MAX + 1);
      return { list: r.slice(0, CHERCHER_MAX), trop: r.length > CHERCHER_MAX };
    }
    if (onglet === 'recents') return { list: recentsList, trop: false };
    return { list: tout.filter((e) => e.source === onglet && (puce === TOUS || e.cat === puce)), trop: false };
  }, [cherche, q, tout, onglet, puce, recentsList]);

  const flags = useMemo(() => {
    void flagRev;
    return { retirer: new Set(loadFlags('retirer')), corriger: new Set(loadFlags('corriger')) };
  }, [flagRev]);
  const signaleDe = (signal: string): FlagKind | null =>
    flags.retirer.has(signal) ? 'retirer' : flags.corriger.has(signal) ? 'corriger' : null;

  // un pack de la liste encore en route (le décor se charge famille par famille)
  const enRoute = useMemo(() => {
    void iconRev;
    if (onglet !== 'decor' || cherche) return null;
    return list.find((e) => e.pack && !packReady(e.pack))?.pack ?? null;
  }, [list, onglet, cherche, iconRev]);

  if (!m || !m.on) return null;

  const pick = (e: ModeleEntry) => m.prendre(m.enMain?.entry.key === e.key ? null : e.key);
  const info = m.enMain ?? m.selection;
  const enMain = !!m.enMain;
  const cats = MODELE_CATS.filter((c) => c.source === onglet);
  const nDecor = tout.length - nObjets;

  return (
    <div className="terra-panel modeles-panel" role="dialog" aria-label="Modèles">
      <div className="terra-head">
        <Icon name="cube" size={18} />
        <b>Modèles</b>
        <span className="modeles-count">{plur(m.count, 'posé')}</span>
        <button className="hud-icon" onClick={() => (game.placing = false)} aria-label="Fermer les modèles" title="Fermer (O)">
          <Icon name="close" size={16} />
        </button>
      </div>

      <label className="modeles-search">
        <Icon name="search" size={15} />
        <input
          type="search"
          placeholder="Chercher un modèle…"
          aria-label="Chercher un modèle"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (list[0]) m.prendre(list[0].key);
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (q) setQ('');
              e.currentTarget.blur();
            }
          }}
        />
      </label>

      {!cherche && (
        <>
          <div className="build-tabs modeles-tabs" role="tablist">
            {([
              ['objets', 'Objets du jeu', nObjets],
              ['decor', 'Décor', nDecor],
              ['recents', 'Récents', recentsList.length],
            ] as Array<[Onglet, string, number]>).map(([id, label, n]) => (
              <button key={id} role="tab" aria-selected={onglet === id} className={onglet === id ? 'active' : ''} onClick={(e) => { choisir(id); blur(e); }}>
                {label}
                {n > 0 && <span className="modeles-tab-n">{n}</span>}
              </button>
            ))}
          </div>
          {cats.length > 0 && (
            <div className="modeles-chips">
              {[{ id: TOUS, label: 'Tous' }, ...cats].map((c) => (
                <button key={c.id} className={puce === c.id ? 'active' : ''} aria-pressed={puce === c.id} onClick={(e) => { choisir(onglet, c.id); blur(e); }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="modeles-grid-wrap">
        {enRoute && <p className="terra-hint modeles-msg">Chargement du pack « {enRoute} »…</p>}
        {list.length ? (
          <div className="modeles-grid">
            {list.map((e) => (
              <Tuile key={e.key} entry={e} actif={m.enMain?.entry.key === e.key} signale={signaleDe(e.signal)} rev={iconRev} onPick={pick} />
            ))}
          </div>
        ) : (
          <p className="terra-hint modeles-msg">
            {!cherche && onglet === 'recents' ? 'Les modèles posés récemment apparaîtront ici.' : 'Aucun modèle ne correspond.'}
          </p>
        )}
        {trop && <p className="terra-hint modeles-msg">{CHERCHER_MAX} premiers résultats : précise la recherche</p>}
      </div>

      {info && (
        <div className="modele-current">
          <span className="modele-current-what">{enMain ? 'En main' : 'Choisi'}</span>
          <VignetteCourante key={info.entry.key} entry={info.entry} rev={iconRev} />
          <span className="modele-current-name">
            {info.entry.label}
            {info.entry.pack && <small> · {info.entry.pack}</small>}
          </span>
          {(['retirer', 'corriger'] as FlagKind[]).map((k) => {
            const on = (k === 'retirer' ? flags.retirer : flags.corriger).has(info.entry.signal);
            return (
              <button
                key={k}
                className={`modele-flag-btn ${k}${on ? ' on' : ''}`}
                aria-pressed={on}
                title={on ? 'Ne plus signaler' : k === 'retirer' ? 'Signaler à retirer du jeu (A)' : 'Signaler à corriger sur Blender (E)'}
                onClick={(e) => { toggleFlag(info.entry.signal, k); blur(e); }}
              >
                <Icon name="flag" size={13} />
                {k === 'retirer' ? 'À retirer' : 'À corriger'}
              </button>
            );
          })}
        </div>
      )}

      <div className="modeles-actions">
        <button onClick={(e) => { m.tourner(1); blur(e); }} disabled={!info} title="Tourner (R / F ; Maj : par petits pas)">
          <Icon name="rotate" size={15} />
          Tourner
        </button>
        <span className="modeles-lift" title="Hauteur (Pg↑ / Pg↓ ; Maj : au centimètre)">
          <span>Hauteur <b>{metres(info?.lift ?? 0)}</b></span>
          <button onClick={(e) => { m.monter(-0.1); blur(e); }} disabled={!info || info.lift <= 0} aria-label="Descendre">
            <Icon name="down" size={14} />
          </button>
          <button onClick={(e) => { m.monter(0.1); blur(e); }} disabled={!info || info.lift >= 3} aria-label="Monter">
            <Icon name="up" size={14} />
          </button>
        </span>
        <button onClick={(e) => { m.dupliquer(); blur(e); }} disabled={!m.selection} title="Dupliquer le modèle choisi (Ctrl+D)">
          <Icon name="copy" size={15} />
          Dupliquer
        </button>
        <button onClick={(e) => { m.enlever(); blur(e); }} disabled={!m.selection} title="Enlever le modèle choisi (Suppr)">
          <Icon name="trash" size={15} />
          Enlever
        </button>
        <button onClick={(e) => { m.annuler(); blur(e); }} disabled={!m.canUndo} title="Annuler (Ctrl+Z)">
          <Icon name="undo" size={15} />
          Annuler
        </button>
      </div>

      <label className="modeles-check">
        <input type="checkbox" checked={m.grille} onChange={(e) => { m.grille = e.target.checked; redraw(); e.currentTarget.blur(); }} />
        Grille 25 cm
      </label>

      <p className="terra-hint">
        {enMain
          ? 'Clic : poser (autant de fois que tu veux) · R / F : tourner · Pg↑ / Pg↓ : hauteur · Échap ou clic droit : lâcher'
          : 'Choisis un modèle, puis clique au sol. Clic sur un modèle posé : le choisir · glisser : le déplacer · Suppr : l’enlever'}
      </p>

      {asking ? (
        <div className="terra-confirm">
          <span>Tout enlever ?</span>
          <button onClick={(e) => { m.toutEnlever(); setAsking(false); blur(e); }}>Oui</button>
          <button onClick={(e) => { setAsking(false); blur(e); }}>Non</button>
        </div>
      ) : (
        <div className="build-foot">
          <span className="terra-value">{plur(m.count, 'modèle')} {m.count > 1 ? 'posés' : 'posé'}</span>
          <button className="terra-reset" disabled={!m.count} onClick={(e) => { setAsking(true); blur(e); }} title="Tout enlever (Ctrl+Z pour revenir)">
            Tout enlever
          </button>
        </div>
      )}
    </div>
  );
}
