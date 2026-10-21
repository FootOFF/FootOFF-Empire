"""Bouquets de feuillage photo (atlas 2 x 2) pour les arbres et les haies.

    python -I tools/vegetation/clusters.py
    -> assets-src/vegetation-baked/<type>_color.webp (RGBA) et <type>_normal.webp (normales, repere de la carte)

Chaque case est composee en 2D a partir des vraies feuilles, aiguilles et rameaux scannes (Poly Haven, CC0,
assets-src/vegetation/), poses un a un de l'arriere vers l'avant (les plus en arriere assombris), chacun tourne,
incline (raccourci) et avec sa propre carte de relief tournee d'autant :
- feuillus et haies : masse de feuilles dense et bombee, a contour irregulier (une touffe du houppier) ;
- pin : touffe d'aiguilles rayonnante ;
- sapin : rameau plat en plume (axe, rameaux lateraux plus courts vers la base et la pointe).
Le resultat sert de texture aux cartes de feuillage des arbres (build_trees.py).

Repere des cases : normales GL (x droite, y haut, z vers l'observateur) ; rameau de sapin attache en bas au centre.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets-src', 'vegetation')
OUT = os.path.join(ROOT, 'assets-src', 'vegetation-baked')
CELL = 1024  # composition d'une case (reduite de moitie a l'enregistrement : anticrenelage)

# Elements des atlas : rectangle (u0, v0, u1, v1, v vers le bas), base (attache) et pointe, en UV de l'atlas.
BROAD_LEAVES = [  # feuilles ovales de tree_small_02 : petiole a droite, pointe a gauche
    (0.06, 0.05, 0.195, 0.14), (0.03, 0.18, 0.18, 0.285), (0.06, 0.315, 0.215, 0.41), (0.06, 0.455, 0.215, 0.54),
    (0.045, 0.59, 0.19, 0.69), (0.075, 0.725, 0.22, 0.82), (0.075, 0.865, 0.205, 0.945), (0.235, 0.175, 0.37, 0.245),
    (0.245, 0.41, 0.405, 0.505), (0.26, 0.535, 0.415, 0.63), (0.28, 0.665, 0.42, 0.735), (0.265, 0.76, 0.43, 0.845),
    (0.285, 0.875, 0.435, 0.95),
]
BROAD = [dict(rect=r, base=(r[2], (r[1] + r[3]) / 2), tip=(r[0], (r[1] + r[3]) / 2), mask=True) for r in BROAD_LEAVES]
HEDGE = [dict(rect=r, base=b, tip=t, mask=True) for r, b, t in (
    ((0.13, 0.095, 0.235, 0.325), (0.137, 0.318), (0.215, 0.10)),
    ((0.53, 0.075, 0.615, 0.335), (0.57, 0.33), (0.555, 0.08)),
    ((0.605, 0.385, 0.695, 0.585), (0.67, 0.58), (0.635, 0.39)),
    ((0.235, 0.64, 0.33, 0.925), (0.295, 0.92), (0.29, 0.645)),
    ((0.375, 0.70, 0.485, 0.93), (0.455, 0.925), (0.41, 0.705)),
    ((0.555, 0.685, 0.64, 0.885), (0.615, 0.88), (0.585, 0.69)),
)]
FIR = [dict(rect=r, base=b, tip=t, mask=False) for r, b, t in (
    ((0.19, 0.04, 0.43, 0.315), (0.305, 0.31), (0.30, 0.05)),
    ((0.655, 0.035, 0.94, 0.375), (0.815, 0.37), (0.83, 0.045)),
    ((0.31, 0.395, 0.645, 0.785), (0.475, 0.78), (0.50, 0.41)),
    ((0.635, 0.445, 0.96, 0.835), (0.79, 0.83), (0.83, 0.46)),
    ((0.495, 0.255, 0.63, 0.40), (0.535, 0.395), (0.58, 0.27)),
)]
PINE = [dict(rect=r, base=b, tip=t, mask=True) for r, b, t in (
    ((0.03, 0.035, 0.225, 0.445), (0.135, 0.44), (0.13, 0.04)),
    ((0.65, 0.335, 0.94, 0.515), (0.66, 0.465), (0.93, 0.40)),
)]
# legere variation d'une case a l'autre (touffes plus jaunes, plus bleues, plus sombres)
CELL_TINTS = [(1.0, 1.0, 1.0), (1.06, 1.05, 0.88), (0.9, 0.96, 1.0), (1.0, 1.02, 0.95)]


def load_atlas(prefix):
    def find(*names):
        for n in names:
            p = os.path.join(SRC, n)
            if os.path.exists(p):
                return p
        raise FileNotFoundError(names)
    color = Image.open(find(f'{prefix}_diff_2k.jpg')).convert('RGB')
    alpha = Image.open(find(f'{prefix}_alpha_2k.jpg')).convert('L').resize(color.size)
    normal = Image.open(find(f'{prefix}_nor_gl_2k.jpg')).convert('RGB').resize(color.size)
    return np.asarray(color, np.float32) / 255, np.asarray(alpha, np.float32) / 255, np.asarray(normal, np.float32) / 127.5 - 1


def main_part(a):
    """Ne garde que la partie de l'element reliee a son centre : les fragments d'elements voisins, decoupes avec
    lui dans le rectangle, disparaissent."""
    solid = Image.fromarray(((a > 0.1) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    h, w = a.shape
    for y in np.linspace(h * 0.3, h * 0.7, 7).astype(int):
        for x in np.linspace(w * 0.3, w * 0.7, 7).astype(int):
            if solid.getpixel((int(x), int(y))) == 255:
                ImageDraw.floodfill(solid, (int(x), int(y)), 128)
    keep = np.asarray(solid) == 128
    return a * keep if keep.any() else a


def element_patch(atlas, el):
    """Decoupe un element : couleur, alpha (masque elliptique et partie principale seulement), normales ; rempli
    autour pour pouvoir le tourner. Renvoie aussi la base et l'axe (pixels du patch)."""
    color, alpha, normal = atlas
    H, W = alpha.shape
    u0, v0, u1, v1 = el['rect']
    x0, y0, x1, y1 = int(u0 * W), int(v0 * H), int(math.ceil(u1 * W)), int(math.ceil(v1 * H))
    c, a, n = color[y0:y1, x0:x1].copy(), alpha[y0:y1, x0:x1].copy(), normal[y0:y1, x0:x1].copy()
    if el['mask']:
        h, w = a.shape
        yy, xx = np.mgrid[0:h, 0:w]
        e = ((xx + 0.5 - w / 2) / (w * 0.5)) ** 2 + ((yy + 0.5 - h / 2) / (h * 0.52)) ** 2
        a *= np.clip((1.04 - e) / 0.08, 0, 1)
    a = main_part(a)
    base = (el['base'][0] * W - x0, el['base'][1] * H - y0)
    tip = (el['tip'][0] * W - x0, el['tip'][1] * H - y0)
    return c, a, n, base, tip


