/**
 * Tâches : ce que veut dire un ordre (« range tous les livres », « fais-toi un café »), traduit
 * en suite d'actions de base selon l'état de la pièce. Exemple : ranger les livres = les prendre
 * par piles de 6 au plus, les ranger, recommencer tant qu'il en traîne.
 */
import type { Game, WorldObject } from '../game/Game';
import { DISHES, RECIPE_BY_DISH } from '../game/items/recipes';
import { ITEMS } from '../game/items/catalog';
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
  /** Jeter à la poubelle l'objet `ref` (pris d'abord si besoin), sinon ce qu'on tient. */
  | { kind: 'jeter'; ref?: string }
  /** Vider la poubelle `ref`. */
  | { kind: 'vider'; ref: string }
  | { kind: 'cafe' }
  | { kind: 'the' }
  /**
   * Boire dans le récipient `ref` (bouteille d'eau), sinon dans ce qu'on tient, sinon dans la
   * tasse ; vide, la tasse est d'abord remplie de `liquide` (café par défaut).
   */
  | { kind: 'boire'; ref?: string; liquide?: 'eau' | 'café' | 'thé' }
  /** Manger l'aliment `ref` en entier (sinon celui qu'on tient, sinon le plus proche). */
  | { kind: 'manger'; ref?: string }
  /** Couper en morceaux l'aliment `ref` (sinon celui qu'on tient, sinon le plus proche) sur la planche. */
  | { kind: 'couper'; ref?: string }
  /**
   * Préparer le plat `plat` (id d'une recette) : couper et cuire ce qu'il faut, puis réunir les
   * ingrédients sur la planche (ou dans l'assiette). Sans `plat` : le plat que permettent les
   * ingrédients déjà réunis.
   */
  | { kind: 'preparer'; plat?: string }
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
  /** S'asseoir à table, devant l'assiette. */
  | { kind: 'attabler' }
  /** Servir l'aliment `ref` (sinon celui qu'on tient, sinon le plus proche) dans l'assiette `sur`. */
  | { kind: 'servir'; ref?: string; sur?: string }
  /**
   * Un repas à table : servir l'aliment `ref` (ou un autre) dans l'assiette si elle est vide,
   * prendre la fourchette, s'asseoir devant et manger tout le plat.
   */
  | { kind: 'repas'; ref?: string }
  /** Laver à l'évier ces pièces de vaisselle (toute la vaisselle sale si `refs` est vide). */
  | { kind: 'vaisselle'; refs: string[] }
  | { kind: 'lever' }
  /**
   * Faire cuire l'ingrédient `ref` (sinon celui qu'on tient, sinon le plus proche) : ustensile
   * (rempli d'eau pour la casserole) sur le feu, ingrédient dedans, feu allumé, puis éteint une fois cuit.
   */
  | { kind: 'cuire'; ref?: string }
  /** Allumer ou éteindre un appareil (la gazinière la plus proche sans `ref`). */
  | { kind: 'allumer'; ref?: string }
  | { kind: 'eteindre'; ref?: string };

