import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { Icon } from '../ui/icons';
import { type Chat, claudePageChat, loadSettings, openRouterChat, runAi } from './ai';
import { failureCause, situation } from './diagnose';
import { logMissing } from './missing';
import { explainOrder, parseOrder } from './parser';
import { intentLabel, runIntents, type Step } from './tasks';

type Mode = 'parole' | 'action';

const STEP_LABEL: Record<string, string> = { prendre: 'Prend', ranger: 'Range dans', poser: 'Pose', aller: 'Va vers', cafe: 'Fait un café', boire: 'Boit', manger: 'Mange', couper: 'Coupe', dire: 'Dit', lire: 'Lit', arreter_lire: 'Ferme le livre', allumer: 'Allume', eteindre: 'Éteint', mettre_sur_feu: 'Met sur le feu', mettre_dans: 'Met dans', attendre_cuisson: 'Attend la cuisson de', essuyer_vaisselle: 'Essuie', essuyer_mains: 'S’essuie les mains' };

function stepText(s: Step | null): string {
  if (!s) return 'Réfléchit…';
  const what = Object.values(s.args).join(' ');
  return `${STEP_LABEL[s.name] ?? s.name}${what ? ` ${what}` : ''}…`;
}

/**
 * Zone de saisie en bas de l'écran : au repos une petite pilule, qui s'ouvre en barre complète
 * quand on écrit (Entrée ou clic). Parole : le perso dit la phrase dans le monde. Action : un
 * ordre au perso ; les ordres simples sont compris directement (parser.ts), les autres passent par
 * un modèle de chat (ai.ts, clé OpenRouter dans le menu : `onNeedSettings` l'ouvre).
 */
export function ChatBar({ game, onNeedSettings }: { game: Game | null; onNeedSettings: () => void }) {
  const [mode, setMode] = useState<Mode>('parole');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [result, setResult] = useState<string | null>(null);
  /** La saisie a le focus : la barre est ouverte (elle le reste tant qu'un brouillon est écrit). */
  const [focused, setFocused] = useState(false);
  /** Dans l'aperçu claude.ai : Claude pour les ordres libres (OpenRouter y est injoignable). */
  const [claudeChat, setClaudeChat] = useState<Chat | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Entrée (hors saisie) : écrire
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
      const why = explainOrder(t, game.describe().objets);
      logMissing({ kind: 'incompris', ordre: t, quoi: why.quoi, cause: why.cause, detail: `${why.detail} (pas de clé OpenRouter pour demander à l’IA)`, contexte: situation(game) });
      onNeedSettings();
      setResult('Ordre non compris. Ajoute une clé OpenRouter (Menu → IA des ordres) pour les ordres libres.');
      return;
    }
    setText('');
    setResult(null);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    // ce que le perso n'a pas pu faire va au journal des manques (Menu → Manques)
    let noted = false;
    // dernière étape commencée, pour situer un échec
    let last: Step | null = null;
    const onStep = (s: Step | null) => {
      if (s) last = s;
      setStep(s);
    };
    const note = (m: Parameters<typeof logMissing>[0]) => {
      if (ctrl.signal.aborted) return;
      const cause = m.cause ?? (m.kind === 'echec' ? failureCause(m.detail) : undefined);
      logMissing({ ...m, cause, contexte: m.contexte ?? situation(game, m.kind === 'echec' ? last : null) });
      noted = true;
    };
    try {
      let msg: string;
      if (intents) {
        const r = await runIntents(game, intents, onStep, ctrl.signal);
        if (!r.ok && r.failed) note({ kind: 'echec', ordre: t, quoi: intentLabel(r.failed), detail: r.message });
        msg = r.message;
      } else msg = await runAi(game, claudeChat ?? openRouterChat(settings), t, onStep, ctrl.signal, (m) => note({ ...m, ordre: t }));
      setResult(noted ? `${msg} (noté dans Menu → Manques)` : msg);
    } catch (e) {
      setResult(ctrl.signal.aborted ? 'Interrompu.' : `IA : ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setStep(null);
      abort.current = null;
    }
  };

  const open = focused || text.length > 0;
  return (
    <div className="chat">
      {(busy || result) && (
        <div className={`chat-status${busy ? ' busy' : ''}`}>
          {busy && <span className="chat-spin" aria-hidden />}
          <span>{busy ? stepText(step) : result}</span>
          {busy ? (
            <button onClick={() => abort.current?.abort()}>
              <Icon name="stop" size={11} /> Arrêter
            </button>
          ) : (
            <button onClick={() => setResult(null)} aria-label="Fermer">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}
      <form
        className={`chat-bar chat-${mode}${open ? ' open' : ''}`}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          className="chat-mode"
          onPointerDown={(e) => open && e.preventDefault()}
          onClick={toggle}
          title={`${mode === 'parole' ? 'Parole : le perso dit la phrase' : 'Action : un ordre au perso'} (Tab pour changer)`}
        >
          <Icon name={mode === 'parole' ? 'speech' : 'bolt'} size={15} />
          <span className="chat-mode-label">{mode === 'parole' ? 'Parole' : 'Action'}</span>
          <kbd className="key key-ghost">Tab</kbd>
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
          placeholder={mode === 'parole' ? 'Dire quelque chose…' : open ? 'Donner un ordre (ex. « range tous les livres »)' : 'Donner un ordre…'}
          aria-label={mode === 'parole' ? 'Dire quelque chose' : 'Donner un ordre au perso'}
          disabled={mode === 'action' && busy}
        />
        <kbd className="key key-ghost chat-hint">Entrée</kbd>
        <button type="submit" className="chat-send" disabled={!text.trim() || (mode === 'action' && busy)} aria-label="Envoyer" title="Envoyer (Entrée)">
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}
