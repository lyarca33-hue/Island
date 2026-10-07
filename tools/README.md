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

Les os sont lus par `src/creator/retarget.ts` (`UAL_TO_VRM`).

Les clips Mixamo du jeu (`public/anim/mixamo.glb`) viennent de X Bot, sans le mannequin, avec
seulement les rotations et le déplacement du bassin (ce que lit `retarget.ts`) :

```bash
python3 tools/build_anim_assets.py --src public/models/xbot.glb --out public/anim/mixamo.glb \
    --root mixamorig:Hips --clips agree headShake idle run sad_pose sneak_pose walk
```
