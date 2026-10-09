import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyGame, type GameSave, type SaveAccess } from '../src/game/save';
import type { WorldItem } from '../src/game/items/carry';

/** Un objet de la maison réduit à ce que la reprise touche. */
function thing(id: string): WorldItem {
  return {
    def: { id },
    object: new THREE.Object3D(),
    setLevel() {},
    setLiquidColor() {},
    setCondition() {},
    setPortion() {},
    setDirty() {},
    setWet() {},
  } as unknown as WorldItem;
}

/** Une maison toute neuve faite de ces objets, et ce que la reprise en a retiré. */
function house(ids: string[]) {
  const items = ids.map(thing);
  const removed: string[] = [];
  const placed: Record<string, number> = {};
  for (const id of ids) placed[id] = (placed[id] ?? 0) + 1;
  const access = {
    items,
    placed,
    held: [],
    add: () => null,
    remove: (it: WorldItem) => removed.push(it.def.id),
    liquidColor: () => 0,
    refresh() {},
    extras: () => undefined,
    setExtras() {},
    perso: { position: new THREE.Vector3(), footing: new THREE.Vector3(), yaw: 0, forward: new THREE.Vector3(0, 0, 1), placeAt() {} },
    clock: { minutes: 0, speed: 1 },
    needs: { values: {}, health: 100 },
    mood: 0,
    skill: 0,
    setMood() {},
    setSkill() {},
    weather: {},
    body: { temp: 37, soaked: 0, inner: 0, state: 'bien' },
    argent: { load() {} },
    delivery: () => null,
    setDelivery() {},
    done() {},
  } as unknown as SaveAccess;
  return { access, removed };
}

const save = (ids: string[], more: Partial<GameSave> = {}): GameSave =>
  ({
    v: 1,
    savedAt: 0,
    clock: { minutes: 0, speed: 1 },
    needs: {},
    health: 100,
    mood: 0,
    skill: 0,
    perso: { x: 0, z: 0, yaw: 0 },
    items: ids.map((id) => ({ id, p: [0, 0, 0], q: [0, 0, 0, 1] })),
    ...more,
  }) as GameSave;

describe('reprise de la partie', () => {
  it("garde les meubles qu'une mise à jour a ajoutés à la maison, même d'un genre déjà connu", () => {
    // sauvée quand la cuisine était vide (placards hauts seuls), avec l'ancienne liste des genres connus
    const { access, removed } = house(['frigo', 'evier', 'chaise', 'chaise', 'placard-haut']);
    applyGame(access, save(['placard-haut'], { known: ['frigo', 'evier', 'chaise', 'placard-haut'], placed: { 'placard-haut': 1 } }));
    expect(removed).toEqual([]);
  });

  it('retire ce que la partie a perdu de sa maison de départ (mangé, cassé)', () => {
    const { access, removed } = house(['pomme', 'pomme', 'chaise', 'chaise']);
    applyGame(access, save(['pomme', 'chaise', 'chaise'], { placed: { pomme: 2, chaise: 2 } }));
    expect(removed).toEqual(['pomme']);
  });

  it("une chaise cassée reste cassée, la chaise arrivée avec la mise à jour reste là", () => {
    const { access, removed } = house(['chaise', 'chaise']);
    applyGame(access, save([], { placed: { chaise: 1 } }));
    expect(removed).toEqual(['chaise']);
  });

  it("ce qu'une mise à jour a retiré de la maison de départ disparaît aussi de la partie", () => {
    // sauvée quand l'armoire avait sa serviette et sa chemise ; la maison n'a plus que la serviette de la salle de bain
    const { access, removed } = house(['serviette']);
    const added: string[] = [];
    access.add = (id: string) => (added.push(id), thing(id));
    applyGame(access, save(['serviette', 'serviette', 'cintre'], { placed: { serviette: 2, cintre: 1 } }));
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
    expect(access.items.map((i) => i.def.id)).toEqual(['serviette']);
  });

  it("sans maison de départ (ancienne sauvegarde), rien n'est retiré", () => {
    const { access, removed } = house(['frigo', 'chaise']);
    applyGame(access, save(['chaise'], { known: ['frigo', 'chaise'] }));
    expect(removed).toEqual([]);
  });
});
