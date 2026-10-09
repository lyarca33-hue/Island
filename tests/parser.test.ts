import { describe, expect, it } from 'vitest';
import type { WorldObject } from '../src/game/Game';
import { normalize, parseOrder } from '../src/orders/parser';

/** Une petite cuisine : ce que game.describe() rendrait. */
const obj = (ref: string, nom: string, extra: Partial<WorldObject> = {}): WorldObject => ({ ref, nom, portable: false, ou: 'au sol', etat: 'neuf', distance: 1, ...extra });
const cuisine: WorldObject[] = [
  obj('tasse', 'tasse', { portable: true, sorte: 'récipient', ou: 'posé sur table', distance: 1.2 }),
  obj('table', 'table', { distance: 1 }),
  obj('chaise-1', 'chaise', { sorte: 'siège', distance: 1.5 }),
  obj('chaise-2', 'chaise', { sorte: 'siège', distance: 2 }),
  obj('machine-a-cafe', 'machine à café', { sorte: 'machine', ou: 'au sol, éteinte', distance: 2.5 }),
  obj('pomme', 'pomme', { portable: true, sorte: 'nourriture', coupable: true, ou: 'posé sur table', distance: 1.1 }),
  obj('frigo', 'frigo', { sorte: 'frigo', distance: 3 }),
];
const monde = (enMain: string[] = []) => ({ enMain, objets: cuisine });

describe('normalize', () => {
  it('minuscules, sans accents ni ponctuation', () => {
    expect(normalize('Fais-toi un Café !')).toBe('fais toi un cafe');
    expect(normalize("Prends l'œuf")).toBe('prends l oeuf');
    expect(normalize('  trop   d’espaces ')).toBe('trop d espaces');
  });
});

describe('ordres en français', () => {
  it('« prends la tasse »', () => {
    expect(parseOrder('prends la tasse', monde())).toEqual([{ kind: 'prendre', ref: 'tasse' }]);
  });

  it('la politesse ne gêne pas : « s’il te plaît, tu peux prendre la tasse »', () => {
    expect(parseOrder('s’il te plaît tu peux prendre la tasse', monde())).toEqual([{ kind: 'prendre', ref: 'tasse' }]);
  });

  it('« fais-toi un café »', () => {
    expect(parseOrder('fais-toi un café', monde())).toEqual([{ kind: 'cafe' }]);
  });

  it('« assieds-toi sur la chaise » : la plus proche', () => {
    expect(parseOrder('assieds-toi sur la chaise', monde())).toEqual([{ kind: 'asseoir', ref: 'chaise-1' }]);
  });

  it('« assieds-toi » sans siège nommé', () => {
    expect(parseOrder('assieds-toi', monde())).toEqual([{ kind: 'asseoir', ref: undefined }]);
  });

  it('« mange la pomme »', () => {
    expect(parseOrder('mange la pomme', monde())).toEqual([{ kind: 'manger', ref: 'pomme' }]);
  });

  it('plusieurs ordres à la suite : « prends la tasse puis assieds-toi »', () => {
    const out = parseOrder('prends la tasse puis assieds-toi', monde());
    expect(out?.map((i) => i.kind)).toEqual(['prendre', 'asseoir']);
  });

  it('« et » suivi d’un verbe coupe l’ordre : « prends la pomme et mange-la »', () => {
    const out = parseOrder('prends la pomme et mange-la', monde());
    expect(out?.map((i) => i.kind)).toEqual(['prendre', 'manger']);
  });

  it('« quelle heure est-il ? »', () => {
    expect(parseOrder('quelle heure est-il ?', monde())).toEqual([{ kind: 'heure' }]);
  });

  it('ce qui n’est pas compris rend null (l’ordre part à l’IA)', () => {
    expect(parseOrder('raconte-moi une blague', monde())).toBeNull();
    expect(parseOrder('', monde())).toBeNull();
  });

  it('on ne prend pas un objet qui n’est pas là', () => {
    expect(parseOrder('prends la guitare', monde())).toBeNull();
  });

  it('on ne reprend pas ce qu’on tient déjà', () => {
    expect(parseOrder('prends la tasse', monde(['tasse']))).toBeNull();
  });
});

