// Grille d'urbanisme de l'Empire.
// Échelle : 1 unité = 10 m. Un terrain réglementaire (105 × 68 m) ≈ 10,5 × 6,8 unités.
// Toutes les positions/emprises 3D viennent d'ici : plus rien n'est codé en dur dans la scène.

export const PLOT_SIZE = 6; // parcelle standard : 60 × 60 m
export const STADIUM_FOOTPRINT = { w: 16, d: 13 }; // emprise réservée au stade (t0)

// [x, z] du centre de chaque parcelle.
// Secteur principal : stade au centre, A/B au nord. Supporters à l'ouest, partenaires à l'est.
export const PLOT_POS = {
  t0: [0, 0],
  t1: [-4.5, -11], t2: [4.5, -11],
  t3: [-13, -7], t4: [-13, 0], t5: [-13, 7],
  t6: [13, -3.5], t7: [13, 3.5],
};

export function footprintOf(plotId) {
  return plotId === 't0' ? STADIUM_FOOTPRINT : { w: PLOT_SIZE, d: PLOT_SIZE };
}

// Esplanade pavée qui englobe toutes les parcelles (+ marge pour les routes).
export const PLAZA = { minX: -17.5, maxX: 17.5, minZ: -15.5, maxZ: 11.5 };
export const PLAZA_CENTER = [(PLAZA.minX + PLAZA.maxX) / 2, (PLAZA.minZ + PLAZA.maxZ) / 2];
export const PLAZA_SIZE = [PLAZA.maxX - PLAZA.minX, PLAZA.maxZ - PLAZA.minZ];

// Vérification de cohérence (dev) : aucune emprise ne doit en chevaucher une autre.
export function layoutOverlaps() {
  const ids = Object.keys(PLOT_POS);
  const box = (id) => {
    const [x, z] = PLOT_POS[id];
    const { w, d } = footprintOf(id);
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  };
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = box(ids[i]), b = box(ids[j]);
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) out.push([ids[i], ids[j]]);
  }
  return out;
}
