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
from footoff_lib import GOLD, Builder, Matrix, RNG, bpy, find_repo, fo_logo, material  # noqa: E402
from footoff_modern import car, container_box, lawn, modern_materials, plinth, tree  # noqa: E402

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
ESPLANADE = [(-130, -100, 130, -65), (-130, 65, 130, 110), (-130, -65, -80, 65), (80, -65, 130, 65)]
FORECOURT = (-80, -142.5, 80, -100)  # parvis provisoire jusqu'au boulevard (etape 2 : parvis de prestige)
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
    """Monogramme FO incruste a plat dans le sol (haut du logo vers le nord)."""
    fo_logo(B, mat, Matrix.Translation((x, y - height / 2, z + 0.15)) @ Matrix.Rotation(-math.pi / 2, 4, "X"), height, depth=0.04)


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
    for r in SIDEWALKS + ESPLANADE + ALLEYS + [FORECOURT, PROMENADE]:
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
    # parvis (provisoire) : grand monogramme dore, alignements d'arbres, lampadaires
    flat_logo(B, "gold_paint", 0, -121, 13.0)
    for x in (-70, -56, -42, -28, 28, 42, 56, 70):
        for y in (-136, -107):
            tree(B, x, y, 8.5, 2.2, z=0.14)
    for x in (-74, -36, 36, 74):
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
        lamp(B, x, -97, math.pi / 2, z=0.14)
        lamp(B, x, 107, -math.pi / 2, z=0.14)
    for y in range(-60, 61, 24):
        lamp(B, -127, y, 0.0, z=0.14)
        lamp(B, 127, y, math.pi, z=0.14)
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
    blocked = [STADIUM, ARENA, FORECOURT, PROMENADE] + ROADS + SIDEWALKS + ESPLANADE + ALLEYS + PARKINGS + MEDIAN
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
            tree(B, sx * 26, sy * 26, 8, 2.2, z=0.7)
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
    for name, fn in (("site", site), ("plot_empty", plot_empty), ("plot_locked", plot_locked)):
        coll = bpy.data.collections.new(f"prop_{name}")
        scene.collection.children.link(coll)
        B = Builder(mats)
        fn(B, coll)
        B.finalize(coll, name)
    out = os.path.join(find_repo(), "assets-src", "blend", "site.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("SITE OK", out)


if __name__ == "__main__":
    main()
