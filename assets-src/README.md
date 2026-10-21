# Assets 3D : guide de production

Ce dossier contient les **sources** des modèles 3D (exports Blender bruts, en mètres).
Le jeu ne lit jamais ce dossier : `npm run models` contrôle et optimise les sources, puis publie
le résultat dans `public/models/` et met à jour `src/three/models.generated.js`.

```
assets-src/
  budgets.json                       budgets et conventions (source unique, lue par Node et Blender)
  models/
    buildings/<bâtiment>/<bâtiment>_L<n>.glb   ex. buildings/fans/fans_L2.glb
    buildings/<bâtiment>/<bâtiment>_L<n>.json  réglages facultatifs (voir plus bas)
    props/<nom>.glb                  décor (phase 3) : lampadaire, arbre, voiture...
    REPORT.md                        rapport généré à chaque `npm run models`
  blend/                             fichiers .blend de travail (conseillé : Git LFS)
  grounds.json                       matières photo CC0 des sols et du mobilier, à télécharger dans grounds/ (hors dépôt)
  grounds-baked/                     leurs textures aux tailles du jeu : python -I tools/grounds/prepare.py (hors dépôt)
```

Bâtiments et niveaux : `terrain` (1 à 4), `training`, `academy`, `fans`, `sponsor` (1 à 5).
Un niveau sans modèle reprend le niveau inférieur le plus proche, sinon la version procédurale.

## Règles de modélisation (Blender)

| Règle | Pourquoi |
|---|---|
| Unités : **mètres**, Unit Scale = 1 | le jeu convertit 1 m → 0,1 unité (1 unité = 10 m) |
| Origine **au centre de l'emprise, au sol** (z = 0) | le jeu place l'origine au centre de la parcelle, sans recentrer (un stade asymétrique reste où il est) |
| Façade principale vers **−Y** (vue de face, pavé num. 1) | elle devient +Z, côté caméra, dans le jeu |
| Emprise max : stade **160 × 130 m**, bâtiment **60 × 60 m** | sinon chevauchement avec les parcelles voisines |
| Le côté façade du stade reste **bas ou en coupe** | la pelouse doit rester visible depuis la caméra |
| Matériaux **Principled BSDF** uniquement | seuls convertis correctement en glTF |
| UV obligatoires dès qu'un matériau a une texture | sinon export bloqué |
| Réutiliser des trim sheets / atlas communs (béton, verre, métal, sièges) | moins de matériaux, moins de draw calls |
| Objets répétés (sièges, lampadaires, arbres) = **doublons liés** (Alt+D) | instanciés automatiquement sur le GPU (≥ 5 copies) |
| Appliquer l'échelle (Ctrl+A > Scale) | pas obligatoire, mais évite les surprises |

### Budgets (après optimisation)

| Catégorie | Triangles | Poids | Texture max | Matériaux | Draw calls |
|---|---|---|---|---|---|
| Stade | 60 000 | 4 Mo | 2048 px | 16 | 40 |
| Bâtiment | 25 000 | 1,5 Mo | 1024 px | 10 | 20 |
| Décor | 2 000 | 200 Ko | 512 px | 3 | 3 |

Dépasser le budget de triangles ou de poids **bloque** la publication ; les autres limites sont des alertes.
Les textures plus grandes que la limite sont réduites automatiquement (pas d'erreur).

### Objets spéciaux (le nom est conservé jusqu'au jeu)

| Préfixe | Type | Effet dans le jeu |
|---|---|---|
| `emissive_` | maillage | s'allume la nuit (fenêtres, LED, enseigne). Mettre une couleur d'émission dans le matériau. |
| `light_` | empty | position d'un projecteur du stade |
| `crowd_`, `flag_`, `club_color_` | — | réservés (foule, drapeaux, couleurs du club) |

## Modèles générés par script

Certains modèles sont construits entièrement par un script Blender (géométrie + textures), ce qui les
rend reproductibles et modifiables par paramètres. C'est le cas du stade :

```bash
blender -b --factory-startup -P tools/blender/models/build_stadium.py
blender -b --factory-startup -P tools/blender/models/build_buildings.py
blender -b --factory-startup -P tools/blender/models/build_site.py
```

`build_buildings.py` produit `assets-src/blend/buildings.blend` (20 collections), `build_site.py` produit
`site.blend` (collections `prop_site`, `prop_plot_empty`, `prop_plot_locked` → `models/props/`).
Les collections `prop_<nom>` sont exportées dans `models/props/` ; leur catégorie de budget est donnée
par la section `props` de `budgets.json`.

Le script régénère `assets-src/blend/stadium.blend` (collections `terrain_L1` à `terrain_L4`) ;
on enchaîne ensuite avec l'export et `npm run models` comme pour tout autre modèle.

## Exporter

**Une collection par modèle**, nommée exactement comme le fichier : `fans_L2`, `terrain_L3`...

- **Depuis Blender** : enregistrer le `.blend` dans le projet (ex. `assets-src/blend/`), onglet
  *Scripting* → ouvrir `tools/blender/footoff_export.py` → *Run Script*. Toutes les collections
  conformes sont contrôlées puis exportées dans `assets-src/models/buildings/...`.
- **En ligne de commande** :
  ```bash
  blender assets-src/blend/fans.blend -b -P tools/blender/footoff_export.py -- --only fans_L2
  ```
  Options : `--only <collection>`, `--check` (contrôle sans export), `--repo <chemin>` si le `.blend`
  est hors du projet.

Le script Blender refuse d'exporter une collection en erreur (mauvaises unités, emprise trop grande,
texture sans UV, texture manquante, budget de triangles dépassé) et explique quoi corriger.

## Publier dans le jeu

```bash
npm run models
```

Pour chaque source : contrôles → optimisation (dédoublonnage, instancing GPU, fusion des maillages,
soudure, textures WebP redimensionnées, compression Meshopt) → contrôle des budgets → publication
dans `public/models/` → régénération de `src/three/models.generated.js` et de `models/REPORT.md`.

- `npm run models:check` : contrôle seulement, rien n'est écrit. Code de sortie 1 en cas d'erreur (CI).
- `npm run models -- fans` : ne traite que les modèles dont le nom contient « fans ».

Un export manuel (sans le script Blender) passe par les mêmes contrôles : rien d'invalide n'entre dans le jeu.

### Réglages par modèle (facultatif)

`buildings/fans/fans_L2.json` à côté du `.glb` :

```json
{ "rotY": 1.5708, "offset": [0, 0, 0.5] }
```

`rotY` (radians) corrige l'orientation, `offset` décale après placement (en unités du jeu),
`fit: true` ajuste automatiquement à l'emprise au lieu de l'échelle 0,1.
