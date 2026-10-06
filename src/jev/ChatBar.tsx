import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { type JevSettings, type JevStep, loadSettings, openRouterDecide, runJev, saveSettings } from './jev';

type Mode = 'parole' | 'action';

const STEP_LABEL: Record<string, string> = { prendre: 'prend', ranger: 'range dans', poser: 'pose', aller: 'va vers', cafe: 'fait un café', boire: 'boit' };

function stepText(s: JevStep): string {
  if (s.kind === 'thinking') return 'Jev réfléchit…';
  const what = Object.values(s.args).join(' ');
  return `Jev ${STEP_LABEL[s.name] ?? s.name}${what ? ` ${what}` : ''}…`;
}

/**
 * Zone de saisie en bas de l'écran. Parole : le perso dit la phrase dans le monde. Action : la
 * demande part à Jev, qui enchaîne les actions du jeu pour la réaliser.
 */
export function ChatBar({ game }: { game: Game | null }) {
  const [mode, setMode] = useState<Mode>('parole');
  const [text, setText] = useState('');
  const [step, setStep] = useState<JevStep | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [settings, setSettings] = useState<JevSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== null;

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
    if (!settings.apiKey) {
      setShowSettings(true);
      setResult('Ajoute ta clé OpenRouter pour que Jev puisse agir.');
      return;
    }
    setText('');
    setResult(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const msg = await runJev(game, openRouterDecide(settings, crypto.randomUUID()), t, setStep, ctrl.signal);
      setResult(msg);
    } catch (e) {
      setResult(ctrl.signal.aborted ? 'Interrompu.' : `Jev : ${(e as Error).message}`);
    } finally {
      setStep(null);
      abort.current = null;
    }
  };

  return (
    <div className="chat">
      {(step || result) && (
        <div className="chat-status">
          <span>{step ? stepText(step) : result}</span>
          {step ? (
            <button onClick={() => abort.current?.abort()}>Arrêter</button>
          ) : (
            <button onClick={() => setResult(null)} aria-label="Fermer">×</button>
          )}
        </div>
      )}
      {showSettings && (
        <form
          className="chat-settings"
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings(settings);
            setShowSettings(false);
            setResult(null);
          }}
        >
          <label>
            Clé OpenRouter
            <input type="password" value={settings.apiKey} placeholder="sk-or-…" onChange={(e) => setSettings({ ...settings, apiKey: e.target.value.trim() })} />
          </label>
          <label>
            Modèle de Jev
            <input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value.trim() })} />
          </label>
          <small>Gardée dans ce navigateur seulement.</small>
          <button type="submit">Enregistrer</button>
        </form>
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
          placeholder={mode === 'parole' ? 'Dire quelque chose…' : 'Demander une action à Jev (ex. range tous les livres)'}
          disabled={mode === 'action' && busy}
        />
        <button type="submit" className="chat-send" disabled={!text.trim() || (mode === 'action' && busy)}>
          Envoyer
        </button>
        <button type="button" className="chat-gear" onClick={() => setShowSettings((s) => !s)} aria-label="Réglages de Jev" title="Réglages de Jev">
          ⚙
        </button>
      </form>
    </div>
  );
}
