"""FootOFF Empire - generateur de la ville autour du complexe (prop_city).

Ville francaise moderne, fixe, qui entoure la plateforme du site (build_site.py) et s'estompe dans la brume :
trame de rues de 80 m peinte dans la texture du sol (halos des reverberes la nuit), ilots d'immeubles
haussmanniens a toits de zinc (lucarnes, cheminees, balcons filants) melanges a des immeubles modernes, detailles
pres du complexe et simplifies au loin. Le boulevard sud et son tram se prolongent jusqu'a l'horizon. Reperes :
la gare (horloge, verriere, TGV a quai), une eglise a fleche, un jardin public et son kiosque, des places
arborees et quelques tours au loin. Les fenetres s'allument la nuit (materiaux emissive_*).

Repere Blender en metres (x est, y nord ; jeu : x / 10, z = -y / 10), origine = centre du stade.

Lancement :
    blender -b --factory-startup -P tools/blender/models/build_city.py
puis export : blender assets-src/blend/city.blend -b -P tools/blender/footoff_export.py -- --only prop_city
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import GOLD, GOLD_LIGHT, Builder, Matrix, bpy, fbm, find_repo, material, mix, np, to_image  # noqa: E402
from footoff_modern import ellipsoid, modern_materials  # noqa: E402

R = np.random.default_rng(11)  # ville reproductible

SITE = (-300.0, -230.0, 300.0, 280.0)       # plateforme du complexe (build_site.py)
CITY = (-1080.0, -885.0, 1080.0, 1115.0)
GRID, GX0, GY0 = 80.0, 40.0, -165.0         # axes des rues : x = 40 + 80 i, y = -165 + 80 j
ROAD_HALF, WALK = 7.0, 3.0
AVENUE = (-1080.0, -187.5, 1080.0, -142.5)  # prolongement du boulevard sud (memes cotes que le site)
TRAM_Y = (-161.5, -168.5)
GARE = (365.0, -142.5, 1080.0, -38.0)       # gare, voies et faisceau ferre vers l'est
PARK = (370.0, 325.0, 510.0, 465.0)         # jardin public (deux ilots sur deux)
CHURCH = (-590.0, 405.0, -530.0, 465.0)     # eglise et son parvis
TOWERS = [(-700.0, 860.0, 34.0, 112.0), (-785.0, 790.0, 30.0, 92.0), (-625.0, 945.0, 28.0, 78.0)]
PLACES = [(-640.0, 35.0), (640.0, 355.0), (-160.0, -365.0), (160.0, 595.0), (-480.0, -285.0)]  # centres d'ilots (x = 80 k, y = -125 + 80 k)
NEAR = 650.0                                # au-dela : immeubles simplifies (dans la brume)
WARM = np.array([1.0, 0.78, 0.48])


# =============================================================== textures

def grid_xy(w, h, mx, my):
    return np.meshgrid((np.arange(w) + 0.5) / w * mx, (np.arange(h) + 0.5) / h * my)


def tex_ground():
    """Tuile de 80 x 80 m centree sur un carrefour : enrobe, bordures, trottoirs, cour d'ilot, marquages.
    Image d'emission : halos des reverberes le long des trottoirs (la nuit)."""
    S, m = 1024, GRID
    u, v = grid_xy(S, S, m, m)
    du, dv = np.minimum(u, m - u), np.minimum(v, m - v)
    road = (du < ROAD_HALF) | (dv < ROAD_HALF)
    walk = ((du < ROAD_HALF + WALK) | (dv < ROAD_HALF + WALK)) & ~road
    n = fbm(S, S, 20, 3)
    rgb = np.zeros((S, S, 3))
    rgb[:] = (np.array([0.40, 0.38, 0.35]) * (0.9 + 0.2 * n)[..., None])  # cour d'ilot pavee
    asph = 0.095 + 0.03 * (n - 0.5)
    rgb[road] = np.stack([asph, asph, asph * 1.05], -1)[road]
    slab = ((u % 1.2) < 0.03) | ((v % 1.2) < 0.03)
    walk_col = np.array([0.56, 0.55, 0.52]) * (0.95 + 0.08 * n)[..., None]
    rgb[walk] = walk_col[walk]
    rgb[walk & slab] *= 0.85
    curb = ((np.abs(du - ROAD_HALF) < 0.22) & (dv > ROAD_HALF)) | ((np.abs(dv - ROAD_HALF) < 0.22) & (du > ROAD_HALF))
    rgb[curb] = [0.70, 0.69, 0.66]
    white = np.array([0.86, 0.86, 0.84])
    dash_x = (du < 0.1) & ((v % 9) < 3) & (dv > ROAD_HALF + WALK)
    dash_y = (dv < 0.1) & ((u % 9) < 3) & (du > ROAD_HALF + WALK)
    zebra_x = (du < ROAD_HALF - 0.6) & (dv > ROAD_HALF + 0.6) & (dv < ROAD_HALF + 3.8) & ((u % 1.0) < 0.5)
    zebra_y = (dv < ROAD_HALF - 0.6) & (du > ROAD_HALF + 0.6) & (du < ROAD_HALF + 3.8) & ((v % 1.0) < 0.5)
    for mk in (dash_x, dash_y, zebra_x, zebra_y):
        rgb[mk] = white
    # halos : un reverbere tous les 25 m sur chaque trottoir
    glow = np.zeros((S, S))
    for k in range(4):
        c = 12.5 + 25 * k
        for side in (ROAD_HALF + 1.2, m - ROAD_HALF - 1.2):
            glow = np.maximum(glow, np.exp(-(((u - side) ** 2 + (v - c) ** 2) / 22.0)))
            glow = np.maximum(glow, np.exp(-(((v - side) ** 2 + (u - c) ** 2) / 22.0)))
    emis = WARM * (glow * 0.85)[..., None]
    return to_image("city_ground", rgb), to_image("city_ground_night", emis)


