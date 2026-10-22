import { clamp } from './utils';
import { ratingAt } from './players';

// Onze de départ, dispositif (formation) et tactique : décisions d'avant-match ; la tactique se change aussi à la
// mi-temps. Le onze est une liste de 11 joueurs rangés dans l'ordre des postes du dispositif (gardien, défenseurs,
// milieux, attaquants).

// Dispositifs : nombre de défenseurs, milieux, attaquants ; effet sur les occasions (for = les nôtres, against =
// celles de l'adversaire, appliqués ensemble : un dispositif ouvert rend le match plus fou des deux côtés, un
// dispositif fermé le resserre) ; position de chaque poste sur le schéma (en %, attaque vers le haut).
export const FORMATIONS = {
  '433': {
    id: '433', name: '4-3-3', lines: [4, 3, 3], for: 1, against: 1,
    blurb: 'Trois attaquants, trois milieux : le dispositif de référence, équilibré.',
    pitch: [[50, 88], [14, 68], [37, 73], [63, 73], [86, 68], [27, 47], [50, 52], [73, 47], [20, 21], [50, 15], [80, 21]],
  },
  '442': {
    id: '442', name: '4-4-2', lines: [4, 4, 2], for: 0.96, against: 0.96,
    blurb: 'Deux lignes de quatre et un duo en pointe : compact, simple, solide.',
    pitch: [[50, 88], [14, 68], [37, 73], [63, 73], [86, 68], [14, 46], [38, 50], [62, 50], [86, 46], [36, 20], [64, 20]],
  },
  '4231': {
    id: '4231', name: '4-2-3-1', lines: [4, 5, 1], for: 0.93, against: 0.93,
    blurb: 'Deux récupérateurs, trois meneurs, un seul attaquant : on tient le ballon et le match se ferme.',
    pitch: [[50, 88], [14, 68], [37, 73], [63, 73], [86, 68], [37, 54], [63, 54], [18, 34], [50, 30], [82, 34], [50, 12]],
  },
  '352': {
    id: '352', name: '3-5-2', lines: [3, 5, 2], for: 1.04, against: 1.04,
    blurb: 'Cinq milieux pour dominer l’entrejeu, deux attaquants, mais trois défenseurs seulement.',
    pitch: [[50, 88], [26, 72], [50, 70], [74, 72], [10, 46], [32, 52], [50, 43], [68, 52], [90, 46], [36, 20], [64, 20]],
  },
  '343': {
    id: '343', name: '3-4-3', lines: [3, 4, 3], for: 1.12, against: 1.12,
    blurb: 'Tout pour l’attaque : beaucoup d’occasions, et beaucoup d’espace laissé derrière.',
    pitch: [[50, 88], [26, 72], [50, 70], [74, 72], [14, 48], [38, 52], [62, 52], [86, 48], [20, 22], [50, 15], [80, 22]],
  },
  '532': {
    id: '532', name: '5-3-2', lines: [5, 3, 2], for: 0.86, against: 0.86,
    blurb: 'Cinq défenseurs et des contres : match fermé, très difficile à battre.',
    pitch: [[50, 88], [8, 62], [28, 72], [50, 70], [72, 72], [92, 62], [28, 48], [50, 52], [72, 48], [36, 22], [64, 22]],
  },
};
export const FORMATION_ORDER = ['433', '442', '4231', '352', '343', '532'];
export const formationOf = (f) => FORMATIONS[f] || FORMATIONS['433'];
export const slotsOf = (f) => {
  const [d, m, a] = formationOf(f).lines;
  return ['G', ...Array(d).fill('D'), ...Array(m).fill('M'), ...Array(a).fill('A')];
};
export const SLOTS = slotsOf('433'); // dispositif par défaut (adversaires, anciennes parties)

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

