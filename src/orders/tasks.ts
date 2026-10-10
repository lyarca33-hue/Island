/**
 * Tâches : ce que veut dire un ordre (« range tous les livres », « fais-toi un café »), traduit
 * en suite d'actions de base selon l'état de la pièce. Exemple : ranger les livres = les prendre
 * par piles de 6 au plus, les ranger, recommencer tant qu'il en traîne.
 */
import type { Game, WorldObject } from '../game/Game';
import { CONDIMENTS } from '../game/items/condiments';
import { DISHES, RECIPE_BY_DISH } from '../game/items/recipes';
import { ITEMS } from '../game/items/catalog';
import { DIRTY } from '../game/salissure';
import { perform } from './actions';

export type Intent =
  | { kind: 'prendre'; ref: string }
  /** Poser ce qu'on tient, ou l'objet `ref` (pris d'abord si besoin), sur l'objet `sur` ou devant soi. */
  | { kind: 'poser'; ref?: string; sur?: string; libre?: boolean }
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
  /** Un thé : sachet dans la tasse (ou la théière `dans`), eau chaude de la bouilloire, infusion. */
  | { kind: 'the'; dans?: string }
  /** Mettre un sachet de thé dans la tasse ou la théière `ref`. */
  | { kind: 'sachet'; ref?: string }
  /** Le petit-déjeuner : café, tartines de confiture, jus d'orange, à table. */
  | { kind: 'petit_dej' }
  | { kind: 'jus' }
  /**
   * Boire dans le récipient `ref` (bouteille d'eau), sinon dans ce qu'on tient, sinon dans la
   * tasse ; vide, la tasse est d'abord remplie de `liquide` (café par défaut).
   */
  | { kind: 'boire'; ref?: string; liquide?: 'eau' | 'café' | 'thé' | 'jus de fruits' }
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
  /** Remplir d'eau à l'évier le récipient `ref` (sinon la tasse). */
  | { kind: 'eau'; ref?: string }
  /** Verser le récipient `ref` (sinon celui qu'on tient) dans `dans` (sinon le plus proche qui peut le recevoir). */
  | { kind: 'verser'; ref?: string; dans?: string }
  /** Vider dans l'évier le récipient `ref` (sinon celui qu'on tient). */
  | { kind: 'vider_recipient'; ref?: string }
  /** Remplir d'eau la bouilloire `ref` : un récipient d'eau (rempli à l'évier s'il le faut), versé dedans. */
  | { kind: 'remplir_bouilloire'; ref: string }
  /** Ouvrir ou fermer le robinet de l'évier (ou du lavabo `ref`). */
  | { kind: 'robinet'; ouvrir: boolean; ref?: string }
  /** Boucher l'évier ou enlever le bouchon. */
  | { kind: 'bouchon'; mettre: boolean }
  | { kind: 'boire_robinet' }
  /** Lave-vaisselle : charger la vaisselle sale, mettre une pastille, le vider et tout ranger. */
  | { kind: 'charger_lv' }
  | { kind: 'pastille' }
  | { kind: 'vider_lv' }
  /** Ranger la chaise `ref` sous la table (`sous`) ou la tirer. */
  | { kind: 'chaise'; ref: string; sous: boolean }
  /** Essuyer les miettes de la table `ref` avec l'éponge. */
  | { kind: 'essuyer'; ref?: string }
  /** Empiler les assiettes ; essuyer les flaques par terre. */
  | { kind: 'empiler' }
  | { kind: 'essuyer_sol' }
  /** L'entretien : balai, serpillière, spray et éponge, gants, poubelle au conteneur, sac neuf, horloge. */
  | { kind: 'balayer'; piece?: string }
  | { kind: 'serpillere'; piece?: string }
  | { kind: 'nettoyer'; ref?: string }
  /** Le ménage des zones salies : l'aspirateur, la poussière, les vitres (et le miroir), dans la pièce `piece` ou sur le meuble `ref`. */
  | { kind: 'aspirateur'; piece?: string; ref?: string }
  | { kind: 'poussiere'; piece?: string; ref?: string }
  | { kind: 'vitres'; piece?: string; ref?: string }
  /** Tout le ménage : chaque zone sale de la pièce `piece` (celle du perso si `ici`, sinon toute la maison), avec le bon geste. */
  | { kind: 'menage'; piece?: string; ici?: boolean }
  | { kind: 'gants'; mettre: boolean }
  | { kind: 'sortir_poubelle' }
  | { kind: 'sac_neuf'; ref?: string }
  | { kind: 'heure' }
  /** Essuyer au torchon ces pièces de vaisselle mouillées (toutes si `refs` est vide) ; s'essuyer les mains. */
  | { kind: 'essuyer_vaisselle'; refs: string[] }
  | { kind: 'essuyer_mains' }
  /** Commander ce qui manque (le sac arrive à la porte) ; ranger le sac de courses ; lire la liste. */
  | { kind: 'courses' }
  | { kind: 'ranger_courses' }
  | { kind: 'liste_courses' }
  /** Mettre le couvert devant la chaise ; débarrasser la table. */
  | { kind: 'mettre_table' }
  | { kind: 'debarrasser' }
  /** Couper dans l'assiette servie avec le couteau de table (assis à table). */
  | { kind: 'couper_assiette' }
  /** Regarder ce que contient le meuble `ref`. */
  | { kind: 'regarder'; ref: string }
  /** Ranger à sa place l'objet `ref` (pris d'abord si besoin), sinon ce qu'on tient. */
  | { kind: 'ranger_place'; ref?: string }
  /** Ranger une pièce (celle du perso si omise) : chaque objet à sa place, la vaisselle sale à l'évier. */
  | { kind: 'ranger_piece'; piece?: string }
  /** Ouvrir le meuble `ref` et laisser la porte ouverte. */
  | { kind: 'laisser_ouvert'; ref: string }
  /** Mettre des glaçons (bac pris au congélateur si besoin) dans la tasse `dans` (sinon la tasse). */
  | { kind: 'glacons'; dans?: string }
  /** Se laver à l'évier : les mains, ou aussi le visage (toilette). */
  | { kind: 'laver'; visage: boolean }
  /** Prendre une douche ; se sécher avec la serviette. */
  | { kind: 'douche' }
  | { kind: 'secher' }
  /** Aller aux toilettes (s'asseoir, se soulager, tirer la chasse) ; tirer la chasse. */
  | { kind: 'toilettes' }
  | { kind: 'chasse' }
  /** Aller dormir dans le lit `ref` ; se réveiller ; faire le lit `ref`. */
  | { kind: 'dormir'; ref?: string }
  | { kind: 'reveiller' }
  | { kind: 'faire_lit'; ref?: string }
  /** Fermer à clé (`fermer`) ou déverrouiller la porte de la salle de bain. */
  | { kind: 'verrou'; fermer: boolean }
  /** Le réveil : le régler à `heure` (h, 7.5 = 7 h 30), le couper, arrêter sa sonnerie, en changer. */
  | { kind: 'reveil'; heure?: number; couper?: boolean; arreter?: boolean; sonnerie?: string }
  /** Aller dans la pièce `piece` (la cuisine). */
  | { kind: 'piece'; piece: string }
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
   * Un repas à table : servir l'aliment `ref` (ou un autre) dans l'assiette (ou le bol `dans`) si
   * elle est vide, prendre la fourchette (la cuillère pour le bol), s'asseoir devant et manger tout le plat.
   */
  | { kind: 'repas'; ref?: string; dans?: string }
  /** Laver à l'évier ces pièces de vaisselle (toute la vaisselle sale si `refs` est vide). */
  | { kind: 'vaisselle'; refs: string[] }
  | { kind: 'lever' }
  /**
   * Faire cuire l'ingrédient `ref` (sinon celui qu'on tient, sinon le plus proche) : ustensile
   * (rempli d'eau pour la casserole) sur le feu, ingrédient dedans, feu allumé, puis éteint une fois cuit.
   */
  | { kind: 'cuire'; ref?: string }
  /**
   * Gestes de cuisine : casser un œuf (dans le saladier `dans`, sinon la poêle), fouetter le
   * saladier, remuer ou faire sauter ce qui cuit, servir la poêle à la spatule dans l'assiette
   * `sur`, assaisonner d'`epice`, tartiner de `pot`, râper du fromage, goûter.
   */
  | { kind: 'casser_oeuf'; dans?: string }
  | { kind: 'fouetter' }
  | { kind: 'remuer'; ref?: string }
  | { kind: 'sauter'; ref?: string }
  | { kind: 'servir_poele'; sur?: string }
  | { kind: 'assaisonner'; epice: string; ref?: string }
  | { kind: 'tartiner'; pot?: string; ref?: string }
  | { kind: 'raper'; ref?: string }
  | { kind: 'gouter'; ref?: string }
  /** Toute la recette au fourneau : omelette, une crêpe, œuf au plat (cuits puis servis si une assiette est sortie). */
  | { kind: 'omelette' }
  | { kind: 'crepe' }
  | { kind: 'oeuf_plat' }
  // une recette du livre de recettes, faite de bout en bout (pâtes, soupes, pain perdu, gâteau…)
  | { kind: 'recette'; nom: string }
  /** Le magasin : l'ouvrir ; acheter ces `lignes` (id de fiche, nombre) ; vendre au marché (`noms`, sinon tout) ; l'argent qui reste. */
  | { kind: 'magasin' }
  | { kind: 'acheter'; lignes: Array<{ id: string; n: number }> }
  | { kind: 'vendre'; noms?: string[]; tous?: boolean }
  | { kind: 'argent' }
  /** Allumer ou éteindre un appareil (la gazinière la plus proche sans `ref`). */
  | { kind: 'allumer'; ref?: string }
  | { kind: 'eteindre'; ref?: string }
  /** Monter sur le vélo du garage (`monter`), ou en descendre. */
  | { kind: 'velo'; monter: boolean }
  /** Du pain grillé : le pain coupé en tranches s'il le faut, les tranches au grille-pain, lancé. */
  | { kind: 'griller' }
  /** Sauter sur place (Espace). */
  | { kind: 'sauter_perso' }
  /** Lancer ce qu'on tient (`ref` : le prendre d'abord). */
  | { kind: 'lancer'; ref?: string };