def tex_haussmann():
    """Facade haussmannienne 24 x 24 m : pierre de taille, vitrines et auvents au rez-de-chaussee, six niveaux de
    portes-fenetres, balcons filants au 2e et au 5e, corniches. Emission : fenetres et vitrines allumees au hasard."""
    S = 1024
    X, Z = grid_xy(S, S, 24, 24)
    stone = np.array([0.84, 0.78, 0.66])
    n = fbm(S, S, 24, 3)
    rgb = stone * (0.93 + 0.1 * n)[..., None]
    emis = np.zeros_like(rgb)
    rgb[(Z < 7.4) & ((Z % 0.5) < 0.04)] *= 0.82  # bossage
    for zc in (4.45, 7.35, 16.35, 19.35):
        rgb[(Z > zc) & (Z < zc + 0.22)] = stone * 1.06
        rgb[(Z > zc - 0.08) & (Z <= zc)] *= 0.7
    bay = np.floor(X / 3.0).astype(int)
    bx = X - bay * 3.0
    lit = R.random((8, 7)) < 0.4
    shop = (bx > 0.3) & (bx < 2.7) & (Z > 0.3) & (Z < 3.3)
    rgb[shop] = [0.10, 0.12, 0.14]
    shop_lit = shop & (R.random(8) < 0.7)[bay]
    emis[shop_lit] = WARM * 0.9
    awn = np.array([(0.14, 0.26, 0.18), (0.48, 0.12, 0.12), (0.12, 0.16, 0.32), (0.18, 0.18, 0.19)])
    awning = (bx > 0.2) & (bx < 2.8) & (Z > 3.3) & (Z < 3.95)
    rgb[awning] = awn[(bay * 3) % 4][awning]
    for k in range(6):
        z0 = 4.5 + 3 * k
        win = (bx > 0.85) & (bx < 2.15) & (Z > z0 + 0.45) & (Z < z0 + 2.65)
        frame = win & ((bx < 0.93) | (bx > 2.07) | (Z < z0 + 0.53) | (Z > z0 + 2.57) | (np.abs(bx - 1.5) < 0.035)
                       | (np.abs(Z - (z0 + 1.95)) < 0.03))
        rgb[win] = [0.14, 0.16, 0.20]
        rgb[frame] = [0.90, 0.89, 0.86]
        glass = win & ~frame & lit[bay, k + 1]
        emis[glass] = WARM * 0.85
    for k in (1, 4):
        z0 = 4.5 + 3 * k
        bal = (Z > z0 + 0.05) & (Z < z0 + 1.15)
        bars = bal & (((X % 0.14) < 0.03) | (Z < z0 + 0.13) | (Z > z0 + 1.07))
        rgb[bars] = [0.07, 0.07, 0.08]
        emis[bars] = 0
        rgb[(Z > z0 - 0.06) & (Z < z0 + 0.05)] = stone * 0.72
    return to_image("haussmann", rgb), to_image("haussmann_night", emis)


def tex_modern(name, panel):
    """Facade moderne 24 x 24 m : rez-de-chaussee vitre, fenetres en bandeau a meneaux, allèges unies."""
    S = 1024
    X, Z = grid_xy(S, S, 24, 24)
    n = fbm(S, S, 16, 3)
    rgb = np.asarray(panel) * (0.96 + 0.06 * n)[..., None]
    emis = np.zeros_like(rgb)
    mull = (X % 1.5) < 0.06
    ground = (Z > 0.25) & (Z < 4.2)
    rgb[ground] = [0.10, 0.13, 0.16]
    rgb[ground & mull] = [0.62, 0.63, 0.65]
    emis[ground & ~mull & (R.random(16) < 0.6)[np.floor(X / 1.5).astype(int) % 16]] = np.array([0.95, 0.92, 0.82]) * 0.8
    cell = np.floor(X / 1.5).astype(int) % 16
    lit = R.random((16, 7)) < 0.3
    for k in range(6):
        z0 = 4.5 + 3 * k
        win = (Z > z0 + 0.85) & (Z < z0 + 2.75)
        rgb[win] = [0.12, 0.15, 0.19]
        rgb[win & mull] = np.asarray(panel) * 0.85
        emis[win & ~mull & lit[cell, k]] = np.array([0.96, 0.94, 0.86]) * 0.8
    return to_image(name, rgb), to_image(name + "_night", emis)


def tex_mansard():
    """Brisis de zinc 3 x 4,5 m : joints debout tous les 50 cm, une lucarne par travee, chenau en pied."""
    W, H = 256, 384
    X, Z = grid_xy(W, H, 3.0, 4.5)
    zinc = np.array([0.40, 0.44, 0.49])
    rgb = zinc * (0.95 + 0.08 * fbm(H, W, 8, 2))[..., None]
    rgb[(X % 0.5) < 0.035] *= 0.82
    rgb[Z < 0.18] = [0.28, 0.29, 0.31]
    lu = (X > 0.85) & (X < 2.15) & (Z > 1.1) & (Z < 3.25)
    rgb[lu] = [0.85, 0.82, 0.75]
    rgb[(X > 1.0) & (X < 2.0) & (Z > 1.25) & (Z < 3.0)] = [0.13, 0.15, 0.19]
    rgb[(X > 0.75) & (X < 2.25) & (Z > 3.25) & (Z < 3.6)] = [0.80, 0.77, 0.70]
    return to_image("mansard", rgb)


