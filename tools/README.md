# Outils

## `build_vrm_assets.py` : persos du créateur

Régénère `public/vrm/` (un `.vrm` et une vignette `.webp` par perso) depuis les modèles
d'exemple de VRoid Studio : textures réencodées en WebP, formes du visage allégées.
À relancer seulement pour ajouter des persos (penser à les ajouter aussi dans
`src/creator/catalog.ts`).

```bash
git clone --depth 1 https://github.com/madjin/vrm-samples /tmp/vrm-samples
pip install pillow
python3 tools/build_vrm_assets.py --src /tmp/vrm-samples/vroid --out public/vrm
```

N'ajouter que des modèles dont la licence permet l'usage dans un jeu (CC0, ou licence VRoid
Hub avec usage commercial, modification et redistribution autorisés).


## `build_anim_assets.py` : animations de Quaternius

Extrait des clips de la « Universal Animation Library » (CC0) sans le mannequin. Les clips pour
s'asseoir (`public/anim/ual_sit.glb`) :

```bash
git clone --depth 1 https://github.com/adharshsivan/animationlibrary /tmp/ual
python3 tools/build_anim_assets.py --src /tmp/ual/UAL1_Standard.glb --out public/anim/ual_sit.glb \
    --clips Sitting_Enter Sitting_Idle_Loop Sitting_Talking_Loop Sitting_Exit
```

Les poses du créateur (un fichier par volume de la bibliothèque) :

```bash
python3 tools/build_anim_assets.py --src /tmp/ual/UAL1_Standard.glb --out public/anim/ual_poses1.glb \
    --clips Dance_Loop Idle_Talking_Loop Crouch_Idle_Loop Spell_Simple_Idle_Loop Walk_Formal_Loop
python3 tools/build_anim_assets.py --src /tmp/ual/UAL2_Standard.glb --out public/anim/ual_poses2.glb \
    --clips Idle_FoldArms_Loop Idle_TalkingPhone_Loop Consume
```

Les gestes de cuisine (tendre la main vers un appareil, prendre sur la table, s'agenouiller
devant une porte basse, pousser un meuble ; voir `src/game/character.ts`) :

```bash
python3 tools/build_anim_assets.py --src /tmp/ual/UAL1_Standard.glb --out public/anim/ual_kitchen.glb \
    --clips Interact PickUp_Table Fixing_Kneeling Push_Loop
```

La réserve (les 30 autres clips du volume 1, chargés seulement à la demande par
`Puppet.loadExtraAnimations()`) :

```bash
python3 tools/build_anim_assets.py --src /tmp/ual/UAL1_Standard.glb --out public/anim/ual_extra.glb \
    --clips A_TPose Crouch_Fwd_Loop Death01 Driving_Loop Hit_Chest Hit_Head Idle_Loop Idle_Torch_Loop \
    Jog_Fwd_Loop Jump_Land Jump_Loop Jump_Start Pistol_Aim_Down Pistol_Aim_Neutral Pistol_Aim_Up \
    Pistol_Idle_Loop Pistol_Reload Pistol_Shoot Punch_Cross Punch_Jab Roll Spell_Simple_Enter \
    Spell_Simple_Exit Spell_Simple_Shoot Sprint_Loop Swim_Fwd_Loop Swim_Idle_Loop Sword_Attack \
    Sword_Idle Walk_Loop
```

et les 39 autres clips du volume 2 :

```bash
python3 tools/build_anim_assets.py --src /tmp/ual/UAL2_Standard.glb --out public/anim/ual_extra2.glb \
    --clips Chest_Open ClimbUp_1m Farm_Harvest Farm_PlantSeed Farm_Watering Hit_Knockback \
    Idle_Lantern_Loop Idle_No_Loop Idle_Rail_Call Idle_Rail_Loop Idle_Shield_Break Idle_Shield_Loop \
    LayToIdle Melee_Hook Melee_Hook_Rec NinjaJump_Idle_Loop NinjaJump_Land NinjaJump_Start \
    OverhandThrow Shield_Dash Shield_OneShot Slide_Exit Slide_Loop Slide_Start Sword_Block Sword_Dash \
    Sword_Heavy_Combo Sword_Regular_A Sword_Regular_A_Rec Sword_Regular_B Sword_Regular_B_Rec \
    Sword_Regular_C Sword_Regular_Combo TreeChopping_Loop Walk_Carry_Loop Yes Zombie_Idle_Loop \
    Zombie_Scratch Zombie_Walk_Fwd_Loop
```

Les os sont lus par `src/creator/retarget.ts` (`UAL_TO_VRM`).

Les clips Mixamo du jeu (`public/anim/mixamo.glb`) viennent de X Bot, sans le mannequin, avec
seulement les rotations et le déplacement du bassin (ce que lit `retarget.ts`) :

```bash
python3 tools/build_anim_assets.py --src public/models/xbot.glb --out public/anim/mixamo.glb \
    --root mixamorig:Hips --clips agree headShake idle run sad_pose sneak_pose walk
```


## `build_interior_assets.py` : les meubles (pack intérieur de Quaternius)

Regroupe dans `public/models/interior.glb` les meubles de l'« Ultimate House Interior Pack » de
Quaternius (CC0, à télécharger sur quaternius.com) listés dans `MODELS`, à faces plates et aux
couleurs du pack.