def pyramid(patch, levels=4):
    """Element a plusieurs echelles (1, 1/2, 1/4, 1/8) : une petite feuille se pose depuis une image a peine plus
    grande qu'elle, pas depuis le scan entier."""
    out = [patch]
    for _ in range(levels - 1):
        col, alp, nrm, base, tip = out[-1]
        h, w = alp.shape
        if min(h, w) < 24:
            break
        def half(x):
            x = x[:h // 2 * 2, :w // 2 * 2]
            return x.reshape(h // 2, 2, w // 2, 2, *x.shape[2:]).mean(axis=(1, 3))
        out.append((half(col), half(alp), half(nrm), (base[0] / 2, base[1] / 2), (tip[0] / 2, tip[1] / 2)))
    return out


def place(canvas, levels, attach, direction, length, tilt=0.0, pitch=0.0, shade=1.0):
    """Pose un element : sa base sur `attach` (pixels du canevas), son axe dans `direction` (radians, repere
    mathematique, y vers le haut), longueur `length` (pixels) ; tilt (rotation autour de l'axe) raccourcit la
    largeur, pitch (vers / loin de l'observateur) raccourcit la longueur ; les normales suivent."""
    patch = levels[0]
    for lv in levels[1:]:  # la plus petite echelle encore 1,5 fois plus longue que l'element pose
        b, t = lv[3], lv[4]
        if math.hypot(t[0] - b[0], t[1] - b[1]) < length * 1.5:
            break
        patch = lv
    col, alp, nrm, base, tip = patch
    h, w = alp.shape
    ax, ay = tip[0] - base[0], -(tip[1] - base[1])
    alpha0 = math.atan2(ay, ax)
    L0 = math.hypot(ax, ay)
    k = length / max(L0, 1)
    # 1) axe vertical (vers le haut)
    rot0 = math.degrees(math.pi / 2 - alpha0)
    rgba = np.dstack([col, alp, (nrm + 1) / 2]).astype(np.float32)  # 3 + 1 + 3 canaux
    layers = [Image.fromarray((rgba[..., i] * 255).astype(np.uint8)) for i in range(7)]
    # point de base suivi par une image repere
    def rot(img, deg, fill=0):
        return img.rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=fill)
    marker = Image.new('L', (w, h), 0)
    mr = max(3.0, 2.5 / k)  # reste visible une fois l'element reduit
    ImageDraw.Draw(marker).ellipse([base[0] - mr, base[1] - mr, base[0] + mr, base[1] + mr], fill=255)
    layers.append(marker)
    layers = [rot(im, rot0, 128 if 4 <= i <= 6 else 0) for i, im in enumerate(layers)]
    # 2) raccourcis (largeur : tilt ; longueur : pitch) et echelle
    W1, H1 = layers[0].size
    sw = max(2, int(W1 * k * max(0.18, math.cos(tilt))))
    sh = max(2, int(H1 * k * max(0.3, math.cos(pitch))))
    layers = [im.resize((sw, sh), Image.LANCZOS) for im in layers]
    # 3) direction voulue
    rot1 = math.degrees(direction - math.pi / 2)
    layers = [rot(im, rot1, 128 if 4 <= i <= 6 else 0) for i, im in enumerate(layers)]
    arr = np.dstack([np.asarray(im, np.float32) / 255 for im in layers[:7]])
    mk = np.asarray(layers[7], np.float32)
    ys, xs = np.nonzero(mk > mk.max() * 0.5)
    if not len(xs):
        return
    bx, by = xs.mean(), ys.mean()
    # normales : inclinaison (autour de l'axe, en repere axe vertical), puis rotation dans le plan
    n = arr[..., 4:7] * 2 - 1
    # le patch a deja tourne : on recompose la rotation totale des normales
    total = math.radians(rot0 + rot1)
    c, s = math.cos(total), math.sin(total)
    nx, ny, nz = n[..., 0] * 1, n[..., 1] * 1, n[..., 2] * 1
    # les valeurs ont ete tournees comme des pixels, pas comme des vecteurs : on tourne les vecteurs
    rx = nx * c - ny * s
    ry = nx * s + ny * c
    # inclinaison et tangage, exprimes dans le repere final (axe = direction)
    dx, dy = math.cos(direction), math.sin(direction)  # axe de l'element
    px, py = -dy, dx  # perpendiculaire dans le plan
    along = rx * dx + ry * dy
    across = rx * px + ry * py
    ct, st = math.cos(tilt), math.sin(tilt)
    across, nz2 = across * ct + nz * st, -across * st + nz * ct
    cp, sp = math.cos(pitch), math.sin(pitch)
    along, nz3 = along * cp + nz2 * sp, -along * sp + nz2 * cp
    rx = along * dx + across * px
    ry = along * dy + across * py
    nn = np.dstack([rx, ry, nz3])
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-6
    a = arr[..., 3:4]
    rgb = np.clip(arr[..., 0:3] * shade, 0, 1)
    # collage : base de l'element sur le point d'attache
    ox, oy = int(round(attach[0] - bx)), int(round(attach[1] - by))
    H, W = canvas['a'].shape
    y0, x0 = max(0, oy), max(0, ox)
    y1, x1 = min(H, oy + a.shape[0]), min(W, ox + a.shape[1])
    if y1 <= y0 or x1 <= x0:
        return
    sl = (slice(y0 - oy, y1 - oy), slice(x0 - ox, x1 - ox))
    A = a[sl]
    canvas['rgb'][y0:y1, x0:x1] = rgb[sl] * A + canvas['rgb'][y0:y1, x0:x1] * (1 - A)
    canvas['n'][y0:y1, x0:x1] = nn[sl] * A + canvas['n'][y0:y1, x0:x1] * (1 - A)
    canvas['a'][y0:y1, x0:x1] = A[..., 0] + canvas['a'][y0:y1, x0:x1] * (1 - A[..., 0])


def fit(p, ang, size, margin=0.045):
    """Longueur maximale pour que la pointe d'un element reste dans la case."""
    lo, hi = CELL * margin, CELL * (1 - margin)
    dx, dy = math.cos(ang), -math.sin(ang)
    best = size
    for c, d in ((p[0], dx), (p[1], dy)):
        if d > 1e-6:
            best = min(best, (hi - c) / d)
        elif d < -1e-6:
            best = min(best, (lo - c) / d)
    return max(size * 0.45, best * 0.96)


def bezier(p0, p1, p2, p3, n=24):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def twig(canvas, pts, width, color):
    """Brindille dessinee (tracee au double puis reduite : bords lisses)."""
    H, W = canvas['a'].shape
    img = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(len(pts) - 1):
        wi = max(2, int(width * 2 * (1 - 0.6 * i / len(pts))))
        d.line([tuple(pts[i] * 2), tuple(pts[i + 1] * 2)], fill=(*color, 255), width=wi)
    img = img.resize((W, H), Image.LANCZOS)
    arr = np.asarray(img, np.float32) / 255
    A = arr[..., 3]
    canvas['rgb'] = arr[..., :3] * A[..., None] + canvas['rgb'] * (1 - A[..., None])
    canvas['n'] = np.array([0, 0, 1.0])[None, None] * A[..., None] + canvas['n'] * (1 - A[..., None])
    canvas['a'] = A + canvas['a'] * (1 - A)


def new_canvas():
    return {'rgb': np.zeros((CELL, CELL, 3), np.float32), 'n': np.dstack([np.zeros((CELL, CELL, 2)), np.ones((CELL, CELL))]).astype(np.float32),
            'a': np.zeros((CELL, CELL), np.float32)}


def bulge(cv, c, R, k, axis=None):
    """Relief d'ensemble melange aux normales des elements : touffe bombee (dome), ou rameau bombe en travers
    (axis='x')."""
    yy, xx = np.mgrid[0:CELL, 0:CELL].astype(np.float32)
    dx = (xx - c[0]) / R
    dy = np.zeros_like(dx) if axis == 'x' else -(yy - c[1]) / R
    nd = np.dstack([dx, dy, np.ones_like(dx)])
    nd /= np.linalg.norm(nd, axis=-1, keepdims=True)
    n = cv['n'] * (1 - k) + nd * k
    cv['n'] = n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6)


