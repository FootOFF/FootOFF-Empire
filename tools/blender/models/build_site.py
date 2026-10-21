"""FootOFF Empire - generateur du site urbain et des parcelles (props).

Collections exportees (models/props/<nom>.glb) :
  prop_site         : plateforme du complexe (emprise 600 x 510 m, origine = centre du stade) : esplanade
                      pietonne autour du stade, allees, jardins, promenade, boulevard peripherique et
                      ronds-points, boulevard sud avec tram et station, parkings, lampadaires, arbres
                      (circulation animee dans le jeu)
  prop_plot_empty   : parcelle ouverte, prete a batir
  prop_plot_locked  : parcelle verrouillee : chantier palissade, cabanes, grue

Plan (metres, Blender : x vers l'est, y vers le nord ; jeu : z = -y) calque sur src/three/layout.js :
stade au centre (arene jusqu'a 187 x 140 m), parcelles 60 x 60 en t1..t7, ecartees du stade.

Lancement :
    blender -b --factory-startup -P tools/blender/models/build_site.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import GOLD, GOLD_LIGHT, Builder, Matrix, RNG, bpy, fbm, find_repo, fo_logo, mast, material, mix, np, to_image  # noqa: E402
from footoff_modern import car, container_box, lawn, modern_materials, plinth  # noqa: E402
from footoff_modern import tree as modern_tree  # noqa: E402

# Arbres du site : plus modelises dans le GLB, mais listes (site_trees.json) et plantes par le jeu avec les arbres
# realistes de l'ecrin naturel (src/three/landscape.js). Format par arbre, en unites du jeu (1 = 10 m) :
# [x, z, base, hauteur, largeur relative, espece].
SITE_TREES = []


def tree(B, x, y, h=9.0, r=2.6, z=0.0, columnar=False):
    if columnar:
        kind, w = "poplar", (r * 0.55 / 10) / 0.13
    else:
        kind, w = ("oak" if int(abs(x * 3.1 + y * 1.7)) % 3 else "beech"), (r / 10) / 0.36
    SITE_TREES.append([round(x / 10, 3), round(-y / 10, 3), round(z / 10, 3), round(h / 10, 3), round(w, 3), kind])

# Parcelles (centres en metres, repere Blender) = PLOT_POS de layout.js x 10, z -> -y
PLOTS = {
    "t1": (-45, 155), "t2": (45, 155),
    "t3": (-175, 75), "t4": (-175, 0), "t5": (-175, -75),
    "t6": (175, 40), "t7": (175, -40),
}
SITE = (-300.0, -230.0, 300.0, 280.0)  # x0, y0, x1, y1 : complexe + bande de terrain autour (la ville viendra ici)
STADIUM = (-80.0, -65.0, 80.0, 65.0)
ARENA = (-95.0, -70.0, 95.0, 76.0)  # arene des niveaux 5 et 6 (facade, parvis, totems) : rien d'autre dedans
MARK_Z = 0.08  # marquages 5 cm au-dessus de l'enrobe : a distance, 5 mm scintillaient (conflit de profondeur)
ROAD_Z = 0.03
DISC_Z = 0.07  # anneau des ronds-points, un peu au-dessus des voies qui y entrent (jamais deux sols au meme niveau)

# Boulevard peripherique autour du complexe (axe x = +-230, nord y = 220) ; au sud il devient un grand
# boulevard a deux chaussees separees par la plateforme du tram. Ronds-points aux deux angles sud.
RING_X, RING_N, RING_S = 230.0, 220.0, -152.0
ROUNDABOUTS = [(-RING_X, RING_S), (RING_X, RING_S)]
DISC_R, ISLAND_R = 16.0, 6.0
ROADS = [
    (-236, 214, 236, 226),            # nord
    (-236, -146, -224, 214),          # ouest
    (224, -146, 236, 214),            # est
    (-236, -158, 236, -146),          # sud : chaussee nord du boulevard (le peripherique)
    (-300, -184, 300, -172),          # sud : chaussee de transit, d'un bout a l'autre de la carte
    (-184, -146, -176, -138), (176, -146, 184, -138),  # entrees des parkings
]
MEDIAN = [(-300, -172, 300, -165.5), (-300, -165.5, -246, -158), (-214, -165.5, 214, -158), (246, -165.5, 300, -158)]
TRAM_Y = (-161.5, -168.5)  # axes des deux voies du tram
SIDEWALKS = [
    (-214, -146, -184, -142.5), (-176, -146, 176, -142.5), (184, -146, 214, -142.5),  # bord nord du boulevard
    (-224, 210.5, 224, 214), (-224, -136, -220.5, 210.5), (220.5, -136, 224, 210.5),   # cote interieur
    (-239.5, 226, 239.5, 229.5), (-239.5, -136, -236, 226), (236, -136, 239.5, 226),   # cote exterieur
    (-300, -187.5, 300, -184),                                                         # bord sud
]
# esplanade pietonne : anneau dalle autour de l'emprise du stade (le modele du stade a son propre sol dedans)
ESPLANADE = [(-130, -100, -36, -65), (36, -100, 130, -65), (-130, 65, 130, 110), (-130, -65, -80, 65), (80, -65, 130, 65)]
FORECOURT = (-80, -142.5, 80, -100)  # parvis jusqu'au boulevard ; l'axe d'honneur (PRESTIGE) en occupe le milieu
FORECOURT_SIDES = [(-80, -142.5, -36, -100), (36, -142.5, 80, -100)]
ALLEYS = [
    (-142, -105, -136, 113), (136, -105, 142, 113), (-142, 113, 142, 119),          # tour de l'esplanade
    (-220.5, 34.5, -142, 40.5), (-220.5, -40.5, -142, -34.5), (142, -3, 220.5, 3),  # entre les parcelles
]
PROMENADE = (-13, 119, 13, 210.5)
PARKINGS = [(-214, -138, -142, -112), (142, -138, 214, -112)]


def inside(x, y, r, m=0.0):
    return r[0] - m <= x <= r[2] + m and r[1] - m <= y <= r[3] + m


def lamp(B, x, y, ang, h=8.0, z=0.0):
    """Lampadaire moderne : mat noir, crosse, tete LED (allumee la nuit)."""
    dx, dy = math.cos(ang) * 1.6, math.sin(ang) * 1.6
    B.cyl("black_metal", (x, y, z), (x, y, z + h), 0.09, 0.07, segs=6)
    B.cyl("black_metal", (x, y, z + h), (x + dx, y + dy, z + h + 0.15), 0.05, segs=4)
    B.box("emissive_light", (x + dx - 0.35, y + dy - 0.18, z + h - 0.05), (x + dx + 0.35, y + dy + 0.18, z + h + 0.12))


def dashes(B, x0, y0, x1, y1, z=MARK_Z):
    """Marquage axial discontinu (3 m / 6 m)."""
    horiz = abs(x1 - x0) > abs(y1 - y0)
    length = abs(x1 - x0) if horiz else abs(y1 - y0)
    n = int(length // 9)
    for i in range(n):
        t = (i * 9 + 3) / length
        if horiz:
            x = x0 + (x1 - x0) * t
            B.box("white", (x, y0 - 0.08, 0.0), (x + 3, y0 + 0.08, z))
        else:
            y = y0 + (y1 - y0) * t
            B.box("white", (x0 - 0.08, y, 0.0), (x0 + 0.08, y + 3, z))


def zebra(B, x0, x1, y0, y1, along_x=True):
    """Passage pieton : bandes de 50 cm tous les metres, en travers de la chaussee."""
    if along_x:  # chaussee est-ouest : bandes orientees nord-sud
        x = x0
        while x + 0.5 <= x1:
            B.box("white", (x, y0 + 0.4, 0.0), (x + 0.5, y1 - 0.4, MARK_Z))
            x += 1.0
    else:
        y = y0
        while y + 0.5 <= y1:
            B.box("white", (x0 + 0.4, y, 0.0), (x1 - 0.4, y + 0.5, MARK_Z))
            y += 1.0


def flat_logo(B, mat, x, y, height, z=0.0):
    """Monogramme FO incruste a plat dans le sol (haut du logo vers le nord), 5 cm au-dessus du dallage."""
    fo_logo(B, mat, Matrix.Translation((x, y - height / 2, z + 0.19)) @ Matrix.Rotation(-math.pi / 2, 4, "X"), height, depth=0.08)


def roundabout(B, cx, cy):
    """Rond-point : anneau d'enrobe, ilot engazonne borde de beton, stele FootOFF au centre."""
    B.cyl("asphalt", (cx, cy, 0.0), (cx, cy, DISC_Z), DISC_R, segs=40)
    B.cyl("concrete_dark", (cx, cy, 0.0), (cx, cy, 0.2), ISLAND_R + 0.4, segs=28)
    B.cyl("lawn", (cx, cy, 0.0), (cx, cy, 0.24), ISLAND_R, segs=28)
    B.box("black_metal", (cx - 1.3, cy - 0.4, 0.24), (cx + 1.3, cy + 0.4, 4.6))
    fo_logo(B, "emissive_led", Matrix.Translation((cx, cy - 0.45, 1.6)), 2.0, depth=0.06)
    for a in range(0, 360, 60):  # bosquet bas autour de la stele
        r = ISLAND_R * 0.62
        tree(B, cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), 3.2, 1.1, z=0.24)


