"""Trophees du parvis (allee d'honneur) : un trophee par competition, ses socles et leurs plaques.

    blender -b --factory-startup -P tools/blender/models/build_trophies.py
    -> assets-src/blend/trophies.blend (collection prop_trophies)
    puis : blender assets-src/blend/trophies.blend -b -P tools/blender/footoff_export.py -- --only prop_trophies
           npm run models -- trophies

Repliques monumentales (4 a 11 m), dessins originaux. Chaque piece est un objet nomme trophy_<id>__<materiau>
(prefixe special : le pipeline ne fusionne pas les trophees entre eux) ; tout est modele a l'origine, base a z = 0,
face avant vers le sud (-Y). Le jeu place socles et trophees sur le parvis, seulement pour les competitions gagnees.

  league1  titre de Departementale  coupe du district : gobelet d'argent, levre doree, petites anses
  league2  titre de Regionale       trophee de ligue : amphore d'argent a longues anses, bagues dorees
  league3  titre de Nationale       plateau national : grand plat dore sur pied, centre argent
  league4  titre d'Elite            trophee Elite : quatre rubans dores tors qui portent un ballon d'or
  cup      Coupe nationale          coupe doree couverte, grandes anses en C, fleuron
  c1       Coupe d'Europe           grande coupe d'argent, anses-ailes dorees, bandeau d'email bleu a 12 etoiles
  plinth / plaque                   socle carre en granit (plaque de bronze au sud, texte ecrit par le jeu)
  plinthc1 / plaquec1 / uplights    socle rond de la Coupe d'Europe, plaque cintree, 8 projecteurs au sol
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import fbm, find_repo, material, newell, to_image  # noqa: E402

SEGS = 48
RNG = np.random.default_rng(11)


# ---------------------------------------------------------------- outils de forme

def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def spline(pts, steps=4):
    """Courbe lisse passant par les points (Catmull-Rom). Un point (r, z, 1) est un angle vif : la courbe s'y casse."""
    segs, cur = [], [pts[0]]
    for p in pts[1:]:
        cur.append(p)
        if len(p) > 2 and p[2]:
            segs.append(cur)
            cur = [p]
    if len(cur) > 1:
        segs.append(cur)
    out = []
    for s in segs:
        P = [Vector(p[:2]) for p in s]
        n = len(P)
        for i in range(n - 1):
            p0 = P[i - 1] if i > 0 else P[i] * 2 - P[i + 1]
            p3 = P[i + 2] if i + 2 < n else P[i + 1] * 2 - P[i]
            for k in range(steps if n > 2 else 1):
                out.append(catmull(p0, P[i], P[i + 1], p3, k / (steps if n > 2 else 1)))
        if s is segs[-1]:
            out.append(P[-1])
    res = []
    for v in out:
        r = 0.0 if abs(v.x) < 1e-4 else max(v.x, 0.0)
        if res and abs(res[-1][0] - r) < 1e-5 and abs(res[-1][1] - v.y) < 1e-5:
            continue
        res.append((r, v.y))
    return res


def path3(pts, steps=6):
    """Chemin 3D lisse (Catmull-Rom) pour les anses et les rubans."""
    P = [Vector(p) for p in pts]
    n = len(P)
    out = []
    for i in range(n - 1):
        p0 = P[i - 1] if i > 0 else P[i] * 2 - P[i + 1]
        p3 = P[i + 2] if i + 2 < n else P[i + 1] * 2 - P[i]
        for k in range(steps):
            out.append(catmull(p0, P[i], P[i + 1], p3, k / steps))
    out.append(P[-1])
    return out


