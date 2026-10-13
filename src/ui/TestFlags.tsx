import { useEffect, useState } from 'react';
import { clearFlags, type FlagKind, loadFlags, onFlags, toggleFlag } from '../game/carteTest';

const KEY: Record<FlagKind, string> = { retirer: 'A', corriger: 'E' };
const TITLE: Record<FlagKind, string> = { retirer: 'Modèles à retirer du jeu', corriger: 'Modèles à corriger' };

/**
 * Carte de test, Menu → Partie : une liste de modèles signalés, à retirer (touche A sur le modèle
 * visé) ou à corriger (touche E). « Envoyer à Claude » ouvre la fenêtre Signaler avec la liste
 * (GitHub ou copier-coller), et Claude s'en occupe ensuite.
 */
export function TestFlags({ kind, onSend }: { kind: FlagKind; onSend: (text: string) => void }) {
  const [flags, setFlags] = useState(() => loadFlags(kind));
  useEffect(() => onFlags(() => setFlags(loadFlags(kind))), [kind]);
  if (!flags.length) return <p>Vise un modèle et appuie sur {KEY[kind]} pour le signaler à {kind}.</p>;
  const text = `# ${TITLE[kind]} (${flags.length})\n\nSignalés sur la carte de test :\n\n${flags.map((f) => `- ${f}`).join('\n')}`;
  return (
    <div className="test-flags">
      <p>
        <b>
          À {kind} ({flags.length})
        </b>{' '}
        : {KEY[kind]} sur un modèle l’ajoute ou l’enlève.
      </p>
      <ul>
        {flags.map((f) => (
          <li key={f}>
            {f}{' '}
            <button type="button" className="save-link" onClick={() => toggleFlag(f, kind)} title="Ne plus signaler">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="menu-action" onClick={() => onSend(text)}>
        Envoyer la liste à Claude
      </button>
      <button type="button" className="save-link" onClick={() => clearFlags(kind)}>
        Vider la liste
      </button>
    </div>
  );
}
