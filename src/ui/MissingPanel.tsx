import { useEffect, useState } from 'react';
import { autoComment, clearMissing, groupKey, groupMissing, KIND_LABEL, type MissingGroup, missingList, missingNotes, missingReport, noteKnownMissing, onMissingChange, removeMissing, setMissingNote } from '../orders/missing';

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
  const [notes, setNotes] = useState(missingNotes);
  const [copied, setCopied] = useState(false);
  /** Groupe dont on modifie le commentaire, et le texte en cours. */
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  /** « Vider » demande un second clic (les fenêtres confirm() sont bloquées dans l'aperçu). */
  const [sure, setSure] = useState(false);
  /** Groupe dont la suppression attend le second clic. */
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(
    () =>
      onMissingChange(() => {
        setList(missingList());
        setNotes(missingNotes());
      }),
    [],
  );
  const groups = groupMissing(list, notes);

  const save = (key: string, text: string) => {
    setMissingNote(key, text);
    setEditing(null);
  };

  const copy = async () => {
    const text = missingReport(list, notes);
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
    const url = URL.createObjectURL(new Blob([missingReport(list, notes)], { type: 'text/markdown' }));
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
          <MissingItem key={groupKey(g)} group={g} editing={editing?.key === groupKey(g) ? editing.text : null} onEdit={(text) => setEditing({ key: groupKey(g), text })} onCancel={() => setEditing(null)} onSave={(text) => save(groupKey(g), text)} deleting={deleting === groupKey(g)} onDelete={() => (deleting === groupKey(g) ? (removeMissing(groupKey(g)), setDeleting(null)) : setDeleting(groupKey(g)))} onDeleteCancel={() => setDeleting(null)} />
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

/**
 * Un manque : son commentaire (automatique, ou celui du joueur), le crayon pour le modifier et la
 * corbeille pour retirer la ligne. `editing` : le texte en cours de modification, null hors
 * modification ; `deleting` : la corbeille attend le second clic.
 */
function MissingItem({ group: g, editing, onEdit, onCancel, onSave, deleting, onDelete, onDeleteCancel }: { group: MissingGroup; editing: string | null; onEdit: (text: string) => void; onCancel: () => void; onSave: (text: string) => void; deleting: boolean; onDelete: () => void; onDeleteCancel: () => void }) {
  const auto = autoComment(g);
  return (
    <li title={g.ordres.map((o) => `« ${o} »`).join('\n')}>
      <div className="missing-head">
        <b>{g.quoi}</b>
        <span className="missing-tools">
          {g.count > 1 && <span className="missing-count">×{g.count}</span>}
          {editing === null && (
            <button className="missing-edit" onClick={() => onEdit(g.note ?? auto)} aria-label="Modifier le commentaire" title="Modifier le commentaire">
              ✎
            </button>
          )}
          <button className={`missing-edit${deleting ? ' missing-sure' : ''}`} onClick={onDelete} onBlur={onDeleteCancel} aria-label="Supprimer cette ligne" title="Supprimer cette ligne et son commentaire">
            {deleting ? 'Supprimer ?' : '🗑'}
          </button>
        </span>
      </div>
      {editing === null ? (
        <small>
          {KIND_LABEL[g.kind]} · {g.note ?? auto}
          {g.note && <em className="missing-mine"> (ton commentaire)</em>}
        </small>
      ) : (
        <div className="missing-editor">
          <textarea
            value={editing}
            rows={3}
            autoFocus
            onChange={(e) => onEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onCancel();
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave(editing === auto ? '' : editing);
            }}
          />
          <small>Diagnostic auto : {auto}</small>
          <div className="missing-actions">
            <button onClick={() => onSave(editing === auto ? '' : editing)}>Enregistrer</button>
            {g.note && <button onClick={() => onSave('')}>Effacer mon commentaire</button>}
            <button onClick={onCancel}>Annuler</button>
          </div>
        </div>
      )}
    </li>
  );
}