def tex_ashlar():
    """Pierre de taille 4 x 4 m : assises de 50 cm, blocs de 1 m a joints decales."""
    S = 512
    X, Z = grid_xy(S, S, 4.0, 4.0)
    row = np.floor(Z / 0.5)
    xx = X + (row % 2) * 0.5
    joint = ((Z % 0.5) < 0.025) | ((xx % 1.0) < 0.02)
    tint = R.random((8, 4))[row.astype(int) % 8, np.floor(xx).astype(int) % 4]
    base = np.array([0.80, 0.75, 0.64]) * (0.94 + 0.08 * tint + 0.06 * fbm(S, S, 16, 2))[..., None]
    return to_image("ashlar", mix(base, base * 0.78, joint.astype(float)))


def city_materials():
    mats = modern_materials()
    g, gn = tex_ground()
    h, hn = tex_haussmann()
    ml, mln = tex_modern("modern_light", (0.86, 0.86, 0.84))
    md, mdn = tex_modern("modern_dark", (0.25, 0.26, 0.28))
    mats.update({
        "emissive_city_ground": material("emissive_city_ground", image=g, rough=0.95, emission_map=gn, strength=1.0),
        "emissive_haussmann": material("emissive_haussmann", image=h, rough=0.85, emission_map=hn, strength=1.2),
        "emissive_modern_light": material("emissive_modern_light", image=ml, rough=0.5, emission_map=mln, strength=1.1),
        "emissive_modern_dark": material("emissive_modern_dark", image=md, rough=0.45, emission_map=mdn, strength=1.1),
        "zinc": material("zinc", image=tex_mansard(), rough=0.5, metal=0.4),
        "zinc_flat": material("zinc_flat", (0.36, 0.40, 0.45), rough=0.5, metal=0.4),
        "slate": material("slate", (0.20, 0.22, 0.25), rough=0.6, metal=0.2),
        "chimney": material("chimney", (0.62, 0.38, 0.30), rough=0.9),
        "stone": material("stone", image=tex_ashlar(), rough=0.85),
        "emissive_glass_warm": material("emissive_glass_warm", (0.30, 0.36, 0.42), rough=0.06, metal=0.6,
                                        emission=(1.0, 0.82, 0.55), strength=1.4),
        "shed_glass": material("shed_glass", (0.62, 0.67, 0.72), rough=0.2, metal=0.35),
        "train_white": material("train_white", (0.92, 0.92, 0.91), rough=0.3, metal=0.2),
        "train_dark": material("train_dark", (0.16, 0.17, 0.19), rough=0.35, metal=0.4),
        "gold_paint": material("gold_paint", GOLD, rough=0.4, metal=0.5),
        "gravel": material("gravel", (0.30, 0.27, 0.23), rough=1.0),
        "park_gravel": material("park_gravel", (0.70, 0.64, 0.50), rough=1.0),
    })
    return mats


# =============================================================== briques

def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def minus(r, e):
    """Plus grand rectangle de r hors de e (e touche r par un bord : bandes, emprises)."""
    if not overlaps(r, e):
        return r
    cands = [(r[0], r[1], min(r[2], e[0]), r[3]), (max(r[0], e[2]), r[1], r[2], r[3]),
             (r[0], r[1], r[2], min(r[3], e[1])), (r[0], max(r[1], e[3]), r[2], r[3])]
    cands = [c for c in cands if c[2] - c[0] > 0 and c[3] - c[1] > 0]
    return max(cands, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]), default=None)


def grow(r, m):
    return (r[0] - m, r[1] - m, r[2] + m, r[3] + m)


def ctree(B, x, y, h=9.0, r=2.6, z=0.0):
    """Arbre d'alignement economique (la ville en compte des centaines)."""
    B.box("wood", (x - 0.16, y - 0.16, z), (x + 0.16, y + 0.16, z + h * 0.45))
    ellipsoid(B, "foliage", (x, y, z + h * 0.62), r, r * 0.92, h * 0.36, segs=6, rings=4)


def lamp(B, x, y, ang, h=8.0, z=0.0):
    dx, dy = math.cos(ang) * 1.6, math.sin(ang) * 1.6
    B.cyl("black_metal", (x, y, z), (x, y, z + h), 0.09, 0.07, segs=5)
    B.box("emissive_light", (x + dx - 0.35, y + dy - 0.18, z + h - 0.05), (x + dx + 0.35, y + dy + 0.18, z + h + 0.12))
    B.box("black_metal", (min(x, x + dx), min(y, y + dy) - 0.04, z + h), (max(x, x + dx) + 0.04, max(y, y + dy) + 0.04, z + h + 0.1))


FACADES = {"h": "emissive_haussmann", "ml": "emissive_modern_light", "md": "emissive_modern_dark"}


