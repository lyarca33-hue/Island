/**
 * Ordres simples en français, compris sans IA : « prends la tasse », « range tous les livres »,
 * « va à la table puis pose la lettre », « fais-toi un café », « lis le livre rouge », « dis bonjour »,
 * « assieds-toi sur la chaise », « lève-toi », « cuis la pomme », « jette la bouteille », « fais la
 * vaisselle ». Rend null dès
 * qu'un morceau de l'ordre n'est pas compris : l'ordre part alors au modèle de chat.
 */
import type { WorldObject } from '../game/Game';
import type { Intent } from './tasks';

/** Minuscules, sans accents ni ponctuation, apostrophes et tirets en espaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERBS: Record<string, string[]> = {
  prendre: ['prends', 'prend', 'prendre', 'attrape', 'attraper', 'ramasse', 'ramasser', 'saisis', 'saisir', 'recupere', 'recuperer', 'sors', 'sort', 'sortir'],
  poser: ['pose', 'poser', 'repose', 'reposer', 'lache', 'lacher', 'depose', 'deposer', 'mets', 'met', 'mettre', 'remets', 'remettre'],
  ranger: ['range', 'ranger', 'rangez'],
  aller: ['va', 'vas', 'aller', 'marche', 'marcher', 'cours', 'courir', 'rejoins', 'rejoindre', 'approche', 'approcher'],
  cafe: ['fais', 'fait', 'faire', 'prepare', 'preparer', 'sers', 'servir'],
  boire: ['bois', 'boit', 'boire'],
  manger: ['mange', 'manges', 'manger', 'croque', 'croquer', 'grignote', 'grignoter', 'avale', 'avaler'],
  dire: ['dis', 'dit', 'dire', 'crie', 'crier'],
  lire: ['lis', 'lit', 'lire', 'ouvre', 'ouvrir', 'feuillette', 'feuilleter', 'bouquine'],
  remplir: ['remplis', 'remplir', 'remplit', 'rempli'],
  laver: ['lave', 'laver', 'lavez', 'rince', 'rincer', 'debarbouille', 'debarbouiller'],
  asseoir: ['assieds', 'assied', 'assois', 'assoit', 'asseoir', 'assoir', 'assoie', 'rassieds', 'rassois'],
  lever: ['leve', 'lever', 'releve', 'relever', 'debout'],
  arreter: ['arrete', 'arreter', 'stop', 'stoppe', 'ferme', 'fermer', 'referme', 'refermer', 'cesse', 'eteins', 'eteint', 'eteindre'],
  allumer: ['allume', 'allumer', 'lance', 'lancer', 'demarre', 'demarrer', 'active', 'activer'],
  cuire: ['cuis', 'cuit', 'cuire', 'rechauffe', 'rechauffer', 'chauffe', 'chauffer', 'grille', 'griller'],
  jeter: ['jette', 'jeter', 'balance', 'balancer'],
  vider: ['vide', 'vider'],
};
/** Verbes qui réchauffent (au micro-ondes) plutôt que cuire (au four). */
const REHEAT = new Set(['rechauffe', 'rechauffer', 'chauffe', 'chauffer']);
/** Meubles qu'on ouvre et ferme (porte, tiroir, couvercle). */
const OPENS = new Set(['frigo', 'placard', 'appareil', 'poubelle']);
/** Où se range un objet qui ne va ni au frais ni dans la bibliothèque. */
const STORED_IN: Record<string, string> = { tasse: 'placard', lettre: 'tiroir' };
const VERB_OF = new Map(Object.entries(VERBS).flatMap(([k, vs]) => vs.map((v) => [v, k] as const)));

/** Formules de politesse et tournures à ignorer en tête d'ordre. */
const FILLERS = [
  'est ce que tu peux', 'est ce que tu pourrais', 'tu peux', 'tu pourrais', 'peux tu', 'pourrais tu', 'tu veux bien',
  'je veux que tu', 'j aimerais que tu', 'il faut', 'merci de', 'stp', 'svp', 's il te plait', 's il vous plait',
  'allez', 'bon', 'alors', 'maintenant', 'et',
];
/** Petits mots sans importance pour reconnaître un objet. */
const STOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'a', 'au', 'aux', 'toi', 'moi', 'te', 'me', 'm', 't', 'se', 's', 'y', 'en', 'vers', 'jusqu', 'jusque', 'sur', 'dans', 'tous', 'toutes', 'tout', 'toute', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'qui', 'trainent', 'traine', 'piece', 'ici', 'et', 'aussi', 'stp', 'svp']);