class Parts:
    """Geometrie accumulee par (trophee, materiau) : un objet trophy_<id>__<materiau> par couple."""

    def __init__(self, mats):
        self.mats = mats
        self.bms = {}

    def bm(self, tid, mat):
        key = (tid, mat)
        if key not in self.bms:
            bm = bmesh.new()
            bm.loops.layers.uv.new("UVMap")
            self.bms[key] = bm
        return self.bms[key]

    def lathe(self, tid, mat, profile, segs=SEGS, M=Matrix.Identity(4), steps=3):
        """Surface de revolution autour de Z. Profil (r, z) parcouru du bas vers le haut par l'exterieur
        (puis l'interieur pour une coupe) : faces orientees vers l'exterieur."""
        bm = self.bm(tid, mat)
        rings = []
        for r, z in spline(profile, steps):
            if r < 1e-6:
                rings.append([bm.verts.new(M @ Vector((0, 0, z)))])
            else:
                rings.append([bm.verts.new(M @ Vector((r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z)))
                              for k in range(segs)])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            for k in range(segs):
                k1 = (k + 1) % segs
                if len(a) == 1:
                    f = (a[0], b[k1], b[k])
                elif len(b) == 1:
                    f = (a[k], a[k1], b[0])
                else:
                    f = (a[k], a[k1], b[k1], b[k])
                try:
                    bm.faces.new(f)
                except ValueError:
                    pass

    def tube(self, tid, mat, pts, shape, taper=None, twist=0.0, up=(0, 1, 0), cap=True):
        """Profil 2D `shape` [(u, v)] balaye le long du chemin `pts` (repere transporte), echelle `taper(t)`,
        torsion totale `twist` (radians). u suit la normale N, v la binormale B (T x N)."""
        bm = self.bm(tid, mat)
        P = [Vector(p) for p in pts]
        n = len(P)
        T = [(P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized() for i in range(n)]
        N = Vector(up).cross(T[0])
        if N.length < 1e-6:
            N = Vector((1, 0, 0)).cross(T[0])
        N.normalize()
        rings = []
        for i in range(n):
            if i:
                axis = T[i - 1].cross(T[i])
                if axis.length > 1e-8:
                    ang = T[i - 1].angle(T[i])
                    N = (Matrix.Rotation(ang, 3, axis.normalized()) @ N).normalized()
            Bv = T[i].cross(N).normalized()
            t = i / (n - 1)
            s = taper(t) if taper else 1.0
            a = twist * t
            Nr, Br = N * math.cos(a) + Bv * math.sin(a), -N * math.sin(a) + Bv * math.cos(a)
            rings.append([bm.verts.new(P[i] + Nr * (u * s) + Br * (v * s)) for u, v in shape])
        m = len(shape)
        for a, b in zip(rings, rings[1:]):
            for k in range(m):
                k1 = (k + 1) % m
                bm.faces.new((a[k], a[k1], b[k1], b[k]))
        if cap:
            for ring, start in ((rings[0], True), (rings[-1], False)):
                c = bm.verts.new(sum((v.co for v in ring), Vector()) / m)
                for k in range(m):
                    k1 = (k + 1) % m
                    bm.faces.new((c, ring[k1], ring[k]) if start else (c, ring[k], ring[k1]))

    def piece(self, tid, mat, verts, faces, M=Matrix.Identity(4), tile=(1.0, 1.0), uvs=None):
        """Faces planes ; UV projetees a l'echelle reelle (ou fournies)."""
        bm = self.bm(tid, mat)
        uvl = bm.loops.layers.uv.active
        local = [Vector(v) for v in verts]
        vs = [bm.verts.new(M @ v) for v in local]
        for f in faces:
            try:
                face = bm.faces.new([vs[i] for i in f])
            except ValueError:
                continue
            nrm = newell([local[i] for i in f])
            ax = max(range(3), key=lambda k: abs(nrm[k]))
            for loop, idx in zip(face.loops, f):
                p = local[idx]
                uv = uvs[idx] if uvs else ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
                loop[uvl].uv = (uv[0] / tile[0], uv[1] / tile[1]) if not uvs else uv

    def box(self, tid, mat, a, b, tile=(1.0, 1.0), M=Matrix.Identity(4)):
        (x0, y0, z0), (x1, y1, z1) = a, b
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.piece(tid, mat, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M, tile)

    def frustum(self, tid, mat, w0, d0, w1, d1, z0, z1, tile=(1.0, 1.0)):
        """Pave a section rectangulaire qui s'affine vers le haut (corps de socle)."""
        v = [(-w0, -d0, z0), (w0, -d0, z0), (w0, d0, z0), (-w0, d0, z0), (-w1, -d1, z1), (w1, -d1, z1), (w1, d1, z1), (-w1, d1, z1)]
        self.piece(tid, mat, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], tile=tile)

    def star(self, tid, mat, M, r_out, r_in, depth):
        """Etoile a 5 branches en relief ; repere local : face avant vers +Z, pointe vers +Y."""
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            r = r_out if k % 2 == 0 else r_in
            pts.append((r * math.cos(a), r * math.sin(a)))
        v = [(x, y, 0.0) for x, y in pts] + [(x, y, depth) for x, y in pts] + [(0, 0, depth * 1.6)]
        faces = [(i, (i + 1) % 10, 10 + (i + 1) % 10, 10 + i) for i in range(10)]
        faces += [(10 + i, 10 + (i + 1) % 10, 20) for i in range(10)]  # pointe de diamant (facettes)
        faces += [tuple(reversed(range(10)))]
        self.piece(tid, mat, v, faces, M)

    def finalize(self, coll, smooth_angle=38):
        for (tid, mat), bm in self.bms.items():
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            me = bpy.data.meshes.new(f"trophy_{tid}__{mat}")
            bm.to_mesh(me)
            bm.free()
            for p in me.polygons:
                p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
            me.materials.append(self.mats[mat])
            ob = bpy.data.objects.new(f"trophy_{tid}__{mat}", me)
            coll.objects.link(ob)
        self.bms = {}


