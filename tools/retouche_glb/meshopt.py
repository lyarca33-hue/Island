"""Décodeur meshopt (EXT_meshopt_compression) : sommets v0, indices v1, mode ATTRIBUTES / TRIANGLES."""
def _uz8(v): return ((-(v & 1)) ^ (v >> 1)) & 0xff

def _bytes(data, pos, n):
    hs = ((n // 16) + 3) // 4
    hdr = pos; pos += hs
    out = bytearray(n)
    for i in range(0, n, 16):
        g = i // 16
        m = (data[hdr + g // 4] >> ((g % 4) * 2)) & 3
        if m == 0: continue
        if m == 3:
            out[i:i+16] = data[pos:pos+16]; pos += 16; continue
        if m == 1:
            var = pos + 4
            for k in range(16):
                e = (data[pos + k // 4] >> (6 - (k % 4) * 2)) & 3
                if e == 3: e = data[var]; var += 1
                out[i+k] = e
        else:
            var = pos + 8
            for k in range(16):
                e = (data[pos + k // 2] >> (4 - (k % 2) * 4)) & 15
                if e == 15: e = data[var]; var += 1
                out[i+k] = e
        pos = var
    return out, pos

def decode_vertex(data, count, size):
    assert data[0] == 0xa0, hex(data[0])
    last = bytearray(data[len(data) - size:])
    block = min((8192 // size) & ~15, 256)
    out = bytearray(count * size)
    pos = 1
    for vo in range(0, count, block):
        bc = min(block, count - vo)
        al = (bc + 15) & ~15
        for k in range(size):
            buf, pos = _bytes(data, pos, al)
            p = last[k]
            for i in range(bc):
                p = (_uz8(buf[i]) + p) & 0xff
                out[(vo + i) * size + k] = p
        last = out[(vo + bc - 1) * size:(vo + bc) * size]
    return bytes(out)

def decode_index(data, count, isize):
    assert data[0] & 0xf0 == 0xe0
    version = data[0] & 15
    fecmax = 13 if version >= 1 else 15
    ef = [[0xffffffff, 0xffffffff] for _ in range(16)]; vf = [0xffffffff] * 16
    eo = vo = 0; nxt = last = 0
    code = 1; dp = 1 + count // 3
    aux = len(data) - 16
    out = []
    M = 0xffffffff
    def vb():
        nonlocal dp
        r = 0; s = 0
        while True:
            b = data[dp]; dp += 1
            r |= (b & 127) << s; s += 7
            if b < 128: return r
    def dix(last):
        v = vb(); d = (v >> 1) ^ (-(v & 1))
        return (last + d) & M
    def pv(v, c=1):
        nonlocal vo
        vf[vo] = v; vo = (vo + c) & 15
    def pe(a, b):
        nonlocal eo
        ef[eo] = [a, b]; eo = (eo + 1) & 15
    for t in range(count // 3):
        ct = data[code]; code += 1
        if ct < 0xf0:
            fe = ct >> 4
            a, b = ef[(eo - 1 - fe) & 15]
            fec = ct & 15
            if fec < fecmax:
                c = nxt if fec == 0 else vf[(vo - 1 - fec) & 15]
                f0 = 1 if fec == 0 else 0
                nxt += f0
                out += (a, b, c); pv(c, f0); pe(c, b); pe(a, c)
            else:
                c = ((last + (fec - (fec ^ 3))) & M) if fec != 15 else dix(last)
                last = c
                out += (a, b, c); pv(c); pe(c, b); pe(a, c)
        elif ct < 0xfe:
            ca = data[aux + (ct & 15)]
            feb = ca >> 4; fec = ca & 15
            a = nxt; nxt += 1
            b = nxt if feb == 0 else vf[(vo - feb) & 15]
            fb0 = 1 if feb == 0 else 0; nxt += fb0
            c = nxt if fec == 0 else vf[(vo - fec) & 15]
            fc0 = 1 if fec == 0 else 0; nxt += fc0
            out += (a, b, c); pv(a); pv(b, fb0); pv(c, fc0); pe(b, a); pe(c, b); pe(a, c)
        else:
            ca = data[dp]; dp += 1
            fea = 0 if ct == 0xfe else 15
            feb = ca >> 4; fec = ca & 15
            if ca == 0: nxt = 0
            if fea == 0: a = nxt; nxt += 1
            else: a = 0
            if feb == 0: b = nxt; nxt += 1
            else: b = vf[(vo - feb) & 15]
            if fec == 0: c = nxt; nxt += 1
            else: c = vf[(vo - fec) & 15]
            if fea == 15: last = a = dix(last)
            if feb == 15: last = b = dix(last)
            if fec == 15: last = c = dix(last)
            out += (a, b, c); pv(a); pv(b, 1 if feb in (0, 15) else 0); pv(c, 1 if fec in (0, 15) else 0)
            pe(b, a); pe(c, b); pe(a, c)
    import struct
    return struct.pack('<%d%s' % (len(out), 'H' if isize == 2 else 'I'), *out)

def decode_view(data, e):
    if e['mode'] == 'ATTRIBUTES':
        assert e.get('filter', 'NONE') == 'NONE'
        return decode_vertex(data, e['count'], e['byteStride'])
    if e['mode'] == 'TRIANGLES':
        return decode_index(data, e['count'], e['byteStride'])
    raise ValueError(e['mode'])
