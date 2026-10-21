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

Sols, routes et mobilier (phase 3) : matieres photo CC0 preparees par tools/grounds/prepare.py
(assets-src/grounds-baked/, materiaux ground_* que le jeu nuance dalle par dalle : src/three/ground.js), bordures
en granit et caniveaux calcules sur le contour des espaces pietons, mobilier contemporain (footoff_street.py).

Lancement :
    python -I tools/grounds/prepare.py
    blender -b --factory-startup -P tools/blender/models/build_site.py
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import GOLD, GOLD_LIGHT, Builder, Matrix, RNG, bpy, find_repo, fo_logo, mast, material, np  # noqa: E402
from footoff_modern import car, container_box, modern_materials, plinth  # noqa: E402
from footoff_modern import tree as modern_tree  # noqa: E402
from footoff_street import (bench, bike_rack, bollard, drain, lantern, litter_bin, manhole, street_lamp,  # noqa: E402
                            tex_grate, tex_pool, tree_grate)

# Arbres et vegetation basse du site : plus modelises dans le GLB, mais listes (site_trees.json) et plantes par le
# jeu avec les arbres realistes de l'ecrin naturel (src/three/forest.js). Format, en unites du jeu (1 = 10 m) :
# [x, z, base, hauteur, largeur relative, espece] ; haie : [x, z, base, hauteur, largeur, "haie", axe, longueur].
SITE_TREES = []
SHRUB_RNG = np.random.default_rng(7)  # a part : les arbres des jardins gardent leur tirage


def tree(B, x, y, h=9.0, r=2.6, z=0.0, columnar=False):
    if columnar:
        kind, w = "poplar", (r * 0.55 / 10) / 0.13
    else:
        kind, w = ("oak" if int(abs(x * 3.1 + y * 1.7)) % 3 else "beech"), (r / 10) / 0.36
    SITE_TREES.append([round(x / 10, 3), round(-y / 10, 3), round(z / 10, 3), round(h / 10, 3), round(w, 3), kind])


def shrub(x, y, h, kind="arbuste", z=0.0):
    """Buis en boule ou massif d'arbustes, a sa forme naturelle (hauteur h en metres)."""
    SITE_TREES.append([round(x / 10, 3), round(-y / 10, 3), round(z / 10, 3), round(h / 10, 3), round(h / 10, 3), kind])


def hedge(x0, y0, x1, y1, h=0.9, w=0.8, z=0.0):
    """Haie taillee de (x0, y0) a (x1, y1) (metres, repere Blender) ; axe : angle autour de la verticale du jeu."""
    length = math.hypot(x1 - x0, y1 - y0)
    SITE_TREES.append([round((x0 + x1) / 20, 3), round(-(y0 + y1) / 20, 3), round(z / 10, 3), round(h / 10, 3), round(w / 10, 3),
                       "haie", round(math.atan2(y1 - y0, x1 - x0), 4), round(length / 10, 3)])

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
PAVE_Z = 0.14  # dessus des espaces pietons
CURB_W, CURB_Z = 0.15, 0.175  # bordures en granit : 3,5 cm au-dessus du dallage qu'elles recouvrent (pas de conflit)
GUTTER_W, GUTTER_Z = 0.3, 0.06  # caniveaux en beton, 3 cm au-dessus de l'enrobe
BAND_W, BAND_Z, BAND_STEP = 0.25, 0.165, 6.0  # calepinage de l'esplanade : bandes de granit tous les 6 m
RES = 0.5  # trame du plan : toutes les cotes des sols sont des multiples de 50 cm
# Ecarts verticaux entre sols superposes : au moins 2,5 cm (positions du site compressees sur 16 bits : pas de 9 mm)

# Matieres photo (tools/grounds/prepare.py) : tuile de chaque texture en metres
GROUNDS = os.path.join(find_repo(), "assets-src", "grounds-baked")
with open(os.path.join(GROUNDS, "grounds_meta.json"), encoding="utf-8") as _f:
    GROUND_META = json.load(_f)


def tile(key):
    t = GROUND_META[key]["tile"]
    return (t, t)

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


