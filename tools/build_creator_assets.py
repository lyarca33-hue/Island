#!/usr/bin/env python3
"""
Convertit les données de MakeHuman (CC0) en un format compact pour le créateur de personnage
du navigateur : public/creator/creator.json (index) + creator.bin.gz (tableaux binaires compressés)
+ public/creator/tex/ (textures).

Sources (à récupérer une fois, voir tools/README.md) :
  --mh     dossier makehuman/data du dépôt makehumancommunity/makehuman (maillage de base, formes)
  --rig    dossier src/mpfb/data/rigs/standard du dépôt makehumancommunity/mpfb2 (squelette Mixamo)
  --proxies dossier public/data du paquet npm makehuman-data-v1 (cheveux, vêtements, yeux,
           sourcils déjà convertis avec leurs données d'ajustement au corps)

Unités : MakeHuman travaille en décimètres, Y en haut, face vers +Z. On sort des mètres.
"""
import argparse
import ast
import glob
import gzip
import json
import os
import struct
import sys

from PIL import Image

DM = 0.1  # décimètre -> mètre
DELTA_SCALE = 10000.0  # écarts des formes stockés en int16, unité 0,1 mm

# Formes gardées (chemins relatifs à targets/, motifs glob). Les formes « macro » (sexe, âge,
# muscle, poids, taille, proportions, origine, poitrine) sont toutes prises : le moteur les
# mélange selon les curseurs, comme MakeHuman.
TARGET_GLOBS = [
    'macrodetails/*.target',
    'macrodetails/height/*.target',
    'macrodetails/proportions/*.target',
    'breast/*.target',
    'head/*.target',
    'forehead/*.target',
    'eyebrows/*.target',
    'neck/*.target',
    'eyes/*.target',
    'nose/*.target',
    'mouth/*.target',
    'ears/*.target',
    'chin/*.target',
    'cheek/*.target',
    'torso/*.target',
    'hip/*.target',
    'stomach/stomach-pregnant-*.target',
    'buttocks/*.target',
    'armslegs/*-hand-scale-*.target',
    'armslegs/*-foot-scale-*.target',
    'armslegs/*-upperarm-fat-*.target',
    'armslegs/*-upperarm-muscle-*.target',
    'armslegs/*-lowerarm-fat-*.target',
    'armslegs/*-lowerarm-muscle-*.target',
    'armslegs/*-upperleg-fat-*.target',
    'armslegs/*-upperleg-muscle-*.target',
    'armslegs/*-lowerleg-fat-*.target',
    'armslegs/*-lowerleg-muscle-*.target',
    'measure/measure-shoulder-dist-*.target',
    'measure/measure-waist-circ-*.target',
    'measure/measure-hips-circ-*.target',
    'measure/measure-neck-height-*.target',
    'measure/measure-upperarm-length-*.target',
    'measure/measure-lowerarm-length-*.target',
    'measure/measure-upperleg-height-*.target',
    'measure/measure-lowerleg-height-*.target',
]
# Expressions du visage (unités d'expression) : morphs gardés tels quels dans le jeu.
EXPRESSION_GLOB = 'expression/units/caucasian/*.target'

# Habits, cheveux... : seulement les éléments fournis avec MakeHuman (passés en CC0 en 2020)
# ou marqués CC0. Clé = dossier dans proxies/<type>/.
PROXIES = {
    'hair': ['short01', 'short02', 'short03', 'short04', 'bob01', 'bob02', 'long01',
             'ponytail01', 'Braid01', 'afro01'],
    'eyebrows': ['eyebrow001', 'eyebrow002', 'eyebrow003', 'eyebrow004', 'eyebrow005',
                 'eyebrow006', 'eyebrow007', 'eyebrow008', 'eyebrow009', 'eyebrow010',
                 'eyebrow011', 'eyebrow012'],
    'eyelashes': ['Eyelashes01'],
    'eyes': ['HighPolyEyes'],
    'teeth': ['Teeth_Base'],
    'clothes': ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04',
                'male_casualsuit05', 'male_casualsuit06', 'male_elegantsuit01', 'male_worksuit01',
                'female_casualsuit01', 'female_casualsuit02', 'female_elegantsuit01',
                'female_sportsuit01', 'female_top_01', 'female_panties_01',
                'shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06',
                'fedora', 'fedora_cocked'],
}


