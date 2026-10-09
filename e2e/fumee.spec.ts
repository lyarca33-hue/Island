/**
 * Test de fumée : le jeu se charge dans un vrai navigateur, sur la cuisine vide (en attendant ses
 * meubles Tripo), sans aucune erreur dans la console. L'état passe par
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

test('le jeu se lance : la cuisine vide, sans erreur', async ({ page }, info) => {
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

  // une seule pièce, la cuisine, sans aucun objet
  const etat = await page.evaluate(() => {
    const g = (window as unknown as { game: Jeu }).game;
    const d = g.describe();
    return { pieces: g.rooms.length, objets: d.objets.length, perso: d.perso };
  });
  expect(etat.pieces).toBe(1);
  expect(etat.objets).toBe(0);
  expect(etat.perso).toContain('cuisine');
  await page.screenshot({ path: info.outputPath('1-cuisine.png') });

  expect(erreurs, erreurs.join('\n')).toEqual([]);
});
