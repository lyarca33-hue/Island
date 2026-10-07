# Ajouter un objet au jeu

Procédure à suivre **avant et pendant** chaque ajout d'objet dans Rp Island. Elle sert surtout à
Claude : on la relit en entier avant de commencer, on la suit étape par étape, et on la complète
à la fin (section [Leçons](#leçons)) avec ce que l'utilisateur a corrigé.

Principe du jeu : **pas d'animation par objet**. Un objet est une petite fiche dans
`src/game/items/catalog.ts` ; la pose des bras vient de son type de prise (`grips.ts`), les
gestes (boire, lire, lancer, pousser) sont communs à tous les objets qui ont le bon champ.

---

## 1. La boucle d'un ajout

1. **Fiche** : à partir de la description de l'utilisateur (« une théière en porcelaine »),
   répondre aux [questions](#2-les-questions-à-se-poser), puis écrire la fiche.
2. **Test** : lancer le jeu, prendre des captures, essayer chaque action de l'objet
   ([vérification en jeu](#6-vérification-en-jeu)).
3. **Vérification** : passer la [checklist](#7-checklist-avant-de-montrer) et corriger ce qui
   cloche **avant** de montrer quoi que ce soit.
4. **Apprentissage** : chaque correction de l'utilisateur devient une ligne dans
   [Leçons](#leçons), dans la même PR que le correctif.

Le journal des **Manques** (Menu → Manques, `src/orders/missing.ts`) s'y branche : ce que le
perso n'a pas pu faire avec un objet (action inconnue, geste refusé, ordre non compris) est
noté et compté. Avant d'ajouter un objet, regarder s'il y a des manques qui le concernent ; après,
vérifier qu'un ordre sur l'objet n'en crée pas de nouveau.

Côté dépôt : chaque ajout = une nouvelle branche partie de `main` à jour + sa propre PR.
L'utilisateur l'essaie puis dit « fusionne » dans le fil.

---

## 2. Les questions à se poser

Répondre à chacune, par écrit dans la PR, avant d'écrire du code.

**Porter**
- Se porte-t-il ? (`portable`) Un meuble non portable bloque le passage : le perso le contourne.
- Une main ou deux ? Un objet à deux mains ne se lance pas et occupe les deux mains.
- Quelle prise ? Comment une vraie personne le tient-elle **naturellement** (par l'anse ? contre
  soi ? par en dessous ?). C'est la question où l'utilisateur corrige le plus souvent.
- Par quel point la main le saisit-elle ? (`gripPoint` ; sinon le centre de l'objet)
- Se pose-t-il debout ou couché ? (`layFlat`)
- S'empile-t-il avec d'autres de sa sorte ? (`stack`)

**Agir**
- Quelles actions propose-t-il ? Boire (`fill`), lire (`buildOpen`), remplir un récipient
  (`pour`), ranger dedans (`slots`), pousser (`movable`), lancer (automatique si portable à une
  main).
- Une action dont le jeu n'a pas encore le geste (s'asseoir, manger, ouvrir…) ? C'est un nouveau
  geste, pas une fiche : le dire à l'utilisateur, et ne pas le bricoler dans la fiche.
- Les ordres texte doivent-ils le comprendre ? Sous quels autres noms (synonymes) ?

**Résister**
- Fragilité de 1 (casse presque à coup sûr si on le lance) à 10 (ne casse jamais) ?
- Durabilité (points d'usure avant de casser) ?
- Qu'est-ce qui l'use ? Peut-il blesser en cassant dans la main (fragilité ≤ 4 : santé −3) ?
- S'il contient un liquide, il fait une flaque en cassant ou en tombant.

**Monde**
- Où le placer au départ (`START_ITEMS` dans `Game.ts`) ? Sur la table, au sol, dans un meuble ?
- Ce qui est posé dessus doit-il le suivre quand on le soulève ou le pousse ? (c'est le cas
  par défaut)
- Son nom est-il féminin ? (accord des messages : « La théière s'est brisée »)

---

## 3. Les champs de la fiche (`ItemDef`)

Fichier : `src/game/items/catalog.ts`. Repère de l'objet : posé au sol, base à y = 0, haut vers
+Y, avant vers +Z, en mètres.

| Champ | Rôle | Défaut |
|---|---|---|
| `id` | Repère unique (`tasse`, `machine-a-cafe`). Sert aux ordres : `tasse`, `tasse-2`… | obligatoire |
| `name` | Nom affiché et compris par l'IA (« machine à café »). | obligatoire |
| `portable` | Peut être pris en main. | obligatoire |
| `grip` | Type de prise (voir § 4). | deviné d'après la taille |
| `gripPoint` | Point saisi, repère de l'objet. À deux mains : centre de la prise. | centre de l'objet |
| `fragility` | 1 à 10, chance de casser quand on le lance. | 5 |
| `durability` | Points d'usure avant de casser. | 100 |
| `movable` | Gros meuble que le perso agrippe (mains vides) et pousse au clavier, E pour lâcher. | non |
| `stack` | Sorte d'objets qui s'empilent (jusqu'à 6, prise `stack`). | non |
| `layFlat` | Se pose couché (sauf rangé dans un meuble). | non |
| `slots` | Meuble de rangement : places où poser un objet debout (repère du meuble, base de l'objet). | non |
| `buildOpen` | Se lit : modèle ouvert montré pendant la lecture (pages vers +Z). | non |
| `fill` | Récipient : hauteur du liquide vide → plein. Il lui faut une pièce nommée `liquide`. | non |
| `pour` | Machine qui remplit un récipient : `at` (où poser le récipient), `fills` (noms des récipients, le premier est celui qu'on cite), `liquid`, `seconds`. Pièce `jet` cachée au repos. | non |
| `heat` | Appareil qui chauffe (gazinière, machine à café) : `spots` (feux où poser un ustensile), `lit` (pièces `${lit}-N` montrées allumées), `warmup` (s pour chauffer), `autoOff` (veille). Un clic sur la pièce `bouton-N` allume ou éteint le feu N. | non |
| `cookware` | Ustensile qui va sur le feu : `holds` (noms des ingrédients qu'il reçoit), `places` (où les poser dedans). Avec `fill`, il se remplit d'eau à l'évier (casserole). | non |
| `cook` | Ingrédient qui cuit : `seconds` pour être cuit, `burn` de plus pour brûler, couleurs cru / cuit / brûlé des pièces nommées `cuit` (`cooking.ts`). | non |
| `door` | Porte qui s'ouvre (pièce `porte`) : angle (rad) autour de sa charnière. | non |
| `doorAxis` | `'x'` : charnière en bas, la porte s'abaisse (four) ; angle négatif : couvercle qui se relève. | `'y'` |
| `drawer` | Tiroir : la pièce `porte` glisse vers l'avant de cette distance (m), avec ce qui est rangé dedans. | non |
| `holds` | Noms des objets qu'on peut ranger dans le meuble. | les livres |
| `cold` | Frigo (sorte `frigo` pour les ordres). | non |
| `heats` | Four, micro-ondes : cuit ce qu'on y range (`seconds`, `burns`) ; pièce `lumiere` allumée en marche. | non |
| `washes` | Lave-vaisselle : la vaisselle rangée dedans ressort propre. | non |
| `bin` | Poubelle : nombre d'objets jetés avant qu'il faille la vider ; pièce `dechets`. | non |
| `food` | Aliment : `hunger` (faim rendue pour l'objet entier), `bites` (bouchées), `color` (la bouchée sur la fourchette). | non |
| `dish` | Vaisselle : se salit à l'usage (pièce `sale`, cachée quand propre), se lave à l'évier. | non |
| `plate` | Assiette : hauteur du fond où l'on sert un aliment. | non |
| `utensil` | Couvert pour manger dans l'assiette (fourchette) : pièce `bouchee`, point `mouth` au bout. | non |
| `wash.dishes` | Évier : places au fond de la cuve où poser la vaisselle à laver (une par main). | non |
| `build()` | Construit le modèle 3D. | obligatoire |

Pour construire le modèle, utiliser les aides `mesh()` et `group()` du fichier : elles donnent un
matériau toon par pièce et les ombres.

**Autres endroits à toucher** selon l'objet :
- `src/game/Game.ts` : `START_ITEMS` (placement), `FEMININE` (nom féminin), `START_WEAR`
  (usure de départ, pour montrer les grades).
- `src/orders/parser.ts` : `ALIASES` (synonymes, clé = nom sans accents, en minuscules).
- Nouvelle action : `src/orders/actions.ts` (tâche), `parser.ts` (`VERBS`), le prompt de
  `src/orders/ai.ts`, une méthode publique dans `Game.ts`, `HandActions` + bouton + touche dans
  `App.tsx`, et la liste des raccourcis du menu.
- Nouvelle recette (un plat fait d'ingrédients réunis sur la planche ou dans l'assiette) :
  une entrée dans `RECIPES` et la fiche du plat dans `DISHES` (`src/game/items/recipes.ts`), ses
  mots dans `words` (ordres tapés), son id dans la tâche `preparer` du prompt de `ai.ts`, et le
  nom féminin dans `DISH_FEMININE`. Les ingrédients doivent déjà se couper ou se cuire.
- Nouvelle « sorte » (comme `rangement`, `machine`, `récipient`) : `WorldObject.sorte` dans
  `Game.describe()`, sinon l'IA ne sait pas à quoi sert l'objet.

---

## 4. Les types de prise (`grips.ts`)

| Prise | Mains | Pour | Exemple |
|---|---|---|---|
| `pinch` | 1 | Petit et fin, entre pouce et index, montré devant soi | lettre, clé, téléphone |
| `fist` | 1 | En poing ; le côté +Z de l'objet (l'anse) reste dans le poing | tasse, bouteille, épée |
| `side` | 1 | Le long du corps, bras tendu | sac, seau |
| `chest` | 1 | Contre la poitrine, paume à plat dessus ; à gauche, reste côté gauche | livre, cahier, dossier |
| `twoHands` | 2 | Devant soi, mains sur les côtés | caisse, panier |
| `stack` | 2 | Pile à plat, par en dessous (automatique avec `stack`) | pile de livres |
| `read` | 2 | Livre ouvert vers le visage (automatique avec `buildOpen`) | lecture |
| `push` | 2 | Mains à plat contre un meuble (automatique avec `movable`) | table, bibliothèque |

Prise devinée quand la fiche n'en donne pas (`guessGrip`, d'après la taille triée
petit / moyen / grand) :
- grand > 0,45 m ou petit > 0,2 m → `twoHands` ;
- grand < 0,16 m et petit < 0,03 m → `pinch` ;
- grand > 0,22 m et petit < 0,08 m → `side` ;
- sinon → `fist`.

Mieux vaut **toujours écrire la prise** dans la fiche : la devinette a déjà donné « livre le long
du corps », que l'utilisateur a trouvé pas naturel.

Une nouvelle façon de tenir = une nouvelle entrée dans `GRIPS` (main droite, repère du buste,
longueurs de bras depuis l'épaule ; la gauche est le miroir), puis vérifier en captures de face et
de profil, des deux mains.

---

## 5. Valeurs de référence

### Les objets existants

| Objet | Prise | Fragilité | Durabilité | Particularités |
|---|---|---|---|---|
| tasse | `fist` par l'anse | 2 | 40 | `fill` (vide au départ), se remplit à la machine, se boit |
| lettre | devinée → `pinch` | 10 | 30 | |
| livre (×5 couleurs) | `chest` | 8 | 100 | `stack`, `layFlat`, `buildOpen` (se lit) |
| caisse | `twoHands` | 5 | 150 | ce qui est posé dessus la suit |
| machine à café | non portable | — | 250 | `movable`, `pour` (remplit la tasse de café en 2,6 s) |
| table | non portable | — | 300 | `movable`, hauteur du plateau `TABLE_H` = 0,74 m |
| bibliothèque | non portable | — | 400 | `movable`, `slots` (3 rayons × 20 livres serrés) |
| gazinière | non portable | 8 | 300 | fixe, `heat` (4 feux, boutons en façade) |
| poêle | `fist` par le manche | 10 | 200 | `cookware` (steak) |
| casserole | `fist` par le manche | 9 | 180 | `cookware` (pomme de terre), `fill` (eau de l'évier, s'évapore sur le feu) |
| steak, pomme de terre | `fist` | 10, 9 | 20 | `food`, `cook` (cru → cuit → brûlé) |

Repères pour un nouvel objet : verre / porcelaine 1-3 ; bois léger, carton 4-6 ; livre, métal
8-9 ; papier, tissu 10. Durabilité : petit objet du quotidien 30-60, objet solide 100-150, meuble
250-400.

### Ce qui use un objet (constantes de `Game.ts`)

| Usage | Points retirés |
|---|---|
| Le prendre (`WEAR_GRAB`) | 0,3 |
| Boire (`WEAR_DRINK`) | 6 par tasse pleine bue |
| Lire (`WEAR_READ`) | 0,15 par seconde |
| Pousser un meuble (`WEAR_PUSH`) | 2 par mètre |
| Faire un café (`WEAR_BREW`) | machine 1,5, tasse 0,5 |
| Choc d'un objet lancé | vitesse × (11 − fragilité) × 0,6 |

Un objet usé casse plus facilement quand on le lance : sa fragilité compte pour
fragilité × (0,4 + 0,6 × état). La chance de casser au premier choc est `breakChance()` dans
`breakage.ts`.

Grades d'usure (`durability.ts`) : neuf ≥ 90 %, bon état ≥ 65 %, usé ≥ 40 %, abîmé ≥ 15 %,
très abîmé en dessous ; à 0 l'objet se brise (dans la main : le bras retombe).

---

## 6. Vérification en jeu

### Lancer le jeu
```bash
npm install
npm run typecheck      # doit passer sans erreur
npm run dev            # http://localhost:5173
```

### Captures (Chromium + Playwright, dans le conteneur)
Chromium est déjà installé (`/opt/pw-browsers`, ne pas lancer `playwright install`). Le jeu
s'ouvre sur le créateur : cliquer « Jouer → » pour avoir un perso qui peut porter (le perso par
défaut ne porte rien). Ensuite, tout se pilote depuis la console via `window.game` :

| Commande | Effet |
|---|---|
| `game.describe()` | État de la pièce : chaque objet, `ou`, `sorte`, `etat`, mains |
| `game.use('ref')` | Comme un clic sur l'objet (prendre, ranger, agripper, remplir) |
| `game.pickUp('nom')` / `game.drop('nom')` | Prendre / poser |
| `game.throwItem()` | Lancer l'objet tenu |
| `game.grab('ref')` / `game.release()` | Agripper / lâcher un meuble |
| `game.drink()`, `game.makeCoffee()`, `game.read()`, `game.stopReading()` | Gestes |
| `game.setCondition('ref', 0.3)` | Fixer l'usure (0 le brise) |
| `game.rotateCamera(1)` | Tourner d'un quart de tour (captures sous plusieurs angles) |
| `game.idle` | Vrai quand plus rien ne bouge : attendre ça avant chaque capture |

Si l'écran est noir en mode sans écran, lancer Chromium avec WebGL logiciel
(`--use-angle=swiftshader` ou `--enable-unsafe-swiftshader`).

### À essayer, pour chaque objet
- [ ] Il apparaît à sa place de départ, posé (ni enfoncé ni en l'air), sous plusieurs angles.
- [ ] Le prendre : depuis le sol (le perso s'accroupit) et depuis la table.
- [ ] Tenu : capture **de face et de profil**, main droite **et** main gauche (avec un autre
  objet dans l'autre main). Les doigts touchent l'objet, il ne traverse ni la main ni le corps.
- [ ] Marcher avec : il suit la main.
- [ ] Le poser (E) : au sol et sur la table, dans le bon sens (debout ou couché).
- [ ] Chacune de ses actions (boire, lire, remplir, ranger, pousser, empiler…).
- [ ] Le lancer plusieurs fois (s'il est portable à une main) : il casse à peu près comme sa
  fragilité le promet ; éclats de ses couleurs ; flaque s'il est plein.
- [ ] Usure : `setCondition` à 0,8 / 0,5 / 0,2 → captures de chaque grade ; puis l'user jusqu'à
  zéro par l'usage normal → il se brise (et blesse s'il est fragile, en main).
- [ ] Meuble : le perso le contourne ; poussé, ce qui est dessus suit et il bute sur les autres
  meubles.
- [ ] Survol à la souris : la jauge et le grade s'affichent, avec le bon accord.
- [ ] Ordres texte (mode ✋ Action) : « prends la X », « pose la X sur la table », et les
  synonymes. `game.describe()` montre le bon `nom`, `sorte` et `etat`.
- [ ] Menu → Manques : aucun nouveau manque créé par ces essais.
- [ ] Les anciens objets marchent toujours (tasse + café + boire, livre + lecture, pile +
  bibliothèque, caisse).

---

## 7. Checklist avant de montrer

- [ ] Toutes les questions du § 2 ont une réponse, écrite dans la PR.
- [ ] La prise est écrite dans la fiche, pas devinée.
- [ ] Fragilité et durabilité sont cohérentes avec le tableau de référence.
- [ ] Nom féminin ajouté à `FEMININE` si besoin ; synonymes dans `ALIASES`.
- [ ] `npm run typecheck` passe.
- [ ] Les captures du § 6 sont faites et regardées (pas seulement prises).
- [ ] Le message à l'utilisateur dit comment l'essayer et ce qui n'est pas fait.
- [ ] Les nouvelles commandes `game.…` sont citées pour l'IA de RP / les ordres.

---

## 8. Pièges déjà rencontrés

- **Prise devinée pas naturelle** : la devinette par la taille a mis le livre « le long du
  corps ». Toujours choisir la prise en pensant au geste réel.
- **Objet tenu au mauvais endroit** : sans `gripPoint`, la main prend le centre ; la tasse
  doit être tenue par l'anse (`gripPoint` sur l'anse, côté +Z, prise `fist`).
- **Objets posés dessus qui restent en l'air** : quand on soulève ou pousse un objet, ce qui
  est posé dessus doit suivre (`riders` dans `Game.ts`) ; à vérifier pour tout nouveau support.
- **Le perso traverse les meubles** : tout objet non portable entre dans la navigation
  (`buildNav()`) ; elle est recalculée quand un meuble bouge ou casse. Vérifier qu'il le
  contourne.
- **Rangement espacé** : les places d'un meuble (`slots`) doivent coller à l'épaisseur réelle
  des objets (livres serrés, `BOOK_T`), sinon ça ne fait pas naturel.
- **Livre posé sur la tranche** : un objet plat se pose couché (`layFlat`), sauf rangé.
- **Matériaux partagés** : l'usure modifie la couleur du matériau de chaque pièce
  (`showWear`). Un matériau partagé entre deux objets s'userait sur les deux : un matériau par
  objet (les aides `mesh()`/`toon()` le font).
- **Textures effacées par l'usure** (déduit du code, pas encore rencontré) : `showWear`
  remplace la texture (`map`) de chaque pièce par celle de l'usure, ou la retire à l'état neuf.
  Un objet importé (.glb) avec ses propres textures les perdrait : à adapter avant le premier
  import.
- **Pièces spéciales** : `liquide` (monte avec le niveau, ne s'use pas, ne fait pas d'éclats),
  `jet` (écoulement de la machine, caché au repos), `sale` (taches de la vaisselle sale) et
  `bouchee` (au bout de la fourchette). Garder ces noms exacts.
- **Petits objets à côté d'un support** : ce qui « est posé dessus » se repère avec la boîte
  alignée sur les axes du support ; une assiette tournée de 45° a une boîte plus large que
  l'assiette, et emportait les couverts posés à côté. Poser l'assiette sans rotation et les
  couverts bien à l'écart.
- **Boîte de l'objet** : taille, prise devinée et hauteur de pose viennent de la boîte de
  `build()`. Une pièce qui dépasse (ou cachée mais présente) fausse tout ; le modèle ouvert
  (`buildOpen`) est ajouté après, il ne compte pas.
- **Perso par défaut** : il ne peut rien porter. Pour tester, créer un perso dans le créateur.
- **Ce qui est dessous n'est pas « posé dessus »** : en prenant un steak dans la poêle, la poêle
  (dont le bas touchait presque le haut du steak) partait avec lui. `ridersOf` ignore maintenant
  tout objet dont le bas est sous celui de l'objet pris.
- **Animation faite main** : pour le perso, les animations écrites à la main ont été
  rejetées (pose de repos). Pour un geste vraiment nouveau, chercher d'abord une animation libre
  de droits, ou rester sur le placement des bras par calcul (IK) comme les prises.

---

## Leçons

Chaque correction de l'utilisateur sur un objet s'ajoute ici : date, objet, ce qui n'allait
pas, la règle à en tirer.

- **2026-10-06, livre** : porté le long du corps, « pas très naturel » → tenu contre la
  poitrine, la main à plat dessus. *Règle : choisir la prise d'après le geste réel.*
- **2026-10-06, tasse** : il faut la tenir par l'anse. *Règle : un objet à anse ou à manche se
  tient par là.*
- **2026-10-06, caisse** : les objets posés dessus restaient en l'air quand on la soulevait →
  ils la suivent. *Règle : tout ce qui sert de support emporte ce qui est dessus.*
- **2026-10-06, livres** : porter plusieurs livres = une pile à plat, à deux mains par
  en dessous. *Règle : plusieurs objets d'une même sorte se portent comme on le ferait vraiment.*
- **2026-10-06, livre** : hors de la bibliothèque, un livre se pose sur le dos, pas sur la
  tranche. *Règle : la pose suit la forme de l'objet.*
- **2026-10-06, meubles** : le perso passait à travers la table → il contourne tous les
  meubles. *Règle : un objet non portable est un obstacle.*
- **2026-10-06, bibliothèque** : un espace entre chaque livre rangé, pas naturel → livres
  serrés. *Règle : les places d'un rangement collent à la taille des objets.*
- **2026-10-06, tasse / machine à café** : se faire un café avec la tasse en main, puis pouvoir
  la boire. *Règle : un objet qui se remplit doit aussi pouvoir se vider (boire, verser).*
