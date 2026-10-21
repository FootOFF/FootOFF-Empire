"""Vignettes des trophees pour la salle des trophees (rendu Cycles sous un vrai ciel, fond transparent).

    blender assets-src/blend/trophies.blend -b -P tools/blender/models/render_trophies.py [-- --sheet CHEMIN.png]
    -> public/ui/trophies/<id>.webp (512 x 640)

--sheet : rend aussi une planche de controle (les six trophees sur leurs socles).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from footoff_lib import find_repo  # noqa: E402

IDS = ["league1", "league2", "league3", "league4", "cup", "c1"]
HDRI = "kloofendal_48d_partly_cloudy_puresky_4k.hdr"


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return {"sheet": a[a.index("--sheet") + 1] if "--sheet" in a else None}


def setup_world(repo):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("trophy_world")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(repo, "assets-src", "hdri", HDRI))
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(150))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.9
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def add_light(name, loc, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def frame(cam, objs, aspect, margin=1.12, elev=12):
    mn, mx = bounds(objs)
    ctr = (mn + mx) / 2
    h = (mx.z - mn.z) * margin
    w = max(mx.x - mn.x, mx.y - mn.y) * margin
    cam.data.sensor_fit = "HORIZONTAL" if aspect >= 1 else "VERTICAL"
    fx = 2 * math.atan(math.tan(cam.data.angle / 2) * (1 if aspect >= 1 else aspect))  # champ horizontal
    fy = 2 * math.atan(math.tan(cam.data.angle / 2) * (1 / aspect if aspect >= 1 else 1))  # champ vertical
    dist = max(h / (2 * math.tan(fy / 2)), w / (2 * math.tan(fx / 2))) * 1.02
    d = Vector((0, -math.cos(math.radians(elev)), math.sin(math.radians(elev))))
    cam.location = ctr + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()


def main():
    opts = args()
    repo = find_repo()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
    setup_world(repo)
    add_light("key", (-6, -9, 9), 2600, 6, (1, 0.96, 0.9))
    add_light("rim", (7, 8, 7), 1500, 5, (0.85, 0.9, 1))
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    objs = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    group = lambda tid: [o for n, o in objs.items() if n.startswith(f"trophy_{tid}__")]  # noqa: E731

    out_dir = os.path.join(repo, "public", "ui", "trophies")
    os.makedirs(out_dir, exist_ok=True)
    scene.render.resolution_x, scene.render.resolution_y = 512, 640
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 88
    cam_data.sensor_fit = "AUTO"
    for tid in IDS:
        for o in objs.values():
            o.hide_render = o not in group(tid)
        frame(cam, group(tid), 512 / 640)
        scene.render.filepath = os.path.join(out_dir, f"{tid}.webp")
        bpy.ops.render.render(write_still=True)
        print("VIGNETTE", scene.render.filepath)

    if opts["sheet"]:
        # planche de controle : chaque trophee sur son socle, alignes
        scene.render.image_settings.file_format = "PNG"
        scene.render.resolution_x, scene.render.resolution_y = 1800, 760
        scene.cycles.samples = 64
        for o in objs.values():
            o.hide_render = False
        xs = {"league1": -15, "league2": -9, "league3": -3, "league4": 3, "cup": 9, "c1": 18.5}
        shown = []
        for tid, x in xs.items():
            for o in group(tid):
                o.location = (x, 0, 1.55 if tid == "c1" else 1.42)
                shown.append(o)
            base = group("plinthc1" if tid == "c1" else "plinth") + group("plaquec1" if tid == "c1" else "plaque")
            for o in base:
                if tid != "c1" and tid != "league1":
                    dup = o.copy()
                    scene.collection.objects.link(dup)
                    dup.location = (x, 0, 0)
                    shown.append(dup)
                else:
                    o.location = (x, 0, 0)
                    shown.append(o)
        for o in group("uplights"):
            o.location = (18.5, 0, 0)
        cam_data.lens = 50
        frame(cam, shown, 1800 / 760, margin=1.05, elev=10)
        scene.render.filepath = opts["sheet"]
        bpy.ops.render.render(write_still=True)
        print("PLANCHE", opts["sheet"])


main()
