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
  /** Lire le livre `ref` (ou celui qu'on tient, sinon le plus proche). */
  | { kind: 'lire'; ref?: string }
  | { kind: 'arreter_lire' }
  | { kind: 'dire'; texte: string };

/** La tâche en quelques mots (« prendre tasse »), pour le journal des manques. */
export function intentLabel(i: Intent): string {
  const what = 'ref' in i ? i.ref : 'refs' in i ? (i.refs.length ? i.refs.join(', ') : 'livres') : '';
  const sur = i.kind === 'poser' && i.sur ? ` sur ${i.sur}` : '';
  return `${i.kind.replace('_', ' ')}${what ? ` ${what}` : ''}${sur}`;
}

/** Action de base en cours, pour l'interface. */
export interface Step {
  name: string;
  args: Record<string, string>;
}

/** Livres portés en une fois (la pile en main). */
const STACK_MAX = 6;

class Failed extends Error {}

/** Exécute les tâches l'une après l'autre ; rend si tout s'est bien passé et un message pour le joueur. */
export async function runIntents(game: Game, intents: Intent[], onStep: (s: Step) => void, signal?: AbortSignal): Promise<{ ok: boolean; message: string; failed?: Intent }> {
  const act = async (name: string, args: Record<string, string> = {}) => {
    onStep({ name, args });
    const { ok, report } = await perform(game, name, args, signal);
    if (signal?.aborted) throw new Failed('Interrompu.');
    if (!ok) throw new Failed(report.replace(/^échec( : )?/, '') || 'Impossible.');
  };
  if (!intents.length) return { ok: false, message: 'Rien à faire.' };
  let current: Intent | undefined;
  try {
    for (const intent of intents) await runOne(game, (current = intent), act);
    return { ok: true, message: 'C’est fait.' };
  } catch (e) {
    if (e instanceof Failed) return { ok: false, message: e.message, failed: current };
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

/** Pose ce qu'on tient dans la main `load` (son objet du dessous, qui la désigne). */
const dropLoad = (act: Act, load: string[]) => act('poser', { objet: load[0] });

/**
 * Fait de la place pour prendre `target` : deux objets, un par main (tasse et livre) ; une pile
 * de livres ou une caisse prend les deux mains ; un livre ne s'empile que si l'autre main est libre.
 */
async function makeRoom(game: Game, act: Act, target: WorldObject): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const w = world(game);
    if (w.enMain.includes(target.ref) || !w.mains.length) return;
    const isBook = (ref: string) => w.objets.find((o) => o.ref === ref)?.nom === 'livre';
    const books = w.mains.find((l) => l.every(isBook));
    const others = w.mains.filter((l) => l !== books);
    if (target.nom === 'livre' && books) {
      // empiler : l'autre main doit être libre
      if (!others.length) return;
      await dropLoad(act, others[others.length - 1]);
    } else if (target.deuxMains) {
      await dropLoad(act, w.mains[w.mains.length - 1]);
    } else if (w.mainsLibres > 0) return;
    // mains prises : on pose d'abord ce qui n'est pas un livre, sinon la pile
    else await dropLoad(act, others[others.length - 1] ?? w.mains[0]);
  }
}

/** Mains libres, sauf ce qui vérifie `keep`. */
async function freeHands(game: Game, act: Act, keep: (ref: string) => boolean = () => false): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const load = world(game).mains.find((l) => !l.every(keep));
    if (!load) return;
    await dropLoad(act, load);
  }
}

/** Prend `ref` (place faite d'abord) s'il n'est pas déjà en main. */
async function take(game: Game, act: Act, ref: string): Promise<void> {
  const target = world(game).objets.find((o) => o.ref === ref);
  if (!target) throw new Failed(`Aucun objet « ${ref} ».`);
  if (world(game).enMain.includes(ref)) return;
  await makeRoom(game, act, target);
  await act('prendre', { objet: ref });
}

async function runOne(game: Game, intent: Intent, act: Act): Promise<void> {
  switch (intent.kind) {
    case 'prendre':
      if (world(game).enMain.includes(intent.ref)) return;
      return take(game, act, intent.ref);
    case 'poser': {
      if (intent.ref) await take(game, act, intent.ref);
      if (!held(game).length) throw new Failed('Rien en main à poser.');
      if (intent.sur) await act('aller', { objet: intent.sur });
      // l'objet demandé : la main qui le tient (pile comprise)
      const load = intent.ref ? world(game).mains.find((l) => l.includes(intent.ref!)) : undefined;
      return act('poser', load ? { objet: load[0] } : {});
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
      // les livres seulement : une pile prend les deux mains
      await freeHands(game, act, (ref) => world(game).objets.find((o) => o.ref === ref)?.nom === 'livre');
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
      await take(game, act, cup.ref);
      return act('cafe');
    }
    case 'boire': {
      const cup = world(game).objets.find((o) => o.sorte === 'récipient');
      if (!cup) throw new Failed('Il n’y a rien à boire.');
      await take(game, act, cup.ref);
      // tasse vide : on se fait d'abord un café
      if (!world(game).objets.find((o) => o.ref === cup.ref)!.ou.includes('contient')) await act('cafe');
      return act('boire');
    }
    case 'lire': {
      const w = world(game);
      if (w.lit && (!intent.ref || intent.ref === w.lit)) return;
      const books = w.objets.filter((o) => o.nom === 'livre');
      // le livre demandé, sinon celui qu'on tient, sinon un qui traîne, sinon un de la bibliothèque
      const book = intent.ref
        ? books.find((o) => o.ref === intent.ref)
        : (books.find((o) => w.enMain.includes(o.ref)) ?? [...books].sort((a, b) => +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0]);
      if (!book) throw new Failed('Il n’y a pas de livre à lire.');
      // un seul livre en main, l'autre main libre
      await freeHands(game, act, (ref) => ref === book.ref && world(game).mains.find((l) => l.includes(ref))!.length === 1);
      await take(game, act, book.ref);
      return act('lire');
    }
    case 'arreter_lire':
      if (!world(game).lit) return;
      return act('arreter_lire');
  }
}
