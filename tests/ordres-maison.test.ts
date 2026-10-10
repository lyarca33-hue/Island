/**
 * Les ordres tapés, essayés sur la vraie maison : les objets que game.describe() rend au début
 * d'une partie (cuisine, entrée, garage, salon, salle de bain, chambre), gardés dans
 * fixtures/maison.json. Pour le refaire après l'ajout d'objets : node tools/dump_maison.mjs.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import type { WorldObject } from '../src/game/Game';
import { parseOrder } from '../src/orders/parser';
import type { Intent } from '../src/orders/tasks';

const objets = JSON.parse(fs.readFileSync(new URL('./fixtures/maison.json', import.meta.url), 'utf8')) as WorldObject[];
const parse = (t: string, enMain: string[] = []) => parseOrder(t, { enMain, objets });

describe('ordres tapés dans toute la maison', () => {
  const cases: Array<[string, Intent[]]> = [
    ['va au salon', [{ kind: 'piece', piece: 'salon' }]],
    ['va dans la chambre', [{ kind: 'piece', piece: 'chambre' }]],
    ['va à la salle de bain', [{ kind: 'piece', piece: 'salle de bain' }]],
    ['va au garage', [{ kind: 'piece', piece: 'garage' }]],
    ["va dans l'entrée", [{ kind: 'piece', piece: 'entrée' }]],
    ['cours au salon', [{ kind: 'piece', piece: 'salon' }]],
    ['monte dans la chambre', [{ kind: 'piece', piece: 'chambre' }]],
    ['descends au garage', [{ kind: 'piece', piece: 'garage' }]],
    ['reviens dans la cuisine', [{ kind: 'piece', piece: 'cuisine' }]],
    ['va au salon puis assieds-toi sur le canapé', [{ kind: 'piece', piece: 'salon' },{ kind: 'asseoir', ref: 'canape' }]],
    ['va voir la boîte aux lettres', [{ kind: 'aller', ref: 'boite-lettres' }]],
    ['range les chaussures', [{ kind: 'ranger_place', ref: 'chaussure-2' },{ kind: 'ranger_place', ref: 'chaussure-1' }]],
    ['range la poêle', [{ kind: 'ranger_place', ref: 'poele' }]],
    ['range la télécommande', [{ kind: 'ranger_place', ref: 'telecommande' }]],
    ['range la brosse à dents', [{ kind: 'ranger_place', ref: 'brosse-dents' }]],
    ['range la bouteille', [{ kind: 'mettre', ref: 'bouteille-eau', dans: 'frigo' }]],
    ['range le steak', [{ kind: 'mettre', ref: 'steak', dans: 'frigo' }]],
    ['range la pizza', [{ kind: 'mettre', ref: 'pizza', dans: 'congelateur' }]],
    ['range les outils', [{ kind: 'ranger_place', ref: 'caisse-outils' }]],
    ['range les chaussures dans le porte-parapluies', [{ kind: 'mettre', ref: 'chaussure-2', dans: 'porte-parapluies' },{ kind: 'mettre', ref: 'chaussure-1', dans: 'porte-parapluies' }]],
    ["range la bêche sur l'étagère", [{ kind: 'mettre', ref: 'beche', dans: 'etagere-garage' }]],
    ['range le lave-vaisselle', [{ kind: 'vider_lv' }]],
    ['remets la tasse à sa place', [{ kind: 'ranger_place', ref: 'tasse-3' }]],
    ['prends 2 tasses', [{ kind: 'prendre', ref: 'tasse-3' },{ kind: 'prendre', ref: 'tasse-4' }]],
    ['prends le gel douche', [{ kind: 'prendre', ref: 'gel-douche' }]],
    ['prends la caisse à outils', [{ kind: 'prendre', ref: 'caisse-outils' }]],
    ['pose le livre sur la table de nuit', [{ kind: 'poser', ref: 'livre',sur: 'table-de-nuit-2' }]],
    ['mets le parapluie dans le porte-parapluies', [{ kind: 'mettre', ref: 'parapluie', dans: 'porte-parapluies' }]],
    ['mets les pâtes dans le placard', [{ kind: 'mettre', ref: 'paquet-pates', dans: 'placard' }]],
    ["fais bouillir de l'eau", [{ kind: 'allumer', ref: 'bouilloire' }]],
    ["mets l'eau à bouillir", [{ kind: 'allumer', ref: 'bouilloire' }]],
    ["fais bouillir l'eau dans la casserole", [{ kind: 'eau', ref: 'casserole' },{ kind: 'mettre', ref: 'casserole', dans: 'gaziniere' },{ kind: 'allumer', ref: 'gaziniere' }]],
    ["verse l'eau dans la bouilloire", [{ kind: 'remplir_bouilloire', ref: 'bouilloire' }]],
    ['remplis la bouilloire et allume-la', [{ kind: 'remplir_bouilloire', ref: 'bouilloire' },{ kind: 'allumer', ref: 'bouilloire' }]],
    ['fais une pizza', [{ kind: 'cuire', ref: 'pizza' }]],
    ['fais des frites', [{ kind: 'cuire', ref: 'frites' }]],
    ['réchauffe les lasagnes', [{ kind: 'mettre', ref: 'lasagne', dans: 'micro-ondes' },{ kind: 'allumer', ref: 'micro-ondes' }]],
    ['fais un jus de pomme', [{ kind: 'mettre', ref: 'pomme-2', dans: 'mixeur' },{ kind: 'allumer', ref: 'mixeur' },{ kind: 'jus' }]],
    ["fais un jus d'orange", [{ kind: 'verser', ref: 'jus-orange', dans: 'verre-1' }]],
    ['grille le pain', [{ kind: 'griller' }]],
    ['fais des toasts', [{ kind: 'griller' }]],
    ['sers-toi un verre de lait', [{ kind: 'verser', ref: 'lait', dans: 'verre-1' }]],
    ["bois de l'eau", [{ kind: 'boire', ref: 'bouteille-eau', liquide: 'eau' }]],
    ["j'ai faim", [{ kind: 'manger' }]],
    ["j'ai soif", [{ kind: 'boire', liquide: 'eau' }]],
    ['je suis fatigué', [{ kind: 'dormir' }]],
    ['je veux un café', [{ kind: 'cafe' }]],
    ['je voudrais une pomme', [{ kind: 'prendre', ref: 'pomme-2' }]],
    ['va dans le séjour', [{ kind: 'piece', piece: 'salon' }]],
    ['enfourche le vélo', [{ kind: 'velo', monter: true }]],
    ["n'oublie pas de fermer le frigo", [{ kind: 'fermer', ref: 'frigo' }]],
    ['tu peux me faire un café ?', [{ kind: 'cafe' }]],
    ['donne-moi la pomme', [{ kind: 'prendre', ref: 'pomme-2' }]],
    ["va me chercher un verre d'eau", [{ kind: 'prendre', ref: 'verre-1' }]],
    ['prend la tase', [{ kind: 'prendre', ref: 'tasse-3' }]],
    ['mange la pome', [{ kind: 'manger', ref: 'pomme-2' }]],
    ['etein la lumiere', [{ kind: 'eteindre', ref: 'lampadaire' }]],
    ["qu'est-ce qu'il y a dans le frigo", [{ kind: 'regarder', ref: 'frigo' }]],
    ['regarde la télé', [{ kind: 'allumer', ref: 'television' },{ kind: 'asseoir', ref: 'canape' }]],
    ['mets la télé', [{ kind: 'allumer', ref: 'television' }]],
    ['allume la lumière de la chambre', [{ kind: 'allumer', ref: 'lampe-chevet' }]],
    ['mets la lumière', [{ kind: 'allumer', ref: 'lampadaire' }]],
    ['arrête la machine à café', [{ kind: 'eteindre', ref: 'machine-a-cafe' }]],
    ['mets un sac neuf', [{ kind: 'sac_neuf' }]],
    ["regarde l'horloge", [{ kind: 'heure' }]],
    ['douche-toi', [{ kind: 'douche' }]],
    ['va te doucher', [{ kind: 'douche' }]],
    ['prends un bain', [{ kind: 'douche' }]],
    ['fais une sieste', [{ kind: 'dormir' }]],
    ['repose-toi', [{ kind: 'asseoir', ref: 'canape' }]],
    ['lève toi du lit', [{ kind: 'reveiller' }]],
    ['sors du lit', [{ kind: 'reveiller' }]],
    ['relève le courrier', [{ kind: 'prendre', ref: 'lettre' }]],
    ['monte sur le vélo', [{ kind: 'velo', monter: true }]],
    ['fais du vélo', [{ kind: 'velo', monter: true }]],
    ['prends le vélo', [{ kind: 'velo', monter: true }]],
    ['descends du vélo', [{ kind: 'velo', monter: false }]],
    ['descends la poubelle', [{ kind: 'sortir_poubelle' }]],
    ['saute', [{ kind: 'sauter_perso' }]],
    ['lance la tasse', [{ kind: 'lancer', ref: 'tasse-3' }]],
    ['salut', [{ kind: 'dire', texte: 'Salut' }]],
    ["dis-moi l'heure", [{ kind: 'heure' }]],
    ['chuchote bonsoir', [{ kind: 'dire', texte: 'Bonsoir' }]],
    ['mets-toi à table', [{ kind: 'attabler' }]],
    ['installe-toi sur le canapé', [{ kind: 'asseoir', ref: 'canape' }]],
    ['passe le balai', [{ kind: 'balayer' }]],
    ['ajoute du sel', [{ kind: 'assaisonner', epice: 'sel' }]],
    ['commande des pâtes', [{ kind: 'acheter', lignes: [{ id: 'paquet-pates', n: 1 }] }]],
  ];
  for (const [ordre, attendu] of cases) it(`« ${ordre} »`, () => expect(parse(ordre)).toEqual(attendu));
});

describe('le ménage, pièce par pièce', () => {
  const cases: Array<[string, Intent[]]> = [
    ['fais le ménage', [{ kind: 'menage' }]],
    ['fait le menag', [{ kind: 'menage' }]],
    ['tu peux faire un peu de ménage dans le salon stp', [{ kind: 'menage', piece: 'salon' }]],
    ['fais le grand ménage', [{ kind: 'menage' }]],
    ['nettoie la salle de bain', [{ kind: 'menage', piece: 'salle de bain' }]],
    ['nettoie la sdb', [{ kind: 'menage', piece: 'salle de bain' }]],
    ['nettoie toute la maison', [{ kind: 'menage' }]],
    ['nettoie la pièce', [{ kind: 'menage', ici: true }]],
    ['lave la cuisine', [{ kind: 'menage', piece: 'cuisine' }]],
    ['balaie', [{ kind: 'balayer' }]],
    ['balaie la cuisine', [{ kind: 'balayer', piece: 'cuisine' }]],
    ["passe un coup de balai dans l'entrée", [{ kind: 'balayer', piece: 'entrée' }]],
    ["passe l'aspirateur", [{ kind: 'aspirateur' }]],
    ["passe l'aspirateur partout", [{ kind: 'aspirateur' }]],
    ["passe un coup d'aspi dans la chambre", [{ kind: 'aspirateur', piece: 'chambre' }]],
    ["passe l'aspirtaeur au salon", [{ kind: 'aspirateur', piece: 'salon' }]],
    ['aspire le salon', [{ kind: 'aspirateur', piece: 'salon' }]],
    ['aspire le canapé', [{ kind: 'aspirateur', ref: 'canape' }]],
    ['passe la serpillière', [{ kind: 'serpillere' }]],
    ['passe la serpillière dans le salon', [{ kind: 'serpillere', piece: 'salon' }]],
    ['lave le sol', [{ kind: 'serpillere' }]],
    ['nettoie le carrelage de la cuisine', [{ kind: 'serpillere', piece: 'cuisine' }]],
    ['fais les sols', [{ kind: 'serpillere' }]],
    ['nettoie par terre', [{ kind: 'essuyer_sol' }]],
    ['fais la poussière', [{ kind: 'poussiere' }]],
    ['fais la poussière dans la chambre', [{ kind: 'poussiere', piece: 'chambre' }]],
    ['dépoussière les meubles', [{ kind: 'poussiere' }]],
    ['dépoussière la bibliothèque', [{ kind: 'poussiere', ref: 'bibliotheque' }]],
    ['passe le chiffon sur la table basse', [{ kind: 'poussiere', ref: 'table-basse' }]],
    ['fais les vitres', [{ kind: 'vitres' }]],
    ['nettoie les carreaux du salon', [{ kind: 'vitres', piece: 'salon' }]],
    ['nettoie le miroir', [{ kind: 'vitres', ref: 'miroir' }]],
    ['nettoie les toilettes', [{ kind: 'nettoyer', ref: 'toilettes' }]],
    ['frotte les wc', [{ kind: 'nettoyer', ref: 'toilettes' }]],
    ['récure la douche', [{ kind: 'nettoyer', ref: 'douche' }]],
    ['lave la baignoire', [{ kind: 'nettoyer', ref: 'douche' }]],
    ['astique le lavabo', [{ kind: 'nettoyer', ref: 'lavabo' }]],
    ['nettoie le canapé', [{ kind: 'nettoyer', ref: 'canape' }]],
    ['balaie la cuisine puis passe la serpillière', [{ kind: 'balayer', piece: 'cuisine' }, { kind: 'serpillere' }]],
    ["balaie le salon et passe l'aspirateur dans la chambre", [{ kind: 'balayer', piece: 'salon' }, { kind: 'aspirateur', piece: 'chambre' }]],
  ];
  for (const [ordre, attendu] of cases) it(`« ${ordre} »`, () => expect(parse(ordre)).toEqual(attendu));
  // le reste ne bouge pas
  it('« fais la vaisselle », « lave la tasse », « nettoie la table » restent ce qu’ils étaient', () => {
    expect(parse('fais la vaisselle')).toEqual([{ kind: 'vaisselle', refs: [] }]);
    expect(parse('nettoie la table')).toEqual([{ kind: 'essuyer', ref: 'table' }]);
    expect(parse('nettoie le plan de travail')).toEqual([{ kind: 'nettoyer', ref: 'plan-de-travail' }]);
    expect(parse('lave-toi les mains')).toEqual([{ kind: 'laver', visage: false }]);
  });
});

describe('ce qui n’est pas compris part à l’IA (plutôt qu’un contresens)', () => {
  const ordres = [
    'ouvre la fenêtre',
    'ouvre la porte du garage',
    'mets la météo',
    'mets le pull',
    'mets tes chaussures',
    'fais des pâtes',
    'prépare un gâteau au chocolat',
    'fais une soupe',
    'fais un bol de céréales',
    'lance la balle',
    'jette la balle',
    'range le bazar',
    'relève le bras',
    'monte le son',
    'change de chaîne',
    'brosse-toi les dents',
    'lave tout',
  ];
  for (const ordre of ordres) it(`« ${ordre} »`, () => expect(parse(ordre)).toBeNull());
});
