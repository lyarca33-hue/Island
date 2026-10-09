/**
 * Ordres simples en français, compris sans IA : « prends la tasse », « range tous les livres »,
 * « va à la table puis pose la lettre », « fais-toi un café », « lis le livre rouge », « dis bonjour »,
 * « assieds-toi sur la chaise », « lève-toi », « fais cuire le steak », « éteins le feu »,
 * « sers le sandwich dans l'assiette », « mange à table », « fais la vaisselle », « cuis la pomme
 * de terre au four », « jette la bouteille », « lance le lave-vaisselle », et dans les autres pièces
 * « va au salon », « regarde la télé », « mets la météo », « éteins la lumière », « prends une
 * douche », « baisse la lunette », « range le pull », « va te coucher », et dehors « lance une
 * lessive », « étends le linge », « va pêcher », « allume le feu de camp », « arrose le potager »,
 * « achète 2 tomates », « vends les poissons ». Rend null dès
 * qu'un morceau de l'ordre n'est pas compris : l'ordre part alors au modèle de chat.
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
  prendre: ['prends', 'prend', 'prendre', 'attrape', 'attraper', 'ramasse', 'ramasser', 'saisis', 'saisir', 'recupere', 'recuperer', 'sors', 'sort', 'sortir'],
  poser: ['pose', 'poser', 'repose', 'reposer', 'lache', 'lacher', 'depose', 'deposer', 'mets', 'met', 'mettre', 'remets', 'remettre'],
  ranger: ['range', 'ranger', 'rangez'],
  aller: ['va', 'vas', 'aller', 'marche', 'marcher', 'cours', 'courir', 'rejoins', 'rejoindre', 'approche', 'approcher', 'entre', 'entrer'],
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
  mixer: ['mixe', 'mixer', 'mixes', 'mouline'],
  cuire: ['cuis', 'cuit', 'cuire', 'cuisine', 'cuisiner', 'grille', 'griller', 'rechauffe', 'rechauffer', 'chauffe', 'chauffer'],
  commander: ['commande', 'commander', 'achete', 'acheter', 'recommande', 'recommander'],
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
  essuyer: ['essuie', 'essuyer', 'nettoie', 'nettoyer', 'eponge', 'eponger', 'seche', 'secher', 'seches'],
  empiler: ['empile', 'empiler'],
  // l'entretien
  balayer: ['balaie', 'balaye', 'balayer', 'balaies'],
  passer: ['passe', 'passer'],
  enfiler: ['enfile', 'enfiler'],
  // gestes de cuisine
  casser: ['casse', 'casser', 'casses'],
  fouetter: ['fouette', 'fouetter', 'bats', 'bat', 'battre', 'melange', 'melanger', 'melanges'],
  remuer: ['remue', 'remuer', 'remues', 'touille', 'touiller', 'tourne', 'tourner'],
  sauter: ['saute', 'sauter', 'retourne', 'retourner', 'flambe', 'flamber'],
  assaisonner: ['assaisonne', 'assaisonner', 'sale', 'saler', 'poivre', 'poivrer', 'epice', 'epicer'],
  tartiner: ['tartine', 'tartiner', 'beurre', 'beurrer'],
  raper: ['rape', 'raper', 'rapes'],
  gouter: ['goute', 'gouter', 'goutes'],
  baisser: ['baisse', 'baisser', 'rabats', 'rabat', 'rabattre'],
  allonger: ['allonge', 'allonger', 'allonges', 'etends', 'etendre'],
  // le marché
  vendre: ['vends', 'vend', 'vendre', 'revends', 'revendre'],
};
/** Les pièces de la maison (nom de leur RoomSpec), par mots dits. */
const ROOM_WORDS: Array<[string[], string]> = [
  [['cuisine'], 'cuisine'],
];
/** La pièce nommée dans l'ordre, s'il y en a une. */
function roomIn(rest: string[]): string | undefined {
  const text = ` ${rest.join(' ')} `;
  return ROOM_WORDS.find(([ws]) => ws.some((w) => text.includes(` ${w} `)))?.[1];
}
/** La lumière de la pièce (à l'interrupteur), pas une lampe qu'on allume d'un clic. */
const LIGHT_WORDS = new Set(['lumiere', 'lumieres', 'plafonnier', 'suspension', 'lampadaire', 'lustre']);
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
const STORED_IN: Record<string, string> = { pull: 'armoire', tasse: 'placard', assiette: 'placard', verre: 'placard', bol: 'placard', carafe: 'placard', lettre: 'tiroir', fourchette: 'tiroir', 'couteau de table': 'tiroir', cuillère: 'tiroir', torchon: 'crochets', maniques: 'crochets', couteau: 'barre à couteaux',
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
  'je veux que tu', 'j aimerais que tu', 'il faut', 'merci de', 'stp', 'svp', 's il te plait', 's il vous plait',
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
  tele: ['tele', 'television', 'tv', 'teloche', 'ecran', 'poste'],
  table: ['table'],
  chaise: ['chaise', 'chaises', 'siege'],
  'machine a cafe': ['machine', 'cafetiere'],
  evier: ['evier', 'robinet'],
  lavabo: ['lavabo', 'lavabos', 'miroir', 'glace', 'vasque'],
  douche: ['douche', 'douches'],
  toilettes: ['toilettes', 'toilette', 'wc', 'cuvette', 'chiottes'],
  serviette: ['serviette', 'serviettes'],
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
  'salade verte': ['salade', 'salades'],
  'salade de fruits': ['salade', 'dessert'],
  'sandwich au jambon': ['sandwich', 'sandwichs'],
  'hot dog': ['hotdog', 'hot'],
  'poulet frites': ['poulet', 'frites'],
  'poelee de legumes': ['poelee', 'legumes'],
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
  const news = newsClause(verb, rest, found, all);
  if (news !== undefined) return news;
  switch (verb) {
    case 'prendre': {
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
      // « mets une pastille (dans le lave-vaisselle) »
      if (rest.some((x) => x.startsWith('pastille'))) return [{ kind: 'pastille' }];
      // « mets un sachet de thé (dans la tasse / la théière) »
      if (rest.some((x) => x === 'sachet' || x === 'sachets')) return [{ kind: 'sachet', ref: found.find((o) => o.nom === 'tasse' || o.nom === 'théière')?.ref }];
      // « mets les gants (de ménage) »
      if (rest.some((x) => x === 'gants' || x === 'gant')) return [{ kind: 'gants', mettre: true }];
      // « mets un sac (neuf) dans la poubelle »
      if (rest.includes('sac') && !rest.includes('courses') && found.some((o) => o.sorte === 'poubelle')) return [{ kind: 'sac_neuf', ref: found.find((o) => o.sorte === 'poubelle')?.ref }];
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
      // « mets la pomme dans le frigo », « mets la poêle sur le feu », « mets le steak dans la poêle »,
      // « mets la tasse au lave-vaisselle », « mets la bouteille à la poubelle »
      if (target && (target.sorte === 'ustensile' || target.sorte === 'gazinière' || (OPENS.has(target.sorte ?? '') && target.sorte !== 'poubelle'))) return [{ kind: 'mettre', ref: item?.ref, dans: target.ref }];
      if (target?.sorte === 'poubelle') return [{ kind: 'jeter', ref: item?.ref }];
      // « mets le sandwich dans l'assiette »
      if (target && target.nom in BOWLS && (item ?? held[0])?.sorte === 'nourriture') return [{ kind: 'servir', ref: (item ?? held[0]).ref, sur: target.ref }];
      return [{ kind: 'poser', ref: item?.ref, sur: target?.ref }];
    }
    case 'ranger': {
      // « range les courses » : le sac, vidé à sa place
      if (rest.includes('courses') || found.some((o) => o.nom === 'sac de courses')) return [{ kind: 'ranger_courses' }];
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
        const where = found.find((o) => (OPENS.has(o.sorte ?? '') && o.sorte !== 'poubelle') || o.sorte === 'égouttoir') ?? world.objets.find((o) => o.nom === STORED_IN[other.nom]);
        if (!where || !things.every((o) => o.nom === other.nom)) return null;
        // « range le couteau » (sur la barre), « range le torchon » (aux crochets) : à sa place au mur
        if (where.sorte === 'rangement') return [{ kind: 'ranger_place', ref: (things.find(isLoose) ?? other).ref }];
        // « range les verres » : chacun de ceux qui traînent
        const loose = things.filter(isLoose);
        return (all && loose.length ? loose : [things.find(isLoose) ?? other]).map((o): Intent => ({ kind: 'mettre', ref: o.ref, dans: where.ref }));
      }
      // « range » tout court, « range les livres », « range le livre rouge »
      if (all || !things.length) return [{ kind: 'ranger', refs: [] }];
      return [{ kind: 'ranger', refs: [(things.find(isLoose) ?? things[0]).ref] }];
    }
    case 'aller': {
      // « va dans la cuisine »
      const room = roomIn(rest);
      if (room && !found.length) return [{ kind: 'piece', piece: room }];
      const target = found[0];
      return target ? [{ kind: 'aller', ref: target.ref }] : null;
    }
    case 'cafe':
      // « fais ta toilette »
      if (rest.includes('toilette')) return [{ kind: 'laver', visage: true }];
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
      // « fais cuire la pomme », « fais chauffer le sandwich »
      if (VERB_OF.get(rest[0]) === 'cuire') return parseClause('cuire', rest.slice(1), original, world, rest[0]);
      // « fais la vaisselle » (à l'évier), « fais la vaisselle au lave-vaisselle »
      if (rest.includes('vaisselle')) return machineWash(original) ? machineDishes(world) : [{ kind: 'vaisselle', refs: [] }];
      // « fais-toi une salade », « prépare un sandwich », « fais un steak frites » : une recette
      if (!['sers', 'servir'].includes(word)) {
        // le nom le plus long dit l'emporte (« salade de fruits » plutôt que « salade »)
        const said = (r: (typeof RECIPES)[number]) => Math.max(0, ...r.words.filter((w) => w.split(' ').every((x) => rest.includes(x))).map((w) => w.split(' ').length));
        const recipe = [...RECIPES].sort((a, b) => said(b) - said(a))[0];
        if (recipe && said(recipe)) return [{ kind: 'preparer', plat: recipe.dish }];
      }
      // « sers-moi du soda », « sers un verre de vin » : la boisson du frigo versée dans un verre
      {
        const src = found.find((o) => DRINKS.has(o.nom));
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
      const bottles = world.objets.filter((o) => o.sorte === 'récipient' && !['tasse', 'verre'].includes(o.nom) && !JUGS.has(o.nom) && full(o));
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
      return [{ kind: 'verser', ref: from?.ref, dans: into?.ref }];
    }
    case 'charger':
      // « charge le lave-vaisselle »
      return machineWash(original) || rest.includes('vaisselle') ? [{ kind: 'charger_lv' }] : null;
    case 'tirer':
    case 'pousser': {
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
      if (found.some((o) => o.nom === 'balai')) return [{ kind: 'balayer' }];
      if (found.some((o) => o.nom === 'serpillière') || rest.some((x) => x.startsWith('serpill'))) return [{ kind: 'serpillere' }];
      return null;
    case 'enfiler':
      // « enfile les gants »
      return rest.some((x) => x === 'gants' || x === 'gant') || !rest.length ? [{ kind: 'gants', mettre: true }] : null;
    case 'debarrasser':
      // « débarrasse la table », « débarrasse »
      return [{ kind: 'debarrasser' }];
    case 'regarder': {
      // « regarde la liste de courses »
      if (rest.includes('liste')) return [{ kind: 'liste_courses' }];
      // « regarde l'heure », « regarde l'horloge »
      if (rest.includes('heure') || found.some((o) => o.nom === 'horloge')) return [{ kind: 'heure' }];
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
      return [{ kind: 'lever' }];
    case 'baisser':
      // « baisse la lumière » : l'éteindre
      if (rest.some((x) => LIGHT_WORDS.has(x))) return [{ kind: 'lumiere', on: false, piece: roomIn(rest) }];
      return null;
    case 'allonger': {
      // pas de lit dans la cuisine ; « allonge-toi sur la chaise » : on s'y assoit
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
      // « allume la lumière (du salon) », « éteins le lampadaire », « éteins dans la cuisine »
      if (rest.some((x) => LIGHT_WORDS.has(x)) || (roomIn(rest) && !found.length)) {
        const piece = roomIn(rest) ?? (rest.includes('lampadaire') ? 'salon' : undefined);
        return [{ kind: 'lumiere', on: verb === 'allumer', piece }];
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
