"""Arbres du decor (niveau de detail proche) : chene, hetre, peuplier, pin sylvestre, sapin ; et vegetation basse
des jardins : buis en boule, massif d'arbustes, module de haie taillee.

    python -I tools/vegetation/clusters.py                       (masses de feuillage, une fois)
    blender -b --factory-startup -P tools/blender/models/build_trees.py
    -> assets-src/blend/trees.blend (collection prop_trees) + assets-src/vegetation-baked/trees_meta.json
    puis : footoff_export.py -- --only prop_trees ; render_impostors.py ; npm run models -- trees

Le houppier d'abord : la silhouette de l'espece (superellipse dissymetrique : hauteur du plus large, arrondi du bas
et du haut) est remplie de touffes de feuillage, surtout vers l'exterieur, chacune faite de trois cartes texturees
par les masses de feuilles photo (clusters.py). Normales arrondies sur le houppier et sur chaque touffe : eclairage
doux du volume et bosses des touffes, comme un vrai feuillage vu de loin. Puis la charpente : tronc evase a la base
et effile, charpentieres vers les touffes du bas du houppier (les seules visibles), ecorces photographiees (Poly
Haven, ambientCG, CC0). Pin : touffes aplaties en plateaux au bout de longues branches. Sapin : etages de branches
retombantes portant chacune un rameau plat. Environ 1 000 a 1 500 triangles par arbre ; au loin, le jeu affiche des
imposteurs rendus a partir de ces arbres (render_impostors.py).

Arbustes et haie : memes touffes (feuilles d'arbuste, atlas hedge), sans tronc ; la haie est un module de 2 m
(dessus et cotes en cartes un peu debordantes, coeur sombre plein), mis bout a bout par le jeu.

Objets : tree_<espece>__bark, tree_<espece>__leaves (et tree_haie__core), modeles a l'origine, base a z = 0.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import find_repo  # noqa: E402
from geom_lib import Parts, path3  # noqa: E402

ROOT = find_repo()
VEG = os.path.join(ROOT, 'assets-src', 'vegetation')
BAKED = os.path.join(ROOT, 'assets-src', 'vegetation-baked')
UP = Vector((0, 0, 1))

# h : hauteur (m) ; r : rayon du tronc ; taper : amincissement du tronc ; trunk : hauteur du tronc (fraction de h) ;
# crown : bas et haut du feuillage (fraction de h) ; R : rayon du houppier (m) ; env : silhouette (hauteur du plus
# large dans le houppier, arrondi du bas, arrondi du haut) ; lump : bosses et creux du houppier (silhouette
# irreguliere) ; limbs / rise / twigs : charpentieres, leur montee, une
# branche secondaire chacune ; tufts / tuft : touffes et leur rayon (m) ; gap : espacement des touffes ; flat :
# touffes aplaties (pin) ; whorls / per_whorl / droop : etages du sapin, angle des branches (bas, haut) ; bsides :
# cotes des charpentieres (4 par defaut : surtout cachees par le feuillage) ; gnarl : tortuosite
SPECIES = {
    'chene': dict(h=17.5, r=0.56, taper=0.62, trunk=0.6, crown=(0.25, 1.0), R=8.2, env=(0.4, 1.8, 2.2), lump=0.2,
                  limbs=7, rise=0.35, twigs=1, tufts=120, tuft=(1.2, 1.9), gap=0.5, gnarl=0.08,
                  foliage='broad', bark='bark_brown_02', tile=1.6),
    'hetre': dict(h=22.0, r=0.46, taper=0.78, trunk=0.82, crown=(0.22, 1.0), R=7.0, env=(0.38, 1.9, 1.6), lump=0.1,
                  limbs=8, rise=0.6, twigs=1, tufts=115, tuft=(1.15, 1.8), gap=0.5, gnarl=0.03,
                  foliage='broad', bark='Bark005', tile=1.4),
    'peuplier': dict(h=25.0, r=0.42, taper=0.82, trunk=0.94, crown=(0.05, 1.0), R=2.8, env=(0.32, 2.4, 1.4), lump=0.06,
                     limbs=12, rise=1.2, twigs=0, tufts=80, tuft=(0.8, 1.15), gap=0.5, gnarl=0.02, bsides=3,
                     foliage='broad', bark='Bark004', tile=1.4),
    'pin': dict(h=20.0, r=0.36, taper=0.82, trunk=0.93, crown=(0.55, 1.0), R=5.6, env=(0.45, 1.4, 3.0), lump=0.25,
                limbs=6, rise=0.55, twigs=1, tufts=30, tuft=(1.4, 2.1), gap=0.75, flat=0.6, gnarl=0.06,
                foliage='pine', bark='pine_tree_01_bark', tile=1.6),
    'sapin': dict(h=22.0, r=0.36, taper=0.82, trunk=0.97, crown=(0.07, 1.0), R=5.0, whorls=16, per_whorl=6,
                  droop=(102, 72), gnarl=0.01, foliage='fir', bark='fir_tree_01_bark', tile=1.4),
    # vegetation basse (shrub : sans tronc ; hedge : module de haie longueur x largeur x hauteur)
    'buis': dict(shrub=True, h=1.2, crown=(0.0, 1.0), R=0.62, env=(0.5, 2.0, 2.0), lump=0.05, tufts=7,
                 tuft=(0.32, 0.45), gap=0.5, foliage='hedge'),
    'arbuste': dict(shrub=True, h=1.7, crown=(0.0, 1.0), R=1.2, env=(0.42, 1.6, 2.0), lump=0.25, tufts=16,
                    tuft=(0.42, 0.65), gap=0.5, foliage='hedge'),
    'haie': dict(shrub=True, hedge=(2.0, 0.9, 1.0), foliage='hedge'),
}
BARKS = {  # photo de l'ecorce (Poly Haven, ambientCG)
    'bark_brown_02': 'bark_brown_02_diff_1k.jpg',
    'Bark005': 'Bark005/Bark005_1K-JPG_Color.jpg',
    'Bark004': 'Bark004/Bark004_1K-JPG_Color.jpg',
    'pine_tree_01_bark': 'pine_tree_01_bark_diff_1k.jpg',
    'fir_tree_01_bark': 'fir_tree_01_bark_diff_1k.jpg',
}


def image(path, data=False):
    img = bpy.data.images.load(path, check_existing=True)
    if data:
        img.colorspace_settings.name = "Non-Color"
    return img


def bark_image(key):
    """Ecorce reduite a 512 px (copie dans vegetation-baked/barks) : les troncs restent petits a l'ecran."""
    src = os.path.join(VEG, BARKS[key])
    out = os.path.join(BAKED, "barks", f"{key}.jpg")
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        img = bpy.data.images.load(src)
        img.scale(512, 512)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.filepath_raw = out
        img.file_format = "JPEG"
        img.save()
        bpy.data.images.remove(img)
    return image(out)


