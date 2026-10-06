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

## `sim-jev.ts` : tester Jev sans la 3D

Une petite pièce simulée (mêmes actions et même prompt que le jeu) pour voir ce que répond le
vrai Jev, étape par étape :

```bash
npx esbuild tools/sim-jev.ts --bundle --platform=node --format=esm --define:import.meta.env={} --outfile=/tmp/sim-jev.mjs
OPENROUTER_API_KEY=sk-or-... node /tmp/sim-jev.mjs "range tous les livres"
```
