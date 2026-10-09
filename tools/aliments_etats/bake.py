"""Outils communs : la position et la normale 3D de chaque pixel de la texture d'un aliment (rastérisation
en espace UV), un bruit 3D, et l'écriture d'un .glb avec une nouvelle texture. Lancés depuis le dossier
de travail : les aliments du pack dans glb/, les résultats dans out/ (voir tools/README.md)."""
import os, numpy as np, trimesh
os.makedirs("out", exist_ok=True)
from PIL import Image

def load(name):
    m = trimesh.load(f'glb/{name}.glb', force='mesh', process=False)
    img = np.asarray(m.visual.material.baseColorTexture.convert('RGB')).astype(np.float32) / 255
    return m, img

def raster(m, size):
    """Pour chaque pixel : position et normale 3D, d'après le triangle qui le couvre en espace UV."""
    uv = m.visual.uv.copy(); uv[:, 1] = 1 - uv[:, 1]
    P = np.zeros((size, size, 3), np.float32); N = np.zeros((size, size, 3), np.float32); C = np.zeros((size, size), bool)
    vn = m.vertex_normals
    for f in m.faces:
        t = uv[f] * size - 0.5
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        p = np.stack([xs, ys], -1).astype(np.float32)
        a, b, c = t
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12: continue
        l0 = ((b[1] - c[1]) * (p[..., 0] - c[0]) + (c[0] - b[0]) * (p[..., 1] - c[1])) / d
        l1 = ((c[1] - a[1]) * (p[..., 0] - c[0]) + (a[0] - c[0]) * (p[..., 1] - c[1])) / d
        l2 = 1 - l0 - l1
        ins = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not ins.any(): continue
        L = np.stack([l0, l1, l2], -1)[ins]
        yy, xx = ys[ins], xs[ins]
        P[yy, xx] = L @ m.vertices[f]; N[yy, xx] = L @ vn[f]; C[yy, xx] = True
    # entre les îlots : la valeur du pixel couvert le plus proche (pas de bavure au filtrage)
    from scipy import ndimage
    idx = ndimage.distance_transform_edt(~C, return_distances=False, return_indices=True)
    P = P[idx[0], idx[1]]; N = N[idx[0], idx[1]]
    N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    return P, N

_rng = np.random.default_rng(7)
_lat = _rng.random((64, 64, 64)).astype(np.float32)
def noise(P, freq):
    q = P * freq + 17.3
    i = np.floor(q).astype(int); f = q - i; f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * _lat[(i[..., 0] + dx) % 64, (i[..., 1] + dy) % 64, (i[..., 2] + dz) % 64]
    return out
def fbm(P, freq, oct=3):
    s, a, t = 0, 1, 0
    for k in range(oct):
        s += a * noise(P, freq * 2 ** k); t += a; a *= 0.5
    return s / t

def lum(c): return c @ np.array([0.299, 0.587, 0.114], np.float32)
def hexc(h): return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32) / 255
def sat(c):
    mx, mn = c.max(-1), c.min(-1); return (mx - mn) / (mx + 1e-6)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def gradmap(l, stops):
    """Luminance (0..1) → couleur le long des paliers [(position, couleur)]."""
    out = np.zeros(l.shape + (3,), np.float32)
    pos = [s[0] for s in stops]
    for k in range(3):
        out[..., k] = np.interp(l, pos, [s[1][k] for s in stops])
    return out
def norm_lum(img):
    l = lum(img); lo, hi = np.percentile(l, 3), np.percentile(l, 97)
    return np.clip((l - lo) / (hi - lo + 1e-6), 0, 1)

def save_glb(m, img, out):
    m2 = m.copy()
    tex = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    m2.visual.material = trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0, roughnessFactor=1)
    m2.export(out)
