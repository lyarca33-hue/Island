"""Textures cuit et brûlé des aliments qui cuisent : out/<aliment>-cuit.glb, out/<aliment>-brule.glb."""
import sys, numpy as np
from bake import *

H = hexc
# par aliment : dégradé de la chair cuite (sombre, moyen, clair), ce qui garde sa couleur (gras, os), force des zones saisies
FOODS = {
  'steak':          dict(cooked=[H(0x4a2a18), H(0x7b4a2c), H(0xb07a48)], keep='fat', keepcol=H(0xe6c48a), sear=0.55),
  'poulet':         dict(cooked=[H(0x8a4a1e), H(0xc8803a), H(0xe8b060)], keep='bone', keepcol=None, sear=0.45),
  'poisson':        dict(cooked=[H(0xc8a070), H(0xf0dcc0), H(0xfaf0e0)], keep=None, sear=0.45, searcol=H(0xc89050)),
  'saucisses':      dict(cooked=[H(0x5a2e18), H(0x8a4a2a), H(0xb87a4a)], keep=None, sear=0.5),
  'pomme-de-terre': dict(cooked=[H(0x9a6428), H(0xd09a48), H(0xf0cc78)], keep=None, sear=0.6, searcol=H(0x8a5520)),
  'oignon':         dict(cooked=[H(0x7a4212), H(0xb0682a), H(0xd89a50)], keep=None, sear=0.5, searcol=H(0x5a3010)),
  'champignon':     dict(cooked=[H(0x5e4228), H(0x9a7a5a), H(0xcaa880)], keep=None, sear=0.35),
  # légumes colorés : leur teinte gardée, plus sombre et plus douce, avec des zones saisies
  'poivron':        dict(tint=True, mul=H(0xb89890), sear=0.7),
  'courgette':      dict(tint=True, mul=H(0xd8d890), sear=0.75, searcol=H(0x9a7a30)),
  'poireau':        dict(tint=True, mul=H(0xe8d098), sear=0.6, searcol=H(0xa88a40)),
}
BURNT = H(0x1e1813); BURNT2 = H(0x3a2a20)

def states(name):
    cfg = FOODS[name]
    m, img = load(name)
    P, N = raster(m, img.shape[0])
    l = norm_lum(img); s = sat(img)
    n1 = fbm(P, 45); n2 = fbm(P, 160, 2)
    # zones saisies : par taches, plus fortes sur les faces à plat (contre la poêle)
    flat = np.abs(N[..., 1])
    searmask = smooth(0.45, 0.75, n1 * 0.8 + n2 * 0.4) * (0.5 + 0.5 * flat) * cfg['sear']
    if cfg.get('tint'):
        cooked = img * cfg['mul']
        # un peu moins saturé
        g = lum(cooked)[..., None]; cooked = g + (cooked - g) * 0.8
        sear = cfg['searcol'] if 'searcol' in cfg else cooked * 0.45 + H(0x5a3a1e) * 0.3
    else:
        cooked = gradmap(l, [(0, cfg['cooked'][0]), (0.55, cfg['cooked'][1]), (1, cfg['cooked'][2])])
        sear = cfg.get('searcol', cfg['cooked'][0] * 0.9)
    keep = np.zeros(l.shape, np.float32)
    if cfg.get('keep') == 'fat':
        keep = smooth(0.62, 0.8, l) * (1 - smooth(0.25, 0.45, s))
    if cfg.get('keep') == 'bone':
        V = m.vertices; ax = int(np.argmax(np.ptp(V, 0))); lo, hi = V[:, ax].min(), V[:, ax].max()
        t = (V[:, ax] - lo) / (hi - lo); others = [k for k in range(3) if k != ax]
        r = lambda sel: np.ptp(V[sel][:, others], 0).max()
        thin_hi = r(t > 0.9) < r(t < 0.1)
        u = (P[..., ax] - lo) / (hi - lo); u = u if thin_hi else 1 - u
        keep = smooth(0.8, 0.86, u) * smooth(0.55, 0.75, l)
    if cfg.get('keep') in ('fat', 'bone'):
        if cfg['keep'] == 'fat': cooked = cooked * (1 - keep[..., None]) + cfg['keepcol'] * keep[..., None]
        else: cooked = cooked * (1 - keep[..., None]) + (img * 0.92 + H(0xf0e6d0) * 0.08) * keep[..., None]
    sm = searmask[..., None] * (1 - keep[..., None])
    cooked = cooked * (1 - sm) + (sear if np.ndim(sear) == 3 else sear) * sm
    # un peu du relief de la texture d'origine, pour que ce ne soit pas plat
    cooked = cooked * (0.85 + 0.3 * (l[..., None] - 0.5) * 0.5 + 0.1)
    # brûlé : surtout du charbon, quelques zones encore brunes, l'os grisé
    patch = smooth(0.42, 0.62, n1 * 0.7 + n2 * 0.5)
    burnt = BURNT * (1 - patch[..., None]) + (BURNT2 * 0.6 + cooked * 0.25) * patch[..., None]
    burnt = burnt * (0.9 + 0.25 * l[..., None])
    if cfg.get('keep') == 'bone': burnt = burnt * (1 - keep[..., None]) + H(0x8a8478) * keep[..., None]
    return m, img, P, N, cooked, burnt

if __name__ == '__main__':
    for name in sys.argv[1:] or FOODS:
        m, img, P, N, cooked, burnt = states(name)
        save_glb(m, cooked, f'out/{name}-cuit.glb'); save_glb(m, burnt, f'out/{name}-brule.glb')
        print(name)
