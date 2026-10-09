import { describe, expect, it } from 'vitest';
import { Argent, euros, groceryAisle, HOUSE_ALWAYS, orderTotal, priceOf, readCommande, sellPrice, START_MONEY } from '../src/game/argent';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { STOCK } from '../src/game/items/pantry';

const def = (id: string) => ITEM_BY_ID.get(id)!;
const at = { x: 1, y: 0, z: 2 };
const rot = { x: 0, y: 0, z: 0, w: 1 };

describe('argent', () => {
  it('part du montant de départ, paie seulement ce qu’on a', () => {
    const a = new Argent();
    expect(a.money).toBe(START_MONEY);
    expect(a.spend(START_MONEY + 1)).toBe(false);
    expect(a.money).toBe(START_MONEY);
    expect(a.spend(500)).toBe(true);
    a.earn(120);
    expect(a.money).toBe(START_MONEY - 380);
  });

  it('prévient l’interface à chaque changement', () => {
    const a = new Argent();
    let n = 0;
    const off = a.subscribe(() => n++);
    a.spend(10);
    a.earn(5);
    off();
    a.earn(5);
    expect(n).toBe(2);
  });

  it('affiche les euros à la française', () => {
    expect(euros(20000)).toBe('200,00 €');
    expect(euros(1205)).toBe('12,05 €');
    expect(euros(7)).toBe('0,07 €');
  });

  it('chaque aliment de la liste de courses a son rayon et un prix', () => {
    const aisle = groceryAisle();
    expect(aisle.map((d) => d.name).sort()).toEqual(Object.keys(STOCK).sort());
    for (const d of aisle) expect(priceOf(d)).toBeGreaterThan(0);
    expect(orderTotal([{ id: 'pomme', n: 3 }, { id: 'pain', n: 1 }])).toBe(priceOf(def('pomme')) * 3 + priceOf(def('pain')));
    expect(orderTotal([{ id: 'inconnu', n: 3 }])).toBe(0);
  });

  it('le marché paie toujours moins que le magasin, plus avec les étoiles', () => {
    for (const d of ITEM_BY_ID.values()) {
      for (const s of [0, 1, 2, 3, 4, 5]) {
        for (const f of ['frais', 'à manger vite'] as const) expect(sellPrice(d, s, f)).toBeLessThan(priceOf(d));
      }
    }
    const plat = def('omelette');
    expect(sellPrice(plat, 5, 'frais')).toBeGreaterThan(sellPrice(plat, 2, 'frais'));
    expect(sellPrice(plat, 3, 'à manger vite')).toBeLessThan(sellPrice(plat, 3, 'frais'));
  });

  it('rachète les légumes du jardin et les pommes, pas le reste sans étoiles ni le périmé', () => {
    for (const id of ['carotte', 'tomate', 'pomme-de-terre', 'concombre', 'pomme']) expect(sellPrice(def(id), 0, 'frais')).toBeGreaterThan(0);
    expect(sellPrice(def('chips'), 0, 'frais')).toBe(0);
    expect(sellPrice(def('assiette'), 0, 'frais')).toBe(0);
    expect(sellPrice(def('omelette'), 4, 'périmé')).toBe(0);
  });

  it('note les objets cassés à racheter, pas les aliments', () => {
    const a = new Argent();
    a.noteBroken(def('assiette'), at, rot);
    a.noteBroken(def('assiette'), at, rot);
    a.noteBroken(def('chaise'), at, rot);
    a.noteBroken(def('pomme'), at, rot);
    a.noteBroken(def('lettre'), at, rot);
    const aisle = a.houseAisle();
    expect(aisle.find((r) => r.def.id === 'assiette')?.broken).toBe(2);
    expect(aisle.find((r) => r.def.id === 'chaise')?.broken).toBe(1);
    expect(aisle.some((r) => r.def.id === 'pomme' || r.def.id === 'lettre')).toBe(false);
    // les pastilles et la vaisselle sont toujours en rayon
    for (const id of HOUSE_ALWAYS) expect(aisle.some((r) => r.def.id === id)).toBe(true);
    expect(a.takeBroken('chaise')?.p).toEqual([1, 0, 2]);
    expect(a.takeBroken('chaise')).toBeUndefined();
  });

  it('se sauve et se relit, une vieille sauvegarde reprend l’argent de départ', () => {
    const a = new Argent();
    a.spend(1234);
    a.noteBroken(def('tasse'), at, rot);
    const b = new Argent();
    b.load(JSON.parse(JSON.stringify(a.save())));
    expect(b.money).toBe(START_MONEY - 1234);
    expect(b.broken).toEqual(a.broken);
    b.load(undefined);
    expect(b.money).toBe(START_MONEY);
    expect(b.broken).toEqual([]);
  });

  it('relit une commande en attente, et ignore une illisible', () => {
    const c = readCommande({ hours: 0.2, names: ['pomme', 3], house: [{ id: 'assiette' }, { id: 'disparu' }] });
    expect(c).toEqual({ hours: 0.2, names: ['pomme'], house: [{ id: 'assiette' }] });
    expect(readCommande(undefined)).toBeNull();
    expect(readCommande({ names: [] })).toBeNull();
  });
});
