"""FootOFF Empire - generateur des batiments modernes (training, academy, fans, sponsor ; niveaux 1 a 5).

Architecture realiste et sombre aux couleurs FootOFF Media : bardage anthracite, verre fume (bureaux
allumes la nuit), cedre, beton fonce, touches d'or. Chaque parcelle (60 x 60 m) est livree amenagee :
pavage, pelouses, arbres. Facade principale vers -Y (cote camera du jeu).

Lancement :
    blender -b --factory-startup -P tools/blender/models/build_buildings.py
Puis :
    blender assets-src/blend/buildings.blend -b -P tools/blender/footoff_export.py
    npm run models
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import Builder, Matrix, bpy, find_repo, fo_logo, material, mast  # noqa: E402
from footoff_modern import (ball_fence, canopy, clad_box, container_box as container, fins, glass_box, lawn, modern_materials,  # noqa: E402
                            parking, plinth, rail, roof, solar_array, string_lights, tex_turf, tree, turf_pitch)

FH = 3.6  # hauteur d'etage


def office(B, x0, y0, x1, y1, z0, floors, ground_glass=True, mat="cladding", inset=1.2, bands=True, units=True):
    """Bloc de bureaux : rez-de-chaussee vitre en retrait sur poteaux, etages bardes a bandeaux vitres.
    Renvoie la cote du toit."""
    top = z0 + floors * FH
    zc = z0
    if ground_glass:
        glass_box(B, x0 + inset, y0 + inset, x1 - inset, y1 - inset, z0, z0 + FH - 0.6, frame=False, cap=mat)
        n = max(1, int((x1 - x0) // 6))
        for i in range(n + 1):
            x = x0 + 0.3 + (x1 - x0 - 0.6) * i / n
            for y in (y0 + 0.3, y1 - 0.3):
                B.box("black_metal", (x - 0.2, y - 0.2, z0), (x + 0.2, y + 0.2, z0 + FH))
        zc = z0 + FH
    clad_box(B, x0, y0, x1, y1, zc, top, mat)
    if bands:
        for f in range(floors):
            if ground_glass and f == 0:
                continue
            zb = z0 + f * FH + 0.9
            B.box("emissive_curtain", (x0 - 0.06, y0 - 0.06, zb), (x1 + 0.06, y1 + 0.06, zb + FH * 0.6),
                  tile=(24.0, 28.8), origin=(0, 0, zb - 0.9))
    B.box("black_metal", (x0 - 0.1, y0 - 0.1, top), (x1 + 0.1, y1 + 0.1, top + 0.5))
    roof(B, x0, y0, x1, y1, top + 0.5, units=units)
    return top + 0.5


def tower(B, x0, y0, x1, y1, z0, floors, fin_step=1.5, gold_fins=True):
    """Tour en mur-rideau fume avec meneaux verticaux (or cote camera, noirs ailleurs)."""
    top = z0 + floors * FH
    glass_box(B, x0, y0, x1, y1, z0, top, frame=True, cap="black_metal")
    fins(B, x0 + 0.5, x1 - 0.5, y0, z0, top, spacing=fin_step, depth=0.45, width=0.1,
         mat="emissive_led" if gold_fins else "black_metal")
    for x in (x0, x1):  # meneaux sur les facades laterales
        n = max(1, int((y1 - y0) // 3))
        for i in range(1, n):
            y = y0 + (y1 - y0) * i / n
            B.box("black_metal", (x - 0.25 if x == x0 else x, y - 0.05, z0), (x if x == x0 else x + 0.25, y + 0.05, top))
    return top + 0.6


def bleacher(B, x0, x1, y_front, rows=4, depth=0.8, rise=0.45, seat="black_metal"):
    """Petite tribune tournee vers -Y (vers le terrain)."""
    for i in range(rows):
        ya = y_front + i * depth
        zt = 0.12 + (i + 1) * rise
        B.box("concrete_dark", (x0, ya, 0.12), (x1, ya + depth, zt))
        B.box(seat, (x0 + 0.3, ya + 0.1, zt), (x1 - 0.3, ya + 0.5, zt + 0.4))
    return y_front + rows * depth, 0.12 + rows * rise


def logo(B, x, y, z, h, mat="emissive_led", depth=0.2):
    """Monogramme FO dore face a la camera (-Y)."""
    fo_logo(B, mat, Matrix.Translation((x, y, z)), h, depth)


def trees_row(B, xs, y, h=9.0, r=2.4, columnar=False):
    for x in xs:
        tree(B, x, y, h, r, columnar=columnar)


# =============================================================== centre d'entrainement

def training(B, coll, L):
    plinth(B)
    if L == 1:
        turf_pitch(B, "turf_train_s", 0, -13, (44, 28), goal_w=5, play=(40, 24))
        ball_fence(B, -22.5, -27.5, 22.5, 1.5, h=4.0)
        for x0 in (-15.0, 1.0):  # vestiaires en conteneurs bardes, liseré or
            clad_box(B, x0, 10, x0 + 12.2, 12.6, 0.12, 2.9)
            B.box("emissive_led", (x0, 9.96, 2.2), (x0 + 12.2, 10.0, 2.36))
            B.box("glass", (x0 + 5, 9.95, 0.12), (x0 + 6.2, 10.0, 2.2))
        canopy(B, -16, 7.0, 14, 10.0, 2.95)
        lawn(B, -28, 15, 28, 28)
        trees_row(B, (-22, -12, -2, 8, 18), 22)
        for i, (x, y) in enumerate([(-23.5, -28.2), (23.5, -28.2), (-23.5, 2.2), (23.5, 2.2)]):
            mast(B, coll, x, y, 12, 2, 1, f"light_{i}", target=(0, -13, 0))
        return
    turf_pitch(B, "turf_train", 0, -10, (56, 36), goal_w=6, play=(52, 32))
    ball_fence(B, -28.5, -28.5, 28.5, 8.5, h=5.0)
    for i, (x, y) in enumerate([(-28.8, -28.8), (28.8, -28.8), (-28.8, 8.8), (28.8, 8.8)]):
        mast(B, coll, x, y, 16, 3, 2, f"light_{i}", target=(0, -10, 0))
    if L == 2:
        clad_box(B, -20, 15, 20, 27, 0.12, 4.4, top=True)
        glass_box(B, -17, 14.6, 17, 15.0, 0.12, 4.0, frame=False, cap="black_metal")
        canopy(B, -21, 10.5, 21, 15, 4.4)
        logo(B, 15, 10.45, 4.85, 1.8)
        bleacher(B, -12, 12, 9.0, rows=2)
        trees_row(B, (-25, 25), 20, h=8)
    elif L == 3:
        glass_box(B, -22, 15, 22, 27, 0.12, 4.2, frame=False, cap="cladding")
        clad_box(B, -24, 13, 24, 28.5, 4.2, 8.8, top=True)
        B.box("emissive_curtain", (-23, 12.94, 5.4), (23, 13.0, 7.6), tile=(24.0, 28.8), origin=(0, 0, 4.5))
        fins(B, -12, 23.5, 12.94, 4.2, 8.8, spacing=1.8, depth=0.45)
        logo(B, -18.5, 12.7, 5.0, 3.2)
        solar_array(B, -21, 16, 21, 27, 8.83, rows=3)
        bleacher(B, -14, 14, 9.0, rows=3)
        canopy(B, -15, 9.0, 15, 11.4, 3.6)
    else:
        # aile musculation double hauteur, toute vitree
        glass_box(B, -28, 13, -11, 28.5, 0.12, 9.0, frame=True, cap="black_metal")
        rail(B, -28, 13, -11, 13, 9.6)
        floors = 3 if L == 4 else 4
        top = office(B, -10, 13, 28, 28.5, 0.12, floors, units=False)  # toit occupe (solaire / jardin)
        fins(B, -9.5, 27.5, 13.0, FH + 0.12, top - 0.5, spacing=1.8, depth=0.5)
        B.box("emissive_led", (-10.1, 12.85, top - 0.2), (28.1, 12.95, top + 0.1))
        logo(B, -6, 12.3, top + 0.6, 4.0)
        bleacher(B, -14, 14, 9.0, rows=3)
        canopy(B, -15, 9.0, 15, 11.4, 3.6)
        if L == 4:
            solar_array(B, -6, 17, 26, 27, top, rows=3)
        else:
            # toit-jardin et bassin de recuperation sur la toiture
            lawn(B, -8, 15, 10, 27, z=top)
            for x in (-5, 1, 7):
                tree(B, x, 21, 6, 1.8, z=top + 0.08)
            B.box("water", (13, 16, top), (26, 26, top + 0.3))
            rail(B, 12.5, 15.5, 26.5, 15.5, top)
            B.box("emissive_curtain", (-28.05, 12.95, 9.6), (-11, 28.5, 13.2), tile=(24.0, 28.8), origin=(0, 0, 8.7))


# =============================================================== academie

def academy(B, coll, L):
    plinth(B)
    lawn(B, -28, 1, 15, 8)
    if L <= 2:
        turf_pitch(B, "turf_cage", -6, -17, (30, 18), goal_w=3, goal_h=2, play=(28, 16))
        ball_fence(B, -21.3, -26.3, 9.3, -7.7, h=4.5)
    else:
        turf_pitch(B, "turf_acad", -6, -14, (42, 28), goal_w=5, play=(39, 25))
        ball_fence(B, -27.3, -28.3, 15.3, 0.3, h=4.5)
    school_floors = 2 if L <= 3 else 3
    top = office(B, -16, 10, 12, 22, 0.12, school_floors, ground_glass=(L >= 3))
    clad_box(B, -4, 8.0, 4, 10.0, 0.12, 4.0, mat="wood")  # entree en cedre
    canopy(B, -6, 6.2, 6, 10.0, 4.0)
    if L >= 2:
        dorm_floors = {2: 3, 3: 3, 4: 4, 5: 5}[L]
        office(B, 17, 2, 28, 28, 0.12, dorm_floors, ground_glass=False, mat="wood")
    if L >= 3:
        for x, y in ((-24, 24), (-20, 26.5), (14, -2)):
            tree(B, x, y, 8, 2.2)
    if L >= 4:  # passerelle vitree entre l'ecole et l'internat
        glass_box(B, 12, 14, 17, 18, FH + 0.12, 2 * FH + 0.12, frame=False, cap="black_metal")
    if L == 5:
        fins(B, -15.5, 11.5, 10.0, FH + 0.12, top - 0.5, spacing=1.6, depth=0.45)
        logo(B, 8, 9.3, top + 0.4, 3.0)
        bleacher(B, -24, 12, 1.0, rows=4)
        canopy(B, -25, 0.6, 13, 4.6, 4.4)
        B.box("emissive_led", (-25, 0.55, 4.3), (13, 0.65, 4.85))
    trees_row(B, (-26, -26), 14, h=8, columnar=True)


# =============================================================== espace supporters

def kiosk(B, x, y):
    """Kiosque de restauration (conteneur bardé, comptoir éclairé, auvent doré)."""
    clad_box(B, x - 3.5, y, x + 3.5, y + 2.6, 0.12, 2.9, mat="black_metal", top=True)
    B.box("emissive_light", (x - 2.6, y - 0.02, 1.1), (x + 2.6, y + 0.02, 2.2))  # comptoir eclaire
    B.box("wood", (x - 2.8, y - 0.55, 0.12), (x + 2.8, y, 1.05), tile=(2, 2))  # comptoir bois
    B.hexa("emissive_led", [(x - 3.0, y, 2.6), (x + 3.0, y, 2.6), (x + 3.0, y - 1.5, 2.3), (x - 3.0, y - 1.5, 2.3),
                            (x - 3.0, y, 2.66), (x + 3.0, y, 2.66), (x + 3.0, y - 1.5, 2.36), (x - 3.0, y - 1.5, 2.36)])


def picnic(B, x, y):
    B.box("wood", (x - 1.0, y - 0.4, 0.82), (x + 1.0, y + 0.4, 0.9), tile=(2, 2))
    for dy in (-0.75, 0.75):
        B.box("wood", (x - 1.0, y + dy - 0.15, 0.5), (x + 1.0, y + dy + 0.15, 0.56), tile=(2, 2))
    for dx in (-0.8, 0.8):
        B.box("black_metal", (x + dx - 0.05, y - 0.9, 0.12), (x + dx + 0.05, y + 0.9, 0.82))


def planter(B, x, y, h=7.0):
    B.box("concrete_dark", (x - 1.2, y - 1.2, 0.12), (x + 1.2, y + 1.2, 0.75))
    tree(B, x, y, h, 2.0, z=0.75)


def fans(B, coll, L):
    plinth(B)
    lawn(B, -28, -28, 10, -24)  # bande vegetale cote camera
    lawn(B, 24, -8, 28, 8)
    for x in (-24, -16, -8, 0, 8):
        tree(B, x, -26, 8, 2.2)
    for y in (-4, 4):
        tree(B, 26, y, 8, 2.0)
    kiosk(B, -12, 4)
    for x in (-18, -12, -6):
        for y in (-10, -3):
            picnic(B, x, y)
    string_lights(B, [(-22, -16), (-22, 2), (-2, 2), (-2, -16), (-22, -16)], z=4.6)
    for x, y in ((-26, 26), (26, -26), (-26, -26)):
        planter(B, x, y)
    if L <= 2:  # ilot vegetal (remplace plus tard par la terrasse a parasols)
        lawn(B, 4, -20, 22, 4)
        for x, y in ((8, -15), (16, -12), (11, -4), (19, -1), (7, 1)):
            tree(B, x, y, 7.5, 2.0)
    if L >= 2:  # bar en conteneurs + pergola en cedre
        container(B, 6, 14, 0.12)
        container(B, 6, 16.44, 0.12)
        container(B, 8, 14.6, 2.72, length=9)
        rail(B, 6, 14.0, 18.2, 14.0, 5.32)
        B.box("wood", (2, 8, 0.12), (24, 13.8, 0.3), tile=(2, 2))
        for x in (2.5, 12, 23.5):
            for y in (8.5, 13.3):
                B.box("black_metal", (x - 0.1, y - 0.1, 0.3), (x + 0.1, y + 0.1, 3.6))
        for i in range(40):
            x = 2 + i * 0.55
            B.box("wood", (x, 8, 3.6), (x + 0.12, 13.8, 3.85))
        logo(B, 12.1, 13.95, 2.85, 1.7)
    if L >= 3:  # boutique officielle vitree
        glass_box(B, -26, 12, -8, 24, 0.12, 4.6, frame=True, cap="black_metal")
        canopy(B, -27.5, 9.5, -6.5, 24.5, 4.6)
        logo(B, -24, 9.45, 5.05, 2.2)
        for x, y in ((8, -14), (16, -14), (8, -22), (16, -22)):  # parasols noirs
            B.cyl("black_metal", (x, y, 0.12), (x, y, 2.6), 0.04, segs=6)
            B.cyl("black_metal", (x, y, 2.3), (x, y, 2.9), 1.8, 0.05, segs=12)
            picnic(B, x, y)
    if L >= 4:  # ecran geant sur treillis
        for x in (-9, 9):
            for y in (26.4, 27.6):
                B.cyl("black_metal", (x, y, 0.12), (x, y, 13.5), 0.12, segs=6)
        for z in (4.0, 13.5):
            B.cyl("black_metal", (-9, 27, z), (9, 27, z), 0.12, segs=6)
        B.box("black_metal", (-8.4, 26.1, 4.2), (8.4, 26.6, 13.3))
        B.box("emissive_screen", (-8, 26.0, 4.5), (8, 26.1, 13.0), tile=(16, 8.5), origin=(-8, 0, 4.5))
        for (ax, bx) in ((-24, -4), (4, 24)):  # voiles d'ombrage tendues
            B.hexa("black_metal", [(ax, -26, 4.2), (bx, -26, 5.4), (bx, -16, 4.0), (ax, -16, 5.2),
                                   (ax, -26, 4.25), (bx, -26, 5.45), (bx, -16, 4.05), (ax, -16, 5.25)])
            for x, y, z in ((ax, -26, 4.2), (bx, -26, 5.4), (bx, -16, 4.0), (ax, -16, 5.2)):
                B.cyl("black_metal", (x, y, 0.12), (x, y, z), 0.09, segs=6)
    if L == 5:  # monument FO et musee des supporters
        B.box("concrete_dark", (-3.5, -22.5, 0.12), (3.5, -19.5, 1.4))
        logo(B, 0, -21.6, 1.4, 9.0, depth=1.2)
        glass_box(B, 14, -28, 28, -16, 0.12, 4.0, frame=False, cap="black_metal")
        clad_box(B, 12, -29, 29, -12, 4.0, 9.5, top=True)
        B.box("emissive_led", (12, -29.05, 8.4), (29, -28.95, 8.8))


# =============================================================== siege & partenaires

def sponsor(B, coll, L):
    plinth(B)
    if L <= 2:
        parking(B, -27, -27, 27, -16)
    elif L <= 4:
        parking(B, -27, -27, 27, -20)
    lawn(B, 18, -12, 28, 26)
    for y in (-10, 2, 14):  # alignement d'arbres cote ouest
        tree(B, -25, y, 9, 2.4)
    if L == 1:
        glass_box(B, -12, 0, 12, 14, 0.12, 2 * FH + 0.12)
        canopy(B, -5, -3, 5, 0, 3.6, top="emissive_led")
        logo(B, 9, -0.25, 7.9, 2.4)
        trees_row(B, (22, 22), 0)
        return
    if L == 2:
        top = tower(B, -14, -2, 14, 18, 0.12, 4, fin_step=1.8, gold_fins=False)
        canopy(B, -6, -6, 6, -2, 4.0, top="emissive_led")
        logo(B, 10, -2.7, top + 0.1, 3.0)
        return
    # podium vitre + tour
    glass_box(B, -22, -8, 22, 22, 0.12, 2 * FH + 0.12, frame=True, cap="black_metal")
    canopy(B, -10, -12, 10, -8, 4.0, top="emissive_led")
    floors = {3: 8, 4: 13, 5: 12}[L]
    z0 = 2 * FH + 0.72
    top = tower(B, -11, 0, 11, 18, z0, floors)
    if L == 5:  # jardin suspendu puis tour en retrait
        for x in (-10, 10):
            for y in (1, 17):
                B.box("black_metal", (x - 0.4, y - 0.4, top), (x + 0.4, y + 0.4, top + FH))
        lawn(B, -10.5, 0.5, 10.5, 17.5, z=top - 0.1)
        for x in (-6, 0, 6):
            tree(B, x, 9, 5, 1.6, z=top)
        top = tower(B, -9, 2, 9, 16, top + FH, 8)
    # couronne lumineuse et monogramme
    B.box("emissive_led", (-11.2 if L < 5 else -9.2, -0.5 if L < 5 else 1.5, top - 0.4),
          (11.2 if L < 5 else 9.2, -0.3 if L < 5 else 1.7, top + 0.6))
    if L >= 4:
        logo(B, 0, (-1.0 if L == 4 else 1.0), top + 1.0, 7.0)
    if L == 5:
        rail(B, -22, -8, 22, -8, 2 * FH + 0.72)
        trees_row(B, (-18, -12, 12, 18), -14, h=8, columnar=True)


# =============================================================== main

BUILDERS = {"training": training, "academy": academy, "fans": fans, "sponsor": sponsor}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    mats = modern_materials()
    for name, slab, play in (("turf_train_s", (44, 28), (40, 24)), ("turf_train", (56, 36), (52, 32)),
                             ("turf_cage", (30, 18), (28, 16)), ("turf_acad", (42, 28), (39, 25))):
        mats[name] = material(name, image=tex_turf(name, slab, play), rough=0.9)
    mats["seats"] = mats["black_metal"]
    for key, fn in BUILDERS.items():
        for lvl in range(1, 6):
            coll = bpy.data.collections.new(f"{key}_L{lvl}")
            scene.collection.children.link(coll)
            B = Builder(mats)
            fn(B, coll, lvl)
            B.finalize(coll, f"{key}_L{lvl}")
    out = os.path.join(find_repo(), "assets-src", "blend", "buildings.blend")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("BUILDINGS OK", out)


if __name__ == "__main__":
    main()