def building(B, r, style, h, chimneys=True):
    """Immeuble : facade texturee (fenetres alignees sur la trame du monde), toit a la Mansart en zinc pour
    l'haussmannien, toit-terrasse pour le moderne."""
    x0, y0, x1, y1 = r
    mat = FACADES[style]
    B.hexa(mat, [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0), (x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h)],
           tile=(24, 24), skip={0, 1})
    if style == "h":
        ins = min(2.1, (x1 - x0) / 2 - 1.0, (y1 - y0) / 2 - 1.0)
        top = h + 4.5
        B.hexa("zinc", [(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h),
                        (x0 + ins, y0 + ins, top), (x1 - ins, y0 + ins, top), (x1 - ins, y1 - ins, top), (x0 + ins, y1 - ins, top)],
               tile=(3.0, 4.5), origin=(0, 0, h), skip={0, 1})
        B.box("zinc_flat", (x0 + ins, y0 + ins, top - 0.06), (x1 - ins, y1 - ins, top))
        if chimneys and R.random() < 0.7:
            for _ in range(1 + int(R.random() < 0.4)):
                cx = R.uniform(x0 + ins + 0.6, x1 - ins - 0.6)
                cy = R.uniform(y0 + ins + 0.6, y1 - ins - 0.6)
                along_x = (x1 - x0) > (y1 - y0)
                hx, hy = (1.4, 0.4) if along_x else (0.4, 1.4)
                B.box("chimney", (cx - hx, cy - hy, top), (cx + hx, cy + hy, top + 1.4))
    else:
        B.box("roofing", (x0, y0, h - 0.05), (x1, y1, h + 0.45), tile=(8, 8))
        if (x1 - x0) > 16 and (y1 - y0) > 12 and R.random() < 0.35:  # attique en retrait
            b = 3.0
            B.hexa(mat, [(x0 + b, y0 + b, h + 0.45), (x1 - b, y0 + b, h + 0.45), (x1 - b, y1 - b, h + 0.45), (x0 + b, y1 - b, h + 0.45),
                         (x0 + b, y0 + b, h + 3.4), (x1 - b, y0 + b, h + 3.4), (x1 - b, y1 - b, h + 3.4), (x0 + b, y1 - b, h + 3.4)],
                   tile=(24, 24), skip={0, 1})
            B.box("roofing", (x0 + b, y0 + b, h + 3.35), (x1 - b, y1 - b, h + 3.6), tile=(8, 8))


def pick_style():
    t = R.random()
    return "h" if t < 0.62 else "ml" if t < 0.86 else "md"


def height_for(style):
    if style == "h":
        return 4.5 + 3 * int(R.choice([5, 5, 6]))
    return 4.5 + 3 * int(R.integers(5, 9))


def split(a, b, lo=12.0, hi=22.0):
    """Coupe [a, b] en troncons de lo a hi metres."""
    cuts = [a]
    while b - cuts[-1] > hi:
        cuts.append(cuts[-1] + R.uniform(lo, hi))
    if b - cuts[-1] < lo and len(cuts) > 1:
        cuts.pop()
    cuts.append(b)
    return list(zip(cuts, cuts[1:]))


def detailed_block(B, r):
    """Ilot ferme sur rue (cour au centre), immeubles de largeur et de hauteur variees."""
    x0, y0, x1, y1 = r
    style0 = pick_style()
    D = 13.0 if style0 == "h" else 15.0
    w, d = x1 - x0, y1 - y0
    if min(w, d) < 2 * D + 8:  # ilot etroit : une rangee pleine, coupee dans la longueur
        if w >= d:
            strips = [((a, y0, b, y1), "x") for a, b in split(x0, x1)]
        else:
            strips = [((x0, a, x1, b), "y") for a, b in split(y0, y1)]
        for seg, _ in strips:
            style = style0 if R.random() < 0.75 else pick_style()
            building(B, seg, style, height_for(style))
        return
    for (a, b) in split(x0, x1):
        for yy0, yy1 in ((y0, y0 + D), (y1 - D, y1)):
            style = style0 if R.random() < 0.75 else pick_style()
            building(B, (a, yy0, b, yy1), style, height_for(style))
    for (a, b) in split(y0 + D, y1 - D):
        for xx0, xx1 in ((x0, x0 + D), (x1 - D, x1)):
            style = style0 if R.random() < 0.75 else pick_style()
            building(B, (xx0, a, xx1, b), style, height_for(style))
    if R.random() < 0.5:  # un arbre dans la cour
        ctree(B, (x0 + x1) / 2, (y0 + y1) / 2, 10, 3.2)


def simple_block(B, r):
    """Ilot lointain (dans la brume) : quatre corps de batiment d'une seule hauteur."""
    x0, y0, x1, y1 = r
    style = pick_style()
    h = height_for(style)
    D = 14.0
    if min(x1 - x0, y1 - y0) < 2 * D + 8:
        building(B, r, style, h, chimneys=False)
        return
    building(B, (x0, y0, x1, y0 + D), style, h, chimneys=False)
    building(B, (x0, y1 - D, x1, y1), style, h + (3 if R.random() < 0.3 else 0), chimneys=False)
    building(B, (x0, y0 + D, x0 + D, y1 - D), style, h, chimneys=False)
    building(B, (x1 - D, y0 + D, x1, y1 - D), style, h, chimneys=False)


def place(B, r):
    """Place arboree : dallage de pierre, fontaine, bancs, arbres en couronne."""
    x0, y0, x1, y1 = r
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    B.box("stone", (x0, y0, 0.0), (x1, y1, 0.12), tile=(4, 4))
    B.cyl("stone", (cx, cy, 0.0), (cx, cy, 0.6), 6.0, segs=20)
    B.cyl("water", (cx, cy, 0.0), (cx, cy, 0.52), 5.5, segs=20)
    B.cyl("stone", (cx, cy, 0.5), (cx, cy, 2.6), 0.6, 0.4, segs=10)
    B.cyl("stone", (cx, cy, 2.6), (cx, cy, 2.8), 1.6, segs=12)
    rr = min(x1 - x0, y1 - y0) / 2 - 7
    for k in range(10):
        a = 2 * math.pi * k / 10
        ctree(B, cx + rr * math.cos(a), cy + rr * math.sin(a), 10, 3.0, z=0.12)
    for k in range(4):
        a = math.pi / 4 + math.pi / 2 * k
        bx, by = cx + 11 * math.cos(a), cy + 11 * math.sin(a)
        B.box("wood", (bx - 1.2, by - 0.3, 0.12), (bx + 1.2, by + 0.3, 0.6))


# =============================================================== reperes

