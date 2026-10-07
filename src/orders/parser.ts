/**
 * Ordres simples en français, compris sans IA : « prends la tasse », « range tous les livres »,
 * « va à la table puis pose la lettre », « fais-toi un café », « lis le livre rouge », « dis bonjour »,
 * « assieds-toi sur la chaise », « lève-toi », « fais cuire le steak », « éteins le feu »,
 * « sers le sandwich dans l'assiette », « mange à table », « fais la vaisselle », « cuis la pomme
 * de terre au four », « jette la bouteille », « lance le lave-vaisselle ». Rend null dès
 * qu'un morceau de l'ordre n'est pas compris : l'ordre part alors au modèle de chat.
 */
import type { WorldObject } from '../game/Game';
import { RECIPES } from '../game/items/recipes';
import { FRUITS } from '../game/items/kitchen';
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
  couper: ['coupe', 'coupes', 'couper', 'decoupe', 'decouper', 'tranche', 'trancher', 'emince', 'emincer', 'hache', 'hacher'],
  dire: ['dis', 'dit', 'dire', 'crie', 'crier'],
  lire: ['lis', 'lit', 'lire', 'ouvre', 'ouvrir', 'feuillette', 'feuilleter', 'bouquine'],
  remplir: ['remplis', 'remplir', 'remplit', 'rempli'],
  laver: ['lave', 'laver', 'lavez', 'rince', 'rincer', 'debarbouille', 'debarbouiller'],
  asseoir: ['assieds', 'assied', 'assois', 'assoit', 'asseoir', 'assoir', 'assoie', 'rassieds', 'rassois'],
  lever: ['leve', 'lever', 'releve', 'relever', 'debout'],
  dormir: ['dors', 'dort', 'dormir', 'couche', 'coucher', 'recouche', 'endors', 'endormir', 'sieste', 'roupille', 'roupiller'],
  reveiller: ['reveille', 'reveiller', 'reveil'],
  mixer: ['mixe', 'mixer', 'mixes', 'mouline'],
  cuire: ['cuis', 'cuit', 'cuire', 'cuisine', 'cuisiner', 'grille', 'griller', 'rechauffe', 'rechauffer', 'chauffe', 'chauffer'],
  allumer: ['allume', 'allumer', 'rallume', 'rallumer', 'lance', 'lancer', 'demarre', 'demarrer', 'active', 'activer'],
  eteindre: ['eteins', 'eteint', 'eteindre', 'coupe', 'couper'],
  arreter: ['arrete', 'arreter', 'stop', 'stoppe', 'ferme', 'fermer', 'referme', 'refermer', 'cesse'],
  jeter: ['jette', 'jeter', 'balance', 'balancer'],
  vider: ['vide', 'vider'],
  verser: ['verse', 'verser', 'transvase', 'transvaser'],
  boucher: ['bouche', 'boucher', 'rebouche', 'reboucher'],
  enlever: ['enleve', 'enlever', 'retire', 'retirer'],
  regarder: ['regarde', 'regarder', 'inspecte', 'inspecter', 'fouille', 'fouiller', 'inventorie'],
  laisser: ['laisse', 'laisser'],
  charger: ['charge', 'charger', 'chargez'],
  debarrasser: ['debarrasse', 'debarrasser', 'dessers', 'desservir'],
  tirer: ['tire', 'tirer', 'recule', 'reculer'],
  pousser: ['pousse', 'pousser', 'glisse', 'glisser', 'rentre', 'rentrer'],
  essuyer: ['essuie', 'essuyer', 'nettoie', 'nettoyer', 'eponge', 'eponger'],
  empiler: ['empile', 'empiler'],
};
/** Verbes qui réchauffent (au micro-ondes) plutôt que cuire (au four). */
const REHEAT = new Set(['rechauffe', 'rechauffer', 'chauffe', 'chauffer']);
/** Meubles qu'on ouvre et ferme (porte, tiroir, couvercle). */
const OPENS = new Set(['frigo', 'placard', 'appareil', 'poubelle']);
/** Meubles où l'on range (et où l'on peut regarder ce qu'il y a). */
const STORES = new Set(['frigo', 'placard', 'rangement']);
/** Où se range un objet qui ne va ni au frais ni dans la bibliothèque. */
const STORED_IN: Record<string, string> = { tasse: 'placard', assiette: 'placard', lettre: 'tiroir', fourchette: 'tiroir', 'couteau de table': 'tiroir' };
const VERB_OF = new Map(Object.entries(VERBS).flatMap(([k, vs]) => vs.map((v) => [v, k] as const)));