def dashes(B, x0, y0, x1, y1, z=MARK_Z):
    """Marquage axial discontinu (3 m / 6 m), peinture routiere qui laisse voir le grain de l'enrobe."""
    horiz = abs(x1 - x0) > abs(y1 - y0)
    length = abs(x1 - x0) if horiz else abs(y1 - y0)
    n = int(length // 9)
    for i in range(n):
        t = (i * 9 + 3) / length
        if horiz:
            x = x0 + (x1 - x0) * t
            B.box("ground_paint", (x, y0 - 0.08, 0.0), (x + 3, y0 + 0.08, z), tile=tile("asphalt"))
        else:
            y = y0 + (y1 - y0) * t
            B.box("ground_paint", (x0 - 0.08, y, 0.0), (x0 + 0.08, y + 3, z), tile=tile("asphalt"))


def zebra(B, x0, x1, y0, y1, along_x=True):
    """Passage pieton : bandes de 50 cm tous les metres, en travers de la chaussee."""
    if along_x:  # chaussee est-ouest : bandes orientees nord-sud
        x = x0
        while x + 0.5 <= x1:
            B.box("ground_paint", (x, y0 + 0.4, 0.0), (x + 0.5, y1 - 0.4, MARK_Z), tile=tile("asphalt"))
            x += 1.0
    else:
        y = y0
        while y + 0.5 <= y1:
            B.box("ground_paint", (x0 + 0.4, y, 0.0), (x1 - 0.4, y + 0.5, MARK_Z), tile=tile("asphalt"))
            y += 1.0


def flat_logo(B, mat, x, y, height, z=0.0):
    """Monogramme FO incruste a plat dans le sol (haut du logo vers le nord), 5 cm au-dessus du dallage."""
    fo_logo(B, mat, Matrix.Translation((x, y - height / 2, z + 0.19)) @ Matrix.Rotation(-math.pi / 2, 4, "X"), height, depth=0.08)


def roundabout(B, cx, cy):
    """Rond-point : anneau d'enrobe, ilot engazonne borde de beton, stele FootOFF au centre."""
    B.cyl("ground_asphalt", (cx, cy, 0.0), (cx, cy, DISC_Z), DISC_R, segs=40, tile=tile("asphalt"))
    B.cyl("ground_concrete", (cx, cy, 0.0), (cx, cy, 0.2), ISLAND_R + 0.4, segs=28, tile=tile("concrete"))
    B.cyl("ground_lawn", (cx, cy, 0.0), (cx, cy, 0.24), ISLAND_R, segs=28, tile=tile("lawn"))
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
    B.box("ground_sidewalk", (-42, q1, 0.0), (42, q0, 0.35), tile=tile("sidewalk"))
    B.box("emissive_led", (-42, q0 - 0.3, 0.35), (42, q0, 0.4))
    B.box("emissive_led", (-42, q1, 0.35), (42, q1 + 0.3, 0.4))
    for x in range(-36, 37, 12):
        B.cyl("black_metal", (x, ym, 0.35), (x, ym, 3.9), 0.1, segs=6)
    B.box("black_metal", (-40, q1 - 0.6, 3.9), (40, q0 + 0.6, 4.15))
    B.box("glass", (-40, q1 - 0.6, 4.15), (40, q0 + 0.6, 4.2))
    B.box("emissive_light", (-38, ym - 0.2, 3.75), (38, ym + 0.2, 3.9))
    for x in (-24, 0, 24):
        B.box("glass", (x - 4, ym - 0.03, 0.35), (x + 4, ym + 0.03, 2.6))
        for dx in (-1.05, 1.05):  # bancs adosses a la paroi vitree, tournes vers le parvis
            bench(B, x + dx, ym + 0.36, 0.0, z=0.35)
        litter_bin(B, x + 3.2, ym + 0.5, z=0.35)
    B.box("black_metal", (44, ym - 0.3, 0.35), (45.6, ym + 0.3, 5.2))
    fo_logo(B, "emissive_led", Matrix.Translation((44.8, ym - 0.35, 3.0)), 1.8, depth=0.05)


def parking_lot(B, x0, y0, x1, y1):
    """Parking paysager : deux rangees d'emplacements, ilot central plante, voitures garees."""
    B.box("ground_asphalt", (x0, y0, 0.0), (x1, y1, ROAD_Z), tile=tile("asphalt"))
    ym = (y0 + y1) / 2
    B.box("ground_concrete", (x0 + 4, ym - 2.4, 0.0), (x1 - 4, ym + 2.4, 0.16), tile=tile("concrete"))
    B.box("ground_lawn", (x0 + 4.3, ym - 2.1, 0.0), (x1 - 4.3, ym + 2.1, 0.2), tile=tile("lawn"))
    n = int((x1 - x0 - 8) // 2.6)
    for i in range(n + 1):
        x = x0 + 4 + i * 2.6
        for ya, yb in ((y0 + 0.6, y0 + 5.6), (y1 - 5.6, y1 - 0.6)):
            B.box("ground_paint", (x - 0.06, ya, 0.0), (x + 0.06, yb, MARK_Z), tile=tile("asphalt"))
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


def prestige_materials(mats):
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
    """Jardiniere basse en granit sombre, gazon, alignement d'arbres ; parterre a la francaise : haie taillee le long
    du bord, buis en boule entre les arbres."""
    t = 0.3
    for a, b in (((x0, y0), (x1, y0 + t)), ((x0, y1 - t), (x1, y1)), ((x0, y0 + t), (x0 + t, y1 - t)), ((x1 - t, y0 + t), (x1, y1 - t))):
        B.box("ground_granite", (*a, 0.0), (*b, 0.5), tile=tile("granite"))
    B.box("ground_lawn", (x0 + t, y0 + t, 0.0), (x1 - t, y1 - t, 0.42), tile=tile("lawn"))
    y = y0 + step / 2
    while y < y1 - 2:
        tree(B, tree_x, y, 9.5, 2.4, z=0.42)
        if y + step < y1 - 2:
            for dx in (-2.6, 2.6):
                shrub(tree_x + dx, y + step / 2, 1.3, "buis", z=0.42)
        y += step
    e = t + 0.55  # haie : cadre interieur de la jardiniere
    hedge(x0 + e, y0 + e, x0 + e, y1 - e, z=0.42)
    hedge(x1 - e, y0 + e, x1 - e, y1 - e, z=0.42)
    hedge(x0 + e + 0.4, y0 + e, x1 - e - 0.4, y0 + e, z=0.42)
    hedge(x0 + e + 0.4, y1 - e, x1 - e - 0.4, y1 - e, z=0.42)


def prestige(B):
    """Parvis de prestige : axe en granit clair borde de bandes sombres, place de la Coupe d'Europe, miroir d'eau,
    jardinieres plantees, bannieres FootOFF, bornes lumineuses et monogramme dore au sol. Les trophees et leurs socles
    (allee d'honneur, x = +/-20,5 m) sont poses par le jeu, seulement pour les competitions gagnees."""
    x0, y0, x1, y1 = PRESTIGE
    B.box("ground_prestige", (x0, y0, 0.0), (x1, y1, PAVE_Z), tile=tile("esplanade"))
    tx, ty = TROPHY
    near = lambda x, y, r: math.hypot(x - tx, y - ty) < r  # noqa: E731
    # bandes de granit sombre : bordures de l'allee centrale et calepinage transversal tous les 12 m
    for s in (-1, 1):
        B.box("ground_granite", (min(s * 17, s * 18), y0, 0.0), (max(s * 17, s * 18), y1, 0.19), tile=tile("granite"))
    for y in (-141.3, -128.3, -97.3):  # entre le monogramme, le miroir d'eau et la place du trophee
        B.box("ground_granite", (-17, y, 0.0), (17, y + 0.6, 0.19), tile=tile("granite"))
    # place de la Coupe d'Europe : anneau sombre et cercle d'or lumineux (le trophee est pose par le jeu)
    B.sector("ground_granite", (tx, ty), 12.0, 13.2, 0, 2 * math.pi, 0.0, 0.19, segs=56, tile=tile("granite"))
    B.sector("emissive_led", (tx, ty), 11.55, 11.8, 0, 2 * math.pi, 0.0, 0.2, segs=56)
    # miroir d'eau : margelle sombre, eau 4 cm sous la margelle
    p0, q0, p1, q1 = POOL
    m = 0.6
    for a, b in (((p0 - m, q0 - m), (p1 + m, q0)), ((p0 - m, q1), (p1 + m, q1 + m)), ((p0 - m, q0), (p0, q1)), ((p1, q0), (p1 + m, q1))):
        B.box("ground_granite", (*a, 0.0), (*b, 0.32), tile=tile("granite"))
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
            B.box("ground_granite", (min(s * 20.4, s * 21.0), y - 1.2, 0.0), (max(s * 20.4, s * 21.0), y + 1.2, 0.48), tile=tile("granite"))
        for y in range(int(y0) + 4, int(y1), 8):  # bornes lumineuses
            if near(s * 17.5, y, 14.5):
                continue
            B.cyl("black_metal", (s * 16.4, y, 0.14), (s * 16.4, y, 1.0), 0.12, segs=8)
            B.cyl("emissive_light", (s * 16.4, y, 1.0), (s * 16.4, y, 1.12), 0.13, segs=8)


def ground_image(key, kind):
    img = bpy.data.images.load(os.path.join(GROUNDS, f"{key}_{kind}.jpg"), check_existing=True)
    img.colorspace_settings.name = "sRGB" if kind == "color" else "Non-Color"
    return img


def gltf_output():
    """Groupe « glTF Material Output » : l'exportateur glTF y lit l'occlusion ambiante."""
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def photo_material(name, key, color=None, tone=None):
    """Matiere photo : couleur, relief et ARM (occlusion R, rugosite G, metal B) de assets-src/grounds-baked/.
    Une seule image ARM, exportee a la fois en occlusionTexture et en metallicRoughnessTexture. tone : teinte sRGB
    visee, obtenue en multipliant la photo dans le jeu (extras « factor », ground.js) : deux sols, une seule image."""
    m = material(name, image=ground_image(color or key, "color"), normal=ground_image(key, "normal"))
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = ground_image(key, "arm")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    out = nt.nodes.new("ShaderNodeGroup")
    out.node_tree = gltf_output()
    nt.links.new(sep.outputs["Red"], out.inputs["Occlusion"])
    # extras glTF (userData dans le jeu) : tuile en metres, dalles par tuile, couleur moyenne (lumiere lineaire)
    m["tile"] = GROUND_META[key]["tile"]
    m["slabs"] = GROUND_META[key].get("slabs", 0)
    m["mean"] = GROUND_META[color or key]["mean_linear"]
    if tone:
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in tone]
        m["factor"] = [round(t / mm, 4) for t, mm in zip(lin, m["mean"])]
    return m


def ground_materials(mats):
    """Sols photo (ground_* : nuances du jeu, src/three/ground.js), peinture routiere, teck des bancs, fonte."""
    for key in ("granite", "sidewalk", "asphalt", "lawn", "concrete", "gravel", "mulch"):
        mats[f"ground_{key}"] = photo_material(f"ground_{key}", key)
    mats["ground_prestige"] = photo_material("ground_prestige", "esplanade")  # granit clair de l'axe d'honneur
    mats["ground_esplanade"] = photo_material("ground_esplanade", "esplanade", tone=(0.42, 0.41, 0.385))
    mats["ground_paint"] = photo_material("ground_paint", "asphalt", color="paint")  # relief et ARM de l'enrobe
    mats["ground_band"] = photo_material("ground_band", "granite", color="band")  # calepinage : granit plus clair
    mats["wood_teak"] = photo_material("wood_teak", "teak")
    mats["tree_grate"] = material("tree_grate", image=tex_grate(), rough=0.6, metal=0.35)
    mats["cast_iron"] = material("cast_iron", (0.10, 0.10, 0.105), rough=0.55, metal=0.4)
    mats["emissive_pool"] = material("emissive_pool", (0, 0, 0), rough=1.0, emission_map=tex_pool(), strength=1.0)


def legacy_draws():
    """Les anciennes textures procedurales des sols (remplacees par les photos) tiraient dans RNG avant le placement
    des jardins : memes tirages, pour garder les arbres et massifs valides en phase 2 exactement a leur place."""
    def fbm_draws(cells, octaves):
        for o in range(octaves):
            RNG.random((cells * 2 ** o, cells * 2 ** o))
    for _ in range(2):  # granit clair et sombre du parvis
        RNG.random((4, 2))
        fbm_draws(48, 3)
    RNG.random((8, 4))  # dallage de l'esplanade
    fbm_draws(64, 3)
    fbm_draws(6, 5)  # pelouse
    fbm_draws(96, 2)
    fbm_draws(128, 2)  # grain de l'enrobe
    fbm_draws(32, 2)


# =============================================================== bordures, caniveaux, calepinage

def raster(rects=(), circles=()):
    """Masque du plan a 50 cm (cellule [j, i] : x = SITE.x0 + i * RES, y = SITE.y0 + j * RES)."""
    x0, y0, x1, y1 = SITE
    nx, ny = round((x1 - x0) / RES), round((y1 - y0) / RES)
    m = np.zeros((ny, nx), bool)
    for r in rects:
        i0, i1 = (max(0, min(nx, round((v - x0) / RES))) for v in (r[0], r[2]))
        j0, j1 = (max(0, min(ny, round((v - y0) / RES))) for v in (r[1], r[3]))
        m[j0:j1, i0:i1] = True
    if circles:
        X, Y = np.meshgrid(x0 + (np.arange(nx) + 0.5) * RES, y0 + (np.arange(ny) + 0.5) * RES)
        for cx, cy, rad in circles:
            m |= np.hypot(X - cx, Y - cy) < rad
    return m


def runs(mask):
    """Suites de cellules vraies le long de chaque ligne : (ligne, debut, fin)."""
    out = []
    for j in np.flatnonzero(mask.any(1)):
        d = np.diff(np.concatenate([[0], mask[j].astype(np.int8), [0]]))
        out += [(int(j), int(a), int(b)) for a, b in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1))]
    return out


