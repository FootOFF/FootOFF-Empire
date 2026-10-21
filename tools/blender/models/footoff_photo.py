"""FootOFF Empire - matieres photo CC0 des generateurs Blender (site, stade).

Les textures aux tailles du jeu sont preparees par tools/grounds/prepare.py dans assets-src/grounds-baked/ :
<cle>_color.jpg, <cle>_normal.jpg, <cle>_arm.jpg (occlusion R, rugosite G, metal B) et grounds_meta.json (tuile en
metres, couleur moyenne...). Dans le jeu, src/three/ground.js nuance ces matieres (taches, mosaique des dalles,
teinte multipliee) d'apres les extras glTF poses ici.
"""

import json
import os

from footoff_lib import bpy, find_repo, material

GROUNDS = os.path.join(find_repo(), "assets-src", "grounds-baked")
with open(os.path.join(GROUNDS, "grounds_meta.json"), encoding="utf-8") as _f:
    GROUND_META = json.load(_f)


def tile(key):
    """Taille (metres) d'une repetition de la texture `key`, pour les UV du Builder."""
    t = GROUND_META[key]["tile"]
    return (t, t)


def ground_image(key, kind):
    img = bpy.data.images.load(os.path.join(GROUNDS, f"{key}_{kind}.jpg"), check_existing=True)
    img.colorspace_settings.name = "sRGB" if kind == "color" else "Non-Color"
    return img


def gltf_output():
    """Groupe « glTF Material Output » : l'exportateur glTF y lit l'occlusion ambiante."""
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def srgb_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def photo_material(name, key, color=None, tone=None, relief=True):
    """Matiere photo : couleur, relief et ARM (occlusion R, rugosite G, metal B) de assets-src/grounds-baked/.
    Une seule image ARM, exportee a la fois en occlusionTexture et en metallicRoughnessTexture. tone : teinte sRGB
    visee, obtenue en multipliant la photo dans le jeu (extras « factor », ground.js) : deux matieres, une image.
    relief=False : couleur seule, rugosite moyenne de la photo, pour les grandes surfaces toujours vues de loin
    (gradins du stade) : relief et ARM n'y changeaient pas l'image et coutaient deux lectures de texture par pixel."""
    m = material(name, image=ground_image(color or key, "color"), normal=ground_image(key, "normal") if relief else None,
                 rough=GROUND_META[key].get("roughness", 0.8))
    if relief:
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = ground_image(key, "arm")
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
        out = nt.nodes.new("ShaderNodeGroup")
        out.node_tree = gltf_output()
        nt.links.new(sep.outputs["Red"], out.inputs["Occlusion"])
    # extras glTF (userData dans le jeu) : tuile en metres, dalles par tuile, couleur moyenne (lumiere lineaire)
    m["tile"] = GROUND_META[key]["tile"]
    m["slabs"] = GROUND_META[key].get("slabs", 0)
    m["mean"] = GROUND_META[color or key]["mean_linear"]
    if tone:
        m["factor"] = [round(srgb_lin(t) / mm, 4) for t, mm in zip(tone, m["mean"])]
    return m
