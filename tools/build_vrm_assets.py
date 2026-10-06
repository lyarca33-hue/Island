#!/usr/bin/env python3
"""
Prépare les persos VRoid (VRM 0.x) pour le créateur : textures réencodées en WebP, formes du
visage allégées, vignette sortie à part. La liste affichée dans le jeu est src/creator/catalog.ts.

Sources : les modèles d'exemple officiels de VRoid Studio (pixiv), CC0 ou licence VRoid
« usage libre » (voir CREDITS.md). Copie publique : github.com/madjin/vrm-samples (dossier vroid/).

    python3 tools/build_vrm_assets.py --src chemin/vers/vrm-samples/vroid --out public/vrm

Le JSON et la géométrie restent intacts (os, expressions, ressorts des cheveux) : seules les
images changent. Three.js lit le WebP même sans extension glTF dédiée (type MIME de l'image).
"""
import argparse
import array
import io
import json
import struct
from pathlib import Path

from PIL import Image

# id → (fichier source, nom affiché, genre du corps) ; même liste que src/creator/catalog.ts
MODELS = {
    'sample_a': ('stable/AvatarSample_A.vrm', 'Aiko', 'f'),
    'sample_b': ('stable/AvatarSample_B.vrm', 'Bérénice', 'f'),
    'sample_c': ('stable/AvatarSample_C.vrm', 'Caleb', 'm'),
    'shino': ('beta/Sendagaya_Shino.vrm', 'Shino', 'f'),
    'shibu': ('beta/Sendagaya_Shibu.vrm', 'Shibu', 'f'),
    'darkness': ('beta/Darkness_Shibu.vrm', 'Nuit', 'f'),
    'victoria': ('beta/Victoria_Rubin.vrm', 'Victoria', 'f'),
    'vita': ('beta/Vita.vrm', 'Vita', 'f'),
    'vivi': ('beta/Vivi.vrm', 'Vivi', 'f'),
    'hair_f': ('beta/HairSample_Female.vrm', 'Lina', 'f'),
    'fumiriya': ('beta/Sakurada_Fumiriya.vrm', 'Fumiya', 'm'),
    'hair_m': ('beta/HairSample_Male.vrm', 'Hugo', 'm'),
}

MAX_SIZE = 2048
MAX_NORMAL = 1024
THUMB = 256


def read_glb(path: Path):
    b = path.read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bn = struct.unpack('<I', b[20 + n:24 + n])[0]
    return j, b[28 + n:28 + n + bn]


def write_glb(path: Path, j, chunks):
    """Réécrit un GLB : `chunks` = liste d'octets, un bufferView par entrée (même ordre)."""
    bin_ = bytearray()
    for i, data in enumerate(chunks):
        while len(bin_) % 4:
            bin_.append(0)
        bv = j['bufferViews'][i]
        bv['byteOffset'] = len(bin_)
        bv['byteLength'] = len(data)
        bin_ += data
    while len(bin_) % 4:
        bin_.append(0)
    j['buffers'] = [{'byteLength': len(bin_)}]
    js = json.dumps(j, separators=(',', ':'), ensure_ascii=False).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    path.write_bytes(out)


def webp(img: Image.Image, cap: int) -> bytes:
    if max(img.size) > cap:
        k = cap / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    buf = io.BytesIO()
    lossless = max(img.size) <= 64
    img.save(buf, 'WEBP', quality=90, method=6, lossless=lossless)
    return buf.getvalue()


def convert(src: Path, out: Path, thumb_out: Path):
    j, bin_ = read_glb(src)
    views = []
    for bv in j['bufferViews']:
        o = bv.get('byteOffset', 0)
        views.append(bytes(bin_[o:o + bv['byteLength']]))
    for im in j['images']:
        i = im['bufferView']
        img = Image.open(io.BytesIO(views[i]))
        img = img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
        name = im.get('name', '')
        if name == 'Thumbnail':
            thumb_out.write_bytes(webp(img.convert('RGB'), THUMB))
            img = img.convert('RGB').resize((8, 8))
        cap = MAX_NORMAL if name.endswith('_nml') else MAX_SIZE
        views[i] = webp(img, cap)
        im['mimeType'] = 'image/webp'
    sparse_targets(j, views)
    write_glb(out, j, views)


def sparse_targets(j, views):
    """Formes du visage : on ne garde que les sommets qui bougent (accesseurs « sparse »)
    et on abandonne les normales des formes (invisibles en cel shading). Trois fois plus léger."""
    done = {}
    for mesh in j['meshes']:
        for prim in mesh['primitives']:
            targets = prim.get('targets')
            if not targets:
                continue
            for t in targets:
                for attr in [k for k in t if k != 'POSITION']:
                    acc = j['accessors'][t.pop(attr)]
                    if 'bufferView' in acc:
                        views[acc.pop('bufferView')] = b'\0\0\0\0'
                        acc.pop('byteOffset', None)
                a = t['POSITION']
                if a in done:
                    continue
                done[a] = True
                acc = j['accessors'][a]
                bv = acc.pop('bufferView')
                off = acc.pop('byteOffset', 0)
                vals = array.array('f', views[bv][off:off + acc['count'] * 12])
                idx = [i for i in range(acc['count']) if vals[3 * i] or vals[3 * i + 1] or vals[3 * i + 2]]
                views[bv] = b'\0\0\0\0'
                if not idx:
                    continue
                iv = len(views)
                views.append(array.array('I', idx).tobytes())
                views.append(array.array('f', [vals[3 * i + k] for i in idx for k in range(3)]).tobytes())
                j['bufferViews'] += [{'buffer': 0, 'byteLength': 0}, {'buffer': 0, 'byteLength': 0}]
                acc['sparse'] = {
                    'count': len(idx),
                    'indices': {'bufferView': iv, 'componentType': 5125},
                    'values': {'bufferView': iv + 1},
                }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    for mid, (rel, label, gender) in MODELS.items():
        src = a.src / rel
        dst = a.out / f'{mid}.vrm'
        convert(src, dst, a.out / f'{mid}.webp')
        print(f'{mid}: {src.stat().st_size / 1e6:.1f} Mo -> {dst.stat().st_size / 1e6:.1f} Mo')


if __name__ == '__main__':
    main()
