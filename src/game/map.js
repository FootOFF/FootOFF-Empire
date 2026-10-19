import { BUILDINGS, capacity, OFFLINE_RATE, sponsorIncome } from './constants';

// Plan de l'Empire : 3 secteurs, 8 parcelles (t0..t7).
// Le terrain (t0) est l'ancre du secteur principal ; il existe dès le départ.
export const SECTORS = [
  {
    id: 'main',
    name: 'Complexe principal',
    short: 'Complexe',
    repNeeded: 0,
    blurb:
      'Le cœur de ton empire : ton terrain, son centre d’entraînement, son académie. C’est ici que naissent les talents.',
  },
  {
    id: 'supporters',
    name: 'Quartier des supporters',
    short: 'Supporters',
    repNeeded: 6,
    blurb:
      'Espace dédié aux supporters, aux événements et à l’ambiance. Améliore le remplissage du stade et la réputation gagnée par match.',
  },
  {
    id: 'partners',
    name: 'Zone des partenaires',
    short: 'Partenaires',
    repNeeded: 10,
    blurb:
      'Siège et hall partenaires : revenus réguliers, sponsors annuels et revenus même quand tu n’es pas là.',
  },
];

export const PLOTS = [
  { id: 't0', sector: 'main', building: 'terrain' },
  { id: 't1', sector: 'main', building: null },
  { id: 't2', sector: 'main', building: null },
  { id: 't3', sector: 'supporters', building: null },
  { id: 't4', sector: 'supporters', building: null },
  { id: 't5', sector: 'supporters', building: null },
  { id: 't6', sector: 'partners', building: null },
  { id: 't7', sector: 'partners', building: null },
];

export const PLOT_LABELS = {
  t0: 'Enceinte',
  t1: 'Parcelle A',
  t2: 'Parcelle B',
  t3: 'Parcelle C',
  t4: 'Parcelle D',
  t5: 'Parcelle E',
  t6: 'Parcelle F',
  t7: 'Parcelle G',
};

export const plotIndexOf = (plotId) => PLOTS.findIndex((p) => p.id === plotId);

// Une parcelle à bâtiment fixe (le stade sur t0) l'affiche toujours, quel que soit l'état des slots.
export const plotBuilding = (s, plotId) => {
  const i = plotIndexOf(plotId);
  return i === -1 ? null : PLOTS[i].building || s.slots[i];
};

// Garantit que les parcelles à bâtiment fixe sont occupées par celui-ci. Répare les sauvegardes où un
// bâtiment construit avait pris la place du stade : il est déplacé sur la première parcelle libre de son
// secteur (son niveau est conservé, il vit dans s.buildings).
export function ensureFixedPlots(s) {
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

export function isSectorUnlocked(s, sectorId) {
  const sec = SECTORS.find((x) => x.id === sectorId);
  return !!sec && s.reputation >= sec.repNeeded;
}

export function nextLockedSector(s) {
  return SECTORS.find((sec) => s.reputation < sec.repNeeded) || null;
}

// Quel bâtiment peut-on poser sur une parcelle vide ?
// Règle : chaque bâtiment se construit une seule fois ;
// training/academy -> main · fans -> supporters · sponsor -> partners.
export function allowedBuildingsFor(s, sectorId) {
  const built = new Set(Object.keys(s.buildings).filter((k) => s.buildings[k] > 0));
  const bySector = {
    main: ['training', 'academy'],
    supporters: ['fans'],
    partners: ['sponsor'],
  };
  return (bySector[sectorId] || []).filter((k) => BUILDINGS[k] && !built.has(k));
}

export function sectorProgress(s, sectorId) {
  const plots = PLOTS.filter((p) => p.sector === sectorId);
  const filled = plots.filter((p) => plotBuilding(s, p.id) !== null).length;
  return { filled, total: plots.length };
}

export function buildingEffect(key, lvl, divIndex) {
  switch (key) {
    case 'terrain':
      return `Capacité d’accueil : ${capacity(lvl)} places.`;
    case 'training':
      return `Progression estivale des joueurs : +${lvl * 25} %.`;
    case 'academy':
      return lvl > 0
        ? 'Révèle un jeune talent à fort potentiel à chaque fin de saison.'
        : 'Aucune révélation de talent tant que l’académie n’est pas construite.';
    case 'fans':
      return `Remplissage du stade : +${lvl * 5} % · Réputation gagnée par match : +${lvl * 10} %.`;
    case 'sponsor':
      return `Sponsors : ${sponsorIncome(lvl, divIndex)} € par saison · ${OFFLINE_RATE * lvl} € par heure, même hors ligne.`;
    default:
      return '';
  }
}