/** La tâche en quelques mots (« prendre tasse »), pour le journal des manques. */
export function intentLabel(i: Intent): string {
  const what = 'ref' in i ? i.ref : 'refs' in i ? (i.refs.length ? i.refs.join(', ') : 'livres') : '';
  const sur = i.kind === 'poser' && i.sur ? ` sur ${i.sur}` : '';
  if (i.kind === 'laver') return i.visage ? 'se laver' : 'se laver les mains';
  if (i.kind === 'vaisselle') return `faire la vaisselle${i.refs.length ? ` ${i.refs.join(', ')}` : ''}`;
  if (i.kind === 'repas') return `manger à table${i.ref ? ` ${i.ref}` : ''}`;
  if (i.kind === 'preparer') return `préparer${i.plat ? ` ${i.plat}` : ' un plat'}`;
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
/** L'aliment entier qui, coupé, donne ces morceaux (« tranches de tomate » → « tomate »). */
const WHOLE_OF = new Map(ITEMS.filter((d) => d.cut).map((d) => [ITEMS.find((p) => p.id === d.cut)?.name ?? '', d.name]));
/** La tasse est sale : on la lave d'abord à l'évier (sinon pas de café). */
/** L'action qui remplit la tasse de `liquide` (café par défaut). */
const fillWith = (liquide?: string) => (liquide === 'eau' ? 'eau' : liquide === 'thé' ? 'the' : 'cafe');
const isDirty = (game: Game, ref: string) => !!world(game).objets.find((o) => o.ref === ref)?.ou.includes(', sale');
/** L'aliment servi dans l'assiette `plate` (« posé sur assiette »), ou undefined. */
const servedOn = (w: ReturnType<typeof world>, plate: string) => w.objets.find((o) => o.sorte === 'nourriture' && o.ou.split(',')[0] === `posé sur ${plate}`);
/** L'aliment `ref`, sinon celui qu'on tient, sinon un qui traîne (hors assiette), sinon le plus proche (frigo). */
function pickFood(w: ReturnType<typeof world>, ref?: string): WorldObject | undefined {
  const all = w.objets.filter((o) => o.sorte === 'nourriture');
  if (ref) return all.find((o) => o.ref === ref);
  // pas d'ingrédient cru (steak, pomme de terre) : il faut d'abord le faire cuire
  const foods = all.filter((o) => o.cuisson !== 'cru');
  const onPlate = (o: WorldObject) => o.ou.startsWith('posé sur assiette');
  return foods.find((o) => w.enMain.includes(o.ref)) ?? [...foods].filter((o) => !onPlate(o)).sort((a, b) => +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0];
}

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
      if (isDirty(game, cup.ref)) await act('vaisselle');
      return act('cafe');
    }
    case 'the': {
      const cup = world(game).objets.find((o) => o.nom === 'tasse');
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      if (isDirty(game, cup.ref)) await act('vaisselle');
      return act('the');
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
        await act('vaisselle');
        await act(fillWith(intent.liquide));
      } else if (intent.liquide === 'eau' && !ou.includes('contient de l’eau')) await act('eau');
      else if (intent.liquide === 'thé' && !ou.includes('contient du thé')) await act('the');
      else if (!ou.includes('contient')) await act(fillWith(intent.liquide));
      return act('boire');
    }
    case 'manger': {
      const w = world(game);
      const foods = w.objets.filter((o) => o.sorte === 'nourriture');
      // ce qui se mange tel quel (ou déjà cuit) d'abord
      const raw = (o: WorldObject) => +(o.cuisson === 'cru');
      const food = intent.ref
        ? foods.find((o) => o.ref === intent.ref)
        : (foods.find((o) => w.enMain.includes(o.ref) && !raw(o)) ?? [...foods].sort((a, b) => raw(a) - raw(b) || +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0]);
      if (!food) throw new Failed('Il n’y a rien à manger.');
      // cru : on le fait cuire d'abord
      if (food.cuisson === 'cru') await runOne(game, { kind: 'cuire', ref: food.ref }, act);
      await take(game, act, food.ref);
      // bouchée après bouchée jusqu'à la fin (l'aliment disparaît)
      for (let i = 0; i < 12 && world(game).enMain.includes(food.ref); i++) await act('manger');
      return;
    }
    case 'couper': {
      const w = world(game);
      const foods = w.objets.filter((o) => o.coupable);
      const food = intent.ref
        ? foods.find((o) => o.ref === intent.ref)
        : (foods.find((o) => w.enMain.includes(o.ref)) ?? [...foods].sort((a, b) => +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0]);
      if (!food) throw new Failed(intent.ref ? `On ne peut pas couper : ${intent.ref}.` : 'Il n’y a rien à couper.');
      await take(game, act, food.ref);
      return act('couper', { objet: food.ref });
    }
    case 'preparer': {
      const recipe = intent.plat ? RECIPE_BY_DISH.get(intent.plat) : undefined;
      if (!recipe) return act('preparer');
      const dishName = DISHES.find((d) => d.id === recipe.dish)?.name ?? recipe.dish;
      const usable = (o: WorldObject, name: string) => o.nom === name && o.cuisson !== 'cru' && !o.ou.includes('entamé');
      // chaque ingrédient : déjà là, sinon coupé dans l'aliment entier, sinon cuit ; les extras
      // seulement s'il y a de quoi les couper
      for (const name of [...recipe.needs, ...(recipe.extras ?? [])]) {
        const needed = recipe.needs.includes(name);
        const w = world(game);
        if (w.objets.some((o) => usable(o, name))) continue;
        const whole = WHOLE_OF.get(name);
        const toCut = whole && w.objets.filter((o) => o.nom === whole && o.coupable).sort((a, b) => +!isLoose(a) - +!isLoose(b) || a.distance - b.distance)[0];
        if (toCut) {
          await runOne(game, { kind: 'couper', ref: toCut.ref }, act);
          continue;
        }
        const raw = w.objets.find((o) => o.nom === name && o.cuisson === 'cru');
        if (raw && needed) {
          await runOne(game, { kind: 'cuire', ref: raw.ref }, act);
          continue;
        }
        if (needed) throw new Failed(`Pour ${dishName}, il manque : ${name}${whole ? ` (ou ${whole})` : ''}.`);
      }
      // ce qui n'est pas déjà sur la planche ou dans l'assiette (le steak dans la poêle) : en main
      // (posé sur la planche, ou sur d'autres morceaux posés dessus ; pas sur un meuble)
      const onBase = (o: WorldObject) => o.ou.startsWith('posé sur') && !/^posé sur (plan-de-travail|table)/.test(o.ou);
      const loose = recipe.needs
        .map((name) => world(game).objets.filter((o) => usable(o, name)).sort((a, b) => +!onBase(a) - +!onBase(b) || a.distance - b.distance)[0])
        .filter((o): o is WorldObject => !!o && !onBase(o) && !world(game).enMain.includes(o.ref));
      for (const o of loose.slice(0, 2)) await take(game, act, o.ref);
      return act('preparer', { plat: recipe.dish });
    }
    case 'mettre': {
      if (intent.ref) await take(game, act, intent.ref);
      if (!held(game).length) throw new Failed('Rien en main à ranger.');
      // « mets la poêle sur le feu », « mets le steak dans la poêle »
      const into = world(game).objets.find((o) => o.ref === intent.dans)?.sorte;
      if (into === 'gazinière') return act('mettre_sur_feu', { objet: intent.dans });
      if (into === 'ustensile') return act('mettre_dans', { ustensile: intent.dans });
      return act('ranger', intent.ref ? { meuble: intent.dans, objet: intent.ref } : { meuble: intent.dans });
    }
    case 'cuire': {
      const w = world(game);
      const foods = w.objets.filter((o) => o.cuisson);
      const food = intent.ref
        ? foods.find((o) => o.ref === intent.ref)
        : (foods.find((o) => w.enMain.includes(o.ref) && o.cuisson === 'cru') ?? foods.filter((o) => o.cuisson === 'cru').sort((a, b) => a.distance - b.distance)[0]);
      if (!food) throw new Failed('Il n’y a rien à faire cuire.');
      if (food.cuisson !== 'cru') return;
      let plan = game.cookPlan(food.ref);
      if (!plan) throw new Failed(`Pas d’ustensile pour faire cuire : ${food.nom}.`);
      if (!plan.gaziniere) throw new Failed('Il n’y a pas de gazinière.');
      // la casserole : de l'eau d'abord, à l'évier
      if (!plan.dedans && plan.eau) {
        await take(game, act, plan.ustensile);
        await act('eau');
        plan = game.cookPlan(food.ref)!;
      }
      if (!plan.surLeFeu) {
        await take(game, act, plan.ustensile);
        await act('mettre_sur_feu', { objet: plan.gaziniere! });
      }
      if (!plan.dedans) {
        await take(game, act, food.ref);
        await act('mettre_dans', { ustensile: plan.ustensile });
      }
      await act('allumer', { objet: plan.gaziniere!, ustensile: plan.ustensile });
      await act('attendre_cuisson', { objet: food.ref });
      return act('eteindre', { objet: plan.gaziniere!, ustensile: plan.ustensile });
    }
    case 'allumer':
    case 'eteindre': {
      const ref = intent.ref ?? world(game).objets.filter((o) => o.sorte === 'gazinière').sort((a, b) => a.distance - b.distance)[0]?.ref;
      if (!ref) throw new Failed('Il n’y a pas de gazinière.');
      return act(intent.kind, { objet: ref });
    }
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
      // sale : lavée d'abord, puis remplie
      if (isDirty(game, cup.ref)) await act('vaisselle');
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
    case 'attabler':
      return act('attabler');
    case 'servir': {
      const food = pickFood(world(game), intent.ref);
      if (!food) throw new Failed('Il n’y a rien à servir.');
      await take(game, act, food.ref);
      return act('servir', intent.sur ? { assiette: intent.sur } : {});
    }
    case 'repas': {
      let w = world(game);
      const plates = w.objets.filter((o) => o.nom === 'assiette');
      // l'assiette déjà servie, sinon une propre et posée
      let plate = plates.find((p) => servedOn(w, p.ref) && (!intent.ref || servedOn(w, p.ref)!.ref === intent.ref));
      if (!plate) {
        plate = plates.filter((p) => !p.ou.includes('sale') && !servedOn(w, p.ref)).sort((a, b) => +w.enMain.includes(a.ref) - +w.enMain.includes(b.ref) || a.distance - b.distance)[0];
        if (!plate) throw new Failed(plates.length ? 'L’assiette est sale : fais d’abord la vaisselle.' : 'Il n’y a pas d’assiette.');
        if (w.enMain.includes(plate.ref)) throw new Failed('Pose d’abord l’assiette sur la table.');
        const food = pickFood(w, intent.ref);
        if (!food) throw new Failed('Il n’y a rien à manger.');
        await take(game, act, food.ref);
        await act('servir', { assiette: plate.ref });
        w = world(game);
      }
      const dish = servedOn(w, plate.ref);
      if (!dish) throw new Failed('Le plat n’est pas dans l’assiette.');
      // la fourchette en main (une propre de préférence), rien de gros dans l'autre
      const forks = w.objets.filter((o) => o.nom === 'fourchette').sort((a, b) => +a.ou.includes('sale') - +b.ou.includes('sale') || a.distance - b.distance);
      const fork = forks.find((o) => w.enMain.includes(o.ref)) ?? forks[0];
      if (!fork) throw new Failed('Il n’y a pas de fourchette.');
      await freeHands(game, act, (ref) => ref === fork.ref || world(game).objets.find((o) => o.ref === ref)?.nom === 'couteau de table');
      await take(game, act, fork.ref);
      await act('attabler', { assiette: plate.ref });
      // bouchée après bouchée jusqu'à la fin du plat
      for (let i = 0; i < 12 && world(game).objets.some((o) => o.ref === dish.ref); i++) await act('manger');
      return;
    }
    case 'vaisselle': {
      const dirty = () => world(game).objets.filter((o) => o.ou.includes(', sale') && (!intent.refs.length || intent.refs.includes(o.ref)));
      if (!dirty().length) throw new Failed(intent.refs.length ? 'C’est déjà propre.' : 'La vaisselle est déjà propre.');
      // deux pièces par voyage, une par main
      for (let round = 0; round < 8 && dirty().length; round++) {
        const todo = dirty().sort((a, b) => +!world(game).enMain.includes(a.ref) - +!world(game).enMain.includes(b.ref) || a.distance - b.distance);
        await freeHands(game, act, (ref) => todo.some((o) => o.ref === ref));
        for (const d of todo.slice(0, 2)) {
          const w = world(game);
          if (!w.enMain.includes(d.ref) && w.mainsLibres > 0) await act('prendre', { objet: d.ref });
        }
        await act('vaisselle');
      }
      return;
    }
    case 'lever':
      if (!world(game).perso.includes('assis')) return;
      return act('lever');
    case 'arreter_lire':
      if (!world(game).lit) return;
      return act('arreter_lire');
  }
}
