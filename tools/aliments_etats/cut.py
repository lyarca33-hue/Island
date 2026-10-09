"""Les morceaux coupés (rondelles, tranches, quartiers), découpés dans les aliments Tripo : la peau garde
la texture du modèle, les faces coupées ont une petite texture peinte (chair, pépins, mie)."""
import sys, numpy as np, trimesh
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import ConvexHull
from bake import hexc, load

R = np.random.default_rng(3)
def col(h): return tuple(int(x) for x in (hexc(h) * 255))

# ——— faces coupées peintes : (u, v) de 0 à 1, centre 0,5, rayon 0,5 = le bord de la tranche ———
S = 256
def canvas(bg): im = Image.new('RGB', (S, S), col(bg)); return im, ImageDraw.Draw(im)
def circ(d, r, fill, cx=0.5, cy=0.5): d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=col(fill))
def soft(im, r=1.2): return im.filter(ImageFilter.GaussianBlur(r))

def face_carotte():
    im, d = canvas(0xe8792a); circ(d, 0.5, 0xd8641e); circ(d, 0.44, 0xee8a36); circ(d, 0.2, 0xf6a85a); return soft(im, 2)
def face_concombre():
    im, d = canvas(0x2f5a28); circ(d, 0.5, 0x2f5a28); circ(d, 0.45, 0xc8dc9a); circ(d, 0.3, 0xdae6b0)
    import math
    for k in range(10):
        a = k / 10 * 2 * math.pi; circ(d, 0.035, 0xb8cc84, 0.5 + 0.18 * math.cos(a), 0.5 + 0.18 * math.sin(a))
    return soft(im)
def face_banane():
    im, d = canvas(0xf3e6b0); circ(d, 0.5, 0xf3e6b0); circ(d, 0.16, 0xeadb98)
    import math
    for k in range(3):
        a = k / 3 * 2 * math.pi; circ(d, 0.03, 0x8a7040, 0.5 + 0.06 * math.cos(a), 0.5 + 0.06 * math.sin(a))
    return soft(im, 1.5)
def citrus(rim, pith, flesh, line, n=9):
    import math
    im, d = canvas(rim); circ(d, 0.5, rim); circ(d, 0.45, pith); circ(d, 0.41, flesh)
    for k in range(n):
        a = k / n * 2 * math.pi
        d.line([(0.5 * S, 0.5 * S), ((0.5 + 0.41 * math.cos(a)) * S, (0.5 + 0.41 * math.sin(a)) * S)], fill=col(line), width=4)
    circ(d, 0.05, line); return soft(im, 1.2)
def face_citron(): return citrus(0xf2d43a, 0xf8f0d0, 0xf6e46a, 0xfaf4d8)
def face_orange(): return citrus(0xf08a1a, 0xf8e0b0, 0xf59a2a, 0xfbd9a0, 10)
def face_tomate():
    import math
    im, d = canvas(0xd0352a); circ(d, 0.5, 0xc8302a); circ(d, 0.45, 0xe0483a)
    for k in range(4):
        a = k / 4 * 2 * math.pi + 0.4; cx, cy = 0.5 + 0.22 * math.cos(a), 0.5 + 0.22 * math.sin(a)
        circ(d, 0.12, 0xf08a70, cx, cy)
        for j in range(4): circ(d, 0.022, 0xf2d27a, cx + 0.06 * math.cos(j * 1.6), cy + 0.06 * math.sin(j * 1.6))
    circ(d, 0.08, 0xd8403a); return soft(im, 1.2)
def face_pomme():
    import math
    im, d = canvas(0xc8302a); circ(d, 0.5, 0xb8282a); circ(d, 0.47, 0xf4ead0); circ(d, 0.16, 0xece0bc)
    for k in range(5):
        a = k / 5 * 2 * math.pi; circ(d, 0.03, 0x6a4020, 0.5 + 0.09 * math.cos(a), 0.5 + 0.09 * math.sin(a))
    return soft(im, 1.2)