/** La tâche en quelques mots (« prendre tasse »), pour le journal des manques. */
export function intentLabel(i: Intent): string {
  const what = 'ref' in i ? i.ref : 'refs' in i ? (i.refs.length ? i.refs.join(', ') : 'livres') : '';
  const sur = i.kind === 'poser' && i.sur ? ` sur ${i.sur}` : '';
  if (i.kind === 'laver') return i.visage ? 'se laver' : 'se laver les mains';
  if (i.kind === 'vaisselle') return `faire la vaisselle${i.refs.length ? ` ${i.refs.join(', ')}` : ''}`;
  if (i.kind === 'repas') return `manger à table${i.ref ? ` ${i.ref}` : ''}`;
  if (i.kind === 'recette') return `faire la recette ${i.nom}`;
  if (i.kind === 'preparer') return `préparer${i.plat ? ` ${i.plat}` : ' un plat'}`;
  if (i.kind === 'ranger_piece') return `ranger ${i.piece ? `la pièce ${i.piece}` : 'la pièce'}`;
  if (i.kind === 'acheter') return `acheter ${i.lignes.map((l) => `${l.n} ${l.id}`).join(', ')}`;
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
const fillWith = (liquide?: string) => (liquide === 'eau' ? 'eau' : liquide === 'thé' ? 'the' : liquide === 'jus de fruits' ? 'jus' : 'cafe');
const isDirty = (game: Game, ref: string) => !!world(game).objets.find((o) => o.ref === ref)?.ou.includes(', sale');
/** L'assiette est-elle posée sur une table (on y mange assis) ? */
const p0OnTable = (w: ReturnType<typeof world>, o: WorldObject) => w.objets.some((t) => t.nom === 'table' && o.ou.startsWith(`posé sur ${t.ref}`));
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
/**
 * Un thé dans la tasse ou la théière `ref` : lavée si sale, un sachet dedans (la boîte reprend
 * sa place), l'eau chaude de la bouilloire, puis on attend qu'il infuse.
 */
async function brewTea(game: Game, act: Act, ref: string): Promise<void> {
  const ou = () => world(game).objets.find((o) => o.ref === ref)?.ou ?? '';
  if (ou().includes('contient du thé')) return;
  await take(game, act, ref);
  if (isDirty(game, ref)) await act('vaisselle');
  if (ou().includes('contient') && !ou().includes('contient de l’eau chaude')) await act('vider_recipient', { objet: ref });
  if (!ou().includes('sachet')) {
    const box = await takeTool(game, act, ['sachets de thé'], (r) => r === ref);
    await act('sachet', { dans: ref, boite: box });
    // la boîte retourne au garde-manger
    const pantry = world(game).objets.find((o) => o.nom === 'garde-manger');
    if (pantry && world(game).enMain.includes(box)) await runOne(game, { kind: 'mettre', ref: box, dans: pantry.ref }, act).catch(() => {});
  }
  if (!ou().includes('eau chaude')) await act('the');
  await act('infuser', { objet: ref });
}

/**
 * Le petit-déjeuner, d'un seul ordre : un café posé sur la table, du pain coupé et tartiné de
 * confiture, un verre de jus d'orange ; puis à table, on mange et on boit.
 */
async function breakfast(game: Game, act: Act): Promise<void> {
  const table = world(game).objets.find((o) => o.nom === 'table');
  if (!table) throw new Failed('Il n’y a pas de table.');
  const toTable = async (ref: string) => {
    await take(game, act, ref);
    await act('poser_sur', { objet: ref, sur: table.ref });
  };
  // le couvert d'abord (s'il manque) : la tasse et le verre se posent à côté
  const onTable = (o: WorldObject) => o.ou.startsWith(`posé sur ${table.ref}`);
  if (!world(game).objets.some((o) => o.nom === 'assiette' && onTable(o) && !o.ou.includes('sale'))) await runOne(game, { kind: 'mettre_table' }, act).catch(() => {});
  await freeHands(game, act);
  // le café (un thé ou un café déjà prêt fait l'affaire)
  const ready = world(game).objets.find((o) => o.nom === 'tasse' && /contient du (café|thé)/.test(o.ou) && !o.ou.includes('sale'));
  if (!ready) await runOne(game, { kind: 'cafe' }, act);
  const cup = ready ?? world(game).objets.find((o) => o.nom === 'tasse' && world(game).enMain.includes(o.ref));
  if (cup) await toTable(cup.ref);
  // le jus d'orange, dans un verre
  const bottle = world(game).objets.find((o) => o.nom === "jus d'orange" && o.ou.includes('contient'));
  const glass = world(game).objets.filter((o) => o.nom === 'verre' && !o.ou.includes('sale') && !o.ou.includes('contient')).sort((a, b) => a.distance - b.distance)[0];
  if (bottle && glass) {
    await runOne(game, { kind: 'verser', ref: bottle.ref, dans: glass.ref }, act);
    if (world(game).enMain.includes(bottle.ref)) {
      await freeHands(game, act, (r) => r === bottle.ref);
      await act('ranger_place').catch(() => {});
    }
    await toTable(glass.ref);
  }
  // les tartines : le pain coupé, de la confiture dessus
  let w = world(game);
  if (!w.objets.some((o) => o.nom === 'tranches de pain')) {
    const bread = w.objets.find((o) => o.nom === 'pain');
    if (!bread) throw new Failed('Il n’y a plus de pain pour les tartines.');
    await runOne(game, { kind: 'couper', ref: bread.ref }, act);
  }
  w = world(game);
  const slices = w.objets.find((o) => o.nom === 'tranches de pain');
  if (!slices) throw new Failed('Pas de tranches de pain.');
  if (w.objets.some((o) => o.nom === 'confiture')) await runOne(game, { kind: 'tartiner', pot: 'confiture', ref: slices.ref }, act).catch(() => {});
  await freeHands(game, act);
  // à table : les tartines dans l'assiette, puis la boisson
  const plate = world(game).objets.find((o) => o.nom === 'assiette' && onTable(o) && !o.ou.includes('sale'));
  const toast = world(game).objets.find((o) => o.nom.startsWith('tartines') || o.nom === 'tranches de pain');
  await runOne(game, { kind: 'repas', ref: toast?.ref, dans: plate?.ref }, act);
  for (const ref of [cup?.ref, bottle && glass ? glass.ref : undefined]) {
    if (!ref) continue;
    for (let i = 0; i < 8 && world(game).objets.find((o) => o.ref === ref)?.ou.includes('contient'); i++) {
      await take(game, act, ref);
      await act('boire');
    }
    await act('poser').catch(() => {});
  }
}

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

/** L'objet nommé `nom` le plus commode : en main, puis propre, puis le plus proche. */
function nearestNamed(game: Game, nom: string): WorldObject | undefined {
  const w = world(game);
  return w.objets.filter((o) => o.nom === nom).sort((a, b) => +!w.enMain.includes(a.ref) - +!w.enMain.includes(b.ref) || +a.ou.includes(', sale') - +b.ou.includes(', sale') || a.distance - b.distance)[0];
}

/** Va dans la pièce `piece` si le perso n'y est pas déjà. */
async function goToRoom(game: Game, act: Act, piece?: string): Promise<void> {
  if (piece && game.roomName !== piece) await act('aller_piece', { piece });
}

/** Les sanitaires : ils se frottent (brosse WC, éponge) plutôt qu'ils ne s'époussettent. */
const SANITARY = new Set(['toilettes', 'lavabo', 'douche', 'évier']);
/** Ce qui ne se lave pas : on passe l'aspirateur dessus (et autour). */
const FABRIC = new Set(['canapé', 'fauteuil', 'lit', 'tapis']);

/** Les meubles sales (poussière ou crasse au-delà du seuil) de la pièce `piece` (toute la maison sinon), les plus proches d'abord. */
function dirtyItems(game: Game, piece: string | undefined, sorte: 'poussiere' | 'crasse'): string[] {
  const near = new Map(world(game).objets.map((o) => [o.ref, o.distance]));
  return Object.entries(game.dirt().meubles)
    .filter(([ref, d]) => d[sorte] >= DIRTY && (!piece || game.roomOf(ref) === piece))
    .map(([ref]) => ref)
    .sort((a, b) => (near.get(a) ?? 99) - (near.get(b) ?? 99));
}

/** « Nettoie les toilettes », « frotte le lavabo », « nettoie la table basse » : le bon geste pour ce meuble. */
async function cleanThing(game: Game, act: Act, ref?: string): Promise<void> {
  const o = ref ? world(game).objets.find((x) => x.ref === ref) : undefined;
  const d = ref ? game.dirtOf(ref) : null;
  if (ref) await goToRoom(game, act, game.roomOf(ref) ?? undefined);
  if (o && SANITARY.has(o.nom)) return act('frotter', { objet: o.ref });
  if (o && FABRIC.has(o.nom) && !d) return act('aspirer');
  if (o && d && d.poussiere > d.crasse) return act('depoussierer', { objet: o.ref });
  // plan de travail, gazinière, îlot : au spray et à l'éponge
  return act('nettoyer', ref ? { objet: ref } : {});
}

/**
 * « Fais le ménage » : dans chaque pièce sale (celle du perso d'abord, ou seulement `piece`), le balai
 * sur la poussière, la serpillière sur les traces, les sanitaires frottés, puis la poussière des meubles.
 */
async function houseClean(game: Game, act: Act, piece?: string): Promise<void> {
  const here = game.roomName;
  const rooms = piece ? [piece] : Object.keys(game.dirt().sols).sort((a, b) => +(b === here) - +(a === here));
  let done = 0;
  for (const room of rooms) {
    const tasks: Array<[string, Record<string, string>]> = [];
    if (game.dirtiestSpot(room, 'balai')) tasks.push(['balayer', {}]);
    if (game.dirtiestSpot(room, 'serpillière')) tasks.push(['serpillere', {}]);
    for (const ref of dirtyItems(game, room, 'crasse')) tasks.push([SANITARY.has(world(game).objets.find((o) => o.ref === ref)?.nom ?? '') ? 'frotter' : 'nettoyer', { objet: ref }]);
    for (const ref of dirtyItems(game, room, 'poussiere')) tasks.push(['depoussierer', { objet: ref }]);
    if (!tasks.length) continue;
    await goToRoom(game, act, room);
    for (const [name, args] of tasks) {
      // un geste qui rate (outil introuvable) n'arrête pas le ménage
      try {
        await act(name, args);
        done++;
      } catch (e) {
        if ((e as Error).message === 'Interrompu.') throw e;
      }
    }
  }
  if (!done) game.onNotice?.(piece ? `${piece[0].toUpperCase()}${piece.slice(1)} : rien à nettoyer, c’est propre.` : 'Rien à nettoyer : la maison est propre.');
}

/** Prend l'outil `nom` (le premier qui existe de la liste), en gardant en main ce que vérifie `keep`. */
async function takeTool(game: Game, act: Act, noms: string[], keep: (ref: string) => boolean = () => false): Promise<string> {
  const tool = noms.map((n) => nearestNamed(game, n)).find(Boolean);
  if (!tool) throw new Failed(`Il n’y a pas de ${noms[0]}.`);
  if (!world(game).enMain.includes(tool.ref)) {
    // une main libre, sans lâcher ce qu'on garde
    const w = world(game);
    if (!w.mainsLibres) {
      const load = w.mains.find((l) => !l.some(keep));
      if (!load) throw new Failed('Les mains sont prises.');
      await dropLoad(act, load);
    }
    await act('prendre', { objet: tool.ref });
  }
  return tool.ref;
}

/** La poêle (ou `nom`) sur la gazinière, propre ; rend sa ref et celle de la gazinière. */
async function panOnStove(game: Game, act: Act, nom = 'poêle'): Promise<{ pan: string; stove: string }> {
  const w = world(game);
  const stove = w.objets.filter((o) => o.sorte === 'gazinière').sort((a, b) => a.distance - b.distance)[0];
  if (!stove) throw new Failed('Il n’y a pas de gazinière.');
  const pans = w.objets.filter((o) => o.nom === nom).sort((a, b) => +!a.ou.startsWith(`posé sur ${stove.ref}`) - +!b.ou.startsWith(`posé sur ${stove.ref}`) || a.distance - b.distance);
  const pan = pans[0];
  if (!pan) throw new Failed(`Il n’y a pas de ${nom}.`);
  if (w.objets.some((o) => o.ou.startsWith(`dans ${pan.ref}`))) throw new Failed(`Il y a déjà quelque chose dans ${nom === 'poêle' ? 'la poêle' : nom} : sers-le ou retire-le d’abord.`);
  if (!pan.ou.startsWith(`posé sur ${stove.ref}`) || isDirty(game, pan.ref)) {
    await take(game, act, pan.ref);
    if (isDirty(game, pan.ref)) await act('vaisselle');
    await act('mettre_sur_feu', { objet: stove.ref });
  }
  return { pan: pan.ref, stove: stove.ref };
}

/** Le saladier en main, propre. */
async function bowlInHand(game: Game, act: Act): Promise<string> {
  const bowl = nearestNamed(game, 'saladier');
  if (!bowl) throw new Failed('Il n’y a pas de saladier.');
  await take(game, act, bowl.ref);
  if (isDirty(game, bowl.ref) && !bowl.ou.includes('contient')) await act('vaisselle');
  return bowl.ref;
}

/** Casse un œuf du frigo dans `into` (tenu ou posé). */
async function crackInto(game: Game, act: Act, into: string): Promise<void> {
  const egg = nearestNamed(game, 'œuf');
  if (!egg) throw new Failed('Il n’y a plus d’œufs : commande les courses.');
  await takeTool(game, act, ['œuf'], (ref) => ref === into);
  await act('casser_oeuf', { dans: into });
}

/** Mélange au fouet le saladier tenu, puis repose le fouet. */
async function whisk(game: Game, act: Act, bowl: string): Promise<void> {
  const tool = await takeTool(game, act, ['fouet', 'cuillère en bois'], (ref) => ref === bowl);
  await act('fouetter', { saladier: bowl });
  await act('poser', { objet: tool });
}

/** Ce qui cuit dans `pan`, nommé `nom`. */
const cookingIn = (game: Game, pan: string, nom: string) => world(game).objets.find((o) => o.nom === nom && o.ou.startsWith(`dans ${pan}`));

/** Feu allumé, cuisson (remuée ou retournée à la spatule), feu éteint, puis servi dans une assiette sortie s'il y en a une. */
async function cookAndServe(game: Game, act: Act, pan: string, stove: string, nom: string): Promise<void> {
  const food = cookingIn(game, pan, nom);
  if (!food) throw new Failed(`Pas de ${nom} dans la poêle.`);
  await freeHands(game, act, () => false);
  await act('allumer', { objet: stove, ustensile: pan });
  await takeTool(game, act, ['spatule', 'cuillère en bois']);
  await act('remuer', { objet: pan });
  await act('attendre_cuisson', { objet: food.ref });
  await act('eteindre', { objet: stove, ustensile: pan });
  // servi à la spatule dans une assiette propre (sortie du placard s'il le faut ; sinon il reste au chaud dans la poêle)
  await serveFrom(game, act, pan, false);
}

const ouOf = (game: Game, ref: string) => world(game).objets.find((o) => o.ref === ref)?.ou ?? '';
/** Le plan de travail (sinon la table), où sortir ce qui est rangé. */
const counterOf = (game: Game) => world(game).objets.find((o) => o.nom === 'plan de travail') ?? world(game).objets.find((o) => o.nom === 'table');

/** Remet `ref` à sa place (frigo, garde-manger, placard) s'il existe encore ; sans échec. */
const putBack = (game: Game, act: Act, ref: string) => (world(game).objets.some((o) => o.ref === ref) ? runOne(game, { kind: 'ranger_place', ref }, act).catch(() => {}) : Promise.resolve());

/** Sort `nom` (planche, moule, assiette…) sur le plan de travail s'il est rangé, tenu ou par terre ; rend sa ref. */
async function outOnCounter(game: Game, act: Act, nom: string, ok: (o: WorldObject) => boolean = () => true): Promise<string | undefined> {
  const w = world(game);
  const all = w.objets.filter((o) => o.nom === nom && ok(o)).sort((a, b) => +!isLoose(a) - +!isLoose(b) || +a.ou.includes(', sale') - +b.ou.includes(', sale') || a.distance - b.distance);
  const it = all[0];
  if (!it) return undefined;
  const counter = counterOf(game);
  if (counter && (!isLoose(it) || it.ou.startsWith('au sol'))) await runOne(game, { kind: 'poser', ref: it.ref, sur: counter.ref, libre: true }, act);
  return it.ref;
}

/** Ajoute au saladier tenu un ingrédient (œuf cassé, lait versé, farine, sucre, fromage râpé…), puis repose le pot ou le paquet. */
async function addToBowl(game: Game, act: Act, bowl: string, nom: string): Promise<void> {
  if (nom === 'œuf') return crackInto(game, act, bowl);
  const keep = (ref: string) => ref === bowl;
  const it = await takeTool(game, act, [nom], keep);
  await act(nom === 'lait' ? 'verser' : 'ajouter_saladier', nom === 'lait' ? { dans: bowl } : { saladier: bowl });
  if (world(game).enMain.includes(it)) await act('poser', { objet: it });
}

/** Le saladier tenu, avec `batter` dedans : les ingrédients `parts` mis puis fouettés (sauf si c'est déjà fait). */
async function batterBowl(game: Game, act: Act, parts: string[], batter: string): Promise<string> {
  const bowl = await bowlInHand(game, act);
  if (ouOf(game, bowl).includes(batter)) return bowl;
  if (ouOf(game, bowl).includes('contient') || ouOf(game, bowl).includes('à mélanger')) throw new Failed('Le saladier n’est pas vide : vide-le ou lave-le d’abord.');
  for (const nom of parts) await addToBowl(game, act, bowl, nom);
  await whisk(game, act, bowl);
  return bowl;
}

/** Une assiette (ou un bol, `deep`) propre et vide, posée : sortie du placard s'il le faut. */
async function freeDish(game: Game, act: Act, deep: boolean): Promise<string | undefined> {
  const nom = deep ? 'bol' : 'assiette';
  const w = world(game);
  const loose = w.objets.filter((o) => o.nom === nom && isLoose(o) && !o.ou.startsWith('au sol') && !o.ou.includes(', sale') && !servedOn(w, o.ref)).sort((a, b) => a.distance - b.distance)[0];
  if (loose) return loose.ref;
  await freeHands(game, act);
  return outOnCounter(game, act, nom, (o) => o.ou.startsWith('rangé') && !o.ou.includes(', sale'));
}

/** Sert ce qui a cuit dans `pan` (casserole, poêle, passoire) : à la louche dans un bol pour la soupe, sinon à la spatule. */
async function serveFrom(game: Game, act: Act, pan: string, soup: boolean): Promise<void> {
  // les mains vidées d'abord : rien ne se pose dans l'assiette choisie
  await freeHands(game, act);
  const dish = await freeDish(game, act, soup);
  if (!dish) return;
  await takeTool(game, act, soup ? ['louche', 'cuillère en bois'] : ['spatule', 'cuillère en bois', 'louche']);
  await act('servir_poele', { assiette: dish, objet: pan });
}

/** La casserole propre et vide sur la gazinière, remplie d'eau à l'évier (`water`) ; rend sa ref et celle de la gazinière. */
async function potOnStove(game: Game, act: Act, water: boolean): Promise<{ pan: string; stove: string }> {
  const { pan, stove } = await panOnStove(game, act, 'casserole');
  const full = ouOf(game, pan).includes('contient');
  if (water ? !ouOf(game, pan).includes('contient de l’eau') : full) {
    await freeHands(game, act);
    await take(game, act, pan);
    await act(water ? 'eau' : 'vider_recipient');
    await act('mettre_sur_feu', { objet: stove });
  }
  return { pan, stove };
}

/** Pâtes ou riz : l'eau bout, on verse le paquet, cuit, égoutté à l'évier, garni (`top`), servi. */
async function boilStarch(game: Game, act: Act, paquet: string, nom: string, top?: string): Promise<void> {
  const { pan, stove } = await potOnStove(game, act, true);
  await freeHands(game, act);
  await act('allumer', { objet: stove, ustensile: pan });
  await act('attendre_ebullition', { objet: pan });
  const box = await takeTool(game, act, [paquet]);
  await act('verser_feculent', { objet: pan });
  await putBack(game, act, box);
  const food = cookingIn(game, pan, nom);
  if (!food) throw new Failed(`Pas de ${nom} dans la casserole.`);
  await act('attendre_cuisson', { objet: food.ref });
  await act('eteindre', { objet: stove, ustensile: pan });
  // égoutté au-dessus de l'évier (dans la passoire si elle y est), la casserole revient sur la gazinière
  await freeHands(game, act);
  await take(game, act, pan);
  await act('vider_recipient');
  if (world(game).enMain.includes(pan)) await act('mettre_sur_feu', { objet: stove });
  const where = () => ouOf(game, food.ref).match(/^dans ([^,]+)/)?.[1] ?? pan;
  if (top) {
    const pot = await takeTool(game, act, [top]);
    await act('garnir', { objet: where() });
    await putBack(game, act, pot);
  }
  const at = world(game).objets.find((o) => o.ou.startsWith(`dans ${where()}`) && o.nom.startsWith(nom))?.ou.match(/^dans ([^,]+)/)?.[1] ?? where();
  await serveFrom(game, act, at, false);
}

/** Soupe : la casserole d'eau (ou la brique versée), les légumes dedans, cuite, servie à la louche. */
async function cookSoup(game: Game, act: Act, legumes: string[], nom: string): Promise<void> {
  // les légumes coupés d'abord (la carotte en rondelles, la tomate en tranches)
  const pieces: string[] = [];
  for (const l of legumes) {
    const piece = ITEMS.find((d) => d.id === ITEMS.find((p) => p.name === l)?.cut)?.name;
    if (piece && !world(game).objets.some((o) => o.nom === piece)) {
      const whole = nearestNamed(game, l);
      if (!whole) throw new Failed(`Il n’y a pas de ${l}.`);
      await runOne(game, { kind: 'couper', ref: whole.ref }, act);
    }
    pieces.push(piece ?? l);
  }
  const brick = !legumes.length;
  const { pan, stove } = await potOnStove(game, act, !brick);
  await freeHands(game, act);
  if (brick) {
    await takeTool(game, act, ['brique de soupe']);
    await act('verser_soupe', { objet: pan });
  }
  for (const p of pieces) {
    const veg = nearestNamed(game, p);
    if (!veg) throw new Failed(`Il n’y a pas de ${p}.`);
    await takeTool(game, act, [p]);
    await act('soupe', { objet: pan });
  }
  await freeHands(game, act);
  const soup = cookingIn(game, pan, nom);
  if (!soup) throw new Failed(`Pas de ${nom} dans la casserole.`);
  await act('allumer', { objet: stove, ustensile: pan });
  await act('attendre_cuisson', { objet: soup.ref });
  await act('eteindre', { objet: stove, ustensile: pan });
  await serveFrom(game, act, pan, true);
}

/** Le gâteau : la pâte au saladier, versée dans le moule sorti, au four ; on le sort aux maniques. */
async function bakeCake(game: Game, act: Act, extra?: string): Promise<void> {
  const oven = world(game).objets.find((o) => o.nom === 'four');
  if (!oven) throw new Failed('Il n’y a pas de four.');
  await freeHands(game, act);
  const tin = await outOnCounter(game, act, 'moule à gâteau');
  if (!tin) throw new Failed('Il n’y a pas de moule à gâteau.');
  if (isDirty(game, tin)) {
    await take(game, act, tin);
    await act('vaisselle');
    await act('poser', { objet: tin });
  }
  await batterBowl(game, act, ['œuf', 'œuf', 'farine', 'sucre', 'levure', ...(extra ? [extra] : [])], 'pâte à gâteau');
  await act('verser_pate', { poele: tin });
  await freeHands(game, act);
  await runOne(game, { kind: 'mettre', ref: tin, dans: oven.ref }, act);
  await act('fermer', { objet: oven.ref }).catch(() => {});
  await act('allumer', { objet: oven.ref });
}

/** Une recette du livre de recettes, de bout en bout (le nom de la page). */
async function cookFromBook(game: Game, act: Act, nom: string): Promise<void> {
  switch (nom) {
    case 'omelette':
      return runOne(game, { kind: 'omelette' }, act);
    case 'crêpe':
      return runOne(game, { kind: 'crepe' }, act);
    case 'œuf au plat':
      return runOne(game, { kind: 'oeuf_plat' }, act);
    case 'omelette au fromage': {
      // la garniture : du fromage râpé (râpé sur la planche s'il n'y en a pas), sinon jambon ou champignons
      const has = (n: string) => world(game).objets.some((o) => o.nom === n);
      if (!has('fromage râpé') && has('fromage') && has('râpe')) {
        await freeHands(game, act);
        const board = await outOnCounter(game, act, 'planche à découper');
        if (board) await runOne(game, { kind: 'raper', ref: board }, act);
        for (const ref of world(game).enMain) await putBack(game, act, ref);
      }
      const filling = ['fromage râpé', 'jambon', 'champignons'].find(has);
      if (!filling) throw new Failed('Il n’y a ni fromage, ni jambon, ni champignons pour garnir l’omelette.');
      const { pan, stove } = await panOnStove(game, act);
      await freeHands(game, act);
      await batterBowl(game, act, ['œuf', 'œuf', filling], 'œufs battus');
      await act('verser_pate', { poele: pan });
      const made = world(game).objets.find((o) => o.nom.startsWith('omelette') && o.ou.startsWith(`dans ${pan}`));
      return cookAndServe(game, act, pan, stove, made?.nom ?? 'omelette');
    }
    case 'pain perdu': {
      const { pan, stove } = await panOnStove(game, act);
      await freeHands(game, act);
      if (!world(game).objets.some((o) => o.nom === 'tranches de pain' && !o.ou.includes('entamé'))) {
        const bread = nearestNamed(game, 'pain') ?? nearestNamed(game, 'baguette');
        if (!bread) throw new Failed('Il n’y a pas de pain.');
        await runOne(game, { kind: 'couper', ref: bread.ref }, act);
        await freeHands(game, act);
      }
      await takeTool(game, act, ['tranches de pain']);
      await act('mettre_dans', { ustensile: pan });
      await freeHands(game, act);
      await batterBowl(game, act, ['œuf', 'lait', 'sucre'], 'pâte à pain perdu');
      await act('verser_pate', { poele: pan });
      return cookAndServe(game, act, pan, stove, 'pain perdu');
    }
    case 'chocolat chaud': {
      const cup = world(game).objets.filter((o) => o.nom === 'tasse').sort((a, b) => +!world(game).enMain.includes(a.ref) - +!world(game).enMain.includes(b.ref) || +a.ou.includes('contient') - +b.ou.includes('contient') || a.distance - b.distance)[0];
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      if (isDirty(game, cup.ref)) await act('vaisselle');
      const ou = () => ouOf(game, cup.ref);
      if (ou().includes('contient') && !/eau chaude|lait\b/.test(ou())) await act('vider_recipient');
      if (!ou().includes('contient')) {
        const kettle = world(game).objets.find((o) => o.nom === 'bouilloire');
        if (kettle && !kettle.ou.includes('contient')) {
          await runOne(game, { kind: 'remplir_bouilloire', ref: kettle.ref }, act);
          await take(game, act, cup.ref);
        }
        await act('the');
      }
      await takeTool(game, act, ['tablette de chocolat'], (ref) => ref === cup.ref);
      await act('chocolat', { objet: cup.ref });
      return putBack(game, act, nearestNamed(game, 'tablette de chocolat')?.ref ?? '');
    }
    case 'jus et smoothies': {
      const mixer = world(game).objets.find((o) => o.nom === 'mixeur');
      if (!mixer) throw new Failed('Il n’y a pas de mixeur.');
      if (!/prêt \(/.test(mixer.ou)) {
        const fruit = ['pomme', 'poire', 'orange', 'raisin', 'banane', 'fraises'].map((n) => nearestNamed(game, n)).find(Boolean);
        if (!fruit) throw new Failed('Il n’y a pas de fruits à mixer.');
        await runOne(game, { kind: 'mettre', ref: fruit.ref, dans: mixer.ref }, act);
        await act('allumer', { objet: mixer.ref });
      }
      return runOne(game, { kind: 'jus' }, act);
    }
    case 'pâtes au beurre':
      return boilStarch(game, act, 'paquet de pâtes', 'pâtes', 'beurre');
    case 'pâtes à la tomate':
      return boilStarch(game, act, 'paquet de pâtes', 'pâtes', 'sauce tomate');
    case 'riz':
      return boilStarch(game, act, 'paquet de riz', 'riz');
    case 'soupe de légumes':
      return cookSoup(game, act, ['carotte', 'tomate'], 'soupe de légumes');
    case 'soupe de poireaux':
      return cookSoup(game, act, ['poireau', 'pomme de terre'], 'soupe de poireaux');
    case 'soupe':
      return cookSoup(game, act, [], 'soupe');
    case 'gâteau':
      return bakeCake(game, act);
    case 'gâteau au chocolat':
      return bakeCake(game, act, 'tablette de chocolat');
    case 'gâteau au yaourt':
      return bakeCake(game, act, 'yaourt');
  }
  // les assemblages (salades, sandwichs…) : « Préparer »
  const dish = DISHES.find((d) => d.name === nom);
  if (dish && RECIPE_BY_DISH.has(dish.id)) return runOne(game, { kind: 'preparer', plat: dish.id }, act);
  throw new Failed(`Je ne sais pas encore faire : ${nom}.`);
}

/** Les recettes du livre que le perso sait faire seul (« Préparer » dans le livre). */
export const BOOK_RECIPES = ['omelette', 'omelette au fromage', 'crêpe', 'œuf au plat', 'pain perdu', 'chocolat chaud', 'jus et smoothies', 'pâtes au beurre', 'pâtes à la tomate', 'riz', 'soupe de légumes', 'soupe de poireaux', 'soupe', 'gâteau', 'gâteau au chocolat', 'gâteau au yaourt'];

async function runOne(game: Game, intent: Intent, act: Act): Promise<void> {
  switch (intent.kind) {
    case 'prendre':
      if (world(game).enMain.includes(intent.ref)) return;
      return take(game, act, intent.ref);
    case 'poser': {
      if (intent.ref) await take(game, act, intent.ref);
      if (!held(game).length) throw new Failed('Rien en main à poser.');
      // sur le plateau ou une assiette : posé dessus, au milieu (pas devant soi)
      const onto = intent.sur ? world(game).objets.find((o) => o.ref === intent.sur) : undefined;
      if (onto && (onto.nom === 'plateau' || onto.nom === 'assiette')) return act('poser_sur', { sur: onto.ref, ...(intent.ref ? { objet: intent.ref } : {}) });
      if (intent.sur) await act('aller', { objet: intent.sur });
      // l'objet demandé : la main qui le tient (pile comprise)
      const load = intent.ref ? world(game).mains.find((l) => l.includes(intent.ref!)) : undefined;
      return act(intent.libre ? 'poser_libre' : 'poser', { ...(load ? { objet: load[0] } : {}), ...(intent.libre && intent.sur ? { sur: intent.sur } : {}) });
    }
    case 'aller':
      return act('aller', { objet: intent.ref });
    case 'dire':
      return act('dire', { texte: intent.texte });
    case 'ranger': {
      // la bibliothèque (le pot à ustensiles et l'étagère à épices rangent aussi)
      const shelves = world(game).objets.filter((o) => o.sorte === 'rangement');
      const shelf = shelves.find((o) => o.nom === 'bibliothèque') ?? shelves[0];
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
      const pot = intent.dans ? world(game).objets.find((o) => o.ref === intent.dans) : world(game).objets.filter((o) => o.nom === 'tasse').sort((a, b) => +!world(game).enMain.includes(a.ref) - +!world(game).enMain.includes(b.ref) || +a.ou.includes('contient') - +b.ou.includes('contient') || a.distance - b.distance)[0];
      if (!pot) throw new Failed(intent.dans ? `Aucun objet « ${intent.dans} ».` : 'Il n’y a pas de tasse.');
      return brewTea(game, act, pot.ref);
    }
    case 'sachet': {
      const pot = intent.ref ?? world(game).objets.find((o) => (o.nom === 'tasse' || o.nom === 'théière') && world(game).enMain.includes(o.ref))?.ref;
      const box = await takeTool(game, act, ['sachets de thé'], (ref) => ref === pot);
      return act('sachet', { ...(pot ? { dans: pot } : {}), boite: box });
    }
    case 'petit_dej':
      return breakfast(game, act);
    case 'jus': {
      const cup = world(game).objets.find((o) => o.nom === 'tasse');
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      if (isDirty(game, cup.ref)) await act('vaisselle');
      return act('jus');
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
        if (intent.liquide === 'thé') await brewTea(game, act, cup.ref);
        else await act(fillWith(intent.liquide));
      } else if (intent.liquide === 'eau' && !ou.includes('contient de l’eau')) await act('eau');
      else if (intent.liquide === 'thé' && !ou.includes('contient du thé')) await brewTea(game, act, cup.ref);
      else if (intent.liquide === 'jus de fruits' && !ou.includes('contient du jus')) await act('jus');
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
      // la planche rangée au placard (ou tenue) se sort d'abord sur le plan de travail
      const board = w.objets.find((o) => o.sorte === 'planche');
      const counter = w.objets.find((o) => o.nom === 'plan de travail') ?? w.objets.find((o) => o.nom === 'table');
      if (board && counter && (board.ou.startsWith('rangé') || board.ou === 'en main' || board.ou.startsWith('au sol'))) await runOne(game, { kind: 'poser', ref: board.ref, sur: counter.ref }, act);
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
      // pas d'ustensile pour lui (frites, pizza surgelées) : au four, qu'on lance
      const oven = !plan && w.objets.find((o) => o.nom === 'four');
      if (oven) {
        await runOne(game, { kind: 'mettre', ref: food.ref, dans: oven.ref }, act);
        await act('allumer', { objet: oven.ref });
        return;
      }
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
      const cup = world(game).objets.find((o) => (intent.ref ? o.ref === intent.ref : o.nom === 'tasse'));
      if (!cup) throw new Failed('Il n’y a pas de tasse.');
      await take(game, act, cup.ref);
      // sale : lavée d'abord, puis remplie
      if (isDirty(game, cup.ref)) await act('vaisselle');
      return act('eau');
    }
    case 'verser': {
      // un verre rangé (placard, égouttoir) : on le sort d'abord, il se remplit dans l'autre main
      const into = intent.dans ? world(game).objets.find((o) => o.ref === intent.dans) : undefined;
      if (into?.portable && into.ou.startsWith('rangé')) {
        await freeHands(game, act, (ref) => ref === into.ref || ref === intent.ref);
        await take(game, act, into.ref);
      }
      if (intent.ref) await take(game, act, intent.ref);
      return act('verser', intent.dans ? { dans: intent.dans } : {});
    }
    case 'vider_recipient': {
      if (intent.ref) await take(game, act, intent.ref);
      return act('vider_recipient');
    }
    case 'remplir_bouilloire': {
      // de l'eau déjà en main, sinon une bouteille pleine, sinon la casserole ou la tasse remplie à l'évier
      const w = world(game);
      const water = (o: WorldObject) => o.ou.includes('contient de l’eau');
      const vessels = w.objets.filter((o) => o.sorte === 'récipient' || (o.sorte === 'ustensile' && o.nom === 'casserole'));
      const src = vessels.find((o) => w.enMain.includes(o.ref) && water(o)) ?? vessels.find(water) ?? vessels.find((o) => o.nom === 'casserole') ?? vessels.find((o) => o.nom === 'tasse');
      if (!src) throw new Failed('Rien pour porter de l’eau jusqu’à la bouilloire.');
      await take(game, act, src.ref);
      if (!water(src)) await act('eau');
      return act('verser', { dans: intent.ref });
    }
    case 'robinet':
      return act('robinet', { etat: intent.ouvrir ? 'ouvrir' : 'fermer', ...(intent.ref ? { objet: intent.ref } : {}) });
    case 'bouchon':
      return act('bouchon', { etat: intent.mettre ? 'mettre' : 'enlever' });
    case 'boire_robinet':
      await freeHands(game, act);
      return act('boire_robinet');
    case 'charger_lv':
      await freeHands(game, act, (ref) => world(game).objets.some((o) => o.ref === ref && o.ou.includes(', sale') && o.sorte === 'vaisselle'));
      return act('charger_lave_vaisselle');
    case 'pastille': {
      const box = world(game).objets.find((o) => o.nom === 'boîte de pastilles');
      if (!box) throw new Failed('Il n’y a pas de pastilles.');
      await take(game, act, box.ref);
      await act('pastille');
      // la boîte retourne au placard
      return act('ranger_place').then(() => {}, () => {});
    }
    case 'vider_lv':
      await freeHands(game, act);
      return act('vider_lave_vaisselle');
    case 'empiler':
      await freeHands(game, act);
      return act('empiler');
    case 'essuyer_sol': {
      const sponge = world(game).objets.find((o) => o.nom === 'éponge');
      if (!sponge) throw new Failed('Il n’y a pas d’éponge.');
      await take(game, act, sponge.ref);
      return act('essuyer_sol');
    }
    // le ménage : chaque geste va chercher son outil, et travaille dans la pièce où est le perso
    case 'balayer':
      await goToRoom(game, act, intent.piece);
      return act('balayer');
    case 'serpillere':
      await goToRoom(game, act, intent.piece);
      return act('serpillere');
    case 'aspirateur':
      await goToRoom(game, act, intent.piece ?? (intent.ref ? game.roomOf(intent.ref) ?? undefined : undefined));
      return act('aspirer');
    case 'poussiere': {
      if (intent.ref) {
        await goToRoom(game, act, game.roomOf(intent.ref) ?? undefined);
        return act('depoussierer', { objet: intent.ref });
      }
      // « fais la poussière (dans la chambre) » : chaque meuble poussiéreux, pièce par pièce
      const dusty = dirtyItems(game, intent.piece, 'poussiere');
      if (!dusty.length) {
        game.onNotice?.(`Pas de poussière${intent.piece ? ` : ${intent.piece}` : ''}.`);
        return;
      }
      for (const ref of dusty) {
        await goToRoom(game, act, game.roomOf(ref) ?? undefined);
        await act('depoussierer', { objet: ref });
      }
      return;
    }
    case 'vitres':
      await goToRoom(game, act, intent.ref === 'miroir' ? 'salle de bain' : intent.piece);
      return act('vitres', intent.ref ? { objet: intent.ref } : {});
    case 'nettoyer':
      return cleanThing(game, act, intent.ref);
    case 'menage':
      return houseClean(game, act, intent.piece ?? (intent.ici ? game.roomName ?? undefined : undefined));
    case 'gants':
      if (intent.mettre) {
        await freeHands(game, act);
        return act('gants', { etat: 'mettre' });
      }
      await freeHands(game, act);
      return act('gants', { etat: 'enlever' });
    case 'sortir_poubelle':
      await freeHands(game, act);
      return act('sortir_poubelle');
    case 'sac_neuf':
      await freeHands(game, act);
      return act('sac_neuf', intent.ref ? { objet: intent.ref } : {});
    case 'heure':
      return act('heure');
    case 'essuyer_vaisselle': {
      const towel = world(game).objets.find((o) => o.nom === 'torchon');
      if (!towel) throw new Failed('Il n’y a pas de torchon.');
      const wet = () => world(game).objets.filter((o) => o.ou.includes('mouill') && (!intent.refs.length || intent.refs.includes(o.ref)));
      if (!wet().length) throw new Failed('Rien de mouillé à essuyer.');
      await freeHands(game, act, (ref) => ref === towel.ref);
      await take(game, act, towel.ref);
      for (let i = 0; i < 12 && wet().length; i++) await act('essuyer_vaisselle', { objet: wet().sort((a, b) => a.distance - b.distance)[0].ref });
      return;
    }
    case 'essuyer_mains': {
      const towel = world(game).objets.find((o) => o.nom === 'torchon');
      if (!towel) throw new Failed('Il n’y a pas de torchon.');
      await freeHands(game, act, (ref) => ref === towel.ref);
      await take(game, act, towel.ref);
      return act('essuyer_mains');
    }
    case 'courses':
      return act('commander_courses');
    case 'liste_courses':
      return act('lire_liste');
    case 'ranger_courses': {
      const bag = world(game).objets.find((o) => o.nom === 'sac de courses');
      if (!bag) throw new Failed('Il n’y a pas de sac de courses (commande d’abord les courses).');
      await freeHands(game, act, (ref) => ref === bag.ref);
      return act('ranger_courses', { objet: bag.ref });
    }
    case 'chaise':
      await freeHands(game, act);
      return act(intent.sous ? 'ranger_chaise' : 'tirer_chaise', { objet: intent.ref });
    case 'essuyer': {
      const sponge = world(game).objets.find((o) => o.nom === 'éponge');
      if (!sponge) throw new Failed('Il n’y a pas d’éponge.');
      await take(game, act, sponge.ref);
      return act('essuyer_table', intent.ref ? { objet: intent.ref } : {});
    }
    case 'mettre_table':
      await freeHands(game, act);
      return act('mettre_table');
    case 'debarrasser':
      await freeHands(game, act);
      return act('debarrasser');
    case 'couper_assiette': {
      const w = world(game);
      const knives = w.objets.filter((o) => o.nom === 'couteau de table').sort((a, b) => +a.ou.includes('sale') - +b.ou.includes('sale') || a.distance - b.distance);
      const knife = knives.find((o) => w.enMain.includes(o.ref)) ?? knives[0];
      if (!knife) throw new Failed('Il n’y a pas de couteau de table.');
      const plate = w.objets.find((o) => o.nom === 'assiette' && servedOn(w, o.ref));
      if (!plate) throw new Failed('Il n’y a rien de servi dans l’assiette.');
      await take(game, act, knife.ref);
      await act('attabler', { assiette: plate.ref });
      return act('couper_assiette');
    }
    case 'regarder':
      return act('regarder_dedans', { objet: intent.ref });
    case 'ranger_place':
      if (intent.ref) await take(game, act, intent.ref);
      return act('ranger_place');
    case 'ranger_piece': {
      const piece = intent.piece ?? game.roomName;
      if (!piece) throw new Failed('Quelle pièce ranger ?');
      // ce qu'on tient d'abord, puis un objet après l'autre (chacun une fois : s'il n'a pas de place, on passe)
      if (held(game).length) await act('ranger_place').catch(() => {});
      const tried = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const ref = game.toTidy(piece).find((r) => !tried.has(r));
        if (!ref) break;
        tried.add(ref);
        try {
          await take(game, act, ref);
          await act('ranger_place');
        } catch (e) {
          if ((e as Error).message === 'Interrompu.') throw e;
          // pas de place pour lui : on le repose et on continue
          if (held(game).length) await act('poser').catch(() => {});
        }
      }
      if (!tried.size) game.onNotice?.(`Rien à ranger : ${piece}.`);
      return;
    }
    case 'laisser_ouvert':
      return act('laisser_ouvert', { objet: intent.ref });
    case 'glacons': {
      const w = world(game);
      const tray = w.objets.find((o) => o.nom === 'bac à glaçons');
      if (!tray) throw new Failed('Il n’y a pas de glaçons.');
      const cup = intent.dans ?? w.objets.find((o) => o.nom === 'tasse')?.ref;
      // la tasse dans une main, le bac dans l'autre
      if (cup) await take(game, act, cup);
      await take(game, act, tray.ref);
      return act('glacons', cup ? { dans: cup } : {});
    }
    case 'laver':
      // les mains doivent être libres
      await freeHands(game, act);
      return act(intent.visage ? 'se_laver' : 'laver_mains');
    case 'douche':
      await freeHands(game, act);
      return act('douche');
    case 'secher':
      return act('secher');
    case 'toilettes':
      await freeHands(game, act);
      return act('toilettes');
    case 'chasse':
      return act('chasse');
    case 'dormir':
      await freeHands(game, act);
      return act('dormir', intent.ref ? { lit: intent.ref } : {});
    case 'reveiller':
      return act('reveiller');
    case 'faire_lit':
      await freeHands(game, act);
      return act('faire_lit', intent.ref ? { lit: intent.ref } : {});
    case 'verrou':
      return act('verrou', { fermer: intent.fermer ? 'oui' : 'non' });
    case 'reveil':
      if (intent.arreter) return act('arreter_reveil');
      if (intent.sonnerie !== undefined) await act('sonnerie_reveil', intent.sonnerie ? { sonnerie: intent.sonnerie } : {});
      if (intent.couper) return act('regler_reveil', { heure: 'non' });
      if (intent.heure !== undefined) return act('regler_reveil', { heure: String(intent.heure) });
      return;
    case 'piece':
      return act('aller_piece', { piece: intent.piece });
    case 'velo':
      if (!intent.monter) return act('descendre_velo');
      await freeHands(game, act);
      return act('monter_velo');
    case 'griller': {
      const toaster = world(game).objets.find((o) => o.nom === 'grille-pain');
      if (!toaster) throw new Failed('Il n’y a pas de grille-pain.');
      if (!world(game).objets.some((o) => o.nom === 'tranches de pain')) {
        const bread = world(game).objets.find((o) => o.nom === 'pain') ?? world(game).objets.find((o) => o.nom === 'baguette');
        if (!bread) throw new Failed('Il n’y a plus de pain à griller.');
        await runOne(game, { kind: 'couper', ref: bread.ref }, act);
        // les tranches apparaissent sur la planche juste après le geste
        for (let i = 0; i < 50 && !world(game).objets.some((o) => o.nom === 'tranches de pain'); i++) await new Promise((r) => setTimeout(r, 100));
      }
      const w = world(game);
      const slices = w.objets.filter((o) => o.nom === 'tranches de pain');
      const item = slices.find((o) => w.enMain.includes(o.ref)) ?? slices.find(isLoose) ?? slices[0];
      if (!item) throw new Failed('Pas de tranches de pain.');
      await runOne(game, { kind: 'mettre', ref: item.ref, dans: toaster.ref }, act);
      return act('allumer', { objet: toaster.ref });
    }
    case 'sauter_perso':
      return act('sauter');
    case 'lancer': {
      if (intent.ref) await take(game, act, intent.ref);
      const thing = intent.ref ? world(game).objets.find((o) => o.ref === intent.ref) : held(game)[0];
      if (!thing || !world(game).enMain.includes(thing.ref)) throw new Failed('Rien en main à lancer.');
      return act('lancer', { objet: thing.ref });
    }
    case 'lire': {
      const w = world(game);
      if (w.lit && (!intent.ref || intent.ref === w.lit)) return;
      // le livre de recettes seulement s'il est demandé
      const books = w.objets.filter((o) => o.nom === 'livre' || (o.nom === 'livre de recettes' && o.ref === intent.ref));
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
      // l'assiette, ou le bol s'il est nommé (ou déjà servi)
      const plates = w.objets.filter((o) => (intent.dans ? o.ref === intent.dans : o.nom === 'assiette' || (o.nom === 'bol' && !!servedOn(w, o.ref))));
      // l'assiette déjà servie, sinon une propre et posée
      let plate = plates.find((p) => servedOn(w, p.ref) && (!intent.ref || servedOn(w, p.ref)!.ref === intent.ref));
      if (!plate) {
        plate = plates.filter((p) => !p.ou.includes('sale') && !servedOn(w, p.ref)).sort((a, b) => +w.enMain.includes(a.ref) - +w.enMain.includes(b.ref) || +!p0OnTable(w, a) - +!p0OnTable(w, b) || a.distance - b.distance)[0];
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
      // la fourchette en main (la cuillère pour le bol ; une propre de préférence), rien de gros dans l'autre
      const cutlery = plate.nom === 'bol' ? 'cuillère' : 'fourchette';
      const forks = w.objets.filter((o) => o.nom === cutlery).sort((a, b) => +a.ou.includes('sale') - +b.ou.includes('sale') || a.distance - b.distance);
      const fork = forks.find((o) => w.enMain.includes(o.ref)) ?? forks[0];
      if (!fork) throw new Failed(`Il n’y a pas de ${cutlery}.`);
      await freeHands(game, act, (ref) => ref === fork.ref || world(game).objets.find((o) => o.ref === ref)?.nom === 'couteau de table');
      await take(game, act, fork.ref);
      // le couteau de table dans l'autre main s'il y en a un propre : on coupe d'abord en bouchées
      w = world(game);
      const knife = w.objets.find((o) => o.nom === 'couteau de table' && (w.enMain.includes(o.ref) || (!o.ou.includes('sale') && isLoose(o))));
      if (knife && w.enMain.length < 2) await take(game, act, knife.ref).catch(() => {});
      await act('attabler', { assiette: plate.ref });
      if (knife && world(game).enMain.includes(knife.ref)) await act('couper_assiette').catch(() => {});
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
      if (world(game).perso.includes('couché dans')) return act('reveiller');
      if (!world(game).perso.includes('assis')) return;
      return act('lever');
    case 'arreter_lire':
      if (!world(game).lit) return;
      return act('arreter_lire');
    case 'casser_oeuf': {
      // dans le saladier (pris s'il est nommé ou tenu), sinon la poêle sur le feu
      const w = world(game);
      const bowl = intent.dans ? w.objets.find((o) => o.ref === intent.dans) : w.objets.find((o) => o.nom === 'saladier' && w.enMain.includes(o.ref));
      if (bowl?.nom === 'saladier') {
        await take(game, act, bowl.ref);
        return crackInto(game, act, bowl.ref);
      }
      const { pan } = await panOnStove(game, act, bowl?.nom ?? 'poêle');
      await freeHands(game, act, () => false);
      return crackInto(game, act, pan);
    }
    case 'fouetter': {
      const bowl = nearestNamed(game, 'saladier');
      if (!bowl) throw new Failed('Il n’y a pas de saladier.');
      await take(game, act, bowl.ref);
      return whisk(game, act, bowl.ref);
    }
    case 'remuer':
      await takeTool(game, act, ['spatule', 'cuillère en bois']);
      return act('remuer', intent.ref ? { objet: intent.ref } : {});
    case 'sauter': {
      // une main libre pour prendre la poêle
      const w = world(game);
      if (!w.mainsLibres) await dropLoad(act, w.mains[w.mains.length - 1]);
      return act('faire_sauter', intent.ref ? { objet: intent.ref } : {});
    }
    case 'servir_poele':
      await takeTool(game, act, ['spatule', 'louche', 'cuillère en bois']);
      return act('servir_poele', intent.sur ? { assiette: intent.sur } : {});
    case 'assaisonner': {
      const jar = await takeTool(game, act, [intent.epice], (ref) => ref === intent.ref);
      await act('assaisonner', intent.ref ? { objet: intent.ref } : {});
      // le pot retourne sur l'étagère (les sauces et condiments restent en main)
      if (CONDIMENTS[intent.epice]) return;
      const shelf = world(game).objets.find((o) => o.nom === 'étagère à épices');
      return shelf ? act('ranger', { meuble: shelf.ref, objet: jar }).then(() => {}, () => {}) : undefined;
    }
    case 'tartiner': {
      const w = world(game);
      const pots = ['confiture', 'pâte à tartiner', 'miel', 'beurre'];
      const pot = intent.pot ?? pots.find((n) => w.objets.some((o) => o.nom === n && w.enMain.includes(o.ref))) ?? pots.find((n) => w.objets.some((o) => o.nom === n));
      if (!pot) throw new Failed('Il n’y a rien à tartiner (confiture, miel, pâte à tartiner, beurre).');
      const potRef = await takeTool(game, act, [pot]);
      await takeTool(game, act, ['couteau de table', 'couteau'], (ref) => ref === potRef);
      return act('tartiner', intent.ref ? { objet: intent.ref } : {});
    }
    case 'raper': {
      const rasp = await takeTool(game, act, ['râpe']);
      await takeTool(game, act, ['fromage'], (ref) => ref === rasp);
      return act('raper', intent.ref ? { objet: intent.ref } : {});
    }
    case 'gouter':
      await takeTool(game, act, ['cuillère', 'cuillère en bois']);
      return act('gouter', intent.ref ? { objet: intent.ref } : {});
    case 'omelette': {
      const { pan, stove } = await panOnStove(game, act);
      await freeHands(game, act, () => false);
      const bowl = await bowlInHand(game, act);
      const ou = () => world(game).objets.find((o) => o.ref === bowl)?.ou ?? '';
      if (!ou().includes('œufs battus')) {
        for (let i = 0; i < 2; i++) await crackInto(game, act, bowl);
        await whisk(game, act, bowl);
      }
      await act('verser_pate', { poele: pan });
      return cookAndServe(game, act, pan, stove, 'omelette');
    }
    case 'crepe': {
      const { pan, stove } = await panOnStove(game, act);
      await freeHands(game, act, () => false);
      const bowl = await bowlInHand(game, act);
      const ou = () => world(game).objets.find((o) => o.ref === bowl)?.ou ?? '';
      if (!ou().includes('pâte à crêpes')) {
        if (ou().includes('contient') && !/œuf|lait|farine/.test(ou())) throw new Failed('Le saladier n’est pas vide : vide-le ou lave-le d’abord.');
        const keepBowl = (ref: string) => ref === bowl;
        if (!ou().includes('œuf')) await crackInto(game, act, bowl);
        if (!ou().includes('lait')) {
          const milk = await takeTool(game, act, ['lait'], keepBowl);
          await act('verser', { dans: bowl });
          await act('poser', { objet: milk });
        }
        if (!ou().includes('farine')) {
          const flour = await takeTool(game, act, ['farine'], keepBowl);
          await act('ajouter_saladier', { saladier: bowl });
          await act('poser', { objet: flour });
        }
        await whisk(game, act, bowl);
      }
      await act('verser_pate', { poele: pan });
      // retournée à la spatule (sûr) : « fais sauter la crêpe » reste le geste du joueur
      return cookAndServe(game, act, pan, stove, 'crêpe');
    }
    case 'oeuf_plat': {
      const { pan, stove } = await panOnStove(game, act);
      await freeHands(game, act, () => false);
      await crackInto(game, act, pan);
      return cookAndServe(game, act, pan, stove, 'œuf au plat');
    }
    case 'recette': {
      await cookFromBook(game, act, intent.nom);
      // les ustensiles et ingrédients qu'on tient encore retournent à leur place (le plat reste servi)
      const drink = (ref: string) => world(game).objets.some((o) => o.ref === ref && o.sorte === 'récipient' && o.ou.includes('contient'));
      for (const ref of world(game).enMain) if (!drink(ref)) await putBack(game, act, ref);
      return;
    }
    case 'magasin':
      return act('magasin');
    case 'acheter':
      return act('acheter', { objets: intent.lignes.map((l) => `${l.id}×${l.n}`).join(',') });
    case 'vendre': {
      if (!intent.noms?.length) return act('vendre');
      // les repères changent à chaque vente : on cherche à nouveau à chaque fois
      let sold = 0;
      for (let i = 0; i < 20; i++) {
        const offer = game.marketItems().find((m) => intent.noms!.includes(m.name));
        if (!offer) break;
        await act('vendre', { objet: offer.ref });
        sold++;
        if (!intent.tous) break;
      }
      if (!sold) throw new Failed(`Le marché ne rachète pas ça : ${intent.noms.join(', ')}.`);
      return;
    }
    case 'argent':
      return act('argent');
  }
}
