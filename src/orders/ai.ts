/**
 * Ordres que l'analyseur ne comprend pas (« tu peux mettre un peu d'ordre ? ») : un modèle de chat
 * via OpenRouter choisit les tâches, une par tour, en voyant l'état de la pièce et le résultat de
 * la précédente. Il peut aussi faire parler le perso (refus en personnage, réponse).
 *
 * Format texte JSON plutôt que l'appel d'outils natif : marche avec n'importe quel modèle.
 */
import type { Game } from '../game/Game';
import type { Missing } from './missing';
import { type Intent, intentLabel, runIntents, type Step } from './tasks';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Envoie la conversation au modèle et rend sa réponse (texte). */
export type Chat = (messages: ChatMessage[], signal?: AbortSignal) => Promise<string>;

export interface AiSettings {
  apiKey: string;
  model: string;
}

/** Le modèle par défaut de Lumen : rapide et très bon marché. */
export const DEFAULT_MODEL = 'qwen/qwen3.7-flash';
const STORAGE_KEY = 'rp-island.ia';

/** Réglages enregistrés dans le navigateur, sinon ceux du fichier .env (VITE_OPENROUTER_API_KEY, VITE_OPENROUTER_MODEL). */
export function loadSettings(): AiSettings {
  let saved: Partial<AiSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // stockage indisponible : réglages par défaut
  }
  return {
    apiKey: saved.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '',
    model: saved.model || import.meta.env.VITE_OPENROUTER_MODEL || DEFAULT_MODEL,
  };
}

export function saveSettings(s: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // tant pis : valable pour cette session seulement
  }
}

/** Appel à OpenRouter (API compatible OpenAI), sans chaîne de pensée (comme Lumen). */
export function openRouterChat({ apiKey, model }: AiSettings): Chat {
  return async (messages, signal) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rp Island',
      },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 300, reasoning: { enabled: false } }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouter : erreur ${res.status}`);
    return data?.choices?.[0]?.message?.content ?? '';
  };
}

/** Le strict nécessaire du `sample` des pages claude.ai (demander à Claude depuis la page). */
type Sample = (input: Array<{ role: 'user' | 'assistant'; content: string }>, options?: { signal?: AbortSignal; modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }) => Promise<{ text: string }>;

/**
 * Dans l'aperçu publié sur claude.ai, la page ne peut pas joindre OpenRouter ; elle peut en
 * revanche demander à Claude (compte de la personne qui joue, avec son accord au premier ordre).
 * Rend ce modèle, ou null hors de claude.ai.
 */
export async function claudePageChat(): Promise<Chat | null> {
  const host = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  const sample = (await host?.use('sample').catch(() => null)) as Sample | null;
  if (!sample) return null;
  return async (messages, signal) => {
    // pas de rôle « system » : les consignes passent en premier message
    const turns = messages.map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));
    try {
      return (await sample(turns, { signal, modelTier: 'quick', cache: false })).text;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'not_granted') throw new Error('Claude n’a pas été autorisé pour cette page.');
      throw new Error((e as { message?: string }).message ?? 'Claude ne répond pas.');
    }
  };
}

const SYSTEM = `Tu joues le personnage du joueur dans un petit monde 3D de jeu de rôle. Le joueur te donne un ordre ; tu le réalises en enchaînant les tâches du jeu, une par tour.

