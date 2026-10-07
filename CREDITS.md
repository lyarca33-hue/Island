# Crédits

- Rendu HD-2D (post-traitement, caméra iso) : adapté d'Arena Tactic (`client/src/render/hd2d/postfx.ts`, `math.ts`).
- Animations (repos, marche, course, gestes) : « X Bot » (`public/models/xbot.glb`), Mixamo (Adobe), copie des exemples de three.js.
- Animations pour s'asseoir (`public/anim/ual_sit.glb` : Sitting_Enter, Sitting_Idle_Loop,
  Sitting_Talking_Loop, Sitting_Exit) : [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
  de Quaternius, **CC0** (squelette et clips extraits par `tools/build_anim_assets.py` depuis la copie publique
  [adharshsivan/animationlibrary](https://github.com/adharshsivan/animationlibrary)).
- Persos du créateur (`public/vrm/`) : modèles d'exemple officiels de [VRoid Studio](https://vroid.com/en/studio) (pixiv).
  - AvatarSample_A, B, C : licence VRoid Hub inscrite dans les fichiers (usage par tous, usage commercial
    autorisé, modification et redistribution autorisées, mention non obligatoire).
  - Sendagaya Shino, Sendagaya Shibu, Darkness Shibu, Victoria Rubin, Vita, Vivi, HairSample Female / Male,
    Sakurada Fumiriya : **CC0**.
  - Copie utilisée : dépôt public [madjin/vrm-samples](https://github.com/madjin/vrm-samples), dossier `vroid/`
    (textures réencodées en WebP par `tools/build_vrm_assets.py`, rien d'autre de modifié).
- [three-vrm](https://github.com/pixiv/three-vrm) (MIT) : lecture des VRM, shader MToon, expressions, ressorts.
- three.js (MIT), React (MIT), Vite (MIT).