def tram(B):
    """Plateforme du tram sur gazon entre les deux chaussees : rails, poteaux et fils, station face au parvis."""
    for yc in TRAM_Y:
        for dy in (-0.72, 0.72):
            B.box("steel", (-300, yc + dy - 0.05, 0.0), (300, yc + dy + 0.05, 0.16))
    # poteaux de ligne aerienne au milieu, potences et fils de contact au-dessus de chaque voie
    ym = (TRAM_Y[0] + TRAM_Y[1]) / 2
    for x in range(-288, 289, 32):
        if -46 < x < 46:
            continue  # la station a sa propre structure
        B.cyl("black_metal", (x, ym, 0.1), (x, ym, 7.2), 0.12, 0.09, segs=6)
        B.box("black_metal", (x - 0.06, TRAM_Y[1] - 0.3, 6.6), (x + 0.06, TRAM_Y[0] + 0.3, 6.75))
    for yc in TRAM_Y:
        B.box("steel", (-300, yc - 0.03, 6.25), (300, yc + 0.03, 6.31))
    # station : quai central, abri vitre a toiture noire, bandes dorees, bancs, eclairage, totem FO
    q0, q1 = TRAM_Y[0] - 1.6, TRAM_Y[1] + 1.6
    B.box("paving", (-42, q1, 0.0), (42, q0, 0.35), tile=(4.8, 4.8))
    B.box("emissive_led", (-42, q0 - 0.3, 0.35), (42, q0, 0.4))
    B.box("emissive_led", (-42, q1, 0.35), (42, q1 + 0.3, 0.4))
    for x in range(-36, 37, 12):
        B.cyl("black_metal", (x, ym, 0.35), (x, ym, 3.9), 0.1, segs=6)
    B.box("black_metal", (-40, q1 - 0.6, 3.9), (40, q0 + 0.6, 4.15))
    B.box("glass", (-40, q1 - 0.6, 4.15), (40, q0 + 0.6, 4.2))
    B.box("emissive_light", (-38, ym - 0.2, 3.75), (38, ym + 0.2, 3.9))
    for x in (-24, 0, 24):
        B.box("glass", (x - 4, ym - 0.03, 0.35), (x + 4, ym + 0.03, 2.6))
        B.box("wood", (x - 3, ym + 0.2, 0.35), (x + 3, ym + 0.75, 0.8), tile=(2, 2))
    B.box("black_metal", (44, ym - 0.3, 0.35), (45.6, ym + 0.3, 5.2))
    fo_logo(B, "emissive_led", Matrix.Translation((44.8, ym - 0.35, 3.0)), 1.8, depth=0.05)


