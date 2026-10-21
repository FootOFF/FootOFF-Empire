"""FootOFF Empire - bibliotheque commune des generateurs Blender (stade, batiments, site).

Textures procedurales, materiaux (couleurs en sRGB converties en lineaire), geometrie par materiau
(un objet = un draw call), monogramme FO en relief, identite FootOFF Media.
Importee par les scripts de tools/blender/models/ (sys.path pointe sur ce dossier).
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

RNG = np.random.default_rng(7)  # textures reproductibles
I4 = Matrix.Identity(4)

# Charte FootOFF Media (sRGB) : or #C7A15A, degrade du logo #B9924C -> #DEC17F, noir #090909
GOLD = (0.78, 0.63, 0.35)
GOLD_DEEP = (0.725, 0.573, 0.298)
GOLD_LIGHT = (0.871, 0.757, 0.498)
INK = (0.035, 0.035, 0.035)

def find_repo():
    d = os.path.dirname(os.path.abspath(__file__))
    while True:
        if os.path.isfile(os.path.join(d, "assets-src", "budgets.json")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise RuntimeError("racine du projet introuvable")
        d = parent


# =============================================================== logo FootOFF

def fo_outlines(n_arc=48):
    """Contours du monogramme FO dans le repere du logo officiel (1932 px, y vers le bas) :
    le F (fut biseaute, bras qui touche l'anneau) et l'anneau coupe par le bras."""
    cx, cy, ro, ri = 1038.0, 724.0, 300.0, 218.0

    def arc(r, a0, a1, n):
        return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]

    def ang(x, y):
        return math.atan2(y - cy, x - cx)

    xo1, xo2 = cx - math.sqrt(ro ** 2 - (588 - cy) ** 2), cx - math.sqrt(ro ** 2 - (662 - cy) ** 2)
    xi1, xi2 = cx - math.sqrt(ri ** 2 - (588 - cy) ** 2), cx - math.sqrt(ri ** 2 - (662 - cy) ** 2)
    f = [(594, 256), (1035, 256), (1035, 351), (689, 351), (689, 588)]
    f += arc(ro, ang(xo1, 588), ang(xo2, 662), 4)
    f += [(689, 662), (689, 835), (594, 938)]
    # anneau : grand arc exterieur dans le sens horaire (ecran), puis arc interieur en retour
    o = arc(ro, ang(xo1, 588), ang(xo2, 662) + 2 * math.pi, n_arc)
    o += arc(ri, ang(xi2, 662) + 2 * math.pi, ang(xi1, 588), n_arc)
    return [f, o]


LOGO_BOX = (594.0, 256.0, 1338.0, 1024.0)  # x0, y0, x1, y1 du monogramme


def fo_alpha(h, w, ss=2):
    """Masque anti-aliase du monogramme inscrit dans une image h x w (ligne 0 = bas, convention Blender)."""
    x0, y0, x1, y1 = LOGO_BOX
    k = min(w / (x1 - x0), h / (y1 - y0))
    ox, oy = (w - (x1 - x0) * k) / 2, (h - (y1 - y0) * k) / 2
    acc = np.zeros((h, w))
    for sy in range(ss):
        for sx in range(ss):
            px = (np.arange(w) + (sx + 0.5) / ss - ox) / k + x0
            py = y1 - (np.arange(h) + (sy + 0.5) / ss - oy) / k  # bas de l'image = bas du logo
            X, Y = np.meshgrid(px, py)
            inside = np.zeros(X.shape, dtype=bool)
            for poly in fo_outlines():
                n = len(poly)
                for i in range(n):
                    (xa, ya), (xb, yb) = poly[i], poly[(i + 1) % n]
                    if ya == yb:
                        continue
                    inside ^= ((ya > Y) != (yb > Y)) & (X < (xb - xa) * (Y - ya) / (yb - ya) + xa)
            acc += inside
    return acc / (ss * ss)


def resize(arr, h, w):
    """Redimensionnement bilineaire d'une image (h, w, c)."""
    H, W = arr.shape[:2]
    ys = np.clip((np.arange(h) + 0.5) * H / h - 0.5, 0, H - 1)
    xs = np.clip((np.arange(w) + 0.5) * W / w - 0.5, 0, W - 1)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, H - 1), np.minimum(x0 + 1, W - 1)
    ty, tx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    a, b = arr[y0][:, x0], arr[y0][:, x1]
    c, d = arr[y1][:, x0], arr[y1][:, x1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


_LOCKUP = None


def brand_lockup():
    """Lockup horizontal FootOFF Media (fond noir), extrait du logo officiel assets-src/brand/."""
    global _LOCKUP
    if _LOCKUP is None:
        img = bpy.data.images.load(os.path.join(find_repo(), "assets-src", "brand", "footoff-media-lockup-dark.jpg"))
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        px = px.reshape(h, w, 4)[..., :3]
        # zone du lockup dans l'image 1376 x 768 (de haut en bas : x 255-1105, y 235-505)
        _LOCKUP = px[h - 505:h - 235, 255:1105].copy()
    return _LOCKUP


def paste(dst, src, cx, cy, height):
    sh, sw = src.shape[:2]
    w = int(round(sw * height / sh))
    y0, x0 = int(cy - height / 2), int(cx - w / 2)
    dst[y0:y0 + height, x0:x0 + w] = resize(src, height, w)


def gold_gradient(h, w):
    t = np.linspace(0, 1, w)[None, :] * 0.7 + np.linspace(0, 1, h)[:, None] * 0.3
    return mix(GOLD_DEEP, GOLD_LIGHT, t)


# =============================================================== textures procedurales

def value_noise(h, w, cy, cx):
    g = RNG.random((cy, cx))
    ys = (np.arange(h) + 0.5) / h * cy
    xs = (np.arange(w) + 0.5) / w * cx
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    ty, tx = ys - y0, xs - x0
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    y1, x1 = (y0 + 1) % cy, (x0 + 1) % cx
    y0, x0 = y0 % cy, x0 % cx
    a, b = g[np.ix_(y0, x0)], g[np.ix_(y0, x1)]
    c, d = g[np.ix_(y1, x0)], g[np.ix_(y1, x1)]
    tx, ty = tx[None, :], ty[:, None]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def fbm(h, w, cells, octaves=4):
    out, amp, total = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        cx = cells * 2 ** o
        cy = max(1, round(cx * h / w))
        out += amp * value_noise(h, w, cy, cx)
        total += amp
        amp *= 0.5
    return out / total


def to_image(name, rgb, non_color=False):
    h, w = rgb.shape[:2]
    # données (normales) : espace « Non-Color » choisi dès la création. Le changer après coup régénère l'image et
    # efface ses pixels (cartes de relief exportées noires).
    img = bpy.data.images.new(name, w, h, alpha=False, is_data=non_color)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def seg_dist(X, Y, ax, ay, bx, by):
    px, py = bx - ax, by - ay
    t = np.clip(((X - ax) * px + (Y - ay) * py) / (px * px + py * py), 0, 1)
    return np.hypot(X - ax - t * px, Y - ay - t * py)


def tex_concrete():
    S = 512
    n = fbm(S, S, 4, 5)
    streaks = value_noise(S, S, 2, 48)  # coulures verticales
    v = 0.58 + 0.10 * (n - 0.5) + 0.05 * (streaks - 0.5)
    return to_image("concrete", np.stack([v * 0.99, v * 0.98, v * 0.95], -1))


def tex_seats(name, color):
    """Un siege (0,5 x 0,5 m) : dossier arrondi sur fond sombre."""
    S = 256
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    c, half, r = np.array([0.5, 0.54]), np.array([0.40, 0.38]), 0.12
    qx = np.abs(u - c[0]) - half[0] + r
    qy = np.abs(v - c[1]) - half[1] + r
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    a = np.clip(-d * S + 0.5, 0, 1)
    seat = np.asarray(color) * (0.78 + 0.35 * v)[..., None]
    rgb = mix((0.11, 0.11, 0.12), seat, a)
    return to_image(name, rgb)


def tex_roof_normal():
    """Bac acier a joints debout : une nervure par metre (normal map)."""
    S = 256
    u = (np.arange(S) + 0.5) / S
    hgt = np.exp(-(((u - 0.5) / 0.025) ** 2)) + 0.15 * np.sin(u * 2 * np.pi * 4)
    dh = np.gradient(hgt) * S * 0.04
    nx = -dh / np.sqrt(dh * dh + 1)
    nz = 1 / np.sqrt(dh * dh + 1)
    rgb = np.zeros((S, S, 3))
    rgb[..., 0] = nx[None, :] * 0.5 + 0.5
    rgb[..., 1] = 0.5
    rgb[..., 2] = nz[None, :] * 0.5 + 0.5
    return to_image("roof_normal", rgb, non_color=True)


def tex_brick():
    S = 512  # 1 x 1 m : 15 rangs, briques de 25 cm
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    row = np.floor(v * 15)
    uu = u * 4 + (row % 2) * 0.5
    col_idx = np.floor(uu) % 4
    rnd = RNG.random((15, 4))
    tint = rnd[row.astype(int) % 15, col_idx.astype(int)]
    mortar = (np.abs((v * 15) % 1 - 0.5) > 0.42) | (np.abs(uu % 1 - 0.5) > 0.47)
    base = np.stack([0.50 + 0.10 * tint, 0.24 + 0.05 * tint, 0.17 + 0.04 * tint], -1)
    base *= (0.9 + 0.2 * fbm(S, S, 16))[..., None]
    rgb = np.where(mortar[..., None], np.array([0.62, 0.60, 0.56]), base)
    return to_image("brick", rgb)


def tex_facade():
    S = 512  # 4 x 4 m : 2 x 2 panneaux vitres, meneaux alu, allege
    u, v = np.meshgrid((np.arange(S) + 0.5) / S, (np.arange(S) + 0.5) / S)
    glass = mix((0.17, 0.23, 0.29), (0.36, 0.46, 0.53), v[..., None] ** 1.5 * 0.8)
    frame = (np.abs((u * 2) % 1 - 0.5) > 0.47) | (np.abs((v * 2) % 1 - 0.5) > 0.47)
    spandrel = (v % 0.5) < 0.09
    rgb = np.where(frame[..., None], np.array([0.72, 0.73, 0.75]), glass)
    rgb = np.where(spandrel[..., None], np.array([0.42, 0.44, 0.47]), rgb)
    return to_image("facade", rgb)


def tex_boards():
    """Panneaux de bord de terrain, 24 x 0,9 m : 4 panneaux de 6 m aux couleurs FootOFF Media."""
    W, H = 2048, 80  # ~85 px/m dans les deux sens : pas de deformation
    pw = W // 4
    rgb = np.zeros((H, W, 3))
    mono = fo_alpha(64, 64)[..., None]
    for k in range(4):
        sub = rgb[:, k * pw:(k + 1) * pw]
        if k % 2 == 0:  # noir + lockup FootOFF Media
            sub[:] = INK
            paste(sub, brand_lockup(), pw / 2, H / 2, 58)
        else:
            sub[:] = gold_gradient(H, pw) if k == 1 else np.asarray((0.07, 0.07, 0.075))
            ink = np.asarray(INK) if k == 1 else gold_gradient(64, 64)  # monogramme noir sur or, or sur anthracite
            cell = sub[8:72, pw // 2 - 32:pw // 2 + 32]
            cell[:] = cell * (1 - mono) + ink * mono
    return to_image("boards", rgb)


def tex_screen():
    """Ecran geant 16:9 : lockup FootOFF Media sur noir, liseré or."""
    W, H = 1024, 576
    rgb = np.ones((H, W, 3)) * np.asarray(INK)
    paste(rgb, brand_lockup(), W / 2, H / 2, 250)
    rgb[40:44, 80:W - 80] = GOLD
    return to_image("screen", rgb)


# =============================================================== materiaux

def srgb_to_linear(c):
    """Les couleurs Blender (et baseColorFactor glTF) sont lineaires ; la charte est en sRGB."""
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name, color=(0.8, 0.8, 0.8), rough=0.7, metal=0.0, image=None, normal=None,
             normal_strength=1.0, emission=None, strength=1.0, emission_image=False, emission_map=None):
    """Couleurs exprimees en sRGB (comme la charte), converties en lineaire pour Blender.
    emission_map : image distincte pour l'emission (ex. fenetres allumees au hasard la nuit)."""
    m = bpy.data.materials.new(name)
    m.use_backface_culling = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb_to_linear(color), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if emission_image:  # l'image s'allume la nuit (ecrans, panneaux LED)
            nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = strength
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emission:
        b.inputs["Emission Color"].default_value = (*srgb_to_linear(emission), 1)
        b.inputs["Emission Strength"].default_value = strength
    if emission_map:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = emission_map
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = strength
    return m


OBJECT_NAMES = {
    "emissive_light": "emissive_floodlights",
    "crowd": "crowd_seats",
    "emissive_led": "emissive_led",
    "emissive_boards": "emissive_boards",
    "emissive_screen": "emissive_screen",
    "emissive_windows": "emissive_windows",
}


# =============================================================== geometrie

def newell(pts):
    n = Vector((0, 0, 0))
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


class Builder:
    """Accumule la geometrie par materiau (un objet, donc un draw call, par materiau)."""

    def __init__(self, mats, tiles=None):
        self.mats = mats
        self.tiles = tiles or {}  # echelle de texture imposee par materiau (matieres photo : tuile en metres)
        self.bms = {}
        self.spots = []  # reperes tree_spot_* : (position, proprietes)

    def bm(self, mat):
        if mat not in self.bms:
            bm = bmesh.new()
            bm.loops.layers.uv.new("UVMap")
            self.bms[mat] = bm
        return self.bms[mat]

    def piece(self, mat, verts, faces, M=I4, tile=(1.0, 1.0), origin=(0, 0, 0), smooth=()):
        """UV calculees en coordonnees locales (avant transformation) : textures repetees a l'echelle reelle."""
        bm = self.bm(mat)
        uvl = bm.loops.layers.uv.active
        tile = self.tiles.get(mat, tile)
        local = [Vector(v) for v in verts]
        vs = [bm.verts.new(M @ v) for v in local]
        o = Vector(origin)
        for fi, f in enumerate(faces):
            try:
                face = bm.faces.new([vs[i] for i in f])
            except ValueError:
                continue
            n = newell([local[i] for i in f])
            ax = max(range(3), key=lambda k: abs(n[k]))
            for loop, idx in zip(face.loops, f):
                p = local[idx] - o
                uv = (p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y)
                loop[uvl].uv = (uv[0] / tile[0], uv[1] / tile[1])
            face.smooth = fi in smooth

    def hexa(self, mat, c, M=I4, tile=(1, 1), origin=(0, 0, 0), skip=()):
        """8 coins : 4 en bas puis 4 en haut, meme ordre. Orientation corrigee automatiquement."""
        c = [Vector(p) for p in c]
        area = sum(c[i].x * c[(i + 1) % 4].y - c[(i + 1) % 4].x * c[i].y for i in range(4))
        if area < 0:
            c = [c[0], c[3], c[2], c[1], c[4], c[7], c[6], c[5]]
            skip = {{2: 5, 5: 2, 3: 4, 4: 3}.get(s, s) for s in skip}  # faces laterales echangees par le miroir
        faces = [f for i, f in enumerate(BOX_FACES) if i not in skip]
        self.piece(mat, c, faces, M, tile, origin)

    def box(self, mat, a, b, M=I4, tile=(1, 1), origin=(0, 0, 0)):
        (x0, y0, z0), (x1, y1, z1) = a, b
        self.hexa(mat, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], M, tile, origin)

    def cyl(self, mat, p0, p1, r0, r1=None, segs=10, M=I4, tile=(1.0, 1.0)):
        r1 = r0 if r1 is None else r1
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        R = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        T = M @ Matrix.Translation(p0) @ R
        h = d.length
        verts = []
        for z, r in ((0, r0), (h, r1)):
            for i in range(segs):
                a = 2 * math.pi * i / segs
                verts.append((r * math.cos(a), r * math.sin(a), z))
        faces = [(i, (i + 1) % segs, segs + (i + 1) % segs, segs + i) for i in range(segs)]
        side = set(range(segs))
        faces += [tuple(range(segs, 2 * segs)), tuple(reversed(range(segs)))]
        self.piece(mat, verts, faces, T, tile=tile, smooth=side)

    def sector(self, mat, center, r0, r1, a0, a1, z0, z1, segs=12, tile=(1, 1), origin=None):
        """Secteur annulaire extrude (gradin courbe)."""
        cx, cy = center
        r0 = max(r0, 0.02)
        for j in range(segs):
            t0, t1 = a0 + (a1 - a0) * j / segs, a0 + (a1 - a0) * (j + 1) / segs
            p = [(cx + r0 * math.cos(t0), cy + r0 * math.sin(t0)), (cx + r1 * math.cos(t0), cy + r1 * math.sin(t0)),
                 (cx + r1 * math.cos(t1), cy + r1 * math.sin(t1)), (cx + r0 * math.cos(t1), cy + r0 * math.sin(t1))]
            skip = set()
            if j > 0:
                skip.add(2)  # face radiale interne
            if j < segs - 1:
                skip.add(4)
            self.hexa(mat, [(x, y, z0) for x, y in p] + [(x, y, z1) for x, y in p], tile=tile,
                      origin=origin or (cx, cy, 0), skip=skip)

    def strip(self, mat, pairs, z_in, z_out, thick, tile=(1, 1)):
        """Bande continue entre une polyligne interieure et exterieure (toiture en anneau)."""
        for (i0, o0), (i1, o1) in zip(pairs, pairs[1:]):
            bot = [(*i0, z_in - thick), (*o0, z_out - thick), (*o1, z_out - thick), (*i1, z_in - thick)]
            top = [(*i0, z_in), (*o0, z_out), (*o1, z_out), (*i1, z_in)]
            self.hexa(mat, bot + top, tile=tile)

    def finalize(self, coll, suffix):
        for mat, bm in self.bms.items():
            me = bpy.data.meshes.new(f"{mat}_{suffix}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(self.mats[mat])
            ob = bpy.data.objects.new(f"{OBJECT_NAMES.get(mat, mat)}_{suffix}", me)
            coll.objects.link(ob)
        self.bms = {}
        for i, (loc, props) in enumerate(self.spots):  # empties exportes (extras glTF : userData dans le jeu)
            e = bpy.data.objects.new(f"tree_spot_{suffix}_{i:02d}", None)
            e.location = loc
            for k, v in props.items():
                e[k] = v
            coll.objects.link(e)
        self.spots = []


def fo_logo(B, mat, M, height, depth=0.2):
    """Monogramme FO en relief. Repere local : face avant dans le plan y = 0 (tournee vers -Y),
    lettre debout selon Z, origine au milieu du bas du logo, epaisseur vers +Y."""
    x0, y0, x1, y1 = LOGO_BOX
    k = height / (y1 - y0)
    xc = (x0 + x1) / 2
    for poly in fo_outlines(36):
        pts = [((x - xc) * k, (y1 - y) * k) for x, y in poly]
        n = len(pts)
        area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
        if area < 0:
            pts.reverse()  # sens trigo dans (X, Z) => normale de la face avant vers -Y
        verts = [(x, 0.0, z) for x, z in pts] + [(x, depth, z) for x, z in pts]
        faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
        faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
        B.piece(mat, verts, faces, M)


def roof_logo(B, mat, y_bottom, z_bottom, slope, height):
    """Grand monogramme a plat sur une toiture inclinee de `slope` (lisible depuis la camera du jeu),
    haut du logo vers le nord."""
    M = (Matrix.Translation((0, y_bottom, z_bottom + 0.06)) @ Matrix.Rotation(slope, 4, "X")
         @ Matrix.Rotation(-math.pi / 2, 4, "X"))
    fo_logo(B, mat, M, height, depth=0.15)


def rot(angle, tx=0.0, ty=0.0):
    return Matrix.Translation((tx, ty, 0)) @ Matrix.Rotation(angle, 4, "Z")


# Orientation des tribunes : repere local x = longueur, y = vers l'exterieur (s'eloigne du terrain)
NORTH, SOUTH, EAST, WEST = rot(0), rot(math.pi), rot(-math.pi / 2), rot(math.pi / 2)



# =============================================================== equipements generiques

def fence(B, hx, hy, step=3.0):
    """Main courante : poteaux + deux lisses."""
    for (ax, ay, bx, by) in [(-hx, -hy, hx, -hy), (-hx, hy, hx, hy), (-hx, -hy, -hx, hy), (hx, -hy, hx, hy)]:
        length = math.hypot(bx - ax, by - ay)
        n = int(length // step)
        for i in range(n + 1):
            t = i / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            B.cyl("steel", (x, y, 0), (x, y, 1.1), 0.04, segs=6)
        for z in (1.05, 0.55):
            B.cyl("white", (ax, ay, z), (bx, by, z), 0.035, segs=6)


def boards(B, hx, hy, mat="boards", h=0.9):
    t = 0.12
    B.box(mat, (-hx, -hy - t, 0), (hx, -hy, h), tile=(24, h))
    B.box(mat, (-hx, hy, 0), (hx, hy + t, h), tile=(24, h))
    B.box(mat, (-hx - t, -hy, 0), (-hx, hy, h), tile=(24, h))
    B.box(mat, (hx, -hy, 0), (hx + t, hy, h), tile=(24, h))


def mast(B, coll, x, y, h, cols, rows, name, lattice=False, target=(0, 0, 0)):
    """Mat d'eclairage oriente vers le terrain + empty light_* (position du projecteur)."""
    if lattice:
        base, top = 1.6, 0.7
        legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for sx, sy in legs:
            B.cyl("steel", (x + sx * base, y + sy * base, 0), (x + sx * top, y + sy * top, h), 0.12, segs=6)
        steps = int(h // 4)
        for k in range(1, steps + 1):
            z = h * k / steps
            r = base + (top - base) * k / steps
            zp = h * (k - 1) / steps
            rp = base + (top - base) * (k - 1) / steps
            for i in range(4):
                (ax, ay), (bx, by) = legs[i], legs[(i + 1) % 4]
                B.cyl("steel", (x + ax * r, y + ay * r, z), (x + bx * r, y + by * r, z), 0.05, segs=4)
                B.cyl("steel", (x + ax * rp, y + ay * rp, zp), (x + bx * r, y + by * r, z), 0.04, segs=4)
    else:
        B.cyl("steel", (x, y, 0), (x, y, h), 0.32 if h > 20 else 0.2, 0.18 if h > 20 else 0.12, segs=10)
    dx, dy = target[0] - x, target[1] - y
    yaw = math.atan2(dx, -dy)
    tilt = math.radians(28)
    M = Matrix.Translation((x, y, h)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
    lw, lh = 0.9, 0.7
    W, H = cols * lw, rows * lh
    B.box("steel", (-W / 2 - 0.2, 0.05, -0.3), (W / 2 + 0.2, 0.35, H + 0.2), M)
    for i in range(cols):
        for j in range(rows):
            x0 = -W / 2 + i * lw + 0.08
            z0 = j * lh + 0.06
            B.box("emissive_light", (x0, -0.25, z0), (x0 + lw - 0.16, 0.05, z0 + lh - 0.12), M)
    e = bpy.data.objects.new(name, None)
    e.location = M @ Vector((0, -0.5, H / 2))
    direction = Vector(target) - e.location
    e.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    e.empty_display_size = 2
    coll.objects.link(e)