/** Formules de politesse et tournures à ignorer en tête d'ordre. */
const FILLERS = [
  'est ce que tu peux', 'est ce que tu pourrais', 'tu peux', 'tu pourrais', 'peux tu', 'pourrais tu', 'tu veux bien',
  'je veux que tu', 'j aimerais que tu', 'il faut', 'merci de', 'stp', 'svp', 's il te plait', 's il vous plait',
  'allez', 'bon', 'alors', 'maintenant', 'et',
];
/** Petits mots sans importance pour reconnaître un objet. */
const STOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'a', 'au', 'aux', 'toi', 'moi', 'te', 'me', 'm', 't', 'se', 's', 'y', 'en', 'vers', 'jusqu', 'jusque', 'sur', 'dans', 'tous', 'toutes', 'tout', 'toute', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'qui', 'trainent', 'traine', 'piece', 'ici', 'et', 'aussi', 'stp', 'svp', 'ouvert', 'ouverte', 'ouverts', 'place', 'sous', 'dessous']);

/** Autres noms donnés aux objets (forme normalisée). */
const ALIASES: Record<string, string[]> = {
  livre: ['livre', 'livres', 'bouquin', 'bouquins'],
  tasse: ['tasse', 'mug'],
  lettre: ['lettre', 'courrier', 'enveloppe'],
  caisse: ['caisse', 'carton', 'boite'],
  bibliotheque: ['bibliotheque', 'etagere', 'etageres'],
  canape: ['canape', 'sofa', 'divan', 'canap'],
  'table basse': ['basse'],
  tele: ['tele', 'television', 'tv', 'teloche', 'ecran', 'poste'],
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
  'boite de pastilles': ['pastille', 'pastilles', 'boite'],
  poubelle: ['poubelle', 'poubelles', 'corbeille'],
  assiette: ['assiette', 'assiettes'],
  fourchette: ['fourchette', 'fourchettes', 'couverts'],
  'couteau de table': ['couteau', 'couteaux', 'couverts'],
  gaziniere: ['gaziniere', 'cuisiniere', 'feu', 'feux', 'gaz', 'plaque', 'plaques'],
  poele: ['poele', 'poeles'],
  casserole: ['casserole', 'casseroles'],
  steak: ['steak', 'steaks', 'steack', 'viande', 'bifteck'],
  'pomme de terre': ['patate', 'patates', 'terre'],
  'plan de travail': ['plan', 'comptoir', 'paillasse'],
  'planche a decouper': ['planche', 'planches'],
  couteau: ['couteau', 'couteaux'],
  pain: ['pain', 'pains', 'miche', 'batard'],
  carotte: ['carotte', 'carottes'],
  tomate: ['tomate', 'tomates'],
  concombre: ['concombre', 'concombres'],
  'quartiers de pomme': ['quartiers', 'quartier'],
  'tranches de pain': ['tranches', 'tranche', 'tartine', 'tartines'],
  'pain grille': ['toast', 'toasts', 'grillees', 'grille'],
  'grille pain': ['toaster', 'grille', 'grillepain'],
  'rondelles de carotte': ['rondelles', 'rondelle'],
  'tranches de tomate': ['tranches', 'tranche'],
  'rondelles de concombre': ['rondelles', 'rondelle'],
  // les plats des recettes
  'salade composee': ['salade', 'salades', 'crudites'],
  'tartine a la tomate': ['tartine', 'tartines'],
  'sandwich au steak': ['sandwich', 'sandwichs', 'burger', 'hamburger'],
  'steak aux pommes de terre': ['plat', 'steak', 'patates'],
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
    // « pomme de terre » n'est pas une pomme
    if (clause[i] === 'pomme' && clause[i + 1] === 'de' && clause[i + 2] === 'terre') return normalize(o.nom) === 'pomme de terre';
    // une couleur juste après le nom (« le livre rouge ») restreint aux livres de cette couleur
    const colour = clause[i + 1];
    if (colour && !STOP.has(colour) && !VERB_OF.has(colour) && !Object.values(ALIASES).flat().includes(colour)) return detail.includes(colour);
    return true;
  });
  found.sort((a, b) => a.distance - b.distance);
  // un nom entier dit dans l'ordre l'emporte sur un nom voisin : « les tranches de tomate » (pas
  // celles de pain), « les quartiers de pomme » (pas la pomme)
  const text = ` ${clause.join(' ')} `;
  const said = (o: WorldObject) => text.includes(` ${normalize(o.nom)} `);
  const exact = found.filter((x) => !found.some((y) => {
    if (y.nom === x.nom || !said(y)) return false;
    if (y.nom.includes(x.nom)) return true;
    const kx = words(x).kind;
    return !said(x) && words(y).kind.some((k) => kx.includes(k));
  }));
  // « tous », « les », ou un nom au pluriel (« livres »)
  const all = clause.some((w) => ['tous', 'toutes', 'les'].includes(w) || (w.endsWith('s') && w.length > 3 && Object.values(ALIASES).flat().includes(w)));
  return { found: exact, all };
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
      // « mets une pastille (dans le lave-vaisselle) »
      if (rest.some((x) => x.startsWith('pastille'))) return [{ kind: 'pastille' }];
      // « mets la vaisselle sale au lave-vaisselle »
      if (machineWash(original) && rest.includes('vaisselle') && rest.filter((x) => x === 'vaisselle').length > 1) return [{ kind: 'charger_lv' }];
      // « mets la table », « mets le couvert »
      if (rest.includes('couvert') || (found.length === 1 && found[0].nom === 'table' && !rest.some((x) => ['sur', 'dans', 'a', 'au', 'pres'].includes(x)))) return [{ kind: 'mettre_table' }];
      // « mets des glaçons dans la tasse »
      if (rest.some((x) => x.startsWith('glacon'))) return [{ kind: 'glacons', dans: found.find((o) => o.nom === 'tasse')?.ref }];
      // « pose la tasse sur la caisse » : prendre la tasse si besoin, aller à la caisse, poser
      // « au four », « à la poubelle » seulement si un objet suit (« pose la tasse au sol » : devant soi)
      const where = rest.findIndex((x, i) => x === 'sur' || x === 'dans' || x === 'pres' || ((x === 'au' || x === 'a') && findObjects(rest.slice(i + 1), world.objets).found.length > 0));
      const what = (where >= 0 ? findObjects(rest.slice(0, where), world.objets).found : found).filter((o) => o.portable);
      const item = what.find((o) => world.enMain.includes(o.ref)) ?? what[0];
      const target = where >= 0 ? findObjects(rest.slice(where + 1), world.objets).found.find((o) => o.ref !== item?.ref) : undefined;
      if (where >= 0 && !target) return null;
      if (target?.sorte === 'rangement' && (item?.nom ?? held[0]?.nom) === 'livre') return [{ kind: 'ranger', refs: item ? [item.ref] : [], onlyHeld: !item }];
      // « mets la pomme dans le frigo », « mets la poêle sur le feu », « mets le steak dans la poêle »,
      // « mets la tasse au lave-vaisselle », « mets la bouteille à la poubelle »
      if (target && (target.sorte === 'ustensile' || target.sorte === 'gazinière' || (OPENS.has(target.sorte ?? '') && target.sorte !== 'poubelle'))) return [{ kind: 'mettre', ref: item?.ref, dans: target.ref }];
      if (target?.sorte === 'poubelle') return [{ kind: 'jeter', ref: item?.ref }];
      // « mets le sandwich dans l'assiette »
      if (target?.nom === 'assiette' && (item ?? held[0])?.sorte === 'nourriture') return [{ kind: 'servir', ref: (item ?? held[0]).ref, sur: target.ref }];
      return [{ kind: 'poser', ref: item?.ref, sur: target?.ref }];
    }
    case 'ranger': {
      // « range-le » : ce qu'on tient
      if (rest.length && rest.every((x) => ['le', 'la', 'les', 'l', 'ca'].includes(x))) return [{ kind: 'ranger', refs: [], onlyHeld: true }];
      // « range la chaise (sous la table) »
      const chair = found.find((o) => o.sorte === 'siège');
      if (chair && found.every((o) => o.sorte === 'siège' || o.nom === 'table')) return [{ kind: 'chaise', ref: chair.ref, sous: true }];
      // « range la vaisselle », « range les couverts » : chaque pièce propre qui traîne, à sa place
      if (rest.includes('vaisselle') || rest.includes('couverts')) {
        const dishes = world.objets.filter((o) => (o.sorte === 'vaisselle' || o.nom === 'tasse') && isLoose(o) && !o.ou.includes('sale') && !o.ou.includes('contient') && (rest.includes('vaisselle') || o.sorte === 'vaisselle' && o.nom !== 'assiette'));
        return dishes.length ? dishes.map((o): Intent => ({ kind: 'ranger_place', ref: o.ref })) : null;
      }
      // « range-le à sa place », « range tout ça »
      if (rest.includes('place')) return [{ kind: 'ranger_place', ref: found.find((o) => o.portable)?.ref }];
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
      // « fais la vaisselle » (à l'évier), « fais la vaisselle au lave-vaisselle »
      if (rest.includes('vaisselle')) return machineWash(original) ? machineDishes(world) : [{ kind: 'vaisselle', refs: [] }];
      // « fais-toi une salade », « prépare un sandwich », « fais un steak frites » : une recette
      if (!['sers', 'servir'].includes(word)) {
        const recipe = RECIPES.find((r) => r.words.some((w) => w.split(' ').every((x) => rest.includes(x))));
        if (recipe) return [{ kind: 'preparer', plat: recipe.dish }];
      }
      // « fais-toi un jus de pomme », « prépare un smoothie » : au mixeur
      if (rest.includes('jus') || rest.includes('smoothie')) return juice(world, found, true);
      // « sers le sandwich (dans l'assiette) », « sers-toi une pomme »
      {
        const food = found.find((o) => o.sorte === 'nourriture');
        const plate = found.find((o) => o.nom === 'assiette');
        if (food || plate) return [{ kind: 'servir', ref: food?.ref, sur: plate?.ref }];
      }
      // « fais-toi un thé »
      if (rest.includes('the')) return [{ kind: 'the' }];
      return rest.includes('cafe') ? [{ kind: 'cafe' }] : null;
    case 'boire': {
      // « bois la bouteille », « bois de l'eau » (une bouteille pleine s'il y en a, sinon la tasse remplie à l'évier), « bois un café »
      // « bois au robinet »
      if (rest.includes('robinet')) return [{ kind: 'boire_robinet' }];
      // « bois un jus de pomme » : mixé d'abord s'il n'y en a pas de prêt
      if (rest.includes('jus') || rest.includes('smoothie')) {
        const prep = juice(world, found, false);
        return prep ? [...prep, { kind: 'boire', liquide: 'jus de fruits' }] : null;
      }
      const liquide = rest.includes('eau') ? 'eau' : rest.includes('cafe') ? 'café' : rest.includes('the') ? 'thé' : undefined;
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
      // « mange à table », « mange dans l'assiette », « mange le sandwich à table »
      if (rest.some((x) => ['table', 'assiette', 'fourchette'].includes(x))) return [{ kind: 'repas', ref: food[0]?.ref }];
      if (found.length && !food.length) return null;
      // « mange » sans rien en main, un plat servi dans l'assiette : on mange à table
      const served = world.objets.find((o) => o.sorte === 'nourriture' && o.ou.startsWith('posé sur assiette'));
      if (!food.length && served && !held.some((o) => o.sorte === 'nourriture')) return [{ kind: 'repas', ref: served.ref }];
      return [{ kind: 'manger', ref: (food.find((o) => world.enMain.includes(o.ref)) ?? food[0])?.ref }];
    }
    case 'couper': {
      // « coupe le steak dans l'assiette », « coupe ta viande » : en bouchées, à table
      if (rest.includes('assiette') || rest.includes('bouchees') || rest.includes('viande')) return [{ kind: 'couper_assiette' }];
      // « coupe la pomme », « coupe le pain sur la planche », « coupe » (ce qu'on tient, sinon ce qu'il y a)
      const food = found.filter((o) => o.coupable);
      if (found.length && !food.length) return null;
      return [{ kind: 'couper', ref: (food.find((o) => world.enMain.includes(o.ref)) ?? food.find(isLoose) ?? food[0])?.ref }];
    }
    case 'remplir': {
      // « remplis le lave-vaisselle » : la vaisselle sale dedans
      if (machineWash(original)) return [{ kind: 'charger_lv' }];
      // « remplis la bouilloire » : de l'eau versée dedans
      const kettle = found.find((o) => o.nom === 'bouilloire');
      if (kettle && !rest.includes('tasse')) return [{ kind: 'remplir_bouilloire', ref: kettle.ref }];
      // « remplis la tasse (d'eau / de café) », « remplis la bouteille, la casserole » ; d'eau si rien n'est dit
      if (found.some((o) => o.sorte !== 'récipient' && o.sorte !== 'évier' && o.sorte !== 'machine' && o.nom !== 'casserole')) return null;
      const vessel = found.find((o) => o.sorte === 'récipient' || o.nom === 'casserole');
      return [rest.includes('cafe') ? { kind: 'cafe' } : rest.includes('the') ? { kind: 'the' } : { kind: 'eau', ref: vessel?.nom === 'tasse' ? undefined : vessel?.ref }];
    }
    case 'verser': {
      // « verse la bouteille dans la tasse », « verse l'eau dans la bouilloire », « verse » (ce qu'on tient)
      const cut = rest.indexOf('dans');
      const from = findObjects(cut < 0 ? rest : rest.slice(0, cut), world.objets).found.find((o) => o.sorte === 'récipient' || o.sorte === 'ustensile');
      const into = cut < 0 ? undefined : findObjects(rest.slice(cut + 1), world.objets).found[0];
      if (cut >= 0 && !into) return null;
      if (into?.sorte === 'évier') return [{ kind: 'vider_recipient', ref: from?.ref }];
      return [{ kind: 'verser', ref: from?.ref, dans: into?.ref }];
    }
    case 'charger':
      // « charge le lave-vaisselle »
      return machineWash(original) || rest.includes('vaisselle') ? [{ kind: 'charger_lv' }] : null;
    case 'tirer':
    case 'pousser': {
      // « tire la chaise », « pousse la chaise sous la table »
      const chair = found.find((o) => o.sorte === 'siège');
      return chair ? [{ kind: 'chaise', ref: chair.ref, sous: verb === 'pousser' }] : null;
    }
    case 'empiler':
      // « empile les assiettes »
      return !found.length || found.every((o) => o.nom === 'assiette') ? [{ kind: 'empiler' }] : null;
    case 'essuyer':
      // « essuie la flaque », « nettoie par terre », « éponge l'eau »
      if (rest.some((x) => ['flaque', 'flaques', 'sol', 'terre', 'eau'].includes(x))) return [{ kind: 'essuyer_sol' }];
      // « essuie la table », « nettoie la table »
      return found.length && found.every((o) => o.nom === 'table' || o.nom === 'éponge') ? [{ kind: 'essuyer', ref: found.find((o) => o.nom === 'table')?.ref }] : null;
    case 'debarrasser':
      // « débarrasse la table », « débarrasse »
      return [{ kind: 'debarrasser' }];
    case 'regarder': {
      // « regarde dans le frigo », « fouille le placard »
      const store = found.find((o) => STORES.has(o.sorte ?? ''));
      return store ? [{ kind: 'regarder', ref: store.ref }] : null;
    }
    case 'laisser': {
      // « laisse le frigo ouvert », « laisse la porte du placard ouverte »
      const store = found.find((o) => OPENS.has(o.sorte ?? ''));
      return store && rest.some((x) => x.startsWith('ouvert')) ? [{ kind: 'laisser_ouvert', ref: store.ref }] : null;
    }
    case 'boucher':
      // « bouche l'évier »
      return found.every((o) => o.sorte === 'évier') ? [{ kind: 'bouchon', mettre: true }] : null;
    case 'enlever':
      // « enlève le bouchon »
      return rest.includes('bouchon') ? [{ kind: 'bouchon', mettre: false }] : null;
    case 'laver': {
      // « lave la tasse au lave-vaisselle » : on la range dedans et on le lance
      if (machineWash(original) && found.every((o) => o.sorte === 'appareil' || o.sorte === 'vaisselle' || o.nom === 'tasse') && appliance('lave-vaisselle')) {
        const cups = found.filter((o) => o.sorte === 'vaisselle' || o.nom === 'tasse');
        if (!cups.length) return machineDishes(world);
        const lv = appliance('lave-vaisselle')!;
        return [...cups.slice(0, all ? cups.length : 1).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: lv.ref })), ...tablet(lv), { kind: 'allumer', ref: lv.ref }];
      }
      // « lave la vaisselle », « lave l'assiette », « lave les couverts », « rince la tasse » : à l'évier
      const sink = found.filter((o) => o.nom !== 'lave-vaisselle');
      const dishes = sink.filter((o) => o.sorte === 'vaisselle' || o.nom === 'tasse');
      if (rest.includes('vaisselle') || rest.includes('couverts') || dishes.length) {
        if (sink.some((o) => o.sorte !== 'évier' && !dishes.includes(o))) return null;
        // « lave les couverts » : fourchettes et couteaux
        if (!dishes.length && rest.includes('couverts')) return [{ kind: 'vaisselle', refs: world.objets.filter((o) => o.nom === 'fourchette' || o.nom === 'couteau de table').map((o) => o.ref) }];
        if (all || !dishes.length) return [{ kind: 'vaisselle', refs: dishes.map((o) => o.ref) }];
        return [{ kind: 'vaisselle', refs: [(dishes.find((o) => o.ou.includes('sale')) ?? dishes[0]).ref] }];
      }
      // « lave-toi les mains », « lave-toi », « rince-toi le visage »
      if (sink.some((o) => o.sorte !== 'évier')) return null;
      const self = rest.some((x) => ['toi', 'te', 't', 'mains', 'main', 'visage', 'figure', 'corps'].includes(x)) || !rest.length;
      if (!self) return null;
      const handsOnly = rest.some((x) => x === 'mains' || x === 'main') && !rest.some((x) => x === 'visage' || x === 'figure');
      return [{ kind: 'laver', visage: !handsOnly }];
    }
    case 'lire': {
      // « ouvre le robinet »
      if (rest.includes('robinet') || (rest.includes('eau') && found.some((o) => o.sorte === 'évier'))) return [{ kind: 'robinet', ouvrir: true }];
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
      // « assieds-toi à table »
      if (rest.includes('table') || found.some((o) => o.nom === 'assiette')) return [{ kind: 'attabler' }];
      // « assieds-toi », « assieds-toi sur la chaise » (sinon le siège le plus proche)
      const seat = found.find((o) => o.sorte === 'siège');
      if (found.length && !seat) return null;
      return [{ kind: 'asseoir', ref: seat?.ref }];
    }
    case 'lever':
      return [{ kind: 'lever' }];
    case 'dormir': {
      // « va dormir », « couche-toi dans le lit », « fais une sieste »
      const bed = found.find((o) => o.sorte === 'lit');
      if (found.length && !bed) return null;
      return [{ kind: 'dormir', ref: bed?.ref }];
    }
    case 'reveiller':
      return [{ kind: 'reveiller' }];
    case 'mixer': {
      // « mixe la pomme », « mixe les quartiers de pomme »
      const fruits = found.filter((o) => FRUITS.includes(o.nom));
      if (found.some((o) => !fruits.includes(o) && o.nom !== 'mixeur')) return null;
      const mixer = world.objets.find((o) => o.nom === 'mixeur');
      if (!mixer) return null;
      if (!fruits.length) return [{ kind: 'allumer', ref: mixer.ref }];
      return [...fruits.slice(0, all ? 2 : 1).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: mixer.ref })), { kind: 'allumer', ref: mixer.ref }];
    }
    case 'cuire': {
      // « grille le pain », « fais griller les tartines », « mets en marche le grille-pain » : au grille-pain
      const toaster = appliance('grille-pain');
      const bread = ['tranches de pain', 'pain', 'grille-pain'];
      if (toaster && (['grille', 'griller'].includes(word) || found.some((o) => o.nom === 'grille-pain')) && found.every((o) => bread.includes(o.nom))) {
        const slices = world.objets.filter((o) => o.nom === 'tranches de pain');
        const item = slices.find((o) => world.enMain.includes(o.ref)) ?? slices.find(isLoose) ?? slices[0];
        if (!item) return found.length ? null : [{ kind: 'allumer', ref: toaster.ref }];
        return [{ kind: 'mettre', ref: item.ref, dans: toaster.ref }, { kind: 'allumer', ref: toaster.ref }];
      }
      // au four ou au micro-ondes : « cuis la pomme de terre au four », « réchauffe le steak »
      const oven = found.find((o) => o.sorte === 'appareil' && o.nom !== 'lave-vaisselle') ?? (REHEAT.has(word) ? appliance('micro-ondes') : undefined);
      if (oven) {
        if (found.some((o) => o.sorte !== 'nourriture' && o.sorte !== 'appareil' && !o.cuisson)) return null;
        const food = found.filter((o) => o.sorte === 'nourriture' || o.cuisson);
        const item = food.find((o) => world.enMain.includes(o.ref)) ?? food.find(isLoose) ?? food[0] ?? world.objets.find((o) => world.enMain.includes(o.ref) && o.cuisson);
        // rien de nommé : on lance l'appareil avec ce qu'il contient
        if (!item) return [{ kind: 'allumer', ref: oven.ref }];
        return [{ kind: 'mettre', ref: item.ref, dans: oven.ref }, { kind: 'allumer', ref: oven.ref }];
      }
      // « cuis le steak », « fais cuire les pommes de terre », « cuisine » (un ingrédient cru)
      const foods = found.filter((o) => o.cuisson);
      if (found.some((o) => !o.cuisson && o.sorte !== 'ustensile' && o.sorte !== 'gazinière')) return null;
      if (all && foods.length) return foods.filter((o) => o.cuisson === 'cru').map((o) => ({ kind: 'cuire', ref: o.ref }));
      return [{ kind: 'cuire', ref: (foods.find((o) => o.cuisson === 'cru') ?? foods[0])?.ref }];
    }
    case 'allumer':
    case 'eteindre': {
      // « allume la lampe de chevet », « éteins la lampe »
      const lamp = found.find((o) => o.sorte === 'lampe');
      if (lamp) return [{ kind: verb, ref: lamp.ref }];
      // « allume le four », « lance le lave-vaisselle »
      const app = found.find((o) => o.sorte === 'appareil');
      if (app) return [{ kind: verb, ref: app.ref }];
      // « allume la gazinière », « éteins le feu », « allume la machine à café »
      const target = found.find((o) => o.sorte === 'gazinière' || o.sorte === 'machine');
      // « coupe la pomme », « coupe dans l'assiette » : couper, pas éteindre
      if (!target && ['coupe', 'couper'].includes(word) && (found.length || rest.length)) return parseClause('couper', rest, original, world, word);
      if (found.length && !target) return null;
      return [{ kind: verb, ref: target?.ref }];
    }
    case 'arreter': {
      // « ferme le robinet », « arrête l'eau »
      if (rest.includes('robinet') || (rest.includes('eau') && !found.some((o) => o.sorte !== 'évier'))) return [{ kind: 'robinet', ouvrir: false }];
      // « arrête le lave-vaisselle » ; « ferme le four » : la porte
      const closes = ['ferme', 'fermer', 'referme', 'refermer'].includes(word);
      const app = found.find((o) => o.sorte === 'appareil');
      if (app && !closes) return [{ kind: 'eteindre', ref: app.ref }];
      // « ferme le frigo », « ferme le tiroir »
      if (OPENS.has(found[0]?.sorte ?? '')) return [{ kind: 'fermer', ref: found[0].ref }];
      // « arrête de lire », « ferme le livre », « stop »
      return !rest.length || rest.some((x) => ['lire', 'lecture', 'livre', 'lis'].includes(x)) ? [{ kind: 'arreter_lire' }] : null;
    }
    case 'jeter': {
      // « jette la bouteille », « jette ça » (ce qu'on tient)
      const thing = found.filter((o) => o.portable);
      if (found.length && !thing.length) return null;
      return [{ kind: 'jeter', ref: (thing.find((o) => world.enMain.includes(o.ref)) ?? thing[0])?.ref }];
    }
    case 'vider': {
      // « vide le lave-vaisselle » : la vaisselle propre rangée à sa place
      if (machineWash(original) && appliance('lave-vaisselle')) return [{ kind: 'vider_lv' }];
      // « vide la tasse », « vide la casserole » (dans l'évier)
      const vessel = found.find((o) => o.sorte === 'récipient' || o.sorte === 'ustensile');
      if (vessel) return [{ kind: 'vider_recipient', ref: vessel.ref }];
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
/** L'ordre nomme le lave-vaisselle (« … au lave-vaisselle ») : sinon la vaisselle se fait à l'évier. */
function machineWash(original: string): boolean {
  return normalize(original).includes('lave vaisselle');
}

/**
 * Un jus au mixeur : déjà prêt, on le sert (`serve`) ; sinon un fruit (celui nommé, celui qu'on
 * tient, sinon le plus proche) va dans le mixeur, qu'on lance. Null sans mixeur ni fruit.
 */
function juice(world: { enMain: string[]; objets: WorldObject[] }, found: WorldObject[], serve: boolean): Intent[] | null {
  const mixer = world.objets.find((o) => o.nom === 'mixeur');
  if (!mixer) return null;
  const pour: Intent[] = serve ? [{ kind: 'jus' }] : [];
  if (mixer.ou.includes(' prêt')) return pour;
  const fruits = world.objets.filter((o) => FRUITS.includes(o.nom));
  const named = found.filter((o) => FRUITS.includes(o.nom));
  const fruit = named[0] ?? fruits.find((o) => world.enMain.includes(o.ref)) ?? [...fruits].sort((a, b) => a.distance - b.distance)[0];
  if (!fruit) return null;
  return [{ kind: 'mettre', ref: fruit.ref, dans: mixer.ref }, { kind: 'allumer', ref: mixer.ref }, ...pour];
}

function machineDishes(world: { objets: WorldObject[] }): Intent[] | null {
  const lv = world.objets.find((o) => o.nom === 'lave-vaisselle');
  if (!lv) return null;
  const dirty = world.objets.filter((o) => (o.sorte === 'récipient' || o.sorte === 'vaisselle') && o.ou.includes(', sale') && !o.ou.startsWith(`rangé dans ${lv.ref}`));
  return [...(dirty.length ? [{ kind: 'charger_lv' } as Intent] : []), ...tablet(lv), { kind: 'allumer', ref: lv.ref }];
}

/** Une pastille d'abord si le lave-vaisselle n'en a pas (sans elle, le lavage rate). */
function tablet(lv: WorldObject): Intent[] {
  return lv.ou.includes('sans pastille') ? [{ kind: 'pastille' }] : [];
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
