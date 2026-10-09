/**
 * Ordres simples en français, compris sans IA : « prends la tasse », « range tous les livres »,
 * « va à la table puis pose la lettre », « fais-toi un café », « lis le livre rouge », « dis bonjour »,
 * « assieds-toi sur la chaise », « lève-toi », « fais cuire le steak », « éteins le feu »,
 * « sers le sandwich dans l'assiette », « mange à table », « fais la vaisselle », « cuis la pomme
 * de terre au four », « jette la bouteille », « lance le lave-vaisselle », et dans les autres pièces
 * « va au salon », « regarde la télé », « allume la lumière de la chambre », « prends une douche »,
 * « range les chaussures », « va te coucher », « monte sur le vélo », « achète 2 tomates »,
 * « vends les biscuits ». Les formes polies (« tu peux me… »), les envies (« je veux un café »,
 * « j'ai faim »), les pluriels et une faute de frappe par mot passent. Rend null dès qu'un morceau
 * de l'ordre n'est pas compris, ou nomme quelque chose d'inconnu : l'ordre part alors au modèle de
 * chat, plutôt que d'être pris pour un autre (« ouvre la fenêtre » n'est pas « lis un livre »).
 * La liste des ordres compris : docs/ordres.md.
 */
import type { WorldObject } from '../game/Game';
import { RECIPES } from '../game/items/recipes';
import { FRUITS } from '../game/items/kitchen';
import { DRINK_COLORS, FRESH_THINGS, FROZEN_FOOD, PANTRY_THINGS } from '../game/items/pantry';
import { ITEM_BY_ID } from '../game/items/catalog';
import { groceryAisle, HOUSE_ALWAYS } from '../game/argent';
import type { Intent } from './tasks';

/** Minuscules, sans accents ni ponctuation, apostrophes et tirets en espaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERBS: Record<string, string[]> = {
  prendre: ['prends', 'prend', 'prendre', 'prennes', 'prent', 'pren', 'cherche', 'chercher', 'donne', 'donner', 'apporte', 'apporter', 'ramene', 'ramener', 'amene', 'amener', 'attrape', 'attraper', 'ramasse', 'ramasser', 'saisis', 'saisir', 'recupere', 'recuperer', 'sors', 'sort', 'sortir'],
  poser: ['pose', 'poser', 'repose', 'reposer', 'lache', 'lacher', 'depose', 'deposer', 'mets', 'met', 'mettre', 'remets', 'remettre'],
  ranger: ['range', 'ranger', 'rangez', 'accroche', 'accrocher', 'raccroche', 'raccrocher', 'suspends'],
  verrouiller: ['verrouille', 'verrouiller', 'enferme', 'enfermer'],
  dormir: ['dors', 'dormir', 'endors', 'endormir', 'couche', 'coucher', 'recouche', 'recoucher'],
  reveiller: ['reveille', 'reveiller'],
  deverrouiller: ['deverrouille', 'deverrouiller'],
  aller: ['va', 'vas', 'aller', 'ailles', 'reviens', 'revenir', 'allez', 'marche', 'marcher', 'cours', 'courir', 'rejoins', 'rejoindre', 'approche', 'approcher', 'entre', 'entrer', 'file', 'filer', 'viens', 'venir', 'dirige', 'diriger', 'avance', 'avancer'],
  cafe: ['fais', 'fait', 'faire', 'fasses', 'fai', 'prepare', 'preparer', 'sers', 'servir', 'concocte', 'concocter', 'mitonne'],
  boire: ['bois', 'boit', 'boire', 'sirote', 'siroter', 'trinque'],
  manger: ['mange', 'manges', 'mang', 'manger', 'mangez', 'croque', 'croquer', 'grignote', 'grignoter', 'avale', 'avaler', 'devore', 'devorer', 'deguste', 'deguster', 'bouffe', 'bouffer', 'dejeune', 'dejeuner', 'dine', 'diner'],
  couper: ['coupe', 'coupes', 'couper', 'decoupe', 'decouper', 'tranche', 'trancher', 'emince', 'emincer', 'hache', 'hacher'],
  dire: ['dis', 'dit', 'dire', 'crie', 'crier', 'chuchote', 'chuchoter', 'murmure', 'murmurer', 'reponds', 'repondre'],
  lire: ['lis', 'lit', 'lire', 'ouvre', 'ouvrir', 'feuillette', 'feuilleter', 'bouquine'],
  remplir: ['remplis', 'remplir', 'remplit', 'rempli'],
  laver: ['lave', 'laver', 'lavez', 'rince', 'rincer', 'debarbouille', 'debarbouiller'],
  asseoir: ['assieds', 'assied', 'assois', 'assoit', 'asseoir', 'assoir', 'assoie', 'rassieds', 'rassois', 'installe', 'installer'],
  lever: ['leve', 'lever', 'releve', 'relever', 'debout', 'redresse'],
  mixer: ['mixe', 'mixer', 'mixes', 'mouline', 'presse', 'presser'],
  cuire: ['cuis', 'cuit', 'cuire', 'cuisine', 'cuisiner', 'grille', 'griller', 'rechauffe', 'rechauffer', 'chauffe', 'chauffer', 'bous', 'bouillir', 'fris', 'frire', 'rotis', 'rotir', 'dore', 'dorer', 'decongele', 'decongeler'],
  commander: ['commande', 'commander', 'achete', 'acheter', 'recommande', 'recommander'],
  allumer: ['allume', 'allumer', 'allumes', 'alume', 'rallume', 'rallumer', 'lance', 'lancer', 'demarre', 'demarrer', 'active', 'activer', 'prechauffe', 'prechauffer', 'branche', 'brancher'],
  eteindre: ['eteins', 'eteint', 'eteindre', 'eteignes', 'etein', 'coupe', 'couper', 'desactive', 'desactiver', 'debranche', 'debrancher'],
  arreter: ['arrete', 'arreter', 'stop', 'stoppe', 'ferme', 'fermer', 'referme', 'refermer', 'cesse'],
  jeter: ['jette', 'jeter', 'balance', 'balancer', 'bazarde', 'bazarder'],
  vider: ['vide', 'vider'],
  verser: ['verse', 'verser', 'transvase', 'transvaser'],
  boucher: ['bouche', 'boucher', 'rebouche', 'reboucher'],
  enlever: ['enleve', 'enlever', 'retire', 'retirer'],
  regarder: ['regarde', 'regarder', 'inspecte', 'inspecter', 'fouille', 'fouiller', 'inventorie', 'verifie', 'verifier', 'consulte', 'consulter', 'mate', 'mater'],
  laisser: ['laisse', 'laisser'],
  charger: ['charge', 'charger', 'chargez'],
  debarrasser: ['debarrasse', 'debarrasser', 'dessers', 'desservir'],
  tirer: ['tire', 'tirer', 'recule', 'reculer'],
  pousser: ['pousse', 'pousser', 'glisse', 'glisser', 'rentre', 'rentrer'],
  essuyer: ['essuie', 'essuyer', 'nettoie', 'nettoyer', 'eponge', 'eponger', 'seche', 'secher', 'seches'],
  empiler: ['empile', 'empiler'],
  // l'entretien
  balayer: ['balaie', 'balaye', 'balayer', 'balaies'],
  passer: ['passe', 'passer'],
  enfiler: ['enfile', 'enfiler'],
  aspirer: ['aspire', 'aspirer', 'aspires'],
  depoussierer: ['depoussiere', 'depoussierer', 'epoussette', 'epousseter', 'epoussete'],
  recurer: ['recure', 'recurer', 'recurre', 'frotte', 'frotter', 'astique', 'astiquer', 'brique', 'briquer', 'brosse', 'brosser', 'decrasse', 'decrasser', 'detartre', 'detartrer'],
  // gestes de cuisine
  casser: ['casse', 'casser', 'casses'],
  fouetter: ['fouette', 'fouetter', 'bats', 'bat', 'battre', 'melange', 'melanger', 'melanges'],
  remuer: ['remue', 'remuer', 'remues', 'touille', 'touiller', 'tourne', 'tourner'],
  sauter: ['saute', 'sauter', 'sautes', 'bondis', 'retourne', 'retourner', 'flambe', 'flamber'],
  assaisonner: ['assaisonne', 'assaisonner', 'sale', 'saler', 'poivre', 'poivrer', 'epice', 'epicer'],
  tartiner: ['tartine', 'tartiner', 'beurre', 'beurrer'],
  raper: ['rape', 'raper', 'rapes'],
  gouter: ['goute', 'gouter', 'goutes'],
  baisser: ['baisse', 'baisser', 'rabats', 'rabat', 'rabattre'],
  allonger: ['allonge', 'allonger', 'allonges', 'etends', 'etendre'],
  // le marché
  ajouter: ['ajoute', 'ajouter', 'rajoute', 'rajouter'],
  vendre: ['vends', 'vend', 'vendre', 'revends', 'revendre'],
  // la salle de bain, le garage
  doucher: ['douche', 'doucher'],
  monter: ['monte', 'monter', 'enfourche', 'enfourcher', 'remonte'],
  descendre: ['descends', 'descend', 'descendre'],
};
/** Vêtements : se mettre ou s'enlever n'est pas un geste du jeu. */
const WEAR_WORDS = new Set(['pull', 'chemise', 'manteau', 'veste', 'blouson', 'echarpe', 'bonnet', 'chaussure', 'chausson', 'botte', 'pantoufle', 'basket', 'pyjama', 'pantalon', 'jean', 'robe', 'gilet', 'sweat', 'gant', 'chapeau', 'casquette', 'lunette', 'habit', 'vetement', 'tenue', 'chaussette']);
/** Plats qui se font en plusieurs gestes que les ordres simples ne savent pas enchaîner : l'IA s'en charge. */
const SLOW_DISHES = new Set(['pates', 'spaghetti', 'spaghettis', 'nouilles', 'riz', 'soupe', 'potage', 'gateau', 'gateaux', 'cake', 'cereales', 'puree', 'cookies']);
/** Les fruits qui se mixent en jus, par mot dit. */
const FRUIT_WORDS = new Set(['pomme', 'poire', 'banane', 'fraise', 'raisin', 'citron', 'fruit', 'peche', 'abricot', 'kiwi', 'mangue', 'ananas']);
/** Tous les noms connus de l'analyseur, même d'objets absents de la maison. */
let nounSet: Set<string> | null = null;
const nouns = () => (nounSet ??= new Set([...Object.keys(ALIASES).filter((k) => !k.includes(' ')), ...Object.values(ALIASES).flat(), ...Object.keys(SPICE_WORDS), ...Object.keys(CONDIMENT_WORDS), ...Object.keys(SPREAD_WORDS), ...SLOW_DISHES, ...WEAR_WORDS, ...FRUIT_WORDS, ...CHORE_WORDS]));
/** Mots qu'on ne corrige pas en un nom voisin (« chaîne » n'est pas « chaise »). */
const NO_FIX = new Set(['chaine', 'chaines', 'meteo', 'volume', 'radio', 'porte', 'portes', 'salle', 'sale', 'sales', 'toit', 'mains', 'main']);
/** Mots qui n'empêchent pas de comprendre un ordre (ni objet, ni pièce). */
const NEUTRAL = new Set(['ca', 'cela', 'ceci', 'faire', 'fais', 'bien', 'vite', 'doucement', 'tranquillement', 'peu', 'quelque', 'chose', 'truc', 'morceau', 'encore', 'fois', 'nouveau', 'tout', 'tous', 'plus', 'stp', 'svp', 'merci', 'plait', 'nous', 'vous', 'lui', 'leur', 'pour', 'par', 'sans', 'chez', 'loin', 'pres', 'cote', 'devant', 'derriere', 'dedans', 'dessus', 'bas', 'haut', 'terre', 'sol', 'maison', 'vers', 'la', 'bas', 'ici', 'livre', 'livres', 'lecture', 'histoire', 'roman', 'bouquin', 'rouge', 'vert', 'verte', 'ocre', 'violet', 'bleu', 'jaune', 'noir', 'blanc', 'premier', 'autre', 'dernier', 'petit', 'grand', 'gros', 'bon', 'bonne', 'notre', 'votre', 'son', 'sa', 'ses', 'leurs', 'quoi', 'que', 'qu', 'est', 'il', 'elle', 'on', 'ne', 'pas', 'oui', 'non', 'je', 'j', 'tu', 'ai', 'as', 'a', 'o', 'heure', 'maintenant', 'bientot', 'apres', 'avant', 'pendant', 'minute', 'minutes', 'seconde', 'temps']);
/**
 * Les mots de l'ordre que rien ne connaît : ni petit mot, ni objet de la maison, ni pièce, ni verbe.
 * Un ordre qui en contient ne se comprend pas « par défaut » (« ouvre la fenêtre » n'est pas
 * « lis un livre ») : il part à l'IA.
 */
