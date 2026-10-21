"""FootOFF Empire - architecture moderne sombre (batiments, parcelles, site).

Palette realiste et sombre aux couleurs FootOFF Media : bardage anthracite, verre fume (bureaux allumes
au hasard la nuit), tasseaux de cedre, beton fonce, touches d'or #C7A15A. Textures procedurales et
elements de construction partages par build_buildings.py et build_site.py.
"""

import math

import numpy as np
from mathutils import Matrix

from footoff_lib import (GOLD, GOLD_LIGHT, RNG, fbm, material, mix, seg_dist, tex_concrete, tex_screen,
                         to_image, value_noise)


# =============================================================== textures

def tex_cladding():
    """Bardage acier anthracite a joints debout : panneaux de 0,5 m, tuile 3 x 3 m."""
    S = 512
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    panel = np.floor(u * 6).astype(int)
    tone = RNG.random(6)[panel] * 0.025
    pu = (u * 6) % 1
    seam = np.exp(-(pu / 0.012) ** 2) + np.exp(-((pu - 1.0) / 0.012) ** 2)
    light = np.exp(-((pu - 0.03) / 0.01) ** 2) * 0.5
    base = 0.215 + tone + 0.015 * (fbm(S, S, 8) - 0.5) - 0.07 * seam + 0.05 * light  # anthracite, pas noir
    return to_image("cladding", np.stack([base, base, base * 1.06], -1))


def tex_curtain():
    """Mur-rideau en verre fume, tuile 24 x 28,8 m (8 travees de 3 m, 8 etages de 3,6 m).
    Renvoie (couleur de jour, carte d'emission de nuit avec des bureaux allumes au hasard)."""
    S = 1024
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    col, flo = np.floor(u * 8).astype(int), np.floor(v * 8).astype(int)
    cu, fv = (u * 8) % 1, (v * 8) % 1
    mullion = (cu < 0.014) | (cu > 0.986)
    spandrel = fv < 0.25  # allege opaque de 0,9 m en bas de chaque etage
    pane = RNG.random((8, 8))
    glass = np.array([0.13, 0.155, 0.185]) * (0.85 + 0.3 * pane[flo, col])[..., None]
    glass = glass + (0.12 * fv)[..., None] * np.array([0.75, 0.85, 1.0])  # reflet du ciel en haut du vitrage
    rgb = np.where(spandrel[..., None], np.array([0.17, 0.17, 0.18]), glass)
    frame = mullion | ((fv > 0.245) & (fv < 0.26))
    rgb = np.where(frame[..., None], np.array([0.26, 0.26, 0.27]), rgb)
    lit = RNG.random((8, 8)) < 0.55
    warm = RNG.random((8, 8))
    tint = np.where((warm > 0.25)[..., None], np.array([1.0, 0.80, 0.56]), np.array([0.82, 0.90, 1.0]))
    emit = tint[flo, col] * (lit[flo, col] * (0.55 + 0.45 * warm[flo, col]))[..., None]
    emit = emit * (0.75 + 0.25 * (1 - fv))[..., None]
    emit[spandrel | frame] = 0
    return to_image("curtain", rgb), to_image("curtain_night", emit)


def tex_wood():
    """Tasseaux de cedre verticaux (10 cm, joints sombres), tuile 2 x 2 m."""
    S = 512
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    slat = np.floor(u * 20).astype(int)
    tone = RNG.random(20)[slat]
    grain = value_noise(S, S, 64, 20)
    gap = ((u * 20) % 1) > 0.85
    base = np.stack([0.40 + 0.08 * tone, 0.25 + 0.05 * tone, 0.15 + 0.03 * tone], -1) * (0.9 + 0.2 * grain)[..., None]
    return to_image("wood_slats", np.where(gap[..., None], np.array([0.06, 0.05, 0.04]), base))