def lay(cv, patches, items, r, shade):
    """Pose les elements de l'arriere vers l'avant ; les premiers (au fond) sont assombris."""
    items.sort(key=lambda x: x[0])
    for depth, p, ang, size, tilt, pitch in items:
        place(cv, patches[r.integers(len(patches))], (p[0], p[1]), ang, size, tilt, pitch, shade=shade[0] + shade[1] * depth)


def mass(patches, variant, seed, leaf, count, twig_color=(84, 74, 50)):
    """Feuillus et haies : masse de feuilles dense et bombee, un coeur et des lobes (contour irregulier), des
    brindilles qui en partent, des feuilles tournees plutot vers l'exterieur."""
    cv = new_canvas()
    r = np.random.default_rng(seed + variant)
    c = np.array([CELL * 0.5, CELL * 0.5])
    R = CELL * 0.4
    lobes = [(c, R * 0.6)]
    n = int(r.integers(5, 8))
    for k in range(n):
        a = 2 * math.pi * k / n + r.uniform(-0.35, 0.35)
        lobes.append((c + np.array([math.cos(a), -math.sin(a)]) * R * r.uniform(0.5, 0.64), R * r.uniform(0.3, 0.42)))
    for q, rq in lobes[1:]:  # brindilles : du coeur vers chaque lobe
        out = (q - c) / max(np.hypot(*(q - c)), 1)
        tip = q + out * rq * 0.6
        bend = np.array([-out[1], out[0]]) * r.uniform(-40, 40)
        twig(cv, bezier(c + out * 30, c + (tip - c) * 0.4 + bend, c + (tip - c) * 0.75 + bend * 0.5, tip, n=16), 3, twig_color)
    items = []
    while len(items) < count:
        p = c + r.uniform(-1, 1, 2) * R * 1.15
        # feuilles des lobes, et quelques-unes en frange au-dela (contour decoupe en feuilles, pas en lobes lisses)
        inside = min(np.hypot(*(p - q)) / rq for q, rq in lobes)
        if inside > 1.22 or (inside > 1 and r.uniform() > 0.18):
            continue
        ang = math.atan2(-(p[1] - c[1]), p[0] - c[0]) + r.normal(0, 0.9)
        size = CELL * r.uniform(*leaf)
        p = p - np.array([math.cos(ang), -math.sin(ang)]) * size * 0.5  # feuille centree sur le point tire
        items.append((r.uniform(), p, ang, fit(p, ang, size, 0.02), r.uniform(-1.1, 1.1), r.uniform(-0.7, 0.7)))
    lay(cv, patches, items, r, (0.5, 0.55))
    bulge(cv, c, R * 1.1, 0.35)
    return cv


