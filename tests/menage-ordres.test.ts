/**
 * Les ordres de ménage, joués sur un faux jeu : quels gestes partent, dans quelle pièce, pour
 * « fais le ménage », « fais la poussière », « nettoie les toilettes »…
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Game, WorldObject } from '../src/game/Game';
import { runIntents, type Intent } from '../src/orders/tasks';

beforeAll(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
});

const obj = (ref: string, nom: string, piece: string): WorldObject & { piece: string } => ({ ref, nom, portable: false, ou: 'au sol', etat: 'neuf', distance: 1, piece });

/** Une maison sale : poussière par terre au salon, traces dans l'entrée, toilettes crasseuses, bibliothèque poussiéreuse. */
function fakeGame(sols: Record<string, { balai: boolean; serpillière: boolean }>, meubles: Record<string, { poussiere: number; crasse: number }>) {
  const objets = [obj('toilettes', 'toilettes', 'salle de bain'), obj('bibliotheque', 'bibliothèque', 'salon'), obj('table-basse', 'table basse', 'salon'), obj('canape', 'canapé', 'salon'), obj('plan-de-travail', 'plan de travail', 'cuisine')];
  const calls: string[] = [];
  let room = 'cuisine';
  const log = (s: string) => {
    calls.push(`${room}: ${s}`);
    return true;
  };
  const game = {
    idle: true,
    get roomName() {
      return room;
    },
    roomOf: (ref: string) => objets.find((o) => o.ref === ref)?.piece ?? null,
    describe: () => ({ enMain: [], mains: [], mainsLibres: true, objets }),
    dirt: () => ({ sols: Object.fromEntries(Object.keys(sols).map((p) => [p, { poussiere: 0, traces: 0, pire: 0 }])), meubles }),
    dirtOf: (ref: string) => meubles[ref] ?? null,
    dirtiestSpot: (piece: string, outil: 'balai' | 'serpillière') => (sols[piece]?.[outil] ? { x: 0, z: 0 } : null),
    walkToRoom: (p: string) => {
      room = p;
      return true;
    },
    sweepFloor: () => log('balai'),
    mopFloor: () => log('serpillière'),
    vacuumFloor: () => log('aspirateur'),
    dustFurniture: (ref?: string) => log(`poussière ${ref ?? ''}`.trim()),
    scrubSurface: (ref?: string) => log(`frotter ${ref ?? ''}`.trim()),
    washWindows: (ref?: string) => log(`vitres ${ref ?? ''}`.trim()),
    cleanSurface: (ref?: string) => log(`spray ${ref ?? ''}`.trim()),
  };
  return { game: game as unknown as Game, calls };
}

const run = async (intents: Intent[], g: ReturnType<typeof fakeGame>) => {
  const r = await runIntents(g.game, intents, () => {});
  expect(r.ok).toBe(true);
  return g.calls;
};

describe('les ordres de ménage lancent les gestes là où c’est sale', () => {
  const house = () =>
    fakeGame(
      { cuisine: { balai: false, serpillière: false }, salon: { balai: true, serpillière: false }, entrée: { balai: false, serpillière: true }, 'salle de bain': { balai: false, serpillière: false } },
      { toilettes: { poussiere: 0, crasse: 0.6 }, bibliotheque: { poussiere: 0.4, crasse: 0 }, 'table-basse': { poussiere: 0.1, crasse: 0 } },
    );

  it('« fais le ménage » : chaque pièce sale, le bon geste', async () => {
    expect(await run([{ kind: 'menage' }], house())).toEqual(['salon: balai', 'salon: poussière bibliotheque', 'entrée: serpillière', 'salle de bain: frotter toilettes']);
  });

  it('« fais le ménage dans le salon » : seulement le salon', async () => {
    expect(await run([{ kind: 'menage', piece: 'salon' }], house())).toEqual(['salon: balai', 'salon: poussière bibliotheque']);
  });

  it('« balaie le salon », « passe l’aspirateur dans la chambre » : le perso y va d’abord', async () => {
    expect(await run([{ kind: 'balayer', piece: 'salon' }, { kind: 'aspirateur', piece: 'chambre' }], house())).toEqual(['salon: balai', 'chambre: aspirateur']);
  });

  it('« fais la poussière » : les meubles poussiéreux au-delà du seuil', async () => {
    expect(await run([{ kind: 'poussiere' }], house())).toEqual(['salon: poussière bibliotheque']);
  });

  it('« nettoie les toilettes », « nettoie le plan de travail », « nettoie le canapé »', async () => {
    expect(await run([{ kind: 'nettoyer', ref: 'toilettes' }, { kind: 'nettoyer', ref: 'plan-de-travail' }, { kind: 'nettoyer', ref: 'canape' }], house())).toEqual(['salle de bain: frotter toilettes', 'cuisine: spray plan-de-travail', 'salon: aspirateur']);
  });

  it('« nettoie le miroir » : à la salle de bain', async () => {
    expect(await run([{ kind: 'vitres', ref: 'miroir' }], house())).toEqual(['salle de bain: vitres miroir']);
  });

  it('une maison propre : rien ne part', async () => {
    expect(await run([{ kind: 'menage' }], fakeGame({ cuisine: { balai: false, serpillière: false } }, {}))).toEqual([]);
  });
});