/** Autres noms donnés aux objets (forme normalisée). */
const ALIASES: Record<string, string[]> = {
  livre: ['livre', 'livres', 'bouquin', 'bouquins'],
  tasse: ['tasse', 'mug'],
  lettre: ['lettre', 'courrier', 'enveloppe'],
  caisse: ['caisse', 'carton', 'boite'],
  bibliotheque: ['bibliotheque', 'etagere', 'etageres'],
  table: ['table'],
  chaise: ['chaise', 'chaises', 'siege'],
  'machine a cafe': ['machine', 'cafetiere'],
  evier: ['evier', 'lavabo', 'robinet'],
  frigo: ['frigo', 'frigos', 'frigidaire', 'refrigerateur'],
  'bouteille d eau': ['bouteille', 'bouteilles'],
  pomme: ['pomme', 'pommes', 'fruit', 'fruits'],
  sandwich: ['sandwich', 'sandwichs', 'sandwiches', 'casse'],
  placard: ['placard', 'placards', 'armoire', 'buffet'],
  tiroir: ['tiroir', 'tiroirs'],
  four: ['four', 'fours'],
  'micro ondes': ['micro', 'microondes', 'ondes'],
  'lave vaisselle': ['vaisselle'],
  poubelle: ['poubelle', 'poubelles', 'corbeille'],
};

/** Mots qui désignent l'objet : son nom, ses autres noms, et sa couleur pour les livres (« livre-rouge »). */
function words(o: WorldObject): { kind: string[]; detail: string[] } {
  const nom = normalize(o.nom);
  const kind = ALIASES[nom] ?? [nom];
  const detail = normalize(o.ref).split(' ').filter((w) => !kind.includes(w) && !/^\d+$/.test(w));
  return { kind, detail };
}

/** Objets nommés dans `clause` (les plus proches d'abord), et si l'ordre vise tous ceux de ce genre. */
function findObjects(clause: string[], objets: WorldObject[]): { found: WorldObject[]; all: boolean } {
  const found = objets.filter((o) => {
    const { kind, detail } = words(o);
    const i = clause.findIndex((w) => kind.includes(w));
    if (i < 0) return false;
    // une couleur juste après le nom (« le livre rouge ») restreint aux livres de cette couleur
    const colour = clause[i + 1];
    if (colour && !STOP.has(colour) && !VERB_OF.has(colour) && !Object.values(ALIASES).flat().includes(colour)) return detail.includes(colour);
    return true;
  });
  found.sort((a, b) => a.distance - b.distance);
  // « tous », « les », ou un nom au pluriel (« livres »)
  const all = clause.some((w) => ['tous', 'toutes', 'les'].includes(w) || (w.endsWith('s') && w.length > 3 && Object.values(ALIASES).flat().includes(w)));
  return { found, all };
}

