import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { situation } from '../orders/diagnose';

/** Dépôt où le bouton « Envoyer » ouvre une issue pré-remplie (aucun jeton : le joueur valide sur GitHub). */
const ISSUES_URL = 'https://github.com/lyarca33-hue/Island/issues/new';
/** GitHub refuse les adresses trop longues : au-delà, le texte est coupé (le bouton Copier garde tout). */
const MAX_BODY = 6000;

let lastOrder: string | null = null;
/** Retient le dernier ordre tapé (ChatBar), joint au retour comme contexte. */
export function noteLastOrder(text: string): void {
  lastOrder = text;
}

/** Ce que le jeu sait au moment du retour : joint automatiquement au texte du joueur. */
export interface FeedbackContext {
  aimed: string | null;
  held: string | null;
}

function contextLines(game: Game | null, ctx: FeedbackContext): string[] {
  const lines: string[] = [];
  if (game) lines.push(`- Heure du jeu : jour ${game.clock.day}, ${game.clock.label}`);
  lines.push(`- Dernier objet survolé : ${ctx.aimed ?? 'aucun'}`);
  lines.push(game ? `- Perso : ${situation(game)}` : `- En main : ${ctx.held ?? 'rien'}`);
  lines.push(`- Dernier ordre : ${lastOrder ? `« ${lastOrder} »` : 'aucun'}`);
  return lines;
}

/** Titre de l'issue : la première ligne du texte, raccourcie. */
function titleOf(text: string): string {
  const first = text.trim().split('\n')[0].replace(/^#+\s*/, '');
  return first.length > 70 ? `${first.slice(0, 67)}…` : first || 'Retour depuis le jeu';
}

function report(text: string, ctx: string[]): string {
  return [text.trim(), '', '---', '**Contexte (automatique)**', ...ctx].join('\n');
}

export async function copyText(text: string): Promise<void> {
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
 * Fenêtre « Signaler » : le joueur écrit ce qu'il veut, le jeu ajoute le contexte (heure, objet
 * visé, objet en main, dernier ordre). « Envoyer sur GitHub » ouvre une issue pré-remplie dans un
 * nouvel onglet ; « Copier » met le tout dans le presse-papiers pour le coller dans la discussion.
 * `initial` : texte de départ (Menu → Manques y verse son journal).
 */
export function FeedbackPanel({ game, context, initial, onClose }: { game: Game | null; context: FeedbackContext; initial: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Contexte figé à l'ouverture : c'est le moment que le joueur signale.
  const [ctx] = useState(() => contextLines(game, context));
  const full = report(text, ctx);
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
      <ul className="feedback-ctx">
        {ctx.map((l) => (
          <li key={l}>{l.slice(2)}</li>
        ))}
      </ul>
      <div className="missing-actions">
        <button onClick={send} disabled={empty} title="Ouvre une issue pré-remplie sur GitHub (Ctrl+Entrée)">Envoyer sur GitHub</button>
        <button onClick={copy} disabled={empty} title="Pour le coller dans la discussion du projet">{copied ? 'Copié ✓' : 'Copier'}</button>
      </div>
      <small>GitHub s’ouvre dans un nouvel onglet : il reste à cliquer sur « Create ». Copier sert à le coller dans la discussion.</small>
    </div>
  );
}
