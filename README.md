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

Style anime, basé sur les **modèles officiels de VRoid Studio** (pixiv) au format VRM, lus par
la bibliothèque [three-vrm](https://github.com/pixiv/three-vrm) : shader toon MToon (cel shading
avec contours), expressions du visage, cheveux et vêtements qui bougent (ressorts).

12 persos de base (9 féminins, 3 masculins). Chacun fournit trois pièces que l'on mélange :

- **Tenue** : le corps et ses vêtements (gilet et short, uniformes, robes, sweat...).
- **Visage** : yeux, bouche, expressions (du même genre que la tenue).
- **Coiffure** : n'importe laquelle des 12, avec ses mèches à ressorts.
- **Couleurs** : peau, yeux, cheveux (ou couleurs d'origine).
- **Corps** : taille, tête, jambes, carrure. Double-clic sur un curseur : valeur d'origine.
- **Expressions** (neutre, sourire, rire, triste, colère, surprise, peur, dégoût, clin d'œil) et
  clignement automatique des yeux.
- Bouton « Au hasard », export / import du perso en JSON.

Un perso est une **recette** (`src/creator/recipe.ts`) : quelques choix et nombres, sauvegardés
dans le navigateur. C'est aussi ce qu'une IA pourra écrire pour créer des PNJ.

Les animations d'X Bot (repos, marche, course, oui, non...) sont reciblées sur le squelette
humanoïde VRM de chaque perso.

Les modèles (`public/vrm/`, 29 Mo pour 12 persos) sont produits par `tools/build_vrm_assets.py`
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
| `src/creator/catalog.ts` | Liste des 12 persos de base (tenue, coiffure, genre) |
| `src/creator/vrm.ts` | Chargement des fichiers VRM (three-vrm) |
| `src/creator/avatar.ts` | Assemblage tenue + visage + coiffure de modèles différents, proportions, couleurs |
| `src/creator/retarget.ts` | Reciblage des animations Mixamo sur le squelette VRM |
| `src/creator/puppet.ts` | Perso animé (assemblage + animations + expressions + clignement), partagé créateur / jeu |
| `src/creator/recipe.ts` | La recette d'un perso, bornes des curseurs, palettes |
| `src/creator/Creator.tsx` | Écran du créateur |

## Les animations

« X Bot » de Mixamo (fourni dans les exemples de three.js) ne sert plus que de source
d'animations : `idle`, `walk`, `run`, `agree` (oui), `headShake` (non), `sad_pose`,
`sneak_pose`. Toute animation Mixamo ajoutée à ce fichier sera jouable par tous les persos.

Le repos raide d'X Bot est en cours de remplacement par une animation libre : dans le créateur,
« Repos A » (X Bot), « B » (pixiv, VRMA), « C » et « D » (Quaternius, CC0) se comparent ; `idle`
désigne celui retenu (voir `src/creator/puppet.ts`). Le reciblage lit aussi le squelette de Quaternius
(`UAL_TO_VRM` dans `retarget.ts`).
