"""FootOFF Empire - generateur du stade semi-realiste (terrain_L1 a terrain_L6).

Construit les 6 niveaux dans des collections terrain_L1..terrain_L6, textures procedurales comprises,
puis enregistre assets-src/blend/stadium.blend. Ensuite :
    blender assets-src/blend/stadium.blend -b -P tools/blender/footoff_export.py
    npm run models

Lancement :
    blender -b --factory-startup -P tools/blender/models/build_stadium.py

Conventions (voir assets-src/README.md) : metres, Z en haut, origine au centre du terrain et au sol,
cote camera du jeu = -Y (sud) : il reste bas a tous les niveaux pour que la pelouse soit visible.
Emprise max 160 x 130 m (x : +-80, y : +-65) jusqu'au niveau 4 ; l'arene des niveaux 5 et 6 deborde sur
l'esplanade (|x| <= 94 m, nord <= 77 m, voir budgets.json). Une geometrie par materiau = un draw call par materiau.
"""



import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import *  # noqa: E402,F401,F403
from footoff_lib import bpy, np, Matrix, Vector  # noqa: E402

# Terrain : surface d'herbe 120 x 80 m, aire de jeu 105 x 68 m
GRASS_X, GRASS_Y = 60.0, 40.0
PITCH_X, PITCH_Y = 52.5, 34.0
GRASS_TOP = 0.05


def tex_pitch(level):
    """Pelouse 120 x 80 m avec tonte en bandes et marquages reglementaires."""
    W, H = 2048, 1024
    xs = (np.arange(W) + 0.5) / W * 2 * GRASS_X - GRASS_X
    ys = (np.arange(H) + 0.5) / H * 2 * GRASS_Y - GRASS_Y
    X, Y = np.meshgrid(xs, ys)
    px = 2 * GRASS_X / W

    light, dark = {
        1: ((0.47, 0.56, 0.27), (0.43, 0.52, 0.25)),
        2: ((0.36, 0.55, 0.22), (0.31, 0.49, 0.19)),
        3: ((0.34, 0.58, 0.21), (0.26, 0.47, 0.16)),
        4: ((0.33, 0.59, 0.21), (0.24, 0.46, 0.15)),
    }[level]
    stripes = (np.floor((X + PITCH_X) / 5.25) % 2).astype(float)
    if level == 4:  # damier pro : bandes croisees
        cross = (np.floor((Y + PITCH_Y) / 5.0) % 2).astype(float)
        stripes = np.abs(stripes - cross * 0.45)
    col = mix(light, dark, stripes)
    col *= (0.93 + 0.12 * fbm(H, W, 16))[..., None]

    # usure : surfaces de but et rond central (fort au niveau 1, legere au niveau 2)
    wear_amt = {1: 1.0, 2: 0.45, 3: 0.12, 4: 0.0}[level]
    if wear_amt:
        blobs = sum(np.exp(-(((X - sx * 48.5) / 5.5) ** 2 + (Y / 4.5) ** 2)) for sx in (-1, 1))
        blobs += 0.6 * np.exp(-((X / 4.5) ** 2 + (Y / 4.5) ** 2))
        patches = np.clip((fbm(H, W, 6) - 0.55) * 3, 0, 1) * (0.6 if level == 1 else 0.2)
        wear = np.clip((blobs * (0.4 + 0.6 * fbm(H, W, 24)) + patches) * wear_amt, 0, 0.92)
        col = mix(col, (0.47, 0.39, 0.27), wear)

    # marquages (12 cm)
    w = 0.12
    alpha = np.zeros((H, W))

    def line(d):
        nonlocal alpha
        alpha = np.maximum(alpha, np.clip((w / 2 - d) / px + 0.5, 0, 1))

    def disc(cx, cy, r):
        nonlocal alpha
        alpha = np.maximum(alpha, np.clip((r - np.hypot(X - cx, Y - cy)) / px + 0.5, 0, 1))

    P, Q = PITCH_X, PITCH_Y
    for (ax, ay, bx, by) in [(-P, -Q, P, -Q), (-P, Q, P, Q), (-P, -Q, -P, Q), (P, -Q, P, Q), (0, -Q, 0, Q)]:
        line(seg_dist(X, Y, ax, ay, bx, by))
    line(np.abs(np.hypot(X, Y) - 9.15))
    disc(0, 0, 0.15)
    for s in (-1, 1):
        gx = s * P
        for depth, half in ((16.5, 20.16), (5.5, 9.16)):
            ix = gx - s * depth
            line(seg_dist(X, Y, gx, -half, ix, -half))
            line(seg_dist(X, Y, gx, half, ix, half))
            line(seg_dist(X, Y, ix, -half, ix, half))
        spot = gx - s * 11.0
        disc(spot, 0, 0.15)
        arc = np.abs(np.hypot(X - spot, Y) - 9.15)
        arc[(s * X) > (P - 16.5)] = 1e9  # seulement hors de la surface
        line(arc)
        for sy in (-1, 1):
            corner = np.abs(np.hypot(X - gx, Y - sy * Q) - 1.0)
            corner[(s * X > P) | (sy * Y > Q)] = 1e9
            line(corner)
    if level == 1:
        alpha *= 0.7 + 0.3 * fbm(H, W, 32)  # lignes a la chaux, irregulieres
    col = mix(col, (0.93, 0.93, 0.9), alpha)
    return to_image(f"pitch_L{level}", col)