def pad(patches, variant):
    """Pin sylvestre : touffe d'aiguilles, rameaux rayonnant depuis le centre (pas tout droit vers le bas)."""
    cv = new_canvas()
    r = np.random.default_rng(700 + variant)
    c = np.array([CELL * 0.5, CELL * 0.55])
    items = []
    n = int(r.integers(22, 28))
    for i in range(n):
        a = math.pi / 2 + (2 * math.pi * (i + r.uniform(-0.35, 0.35)) / n - math.pi) * 0.96
        p = c + np.array([math.cos(a), -math.sin(a)]) * CELL * r.uniform(0.0, 0.07)
        items.append((r.uniform(), p, a, fit(p, a, CELL * r.uniform(0.3, 0.44), 0.02), r.uniform(-0.9, 0.9), r.uniform(-0.5, 0.5)))
    for _ in range(12):  # coeur de la touffe : rameaux courts qui le traversent
        a = r.uniform(0, 2 * math.pi)
        size = CELL * r.uniform(0.18, 0.26)
        p = c - np.array([math.cos(a), -math.sin(a)]) * size * r.uniform(0.3, 0.6)
        items.append((r.uniform(), p, a, fit(p, a, size, 0.02), r.uniform(-0.9, 0.9), r.uniform(-0.5, 0.5)))
    lay(cv, patches, items, r, (0.55, 0.5))
    bulge(cv, c, CELL * 0.45, 0.35)
    return cv


