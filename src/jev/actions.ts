/**
 * Actions du jeu que Jev peut enchaîner. Chacune lance un geste du perso (comme un clic du
 * joueur) ; perform() attend qu'il soit fini et rend un compte rendu lisible par l'IA.
 */
import type { Game } from '../game/Game';

export interface ActionDef {
  name: string;
  /** Ce que fait l'action (montré à Jev). */
  description: string;
  /** Paramètres attendus : nom → description. */
  params: Record<string, string>;
  run(game: Game, args: Record<string, string>): boolean;
}

export const ACTIONS: ActionDef[] = [
  {
    name: 'prendre',
    description: 'Aller prendre un objet portable. Si on tient déjà un livre, un autre livre vient s’ajouter à la pile (6 au plus). Un livre rangé se prend aussi.',
    params: { objet: 'ref de l’objet' },
    run: (g, a) => g.use(a.objet),
  },
  {
    name: 'ranger',
    description: 'Aller ranger dans un meuble de rangement (bibliothèque) tous les livres tenus, un par un.',
    params: { meuble: 'ref du meuble' },
    run: (g, a) => {
      if (!g.describe().enMain.length) {
        g.onNotice?.('Il faut d’abord tenir des livres.');
        return false;
      }
      return g.use(a.meuble);
    },
  },
  {
    name: 'poser',
    description: 'Poser ce qu’on tient devant soi (sur le meuble qui s’y trouve, sinon par terre).',
    params: {},
    run: (g) => g.drop(),
  },
  {
    name: 'aller',
    description: 'Marcher jusqu’à un objet ou un meuble.',
    params: { objet: 'ref de l’objet' },
    run: (g, a) => g.walkTo(a.objet),
  },
  {
    name: 'cafe',
    description: 'Se faire un café : il faut tenir la tasse ; le perso la pose sous la machine puis la reprend pleine.',
    params: {},
    run: (g) => g.makeCoffee(),
  },
  {
    name: 'boire',
    description: 'Boire une gorgée de ce que contient la tasse tenue (il faut qu’elle soit pleine).',
    params: {},
    run: (g) => g.drink(),
  },
  {
    name: 'dire',
    description: 'Le perso dit une phrase (bulle au-dessus de sa tête).',
    params: { texte: 'la phrase' },
    run: (g, a) => {
      g.say(a.texte ?? '');
      return true;
    },
  },
];

export const ACTION_BY_NAME = new Map(ACTIONS.map((a) => [a.name, a]));

/** Durée maximale d'une action, en images (40 s à 60 i/s) : au-delà, on rend la main à Jev. */
const MAX_FRAMES = 2400;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Lance l'action, attend la fin du geste et rend « ok » ou « échec », avec les messages du jeu. */
export async function perform(game: Game, name: string, args: Record<string, string>, signal?: AbortSignal): Promise<{ ok: boolean; report: string }> {
  const def = ACTION_BY_NAME.get(name);
  if (!def) return { ok: false, report: `échec : action inconnue « ${name} »` };
  for (const p of Object.keys(def.params)) {
    if (!args[p]) return { ok: false, report: `échec : paramètre « ${p} » manquant` };
  }
  // les messages du jeu (« les mains sont prises »...) servent de compte rendu
  const notices: string[] = [];
  const show = game.onNotice;
  game.onNotice = (t) => {
    notices.push(t);
    show?.(t);
  };
  try {
    const started = def.run(game, args);
    if (!started) return { ok: false, report: `échec${notices.length ? ` : ${notices.join(' ')}` : ''}` };
    // fini quand plus rien ne bouge pendant quelques images d'affilée
    let calm = 0;
    let frames = 0;
    while (calm < 3) {
      await nextFrame();
      if (signal?.aborted) return { ok: false, report: 'interrompu' };
      calm = game.idle ? calm + 1 : 0;
      if (++frames > MAX_FRAMES) return { ok: false, report: 'échec : trop long, action abandonnée' };
    }
    return { ok: true, report: `ok${notices.length ? ` (${notices.join(' ')})` : ''}` };
  } finally {
    game.onNotice = show;
  }
}