def tex_paving():
    """Dalles grand format gris fonce 1,2 x 0,6 m a joints decales, tuile 4,8 x 4,8 m."""
    S = 512
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    row = np.floor(v * 8)
    uu = u * 4 + (row % 2) * 0.5
    tid = (row.astype(int) * 5 + np.floor(uu).astype(int)) % 40
    tone = RNG.random(40)[tid] * 0.04
    joint = (((v * 8) % 1) < 0.02) | ((uu % 1) < 0.008)
    base = 0.20 + tone + 0.02 * (fbm(S, S, 16) - 0.5)
    rgb = np.stack([base, base, base * 1.03], -1)
    return to_image("paving", np.where(joint[..., None], np.array([0.10, 0.10, 0.10]), rgb))


def tex_asphalt():
    """Enrobe sombre, tuile 8 x 8 m."""
    S = 512
    n = fbm(S, S, 12, 3)
    speck = (RNG.random((S, S)) > 0.985) * 0.05
    v = 0.095 + 0.03 * (n - 0.5) + speck
    return to_image("asphalt", np.stack([v, v, v * 1.04], -1))


def tex_lawn():
    """Pelouse d'agrement sombre, tuile 8 x 8 m."""
    S = 512
    n = fbm(S, S, 6, 5)
    return to_image("lawn", np.stack([0.13 + 0.05 * n, 0.24 + 0.07 * n, 0.09 + 0.03 * n], -1))


def tex_turf(name, slab, play):
    """Gazon synthetique d'entrainement : slab = (L, l) de la dalle, play = (L, l) de l'aire de jeu."""
    sw, sd = slab
    W = 1024
    H = int(round(W * sd / sw))
    X, Y = np.meshgrid((np.arange(W) + 0.5) / W * sw - sw / 2, (np.arange(H) + 0.5) / H * sd - sd / 2)
    px = sw / W
    pw, pd = play[0] / 2, play[1] / 2
    stripes = (np.floor((X + pw) / (play[0] / 10)) % 2).astype(float)
    col = mix((0.20, 0.42, 0.17), (0.16, 0.36, 0.14), stripes) * (0.94 + 0.1 * fbm(H, W, 24))[..., None]
    outside = (np.abs(X) > pw + 0.3) | (np.abs(Y) > pd + 0.3)
    col = np.where(outside[..., None], np.array([0.14, 0.26, 0.12]), col)
    w = 0.10
    alpha = np.zeros((H, W))

    def line(d):
        nonlocal alpha
        alpha = np.maximum(alpha, np.clip((w / 2 - d) / px + 0.5, 0, 1))

    for (ax, ay, bx, by) in [(-pw, -pd, pw, -pd), (-pw, pd, pw, pd), (-pw, -pd, -pw, pd), (pw, -pd, pw, pd), (0, -pd, 0, pd)]:
        line(seg_dist(X, Y, ax, ay, bx, by))
    line(np.abs(np.hypot(X, Y) - play[1] * 0.15))
    for s in (-1, 1):
        gx, depth, half = s * pw, play[0] * 0.14, play[1] * 0.3
        ix = gx - s * depth
        line(seg_dist(X, Y, gx, -half, ix, -half))
        line(seg_dist(X, Y, gx, half, ix, half))
        line(seg_dist(X, Y, ix, -half, ix, half))
    return to_image(name, mix(col, (0.92, 0.92, 0.9), alpha))


def tex_roofing():
    """Membrane de toiture-terrasse gris clair, salissures douces, tuile 8 x 8 m."""
    S = 512
    n = fbm(S, S, 5, 5)
    v = 0.36 + 0.06 * (n - 0.5)
    return to_image("roofing", np.stack([v, v, v * 1.02], -1))


