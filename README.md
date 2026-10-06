# Rp Island

![Aperçu](apercu.png)

Monde de RP en 3D dans le navigateur : un créateur de personnage, puis une map (un sol d'herbe)
où le perso créé se promène, en cel shading avec le rendu HD-2D d'Arena Tactic.

## Lancer le jeu

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173. Le jeu s'ouvre sur le créateur de personnage ; « Jouer »
mène à la map, « ✎ Perso » y revient.

- Clic sur le sol : le perso y marche (Maj + clic : il court)
- ZQSD, WASD ou flèches : marcher (Maj : courir)
- Molette : zoom
- Boutons en haut à droite : tourner la caméra d'un quart de tour

`npm run build` produit une version publiable dans `dist/`.

## Le créateur de personnage

Basé sur [MakeHuman](http://www.makehumancommunity.org/), le créateur d'humains libre de
référence (données en CC0, utilisables librement dans le jeu) :

- **Corps** : sexe, âge (10 à 90 ans), muscles, poids, taille, proportions, origine (traits
  africains / asiatiques / européens mélangeables), poitrine.
- **Tête, visage, silhouette** : une centaine de curseurs (forme du crâne, oreilles, yeux, nez,
  bouche, menton, joues, torse, hanches, bras, jambes...). Double-clic sur un curseur : remise à zéro.
- **Apparence** : teinte de peau (n'importe quelle couleur), couleur des yeux, 10 coiffures
  teintables, 12 sourcils.
- **Tenue** : 12 tenues, 6 paires de chaussures, chapeaux, teinte au choix.
- **Expressions** (neutre, sourire, rire, triste, colère, surprise, peur, dégoût, clin d'œil) et
  clignement automatique des yeux : ce sont des morphs, gratuits à jouer.
- Bouton « Au hasard », export / import du perso en JSON.

Un perso est une **recette** (`src/creator/recipe.ts`) : quelques nombres et choix, sauvegardés
dans le navigateur. Le corps est reconstruit à partir de la recette au chargement : c'est aussi ce
qu'une IA pourra écrire pour créer des PNJ.

Tous les persos ont le **squelette Mixamo** : les animations d'X Bot (repos, marche, course, oui,
non...) sont reciblées automatiquement sur chaque corps, quelle que soit sa taille.

Les données (`public/creator/`, 11 Mo) sont produites par `tools/build_creator_assets.py`
(voir `tools/README.md`).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/game/Game.ts` | Scène, caméra iso d'Arena Tactic (30°, 45°, orthographique), lumière, commandes |
| `src/game/postfx.ts` | Post-traitement HD-2D repris d'Arena Tactic : contours encrés, bloom, étalonnage, vignettage, + flou de profondeur |
| `src/game/toon.ts` | Matériau cel shading (3 paliers nets + liseré de lumière) |
| `src/game/character.ts` | Perso glTF au squelette Mixamo, animations repos / marche / course |
| `src/game/ground.ts` | Sol d'herbe (texture peinte par programme) |
| `src/game/motes.ts` | Poussières de lumière qui flottent (ambiance) |
| `src/App.tsx` | Interface React : créateur puis map |
| `src/creator/assets.ts` | Chargement des données MakeHuman converties |
| `src/creator/human.ts` | Corps paramétrable : formes, os qui suivent les formes, cheveux et vêtements ajustés, expressions |
| `src/creator/retarget.ts` | Reciblage des animations Mixamo sur chaque corps |
| `src/creator/puppet.ts` | Perso animé (corps + animations + expressions + clignement), partagé créateur / jeu |
| `src/creator/recipe.ts` | La recette d'un perso, les curseurs et leurs libellés |
| `src/creator/Creator.tsx` | Écran du créateur |

## Les animations

« X Bot » de Mixamo (fourni dans les exemples de three.js) ne sert plus que de source
d'animations : `idle`, `walk`, `run`, `agree` (oui), `headShake` (non), `sad_pose`,
`sneak_pose`. Toute animation Mixamo ajoutée à ce fichier sera jouable par tous les persos.
