# La maison se salit

Code : `src/game/salissure.ts` (état et rendu), branché dans `Game.ts`.

## Ce qui se salit

| Quoi | Comment | Ce qui le nettoie |
| --- | --- | --- |
| Sol de chaque pièce : poussière | Tombe avec le temps (environ 0,006 par heure de jeu, deux fois plus le long des murs) | Balai, aspirateur (serpillière un peu) |
| Sol : traces de pas | Chaque pas dans la maison use un peu le sol ; rentré du jardin, les semelles laissent des empreintes de terre (beaucoup sous la pluie ou dans la neige), de plus en plus pâles | Serpillière |
| Dessus des meubles (table, table basse, meuble télé, tables de nuit, plans de travail, placards, frigo, armoire, bibliothèque, établi…) | Un voile de poussière se pose (environ 0,005 par heure de jeu) | Un coup d'éponge |
| Toilettes, lavabo, douche, évier, gazinière | Se ternissent à chaque usage (et un peu avec le temps : calcaire) | Spray nettoyant puis éponge |

Les valeurs vont de 0 (propre) à 1. Au-delà de 0,25, `describe()` le dit : « poussiéreux »,
« sale (spray et éponge) », « sol poussiéreux (balai) », « traces de pas par terre (serpillière) »,
« chaussures pleines de boue ». La saleté est gardée avec la partie.

## Rendu (léger)

- Un calque par pièce posé sur le sol : une texture d'un texel par 3 cm, redessinée seulement là où
  ça change, au plus 4 fois par seconde ; caché tant que le sol est propre.
- Un plan de poussière sur le dessus de chaque meuble suivi, caché tant qu'il est propre.
- Le sanitaire se teinte (couleur terne) : ses matériaux sont recopiés une fois, au premier usage.

## Gestes

- `game.sweepFloor()` : balai tenu ; sans éclats ni miettes, il balaie la poussière de la pièce du
  perso, carré par carré, du plus proche au plus loin.
- `game.mopFloor()` : serpillière tenue ; sans flaque, elle lave les traces de pas de la pièce.
- `game.cleanSurface(ref?)` : éponge tenue (plus le spray pour les taches et le sanitaire).

Le balai, le seau et sa serpillière sont dans le coin de la cuisine près de la porte de l'entrée,
l'éponge sur le placard à côté de l'évier.

## API (ordres, animations de ménage)

| Appel | Effet |
| --- | --- |
| `game.dirt()` | `{ sols: { piece: { poussiere, traces, pire } }, meubles: { ref: { poussiere, crasse } } }` |
| `game.dirtOf(ref)` | Saleté d'un meuble suivi, ou `null` |
| `game.dirtiestSpot(piece?, outil?)` | Le carré de 50 cm sale le plus proche du perso (`{ x, z }`), ou `null` |
| `game.cleanFloorAt(x, z, rayon, outil, force?)` | Nettoie le sol (`'balai'`, `'serpillière'`, `'aspirateur'`), renvoie ce qui est parti |
| `game.cleanItem(ref, force?)` | Nettoie un meuble sans geste |
| `game.soilFloor(x, z, rayon, quantite, 'poussière' \| 'boue')` | Salit le sol |
| `game.soilItem(ref, quantite, 'poussière' \| 'crasse')` | Salit un meuble |
| `game.ageHouse(heures)` | Fait vieillir la maison (poussière, calcaire) sans toucher à l'horloge |
