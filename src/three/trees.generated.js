// Généré par tools/vegetation/impostors.py : ne pas modifier à la main.
// Arbres du décor : dimensions (m), triangles du modèle proche, et pour chaque espèce sa ligne dans
// l'atlas des imposteurs (une colonne par angle de vue ; ortho : hauteur de la case en mètres ; baseV :
// hauteur du pied de l'arbre dans la case, depuis le bas). shrubs : végétation basse des jardins (buis,
// arbustes, module de haie : longueur, largeur, hauteur), toujours en 3D.
export const TREES = {
  "views": 8,
  "elevation": 28.0,
  "cell": [
    256,
    384
  ],
  "rows": 5,
  "species": {
    "chene": {
      "row": 0,
      "height": 19.22,
      "radius": 11.48,
      "ortho": 36.513,
      "baseV": 0.2677,
      "foliage": "broad",
      "triangles": 1316
    },
    "hetre": {
      "row": 1,
      "height": 23.65,
      "radius": 8.27,
      "ortho": 30.371,
      "baseV": 0.1562,
      "foliage": "broad",
      "triangles": 1342
    },
    "peuplier": {
      "row": 2,
      "height": 25.54,
      "radius": 3.91,
      "ortho": 27.794,
      "baseV": 0.0943,
      "foliage": "broad",
      "triangles": 924
    },
    "pin": {
      "row": 3,
      "height": 20.28,
      "radius": 8.51,
      "ortho": 27.451,
      "baseV": 0.1739,
      "foliage": "pine",
      "triangles": 720
    },
    "sapin": {
      "row": 4,
      "height": 22.46,
      "radius": 6.13,
      "ortho": 27.126,
      "baseV": 0.1345,
      "foliage": "fir",
      "triangles": 1188
    }
  },
  "shrubs": {
    "buis": {
      "height": 1.56,
      "radius": 0.9
    },
    "arbuste": {
      "height": 2.33,
      "radius": 1.8
    },
    "haie": {
      "height": 1.24,
      "radius": 1.44,
      "module": [
        2.0,
        0.9,
        1.0
      ]
    }
  }
};
