/**
 * Tâches : ce que veut dire un ordre (« range tous les livres », « fais-toi un café »), traduit
 * en suite d'actions de base selon l'état de la pièce. Exemple : ranger les livres = les prendre
 * par piles de 6 au plus, les ranger, recommencer tant qu'il en traîne.
 */
import type { Game, WorldObject } from '../game/Game';
import { perform } from './actions';

export type Intent =
  | { kind: 'prendre'; ref: string }
  /** Poser ce qu'on tient, ou l'objet `ref` (pris d'abord si besoin), sur l'objet `sur` ou devant soi. */
  | { kind: 'poser'; ref?: string; sur?: string }
  | { kind: 'aller'; ref: string }
  /** Ranger des livres (tous ceux qui traînent si `refs` est vide) dans le meuble de rangement. */
  | { kind: 'ranger'; refs: string[]; onlyHeld?: boolean }
  | { kind: 'cafe' }
  | { kind: 'boire' }
  | { kind: 'dire'; texte: string };

/** Action de base en cours, pour l'interface. */
export interface Step {
  name: string;
  args: Record<string, string>;
}

/** Livres portés en une fois (la pile en main). */
const STACK_MAX = 6;

class Failed extends Error {}

/** Exécute les tâches l'une après l'autre ; rend si tout s'est bien passé et un message pour le joueur. */
export async function runIntents(game: Game, intents: Intent[], onStep: (s: Step) => void, signal?: AbortSignal): Promise<{ ok: boolean; message: string }> {
  const act = async (name: string, args: Record<string, string> = {}) => {
    onStep({ name, args });
    const { ok, report } = await perform(game, name, args, signal);
    if (signal?.aborted) throw new Failed('Interrompu.');
    if (!ok) throw new Failed(report.replace(/^échec( : )?/, '') || 'Impossible.');
  };
  if (!intents.length) return { ok: false, message: 'Rien à faire.' };
  try {
    for (const intent of intents) await runOne(game, intent, act);
    return { ok: true, message: 'C’est fait.' };
  } catch (e) {
    if (e instanceof Failed) return { ok: false, message: e.message };
    throw e;
  }
}

type Act = (name: string, args?: Record<string, string>) => Promise<void>;

const world = (game: Game) => game.describe();
const held = (game: Game) => {
  const w = world(game);
  return w.objets.filter((o) => w.enMain.includes(o.ref));
};
const isLoose = (o: WorldObject) => o.ou !== 'en main' && !o.ou.startsWith('rangé');

/** Mains libres, sauf si on tient déjà ce qui convient (`keep`). */
async function freeHands(game: Game, act: Act, keep?: (o: WorldObject) => boolean): Promise<void> {
  const h = held(game);
  if (h.length && !(keep && h.every(keep))) await act('poser');
}

async function runOne(game: Game, intent: Intent, act: Act): Promise<void> {
  switch (intent.kind) {
    case 'prendre': {
      const target = world(game).objets.find((o) => o.ref === intent.ref);
      // un livre s'ajoute à la pile tenue ; autre chose : on pose d'abord ce qu'on tient
      await freeHands(game, act, (o) => target?.nom === 'livre' && o.nom === 'livre');
      return act('prendre', { objet: intent.ref });
    }
    case 'poser': {
      if (intent.ref && !held(game).some((o) => o.ref === intent.ref)) {
        await freeHands(game, act);
        await act('prendre', { objet: intent.ref });
      }
      if (!held(game).length) throw new Failed('Rien en main à poser.');
      if (intent.sur) await act('aller', { objet: intent.sur });
      return act('poser');
    }
    case 'aller':
      return act('aller', { objet: intent.ref });
    case 'dire':
      return act('dire', { texte: intent.texte });
    case 'ranger': {
      const shelf = world(game).objets.find((o) => o.sorte === 'rangement');
      if (!shelf) throw new Failed('Il n’y a pas de meuble où ranger.');
      if (intent.onlyHeld) {
        if (!held(game).length) throw new Failed('Rien en main à ranger.');
        return act('ranger', { meuble: shelf.ref });
      }
      await freeHands(game, act, (o) => o.nom === 'livre');
      const wanted = (o: WorldObject) => o.nom === 'livre' && (intent.refs.length ? intent.refs.includes(o.ref) : isLoose(o));
      const w0 = world(game);
      if (!w0.enMain.length && !w0.objets.some((o) => wanted(o) && isLoose(o))) throw new Failed('Aucun livre à ranger.');
      for (let round = 0; round < 10; round++) {
        const w = world(game);
        const todo = w.objets.filter((o) => wanted(o) && isLoose(o));
        // les plus proches d'abord, jusqu'à remplir la pile
        todo.sort((a, b) => a.distance - b.distance);
        for (const book of todo.slice(0, STACK_MAX - w.enMain.length)) await act('prendre', { objet: book.ref });
        if (!held(game).length) break;
        await act('ranger', { meuble: shelf.ref });
        if (!todo.length) break;
      }
      return;
    }
    case 'cafe': {
      const cup = world(game).objets.find((o) => o.sorte === 'récipient');
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      if (!held(game).some((o) => o.ref === cup.ref)) {
        await freeHands(game, act);
        await act('prendre', { objet: cup.ref });
      }
      return act('cafe');
    }
    case 'boire': {
      const cup = world(game).objets.find((o) => o.sorte === 'récipient');
      if (!cup) throw new Failed('Il n’y a rien à boire.');
      if (!held(game).some((o) => o.ref === cup.ref)) {
        await freeHands(game, act);
        await act('prendre', { objet: cup.ref });
      }
      // tasse vide : on se fait d'abord un café
      if (!world(game).objets.find((o) => o.ref === cup.ref)!.ou.includes('contient')) await act('cafe');
      return act('boire');
    }
  }
}
