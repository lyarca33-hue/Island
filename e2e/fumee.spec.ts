/**
 * Test de fumée : le jeu se charge dans un vrai navigateur, sur la cuisine meublée avec les
 * modèles Tripo, sans aucune erreur dans la console. L'état passe par
 * window.game (game.describe(), game.rooms…).
 *
 * Sans carte graphique (CI), le rendu tombe à une image par seconde environ : game.catchUp fait
 * rattraper le temps réel au jeu en jouant plusieurs pas par image.
 */
import { expect, test } from '@playwright/test';

interface Jeu {
  rooms: unknown[];
  catchUp: number;
  describe(): { perso: string; objets: unknown[] };
}

test('le jeu se lance : la cuisine meublée, sans erreur', async ({ page }, info) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(`console : ${m.text()}`);
  });

  await page.goto('/');
  // la partie ne se sauve pas d'un test à l'autre : chaque lancement part de la cuisine neuve
  await expect(page.getByText('Chargement…')).toBeVisible();
  await expect(page.getByText('Chargement…')).toHaveCount(0, { timeout: 120_000 });
  expect(await page.evaluate(() => 'game' in window)).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { game: Jeu }).game.catchUp = 40;
  });

  // la maison : la cuisine et les pièces autour (entrée, garage, salon, salle de bain, chambre),
  // meublées avec les modèles Tripo, un fichier par pièce ; et le rez-de-chaussée (vide) de la
  // maison de campagne et de la maison en pierre
  const etat = await page.evaluate(() => {
    const g = (window as unknown as { game: Jeu }).game;
    const d = g.describe();
    const loaded = performance.getEntriesByType('resource').map((e) => e.name);
    const tripo = ['cuisine', 'salon', 'chambre', 'salle-de-bain', 'entree', 'garage', 'menage'].every((p) => loaded.some((n) => n.endsWith(`models/${p}.glb`)));
    return { pieces: g.rooms.length, objets: d.objets.length, perso: d.perso, tripo };
  });
  expect(etat.pieces).toBe(8);
  expect(etat.objets).toBeGreaterThanOrEqual(60);
  expect(etat.tripo).toBe(true);
  expect(etat.perso).toContain('cuisine');
  await page.screenshot({ path: info.outputPath('1-cuisine.png') });

  // le vélo du garage : on monte dessus, on sort du garage, on descend ; il reste debout là
  const velo = await page.evaluate(async () => {
    type V = { x: number; z: number; clone(): V; set(x: number, y: number, z: number): V };
    type Item = { def: { id: string }; object: { position: V; getObjectByName(n: string): { rotation: { z: number } } | undefined } };
    const g = (window as unknown as { game: { items: Item[]; velo: { mount(b: Item, r: boolean): boolean; dismount(): boolean; riding: Item | null; ride: { phase: string } | null }; character: { position: V; goTo(p: V, r: boolean): void } } }).game;
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 600 && !ok(); i++) await new Promise((r) => setTimeout(r, 100));
      return ok();
    };
    const bike = g.items.find((i) => i.def.id === 'velo')!;
    const start = bike.object.position.clone();
    if (!g.velo.mount(bike, false)) return 'pas monté';
    if (!(await wait(() => g.velo.ride?.phase === 'ride'))) return 'jamais en selle';
    g.character.goTo(start.clone().set(start.x - 1, 0, start.z + 6), false);
    if (!(await wait(() => bike.object.position.z > start.z + 2))) return 'le vélo n’avance pas';
    const wheel = bike.object.getObjectByName('roue-arriere')?.rotation.z ?? 0;
    if (Math.abs(wheel) < 1) return 'les roues ne tournent pas';
    g.velo.dismount();
    if (!(await wait(() => !g.velo.riding))) return 'pas descendu';
    return 'ok';
  });
  expect(velo).toBe('ok');
  await page.screenshot({ path: info.outputPath('2-velo.png') });

  // le râteau pend à son rangement du garage : pris, puis « Ranger », il y retourne
  const rateau = await page.evaluate(async () => {
    type V = { distanceTo(o: V): number; clone(): V };
    type Item = { def: { id: string }; object: { position: V } };
    const g = (window as unknown as { game: { items: Item[]; pickUp(n: string): boolean; storeAway(): void; character: { carried: Item[] } } }).game;
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 600 && !ok(); i++) await new Promise((r) => setTimeout(r, 100));
      return ok();
    };
    const rake = g.items.find((i) => i.def.id === 'rateau')!;
    const home = rake.object.position.clone();
    if (!g.pickUp('râteau') || !(await wait(() => g.character.carried.includes(rake)))) return 'pas pris';
    g.storeAway();
    if (!(await wait(() => !g.character.carried.includes(rake)))) return 'pas rangé';
    return rake.object.position.distanceTo(home) < 0.01 ? 'ok' : 'pas à sa place';
  });
  expect(rateau).toBe('ok');

  // les portes ne s'ouvrent qu'à la main : planté devant la porte d'entrée, elle reste fermée ;
  // envoyé dehors, le perso s'arrête, l'ouvre, et la laisse ouverte derrière lui
  const portes = await page.evaluate(async () => {
    type V = { x: number; z: number; clone(): V; distanceTo(o: V): number };
    type Room = { spec: { name: string }; doorOpen(i: number): boolean; doorPassable(i: number): boolean; entrySpot(): { stand: V }; fixtureSpot(k: 'porte', i: number, from: V): { stand: V } };
    const g = (window as unknown as { game: { rooms: Room[]; character: { position: V; idle: boolean; goTo(p: V, r: boolean): void } } }).game;
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 600 && !ok(); i++) await new Promise((r) => setTimeout(r, 100));
      return ok();
    };
    const hall = g.rooms.find((r) => r.spec.name === 'entrée')!;
    if (hall.doorOpen(0)) return 'porte d’entrée ouverte au départ';
    const front = hall.fixtureSpot('porte', 0, hall.entrySpot().stand).stand;
    g.character.goTo(front, false);
    if (!(await wait(() => g.character.position.distanceTo(front) < 0.2 && g.character.idle))) return 'pas arrivé devant la porte';
    await new Promise((r) => setTimeout(r, 1500));
    if (hall.doorOpen(0) || hall.doorPassable(0)) return 'la porte s’est ouverte toute seule';
    const out = front.clone();
    out.z += 2.5;
    g.character.goTo(out, false);
    if (!(await wait(() => g.character.position.distanceTo(out) < 0.3))) return 'pas sorti';
    if (!hall.doorOpen(0)) return 'la porte ne s’est pas ouverte en passant';
    await new Promise((r) => setTimeout(r, 1500));
    return hall.doorPassable(0) ? 'ok' : 'la porte s’est refermée derrière lui';
  });
  expect(portes).toBe('ok');
  await page.screenshot({ path: info.outputPath('3-porte.png') });

  expect(erreurs, erreurs.join('\n')).toEqual([]);
});

test('la visionneuse de modèles : un modèle, ses infos, un signalement avec commentaire', async ({ page }, info) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(`console : ${m.text()}`);
  });
  await page.goto('/?modeles');
  await expect(page.locator('.vis-item').first()).toBeVisible();
  await expect(page.locator('.vis-loading')).toHaveCount(0, { timeout: 120_000 });
  await page.locator('.vis-search').fill('frigo');
  await page.locator('.vis-item').first().click();
  await expect(page.locator('.vis-loading')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.vis-info h2')).toHaveText('frigo');
  await expect(page.locator('.vis-parts li')).toContainText(['porte']);
  await page.getByRole('button', { name: /Corriger sur Blender/ }).click();
  await page.locator('.vis-comment textarea').fill('charnière à revoir');
  await page.getByRole('button', { name: 'Envoyer la liste à Claude' }).click();
  await expect(page.locator('.feedback textarea')).toHaveValue(/objet frigo \(frigo\) : charnière à revoir/);
  await page.screenshot({ path: info.outputPath('visionneuse.png') });
  expect(erreurs).toEqual([]);
});