def ellipse(a, b, n=14):
    return [(a * math.cos(2 * math.pi * k / n), b * math.sin(2 * math.pi * k / n)) for k in range(n)]


def rect(w, h, bevel=0.25):
    """Section rectangulaire a coins abattus (rubans)."""
    c = min(w, h) * bevel
    x, y = w / 2, h / 2
    return [(x, y - c), (x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c), (-x + c, -y), (x - c, -y), (x, -y + c)]


def mirror_x(pts):
    return [(-x, y, z) for x, y, z in pts]


# ---------------------------------------------------------------- materiaux

def tex_granite():
    """Granit noir moucheté (tuile 1 x 1 m) : fond sombre, grains clairs et feldspath gris."""
    S = 512
    base = 0.07 + 0.03 * fbm(S, S, 8, 4)
    spec = RNG.random((S, S))
    grains = (spec > 0.985).astype(float) * 0.22 + (spec > 0.94).astype(float) * 0.06
    v = np.clip(base + grains * (0.6 + 0.4 * fbm(S, S, 64, 2)), 0, 1)
    return to_image("trophy_granite", np.stack([v * 1.0, v * 0.99, v * 1.03], -1))


def make_materials():
    return {
        # or et argent polis (valeurs physiques), laque noire, email bleu, granit, bronze de la plaque
        "gold": material("trophy_gold", (1.0, 0.85, 0.55), rough=0.2, metal=1.0),
        "silver": material("trophy_silver", (0.97, 0.97, 0.96), rough=0.14, metal=1.0),
        "black": material("trophy_black", (0.025, 0.025, 0.03), rough=0.22),
        "enamel": material("trophy_enamel", (0.05, 0.12, 0.38), rough=0.1),
        "granite": material("trophy_granite", image=tex_granite(), rough=0.42),
        "bronze": material("trophy_bronze", (0.42, 0.3, 0.17), rough=0.4, metal=0.9),
        "plaque": material("trophy_plaque", (0.55, 0.42, 0.25), rough=0.35, metal=0.85),
        "uplight": material("trophy_uplight", (1.0, 0.86, 0.6), emission=(1.0, 0.82, 0.52), strength=6.0),
    }


# ---------------------------------------------------------------- trophees

def league1(P):
    """Coupe du district (Departementale) : gobelet d'argent sur socle rond noir, levre doree, petites anses."""
    t = "league1"
    P.lathe(t, "black", [(0, 0), (0.95, 0, 1), (0.95, 0.32, 1), (0.82, 0.4, 1), (0, 0.4)])
    P.lathe(t, "gold", [(0.84, 0.3), (0.86, 0.33, 1), (0.86, 0.37, 1), (0.84, 0.4)], steps=1)
    P.lathe(t, "silver", [
        (0, 0.4), (0.72, 0.4, 1), (0.72, 0.47), (0.6, 0.56), (0.36, 0.72), (0.2, 0.95), (0.18, 1.35), (0.24, 1.48),
        (0.33, 1.56), (0.24, 1.66), (0.2, 1.74), (0.36, 1.86), (0.62, 2.05), (0.86, 2.35), (0.98, 2.75), (1.02, 3.2),
        (1.04, 3.52, 1), (0.98, 3.54, 1), (0.95, 3.25), (0.9, 2.8), (0.72, 2.35), (0.4, 2.08), (0, 2.02),
    ])
    P.lathe(t, "gold", [(1.03, 3.48), (1.08, 3.56, 1), (1.1, 3.68, 1), (1.06, 3.72), (0.98, 3.7, 1), (0.96, 3.56)], steps=2)
    for s in (1, -1):
        pts = [(0.92, 0, 3.32), (1.25, 0, 3.36), (1.48, 0, 3.18), (1.5, 0, 2.86), (1.32, 0, 2.62), (0.95, 0, 2.5)]
        P.tube(t, "silver", path3(pts if s > 0 else mirror_x(pts)), ellipse(0.075, 0.075, 12), taper=lambda u: 0.75 + 0.35 * math.sin(math.pi * u))