def frond(patches, variant):
    """Sapin : rameau plat vu de dessus, en plume ; axe attache en bas au centre, rameaux lateraux de part et
    d'autre, plus longs au premier tiers, courts vers la pointe."""
    cv = new_canvas()
    r = np.random.default_rng(400 + variant)
    base = np.array([CELL * 0.5, CELL * 0.985])
    tip = np.array([CELL * (0.5 + r.uniform(-0.04, 0.04)), CELL * 0.05])
    axis = bezier(base, base + [r.uniform(-25, 25), -CELL * 0.33], tip + [r.uniform(-35, 35), CELL * 0.3], tip, n=48)
    twig(cv, axis, 6, (74, 58, 40))
    items = []
    n = 11
    for i in range(n):
        t = 0.04 + 0.86 * i / (n - 1)
        j = min(len(axis) - 2, int(t * (len(axis) - 1)))
        d = axis[j + 1] - axis[j]
        ang = math.atan2(-d[1], d[0])
        length = CELL * (0.12 + 0.36 * (1 - t) ** 0.7 * min(1.0, (t + 0.08) / 0.3)) * r.uniform(0.9, 1.1)
        for side in (-1, 1):
            a = ang + side * math.radians(r.uniform(40, 62))
            items.append((r.uniform(), axis[j], a, fit(axis[j], a, length, 0.02), r.uniform(-0.5, 0.5), r.uniform(-0.35, 0.2)))
    d = axis[-1] - axis[-9]
    a_tip = math.atan2(-d[1], d[0])
    items.append((1.0, axis[-14], a_tip, fit(axis[-14], a_tip, CELL * 0.22, 0.02), 0.0, 0.0))
    lay(cv, patches, items, r, (0.6, 0.45))
    bulge(cv, (CELL * 0.5, 0), CELL * 0.6, 0.3, axis='x')
    return cv


