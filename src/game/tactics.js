import { clamp } from './utils';
import { ratingAt } from './players';

// Onze de départ (4-3-3) et tactique : décision d'avant-match, modifiable à la mi-temps.

export const SLOTS = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A'];

export const TACTICS = {
  offensive: {
    id: 'offensive', name: 'Offensive', for: 1.28, against: 1.22,
    blurb: 'Pressing haut, latéraux projetés : plus d’occasions des deux côtés.',
  },
  balanced: {
    id: 'balanced', name: 'Équilibrée', for: 1, against: 1,
    blurb: 'Bloc médian, transitions maîtrisées : le plan de référence.',
  },
  low: {
    id: 'low', name: 'Bloc bas', for: 0.72, against: 0.68,
    blurb: 'Défense regroupée et contres : match fermé, peu d’occasions.',
  },
};
export const TACTIC_ORDER = ['offensive', 'balanced', 'low'];

const HOME_BONUS = 1.06;

// Meilleur onze : chaque poste est d'abord pourvu par des joueurs de ce poste, puis par les meilleurs restants.
export function autoLineup(players) {
  const used = new Set();
  const lineup = Array(SLOTS.length).fill(null);
  SLOTS.forEach((pos, k) => {
    const natural = players.filter((p) => p.pos === pos && !used.has(p.id)).sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos));
    if (natural[0]) { lineup[k] = natural[0].id; used.add(natural[0].id); }
  });
  SLOTS.forEach((pos, k) => {
    if (lineup[k] !== null) return;
    const best = players.filter((p) => !used.has(p.id)).sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos))[0];
    if (best) { lineup[k] = best.id; used.add(best.id); }
  });
  return lineup;
}

// Répare un onze après des départs (retraite, libération) : garde les titulaires présents, complète au mieux.
export function repairLineup(players, lineup) {
  const ids = new Set(players.map((p) => p.id));
  const seen = new Set();
  const kept = (lineup || []).slice(0, SLOTS.length).map((id) => (ids.has(id) && !seen.has(id) && seen.add(id) ? id : null));
  while (kept.length < SLOTS.length) kept.push(null);
  if (kept.every((id) => id !== null)) return kept;
  const rest = players.filter((p) => !seen.has(p.id));
  return kept.map((id, k) => {
    if (id !== null) return id;
    const pos = SLOTS[k];
    rest.sort((a, b) => (b.pos === pos) - (a.pos === pos) || ratingAt(b, pos) - ratingAt(a, pos));
    const p = rest.shift();
    return p ? p.id : null;
  });
}

export function ensureLineup(s) {
  s.lineup = repairLineup(s.players, s.lineup || autoLineup(s.players));
  if (!TACTICS[s.tactic]) s.tactic = 'balanced';
  return s;
}

export const lineupPlayers = (players, lineup) => lineup.map((id) => players.find((p) => p.id === id)).filter(Boolean);

// Niveau d'un onze : même pondération par ligne que le moteur historique (gardien, défense, milieu, attaque).
export function lineupRating(players, lineup) {
  const line = { G: [], D: [], M: [], A: [] };
  lineup.forEach((id, k) => {
    const p = players.find((x) => x.id === id);
    line[SLOTS[k]].push(p ? ratingAt(p, SLOTS[k]) : 3);
  });
  const avg = (a, n) => (a.reduce((s, v) => s + v, 0) + (n - a.length) * 3) / n;
  return 0.12 * avg(line.G, 1) + 0.3 * avg(line.D, 4) + 0.26 * avg(line.M, 3) + 0.32 * avg(line.A, 3);
}

// Buts attendus (sur 90 minutes) selon l'écart de niveau, la tactique et l'avantage du terrain.
export function expectedGoals(rating, oppStrength, tacticId) {
  const t = TACTICS[tacticId] || TACTICS.balanced;
  const diff = rating - oppStrength;
  return {
    for: clamp(1.15 + diff * 0.22, 0.15, 3.6) * t.for * HOME_BONUS,
    against: clamp(1.15 - diff * 0.22, 0.15, 3.6) * t.against / HOME_BONUS,
  };
}

const poisson = (l, k) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
};

// Pronostic victoire / nul / défaite (loi de Poisson sur les buts attendus).
export function matchOdds(xg) {
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= 9; i++) {
    for (let j = 0; j <= 9; j++) {
      const p = poisson(xg.for, i) * poisson(xg.against, j);
      if (i > j) win += p; else if (i === j) draw += p; else loss += p;
    }
  }
  const t = win + draw + loss;
  return { win: win / t, draw: draw / t, loss: loss / t };
}
