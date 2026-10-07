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
  /** Mettre l'objet `ref` (ou ce qu'on tient) dans le meuble `dans` (frigo, placard, four…). */
  | { kind: 'mettre'; ref?: string; dans: string }
  /** Mettre en marche l'appareil `ref` (four, micro-ondes, lave-vaisselle), ou l'arrêter. */
  | { kind: 'allumer'; ref: string }
  | { kind: 'eteindre'; ref: string }
  /** Jeter à la poubelle l'objet `ref` (pris d'abord si besoin), sinon ce qu'on tient. */
  | { kind: 'jeter'; ref?: string }
  /** Vider la poubelle `ref`. */
  | { kind: 'vider'; ref: string }
  | { kind: 'cafe' }
  /**
   * Boire dans le récipient `ref` (bouteille d'eau), sinon dans ce qu'on tient, sinon dans la
   * tasse ; vide, la tasse est d'abord remplie de `liquide` (café par défaut).
   */
  | { kind: 'boire'; ref?: string; liquide?: 'eau' | 'café' }
  /** Manger l'aliment `ref` en entier (sinon celui qu'on tient, sinon le plus proche). */
  | { kind: 'manger'; ref?: string }
  | { kind: 'ouvrir'; ref: string }
  | { kind: 'fermer'; ref: string }
  /** Remplir la tasse d'eau à l'évier. */
  | { kind: 'eau' }
  /** Se laver à l'évier : les mains, ou aussi le visage (toilette). */
  | { kind: 'laver'; visage: boolean }
  /** Lire le livre `ref` (ou celui qu'on tient, sinon le plus proche). */
  | { kind: 'lire'; ref?: string }
  | { kind: 'arreter_lire' }
  | { kind: 'dire'; texte: string }
  /** S'asseoir sur le siège `ref` (sinon le plus proche). */
  | { kind: 'asseoir'; ref?: string }
  | { kind: 'lever' };

/** La tâche en quelques mots (« prendre tasse »), pour le journal des manques. */
export function intentLabel(i: Intent): string {
  const what = 'ref' in i ? i.ref : 'refs' in i ? (i.refs.length ? i.refs.join(', ') : 'livres') : '';
  const sur = i.kind === 'poser' && i.sur ? ` sur ${i.sur}` : '';
  if (i.kind === 'laver') return i.visage ? 'se laver' : 'se laver les mains';
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
/** La tasse est sale : on la rince d'abord à l'évier (sinon pas de café). */
const isDirty = (game: Game, ref: string) => !!world(game).objets.find((o) => o.ref === ref)?.ou.includes(', sale');

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
      const cup = world(game).objets.find((o) => o.nom === 'tasse');
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      if (isDirty(game, cup.ref)) await act('eau');
      return act('cafe');
    }
    case 'boire': {
      const w = world(game);
      const full = (o: WorldObject) => o.ou.includes('contient');
      const drinks = w.objets.filter((o) => o.sorte === 'récipient');
      // le récipient demandé, sinon un récipient plein qu'on tient, sinon la tasse (café)
      const cup = intent.ref ? drinks.find((o) => o.ref === intent.ref) : ((!intent.liquide ? drinks.find((o) => w.enMain.includes(o.ref) && full(o)) : undefined) ?? drinks.find((o) => o.nom === 'tasse'));
      if (!cup) throw new Failed('Il n’y a rien à boire.');
      await take(game, act, cup.ref);
      const ou = world(game).objets.find((o) => o.ref === cup.ref)!.ou;
      if (cup.nom !== 'tasse') {
        // une bouteille vide, c'est fini
        if (!ou.includes('contient')) throw new Failed(`${cup.nom} est vide.`);
      }
      // tasse vide : on la remplit d'abord (café par défaut) ; « bois de l'eau » avec du café dedans : on la remplit d'eau
      else if (isDirty(game, cup.ref)) {
        await act('eau');
        await act(intent.liquide === 'eau' ? 'eau' : 'cafe');
      } else if (intent.liquide === 'eau' && !ou.includes('contient de l’eau')) await act('eau');
      else if (!ou.includes('contient')) await act(intent.liquide === 'eau' ? 'eau' : 'cafe');
      return act('boire');
    }
    case 'manger': {
      const w = world(game);
      const foods = w.objets.filter((o) => o.sorte === 'nourriture');
      const food = intent.ref
        ? foods.find((o) => o.ref === intent.ref)
        : (foods.find((o) => w.enMain.includes(o.ref)) ?? [...foods].sort((a, b) => +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0]);
      if (!food) throw new Failed('Il n’y a rien à manger.');
      await take(game, act, food.ref);
      // bouchée après bouchée jusqu'à la fin (l'aliment disparaît)
      for (let i = 0; i < 12 && world(game).enMain.includes(food.ref); i++) await act('manger');
      return;
    }
    case 'mettre':
      if (intent.ref) await take(game, act, intent.ref);
      if (!held(game).length) throw new Failed('Rien en main à ranger.');
      return act('ranger', intent.ref ? { meuble: intent.dans, objet: intent.ref } : { meuble: intent.dans });
    case 'allumer':
      return act('allumer', { objet: intent.ref });
    case 'eteindre':
      return act('eteindre', { objet: intent.ref });
    case 'jeter': {
      if (intent.ref) await take(game, act, intent.ref);
      const load = intent.ref ? world(game).mains.find((l) => l.includes(intent.ref!)) : undefined;
      if (!held(game).length) throw new Failed('Rien en main à jeter.');
      return act('jeter', load ? { objet: load[0] } : {});
    }
    case 'vider':
      return act('vider_poubelle', { objet: intent.ref });
    case 'ouvrir':
      return act('ouvrir', { objet: intent.ref });
    case 'fermer':
      return act('fermer', { objet: intent.ref });
    case 'eau': {
      const cup = world(game).objets.find((o) => o.nom === 'tasse');
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      // sale : rincée d'abord, puis remplie
      if (isDirty(game, cup.ref)) await act('eau');
      return act('eau');
    }
    case 'laver':
      // les mains doivent être libres
      await freeHands(game, act);
      return act(intent.visage ? 'se_laver' : 'laver_mains');
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
    case 'asseoir': {
      const seat = intent.ref ?? world(game).objets.filter((o) => o.sorte === 'siège' && !world(game).enMain.includes(o.ref)).sort((a, b) => a.distance - b.distance)[0]?.ref;
      if (!seat) throw new Failed('Il n’y a pas de siège.');
      // ce qu'on porte à deux mains (caisse, pile, la chaise elle-même) se pose d'abord
      const w = world(game);
      const big = w.mains.find((l) => l.length > 1 || w.objets.find((o) => o.ref === l[0])?.deuxMains);
      if (big) await dropLoad(act, big);
      return act('asseoir', { siege: seat });
    }
    case 'lever':
      if (!world(game).perso.includes('assis')) return;
      return act('lever');
    case 'arreter_lire':
      if (!world(game).lit) return;
      return act('arreter_lire');
  }
}
