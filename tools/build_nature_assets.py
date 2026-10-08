#!/usr/bin/env python3
"""
Construit `public/models/nature.glb` : les arbres, sapins, buissons, herbes, fleurs, pierres et
champignons du jardin, pris dans le « Stylized Nature MegaKit » de Quaternius (CC0, version gratuite).

On ne garde que les modèles choisis (MODELS), en un seul fichier :
- un nœud par modèle (nommé comme dans le pack), une primitive par matériau ;
- position, normale (sur un octet, KHR_mesh_quantization) et coordonnées de texture seulement (les couleurs de sommets du pack servent
  au vent de son shader, le jeu ne s'en sert pas) ;
- les textures réduites et réencodées en WebP, les cartes de relief (normal maps) laissées de côté ;
- les matériaux renommés comme le jeu les lit (src/game/nature.ts) : `ecorce`, `feuilles`…

    pip install pillow numpy
    python3 tools/build_nature_assets.py --src "Stylized Nature MegaKit[Standard]/glTF" \\
        --out public/models/nature.glb

Source : quaternius.com/packs/ultimatestylizednature.html (« Stylized Nature MegaKit », Standard).
"""
import argparse
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

# modèles gardés
MODELS = [
    # feuillus, sapins, buissons
    'CommonTree_3', 'CommonTree_5',
    'Pine_4', 'Pine_5',
    'Bush_Common', 'Bush_Common_Flowers',
    # au sol : herbes, fleurs, petites plantes, fougère
    'Grass_Common_Short', 'Grass_Wispy_Short', 'Flower_3_Group', 'Flower_4_Single',
    'Plant_1', 'Clover_1', 'Fern_1',
    # pierres du chemin, rochers, champignons
    'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5',
    'Rock_Medium_1', 'Rock_Medium_2', 'Mushroom_Common',
]

# matériau du pack -> (nom dans le jeu, texture, côté max en pixels, découpe par l'alpha)
# Les feuilles des arbres et des sapins prennent la version blanche de leur texture : le jeu les
# teinte selon la saison (vert tendre, vert, roux ; neige sur les sapins).
MATERIALS = {
    'Bark_NormalTree': ('ecorce', 'Bark_NormalTree.png', 256, False),
    'Leaves_NormalTree': ('feuilles', 'Leaves_NormalTree.png', 512, True),
    'Leaves_TwistedTree': ('feuilles-buisson', 'Leaves_TwistedTree.png', 512, True),
    'Leaves_Pine': ('aiguilles', 'Leaf_Pine.png', 512, True),
    'Leaves': ('plantes', 'Leaves.png', 512, True),
    'Flowers': ('fleurs', 'Flowers.png', 256, True),
    'Grass': ('herbe', 'Grass.png', 128, False),
    'PathRocks': ('galets', 'PathRocks_Diffuse.png', 256, False),
    'Rocks': ('rochers', 'Rocks_Diffuse.png', 256, False),
    'Mushrooms': ('champignons', 'Mushrooms.png', 256, False),
}

# décalage des coordonnées de texture : la palette des herbes est en bandes (jaune, vert, roux,
# vert tendre) ; les herbes folles passent de la bande jaune (herbe sèche) à la verte
UV_SHIFT = {'Grass_Wispy_Short': (0.06, 0.0)}

DTYPES = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
COMPS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_accessor(j, buf, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(DTYPES[a['componentType']])
    n = COMPS[a['type']]
    if bv.get('byteStride', dt.itemsize * n) != dt.itemsize * n:
        raise SystemExit('accesseur entrelacé non géré')
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(buf, dtype=dt, count=a['count'] * n, offset=off).reshape(a['count'], n)


def normals_i8(nor: np.ndarray) -> np.ndarray:
    """Normales sur un octet par composante (KHR_mesh_quantization), alignées sur 4 octets."""
    nor = nor / np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-8)
    q = np.zeros((nor.shape[0], 4), np.int8)
    q[:, :3] = np.round(nor * 127).astype(np.int8)
    return q


