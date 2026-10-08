import { useEffect, useState } from 'react';
import { GameClock } from '../game/clock';
import { cloud, type CloudState, parseFirebaseConfig, pastedFirebaseSettings as pasted } from '../game/cloud';
import { AUTOSAVE_SECONDS, type GameSave } from '../game/save';

/** Il y a combien de temps (« à l’instant », « il y a 3 min »). */
function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** « Lundi 3 printemps, an 1, 14 h 05 » : où en était une partie sauvée. */
function when(s: GameSave): string {
  const c = new GameClock();
  c.minutes = s.clock.minutes;
  const h = Math.floor(c.hour), m = Math.floor((c.hour - h) * 60);
  return `${c.dateLabel}, ${h} h ${String(m).padStart(2, '0')}`;
}

export function useCloud(): CloudState {
  const [state, setState] = useState(cloud.state);
  useEffect(() => cloud.subscribe(setState), []);
  return state;
}

/**
 * Menu → Partie : la sauvegarde automatique, le compte Google (connexion, partie du compte plus
 * récente : laquelle garder), et « Nouvelle partie ».
 */
export function SavePanel({ savedAt, onNewGame }: { savedAt: number | null; onNewGame: () => void }) {
  const st = useCloud();
  const [now, setNow] = useState(Date.now);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="menu-form save-panel">
      <small>
        Sauvegarde automatique toutes les {AUTOSAVE_SECONDS} s sur cet appareil
        {savedAt ? ` · dernière ${ago(savedAt, now)}` : ''}.
      </small>

      {st.conflict && (
        <div className="save-conflict" role="alert">
          <b>Ton compte a une autre partie</b>
          <small>
            Celle du compte en est à {when(st.conflict)} (sauvée {ago(st.conflict.savedAt, now)}). Laquelle garder ?
          </small>
          <button type="button" onClick={() => void cloud.resolve('cloud')}>Reprendre celle du compte</button>
          <button type="button" className="menu-action" onClick={() => void cloud.resolve('local')}>Garder celle-ci (remplace celle du compte)</button>
        </div>
      )}

      {st.configured && !st.user && (
        <button type="button" className="google-btn" disabled={st.busy} onClick={() => void cloud.signIn()}>
          <GoogleMark />
          {st.busy ? 'Connexion…' : 'Se connecter avec Google'}
        </button>
      )}
      {st.configured && !st.user && <small>Connecté, ta partie est aussi gardée dans ton compte : tu la retrouves sur un autre ordinateur. Pas besoin de s’inscrire : la première connexion crée le compte.</small>}

      {st.user && (
        <div className="save-user">
          {st.user.photo ? <img src={st.user.photo} alt="" referrerPolicy="no-referrer" /> : <span className="save-avatar">{st.user.name[0]}</span>}
          <div>
            <b>{st.user.name}</b>
            <small>{st.busy ? 'Lecture du compte…' : st.pushedAt ? `Partie dans le compte : ${ago(st.pushedAt, now)}` : 'Partie envoyée au compte bientôt.'}</small>
          </div>
        </div>
      )}
      {st.user && <button type="button" className="menu-action" onClick={() => void cloud.signOut()}>Se déconnecter</button>}

      {st.error && <small className="save-error">{st.error}</small>}

      {!st.configured && <FirebaseSetup />}
      {st.configured && !st.user && pasted() && (
        <button type="button" className="save-link" onClick={() => cloud.reconfigure(null)}>Effacer la config Firebase collée</button>
      )}

      {confirmNew ? (
        <div className="save-conflict">
          <small>Tout recommencer ? La partie de cet appareil sera effacée{st.user ? ' (et remplacée dans ton compte)' : ''}.</small>
          <button type="button" onClick={() => { setConfirmNew(false); onNewGame(); }}>Oui, nouvelle partie</button>
          <button type="button" className="menu-action" onClick={() => setConfirmNew(false)}>Non</button>
        </div>
      ) : (
        <button type="button" className="menu-action" onClick={() => setConfirmNew(true)}>Nouvelle partie</button>
      )}
    </div>
  );
}

/** Pas encore de Firebase : coller la config donnée par la console Firebase. */
function FirebaseSetup() {
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  return (
    <details className="save-setup">
      <summary>Connexion Google : à régler une fois</summary>
      <small>Colle ici la config Firebase de ton projet (le bloc « const firebaseConfig = {'{'} … {'}'} »), voir docs/compte-google.md.</small>
      <textarea rows={6} value={text} placeholder={'apiKey: "…",\nauthDomain: "….firebaseapp.com",\nprojectId: "…",\nappId: "…"'} onChange={(e) => { setBad(false); setText(e.target.value); }} />
      {bad && <small className="save-error">Il manque apiKey, authDomain, projectId ou appId.</small>}
      <button
        type="button"
        onClick={() => {
          const s = parseFirebaseConfig(text);
          if (!s) return setBad(true);
          cloud.reconfigure(s);
        }}
      >
        Enregistrer et recharger
      </button>
      <small>Gardée dans ce navigateur seulement.</small>
    </details>
  );
}

/** Le « G » de Google, en couleurs. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