def borders(zone, beyond):
    """Cellules de `zone` dont la voisine (sud, nord, ouest, est) est hors de la zone et dans `beyond`."""
    z = np.pad(zone, 1)
    b = np.pad(beyond, 1)
    c = z[1:-1, 1:-1]
    return {"s": c & ~z[:-2, 1:-1] & b[:-2, 1:-1], "n": c & ~z[2:, 1:-1] & b[2:, 1:-1],
            "w": c & ~z[1:-1, :-2] & b[1:-1, :-2], "e": c & ~z[1:-1, 2:] & b[1:-1, 2:]}


def edge_strips(sides, inner, outer):
    """Bandes le long des bords : `inner` m vers l'interieur de la zone, `outer` m vers l'exterieur.
    Rend des rectangles (x0, y0, x1, y1) et leur sens (vrai : le long de x)."""
    x0, y0 = SITE[0], SITE[1]
    out = []
    for d, m in sides.items():
        horiz = d in ("s", "n")
        for j, a, b in runs(m if horiz else m.T):
            line = (y0 if horiz else x0) + (j if d in ("s", "w") else j + 1) * RES
            lo, hi = (line - outer, line + inner) if d in ("s", "w") else (line - inner, line + outer)
            if horiz:
                out.append(((x0 + a * RES, lo, x0 + b * RES, hi), True))
            else:
                out.append(((lo, y0 + a * RES, hi, y0 + b * RES), False))
    return out