def modern_materials():
    """Palette moderne sombre FootOFF (couleurs en sRGB, converties en lineaire par material())."""
    curtain, curtain_night = tex_curtain()
    return {
        "paving": material("paving", image=tex_paving(), rough=0.85),
        "asphalt": material("asphalt", image=tex_asphalt(), rough=0.95),
        "lawn": material("lawn", image=tex_lawn(), rough=1.0),
        "roofing": material("roofing", image=tex_roofing(), rough=0.9),
        "cladding": material("cladding", image=tex_cladding(), rough=0.45, metal=0.55),
        "emissive_curtain": material("emissive_curtain", image=curtain, rough=0.08, metal=0.6,
                                     emission_map=curtain_night, strength=1.6),
        "wood": material("wood", image=tex_wood(), rough=0.7),
        "concrete": material("concrete", image=tex_concrete(), rough=0.9),
        "concrete_dark": material("concrete_dark", (0.16, 0.16, 0.17), rough=0.9),
        "steel": material("steel", (0.30, 0.30, 0.32), rough=0.4, metal=0.85),
        "black_metal": material("black_metal", (0.09, 0.09, 0.095), rough=0.4, metal=0.7),
        "glass": material("glass", (0.06, 0.08, 0.10), rough=0.05, metal=0.8),
        "white": material("white", (0.92, 0.92, 0.92), rough=0.45),
        "water": material("water", (0.05, 0.22, 0.30), rough=0.05, metal=0.3),
        "emissive_led": material("emissive_led", GOLD, rough=0.35, metal=0.55, emission=GOLD_LIGHT, strength=1.4),
        "emissive_light": material("emissive_light", (0.85, 0.85, 0.82), rough=0.3, emission=(1.0, 0.92, 0.78), strength=6.0),
        "emissive_screen": material("emissive_screen", image=tex_screen(), rough=0.2, strength=2.0, emission_image=True),
    }


# =============================================================== paysage et architecture

def tree(B, x, y, h=9.0, r=2.6, z=0.0, columnar=False):
    """Arbre : un simple repere tree_spot_* (Builder.finalize), ou le jeu plante un arbre modelise (build_trees.py,
    src/three/forest.js), comme ceux du site et de l'ecrin naturel. Proprietes : hauteur h (m), largeur relative w
    (memes proportions que site_trees.json), espece."""
    if columnar:
        kind, w = "peuplier", (r * 0.55) / (0.13 * h)
    else:
        kind, w = ("chene" if int(abs(x * 3.1 + y * 1.7)) % 3 else "hetre"), r / (0.36 * h)
    B.spots.append(((x, y, z), {"h": round(h, 3), "w": round(w, 3), "kind": kind}))


def plinth(B, w=58.0, d=58.0, mat="paving"):
    """Dalle de la parcelle (pavage) et sa bordure en beton fonce."""
    B.box(mat, (-w / 2, -d / 2, 0), (w / 2, d / 2, 0.12), tile=(4.8, 4.8), origin=(-w / 2, -d / 2, 0))
    k = 0.3
    for a, b in [((-w / 2 - k, -d / 2 - k), (w / 2 + k, -d / 2)), ((-w / 2 - k, d / 2), (w / 2 + k, d / 2 + k)),
                 ((-w / 2 - k, -d / 2), (-w / 2, d / 2)), ((w / 2, -d / 2), (w / 2 + k, d / 2))]:
        B.box("concrete_dark", (*a, 0), (*b, 0.16))


def lawn(B, x0, y0, x1, y1, z=0.12):
    """Pelouse ; un buis en boule a chaque coin quand elle est assez grande (repere tree_spot_*, plante par le jeu)."""
    B.box("lawn", (x0, y0, z), (x1, y1, z + 0.08), tile=(8, 8))
    if x1 - x0 >= 5 and y1 - y0 >= 5:
        for x, y in ((x0 + 0.9, y0 + 0.9), (x1 - 0.9, y0 + 0.9), (x0 + 0.9, y1 - 0.9), (x1 - 0.9, y1 - 0.9)):
            B.spots.append(((x, y, z + 0.08), {"h": 1.0, "w": 1.0, "kind": "buis"}))


