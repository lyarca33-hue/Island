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