def build_materials():
    # couleurs FootOFF : sieges anthracite, rangs d'accent or, toitures graphite
    concrete, seats = tex_concrete(), tex_seats("seats", (0.16, 0.16, 0.17))
    gold_seats = tex_seats("seats_accent", GOLD)
    boards = tex_boards()
    M = {
        "concrete": material("concrete", image=concrete, rough=0.9),
        "concrete_dark": material("concrete_dark", (0.24, 0.25, 0.27), rough=0.95),
        "seats": material("seats", image=seats, rough=0.5),
        "seats_accent": material("seats_accent", image=gold_seats, rough=0.5),
        "steel": material("steel", (0.62, 0.64, 0.68), rough=0.35, metal=0.85),
        "roof": material("roof", (0.20, 0.20, 0.21), rough=0.45, metal=0.6, normal=tex_roof_normal(), normal_strength=0.8),
        "membrane": material("membrane", (0.11, 0.11, 0.12), rough=0.5, normal=bpy.data.images["roof_normal"], normal_strength=0.4),
        "brick": material("brick", image=tex_brick(), rough=0.85),
        "facade": material("facade", image=tex_facade(), rough=0.25, metal=0.3),
        "glass": material("glass", (0.12, 0.17, 0.22), rough=0.08, metal=0.8),
        "roof_glass": material("roof_glass", (0.60, 0.65, 0.70), rough=0.2, metal=0.35),  # bande vitree du toit (arene)
        "white": material("white", (0.92, 0.92, 0.92), rough=0.45),
        "flag": material("flag", GOLD, rough=0.35, metal=0.55),
        "wood": material("wood", (0.42, 0.29, 0.18), rough=0.8),
        "gravel": material("gravel", (0.45, 0.40, 0.33), rough=1.0),
        "boards": material("boards", image=boards, rough=0.5),
        "emissive_boards": material("emissive_boards", image=boards, rough=0.4, strength=2.2, emission_image=True),
        "emissive_light": material("emissive_light", (0.85, 0.85, 0.82), rough=0.3, emission=(1.0, 0.96, 0.88), strength=8.0),
        # or metallique le jour, lumineux la nuit : LED et monogrammes FO
        "emissive_led": material("emissive_led", GOLD, rough=0.35, metal=0.55, emission=GOLD_LIGHT, strength=1.4),  # assez bas pour rester or apres tone mapping
        "emissive_screen": material("emissive_screen", image=tex_screen(), rough=0.2, strength=2.5, emission_image=True),
        "emissive_windows": material("emissive_windows", (0.10, 0.14, 0.18), rough=0.1, metal=0.6, emission=(1.0, 0.82, 0.55), strength=2.0),
    }
    for lvl in range(1, 5):
        M[f"pitch_L{lvl}"] = material(f"pitch_L{lvl}", image=tex_pitch(lvl), rough=0.95)
    return M


# Nom de l'objet exporte par materiau (prefixe emissive_ conserve jusqu'au jeu)
# =============================================================== elements du stade

def pitch(B, level):
    B.box(f"pitch_L{level}", (-GRASS_X, -GRASS_Y, 0), (GRASS_X, GRASS_Y, GRASS_TOP),
          tile=(2 * GRASS_X, 2 * GRASS_Y), origin=(-GRASS_X, -GRASS_Y, 0))


def surround(B, mat, ox, oy, z=0.04):
    """Bande autour de la pelouse jusqu'a (ox, oy)."""
    B.box(mat, (-ox, GRASS_Y, 0), (ox, oy, z))
    B.box(mat, (-ox, -oy, 0), (ox, -GRASS_Y, z))
    B.box(mat, (GRASS_X, -GRASS_Y, 0), (ox, GRASS_Y, z))
    B.box(mat, (-ox, -GRASS_Y, 0), (-GRASS_X, GRASS_Y, z))


def goals(B):
    for s in (-1, 1):
        x, back = s * PITCH_X, s * (PITCH_X + 2.0)
        top = 2.44 + GRASS_TOP
        for y in (-3.66, 3.66):
            B.cyl("white", (x, y, GRASS_TOP), (x, y, top), 0.06, segs=8)
            B.cyl("white", (x, y, top), (back, y, GRASS_TOP), 0.04, segs=6)
        B.cyl("white", (x, -3.66, top), (x, 3.66, top), 0.06, segs=8)
        B.cyl("white", (back, -3.66, GRASS_TOP + 0.03), (back, 3.66, GRASS_TOP + 0.03), 0.03, segs=6)
        for sy in (-1, 1):  # drapeaux de coin
            fx, fy = s * PITCH_X, sy * PITCH_Y
            B.cyl("white", (fx, fy, GRASS_TOP), (fx, fy, 1.5), 0.025, segs=6)
            B.box("flag", (fx, fy - 0.01, 1.15), (fx - s * 0.45, fy + 0.01, 1.48))


def dugout(B, x0, x1, y_front):
    d = 2.4
    y1 = y_front + d
    B.box("concrete_dark", (x0, y_front, 0), (x1, y1, 0.25))
    B.box("concrete", (x0, y1 - 0.15, 0), (x1, y1, 2.3))
    for x in (x0, x1 - 0.15):
        B.box("concrete", (x, y_front + 0.4, 0), (x + 0.15, y1, 2.3))
    B.hexa("glass", [(x0 - 0.1, y_front - 0.2, 1.85), (x1 + 0.1, y_front - 0.2, 1.85), (x1 + 0.1, y1, 2.35), (x0 - 0.1, y1, 2.35),
                     (x0 - 0.1, y_front - 0.2, 1.93), (x1 + 0.1, y_front - 0.2, 1.93), (x1 + 0.1, y1, 2.43), (x0 - 0.1, y1, 2.43)])
    B.box("seats", (x0 + 0.3, y1 - 0.8, 0.25), (x1 - 0.3, y1 - 0.2, 0.7), tile=(0.5, 0.5))