describe('ordres de la cuisine : magasin, marché, appareils', () => {
  const objets: WorldObject[] = [
    ...cuisine,
    obj('gaziniere', 'gazinière', { sorte: 'gazinière', ou: 'au sol, feux éteints', distance: 6 }),
    obj('torchon', 'torchon', { portable: true, distance: 2 }),
    obj('tomate', 'tomate', { portable: true, sorte: 'nourriture', coupable: true, distance: 8.5 }),
  ];
  const parse = (t: string) => parseOrder(t, { enMain: [], objets });

  it('le torchon (« linge ») reste un torchon', () => {
    expect(parse('essuie la vaisselle avec le linge')?.[0].kind).toBe('essuyer_vaisselle');
    expect(parse('allume la machine à café')).toEqual([{ kind: 'allumer', ref: 'machine-a-cafe' }]);
    expect(parse('allume la gazinière')).toEqual([{ kind: 'allumer', ref: 'gaziniere' }]);
  });

  it('les gestes des pièces retirées partent à l’IA (elle dit ce qui manque)', () => {
    for (const t of ['lance une lessive', 'va pêcher', 'arrose le potager', 'zappe']) expect(parse(t)).toBeNull();
  });

  it('les toilettes : y aller, tirer la chasse', () => {
    for (const t of ['va aux toilettes', 'va aux WC', 'fais pipi']) expect(parse(t)).toEqual([{ kind: 'toilettes' }]);
    expect(parse('tire la chasse')).toEqual([{ kind: 'chasse' }]);
    expect(parse('fais ta toilette')).toEqual([{ kind: 'laver', visage: true }]);
  });

  it('le papier toilette s’accroche au porte-papier', () => {
    const wc = [...objets, obj('papier-toilette', 'papier toilette', { portable: true, distance: 1 }), obj('derouleur', 'porte-papier', { sorte: 'rangement', distance: 1.2 })];
    for (const t of ['accroche le pq au porte pq', 'range le papier toilette', 'accroche le rouleau de papier sur le dérouleur']) expect(parseOrder(t, { enMain: [], objets: wc })).toEqual([{ kind: 'ranger_place', ref: 'papier-toilette' }]);
  });

  it('le lit : dormir, se réveiller, le faire', () => {
    const chambre = [...objets, obj('lit', 'lit', { sorte: 'lit', distance: 2 })];
    const p = (t: string) => parseOrder(t, { enMain: [], objets: chambre });
    const kinds = (t: string) => p(t)?.map((i) => i.kind);
    for (const t of ['va dormir', 'va te coucher', 'couche-toi', 'dors', 'allonge-toi sur le lit', 'va au lit']) expect(kinds(t)).toEqual(['dormir']);
    expect(p('allonge-toi sur le lit')).toEqual([{ kind: 'dormir', ref: 'lit' }]);
    expect(p('réveille-toi')).toEqual([{ kind: 'reveiller' }]);
    for (const t of ['fais ton lit', 'fais le lit']) expect(p(t)).toEqual([{ kind: 'faire_lit', ref: 'lit' }]);
  });

  it('la porte de la salle de bain : à clé, ou pas', () => {
    for (const t of ['ferme la porte à clé', 'verrouille la porte', 'enferme-toi']) expect(parse(t)).toEqual([{ kind: 'verrou', fermer: true }]);
    expect(parse('déverrouille la porte')).toEqual([{ kind: 'verrou', fermer: false }]);
  });

  it('la douche : la prendre, se sécher', () => {
    for (const t of ['prends une douche', 'va sous la douche']) expect(parse(t)).toEqual([{ kind: 'douche' }]);
    expect(parse('sèche-toi')).toEqual([{ kind: 'secher' }]);
    expect(parse('essuie-toi avec la serviette')).toEqual([{ kind: 'secher' }]);
  });

  it('le magasin et le marché', () => {
    expect(parse('va au magasin')).toEqual([{ kind: 'magasin' }]);
    expect(parse('achète 2 tomates et du lait')).toEqual([{ kind: 'acheter', lignes: [{ id: 'tomate', n: 2 }, { id: 'lait', n: 1 }] }]);
    expect(parse('achète des pommes de terre')).toEqual([{ kind: 'acheter', lignes: [{ id: 'pomme-de-terre', n: 1 }] }]);
    expect(parse('commande les courses')).toEqual([{ kind: 'courses' }]);
    expect(parse('achète une licorne')).toBeNull();
    expect(parse('vends tout au marché')).toEqual([{ kind: 'vendre' }]);
    expect(parse('vends les tomates')).toEqual([{ kind: 'vendre', noms: ['tomate'], tous: true }]);
    expect(parse('combien il me reste ?')).toEqual([{ kind: 'argent' }]);
    expect(parse('combien d’argent j’ai ?')).toEqual([{ kind: 'argent' }]);
  });
});
