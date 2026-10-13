import json, struct, sys, os
sys.path.insert(0, os.path.dirname(__file__)); import meshopt

def read(path):
    b = open(path, 'rb').read()
    l = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + l])
    o = 20 + l
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, b[o + 8:o + 8 + bl]

def write(path, j, bin_):
    while len(bin_) % 4: bin_ += b'\0'
    j['buffers'] = [{'byteLength': len(bin_)}] + j['buffers'][1:]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(out)

def view_bytes(j, bin_, i):
    bv = j['bufferViews'][i]
    e = bv.get('extensions', {}).get('EXT_meshopt_compression')
    if e:
        o = e.get('byteOffset', 0)
        return meshopt.decode_view(bin_[o:o + e['byteLength']], e)
    assert bv['buffer'] == 0
    o = bv.get('byteOffset', 0)
    return bin_[o:o + bv['byteLength']]

def decompress(src, dst):
    j, bin_ = read(src)
    nb = bytearray()
    for i, bv in enumerate(j['bufferViews']):
        d = view_bytes(j, bin_, i)
        while len(nb) % 4: nb += b'\0'
        bv['buffer'] = 0; bv['byteOffset'] = len(nb); bv['byteLength'] = len(d)
        e = bv.pop('extensions', {}).pop('EXT_meshopt_compression', None)
        if e: bv['byteStride'] = e['byteStride'] if e['mode'] == 'ATTRIBUTES' else bv.pop('byteStride', None) or None
        if bv.get('byteStride') is None: bv.pop('byteStride', None)
        nb += d
    j['buffers'] = j['buffers'][:1]
    for k in ('extensionsUsed', 'extensionsRequired'):
        if k in j: j[k] = [x for x in j[k] if x != 'EXT_meshopt_compression']
    write(dst, j, bytes(nb))

if __name__ == '__main__':
    decompress(sys.argv[1], sys.argv[2])