/** Découpe l'ordre en morceaux (« … puis … », « … et va … »), en gardant le texte d'origine. */
function clauses(text: string): string[] {
  // le texte entre guillemets (« dis "Salut !" ») ne se découpe pas
  const quotes: string[] = [];
  text = text.replace(/["«“][^"»”]*["»”]/g, (q) => `\u0000${quotes.push(q) - 1}\u0000`);
  const restore = (p: string) => p.replace(/\u0000(\d+)\u0000/g, (_, i) => quotes[+i]);
  const parts = text.split(/\s*(?:[.;!?]+|,\s*(?:puis|ensuite|apr[eè]s)?|\b(?:et\s+)?(?:puis|ensuite|apr[eè]s ça|apr[eè]s)\b)\s*/i).filter((p) => p.trim());
  // « et » ne coupe que s'il est suivi d'un verbe d'ordre (« prends la tasse et bois »)
  const out: string[] = [];
  for (const p of parts) {
    const bits = p.split(/\s+et\s+/i);
    let cur = bits[0];
    for (const b of bits.slice(1)) {
      const first = normalize(b).split(' ')[0];
      if (VERB_OF.has(first)) {
        out.push(cur);
        cur = b;
      } else cur += ` et ${b}`;
    }
    out.push(cur);
  }
  return out.map(restore);
}

/** Retire les formules de politesse en tête (sur le texte normalisé). */
function stripFillers(w: string[]): string[] {
  let again = true;
  while (again && w.length) {
    again = false;
    for (const f of FILLERS) {
      const fw = f.split(' ');
      if (fw.every((x, i) => w[i] === x)) {
        w = w.slice(fw.length);
        again = true;
      }
    }
  }
  return w;
}

/** Comprend un ordre ; null s'il faut demander à l'IA. */
export function parseOrder(text: string, world: { enMain: string[]; objets: WorldObject[] }): Intent[] | null {
  const out: Intent[] = [];
  const parts = clauses(text);
  if (!parts.length) return null;
  for (const original of parts) {
    let w = stripFillers(normalize(original).split(' '));
    // « va prendre la tasse » : aller + autre verbe → seulement l'autre verbe
    // « va te laver » : le pronom entre les deux
    if (VERB_OF.get(w[0]) === 'aller' && ['te', 't'].includes(w[1]) && VERB_OF.has(w[2])) w = [w[0], ...w.slice(2)];
    if (VERB_OF.get(w[0]) === 'aller' && w[1] && VERB_OF.has(w[1]) && VERB_OF.get(w[1]) !== 'aller') w = w.slice(1);
    // « fais-toi un café », « sers-moi » : le pronom suit le verbe
    const verb = VERB_OF.get(w[0]);
    if (!verb) return null;
    const rest = w.slice(1);
    const intent = parseClause(verb, rest, original, world, w[0]);
    if (!intent?.length) return null;
    out.push(...intent);
  }
  return out;
}

function parseClause(verb: string, rest: string[], original: string, world: { enMain: string[]; objets: WorldObject[] }, word = ''): Intent[] | null {
  const { found, all } = findObjects(rest, world.objets);
  const appliance = (nom: string) => world.objets.find((o) => o.nom === nom);
  const held = world.objets.filter((o) => world.enMain.includes(o.ref));
  switch (verb) {
    case 'prendre': {
      // ceux qui traînent avant ceux qui sont rangés, puis les plus proches
      const portable = found.filter((o) => o.portable && !world.enMain.includes(o.ref)).sort((a, b) => +!isLoose(a) - +!isLoose(b));
      if (!portable.length) return null;
      // « prends 2 livres », « prends les livres » : une pile (6 au plus) ; sinon un seul objet
      const n = portable[0].nom === 'livre' ? Math.min(6, count(rest) ?? (all ? 6 : 1)) : 1;
      return portable.filter((o) => o.nom === portable[0].nom).slice(0, n).map((o) => ({ kind: 'prendre', ref: o.ref }));
    }
    case 'poser': {
      // « pose la tasse sur la caisse » : prendre la tasse si besoin, aller à la caisse, poser
      // « au four », « à la poubelle » seulement si un objet suit (« pose la tasse au sol » : devant soi)
      const where = rest.findIndex((x, i) => x === 'sur' || x === 'dans' || x === 'pres' || ((x === 'au' || x === 'a') && findObjects(rest.slice(i + 1), world.objets).found.length > 0));
      const what = (where >= 0 ? findObjects(rest.slice(0, where), world.objets).found : found).filter((o) => o.portable);
      const item = what.find((o) => world.enMain.includes(o.ref)) ?? what[0];
      const target = where >= 0 ? findObjects(rest.slice(where + 1), world.objets).found.find((o) => o.ref !== item?.ref) : undefined;
      if (where >= 0 && !target) return null;
      if (target?.sorte === 'rangement' && (item?.nom ?? held[0]?.nom) === 'livre') return [{ kind: 'ranger', refs: item ? [item.ref] : [], onlyHeld: !item }];
      // « mets la pomme dans le frigo », « mets la tasse au lave-vaisselle », « mets la bouteille à la poubelle »
      if (target && OPENS.has(target.sorte ?? '') && target.sorte !== 'poubelle') return [{ kind: 'mettre', ref: item?.ref, dans: target.ref }];
      if (target?.sorte === 'poubelle') return [{ kind: 'jeter', ref: item?.ref }];
      return [{ kind: 'poser', ref: item?.ref, sur: target?.ref }];
    }
    case 'ranger': {
      // « range-le » : ce qu'on tient
      if (rest.length && rest.every((x) => ['le', 'la', 'les', 'l', 'ca'].includes(x))) return [{ kind: 'ranger', refs: [], onlyHeld: true }];
      const things = found.filter((o) => o.portable);
      // « range la pomme (dans le frigo) » : ce qui se garde au frais
      const fridge = world.objets.find((o) => o.sorte === 'frigo');
      const cold = things.filter((o) => o.sorte === 'nourriture' || o.nom === 'bouteille d\'eau');
      if (fridge && cold.length && cold.length === things.length) return [{ kind: 'mettre', ref: (cold.find((o) => !o.ou.startsWith('rangé')) ?? cold[0]).ref, dans: fridge.ref }];
      // « range la tasse » (au placard), « range la lettre » (dans le tiroir)
      const other = things.find((o) => o.nom !== 'livre');
      if (other) {
        const where = found.find((o) => OPENS.has(o.sorte ?? '') && o.sorte !== 'poubelle') ?? world.objets.find((o) => o.nom === STORED_IN[other.nom]);
        return where && things.every((o) => o.nom === other.nom) ? [{ kind: 'mettre', ref: (things.find(isLoose) ?? other).ref, dans: where.ref }] : null;
      }
      // « range » tout court, « range les livres », « range le livre rouge »
      if (all || !things.length) return [{ kind: 'ranger', refs: [] }];
      return [{ kind: 'ranger', refs: [(things.find(isLoose) ?? things[0]).ref] }];
    }
    case 'aller': {
      const target = found[0];
      return target ? [{ kind: 'aller', ref: target.ref }] : null;
    }
    case 'cafe':
      // « fais ta toilette »
      if (rest.includes('toilette')) return [{ kind: 'laver', visage: true }];
      // « fais cuire la pomme », « fais chauffer le sandwich »
      if (VERB_OF.get(rest[0]) === 'cuire') return parseClause('cuire', rest.slice(1), original, world, rest[0]);
      // « fais la vaisselle »
      if (rest.includes('vaisselle')) return dishes(world);
      return rest.includes('cafe') ? [{ kind: 'cafe' }] : null;
    case 'boire': {
      // « bois la bouteille », « bois de l'eau » (une bouteille pleine s'il y en a, sinon la tasse remplie à l'évier), « bois un café »
      const liquide = rest.includes('eau') ? 'eau' : rest.includes('cafe') ? 'café' : undefined;
      const drink = found.filter((o) => o.sorte === 'récipient');
      if (found.length && !drink.length) return null;
      const full = (o: WorldObject) => o.ou.includes('contient');
      const named = drink.find((o) => world.enMain.includes(o.ref)) ?? drink[0];
      const bottles = world.objets.filter((o) => o.sorte === 'récipient' && o.nom !== 'tasse' && full(o));
      const bottle = liquide === 'eau' && !named ? (bottles.find((o) => world.enMain.includes(o.ref)) ?? bottles[0]) : undefined;
      return [{ kind: 'boire', ref: (named ?? bottle)?.ref, liquide }];
    }
    case 'manger': {
      // « mange une pomme », « mange » (ce qu'on tient, sinon ce qu'il y a)
      const food = found.filter((o) => o.sorte === 'nourriture');
      if (found.length && !food.length) return null;
      return [{ kind: 'manger', ref: (food.find((o) => world.enMain.includes(o.ref)) ?? food[0])?.ref }];
    }
    case 'remplir':
      // « remplis la tasse (d'eau / de café) » ; d'eau si rien n'est dit
      if (found.some((o) => o.sorte !== 'récipient' && o.sorte !== 'évier' && o.sorte !== 'machine')) return null;
      return [rest.includes('cafe') ? { kind: 'cafe' } : { kind: 'eau' }];
    case 'laver': {
      // « lave la vaisselle », « lave la tasse » : au lave-vaisselle
      if (found.length && found.every((o) => o.sorte === 'appareil' || o.sorte === 'récipient') && appliance('lave-vaisselle')) {
        const cups = found.filter((o) => o.nom === 'tasse');
        if (!cups.length) return dishes(world);
        const lv = appliance('lave-vaisselle')!;
        return [...cups.slice(0, all ? cups.length : 1).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: lv.ref })), { kind: 'allumer', ref: lv.ref }];
      }
      // « lave-toi les mains », « lave-toi », « rince-toi le visage »
      if (found.some((o) => o.sorte !== 'évier')) return null;
      const self = rest.some((x) => ['toi', 'te', 't', 'mains', 'main', 'visage', 'figure', 'corps'].includes(x)) || !rest.length;
      if (!self) return null;
      const handsOnly = rest.some((x) => x === 'mains' || x === 'main') && !rest.some((x) => x === 'visage' || x === 'figure');
      return [{ kind: 'laver', visage: !handsOnly }];
    }
    case 'lire': {
      // « ouvre le frigo », « ouvre le four », « ouvre le tiroir »
      const door = found.find((o) => OPENS.has(o.sorte ?? ''));
      if (door) return [{ kind: 'ouvrir', ref: door.ref }];
      // « lis le livre rouge », « lis un livre », « lis » (celui qu'on tient)
      const books = found.filter((o) => o.nom === 'livre');
      if (found.length && !books.length) return null;
      const named = rest.some((x) => x === 'livre') && rest.some((x) => !STOP.has(x) && x !== 'livre');
      return [{ kind: 'lire', ref: named ? books.find(isLoose)?.ref ?? books[0]?.ref : undefined }];
    }
    case 'asseoir': {
      // « assieds-toi », « assieds-toi sur la chaise » (sinon le siège le plus proche)
      const seat = found.find((o) => o.sorte === 'siège');
      if (found.length && !seat) return null;
      return [{ kind: 'asseoir', ref: seat?.ref }];
    }
    case 'lever':
      return [{ kind: 'lever' }];
    case 'arreter': {
      // « éteins le four », « arrête le lave-vaisselle » ; « ferme le four » : la porte
      const closes = ['ferme', 'fermer', 'referme', 'refermer'].includes(word);
      const app = found.find((o) => o.sorte === 'appareil');
      if (app && !closes) return [{ kind: 'eteindre', ref: app.ref }];
      // « ferme le frigo », « ferme le tiroir »
      if (OPENS.has(found[0]?.sorte ?? '')) return [{ kind: 'fermer', ref: found[0].ref }];
      // « arrête de lire », « ferme le livre », « stop »
      return !rest.length || rest.some((x) => ['lire', 'lecture', 'livre', 'lis'].includes(x)) ? [{ kind: 'arreter_lire' }] : null;
    }
    case 'allumer': {
      // « allume le four », « lance le lave-vaisselle »
      const app = found.find((o) => o.sorte === 'appareil');
      return app ? [{ kind: 'allumer', ref: app.ref }] : null;
    }
    case 'cuire': {
      // « cuis la pomme (au four) », « réchauffe le sandwich (au micro-ondes) »
      const app = found.find((o) => o.sorte === 'appareil' && o.nom !== 'lave-vaisselle') ?? appliance(REHEAT.has(word) ? 'micro-ondes' : 'four') ?? appliance('four') ?? appliance('micro-ondes');
      const food = found.filter((o) => o.sorte === 'nourriture');
      if (!app || found.some((o) => o.sorte !== 'nourriture' && o.sorte !== 'appareil')) return null;
      const held = world.objets.filter((o) => world.enMain.includes(o.ref) && o.sorte === 'nourriture');
      const item = food.find((o) => world.enMain.includes(o.ref)) ?? food.find(isLoose) ?? food[0] ?? held[0];
      // rien de nommé : on lance l'appareil avec ce qu'il contient
      if (!item) return [{ kind: 'allumer', ref: app.ref }];
      return [{ kind: 'mettre', ref: item.ref, dans: app.ref }, { kind: 'allumer', ref: app.ref }];
    }
    case 'jeter': {
      // « jette la bouteille », « jette ça » (ce qu'on tient)
      const thing = found.filter((o) => o.portable);
      if (found.length && !thing.length) return null;
      return [{ kind: 'jeter', ref: (thing.find((o) => world.enMain.includes(o.ref)) ?? thing[0])?.ref }];
    }
    case 'vider': {
      // « vide la poubelle »
      const bin = found.find((o) => o.sorte === 'poubelle') ?? (!found.length ? world.objets.find((o) => o.sorte === 'poubelle') : undefined);
      return bin ? [{ kind: 'vider', ref: bin.ref }] : null;
    }
    case 'dire': {
      // le texte d'origine après le verbe (« dis bonjour à tous » → « bonjour à tous »)
      const m = original.match(/^.*?\b(?:dis|dit|dire|crie|crier)\b\s*(?:que\s+|qu['’]\s*|:\s*)?(.+)$/i);
      const said = m?.[1].trim().replace(/^["«“]\s*|\s*["»”]$/g, '');
      if (!said) return null;
      return [{ kind: 'dire', texte: said.charAt(0).toUpperCase() + said.slice(1) }];
    }
  }
  return null;
}

const NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, quelques: 3 };

/** Nombre demandé (« 2 livres », « trois livres »), ou null. */
function count(words: string[]): number | null {
  for (const w of words) {
    if (/^\d+$/.test(w)) return Math.max(1, +w);
    if (w in NUMBERS) return NUMBERS[w];
  }
  return null;
}

const isLoose = (o: WorldObject) => o.ou !== 'en main' && !o.ou.startsWith('rangé');

/** Faire la vaisselle : les tasses sales au lave-vaisselle, puis le lancer. */
function dishes(world: { objets: WorldObject[] }): Intent[] | null {
  const lv = world.objets.find((o) => o.nom === 'lave-vaisselle');
  if (!lv) return null;
  const dirty = world.objets.filter((o) => o.sorte === 'récipient' && o.ou.includes(', sale') && !o.ou.startsWith(`rangé dans ${lv.ref}`));
  return [...dirty.map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: lv.ref })), { kind: 'allumer', ref: lv.ref }];
}

