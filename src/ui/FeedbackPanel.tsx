import { useEffect, useRef, useState } from 'react';

/** Dépôt où le bouton « Envoyer » ouvre une issue pré-remplie (aucun jeton : le joueur valide sur GitHub). */
const ISSUES_URL = 'https://github.com/lyarca33-hue/Island/issues/new';
/** GitHub refuse les adresses trop longues : au-delà, le texte est coupé (le bouton Copier garde tout). */
const MAX_BODY = 6000;

/** Titre de l'issue : la première ligne du texte, raccourcie. */
function titleOf(text: string): string {
  const first = text.trim().split('\n')[0].replace(/^#+\s*/, '');
  return first.length > 70 ? `${first.slice(0, 67)}…` : first || 'Retour depuis le jeu';
}

async function copyText(text: string): Promise<void> {
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
}

/**
 * Fenêtre « Signaler » : le joueur écrit ce qu'il veut. « Envoyer sur GitHub » ouvre une issue
 * pré-remplie dans un nouvel onglet ; « Copier » met le tout dans le presse-papiers pour le coller dans la discussion.
 * `initial` : texte de départ (Menu → Manques y verse son journal).
 */
export function FeedbackPanel({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const full = text.trim();
  const empty = !text.trim();

  useEffect(() => {
    const a = area.current;
    if (!a) return;
    a.focus();
    a.setSelectionRange(a.value.length, a.value.length);
  }, []);

  const send = () => {
    let body = full;
    if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY)}\n\n…(texte coupé, trop long pour l’adresse : la suite est dans le presse-papiers)`;
    if (body !== full) void copyText(full);
    const url = `${ISSUES_URL}?${new URLSearchParams({ title: titleOf(text), body })}`;
    window.open(url, '_blank', 'noopener');
  };

  const copy = async () => {
    await copyText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="feedback" role="dialog" aria-label="Signaler">
      <div className="feedback-head">
        <b>Signaler</b>
        <button className="missing-edit" onClick={onClose} aria-label="Fermer">✕</button>
      </div>
      <textarea
        ref={area}
        value={text}
        rows={5}
        placeholder="Ce qui manque, ce qui ne marche pas, une idée…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !empty) send();
        }}
      />
      <div className="missing-actions">
        <button onClick={send} disabled={empty} title="Ouvre une issue pré-remplie sur GitHub (Ctrl+Entrée)">Envoyer sur GitHub</button>
        <button onClick={copy} disabled={empty} title="Pour le coller dans la discussion du projet">{copied ? 'Copié ✓' : 'Copier'}</button>
      </div>
      <small>GitHub s’ouvre dans un nouvel onglet : il reste à cliquer sur « Create ». Copier sert à le coller dans la discussion.</small>
    </div>
  );
}
