"""FootOFF Empire - export GLB depuis Blender, avec controles.

Convention dans le .blend : une COLLECTION par modele exporte, nommee comme le fichier final :
    terrain_L1 ... terrain_L4, training_L1 ... training_L5, academy_L*, fans_L*, sponsor_L*
Travailler en metres (Unit Scale = 1), Z vers le haut, origine du modele au centre de
l'emprise et au sol, facade vers -Y dans Blender (= +Z dans le jeu apres conversion Y-up).

Objets speciaux (gardent leur nom dans le GLB) :
    emissive_*   maillages qui s'allument la nuit (fenetres, LED, enseignes)
    light_*      empties : position des projecteurs
    crowd_*, flag_*, club_color_*   reserves aux phases suivantes

Utilisation
  - Dans Blender : onglet Scripting > ouvrir ce fichier > Run Script.
    Exporte toutes les collections conformes du fichier ouvert.
  - En ligne de commande (sans interface) :
      blender monfichier.blend -b -P tools/blender/footoff_export.py -- [--only fans_L2] [--check] [--repo CHEMIN]
    Code de sortie 1 si une erreur bloque un export.

Sortie : <repo>/assets-src/models/buildings/<batiment>/<nom>.glb
Ensuite : npm run models (optimisation + budgets + manifeste).
"""

import json
import os
import re
import sys

import bpy
from mathutils import Vector

NAME_RE = re.compile(r"^([a-z]+)_L(\d+)$")
PROP_RE = re.compile(r"^prop_([a-z0-9_]+)$")  # decor / parcelles / site -> models/props/<nom>.glb


# ---------------------------------------------------------------- utilitaires

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"only": None, "check": False, "repo": None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--check":
            opts["check"] = True
        elif a in ("--only", "--repo") and i + 1 < len(argv):
            opts[a[2:]] = argv[i + 1]
            i += 1
        i += 1
    return opts


def find_repo(explicit):
    """Racine du projet : --repo, sinon on remonte depuis le .blend puis depuis ce script."""
    if explicit:
        return os.path.abspath(explicit)
    starts = []
    if bpy.data.filepath:
        starts.append(os.path.dirname(bpy.data.filepath))
    if "__file__" in globals() and os.path.isfile(__file__):
        starts.append(os.path.dirname(os.path.abspath(__file__)))
    for start in starts:
        d = start
        while True:
            if os.path.isfile(os.path.join(d, "assets-src", "budgets.json")):
                return d
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    return None


class Report:
    def __init__(self, name):
        self.name = name
        self.items = []

    def error(self, msg):
        self.items.append(("ERREUR", msg))

    def warn(self, msg):
        self.items.append(("ALERTE", msg))

    def info(self, msg):
        self.items.append(("info", msg))

    @property
    def blocked(self):
        return any(level == "ERREUR" for level, _ in self.items)

    def print(self):
        status = "ERREUR" if self.blocked else ("ALERTES" if any(l == "ALERTE" for l, _ in self.items) else "OK")
        print(f"[{status}] {self.name}")
        for level, msg in self.items:
            print(f"   - {level}: {msg}")


# ---------------------------------------------------------------- controles

def all_objects(coll):
    return list(coll.all_objects)


