# Notes du projet Rp Island

Cette note sert à reprendre le projet depuis un autre compte Claude, sans l'historique des
conversations. Elle résume l'objectif, les décisions prises, ce qui est fait, ce qui reste en
suspens et la façon de travailler. Le détail de chaque fonctionnalité et de chaque fichier est dans
le [README](README.md) ; cette note dit **pourquoi** et **où on en est**.

État au 7 octobre 2026 (après la PR #9).

## L'utilisateur

- Pseudo : Plaisirs (compte GitHub `lyarca33-hue`).
- Toujours répondre **en français**, avec des **explications simples** (pas de jargon inutile).
- Il teste le jeu sur son Mac et valide chaque fonctionnalité lui-même.

## L'objectif

Un jeu / monde centré sur le **RP** (jeu de rôle), où les personnages sont joués par une IA. Deux
inspirations :

- **Lumen** : son propre moteur de RP par IA (Next.js). Sa logique d'IA pourra être réutilisée plus
  tard comme service séparé, pour jouer les persos (répliques + actions).
- **Arena Tactic** (dépôt `Junkz3/arena-tactical`, projet de son frère) : jeu navigateur en
  Three.js, client React + Vite, rendu « HD-2D » dans `client/src/render/hd2d`. Le rendu de
  Rp Island en est repris.

L'idée de fond : l'IA renvoie des **intentions** (émotion, geste, destination, objet visé) que le
jeu traduit en éléments d'un **catalogue réutilisable** : des objets avec leurs actions (façon
Les Sims), un squelette humanoïde partagé par tous les persos, des expressions du visage.

## Décisions prises (à ne pas remettre en cause sans lui demander)

