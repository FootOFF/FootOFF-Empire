"""Atlas des imposteurs d'arbres (forets lointaines) a partir des rendus de render_impostors.py.

    python -I tools/vegetation/impostors.py
    -> public/vegetation/impostors_color.webp (+ -half), impostors_normal.webp (+ -half), src/three/trees.generated.js

Une ligne par espece, une colonne par angle de vue. Couleur : albedo et alpha (couleur etalee sous les zones
transparentes : pas de liseres dans les mipmaps). Relief : normale dans le repere de la vue (x droite, y haut,
z vers la camera) et occlusion ambiante dans l'alpha.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets-src', 'vegetation-baked', 'impostors')
OUT = os.path.join(ROOT, 'public', 'vegetation')
GENERATED = os.path.join(ROOT, 'src', 'three', 'trees.generated.js')
ORDER = ['chene', 'hetre', 'peuplier', 'pin', 'sapin']


def bleed(rgb, known, rounds=16):
    rgb = rgb.copy()
    for _ in range(rounds):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = ~known & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        known = known | grow
    return rgb


def main():
    meta = json.load(open(os.path.join(SRC, 'impostors.json'), encoding='utf-8'))
    lod = json.load(open(os.path.join(ROOT, 'assets-src', 'vegetation-baked', 'trees_meta.json'), encoding='utf-8'))
    V = meta['views']
    W, H = meta['cell']
    color = np.zeros((H * len(ORDER), W * V, 4), np.float32)
    normal = np.zeros((H * len(ORDER), W * V, 4), np.float32)
    for row, sp in enumerate(ORDER):
        for k in range(V):
            c = np.asarray(Image.open(os.path.join(SRC, f'{sp}_{k}_color.png')).convert('RGBA'), np.float32) / 255
            n = np.asarray(Image.open(os.path.join(SRC, f'{sp}_{k}_normal.png')).convert('RGBA'), np.float32) / 255
            ao = np.asarray(Image.open(os.path.join(SRC, f'{sp}_{k}_ao.png')).convert('RGBA'), np.float32) / 255
            known = c[..., 3] > 0.05
            rgb = c[..., :3]  # PNG de Blender : alpha non premultiplie
            rgb = bleed(np.clip(rgb, 0, 1), known)
            nrm = n[..., :3]
            nrm = bleed(np.clip(nrm, 0, 1), known)
            occ = ao[..., 0]
            y, x = row * H, k * W
            color[y:y + H, x:x + W, :3] = rgb
            color[y:y + H, x:x + W, 3] = c[..., 3]
            normal[y:y + H, x:x + W, :3] = nrm
            normal[y:y + H, x:x + W, 3] = np.where(known, np.clip(occ, 0, 1), 1)
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    for name, arr in (('impostors_color', color), ('impostors_normal', normal)):
        img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA')
        for suffix, im in (('', img), ('-half', img.resize((img.width // 2, img.height // 2), Image.LANCZOS))):
            path = os.path.join(OUT, f'{name}{suffix}.webp')
            im.save(path, quality=90 if name.endswith('color') else 80, method=6, alpha_quality=100)  # relief : moins fin
            sizes[f'{name}{suffix}'] = os.path.getsize(path)
    species = {}
    for row, sp in enumerate(ORDER):
        s = meta['species'][sp]
        species[sp] = {'row': row, **s, 'foliage': lod[sp]['foliage'], 'triangles': lod[sp]['triangles']}
    # vegetation basse des jardins (sans imposteur) : hauteur, rayon, module de haie
    shrubs = {k: {f: v[f] for f in ('height', 'radius', 'module') if f in v} for k, v in lod.items() if k not in ORDER}
    body = json.dumps({'views': V, 'elevation': meta['elevation'], 'cell': [W, H], 'rows': len(ORDER), 'species': species,
                       'shrubs': shrubs}, indent=2, ensure_ascii=False)
    with open(GENERATED, 'w', encoding='utf-8') as f:
        f.write('// Généré par tools/vegetation/impostors.py : ne pas modifier à la main.\n'
                '// Arbres du décor : dimensions (m), triangles du modèle proche, et pour chaque espèce sa ligne dans\n'
                '// l\'atlas des imposteurs (une colonne par angle de vue ; ortho : hauteur de la case en mètres ; baseV :\n'
                '// hauteur du pied de l\'arbre dans la case, depuis le bas). shrubs : végétation basse des jardins (buis,\n'
                '// arbustes, module de haie : longueur, largeur, hauteur), toujours en 3D.\n'
                f'export const TREES = {body};\n')
    for k, v in sizes.items():
        print(f'{k}: {v / 1024:.0f} Ko')


if __name__ == '__main__':
    main()
