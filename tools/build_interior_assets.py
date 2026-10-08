#!/usr/bin/env python3
"""
Construit `public/models/interior.glb` : les meubles pris dans l'« Ultimate House Interior Pack »
de Quaternius (CC0), qui habillent ceux du jeu (src/game/items/interior.ts).

On ne garde que les modèles choisis (MODELS), en un seul fichier :
- un nœud par modèle (nommé comme dans le pack), une primitive par couleur ;
- des faces plates (normales par face), comme les meubles faits par programme ;
- les couleurs du pack (Kd des .mtl), aucune texture.

    python3 tools/build_interior_assets.py --src "Ultimate House Interior Pack - June 2020/OBJ" \\
        --out public/models/interior.glb

Source : quaternius.com/packs/ultimatehomeinterior.html (« Ultimate House Interior Pack »).
"""
import argparse
import json
import struct
from pathlib import Path

import numpy as np

MODELS = ['Couch_Medium1', 'Table_RoundLarge', 'Chair_2', 'Stool']


def read_mtl(path: Path) -> dict:
    colors, name = {}, None
    for line in path.read_text().splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == 'newmtl':
            name = p[1]
        elif p[0] == 'Kd' and name:
            colors[name] = [float(x) for x in p[1:4]]
    return colors


def read_obj(path: Path):
    """Triangles (positions) groupés par matériau."""
    verts, tris, mat = [], {}, None
    for line in path.read_text().splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            verts.append([float(x) for x in p[1:4]])
        elif p[0] == 'usemtl':
            mat = p[1]
        elif p[0] == 'f':
            idx = [int(x.split('/')[0]) for x in p[1:]]
            idx = [i - 1 if i > 0 else len(verts) + i for i in idx]
            for k in range(1, len(idx) - 1):
                tris.setdefault(mat, []).append((idx[0], idx[k], idx[k + 1]))
    return np.array(verts, np.float32), tris


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, type=Path, help='dossier OBJ du pack')
    ap.add_argument('--out', required=True, type=Path)
    a = ap.parse_args()

    out_bin = bytearray()
    views, accessors, meshes, nodes, materials = [], [], [], [], []
    mat_index = {}

    def add_accessor(arr: np.ndarray, kind: str, minmax=False):
        while len(out_bin) % 4:
            out_bin.append(0)
        views.append({'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': arr.nbytes, 'target': 34962})
        out_bin.extend(arr.tobytes())
        acc = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': arr.shape[0], 'type': kind}
        if minmax:
            acc['min'] = arr.min(0).tolist()
            acc['max'] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    def material(name: str, rgb) -> int:
        key = f'{name}:{",".join(f"{c:.4f}" for c in rgb)}'
        if key not in mat_index:
            materials.append({'name': name, 'pbrMetallicRoughness': {
                'baseColorFactor': [*rgb, 1], 'metallicFactor': 0, 'roughnessFactor': 1}})
            mat_index[key] = len(materials) - 1
        return mat_index[key]

    total_tris = 0
    for model in MODELS:
        verts, tris = read_obj(a.src / f'{model}.obj')
        colors = read_mtl(a.src / f'{model}.mtl')
        prims = []
        for mat, faces in tris.items():
            f = np.array(faces)
            pos = verts[f].reshape(-1, 3)
            tri = verts[f]
            n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            nor = np.repeat(n, 3, axis=0).astype(np.float32)
            prims.append({'attributes': {'POSITION': add_accessor(np.ascontiguousarray(pos), 'VEC3', True),
                                         'NORMAL': add_accessor(np.ascontiguousarray(nor), 'VEC3')},
                          'material': material(mat, colors.get(mat, [0.8, 0.8, 0.8]))})
            total_tris += len(faces)
        meshes.append({'name': model, 'primitives': prims})
        nodes.append({'name': model, 'mesh': len(meshes) - 1})

    while len(out_bin) % 4:
        out_bin.append(0)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_interior_assets.py',
                  'copyright': 'Ultimate House Interior Pack, Quaternius (CC0)'},
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes, 'meshes': meshes, 'materials': materials,
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(out_bin)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out_bin)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open('wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin))
    print(f'{a.out} : {len(nodes)} modèles, {total_tris} triangles, {total / 1024:.0f} Ko')


if __name__ == '__main__':
    main()
