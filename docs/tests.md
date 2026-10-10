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
| `tests/chores.test.ts` | Gestes de ménage (`src/game/items/chores.ts`) : chaque geste tient son outil d'une seule façon, la tête de l'outil reste près du point visé (au sol pour les manches), mise en place et retour en douceur, chaque outil du catalogue a son geste |
| `tests/ordres-maison.test.ts` | Les ordres tapés essayés sur la vraie maison (`tests/fixtures/maison.json`, refait par `node tools/dump_maison.mjs`) : pièces, pluriels, noms composés, formes polies, fautes de frappe, vélo, et les ordres inconnus qui partent à l'IA au lieu d'un contresens |

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

Sans carte graphique, le rendu ne fait qu'une image par seconde environ. Le jeu n'avançant que de
50 ms par image, il tournerait vingt fois au ralenti (le café ne finissait pas toujours de couler
dans les cinq minutes) : le test règle `game.catchUp = 40`, qui fait jouer jusqu'à 40 pas de 50 ms
avant chaque image pour suivre le temps réel. Le chargement reste long : le test prend quelques
minutes, c'est normal.

En local, la première fois : `npx playwright install chromium`.
