import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { type Chat, claudePageChat, loadSettings, openRouterChat, runAi } from './ai';
import { parseOrder } from './parser';
import { runIntents, type Step } from './tasks';

type Mode = 'parole' | 'action';

const STEP_LABEL: Record<string, string> = { prendre: 'Prend', ranger: 'Range dans', poser: 'Pose', aller: 'Va vers', cafe: 'Fait un café', boire: 'Boit', dire: 'Dit', lire: 'Lit', arreter_lire: 'Ferme le livre' };

function stepText(s: Step | null): string {
  if (!s) return 'Réfléchit…';
  const what = Object.values(s.args).join(' ');
  return `${STEP_LABEL[s.name] ?? s.name}${what ? ` ${what}` : ''}…`;
}

/**
 * Zone de saisie en bas de l'écran. Parole : le perso dit la phrase dans le monde. Action : un
 * ordre au perso ; les ordres simples sont compris directement (parser.ts), les autres passent par
 * un modèle de chat (ai.ts, clé OpenRouter dans le menu : `onNeedSettings` l'ouvre).
 */
export function ChatBar({ game, onNeedSettings }: { game: Game | null; onNeedSettings: () => void }) {
  const [mode, setMode] = useState<Mode>('parole');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [result, setResult] = useState<string | null>(null);
  /** Dans l'aperçu claude.ai : Claude pour les ordres libres (OpenRouter y est injoignable). */
  const [claudeChat, setClaudeChat] = useState<Chat | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Entrée (hors saisie) : écrire
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    let live = true;
    claudePageChat().then((c) => live && c && setClaudeChat(() => c));
    return () => {
      live = false;
    };
  }, []);

  const toggle = () => setMode((m) => (m === 'parole' ? 'action' : 'parole'));

  const send = async () => {
    const t = text.trim();
    if (!t || !game) return;
    if (mode === 'parole') {
      game.say(t);
      setText('');
      return;
    }
    if (busy) return;
    const intents = parseOrder(t, game.describe());
    const settings = loadSettings();
    if (!intents && !claudeChat && !settings.apiKey) {
      onNeedSettings();
      setResult('Ordre non compris. Ajoute une clé OpenRouter (Menu → IA des ordres) pour les ordres libres.');
      return;
    }
    setText('');
    setResult(null);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const msg = intents
        ? (await runIntents(game, intents, setStep, ctrl.signal)).message
        : await runAi(game, claudeChat ?? openRouterChat(settings), t, setStep, ctrl.signal);
      setResult(msg);
    } catch (e) {
      setResult(ctrl.signal.aborted ? 'Interrompu.' : `IA : ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setStep(null);
      abort.current = null;
    }
  };

  return (
    <div className="chat">
      {(busy || result) && (
        <div className="chat-status">
          <span>{busy ? stepText(step) : result}</span>
          {busy ? (
            <button onClick={() => abort.current?.abort()}>Arrêter</button>
          ) : (
            <button onClick={() => setResult(null)} aria-label="Fermer">×</button>
          )}
        </div>
      )}
      <form
        className={`chat-bar chat-${mode}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button type="button" className="chat-mode" onClick={toggle} title="Changer de mode (Tab)">
          {mode === 'parole' ? '💬 Parole' : '✋ Action'}
        </button>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              toggle();
            } else if (e.key === 'Escape') input.current?.blur();
          }}
          placeholder={mode === 'parole' ? 'Dire quelque chose…' : 'Donner un ordre (ex. range tous les livres)'}
          disabled={mode === 'action' && busy}
        />
        <button type="submit" className="chat-send" disabled={!text.trim() || (mode === 'action' && busy)}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
