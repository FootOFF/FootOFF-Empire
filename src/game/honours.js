import { DIVISIONS } from './constants';
import { ofDiv } from './cups';

// Palmarès : un trophée par compétition (le titre de chaque division, la Coupe nationale, la Coupe d'Europe des
// clubs), avec toutes ses victoires. Sert à l'allée d'honneur du parvis (3D) et à la salle des trophées.

const LEAGUE_TROPHIES = ['Coupe du District', 'Trophée de la Ligue', 'Plateau national', 'Trophée Élite'];

export const HONOURS = [
  ...DIVISIONS.map((d, i) => ({
    id: `league${i + 1}`, comp: 'league', division: d.name, unit: 'titre',
    name: `Champion ${ofDiv(d.name)}`, trophy: LEAGUE_TROPHIES[i],
  })),
  { id: 'cup', comp: 'cup', name: 'Coupe nationale', trophy: 'Coupe nationale', unit: 'victoire' },
  { id: 'c1', comp: 'c1', name: 'Coupe d’Europe des clubs', trophy: 'Coupe d’Europe', unit: 'victoire' },
];

// Trophée d'une victoire du palmarès (entrée de s.trophies).
export function honourId(t) {
  if (t.comp === 'league') {
    const i = DIVISIONS.findIndex((d) => d.name === t.division);
    return i >= 0 ? `league${i + 1}` : null;
  }
  return t.comp === 'cup' || t.comp === 'c1' ? t.comp : null;
}

export const plural = (n, unit) => `${n} ${unit}${n > 1 ? 's' : ''}`;

// Trophées gagnés, dans l'ordre des premières victoires : définition + victoires [{ season, opp }], nombre, première
// et dernière saison.
export function honoursOf(s) {
  const map = new Map();
  (s.trophies || []).forEach((t, i) => {
    const id = honourId(t);
    if (!id) return;
    if (!map.has(id)) map.set(id, { ...HONOURS.find((h) => h.id === id), order: i, wins: [] });
    map.get(id).wins.push({ season: t.season, opp: t.opp || null });
  });
  return [...map.values()]
    .map((h) => ({ ...h, count: h.wins.length, first: h.wins[0].season, last: h.wins[h.wins.length - 1].season }))
    .sort((a, b) => a.first - b.first || a.order - b.order);
}