// Affectation optimale (méthode hongroise) : n lignes (postes) × m colonnes (joueurs), n ≤ m, coût minimal.
function hungarian(a) {
  const n = a.length;
  const m = a[0].length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

// Meilleur onze : la répartition des joueurs sur les postes du dispositif qui donne le niveau d'équipe le plus haut
// (même pondération que lineupRating). Un joueur hors de son poste est retenu s'il y reste meilleur que le
// spécialiste ; à égalité, le joueur à son poste naturel passe devant.
export function autoLineup(players, formation = '433') {
  const slots = slotsOf(formation);
  const [nd, nm, na] = formationOf(formation).lines;
  const weight = { G: 0.12, D: 0.3 / nd, M: 0.26 / nm, A: 0.32 / na };
  const cols = [...players];
  while (cols.length < slots.length) cols.push(null); // effectif trop court : poste laissé vide (niveau 3)
  const cost = slots.map((pos) => cols.map((p) => (p ? -(weight[pos] * ratingAt(p, pos)) - (p.pos === pos ? 1e-4 : 0) : -weight[pos] * 3)));
  return hungarian(cost).map((j) => (cols[j] ? cols[j].id : null));
}

// Répare un onze après des départs (retraite, libération) : garde les titulaires présents, complète au mieux.
export function repairLineup(players, lineup, formation = '433') {
  const slots = slotsOf(formation);
  const ids = new Set(players.map((p) => p.id));
  const seen = new Set();
  const kept = (lineup || []).slice(0, slots.length).map((id) => (ids.has(id) && !seen.has(id) && seen.add(id) ? id : null));
  while (kept.length < slots.length) kept.push(null);
  if (kept.every((id) => id !== null)) return kept;
  const rest = players.filter((p) => !seen.has(p.id));
  return kept.map((id, k) => {
    if (id !== null) return id;
    const pos = slots[k];
    rest.sort((a, b) => (b.pos === pos) - (a.pos === pos) || ratingAt(b, pos) - ratingAt(a, pos));
    const p = rest.shift();
    return p ? p.id : null;
  });
}

export function ensureLineup(s) {
  if (!FORMATIONS[s.formation]) s.formation = '433';
  s.lineup = repairLineup(s.players, s.lineup || autoLineup(s.players, s.formation), s.formation);
  if (!TACTICS[s.tactic]) s.tactic = 'balanced';
  return s;
}

// Changement de dispositif : les mêmes onze joueurs sont replacés au mieux dans les nouveaux postes.
export function reshapeLineup(players, lineup, formation) {
  const eleven = lineup.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  return repairLineup(players, autoLineup(eleven, formation), formation);
}

export const lineupPlayers = (players, lineup) => lineup.map((id) => players.find((p) => p.id === id)).filter(Boolean);

// Niveau d'un onze : même pondération par ligne que le moteur historique (gardien, défense, milieu, attaque).
// Le poids de chaque ligne ne dépend pas du dispositif : un dispositif à un seul attaquant ne compte que le
// meilleur, à cinq défenseurs la moyenne des cinq. Le bon dispositif est celui qui met en valeur ton effectif.
export function lineupRating(players, lineup, formation = '433') {
  const slots = slotsOf(formation);
  const [nd, nm, na] = formationOf(formation).lines;
  const line = { G: [], D: [], M: [], A: [] };
  lineup.forEach((id, k) => {
    const p = players.find((x) => x.id === id);
    if (slots[k]) line[slots[k]].push(p ? ratingAt(p, slots[k]) : 3);
  });
  const avg = (a, n) => (a.reduce((s, v) => s + v, 0) + (n - a.length) * 3) / n;
  const leader = lineup.some((id) => players.find((x) => x.id === id)?.traits?.includes('leader')) ? 0.1 : 0;
  return 0.12 * avg(line.G, 1) + 0.3 * avg(line.D, nd) + 0.26 * avg(line.M, nm) + 0.32 * avg(line.A, na) + leader;
}

// Buts attendus (sur 90 minutes) selon l'écart de niveau, la tactique et l'avantage du terrain.
export function expectedGoals(rating, oppStrength, tacticId, formationId = '433') {
  const t = TACTICS[tacticId] || TACTICS.balanced;
  const f = formationOf(formationId);
  const diff = rating - oppStrength;
  return {
    for: clamp(1.15 + diff * 0.22, 0.15, 3.6) * t.for * f.for * HOME_BONUS,
    against: clamp(1.15 - diff * 0.22, 0.15, 3.6) * t.against * f.against / HOME_BONUS,
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
