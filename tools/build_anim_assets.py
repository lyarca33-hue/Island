#!/usr/bin/env python3
"""
Extrait quelques animations de la « Universal Animation Library » de Quaternius (CC0) : on garde
le squelette et les clips choisis, sans le mannequin (fichier 50 fois plus léger).

    python3 tools/build_anim_assets.py --src UAL1_Standard.glb --out public/anim/ual_idle.glb \\
        --clips Idle_Loop Idle_Talking_Loop

Source : quaternius.com (Universal Animation Library), copie publique sur
github.com/adharshsivan/animationlibrary. Les os sont lus par src/creator/retarget.ts (UAL_TO_VRM).
"""
import argparse
import json
import struct
from pathlib import Path


def read_glb(path: Path):
    b = path.read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bn = struct.unpack('<I', b[20 + n:24 + n])[0]
    return j, b[28 + n:28 + n + bn]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--clips', nargs='+', required=True)
    a = ap.parse_args()
    j, bin_ = read_glb(a.src)

    anims = [an for an in j['animations'] if an['name'] in a.clips]
    missing = set(a.clips) - {an['name'] for an in anims}
    if missing:
        raise SystemExit(f'clips introuvables : {sorted(missing)}')

    # accesseurs utilisés par les clips gardés, recopiés dans un nouveau tampon
    out_bin = bytearray()
    views, accessors, remap = [], [], {}

    def copy_accessor(i):
        if i in remap:
            return remap[i]
        acc = dict(j['accessors'][i])
        bv = j['bufferViews'][acc.pop('bufferView')]
        start = bv.get('byteOffset', 0) + acc.pop('byteOffset', 0)
        comps = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[acc['type']]
        size = {5126: 4}[acc['componentType']]
        stride = bv.get('byteStride', comps * size)
        data = bytearray()
        for k in range(acc['count']):
            o = start + k * stride
            data += bin_[o:o + comps * size]
        while len(out_bin) % 4:
            out_bin.append(0)
        views.append({'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)})
        out_bin.extend(data)
        acc['bufferView'] = len(views) - 1
        accessors.append(acc)
        remap[i] = len(accessors) - 1
        return remap[i]

    for an in anims:
        for s in an['samplers']:
            s['input'] = copy_accessor(s['input'])
            s['output'] = copy_accessor(s['output'])
        # échelles inutiles (toujours 1) : on les retire
        keep = [c for c in an['channels'] if c['target']['path'] != 'scale']
        an['channels'] = keep

    nodes = []
    for nd in j['nodes']:
        nd = {k: v for k, v in nd.items() if k not in ('mesh', 'skin')}
        nodes.append(nd)
    out = {
        'asset': {'version': '2.0', 'generator': 'rp-island build_anim_assets.py'},
        'scene': 0,
        'scenes': [{'nodes': j['scenes'][j.get('scene', 0)]['nodes']}],
        'nodes': nodes,
        'animations': anims,
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(out_bin)}],
    }
    while len(out_bin) % 4:
        out_bin.append(0)
    out['buffers'][0]['byteLength'] = len(out_bin)
    js = json.dumps(out, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out_bin)
    glb = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_bytes(glb)
    print(f'{a.out}: {len(glb) / 1e3:.0f} ko, {len(anims)} clips')


if __name__ == '__main__':
    main()
