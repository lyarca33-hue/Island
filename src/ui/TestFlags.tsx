import { useEffect, useState } from 'react';
import { clearFlags, type FlagKind, FLAG_WORD, flagListText, loadComments, loadFlags, onFlags, toggleFlag } from '../game/carteTest';

const KEY: Record<FlagKind, string> = { retirer: 'A', corriger: 'E', anguleux: 'T', lisse: 'L' };
/** Comment signaler, quand la liste est vide. */
const HOW: Record<FlagKind, string> = {
  retirer: 'Vise un modèle et appuie sur A pour le signaler à retirer.',
  corriger: 'Vise un modèle et appuie sur E pour le signaler à corriger.',
  anguleux: 'Dans la visionneuse, T (ou le bouton « Trop anguleux ») signale un modèle trop anguleux.',
  lisse: 'Dans la visionneuse, L (ou le bouton « Pas assez lisse ») signale un modèle pas assez lisse.',
};

/**
 * Carte de test (Menu → Partie) et visionneuse de modèles : une liste de modèles signalés, à retirer
 * (touche A sur le modèle visé) ou à corriger sur Blender (touche E), avec leurs commentaires. « Envoyer à Claude » ouvre la fenêtre Signaler avec la liste
 * (GitHub ou copier-coller), et Claude s'en occupe ensuite.
 */
export function TestFlags({ kind, onSend }: { kind: FlagKind; onSend: (text: string) => void }) {
  const [flags, setFlags] = useState(() => loadFlags(kind));
  const [notes, setNotes] = useState(loadComments);
  useEffect(
    () =>
      onFlags(() => {
        setFlags(loadFlags(kind));
        setNotes(loadComments());
      }),
    [kind],
  );
  if (!flags.length) return <p>{HOW[kind]}</p>;
  return (
    <div className="test-flags">
      <p>
        <b>
          {FLAG_WORD[kind].replace(/^./, (c) => c.toUpperCase())} ({flags.length})
        </b>{' '}
        : {KEY[kind]} sur un modèle l’ajoute ou l’enlève.
      </p>
      <ul>
        {flags.map((f) => (
          <li key={f}>
            {f}
            {notes[f] && <i className="test-flag-note"> : {notes[f]}</i>}{' '}
            <button type="button" className="save-link" onClick={() => toggleFlag(f, kind)} title="Ne plus signaler">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="menu-action" onClick={() => onSend(flagListText(kind))}>
        Envoyer la liste à Claude
      </button>
      <button type="button" className="save-link" onClick={() => clearFlags(kind)}>
        Vider la liste
      </button>
    </div>
  );
}