def check_collection(coll, budgets, depsgraph):
    rep = Report(coll.name)
    pm = PROP_RE.match(coll.name)
    if pm:
        key, level = "prop:" + pm.group(1), 0
        cat = budgets["categories"][budgets.get("props", {}).get(pm.group(1), "prop")]
    else:
        m = NAME_RE.match(coll.name)
        key, level = m.group(1), int(m.group(2))
        bdef = budgets["buildings"].get(key)
        if not bdef:
            rep.error(f"batiment '{key}' inconnu ({', '.join(budgets['buildings'])})")
            return rep, None
        if not 1 <= level <= bdef["maxLevel"]:
            rep.error(f"niveau {level} hors limites (1 a {bdef['maxLevel']})")
        cat = budgets["categories"][bdef.get("levelCategories", {}).get(str(level), bdef["category"])]
    special = re.compile("^(" + "|".join(budgets["specialNodePrefixes"]) + ")", re.I)

    scene = bpy.context.scene
    us = scene.unit_settings
    if abs(us.scale_length - 1.0) > 1e-6:
        rep.error(f"Unit Scale = {us.scale_length} (attendu 1.0, travailler en metres)")
    if us.system not in ("METRIC", "NONE"):
        rep.warn(f"systeme d'unites {us.system} (attendu Metrique)")

    objs = all_objects(coll)
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        rep.error("aucun maillage dans la collection")
        return rep, None

    tris = 0
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    materials = set()
    unscaled = []
    for o in objs:
        if o.type in ("CAMERA", "LIGHT"):
            rep.info(f"'{o.name}' ({o.type.lower()}) ignore a l'export (utiliser un empty light_*)")
        if o.type != "MESH":
            continue
        sc = o.matrix_world.to_scale()
        if o.matrix_world.determinant() < 0:
            rep.warn(f"'{o.name}' a une echelle negative : Ctrl+A > Scale, puis recalculer les normales")
        elif any(abs(s - 1) > 1e-3 for s in o.scale):
            unscaled.append(o.name)
        ev = o.evaluated_get(depsgraph)
        me = ev.to_mesh()
        try:
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            for v in me.vertices:
                w = ev.matrix_world @ v.co
                mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
                mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
            has_uv = len(me.uv_layers) > 0
        finally:
            ev.to_mesh_clear()
        if not o.material_slots or all(s.material is None for s in o.material_slots):
            rep.warn(f"'{o.name}' sans materiau")
        for slot in o.material_slots:
            mat = slot.material
            if not mat:
                continue
            materials.add(mat.name)
            if mat.node_tree is None:  # (Material.use_nodes est deprecie depuis Blender 5)
                rep.warn(f"materiau '{mat.name}' sans noeuds (exporte en couleur unie)")
                continue
            nodes = mat.node_tree.nodes
            if not any(n.type == "BSDF_PRINCIPLED" for n in nodes):
                rep.warn(f"materiau '{mat.name}' sans Principled BSDF : mal converti en glTF")
            for n in nodes:
                if n.type != "TEX_IMAGE" or not n.image:
                    continue
                img = n.image
                if not has_uv:
                    rep.error(f"'{o.name}' utilise la texture '{img.name}' mais n'a pas d'UV")
                if img.source == "FILE" and not img.packed_file and not os.path.isfile(bpy.path.abspath(img.filepath)):
                    rep.error(f"texture '{img.name}' introuvable : {img.filepath}")
                w, h = img.size
                if max(w, h) > cat["maxTextureSize"]:
                    rep.info(f"texture '{img.name}' {w}x{h} : sera reduite a {cat['maxTextureSize']} px par le pipeline")
        if special.match(o.name) is None and o.name.lower().startswith(("emissive", "light")):
            rep.warn(f"'{o.name}' : prefixe special mal ecrit (attendu emissive_ / light_)")

    if unscaled:
        sample = ", ".join(unscaled[:3]) + (" ..." if len(unscaled) > 3 else "")
        rep.info(f"{len(unscaled)} objet(s) avec echelle non appliquee ({sample}) : exporte correctement, Ctrl+A > Scale conseille")

    # Blender Z-up : X/Y = emprise au sol, Z = hauteur
    size = mx - mn
    fp = cat["footprint"]
    if max(size) > max(2000, fp["w"] * 1.5, fp["d"] * 1.5):  # au-dela de l'emprise prevue : centimetres ?
        rep.error(f"taille {max(size):.0f} : modele en centimetres ? Travailler en metres")
    else:
        # emprise centree sur l'origine (le jeu ne recentre pas) : mesuree depuis l'origine
        span_x = 2 * max(abs(mn.x), abs(mx.x))
        span_y = 2 * max(abs(mn.y), abs(mx.y))
        if span_x > fp["w"] * 1.02 or span_y > fp["d"] * 1.02:
            rep.error(f"emprise {span_x:.1f} x {span_y:.1f} m mesuree depuis l'origine > {fp['w']} x {fp['d']} m autorises")
    if size.z > cat["maxHeight"]:
        rep.warn(f"hauteur {size.z:.1f} m > {cat['maxHeight']} m conseilles")
    if abs(mn.z) > 0.1:
        rep.warn(f"base a z = {mn.z:.2f} m : poser le modele au sol (z = 0), le jeu ne recale pas")
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    if abs(cx) > fp["w"] * 0.05 or abs(cy) > fp["d"] * 0.05:
        rep.info(f"modele decentre de ({cx:.1f}, {cy:.1f}) m : normal s'il est asymetrique, sinon verifier l'origine")
    if tris > cat["maxTriangles"]:
        rep.error(f"{tris:,} triangles > budget {cat['maxTriangles']:,} (Decimate ou LOD)")
    elif tris > cat["maxTriangles"] * 0.85:
        rep.warn(f"{tris:,} triangles : {round(100 * tris / cat['maxTriangles'])} % du budget")
    if len(materials) > cat["maxMaterials"]:
        rep.warn(f"{len(materials)} materiaux > {cat['maxMaterials']} conseilles (atlas / trim sheet)")
    if key == "terrain" and not any(o.name.lower().startswith("light_") for o in objs):
        rep.info("aucun empty light_* : projecteur par defaut la nuit")

    rep.info(f"{tris:,} triangles, {len(materials)} materiaux, {size.x:.0f} x {size.y:.0f} x {size.z:.0f} m")
    return rep, key


# ---------------------------------------------------------------- export

def export_collection(coll, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        collection=coll.name,
        use_active_collection=False,
        use_selection=False,
        use_visible=False,
        export_apply=True,  # modificateurs appliques
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_draco_mesh_compression_enable=False,  # la compression est faite par le pipeline
        export_animations=True,
    )


def main():
    opts = parse_args()
    repo = find_repo(opts["repo"])
    if not repo:
        print("ERREUR : racine du projet introuvable. Enregistrer le .blend dans le projet ou passer --repo CHEMIN.")
        return 1
    with open(os.path.join(repo, "assets-src", "budgets.json"), encoding="utf-8") as f:
        budgets = json.load(f)

    colls = [c for c in bpy.data.collections if NAME_RE.match(c.name) or PROP_RE.match(c.name)]
    if opts["only"]:
        colls = [c for c in colls if c.name == opts["only"]]
    if not colls:
        print("Aucune collection nommee <batiment>_L<niveau> (ex. fans_L2) dans ce fichier.")
        return 1

    depsgraph = bpy.context.evaluated_depsgraph_get()
    failures = 0
    for coll in sorted(colls, key=lambda c: c.name):
        rep, key = check_collection(coll, budgets, depsgraph)
        if not rep.blocked and not opts["check"]:
            if key.startswith("prop:"):
                path = os.path.join(repo, "assets-src", "models", "props", key[5:] + ".glb")
            else:
                path = os.path.join(repo, "assets-src", "models", "buildings", key, coll.name + ".glb")
            export_collection(coll, path)
            rep.info(f"exporte -> {os.path.relpath(path, repo)}")
        if rep.blocked:
            failures += 1
        rep.print()
    print(f"\n{len(colls)} collection(s), {failures} en erreur." + ("" if opts["check"] else " Ensuite : npm run models"))
    return 1 if failures else 0


if __name__ == "__main__":
    code = main()
    if bpy.app.background:
        sys.exit(code)