def bark_material(name, key):
    """Ecorce : photo seule (sans relief, invisible a cette taille), mate."""
    m = bpy.data.materials.new(name)
    m.use_backface_culling = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bark_image(key)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    return m


def leaf_material(name, kind):
    """Feuillage : couleur avec alpha (masses de feuilles), alpha detoure (glTF MASK), relief."""
    m = bpy.data.materials.new(name)
    m.use_backface_culling = False
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image(os.path.join(BAKED, f"{kind}_color.webp"))
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "GREATER_THAN"
    clip.inputs[1].default_value = 0.42
    nt.links.new(t.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], b.inputs["Alpha"])
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = image(os.path.join(BAKED, f"{kind}_normal.webp"), data=True)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.7
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.72
    return m


def lerp(a, b, t):
    return a + (b - a) * t


def ring(n):
    return [(math.cos(a), math.sin(a)) for a in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def envelope(sp, u, a=0.0):
    """Rayon relatif du houppier a la hauteur u (0 : bas du feuillage, 1 : sommet) et dans la direction a :
    superellipse dissymetrique, deformee par quelques bosses et creux (harmoniques tournant avec la hauteur)."""
    uc, pb, pt = sp["env"]
    x, p = ((u - uc) / (1 - uc), pt) if u >= uc else ((uc - u) / uc, pb)
    lump = 1 + sum(A * math.cos(m * a + ph + tw * u) for A, m, ph, tw in sp.get("lumps", ()))
    return max(0.0, 1 - min(1.0, x) ** p) ** (1 / p) * lump


def crown_normal(sp, v):
    """Normale du houppier au point v (ellipsoide de meme largeur, et de meme hauteur au-dessus et au-dessous du
    plus large)."""
    h = sp["h"]
    z0, z1 = sp["crown"][0] * h, sp["crown"][1] * h
    zc = z0 + sp["env"][0] * (z1 - z0)
    hz = (z1 - zc) if v.z >= zc else (zc - z0)
    n = Vector((v.x / sp["R"] ** 2, v.y / sp["R"] ** 2, (v.z - zc) / hz ** 2))
    return n.normalized() if n.length > 1e-6 else UP.copy()


def sample(pts, t):
    """Point et tangente a la fraction t (longueur) d'une polyligne."""
    seg = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(seg)
    d = t * total
    for i, L in enumerate(seg):
        if d <= L or i == len(seg) - 1:
            k = min(1.0, d / max(L, 1e-6))
            return pts[i].lerp(pts[i + 1], k), (pts[i + 1] - pts[i]).normalized()
        d -= L
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def trunk_path(sp, rng):
    """Tronc : chemin legerement penche et sinueux, rayon evase a la base puis effile."""
    h = sp["h"]
    lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * sp["gnarl"] * h * 0.35
    top = h * sp["trunk"]
    ctrl = []
    for i in range(9):
        t = i / 8
        wob = Vector((math.sin(t * 5.3 + rng.random() * 6), math.cos(t * 4.1 + rng.random() * 6), 0)) * sp["gnarl"] * h * 0.1 * t
        ctrl.append(Vector((0, 0, t * top)) + lean * t * t + wob)
    radius = lambda t: sp["r"] * (1 - sp["taper"] * t) ** 1.1 + sp["r"] * 0.38 * math.exp(-t / 0.035)  # noqa: E731
    return path3(ctrl, 2), radius


def tufts_in_crown(sp, rng):
    """Touffes de feuillage (centre, rayon) reparties dans la silhouette, surtout vers l'exterieur ; une ou deux
    au sommet."""
    h, R = sp["h"], sp["R"]
    z0, z1 = sp["crown"][0] * h, sp["crown"][1] * h
    out = []
    for _ in range(60000):
        if len(out) >= sp["tufts"]:
            break
        rc = rng.uniform(*sp["tuft"])
        u = rng.uniform(0, 1)
        a = rng.uniform(0, 2 * math.pi)
        room = R * envelope(sp, u, a) - rc * 0.55  # la touffe reste (a peu pres) dans la silhouette
        if room < rc * 0.25 and u < 0.9:
            continue
        rho = max(0.0, room) * math.sqrt(rng.uniform(0.3, 1.0))
        z = min(z0 + u * (z1 - z0), z1 - rc * 0.6)
        if sp.get("shrub"):  # arbustes : les touffes du bas restent hors du sol
            z = max(z, rc * 1.1)
        p = Vector((rho * math.cos(a), rho * math.sin(a), z))
        if any((p - q).length < (rc + rq) * sp["gap"] for q, rq in out):
            continue
        out.append((p, rc))
    return out


def limbs(sp, trunk, radius, tufts, rng):
    """Charpentieres : du tronc vers des touffes du houppier, reparties en spirale (angle d'or), plus une branche
    secondaire chacune vers une touffe voisine."""
    h = sp["h"]
    top = h * sp["trunk"]
    t_lo = min(0.9, sp["crown"][0] * h * 0.92 / top)
    out, used = [], set()
    n = sp["limbs"]
    for i in range(n):
        u = (i + rng.uniform(0.2, 0.8)) / n
        t = lerp(t_lo, 0.95, u)
        base, _ = sample(trunk, t)
        phi = i * 2.39996 + rng.uniform(-0.3, 0.3)
        dirh = Vector((math.cos(phi), math.sin(phi), 0))
        best, score = None, -1e9
        for j, (c, rc) in enumerate(tufts):
            rel = c - base
            hd = Vector((rel.x, rel.y, 0))
            if j in used or rel.z < 0.3 or hd.length < 1.0:
                continue
            sc = hd.normalized().dot(dirh) * 2 + hd.length / sp["R"] - abs(rel.z - sp["rise"] * hd.length) / (0.25 * h)
            if sc > score:
                best, score = j, sc
        if best is None:
            continue
        used.add(best)
        end = base + (tufts[best][0] - base) * 0.92
        rel = end - base
        L = rel.length
        mid1 = base + rel * 0.33 + Vector((rng.normal() * 0.08 * L, rng.normal() * 0.08 * L, -0.06 * L))
        mid2 = base + rel * 0.68 + Vector((rng.normal() * 0.06 * L, rng.normal() * 0.06 * L, 0.0))
        pts = path3([base, mid1, mid2, end], 1)
        r0 = radius(t) * rng.uniform(0.5, 0.62)
        out.append(dict(pts=pts, r0=r0))
        if not sp["twigs"]:
            continue
        s0 = rng.uniform(0.45, 0.7)
        p0, _ = sample(pts, s0)
        near = [(j, (c - p0).length) for j, (c, rc) in enumerate(tufts) if j not in used and c.z > p0.z - 1.0]
        if near:
            j, d = min(near, key=lambda x: x[1])
            if d < sp["R"] * 0.7:
                used.add(j)
                end2 = p0 + (tufts[j][0] - p0) * 0.9
                pts2 = path3([p0, p0.lerp(end2, 0.5) + UP * 0.05 * d, end2], 1)
                out.append(dict(pts=pts2, r0=r0 * (1 - 0.86 * s0) * 0.85))
    return out


def card(P, key, c, nrm, up, size, cell, normals, shade, anchor=0.5):
    """Carte de feuillage : centre c (ou base, anchor=0), normale nrm, haut de l'image vers `up` (ramene dans le
    plan), taille (largeur, hauteur) ; case de l'atlas ; normales de rendu donnees par shade(sommet)."""
    up = up - nrm * up.dot(nrm)
    up = up.normalized() if up.length > 1e-4 else nrm.orthogonal().normalized()
    right = up.cross(nrm).normalized()
    w, h = size
    b = c - up * h * anchor
    corners = [b - right * w / 2, b + right * w / 2, b + right * w / 2 + up * h, b - right * w / 2 + up * h]
    u0, v0 = (cell % 2) * 0.5, 1 - (cell // 2 + 1) * 0.5
    P.piece(key, "leaves", [tuple(p) for p in corners], [(0, 1, 2, 3)],
            uvs=[(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)])
    normals.extend(tuple(shade(p)) for p in corners)


def tuft_cards(P, key, sp, c, rc, rng, normals):
    """Trois cartes par touffe : une face a l'exterieur du houppier, deux inclinees (~60 degres) autour, pour une
    silhouette pleine sous tous les angles. Touffe de pin : une carte presque a plat et deux de chant, aplaties."""
    out_n = crown_normal(sp, c)
    flat = sp.get("flat", 1.0)

    def shade(p):
        d = p - c
        d = Vector((d.x, d.y, d.z / flat))
        local = d.normalized() if d.length > 1e-4 else out_n
        return (crown_normal(sp, p) * 0.7 + local * 0.3).normalized()

    S = 2.5 * rc * rng.uniform(0.92, 1.08)
    cells = rng.permutation(4)
    if flat < 1:
        horiz = Vector((c.x, c.y, 0))
        horiz = horiz.normalized() if horiz.length > 1e-3 else Vector((1, 0, 0))
        card(P, key, c + UP * rc * 0.1, (UP + horiz * 0.35).normalized(), horiz, (S, S), int(cells[0]), normals, shade)
        for k, s in enumerate((-1, 1)):
            az = horiz.copy()
            az.rotate(Quaternion(UP, s * rng.uniform(0.6, 1.0)))
            card(P, key, c, (az + UP * 0.3).normalized(), UP, (S, S * flat), int(cells[k + 1]), normals, shade)
        return
    jitter = Vector(rng.uniform(-0.15, 0.15, 3)) * rc
    card(P, key, c + jitter, (out_n + Vector(rng.uniform(-0.3, 0.3, 3))).normalized(), Vector(rng.normal(size=3)),
         (S, S), int(cells[0]), normals, shade)
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(2):
        t = out_n.orthogonal().normalized()
        t.rotate(Quaternion(out_n, a0 + k * 2.4 + rng.uniform(-0.3, 0.3)))
        card(P, key, c - jitter, (out_n * 0.5 + t * 0.866).normalized(), Vector(rng.normal(size=3)),
             (S, S), int(cells[k + 1]), normals, shade)


def broadleaf(P, key, sp, rng, normals):
    """Feuillus et pin : tronc, touffes du houppier, charpentieres vers les touffes. Arbustes : touffes seules."""
    if sp.get("shrub"):
        for c, rc in tufts_in_crown(sp, rng):
            tuft_cards(P, key, sp, c, rc, rng, normals)
        return
    trunk, radius = trunk_path(sp, rng)
    P.tube(key, "bark", trunk, ring(6), taper=radius, up=(1, 0, 0), uv=(2 if sp["r"] > 0.4 else 1, sp["tile"]))
    tufts = tufts_in_crown(sp, rng)
    for b in limbs(sp, trunk, radius, tufts, rng):
        P.tube(key, "bark", b["pts"], ring(sp.get("bsides", 4)), taper=lambda t, r0=b["r0"]: r0 * (1 - 0.86 * t),
               up=(0, 0, 1), uv=(1, sp["tile"] * 0.7))
    for c, rc in tufts:
        tuft_cards(P, key, sp, c, rc, rng, normals)


def fir(P, key, sp, rng, normals):
    """Sapin : tronc droit, etages de branches retombantes (plus courtes et plus relevees vers le haut), chacune
    portant un rameau plat en plume et un second plus court, incline ; trois rameaux dresses a la cime."""
    h, R = sp["h"], sp["R"]
    trunk, radius = trunk_path(sp, rng)
    P.tube(key, "bark", trunk, ring(6), taper=radius, up=(1, 0, 0), uv=(1, sp["tile"]))
    z0 = sp["crown"][0] * h
    hc = h - z0

    def shade_for(nrm):
        def shade(p):  # normale du cone, melangee a celle du rameau
            rho = math.hypot(p.x, p.y)
            cone = Vector((p.x / rho * hc, p.y / rho * hc, R)).normalized() if rho > 1e-3 else UP
            return (cone * 0.55 + nrm * 0.45).normalized()
        return shade

    W = sp["whorls"]
    for w in range(W):
        u = w / (W - 1)
        z = z0 + (h * 0.95 - z0) * u
        L = max(0.7, R * (1 - u) * rng.uniform(0.88, 1.1))
        theta = math.radians(lerp(*sp["droop"], u) + rng.uniform(-5, 5))
        n = sp["per_whorl"] + int(rng.integers(-1, 2))
        for k in range(n):
            phi = 2 * math.pi * (k + rng.uniform(-0.2, 0.2)) / n + w * 0.9
            d = Vector((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta)))
            base = Vector((0, 0, z))
            if u < 0.3:  # branches basses, visibles sous les rameaux
                pts = path3([base, base + d * L * 0.5, base + d * L + UP * L * 0.05], 1)
                P.tube(key, "bark", pts, ring(3), taper=lambda t: 0.09 * (1 - 0.8 * t), up=(0, 0, 1), uv=(1, sp["tile"] * 0.7))
            n0 = (UP - d * UP.dot(d)).normalized()
            for j, (scale, roll) in enumerate(((1.0, rng.uniform(-0.25, 0.25)), (0.72, rng.choice((-1, 1)) * rng.uniform(0.35, 0.6)))):
                nrm = n0.copy()
                nrm.rotate(Quaternion(d, roll))
                Lc = L * 1.05 * scale
                card(P, key, base + d * (0.1 + 0.15 * j) * L + UP * 0.08 * j, nrm, d, (Lc * 0.8, Lc),
                     int(rng.integers(4)), normals, shade_for(nrm), anchor=0.0)
    for k in range(3):
        nrm = Vector((math.cos(k * math.pi / 3), math.sin(k * math.pi / 3), 0))
        card(P, key, Vector((0, 0, h * 0.93)), nrm, UP, (1.3, 2.0), int(rng.integers(4)), normals, shade_for(nrm), anchor=0.0)


def hedge(P, key, sp, rng, normals):
    """Module de haie taillee (axe x) : trois cartes dessus, deux rangs de trois sur chaque cote, une a chaque bout
    (cachee entre deux modules), un peu debordantes (contour en feuilles) ; coeur sombre plein. Normales d'une haie
    aux aretes arrondies, sans variation le long du module (pas de motif repete sur une longue haie)."""
    L, W, H = sp["hedge"]

    def side(n):
        def shade(p):
            if abs(n.x) > 0.5:  # bout
                return Vector((n.x, 0, 0.3)).normalized()
            y = max(-1.0, min(1.0, p.y / (W / 2)))
            z = max(0.0, min(1.0, p.z / H))
            return Vector((0, y * (0.35 + 0.65 * abs(n.y)), 0.25 + z * z + (1.2 if n.z > 0.5 else 0.0))).normalized()
        return shade

    S = W + 0.25
    for x in (-L / 3, 0, L / 3):
        n = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 1)).normalized()
        card(P, key, Vector((x, 0, H + 0.02)), n, Vector(rng.normal(size=3)), (S, S), int(rng.integers(4)), normals, side(UP))
        for s in (-1, 1):
            for z in (0.43, H * 0.74):
                n = Vector((rng.uniform(-0.12, 0.12), s, rng.uniform(-0.1, 0.15))).normalized()
                up = Vector((rng.uniform(-0.25, 0.25), 0, 1))  # a peu pres droites : rien sous le sol
                card(P, key, Vector((x, s * (W / 2 + 0.02), z)), n, up, (0.85, 0.85), int(rng.integers(4)), normals,
                     side(Vector((0, s, 0))))
    for s in (-1, 1):
        card(P, key, Vector((s * (L / 2 - 0.05), 0, H / 2)), Vector((s, 0, 0)), UP, (W + 0.15, H + 0.1),
             int(rng.integers(4)), normals, side(Vector((s, 0, 0))))
    P.box(key, "core", (-L / 2 + 0.02, -W / 2 + 0.12, 0), (L / 2 - 0.02, W / 2 - 0.12, H - 0.1))