def avenue(B):
    """Boulevard sud prolonge dans la ville (memes cotes que le site) : deux chaussees, tram sur gazon, lampadaires,
    alignements d'arbres. Des deux cotes de la plateforme du site."""
    for s in (-1, 1):
        a, b = sorted((s * 300.0, s * 1080.0))
        B.box("paving", (a, -146.0, 0.0), (b, -142.5, 0.14), tile=(4.8, 4.8))
        B.box("asphalt", (a, -158.0, 0.0), (b, -146.0, 0.05), tile=(8, 8))
        B.box("lawn", (a, -172.0, 0.0), (b, -158.0, 0.12), tile=(8, 8))
        B.box("asphalt", (a, -184.0, 0.0), (b, -172.0, 0.05), tile=(8, 8))
        B.box("paving", (a, -187.5, 0.0), (b, -184.0, 0.14), tile=(4.8, 4.8))
        for yc in TRAM_Y:
            for dy in (-0.72, 0.72):
                B.box("steel", (a, yc + dy - 0.05, 0.0), (b, yc + dy + 0.05, 0.2))
            B.box("steel", (a, yc - 0.03, 6.25), (b, yc + 0.03, 6.31))
        for y in (-152.0, -178.0):  # axes discontinus
            x = a + 3
            while x + 3 < b:
                B.box("white", (x, y - 0.08, 0.0), (x + 3, y + 0.08, 0.1))
                x += 9
        ym = (TRAM_Y[0] + TRAM_Y[1]) / 2
        x = a + 16
        while x < b:
            if not (430 < abs(x) < 530 and s > 0):
                B.cyl("black_metal", (x, ym, 0.12), (x, ym, 7.2), 0.12, 0.09, segs=6)
                B.box("black_metal", (x - 0.06, TRAM_Y[1] - 0.3, 6.6), (x + 0.06, TRAM_Y[0] + 0.3, 6.75))
            x += 32
        x = a + 8
        k = 0
        while x < b:
            if k % 2 == 0:
                lamp(B, x, -144.3, -math.pi / 2, z=0.14)
                lamp(B, x, -185.8, math.pi / 2, z=0.14)
            else:
                ctree(B, x, -144.3, 9, 2.6, z=0.14)
                ctree(B, x, -185.8, 9, 2.6, z=0.14)
            x += 15
            k += 1
    # arret du tram devant la gare
    q0, q1 = TRAM_Y[0] - 1.6, TRAM_Y[1] + 1.6
    B.box("paving", (440, q1, 0.0), (520, q0, 0.35), tile=(4.8, 4.8))
    for x in range(446, 516, 12):
        B.cyl("black_metal", (x, (q0 + q1) / 2, 0.35), (x, (q0 + q1) / 2, 3.9), 0.1, segs=6)
    B.box("black_metal", (442, q1 - 0.6, 3.9), (518, q0 + 0.6, 4.15))
    B.box("emissive_light", (446, (q0 + q1) / 2 - 0.2, 3.75), (514, (q0 + q1) / 2 + 0.2, 3.9))


def arch_panel(B, mat, x0, x1, y, z0, z1, segs=12):
    """Baie cintree verticale (rectangle surmonte d'un demi-cercle) dans le plan y, face au sud."""
    cx, r = (x0 + x1) / 2, (x1 - x0) / 2
    pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1)]
    pts += [(cx + r * math.cos(math.pi * i / segs), y, z1 + r * math.sin(math.pi * i / segs)) for i in range(1, segs)]
    pts += [(x0, y, z1)]
    B.piece(mat, pts, [tuple(range(len(pts)))])


def clock(B, x, y, z, normal):
    """Cadran blanc cercle d'or sur une facade (normale horizontale selon x ou y), aiguilles noires."""
    nx, ny = normal
    B.cyl("white", (x, y, z), (x + nx * 0.25, y + ny * 0.25, z), 2.6, segs=24)
    B.cyl("gold_paint", (x - nx * 0.02, y - ny * 0.02, z), (x + nx * 0.2, y + ny * 0.2, z), 2.85, segs=24)
    px, py = x + nx * 0.3, y + ny * 0.3
    ax, ay = (0.08, 0.03) if ny else (0.03, 0.08)  # epaisseur : le long de la facade, puis vers l'exterieur
    B.box("black_metal", (px - ax, py - ay, z - 0.1), (px + ax, py + ay, z + 2.0))  # grande aiguille
    hx, hy = (1.4, 0.0) if ny else (0.0, 1.4)
    B.box("black_metal", (min(px, px + hx) - 0.03, min(py, py + hy) - 0.03, z - 0.07),
          (max(px, px + hx) + 0.03, max(py, py + hy) + 0.03, z + 0.07))  # petite aiguille


def train(B, x0, y, cars, livery):
    """Rame a grande vitesse a quai : motrice profilee, voitures, bandeau vitre et liseré or."""
    body = "train_white" if livery == 0 else "train_dark"
    for k in range(cars):
        a, b = x0 + k * 20.0, x0 + k * 20.0 + 19.5
        B.box(body, (a, y - 1.45, 0.45), (b, y + 1.45, 4.1))
        B.box("glass", (a + 0.8, y - 1.48, 2.3), (b - 0.8, y + 1.48, 3.05))
        B.box("gold_paint", (a, y - 1.47, 1.45), (b, y + 1.47, 1.62))
    B.hexa(body, [(x0 - 7, y - 1.2, 0.45), (x0, y - 1.45, 0.45), (x0, y + 1.45, 0.45), (x0 - 7, y + 1.2, 0.45),
                  (x0 - 2.5, y - 1.0, 2.6), (x0, y - 1.45, 4.1), (x0, y + 1.45, 4.1), (x0 - 2.5, y + 1.0, 2.6)], skip={0})
    B.hexa("glass", [(x0 - 2.3, y - 1.0, 2.62), (x0 - 0.4, y - 1.38, 3.75), (x0 - 0.4, y + 1.38, 3.75), (x0 - 2.3, y + 1.0, 2.62),
                     (x0 - 2.25, y - 0.98, 2.68), (x0 - 0.35, y - 1.36, 3.8), (x0 - 0.35, y + 1.36, 3.8), (x0 - 2.25, y + 0.98, 2.68)])


