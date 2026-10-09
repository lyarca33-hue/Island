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

  // la maison : la cuisine, avec ses meubles et appareils habillés par les modèles Tripo, et les
  // pièces autour (entrée, garage, salon, salle de bain, chambre), encore vides
  const etat = await page.evaluate(() => {
    const g = (window as unknown as { game: Jeu }).game;
    const d = g.describe();
    const tripo = performance.getEntriesByType('resource').some((e) => e.name.endsWith('models/cuisine.glb'));
    return { pieces: g.rooms.length, objets: d.objets.length, perso: d.perso, tripo };
  });
  expect(etat.pieces).toBe(6);
  expect(etat.objets).toBeGreaterThanOrEqual(20);
  expect(etat.tripo).toBe(true);
  expect(etat.perso).toContain('cuisine');
  await page.screenshot({ path: info.outputPath('1-cuisine.png') });

  expect(erreurs, erreurs.join('\n')).toEqual([]);
});