Tâches possibles (réponds avec l'une d'elles) :
- {"tache": "prendre", "objet": "<ref>"} : aller prendre un objet portable. Le perso a deux mains : un objet par main (ex. la tasse et un livre) ; un livre s'ajoute à la pile de livres tenue (une pile, une caisse ou une chaise prend les deux mains) ; si les mains sont prises, il pose d'abord ce qu'il faut
- {"tache": "poser", "objet": "<ref>", "sur": "<ref>"} : poser un objet sur un autre objet ou un meuble (« objet » et « sur » sont facultatifs : sans « objet », ce qu'on tient ; sans « sur », devant soi). Si l'objet n'est pas en main, il est pris d'abord
- {"tache": "aller", "objet": "<ref>"} : marcher jusqu'à un objet ou un meuble
- {"tache": "ranger", "livres": ["<ref>", ...]} : ranger ces livres dans la bibliothèque (liste vide = tous ceux qui traînent)
- {"tache": "cafe"} : se faire un café (prend la tasse si besoin)
- {"tache": "boire", "objet": "<ref>", "liquide": "eau"} : boire une gorgée (« objet » facultatif : une bouteille d'eau du frigo, la tasse… ; sans objet, la tasse ; « liquide » facultatif, "eau" ou "café" : si la tasse est vide, elle est d'abord remplie, de café par défaut). Boire fait baisser la soif
- {"tache": "eau"} : remplir la tasse d'eau à l'évier (prend la tasse si besoin). Une tasse « sale » (bue jusqu'au bout) est seulement rincée : la machine à café refuse une tasse sale
- {"tache": "laver", "visage": true} : se laver à l'évier (« visage » faux : les mains seulement ; vrai : toilette, mains et visage). Fait remonter l'hygiène ; pose d'abord ce que le perso tient
- {"tache": "manger", "objet": "<ref>"} : manger un aliment en entier, pomme ou sandwich (« objet » facultatif ; il y en a dans le frigo, le perso ouvre la porte tout seul)
- {"tache": "mettre", "objet": "<ref>", "dans": "<ref du meuble>"} : ranger un objet dans un meuble qui a une porte ou un tiroir (« objet » facultatif : ce qu'on tient) : frigo (bouteille, pomme, sandwich), placard (tasse, bouteille, pomme), tiroir (lettre), four et micro-ondes (pomme, sandwich), lave-vaisselle (tasse)
- {"tache": "ouvrir", "objet": "<ref>"} / {"tache": "fermer", "objet": "<ref>"} : ouvrir ou fermer la porte d'un meuble (frigo, placard, four…), un tiroir ou le couvercle de la poubelle
- {"tache": "allumer", "objet": "<ref>"} : mettre en marche un appareil (sorte « appareil ») ; il faut d'abord y « mettre » quelque chose. Le four cuit (une deuxième fois : brûlé, ça nourrit moins), le micro-ondes réchauffe sans brûler, le lave-vaisselle rend propre la vaisselle sale. La tâche finit quand l'appareil sonne
- {"tache": "eteindre", "objet": "<ref>"} : arrêter un appareil en marche
- {"tache": "jeter", "objet": "<ref>"} : jeter un objet à la poubelle (« objet » facultatif : ce qu'on tient) ; il disparaît
- {"tache": "vider", "objet": "<ref>"} : vider la poubelle quand elle est pleine
- {"tache": "lire", "objet": "<ref>"} : lire un livre (« objet » facultatif : le livre tenu, sinon le plus proche ; le perso le prend et libère l'autre main si besoin)
- {"tache": "arreter_lire"} : fermer le livre qu'on lit
- {"tache": "asseoir", "objet": "<ref>"} : s'asseoir sur un siège (sorte « siège », ex. la chaise ; « objet » facultatif : le plus proche). Assis, le perso peut boire, lire, parler ; il se lève tout seul pour marcher ou prendre un objet
- {"tache": "lever"} : se lever quand on est assis
- {"tache": "dire", "texte": "<phrase>"} : le personnage dit une phrase, en personnage
- {"tache": "manque", "action": "<verbe court, ex. danser>", "sorte": "geste", "objet": "<nom>", "raison": "<ce qui manque au jeu, en une phrase>"} : signale au créateur du jeu une action ou un objet que le jeu n'a pas encore (« sorte » : "geste" si l'objet existe mais pas le geste, ex. laver la tasse ; "objet" si l'objet n'est pas dans la pièce, ex. une casserole ; "autre" sinon. « objet » facultatif : l'objet concerné)
- {"tache": "fini", "message": "<phrase courte pour le joueur>"} : l'ordre est réalisé, ou impossible

Chaque tâche fait elle-même les étapes nécessaires (prendre l'objet, poser ce qu'on tient, aller jusqu'au meuble) : ne refuse jamais un ordre parce que le personnage ne tient pas encore l'objet.
Pour prendre plusieurs livres, enchaîne plusieurs « prendre » (6 livres au plus en pile).
Les objets sont désignés par leur « ref », donnée dans l'état de la pièce. N'invente aucun objet.
Si l'ordre demande une action que les tâches ne permettent pas (danser, dormir…) ou un objet absent de la pièce : d'abord « manque », puis dis-le en personnage avec « dire », puis « fini ». Fais ce qui est faisable dans l'ordre et signale seulement le reste.

Réponds UNIQUEMENT par un objet JSON, sans texte autour. Une seule tâche par réponse : tu verras son résultat et l'état de la pièce avant de choisir la suivante.`;

/** Nombre de tâches au plus pour un ordre (garde-fou). */
const MAX_STEPS = 20;

/** Premier objet JSON trouvé dans la réponse (le modèle ajoute parfois du texte ou des ```). */
export function parseJson(text: string): Record<string, unknown> | null {
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
        return obj && typeof obj === 'object' ? obj : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Traduit la réponse du modèle en tâche du jeu (null : réponse mal formée). */
function toIntent(o: Record<string, unknown>): Intent | 'fini' | 'manque' | null {
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  switch (o.tache) {
    case 'prendre': return s('objet') ? { kind: 'prendre', ref: s('objet') } : null;
    case 'poser': return { kind: 'poser', ref: s('objet') || undefined, sur: s('sur') || undefined };
    case 'aller': return s('objet') ? { kind: 'aller', ref: s('objet') } : null;
    case 'ranger': return { kind: 'ranger', refs: Array.isArray(o.livres) ? o.livres.map(String) : [] };
    case 'cafe': return { kind: 'cafe' };
    case 'boire': return { kind: 'boire', ref: s('objet') || undefined, liquide: s('liquide') === 'eau' ? 'eau' : s('liquide') === 'café' || s('liquide') === 'cafe' ? 'café' : undefined };
    case 'eau': return { kind: 'eau' };
    case 'laver': return { kind: 'laver', visage: o.visage !== false };
    case 'manger': return { kind: 'manger', ref: s('objet') || undefined };
    case 'mettre': return s('dans') ? { kind: 'mettre', ref: s('objet') || undefined, dans: s('dans') } : null;
    case 'ouvrir': return s('objet') ? { kind: 'ouvrir', ref: s('objet') } : null;
    case 'allumer': return s('objet') ? { kind: 'allumer', ref: s('objet') } : null;
    case 'eteindre': return s('objet') ? { kind: 'eteindre', ref: s('objet') } : null;
    case 'jeter': return { kind: 'jeter', ref: s('objet') || undefined };
    case 'vider': return s('objet') ? { kind: 'vider', ref: s('objet') } : null;
    case 'fermer': return s('objet') ? { kind: 'fermer', ref: s('objet') } : null;
    case 'lire': return { kind: 'lire', ref: s('objet') || undefined };
    case 'arreter_lire': return { kind: 'arreter_lire' };
    case 'asseoir': return { kind: 'asseoir', ref: s('objet') || undefined };
    case 'lever': return { kind: 'lever' };
    case 'dire': return s('texte') ? { kind: 'dire', texte: s('texte') } : null;
    case 'fini': return 'fini';
    case 'manque': return s('action') || s('raison') ? 'manque' : null;
  }
  return null;
}

/** Ce que l'IA signale comme manquant, ou une tâche qui a échoué (pour le journal des manques). */
export type OnMissing = (m: Omit<Missing, 'at' | 'ordre'>) => void;

/** Réalise l'ordre avec le modèle ; rend un message pour le joueur. `onStep(null)` : il réfléchit. */
export async function runAi(game: Game, chat: Chat, order: string, onStep: (s: Step | null) => void, signal?: AbortSignal, onMissing?: OnMissing): Promise<string> {
  const state = () => {
    const w = game.describe();
    return `État de la pièce : ${JSON.stringify({ mains: w.mains, mainsLibres: w.mainsLibres, lit: w.lit, objets: w.objets.map(({ ref, nom, ou }) => ({ ref, nom, ou })) })}`;
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Ordre du joueur : ${order}\n\n${state()}` },
  ];
  let misses = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    onStep(null);
    const reply = await chat(messages, signal);
    if (signal?.aborted) return 'Interrompu.';
    messages.push({ role: 'assistant', content: reply });
    const json = parseJson(reply);
    const intent = json && toIntent(json);
    if (!intent) {
      if (++misses > 2) throw new Error('le modèle ne répond pas dans le bon format.');
      messages.push({ role: 'user', content: 'Réponds uniquement par un objet JSON {"tache": ...} parmi les tâches possibles.' });
      continue;
    }
    misses = 0;
    if (intent === 'fini') return typeof json!.message === 'string' && json!.message ? json!.message : 'C’est fait.';
    if (intent === 'manque') {
      const str = (k: string) => (typeof json![k] === 'string' ? (json![k] as string) : '');
      const sorte = str('sorte') === 'objet' ? `objet absent du jeu${str('objet') ? ` (${str('objet')})` : ''}` : str('sorte') === 'geste' ? `geste absent${str('objet') ? ` pour ${str('objet')}` : ''}` : undefined;
      onMissing?.({ kind: 'action', quoi: str('action') || str('raison'), detail: str('raison') || str('action'), cause: sorte });
      messages.push({ role: 'user', content: 'Noté. Continue.' });
      continue;
    }
    const { ok, message } = await runIntents(game, [intent], onStep, signal);
    if (signal?.aborted) return 'Interrompu.';
    if (!ok) onMissing?.({ kind: 'echec', quoi: intentLabel(intent), detail: message });
    messages.push({ role: 'user', content: `Résultat : ${ok ? 'ok' : `échec : ${message}`}\n\n${state()}` });
  }
  return 'J’ai arrêté : trop d’étapes.';
}
