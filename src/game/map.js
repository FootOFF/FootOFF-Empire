import { BUILDINGS, DIVISIONS, LEAGUE_OPEN } from './constants';

export { buildingEffect } from './economy';

// Plan de l'Empire : 9 parcelles (t0..t8), toutes ouvertes dès la fondation. Le stade occupe t0 ; sur les huit
// autres, chaque bâtiment se pose où l'on veut (il n'y a plus de quartiers réservés ni de parcelles verrouillées).
// La 8e parcelle (t8, 0.8.0) accueille le Siège de la Ligue ; les parties plus anciennes la reçoivent vide.
// La réputation n'ouvre plus rien : elle attire le public, les sponsors et les joueurs (reputation.js).
// Un seul « secteur » reste dans les données (sector: 'main'), pour les sauvegardes et les appels existants.
export const SECTORS = [
  {
    id: 'main',
    name: 'Complexe',
    short: 'Complexe',
    repNeeded: 0,
    blurb: 'Ton complexe : le stade au centre, huit parcelles autour, à bâtir dans l’ordre que tu veux.',
  },
];

export const PLOTS = [
  { id: 't0', sector: 'main', building: 'terrain' },
  { id: 't1', sector: 'main', building: null },
  { id: 't2', sector: 'main', building: null },
  { id: 't3', sector: 'main', building: null },
  { id: 't4', sector: 'main', building: null },
  { id: 't5', sector: 'main', building: null },
  { id: 't6', sector: 'main', building: null },
  { id: 't7', sector: 'main', building: null },
  { id: 't8', sector: 'main', building: null },
];

export const PLOT_LABELS = {
  t0: 'Enceinte',
  t1: 'Parcelle 1',
  t2: 'Parcelle 2',
  t3: 'Parcelle 3',
  t4: 'Parcelle 4',
  t5: 'Parcelle 5',
  t6: 'Parcelle 6',
  t7: 'Parcelle 7',
  t8: 'Parcelle 8',
};

export const plotIndexOf = (plotId) => PLOTS.findIndex((p) => p.id === plotId);

// Une parcelle à bâtiment fixe (le stade sur t0) l'affiche toujours, quel que soit l'état des slots.
export const plotBuilding = (s, plotId) => {
  const i = plotIndexOf(plotId);
  return i === -1 ? null : PLOTS[i].building || s.slots[i];
};

// Parcelle où est construit un bâtiment (null s'il ne l'est pas).
export const plotOf = (s, key) => PLOTS.find((p) => plotBuilding(s, p.id) === key) || null;

// Garantit que les parcelles à bâtiment fixe sont occupées par celui-ci. Répare les sauvegardes où un
// bâtiment construit avait pris la place du stade : il est déplacé sur la première parcelle libre de son
// secteur (son niveau est conservé, il vit dans s.buildings).
export function ensureFixedPlots(s) {
  while (s.slots.length < PLOTS.length) s.slots.push(null); // parcelles ajoutées depuis (t8) : vides
  PLOTS.forEach((p, i) => {
    if (!p.building || s.slots[i] === p.building) return;
    const displaced = s.slots[i];
    s.slots[i] = p.building;
    if (!displaced || s.slots.includes(displaced)) return;
    const free = PLOTS.findIndex((q, j) => q.sector === p.sector && !q.building && s.slots[j] === null);
    if (free !== -1) s.slots[free] = displaced;
  });
  return s;
}

// Quel bâtiment peut-on poser sur une parcelle vide ? N'importe lequel, s'il n'est pas déjà construit : chaque
// bâtiment se construit une seule fois (le stade a sa parcelle). Le Siège de la Ligue, seulement en Élite. Dans un club
// de championnat entre amis, ni Bureau des transferts (le mercato y est celui de la ligue : marché commun, clubs de la
// ligue, amis ; 0.8.3) ni Siège.
export const ELITE_ONLY = ['league'];
export function allowedBuildingsFor(s) {
  const built = new Set(Object.keys(s.buildings).filter((k) => s.buildings[k] > 0));
  const elite = s.divisionIndex === DIVISIONS.length - 1;
  return ['training', 'academy', 'fans', 'sponsor', ...(s.league ? [] : ['transfers']), 'direction', 'medical', ...(LEAGUE_OPEN && elite && !s.league ? ['league'] : [])]
    .filter((k) => BUILDINGS[k] && !built.has(k));
}