def gare(B):
    """Gare centrale : batiment voyageurs en pierre a toit de zinc, pavillon central a grande baie cintree,
    tour de l'horloge, verriere a trois nefs, quais, TGV et faisceau de voies vers l'est."""
    B.box("stone", (365, -142.5, 0.0), (560, -135.0, 0.14), tile=(4, 4))
    building(B, (380, -135, 445, -112), "h", 19.5, chimneys=False)
    building(B, (485, -135, 550, -112), "h", 19.5, chimneys=False)
    # pavillon central
    B.hexa("stone", [(445, -137, 0), (485, -137, 0), (485, -110, 0), (445, -110, 0),
                     (445, -137, 26), (485, -137, 26), (485, -110, 26), (445, -110, 26)], tile=(4, 4), skip={0, 1})
    B.hexa("zinc_flat", [(445, -137, 26), (485, -137, 26), (485, -110, 26), (445, -110, 26),
                         (449, -133, 32), (481, -133, 32), (481, -114, 32), (449, -114, 32)], skip={0})
    arch_panel(B, "emissive_glass_warm", 455, 475, -137.08, 3.0, 13.0)
    for x in (459.0, 463.0, 467.0, 471.0):
        B.box("black_metal", (x - 0.1, -137.2, 3.0), (x + 0.1, -137.1, 13.0 + math.sqrt(max(0.0, 100 - (x - 465) ** 2)) - 0.3))
    B.box("black_metal", (455, -137.2, 8.9), (475, -137.1, 9.1))
    B.box("gold_paint", (444.5, -137.3, 26.0), (485.5, -137.0, 26.6))
    # tour de l'horloge, cote complexe
    B.hexa("stone", [(368, -140, 0), (384, -140, 0), (384, -124, 0), (368, -124, 0),
                     (368, -140, 44), (384, -140, 44), (384, -124, 44), (368, -124, 44)], tile=(4, 4), skip={0, 1})
    B.box("stone", (367.4, -140.6, 42.6), (384.6, -123.4, 44.4), tile=(4, 4))
    B.hexa("zinc_flat", [(367.4, -140.6, 44.4), (384.6, -140.6, 44.4), (384.6, -123.4, 44.4), (367.4, -123.4, 44.4),
                         (375.6, -132.4, 55), (376.4, -132.4, 55), (376.4, -131.6, 55), (375.6, -131.6, 55)], skip={0})
    B.cyl("gold_paint", (376, -132, 55), (376, -132, 58.5), 0.15, 0.05, segs=6)
    clock(B, 376, -140.3, 36.5, (0, -1))
    clock(B, 367.7, -132, 36.5, (-1, 0))
    for zz in (10.0, 18.0, 26.0):  # baies de la tour
        B.box("emissive_glass_warm", (373, -140.08, zz), (379, -140.02, zz + 4.5))
    # verriere : trois nefs en berceau, murs de brique, poteaux
    xa, xb = 392.0, 560.0
    for yc in (-100.0, -76.0, -52.0):
        rr, zs, n = 12.0, 9.0, 10
        pts = [(math.cos(math.pi * i / n), math.sin(math.pi * i / n)) for i in range(n + 1)]
        verts = [(xa, yc + rr * c, zs + rr * s) for c, s in pts] + [(xb, yc + rr * c, zs + rr * s) for c, s in pts]
        faces = [(i, i + 1, n + 2 + i, n + 1 + i) for i in range(n)]
        B.piece("shed_glass", verts, faces, tile=(4, 4))
        for x in np.linspace(xa, xb, 9):
            for i in range(0, n, 2):
                (c0, s0), (c1, s1) = pts[i], pts[i + 2]
                B.cyl("steel", (x, yc + rr * c0, zs + rr * s0), (x, yc + rr * c1, zs + rr * s1), 0.2, segs=4)
        for x in (xa, xb):  # pignons vitres
            gp = [(x, yc + rr, 0.0)] + [(x, yc + rr * c, zs + rr * s) for c, s in pts] + [(x, yc - rr, 0.0)]
            B.piece("shed_glass", gp, [tuple(range(len(gp)))] if x == xb else [tuple(reversed(range(len(gp))))])
    for y in (-112.0, -40.0):
        B.box("chimney", (xa, y - 0.6, 0.0), (xb, y + 0.6, 9.0), tile=(4, 4))
    for y in (-88.0, -64.0):
        for x in np.arange(xa + 12, xb, 12):
            B.cyl("steel", (x, y, 0.0), (x, y, 9.0), 0.35, segs=8)
    # faisceau de voies, quais sous la verriere, rames a quai
    B.box("gravel", (xa, -110.0, 0.0), (1080, -42.0, 0.25), tile=(8, 8))
    tracks = (-106.0, -97.0, -82.0, -73.0, -58.0, -49.0)
    for yc in tracks:
        for dy in (-0.72, 0.72):
            B.box("steel", (xa, yc + dy - 0.06, 0.25), (1080, yc + dy + 0.06, 0.42))
    for y0, y1 in ((-95.2, -83.8), (-71.2, -59.8)):  # quais entre les voies
        B.box("concrete", (xa, y0, 0.0), (xb + 30, y1, 0.95), tile=(4, 4))
    x = 600.0
    while x < 1080:
        for y in (-112.0, -40.0):
            B.cyl("steel", (x, y, 0.0), (x, y, 8.0), 0.18, segs=6)
        B.box("steel", (x - 0.15, -112.0, 7.6), (x + 0.15, -40.0, 7.9))
        x += 48
    train(B, 404.0, -97.0, 8, 0)
    train(B, 436.0, -73.0, 8, 1)
    train(B, 700.0, -58.0, 6, 0)