def league2(P):
    """Trophee de ligue (Regionale) : amphore d'argent elancee, longues anses, bagues dorees, socle carre noir."""
    t = "league2"
    P.box(t, "black", (-0.62, -0.62, 0.0), (0.62, 0.62, 0.36))
    P.box(t, "gold", (-0.64, -0.64, 0.30), (0.64, 0.64, 0.34))
    P.lathe(t, "silver", [
        (0, 0.36), (0.5, 0.36, 1), (0.5, 0.44), (0.4, 0.5), (0.24, 0.66), (0.22, 0.86), (0.3, 0.98), (0.55, 1.18),
        (0.82, 1.5), (0.96, 1.95), (0.95, 2.45), (0.82, 2.9), (0.58, 3.22), (0.38, 3.46), (0.3, 3.72), (0.3, 4.02),
        (0.4, 4.24), (0.54, 4.44, 1), (0.47, 4.47, 1), (0.36, 4.26), (0.24, 4.0), (0, 3.92),
    ])
    P.lathe(t, "gold", [(0.95, 1.86), (0.99, 1.9, 1), (0.99, 2.02, 1), (0.95, 2.06)], steps=1)
    P.lathe(t, "gold", [(0.3, 3.86), (0.34, 3.88, 1), (0.34, 3.98, 1), (0.3, 4.0)], steps=1)
    P.lathe(t, "gold", [(0.53, 4.4), (0.58, 4.44, 1), (0.56, 4.52, 1), (0.47, 4.5)], steps=1)
    for s in (1, -1):
        pts = [(0.8, 0, 2.82), (1.12, 0, 3.05), (1.2, 0, 3.5), (1.02, 0, 3.98), (0.7, 0, 4.22), (0.42, 0, 4.12), (0.3, 0, 3.95)]
        P.tube(t, "silver", path3(pts if s > 0 else mirror_x(pts)), ellipse(0.065, 0.085, 12), taper=lambda u: 0.8 + 0.3 * math.sin(math.pi * u))


def league3(P):
    """Plateau national (Nationale) : grand plat dore, centre d'argent, sur un pied dore a deux bras, socle noir."""
    t = "league3"
    P.box(t, "black", (-1.1, -0.55, 0.0), (1.1, 0.55, 0.38))
    P.box(t, "gold", (-1.12, -0.57, 0.31), (1.12, 0.57, 0.35))
    # plat : profil autour de son axe (local Z), face avant en +Z, tourne vers le sud et un peu vers le ciel
    zc = 3.05
    M = Matrix.Translation((0, 0.12, zc)) @ Matrix.Rotation(math.radians(80), 4, "X")
    P.lathe(t, "gold", [
        (0, -0.07), (1.62, -0.07, 1), (1.7, 0.0), (1.72, 0.12), (1.68, 0.19, 1), (1.6, 0.2), (1.5, 0.12, 1),
        (1.24, 0.09), (1.2, 0.12, 1), (1.16, 0.09, 1), (0.84, 0.07, 1),
    ], segs=72, M=M, steps=3)
    P.lathe(t, "silver", [(0.84, 0.07), (0.8, 0.09, 1), (0.76, 0.07, 1), (0.3, 0.05), (0, 0.045)], segs=72, M=M, steps=3)
    # pied : colonne puis deux bras qui tiennent le plat par ses bords
    P.lathe(t, "gold", [(0, 0.38), (0.42, 0.38, 1), (0.36, 0.5), (0.18, 0.66), (0.14, 1.2), (0.17, 1.5), (0.22, 1.62, 1), (0, 1.66)])
    for s in (1, -1):
        pts = [(0.0, 0.08, 1.55), (0.45, 0.1, 1.62), (1.25, 0.12, 1.85), (1.72, 0.12, 2.45), (1.78, 0.12, 2.98)]
        P.tube(t, "gold", path3(pts if s > 0 else mirror_x(pts)), ellipse(0.09, 0.12, 12), taper=lambda u: 1.1 - 0.35 * u)


