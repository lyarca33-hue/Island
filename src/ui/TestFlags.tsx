import { useEffect, useState } from 'react';
import { clearFlags, loadFlags, onFlags, toggleFlag } from '../game/carteTest';

/**
 * Carte de test, Menu → Partie : les modèles signalés à retirer (touche A sur le modèle visé).
 * « Envoyer à Claude » ouvre la fenêtre Signaler avec la liste (GitHub ou copier-coller), et Claude
 * retire ensuite ces modèles du jeu.
 */
export function TestFlags({ onSend }: { onSend: (text: string) => void }) {
  const [flags, setFlags] = useState(loadFlags);
  useEffect(() => onFlags(() => setFlags(loadFlags())), []);
  if (!flags.length) return <p>Vise un modèle et appuie sur A pour le signaler à retirer du jeu.</p>;
  const text = `# Modèles à retirer du jeu (${flags.length})\n\nSignalés sur la carte de test :\n\n${flags.map((f) => `- ${f}`).join('\n')}`;
  return (
    <div className="test-flags">
      <p>
        <b>À retirer ({flags.length})</b> : A sur un modèle l’ajoute ou l’enlève.
      </p>
      <ul>
        {flags.map((f) => (
          <li key={f}>
            {f}{' '}
            <button type="button" className="save-link" onClick={() => toggleFlag(f)} title="Ne plus signaler">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="menu-action" onClick={() => onSend(text)}>
        Envoyer la liste à Claude
      </button>
      <button type="button" className="save-link" onClick={clearFlags}>
        Vider la liste
      </button>
    </div>
  );
}