def church(B, r):
    """Eglise de quartier : nef et transept en pierre, toits d'ardoise, abside, clocher a fleche, vitraux."""
    x0, y0, x1, y1 = r
    B.box("stone", (x0, y0, 0.0), (x1, y1, 0.12), tile=(4, 4))
    cy = (y0 + y1) / 2
    nx0, nx1, hw, hh = x0 + 12, x1 - 8, 8.0, 16.0

    def gabled(ax0, ay0, ax1, ay1, h, ridge, along_x):
        B.hexa("stone", [(ax0, ay0, 0), (ax1, ay0, 0), (ax1, ay1, 0), (ax0, ay1, 0),
                         (ax0, ay0, h), (ax1, ay0, h), (ax1, ay1, h), (ax0, ay1, h)], tile=(4, 4), skip={0, 1})
        if along_x:
            ym = (ay0 + ay1) / 2
            v = [(ax0, ay0, h), (ax1, ay0, h), (ax1, ym, ridge), (ax0, ym, ridge), (ax1, ay1, h), (ax0, ay1, h)]
            B.piece("slate", v, [(0, 1, 2, 3), (3, 2, 4, 5)])
            B.piece("stone", v, [(0, 3, 5), (1, 4, 2)], tile=(4, 4))
        else:
            xm = (ax0 + ax1) / 2
            v = [(ax0, ay0, h), (ax0, ay1, h), (xm, ay1, ridge), (xm, ay0, ridge), (ax1, ay1, h), (ax1, ay0, h)]
            B.piece("slate", v, [(0, 3, 2, 1), (3, 5, 4, 2)])
            B.piece("stone", v, [(0, 5, 3), (1, 2, 4)], tile=(4, 4))

    gabled(nx0, cy - hw, nx1, cy + hw, hh, hh + 9, True)
    tx = nx0 + (nx1 - nx0) * 0.62
    gabled(tx - 7, cy - 17, tx + 7, cy + 17, hh, hh + 8, False)
    B.sector("stone", (nx1, cy), 0.02, hw, -math.pi / 2, math.pi / 2, 0.0, hh - 2, segs=8, tile=(4, 4))
    B.cyl("slate", (nx1, cy, hh - 2), (nx1, cy, hh + 4), hw + 0.3, 0.3, segs=12)
    # clocher et fleche
    bx0, bx1 = nx0 - 12, nx0
    B.hexa("stone", [(bx0, cy - 6, 0), (bx1, cy - 6, 0), (bx1, cy + 6, 0), (bx0, cy + 6, 0),
                     (bx0, cy - 6, 34), (bx1, cy - 6, 34), (bx1, cy + 6, 34), (bx0, cy + 6, 34)], tile=(4, 4), skip={0, 1})
    B.box("stone", (bx0 - 0.6, cy - 6.6, 33), (bx1 + 0.6, cy + 6.6, 34.4), tile=(4, 4))
    B.cyl("slate", ((bx0 + bx1) / 2, cy, 34.4), ((bx0 + bx1) / 2, cy, 60), 6.4, 0.2, segs=8)
    B.cyl("gold_paint", ((bx0 + bx1) / 2, cy, 60), ((bx0 + bx1) / 2, cy, 63.5), 0.12, segs=6)
    B.box("gold_paint", ((bx0 + bx1) / 2 - 1.0, cy - 0.1, 62.2), ((bx0 + bx1) / 2 + 1.0, cy + 0.1, 62.45))
    clock(B, (bx0 + bx1) / 2, cy - 6.3, 27.5, (0, -1))
    # vitraux (lumineux la nuit) et rose du transept
    for x in np.arange(nx0 + 4, nx1 - 2, 6.0):
        if abs(x - tx) < 8:
            continue
        for y, dy in ((cy - hw - 0.06, 0.04), (cy + hw + 0.02, 0.04)):
            B.box("emissive_glass_warm", (x - 0.7, y, 4.0), (x + 0.7, y + dy, 11.5))
    B.cyl("emissive_glass_warm", (tx, cy - 17.05, 11.5), (tx, cy - 17.15, 11.5), 3.2, segs=20)
    for x, y in ((x0 + 4, y0 + 4), (x1 - 4, y0 + 4), (x0 + 4, y1 - 4), (x1 - 4, y1 - 4), (x0 + 4, cy), (x1 - 3, y1 - 4)):
        ctree(B, x, y, 10, 3.0, z=0.12)


