// Grille d'urbanisme de l'Empire.
// Échelle : 1 unité = 10 m. Un terrain réglementaire (105 × 68 m) ≈ 10,5 × 6,8 unités.
// Toutes les positions/emprises 3D viennent d'ici : plus rien n'est codé en dur dans la scène.

export const PLOT_SIZE = 6; // parcelle standard : 60 × 60 m
export const STADIUM_FOOTPRINT = { w: 16, d: 13 }; // emprise réservée au stade (t0)
// arène des niveaux 5 et 6 : plus large, elle déborde sur les allées de l'esplanade (sans toucher les parcelles)
export const ARENA_FOOTPRINT = { w: 19, d: 15 };

// [x, z] du centre de chaque parcelle.
// Secteur principal : stade au centre sur son esplanade, deux parcelles au nord, trois à l'ouest, trois à l'est
// (symétriques depuis la 8e parcelle, 0.8.0 : le Siège de la Ligue).
// Les parcelles sont écartées du stade : allées et jardins entre elles, boulevard périphérique autour
// (voir tools/blender/models/build_site.py, même plan en mètres).
export const PLOT_POS = {
  t0: [0, 0],
  t1: [-4.5, -15.5], t2: [4.5, -15.5],
  t3: [-17.5, -7.5], t4: [-17.5, 0], t5: [-17.5, 7.5],
  t6: [17.5, -7.5], t7: [17.5, 0], t8: [17.5, 7.5],
};

export function footprintOf(plotId, lvl = 0) {
  if (plotId === 't0') return lvl >= 5 ? ARENA_FOOTPRINT : STADIUM_FOOTPRINT;
  return { w: PLOT_SIZE, d: PLOT_SIZE };
}

// Emprise du complexe jusqu'au boulevard périphérique (esplanade procédurale tant que le site n'est pas chargé).
export const PLAZA = { minX: -24, maxX: 24, minZ: -23, maxZ: 18.8 };
export const PLAZA_CENTER = [(PLAZA.minX + PLAZA.maxX) / 2, (PLAZA.minZ + PLAZA.maxZ) / 2];
export const PLAZA_SIZE = [PLAZA.maxX - PLAZA.minX, PLAZA.maxZ - PLAZA.minZ];

// Vérification de cohérence (dev) : aucune emprise ne doit en chevaucher une autre.
export function layoutOverlaps() {
  const ids = Object.keys(PLOT_POS);
  const box = (id) => {
    const [x, z] = PLOT_POS[id];
    const { w, d } = footprintOf(id, 6); // emprise maximale : l'arène ne doit toucher aucune parcelle
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  };
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = box(ids[i]), b = box(ids[j]);
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) out.push([ids[i], ids[j]]);
  }
  return out;
}
