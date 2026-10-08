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

describe('ordres des nouveautés : lessive, pêche, feu de camp, jardin, magasin', () => {
  const dehors: WorldObject[] = [
    ...cuisine,
    obj('gaziniere', 'gazinière', { sorte: 'gazinière', ou: 'au sol, feux éteints', distance: 6 }),
    obj('machine-a-laver', 'machine à laver', { ou: 'au sol, vide', distance: 4 }),
    obj('seche-linge', 'sèche-linge', { ou: 'au sol, vide', distance: 4.5 }),
    obj('etendoir', 'étendoir', { distance: 5 }),
    obj('panier-linge', 'panier à linge', { portable: true, deuxMains: true, ou: 'au sol, 3 tenues sales', distance: 4 }),
    obj('torchon', 'torchon', { portable: true, distance: 2 }),
    obj('etang', 'étang', { distance: 12 }),
    obj('canne-a-peche', 'canne à pêche', { portable: true, distance: 11 }),
    obj('feu-de-camp', 'feu de camp', { sorte: 'gazinière', ou: 'au sol, éteint', distance: 9 }),
    obj('potager', 'potager', { distance: 8 }),
    obj('pommier', 'pommier', { distance: 10 }),
    obj('massif-fleurs', 'massif de fleurs', { distance: 7 }),
    obj('tomate', 'tomate', { portable: true, sorte: 'nourriture', coupable: true, distance: 8.5 }),
  ];
  const parse = (t: string) => parseOrder(t, { enMain: [], objets: dehors });

  it('la lessive', () => {
    expect(parse('lance une lessive')).toEqual([{ kind: 'linge', etape: 'laver' }]);
    expect(parse('lance une machine')).toEqual([{ kind: 'linge', etape: 'laver' }]);
    expect(parse('fais la lessive')).toEqual([{ kind: 'linge', etape: 'laver' }]);
    expect(parse('lave le linge sale')).toEqual([{ kind: 'linge', etape: 'laver' }]);
    expect(parse('étends le linge')).toEqual([{ kind: 'linge', etape: 'etendre' }]);
    expect(parse('va étendre le linge dehors')).toEqual([{ kind: 'linge', etape: 'etendre' }]);
    expect(parse('mets le linge au sèche-linge')).toEqual([{ kind: 'linge', etape: 'secher' }]);
    expect(parse('fais sécher le linge')).toEqual([{ kind: 'linge', etape: 'secher' }]);
    expect(parse('lance le sèche-linge')).toEqual([{ kind: 'linge', etape: 'secher' }]);
    expect(parse('sors le linge de la machine à laver')).toEqual([{ kind: 'linge', etape: 'sortir', ref: 'machine-a-laver' }]);
    expect(parse('range le linge propre')).toEqual([{ kind: 'linge', etape: 'ranger' }]);
    expect(parse('ramasse le linge')).toEqual([{ kind: 'linge', etape: 'ranger' }]);
    expect(parse('plie le linge')).toEqual([{ kind: 'linge', etape: 'ranger' }]);
  });

  it('le torchon (« linge ») reste un torchon', () => {
    expect(parse('essuie la vaisselle avec le linge')?.[0].kind).toBe('essuyer_vaisselle');
    expect(parse('allume la machine à café')).toEqual([{ kind: 'allumer', ref: 'machine-a-cafe' }]);
  });

  it('la pêche', () => {
    expect(parse('va pêcher')).toEqual([{ kind: 'peche' }]);
    expect(parse('va à la pêche')).toEqual([{ kind: 'peche' }]);
    expect(parse('pêche un poisson')).toEqual([{ kind: 'peche' }]);
    expect(parse('prends la canne à pêche')).toEqual([{ kind: 'prendre', ref: 'canne-a-peche' }]);
  });

  it('le feu de camp, pas la gazinière', () => {
    expect(parse('allume le feu de camp')).toEqual([{ kind: 'allumer', ref: 'feu-de-camp' }]);
    expect(parse('éteins le feu de camp')).toEqual([{ kind: 'eteindre', ref: 'feu-de-camp' }]);
    expect(parse('fais un feu de camp')).toEqual([{ kind: 'allumer', ref: 'feu-de-camp' }]);
    expect(parse('allume la gazinière')).toEqual([{ kind: 'allumer', ref: 'gaziniere' }]);
  });

  it('le jardin', () => {
    expect(parse('arrose le potager')).toEqual([{ kind: 'jardin', geste: 'arroser' }]);
    expect(parse('sème des carottes')).toEqual([{ kind: 'jardin', geste: 'semer', quoi: 'carottes', tous: true }]);
    expect(parse('plante des pommes de terre')).toEqual([{ kind: 'jardin', geste: 'semer', quoi: 'pommes de terre', tous: true }]);
    expect(parse('récolte les tomates')).toEqual([{ kind: 'jardin', geste: 'recolter', quoi: 'tomates', tous: true }]);
    expect(parse('désherbe le potager')).toEqual([{ kind: 'jardin', geste: 'desherber' }]);
    expect(parse('arrache les mauvaises herbes')).toEqual([{ kind: 'jardin', geste: 'desherber' }]);
    expect(parse('cueille une pomme')).toEqual([{ kind: 'jardin', geste: 'pomme' }]);
    expect(parse('cueille des fleurs')).toEqual([{ kind: 'jardin', geste: 'bouquet' }]);
    expect(parse('sens les fleurs')).toEqual([{ kind: 'jardin', geste: 'sentir' }]);
    expect(parse('fais du jardinage')).toEqual([{ kind: 'jardin', geste: 'jardiner' }]);
  });

  it('le magasin et le marché', () => {
    expect(parse('va au magasin')).toEqual([{ kind: 'magasin' }]);
    expect(parse('achète 2 tomates et du lait')).toEqual([{ kind: 'acheter', lignes: [{ id: 'tomate', n: 2 }, { id: 'lait', n: 1 }] }]);
    expect(parse('achète des pommes de terre')).toEqual([{ kind: 'acheter', lignes: [{ id: 'pomme-de-terre', n: 1 }] }]);
    expect(parse('achète une canne à pêche en carbone')).toEqual([{ kind: 'acheter', lignes: [{ id: 'canne-a-peche-4', n: 1 }] }]);
    expect(parse('commande les courses')).toEqual([{ kind: 'courses' }]);
    expect(parse('achète une licorne')).toBeNull();
    expect(parse('vends tout au marché')).toEqual([{ kind: 'vendre' }]);
    expect(parse('vends les tomates')).toEqual([{ kind: 'vendre', noms: ['tomate'], tous: true }]);
    expect(parse('vends tes poissons')?.[0]).toMatchObject({ kind: 'vendre', tous: true });
    expect(parse('combien il me reste ?')).toEqual([{ kind: 'argent' }]);
    expect(parse('combien d’argent j’ai ?')).toEqual([{ kind: 'argent' }]);
  });
});
