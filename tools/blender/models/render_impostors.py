"""Imposteurs des arbres (forets lointaines) : chaque espece rendue sous 8 angles (Cycles), en couleur, relief et
occlusion, a la hauteur de vue du jeu ; assembles ensuite en atlas par tools/vegetation/impostors.py.

Couleur : albedo (teinte de l'espece), sans lumiere. Relief : normale de rendu (arrondie, vers l'exterieur du
houppier, meme vue de dos) dans le repere de la vue (x droite, y haut, z vers la camera). Occlusion : part du ciel
visible, rendue sous un ciel blanc uniforme, les rayons passant entre les feuilles detourees.

    blender assets-src/blend/trees.blend -b -P tools/blender/models/render_impostors.py [-- --preview CHEMIN.png]
    -> assets-src/vegetation-baked/impostors/<espece>_<vue>_{color,normal,ao}.png + impostors.json

--preview : rend aussi une planche de controle (les especes cote a cote, materiaux reels, sous un vrai ciel).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import find_repo  # noqa: E402

ROOT = find_repo()
OUT = os.path.join(ROOT, "assets-src", "vegetation-baked", "impostors")
VIEWS = 8
ELEVATION = 28.0  # degres : hauteur de vue typique de la camera du jeu
CELL_W, CELL_H = 256, 384
TINTS = {  # teinte du feuillage par espece (sRGB, multiplie le bouquet)
    "chene": (0.82, 0.92, 0.72), "hetre": (0.98, 1.06, 0.8), "peuplier": (0.8, 0.94, 0.78),
    "pin": (0.92, 0.98, 0.9), "sapin": (0.8, 0.95, 0.85),
}
HDRI = "kloofendal_48d_partly_cloudy_puresky_4k.hdr"
SPECIES = ("chene", "hetre", "peuplier", "pin", "sapin")  # arbres des forets (pas la vegetation basse des jardins)


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return {"preview": a[a.index("--preview") + 1] if "--preview" in a else None}


def species_objects():
    groups = {}
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith("tree_") and "__" in o.name:
            sp = o.name[5:].split("__")[0]
            if sp in SPECIES:
                groups.setdefault(sp, []).append(o)
            else:
                o.hide_render = True
    return groups


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def image_node(mat):
    """Texture de couleur et texture de relief du materiau d'origine."""
    color = normal = None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            if n.image.colorspace_settings.name == "Non-Color":
                normal = n.image
            else:
                color = n.image
    return color, normal


