"""Outils de geometrie partages (trophees, arbres) : profils lisses, tubes balayes, pieces planes, finalisation
en objets <prefixe>_<id>__<materiau>."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from footoff_lib import newell

SEGS = 48


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
    """Geometrie accumulee par (piece, materiau) : un objet <prefixe>_<id>__<materiau> par couple."""

    def __init__(self, mats, prefix="trophy"):
        self.mats = mats
        self.prefix = prefix
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

    def tube(self, tid, mat, pts, shape, taper=None, twist=0.0, up=(0, 1, 0), cap=True, uv=None):
        """Profil 2D `shape` [(u, v)] balaye le long du chemin `pts` (repere transporte), echelle `taper(t)`,
        torsion totale `twist` (radians). u suit la normale N, v la binormale B (T x N). uv = (tours, tuile) :
        coordonnees d'ecorce (u autour, `tours` repetitions ; v le long, une repetition par `tuile` metres)."""
        bm = self.bm(tid, mat)
        uvl = bm.loops.layers.uv.active
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
        dist = [0.0]
        for i in range(1, n):
            dist.append(dist[-1] + (P[i] - P[i - 1]).length)
        for i, (a, b) in enumerate(zip(rings, rings[1:])):
            for k in range(m):
                k1 = (k + 1) % m
                f = bm.faces.new((a[k], a[k1], b[k1], b[k]))
                if uv:
                    turns, tile = uv
                    us = (k / m * turns, (k + 1) / m * turns)
                    vs = (dist[i] / tile, dist[i + 1] / tile)
                    for loop, (uu, vv) in zip(f.loops, ((us[0], vs[0]), (us[1], vs[0]), (us[1], vs[1]), (us[0], vs[1]))):
                        loop[uvl].uv = (uu, vv)
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
            me = bpy.data.meshes.new(f"{self.prefix}_{tid}__{mat}")
            bm.to_mesh(me)
            bm.free()
            for p in me.polygons:
                p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
            me.materials.append(self.mats[mat])
            ob = bpy.data.objects.new(f"{self.prefix}_{tid}__{mat}", me)
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


