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

Les os sont lus par `src/creator/retarget.ts` (`UAL_TO_VRM`).

Les clips Mixamo du jeu (`public/anim/mixamo.glb`) viennent de X Bot, sans le mannequin, avec
seulement les rotations et le déplacement du bassin (ce que lit `retarget.ts`) :

```bash
python3 tools/build_anim_assets.py --src public/models/xbot.glb --out public/anim/mixamo.glb \
    --root mixamorig:Hips --clips agree headShake idle run sad_pose sneak_pose walk
```


## `build_pack_assets.mjs` : packs de Quaternius

Fait un `.glb` par pack dans `public/packs` (survie, peche, voitures, trains, armes, fantasy,
scifi) et écrit `src/game/packs/manifest.ts` (taille de chaque modèle). Chaque modèle devient un
nœud nommé comme son fichier, posé au sol et centré ; sommets compressés (meshopt), textures en
WebP 1024 px, décor simplifié. Les monstres (puglin, imp) sont gardés avec leur squelette.

```bash
npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp meshoptimizer
node tools/build_pack_assets.mjs --src <dossier des packs> --out public/packs [--only puglin,imp]
```

`<dossier des packs>` contient les dossiers tels que téléchargés sur quaternius.com
(« Survival Pack - Sept 2020 », « Fantasy Props MegaKit[Standard] »…).
