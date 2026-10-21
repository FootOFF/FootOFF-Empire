"""Matieres photo des sols, routes et mobilier (phase 3), depuis les sources CC0 de assets-src/grounds.json.

    python -I tools/grounds/prepare.py
    -> assets-src/grounds-baked/<matiere>_color.jpg, _normal.jpg, _arm.jpg (tailles du jeu) et grounds_meta.json,
       lus par tools/blender/models/build_site.py

Par matiere :
  - couleur recalee sur une teinte cible (moyenne en lumiere lineaire, canal par canal) : les photos gardent leur
    grain mais prennent la palette du complexe (granit clair, enrobe sombre, gazon profond) ;
  - grandes dalles de l'esplanade : joints recales exactement sur le metre (etirement local de quelques pixels),
    pour que le jeu puisse nuancer chaque dalle (src/three/ground.js) sans deborder sur sa voisine ;
  - reduction par moyenne de blocs (raccords sans couture conserves), reliefs renormalises ;
  - ARM = occlusion (R), rugosite (G), metal (B) : celui de Poly Haven, recompose pour le gazon ambientCG ;
  - peinture routiere : blanc casse qui laisse voir le grain de l'enrobe, usee par endroits (reliefs et ARM de
    l'enrobe reutilises).
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets-src', 'grounds')
OUT = os.path.join(ROOT, 'assets-src', 'grounds-baked')

# cle : (source, taille de la tuile en metres, cote final en pixels (couleur, relief et ARM), teinte cible sRGB,
#        contraste (ecarts a la moyenne multiplies), joints a recaler (n x n dalles))
MATS = {
    'esplanade': ('large_floor_tiles_02', 3.0, (1024, 512, 512), (0.620, 0.600, 0.560), 0.75, 3),  # granit clair de l'axe d'honneur ; le reste de l'esplanade est teinte plus sombre (build_site.py)
    'granite': ('granite_tile', 2.3, (512, 512, 512), (0.150, 0.150, 0.158), 1.6, 0),
    'sidewalk': ('concrete_pavement', 1.8, (512, 512, 512), (0.450, 0.432, 0.400), 1.0, 0),
    'asphalt': ('clean_asphalt', 2.1, (512, 512, 512), (0.175, 0.175, 0.182), 1.5, 0),
    'lawn': ('Grass004', 1.4, (512, 512, 512), (0.180, 0.315, 0.115), 1.0, 0),  # un peu plus clair : relief et occlusion assombrissent
    'concrete': ('concrete_floor_01', 2.0, (512, 512, 512), (0.215, 0.210, 0.200), 0.8, 0),
    'gravel': ('gravel_floor_03', 2.5, (512, 512, 512), (0.330, 0.312, 0.285), 1.0, 0),
    'teak': ('teak_veneer', 1.0, (512, 256, 256), (0.400, 0.265, 0.160), 1.0, 0),
    'mulch': ('wood_chips', 2.0, (512, 512, 512), (0.215, 0.150, 0.095), 1.0, 0),
}
# Retouches du relief et de l'ARM : relief (pentes multipliees), occlusion (assombrissement multiplie), rugosite
# (moyenne visee, ecarts gardes). Le gazon photo (ambientCG) a une rugosite de sol mouille (0,26) : brillant, il
# paraissait sombre et gris au soleil ; une pelouse est mate. Beton, enrobe et granit : photos de surfaces polies,
# trop brillantes face au soleil couchant. Les occlusions photo assombrissaient aussi toute la dalle.
TUNE = {
    'esplanade': {'ao': 0.5},
    'granite': {'rough': 0.66},  # granit flamme (photo : poli, 0,54)
    'sidewalk': {'ao': 0.7},
    'asphalt': {'rough': 0.84},  # enrobe sec (photo : 0,66)
    'lawn': {'normal': 0.5, 'ao': 0.4, 'rough': 0.85},
    'concrete': {'rough': 0.86},  # beton desactive (photo : beton poli 0,52, miroir au soleil couchant)
    'gravel': {'ao': 0.7},
    'mulch': {'ao': 0.7},
}
PAINT = (0.80, 0.80, 0.78)  # peinture routiere (sRGB)
BAND = (0.300, 0.296, 0.288)  # granit des bandes de l'esplanade : plus clair que celui des bordures (sRGB)


def lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), np.float32) / 255


def sources(key, src):
    """Couleur (sRGB), relief (OpenGL) et ARM d'une matiere."""
    if src == 'Grass004':
        d = os.path.join(SRC, 'Grass004_1K-JPG')
        color = load(os.path.join(d, 'Grass004_1K-JPG_Color.jpg'))
        normal = load(os.path.join(d, 'Grass004_1K-JPG_NormalGL.jpg'))
        ao = load(os.path.join(d, 'Grass004_1K-JPG_AmbientOcclusion.jpg'))[..., 0]
        rough = load(os.path.join(d, 'Grass004_1K-JPG_Roughness.jpg'))[..., 0]
        arm = np.stack([ao, rough, np.zeros_like(ao)], -1)
        return color, normal, arm
    res = '2k' if os.path.exists(os.path.join(SRC, f'{src}_diff_2k.jpg')) else '1k'
    return tuple(load(os.path.join(SRC, f'{src}_{m}_{res}.jpg')) for m in ('diff', 'nor_gl', 'arm'))


