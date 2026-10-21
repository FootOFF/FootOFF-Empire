"""FootOFF Empire - mobilier urbain du complexe (phase 3) : lampadaires routiers, lanternes pietonnes, bancs,
corbeilles, bornes, arceaux a velos, grilles d'arbres, plaques d'egout et avaloirs.

Style contemporain : acier thermolaque anthracite (black_metal), lattes de teck (wood_teak, texture photo), fonte
(cast_iron, tree_grate), LED chaudes (emissive_light : allumees la nuit, visibles depuis la camera du jeu, qui
regarde d'en haut). Sous chaque lampadaire et lanterne, une flaque de lumiere au sol (emissive_pool : ajoutee a
l'image le soir et la nuit, cachee le jour, src/three/assets.js). Repere Blender en metres : x vers l'est, y vers le
nord, z vers le haut ; ang = rotation autour de z (radians). Chaque piece rejoint la geometrie de son materiau
(Builder) : aucun appel de dessin en plus.
"""

import math

import numpy as np

from footoff_lib import Matrix, to_image

TILT = math.radians(14)  # inclinaison du dossier des bancs
POOL_Z = 0.06  # flaques de lumiere : au-dessus des bordures (dallage a 0,14 m, bordures a 0,175 m)


def _frame(x, y, z, ang):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(ang, 4, "Z")


def street_lamp(B, x, y, ang, h=8.0, z=0.0):
    """Lampadaire routier : embase, fut conique, crosse fine vers la chaussee (direction ang), luminaire LED plat.
    Le diffuseur deborde un peu sous le capot : son liseré lumineux reste visible d'en haut la nuit."""
    c, s = math.cos(ang), math.sin(ang)
    B.cyl("black_metal", (x, y, z), (x, y, z + 0.55), 0.14, 0.12, segs=12)
    B.cyl("black_metal", (x, y, z + 0.55), (x, y, z + h), 0.085, 0.055, segs=12)
    reach = 1.35
    B.cyl("black_metal", (x, y, z + h - 0.1), (x + c * reach, y + s * reach, z + h + 0.1), 0.035, segs=8)
    M = _frame(x + c * (reach + 0.4), y + s * (reach + 0.4), z + h + 0.1, ang)
    B.hexa("black_metal", [(-0.46, -0.17, -0.03), (0.46, -0.17, -0.03), (0.46, 0.17, -0.03), (-0.46, 0.17, -0.03),
                           (-0.4, -0.14, 0.045), (0.4, -0.14, 0.045), (0.4, 0.14, 0.045), (-0.4, 0.14, 0.045)], M)
    B.box("emissive_light", (-0.45, -0.165, -0.07), (0.45, 0.165, -0.03), M)
    light_pool(B, x + c * (reach + 0.4), y + s * (reach + 0.4), 9.0, z + POOL_Z)


def lantern(B, x, y, h=4.5, z=0.0):
    """Lanterne pietonne : fut fin sur embase, diffuseur cylindrique opale (allume la nuit), chapeau plat."""
    B.cyl("black_metal", (x, y, z), (x, y, z + 0.4), 0.12, 0.1, segs=12)
    B.cyl("black_metal", (x, y, z + 0.4), (x, y, z + h), 0.065, 0.058, segs=10)
    B.cyl("black_metal", (x, y, z + h), (x, y, z + h + 0.06), 0.1, segs=12)
    B.cyl("emissive_light", (x, y, z + h + 0.06), (x, y, z + h + 0.72), 0.18, 0.2, segs=14)
    B.cyl("black_metal", (x, y, z + h + 0.72), (x, y, z + h + 0.78), 0.3, 0.27, segs=16)
    light_pool(B, x, y, 5.5, z + POOL_Z)


def tex_pool():
    """Flaque de lumiere vue du dessus (1 tuile = la flaque) : blanc chaud, decroissance douce jusqu'au bord."""
    S = 128
    u, v = np.meshgrid((np.arange(S) + 0.5) / S * 2 - 1, (np.arange(S) + 0.5) / S * 2 - 1)
    d = np.clip(np.hypot(u, v), 0, 1)
    k = (1 - d * d) ** 2.2 * (0.55 + 0.45 * np.exp(-(d / 0.35) ** 2))
    return to_image("light_pool", k[..., None] * np.array([1.0, 0.8, 0.58]))


def light_pool(B, x, y, r, z):
    """Flaque de lumiere au sol (carre texture, rayon r), sous un luminaire."""
    pts = [(x - r, y - r, z), (x + r, y - r, z), (x + r, y + r, z), (x - r, y + r, z)]
    B.piece("emissive_pool", pts, [(0, 1, 2, 3)], tile=(2 * r, 2 * r), origin=(x - r, y - r, z))