def bleed(img: Image.Image) -> Image.Image:
    """
    Donne aux pixels transparents la couleur des pixels pleins voisins : sans ça, de loin (textures
    réduites), le fond noir ou blanc déborde sur les bords des feuilles et des brins.
    """
    rgba = np.asarray(img.convert('RGBA'), np.float32) / 255
    a = rgba[..., 3:] > 0.5
    filled = np.where(a, rgba[..., :3], 0)
    known = a[..., 0].copy()
    # dilatations successives : chaque passe recopie la couleur des voisins déjà connus
    for _ in range(64):
        if known.all():
            break
        acc = np.zeros_like(filled)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(filled, (dy, dx), (0, 1)) * np.roll(known, (dy, dx), (0, 1))[..., None]
            cnt += np.roll(known, (dy, dx), (0, 1))
        grow = (~known) & (cnt > 0)
        filled[grow] = acc[grow] / cnt[grow][:, None]
        known |= grow
    if not known.all():
        filled[~known] = rgba[..., :3][a[..., 0]].mean(0)
    out = np.concatenate([filled, rgba[..., 3:]], -1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def webp(path: Path, cap: int, alpha: bool) -> bytes:
    img = Image.open(path)
    if path.name == 'Grass.png':
        # la palette des herbes n'occupe que la gauche de l'image : le blanc à droite déborderait
        # sur la dernière bande une fois l'image réduite
        arr = np.asarray(img.convert('RGB')).copy()
        used = int(np.argmax((arr[arr.shape[0] // 2] > 240).all(-1)))
        arr[:, used:] = arr[:, used - 2:used - 1]
        img = Image.fromarray(arr, 'RGB')
    img = img.convert('RGBA' if alpha else 'RGB')
    if max(img.size) > cap:
        img = img.resize((cap, cap) if img.size[0] == img.size[1] else
                         (cap, round(img.size[1] * cap / img.size[0])), Image.LANCZOS)
    if alpha:
        img = bleed(img)
    out = io.BytesIO()
    img.save(out, 'WEBP', quality=82, method=6, exact=True)
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, type=Path, help='dossier glTF du pack')
    ap.add_argument('--out', required=True, type=Path)
    a = ap.parse_args()
    textures_dir = a.src.parent / 'Textures'

    out_bin = bytearray()
    views, accessors, meshes, nodes = [], [], [], []
    mat_index = {}
    materials, images, textures = [], [], []

    def add_view(data: bytes, target=None, stride=None):
        while len(out_bin) % 4:
            out_bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        if stride:
            v['byteStride'] = stride
        views.append(v)
        out_bin.extend(data)
        return len(views) - 1

    def add_accessor(arr: np.ndarray, kind: str, target=None, minmax=False):
        ctype = {np.dtype(np.float32): 5126, np.dtype(np.uint16): 5123, np.dtype(np.uint32): 5125,
                 np.dtype(np.int8): 5120}[arr.dtype]
        stride = 4 if arr.dtype == np.int8 else None
        acc = {'bufferView': add_view(arr.tobytes(), target, stride), 'componentType': ctype,
               'count': arr.shape[0], 'type': kind}
        if arr.dtype == np.int8:
            acc['normalized'] = True
        if minmax:
            acc['min'] = arr.min(0).tolist()
            acc['max'] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    def material(src_name: str) -> int:
        name, tex, cap, cut = MATERIALS[src_name]
        if name not in mat_index:
            img = add_view(webp(textures_dir / tex, cap, cut))
            images.append({'bufferView': img, 'mimeType': 'image/webp', 'name': name})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            m = {'name': name, 'doubleSided': True,
                 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(textures) - 1},
                                          'metallicFactor': 0, 'roughnessFactor': 1}}
            if cut:
                m['alphaMode'] = 'MASK'
                m['alphaCutoff'] = 0.5
            materials.append(m)
            mat_index[name] = len(materials) - 1
        return mat_index[name]

    for model in MODELS:
        j = json.loads((a.src / f'{model}.gltf').read_text())
        buf = (a.src / j['buffers'][0]['uri']).read_bytes()
        node = j['nodes'][j['scenes'][0]['nodes'][0]]
        if any(k in node for k in ('matrix', 'rotation', 'scale', 'translation', 'children')):
            raise SystemExit(f'{model} : nœud transformé, non géré')
        prims = []
        for p in j['meshes'][node['mesh']]['primitives']:
            at = p['attributes']
            pos = read_accessor(j, buf, at['POSITION']).astype(np.float32)
            nor = read_accessor(j, buf, at['NORMAL']).astype(np.float32)
            uv = read_accessor(j, buf, at['TEXCOORD_0']).astype(np.float32) + np.float32(UV_SHIFT.get(model, (0, 0)))
            idx = read_accessor(j, buf, p['indices']).reshape(-1)
            idx = idx.astype(np.uint16 if pos.shape[0] < 65536 else np.uint32)
            prims.append({
                'attributes': {
                    'POSITION': add_accessor(np.ascontiguousarray(pos), 'VEC3', 34962, True),
                    'NORMAL': add_accessor(normals_i8(nor), 'VEC3', 34962),
                    'TEXCOORD_0': add_accessor(np.ascontiguousarray(uv), 'VEC2', 34962),
                },
                'indices': add_accessor(np.ascontiguousarray(idx).reshape(-1, 1), 'SCALAR', 34963),
                'material': material(j['materials'][p['material']]['name']),
            })
        meshes.append({'name': model, 'primitives': prims})
        nodes.append({'name': model, 'mesh': len(meshes) - 1})

    while len(out_bin) % 4:
        out_bin.append(0)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_nature_assets.py',
                  'copyright': 'Stylized Nature MegaKit, Quaternius (CC0)'},
        'extensionsUsed': ['KHR_mesh_quantization'],
        'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes, 'meshes': meshes, 'materials': materials,
        'textures': textures, 'images': images,
        'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
        'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(out_bin)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out_bin)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open('wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin))
    tris = sum(accessors[p['indices']]['count'] // 3 for m in meshes for p in m['primitives'])
    print(f'{a.out} : {len(nodes)} modèles, {tris} triangles, {total / 1024:.0f} Ko')


if __name__ == '__main__':
    main()