def joints(color, n, axis):
    """Positions des n joints le long d'un axe, pres de k / n : ecart le plus fort du profil moyen a son voisinage
    (joint sombre ou mortier clair)."""
    p = lin(color).mean(2).mean(axis)
    W = len(p)
    k = 61
    ext = np.concatenate([p[-k:], p, p[:k]])
    valley = -np.abs(p - np.convolve(ext, np.ones(k) / k, 'same')[k:-k])
    found = []
    for i in range(n):
        idx = (np.arange(-W // (3 * n), W // (3 * n) + 1) + round(i * W / n)) % W
        found.append(int(idx[np.argmin(valley[idx])]))
    return found


def warp_axis(img, found, axis):
    """Etire l'image par morceaux (en boucle) pour amener les joints trouves sur k * W / n."""
    W = img.shape[1] if axis == 0 else img.shape[0]
    n = len(found)
    src = np.array(found, np.float64)
    src = np.where(src > W * (1 - 0.5 / n), src - W, src)  # joint juste avant le bord : ramene vers 0
    order = np.argsort(src)
    src = src[order]
    dst = np.arange(n) * W / n
    xs = np.concatenate([dst, [W]])
    ys = np.concatenate([src, [src[0] + W]])
    t = np.arange(W) + 0.5
    s = np.interp(t, xs, ys) - 0.5
    i0 = np.floor(s).astype(int)
    f = (s - i0).astype(np.float32)
    a, b = i0 % W, (i0 + 1) % W
    if axis == 0:  # colonnes
        return img[:, a] * (1 - f)[None, :, None] + img[:, b] * f[None, :, None]
    return img[a] * (1 - f)[:, None, None] + img[b] * f[:, None, None]


def reduce(img, size, kind):
    h = img.shape[0]
    k = h // size
    if k <= 1:
        out = img
    else:
        x = lin(img) if kind == 'color' else (img * 2 - 1 if kind == 'normal' else img)
        x = x.reshape(size, k, size, k, 3).mean((1, 3))
        out = srgb(x) if kind == 'color' else x
    if kind == 'normal':
        v = out if k > 1 else out * 2 - 1
        v = v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
        out = v * 0.5 + 0.5
    return out


def calibrate(color, target, contrast):
    """Moyenne lineaire amenee sur la cible, ecarts a la moyenne multiplies par contrast (en lineaire)."""
    x = lin(color)
    m = x.reshape(-1, 3).mean(0)
    t = lin(np.asarray(target, np.float32))
    x = t + (x * (t / m) - t) * contrast
    return srgb(x)


def periodic_noise(size, cells, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out, amp, total = np.zeros((size, size)), 1.0, 0.0
    for o in range(octaves):
        c = cells * 2 ** o
        g = rng.random((c, c))
        u = (np.arange(size) + 0.5) / size * c
        i0 = np.floor(u).astype(int)
        f = u - i0
        f = f * f * (3 - 2 * f)
        a, b = i0 % c, (i0 + 1) % c
        rows = g[a] * (1 - f)[:, None] + g[b] * f[:, None]
        out += amp * (rows[:, a] * (1 - f)[None, :] + rows[:, b] * f[None, :])
        total += amp
        amp *= 0.5
    return out / total


def save(img, name, quality=95):
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), quality=quality,
                                                                             subsampling=0)


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for key, (src, tile, sizes, target, contrast, grid) in MATS.items():
        color, normal, arm = sources(key, src)
        if grid:
            cols, rows = joints(color, grid, 0), joints(color, grid, 1)
            print(f'{key}: joints colonnes {cols}, lignes {rows}')
            color, normal, arm = (warp_axis(warp_axis(m, cols, 0), rows, 1) for m in (color, normal, arm))
        reduced = reduce(color, sizes[0], 'color')
        color = calibrate(reduced, target, contrast)
        if key == 'granite':  # meme granit, plus clair, pour le calepinage de l'esplanade (relief et ARM partages)
            band = calibrate(reduced, BAND, contrast)
            save(band, 'band_color.jpg')
            meta['band'] = {'source': src, 'tile': tile, 'slabs': 0, 'size': sizes[0],
                            'mean_linear': [round(float(v), 4) for v in lin(band).reshape(-1, 3).mean(0)]}
        normal = reduce(normal, sizes[1], 'normal')
        arm = reduce(arm, sizes[2], 'arm')
        arm[..., 2] = 0  # aucun metal au sol
        tune = TUNE.get(key, {})
        if 'normal' in tune:
            v = normal * 2 - 1
            v[..., :2] *= tune['normal']
            normal = v / np.linalg.norm(v, axis=-1, keepdims=True) * 0.5 + 0.5
        if 'ao' in tune:
            arm[..., 0] = 1 - tune['ao'] * (1 - arm[..., 0])
        if 'rough' in tune:
            g = arm[..., 1]
            arm[..., 1] = np.clip(tune['rough'] + (g - g.mean()) * 0.5, 0.05, 1)
        save(color, f'{key}_color.jpg')
        save(normal, f'{key}_normal.jpg')
        save(arm, f'{key}_arm.jpg')
        mean = lin(color).reshape(-1, 3).mean(0)
        meta[key] = {'source': src, 'tile': tile, 'slabs': grid, 'size': sizes[0],
                     'mean_linear': [round(float(v), 4) for v in mean], 'roughness': round(float(arm[..., 1].mean()), 3)}
        if key == 'asphalt':
            # peinture : blanc casse module par le grain de l'enrobe, usee par plaques
            lum = lin(color).mean(2)
            grain = lum / lum.mean()
            wear = np.clip((periodic_noise(color.shape[0], 3, 11) - 0.58) * 4, 0, 1) * 0.55
            paint = lin(np.asarray(PAINT, np.float32)) * (0.82 + 0.18 * grain)[..., None]
            paint = paint * (1 - wear[..., None]) + lin(color) * wear[..., None]
            save(srgb(paint), 'paint_color.jpg')
            meta['paint'] = {'source': src, 'tile': tile, 'size': color.shape[0],
                             'mean_linear': [round(float(v), 4) for v in paint.reshape(-1, 3).mean(0)]}
        print(f'{key}: {src}, tuile {tile} m, moyenne sRGB {np.round(srgb(mean), 3)}')
    with open(os.path.join(OUT, 'grounds_meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1)
    print('ok', OUT)


if __name__ == '__main__':
    main()