def parking_lot(B, x0, y0, x1, y1):
    """Parking paysager : deux rangees d'emplacements, ilot central plante, voitures garees."""
    B.box("asphalt", (x0, y0, 0.0), (x1, y1, ROAD_Z), tile=(8, 8))
    ym = (y0 + y1) / 2
    B.box("concrete_dark", (x0 + 4, ym - 2.4, 0.0), (x1 - 4, ym + 2.4, 0.16))
    B.box("lawn", (x0 + 4.3, ym - 2.1, 0.0), (x1 - 4.3, ym + 2.1, 0.2), tile=(8, 8))
    n = int((x1 - x0 - 8) // 2.6)
    for i in range(n + 1):
        x = x0 + 4 + i * 2.6
        for ya, yb in ((y0 + 0.6, y0 + 5.6), (y1 - 5.6, y1 - 0.6)):
            B.box("white", (x - 0.06, ya, 0.0), (x + 0.06, yb, MARK_Z))
    for x in range(int(x0) + 10, int(x1) - 6, 12):
        tree(B, x, ym, 7.5, 2.0, z=0.2)
    paints = ("black_metal", "steel", "white", "black_metal", "glass")
    k = 0
    for i in range(n):
        for row, yy, ang in ((0, y0 + 3.1, 0.0), (1, y1 - 3.1, math.pi)):
            if (i * 5 + row * 3) % 7 < 4:
                car(B, x0 + 4 + (i + 0.5) * 2.6, yy, ang, paints[k % len(paints)])
                k += 1


PRESTIGE = (-36.0, -142.5, 36.0, -65.0)  # axe d'honneur : de l'entree sud du stade a la station du tram
TROPHY = (0.0, -82.0)  # place de la Coupe d'Europe (trophee pose par le jeu quand elle est gagnee)
POOL = (-15.0, -126.0, 15.0, -100.0)  # miroir d'eau (bord interieur)


def tex_granite(name, base, var=0.05):
    """Granit flamme en dalles 1,2 x 0,6 m a joints decales, tuile 2,4 x 2,4 m (raccord sans couture)."""
    S = 512
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    X, Y = u * 2.4, v * 2.4
    row = np.floor(Y / 0.6)
    xx = X + (row % 2) * 0.6
    col = np.floor(xx / 1.2) % 2
    jx = np.minimum(xx % 1.2, 1.2 - xx % 1.2)
    jy = np.minimum(Y % 0.6, 0.6 - Y % 0.6)
    joint = np.clip(1.0 - np.minimum(jx, jy) / 0.01, 0, 1)
    tint = RNG.random((4, 2))[row.astype(int) % 4, col.astype(int)]
    grain = fbm(S, S, 48, 3)
    val = 1 + var * (tint - 0.5) * 2 + 0.1 * (grain - 0.5)
    rgb = np.asarray(base)[None, None, :] * val[..., None]
    return to_image(name, mix(rgb, np.asarray(base) * 0.55, joint))


def prestige_materials(mats):
    mats["granite_light"] = material("granite_light", image=tex_granite("granite_light", (0.62, 0.60, 0.56)), rough=0.7)
    mats["granite_dark"] = material("granite_dark", image=tex_granite("granite_dark", (0.12, 0.12, 0.13), 0.08), rough=0.45)
    mats["trophy_gold"] = material("trophy_gold", GOLD_LIGHT, rough=0.22, metal=0.95)
    mats["mirror_water"] = material("mirror_water", (0.30, 0.40, 0.45), rough=0.03, metal=0.85)  # reflete le ciel


def banner(B, x, y, s, gold):
    """Mat a banniere verticale, face a la camera (sud), monogramme FO."""
    B.cyl("steel", (x, y, 0.14), (x, y, 11.0), 0.09, 0.07, segs=8)
    B.cyl("trophy_gold", (x, y, 11.0), (x, y, 11.25), 0.14, segs=8)
    xa, xb = (x + 0.12, x + 1.42) if s > 0 else (x - 1.42, x - 0.12)
    B.box("trophy_gold" if gold else "black_metal", (xa, y - 0.03, 5.2), (xb, y + 0.03, 10.2))
    B.box("steel", (min(xa, xb) - 0.05, y - 0.04, 10.15), (max(xa, xb) + 0.05, y + 0.04, 10.25))
    fo_logo(B, "black_metal" if gold else "emissive_led", Matrix.Translation(((xa + xb) / 2, y - 0.05, 8.2)), 1.0, depth=0.03)


def planter(B, x0, y0, x1, y1, tree_x, step=7.0):
    """Jardiniere basse en granit sombre, gazon, alignement d'arbres."""
    t = 0.3
    for a, b in (((x0, y0), (x1, y0 + t)), ((x0, y1 - t), (x1, y1)), ((x0, y0 + t), (x0 + t, y1 - t)), ((x1 - t, y0 + t), (x1, y1 - t))):
        B.box("granite_dark", (*a, 0.0), (*b, 0.5), tile=(2.4, 2.4))
    B.box("lawn", (x0 + t, y0 + t, 0.0), (x1 - t, y1 - t, 0.42), tile=(8, 8))
    y = y0 + step / 2
    while y < y1 - 2:
        tree(B, tree_x, y, 9.5, 2.4, z=0.42)
        y += step


def prestige(B):
    """Parvis de prestige : axe en granit clair borde de bandes sombres, place de la Coupe d'Europe, miroir d'eau,
    jardinieres plantees, bannieres FootOFF, bornes lumineuses et monogramme dore au sol. Les trophees et leurs socles
    (allee d'honneur, x = +/-20,5 m) sont poses par le jeu, seulement pour les competitions gagnees."""
    x0, y0, x1, y1 = PRESTIGE
    B.box("granite_light", (x0, y0, 0.0), (x1, y1, 0.14), tile=(2.4, 2.4))
    tx, ty = TROPHY
    near = lambda x, y, r: math.hypot(x - tx, y - ty) < r  # noqa: E731
    # bandes de granit sombre : bordures de l'allee centrale et calepinage transversal tous les 12 m
    for s in (-1, 1):
        B.box("granite_dark", (min(s * 17, s * 18), y0, 0.0), (max(s * 17, s * 18), y1, 0.19), tile=(2.4, 2.4))
    for y in (-141.3, -128.3, -97.3):  # entre le monogramme, le miroir d'eau et la place du trophee
        B.box("granite_dark", (-17, y, 0.0), (17, y + 0.6, 0.19), tile=(2.4, 2.4))
    # place de la Coupe d'Europe : anneau sombre et cercle d'or lumineux (le trophee est pose par le jeu)
    B.sector("granite_dark", (tx, ty), 12.0, 13.2, 0, 2 * math.pi, 0.0, 0.19, segs=56, tile=(2.4, 2.4))
    B.sector("emissive_led", (tx, ty), 11.55, 11.8, 0, 2 * math.pi, 0.0, 0.2, segs=56)
    # miroir d'eau : margelle sombre, eau 4 cm sous la margelle
    p0, q0, p1, q1 = POOL
    m = 0.6
    for a, b in (((p0 - m, q0 - m), (p1 + m, q0)), ((p0 - m, q1), (p1 + m, q1 + m)), ((p0 - m, q0), (p0, q1)), ((p1, q0), (p1 + m, q1))):
        B.box("granite_dark", (*a, 0.0), (*b, 0.32), tile=(2.4, 2.4))
    B.box("mirror_water", (p0, q0, 0.0), (p1, q1, 0.28), tile=(8, 8))
    for x in range(int(p0) + 3, int(p1) - 1, 6):  # buses lumineuses au fond, de part et d'autre
        for y in (q0 + 1.2, q1 - 1.2):
            B.box("emissive_light", (x - 0.12, y - 0.12, 0.28), (x + 0.12, y + 0.12, 0.33))
    # monogramme dore au sol, avant la station
    flat_logo(B, "gold_paint", 0, -134.0, 9.0)
    # jardinieres plantees de part et d'autre ; bannieres entre les socles de l'allee d'honneur ; bancs pres de la place
    for s in (-1, 1):
        xa, xb = sorted((s * 23.0, s * 33.5))
        planter(B, xa, -139.5, xb, -104.0, s * 28.2)
        planter(B, xa, -96.0, xb, -71.0, s * 28.2)
        for k, y in enumerate((-137, -124, -111, -98, -85, -74)):
            banner(B, s * 22.3, y, s, gold=(k % 2 == 0))
        for y in (-91, -79):
            B.box("granite_dark", (min(s * 20.4, s * 21.0), y - 1.2, 0.0), (max(s * 20.4, s * 21.0), y + 1.2, 0.48), tile=(2.4, 2.4))
        for y in range(int(y0) + 4, int(y1), 8):  # bornes lumineuses
            if near(s * 17.5, y, 14.5):
                continue
            B.cyl("black_metal", (s * 16.4, y, 0.14), (s * 16.4, y, 1.0), 0.12, segs=8)
            B.cyl("emissive_light", (s * 16.4, y, 1.0), (s * 16.4, y, 1.12), 0.13, segs=8)


def height_to_normal(name, h, strength):
    """Carte de normales (non couleur) depuis une carte de hauteur periodique."""
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return to_image(name, n * 0.5 + 0.5, non_color=True)


def tex_esplanade():
    """Dallage de l'esplanade, tuile 4,8 x 4,8 m : grandes dalles de granit 1,2 x 0,6 m a joints decales,
    bandes de granit plus sombre de 20 cm qui quadrillent tous les 4,8 m, joints en creux (relief)."""
    S, m = 1024, 4.8
    u, v = np.meshgrid((np.arange(S) + 0.5) / S * m, (np.arange(S) + 0.5) / S * m)
    band = (u < 0.2) | (v < 0.2)
    uu, vv = u - 0.2, v - 0.2
    row = np.floor(vv / 0.6)
    xx = uu + (row % 2) * 0.6
    col = np.floor(xx / 1.2)
    jx = np.minimum(xx % 1.2, 1.2 - xx % 1.2)
    jy = np.minimum(vv % 0.6, 0.6 - vv % 0.6)
    joint = np.clip(1 - np.minimum(jx, jy) / 0.007, 0, 1) * ~band
    edge = np.clip(1 - np.minimum(np.abs(u - 0.2), np.abs(v - 0.2)) / 0.008, 0, 1)
    joint = np.maximum(joint, edge)
    tint = RNG.random((8, 4))[row.astype(int) % 8, col.astype(int) % 4]
    grain = fbm(S, S, 64, 3)
    base = np.array([0.42, 0.405, 0.38]) * (0.92 + 0.12 * tint + 0.08 * (grain - 0.5))[..., None]
    dark = np.array([0.30, 0.295, 0.285]) * (0.95 + 0.1 * grain)[..., None]
    rgb = np.where(band[..., None], dark, base)
    rgb = rgb * (1 - 0.3 * joint[..., None])
    height = 1.0 - joint * 0.9 + 0.04 * grain
    return to_image("esplanade", rgb), height_to_normal("esplanade_n", height, 6.0)


def tex_site_lawn():
    """Pelouse tondue, tuile 8 x 8 m : bandes de tonte de 2 m (claire / foncee), grain d'herbe en relief."""
    S, m = 512, 8.0
    u, v = np.meshgrid((np.arange(S) + 0.5) / S * m, (np.arange(S) + 0.5) / S * m)
    n = fbm(S, S, 6, 5)
    fine = fbm(S, S, 96, 2)
    stripe = np.where((np.floor(u / 2.0) % 2) == 0, 1.05, 0.95)
    g = np.stack([0.14 + 0.05 * n, 0.26 + 0.07 * n, 0.095 + 0.03 * n], -1) * (stripe * (0.94 + 0.12 * fine))[..., None]
    return to_image("site_lawn", g), height_to_normal("site_lawn_n", fine, 3.0)


def tex_asphalt_n():
    """Grain d'enrobe (normales), tuile 8 x 8 m."""
    S = 512
    return height_to_normal("asphalt_n", fbm(S, S, 128, 2) + 0.4 * fbm(S, S, 32, 2), 2.5)


def site_materials(mats):
    esp, esp_n = tex_esplanade()
    lawn_img, lawn_n = tex_site_lawn()
    mats["paving"] = material("paving", image=esp, normal=esp_n, normal_strength=0.8, rough=0.78)
    mats["lawn"] = material("lawn", image=lawn_img, normal=lawn_n, normal_strength=0.5, rough=0.95)
    mats["asphalt"] = material("asphalt", image=bpy.data.images["asphalt"], normal=tex_asphalt_n(), normal_strength=0.6, rough=0.92)


def site(B, coll):
    x0, y0, x1, y1 = SITE
    B.box("lawn", (x0, y0, -0.02), (x1, y1, 0.0), tile=(8, 8))
    for r in ROADS:
        B.box("asphalt", (r[0], r[1], 0.0), (r[2], r[3], ROAD_Z), tile=(8, 8))
    for cx, cy in ROUNDABOUTS:
        roundabout(B, cx, cy)
    # marquages : axes discontinus (interrompus aux ronds-points)
    dashes(B, -224, RING_N, 224, RING_N)
    dashes(B, -RING_X, -136, -RING_X, 214)
    dashes(B, RING_X, -136, RING_X, 214)
    dashes(B, -214, RING_S, 214, RING_S)
    dashes(B, -300, -178, 300, -178)
    for r in MEDIAN:
        B.box("lawn", (r[0], r[1], 0.0), (r[2], r[3], 0.1), tile=(8, 8))
    tram(B)
    for r in SIDEWALKS + ESPLANADE + ALLEYS + FORECOURT_SIDES + [PROMENADE]:
        B.box("paving", (r[0], r[1], 0.0), (r[2], r[3], 0.14), tile=(4.8, 4.8))
    for p in PARKINGS:
        parking_lot(B, *p)
    # passages pietons : du parvis a la station (deux chaussees), en haut de la promenade, aux allees
    zebra(B, -6, 6, -158, -146)
    zebra(B, -6, 6, -184, -172)
    zebra(B, -6, 6, 214, 226)
    zebra(B, -236, -224, 34.5, 40.5, along_x=False)
    zebra(B, -236, -224, -40.5, -34.5, along_x=False)
    zebra(B, 224, 236, -3, 3, along_x=False)
    # parvis de prestige au centre, cotes plantes et eclaires
    prestige(B)
    for x in (-70, -56, -42, 42, 56, 70):
        for y in (-136, -107):
            tree(B, x, y, 8.5, 2.2, z=0.14)
    for x in (-74, -46, 46, 74):
        lamp(B, x, -121, 0.0, z=0.14)
    # promenade entre les parcelles nord : arbres en colonnes, bancs, lampadaires bas
    for y in range(126, 206, 10):
        for x in (-9, 9):
            tree(B, x, y, 8, 2.0, z=0.14, columnar=True)
        lamp(B, 0, y + 5, 0.0, h=6, z=0.14)
        B.box("wood", (-6.5, y, 0.14), (-5.9, y + 3, 0.6), tile=(2, 2))
        B.box("wood", (5.9, y, 0.14), (6.5, y + 3, 0.6), tile=(2, 2))
    flat_logo(B, "gold_paint", 0, 200, 6.0)
    # allees autour de l'esplanade : alignements d'arbres cote esplanade, lampadaires cote parcelles
    for y in range(-98, 112, 12):
        tree(B, -133, y, 8, 2.1)
        tree(B, 133, y, 8, 2.1)
    for x in range(-126, 127, 12):
        if abs(x) > 18:
            tree(B, x, 112.0, 8, 2.1)
    for y in range(-96, 113, 24):
        lamp(B, -142.6, y, 0.0, z=0.14)
        lamp(B, 142.6, y, math.pi, z=0.14)
    # lampadaires de l'esplanade (bord exterieur) et du peripherique (cote interieur)
    for x in range(-120, 121, 24):
        if abs(x) > 40:
            lamp(B, x, -97, math.pi / 2, z=0.14)
        lamp(B, x, 107, -math.pi / 2, z=0.14)
    for y in range(-60, 61, 24):
        lamp(B, -127, y, 0.0, z=0.14)
        lamp(B, 127, y, math.pi, z=0.14)
    # mats d'eclairage aux quatre coins de l'esplanade, tournes vers le stade : ils eclairent la plateforme quand
    # le jour baisse (projecteurs reels du jeu aux empties light_site_*)
    for i, (x, y) in enumerate(((-118, -88), (118, -88), (-118, 98), (118, 98))):
        mast(B, coll, x, y, 30, 4, 2, f"light_site_{i}", target=(0, 0, 0))
    for x in range(-210, 211, 30):
        lamp(B, x, 212.3, math.pi / 2, z=0.14)
        if abs(x) > 12 and not 170 < abs(x) < 190:
            lamp(B, x, -144.3, -math.pi / 2, z=0.14)
    for y in range(-120, 211, 30):
        lamp(B, -222.3, y, math.pi, z=0.14)
        lamp(B, 222.3, y, 0.0, z=0.14)
    for x in range(-290, 291, 30):
        lamp(B, x, -185.8, math.pi / 2, z=0.14)
    # arbres des jardins (dans le peripherique) et de la bande exterieure (moins denses)
    blocked = [STADIUM, ARENA, FORECOURT, PRESTIGE, PROMENADE] + ROADS + SIDEWALKS + ESPLANADE + ALLEYS + PARKINGS + MEDIAN
    blocked += [(cx - 33, cy - 33, cx + 33, cy + 33) for cx, cy in PLOTS.values()]
    blocked += [(cx - DISC_R, cy - DISC_R, cx + DISC_R, cy + DISC_R) for cx, cy in ROUNDABOUTS]
    for gx in range(int(x0) + 6, int(x1) - 4, 13):
        for gy in range(int(y0) + 6, int(y1) - 4, 13):
            x, y = gx + RNG.uniform(-4, 4), gy + RNG.uniform(-4, 4)
            within = abs(x) < 224 and -142 < y < 214
            if RNG.random() > (0.5 if within else 0.28) or any(inside(x, y, r, 3.0) for r in blocked):
                continue
            tree(B, x, y, RNG.uniform(7, 11), RNG.uniform(1.8, 2.8), columnar=RNG.random() < 0.25)


def plot_empty(B, coll):
    """Parcelle ouverte : dalle prete a batir, contour dore (lumineux la nuit), panneau FootOFF."""
    plinth(B)
    B.box("concrete_dark", (-20, -20, 0.12), (20, 20, 0.16))  # dalle sombre : le contour dore ressort
    for side in range(4):  # contour en tirets dores
        for i in range(10):
            a = -20 + i * 4
            seg = [(a, -20.3, a + 2.4, -19.9), (a, 19.9, a + 2.4, 20.3), (-20.3, a, -19.9, a + 2.4), (19.9, a, 20.3, a + 2.4)][side]
            B.box("emissive_led", (seg[0], seg[1], 0.16), (seg[2], seg[3], 0.2))
    for sx in (-1, 1):  # equerres d'angle
        for sy in (-1, 1):
            x, y = sx * 22, sy * 22
            B.box("emissive_led", (min(x, x - sx * 4), y - 0.25, 0.12), (max(x, x - sx * 4), y + 0.25, 0.35))
            B.box("emissive_led", (x - 0.25, min(y, y - sy * 4), 0.12), (x + 0.25, max(y, y - sy * 4), 0.35))
            B.box("concrete_dark", (sx * 26 - 1.4, sy * 26 - 1.4, 0.12), (sx * 26 + 1.4, sy * 26 + 1.4, 0.7))
            modern_tree(B, sx * 26, sy * 26, 8, 2.2, z=0.7)
    # panneau "terrain disponible" face camera
    for x in (-2.2, 2.2):
        B.cyl("black_metal", (x, -24, 0.12), (x, -24, 3.6), 0.07, segs=6)
    B.box("black_metal", (-3, -24.15, 1.4), (3, -23.95, 3.8))
    fo_logo(B, "emissive_led", Matrix.Translation((-1.9, -24.2, 1.75)), 1.7, depth=0.05)
    B.box("emissive_led", (0.2, -24.2, 2.2), (2.6, -24.16, 2.32))
    B.box("white", (0.2, -24.2, 2.6), (2.0, -24.16, 2.7))


def plot_locked(B, coll):
    """Parcelle verrouillee : chantier a venir (palissade noire aux monogrammes FO, cabanes, grue doree)."""
    B.box("gravel", (-29, -29, 0), (29, 29, 0.1), tile=(8, 8))
    h = 2.6
    for (ax, ay, bx, by) in [(-29, -29, 29, -28.8), (-29, 28.8, 29, 29), (-29, -29, -28.8, 29), (28.8, -29, 29, 29)]:
        B.box("black_metal", (ax, ay, 0.1), (bx, by, h))
    B.box("gold_paint", (-29.05, -29.06, h - 0.35), (29.05, -28.99, h - 0.2))
    for x in (-18, 0, 18):
        fo_logo(B, "emissive_led", Matrix.Translation((x, -29.1, 0.55)), 1.5, depth=0.05)
    # cabanes de chantier (conteneurs empiles)
    container_box(B, 12, 18, 0.1)
    container_box(B, 12, 20.6, 0.1)
    container_box(B, 13, 18.5, 2.7, length=9)
    # grue a tour doree : mat en treillis, fleche, contre-fleche, cabine, feu d'obstacle
    mx, my, H = -14.0, 8.0, 32.0
    for sx in (-0.8, 0.8):
        for sy in (-0.8, 0.8):
            B.cyl("gold_paint", (mx + sx, my + sy, 0.1), (mx + sx, my + sy, H), 0.07, segs=4)
    for k in range(int(H // 2.5)):
        z0, z1 = 0.1 + k * 2.5, 0.1 + (k + 1) * 2.5
        B.cyl("gold_paint", (mx - 0.8, my - 0.8, z0), (mx + 0.8, my - 0.8, z1), 0.035, segs=4)
        B.cyl("gold_paint", (mx + 0.8, my + 0.8, z0), (mx - 0.8, my + 0.8, z1), 0.035, segs=4)
    B.box("gold_paint", (mx - 1.2, my - 1.2, H), (mx + 1.2, my + 1.2, H + 2.0))
    B.box("glass", (mx + 1.2, my - 0.9, H + 0.3), (mx + 2.6, my + 0.9, H + 1.9))
    B.box("gold_paint", (mx - 9, my - 0.5, H + 2.0), (mx + 30, my + 0.5, H + 2.9))
    B.box("concrete_dark", (mx - 9, my - 1.0, H + 0.6), (mx - 6, my + 1.0, H + 2.0))
    B.cyl("gold_paint", (mx, my, H + 2.9), (mx, my, H + 7.0), 0.15, segs=6)
    for ex in (-9.0, 30.0):
        B.cyl("steel", (mx, my, H + 7.0), (mx + ex, my, H + 2.9), 0.03, segs=4)
    B.box("emissive_light", (mx - 0.2, my - 0.2, H + 7.0), (mx + 0.2, my + 0.2, H + 7.3))
    B.cyl("steel", (mx + 22, my, H + 2.0), (mx + 22, my, 8.0), 0.02, segs=4)  # cable de levage
    B.box("black_metal", (mx + 21.3, my - 0.7, 6.8), (mx + 22.7, my + 0.7, 8.0))
    # tas de materiaux
    B.box("concrete", (-4, -12, 0.1), (6, -6, 1.2), tile=(4, 4))
    B.box("wood", (8, -14, 0.1), (16, -10, 0.9), tile=(2, 2))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    mats = modern_materials()
    mats["gravel"] = material("gravel", (0.30, 0.27, 0.23), rough=1.0)
    mats["gold_paint"] = material("gold_paint", GOLD, rough=0.4, metal=0.5)
    prestige_materials(mats)
    site_materials(mats)  # dallage de l'esplanade, pelouse tondue, grain de l'enrobe (avec relief)
    for name, fn in (("site", site), ("plot_empty", plot_empty), ("plot_locked", plot_locked)):
        coll = bpy.data.collections.new(f"prop_{name}")
        scene.collection.children.link(coll)
        B = Builder(mats)
        fn(B, coll)
        B.finalize(coll, name)
    import json
    trees_out = os.path.join(find_repo(), "public", "models", "props", "site_trees.json")
    with open(trees_out, "w", encoding="utf-8") as f:
        json.dump(SITE_TREES, f, separators=(",", ":"))
    print("SITE TREES", len(SITE_TREES), trees_out)
    out = os.path.join(find_repo(), "assets-src", "blend", "site.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("SITE OK", out)


if __name__ == "__main__":
    main()
