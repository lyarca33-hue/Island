# Rp Island

![Aperçu](apercu.png)

Monde de RP en 3D dans le navigateur : un créateur de personnage, puis une map (un sol d'herbe)
où le perso créé se promène, en cel shading avec le rendu HD-2D d'Arena Tactic.

## Jouer en ligne

**https://lyarca33-hue.github.io/Island/** : rien à installer, le lien ne change pas.
Le jeu y est remis à jour tout seul à chaque fusion sur `main` (la version jouée s'affiche dans la
fenêtre « Signaler »).

## Lancer le jeu

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173. La partie se sauvegarde toute seule (Menu → Partie) ; pour
la retrouver sur un autre ordinateur, se connecter avec Google : voir
[docs/compte-google.md](docs/compte-google.md). Le jeu s'ouvre directement sur la map avec le dernier perso
créé (un perso par défaut la première fois) ; Menu → Personnage → « ✎ Modifier le personnage »
ouvre le créateur, et « Jouer » ramène sur la map.

- Clic sur le sol : le perso y marche (Maj + clic : il court)
- ZQSD, WASD ou flèches : marcher (Maj : courir)
- Molette : zoom
- Boutons en haut à gauche, à côté du menu : tourner la caméra d'un quart de tour
- H (ou l'œil barré en haut à gauche) : masquer l'interface pour profiter de la scène
- Jauges rondes en haut à droite (santé, fatigue, faim, soif, hygiène) : la flèche dit si elle
  remonte ou baisse vite ; au survol, la valeur et quand elle tombera à zéro au rythme actuel
- Clic sur un objet : le perso va le prendre en main ; E (ou le bouton « Poser ») : le reposer
  devant lui (sur la table s'il y en a une)
- Livres : en tenant un livre, clic sur d'autres livres pour faire une pile (jusqu'à 6), portée à
  plat ; clic sur la bibliothèque pour les y ranger debout ; clic sur un livre rangé pour le prendre.
  Hors de la bibliothèque, un livre se pose à plat.
- Le perso contourne les meubles (table, bibliothèque) au lieu de les traverser
- Zone de saisie en bas (Entrée pour y écrire, Tab pour changer de mode) :
  - **💬 Parole** : le perso dit la phrase, dans une bulle au-dessus de sa tête ;
  - **✋ Action** : un ordre au perso (« range tous les livres », « fais-toi un café puis bois »),
    qu'il exécute. Le bouton « Arrêter » l'interrompt.
- Cycle jour/nuit : le temps du jeu passe 4 fois plus vite que le vrai (une journée = 6 h réelles).
  Menu → « Heure » : curseur pour changer l'heure à la volée, pause, ×4 ou ×60.
- Besoins du perso (en haut à droite) : fatigue, faim, soif, hygiène, de 100 à 0. Ils baissent
  avec l'heure du jeu, plus vite en marchant ou en courant (la fatigue aussi la nuit) ; boire
  remonte la soif, et un café réveille un peu. Console : `game.needs.set('faim', 10)`.
- Santé (au-dessus des besoins) : elle baisse quand un besoin reste à zéro (la soif fait le plus
  de mal, puis la faim, la fatigue, et un peu l'hygiène) et remonte doucement quand tous les
  besoins sont au-dessus de 30. Console : `game.needs.hurt(20)`, `game.needs.heal(20)`.

### La cuisine

Le perso est dans une cuisine (`src/game/room.ts`), seule sur un sol d'herbe plat, construite avec
le kit Tripo (`src/game/kit.ts`, `public/kit/maison.glb`) : sol carrelé, murs en enduit, une porte
d'entrée en bois qui s'ouvre toute seule quand il s'en approche (on peut sortir sur l'herbe), deux
fenêtres en bois, un toit en tuiles à deux pans visible de dehors. Les murs tournés vers la caméra
s'abaissent pour qu'on voie dedans, et se relèvent quand on tourne la caméra. Ni plafonnier ni
interrupteur, et pas d'ombres pour l'instant : une lumière douce entre par les fenêtres le jour, et la nuit une lumière d'ambiance chaude suit la pièce où est le perso.

La cuisine est **meublée avec les modèles Tripo** (`src/game/items/tripo.ts`,
`public/models/cuisine.glb`) : le long du fond, les tiroirs, le lave-vaisselle, l'évier sous la
fenêtre, un placard, la gazinière, un plan de travail, le four sur son socle et la poubelle ; contre
le mur de la porte, le frigo-congélateur et le garde-manger ; deux placards hauts au mur ; la machine
à café, la bouilloire, le grille-pain, l'égouttoir, le micro-ondes et le mixeur posés sur les plans
de travail ; la table et deux chaises devant la fenêtre du sud. Les meubles sont rangés par rangées
dos au mur (`runs` dans la fiche `KITCHEN`). Portes, tiroirs, boutons et levier sont ceux des
modèles, branchés sur les interactions du jeu. La vaisselle et les ustensiles reviendront au prochain
lot.

Autour de la cuisine, les **autres pièces sont meublées avec leurs modèles Tripo** (`src/game/maison.ts`
pour les places, `src/game/items/pieces.ts` pour les fiches, `public/models/<pièce>.glb`) :
- le **salon** : le meuble télé et la télé au fond, le canapé face à elle avec ses deux coussins, la
  table basse sur le tapis, le fauteuil et le lampadaire, la bibliothèque et quelques livres ;
- la **chambre** : le lit tête au mur et sa couette souple (un clic ou « va te coucher » : le perso
  rabat la couette, s'assoit au bord, s'allonge et la couette le recouvre ; il dort, le temps file et
  la fatigue remonte, jusqu'à être reposé ou réveillé, C ou un clic au sol ; il repousse la couette
  en se levant, et le lit reste défait jusqu'à « fais ton lit » : il tire la couette et la lisse),
  une table de nuit de chaque côté (lampe de chevet, réveil qui donne l'heure et se règle : un clic, ou « règle le réveil à 7 h 30 », « coupe le réveil » ; il sonne chaque jour à son heure en tremblant, cloche, bip ou mélodie au choix, « mets la sonnerie mélodie », et réveille le perso qui dort ; « arrête la sonnerie »), l'armoire, la plante
  et le tapis ;
- la **salle de bain** : la douche dans le coin (un clic ou « prends une douche » : le perso se
  place sous le pommeau, l'eau coule et la vapeur monte, il se frotte ; l'hygiène remonte à fond et
  il en sort mouillé, à sécher avec la serviette, sinon il laisse des gouttes), les toilettes (un clic ou « va aux toilettes » : le
  perso lève le couvercle, s'assoit, la vessie se vide, il se relève, tire la chasse et le couvercle
  se rabat ; les mains sont alors à laver), le lavabo (le robinet coule, on s'y lave les mains) sous
  son miroir, le porte-serviettes, le porte-papier (on y accroche le rouleau) ; la porte se ferme à
  clé de l'intérieur (clic droit sur la porte, ou « ferme la porte à clé ») : le voyant passe au
  rouge, et le perso la déverrouille en sortant ;
- l'**entrée** : le portemanteau et son manteau, le miroir, les chaussures, le porte-parapluies, une
  lettre sous la porte, la boîte aux lettres dehors ;
- le **garage** : l'établi et sa caisse à outils, l'étagère, des cartons, le vélo, la bêche et le râteau.

Tapis, colonne de douche, miroirs et portemanteau sont du décor fixe (`decor`) ; le reste se prend ou se pousse.
La télé, retirée avec l'ancienne maison, n'est pas encore rebranchée. La vessie baisse : en dessous de 18, le perso est
prévenu ; à zéro, c'est l'accident.

### Les ordres

Les ordres simples sont compris directement par le jeu, sans IA (`src/orders/parser.ts`) :
prendre, poser (« pose la lettre sur la table »), ranger (les livres), aller (« va à la table »),
café, boire (« bois de l'eau »), manger, couper (« coupe la pomme »), remplir la tasse d'eau, cuire (« fais cuire le steak »), allumer ou éteindre la gazinière, se laver (« lave-toi les mains », « fais ta toilette »), dire (« dis bonjour »), enchaînés avec « puis », « ensuite » ou « et ».

Les autres (« mets un peu d'ordre ») passent par un modèle de chat via
[OpenRouter](https://openrouter.ai), par défaut celui de Lumen (`qwen/qwen3.7-flash`). Il choisit
les tâches une par une en voyant l'état de la pièce, et peut répondre en personnage. Il faut une
clé OpenRouter : Menu (☰ ou Échap) → « IA des ordres » (gardée dans le navigateur), ou un
fichier `.env.local` :

```
VITE_OPENROUTER_API_KEY=sk-or-...
VITE_OPENROUTER_MODEL=qwen/qwen3.7-flash
```

**Manques** (`src/orders/missing.ts`, Menu → Manques) : ce que le perso n'a pas pu faire pendant
les essais est noté dans le navigateur, regroupé et compté. Trois sortes : une action ou un objet
que le jeu n'a pas encore (signalé par l'IA avec la tâche « manque », ex. danser), une action
ratée (message du jeu), un ordre non compris sans IA. Chaque manque porte un diagnostic
(`src/orders/diagnose.ts`) : sa cause probable (mains prises, objet absent de la pièce, verbe
inconnu, geste absent du jeu…) et la situation du perso à ce moment (ce qu'il tient, l'étape en
cours). Le crayon ✎ remplace ce commentaire automatique par le sien (gardé dans le navigateur ;
« Effacer mon commentaire » rétablit le commentaire auto). La corbeille 🗑 retire une ligne et son
commentaire (second clic pour confirmer). « Copier » ou « Télécharger » donne la liste en Markdown, à coller
dans la discussion du projet.

Les tâches (`src/orders/tasks.ts`) traduisent un ordre en actions de base selon l'état de la
pièce : ranger les livres = les prendre par piles de 6, les ranger, recommencer tant qu'il en
traîne. L'aperçu publié sur claude.ai ne peut pas joindre OpenRouter : les ordres libres y passent par
Claude (compte de la personne qui joue, qui l'autorise au premier ordre).

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
- **Perso VRoid importé** (onglet Tenue) : un perso fait dans VRoid Studio et exporté en `.vrm`
  (ou tout modèle VRM humanoïde) remplace tenue, visage et coiffure. Couleurs, proportions,
  accessoires et animations marchent dessus. Le fichier est gardé dans le navigateur (IndexedDB),
  la partie ne retient que son identifiant ; sur un autre appareil, le perso de base le remplace.
  Textures réduites à 2048 px pour garder les images par seconde.

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
| `src/game/postfx.ts` | Post-traitement HD-2D repris d'Arena Tactic : contours encrés, bloom, étalonnage, vignettage, netteté (sans flou) |
| `src/game/toon.ts` | Matériau cel shading (3 paliers nets + liseré de lumière) |
| `src/game/character.ts` | Perso glTF au squelette Mixamo, animations repos / marche / course |
| `src/game/ground.ts` | Sol d'herbe (texture peinte par programme) |
| `src/game/packs/assets.ts` | Chargement des packs de Quaternius (aliments), modèles mis à la taille |
| `src/game/room.ts` | La cuisine : carrelage, murs en coupe, porte, fenêtres, toit ; meubles rangés contre les murs |
| `src/game/kit.ts` | Le kit Tripo de la maison : enduit des murs, sol, toit, porte, fenêtre |
| `src/game/items/tripo.ts` | Meubles et objets de la maison faits avec Tripo : modèle, pièces mobiles posées sur leur charnière |
| `src/game/items/pieces.ts` | Fiches des meubles et objets du salon, de la chambre, de la salle de bain, de l'entrée et du garage |
| `src/game/motes.ts` | Poussières de lumière qui flottent (ambiance) |
| `src/App.tsx` | Interface React : map (créateur depuis le menu) |
| `src/creator/catalog.ts` | Liste des 12 persos de base (tenue, coiffure, genre) |
| `src/creator/vrm.ts` | Chargement des fichiers VRM (three-vrm), import d'un .vrm du joueur |
| `src/creator/imported.ts` | Persos VRoid importés, gardés dans le navigateur (IndexedDB) |
| `src/creator/avatar.ts` | Assemblage tenue + visage + coiffure de modèles différents, proportions, couleurs |
| `src/creator/retarget.ts` | Reciblage des animations Mixamo sur le squelette VRM |
| `src/creator/puppet.ts` | Perso animé (assemblage + animations + expressions + clignement), partagé créateur / jeu |
| `src/creator/recipe.ts` | La recette d'un perso, bornes des curseurs, palettes |
| `src/creator/Creator.tsx` | Écran du créateur |
| `src/game/items/catalog.ts` | Fiches des objets (portable, type de prise, point saisi) |
| `src/game/items/grips.ts` | Types de prise : pose du bras et des doigts, place de l'objet dans la main |
| `src/game/items/ik.ts` | Bras / jambe à deux os qui amène la main (le pied) sur un point |
| `src/game/items/carry.ts` | Prendre, tenir en marchant, reposer, piles d'objets |
| `src/game/items/cooking.ts` | Cuisson (cru, cuit, brûlé), fumée et vapeur |
| `src/game/nav.ts` | Contourner les meubles |
| `src/orders/ChatBar.tsx` | Zone de saisie parole / action |
| `src/orders/AiSettingsForm.tsx` | Réglages de l'IA (clé, modèle), dans le menu |
| `src/orders/missing.ts` | Journal des manques (ce que le perso n'a pas pu faire) |
| `src/orders/diagnose.ts` | Diagnostic des manques : cause probable d'un échec, situation du perso |
| `src/ui/MissingPanel.tsx` | Menu → Manques : liste regroupée, commentaire modifiable, copier, télécharger, vider |
| `src/ui/Menu.tsx` | Menu déroulant (raccourcis, IA, perso) : une `<MenuSection>` par réglage, ajoutée dans App.tsx |
| `src/orders/parser.ts` | Ordres simples compris sans IA |
| `src/orders/tasks.ts` | Un ordre (ranger les livres, café…) → suite d'actions de base |
| `src/orders/ai.ts` | Ordres libres : modèle de chat via OpenRouter |
| `src/orders/actions.ts` | Actions de base du perso, attente de la fin du geste |

## Les animations

« X Bot » de Mixamo (fourni dans les exemples de three.js) ne sert plus que de source
d'animations : `idle`, `walk`, `run`, `agree` (oui), `headShake` (non), `sad_pose`,
`sneak_pose`. Toute animation Mixamo ajoutée à ce fichier sera jouable par tous les persos.

## Les objets

Les meubles et appareils de la cuisine sont habillés par les modèles Tripo (`tripo.ts`) ; la
vaisselle et les ustensiles reviendront au prochain lot.

Chaque objet a une petite fiche dans `src/game/items/catalog.ts`, pas d'animation à lui :

```ts
{ id: 'tasse', name: 'tasse', portable: true, grip: 'fist', gripPoint: [0, 0.055, 0.062], build: () => ... }
```

- `portable` : peut-on le prendre en main.
- `grip` : type de prise, parmi `pinch` (entre les doigts : clé, lettre), `fist` (en poing :
  tasse, épée), `side` (le long du corps : sac, seau), `chest` (contre la poitrine : livre), `stack` (pile à plat, à deux mains), `twoHands` (à deux mains : caisse).
  Sans `grip`, la prise est devinée d'après la taille de l'objet (c'est le cas de la lettre).
- `gripPoint` : le point de l'objet que la main saisit (sinon son centre).

La pose vient du type de prise : les bras sont placés par calcul vers la main voulue (bras à
deux os), les doigts se referment, et l'objet suit l'os de la main. Pour ramasser, le perso se
penche ou s'accroupit selon la hauteur de l'objet. Les jambes gardent l'animation de marche.
Les objets posés sur celui qu'on soulève (une tasse sur la caisse) partent avec lui.

Fiche d'un livre : `stack: 'livre'` (s'empile avec les autres livres), `layFlat: true` (se pose
couché). Un meuble de rangement donne ses places (`slots`), où les objets se rangent debout.

Machine à café : tasse en main, clic sur la machine. Le perso pose la tasse sous le bec, le café
coule, puis il reprend la tasse pleine (« tasse de café »). Fiches : `pour` pour la machine (où
poser le récipient, ce qu'elle remplit, durée), `fill` pour la tasse (hauteur du liquide vide /
pleine ; la tasse commence vide).

Un objet par main : on peut tenir une tasse dans une main et un livre dans l'autre. Une caisse,
une pile de livres ou un livre ouvert prennent les deux mains. E repose le dernier objet pris.

Lire : livre en main (l'autre main libre), bouton « Lire » ou touche L. Le perso ouvre le livre
devant lui à deux mains et penche la tête ; L de nouveau pour le refermer. Prendre ou poser
quelque chose referme le livre d'abord.

Lancer : objet petit ou moyen tenu d'une main (tasse, livre, lettre), bouton « Lancer » ou
touche T. Le bras part en arrière puis fouette (de la main droite, tout le corps accompagne le
geste), l'objet vole en tournant. Au premier choc il peut
se briser selon sa fragilité (fiche `fragility`, de 1 très fragile à 10 incassable ; tasse 2,
livre 8, lettre 10) et la force du choc : il disparaît en éclats de ses couleurs, et une tasse
pleine laisse une flaque. Sinon il rebondit et se pose (un livre à plat).

Sauter, grimper (`src/game/mouvements.ts`, clips de Quaternius) : Espace ou « Sauter » au
clic droit sur le perso pour sauter (un demi-mètre : on peut retomber sur un meuble bas).
« Grimper dessus » au clic droit sur un meuble de 35 cm à 1,25 m (table, plan de travail) : le
perso s'y hisse, s'y promène, et retombe en passant le bord.

Déplacer un gros meuble (fiche `movable` : table, bibliothèque, machine à café) : mains vides,
clic droit sur le meuble, « Déplacer » (un simple clic ne le prend plus). Le perso se place contre le côté le plus proche et pose les mains dessus ;
Z Q S D le poussent ou le tirent (ce qui est posé ou rangé dedans suit), il bute sur les autres
meubles. R et F le font pivoter sur lui-même (R vers la droite, F vers la gauche) : le perso
tourne autour en gardant les mains dessus, et ce qui est posé dessus ou rangé dedans tourne avec.
Il bute aussi sur les autres meubles en pivotant. Console : `game.turnMoving(90)` (degrés, négatif
vers la gauche). E le lâche.

Durabilité : chaque objet a une jauge (fiche `durability`, en points : tasse 40, lettre 30,
livre 100, caisse 150, machine 250, évier 300, table 300, bibliothèque 400). Elle baisse à l'usage (prendre
l'objet, boire, lire, faire un café, pousser un meuble) et sur les chocs. Grades : neuf, bon état,
usé, abîmé, très abîmé ; plus elle baisse, plus l'objet paraît usé (couleurs ternies, taches,
rayures, bords sombres : `src/game/items/durability.ts`). Un objet usé casse plus facilement
quand on le lance. À zéro il se brise, là où il est ou dans la main (une tasse blesse un peu) ;
ce qui était posé dessus tombe. La souris sur un objet montre son grade et sa jauge. Au départ,
la table, la caisse et deux livres sont déjà usés.

Boire : tasse de café en main, bouton « Boire » ou touche B. Le perso porte la tasse à la bouche,
l'incline et boit une gorgée ; le niveau baisse (environ trois gorgées). Vide, elle se remplit
de nouveau à la machine.

Évier (sous la fenêtre du fond, entre le lave-vaisselle et le plan de travail ; fixe, il ne se déplace pas) :
- tasse en main, clic sur l'évier : le perso pose la tasse au fond de la cuve sous le robinet,
  l'eau coule, il la reprend pleine (« tasse d'eau »). Ce qu'elle contenait (café) est vidé dans
  l'évier. Boire de l'eau fait baisser la soif comme le café, sans réveiller.
- mains vides, clic sur l'évier : il se lave les mains (eau qui coule, mains frottées, hygiène +12).
- toilette (ordre « lave-toi » ou « fais ta toilette ») : trois fois de l'eau des mains au visage,
  hygiène +40.
- Ordres : « remplis la tasse d'eau », « bois de l'eau », « lave-toi les mains », « va au lavabo ».
  Console : `game.fillWater()`, `game.washHands()`, `game.wash()`.
- Fiche : `pour` (comme la machine, liquide `eau`, `drain` : on peut y vider la tasse) et `wash`
  (où vont les mains). Ce qui manque encore (ouvrir le robinet, boire au robinet, vaisselle,
  douche) est noté dans Menu → Manques.

Plan de travail (à côté de l'évier, dans son alignement ; il se déplace comme la table) : une
planche à découper, un couteau et un pain posés dessus. Le frigo a aussi une tomate, une carotte
et un concombre.
- un aliment entier en main (pomme, pain, carotte, tomate, concombre), clic sur la planche (ou
  sur le meuble qui la porte), bouton « Couper » ou touche K : le perso pose l'aliment sur la
  planche, prend le couteau, coupe (la lame monte et descend au-dessus de l'aliment), puis repose
  le couteau à sa place. L'aliment devient ses morceaux, restés sur la planche : quartiers de
  pomme, tranches de pain, rondelles de carotte, tranches de tomate, rondelles de concombre. Ils
  se mangent comme l'aliment entier (même faim rendue) et se rangent au frigo.
- un aliment entamé ne se coupe plus ; la planche doit être posée en hauteur (plan de travail,
  table). Couper use un peu le couteau et la planche.
- Ordres : « coupe la pomme », « tranche le pain », « coupe une tomate », « mange les tranches de
  tomate ». Console : `game.cut()` (ou `game.cut('pomme')` pour l'aliment tenu de ce nom).
- Fiches : `cut` (l'id des morceaux que devient l'aliment), `board` (planche), `knife` (couteau).
  Ce qui manque encore (éplucher, cuire, servir dans une assiette) est noté dans Menu → Manques.

Gazinière (après le plan de travail, dans l'alignement de l'évier ; fixe, raccordée au gaz) : quatre feux, une poêle et une
casserole posées dessus au départ ; steaks et pommes de terre crus dans le frigo.
- poêle ou casserole en main, clic sur la gazinière : le perso la pose sur un feu libre (ceux de
  devant d'abord), le manche vers lui.
- ingrédient en main, clic sur l'ustensile (ou sur la gazinière) : il le met dedans. Le steak va
  dans la poêle, la pomme de terre dans la casserole ; deux par ustensile.
- clic sur un bouton de la façade : allume ou éteint ce feu ; clic sur la gazinière mains vides :
  allume les feux où un ustensile garni est posé, ou éteint tout. Les flammes bleues grandissent
  le temps que le feu prenne.
- sur le feu, l'ingrédient passe de cru à cuit (il change de couleur), puis, oublié, il fume et
  brûle (« Ça sent le brûlé : retire le steak du feu ! »). Cru, ça ne se mange pas ; brûlé, ça
  nourrit à peine. La casserole se remplit d'eau à l'évier (clic sur l'évier, casserole en main) :
  dans l'eau qui bout (vapeur), ça cuit sans brûler, mais l'eau s'évapore peu à peu.
- Ordres : « fais cuire le steak », « cuis les pommes de terre », « mets la poêle sur le feu »,
  « mets le steak dans la poêle », « allume la gazinière », « éteins le feu », « mange la pomme de
  terre » (cuite d'abord si besoin). Console : `game.switchOn()`, `game.switchOff()`,
  `game.putOnFire()`, `game.putInPan('poele')`.
- La machine à café marche de la même façon : son bouton rouge l'allume (voyant orange), elle
  chauffe quelques secondes avant que le café coule, et se met en veille si on l'oublie. Un café
  demandé machine éteinte l'allume d'abord.
- Fiches : `heat` pour les appareils (feux, pièce allumée, temps pour chauffer), `cookware` pour
  les ustensiles (ce qu'ils reçoivent, où), `cook` pour les ingrédients (temps de cuisson, couleurs
  cru / cuit / brûlé) ; la mécanique est dans `src/game/items/cooking.ts`. Ce qui manque encore
  (geste pour tourner le bouton, four, recettes, égoutter, retourner le steak) est noté dans
  Menu → Manques.

Cuisine (`src/game/items/kitchen.ts`), alignée de l'autre côté de la machine à café : placard
(le micro-ondes posé dessus), four, lave-vaisselle, meuble à tiroir et poubelle. Leurs dessus font
plan de travail (on y pose ce qu'on tient).
- Clic sur une porte (ou le tiroir, ou le couvercle de la poubelle) mains vides : elle s'ouvre ;
  un deuxième clic la ferme. Objet en main, clic sur le meuble : le perso ouvre et range (placard :
  tasse, assiette, bouteille, pomme ; tiroir : couverts, lettre ; four et micro-ondes : steak, pomme de terre, pain, sandwich ;
  lave-vaisselle : tasse, assiette, couverts). Ce qui est dans le tiroir sort et rentre avec lui.
- Four, micro-ondes, lave-vaisselle : clic sur le côté (pas la porte) mains vides, le perso ferme
  la porte et le met en marche (la lumière s'allume) ; il sonne à la fin. Le four cuit d'un cran ce
  qu'il contient (steak, pomme de terre : la même cuisson que sur la gazinière, cru → cuit, une
  deuxième fois brûlé), le micro-ondes cuit sans jamais brûler, le lave-vaisselle rend la vaisselle propre. Ouvrir la porte
  l'arrête.
- Vaisselle sale : la machine à café refuse une tasse sale (il faut la laver à l'évier d'abord) ; le
  lave-vaisselle lave tasse, assiette et couverts d'un coup.
- Grille-pain (posé sur le lave-vaisselle) : tranches de pain en main, clic dessus, elles vont dans
  la fente ; mains vides, clic : le levier descend et elles ressortent en pain grillé (plus
  nourrissant). « grille le pain », « fais griller les tartines ». Fiche : `heats.turns`.
- Mixeur (posé sur le four) : un fruit en main (pomme, quartiers de pomme), clic dessus, il va dans le
  bol ; mains vides, clic : il mixe, et le bol se remplit de jus de fruits, une tasse par fruit.
  Tasse en main, clic : le jus coule dans la tasse. Il désaltère et nourrit un peu. « fais-toi un
  jus de pomme », « mixe la pomme », « bois un jus ». Fiche : `blends` (avec `pour`) ; les fruits
  qui se mixent sont dans `FRUITS` (`kitchen.ts`).
- Bouilloire (posée sur le tiroir) : comme la machine à café, tasse en main, clic dessus ; son
  bouton rouge l'allume, l'eau chauffe, puis le thé coule dans la tasse posée sous le bec. Le thé
  désaltère comme le café et réveille moitié moins. « fais-toi un thé », « bois un thé ».
- Poubelle : objet en main, clic dessus : le couvercle se lève, l'objet y tombe et disparaît. Elle
  tient 8 objets ; pas vide, un clic sur le côté mains vides sort le sac.
- Ordres : « cuis le steak au four », « réchauffe le sandwich », « allume le four », « éteins le four »,
  « ouvre le tiroir », « range la tasse », « range la lettre », « mets la pomme au four »,
  « jette la bouteille », « vide la poubelle », « fais la vaisselle au lave-vaisselle ».
  Console : `game.startAppliance('four')`, `game.stopAppliance()`, `game.throwAway()`,
  `game.emptyBin()`, `game.store('placard')`, `game.openDoor('tiroir')`.
- Fiches : `door` + `doorAxis: 'x'` (porte qui s'abaisse, ou couvercle avec un angle négatif),
  `drawer` (tiroir qui glisse), `heats` (cuisson), `washes` (lavage), `bin` (poubelle), `cold` (frigo).

Les meubles (objets non portables) sont des rectangles au sol que le perso contourne
(`src/game/nav.ts`) : il glisse le long au clavier, et un clic de l'autre côté passe par leurs coins.

Depuis la console (et plus tard pour l'IA de RP) : `game.pickUp('tasse')`, `game.drop()` (ou
`game.drop('livre')` pour poser cet objet-là), `game.read()`, `game.stopReading()`, `game.heldNames`,
`game.store()` (ranger les livres tenus), `game.makeCoffee()`, `game.drink()`, `game.throwItem()` (ou `game.throwItem('tasse')`),
`game.conditionOf('tasse')` / `game.setCondition('tasse', 0.3)` (durabilité, 0 à 1),
`game.grab('table')` / `game.release()`, `game.itemNames`.