function unknownWords(rest: string[], objets: WorldObject[]): string[] {
  const known = new Set<string>();
  for (const o of objets) {
    for (const k of words(o).kind) known.add(k);
    if (!normalize(o.nom).includes(' ')) known.add(normalize(o.nom));
  }
  for (const [ws] of ROOM_WORDS) for (const w of ws) for (const k of w.split(' ')) known.add(k);
  return rest.filter((w) => !STOP.has(w) && !NEUTRAL.has(w) && !/^\d+$/.test(w) && !(w in NUMBERS) && !VERB_OF.has(w) && !known.has(w) && !known.has(singular(w)));
}
/** Les pièces de la maison (nom de leur RoomSpec), par mots dits. */
const ROOM_WORDS: Array<[string[], string]> = [
  [['cuisine'], 'cuisine'],
  [['salon', 'sejour', 'salle a manger', 'living'], 'salon'],
  [['chambre', 'chambre a coucher'], 'chambre'],
  [['salle de bain', 'salle de bains', 'salle d eau', 'sdb'], 'salle de bain'],
  [['garage', 'atelier'], 'garage'],
  [['entree', 'couloir', 'hall', 'vestibule'], 'entrée'],
];
/** La pièce nommée dans l'ordre, s'il y en a une. */
function roomIn(rest: string[]): string | undefined {
  const text = ` ${rest.join(' ')} `;
  return ROOM_WORDS.find(([ws]) => ws.some((w) => text.includes(` ${w} `)))?.[1];
}
/** Le vocabulaire du ménage (une faute de frappe s'y corrige : « aspirtaeur », « menag »). */
const CHORE_WORDS = ['menage', 'menages', 'aspirateur', 'aspirateurs', 'aspi', 'serpilliere', 'serpiere', 'poussiere', 'poussieres', 'plumeau', 'chiffon', 'lingette', 'vitre', 'vitres', 'carreaux', 'fenetre', 'fenetres', 'miroir', 'glace', 'balai', 'balayette', 'sol', 'sols', 'carrelage', 'parquet', 'plancher', 'moquette', 'tapis', 'baignoire', 'partout', 'maison'];
/** Ce qui se dit du sol ; des vitres et miroirs ; d'un coup de chiffon. */
const FLOOR_WORDS = new Set(['sol', 'sols', 'carrelage', 'parquet', 'plancher', 'moquette']);
const GLASS_WORDS = new Set(['vitre', 'vitres', 'carreaux', 'fenetre', 'fenetres', 'miroir', 'miroirs', 'glace', 'glaces']);
const DUST_WORDS = new Set(['poussiere', 'poussieres', 'plumeau', 'chiffon', 'lingette']);
/** « Toute la maison » plutôt qu'une pièce. */
const EVERYWHERE = new Set(['maison', 'partout', 'tout', 'toute', 'appart', 'appartement']);
/** Les mots du ménage corrigés d'une faute (mots de 5 lettres ou plus qui ne sont rien d'autre). */
function fixChoreWords(rest: string[]): string[] {
  return rest.map((w) => (w.length >= 5 && !CHORE_WORDS.includes(w) && !nouns().has(w) && !nouns().has(singular(w)) && !VERB_OF.has(w) && !STOP.has(w) && !NEUTRAL.has(w) && !ROOM_WORDS.some(([ws]) => ws.includes(w)) ? closestOf(w, CHORE_WORDS) ?? w : w));
}

/** « La lumière » : pas de plafonnier ni d'interrupteur, c'est une lampe (de chevet, lampadaire) qu'on allume. */
const LIGHT_WORDS = new Set(['lumiere', 'lumieres']);
/** La lampe de chaque pièce (« la lumière du salon »). */
const LAMP_OF_ROOM: Record<string, string> = { salon: 'lampadaire', chambre: 'lampe de chevet' };
/** Les pots de l'étagère à épices, par mot dit. */
const SPICE_WORDS: Record<string, string> = { sel: 'sel', sale: 'sel', saler: 'sel', poivre: 'poivre', poivrer: 'poivre', paprika: 'paprika', herbes: 'herbes de Provence', herbe: 'herbes de Provence', huile: "huile d'olive" };
/** Sauces et condiments qui assaisonnent comme les épices, par mot dit. */
const CONDIMENT_WORDS: Record<string, string> = { ketchup: 'ketchup', mayonnaise: 'mayonnaise', mayo: 'mayonnaise', moutarde: 'moutarde', vinaigre: 'vinaigre', vinaigrette: 'vinaigre', creme: 'crème', citron: 'citron', ail: 'ail' };
/** Ce qu'on tartine, par mot dit. */
const SPREAD_WORDS: Record<string, string> = { confiture: 'confiture', miel: 'miel', nutella: 'pâte à tartiner', chocolat: 'pâte à tartiner', pate: 'pâte à tartiner', beurre: 'beurre', beurrer: 'beurre' };
/** Ustensiles et pots : jamais la cible d'un geste de cuisine. */
const TOOLS = new Set(['fouet', 'spatule', 'cuillère en bois', 'louche', 'râpe', 'cuillère', 'couteau', 'couteau de table', ...Object.values(SPICE_WORDS), ...Object.values(CONDIMENT_WORDS), ...Object.values(SPREAD_WORDS)]);
/** Verbes qui réchauffent (au micro-ondes) plutôt que cuire (au four). */
const REHEAT = new Set(['rechauffe', 'rechauffer', 'chauffe', 'chauffer']);
/** Meubles qu'on ouvre et ferme (porte, tiroir, couvercle). */
const OPENS = new Set(['frigo', 'placard', 'appareil', 'poubelle']);
/** Meubles où l'on range (et où l'on peut regarder ce qu'il y a). */
const STORES = new Set(['frigo', 'placard', 'rangement', 'égouttoir']);
/** Où se range un objet qui ne va ni au frais ni dans la bibliothèque. */
const STORED_IN: Record<string, string> = { pull: 'armoire', tasse: 'placard', assiette: 'placard', verre: 'placard', bol: 'placard', carafe: 'placard', lettre: 'tiroir', fourchette: 'tiroir', 'couteau de table': 'tiroir', cuillère: 'tiroir', torchon: 'crochets', maniques: 'crochets', couteau: 'barre à couteaux', 'papier toilette': 'porte-papier',
  // les provisions : l'épicerie au garde-manger, le frais au frigo, les surgelés au congélateur
  ...Object.fromEntries([...PANTRY_THINGS.map((n) => [n, 'garde-manger']), ...FRESH_THINGS.map((n) => [n, 'frigo']), ...FROZEN_FOOD.map((n) => [n, 'congélateur'])]) };
/** Boissons du frigo (se boivent à la bouteille ou se versent dans un verre). */
const DRINKS = new Set(Object.keys(DRINK_COLORS));
/** Les couverts (« lave les couverts », « range les couverts »). */
const COUVERTS = ['fourchette', 'couteau de table', 'cuillère'];
/** Où l'on sert un plat (et mange assis) ; le couvert qui va avec. */
const BOWLS: Record<string, string> = { assiette: 'fourchette', bol: 'cuillère' };
/** Vaisselle (fiche `dish`) : la tasse, le verre et la carafe sont des « récipient » pour describe(). */
const isDish = (o: WorldObject) => o.sorte === 'vaisselle' || ['tasse', 'verre', 'carafe'].includes(o.nom);
/** On ne boit pas à la carafe : on s'en sert un verre. */
const JUGS = new Set(['carafe', 'théière']);
/** Le verre (ou la tasse) à servir : tenu, puis qui traîne, puis sec, puis le plus proche. */
const byUse = (enMain: string[]) => (a: WorldObject, b: WorldObject) =>
  +!enMain.includes(a.ref) - +!enMain.includes(b.ref) || +!isLoose(a) - +!isLoose(b) || +a.ou.includes('mouill') - +b.ou.includes('mouill') || a.distance - b.distance;
const VERB_OF = new Map(Object.entries(VERBS).flatMap(([k, vs]) => vs.map((v) => [v, k] as const)));

/** Formules de politesse et tournures à ignorer en tête d'ordre. */
const FILLERS = [
  'est ce que tu peux', 'est ce que tu pourrais', 'tu peux', 'tu pourrais', 'peux tu', 'pourrais tu', 'tu veux bien',
  'je veux que tu', 'je voudrais que tu', 'j aimerais que tu', 'j aimerais bien que tu', 'il faut que tu', 'il faudrait que tu', 'il faut', 'merci de', 'que tu', 'pourrais tu', 'peux tu', 'tu peux me', 'tu pourrais me',
  'vas y', 'va y', 'essaie de', 'essaye de', 'n oublie pas de', 'pense a', 'j ai besoin que tu', 'aide moi a', 'stp', 'svp', 's il te plait', 's il vous plait',
  'allez', 'bon', 'alors', 'maintenant', 'et',
];
/** Petits mots sans importance pour reconnaître un objet. */
const STOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'a', 'au', 'aux', 'toi', 'moi', 'te', 'me', 'm', 't', 'se', 's', 'y', 'en', 'vers', 'avec', 'propre', 'propres', 'sale', 'sales', 'mouille', 'mouillee', 'mouilles', 'mouillees', 'jusqu', 'jusque', 'sur', 'dans', 'tous', 'toutes', 'tout', 'toute', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'qui', 'trainent', 'traine', 'piece', 'ici', 'et', 'aussi', 'stp', 'svp', 'ouvert', 'ouverte', 'ouverts', 'place', 'sous', 'dessous']);

