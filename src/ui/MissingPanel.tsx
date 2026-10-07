import { useEffect, useState } from 'react';
import { clearMissing, groupMissing, KIND_LABEL, missingList, missingReport, noteKnownMissing, onMissingChange } from '../orders/missing';

noteKnownMissing();

/** Nombre de manques notés, tenu à jour (titre de la section du menu). */
export function useMissingCount(): number {
  const [n, setN] = useState(() => missingList().length);
  useEffect(() => onMissingChange(() => setN(missingList().length)), []);
  return n;
}

/** Menu → Manques : ce que le perso n'a pas pu faire, regroupé, à copier ou télécharger. */
export function MissingPanel() {
  const [list, setList] = useState(missingList);
  const [copied, setCopied] = useState(false);
  /** « Vider » demande un second clic (les fenêtres confirm() sont bloquées dans l'aperçu). */
  const [sure, setSure] = useState(false);
  useEffect(() => onMissingChange(() => setList(missingList())), []);
  const groups = groupMissing(list);

  const copy = async () => {
    const text = missingReport(list);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // presse-papiers refusé : copie à l'ancienne
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([missingReport(list)], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `manques-rp-island-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!groups.length) {
    return <p className="menu-note">Rien pour l’instant. Ce que le perso ne sait pas faire ou rate pendant tes essais s’ajoutera ici.</p>;
  }
  return (
    <div className="missing">
      <ul className="missing-list">
        {groups.map((g) => (
          <li key={`${g.kind}|${g.quoi}`} title={g.ordres.map((o) => `« ${o} »`).join('\n')}>
            <div className="missing-head">
              <b>{g.quoi}</b>
              {g.count > 1 && <span className="missing-count">×{g.count}</span>}
            </div>
            <small>{KIND_LABEL[g.kind]} · {g.last.detail}</small>
          </li>
        ))}
      </ul>
      <div className="missing-actions">
        <button onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</button>
        <button onClick={download}>Télécharger</button>
        <button onClick={() => (sure ? (clearMissing(), setSure(false)) : setSure(true))} onBlur={() => setSure(false)}>
          {sure ? 'Vraiment ?' : 'Vider'}
        </button>
      </div>
    </div>
  );
}
