# Crédits

- Rendu HD-2D (post-traitement, caméra iso) : adapté d'Arena Tactic (`client/src/render/hd2d/postfx.ts`, `math.ts`).
- Animations (repos, marche, course, gestes) : « X Bot » (`public/models/xbot.glb`), Mixamo (Adobe), copie des exemples de three.js.
- Animations pour s'asseoir (`public/anim/ual_sit.glb` : Sitting_Enter, Sitting_Idle_Loop,
  Sitting_Talking_Loop, Sitting_Exit) : [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
  de Quaternius, **CC0** (squelette et clips extraits par `tools/build_anim_assets.py` depuis la copie publique
  [adharshsivan/animationlibrary](https://github.com/adharshsivan/animationlibrary)).
- Poses du créateur (`public/anim/ual_poses1.glb` : Dance_Loop, Idle_Talking_Loop, Crouch_Idle_Loop,
  Spell_Simple_Idle_Loop, Walk_Formal_Loop ; `public/anim/ual_poses2.glb` : Idle_FoldArms_Loop,
  Idle_TalkingPhone_Loop, Consume) : même [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
  de Quaternius, **CC0**, volumes 1 et 2 (`UAL1_Standard.glb`, `UAL2_Standard.glb` de la même copie publique), extraits par
  `tools/build_anim_assets.py`.
- Jardin (`public/models/nature.glb` : feuillus, sapins, buissons, herbes, fleurs, fougères, trèfles, galets,
  rochers, champignons) : [Stylized Nature MegaKit](https://quaternius.com/packs/ultimatestylizednature.html) de
  Quaternius, **CC0** (version gratuite « Standard »), modèles choisis et textures réduites par
  `tools/build_nature_assets.py`.
- Plantes (`src/game/plants.ts` : arbres, sapins, buissons, fleurs, légumes du potager, plantes d'intérieur) : formes et
  textures de feuilles faites par programme pour le jeu, aucun fichier tiers.
- Accessoires du créateur (`src/creator/accessories.ts` : toque, chapeaux, lunettes, nœuds, écharpe...) : formes three.js
  faites pour le jeu, aucun fichier tiers.
- Persos du créateur (`public/vrm/`) : modèles d'exemple officiels de [VRoid Studio](https://vroid.com/en/studio) (pixiv).
  - AvatarSample_A, B, C : licence VRoid Hub inscrite dans les fichiers (usage par tous, usage commercial
    autorisé, modification et redistribution autorisées, mention non obligatoire).
  - Sendagaya Shino, Sendagaya Shibu, Darkness Shibu, Victoria Rubin, Vita, Vivi, HairSample Female / Male,
    Sakurada Fumiriya : **CC0**.
  - Copie utilisée : dépôt public [madjin/vrm-samples](https://github.com/madjin/vrm-samples), dossier `vroid/`
    (textures réencodées en WebP par `tools/build_vrm_assets.py`, rien d'autre de modifié).
- [three-vrm](https://github.com/pixiv/three-vrm) (MIT) : lecture des VRM, shader MToon, expressions, ressorts.
- three.js (MIT), React (MIT), Vite (MIT).
