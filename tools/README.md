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

Les os sont lus par `src/creator/retarget.ts` (`UAL_TO_VRM`).

Les clips Mixamo du jeu (`public/anim/mixamo.glb`) viennent de X Bot, sans le mannequin, avec
seulement les rotations et le déplacement du bassin (ce que lit `retarget.ts`) :

```bash
python3 tools/build_anim_assets.py --src public/models/xbot.glb --out public/anim/mixamo.glb \
    --root mixamorig:Hips --clips agree headShake idle run sad_pose sneak_pose walk
```


## `build_nature_assets.py` : le jardin (pack nature de Quaternius)

Regroupe dans `public/models/nature.glb` les modèles du jardin pris dans le « Stylized Nature
MegaKit » de Quaternius (CC0, version gratuite, à télécharger sur quaternius.com) : seulement
ceux de la liste `MODELS`, textures réduites en WebP, sans les cartes de relief.

```bash
pip install pillow numpy
python3 tools/build_nature_assets.py --src "Stylized Nature MegaKit[Standard]/glTF" --out public/models/nature.glb
```

Pour ajouter un modèle : l'ajouter à `MODELS` (et son matériau à `MATERIALS` s'il est nouveau),
puis le placer dans `src/game/nature.ts`.


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