| Sujet | Décision |
| --- | --- |
| Plateforme | Navigateur web, Three.js, React + Vite, TypeScript. |
| Rendu | Persos **3D en cel shading** dans des décors **HD-2D** repris d'Arena Tactic (caméra iso orthographique 30° / 45°, lumière, contours, bloom, étalonnage, flou de profondeur). **Pas de sprites 2D.** |
| Déplacements | 3D avec déplacements libres (clic ou ZQSD). |
| Style des persos | **Anime**, modèles **VRoid / VRM** lus par `@pixiv/three-vrm`. **MakeHuman a été rejeté** (il l'a trouvé moche). |
| Animations | Animations « faites maison » **rejetées** : il veut des animations issues d'une **bibliothèque libre de droits**. |
| Décider des actions | **Jev** (modèle de décision OpenRouter) **abandonné**. À la place : un analyseur d'ordres simples **sans IA**, et un **modèle de chat** (OpenRouter en local) pour les ordres libres. |
| Clés d'API | Jamais dans le code, une PR, une note ou un aperçu. La clé OpenRouter se met dans le menu du jeu (gardée dans le navigateur) ou dans `.env.local`. |

## Ce qui est fait (branche `main`)

| PR | Fonctionnalité | Où est le code |
| --- | --- | --- |
| — | Prototype : sol d'herbe, perso cel shading, caméra et post-traitement HD-2D d'Arena Tactic | `src/game/Game.ts`, `postfx.ts`, `toon.ts`, `ground.ts`, `motes.ts` |
| #1 (en partie) | Créateur de persos style anime : 12 modèles VRoid officiels, tenue / visage / coiffure mélangeables, couleurs, proportions, expressions, export/import JSON | `src/creator/` |
| #2 | Prendre des objets en main (un par main), types de prise, piles de livres, bibliothèque, machine à café, boire, lire, contournement des meubles | `src/game/items/`, `src/game/nav.ts` |
| #3 | Zone de saisie en bas (💬 Parole / ✋ Action), ordres au perso, menu déroulant (☰ ou Échap) | `src/orders/`, `src/ui/Menu.tsx` |
| #4 | Cycle jour/nuit (temps ×4, réglage de l'heure dans le menu) et besoins : fatigue, faim, soif, hygiène | `src/game/clock.ts`, `src/game/needs.ts`, `src/ui/TimeHud.tsx` |
| #5 | Barre de santé (baisse quand un besoin reste à zéro, remonte quand tout va bien) | `src/game/needs.ts` |
| #6 | Journal des « Manques » : ce que le perso n'a pas pu faire (Menu → Manques) | `src/orders/missing.ts`, `src/ui/MissingPanel.tsx` |
| #7 | Lancer un objet (casse selon sa fragilité, de 1 à 10) et pousser / tirer les gros meubles | `src/game/items/breakage.ts`, `carry.ts` |
| #8 | Coiffure prise sur un autre modèle : plus de crâne couleur peau qui dépasse | `src/creator/avatar.ts` |
| #9 | Durabilité des objets : jauge, grades (neuf → très abîmé), usure visible, casse à zéro | `src/game/items/durability.ts` |

Points techniques utiles :

- Les animations viennent d'**X Bot** (Mixamo, `public/models/xbot.glb`) et sont **reciblées** sur
  le squelette VRM de chaque perso (`src/creator/retarget.ts`).
- Un perso est une **recette** (`src/creator/recipe.ts`) : c'est ce qu'une IA pourra écrire pour
  créer des PNJ.
- Les modèles VRM (`public/vrm/`) sont produits par `tools/build_vrm_assets.py` à partir du dépôt
  public `madjin/vrm-samples` (voir `tools/README.md` et `CREDITS.md` pour les licences).
- Ajouter une action pour l'IA : `src/orders/actions.ts` + une tâche dans `tasks.ts` + un verbe dans
  `parser.ts` + une ligne dans le prompt système de `ai.ts`.
- Ajouter un objet : une fiche dans `src/game/items/catalog.ts` (pas d'animation par objet).
- Le jeu s'expose dans la console sous `game` (`game.pickUp('tasse')`, `game.needs.set('faim', 10)`,
  etc. ; liste complète dans le README). C'est aussi l'API que l'IA de RP utilisera.

## Ce qui reste en suspens

- **Pose de repos des bras** : il n'aime pas la position des bras du perso au repos. Les 2 derniers
  commits de la **PR #1** (branche `claude/project-thread-naeb1b`, encore ouverte) font un essai
  comparatif dans le créateur : Repos A (X Bot), B (pixiv ChatVRM, MIT), C et D (Quaternius
  « Universal Animation Library », CC0). Il doit choisir ; rien de cela n'est dans `main`. La PR #1
  contient le reste du créateur, déjà fusionné dans `main` ; ne fusionner que l'essai qu'il valide.
  Sources libres trouvées : bibliothèque Quaternius complète sur
  `github.com/adharshsivan/animationlibrary`. La bibliothèque d'animations de Ready Player Me est à
  éviter (licence réservée à leurs avatars).
- Brancher plus tard l'**IA de Lumen** à la place de `src/orders/ai.ts`, pour jouer les persos.
- Actions qui remonteront les besoins (manger, dormir, se laver) : à faire, avec
  `game.needs.restore(...)`.

## Limites connues

- Visage seulement du même genre que la tenue ; pas de curseurs de forme du visage ; vêtements non
  teintables.
- Collisions seulement avec les meubles (pas avec la caisse).
- Depuis un conteneur Claude dans le cloud, `openrouter.ai` est bloqué : les ordres libres ne
  peuvent y être testés qu'en local sur son Mac. Dans les aperçus publiés sur claude.ai, ils passent
  par Claude à la place (capacité « sample » de la page).
- Les sites de ressources (itch.io, opengameart, quaternius.com) étaient bloqués par le réseau du
  conteneur ; seul GitHub était joignable pour récupérer des fichiers libres.

## Façon de travailler

- **Une demande = une nouvelle branche depuis `main` + sa propre PR** sur `lyarca33-hue/Island`.
- Il teste, puis **valide en disant « fusionne »** dans la discussion : alors seulement la PR est
  fusionnée dans `main`.
- Si une correction touche une PR sur laquelle d'autres branches s'appuient, la fusionner (merge,
  pas rebase) dans les branches au-dessus.
- Ne supprimer aucune branche sans qu'il le demande.
- Textes, commits et descriptions de PR en français.

### Sa copie locale

- Sur son Mac : `~/rp-island` (`/Users/gregorychapellier/rp-island`), qui suit `main`.
- **« Mets à jour mon local »** : dans ce dossier, `git checkout main && git pull && npm install`.
  Cela a marché via une session Remote Control sur son Mac (en précisant bien de travailler dans
  `/Users/gregorychapellier/rp-island`, pas dans le dossier de Lumen). L'accès aux dossiers sans
  Remote Control ne joignait pas GitHub.
- Ensuite il relance le jeu lui-même : Ctrl+C, puis `cd ~/rp-island && npm run dev`, et ouvrir
  http://localhost:5173.

## Aperçus en ligne

Des versions jouables avaient été publiées sur claude.ai depuis l'ancien compte (privées, donc
probablement pas visibles depuis un autre compte) :

- prototype et créateur : https://claude.ai/artifact/KVdHKHYAvj5XuWitFuzFwU
- objets en main (version la plus récente, avec la durabilité) : https://claude.ai/artifact/MrWiMVaMZoe7XMsrMdeR7a
- ordres au perso : https://claude.ai/artifact/Msan2B2KCFU6gy8tVfHGhC

Pour en republier une : `npx vite build --base ./`, puis tout mettre dans une seule page. Les
aperçus ne servent pas les `.vrm` ni les `.glb` : ils avaient été renommés en `.vrm.wasm` /
`.glb.wasm`. Il faut autoriser la capacité « sample » pour que les ordres libres passent par Claude.