def roof(B, x0, y0, x1, y1, z, units=True):
    """Toiture-terrasse : membrane grise en retrait de l'acrotere + equipements techniques."""
    B.box("roofing", (x0 + 0.35, y0 + 0.35, z), (x1 - 0.35, y1 - 0.35, z + 0.03), tile=(8, 8))
    if units and (x1 - x0) > 8 and (y1 - y0) > 8:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.15
        for dx in (-0.22, 0.12):
            ux = cx + dx * (x1 - x0)
            B.box("steel", (ux - 1.4, cy - 1.0, z), (ux + 1.4, cy + 1.0, z + 1.5))
            B.cyl("black_metal", (ux, cy, z + 1.5), (ux, cy, z + 1.62), 0.7, segs=10)


def glass_box(B, x0, y0, x1, y1, z0, z1, frame=True, cap="cladding", top=True):
    """Volume en mur-rideau (texture calee sur les etages), corniche, poteaux d'angle et toiture."""
    B.box("emissive_curtain", (x0, y0, z0), (x1, y1, z1), tile=(24.0, 28.8), origin=(0, 0, z0))
    B.box(cap, (x0 - 0.15, y0 - 0.15, z1), (x1 + 0.15, y1 + 0.15, z1 + 0.6), tile=(3, 3))
    if top:
        roof(B, x0, y0, x1, y1, z1 + 0.6, units=False)
    if frame:
        for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            B.box(cap, (x - 0.25, y - 0.25, z0), (x + 0.25, y + 0.25, z1), tile=(3, 3))


def clad_box(B, x0, y0, x1, y1, z0, z1, mat="cladding", top=False):
    B.box(mat, (x0, y0, z0), (x1, y1, z1), tile=(3, 3) if mat != "wood" else (2, 2), origin=(0, 0, z0))
    if top:
        roof(B, x0, y0, x1, y1, z1)