def core_material():
    """Coeur des haies : vert tres sombre, mat (on ne le voit qu'entre les feuilles)."""
    m = bpy.data.materials.new("tree_core")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.012, 0.03, 0.008, 1)
    b.inputs["Roughness"].default_value = 0.95
    return m


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    coll = bpy.data.collections.new("prop_trees")
    scene.collection.children.link(coll)
    rng = np.random.default_rng(42)
    meta = {}
    leaf_mats = {}
    for key, sp in SPECIES.items():
        if sp["foliage"] not in leaf_mats:
            leaf_mats[sp["foliage"]] = leaf_material(f"tree_leaves_{sp['foliage']}", sp["foliage"])
        mats = {"leaves": leaf_mats[sp["foliage"]]}
        if "bark" in sp:
            mats["bark"] = bark_material(f"tree_bark_{key}", sp["bark"])
        if "hedge" in sp:
            mats["core"] = core_material()
        P = Parts(mats, prefix="tree")
        normals = []
        sp["lumps"] = [(sp.get("lump", 0) * k * rng.uniform(0.6, 1.0), m, rng.uniform(0, 2 * math.pi), rng.uniform(-2, 2))
                       for m, k in ((2, 1.0), (3, 0.7), (5, 0.4))]
        (hedge if "hedge" in sp else fir if sp.get("whorls") else broadleaf)(P, key, sp, rng, normals)
        P.finalize(coll, smooth_angle=50)
        me = bpy.data.objects[f"tree_{key}__leaves"].data
        assert len(me.loops) == len(normals), (key, len(me.loops), len(normals))
        me.normals_split_custom_set(normals)
        objs = [o for o in coll.objects if o.name.startswith(f"tree_{key}__")]
        zmax = max((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)
        rmax = max(abs(v) for o in objs for c in o.bound_box for v in (o.matrix_world @ Vector(c))[:2])
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        meta[key] = {"height": round(zmax, 2), "radius": round(rmax, 2), "foliage": sp["foliage"], "triangles": tris}
        if "hedge" in sp:
            meta[key]["module"] = list(sp["hedge"])
        print(f"ARBRE {key}: {zmax:.1f} m, rayon {rmax:.1f} m, {tris} triangles ({len(me.polygons)} cartes)")
    out = os.path.join(ROOT, "assets-src", "blend", "trees.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    with open(os.path.join(BAKED, "trees_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print("TREES OK", out)


main()
