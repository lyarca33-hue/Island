"""Remplace le maillage d'un nœud d'un pack .glb (meshopt) par celui d'un .glb exporté de Blender,
remplace au besoin l'image de son atlas, puis retire ce qui n'est plus utilisé."""
import json, sys, os, copy
sys.path.insert(0, os.path.dirname(__file__)); import glb

def find_node(j, spec):
    top = [j['nodes'][i] for i in j['scenes'][0]['nodes']]
    name, _, child = spec.partition('/')
    idx = next(i for i in j['scenes'][0]['nodes'] if j['nodes'][i].get('name') == name)
    if not child: return idx
    for c in j['nodes'][idx].get('children', []):
        n = j['nodes'][c]
        if child == '#corps' and not n.get('name') and 'mesh' in n: return c
        if n.get('name') == child: return c
    raise KeyError(spec)

def splice(pack, edited, spec, image=None, outp=None):
    j, bin_ = glb.read(pack)
    e, ebin = glb.read(edited)
    bin_ = bytearray(bin_)
    def add(data):
        while len(bin_) % 4: bin_.append(0)
        o = len(bin_); bin_.extend(data); return o
    ni = find_node(j, spec)
    old = j['meshes'][j['nodes'][ni]['mesh']]
    omat = old['primitives'][0].get('material')
    def copy_acc(ai):
        a = copy.deepcopy(e['accessors'][ai])
        bv = e['bufferViews'][a['bufferView']]
        o = bv.get('byteOffset', 0)
        nbv = {'buffer': 0, 'byteOffset': add(ebin[o:o + bv['byteLength']]), 'byteLength': bv['byteLength']}
        for k in ('byteStride', 'target'):
            if k in bv: nbv[k] = bv[k]
        j['bufferViews'].append(nbv); a['bufferView'] = len(j['bufferViews']) - 1
        j['accessors'].append(a); return len(j['accessors']) - 1
    em = e['meshes'][0]
    prims = []
    for p in em['primitives']:
        q = {'attributes': {k: copy_acc(v) for k, v in p['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0')}}
        if 'indices' in p: q['indices'] = copy_acc(p['indices'])
        if 'mode' in p: q['mode'] = p['mode']
        m = e['materials'][p['material']] if 'material' in p else None
        if m is None or m.get('name', '').startswith('atlas'):
            q['material'] = omat
        else:
            nm = {k: v for k, v in m.items() if k in ('name', 'pbrMetallicRoughness', 'doubleSided')}
            pbr = nm.get('pbrMetallicRoughness', {})
            pbr.pop('baseColorTexture', None); pbr.pop('metallicRoughnessTexture', None)
            j['materials'].append(nm); q['material'] = len(j['materials']) - 1
        prims.append(q)
    j['meshes'].append({'name': old.get('name', spec), 'primitives': prims})
    j['nodes'][ni]['mesh'] = len(j['meshes']) - 1
    if image:
        t = j['materials'][omat]['pbrMetallicRoughness']['baseColorTexture']['index']
        tex = j['textures'][t]
        src = tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source', tex.get('source'))
        users = [m for m in j['materials'] if m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index') == t]
        assert len(users) == 1, 'atlas partagé'
        data = open(image, 'rb').read()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': add(data), 'byteLength': len(data)})
        j['images'][src] = {'mimeType': 'image/webp', 'bufferView': len(j['bufferViews']) - 1}
    gc(j, bin_)
    glb_write(outp or pack, j, bin_)

def gc(j, bin_):
    used = lambda: None
    # nœuds -> maillages -> accesseurs / matériaux -> textures -> images, samplers
    meshes = sorted({n['mesh'] for n in j['nodes'] if 'mesh' in n})
    mmap = {o: i for i, o in enumerate(meshes)}
    j['meshes'] = [j['meshes'][o] for o in meshes]
    for n in j['nodes']:
        if 'mesh' in n: n['mesh'] = mmap[n['mesh']]
    accs = set(); mats = set()
    for m in j['meshes']:
        for p in m['primitives']:
            accs |= set(p['attributes'].values())
            if 'indices' in p: accs.add(p['indices'])
            for t in p.get('targets', []): accs |= set(t.values())
            if 'material' in p: mats.add(p['material'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: accs.add(s['inverseBindMatrices'])
    for an in j.get('animations', []):
        for s in an['samplers']: accs |= {s['input'], s['output']}
    amap = {o: i for i, o in enumerate(sorted(accs))}
    def ra(d):
        for k in list(d): d[k] = amap[d[k]]
    for m in j['meshes']:
        for p in m['primitives']:
            ra(p['attributes'])
            if 'indices' in p: p['indices'] = amap[p['indices']]
            for t in p.get('targets', []): ra(t)
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
    for an in j.get('animations', []):
        for s in an['samplers']: s['input'] = amap[s['input']]; s['output'] = amap[s['output']]
    j['accessors'] = [j['accessors'][o] for o in sorted(accs)]
    matl = sorted(mats); matm = {o: i for i, o in enumerate(matl)}
    j['materials'] = [j['materials'][o] for o in matl]
    for m in j['meshes']:
        for p in m['primitives']:
            if 'material' in p: p['material'] = matm[p['material']]
    texrefs = []
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k.endswith('Texture') and isinstance(v, dict) and 'index' in v: texrefs.append(v)
                walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(j['materials'])
    texl = sorted({r['index'] for r in texrefs}); texm = {o: i for i, o in enumerate(texl)}
    for r in texrefs: r['index'] = texm[r['index']]
    j['textures'] = [j['textures'][o] for o in texl]
    def tsrc(t):
        w = t.get('extensions', {}).get('EXT_texture_webp')
        return (w, 'source') if w else (t, 'source')
    imgl = sorted({tsrc(t)[0][tsrc(t)[1]] for t in j['textures']}); imgm = {o: i for i, o in enumerate(imgl)}
    for t in j['textures']:
        d, k = tsrc(t); d[k] = imgm[d[k]]
    j['images'] = [j['images'][o] for o in imgl]
    sl = sorted({t['sampler'] for t in j['textures'] if 'sampler' in t}); sm = {o: i for i, o in enumerate(sl)}
    for t in j['textures']:
        if 'sampler' in t: t['sampler'] = sm[t['sampler']]
    if 'samplers' in j: j['samplers'] = [j['samplers'][o] for o in sl]
    for k in ('materials', 'textures', 'images', 'samplers'):
        if k in j and not j[k]: del j[k]
    bvs = sorted({a['bufferView'] for a in j['accessors'] if 'bufferView' in a} | {i['bufferView'] for i in j.get('images', []) if 'bufferView' in i})
    bm = {o: i for i, o in enumerate(bvs)}
    for a in j['accessors']:
        if 'bufferView' in a: a['bufferView'] = bm[a['bufferView']]
    for i in j.get('images', []):
        if 'bufferView' in i: i['bufferView'] = bm[i['bufferView']]
    j['bufferViews'] = [j['bufferViews'][o] for o in bvs]

def glb_write(path, j, bin_):
    nb = bytearray(); fb = 0
    for bv in j['bufferViews']:
        ext = bv.get('extensions', {}).get('EXT_meshopt_compression')
        if ext:
            o = ext.get('byteOffset', 0); d = bin_[o:o + ext['byteLength']]
            while len(nb) % 4: nb.append(0)
            ext['byteOffset'] = len(nb); nb.extend(d)
            fb = (fb + 3) // 4 * 4
            bv['byteOffset'] = fb; fb += bv['byteLength']
        else:
            o = bv.get('byteOffset', 0); d = bin_[o:o + bv['byteLength']]
            while len(nb) % 4: nb.append(0)
            bv['byteOffset'] = len(nb); nb.extend(d)
    if len(j['buffers']) > 1: j['buffers'][1]['byteLength'] = fb
    glb.write(path, j, bytes(nb))

if __name__ == '__main__':
    a = sys.argv[1:]
    splice(a[0], a[1], a[2], a[3] if len(a) > 3 and a[3] != '-' else None, a[4] if len(a) > 4 else None)
