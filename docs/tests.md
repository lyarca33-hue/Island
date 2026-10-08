# Tests automatiques

Deux bancs d'essai tournent sur chaque PR (workflow **Tests**, `.github/workflows/tests.yml`),
à côté de la vérification de compilation (**Vérifier**).

## Tests unitaires (Vitest)

```sh
npm test
```

Ils vérifient les règles du jeu qui ne dessinent rien, en une ou deux secondes :

| Fichier | Ce qui est vérifié |
| --- | --- |
| `tests/needs.test.ts` | Besoins du perso (`src/game/needs.ts`) : baisse des jauges, marche/course, assis, sommeil, nuit, bornes 0-100, vessie qui se remplit en buvant, santé |
| `tests/freshness.test.ts` | Fraîcheur, chaleur, étoiles et compétence cuisine (`src/game/items/freshness.ts`) |
| `tests/recipes.test.ts` | Recettes et plats (`src/game/items/recipes.ts`) : chaque recette a son plat et inversement, mots normalisés, modèles 3D qui se construisent |
| `tests/parser.test.ts` | Ordres en français compris sans IA (`src/orders/parser.ts`) : « prends la tasse », « fais-toi un café », « assieds-toi », plusieurs ordres à la suite, ordre incompris → `null` |

Ajouter un fichier `tests/<nom>.test.ts` suffit pour qu'il soit lancé.

## Test de fumée (Playwright)

```sh
npm run test:e2e
```

`e2e/fumee.spec.ts` construit le jeu, l'ouvre dans Chromium sans écran et vérifie qu'il marche
de bout en bout :

1. l'écran « Chargement… » disparaît ;
2. le perso prend la tasse (`game.pickUp('tasse')`) ;
3. il se fait un café (`game.makeCoffee()`) : la tasse finit pleine de café ;
4. il s'assoit (`game.sit()`) ;
5. aucune erreur dans la console du navigateur pendant tout ce temps.

Les gestes passent par `window.game`, comme dans la console du jeu, et l'état est lu avec
`game.describe()`. Une capture d'écran est prise à chaque étape : sur GitHub, on les trouve dans
l'artefact **test-de-fumee** de l'exécution (avec la trace Playwright si le test échoue).

Sans carte graphique, le rendu ne fait que quelques images par seconde et le jeu avance au
ralenti : le test prend quelques minutes, c'est normal.

En local, la première fois : `npx playwright install chromium`.