def edging(B):
    """Bordures en granit autour des espaces pietons, des terre-pleins et des chaussees bordees de pelouse ;
    caniveaux en beton et avaloirs le long des trottoirs. Rien contre le stade (il a son propre sol)."""
    paved = raster(SIDEWALKS + ESPLANADE + ALLEYS + FORECOURT_SIDES + [PROMENADE, PRESTIGE])
    roads = raster(ROADS + PARKINGS)
    discs = raster(circles=[(cx, cy, DISC_R) for cx, cy in ROUNDABOUTS])
    median = raster(MEDIAN) & ~discs
    free = ~raster([(STADIUM[0] - RES, STADIUM[1] - RES, STADIUM[2] + RES, STADIUM[3] + RES)])
    lawn = free & ~paved & ~roads & ~discs & ~median
    granite = tile("granite")
    for r, _ in edge_strips(borders(paved, free), CURB_W, 0.01):
        B.box("ground_band", (r[0], r[1], 0.0), (r[2], r[3], CURB_Z), tile=granite)
    for r, _ in edge_strips(borders(median, roads | discs), CURB_W, 0.01):
        B.box("ground_band", (r[0], r[1], 0.0), (r[2], r[3], 0.15), tile=granite)
    for r, _ in edge_strips(borders(roads, lawn), 0.01, CURB_W):  # chaussee bordee de pelouse : bordure cote pelouse
        B.box("ground_band", (r[0], r[1], 0.0), (r[2], r[3], 0.15), tile=granite)
    for r, along_x in edge_strips(borders(roads, paved | median), GUTTER_W, 0.0):  # sur l'enrobe, contre la bordure
        B.box("ground_concrete", (r[0], r[1], 0.0), (r[2], r[3], GUTTER_Z), tile=tile("concrete"))
        length = (r[2] - r[0]) if along_x else (r[3] - r[1])
        for k in range(int(length // 24)):  # avaloirs tous les 24 m
            t = 12 + 24 * k
            if along_x:
                drain(B, r[0] + t, (r[1] + r[3]) / 2, GUTTER_Z, along_x=True)
            else:
                drain(B, (r[0] + r[2]) / 2, r[1] + t, GUTTER_Z, along_x=False)
    # anneaux des ronds-points : bordure courbe, interrompue la ou les voies et les terre-pleins arrivent
    n = 144
    for cx, cy in ROUNDABOUTS:
        open_ = [any(inside(cx + (DISC_R + 0.4) * math.cos(a), cy + (DISC_R + 0.4) * math.sin(a), r)
                     for r in ROADS + MEDIAN + SIDEWALKS) for a in (2 * math.pi * (k + 0.5) / n for k in range(n))]
        start = open_.index(True) if True in open_ else 0
        k = 0
        while k < n:
            i = (start + k) % n
            if open_[i]:
                k += 1
                continue
            m = 0
            while k + m < n and not open_[(start + k + m) % n]:
                m += 1
            a0 = 2 * math.pi * i / n
            B.sector("ground_band", (cx, cy), DISC_R - 0.01, DISC_R + CURB_W, a0, a0 + 2 * math.pi * m / n,
                     0.0, 0.15, segs=max(1, m), tile=granite)
            k += m


def bands(B):
    """Calepinage de l'esplanade : bandes de granit gris tous les 6 m (sur les joints des dalles d'un metre), arretees
    aux bordures ; liseré de granit la ou l'esplanade rejoint les allees et les trottoirs en paves."""
    esp = raster(ESPLANADE + FORECOURT_SIDES + [PROMENADE])
    paved = raster(SIDEWALKS + ESPLANADE + ALLEYS + FORECOURT_SIDES + [PROMENADE, PRESTIGE])
    x0, y0 = SITE[0], SITE[1]
    h = BAND_W / 2
    granite = tile("granite")
    for vertical in (True, False):
        m, pm = (esp, paved) if vertical else (esp.T, paved.T)  # lignes : le long de la bande ; colonnes : en travers
        org, along = (x0, y0) if vertical else (y0, x0)
        for k in range(math.ceil(org / BAND_STEP), math.floor((org + m.shape[1] * RES) / BAND_STEP) + 1):
            c = round((k * BAND_STEP - org) / RES)  # cellule juste apres la ligne de bande
            if c <= 0 or c >= m.shape[1]:
                continue
            both = m[:, c - 1] & m[:, c]
            for _, a, b in runs(both[None, :]):
                lo, hi = along + a * RES, along + b * RES
                # au bout : bordure (bord du dallage) ou autre revetement ; la bande s'arrete avant
                if a == 0 or not (pm[a - 1, c - 1] and pm[a - 1, c]):
                    lo += CURB_W
                elif not (m[a - 1, c - 1] and m[a - 1, c]):
                    lo += BAND_W
                if b >= len(both) or not (pm[b, c - 1] and pm[b, c]):
                    hi -= CURB_W
                elif not (m[b, c - 1] and m[b, c]):
                    hi -= BAND_W
                if hi - lo < 0.5:
                    continue
                line = k * BAND_STEP
                if vertical:
                    B.box("ground_band", (line - h, lo, 0.0), (line + h, hi, BAND_Z), tile=granite)
                else:
                    B.box("ground_band", (lo, line - h, 0.0), (hi, line + h, BAND_Z), tile=granite)
    # liseré aux changements de revetement (esplanade -> paves des allees et trottoirs)
    for r, _ in edge_strips(borders(esp, paved & ~raster([PRESTIGE])), BAND_W, 0.0):
        B.box("ground_band", (r[0], r[1], 0.0), (r[2], r[3], BAND_Z), tile=granite)


MULCH_RNG = np.random.default_rng(12)  # contours du paillage (a part : RNG et SHRUB_RNG placent les jardins)


def mulch(B, x, y, r):
    """Paillage (copeaux d'ecorce) en tache irreguliere sur la pelouse, au pied d'un arbre ou d'un arbuste."""
    if not inside(x, y, SITE, -1.2 * r):
        return  # massif au bord du site : le paillage deborderait sur la prairie
    n = 14
    ph = MULCH_RNG.uniform(0, 2 * math.pi, 2)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        rr = r * (1 + 0.1 * math.sin(3 * a + ph[0]) + 0.06 * math.sin(5 * a + ph[1]))
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a), 0.03))
    B.piece("ground_mulch", pts, [tuple(range(n))], tile=tile("mulch"))