TYPES = {  # atlas source, elements, composition d'une case
    'broad': ('tree_small_02_leaves', BROAD, lambda p, v: mass(p, v, 500, leaf=(0.034, 0.052), count=2100)),
    'hedge': ('shrub_04', HEDGE, lambda p, v: mass(p, v, 600, leaf=(0.04, 0.06), count=2300)),
    'fir': ('fir_tree_01_twig', FIR, frond),
    'pine': ('pine_tree_01_twig', PINE, pad),
}


def bleed(rgb, a, rounds=24):
    """Etale la couleur sous les zones transparentes (pas de liseres sombres dans les mipmaps)."""
    rgb = rgb.copy()
    known = a > 0.02
    for _ in range(rounds):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = ~known & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        known = known | grow
    return rgb


def build(kind):
    prefix, elements, compose = TYPES[kind]
    atlas = load_atlas(prefix)
    patches = [pyramid(element_patch(atlas, el)) for el in elements]
    color = np.zeros((CELL * 2, CELL * 2, 4), np.float32)
    normal = np.zeros((CELL * 2, CELL * 2, 3), np.float32)
    for i in range(4):
        cv = compose(patches, i)
        y, x = (i // 2) * CELL, (i % 2) * CELL
        rgb = bleed(cv['rgb'] * np.array(CELL_TINTS[i], np.float32), cv['a'])
        color[y:y + CELL, x:x + CELL, :3] = rgb
        color[y:y + CELL, x:x + CELL, 3] = cv['a']
        normal[y:y + CELL, x:x + CELL] = cv['n'] * 0.5 + 0.5
    os.makedirs(OUT, exist_ok=True)
    c_img = Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8), 'RGBA').resize((CELL, CELL), Image.LANCZOS)
    n_img = Image.fromarray((np.clip(normal, 0, 1) * 255).astype(np.uint8), 'RGB').resize((CELL, CELL), Image.LANCZOS)
    c_img.save(os.path.join(OUT, f'{kind}_color.webp'), quality=92, method=6)
    n_img.save(os.path.join(OUT, f'{kind}_normal.webp'), quality=94, method=6)
    cover = (np.asarray(c_img)[..., 3] > 107).mean()
    print(kind, f'ok (couverture {cover:.0%})')


if __name__ == '__main__':
    for kind in TYPES:
        build(kind)
