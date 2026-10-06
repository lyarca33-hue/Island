/**
 * Jev : l'IA qui transforme une demande (« range tous les livres ») en suite d'actions du jeu.
 *
 * À chaque tour, Jev reçoit l'état de la pièce et le résultat de sa dernière action, et répond
 * par UNE action en JSON. Ce format texte marche avec n'importe quel modèle (pas besoin de
 * l'appel d'outils natif). Le modèle est appelé via OpenRouter ; `Chat` peut être remplacé
 * (autre fournisseur, modèle local, faux modèle pour les tests).
 */
import type { Game } from '../game/Game';
import { ACTIONS, perform } from './actions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Envoie la conversation au modèle et rend sa réponse (texte). */
export type Chat = (messages: ChatMessage[], signal?: AbortSignal) => Promise<string>;

export interface JevSettings {
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'typesafe/jev-1.13';
const STORAGE_KEY = 'rp-island.jev';

/** Réglages enregistrés dans le navigateur, sinon ceux du fichier .env (VITE_OPENROUTER_API_KEY, VITE_JEV_MODEL). */
export function loadSettings(): JevSettings {
  let saved: Partial<JevSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // stockage indisponible : réglages par défaut
  }
  return {
    apiKey: saved.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '',
    model: saved.model || import.meta.env.VITE_JEV_MODEL || DEFAULT_MODEL,
  };
}

export function saveSettings(s: JevSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // tant pis : valable pour cette session seulement
  }
}

/** Appel à OpenRouter (API compatible OpenAI). */
export function openRouterChat({ apiKey, model }: JevSettings): Chat {
  return async (messages, signal) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rp Island',
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouter : erreur ${res.status}`);
    return data?.choices?.[0]?.message?.content ?? '';
  };
}

const SYSTEM = `Tu es Jev. Tu contrôles le personnage du joueur dans un petit monde 3D, en enchaînant les actions du jeu pour réaliser sa demande.

Actions possibles :
${ACTIONS.map((a) => `- ${a.name}${Object.keys(a.params).length ? ` (${Object.entries(a.params).map(([k, v]) => `${k} : ${v}`).join(', ')})` : ''} : ${a.description}`).join('\n')}

Les objets sont désignés par leur « ref » (donnée dans l'état de la pièce). On ne tient qu'un objet à la fois, sauf les livres qui s'empilent.

À chaque tour, réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"action": "<nom>", ...paramètres}
Quand la demande est réalisée (ou impossible), réponds :
{"action": "fini", "message": "<une phrase courte pour le joueur>"}

Une seule action par réponse : tu verras son résultat et l'état de la pièce avant de choisir la suivante.`;

/** Étape vue par l'interface : ce que Jev fait en ce moment. */
export type JevStep = { kind: 'action'; name: string; args: Record<string, string> } | { kind: 'thinking' };

/** Nombre d'actions au plus pour une demande (garde-fou). */
const MAX_STEPS = 40;

/** Premier objet JSON trouvé dans la réponse (le modèle ajoute parfois du texte ou des ```). */
export function parseAction(text: string): Record<string, string> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        const obj = JSON.parse(text.slice(start, i + 1));
        if (!obj || typeof obj.action !== 'string') return null;
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Réalise la demande : boucle « Jev choisit une action → le jeu l'exécute → Jev voit le
 * résultat ». Rend le message final de Jev.
 */
export async function runJev(game: Game, chat: Chat, request: string, onStep: (s: JevStep) => void, signal?: AbortSignal): Promise<string> {
  const state = () => `État de la pièce :\n${JSON.stringify(game.describe())}`;
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Demande du joueur : ${request}\n\n${state()}` },
  ];
  let misses = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    onStep({ kind: 'thinking' });
    const reply = await chat(messages, signal);
    if (signal?.aborted) return 'Interrompu.';
    messages.push({ role: 'assistant', content: reply });
    const act = parseAction(reply);
    if (!act) {
      if (++misses > 2) throw new Error('Jev ne répond pas dans le bon format.');
      messages.push({ role: 'user', content: 'Réponds uniquement par un objet JSON {"action": ...}.' });
      continue;
    }
    misses = 0;
    const { action, ...args } = act;
    if (action === 'fini') return args.message || 'C’est fait.';
    onStep({ kind: 'action', name: action, args });
    const { report } = await perform(game, action, args, signal);
    if (signal?.aborted) return 'Interrompu.';
    messages.push({ role: 'user', content: `Résultat de ${action} : ${report}\n\n${state()}` });
  }
  return 'J’ai arrêté : trop d’étapes.';
}