/** Autres noms donnés aux objets (forme normalisée). */
const ALIASES: Record<string, string[]> = {
  livre: ['livre', 'livres', 'bouquin', 'bouquins'],
  tasse: ['tasse', 'mug'],
  lettre: ['lettre', 'courrier', 'enveloppe'],
  caisse: ['caisse', 'carton', 'boite'],
  bibliotheque: ['bibliotheque', 'etagere', 'etageres'],
  canape: ['canape', 'sofa', 'divan', 'canap'],
  'table basse': ['basse'],
  table: ['table'],
  chaise: ['chaise', 'chaises', 'siege'],
  'machine a cafe': ['machine', 'cafetiere'],
  evier: ['evier', 'robinet'],
  lavabo: ['lavabo', 'lavabos', 'miroir', 'glace', 'vasque'],
  douche: ['douche', 'douches', 'baignoire'],
  toilettes: ['toilettes', 'toilette', 'wc', 'cuvette', 'chiottes'],
  serviette: ['serviette', 'serviettes'],
  'papier toilette': ['papier', 'pq'],
  'porte papier': ['derouleur', 'distributeur', 'pq'],
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
  verre: ['verre', 'verres'],
  bol: ['bol', 'bols'],
  cuillere: ['cuillere', 'cuilleres', 'cuiller', 'cuillers', 'couverts'],
  carafe: ['carafe', 'carafes', 'pichet', 'broc'],
  egouttoir: ['egouttoir', 'egouttoirs', 'egouttoire'],
  torchon: ['torchon', 'torchons', 'linge'],
  'plan de travail': ['plan', 'comptoir', 'paillasse'],
  'planche a decouper': ['planche', 'planches'],
  couteau: ['couteau', 'couteaux'],
  pain: ['pain', 'pains', 'miche', 'batard'],
  baguette: ['baguette', 'baguettes'],
  poire: ['poire', 'poires'],
  raisin: ['raisin', 'raisins', 'grappe'],
  poireau: ['poireau', 'poireaux'],
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
  hamburger: ['hamburgers', 'burger', 'burgers', 'sandwich', 'sandwichs'],
  'steak aux pommes de terre': ['plat', 'steak', 'patates'],
  'salade verte': ['salade', 'salades'],
  'salade de fruits': ['salade', 'dessert'],
  'sandwich au jambon': ['sandwich', 'sandwichs'],
  'hot dog': ['hotdog', 'hot'],
  'poulet frites': ['poulet', 'frites'],
  'poelee de legumes': ['poelee', 'legumes'],
  'croque monsieur': ['croque', 'croques', 'croquemonsieur'],
  bruschetta: ['bruschettas'],
  'gratin de pates': ['gratin', 'gratins', 'macaronis', 'macaroni'],
  'poulet roti': ['poulet', 'roti'],
  'poire au chocolat': ['poire', 'poires'],
  crumble: ['crumbles', 'tarte'],
  'pain perdu': ['pains perdus'],
  croutons: ['crouton'],
  // la vaisselle en plus
  passoire: ['passoires', 'egouttoir a pates'],
  'plat a four': ['plat', 'plats', 'plat a gratin'],
  'pierre a pizza': ['pierre', 'pierres'],
  // les provisions
  'tablette de chocolat': ['chocolat', 'chocolats', 'tablette'],
  'pate a tartiner': ['tartiner', 'nutella', 'pate'],
  'sauce tomate': ['sauce', 'sauces'],
  confiture: ['confiture', 'confitures'],
  biscuits: ['biscuit', 'biscuits', 'gateaux', 'cookies'],
  oignon: ['oignon', 'oignons'],
  salade: ['salade', 'salades', 'laitue'],
  'feuilles de salade': ['feuilles', 'feuille'],
  poulet: ['poulet', 'cuisse'],
  poisson: ['poisson', 'poissons', 'filet'],
  saucisses: ['saucisse', 'saucisses'],
  yaourt: ['yaourt', 'yaourts', 'yogourt'],
  banane: ['banane', 'bananes'],
  orange: ['orange', 'oranges'],
  fraises: ['fraise', 'fraises'],
  citron: ['citron', 'citrons'],
  // l'entretien et les meubles
  balai: ['balai', 'balais', 'balayette', 'pelle'],
  serpilliere: ['serpilliere', 'serpillieres', 'serpiere', 'wassingue', 'mop'],
  seau: ['seau', 'seaux'],
  'spray nettoyant': ['spray', 'nettoyant', 'produit'],
  'gants de menage': ['gants', 'gant'],
  savon: ['savon', 'savons'],
  conteneur: ['conteneur', 'container', 'benne'],
  portemanteau: ['portemanteau', 'patere', 'pateres'],
  manteau: ['manteau', 'veste', 'blouson'],
  echarpe: ['echarpe', 'foulard'],
  fenetre: ['fenetre', 'fenetres'],
  horloge: ['horloge', 'pendule'],
  ilot: ['ilot'],
  tabouret: ['tabouret', 'tabourets'],
  'barre a couteaux': ['barre', 'aimant'],
  crochets: ['crochet', 'crochets'],
  maniques: ['manique', 'maniques'],
  'sacs poubelle': ['rouleau', 'sacs'],
  'sac poubelle': ['sac'],
  // le thé
  theiere: ['theiere', 'theieres'],
  'sachets de the': ['sachet', 'sachets'],
  champignons: ['champignon', 'champignons'],
  poivron: ['poivron', 'poivrons'],
  courgette: ['courgette', 'courgettes'],
  mayonnaise: ['mayonnaise', 'mayo'],
  'jus d orange': ['jus'],
  soda: ['soda', 'sodas', 'coca', 'canette'],
  'eau gazeuse': ['gazeuse', 'perrier', 'badoit'],
  frites: ['frite', 'frites'],
  pizza: ['pizza', 'pizzas'],
  'legumes surgeles': ['legumes', 'surgeles'],
  'rondelles de banane': ['rondelles', 'rondelle'],
  'quartiers d orange': ['quartiers', 'quartier'],
  'rondelles de citron': ['rondelles', 'rondelle'],
  'garde manger': ['garde', 'gardemanger', 'cellier', 'provisions', 'reserve'],
  'sac de courses': ['sac', 'cabas'],
  'liste de courses': ['liste'],
  // la cuisine (lot gestes)
  oeuf: ['oeuf', 'oeufs'],
  lait: ['lait'],
  beurre: ['beurre'],
  fromage: ['fromage', 'gruyere', 'emmental'],
  saladier: ['saladier', 'saladiers', 'jatte'],
  fouet: ['fouet'],
  spatule: ['spatule'],
  'cuillere en bois': ['bois'],
  louche: ['louche'],
  rape: ['rape'],
  'pot a ustensiles': ['ustensiles'],
  'etagere a epices': ['epices', 'epice'],
  'herbes de provence': ['herbes', 'herbe'],
  'huile d olive': ['huile'],
  omelette: ['omelette', 'omelettes'],
  crepe: ['crepe', 'crepes'],
  'oeuf au plat': ['oeuf', 'oeufs'],
  'fromage rape': ['fromage'],
  'crepe a la confiture': ['crepe', 'crepes'],
  'crepe au miel': ['crepe', 'crepes'],
  'crepe au chocolat': ['crepe', 'crepes'],
  'crepe au beurre': ['crepe', 'crepes'],
  'tartines de confiture': ['tartine', 'tartines'],
  'tartines au miel': ['tartine', 'tartines'],
  'tartines au chocolat': ['tartine', 'tartines'],
  'tartines beurrees': ['tartine', 'tartines'],
  'livre de recettes': ['recettes', 'recette', 'livre'],
  // la chambre
  armoire: ['armoire', 'armoires', 'penderie', 'dressing'],
  pull: ['pull', 'pulls', 'pullover', 'sweat', 'gilet', 'tricot'],
  'lampe de chevet': ['lampe', 'lampes', 'chevet', 'veilleuse'],
  'table de nuit': ['nuit'],
  lit: ['lit', 'lits', 'plumard', 'pieu'],
  // la lessive
  'machine a laver': ['machine', 'laver'],
  'seche linge': ['seche', 'sechelinge'],
  etendoir: ['etendoir', 'sechoir'],
  'panier a linge': ['panier'],
  // dehors : l'étang, le camping, le jardin
  etang: ['etang', 'mare', 'lac'],
  'canne a peche': ['canne', 'cannes'],
  'canne a peche en bambou': ['canne', 'cannes', 'bambou'],
  'canne a peche a moulinet': ['canne', 'cannes', 'moulinet'],
  'canne a peche en carbone': ['canne', 'cannes', 'carbone'],
  'canne a peche de champion': ['canne', 'cannes', 'champion'],
  'feu de camp': ['feu', 'camp', 'bivouac', 'braises'],
  'trousse de secours': ['trousse', 'secours'],
  'massif de fleurs': ['fleurs', 'fleur', 'massif'],
  // le salon, l'entrée, le garage, la salle de bain, la chambre
  tele: ['tele', 'teles', 'television', 'tv', 'teloche', 'ecran', 'poste'],
  telecommande: ['telecommande', 'zapette', 'telecommandes'],
  'meuble tele': ['meuble'],
  fauteuil: ['fauteuil', 'fauteuils'],
  lampadaire: ['lampadaire', 'lampadaires'],
  'boite aux lettres': ['bal'],
  chaussure: ['chaussure', 'chaussures', 'basket', 'baskets', 'souliers'],
  chausson: ['chausson', 'chaussons', 'pantoufle', 'pantoufles'],
  'botte de pluie': ['botte', 'bottes'],
  parapluie: ['parapluie', 'parapluies', 'pepin'],
  'porte parapluies': ['parapluies'],
  'caisse a outils': ['caisse', 'outils', 'boite'],
  'rangement a outils': ['ratelier', 'rateliers'],
  etagere: ['etagere', 'etageres'],
  velo: ['velo', 'velos', 'bicyclette', 'bicyclettes', 'bici', 'biclou'],
  'brosse a dents': ['brosse'],
  'verre a dents': ['gobelet'],
  'gel douche': ['gel', 'shampoing', 'shampooing'],
  'chemise sur cintre': ['chemise', 'chemises', 'cintre'],
  plante: ['plante', 'plantes', 'sansevieria'],
  // les provisions en paquet
  'paquet de pates': ['pates', 'spaghetti', 'spaghettis', 'nouilles', 'coquillettes'],
  'paquet de riz': ['riz'],
  'brique de soupe': ['soupe', 'soupes', 'potage'],
  'moule a gateau': ['moule'],
  'bac a glacons': ['bac'],
  farine: ['farine'],
  sucre: ['sucre'],
  levure: ['levure'],
  chips: ['chips'],
  jambon: ['jambon'],
  lasagne: ['lasagne', 'lasagnes'],
};

/** Premiers mots trop vagues pour désigner seuls un objet (« porte-parapluies » n'est pas « la porte »). */
const VAGUE_HEADS = new Set(['porte', 'paquet', 'brique', 'bac', 'moule', 'meuble', 'boite', 'sac', 'sacs', 'verre', 'gel', 'lampe', 'table', 'placard', 'barre', 'caisse', 'plan', 'pot', 'chemise']);
/** Le singulier d'un mot (« tasses » → « tasse », « gâteaux » → « gâteau »). */
const singular = (w: string) => (w.length > 3 && (w.endsWith('s') || w.endsWith('x')) ? w.slice(0, -1) : w);

/** Mots qui désignent l'objet : son nom, ses autres noms, et sa couleur pour les livres (« livre-rouge »). */
function words(o: WorldObject): { kind: string[]; detail: string[] } {
  const nom = normalize(o.nom);
  // sans autre nom connu : le nom d'un seul mot, ou le premier mot d'un nom composé (« brosse » à dents)
  const head = nom.split(' ')[0];
  const kind = ALIASES[nom] ?? (nom.includes(' ') ? (VAGUE_HEADS.has(head) ? [] : [head]) : [nom]);
  const detail = normalize(o.ref).split(' ').filter((w) => !kind.includes(w) && !/^\d+$/.test(w));
  return { kind, detail };
}

/** Objets nommés dans `clause` (les plus proches d'abord), et si l'ordre vise tous ceux de ce genre. */
function findObjects(clause: string[], objets: WorldObject[], fuzzy = false): { found: WorldObject[]; all: boolean } {
  const text = ` ${clause.join(' ')} `;
  // les noms composés dits en entier (« boîte aux lettres ») : leurs mots ne désignent pas un autre
  // objet (ni la boîte de pastilles, ni la lettre)
  const fulls = [...new Set(objets.map((o) => normalize(o.nom)).filter((n) => n.includes(' ') && (text.includes(` ${n} `) || text.includes(` ${n}s `))))];
  const masked = fulls.reduce((t, n) => t.replace(new RegExp(` ${n}s? `, 'g'), ` ${'_ '.repeat(n.split(' ').length)}`), text).trim().split(' ');
  const said0 = clause;
  clause = masked;
  const found = objets.filter((o) => {
    const { kind, detail } = words(o);
    // le nom entier, sinon un de ses mots, au singulier comme au pluriel
    if (fulls.includes(normalize(o.nom))) return true;
    const i = clause.findIndex((w) => kind.includes(w) || kind.includes(singular(w)));
    if (i < 0) return false;
    // « pomme de terre » n'est pas une pomme
    if (clause[i] === 'pomme' && clause[i + 1] === 'de' && clause[i + 2] === 'terre') return normalize(o.nom) === 'pomme de terre';
    // une couleur juste après le nom (« le livre rouge ») restreint aux livres de cette couleur
    const colour = clause[i + 1];
    if (colour && !STOP.has(colour) && !VERB_OF.has(colour) && !Object.values(ALIASES).flat().includes(colour)) return detail.includes(colour);
    return true;
  });
  // rien de reconnu : une faute de frappe sur le nom (« la tase », « la pome »)
  if (!found.length && !fuzzy) {
    const vocab = objets.flatMap((o) => words(o).kind).filter((k) => k.length >= 4);
    // un mot connu (« salon », « crêpe ») ou un verbe à l'infinitif (« brosser ») n'est pas une faute
    const real = (w: string) => nouns().has(w) || nouns().has(singular(w)) || /(er|ir)$/.test(w) || ROOM_WORDS.some(([ws]) => ws.includes(w));
    const fixed = said0.map((w) => (w.length >= 4 && !STOP.has(w) && !NEUTRAL.has(w) && !NO_FIX.has(w) && !real(w) && !vocab.includes(w) && !VERB_OF.has(w) ? (vocab.find((k) => k[0] === w[0] && Math.abs(k.length - w.length) <= 1 && editDistance(w, k) === 1) ?? w) : w));
    if (fixed.some((w, i) => w !== said0[i])) return findObjects(fixed, objets, true);
  }
  found.sort((a, b) => a.distance - b.distance);
  // un nom entier dit dans l'ordre l'emporte sur un nom voisin : « les tranches de tomate » (pas
  // celles de pain), « les quartiers de pomme » (pas la pomme)
  const said = (o: WorldObject) => text.includes(` ${normalize(o.nom)} `) || text.includes(` ${normalize(o.nom)}s `);
  const exact = found.filter((x) => !found.some((y) => {
    if (y.nom === x.nom || !said(y)) return false;
    if (y.nom.includes(x.nom)) return true;
    const kx = words(x).kind;
    return !said(x) && words(y).kind.some((k) => kx.includes(k));
  }));
  // « tous », « les », ou un nom au pluriel (« livres »)
  const all = said0.some((w) => ['tous', 'toutes', 'les'].includes(w) || (w !== singular(w) && exact.some((o) => words(o).kind.includes(w) || words(o).kind.includes(singular(w)))));
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
    // « prends ton petit-déjeuner », « fais le petit déj »
    if (/\bpetit (dejeuner|dej)\b/.test(w.join(' '))) {
      out.push({ kind: 'petit_dej' });
      continue;
    }
    // « quelle heure est-il ? »
    if (w.join(' ').startsWith('quelle heure') || w.join(' ').startsWith('il est quelle heure')) {
      out.push({ kind: 'heure' });
      continue;
    }
    // « combien il me reste ? », « combien d'argent j'ai ? »
    if (/^(combien|j ai combien|il me reste combien|il reste combien)\b/.test(w.join(' ')) && /\b(argent|sous|fric|reste|porte monnaie|portefeuille)\b/.test(w.join(' '))) {
      out.push({ kind: 'argent' });
      continue;
    }
    // ce que le perso ressent, dit par le joueur : « j'ai faim », « j'ai soif », « je suis fatigué »
    const said = w.join(' ');
    const feel = feeling(said);
    if (feel) {
      out.push(...feel);
      continue;
    }
    // « qu'est-ce qu'il y a dans le frigo ? », « il y a quoi dans le placard » : regarder dedans
    const inside = /^(?:qu est ce qu il y a|qu y a t il|il y a quoi|y a quoi|quoi) (dans|au|a la)\b/.exec(said);
    if (inside) w = ['regarde', ...said.slice(inside[0].length - inside[1].length).split(' ')];
    // « salut », « bonjour », « coucou » tout seul : le perso le dit
    if (/^(salut|bonjour|bonsoir|coucou|hello|bonne nuit|au revoir|merci)( a (tous|toi|vous))?$/.test(said)) {
      out.push({ kind: 'dire', texte: original.trim().replace(/^./, (c) => c.toUpperCase()) });
      continue;
    }
    // le réveil : « règle le réveil à 7 h 30 », « réveille-moi à 6 h », « coupe le réveil »,
    // « arrête la sonnerie », « mets la sonnerie mélodie »
    const alarm = parseAlarm(w);
    if (alarm) {
      out.push(alarm);
      continue;
    }
    // « tu peux me faire un café » : le pronom avant le verbe
    if (['me', 'm', 'nous'].includes(w[0]) && VERB_OF.has(w[1])) w = w.slice(1);
    // « je veux un café », « je voudrais une pomme », « j'ai envie d'un thé » : ce qu'on demande se
    // prépare (café, thé, plat), sinon se prend ; suivi d'un verbe (« j'ai envie de dormir ») : l'ordre
    const wish = /^(?:je veux|je voudrais|j aimerais|j veux|j ai envie d|j ai envie de|je prendrais|je prends|on veut|on voudrait) /.exec(`${w.join(' ')} `);
    if (wish) {
      const after = w.slice(wish[0].trim().split(' ').length);
      if (VERB_OF.has(after[0])) w = after;
      else {
        // (« je voudrais une pomme » : la prendre, pas la servir dans une assiette)
        const served = parseClause('cafe', after, original, world, 'sers');
        const plain = served?.length === 1 && served[0].kind === 'servir' && !served[0].sur;
        const asked = (plain ? null : served) ?? parseClause('prendre', after, original, world, 'prends');
        if (!asked?.length) return null;
        out.push(...asked);
        continue;
      }
    }
    // « va prendre la tasse » : aller + autre verbe → seulement l'autre verbe
    // « va te laver » : le pronom entre les deux
    if (VERB_OF.get(w[0]) === 'aller' && ['te', 't', 'me', 'm', 'nous'].includes(w[1]) && VERB_OF.has(w[2])) w = [w[0], ...w.slice(2)];
    if (VERB_OF.get(w[0]) === 'aller' && w[1] && VERB_OF.has(w[1]) && VERB_OF.get(w[1]) !== 'aller') w = w.slice(1);
    // une faute de frappe sur le verbe (« etein », « alume », « rnage ») : le verbe le plus proche
    if (w[0] && !VERB_OF.has(w[0])) {
      const near = closest(w[0], [...VERB_OF.keys()]);
      if (near) w = [near, ...w.slice(1)];
    }
    // « fais-toi un café », « sers-moi » : le pronom suit le verbe
    const verb = VERB_OF.get(w[0]);
    if (!verb) return null;
    const rest = w.slice(1);
    // « remplis la bouilloire et allume-la » : « la » est l'objet du morceau d'avant
    const prev = [...out].reverse().find((i): i is Intent & { ref: string } => 'ref' in i && typeof i.ref === 'string');
    const pronoun = rest.length > 0 && rest.every((x) => ['le', 'la', 'les', 'l', 'lui'].includes(x));
    const named = pronoun && prev ? world.objets.find((o) => o.ref === prev.ref) : undefined;
    const intent = parseClause(verb, named ? normalize(named.nom).split(' ') : rest, original, world, w[0]);
    if (!intent?.length) return null;
    out.push(...intent);
  }
  return out;
}