def outward(nt):
    """Normale de rendu tournee vers l'exterieur meme pour une face vue de dos (Cycles la retourne vers la camera)."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sign = nt.nodes.new("ShaderNodeMath")
    sign.operation = "MULTIPLY_ADD"
    sign.inputs[1].default_value = -2.0
    sign.inputs[2].default_value = 1.0
    nt.links.new(geo.outputs["Backfacing"], sign.inputs[0])
    flip = nt.nodes.new("ShaderNodeVectorMath")
    flip.operation = "SCALE"
    nt.links.new(sign.outputs[0], flip.inputs["Scale"])
    return geo, flip


def override(mat, kind, tint):
    """Materiau d'une passe : 'color' (albedo, teinte), 'normal' (repere de la vue), 'ao' (ciel visible)."""
    m = bpy.data.materials.new(f"{mat.name}__{kind}")
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    color_img, normal_img = image_node(mat)
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = color_img
    leaves = "leaves" in mat.name
    if leaves:
        clip = nt.nodes.new("ShaderNodeMath")
        clip.operation = "GREATER_THAN"
        clip.inputs[1].default_value = 0.42
        nt.links.new(tc.outputs["Alpha"], clip.inputs[0])
        nt.links.new(clip.outputs[0], mix.inputs["Fac"])
    else:
        mix.inputs["Fac"].default_value = 1.0
    nt.links.new(transp.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    if kind == "color":
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(tc.outputs["Color"], mul.inputs["A"])
        lin = [c ** 2.2 for c in tint] if leaves else [1.0, 1.0, 1.0]
        mul.inputs["B"].default_value = (*lin, 1.0)
        nt.links.new(mul.outputs["Result"], emit.inputs["Color"])
    elif kind == "normal":
        geo, flip = outward(nt)
        if normal_img:
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = normal_img
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = 0.8
            nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
            shading = nm.outputs["Normal"]
        else:  # ecorce sans relief : normale de la surface
            shading = geo.outputs["Normal"]
        nt.links.new(shading, flip.inputs[0])
        tr = nt.nodes.new("ShaderNodeVectorTransform")
        tr.vector_type = "NORMAL"
        tr.convert_from = "WORLD"
        tr.convert_to = "CAMERA"
        nt.links.new(flip.outputs[0], tr.inputs[0])
        # repere camera de Cycles : z vers l'avant (dans la scene) ; celui du jeu : z vers la camera
        half = nt.nodes.new("ShaderNodeVectorMath")
        half.operation = "MULTIPLY_ADD"
        half.inputs[1].default_value = (0.5, 0.5, -0.5)
        half.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(tr.outputs[0], half.inputs[0])
        nt.links.new(half.outputs[0], emit.inputs["Color"])
    else:
        # occlusion : ciel blanc uniforme (setup_render), lumiere directe seulement ; les ombres traversent les
        # zones detourees des cartes, contrairement au noeud d'occlusion ambiante (cartes vues comme pleines)
        geo, flip = outward(nt)
        nt.links.new(geo.outputs["Normal"], flip.inputs[0])
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (1, 1, 1, 1)
        nt.links.new(flip.outputs[0], diff.inputs["Normal"])
        nt.links.new(diff.outputs[0], mix.inputs[2])
    return m


def setup_render(transform, sky=0.0):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 64 if sky else 32
    sc.cycles.max_bounces = 0  # lumiere directe du ciel seulement (passe d'occlusion)
    sc.cycles.use_denoising = False
    sc.cycles.transparent_max_bounces = 128  # houppiers denses : beaucoup de cartes traversees
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = CELL_W, CELL_H
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = transform
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0
    sc.world = bpy.data.worlds.get("fond") or bpy.data.worlds.new("fond")
    nt = sc.world.node_tree
    bg = nt.nodes.get("fond")
    if not bg:  # fond uni : noir (couleur, relief) ou blanc (occlusion)
        nt.nodes.clear()
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.name = "fond"
        nt.links.new(bg.outputs["Background"], nt.nodes.new("ShaderNodeOutputWorld").inputs["Surface"])
    bg.inputs["Color"].default_value = (sky, sky, sky, 1)


def main():
    opts = args()
    os.makedirs(OUT, exist_ok=True)
    groups = species_objects()
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    e = math.radians(ELEVATION)
    meta = {"views": VIEWS, "elevation": ELEVATION, "cell": [CELL_W, CELL_H], "species": {}}
    originals = {o.name: [s.material for s in o.material_slots] for objs in groups.values() for o in objs}
    passes = {}
    for objs in groups.values():
        for o in objs:
            for mat in originals[o.name]:
                key = mat.name
                if key not in passes:
                    sp = o.name[5:].split("__")[0]
                    passes[key] = {k: override(mat, k, TINTS.get(sp, (1, 1, 1))) for k in ("color", "normal", "ao")}
    for sp, objs in groups.items():
        for other, oo in groups.items():
            for o in oo:
                o.hide_render = other != sp
        mn, mx = bounds(objs)
        H, R = mx.z, max(abs(mn.x), abs(mx.x), abs(mn.y), abs(mx.y))
        need_h = H * math.cos(e) + 2 * R * math.sin(e)
        ortho = max(need_h * 1.06, 2 * R * 1.06 * CELL_H / CELL_W)
        cam_data.ortho_scale = ortho
        center = Vector((0, 0, H / 2))
        # baseV : hauteur du pied de l'arbre dans la case (fraction depuis le bas), la meme sous tous les angles
        meta["species"][sp] = {"height": round(H, 2), "radius": round(R, 2), "ortho": round(ortho, 3),
                               "baseV": round(0.5 - (H / 2) * math.cos(e) / ortho, 4)}
        for k in range(VIEWS):
            a = 2 * math.pi * k / VIEWS
            d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            cam.location = center + d * 60
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
            for kind, transform in (("color", "Standard"), ("normal", "Raw"), ("ao", "Raw")):
                setup_render(transform, 1.0 if kind == "ao" else 0.0)
                for o in objs:
                    for i, mat in enumerate(originals[o.name]):
                        o.material_slots[i].material = passes[mat.name][kind]
                sc.render.filepath = os.path.join(OUT, f"{sp}_{k}_{kind}.png")
                bpy.ops.render.render(write_still=True)
            for o in objs:
                for i, mat in enumerate(originals[o.name]):
                    o.material_slots[i].material = mat
        print("IMPOSTEUR", sp, meta["species"][sp])
    with open(os.path.join(OUT, "impostors.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    if opts["preview"]:
        # planche de controle : materiaux reels, ciel HDRI, especes cote a cote
        for oo in groups.values():
            for o in oo:
                o.hide_render = False
        world = bpy.data.worlds.new("ciel")
        sc.world = world
        nt = world.node_tree
        nt.nodes.clear()
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(os.path.join(ROOT, "assets-src", "hdri", HDRI))
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.inputs["Strength"].default_value = 1.0
        wo = nt.nodes.new("ShaderNodeOutputWorld")
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        nt.links.new(bg.outputs["Background"], wo.inputs["Surface"])
        sun = bpy.data.lights.new("soleil", "SUN")
        sun.energy = 4.5
        sun.angle = math.radians(1.5)
        so = bpy.data.objects.new("soleil", sun)
        sc.collection.objects.link(so)
        so.rotation_euler = (math.radians(50), 0, math.radians(30))
        x = 0.0
        for sp, objs in groups.items():
            for o in objs:
                o.location.x = x
            x += 24.0
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 64
        sc.cycles.max_bounces = 8
        sc.cycles.use_denoising = True
        sc.render.film_transparent = False
        sc.view_settings.view_transform = "AgX"
        sc.render.resolution_x, sc.render.resolution_y = 1800, 720
        cam_data.type = "PERSP"
        cam_data.lens = 35
        target = Vector((x / 2 - 12, 0, 9))
        cam.location = target + Vector((0, -112, 26))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = opts["preview"]
        bpy.ops.render.render(write_still=True)
        print("PLANCHE", opts["preview"])


main()
