import { DIVISIONS } from './constants';
import { playerRating } from './players';
import { seasonLine } from './season';

// Parcours complet d'un joueur passé par le club, qu'il y soit encore ou non : saisons (la saison en cours
// comprise), totaux, meilleurs matchs, distinctions, âge aujourd'hui et niveau.

const KEYS = ['apps', 'goals', 'assists', 'motm', 'yellow', 'red', 'minutes', 'shots', 'onTarget', 'clean'];
const LAST_DIV = DIVISIONS[DIVISIONS.length - 1].name;

export function careerOf(s, id) {
  const cur = s.players.find((p) => p.id === id);
  const old = cur ? null : (s.alumni || []).find((a) => a.id === id);
  const base = cur || old;
  if (!base) return null;
  const hist = [...(base.hist || [])];
  if (cur && cur.season?.apps && !hist.some((h) => h.season === s.seasonNumber)) hist.push({ ...seasonLine(s, cur), current: true });
  const totals = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let sum = 0;
  for (const h of hist) {
    for (const k of KEYS) totals[k] += h[k] || 0;
    sum += (h.avg || 0) * (h.apps || 0);
  }
  totals.avg = totals.apps ? sum / totals.apps : null;
  const games = (s.matches || [])
    .map((m) => ({ m, row: (m.players || []).find((q) => q.id === id) }))
    .filter((x) => x.row);
  const best = games.slice().sort((a, b) => b.row.rating - a.row.rating || b.row.goals - a.row.goals || b.m.season - a.m.season).slice(0, 5);
  const joined = base.joined ?? 1;
  const until = old ? old.left : s.seasonNumber;
  const atClub = (h) => h.season >= joined && h.season <= until;
  const titles = (s.history || []).filter((h) => atClub(h) && h.position === 1);
  const promotions = (s.history || []).filter((h) => atClub(h) && h.position <= 2 && h.division !== LAST_DIV);
  const rating = cur ? Math.round(playerRating(cur) * 10) / 10 : old.rating;
  return {
    id,
    p: base,
    current: !!cur,
    old,
    hist,
    totals,
    games: games.length,
    best,
    joined,
    until,
    seasons: Math.max(1, until - joined + 1),
    age: cur ? cur.age : old.age + Math.max(0, s.seasonNumber - old.ageSeason),
    rating,
    peak: Math.max(rating, ...hist.map((h) => h.rating || 0)),
    titles,
    promotions,
  };
}

// Tous les joueurs passés par le club (classements « carrière », légendes du club).
export function allCareers(s) {
  return [...s.players.map((p) => p.id), ...(s.alumni || []).map((a) => a.id)].map((id) => careerOf(s, id)).filter(Boolean);
}

// Meilleur buteur du club pour chaque saison (distinction de la fiche carrière).
export function topScorers(careers) {
  const best = {};
  for (const c of careers) {
    for (const h of c.hist) {
      if (!h.goals || h.current) continue;
      if (!best[h.season] || h.goals > best[h.season].goals) best[h.season] = { goals: h.goals, ids: [c.id] };
      else if (h.goals === best[h.season].goals) best[h.season].ids.push(c.id);
    }
  }
  return best;
}