ZEBRAS = [(-6, -158, 6, -146), (-6, -184, 6, -172), (-6, 214, 6, 226),
          (-236, 34.5, -224, 40.5), (-236, -40.5, -224, -34.5), (224, -3, 236, 3)]


def manholes(B):
    """Plaques d'egout dans les voies, environ tous les 48 m (ni sur les passages pietons, ni dans les ronds-points)."""
    for r in ROADS:
        w, h = r[2] - r[0], r[3] - r[1]
        if max(w, h) < 40:
            continue
        along_x = w > h
        lo, hi = (r[0], r[2]) if along_x else (r[1], r[3])
        c = ((r[1] + r[3]) / 2 if along_x else (r[0] + r[2]) / 2) + 2.8  # au milieu d'une voie
        t = lo + 20
        while t < hi - 10:
            x, y = (t, c) if along_x else (c, t)
            clear = all(math.hypot(x - cx, y - cy) > DISC_R + 4 for cx, cy in ROUNDABOUTS)
            if clear and not any(inside(x, y, z, 3.0) for z in ZEBRAS):
                manhole(B, x, y, ROAD_Z)
            t += 48


def site(B, coll):
    x0, y0, x1, y1 = SITE
    B.box("ground_lawn", (x0, y0, -0.02), (x1, y1, 0.0), tile=tile("lawn"))
    for r in ROADS:
        B.box("ground_asphalt", (r[0], r[1], 0.0), (r[2], r[3], ROAD_Z), tile=tile("asphalt"))
    for cx, cy in ROUNDABOUTS:
        roundabout(B, cx, cy)
    # marquages : axes discontinus (interrompus aux ronds-points)
    dashes(B, -224, RING_N, 224, RING_N)
    dashes(B, -RING_X, -136, -RING_X, 214)
    dashes(B, RING_X, -136, RING_X, 214)
    dashes(B, -214, RING_S, 214, RING_S)
    dashes(B, -300, -178, 300, -178)
    for r in MEDIAN:
        B.box("ground_lawn", (r[0], r[1], 0.0), (r[2], r[3], 0.1), tile=tile("lawn"))
    tram(B)
    # espaces pietons : grandes dalles de granit (esplanade, parvis, promenade), paves beton (trottoirs, allees)
    for r in ESPLANADE + FORECOURT_SIDES + [PROMENADE]:
        B.box("ground_esplanade", (r[0], r[1], 0.0), (r[2], r[3], PAVE_Z), tile=tile("esplanade"))
    for r in SIDEWALKS + ALLEYS:
        B.box("ground_sidewalk", (r[0], r[1], 0.0), (r[2], r[3], PAVE_Z), tile=tile("sidewalk"))
    edging(B)
    bands(B)
    for p in PARKINGS:
        parking_lot(B, *p)
    # passages pietons : du parvis a la station (deux chaussees), en haut de la promenade, aux allees
    for zx0, zy0, zx1, zy1 in ZEBRAS:
        zebra(B, zx0, zx1, zy0, zy1, along_x=(zx1 - zx0) <= (zy1 - zy0))
    manholes(B)
    # parvis de prestige au centre, cotes plantes (grilles d'arbres), eclaires, bancs, arceaux a velos, bornes
    prestige(B)
    for x in (-70, -56, -42, 42, 56, 70):
        for y in (-136, -107):
            tree(B, x, y, 8.5, 2.2, z=PAVE_Z)
            tree_grate(B, x, y, PAVE_Z)
    for x in (-74, -46, 46, 74):
        lantern(B, x, -121, z=PAVE_Z)
    for s in (-1, 1):
        bench(B, s * 60, -121, s * math.pi / 2, z=PAVE_Z)  # tournes vers l'axe d'honneur
        litter_bin(B, s * 60, -122.6, PAVE_Z)
        for i in range(6):
            bike_rack(B, s * (64.0 + 1.0 * i), -139.6, math.pi / 2, z=PAVE_Z)
    for x in np.arange(-78.0, 78.1, 2.5):  # bornes le long du boulevard, devant le parvis (sauf le passage pieton)
        if abs(x) > 8:
            bollard(B, float(x), -145.5, PAVE_Z)
    # promenade entre les parcelles nord : arbres en colonnes sur grilles, bancs, lanternes basses
    for y in range(126, 206, 10):
        for x in (-9, 9):
            tree(B, x, y, 8, 2.0, z=PAVE_Z, columnar=True)
            tree_grate(B, x, y, PAVE_Z, size=1.2)
        lantern(B, 0, y + 5, h=4.5, z=PAVE_Z)
        bench(B, -6.2, y + 1.5, -math.pi / 2, z=PAVE_Z)
        bench(B, 6.2, y + 1.5, math.pi / 2, z=PAVE_Z)
        if y % 20 == 6:
            litter_bin(B, -6.3, y + 3.3, PAVE_Z)
            litter_bin(B, 6.3, y + 3.3, PAVE_Z)
    flat_logo(B, "gold_paint", 0, 200, 6.0)
    for x in (-11.5, -9.5, -7.5, 7.5, 9.5, 11.5):  # bornes au debouche de la promenade sur le peripherique
        bollard(B, x, 213.4, PAVE_Z)
    # allees autour de l'esplanade : alignements d'arbres cote esplanade, lanternes cote parcelles
    for y in range(-98, 112, 12):
        tree(B, -133, y, 8, 2.1)
        tree(B, 133, y, 8, 2.1)
    for x in range(-126, 127, 12):
        if abs(x) > 18:
            tree(B, x, 112.0, 8, 2.1)
    for y in range(-96, 113, 24):
        lantern(B, -141.5, y, z=PAVE_Z)
        lantern(B, 141.5, y, z=PAVE_Z)
    # lanternes et bancs de l'esplanade (bord exterieur, tournes vers le stade), corbeille a un banc sur deux
    for x in range(-120, 121, 24):
        if abs(x) > 40:
            lantern(B, x, -97, z=PAVE_Z)
        lantern(B, x, 107, z=PAVE_Z)
    for y in range(-60, 61, 24):
        lantern(B, -127, y, z=PAVE_Z)
        lantern(B, 127, y, z=PAVE_Z)
    for k, x in enumerate((-108, -84, -60, 60, 84, 108)):
        bench(B, x, -98.4, 0.0, z=PAVE_Z)
        if k % 2 == 0:
            litter_bin(B, x + 1.5, -98.6, PAVE_Z)
    for k, x in enumerate((-108, -84, -60, -36, 36, 60, 84, 108)):
        bench(B, x, 108.4, math.pi, z=PAVE_Z)
        if k % 2 == 0:
            litter_bin(B, x - 1.5, 108.6, PAVE_Z)
    for k, y in enumerate((-48, -24, 0, 24, 48)):
        for s in (-1, 1):
            bench(B, s * 128.4, y, s * math.pi / 2, z=PAVE_Z)
            if k % 2 == 0:
                litter_bin(B, s * 128.6, y + 1.5, PAVE_Z)
    # mats d'eclairage aux quatre coins de l'esplanade, tournes vers le stade : ils eclairent la plateforme quand
    # le jour baisse (projecteurs reels du jeu aux empties light_site_*)
    for i, (x, y) in enumerate(((-118, -88), (118, -88), (-118, 98), (118, 98))):
        mast(B, coll, x, y, 30, 4, 2, f"light_site_{i}", target=(0, 0, 0))
    # lampadaires routiers (crosse vers la chaussee) : peripherique et boulevard sud
    for x in range(-210, 211, 30):
        street_lamp(B, x, 212.3, math.pi / 2, z=PAVE_Z)
        if abs(x) > 12 and not 170 < abs(x) < 190:
            street_lamp(B, x, -144.3, -math.pi / 2, z=PAVE_Z)
    for y in range(-120, 211, 30):
        street_lamp(B, -222.3, y, math.pi, z=PAVE_Z)
        street_lamp(B, 222.3, y, 0.0, z=PAVE_Z)
    for x in range(-290, 291, 30):
        street_lamp(B, x, -185.8, math.pi / 2, z=PAVE_Z)
    # arbres des jardins (dans le peripherique) et de la bande exterieure (moins denses) ; massifs paillés
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
            if SHRUB_RNG.random() < 0.4:  # massifs d'arbustes au pied de certains arbres
                bed = []
                for _ in range(int(SHRUB_RNG.integers(1, 4))):
                    a, d = SHRUB_RNG.uniform(0, 2 * math.pi), SHRUB_RNG.uniform(3.0, 5.5)
                    sx, sy = x + d * math.cos(a), y + d * math.sin(a)
                    if not any(inside(sx, sy, r, 1.5) for r in blocked):
                        h = SHRUB_RNG.uniform(1.3, 2.1)
                        shrub(sx, sy, h)
                        bed.append((sx, sy, h))
                if bed:
                    mulch(B, x, y, 1.7)
                    for sx, sy, h in bed:
                        mulch(B, sx, sy, min(1.4, 0.55 * h + 0.35))