def crumb(base, hole, crust):
    im, d = canvas(crust); circ(d, 0.5, crust); circ(d, 0.46, base)
    for k in range(70):
        x, y = R.random(2); 
        if (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.38 ** 2: circ(d, 0.006 + R.random() * 0.012, hole, x, y)
    return soft(im, 1)
def face_pain(): return crumb(0xf2dcaa, 0xdcc08a, 0xb98a4a)
def face_pain_grille(): return crumb(0xd89a4a, 0xb87a34, 0x8a5426)

# ——— découpe ———
def section_hull(m, origin, normal, keep=None):
    """Là où le plan coupe le modèle : un contour convexe dans le plan (coordonnées 2D et leur base)."""
    sec = m.section(plane_origin=origin, plane_normal=normal)
    if sec is None: return None
    pts = np.asarray(sec.vertices)
    n = np.asarray(normal, float); n /= np.linalg.norm(n)
    a = np.cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(n, a)
    p2 = np.stack([(pts - origin) @ a, (pts - origin) @ b], 1)
    if keep is not None:
        k = keep(pts); p2 = p2[k]
    if len(p2) < 3: return None
    return p2, a, b
def cap(m, origin, normal, center2=None, radius=None, keep=None, extra=None):
    h = section_hull(m, origin, normal, keep)
    if h is None: return None
    p2, a, b = h
    if extra is not None: p2 = np.vstack([p2, extra(a, b)])
    hull = p2[ConvexHull(p2).vertices]
    c = hull.mean(0) if center2 is None else center2
    r = np.linalg.norm(hull - c, axis=1).max() if radius is None else radius
    ctr = hull.mean(0)
    V2 = np.vstack([ctr, hull]); n = len(hull)
    F = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
    V = origin + V2[:, :1] * a + V2[:, 1:] * b
    uv = 0.5 + (V2 - c) / (2 * r); uv[:, 1] = 1 - uv[:, 1]
    mesh = trimesh.Trimesh(V, np.array(F), process=False)
    # faces point along -normal (out of the kept side)
    if np.dot(mesh.face_normals[0], normal) > 0: mesh.faces = mesh.faces[:, ::-1]
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
    return mesh
def slab(m, ax, c0, c1):
    n = np.eye(3)[ax]; o0 = np.zeros(3); o0[ax] = c0; o1 = np.zeros(3); o1[ax] = c1
    skin = m.slice_plane(o0, n).slice_plane(o1, -n)
    caps = [c for c in (cap(m, o0, -n), cap(m, o1, n)) if c is not None]
    return skin, caps

def tex_mat(img): return trimesh.visual.material.PBRMaterial(baseColorTexture=img, metallicFactor=0, roughnessFactor=1)
def place(meshes, T):
    for g in meshes: g.apply_transform(T)
def rot(axis, deg): return trimesh.transformations.rotation_matrix(np.radians(deg), axis)
def tr(x, y, z): return trimesh.transformations.translation_matrix([x, y, z])

def build(skins, caps, skin_img, face_img, out, skin_override=None):
    """Un .glb : la peau (texture du modèle) et les faces coupées (texture peinte), posé à y = 0, centré."""
    sk = trimesh.util.concatenate([s for s in skins if len(s.faces)]) if skins else None
    cp = trimesh.util.concatenate(caps)
    allv = np.vstack([cp.vertices] + ([sk.vertices] if sk is not None else []))
    off = -np.array([(allv[:, 0].min() + allv[:, 0].max()) / 2, allv[:, 1].min(), (allv[:, 2].min() + allv[:, 2].max()) / 2])
    sc = trimesh.Scene()
    if sk is not None:
        sk.apply_translation(off)
        sk.visual = trimesh.visual.TextureVisuals(uv=sk.visual.uv, material=tex_mat(skin_override or skin_img))
        sc.add_geometry(sk, geom_name='peau')
    cp.apply_translation(off)
    cp.visual = trimesh.visual.TextureVisuals(uv=cp.visual.uv, material=tex_mat(face_img))
    sc.add_geometry(cp, geom_name='coupe')
    sc.export(out)
    ext = np.ptp(np.vstack([cp.vertices] + ([sk.vertices] if sk is not None else [])), 0)
    print(out, (ext * 100).round(1), 'cm')

def tex_of(m): return m.visual.material.baseColorTexture.convert('RGB')

def rondelles(name, ax, t0, t1, n, thick, face, out, layout='pile', skin=True, skin_img=None):
    m, _ = load(name); V = m.vertices; lo, hi = V[:, ax].min(), V[:, ax].max()
    centres = np.linspace(lo + t0 * (hi - lo), lo + t1 * (hi - lo), n)
    skins, caps = [], []
    # turn the slice axis to y (the slice lies flat)
    to_y = np.eye(4) if ax == 1 else rot([0, 0, 1], 90) if ax == 0 else rot([1, 0, 0], -90)
    cols = int(np.ceil(np.sqrt(n))) if layout == 'pile' else n
    for i, c in enumerate(centres):
        s, cs = slab(m, ax, c - thick / 2, c + thick / 2)
        parts = ([s] if skin else []) + cs
        o = np.zeros(3); o[ax] = -c
        for g in parts:
            g.apply_translation(o); g.apply_transform(to_y)
            # centre this slice on its own axis
        allv = np.vstack([g.vertices for g in parts]); ctr = (allv.min(0) + allv.max(0)) / 2
        w = np.ptp(allv, 0)
        for g in parts: g.apply_translation([-ctr[0], -allv[:, 1].min(), -ctr[2]])
        if layout == 'pile':
            gx, gz = i % cols, i // cols
            T = tr(gx * w[0] * 0.85 + R.normal() * 0.003, (i % 2) * thick * 0.6, gz * w[2] * 0.85 + R.normal() * 0.003) @ rot([0, 1, 0], R.random() * 360) @ rot([1, 0, 0], R.normal() * 6)
        else:  # row of overlapping slices, each a bit raised
            T = tr(i * w[0] * 0.6, i * thick * 0.55, 0) @ rot([0, 0, 1], -8)
        place(parts, T)
        if skin: skins.append(s)
        caps += cs
    build(skins, caps, tex_of(m), face, out, skin_img)

def quartiers(name, face, out):
    m, _ = load(name); V = m.vertices
    c = np.array([(V[:, 0].min() + V[:, 0].max()) / 2, (V[:, 1].min() + V[:, 1].max()) / 2, (V[:, 2].min() + V[:, 2].max()) / 2])
    rad = np.ptp(V, 0).max() / 2
    skins, caps = [], []
    for k, (sx, sz) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
        nx, nz = np.array([sx, 0, 0.]), np.array([0, 0, sz * 1.])
        s = m.slice_plane(c, nx).slice_plane(c, nz)
        # the two cut faces: plane x = cx keeping z on the wedge side, plane z = cz keeping x on the wedge side
        axis_pts = lambda a, b, nn: np.array([[(c + [0, y, 0] - c) @ a, (c + [0, y, 0] - c) @ b] for y in (V[:, 1].min() - c[1] + 0.004, V[:, 1].max() - c[1] - 0.004)])
        c1 = cap(m, c, -nx, center2=None, radius=rad, keep=lambda p: (p[:, 2] - c[2]) * sz >= 0, extra=lambda a, b: axis_pts(a, b, nx))
        c2 = cap(m, c, -nz, center2=None, radius=rad, keep=lambda p: (p[:, 0] - c[0]) * sx >= 0, extra=lambda a, b: axis_pts(a, b, nz))
        # paint centre = the fruit's axis on that face
        for cc in (c1, c2):
            if cc is None: continue
            # recompute uv relative to the fruit axis
            n_ = cc.face_normals[0]; a = np.cross(n_, [0, 1, 0]); a /= np.linalg.norm(a); b = np.cross(n_, a)
            q = cc.vertices - c; uv = 0.5 + np.stack([q @ a, q @ b], 1) / (2 * rad); uv[:, 1] = 1 - uv[:, 1]
            cc.visual = trimesh.visual.TextureVisuals(uv=uv)
        parts = [s] + [cc for cc in (c1, c2) if cc is not None]
        d = np.array([sx, 0, sz]) / np.sqrt(2) * 0.018
        place(parts, tr(*d))
        skins.append(s); caps += parts[1:]
    build(skins, caps, tex_of(m), face, out)

if __name__ == '__main__':
    which = sys.argv[1:]
    J = lambda k: not which or k in which
    if J('carotte'): rondelles('carotte', 2, 0.18, 0.6, 9, 0.006, face_carotte(), 'out/rondelles-carotte.glb')
    if J('concombre'): rondelles('concombre', 2, 0.2, 0.8, 7, 0.006, face_concombre(), 'out/rondelles-concombre.glb')
    if J('banane'):
        # a banana is curved: straight cuts give odd shapes, so the slices are round discs (peeled, no skin)
        import math
        caps, sides = [], []
        for i in range(8):
            r, h = 0.016 + R.normal() * 0.001, 0.009
            cyl = trimesh.creation.cylinder(radius=r, height=h, sections=20)
            cyl.apply_transform(rot([1, 0, 0], 90))
            vv = cyl.vertices; uv = 0.5 + vv[:, [0, 2]] / (2 * r); uv[:, 1] = 1 - uv[:, 1]
            cyl.visual = trimesh.visual.TextureVisuals(uv=uv)
            gx, gz = i % 3, i // 3
            cyl.apply_transform(tr(gx * 0.03 + R.normal() * 0.003, h / 2 + (i % 2) * 0.004, gz * 0.03 + R.normal() * 0.003) @ rot([1, 0, 0], R.normal() * 8))
            caps.append(cyl)
        build([], caps, None, face_banane(), 'out/rondelles-banane.glb')
    if J('citron'): rondelles('citron', 0, 0.25, 0.75, 5, 0.005, face_citron(), 'out/rondelles-citron.glb')
    if J('tomate'): rondelles('tomate', 1, 0.15, 0.68, 4, 0.008, face_tomate(), 'out/tranches-tomate.glb', layout='row')
    if J('pain'):
        rondelles('pain', 0, 0.35, 0.65, 4, 0.012, face_pain(), 'out/tranches-pain.glb', layout='row')
    if J('grille'):
        m, img = load('pain')
        dark = Image.fromarray((np.clip(img * hexc(0xc89a70), 0, 1) * 255).astype(np.uint8))
        rondelles('pain', 0, 0.35, 0.65, 4, 0.012, face_pain_grille(), 'out/pain-grille.glb', layout='row', skin_img=dark)
    if J('pomme'): quartiers('pomme', face_pomme(), 'out/quartiers-pomme.glb')
    if J('orange'): quartiers('orange', face_orange(), 'out/quartiers-orange.glb')