def league4(P):
    """Trophee Elite : quatre rubans dores tors jaillis d'un socle noir, qui portent un ballon d'or puis s'ouvrent
    en couronne au-dessus."""
    t = "league4"
    P.lathe(t, "black", [(0, 0), (1.05, 0, 1), (1.05, 0.28, 1), (0.92, 0.36, 1), (0.92, 0.62, 1), (0.8, 0.68, 1), (0, 0.68)])
    P.lathe(t, "silver", [(0.93, 0.28), (0.97, 0.31, 1), (0.97, 0.36, 1), (0.93, 0.38)], steps=1)
    P.lathe(t, "gold", [(0, 0.68), (0.62, 0.68, 1), (0.6, 0.76), (0.48, 0.84, 1), (0, 0.86)])
    ball_z, R = 4.35, 0.78
    P.lathe(t, "gold", [(R * math.sin(a), ball_z - R * math.cos(a)) for a in np.linspace(0, math.pi, 25)], segs=56, steps=1)
    P.lathe(t, "gold", [(0, 0.86), (0.13, 0.86, 1), (0.1, 1.6), (0.12, 3.0), (0.2, 3.5, 1), (0, 3.62)])  # tige sous le ballon
    # rubans : (rayon, hauteur) - resserres au-dessus du socle, ouverts sous le ballon, qui l'enserrent a l'equateur
    # puis s'ouvrent en couronne
    prof = [(0.5, 0.8), (0.34, 1.6), (0.32, 2.5), (0.56, 3.3), (0.8, 3.95), (0.82, 4.4), (0.8, 4.95), (0.88, 5.45),
            (1.0, 5.8), (1.12, 6.0)]
    for k in range(4):
        a0 = math.pi / 4 + k * math.pi / 2
        pts = [(r * math.cos(a0 + 1.2 * i / (len(prof) - 1)), r * math.sin(a0 + 1.2 * i / (len(prof) - 1)), z)
               for i, (r, z) in enumerate(prof)]
        P.tube(t, "gold", path3(pts, 5), rect(0.075, 0.34), taper=lambda u: 0.7 + 0.45 * math.sin(math.pi * u), twist=0.9,
               up=(0, 0, 1))


def cup(P):
    """Coupe nationale : coupe doree couverte, grandes anses en C, pied a noeud, fleuron."""
    t = "cup"
    P.lathe(t, "black", [(0, 0), (1.22, 0, 1), (1.22, 0.3, 1), (1.1, 0.38, 1), (0, 0.38)])
    P.lathe(t, "gold", [
        (0, 0.38), (1.02, 0.38, 1), (1.02, 0.47), (0.86, 0.58), (0.56, 0.78), (0.33, 1.0), (0.3, 1.36), (0.46, 1.48),
        (0.5, 1.58), (0.46, 1.68), (0.3, 1.8), (0.34, 2.0), (0.72, 2.22), (1.12, 2.55), (1.34, 3.0), (1.38, 3.42),
        (1.3, 3.8), (1.24, 3.92, 1), (1.34, 3.96, 1), (1.34, 4.1, 1), (1.22, 4.14, 1), (1.04, 4.34), (0.62, 4.58),
        (0.3, 4.68), (0.2, 4.74), (0.27, 4.84), (0.3, 4.98), (0.22, 5.1), (0.1, 5.2), (0, 5.36),
    ])
    P.lathe(t, "silver", [(1.33, 3.0), (1.39, 3.04, 1), (1.39, 3.16, 1), (1.33, 3.2)], steps=1)
    for s in (1, -1):
        pts = [(1.26, 0, 3.7), (1.62, 0, 3.86), (2.02, 0, 3.72), (2.12, 0, 3.32), (1.94, 0, 2.94), (1.58, 0, 2.74), (1.25, 0, 2.66)]
        P.tube(t, "gold", path3(pts if s > 0 else mirror_x(pts)), ellipse(0.1, 0.1, 14), taper=lambda u: 0.8 + 0.3 * math.sin(math.pi * u))
        # volute au sommet de l'anse
        P.lathe(t, "gold", [(0, -0.12), (0.13, -0.06), (0.13, 0.06), (0, 0.12)], segs=20,
                M=Matrix.Translation((s * 1.66, 0, 3.86)) @ Matrix.Rotation(math.pi / 2, 4, "X"), steps=2)