class Bin:
    """Accumule les tableaux binaires (alignés sur 4 octets) et rend leurs références."""

    def __init__(self):
        self.buf = bytearray()

    def add(self, fmt, values):
        while len(self.buf) % 4:
            self.buf.append(0)
        off = len(self.buf)
        self.buf += struct.pack('<%d%s' % (len(values), fmt), *values)
        kind = {'f': 'f32', 'H': 'u16', 'h': 'i16', 'I': 'u32', 'B': 'u8'}[fmt]
        return {'type': kind, 'offset': off, 'length': len(values)}


def parse_obj(path):
    verts, uvs, groups = [], [], {}
    faces = []  # (group, [(v, vt)...])
    group = None
    with open(path) as f:
        for line in f:
            p = line.split()
            if not p:
                continue
            if p[0] == 'v':
                verts.append([float(x) for x in p[1:4]])
            elif p[0] == 'vt':
                uvs.append([float(x) for x in p[1:3]])
            elif p[0] == 'g':
                group = p[1]
            elif p[0] == 'f':
                fv = []
                for t in p[1:]:
                    a = t.split('/')
                    fv.append((int(a[0]) - 1, int(a[1]) - 1 if len(a) > 1 and a[1] else -1))
                faces.append((group, fv))
                groups.setdefault(group, set()).update(v for v, _ in fv)
    return verts, uvs, faces, groups


def read_target(path):
    out = []
    with open(path) as f:
        for line in f:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            out.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
    return out


def pack_target(b, path):
    rows = read_target(path)
    rows = [r for r in rows if any(abs(x) * DM * DELTA_SCALE >= 0.5 for x in r[1:])]
    rows.sort()
    # index codés en écarts successifs (mieux compressés par gzip), recumulés au chargement
    idx = [r[0] - (rows[i - 1][0] if i else 0) for i, r in enumerate(rows)]
    d = []
    for r in rows:
        for x in r[1:]:
            v = int(round(x * DM * DELTA_SCALE))
            d.append(max(-32768, min(32767, v)))
    return {'indices': b.add('H', idx), 'deltas': b.add('h', d)}


def lit(v):
    return ast.literal_eval(v) if isinstance(v, str) else v


def parse_three_faces(faces, nuv_layers):
    """Faces du format JSON three.js v3 -> liste de faces [(vertex, uv), ...]."""
    out, i = [], 0
    while i < len(faces):
        t = faces[i]
        i += 1
        quad = t & 1
        n = 4 if quad else 3
        vs = faces[i:i + n]
        i += n
        if t & 2:
            i += 1  # matériau
        uvi = [-1] * n
        if t & 4:
            i += nuv_layers
        if t & 8:
            for layer in range(nuv_layers):
                if layer == 0:
                    uvi = faces[i:i + n]
                i += n
        if t & 16:
            i += 1
        if t & 32:
            i += n
        if t & 64:
            i += 1
        if t & 128:
            i += n
        out.append(list(zip(vs, uvi)))
    return out


def triangulate(fv):
    return [(fv[0], fv[k], fv[k + 1]) for k in range(1, len(fv) - 1)]


def split_vertices(tris):
    """(sommet, uv) uniques -> sommets de rendu + index des triangles."""
    remap, order, index = {}, [], []
    for tri in tris:
        for key in tri:
            if key not in remap:
                remap[key] = len(order)
                order.append(key)
            index.append(remap[key])
    return order, index


def convert_texture(src, dst_dir, name, max_size=1024, gray=False):
    im = Image.open(src)
    if gray:
        # cheveux, sourcils : niveaux de gris éclaircis, la couleur choisie est appliquée par
        # le matériau (n'importe quelle teinte à partir d'une seule texture)
        im = im.convert('RGBA')
        a = im.getchannel('A')
        lum = im.convert('L')
        px = [v for v, al in zip(lum.getdata(), a.getdata()) if al > 128] or [128]
        k = 0.9 * 255 / max(1, sum(px) / len(px))
        lum = lum.point(lambda v: max(0, min(255, int(v * k))))
        im = Image.merge('RGBA', (lum, lum, lum, a))
    if max(im.size) > max_size:
        im = im.resize((max_size, max_size), Image.LANCZOS)
    has_alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
    im = im.convert('RGBA' if has_alpha else 'RGB')
    out = os.path.join(dst_dir, name + '.webp')
    im.save(out, 'WEBP', quality=92, method=6)
    return os.path.basename(out)


