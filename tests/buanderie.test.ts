import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BASKET_FULL, Buanderie, DRYER_SECONDS, dryRate, START_CLEAN, START_DIRTY, WASH_SECONDS, type BuanderieHost, type DryingSpot } from '../src/game/buanderie';
import type { WorldItem } from '../src/game/items/carry';

/** Un objet de la scène réduit à ce que la buanderie regarde. */
const item = (id: string) => ({ def: { id }, name: id, object: new THREE.Object3D(), part: () => undefined }) as unknown as WorldItem;

function setup() {
  const said: string[] = [];
  const told: string[] = [];
  let mood = 0;
  const host: BuanderieHost = {
    character: { heldItems: [] } as unknown as BuanderieHost['character'],
    spawn: () => null,
    remove: () => {},
    notice: (t) => told.push(t),
    say: (t) => said.push(t),
    mood: (n) => (mood += n),
    sound: () => {},
    outdoors: () => true,
    weather: () => ({ rain: 0, snow: 0, cloud: 0 }),
    night: () => false,
    outdoorAir: () => 18,
  };
  const items = { basket: item('panier-linge'), washer: item('machine-a-laver'), dryer: item('seche-linge'), rack: item('etendoir'), wardrobe: item('armoire') };
  const b = new Buanderie(host);
  b.attach(Object.values(items));
  return { b, items, said, told, mood: () => mood };
}

const spot = (o: Partial<DryingSpot>): DryingSpot => ({ outdoors: true, rain: 0, snow: 0, cloud: 0, night: false, air: 18, ...o });

describe('séchage du linge étendu', () => {
  it('sèche bien plus vite dehors au soleil que dedans', () => {
    expect(dryRate(spot({}))).toBeGreaterThan(3 * dryRate(spot({ outdoors: false })));
  });

  it('sèche moins vite la nuit et par temps couvert', () => {
    expect(dryRate(spot({ night: true }))).toBeLessThan(dryRate(spot({})));
    expect(dryRate(spot({ cloud: 1 }))).toBeLessThan(dryRate(spot({})));
  });

  it('se remouille sous la pluie dehors, pas dedans', () => {
    expect(dryRate(spot({ rain: 0.8 }))).toBeLessThan(0);
    expect(dryRate(spot({ rain: 0.8, outdoors: false }))).toBeGreaterThan(0);
  });

  it('le sèche-linge va plus vite que l’étendoir, même au soleil', () => {
    expect(1 / DRYER_SECONDS).toBeGreaterThan(dryRate(spot({})));
  });
});

describe('le panier à linge', () => {
  it('chaque douche y met une tenue sale et en prend une propre à l’armoire', () => {
    const { b, items } = setup();
    expect(b.stateOf(items.basket)).toContain(`${START_DIRTY} tenue`);
    b.showered();
    expect(b.stateOf(items.basket)).toContain(`${START_DIRTY + 1} tenues`);
    expect(b.cleanLeft).toBe(START_CLEAN - 1);
  });

  it('plein, le perso le dit et l’humeur baisse', () => {
    const { b, items, said, mood } = setup();
    for (let i = START_DIRTY; i < BASKET_FULL; i++) b.showered();
    expect(b.stateOf(items.basket)).toMatch(/^plein/);
    expect(said.at(-1)).toContain('plein');
    expect(mood()).toBeLessThan(0);
  });

  it('plus rien de propre : on le remarque, l’humeur baisse encore', () => {
    const { b, mood } = setup();
    for (let i = 0; i < START_CLEAN; i++) b.showered();
    expect(b.cleanLeft).toBe(0);
    const before = mood();
    b.showered();
    expect(mood()).toBeLessThan(before);
  });
});

describe('les machines', () => {
  it('un lavage rend le linge mouillé, un séchage le rend sec', () => {
    const { b, items } = setup();
    b.setExtras(items.washer, { linMachine: { n: 3, stage: 'sale', t: 0 } });
    expect(b.stateOf(items.washer)).toBe('linge sale, prêt à laver');
    b.click(items.washer, false);
    expect(b.stateOf(items.washer)).toMatch(/^lavage en cours/);
    b.update(WASH_SECONDS / 2, 1);
    expect(b.stateOf(items.washer)).toMatch(/50 %/);
    b.update(WASH_SECONDS / 2 + 0.1, 1);
    expect(b.stateOf(items.washer)).toBe('linge lavé, mouillé');

    b.setExtras(items.dryer, { linMachine: { n: 3, stage: 'mouillé', t: 0 } });
    b.click(items.dryer, false);
    b.update(DRYER_SECONDS + 0.1, 1);
    expect(b.stateOf(items.dryer)).toBe('linge sec');
  });

  it('l’étendoir sèche au soleil, et se garde dans la sauvegarde', () => {
    const { b, items } = setup();
    b.setExtras(items.rack, { linEtendu: { n: 2, wet: 1 } });
    b.update(1000, 1);
    expect(b.stateOf(items.rack)).toBe('linge sec');
    expect(b.extras(items.rack)).toEqual({ linEtendu: { n: 2, wet: 0 } });
  });
});