def c1(P):
    """Coupe d'Europe : grande coupe d'argent sur pied a noeud, anses-ailes dorees qui depassent la levre,
    bandeau d'email bleu a 12 etoiles dorees, levre et bagues dorees."""
    t = "c1"
    P.lathe(t, "silver", [
        (0, 0), (2.1, 0, 1), (2.1, 0.16, 1), (1.98, 0.22, 1), (1.94, 0.46, 1), (1.78, 0.52), (1.46, 0.64), (1.08, 0.86),
        (0.66, 1.12), (0.5, 1.6), (0.56, 1.76), (0.8, 1.88), (0.84, 2.02), (0.8, 2.16), (0.56, 2.28), (0.48, 2.5),
        (0.47, 2.92), (0.62, 3.2), (1.02, 3.5), (1.62, 3.9), (2.2, 4.55), (2.56, 5.4), (2.72, 6.3),
    ], segs=64, steps=4)
    P.lathe(t, "enamel", [(2.72, 6.3), (2.75, 6.62), (2.72, 6.94)], segs=64, steps=4)
    P.lathe(t, "silver", [
        (2.72, 6.94), (2.66, 7.5), (2.5, 8.2), (2.3, 8.82), (2.33, 9.18), (2.52, 9.42), (2.6, 9.48, 1),
        (2.5, 9.5, 1), (2.22, 9.2), (2.14, 8.7), (2.28, 7.9), (2.22, 6.7), (1.68, 5.5), (0, 5.25),
    ], segs=64, steps=4)
    for z0, z1, r in ((6.26, 6.33, 2.74), (6.91, 6.98, 2.74)):  # filets d'or autour de l'email
        P.lathe(t, "gold", [(r - 0.04, z0), (r + 0.02, z0, 1), (r + 0.02, z1, 1), (r - 0.04, z1)], segs=64, steps=1)
    P.lathe(t, "gold", [(2.58, 9.4), (2.66, 9.46, 1), (2.66, 9.56, 1), (2.48, 9.58, 1), (2.48, 9.5)], segs=64, steps=1)  # levre
    P.lathe(t, "gold", [(2.09, 0.1), (2.13, 0.12, 1), (2.13, 0.2, 1), (2.0, 0.22)], steps=1)  # filet du pied
    P.lathe(t, "gold", [(0.8, 1.9), (0.86, 1.98, 1), (0.86, 2.06, 1), (0.8, 2.14)], steps=1)  # noeud
    for k in range(12):  # etoiles dorees sur l'email, tournees vers l'exterieur, pointe en haut
        a = 2 * math.pi * (k + 0.5) / 12 - math.pi / 2
        n = Vector((math.cos(a), math.sin(a), 0))
        tg = Vector((-math.sin(a), math.cos(a), 0))
        R = Matrix(((tg.x, 0, n.x), (tg.y, 0, n.y), (0, 1, 0))).to_4x4()
        P.star(t, "gold", Matrix.Translation(n * 2.74 + Vector((0, 0, 6.62))) @ R, 0.19, 0.075, 0.035)
    for s in (1, -1):  # anses-ailes : bandeau large vu de face, depassent la levre et redescendent s'y attacher
        pts = [(2.2, 0, 4.7), (2.95, 0, 4.95), (3.9, 0, 5.45), (4.42, 0, 6.35), (4.5, 0, 7.6), (4.32, 0, 8.85),
               (3.9, 0, 9.85), (3.32, 0, 10.38), (2.86, 0, 10.3), (2.62, 0, 9.9), (2.5, 0, 9.42)]
        P.tube(t, "gold", path3(pts if s > 0 else mirror_x(pts), 5), ellipse(0.3, 0.11, 16),
               taper=lambda u: 0.62 + 0.5 * math.sin(math.pi * min(1, u * 1.15)), up=(0, 1, 0))


