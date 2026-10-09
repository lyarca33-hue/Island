"""Textures périmé : out/<aliment>-perime.glb (couleurs ternies, zones pourries, moisi)."""
import sys, numpy as np
from bake import *
H = hexc
MOLD = H(0x8a9a6a); FUZZ = H(0xe4e6da); ROT = H(0x6a4a2a); BLACK = H(0x2a2018)
# altération : rot (zone brune pourrie + points de moisi), old (vieilli), citrus (moisi bleu-vert), meat (terne, verdâtre), wilt (fané), banana, berries, bread
FOODS = {
  'steak': 'meat', 'poulet': 'meat', 'poisson': 'meat', 'saucisses': 'meat', 'jambon': 'meat',
  'pomme-de-terre': 'old', 'champignon': 'old', 'poivron': 'rot', 'courgette': 'rot', 'poireau': 'wilt',
  'pomme': 'rot', 'banane': 'banana', 'orange': 'citrus', 'citron': 'citrus', 'fraises': 'berries', 'raisin': 'old',
  'poire': 'rot', 'tomate': 'rot', 'carotte': 'wilt', 'concombre': 'rot', 'salade': 'wilt',
  'pain': 'bread', 'baguette': 'bread', 'fromage': 'bread',
}
def desat(c, k):
    g = lum(c)[..., None]; return g + (c - g) * k
def mix(a, b, t): return a * (1 - t[..., None]) + b * t[..., None]

def spoil(name):
    kind = FOODS[name]
    m, img = load(name); P, N = raster(m, img.shape[0])
    l = norm_lum(img); s = sat(img)
    size = np.ptp(m.vertices, 0).max()
    big = fbm(P, 2.2 / size, 2)        # une ou deux grandes zones sur l'objet
    small = fbm(P, 14 / size, 2)       # les points
    out = desat(img, 0.65) * 0.88
    dots = smooth(0.66, 0.70, small)
    if kind == 'meat':
        out = mix(desat(img, 0.7) * 0.88, H(0x9a9070), smooth(0.5, 0.7, big) * 0.35)
        out = mix(out, MOLD, smooth(0.69, 0.72, small) * 0.7)
    elif kind in ('rot', 'old'):
        patch = smooth(0.58, 0.64, big) if kind == 'rot' else smooth(0.5, 0.7, big) * 0.5
        out = mix(out, ROT * (0.8 + 0.3 * l[..., None]), patch)
        out = mix(out, FUZZ, dots * (0.9 if kind == 'rot' else 0.35))
        if kind == 'old': out = mix(out, ROT * 0.7, smooth(0.62, 0.68, small) * 0.6)
    elif kind == 'citrus':
        patch = smooth(0.64, 0.68, big)
        ring = smooth(0.61, 0.64, big) * (1 - patch)
        out = mix(out, H(0x6f9a86), patch); out = mix(out, FUZZ, ring * 0.9)
        out = mix(out, FUZZ, dots * patch)
    elif kind == 'banana':
        out = mix(img * H(0xb08850), BLACK, smooth(0.6, 0.66, fbm(P, 30 / size, 2)) * 0.9)
        out = mix(out, H(0x5a3a1e), smooth(0.5, 0.7, big) * 0.6)
    elif kind == 'berries':
        red = smooth(0.25, 0.45, s) * (img[..., 0] > img[..., 1] * 1.3)
        out = mix(img, desat(img, 0.5) * 0.7, red.astype(np.float32))
        out = mix(out, FUZZ * 0.92, dots * red * 1.0)
        out = mix(out, H(0x8a7a40), (img[..., 1] > img[..., 0]) * 0.6)
    elif kind == 'wilt':
        green = (img[..., 1] > img[..., 0] * 1.05).astype(np.float32)
        out = mix(out, desat(img, 0.5) * H(0xe0d090), green * 0.8)
        out = mix(out, ROT, smooth(0.6, 0.66, small) * 0.8)
        out = mix(out, ROT * 0.9, smooth(0.55, 0.62, big) * 0.6)
    elif kind == 'bread':
        out = desat(img, 0.75) * 0.95
        spots = smooth(0.69, 0.71, small)
        out = mix(out, H(0x6a8a7a), spots); out = mix(out, FUZZ, smooth(0.665, 0.69, small) * (1 - spots) * 0.8)
    return m, out

if __name__ == '__main__':
    for name in sys.argv[1:] or FOODS:
        m, out = spoil(name); save_glb(m, out, f'out/{name}-perime.glb'); print(name)
