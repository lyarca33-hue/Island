/**
 * Jev : l'IA qui transforme une demande (« range tous les livres ») en suite d'actions du jeu.
 *
 * Jev (typesafe/jev-1.13 sur OpenRouter) est un modèle de décision : il n'écrit pas de texte, il
 * choisit une réponse parmi celles qu'on lui propose. À chaque étape, le jeu liste donc les
 * actions possibles (« prendre livre-vert-2 », « ranger bibliotheque », « fini »...) et Jev
 * choisit la suivante, en voyant la demande, l'état de la pièce et ce qu'il a déjà fait.
 * `Decide` peut être remplacé (autre modèle, faux Jev pour les tests).
 */
import type { Game, WorldObject } from '../game/Game';
import { perform } from './actions';

/** Choisit une option (clé de `options`) d'après l'état ; `options` : clé → description. */
export type Decide = (state: object, options: Record<string, string>, signal?: AbortSignal) => Promise<string>;

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

const QUESTION = 'Quelle est la prochaine action du personnage pour réaliser la demande du joueur ? '
  + 'Tiens compte de ce qui est déjà fait et de ce qu’il a en main. Choisis « fini » quand la demande est réalisée ou impossible.';

/** Appel à l'API Decisions d'OpenRouter : une question à choix, la réponse est une des clés. */
export function openRouterDecide({ apiKey, model }: JevSettings, sessionId?: string): Decide {
  return async (state, options, signal) => {
    const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rp Island',
      },
      body: JSON.stringify({
        model,
        state,
        questions: { action: { type: 'choice', instructions: QUESTION, criteria: options } },
        session_id: sessionId,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouter : erreur ${res.status}`);
    const choice = data?.answers?.action?.choice;
    if (typeof choice !== 'string') throw new Error('Jev n’a pas choisi d’action.');
    return choice;
  };
}

interface Option {
  name: string;
  args: Record<string, string>;
  label: string;
}

/** Actions possibles dans l'état actuel, avec leur clé (« prendre:livre ») et leur description. */
export function options(world: { enMain: string[]; objets: WorldObject[] }): Map<string, Option> {
  const out = new Map<string, Option>();
  const add = (name: string, args: Record<string, string>, label: string) => out.set([name, ...Object.values(args)].join(':'), { name, args, label });
  const held = world.objets.filter((o) => world.enMain.includes(o.ref));
  const cup = held.find((o) => o.sorte === 'récipient');
  for (const o of world.objets) {
    if (o.portable && !world.enMain.includes(o.ref)) {
      const stack = held.length && held[0].nom === o.nom ? ' et l’ajouter à la pile tenue' : '';
      add('prendre', { objet: o.ref }, `Prendre ${o.nom} « ${o.ref} » (${o.ou})${stack}`);
    }
    if (!o.portable) add('aller', { objet: o.ref }, `Marcher jusqu’à ${o.nom} « ${o.ref} »`);
    if (o.sorte === 'rangement' && held.length) add('ranger', { meuble: o.ref }, `Ranger dans ${o.nom} « ${o.ref} » ce qu’on tient (${world.enMain.join(', ')})`);
  }
  if (held.length) add('poser', {}, `Poser ce qu’on tient (${world.enMain.join(', ')}) devant soi`);
  if (cup && world.objets.some((o) => o.sorte === 'machine')) add('cafe', {}, 'Se faire un café avec la tasse tenue, à la machine à café');
  if (cup?.ou.includes('contient')) add('boire', {}, `Boire une gorgée (${cup.ou.split(', ').pop()})`);
  add('fini', {}, 'La demande du joueur est réalisée (ou impossible) : s’arrêter');
  return out;
}

/** Étape vue par l'interface : ce que Jev fait en ce moment. */
export type JevStep = { kind: 'action'; name: string; args: Record<string, string> } | { kind: 'thinking' };

/** Nombre d'actions au plus pour une demande (garde-fou). */
const MAX_STEPS = 40;

/**
 * Réalise la demande : boucle « Jev choisit une action → le jeu l'exécute → Jev voit le
 * résultat ». Rend un message pour le joueur.
 */
export async function runJev(game: Game, decide: Decide, request: string, onStep: (s: JevStep) => void, signal?: AbortSignal): Promise<string> {
  const done: string[] = [];
  let lastKey = '';
  let repeats = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    onStep({ kind: 'thinking' });
    const world = game.describe();
    const opts = options(world);
    const state = {
      demande: request,
      enMain: world.enMain,
      objets: world.objets.map(({ ref, nom, ou }) => ({ ref, nom, ou })),
      dejaFait: done,
    };
    const key = await decide(state, Object.fromEntries([...opts].map(([k, o]) => [k, o.label])), signal);
    if (signal?.aborted) return 'Interrompu.';
    const opt = opts.get(key);
    if (!opt) throw new Error(`Jev a choisi une action inconnue : ${key}`);
    if (opt.name === 'fini') return done.length ? 'C’est fait.' : 'Jev n’a rien trouvé à faire.';
    // garde-fou : Jev qui tourne en rond sur la même action
    repeats = key === lastKey ? repeats + 1 : 0;
    lastKey = key;
    if (repeats >= 2) return `J’ai arrêté : Jev répète « ${key} ».`;
    onStep({ kind: 'action', name: opt.name, args: opt.args });
    const { report } = await perform(game, opt.name, opt.args, signal);
    if (signal?.aborted) return 'Interrompu.';
    done.push(`${key} → ${report}`);
  }
  return 'J’ai arrêté : trop d’étapes.';
}
