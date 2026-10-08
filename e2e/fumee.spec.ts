/**
 * Test de fumée : le jeu se charge dans un vrai navigateur, le perso prend la tasse, se fait un
 * café et s'assoit, sans aucune erreur dans la console. Les gestes passent par window.game (les
 * mêmes appels que la console : game.pickUp('tasse')…), l'état par game.describe().
 *
 * Sans carte graphique (CI), le rendu tombe à une image par seconde environ. Le jeu, qui n'avance
 * que de 50 ms par image, tournerait vingt fois au ralenti (le café coulait en cinq minutes, ou pas
 * du tout à temps) : game.catchUp lui fait rattraper le temps réel en jouant plusieurs pas par image.
 */
import { expect, test, type Page } from '@playwright/test';

interface Etat {
  perso: string;
  enMain: string[];
  objets: Array<{ ref: string; nom: string; ou: string }>;
}

const etat = (page: Page) =>
  page.evaluate(() => {
    const d = (window as unknown as { game: { describe(): Etat } }).game.describe();
    return { perso: d.perso, enMain: d.enMain, objets: d.objets.map((o) => ({ ref: o.ref, nom: o.nom, ou: o.ou })) };
  });

const tasse = async (page: Page) => (await etat(page)).objets.find((o) => o.nom === 'tasse')?.ou ?? '';

/** Le perso a fini son geste (bras revenus, arrivé, plus rien en cours). */
const auRepos = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => (window as unknown as { game: { character: { idle: boolean } } }).game.character.idle), { timeout: 120_000 })
    .toBe(true);

/** Appelle une méthode du jeu (game.pickUp('tasse')…) et rend sa réponse. */
const geste = (page: Page, methode: string, ...args: unknown[]) =>
  page.evaluate(([m, a]) => {
    const g = (window as unknown as { game: Record<string, (...x: unknown[]) => unknown> }).game;
    return g[m as string](...(a as unknown[]));
  }, [methode, args] as const);

test('le jeu se lance : prendre la tasse, faire un café, s’asseoir', async ({ page }, info) => {
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
  // le jeu suit le temps réel même à une image par seconde
  await page.evaluate(() => {
    (window as unknown as { game: { catchUp: number } }).game.catchUp = 40;
  });
  await page.screenshot({ path: info.outputPath('1-charge.png') });

  // la tasse posée sur la table, prise en main
  expect(await tasse(page)).not.toBe('en main');
  expect(await geste(page, 'pickUp', 'tasse')).toBe(true);
  await expect.poll(async () => (await etat(page)).enMain, { timeout: 120_000 }).toContain('tasse');

  // un café à la machine : la tasse finit pleine de café
  expect(await geste(page, 'makeCoffee')).toBe(true);
  await expect.poll(() => tasse(page), { timeout: 300_000, intervals: [2000] }).toContain('contient du café');
  await auRepos(page);
  await page.screenshot({ path: info.outputPath('2-cafe.png') });

  // s'asseoir sur le siège le plus proche
  expect(await geste(page, 'sit')).toBe(true);
  await expect.poll(async () => (await etat(page)).perso, { timeout: 120_000 }).toContain('assis sur');
  await auRepos(page);
  await page.screenshot({ path: info.outputPath('3-assis.png') });

  expect(erreurs, erreurs.join('\n')).toEqual([]);
});

test('l’ancienne maison se charge encore (réglage carte)', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(`console : ${m.text()}`);
  });
  await page.goto('/?carte=ancienne');
  await expect(page.getByText('Chargement…')).toHaveCount(0, { timeout: 120_000 });
  const pieces = await page.evaluate(() => (window as unknown as { game: { rooms: unknown[] } }).game.rooms.length);
  expect(pieces).toBeGreaterThan(1);
  expect(erreurs, erreurs.join('\n')).toEqual([]);
});