/** « j'ai faim », « j'ai soif », « je suis fatigué », « j'ai envie de faire pipi », sinon null. */
function feeling(text: string): Intent[] | null {
  const m = /^(?:j ai|je suis|je me sens|je meurs de|j ai trop|j ai tres|j ai super) ?(?:trop |tres |super |vraiment |un peu )?(.*)$/.exec(text);
  if (!m) return null;
  const how = m[1];
  if (/^(faim|la dalle|les crocs|un creux|un petit creux)\b/.test(how)) return [{ kind: 'manger' }];
  if (/^soif\b/.test(how)) return [{ kind: 'boire', liquide: 'eau' }];
  if (/^(fatigue|fatiguee|creve|crevee|epuise|epuisee|sommeil|naze|claque)\b/.test(how)) return [{ kind: 'dormir' }];
  if (/^(envie de (faire )?(pipi|caca)|envie d aller aux toilettes|besoin d aller aux toilettes)\b/.test(how)) return [{ kind: 'toilettes' }];
  if (/^(sale|salle|tout sale|crade|pas propre)$/.test(how)) return [{ kind: 'douche' }];
  return null;
}

/** Distance d'édition (insertion, suppression, remplacement, inversion de deux lettres voisines). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + +(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Le seul mot de `candidates` à une faute près de `w` (mots de 5 lettres ou plus), sinon undefined. */
function closest(w: string, candidates: Iterable<string>): string | undefined {
  if (w.length < 5) return undefined;
  const near = [...new Set(candidates)].filter((c) => c.length >= 4 && Math.abs(c.length - w.length) <= 1 && editDistance(w, c) === 1);
  return near.length === 1 || (near.length > 1 && near.every((c) => VERB_OF.get(c) === VERB_OF.get(near[0]))) ? near[0] : undefined;
}

/** Le seul mot de `candidates` à une faute près de `w` (5 lettres ou plus), sinon undefined. */
function closestOf(w: string, candidates: string[]): string | undefined {
  const near = candidates.filter((c) => c.length >= 4 && Math.abs(c.length - w.length) <= 1 && editDistance(w, c) === 1);
  return near.length === 1 ? near[0] : undefined;
}

/**
 * Les ordres de ménage : « fais le ménage (dans la cuisine) », « nettoie la salle de bain »,
 * « balaie l'entrée », « passe l'aspirateur au salon », « passe la serpillière », « lave le sol »,
 * « fais la poussière », « dépoussière la bibliothèque », « fais les vitres », « nettoie le miroir »,
 * « frotte les toilettes », « récure la douche ». undefined si l'ordre ne parle pas de ménage.
 */
function choreClause(verb: string, said: string[], found: WorldObject[]): Intent[] | null | undefined {
  const chores = ['cafe', 'essuyer', 'balayer', 'passer', 'laver', 'aspirer', 'depoussierer', 'recurer'];
  if (!chores.includes(verb)) return undefined;
  const rest = fixChoreWords(said);
  const has = (set: Set<string> | string[]) => rest.some((x) => (Array.isArray(set) ? set.includes(x) : set.has(x)));
  const piece = roomIn(rest);
  const where = piece ? { piece } : {};
  const everywhere = has(EVERYWHERE);
  // ce qui n'est ni le lieu ni l'outil : la cible (un meuble, un sanitaire)
  // (« les meubles » : tous, pas le meuble télé)
  const target = rest.includes('meubles') || (rest.includes('meuble') && !rest.some((x) => x.startsWith('tele'))) ? undefined : found.find((o) => !o.portable && !['balai', 'serpillière', 'spray nettoyant', 'éponge', 'torchon', 'seau'].includes(o.nom));
  const whole = (): Intent[] => [{ kind: 'menage', ...where, ...(!piece && !everywhere && rest.some((x) => x === 'piece' || x === 'ici') ? { ici: true } : {}) }];
  // se brosser les dents, se frotter les mains : pas du ménage
  if (rest.some((x) => ['dents', 'dent', 'cheveux', 'mains', 'main', 'visage', 'toi', 'te', 'moi', 'dos'].includes(x))) return verb === 'recurer' ? null : undefined;
  // « fais le ménage », « fais un peu de ménage dans le salon », « nettoie le ménage » : tout ce qui est sale
  if (rest.includes('menage') || rest.includes('menages')) return whole();
  if (has(GLASS_WORDS) && verb !== 'balayer' && verb !== 'aspirer') return [{ kind: 'vitres', ...(piece ? where : rest.some((x) => x.startsWith('miroir') || x.startsWith('glace')) ? { piece: 'salle de bain' } : {}) }];
  switch (verb) {
    case 'cafe':
      // « fais la poussière », « fais les sols »
      if (has(DUST_WORDS)) return [{ kind: 'poussiere', ...where }];
      if (has(FLOOR_WORDS)) return [{ kind: 'serpillere', ...where }];
      return undefined;
    case 'balayer':
      // « balaie », « balaie la cuisine », « balaie les miettes »
      return [{ kind: 'balayer', ...where }];
    case 'aspirer':
      // « aspire le salon », « aspire le canapé », « aspire le tapis »
      return [{ kind: 'aspirateur', ...where, ...(target ? { ref: target.ref } : {}) }];
    case 'depoussierer':
      // « dépoussière les meubles », « époussette la bibliothèque »
      return [{ kind: 'poussiere', ...where, ...(target ? { ref: target.ref } : {}) }];
    case 'passer':
      // « passe l'aspirateur », « passe un coup d'aspi dans la chambre », « passe le balai », « passe la serpillière », « passe le chiffon »
      if (rest.some((x) => x.startsWith('aspi'))) return [{ kind: 'aspirateur', ...where }];
      if (rest.some((x) => x.startsWith('balai')) || found.some((o) => o.nom === 'balai')) return [{ kind: 'balayer', ...where }];
      if (rest.some((x) => x.startsWith('serpi')) || found.some((o) => o.nom === 'serpillière')) return [{ kind: 'serpillere', ...where }];
      if (has(DUST_WORDS)) return [{ kind: 'poussiere', ...where, ...(target ? { ref: target.ref } : {}) }];
      return undefined;
    default: {
      // « lave le sol », « nettoie le carrelage de la cuisine » : la serpillière (les flaques : l'éponge)
      if (has(FLOOR_WORDS)) return [{ kind: 'serpillere', ...where }];
      // « nettoie la salle de bain », « nettoie la maison », « nettoie tout » : le ménage de la pièce
      const bare = rest.filter((x) => !STOP.has(x) && !NEUTRAL.has(x) && !EVERYWHERE.has(x) && !ROOM_WORDS.some(([ws]) => ws.some((w) => w.split(' ').includes(x))) && x !== 'piece');
      if (!bare.length && (piece || ((everywhere || rest.includes('piece')) && verb === 'essuyer')) && !found.length) return whole();
      // « frotte les toilettes », « récure la douche », « lave la baignoire » : la zone sale de ce meuble
      if (verb === 'recurer') return target ? [{ kind: 'nettoyer', ref: target.ref }] : null;
      if (verb === 'laver' && (target?.nom === 'toilettes' || target?.nom === 'douche' || (target?.nom === 'lavabo' && !rest.includes('robinet')))) return [{ kind: 'nettoyer', ref: target.ref }];
      return undefined;
    }
  }
}

/** Un ordre pour le réveil, sinon null. */
function parseAlarm(w: string[]): Intent | null {
  const text = w.join(' ');
  const about = /\b(reveil|reveils|sonnerie|alarme)\b/.test(text);
  const hm = /\b(\d{1,2}) ?(?:h|heures?)(?: ?(\d{1,2})| et (demie|demi|quart))?\b/.exec(text) ?? /\b(\d{1,2})h(\d{2})\b/.exec(text);
  const heure = hm ? (Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : hm[3] === 'quart' ? 0.25 : hm[3] ? 0.5 : 0)) % 24 : undefined;
  // « réveille-moi à 7 h »
  if (!about) return VERB_OF.get(w[0]) === 'reveiller' && heure !== undefined ? { kind: 'reveil', heure } : null;
  const v = w[0];
  const tone = /\b(cloche|bip|bips|melodie|musique)\b/.exec(text)?.[1];
  const sonnerie = tone ? ({ bips: 'bip', melodie: 'mélodie', musique: 'mélodie' } as Record<string, string>)[tone] ?? tone : undefined;
  // « change la sonnerie », « mets la sonnerie cloche »
  if (/\bsonnerie\b/.test(text) && (tone || /^(change|changer|choisis|choisir)$/.test(v))) return { kind: 'reveil', sonnerie: sonnerie ?? '', heure };
  if (heure !== undefined) return { kind: 'reveil', heure, sonnerie };
  // « arrête la sonnerie », « arrête le réveil », « stop »
  if (VERB_OF.get(v) === 'arreter' || /^(fais|fait) taire$/.test(w.slice(0, 2).join(' '))) return { kind: 'reveil', arreter: true };
  // « coupe le réveil », « désactive l'alarme », « éteins le réveil »
  if (['coupe', 'couper', 'desactive', 'desactiver', 'eteins', 'eteindre', 'enleve', 'enlever', 'supprime', 'supprimer'].includes(v)) return { kind: 'reveil', couper: true };
  // « règle le réveil » sans heure : 7 h
  if (['regle', 'regler', 'mets', 'mettre', 'programme', 'programmer', 'active', 'activer'].includes(v)) return { kind: 'reveil', heure: 7 };
  return null;
}