def bench(B, x, y, ang, z=0.0, length=1.8, arms=True):
    """Banc : deux pietements en acier anthracite, assise de cinq lattes de teck, dossier incline de trois lattes,
    accoudoirs. Repere local : x = longueur, assise tournee vers +y (dossier cote -y)."""
    M = _frame(x, y, z, ang)
    back = M @ Matrix.Translation((0, -0.255, 0.64)) @ Matrix.Rotation(TILT, 4, "X")  # axe du dossier
    for fx in (-length / 2 + 0.1, length / 2 - 0.1):
        B.box("black_metal", (fx - 0.025, 0.15, 0.0), (fx + 0.025, 0.2, 0.41), M)  # pied avant
        B.box("black_metal", (fx - 0.025, -0.22, 0.0), (fx + 0.025, -0.17, 0.41), M)  # pied arriere
        B.box("black_metal", (fx - 0.025, -0.24, 0.37), (fx + 0.025, 0.22, 0.41), M)  # traverse d'assise
        B.box("black_metal", (fx - 0.025, -0.03, -0.24), (fx + 0.025, 0.02, 0.24), back)  # montant du dossier
        if arms:
            B.box("black_metal", (fx - 0.03, -0.2, 0.62), (fx + 0.03, 0.2, 0.65), M)  # accoudoir
            B.box("black_metal", (fx - 0.02, 0.16, 0.41), (fx + 0.02, 0.19, 0.62), M)
    for k in range(5):
        y0 = -0.21 + k * 0.088
        B.box("wood_teak", (-length / 2, y0, 0.41), (length / 2, y0 + 0.072, 0.445), M)
    for k in range(3):  # lattes du dossier, posees devant les montants
        t = (0.53 + k * 0.1 - 0.64) / math.cos(TILT)
        B.box("wood_teak", (-length / 2 + 0.02, 0.02, t - 0.036), (length / 2 - 0.02, 0.052, t + 0.036), back)


def litter_bin(B, x, y, z=0.0):
    """Corbeille cylindrique anthracite, cerclage acier, couvercle bombe."""
    B.cyl("black_metal", (x, y, z), (x, y, z + 0.82), 0.22, 0.23, segs=12)
    B.cyl("steel", (x, y, z + 0.82), (x, y, z + 0.86), 0.235, segs=12)
    B.cyl("black_metal", (x, y, z + 0.86), (x, y, z + 0.95), 0.235, 0.17, segs=12)


def bollard(B, x, y, z=0.0):
    """Borne anti-stationnement : fut anthracite, bague reflechissante, tete arrondie."""
    B.cyl("black_metal", (x, y, z), (x, y, z + 0.8), 0.08, 0.075, segs=10)
    B.cyl("steel", (x, y, z + 0.64), (x, y, z + 0.7), 0.082, segs=10)
    B.cyl("black_metal", (x, y, z + 0.8), (x, y, z + 0.86), 0.075, 0.04, segs=10)


def bike_rack(B, x, y, ang, z=0.0):
    """Arceau a velos en U renverse (tube anthracite), plan de l'arceau selon le x local."""
    M = _frame(x, y, z, ang)
    w, h, k = 0.34, 0.78, 0.1
    pts = [(-w, 0, 0), (-w, 0, h - k), (-w + k * 0.3, 0, h - k * 0.3), (-w + k, 0, h),
           (w - k, 0, h), (w - k * 0.3, 0, h - k * 0.3), (w, 0, h - k), (w, 0, 0)]
    for a, b in zip(pts, pts[1:]):
        B.cyl("black_metal", a, b, 0.028, segs=6, M=M)


def tex_grate():
    """Grille d'arbre en fonte vue du dessus (1 tuile = la grille) : couronnes de fentes autour du trou du tronc."""
    S = 256
    u, v = np.meshgrid((np.arange(S) + 0.5) / S - 0.5, (np.arange(S) + 0.5) / S - 0.5)
    r = np.maximum(np.abs(u), np.abs(v))
    ring = (r * 16) % 1
    ang = np.arctan2(v, u)
    slot = (np.abs((ang / (2 * np.pi) * 56) % 1 - 0.5) < 0.2) & (ring > 0.22) & (ring < 0.8) & (r > 0.2) & (r < 0.46)
    # grain de la fonte : tirage a part (le generateur commun RNG fixe la place des arbres des jardins)
    grain = np.random.default_rng(5).random((S // 8, S // 8)).repeat(8, 0).repeat(8, 1)
    iron = 0.09 * (0.9 + 0.2 * grain)
    rgb = np.where(slot[..., None], np.array([0.03, 0.022, 0.018]), iron[..., None] * np.array([1.0, 0.97, 0.94]))
    edge = r > 0.485  # cadre
    rgb = np.where(edge[..., None], np.array([0.12, 0.12, 0.12]), rgb)
    return to_image("tree_grate", rgb)


def tree_grate(B, x, y, z=0.0, size=1.4, hole=0.28):
    """Grille d'arbre en fonte au pied d'un arbre plante dans le dallage, paillage dans le trou du tronc."""
    h, t = size / 2, 0.025  # 2,5 cm au-dessus du dallage : sans conflit apres compression (pas de 9 mm)
    org = (x - h, y - h, z)
    for a, b in (((x - h, y - h), (x + h, y - hole)), ((x - h, y + hole), (x + h, y + h)),
                 ((x - h, y - hole), (x - hole, y + hole)), ((x + hole, y - hole), (x + h, y + hole))):
        B.box("tree_grate", (*a, z), (*b, z + t), tile=(size, size), origin=org)
    B.box("ground_mulch", (x - hole, y - hole, z), (x + hole, y + hole, z + 0.02), tile=(2.0, 2.0))


def manhole(B, x, y, z):
    """Plaque d'egout en fonte, a fleur de chaussee."""
    B.cyl("cast_iron", (x, y, z), (x, y, z + 0.02), 0.33, segs=16)


def drain(B, x, y, z, along_x=True):
    """Avaloir (grille de caniveau) en fonte."""
    hx, hy = (0.3, 0.13) if along_x else (0.13, 0.3)
    B.box("cast_iron", (x - hx, y - hy, z), (x + hx, y + hy, z + 0.02))