def fins(B, x0, x1, y, z0, z1, spacing=1.5, depth=0.5, width=0.12, mat="emissive_led"):
    """Ailettes verticales devant une facade tournee vers -Y (cote camera)."""
    n = max(1, int((x1 - x0) // spacing))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        B.box(mat, (x - width / 2, y - depth, z0), (x + width / 2, y, z1))


def canopy(B, x0, y0, x1, y1, z, thick=0.45, top="black_metal", soffit="wood"):
    """Auvent fin : dessus metal sombre, sous-face en tasseaux de bois."""
    B.box(top, (x0, y0, z + 0.05), (x1, y1, z + thick))
    B.box(soffit, (x0 + 0.05, y0 + 0.05, z), (x1 - 0.05, y1 - 0.05, z + 0.05), tile=(2, 2))


def solar_array(B, x0, y0, x1, y1, z, rows=3):
    """Panneaux photovoltaiques inclines vers le sud sur une toiture."""
    d = (y1 - y0) / rows
    for r in range(rows):
        ya = y0 + r * d
        B.hexa("glass", [(x0, ya, z + 0.3), (x1, ya, z + 0.3), (x1, ya + d * 0.7, z + 1.2), (x0, ya + d * 0.7, z + 1.2),
                         (x0, ya, z + 0.38), (x1, ya, z + 0.38), (x1, ya + d * 0.7, z + 1.28), (x0, ya + d * 0.7, z + 1.28)])


def car(B, x, y, angle=0.0, mat="black_metal"):
    """Voiture : caisse, habitacle vitre, roues."""
    M = Matrix.Translation((x, y, 0.12)) @ Matrix.Rotation(angle, 4, "Z")
    B.hexa(mat, [(-0.9, -2.25, 0.3), (0.9, -2.25, 0.3), (0.9, 2.25, 0.3), (-0.9, 2.25, 0.3),
                 (-0.9, -2.2, 0.95), (0.9, -2.2, 0.95), (0.9, 2.2, 0.95), (-0.9, 2.2, 0.95)], M)
    B.hexa("glass", [(-0.8, -1.1, 0.95), (0.8, -1.1, 0.95), (0.8, 1.3, 0.95), (-0.8, 1.3, 0.95),
                     (-0.72, -0.5, 1.45), (0.72, -0.5, 1.45), (0.72, 1.0, 1.45), (-0.72, 1.0, 1.45)], M)
    for sx in (-0.82, 0.82):
        for sy in (-1.4, 1.4):
            B.cyl("black_metal", (sx - 0.12, sy, 0.32), (sx + 0.12, sy, 0.32), 0.32, segs=8, M=M)


def parking(B, x0, y0, x1, y1, cars=(), spacing=2.6, paints=("black_metal", "steel", "white")):
    """Parking : enrobe, marquages, voitures aux emplacements donnes (indices)."""
    B.box("asphalt", (x0, y0, 0.12), (x1, y1, 0.15), tile=(8, 8))
    n = int((x1 - x0) // spacing)
    for i in range(n + 1):
        x = x0 + i * spacing
        B.box("white", (x - 0.06, y0 + 0.3, 0.15), (x + 0.06, y0 + 5.0, 0.16))
    for k, i in enumerate(cars):
        car(B, x0 + (i + 0.5) * spacing, y0 + 2.6, 0.0, paints[k % len(paints)])


def rail(B, x0, y0, x1, y1, z, h=1.1):
    """Garde-corps vitre avec main courante noire."""
    xa, xb, ya, yb = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
    B.box("glass", (xa - 0.03, ya - 0.03, z), (xb + 0.03, yb + 0.03, z + h))
    B.box("black_metal", (xa - 0.05, ya - 0.05, z + h), (xb + 0.05, yb + 0.05, z + h + 0.06))


def string_lights(B, pts, z=4.5, sag=0.6, spacing=1.6):
    """Guirlande lumineuse entre des poteaux (ampoules chaudes la nuit)."""
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        length = math.hypot(bx - ax, by - ay)
        n = max(2, int(length // spacing))
        for i in range(1, n):
            t = i / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            zz = z - sag * 4 * t * (1 - t)
            B.box("emissive_light", (x - 0.08, y - 0.08, zz - 0.16), (x + 0.08, y + 0.08, zz))
    for (x, y) in pts:
        B.cyl("black_metal", (x, y, 0.12), (x, y, z + 0.2), 0.06, segs=6)


def turf_pitch(B, mat, cx, cy, slab, goal_w=5.0, goal_h=2.0, play=None):
    """Terrain synthetique (dalle texturee) + buts."""
    sw, sd = slab
    B.box(mat, (cx - sw / 2, cy - sd / 2, 0.12), (cx + sw / 2, cy + sd / 2, 0.18), tile=(sw, sd),
          origin=(cx - sw / 2, cy - sd / 2, 0))
    pw = (play or slab)[0] / 2
    for s in (-1, 1):
        x = cx + s * pw
        for y in (cy - goal_w / 2, cy + goal_w / 2):
            B.cyl("white", (x, y, 0.18), (x, y, 0.18 + goal_h), 0.05, segs=6)
        B.cyl("white", (x, cy - goal_w / 2, 0.18 + goal_h), (x, cy + goal_w / 2, 0.18 + goal_h), 0.05, segs=6)


def ball_fence(B, x0, y0, x1, y1, h=4.0, step=3.0):
    """Pare-ballons : poteaux noirs, lisses et filet suggere par des cables."""
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) // step))
        for i in range(n):
            t = i / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            B.cyl("black_metal", (x, y, 0.12), (x, y, h), 0.05, segs=6)
        for z in (1.0, h):
            B.cyl("black_metal", (ax, ay, z), (bx, by, z), 0.035, segs=4)


def container_box(B, x0, y0, z0, length=12.2, along_x=True):
    """Conteneur maritime bardé anthracite, liseré or côté camera."""
    x1, y1 = (x0 + length, y0 + 2.44) if along_x else (x0 + 2.44, y0 + length)
    clad_box(B, x0, y0, x1, y1, z0, z0 + 2.6)
    B.box("emissive_led", (x0, y0 - 0.03, z0 + 2.2), (x1, y0, z0 + 2.32))