def plinth(P):
    """Socle carre : granit noir moucheté legerement fuselé, filet d'or, tablette polie ; plaque de bronze au sud
    (le jeu y ecrit la competition et le nombre de victoires)."""
    t = "plinth"
    P.frustum(t, "granite", 1.5, 1.5, 1.42, 1.42, 0.0, 1.3, tile=(1.0, 1.0))
    P.box(t, "gold", (-1.44, -1.44, 1.18), (1.44, 1.44, 1.22))
    P.box(t, "black", (-1.6, -1.6, 1.3), (1.6, 1.6, 1.42))
    P.box(t, "granite", (-1.62, -1.62, 0.0), (1.62, 1.62, 0.12))
    # cadre dore de la plaque, en saillie sur la face sud (la face est inclinee : on suit son fruit)
    k = (1.5 - 1.42) / 1.3
    yf = lambda z: -(1.5 - k * z) - 0.012  # noqa: E731
    for (x0, z0, x1, z1) in ((-1.14, 0.3, 1.14, 0.34), (-1.14, 1.04, 1.14, 1.08), (-1.14, 0.3, -1.1, 1.08), (1.1, 0.3, 1.14, 1.08)):
        P.piece(t, "gold", [(x0, yf(z0), z0), (x1, yf(z0), z0), (x1, yf(z1), z1), (x0, yf(z1), z1),
                            (x0, yf(z0) + 0.03, z0), (x1, yf(z0) + 0.03, z0), (x1, yf(z1) + 0.03, z1), (x0, yf(z1) + 0.03, z1)],
                [(0, 1, 2, 3), (1, 5, 6, 2), (4, 0, 3, 7), (3, 2, 6, 7), (4, 5, 1, 0)])
    q = "plaque"
    P.piece(q, "plaque", [(-1.1, yf(0.34) + 0.004, 0.34), (1.1, yf(0.34) + 0.004, 0.34), (1.1, yf(1.04) + 0.004, 1.04),
                          (-1.1, yf(1.04) + 0.004, 1.04)], [(0, 1, 2, 3)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])


def plinth_c1(P):
    """Socle rond de la Coupe d'Europe (comme l'ancien trophee geant) : tambour de granit, tambour noir cercle d'or,
    plaque cintree au sud, huit projecteurs encastres dans le sol."""
    t = "plinthc1"
    P.lathe(t, "granite", [(0, 0), (4.2, 0, 1), (4.2, 0.9, 1), (0, 0.9)], segs=72, steps=1)
    P.lathe(t, "black", [(0, 0.9), (3.5, 0.9, 1), (3.5, 1.55, 1), (0, 1.55)], segs=72, steps=1)
    P.lathe(t, "gold", [(3.5, 1.38), (3.54, 1.38, 1), (3.54, 1.5, 1), (3.5, 1.5)], segs=72, steps=1)
    P.lathe(t, "gold", [(4.18, 0.86), (4.24, 0.86, 1), (4.24, 0.9, 1), (3.5, 0.9)], segs=72, steps=1)
    # plaque cintree (bronze) sur le granit, cote sud, cadre dore
    q = "plaquec1"
    span, n, r = 0.3, 16, 4.214
    verts, uvs, faces = [], [], []
    for i in range(n + 1):
        a = -math.pi / 2 - span + 2 * span * i / n
        for z in (0.2, 0.74):
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append((i / n, 0 if z < 0.5 else 1))
    for i in range(n):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    P.piece(q, "plaque", verts, faces, uvs=uvs)
    for z0, z1 in ((0.16, 0.2), (0.74, 0.78)):
        P.lathe(t, "gold", [(4.2, z0), (4.23, z0, 1), (4.23, z1, 1), (4.2, z1)], segs=72, steps=1,
                M=Matrix.Identity(4))
    u = "uplights"
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        x, y = 5.0 * math.cos(a), 5.0 * math.sin(a)
        P.box(u, "black", (x - 0.32, y - 0.32, 0.0), (x + 0.32, y + 0.32, 0.03))
        P.box(u, "uplight", (x - 0.24, y - 0.24, 0.0), (x + 0.24, y + 0.24, 0.045))


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    coll = bpy.data.collections.new("prop_trophies")
    scene.collection.children.link(coll)
    mats = make_materials()
    P = Parts(mats)
    for build in (league1, league2, league3, league4, cup, c1, plinth, plinth_c1):
        build(P)
    P.finalize(coll)
    repo = find_repo()
    out = os.path.join(repo, "assets-src", "blend", "trophies.blend")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    tris = sum(len(o.data.polygons) for o in coll.objects)
    print(f"TROPHIES OK {out} ({len(coll.objects)} objets, {tris} faces)")


main()