function parseClause(verb: string, rest: string[], original: string, world: { enMain: string[]; objets: WorldObject[] }, word = ''): Intent[] | null {
  const { found, all } = findObjects(rest, world.objets);
  const appliance = (nom: string) => world.objets.find((o) => o.nom === nom);
  const held = world.objets.filter((o) => world.enMain.includes(o.ref));
  const news = newsClause(verb, rest, found, all);
  if (news !== undefined) return news;
  const chore = choreClause(verb, rest, found);
  if (chore !== undefined) return chore;
  switch (verb) {
    case 'prendre': {
      // « prends une douche », « prends un bain » (mais « prends le gel douche » : le flacon)
      if ((rest.includes('douche') || rest.includes('bain')) && !found.some((o) => o.portable)) return [{ kind: 'douche' }];
      // « sors du lit » : se lever
      if (word.startsWith('sor') && found.length && found.every((o) => o.sorte === 'lit')) return [{ kind: 'reveiller' }];
      // « prends le vélo » : monter dessus
      if (found.some((o) => o.nom === 'vélo')) return [{ kind: 'velo', monter: true }];
      // « sors la poubelle », « sors le sac poubelle » : au conteneur dehors
      if (word.startsWith('sor') && (rest.some((x) => x.startsWith('poubelle')) || found.some((o) => o.nom === 'sac poubelle'))) return [{ kind: 'sortir_poubelle' }];
      // ceux qui traînent avant ceux qui sont rangés, puis les plus proches
      const portable = found.filter((o) => o.portable && !world.enMain.includes(o.ref)).sort((a, b) => +!isLoose(a) - +!isLoose(b));
      if (!portable.length) return null;
      // « prends 2 livres », « prends les livres » : une pile (6 au plus) ; sinon un seul objet
      const n = portable[0].nom === 'livre' ? Math.min(6, count(rest) ?? (all ? 6 : 1)) : portable[0].deuxMains ? 1 : Math.min(2, count(rest) ?? (all ? 2 : 1));
      return portable.filter((o) => o.nom === portable[0].nom).slice(0, n).map((o) => ({ kind: 'prendre', ref: o.ref }));
    }
    case 'poser': {
      // « mets du poivre (sur l'omelette) », « mets un peu d'huile » : assaisonner
      if (['du', 'de', 'des', 'un'].includes(rest[0]) && rest.some((x) => SPICE_WORDS[x])) return parseClause('assaisonner', rest, original, world);
      // « mets du ketchup sur les frites », « mets un filet de citron » (mais « mets un citron sur la planche » : poser)
      if ((['du', 'de', 'des'].includes(rest[0]) || ['peu', 'trait', 'filet', 'noix'].includes(rest[1])) && rest.some((x) => CONDIMENT_WORDS[x])) return parseClause('assaisonner', rest, original, world);
      // « mets la télé » : l'allumer
      if (found.length && found.every((o) => o.nom === 'télé' || o.nom === 'meuble télé') && !rest.some((x) => ['sur', 'dans', 'a', 'au'].includes(x))) return [{ kind: 'allumer', ref: found.find((o) => o.nom === 'télé')!.ref }];
      // « remets la tasse à sa place » : là où elle se range
      if (rest.includes('place') && rest.some((x) => ['sa', 'leur', 'leurs', 'ta', 'tes'].includes(x))) return [{ kind: 'ranger_place', ref: found.find((o) => o.portable)?.ref }];
      // « mets la lumière » : allumer une lampe
      if (rest.some((x) => LIGHT_WORDS.has(x)) && !rest.some((x) => ['sur', 'dans'].includes(x))) return parseClause('allumer', rest, original, world, 'allume');
      // « mets l'eau à bouillir », « mets de l'eau à chauffer »
      if (rest.includes('eau') && rest.some((x) => ['bouillir', 'chauffer', 'rechauffer'].includes(x))) return parseClause('cuire', rest.filter((x) => !['bouillir', 'chauffer', 'rechauffer'].includes(x)), original, world, 'bouillir');
      // « mets-toi à table », « mets-toi au lit », « mets-toi sur le canapé », « repose-toi »
      if (['toi', 'te'].includes(rest[0])) {
        if (word.startsWith('repos') && !found.length) return [{ kind: 'asseoir', ref: world.objets.find((o) => o.nom === 'canapé')?.ref }];
        if (rest.includes('table')) return [{ kind: 'attabler' }];
        if (rest.includes('lit') || rest.includes('dodo')) return [{ kind: 'dormir', ref: found.find((o) => o.sorte === 'lit')?.ref }];
        const seat = found.find((o) => o.sorte === 'siège');
        if (seat) return [{ kind: 'asseoir', ref: seat.ref }];
        return null;
      }
      // « mets ton pull », « mets tes chaussons » : s'habiller n'est pas un geste du jeu (l'IA le dira)
      if (['mets', 'met', 'mettre', 'remets', 'remettre'].includes(word) && !rest.some((x) => ['sur', 'dans', 'a', 'au', 'pres', 'sous'].includes(x)) && (rest.some((x) => WEAR_WORDS.has(x) || WEAR_WORDS.has(singular(x))) || found.some((o) => WEAR_WORDS.has(normalize(o.nom).split(' ')[0])))) return null;
      // « mets une pastille (dans le lave-vaisselle) »
      if (rest.some((x) => x.startsWith('pastille'))) return [{ kind: 'pastille' }];
      // « mets un sachet de thé (dans la tasse / la théière) »
      if (rest.some((x) => x === 'sachet' || x === 'sachets')) return [{ kind: 'sachet', ref: found.find((o) => o.nom === 'tasse' || o.nom === 'théière')?.ref }];
      // « mets les gants (de ménage) »
      if (rest.some((x) => x === 'gants' || x === 'gant')) return [{ kind: 'gants', mettre: true }];
      // « mets un sac (neuf) dans la poubelle »
      if (rest.includes('sac') && !rest.includes('courses') && (found.some((o) => o.sorte === 'poubelle') || rest.some((x) => ['neuf', 'propre', 'nouveau', 'poubelle'].includes(x)))) return [{ kind: 'sac_neuf', ref: found.find((o) => o.sorte === 'poubelle')?.ref }];
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
      // « mets la vaisselle dans l'égouttoir » : la vaisselle propre (mouillée d'abord) qu'on tient ou qui traîne
      if (target?.sorte === 'égouttoir') {
        if (item) return [{ kind: 'mettre', ref: item.ref, dans: target.ref }];
        const wet = world.objets.filter((o) => isDish(o) && !o.ou.includes('sale') && (world.enMain.includes(o.ref) || (isLoose(o) && o.ou.includes('mouill'))));
        return wet.length ? wet.map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: target.ref })) : null;
      }
      if (target?.sorte === 'rangement' && (item?.nom ?? held[0]?.nom) === 'livre') return [{ kind: 'ranger', refs: item ? [item.ref] : [], onlyHeld: !item }];
      // « mets le parapluie dans le porte-parapluies », « accroche la poêle à la barre », « mets le papier sur le dérouleur »
      if (target?.sorte === 'rangement' && (rest[where] !== 'sur' || !/table|meuble|etabli|bibliotheque/.test(normalize(target.nom)))) return [{ kind: 'mettre', ref: item?.ref, dans: target.ref }];
      // « mets la pomme dans le frigo », « mets la poêle sur le feu », « mets le steak dans la poêle »,
      // « mets la tasse au lave-vaisselle », « mets la bouteille à la poubelle »
      // (« pose la tasse sur le plan de travail », « sur la table de nuit » : dessus, pas dedans)
      const onTop = rest[where] === 'sur' && target?.sorte !== 'gazinière' && target?.sorte !== 'ustensile';
      if (target && !onTop && (target.sorte === 'ustensile' || target.sorte === 'gazinière' || (OPENS.has(target.sorte ?? '') && target.sorte !== 'poubelle'))) return [{ kind: 'mettre', ref: item?.ref, dans: target.ref }];
      if (target?.sorte === 'poubelle') return [{ kind: 'jeter', ref: item?.ref }];
      // « mets le sandwich dans l'assiette »
      if (target && target.nom in BOWLS && (item ?? held[0])?.sorte === 'nourriture') return [{ kind: 'servir', ref: (item ?? held[0]).ref, sur: target.ref }];
      // « mets la météo », « pose ton sac » : un nom inconnu, pas « pose ce que tu tiens »
      if (!item && unknownWords(where >= 0 ? rest.slice(0, where) : rest, world.objets).length) return null;
      return [{ kind: 'poser', ref: item?.ref, sur: target?.ref }];
    }
    case 'ranger': {
      // « range le lave-vaisselle » : le vider
      if (machineWash(original) && found.every((o) => o.nom === 'lave-vaisselle') && appliance('lave-vaisselle')) return [{ kind: 'vider_lv' }];
      // « range les courses » : le sac, vidé à sa place
      if (rest.includes('courses') || found.some((o) => o.nom === 'sac de courses')) return [{ kind: 'ranger_courses' }];
      // « range la cuisine », « range ta chambre », « range la pièce » : tout ce qui traîne, à sa place
      const room = roomIn(rest);
      if ((room || rest.includes('piece')) && !found.some((o) => o.portable)) return [{ kind: 'ranger_piece', piece: room }];
      // « range-le » : ce qu'on tient
      if (rest.length && rest.every((x) => ['le', 'la', 'les', 'l', 'ca'].includes(x))) return [{ kind: 'ranger', refs: [], onlyHeld: true }];
      // « range la chaise (sous la table) »
      const chair = found.find((o) => o.sorte === 'siège');
      if (chair && found.every((o) => o.sorte === 'siège' || o.nom === 'table')) return [{ kind: 'chaise', ref: chair.ref, sous: true }];
      // « range la vaisselle dans l'égouttoir » : comme « mets … dans l'égouttoir »
      if (found.some((o) => o.sorte === 'égouttoir') && rest.includes('dans')) return parseClause('poser', rest, original, world, word);
      // « range la vaisselle », « range les couverts » : chaque pièce propre qui traîne, à sa place
      if (rest.includes('vaisselle') || rest.includes('couverts')) {
        const rack = world.objets.find((o) => o.sorte === 'égouttoir');
        const dry = (o: WorldObject) => (isLoose(o) || (!!rack && o.ou.startsWith(`rangé dans ${rack.ref}`))) && !o.ou.includes('mouill');
        const dishes = world.objets.filter((o) => isDish(o) && dry(o) && !o.ou.includes('sale') && !o.ou.includes('contient') && (rest.includes('vaisselle') || COUVERTS.includes(o.nom)));
        return dishes.length ? dishes.map((o): Intent => ({ kind: 'ranger_place', ref: o.ref })) : null;
      }
      // « range les ustensiles » : spatule, louche, fouet, cuillère en bois, chacun à sa place
      if (rest.includes('ustensiles') && !found.some((o) => o.portable)) {
        const tools = world.objets.filter((o) => ['spatule', 'louche', 'fouet', 'cuillère en bois', 'râpe'].includes(o.nom));
        const loose = tools.filter(isLoose);
        return (loose.length ? loose : tools.slice(0, 1)).map((o): Intent => ({ kind: 'ranger_place', ref: o.ref }));
      }
      // « range-le à sa place », « range tout ça »
      if (rest.includes('place')) return [{ kind: 'ranger_place', ref: found.find((o) => o.portable)?.ref }];
      const things = found.filter((o) => o.portable);
      // « range la pomme (dans le frigo) » : ce qui se garde au frais
      // (les surgelés au congélateur, l'épicerie au garde-manger)
      const fridge = world.objets.find((o) => o.nom === 'frigo') ?? world.objets.find((o) => o.sorte === 'frigo');
      const cold = things.filter((o) => o.sorte === 'nourriture' || o.nom === 'bouteille d\'eau');
      if (fridge && cold.length && cold.length === things.length) {
        const item = cold.find((o) => !o.ou.startsWith('rangé')) ?? cold[0];
        const home = world.objets.find((o) => o.nom === STORED_IN[item.nom] && !o.portable) ?? fridge;
        return [{ kind: 'mettre', ref: item.ref, dans: (found.find((o) => !o.portable && (o.sorte === 'frigo' || o.sorte === 'placard')) ?? home).ref }];
      }
      // « range la tasse » (au placard), « range la lettre » (dans le tiroir)
      const other = things.find((o) => o.nom !== 'livre');
      if (other) {
        const where = found.find((o) => !things.includes(o) && ((OPENS.has(o.sorte ?? '') && o.sorte !== 'poubelle') || o.sorte === 'égouttoir' || o.sorte === 'rangement')) ?? world.objets.find((o) => o.nom === STORED_IN[other.nom]);
        // pas de meuble connu (« range les chaussures », « range la télécommande »), ou des objets
        // différents : chacun retourne à sa place (le meuble d'où il vient)
        if (!where || !things.every((o) => o.nom === other.nom)) {
          const loose = things.filter(isLoose);
          if (!loose.length) return [{ kind: 'ranger_place', ref: other.ref }];
          return (all ? loose : loose.slice(0, 1)).map((o): Intent => ({ kind: 'ranger_place', ref: o.ref }));
        }
        // « range le couteau » (sur la barre), « range le torchon » (aux crochets) : à sa place au mur
        // (« range les chaussures dans le porte-parapluies » : là où c'est dit)
        if (where.sorte === 'rangement' && (!found.includes(where) || STORED_IN[other.nom] === where.nom)) return [{ kind: 'ranger_place', ref: (things.find(isLoose) ?? other).ref }];
        // « range les verres » : chacun de ceux qui traînent
        const loose = things.filter(isLoose);
        return (all && loose.length ? loose : [things.find(isLoose) ?? other]).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: where.ref }));
      }
      // « range » tout court, « range les livres », « range le livre rouge »
      // (« range le bazar » : un nom inconnu, ce ne sont pas les livres)
      if (!things.length && !roomIn(rest) && unknownWords(rest, world.objets).length) return null;
      if (all || !things.length) return [{ kind: 'ranger', refs: [] }];
      return [{ kind: 'ranger', refs: [(things.find(isLoose) ?? things[0]).ref] }];
    }
    case 'aller': {
      // « va aux toilettes », « va aux WC », « va faire pipi »
      if (rest.some((x) => ['toilettes', 'toilette', 'wc', 'pipi'].includes(x)) && !rest.includes('ta')) return [{ kind: 'toilettes' }];
      // « va sous la douche »
      if (rest.includes('douche')) return [{ kind: 'douche' }];
      // « va dormir », « va te coucher », « va au lit »
      if (rest.some((x) => ['dormir', 'coucher', 'lit', 'dodo'].includes(x))) return [{ kind: 'dormir', ref: found.find((o) => o.sorte === 'lit')?.ref }];
      // « va faire du vélo »
      if (found.some((o) => o.nom === 'vélo') && rest.includes('faire')) return [{ kind: 'velo', monter: true }];
      // « va dans la cuisine », « va au salon », « file dans ta chambre »
      const room = roomIn(rest);
      if (room && !found.length) return [{ kind: 'piece', piece: room }];
      const target = found[0];
      return target ? [{ kind: 'aller', ref: target.ref }] : null;
    }
    case 'cafe':
      // « fais pipi », « fais tes besoins »
      if (rest.includes('pipi') || rest.includes('besoins')) return [{ kind: 'toilettes' }];
      // « fais des toasts », « fais du pain grillé »
      if (rest.some((x) => x === 'toast' || x === 'toasts') || /\bpain grille/.test(rest.join(' '))) return parseClause('cuire', ['le', 'pain'], original, world, 'griller');
      // « fais une sieste », « fais dodo »
      if (rest.some((x) => ['sieste', 'dodo', 'somme', 'nuit'].includes(x))) return [{ kind: 'dormir' }];
      // « fais du vélo », « fais un tour de vélo »
      if (found.some((o) => o.nom === 'vélo')) return [{ kind: 'velo', monter: true }];
      // « fais un saut », « fais un bond »
      if (rest.some((x) => ['saut', 'bond', 'sauts', 'bonds'].includes(x))) return [{ kind: 'sauter_perso' }];
      // « fais ta toilette »
      if (rest.includes('toilette')) return [{ kind: 'laver', visage: true }];
      // « fais ton lit », « fais le lit »
      if (rest.includes('lit')) return [{ kind: 'faire_lit', ref: found.find((o) => o.sorte === 'lit')?.ref }];
      // « fais les courses »
      if (rest.includes('courses')) return [{ kind: 'courses' }];
      // « fais sauter la crêpe », « fais goûter »
      if (['sauter', 'gouter', 'fouetter', 'remuer'].includes(VERB_OF.get(rest[0]) ?? '')) return parseClause(VERB_OF.get(rest[0])!, rest.slice(1), original, world, rest[0]);
      // « fais une omelette », « fais des crêpes », « fais un œuf au plat » (pas « sers l'omelette »)
      if (!['sers', 'servir'].includes(word)) {
        if (rest.includes('omelette') || rest.includes('omelettes')) return [{ kind: 'omelette' }];
        if (rest.includes('crepe') || rest.includes('crepes')) return [{ kind: 'crepe' }];
        if ((rest.includes('oeuf') || rest.includes('oeufs')) && rest.includes('plat')) return [{ kind: 'oeuf_plat' }];
      }
      // « sers l'omelette », « sers la poêle » : à la spatule, de la poêle à l'assiette
      {
        const cooked = found.find((o) => o.sorte === 'nourriture' && /^dans (poele|casserole)/.test(o.ou)) ?? found.find((o) => o.nom === 'poêle');
        if (cooked) return [{ kind: 'servir_poele', sur: found.find((o) => o.nom in BOWLS)?.ref }];
      }
      // « fais cuire la pomme », « fais chauffer le sandwich », « fais bouillir de l'eau »
      if (VERB_OF.get(rest[0]) === 'cuire') return parseClause('cuire', rest.slice(1), original, world, rest[0]);
      // pâtes, riz, soupe, gâteau, céréales : pas encore des ordres simples (l'IA s'en charge)
      if (rest.some((x) => SLOW_DISHES.has(x))) return null;
      // « fais-toi un jus de pomme », « prépare un smoothie » : au mixeur (le jus d'orange est en brique)
      if ((rest.includes('jus') && rest.some((x) => FRUIT_WORDS.has(singular(x)) && !x.startsWith('orange'))) || rest.includes('smoothie')) return juice(world, found, true);
      // « fais la vaisselle » (à l'évier), « fais la vaisselle au lave-vaisselle »
      if (rest.includes('vaisselle')) return machineWash(original) ? machineDishes(world) : [{ kind: 'vaisselle', refs: [] }];
      // « fais-toi une salade », « prépare un sandwich », « fais un steak frites » : une recette
      if (!['sers', 'servir'].includes(word)) {
        // le nom le plus long dit l'emporte (« salade de fruits » plutôt que « salade »)
        const said = (r: (typeof RECIPES)[number]) => Math.max(0, ...r.words.filter((w) => w.split(' ').every((x) => rest.includes(x))).map((w) => w.split(' ').length));
        const recipe = [...RECIPES].sort((a, b) => said(b) - said(a))[0];
        if (recipe && said(recipe)) return [{ kind: 'preparer', plat: recipe.dish }];
      }
      // « fais une pizza », « fais des frites », « prépare les lasagnes » : un plat surgelé, au four
      if (!['sers', 'servir'].includes(word) && found.length && found.every((o) => FROZEN_FOOD.includes(o.nom) || o.nom === 'lasagne')) return parseClause('cuire', rest, original, world, 'cuis');
      // « sers-moi du soda », « sers un verre de vin » : la boisson du frigo versée dans un verre
      {
        const src = found.find((o) => DRINKS.has(o.nom) || o.nom === 'lait');
        const glass = found.find((o) => o.nom === 'verre' || o.nom === 'tasse') ?? world.objets.filter((o) => o.nom === 'verre').sort(byUse(world.enMain))[0];
        if (src && glass) return pourOrFill(glass, src, world);
      }
      // « fais-toi un jus de pomme », « prépare un smoothie » : au mixeur
      if (rest.includes('jus') || rest.includes('smoothie')) return juice(world, found, true);
      // « sers de l'eau dans le verre (avec la carafe) », « sers-moi un verre d'eau »
      {
        const { tool, rest: r } = withTool(rest, world.objets);
        const glass = findObjects(r, world.objets).found.filter((o) => o.sorte === 'récipient' && !JUGS.has(o.nom)).sort(byUse(world.enMain))[0];
        if (glass && (r.includes('eau') || tool)) return pourOrFill(glass, tool, world);
      }
      // « sers le sandwich (dans l'assiette) », « sers-toi une pomme »
      {
        const food = found.find((o) => o.sorte === 'nourriture');
        const plate = found.find((o) => o.nom in BOWLS);
        if (food || plate) return [{ kind: 'servir', ref: food?.ref, sur: plate?.ref }];
      }
      // « sers le thé (dans la tasse) » : la théière infusée se verse
      const pot = world.objets.find((o) => o.nom === 'théière' && o.ou.includes('contient du thé'));
      if (rest.includes('the') && pot && ['sers', 'servir'].includes(word)) return [{ kind: 'verser', ref: pot.ref, dans: found.find((o) => o.nom === 'tasse')?.ref ?? world.objets.filter((o) => o.nom === 'tasse').sort(byUse(world.enMain))[0]?.ref }];
      // « fais-toi un thé », « fais du thé dans la théière »
      if (rest.includes('the')) return [{ kind: 'the', dans: found.find((o) => o.nom === 'théière')?.ref }];
      return rest.includes('cafe') ? [{ kind: 'cafe' }] : null;
    case 'boire': {
      // « bois la bouteille », « bois de l'eau » (une bouteille pleine s'il y en a, sinon la tasse remplie à l'évier), « bois un café »
      // « bois au robinet »
      if (rest.includes('robinet')) return [{ kind: 'boire_robinet' }];
      // « bois un jus de pomme » : mixé d'abord s'il n'y en a pas de prêt (le jus d'orange est en brique)
      if ((rest.includes('jus') && !rest.includes('orange')) || rest.includes('smoothie')) {
        const prep = juice(world, found, false);
        return prep ? [...prep, { kind: 'boire', liquide: 'jus de fruits' }] : null;
      }
      const liquide = rest.includes('eau') ? 'eau' : rest.includes('cafe') ? 'café' : rest.includes('the') ? 'thé' : undefined;
      const drink = found.filter((o) => o.sorte === 'récipient');
      if (found.length && !drink.length) return null;
      const full = (o: WorldObject) => o.ou.includes('contient');
      // on ne boit pas à la carafe : on s'en sert un verre
      const glasses = drink.filter((o) => !JUGS.has(o.nom)).sort((a, b) => +!world.enMain.includes(a.ref) - +!world.enMain.includes(b.ref) || +!full(a) - +!full(b) || +!isLoose(a) - +!isLoose(b));
      if (drink.length && !glasses.length) return null;
      const named = glasses[0];
      const bottles = world.objets.filter((o) => o.sorte === 'récipient' && !['tasse', 'verre'].includes(o.nom) && !JUGS.has(o.nom) && full(o) && (liquide !== 'eau' || /contient (de l.eau|eau)/.test(o.ou)));
      const bottle = liquide === 'eau' && !named ? (bottles.find((o) => world.enMain.includes(o.ref)) ?? bottles[0]) : undefined;
      return [{ kind: 'boire', ref: (named ?? bottle)?.ref, liquide }];
    }
    case 'manger': {
      // « mange une pomme », « mange » (ce qu'on tient, sinon ce qu'il y a)
      const food = found.filter((o) => o.sorte === 'nourriture');
      // « mange à table », « mange dans l'assiette », « mange le sandwich à table »
      if (rest.some((x) => ['table', 'assiette', 'assiettes', 'fourchette', 'bol', 'bols', 'cuillere', 'cuiller'].includes(x))) return [{ kind: 'repas', ref: food[0]?.ref, dans: found.find((o) => o.nom in BOWLS)?.ref }];
      if (found.length && !food.length) return null;
      // « mange » sans rien en main, un plat servi dans l'assiette : on mange à table
      const served = world.objets.find((o) => o.sorte === 'nourriture' && /^posé sur (assiette|bol)/.test(o.ou));
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
      // « remplis le verre avec la carafe », « remplis le verre à la carafe » : verser
      {
        const { tool, rest: r } = withTool(rest, world.objets);
        const src = tool ?? (() => { const i = r.findIndex((x, k) => (x === 'a' || x === 'au') && k > 0); return i > 0 ? findObjects(r.slice(i + 1), world.objets).found.find((o) => o.sorte === 'récipient') : undefined; })();
        const glass = findObjects(r, world.objets).found.filter((o) => o.sorte === 'récipient' && o !== src).sort(byUse(world.enMain))[0];
        if (src && glass) return pourOrFill(glass, src, world);
      }
      // « remplis la tasse (d'eau / de café) », « remplis la bouteille, la casserole » ; d'eau si rien n'est dit
      if (found.some((o) => o.sorte !== 'récipient' && o.sorte !== 'évier' && o.sorte !== 'machine' && o.nom !== 'casserole')) return null;
      const vessel = found.filter((o) => o.sorte === 'récipient' || o.nom === 'casserole').sort(byUse(world.enMain))[0];
      return [rest.includes('cafe') ? { kind: 'cafe' } : rest.includes('the') ? { kind: 'the' } : { kind: 'eau', ref: vessel?.nom === 'tasse' ? undefined : vessel?.ref }];
    }
    case 'verser': {
      // « verse la bouteille dans la tasse », « verse l'eau dans la bouilloire », « verse » (ce qu'on tient)
      const t = withTool(rest, world.objets);
      if (t.tool) {
        const glass = findObjects(t.rest, world.objets).found.filter((o) => o.sorte === 'récipient' && o !== t.tool).sort(byUse(world.enMain))[0];
        if (glass) return pourOrFill(glass, t.tool, world);
      }
      const cut = rest.indexOf('dans');
      const from = findObjects(cut < 0 ? rest : rest.slice(0, cut), world.objets).found.find((o) => o.sorte === 'récipient' || o.sorte === 'ustensile');
      const into = cut < 0 ? undefined : findObjects(rest.slice(cut + 1), world.objets).found[0];
      if (cut >= 0 && !into) return null;
      if (into?.sorte === 'évier') return [{ kind: 'vider_recipient', ref: from?.ref }];
      // « verse de l'eau dans la bouilloire » : la remplir
      if (into?.nom === 'bouilloire' && (!from || from.ou.includes('eau'))) return [{ kind: 'remplir_bouilloire', ref: into.ref }];
      return [{ kind: 'verser', ref: from?.ref, dans: into?.ref }];
    }
    case 'charger':
      // « charge le lave-vaisselle »
      return machineWash(original) || rest.includes('vaisselle') ? [{ kind: 'charger_lv' }] : null;
    case 'tirer':
    case 'pousser': {
      // « tire la chasse (d'eau) »
      if (rest.includes('chasse')) return [{ kind: 'chasse' }];
      // « rentre dans la cuisine »
      if (roomIn(rest) && !found.length) return [{ kind: 'piece', piece: roomIn(rest)! }];
      // « tire la chaise », « pousse la chaise sous la table »
      const chair = found.find((o) => o.sorte === 'siège');
      return chair ? [{ kind: 'chaise', ref: chair.ref, sous: verb === 'pousser' }] : null;
    }
    case 'empiler':
      // « empile les assiettes »
      return !found.length || found.every((o) => o.nom === 'assiette') ? [{ kind: 'empiler' }] : null;
    case 'essuyer': {
      const { tool, rest: r } = withTool(rest, world.objets);
      // « sèche-toi », « essuie-toi avec la serviette » : après la douche
      if (rest.includes('serviette') || (word.startsWith('sech') && rest.some((x) => x === 'toi' || x === 'te') && !r.some((x) => x === 'mains' || x === 'main'))) return [{ kind: 'secher' }];
      // « essuie-toi les mains (avec le torchon) », « essuie-toi »
      if (r.some((x) => x === 'mains' || x === 'main') || (rest.some((x) => x === 'toi' || x === 'te') && !found.length)) return [{ kind: 'essuyer_mains' }];
      // « essuie la vaisselle (avec le torchon) », « sèche le bol », « essuie les verres »
      const wet = findObjects(r, world.objets).found.filter(isDish);
      if (r.includes('vaisselle') || wet.length) {
        // « nettoie l'assiette » (sale) : c'est la laver
        if (['nettoie', 'nettoyer'].includes(word) && wet.some((o) => o.ou.includes('sale'))) return parseClause('laver', rest, original, world, word);
        const damp = wet.filter((o) => o.ou.includes('mouill'));
        return [{ kind: 'essuyer_vaisselle', refs: r.includes('vaisselle') ? [] : (all ? damp : damp.slice(0, 1)).map((o) => o.ref) }];
      }
      // « essuie la flaque », « nettoie par terre », « éponge l'eau »
      if (r.some((x) => ['flaque', 'flaques', 'sol', 'terre', 'eau'].includes(x))) return [{ kind: r.some((x) => x.startsWith('serpill')) ? 'serpillere' : 'essuyer_sol' }];
      // « nettoie le plan de travail », « nettoie la gazinière au spray » : spray et éponge
      const grimy = findObjects(r, world.objets).found.filter((o) => !['table', 'éponge', 'torchon', 'spray nettoyant'].includes(o.nom));
      if (r.includes('spray') || (grimy.length && grimy.every((o) => !o.portable))) return [{ kind: 'nettoyer', ref: grimy[0]?.ref }];
      // « essuie la table (avec l'éponge / le torchon) », « nettoie la table »
      const f2 = [...findObjects(r, world.objets).found, ...(tool ? [tool] : [])];
      return f2.length && f2.every((o) => o.nom === 'table' || o.nom === 'éponge' || o.nom === 'torchon') ? [{ kind: 'essuyer', ref: f2.find((o) => o.nom === 'table')?.ref }] : null;
    }
    case 'balayer':
      // « balaie », « balaie la cuisine », « balaie les miettes »
      return [{ kind: 'balayer' }];
    case 'passer':
      // « passe le balai », « passe la serpillière »
      if (found.some((o) => o.nom === 'balai') || rest.includes('balai') || rest.includes('balayette')) return [{ kind: 'balayer' }];
      if (found.some((o) => o.nom === 'serpillière') || rest.some((x) => x.startsWith('serpill'))) return [{ kind: 'serpillere' }];
      return null;
    case 'enfiler':
      // « enfile les gants »
      return rest.some((x) => x === 'gants' || x === 'gant') || !rest.length ? [{ kind: 'gants', mettre: true }] : null;
    case 'debarrasser':
      // « débarrasse la table », « débarrasse »
      return [{ kind: 'debarrasser' }];
    case 'regarder': {
      // « regarde la télé » : l'allumer et s'installer sur le canapé
      const tv = found.find((o) => o.nom === 'télé');
      if (tv) {
        const sofa = world.objets.find((o) => o.nom === 'canapé') ?? world.objets.find((o) => o.nom === 'fauteuil');
        return [{ kind: 'allumer', ref: tv.ref }, ...(sofa ? [{ kind: 'asseoir', ref: sofa.ref } as Intent] : [])];
      }
      // « regarde la liste de courses »
      if (rest.includes('liste')) return [{ kind: 'liste_courses' }];
      // « regarde l'heure », « regarde l'horloge »
      if (rest.some((x) => ['heure', 'horloge', 'pendule', 'montre', 'reveil'].includes(x)) || found.some((o) => o.nom === 'horloge')) return [{ kind: 'heure' }];
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
      // « enlève les gants »
      if (rest.some((x) => x === 'gants' || x === 'gant')) return [{ kind: 'gants', mettre: false }];
      // « enlève le bouchon »
      return rest.includes('bouchon') ? [{ kind: 'bouchon', mettre: false }] : null;
    case 'laver': {
      // « lave la tasse au lave-vaisselle » : on la range dedans et on le lance
      if (machineWash(original) && found.every((o) => o.sorte === 'appareil' || isDish(o)) && appliance('lave-vaisselle')) {
        const cups = found.filter(isDish);
        if (!cups.length) return machineDishes(world);
        const lv = appliance('lave-vaisselle')!;
        return [...cups.slice(0, all ? cups.length : 1).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: lv.ref })), ...tablet(lv), { kind: 'allumer', ref: lv.ref }];
      }
      // « lave la vaisselle », « lave l'assiette », « lave les couverts », « rince la tasse » : à l'évier
      const sink = found.filter((o) => o.nom !== 'lave-vaisselle');
      const dishes = sink.filter(isDish);
      if (rest.includes('vaisselle') || rest.includes('couverts') || dishes.length) {
        if (sink.some((o) => o.sorte !== 'évier' && !dishes.includes(o))) return null;
        // « lave les couverts » : fourchettes et couteaux
        if (!dishes.length && rest.includes('couverts')) return [{ kind: 'vaisselle', refs: world.objets.filter((o) => COUVERTS.includes(o.nom)).map((o) => o.ref) }];
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
      // « lis la liste de courses »
      if (rest.includes('liste')) return [{ kind: 'liste_courses' }];
      // « ouvre le robinet »
      if (rest.includes('robinet') || (rest.includes('eau') && found.some((o) => o.sorte === 'évier'))) return [{ kind: 'robinet', ouvrir: true, ref: found.find((o) => o.nom === 'lavabo')?.ref }];
      // « ouvre le frigo », « ouvre le four », « ouvre le tiroir »
      const door = found.find((o) => OPENS.has(o.sorte ?? ''));
      if (door) return [{ kind: 'ouvrir', ref: door.ref }];
      // « lis le livre rouge », « lis un livre », « lis » (celui qu'on tient)
      // « lis le livre de recettes », « ouvre le livre de recettes »
      if (rest.some((x) => x.startsWith('recette'))) {
        const cookbook = found.find((o) => o.nom === 'livre de recettes');
        if (cookbook) return [{ kind: 'lire', ref: cookbook.ref }];
      }
      const books = found.filter((o) => o.nom === 'livre');
      if (found.length && !books.length) return null;
      // « ouvre la fenêtre », « ouvre la porte » : pas un livre
      if (!found.length && unknownWords(rest, world.objets).length) return null;
      const named = rest.some((x) => x === 'livre') && rest.some((x) => !STOP.has(x) && x !== 'livre');
      return [{ kind: 'lire', ref: named ? books.find(isLoose)?.ref ?? books[0]?.ref : undefined }];
    }
    case 'asseoir': {
      // « assieds-toi à table »
      if (rest.includes('table') || found.some((o) => o.nom in BOWLS)) return [{ kind: 'attabler' }];
      // « assieds-toi », « assieds-toi sur la chaise » (sinon le siège le plus proche)
      const seat = found.find((o) => o.sorte === 'siège');
      if (found.length && !seat) return null;
      return [{ kind: 'asseoir', ref: seat?.ref }];
    }
    case 'lever':
      // « relève le courrier » : le prendre
      if (rest.includes('courrier') || rest.includes('lettres')) {
        const letter = world.objets.find((o) => o.nom === 'lettre');
        return letter ? [{ kind: 'prendre', ref: letter.ref }] : null;
      }
      // « lève-toi du lit » : se réveiller ; « lève-toi du canapé » : se lever
      if (found.length && found.every((o) => o.sorte === 'lit')) return [{ kind: 'reveiller' }];
      // « lève-toi », « debout » ; « lève le bras » n'est pas compris
      if (found.some((o) => o.sorte !== 'siège') || unknownWords(rest, world.objets).length) return null;
      return [{ kind: 'lever' }];
    case 'baisser':
      // « baisse la lumière » : éteindre la lampe
      if (rest.some((x) => LIGHT_WORDS.has(x))) {
        const lamp = found.find((o) => o.sorte === 'lampe') ?? world.objets.find((o) => o.sorte === 'lampe');
        return lamp ? [{ kind: 'eteindre', ref: lamp.ref }] : null;
      }
      return null;
    case 'allonger': {
      // « allonge-toi (sur le lit) » : on se couche
      if (!found.length || found.some((o) => o.sorte === 'lit')) return [{ kind: 'dormir', ref: found.find((o) => o.sorte === 'lit')?.ref }];
      // « allonge-toi sur la chaise » : on s'y assoit
      const seat = found.find((o) => o.sorte === 'siège');
      return seat ? [{ kind: 'asseoir', ref: seat.ref }] : null;
    }
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
        // pas encore de tranches : le pain se coupe d'abord
        if (!item) return found.some((o) => o.nom === 'pain') || rest.includes('pain') ? [{ kind: 'griller' }] : found.length ? null : [{ kind: 'allumer', ref: toaster.ref }];
        return [{ kind: 'mettre', ref: item.ref, dans: toaster.ref }, { kind: 'allumer', ref: toaster.ref }];
      }
      // « fais bouillir de l'eau », « fais chauffer de l'eau » : la bouilloire
      const kettle = appliance('bouilloire');
      // « fais bouillir de l'eau dans la casserole » : remplie à l'évier, sur le feu, allumé
      const pot = found.find((o) => o.nom === 'casserole');
      const stove = world.objets.find((o) => o.sorte === 'gazinière');
      if (rest.includes('eau') && pot && stove) return [{ kind: 'eau', ref: pot.ref }, { kind: 'mettre', ref: pot.ref, dans: stove.ref }, { kind: 'allumer', ref: stove.ref }];
      if (kettle && rest.includes('eau') && !found.some((o) => o.sorte === 'ustensile')) return [...(/assez d.eau/.test(kettle.ou) ? [] : [{ kind: 'remplir_bouilloire', ref: kettle.ref } as Intent]), { kind: 'allumer', ref: kettle.ref }];
      // « réchauffe la soupe », « fais chauffer les céréales » : rien de connu à réchauffer
      if (!found.length && unknownWords(rest, world.objets).length) return null;
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
      // « allume la lumière » : une lampe, celle nommée, celle de la pièce dite, sinon la première de la maison
      if (rest.some((x) => LIGHT_WORDS.has(x))) {
        const room = roomIn(rest);
        const lamp = found.find((o) => o.sorte === 'lampe') ?? (room && world.objets.find((o) => o.sorte === 'lampe' && LAMP_OF_ROOM[room] === o.nom)) ?? world.objets.find((o) => o.sorte === 'lampe');
        return lamp ? [{ kind: verb, ref: lamp.ref }] : null;
      }
      // « lance la tasse », « lance le livre » : le jeter devant soi (pas un appareil qu'on démarre)
      if (['lance', 'lancer'].includes(word) && found.length && found.every((o) => o.portable && !o.sorte?.match(/appareil|machine/))) {
        const thing = found.find((o) => world.enMain.includes(o.ref)) ?? found[0];
        return [{ kind: 'lancer', ref: thing.ref }];
      }
      // « allume la télé », « éteins la télé »
      const tv = found.find((o) => o.nom === 'télé');
      if (tv) return [{ kind: verb, ref: tv.ref }];
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
      // « lance la balle » : un objet inconnu, pas la gazinière
      if (!target && unknownWords(rest, world.objets).length) return null;
      return [{ kind: verb, ref: target?.ref }];
    }
    case 'arreter': {
      // « ferme le robinet », « arrête l'eau »
      if (rest.includes('robinet') || (rest.includes('eau') && !found.some((o) => o.sorte !== 'évier'))) return [{ kind: 'robinet', ouvrir: false, ref: found.find((o) => o.nom === 'lavabo')?.ref }];
      // « ferme la télé », « arrête la télé »
      const tv = found.find((o) => o.nom === 'télé');
      if (tv) return [{ kind: 'eteindre', ref: tv.ref }];
      // « arrête le lave-vaisselle » ; « ferme le four » : la porte
      const closes = ['ferme', 'fermer', 'referme', 'refermer'].includes(word);
      // « ferme la porte à clé », « ferme à clé »
      if (closes && (rest.includes('cle') || rest.includes('verrou'))) return [{ kind: 'verrou', fermer: true }];
      const app = found.find((o) => o.sorte === 'appareil' || o.sorte === 'machine' || o.sorte === 'gazinière' || o.sorte === 'lampe');
      if (app && !closes) return [{ kind: 'eteindre', ref: app.ref }];
      // « ferme le frigo », « ferme le tiroir »
      if (OPENS.has(found[0]?.sorte ?? '')) return [{ kind: 'fermer', ref: found[0].ref }];
      // « arrête de lire », « ferme le livre », « stop »
      return !rest.length || rest.some((x) => ['lire', 'lecture', 'livre', 'lis'].includes(x)) ? [{ kind: 'arreter_lire' }] : null;
    }
    // « dors », « couche-toi », « va te coucher » (aller) ; « réveille-toi »
    case 'dormir':
      return [{ kind: 'dormir', ref: found.find((o) => o.sorte === 'lit')?.ref }];
    case 'reveiller':
      return [{ kind: 'reveiller' }];
    // « verrouille la porte », « enferme-toi » ; « déverrouille la porte »
    case 'verrouiller':
      return [{ kind: 'verrou', fermer: true }];
    case 'deverrouiller':
      return [{ kind: 'verrou', fermer: false }];
    case 'jeter': {
      // « jette la bouteille », « jette ça » (ce qu'on tient)
      const thing = found.filter((o) => o.portable);
      if (found.length && !thing.length) return null;
      // « jette la balle » : un objet inconnu, pas ce qu'on tient
      if (!thing.length && unknownWords(rest, world.objets).length) return null;
      return [{ kind: 'jeter', ref: (thing.find((o) => world.enMain.includes(o.ref)) ?? thing[0])?.ref }];
    }
    case 'vider': {
      // « vide le sac (de courses) »
      if (found.some((o) => o.nom === 'sac de courses') || rest.includes('courses')) return [{ kind: 'ranger_courses' }];
      // « vide le lave-vaisselle » : la vaisselle propre rangée à sa place
      if (machineWash(original) && appliance('lave-vaisselle')) return [{ kind: 'vider_lv' }];
      // « vide l'égouttoir » : la vaisselle sèche à sa place
      const rack = found.find((o) => o.sorte === 'égouttoir');
      if (rack) {
        const dry = world.objets.filter((o) => o.ou.startsWith(`rangé dans ${rack.ref}`) && !o.ou.includes('mouill'));
        return dry.length ? dry.map((o): Intent => ({ kind: 'ranger_place', ref: o.ref })) : null;
      }
      // « vide la tasse », « vide la casserole » (dans l'évier)
      const vessel = found.find((o) => o.sorte === 'récipient' || o.sorte === 'ustensile');
      if (vessel) return [{ kind: 'vider_recipient', ref: vessel.ref }];
      // « vide la poubelle »
      const bin = found.find((o) => o.sorte === 'poubelle') ?? (!found.length ? world.objets.find((o) => o.sorte === 'poubelle') : undefined);
      return bin ? [{ kind: 'vider', ref: bin.ref }] : null;
    }
    case 'casser': {
      // « casse un œuf (dans le saladier / la poêle) »
      if (!rest.includes('oeuf') && !rest.includes('oeufs')) return null;
      const into = found.find((o) => o.nom === 'saladier' || o.nom === 'poêle');
      return [{ kind: 'casser_oeuf', dans: into?.ref }];
    }
    case 'fouetter':
      // « bats les œufs », « mélange la pâte », « fouette »
      return [{ kind: 'fouetter' }];
    case 'remuer':
      return [{ kind: 'remuer', ref: found.find((o) => o.sorte === 'ustensile')?.ref }];
    case 'sauter':
      // « saute », « saute en l'air », « saute sur place » : un saut
      if (word.startsWith('saut') || word === 'bondis') {
        const pan = world.objets.find((o) => o.nom === 'poêle' && o.ou.includes('sur le feu'));
        if (!found.length && (!pan || rest.some((x) => ['air', 'place', 'haut', 'joie'].includes(x)))) return unknownWords(rest, world.objets).filter((x) => !['air', 'place', 'joie'].includes(x)).length ? null : [{ kind: 'sauter_perso' }];
      }
      // « retourne à la cuisine »
      if (roomIn(rest) && !found.length) return [{ kind: 'piece', piece: roomIn(rest)! }];
      // « retourne à la table » : y aller
      if (found.length && !found.some((o) => o.nom === 'poêle' || o.sorte === 'nourriture')) return [{ kind: 'aller', ref: found[0].ref }];
      // « fais sauter la crêpe », « retourne l'omelette »
      return [{ kind: 'sauter', ref: found.find((o) => o.nom === 'poêle')?.ref }];
    case 'assaisonner': {
      // « sale l'omelette », « mets du poivre », « assaisonne avec des herbes », « assaisonne les frites au ketchup »
      const spice = SPICE_WORDS[word] ?? rest.map((x) => SPICE_WORDS[x] ?? CONDIMENT_WORDS[x]).find(Boolean) ?? 'sel';
      const target = found.find((o) => !TOOLS.has(o.nom) && o.nom !== 'étagère à épices');
      return [{ kind: 'assaisonner', epice: spice, ref: target?.ref }];
    }
    case 'tartiner': {
      // « tartine le pain de confiture », « beurre les tartines », « tartine la crêpe au nutella »
      const pot = rest.map((x) => SPREAD_WORDS[x]).find(Boolean) ?? (word.startsWith('beurr') ? 'beurre' : undefined);
      const target = found.find((o) => ['tranches de pain', 'pain grillé', 'crêpe'].includes(o.nom));
      return [{ kind: 'tartiner', pot, ref: target?.ref }];
    }
    case 'raper': {
      // « râpe du fromage (sur l'omelette) »
      const target = found.find((o) => !TOOLS.has(o.nom) && o.nom !== 'fromage');
      return [{ kind: 'raper', ref: target?.ref }];
    }
    case 'gouter': {
      const target = found.find((o) => !TOOLS.has(o.nom));
      return [{ kind: 'gouter', ref: target?.ref }];
    }
    case 'ajouter':
      // « ajoute du sel », « rajoute du ketchup » : assaisonner ; le reste (« ajoute du lait ») part à l'IA
      return rest.some((x) => SPICE_WORDS[x] || CONDIMENT_WORDS[x]) ? parseClause('assaisonner', rest, original, world) : null;
    case 'doucher':
      // « douche-toi », « va te doucher »
      return found.some((o) => o.portable) ? null : [{ kind: 'douche' }];
    case 'monter':
      // « monte dans la chambre »
      if (roomIn(rest) && !found.length) return [{ kind: 'piece', piece: roomIn(rest)! }];
      // « monte sur le vélo », « enfourche ton vélo » ; « monte le son » n'est pas compris
      return found.some((o) => o.nom === 'vélo') || (word.startsWith('enfourch') && !found.length) ? [{ kind: 'velo', monter: true }] : null;
    case 'descendre':
      // « descends au garage »
      if (roomIn(rest) && !found.length) return [{ kind: 'piece', piece: roomIn(rest)! }];
      // « descends du vélo », « descends » (à vélo) ; « descends la poubelle » : la sortir
      if (rest.some((x) => x.startsWith('poubelle')) || found.some((o) => o.nom === 'sac poubelle')) return [{ kind: 'sortir_poubelle' }];
      return found.some((o) => o.nom === 'vélo') || (!found.length && !unknownWords(rest, world.objets).length) ? [{ kind: 'velo', monter: false }] : null;
    case 'dire': {
      // « dis-moi l'heure », « dis-moi combien il me reste »
      if (rest[0] === 'moi' && rest.includes('heure')) return [{ kind: 'heure' }];
      if (rest[0] === 'moi' && rest.some((x) => ['argent', 'reste', 'sous', 'fric'].includes(x))) return [{ kind: 'argent' }];
      // le texte d'origine après le verbe (« dis bonjour à tous » → « bonjour à tous »)
      const m = original.match(/^.*?\b(?:dis|dit|dire|crie|crier|chuchote|chuchoter|murmure|murmurer|r[ée]ponds|r[ée]pondre)\b\s*(?:que\s+|qu['’]\s*|:\s*)?(.+)$/i);
      const said = m?.[1].trim().replace(/^-?\s*(moi|lui|leur|nous)\b\s*/i, '').replace(/^["«“]\s*|\s*["»”]$/g, '');
      if (!said) return null;
      return [{ kind: 'dire', texte: said.charAt(0).toUpperCase() + said.slice(1) }];
    }
  }
  return null;
}

/** Ce qu'on trouve au magasin : chaque fiche et les façons de la nommer (« pommes de terre », « patates »). */
let shop: Array<{ id: string; names: string[] }> | null = null;
function shopNames(): Array<{ id: string; names: string[] }> {
  shop ??= [...groceryAisle(), ...HOUSE_ALWAYS.flatMap((id) => ITEM_BY_ID.get(id) ?? [])].map((d) => {
    const n = normalize(d.name);
    const [first, ...others] = n.split(' ');
    const plural = [first.endsWith('s') || first.endsWith('x') ? first : `${first}s`, ...others].join(' ');
    return { id: d.id, names: [...new Set([n, plural, ...(ALIASES[n] ?? []).filter((a) => a.length > 3)])] };
  });
  return shop;
}

/** « achète 2 tomates et du lait » : les lignes de commande (fiche, nombre) ; null si un morceau n'est pas au magasin. */
function shoppingLines(rest: string[]): Array<{ id: string; n: number }> | null {
  const lines: Array<{ id: string; n: number }> = [];
  for (const part of ` ${rest.join(' ')} `.split(/ et | puis /)) {
    const text = ` ${part.trim()} `;
    if (!text.trim()) continue;
    // le nom le plus long dit l'emporte (« pommes de terre » plutôt que « pommes »)
    let best: { id: string; len: number } | null = null;
    for (const { id, names } of shopNames()) {
      for (const n of names) if (text.includes(` ${n} `) && n.length > (best?.len ?? 0)) best = { id, len: n.length };
    }
    if (!best) return null;
    const n = count(part.split(' ')) ?? 1;
    const same = lines.find((l) => l.id === best!.id);
    if (same) same.n += n;
    else lines.push({ id: best.id, n });
  }
  return lines.length ? lines : null;
}

/**
 * Le magasin et le marché.
 * undefined : l'ordre n'en parle pas (la suite de parseClause s'en occupe).
 */
function newsClause(verb: string, rest: string[], found: WorldObject[], all: boolean): Intent[] | null | undefined {
  const text = ` ${rest.join(' ')} `;
  const has = (...ws: string[]) => ws.some((x) => text.includes(` ${x} `));
  // la lessive n'est plus dans le jeu : « lance une lessive » part à l'IA (sans allumer la gazinière)
  if (has('lessive', 'lessives', 'lave linge', 'seche linge', 'machine a laver') || (has('linge') && !has('vaisselle', 'mains', 'main', 'torchon', 'table', 'avec', 'toi', 'te'))) return null;
  // le magasin : « va au magasin », « ouvre l'épicerie », « va au marché »
  if (['aller', 'lire', 'regarder'].includes(verb) && has('magasin', 'epicerie', 'supermarche', 'boutique', 'marche')) return [{ kind: 'magasin' }];
  // « regarde ton porte-monnaie »
  if (verb === 'regarder' && has('porte monnaie', 'portefeuille', 'argent')) return [{ kind: 'argent' }];
  // « achète 2 tomates et du lait », « achète une canne à pêche » ; « commande les courses » : ce qui manque
  if (verb === 'commander') {
    if (!rest.length || has('courses', 'manque', 'liste')) return [{ kind: 'courses' }];
    const lignes = shoppingLines(rest.filter((x) => !['moi', 'nous', 'au', 'magasin'].includes(x)));
    return lignes ? [{ kind: 'acheter', lignes }] : null;
  }
  // « vends les tomates », « vends tout (au marché) »
  if (verb === 'vendre') {
    const noms = new Set<string>();
    for (const o of found) if (o.portable && o.sorte !== 'récipient') noms.add(o.nom);
    if (!noms.size) return has('tout') || !rest.filter((x) => !STOP.has(x) && !['marche', 'magasin'].includes(x)).length ? [{ kind: 'vendre' }] : null;
    return [{ kind: 'vendre', noms: [...noms], tous: all || has('tout', 'tous', 'toutes') }];
  }
  return undefined;
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

/** « … avec la carafe » : l'objet nommé après « avec », et l'ordre sans ce morceau. */
function withTool(rest: string[], objets: WorldObject[]): { tool?: WorldObject; rest: string[] } {
  const i = rest.indexOf('avec');
  if (i < 0) return { rest };
  return { tool: findObjects(rest.slice(i + 1), objets).found[0], rest: rest.slice(0, i) };
}

/**
 * De l'eau dans le verre `glass` : versée de `src` (carafe, bouteille) s'il est nommé, sinon d'une
 * carafe ou bouteille pleine (tenue d'abord), sinon remplie à l'évier.
 */
function pourOrFill(glass: WorldObject, src: WorldObject | undefined, world: { enMain: string[]; objets: WorldObject[] }): Intent[] {
  const full = (o: WorldObject) => o.ou.includes('contient de l’eau');
  const jug = src ?? world.objets.filter((o) => o.sorte === 'récipient' && o.ref !== glass.ref && !['tasse', 'verre'].includes(o.nom) && full(o)).sort((a, b) => +!world.enMain.includes(a.ref) - +!world.enMain.includes(b.ref) || a.distance - b.distance)[0];
  return jug ? [{ kind: 'verser', ref: jug.ref, dans: glass.ref }] : [{ kind: 'eau', ref: glass.ref }];
}

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