def building(B, x0, y0, x1, y1, h, mat="brick", windows=True, face_y=None):
    """Petit batiment (club-house), fenetres eclairees la nuit cote face_y (y0 ou y1)."""
    tile = (1.0, 1.0)
    B.box(mat, (x0, y0, 0), (x1, y1, h), tile=tile)
    B.box("concrete_dark", (x0 - 0.3, y0 - 0.3, h), (x1 + 0.3, y1 + 0.3, h + 0.35))
    if windows:
        fy = y0 if face_y is None else face_y
        sgn = -1 if fy == y0 else 1
        n = int((x1 - x0) // 3.2)
        for i in range(n):
            cx = x0 + (x1 - x0) * (i + 0.5) / n
            B.box("emissive_windows", (cx - 0.8, fy + sgn * 0.06 - 0.04, 1.2), (cx + 0.8, fy + sgn * 0.06 + 0.04, 2.6))
            if h > 6:
                B.box("emissive_windows", (cx - 0.8, fy + sgn * 0.06 - 0.04, 4.4), (cx + 0.8, fy + sgn * 0.06 + 0.04, 5.8))


def stand(B, M, length, rows, row_d, row_h, y0, z0, block=14.0, aisle=1.2, accent=(), seats=True, terrace_rails=False):
    """Tribune droite en repere local (x : longueur, y : vers l'exterieur). Renvoie (y_fin, z_haut)."""
    hx = length / 2
    for i in range(rows):
        ya, yb = y0 + i * row_d, y0 + (i + 1) * row_d
        zt = z0 + (i + 1) * row_h
        B.box("concrete", (-hx, ya, 0), (hx, yb, zt), M, tile=(4, 4))
        if seats:
            mat = "seats_accent" if i in accent else "seats"
            nblocks = max(1, round(length / block))
            bw = length / nblocks
            for k in range(nblocks):
                xa = -hx + k * bw + aisle / 2
                xb = -hx + (k + 1) * bw - aisle / 2
                B.box(mat, (xa, ya + 0.08, zt), (xb, ya + 0.58, zt + 0.42), M, tile=(0.5, 0.5))
        elif terrace_rails and i % 2 == 1:  # gradin debout : barrieres
            B.cyl("steel", (-hx + 1, ya + 0.2, zt + 1.0), (hx - 1, ya + 0.2, zt + 1.0), 0.04, segs=6, M=M)
    y1 = y0 + rows * row_d
    z1 = z0 + rows * row_h
    B.box("concrete", (-hx, y0 - 0.3, 0), (hx, y0, z0 + 1.0), M, tile=(4, 4))  # parapet
    return y1, z1


def side_walls(B, M, length, y0, y1, zf, zb, mat="concrete"):
    hx = length / 2
    for x in (-hx - 0.4, hx):
        B.hexa(mat, [(x, y0, 0), (x + 0.4, y0, 0), (x + 0.4, y1, 0), (x, y1, 0),
                     (x, y0, zf), (x + 0.4, y0, zf), (x + 0.4, y1, zb), (x, y1, zb)], M, tile=(4, 4))


def cantilever_roof(B, M, length, y_back, y_front, z_back, z_front, spacing=12.0, fascia="steel", lights=False,
                    cable_masts=False, mat="roof"):
    hx = length / 2
    t = 0.45
    B.hexa(mat, [(-hx, y_front, z_front - t), (hx, y_front, z_front - t), (hx, y_back, z_back - t), (-hx, y_back, z_back - t),
                 (-hx, y_front, z_front), (hx, y_front, z_front), (hx, y_back, z_back), (-hx, y_back, z_back)],
           M, tile=(1.0, 8.0))
    B.box(fascia, (-hx, y_front - 0.25, z_front - 1.3), (hx, y_front, z_front + 0.15), M, tile=(24, 1.4))
    n = max(1, round(length / spacing))
    for k in range(n + 1):
        x = -hx + length * k / n
        B.cyl("steel", (x, y_back + 0.3, 0), (x, y_back + 0.3, z_back - t), 0.35, segs=10, M=M)
        B.hexa("steel", [(x - 0.2, y_front, z_front - t - 0.7), (x + 0.2, y_front, z_front - t - 0.7),
                         (x + 0.2, y_back, z_back - t - 1.0), (x - 0.2, y_back, z_back - t - 1.0),
                         (x - 0.2, y_front, z_front - t), (x + 0.2, y_front, z_front - t),
                         (x + 0.2, y_back, z_back - t), (x - 0.2, y_back, z_back - t)], M)
        if cable_masts and k % 2 == 0:
            top = z_back + 10
            B.cyl("steel", (x, y_back + 0.3, z_back), (x, y_back + 0.3, top), 0.25, 0.15, segs=8, M=M)
            B.cyl("steel", (x, y_back + 0.3, top), (x, y_front + 1.5, z_front), 0.06, segs=4, M=M)
            B.cyl("steel", (x, y_back + 0.3, top), (x, y_back + 1.2, z_back - 0.5), 0.06, segs=4, M=M)  # hauban arriere ancre sur le mur
    if lights:
        for k in range(n):
            x = -hx + length * (k + 0.5) / n
            B.box("emissive_light", (x - 1.6, y_front + 0.3, z_front - t - 0.5), (x + 1.6, y_front + 1.0, z_front - t - 0.1), M)


# =============================================================== niveaux

def level_1(B, coll):
    """Terrain municipal : pelouse usee, main courante, abris, club-house, petits gradins bois, 4 poteaux."""
    pitch(B, 1)
    surround(B, "gravel", 63, 43)
    goals(B)
    fence(B, 57.5, 38.5)
    dugout(B, -10, -4, 39.2)
    dugout(B, 4, 10, 39.2)
    building(B, -12, 47, 12, 56, 4.2, face_y=47)
    B.box("concrete_dark", (-14, 44, 0), (14, 47, 0.15))
    fo_logo(B, "flag", Matrix.Translation((0, 46.95, 4.6)), 2.4)  # enseigne FO sur le toit du club-house
    for x0, x1 in ((-36, -18), (18, 36)):  # petits gradins en bois
        for i in range(4):
            B.box("wood", (x0, 44 + i * 0.8, 0), (x1, 44.8 + i * 0.8, 0.45 * (i + 1)))
        B.cyl("steel", (x0, 44, 0), (x0, 47.2, 1.8), 0.05, segs=6)
        B.cyl("steel", (x1, 44, 0), (x1, 47.2, 1.8), 0.05, segs=6)
    for i, (x, y) in enumerate([(-58, -41.5), (58, -41.5), (-58, 41.5), (58, 41.5)]):
        mast(B, coll, x, y, 16, 3, 2, f"light_{i}")


def level_2(B, coll):
    """Tribune principale couverte a l'ancienne (poteaux en facade), virage debout cote camera, club-house."""
    pitch(B, 2)
    surround(B, "concrete_dark", 63, 43)
    goals(B)
    boards(B, 57.5, 38.5)
    dugout(B, -10, -4, 39.6)
    dugout(B, 4, 10, 39.6)
    # tribune nord
    y1, z1 = stand(B, NORTH, 84, 12, 0.8, 0.42, 44.0, 0.6)
    B.box("concrete", (-42, y1, 0), (42, y1 + 0.4, 10.4), NORTH, tile=(4, 4))  # mur arriere
    side_walls(B, NORTH, 84, 43.7, y1 + 0.4, 9.0, 10.4)
    t = 0.35
    B.hexa("roof", [(-43, 43.0, 9.0 - t), (43, 43.0, 9.0 - t), (43, y1 + 0.8, 10.5 - t), (-43, y1 + 0.8, 10.5 - t),
                    (-43, 43.0, 9.0), (43, 43.0, 9.0), (43, y1 + 0.8, 10.5), (-43, y1 + 0.8, 10.5)], tile=(1.0, 8.0))
    B.box("white", (-43, 42.8, 8.2), (43, 43.0, 9.05), tile=(24, 1))
    slope = math.atan2(1.5, y1 + 0.8 - 43.0)
    roof_logo(B, "emissive_led", 46.0, 9.0 + 3.0 * math.tan(slope), slope, 8.0)
    for k in range(8):
        x = -42 + 84 * k / 7
        B.cyl("steel", (x, 44.4, 0), (x, 44.4, 9.0 - t), 0.18, segs=8)
    # virage sud : gradins debout, sans toit (cote camera)
    stand(B, SOUTH, 70, 5, 0.7, 0.3, 42.0, 0.2, seats=False, terrace_rails=True)
    building(B, 48, 45, 70, 54, 7.0, face_y=45)
    for i, (x, y) in enumerate([(-62, -44), (62, -44), (-62, 44), (62, 44)]):
        mast(B, coll, x, y, 22, 4, 3, f"light_{i}")


def level_3(B, coll):
    """Vrai stade : 4 tribunes, tribune nord a deux etages et toit haubane, pylones en treillis, ecran."""
    pitch(B, 3)
    surround(B, "concrete_dark", 62, 42)
    goals(B)
    boards(B, 57.5, 38.5)
    dugout(B, -10, -4, 39.4)
    dugout(B, 4, 10, 39.4)
    # nord : etage bas, loges vitrees, etage haut
    y1, z1 = stand(B, NORTH, 100, 14, 0.85, 0.45, 43.0, 0.8)
    B.box("emissive_windows", (-50, y1 - 0.1, z1), (50, y1 + 0.1, z1 + 2.6), NORTH)
    B.box("concrete", (-50, y1, z1), (50, y1 + 2.2, z1 + 3.0), NORTH, tile=(4, 4))
    y2, z2 = stand(B, NORTH, 100, 12, 0.85, 0.62, y1 - 1.0, z1 + 3.0, accent=(0, 1))
    B.box("concrete", (-50, y2, 0), (50, y2 + 0.4, z2 + 1.5), NORTH, tile=(4, 4))
    side_walls(B, NORTH, 100, 42.7, y2 + 0.4, 2.0, z2 + 1.5)
    cantilever_roof(B, NORTH, 104, y2 + 0.4, 41.5, z2 + 5.5, z2 + 4.0, cable_masts=True, lights=True)
    slope = math.atan2(1.5, y2 + 0.4 - 41.5)
    roof_logo(B, "emissive_led", 45.0, z2 + 4.0 + 3.5 * math.tan(slope), slope, 15.0)
    # est / ouest
    for M in (EAST, WEST):
        ye, ze = stand(B, M, 70, 14, 0.85, 0.45, 62.0, 0.8)
        B.box("concrete", (-35, ye, 0), (35, ye + 0.4, ze + 1.5), M, tile=(4, 4))
        side_walls(B, M, 70, 61.7, ye + 0.4, 1.8, ze + 1.5)
        cantilever_roof(B, M, 72, ye + 0.4, 59.5, ze + 5.0, ze + 4.0)
    # sud : tribune basse sans toit
    ys, zs = stand(B, SOUTH, 90, 10, 0.8, 0.4, 42.0, 0.6)
    B.box("concrete", (-45, ys, 0), (45, ys + 0.4, zs + 1.2), SOUTH, tile=(4, 4))
    fo_logo(B, "emissive_led", Matrix.Translation((0, -(ys + 0.4) - 0.2, 0.4)), 4.2)  # facade sud, cote camera
    side_walls(B, SOUTH, 90, 41.7, ys + 0.4, 1.6, zs + 1.2)
    # ecran geant (angle sud-ouest)
    M = rot(math.atan2(-66, 52) + math.pi, -66, -52)
    for x in (-4, 4):
        B.cyl("steel", (x, 0.3, 0), (x, 0.3, 7), 0.25, segs=8, M=M)
    B.box("steel", (-5.6, 0, 6.6), (5.6, 0.6, 13.4), M)
    B.box("emissive_screen", (-5.2, -0.06, 7.0), (5.2, 0.05, 13.0), M)
    for i, (x, y) in enumerate([(-74, -57), (74, -57), (-74, 57), (74, 57)]):
        mast(B, coll, x, y, 38, 8, 5, f"light_{i}", lattice=True)


def roof_ring_path(o_inner, r_outer, north_upper):
    """Paires (interieur, exterieur) de la toiture continue, parcours horaire vu de dessus :
    ouest (sud -> nord), angle NO, nord, angle NE, est (nord -> sud). Le sud reste ouvert."""
    cx, cy = 62.0, 42.0
    ix_max, iy_max = cx - o_inner, cy - o_inner  # bord interieur : rectangle en retrait de o_inner
    xu, yu = north_upper
    pairs = []
    for y in np.linspace(-42, 42, 8):
        pairs.append(((-ix_max, min(y, iy_max)), (-cx - r_outer, y)))
    for a in np.linspace(math.pi, math.pi / 2, 10)[1:]:
        pairs.append(((-ix_max, iy_max), (-cx + r_outer * math.cos(a), cy + r_outer * math.sin(a))))
    # nord : decrochement de l'etage haut entre -xu et +xu
    pairs.append(((-xu, iy_max), (-xu, cy + r_outer)))
    for x in np.linspace(-xu, xu, 9):
        pairs.append(((x, iy_max), (x, yu)))
    pairs.append(((xu, iy_max), (xu, cy + r_outer)))
    pairs.append(((ix_max, iy_max), (cx, cy + r_outer)))
    for a in np.linspace(math.pi / 2, 0, 10)[1:]:
        pairs.append(((ix_max, iy_max), (cx + r_outer * math.cos(a), cy + r_outer * math.sin(a))))
    for y in np.linspace(42, -42, 8)[1:]:
        pairs.append(((ix_max, min(y, iy_max)), (cx + r_outer, y)))
    return pairs


def level_4(B, coll):
    """Arene moderne : cuvette continue (nord/est/ouest + angles nord), toit annulaire, LED, ecrans, sud ouvert."""
    pitch(B, 4)
    surround(B, "concrete_dark", 62, 42)
    goals(B)
    boards(B, 57.5, 38.5, mat="emissive_boards", h=0.9)
    dugout(B, -10, -4, 39.4)
    dugout(B, 4, 10, 39.4)
    rows, rd, rh, z0 = 18, 0.85, 0.5, 0.8
    depth, ztop = rows * rd, z0 + rows * rh
    accent = (6, 7)
    # nord / est / ouest (meme profil -> raccord exact avec les angles)
    stand(B, NORTH, 124, rows, rd, rh, 42.0, z0, accent=accent)
    for M in (EAST, WEST):
        stand(B, M, 84, rows, rd, rh, 62.0, z0, accent=accent)
        side_walls(B, M, 84, 61.7, 62.0 + depth, z0 + 1.0, ztop + 1.0, mat="facade")
    # angles nord : gradins en eventail centres sur les coins
    for cx, a0, a1 in ((62.0, 0.0, math.pi / 2), (-62.0, math.pi / 2, math.pi)):
        for i in range(rows):
            ra, rb = i * rd, (i + 1) * rd
            zt = z0 + (i + 1) * rh
            B.sector("concrete", (cx, 42.0), ra, rb, a0, a1, 0, zt, segs=12, tile=(4, 4))
            if i > 1:
                B.sector("seats_accent" if i in accent else "seats", (cx, 42.0), ra + 0.08, ra + 0.58, a0, a1,
                         zt, zt + 0.42, segs=12, tile=(0.5, 0.5))
    # etage haut au nord (centre)
    yu0 = 42.0 + depth + 0.2
    y2, z2 = stand(B, NORTH, 100, 9, 0.85, 0.65, yu0, ztop + 1.2, accent=(0,))
    B.box("emissive_windows", (-50, yu0 - 0.6, ztop), (50, yu0 - 0.4, ztop + 1.2))
    # sud : une seule tribune basse, sans toit, tableau LED en facade
    ys, zs = stand(B, SOUTH, 110, 12, 0.85, 0.42, 42.0, 0.6)
    B.box("emissive_led", (-55, ys - 0.01, zs + 0.2), (55, ys + 0.3, zs + 1.4), SOUTH)
    B.box("facade", (-55, ys + 0.3, 0), (55, ys + 0.7, zs + 1.4), SOUTH, tile=(4, 4))
    side_walls(B, SOUTH, 110, 41.7, ys + 0.7, 1.6, zs + 1.4, mat="facade")
    for x in (-40, 40):  # monogrammes sur la facade sud, cote camera
        fo_logo(B, "emissive_led", Matrix.Translation((x, -(ys + 0.7) - 0.2, 0.6)), 5.6)
    # toit annulaire + facade exterieure vitree
    r_out = depth + 0.4
    upper = (50.0, y2 + 0.4)
    pairs = roof_ring_path(6.0, r_out, upper)
    z_in, z_out = 22.0, 24.0
    B.strip("membrane", pairs, z_in, z_out, 1.0, tile=(1.0, 8.0))
    # grand monogramme or sur la toiture nord, lisible depuis la camera du jeu
    slope = math.atan2(z_out - z_in, upper[1] - (42.0 - 6.0))
    roof_logo(B, "emissive_led", 39.0, z_in + 3.0 * math.tan(slope), slope, 21.0)
    led = [((ix, iy), (ix + (ox - ix) * 0.03, iy + (oy - iy) * 0.03)) for (ix, iy), (ox, oy) in pairs]
    B.strip("emissive_led", led, z_in - 1.0, z_in - 1.0, 1.4)
    outer = [o for _, o in pairs]
    for (ax, ay), (bx, by) in zip(outer, outer[1:]):
        seg = math.hypot(bx - ax, by - ay)
        if seg < 0.05:
            continue
        nx, ny = -(by - ay) / seg * 0.4, (bx - ax) / seg * 0.4  # a gauche = vers l'exterieur (parcours horaire)
        zt = z_out - 1.0
        B.hexa("facade", [(ax, ay, 0), (bx, by, 0), (bx + nx, by + ny, 0), (ax + nx, ay + ny, 0),
                          (ax, ay, zt), (bx, by, zt), (bx + nx, by + ny, zt), (ax + nx, ay + ny, zt)], tile=(4, 4))
    # poteaux et pannes radiales tous les ~12 m le long du bord exterieur
    acc = 0.0
    for k, ((ix, iy), (ox, oy)) in enumerate(pairs):
        if k:
            px, py = pairs[k - 1][1]
            acc += math.hypot(ox - px, oy - py)
        if k == 0 or acc >= 12 or k == len(pairs) - 1:
            acc = 0.0
            B.cyl("steel", (ox, oy, 0), (ox, oy, z_out - 1.0), 0.45, segs=10)
            B.cyl("steel", (ox, oy, z_out - 1.2), (ix, iy, z_in - 1.2), 0.25, segs=6)
            B.box("emissive_light", (ix - 1.2, iy - 1.2, z_in - 2.6), (ix + 1.2, iy + 1.2, z_in - 2.2))
    # empties des projecteurs le long du toit
    for i, (x, y) in enumerate([(-30, 36), (0, 36), (30, 36), (-56, 0), (56, 0)]):
        e = bpy.data.objects.new(f"light_{i}", None)
        e.location = (x, y, z_in - 2.4)
        e.rotation_euler = (Vector((0, 0, 0)) - Vector(e.location)).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(e)
    # angles sud ouverts : mats + ecrans
    for s in (-1, 1):
        mast(B, coll, s * 74, -58, 34, 7, 4, f"light_{5 + (s + 1) // 2}")
        M = rot(math.atan2(s * 66, 52) + math.pi, s * 66, -50)
        for x in (-4.5, 4.5):
            B.cyl("steel", (x, 0.3, 0), (x, 0.3, 8), 0.3, segs=8, M=M)
        B.box("steel", (-6.6, 0, 7.6), (6.6, 0.7, 15.4), M)
        B.box("emissive_screen", (-6.2, -0.06, 8.0), (6.2, 0.05, 15.0), M)


# =============================================================== arene fermee (niveaux 5 et 6)
# Une seule cuvette autour d'un rectangle arrondi : tribunes droites le long des cotes, angles fermes en eventail.
# Etage bas continu tout autour ; etage haut (avec loges vitrees entre les deux) au nord et sur la moitie nord
# des virages, qui s'abaisse en gradins vers le sud. Toit continu en selle : haut au nord, bas et recule au sud
# pour que la camera du jeu (au sud, ~30 deg) voie toute la pelouse. Facade vitree a ailettes LED, bandeau
# lumineux FootOFF Media et monogrammes cote camera. Limites de la carte : |x| <= 94 m, nord <= 77 m.

AX, AY = 62.0, 42.0  # rectangle interieur : pied des tribunes (pelouse 120 x 80 m + bord)


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def ring_stations(n_long=10, n_end=7, n_corner=8):
    """Stations du pourtour, sens trigo vu de dessus : (px, py, nx, ny) = pied de tribune et normale sortante.
    La derniere station repete la premiere (boucle fermee)."""
    st = []
    half = math.pi / 2
    sides = [  # (depart, direction le long du cote, longueur, angle de la normale, n segments)
        ((-AX, -AY), (1, 0), 2 * AX, -half, n_long),   # sud, d'ouest en est
        ((AX, -AY), (0, 1), 2 * AY, 0.0, n_end),       # est, du sud au nord
        ((AX, AY), (-1, 0), 2 * AX, half, n_long),     # nord, d'est en ouest
        ((-AX, AY), (0, -1), 2 * AY, math.pi, n_end),  # ouest, du nord au sud
    ]
    for (sx, sy), (dx, dy), length, a, n in sides:
        for k in range(n):
            st.append((sx + dx * length * k / n, sy + dy * length * k / n, math.cos(a), math.sin(a)))
        cx, cy = sx + dx * length, sy + dy * length  # angle suivant : eventail centre sur le coin
        for k in range(n_corner):
            b = a + half * k / n_corner
            st.append((cx, cy, math.cos(b), math.sin(b)))
    st.append(st[0])
    return st


def at(S, d):
    return (S[0] + S[2] * d, S[1] + S[3] * d)


def north_of(S):
    """0 au sud, 1 au nord (lineaire le long des virages)."""
    return (S[1] + AY) / (2 * AY)


def tier(B, S0, S1, rows, rd, rh, off, z0, zbase, prev_rows, next_rows, accent=(), seats_from=0.0):
    """Gradins d'un segment entre deux stations : un bloc beton par rang (dessus + contremarche), sieges en
    dessus. Les flancs ne sont dessines que la ou le segment voisin s'arrete plus tot (gradins en escalier)."""
    for i in range(rows):
        d0, d1 = off + i * rd, off + (i + 1) * rd
        zt = z0 + (i + 1) * rh
        a0, b0, b1, a1 = at(S0, max(d0, 0.05)), at(S1, max(d0, 0.05)), at(S1, d1), at(S0, d1)
        skip = {0, 4}
        if next_rows > i:
            skip.add(3)
        if prev_rows > i:
            skip.add(5)
        B.hexa("concrete", [(*a0, zbase), (*b0, zbase), (*b1, zbase), (*a1, zbase),
                            (*a0, zt), (*b0, zt), (*b1, zt), (*a1, zt)], tile=(4, 4), skip=skip)
        # sieges : un bloc par segment, allee de 1,2 m entre deux segments droits (joint fin dans les angles)
        sa, sb = d0 + 0.08, d0 + 0.58
        pa, pb = at(S0, sa), at(S1, sa)
        length = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        aisle = 1.2 if (S0[2], S0[3]) == (S1[2], S1[3]) else 0.15
        if length < aisle + 0.5 or d0 < seats_from:
            continue
        t = aisle / 2 / length
        lerp = lambda p, q, f: (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)  # noqa: E731
        f0, f1 = lerp(at(S0, sa), at(S1, sa), t), lerp(at(S0, sa), at(S1, sa), 1 - t)
        g1, g0 = lerp(at(S0, sb), at(S1, sb), 1 - t), lerp(at(S0, sb), at(S1, sb), t)
        mat = "seats_accent" if i in accent else "seats"
        B.hexa(mat, [(*f0, zt), (*f1, zt), (*g1, zt), (*g0, zt),
                     (*f0, zt + 0.42), (*f1, zt + 0.42), (*g1, zt + 0.42), (*g0, zt + 0.42)],
               tile=(0.5, 0.5), skip={0})


def quad(B, mat, p0, p1, p2, p3, z0, z1, tile=(4, 4), skip=(), origin=(0, 0, 0)):
    B.hexa(mat, [(*p0, z0), (*p1, z0), (*p2, z0), (*p3, z0), (*p0, z1), (*p1, z1), (*p2, z1), (*p3, z1)],
           tile=tile, skip=set(skip), origin=origin)


def arena(B, coll, lvl):
    big = lvl >= 6
    P = {  # profils des deux niveaux d'arene
        "rows": 18 if big else 16, "rd": 0.82 if big else 0.85, "rh": 0.5, "z0": 0.8,
        "up_rows": 15 if big else 12, "up_rd": 0.82 if big else 0.85, "up_rh": 0.66 if big else 0.62,
        "gap": 2.4 if big else 2.2, "boxes": 3.2 if big else 3.0,
        "z_north": 29.0 if big else 25.0, "z_south": 10.5, "in_north": -6.0, "in_south": 9.0,
        "up_from": 0.15 if big else 0.35,  # l'etage haut commence a cette latitude (0 sud, 1 nord)
    }
    pitch(B, 4)
    surround(B, "concrete_dark", AX, AY)
    goals(B)
    boards(B, 57.5, 38.5, mat="emissive_boards", h=0.9)
    dugout(B, -10, -4, 39.4)
    dugout(B, 4, 10, 39.4)

    st = ring_stations()
    nseg = len(st) - 1
    depth_l = P["rows"] * P["rd"]
    z_l = P["z0"] + P["rows"] * P["rh"]
    off_u = depth_l + P["gap"]
    z_u0 = z_l + P["boxes"]

    def up_rows(u):
        return int(round(P["up_rows"] * smooth(P["up_from"], P["up_from"] + 0.55, u)))

    seg_u = [(north_of(st[k]) + north_of(st[k + 1])) / 2 for k in range(nseg)]
    ups = [up_rows(u) for u in seg_u]
    seg_depth = [off_u + n * P["up_rd"] if n else depth_l for n in ups]
    seg_top = [z_u0 + n * P["up_rh"] if n else z_l for n in ups]

    def roof_z(u):
        return P["z_south"] + (P["z_north"] - P["z_south"]) * smooth(0.0, 1.0, u)

    def roof_rise(u):  # du bord interieur au bord exterieur : plus fort au sud, ou le toit est bas
        return 2.0 + 2.0 * (1.0 - smooth(0.0, 1.0, u))

    # facade : un peu derriere le segment le plus profond de chaque station
    face_d = [max(seg_depth[(k - 1) % nseg], seg_depth[k % nseg]) + 0.35 for k in range(nseg)]
    face_d.append(face_d[0])

    for k in range(nseg):
        S0, S1 = st[k], st[k + 1]
        prev_k, next_k = (k - 1) % nseg, (k + 1) % nseg
        tier(B, S0, S1, P["rows"], P["rd"], P["rh"], 0.0, P["z0"], 0.0, P["rows"], P["rows"],
             accent=(6, 7), seats_from=1.2)
        n = ups[k]
        if n:
            # loges vitrees entre les deux etages, puis l'etage haut
            quad(B, "emissive_windows", at(S0, depth_l), at(S1, depth_l), at(S1, depth_l + 0.3), at(S0, depth_l + 0.3),
                 z_l, z_u0, skip=(0, 1, 3, 4, 5))
            quad(B, "concrete", at(S0, depth_l + 0.3), at(S1, depth_l + 0.3), at(S1, off_u), at(S0, off_u),
                 z_l, z_u0 - 0.2, skip=(0, 2, 3, 5))
            quad(B, "concrete_dark", at(S0, depth_l), at(S1, depth_l), at(S1, off_u + 0.2), at(S0, off_u + 0.2),
                 z_u0 - 0.5, z_u0, skip=(0, 3, 4, 5))
            tier(B, S0, S1, n, P["up_rd"], P["up_rh"], off_u, z_u0, z_u0 - 0.5, ups[prev_k], ups[next_k], accent=(0,))
        # dalle de coursive entre le dernier rang et la facade
        d_back = seg_depth[k]
        if max(face_d[k], face_d[k + 1]) - d_back > 0.05:
            quad(B, "concrete_dark", at(S0, d_back), at(S1, d_back), at(S1, face_d[k + 1]), at(S0, face_d[k]),
                 0.0, seg_top[k], skip=(0, 3, 5))

    # toit en selle + facade vitree + ailettes LED
    roof = []
    for k in range(nseg + 1):
        S = st[k]
        u = north_of(S)
        s = smooth(0.0, 1.0, u)
        d_in = P["in_south"] + (P["in_north"] - P["in_south"]) * s
        z_in = roof_z(u)
        roof.append((S, d_in, face_d[k] + 0.6, z_in, z_in + roof_rise(u)))
    for k in range(nseg):
        (S0, i0, o0, zi0, zo0), (S1, i1, o1, zi1, zo1) = roof[k], roof[k + 1]
        a, b, c, d = at(S0, i0), at(S1, i1), at(S1, o1), at(S0, o0)
        # bande vitree claire au bord interieur (35 % de la profondeur), toiture sombre au-dela
        m0, m1 = i0 + (o0 - i0) * 0.35, i1 + (o1 - i1) * 0.35
        zm0, zm1 = zi0 + (zo0 - zi0) * 0.35, zi1 + (zo1 - zi1) * 0.35
        e0, e1 = at(S0, m0), at(S1, m1)
        B.hexa("roof_glass", [(*a, zi0 - 1.0), (*b, zi1 - 1.0), (*e1, zm1 - 1.0), (*e0, zm0 - 1.0),
                              (*a, zi0), (*b, zi1), (*e1, zm1), (*e0, zm0)], tile=(1.0, 8.0), skip={3, 4, 5})
        B.hexa("membrane", [(*e0, zm0 - 1.0), (*e1, zm1 - 1.0), (*c, zo1 - 1.0), (*d, zo0 - 1.0),
                            (*e0, zm0), (*e1, zm1), (*c, zo1), (*d, zo0)], tile=(1.0, 8.0), skip={2, 3, 5})
        # nervure acier sur le dessus, a chaque station (une sur deux dans les angles)
        straight = (S0[2], S0[3]) == (S1[2], S1[3])
        if straight or k % 2 == 0:
            tx, ty = -S0[3] * 0.18, S0[2] * 0.18
            ia, oa = a, d
            B.hexa("steel", [(ia[0] - tx, ia[1] - ty, zi0), (ia[0] + tx, ia[1] + ty, zi0), (oa[0] + tx, oa[1] + ty, zo0), (oa[0] - tx, oa[1] - ty, zo0),
                             (ia[0] - tx, ia[1] - ty, zi0 + 0.3), (ia[0] + tx, ia[1] + ty, zi0 + 0.3), (oa[0] + tx, oa[1] + ty, zo0 + 0.3), (oa[0] - tx, oa[1] - ty, zo0 + 0.3)],
                   skip={0})
        # anneau LED sous le bord interieur (halo autour de la pelouse)
        e, f = at(S0, i0 + 1.2), at(S1, i1 + 1.2)
        B.hexa("emissive_led", [(*a, zi0 - 1.35), (*b, zi1 - 1.35), (*f, zi1 - 1.35), (*e, zi0 - 1.35),
                                (*a, zi0 - 1.0), (*b, zi1 - 1.0), (*f, zi1 - 1.0), (*e, zi0 - 1.0)], skip={3, 4, 5})
        if big:  # couronne lumineuse au bord exterieur
            g, h = at(S0, o0 - 0.5), at(S1, o1 - 0.5)
            B.hexa("emissive_led", [(*g, zo0), (*h, zo1), (*c, zo1), (*d, zo0),
                                    (*g, zo0 + 0.35), (*h, zo1 + 0.35), (*c, zo1 + 0.35), (*d, zo0 + 0.35)], skip={0, 3, 5})
        # facade vitree, posee sous le bord exterieur du toit
        p, q = at(S0, face_d[k]), at(S1, face_d[k + 1])
        p2, q2 = at(S0, face_d[k] + 0.4), at(S1, face_d[k + 1] + 0.4)
        B.hexa("facade", [(*p, 0), (*q, 0), (*q2, 0), (*p2, 0), (*p, zo0 - 1.0), (*q, zo1 - 1.0), (*q2, zo1 - 1.0), (*p2, zo0 - 1.0)],
               tile=(4, 4), skip={0, 3, 5})
        # parvis : dalle autour de la facade, large cote sud (entrees), etroite ailleurs (parcelles voisines)
        w0, w1 = (6.0 if north_of(S) == 0.0 else 1.5 for S in (S0, S1))
        r, t = at(S0, face_d[k] + 0.4 + w0), at(S1, face_d[k + 1] + 0.4 + w1)
        quad(B, "concrete_dark", p2, q2, t, r, 0.0, 0.06, skip=(0, 2, 3, 5))
    # ailettes LED verticales (or le jour, lumineuses la nuit) et poteaux du toit, toutes les deux stations
    step = 1 if big else 2
    for k in range(0, nseg, step):
        S = st[k]
        if k % 4 and abs(S[2]) < 0.99 and abs(S[3]) < 0.99:
            continue  # dans les angles, une ailette sur quatre stations
        _, i0, o0, zi0, zo0 = roof[k]
        tx, ty = -S[3], S[2]
        base = at(S, face_d[k] + 0.4)
        c = [(base[0] - tx * 0.25, base[1] - ty * 0.25), (base[0] + tx * 0.25, base[1] + ty * 0.25)]
        out = [(x + S[2] * 0.5, y + S[3] * 0.5) for x, y in c]
        quad(B, "emissive_led", c[0], c[1], out[1], out[0], 0.8, zo0 - 1.2, skip=(0,))
        if k % 4 == 0:
            ox, oy = at(S, o0 - 0.3)
            ix, iy = at(S, i0 + 2.0)
            B.cyl("steel", (ox, oy, zo0 - 1.3), (ix, iy, zi0 - 1.3), 0.22, segs=6)
            if k % 8 == 0:
                fx, fy = at(S, i0 + 1.6)
                B.box("emissive_light", (fx - 1.2, fy - 1.2, zi0 - 2.6), (fx + 1.2, fy + 1.2, zi0 - 2.2))
    # bandeau lumineux FootOFF Media sur la facade sud (cote camera) et monogrammes
    y_face = -(AY + face_d[0] + 0.4)
    band_z = roof_z(0.0) + roof_rise(0.0) - 1.0 - 0.5 - 2.4  # sous le bord du toit
    B.box("emissive_boards", (-AX, y_face - 0.25, band_z), (AX, y_face, band_z + 2.4), tile=(62.4, 2.4), origin=(-AX, 0, band_z))
    for x in (-38, 38):
        fo_logo(B, "emissive_led", Matrix.Translation((x, y_face - 0.3, 1.4)), 6.4 if big else 5.6)
    if big:  # totems du parvis
        for x in (-20, 20):
            B.box("facade", (x - 1.6, y_face - 9.0, 0), (x + 1.6, y_face - 7.8, 9.0))
            fo_logo(B, "emissive_led", Matrix.Translation((x, y_face - 9.2, 2.2)), 4.6)
    # monogramme or sur la toiture nord, lisible depuis la camera du jeu
    zn = roof_z(1.0)
    north_out = AY + face_d[nseg // 2] + 0.6
    slope = math.atan2(roof_rise(1.0), north_out - (AY + P["in_north"]))
    d_logo = (north_out - (AY + P["in_north"])) * 0.4  # juste apres la bande vitree
    roof_logo(B, "emissive_led", AY + P["in_north"] + d_logo, zn + d_logo * math.tan(slope), slope, 16.0 if big else 14.0)
    # ecrans geants suspendus sous le toit, au-dessus des virages
    zm = roof_z(0.5)
    for s in (-1, 1):
        M = rot(-s * math.pi / 2, s * (AX + 1.2), 0.0)
        top = zm - 2.0
        B.box("steel", (-6.8, 0, top - 7.9), (6.8, 0.7, top), M)
        B.box("emissive_screen", (-6.4, -0.06, top - 7.5), (6.4, 0.05, top - 0.4), M)
        for x in (-5, 5):
            B.cyl("steel", (x, 0.35, top), (x, 0.35, zm - 1.0), 0.06, segs=4, M=M)
    # projecteurs (empties) le long du bord interieur du toit
    spots = [(-30, AY + P["in_north"] + 1.0, 1.0), (0, AY + P["in_north"] + 1.0, 1.0), (30, AY + P["in_north"] + 1.0, 1.0),
             (-(AX + 1.5), 0, 0.5), (AX + 1.5, 0, 0.5), (0, -(AY + P["in_south"] + 1.0), 0.0)]
    for i, (x, y, u) in enumerate(spots):
        e = bpy.data.objects.new(f"light_{i}", None)
        e.location = (x, y, roof_z(u) - 2.4)
        e.rotation_euler = (Vector((0, 0, 0)) - Vector(e.location)).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(e)


def level_5(B, coll):
    """Arene fermee : deux etages relies par des loges, angles fermes, toit en selle, facade lumineuse."""
    arena(B, coll, 5)


def level_6(B, coll):
    """Grande arene : plus large et plus haute, couronne LED sur le toit, totems FootOFF sur le parvis."""
    arena(B, coll, 6)


# =============================================================== main

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    mats = build_materials()
    for lvl, fn in ((1, level_1), (2, level_2), (3, level_3), (4, level_4), (5, level_5), (6, level_6)):
        coll = bpy.data.collections.new(f"terrain_L{lvl}")
        scene.collection.children.link(coll)
        B = Builder(mats)
        fn(B, coll)
        B.finalize(coll, f"L{lvl}")
    repo = find_repo()
    out = os.path.join(repo, "assets-src", "blend", "stadium.blend")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("STADIUM OK", out)


if __name__ == "__main__":
    main()