/**
 * Pourquoi un ordre n'est pas compris sans IA, morceau par morceau : le verbe inconnu, ou le
 * verbe reconnu sans objet reconnu, ou les deux reconnus mais la tournure pas prise en charge.
 * Pour le journal des manques ; `quoi` est ce qui manque (le verbe inconnu, sinon l'ordre).
 */
export function explainOrder(text: string, objets: WorldObject[]): { quoi: string; cause: string; detail: string } {
  for (const original of clauses(text)) {
    let w = stripFillers(normalize(original).split(' '));
    if (VERB_OF.get(w[0]) === 'aller' && ['te', 't'].includes(w[1]) && VERB_OF.has(w[2])) w = [w[0], ...w.slice(2)];
    if (VERB_OF.get(w[0]) === 'aller' && w[1] && VERB_OF.has(w[1]) && VERB_OF.get(w[1]) !== 'aller') w = w.slice(1);
    if (!w[0]) continue;
    const verb = VERB_OF.get(w[0]);
    const rest = w.slice(1);
    const names = [...new Set(findObjects(rest, objets).found.map((o) => o.nom))];
    if (!verb) {
      const seen = names.length ? ` (objet reconnu : ${names.join(', ')})` : '';
      return { quoi: w[0], cause: 'verbe inconnu', detail: `Le verbe « ${w[0]} » n’est pas connu sans IA${seen}.` };
    }
    if (parseClause(verb, rest, original, { enMain: [], objets })?.length) continue;
    const words = rest.filter((x) => !STOP.has(x));
    if (!names.length && words.length) {
      return { quoi: words.join(' '), cause: 'objet inconnu', detail: `Verbe « ${w[0]} » compris, mais aucun objet de la pièce reconnu dans « ${words.join(' ')} ».` };
    }
    return { quoi: normalize(text), cause: 'tournure non prise en charge', detail: `Verbe « ${w[0]} »${names.length ? ` et ${names.join(', ')}` : ''} reconnus, mais cette combinaison n’est pas comprise sans IA.` };
  }
  return { quoi: normalize(text), cause: 'autre', detail: 'Pas compris sans IA.' };
}
