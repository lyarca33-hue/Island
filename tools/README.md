# Outils

## `build_creator_assets.py` : données du créateur de personnage

Régénère `public/creator/` (index `creator.json`, tableaux `creator.bin.gz`, textures `tex/`)
depuis les sources MakeHuman (toutes en CC0). À relancer seulement pour ajouter des formes,
des cheveux ou des vêtements.

```bash
git clone --depth 1 https://github.com/makehumancommunity/makehuman /tmp/mh
git clone --depth 1 https://github.com/makehumancommunity/mpfb2 /tmp/mpfb2
mkdir -p /tmp/mhdata && curl -sL https://registry.npmjs.org/makehuman-data-v1/-/makehuman-data-v1-0.0.2.tgz | tar xz -C /tmp/mhdata
pip install pillow
python3 tools/build_creator_assets.py \
  --mh /tmp/mh/makehuman/data \
  --rig /tmp/mpfb2/src/mpfb/data/rigs/standard \
  --proxies /tmp/mhdata/package/public/data
```

Les listes `TARGET_GLOBS` (formes) et `PROXIES` (cheveux, vêtements...) en tête du script
disent ce qui est gardé.
