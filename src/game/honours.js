import { DIVISIONS } from './constants';
import { ofDiv } from './cups';
import { t } from '../i18n/index';

// Palmarès : un trophée par compétition (le titre de chaque division, la Coupe nationale, la Coupe d'Europe des
// clubs), avec toutes ses victoires. Sert à l'allée d'honneur du parvis (3D) et à la salle des trophées.

const LEAGUE_TROPHIES = [t('Coupe du District'), t('Trophée de la Ligue'), t('Plateau national'), t('Trophée Élite')];

export const HONOURS = [
  ...DIVISIONS.map((d, i) => ({
    id: `league${i + 1}`, comp: 'league', division: d.name, unit: 'titre',
    name: t('Champion {ofDiv}', { ofDiv: ofDiv(d.name) }), trophy: LEAGUE_TROPHIES[i],
  })),
  { id: 'cup', comp: 'cup', name: t('Coupe nationale'), trophy: t('Coupe nationale'), unit: 'victoire' },
  { id: 'c1', comp: 'c1', name: t('Coupe d’Europe des clubs'), trophy: t('Coupe d’Europe'), unit: 'victoire' },
];

// Trophée d'une victoire du palmarès (entrée de s.trophies).
export function honourId(t) {
  if (t.comp === 'league') {
    const i = DIVISIONS.findIndex((d) => d.name === t.division);
    return i >= 0 ? `league${i + 1}` : null;
  }
  return t.comp === 'cup' || t.comp === 'c1' ? t.comp : null;
}

export { plural } from '../i18n/index'; // un nombre et son unité, accordés (src/i18n)

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