def plot_empty(B, coll):
    """Parcelle ouverte : dalle prete a batir, contour dore (lumineux la nuit), panneau FootOFF."""
    plinth(B)
    B.box("ground_concrete", (-20, -20, 0.12), (20, 20, 0.16), tile=tile("concrete"))  # dalle sombre : le contour dore ressort
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
            B.box("ground_concrete", (sx * 26 - 1.4, sy * 26 - 1.4, 0.12), (sx * 26 + 1.4, sy * 26 + 1.4, 0.7), tile=tile("concrete"))
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
    B.box("gravel", (-29, -29, 0), (29, 29, 0.1), tile=tile("gravel"))
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
    mats["gold_paint"] = material("gold_paint", GOLD, rough=0.4, metal=0.5)
    ground_materials(mats)  # sols photo, peinture routiere, teck, fonte
    mats["gravel"] = mats["ground_gravel"]
    plot_mats = dict(mats)  # parcelles : dallage sombre des batiments (le dallage clair est celui de l'esplanade)
    prestige_materials(mats)
    legacy_draws()
    for name, fn, m in (("site", site, mats), ("plot_empty", plot_empty, plot_mats), ("plot_locked", plot_locked, plot_mats)):
        coll = bpy.data.collections.new(f"prop_{name}")
        scene.collection.children.link(coll)
        B = Builder(m)
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