def park(B, r):
    """Jardin public a la francaise : pelouses, allees de gravier, kiosque a musique au centre, bancs, arbres."""
    x0, y0, x1, y1 = r
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    B.box("lawn", (x0, y0, 0.0), (x1, y1, 0.08), tile=(8, 8))
    B.box("park_gravel", (x0, cy - 3, 0.0), (x1, cy + 3, 0.14), tile=(4, 4))
    B.box("park_gravel", (cx - 3, y0, 0.0), (cx + 3, y1, 0.14), tile=(4, 4))
    for a, b in (((x0, y0), (x1, y0 + 4)), ((x0, y1 - 4), (x1, y1)), ((x0, y0 + 4), (x0 + 4, y1 - 4)), ((x1 - 4, y0 + 4), (x1, y1 - 4))):
        B.box("park_gravel", (*a, 0.0), (*b, 0.14), tile=(4, 4))
    B.cyl("park_gravel", (cx, cy, 0.0), (cx, cy, 0.15), 15.0, segs=28)
    # kiosque a musique
    B.cyl("stone", (cx, cy, 0.15), (cx, cy, 1.1), 6.5, segs=8)
    for k in range(8):
        a = 2 * math.pi * k / 8
        B.cyl("black_metal", (cx + 5.8 * math.cos(a), cy + 5.8 * math.sin(a), 1.1), (cx + 5.8 * math.cos(a), cy + 5.8 * math.sin(a), 5.0), 0.12, segs=6)
    B.cyl("zinc_flat", (cx, cy, 5.0), (cx, cy, 8.2), 7.2, 0.3, segs=8)
    B.box("gold_paint", (cx - 0.15, cy - 0.15, 8.2), (cx + 0.15, cy + 0.15, 9.4))
    B.box("emissive_light", (cx - 0.5, cy - 0.5, 4.7), (cx + 0.5, cy + 0.5, 5.0))
    # arbres en bosquets hors des allees
    for _ in range(46):
        x, y = R.uniform(x0 + 7, x1 - 7), R.uniform(y0 + 7, y1 - 7)
        if abs(x - cx) < 6 or abs(y - cy) < 6 or math.hypot(x - cx, y - cy) < 18:
            continue
        ctree(B, x, y, R.uniform(9, 13), R.uniform(2.6, 3.6), z=0.08)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        bx, by = cx + 17 * math.cos(a), cy + 17 * math.sin(a)
        B.box("wood", (bx - 0.9, by - 0.9, 0.14), (bx + 0.9, by + 0.9, 0.55))


def tower(B, cx, cy, w, h):
    """Tour de bureaux au loin : mur-rideau (fenetres allumees la nuit), couronnement, feu d'obstacle."""
    B.box("emissive_curtain", (cx - w / 2, cy - w / 2, 0), (cx + w / 2, cy + w / 2, h), tile=(24.0, 28.8))
    B.box("roofing", (cx - w / 2 + 0.5, cy - w / 2 + 0.5, h), (cx + w / 2 - 0.5, cy + w / 2 - 0.5, h + 0.6), tile=(8, 8))
    B.box("black_metal", (cx - w / 2, cy - w / 2, h + 0.6), (cx + w / 2, cy + w / 2, h + 3.5))
    B.cyl("steel", (cx, cy, h + 3.5), (cx, cy, h + 14), 0.25, 0.08, segs=6)
    B.box("emissive_light", (cx - 0.3, cy - 0.3, h + 14), (cx + 0.3, cy + 0.3, h + 14.5))


# =============================================================== ville

def city(B, coll):
    x0, y0, x1, y1 = CITY
    sx0, sy0, sx1, sy1 = SITE
    origin = (GX0, GY0, 0.0)
    for r in ((x0, sy1, x1, y1), (x0, y0, x1, sy0), (x0, sy0, sx0, sy1), (sx1, sy0, x1, sy1)):
        B.box("emissive_city_ground", (r[0], r[1], -0.02), (r[2], r[3], 0.0), tile=(GRID, GRID), origin=origin)
    # trottoir-promenade le long de la plateforme du site
    for r in ((sx1, sy0, sx1 + 6, AVENUE[1]), (sx1, AVENUE[3], sx1 + 6, sy1), (sx0 - 6, sy0, sx0, AVENUE[1]),
              (sx0 - 6, AVENUE[3], sx0, sy1), (sx0 - 6, sy1, sx1 + 6, sy1 + 6)):
        B.box("paving", (r[0], r[1], 0.0), (r[2], r[3], 0.14), tile=(4.8, 4.8))
    avenue(B)
    gare(B)
    park(B, PARK)
    church(B, CHURCH)
    for cx, cy, w, h in TOWERS:
        tower(B, cx, cy, w, h)
    special = [grow(SITE, 8), grow(AVENUE, 2), grow(GARE, 2), PARK, CHURCH]
    special += [(cx - w, cy - w, cx + w, cy + w) for cx, cy, w, h in TOWERS]
    i0, i1 = int(math.floor((x0 - GX0) / GRID)), int(math.ceil((x1 - GX0) / GRID))
    j0, j1 = int(math.floor((y0 - GY0) / GRID)), int(math.ceil((y1 - GY0) / GRID))
    for i in range(i0, i1):
        for j in range(j0, j1):
            X, Y = GX0 + GRID * i, GY0 + GRID * j
            r = (X + ROAD_HALF + WALK, Y + ROAD_HALF + WALK, X + GRID - ROAD_HALF - WALK, Y + GRID - ROAD_HALF - WALK)
            if r[0] < x0 or r[2] > x1 or r[1] < y0 or r[3] > y1:
                continue
            if any(abs(X + GRID / 2 - px) < 1 and abs(Y + GRID / 2 - py) < 1 for px, py in PLACES):
                place(B, r)
                continue
            for e in special:
                if r is None:
                    break
                if overlaps(r, e) and (e[0] <= r[0] and e[2] >= r[2] and e[1] <= r[1] and e[3] >= r[3]):
                    r = None
                elif overlaps(r, e):
                    r = minus(r, e)
            if r is None or r[2] - r[0] < 11 or r[3] - r[1] < 11:
                continue
            cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
            if max(abs(cx), abs(cy - 25)) < NEAR:
                detailed_block(B, r)
            else:
                simple_block(B, r)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    mats = city_materials()
    coll = bpy.data.collections.new("prop_city")
    scene.collection.children.link(coll)
    B = Builder(mats)
    city(B, coll)
    B.finalize(coll, "city")
    out = os.path.join(find_repo(), "assets-src", "blend", "city.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("CITY OK", out)


if __name__ == "__main__":
    main()