```bash
python3 tools/build_interior_assets.py --src "Ultimate House Interior Pack - June 2020/OBJ" --out public/models/interior.glb
```

Pour habiller un autre meuble : ajouter son modèle à `MODELS`, puis la fiche du jeu et le modèle
dans `INTERIOR_LOOKS` (`src/game/items/interior.ts`). Le modèle prend la boîte des pièces sans
nom du meuble : les pièces nommées (portes, tiroirs, écran…) restent celles du jeu.

## `build_pack_assets.mjs` : packs de Quaternius

Fait un `.glb` par pack dans `public/packs` (aujourd'hui seulement `nourriture`) et écrit
`src/game/packs/manifest.ts` (taille de chaque modèle). Chaque modèle devient un nœud nommé comme
son fichier, posé au sol et centré ; sommets compressés (meshopt), textures en WebP 1024 px.

```bash
npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
node tools/build_pack_assets.mjs --src <dossier des packs> --out public/packs [--only nourriture]
```

Avec `--only`, seuls ces packs sont refaits et le manifeste garde les tailles des autres. Le pack
`nourriture` (« Ultimate Food Pack - Oct 2019 ») ne garde que les aliments listés dans `PACKS` ;
`src/game/items/interior.ts` (`FOOD_LOOKS`) dit lequel habille quel aliment du jeu.

`<dossier des packs>` contient les dossiers tels que téléchargés sur quaternius.com
(« Ultimate Food Pack - Oct 2019 »).

## `build_kit_assets.mjs` : kit Tripo de la maison

Regroupe les pièces du kit générées avec Tripo (licence d'usage commercial) et retouchées dans
l'Atelier Tripo (mur en enduit, carreau du sol, pan de toit, tuile canal, porte et fenêtre en bois) en un seul
`public/kit/maison.glb` : un nœud par pièce, maillages allégés et compressés (meshopt), textures
de couleur seules en WebP 1024 px. La carte « cuisine seule » s'en habille (`src/game/kit.ts`).

```bash
npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
node tools/build_kit_assets.mjs --src <dossier des modèles retouchés> --out public/kit/maison.glb
```

## `build_cuisine_assets.mjs` : meubles et objets Tripo d'une pièce

Regroupe les modèles d'une pièce (cuisine, salon, chambre, salle de bain, entrée, garage) générés avec Tripo (licence d'usage commercial), déjà corrigés
(1 unité = 1 m, posés au sol, avant vers +z, un atlas WebP, pièces mobiles en nœuds nommés : voir
`tripo/modeles/<pièce>/README.md` dans les fichiers du projet), en un seul `public/models/<pièce>.glb` :
un nœud par modèle nommé comme son fichier sans la taille (`placard-bas`), ses pièces mobiles en
enfants, sommets compressés (meshopt). `src/game/items/tripo.ts` (`TRIPO_LOOKS`) dit quel modèle
habille quelle fiche du jeu, et où sont les charnières.

```bash
npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
node tools/build_cuisine_assets.mjs --src <dossier des modèles corrigés> --out public/models/cuisine.glb
# une par pièce ; au garage, la porte basculante est déjà dans le kit
for p in salon chambre salle-de-bain entree; do node tools/build_cuisine_assets.mjs --src <…>/$p --out public/models/$p.glb; done
node tools/build_cuisine_assets.mjs --src <…>/garage --out public/models/garage.glb --skip porte-garage
```

## `build_aliments_assets.mjs` : aliments Tripo

Regroupe les aliments texturés générés avec Tripo (dossier `Assets/aliment/texture` du Bureau de
Greg) en `public/packs/aliments.glb`, lu comme un pack (`src/game/packs/assets.ts`) : un nœud par
aliment nommé comme dans `ALIMENTS` (« pomme », « pomme-de-terre »), couché comme celui du jeu (les
longs le long de Z), à sa vraie taille, posé au sol et centré, une texture WebP 256 px, maillage
allégé puis compressé (meshopt). Écrit aussi sa ligne dans `src/game/packs/manifest.ts`.
`FOOD_LOOKS` (`src/game/items/interior.ts`) dit lequel habille quel aliment du jeu.

```bash
npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
node tools/build_aliments_assets.mjs --src "<Bureau>/Assets/aliment/texture" --out public/packs/aliments.glb [--preview <dossier>]
```

Un nouvel aliment : ajouter son fichier à `ALIMENTS` (nom, taille, rotation), relancer, puis sa
ligne dans `FOOD_LOOKS` et, s'il n'existe pas encore, sa fiche (`src/game/items/pantry.ts`).

## `build_plats_assets.mjs` : plats et vaisselle Tripo

Même chose que les aliments pour le lot posé à la racine de `Assets` (plats cuisinés, vaisselle,
emballages) : `public/packs/plats.glb`, un nœud par modèle nommé comme la fiche qu'il habille
(« steak-frites », « passoire »). Les modèles debout sont couchés à plat (`rot`, ou `flat` : l'axe le
plus mince passe à la verticale).

```bash
node tools/build_plats_assets.mjs --src "<Bureau>/Assets" --out public/packs/plats.glb [--preview <dossier>]
```

Un nouveau modèle : sa ligne dans `PLATS` (nom, taille, rotation), relancer, puis sa ligne dans
`FOOD_LOOKS` (`src/game/items/interior.ts`).
