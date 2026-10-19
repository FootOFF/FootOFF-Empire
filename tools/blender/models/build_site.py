"""FootOFF Empire - generateur du site urbain et des parcelles (props).

Collections exportees (models/props/<nom>.glb) :
  prop_site         : voirie, trottoirs, promenade, parvis du stade, lampadaires, arbres (circulation animee dans le jeu)
                      autour des parcelles (emprise 350 x 270 m, origine = centre du stade)
  prop_plot_empty   : parcelle ouverte, prete a batir
  prop_plot_locked  : parcelle verrouillee : chantier palissade, cabanes, grue

Plan (metres, Blender : x vers l'est, y vers le nord ; jeu : z = -y) calque sur src/three/layout.js :
stade 160 x 130 au centre, parcelles 60 x 60 en t1..t7.

Lancement :
    blender -b --factory-startup -P tools/blender/models/build_site.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import GOLD, Builder, Matrix, RNG, bpy, find_repo, fo_logo, material  # noqa: E402
from footoff_modern import container_box, lawn, modern_materials, plinth, tree  # noqa: E402

# Parcelles (centres en metres, repere Blender) = PLOT_POS de layout.js x 10, z -> -y
PLOTS = {
    "t1": (-45, 110), "t2": (45, 110),
    "t3": (-130, 70), "t4": (-130, 0), "t5": (-130, -70),
    "t6": (130, 35), "t7": (130, -35),
}
SITE = (-175.0, -115.0, 175.0, 155.0)  # x0, y0, x1, y1
STADIUM = (-80.0, -65.0, 80.0, 65.0)
ROAD_W = 12.0

# Voirie : boucle autour du stade + boulevard sud (cote camera) et ses deux liaisons
ROADS = [
    (-96, -78, 96, -66), (-96, 66, 96, 78), (-96, -78, -84, 78), (84, -78, 96, 78),
    (-175, -112, 175, -100), (-96, -100, -84, -78), (84, -100, 96, -78),
]
SIDEWALKS = [
    (-99.6, -81.5, 99.6, -78), (-99.6, 78, 99.6, 79.6), (-99.6, -81.5, -96, 79.6), (96, -81.5, 99.6, 79.6),
    (-175, -100, -99.6, -96.5), (99.6, -100, 175, -96.5),
]
PROMENADE = (-13, 79.6, 13, 150)
FORECOURT = (-60, -100, 60, -81.5)


def inside(x, y, r, m=0.0):
    return r[0] - m <= x <= r[2] + m and r[1] - m <= y <= r[3] + m


def lamp(B, x, y, ang, h=8.0):
    """Lampadaire moderne : mat noir, crosse, tete LED (allumee la nuit)."""
    dx, dy = math.cos(ang) * 1.6, math.sin(ang) * 1.6
    B.cyl("black_metal", (x, y, 0), (x, y, h), 0.09, 0.07, segs=6)
    B.cyl("black_metal", (x, y, h), (x + dx, y + dy, h + 0.15), 0.05, segs=4)
    B.box("emissive_light", (x + dx - 0.35, y + dy - 0.18, h - 0.05), (x + dx + 0.35, y + dy + 0.18, h + 0.12))


def dashes(B, x0, y0, x1, y1, z=0.031):
    """Marquage axial discontinu (3 m / 6 m)."""
    horiz = abs(x1 - x0) > abs(y1 - y0)
    length = abs(x1 - x0) if horiz else abs(y1 - y0)
    n = int(length // 9)
    for i in range(n):
        t = (i * 9 + 3) / length
        if horiz:
            x = x0 + (x1 - x0) * t
            B.box("white", (x, y0 - 0.08, 0.03), (x + 3, y0 + 0.08, z))
        else:
            y = y0 + (y1 - y0) * t
            B.box("white", (x0 - 0.08, y, 0.03), (x0 + 0.08, y + 3, z))


def flat_logo(B, mat, x, y, height, z=0.0):
    """Monogramme FO incruste a plat dans le sol (haut du logo vers le nord)."""
    fo_logo(B, mat, Matrix.Translation((x, y - height / 2, z + 0.15)) @ Matrix.Rotation(-math.pi / 2, 4, "X"), height, depth=0.04)


def site(B, coll):
    x0, y0, x1, y1 = SITE
    B.box("lawn", (x0, y0, -0.02), (x1, y1, 0.0), tile=(8, 8))
    for r in ROADS:
        B.box("asphalt", (r[0], r[1], 0.0), (r[2], r[3], 0.03), tile=(8, 8))
    # marquages axiaux
    dashes(B, -84, -72, 84, -72)
    dashes(B, -84, 72, 84, 72)
    dashes(B, -90, -66, -90, 66)
    dashes(B, 90, -66, 90, 66)
    dashes(B, -175, -106, 175, -106)
    for r in SIDEWALKS:
        B.box("paving", (r[0], r[1], 0.0), (r[2], r[3], 0.14), tile=(4.8, 4.8))
    # passages pietons sur la boucle sud, face au parvis
    for i in range(7):
        x = -8 + i * 2.4
        B.box("white", (x, -77.4, 0.03), (x + 1.2, -66.6, 0.035))
        B.box("white", (x, -111.4, 0.03), (x + 1.2, -100.6, 0.035))
    # parvis du stade : dallage, grand monogramme dore, alignements d'arbres
    f = FORECOURT
    B.box("paving", (f[0], f[1], 0.0), (f[2], f[3], 0.14), tile=(4.8, 4.8))
    flat_logo(B, "gold_paint", 0, -90.5, 13.0)
    for x in (-52, -40, -28, 28, 40, 52):
        for y in (-95, -86):
            tree(B, x, y, 8.5, 2.2, z=0.14)
    for x in (-58, -20, 20, 58):
        lamp(B, x, -98.5, math.pi / 2)
    # promenade entre les parcelles nord
    p = PROMENADE
    B.box("paving", (p[0], p[1], 0.0), (p[2], p[3], 0.14), tile=(4.8, 4.8))
    for y in range(86, 150, 10):
        for x in (-9, 9):
            tree(B, x, y, 8, 2.0, z=0.14, columnar=True)
        lamp(B, 0, y + 5, 0.0, h=6)
        B.box("wood", (-6.5, y, 0.14), (-5.9, y + 3, 0.6), tile=(2, 2))
        B.box("wood", (5.9, y, 0.14), (6.5, y + 3, 0.6), tile=(2, 2))
    flat_logo(B, "gold_paint", 0, 145, 6.0)
    # lampadaires le long de la boucle (cote exterieur)
    for x in range(-84, 85, 24):
        lamp(B, x, -79.8, math.pi / 2)
        lamp(B, x, 78.8, -math.pi / 2)
    for y in range(-60, 61, 24):
        lamp(B, -97.8, y, 0.0)
        lamp(B, 97.8, y, math.pi)
    for x in range(-168, 169, 28):
        lamp(B, x, -98.2, -math.pi / 2)
    # arbres dans les espaces verts libres (grille jittee, hors voirie / parcelles / stade)
    blocked = [STADIUM, PROMENADE, FORECOURT] + list(ROADS) + list(SIDEWALKS)
    blocked += [(cx - 31, cy - 31, cx + 31, cy + 31) for cx, cy in PLOTS.values()]
    for gx in range(int(x0) + 6, int(x1) - 4, 13):
        for gy in range(int(y0) + 18, int(y1) - 4, 13):
            x, y = gx + RNG.uniform(-4, 4), gy + RNG.uniform(-4, 4)
            if RNG.random() > 0.62 or any(inside(x, y, r, 3.0) for r in blocked):
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