def skin_detail_texture(src, dst):
    """Texture de peau -> détails en niveaux de gris (lèvres, tétons, plis), à multiplier par la
    teinte de peau choisie : n'importe quelle couleur de peau garde les détails du visage.
    Contraste fortement réduit et adouci : en cel shading, une peau presque unie est plus propre."""
    from PIL import ImageFilter
    im = Image.open(src).convert('L').filter(ImageFilter.GaussianBlur(1.6))
    px = list(im.get_flattened_data()) if hasattr(im, 'get_flattened_data') else list(im.getdata())
    mean = sum(px) / len(px)
    # écart à la moyenne divisé par ~3, autour de 0,93 : la teinte choisie reste fidèle
    im = im.point(lambda v: max(0, min(255, int(255 * (0.93 + 0.33 * (v - mean) / 255)))))
    im.save(dst, 'WEBP', quality=92, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mh', required=True)
    ap.add_argument('--rig', required=True)
    ap.add_argument('--proxies', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'public', 'creator'))
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'tex'), exist_ok=True)
    b = Bin()
    manifest = {'source': 'MakeHuman 1.x (CC0), squelette Mixamo de MPFB 2 (CC0)'}

    # --- maillage de base -------------------------------------------------------------------
    verts, uvs, faces, groups = parse_obj(os.path.join(a.mh, '3dobjs', 'base.obj'))
    manifest['vertexCount'] = len(verts)
    flat = [c * DM for v in verts for c in v]
    manifest['basePositions'] = b.add('f', flat)
    body_tris = [t for g, fv in faces if g == 'body' for t in triangulate(fv)]
    order, index = split_vertices(body_tris)
    manifest['body'] = {
        'toBase': b.add('H', [v for v, _ in order]),
        'uv': b.add('f', [c for _, t in order for c in uvs[t]]),
        'index': b.add('I', index),
    }
    print('corps : %d sommets de rendu, %d triangles' % (len(order), len(index) // 3))

    # --- formes -----------------------------------------------------------------------------
    tdir = os.path.join(a.mh, 'targets')
    targets = {}
    for pat in TARGET_GLOBS:
        for path in sorted(glob.glob(os.path.join(tdir, pat))):
            name = os.path.relpath(path, tdir)[:-len('.target')]
            # pas de bébés : le jeu commence à 10 ans (curseur d'âge >= 0,1875)
            if '-baby' in name:
                continue
            # taille et proportions : seulement la variante « muscle et poids moyens » (le reste
            # pèse 30 Mo pour un effet à peine visible) ; le moteur l'applique quel que soit le
            # muscle ou le poids
            if name.startswith(('macrodetails/height/', 'macrodetails/proportions/')):
                if '-averagemuscle-averageweight-' not in name:
                    continue
                name = name.replace('-averagemuscle-averageweight', '')
            targets[name] = pack_target(b, path)
    manifest['targets'] = targets
    expr = {}
    for path in sorted(glob.glob(os.path.join(tdir, EXPRESSION_GLOB))):
        expr[os.path.basename(path)[:-len('.target')]] = pack_target(b, path)
    manifest['expressions'] = expr
    print('formes : %d, expressions : %d' % (len(targets), len(expr)))

    # --- squelette Mixamo (positions des os = moyenne de sommets, suit les formes) ------------
    rig = json.load(open(os.path.join(a.rig, 'rig.mixamo.json')))['bones']
    def joint_verts(spec):
        if spec['strategy'] == 'CUBE':
            return sorted(groups[spec['cube_name']])
        return spec['vertex_indices']
    bones = []
    names = list(rig.keys())
    # parents avant enfants
    ordered = []
    def visit(n):
        if n in ordered:
            return
        p = rig[n]['parent']
        if p:
            visit(p)
        ordered.append(n)
    for n in names:
        visit(n)
    for n in ordered:
        r = rig[n]
        bones.append({'name': n.replace('mixamorig:', 'mixamorig'), 'parent': r['parent'].replace('mixamorig:', 'mixamorig') or None,
                      'head': joint_verts(r['head']), 'tail': joint_verts(r['tail'])})
    manifest['bones'] = bones
    bone_index = {bb['name']: i for i, bb in enumerate(bones)}

    # poids de peau : 4 os max par sommet de base
    w = json.load(open(os.path.join(a.rig, 'weights.mixamo.json')))['weights']
    per_vert = [[] for _ in verts]
    for bn, lst in w.items():
        bi = bone_index[bn.replace('mixamorig:', 'mixamorig')]
        for vi, wt in lst:
            per_vert[vi].append((wt, bi))
    si, sw = [], []
    for lst in per_vert:
        lst.sort(reverse=True)
        lst = lst[:4]
        tot = sum(x for x, _ in lst) or 1
        q = [int(round(x / tot * 255)) for x, _ in lst]
        if q:
            q[0] += 255 - sum(q)
        while len(lst) < 4:
            lst.append((0, 0))
            q.append(0)
        si += [bi for _, bi in lst]
        sw += q
    manifest['skinIndex'] = b.add('B', si)
    manifest['skinWeight'] = b.add('B', sw)

    # --- peau ---------------------------------------------------------------------------------
    sk = os.path.join(a.proxies, 'skins')
    skin_detail_texture(os.path.join(sk, 'young_caucasian_female/textures/young_lightskinned_female_diffuse.png'),
                        os.path.join(a.out, 'tex', 'skin_female.webp'))
    skin_detail_texture(os.path.join(sk, 'young_caucasian_male/textures/young_lightskinned_male_diffuse.png'),
                        os.path.join(a.out, 'tex', 'skin_male.webp'))
    manifest['skin'] = {'female': 'skin_female.webp', 'male': 'skin_male.webp'}

    # --- cheveux, vêtements, yeux... -----------------------------------------------------------
    proxies = []
    for kind, items in PROXIES.items():
        for item in items:
            d = json.load(open(os.path.join(a.proxies, 'proxies', kind, item, item + '.json')))
            md = lit(d['metadata'])
            mats = lit(d['materials'])
            uv_layers = lit(d['uvs'])
            puv = uv_layers[0]
            tris = [t for fv in parse_three_faces(lit(d['faces']), len(uv_layers)) for t in triangulate(fv)]
            order, index = split_vertices(tris)
            refs = [r for tri in md['ref_vIdxs'] for r in tri]
            wts = [x for tri in md['weights'] for x in tri]
            offs = [x * DM for o in md['offsets'] for x in o]
            deleted = [i for i, x in enumerate(md.get('deleteVerts') or []) if x]
            texs = []
            for mi, m in enumerate(mats):
                if m.get('mapDiffuse'):
                    src = os.path.join(a.proxies, 'proxies', kind, item, m['mapDiffuse'])
                    gray = kind in ('hair', 'eyebrows', 'eyelashes')
                    texs.append({'name': m.get('DbgName'), 'map': convert_texture(src, os.path.join(a.out, 'tex'), '%s_%s' % (item, mi), gray=gray)})
            entry = {
                'id': item, 'kind': kind, 'name': md.get('name', item), 'tags': md.get('tags', []),
                'license': (md.get('license') or {}).get('license'), 'author': (md.get('license') or {}).get('author'),
                'vertexCount': len(md['ref_vIdxs']),
                'refs': b.add('H', refs), 'weights': b.add('f', wts), 'offsets': b.add('f', offs),
                'toProxy': b.add('H', [v for v, _ in order]),
                'uv': b.add('f', [c for _, t in order for c in (puv[2 * t], puv[2 * t + 1])]),
                'index': b.add('I', index),
                'textures': texs,
                'zDepth': md.get('z_depth', 50),
            }
            if deleted:
                entry['deleteVerts'] = b.add('H', deleted)
            proxies.append(entry)
    manifest['proxies'] = proxies
    print('éléments : %d' % len(proxies))

    # compressé une fois pour toutes (le navigateur le décompresse avec DecompressionStream)
    with gzip.open(os.path.join(a.out, 'creator.bin.gz'), 'wb', compresslevel=9) as f:
        f.write(b.buf)
    with open(os.path.join(a.out, 'creator.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    print('creator.bin : %.1f Mo (%.1f Mo compressé)' % (len(b.buf) / 1e6, os.path.getsize(os.path.join(a.out, 'creator.bin.gz')) / 1e6))


if __name__ == '__main__':
    sys.exit(main())
