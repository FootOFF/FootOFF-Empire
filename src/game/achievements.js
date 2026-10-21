import { BUILDINGS, DIVISIONS } from './constants';
import { HONOURS, honoursOf } from './honours';
import { rebuildRecords } from './records';

// Succès : les grandes étapes de la vie du club, datées (saison, journée). Débloqués au fil du jeu ; une partie déjà
// commencée retrouve ceux que l'historique permet de dater (matchs, classements, palmarès, anciens joueurs).

const LAST = DIVISIONS[DIVISIONS.length - 1].name;
const fmt = (n) => n.toLocaleString('fr-FR');

export const ACH_CATS = [
  ['firsts', 'Premières fois'], ['honours', 'Palmarès'], ['milestones', 'Paliers'],
  ['stadium', 'Stade et complexe'], ['squad', 'Effectif et mercato'], ['money', 'Finances'],
];

const sameSeason = (X, ids) => {
  const by = {};
  for (const h of X.honours) for (const w of h.wins) (by[w.season] ||= new Set()).add(h.comp);
  const hit = Object.entries(by).find(([, comps]) => ids.every((c) => comps.has(c)));
  return hit ? { season: Number(hit[0]), round: null } : null;
};
const firstHonour = (X, pred) => {
  const wins = X.honours.filter(pred).flatMap((h) => h.wins).sort((a, b) => a.season - b.season);
  return wins[0] ? { season: wins[0].season, round: null } : null;
};
const firstMatch = (X, pred) => X.matches.find(pred) || null;
const seasonOf = (h) => (h ? { season: h.season, round: null } : null);
const promoted = (h) => h.position <= 2 && h.division !== LAST;

// test(s, X) : acquis ? date(s, X) : date retrouvée dans l'historique (sinon : maintenant).
export const ACHIEVEMENTS = [
  // premières fois
  { id: 'first_win', cat: 'firsts', title: 'Première victoire', desc: 'Gagner un premier match officiel.',
    test: (s, X) => X.rec.totals.win > 0, date: (s, X) => X.rec.firsts.win },
  { id: 'first_clean', cat: 'firsts', title: 'Cage inviolée', desc: 'Finir un match sans encaisser de but.',
    test: (s, X) => X.rec.totals.clean > 0, date: (s, X) => X.rec.firsts.clean },
  { id: 'rout', cat: 'firsts', title: 'Démonstration', desc: 'Gagner un match avec cinq buts d’écart.',
    test: (s, X) => !!X.rec.firsts.rout, date: (s, X) => X.rec.firsts.rout },
  { id: 'hat_trick', cat: 'firsts', title: 'Coup du chapeau', desc: 'Un joueur marque trois buts dans le même match.',
    test: (s, X) => X.rec.hatTricks > 0, date: (s, X) => X.rec.firsts.hatTrick },
  { id: 'comeback', cat: 'firsts', title: 'Renversement', desc: 'Gagner un match après avoir été mené au score.',
    test: (s, X) => X.rec.comebacks > 0, date: (s, X) => X.rec.firsts.comeback },
  { id: 'promotion', cat: 'firsts', title: 'Montée', desc: 'Monter dans la division supérieure.',
    test: (s, X) => X.hist.some(promoted), date: (s, X) => seasonOf(X.hist.find(promoted)) },
  { id: 'europe', cat: 'firsts', title: 'Les nuits européennes', desc: 'Jouer la Coupe d’Europe des clubs.',
    test: (s, X) => !!s.c1 || X.matches.some((m) => m.comp === 'c1'), date: (s, X) => firstMatch(X, (m) => m.comp === 'c1') },
  { id: 'elite', cat: 'firsts', title: 'Parmi l’élite', desc: `Atteindre la division ${LAST}.`,
    test: (s, X) => s.divisionIndex === DIVISIONS.length - 1 || X.hist.some((h) => h.division === LAST),
    date: (s, X) => seasonOf(X.hist.find((h) => h.division === LAST)) },
  // palmarès
  { id: 'first_title', cat: 'honours', title: 'Premier titre', desc: 'Être sacré champion de sa division.',
    test: (s, X) => X.honours.some((h) => h.comp === 'league'), date: (s, X) => firstHonour(X, (h) => h.comp === 'league') },
  { id: 'cup', cat: 'honours', title: 'La Coupe !', desc: 'Remporter la Coupe nationale.',
    test: (s, X) => X.honours.some((h) => h.comp === 'cup'), date: (s, X) => firstHonour(X, (h) => h.comp === 'cup') },
  { id: 'champion_elite', cat: 'honours', title: `Champion ${LAST === 'Elite' ? 'd’' : 'de '}${LAST}`, desc: 'Gagner le championnat de la plus haute division.',
    test: (s, X) => X.honours.some((h) => h.id === `league${DIVISIONS.length}`), date: (s, X) => firstHonour(X, (h) => h.id === `league${DIVISIONS.length}`) },
  { id: 'europe_win', cat: 'honours', title: 'Roi d’Europe', desc: 'Remporter la Coupe d’Europe des clubs.',
    test: (s, X) => X.honours.some((h) => h.comp === 'c1'), date: (s, X) => firstHonour(X, (h) => h.comp === 'c1') },
  { id: 'double', cat: 'honours', title: 'Le doublé', desc: 'Championnat et Coupe nationale la même saison.',
    test: (s, X) => !!sameSeason(X, ['league', 'cup']), date: (s, X) => sameSeason(X, ['league', 'cup']) },
  { id: 'treble', cat: 'honours', title: 'Le triplé', desc: 'Championnat, Coupe nationale et Coupe d’Europe la même saison.',
    test: (s, X) => !!sameSeason(X, ['league', 'cup', 'c1']), date: (s, X) => sameSeason(X, ['league', 'cup', 'c1']) },
  { id: 'full_cabinet', cat: 'honours', title: 'Vitrine complète', desc: 'Gagner au moins une fois chacune des six compétitions.',
    test: (s, X) => X.honours.length === HONOURS.length },
  // paliers
  ...[[50, 'wins_50'], [100, 'wins_100'], [250, 'wins_250']].map(([n, id]) => ({
    id, cat: 'milestones', title: `${fmt(n)} victoires`, desc: `Gagner ${fmt(n)} matchs officiels.`, test: (s, X) => X.rec.totals.win >= n,
  })),
  ...[[100, 'goals_100'], [500, 'goals_500']].map(([n, id]) => ({
    id, cat: 'milestones', title: `${fmt(n)} buts`, desc: `Marquer ${fmt(n)} buts en matchs officiels.`, test: (s, X) => X.rec.totals.gf >= n,
  })),
  { id: 'streak_5', cat: 'milestones', title: 'Série en or', desc: 'Enchaîner cinq victoires.',
    test: (s, X) => (X.rec.best.win?.n || 0) >= 5, date: (s, X) => X.rec.best.win?.n >= 5 && X.rec.best.win.to },
  { id: 'unbeaten_10', cat: 'milestones', title: 'Invaincus', desc: 'Dix matchs officiels sans défaite.',
    test: (s, X) => (X.rec.best.unbeaten?.n || 0) >= 10, date: (s, X) => X.rec.best.unbeaten?.n >= 10 && X.rec.best.unbeaten.to },
  { id: 'clean_5', cat: 'milestones', title: 'Le mur', desc: 'Cinq matchs d’affilée sans encaisser.',
    test: (s, X) => (X.rec.best.clean?.n || 0) >= 5, date: (s, X) => X.rec.best.clean?.n >= 5 && X.rec.best.clean.to },
  { id: 'seasons_10', cat: 'milestones', title: 'Une décennie', desc: 'Disputer dix saisons.',
    test: (s, X) => X.hist.length >= 10, date: (s, X) => seasonOf(X.hist[9]) },
  // stade et complexe
  { id: 'sold_out', cat: 'stadium', title: 'Guichets fermés', desc: 'Jouer dans un stade plein jusqu’à la dernière place.',
    test: (s, X) => X.rec.soldOut > 0, date: (s, X) => X.rec.firsts.soldOut },
  ...[[10000, 'crowd_10k'], [40000, 'crowd_40k']].map(([n, id]) => ({
    id, cat: 'stadium', title: `${fmt(n)} spectateurs`, desc: `Accueillir ${fmt(n)} spectateurs pour un match.`,
    test: (s, X) => (X.rec.crowd?.attendance || 0) >= n, date: (s, X) => firstMatch(X, (m) => (m.attendance || 0) >= n),
  })),
  { id: 'arena', cat: 'stadium', title: 'L’arène', desc: 'Construire l’arène (stade niveau 5).', test: (s) => s.buildings.terrain >= 5 },
  { id: 'stadium_max', cat: 'stadium', title: 'Le stade ultime', desc: 'Porter le stade à son niveau maximum.',
    test: (s) => s.buildings.terrain >= BUILDINGS.terrain.max },
  { id: 'complex', cat: 'stadium', title: 'Complexe complet', desc: 'Construire tous les bâtiments du complexe.',
    test: (s) => Object.keys(BUILDINGS).every((k) => (s.buildings[k] || 0) >= 1) },
  // effectif et mercato
  { id: 'academy', cat: 'squad', title: 'Fait maison', desc: 'Faire jouer en match officiel un jeune formé au club.',
    test: (s) => s.players.some((p) => p.academy && p.season?.apps > 0) || (s.alumni || []).some((a) => a.academy && a.hist?.some((h) => h.apps > 0)) },
  { id: 'big_sale', cat: 'squad', title: 'Coup de maître', desc: 'Vendre un joueur plus d’un million d’euros.',
    test: (s) => (s.alumni || []).some((a) => (a.fee || 0) >= 1e6),
    date: (s) => { const a = (s.alumni || []).find((x) => (x.fee || 0) >= 1e6); return a ? { season: a.left, round: a.leftRound ?? null } : null; } },
  { id: 'big_buy', cat: 'squad', title: 'Recrue de prestige', desc: 'Recruter un joueur pour plus d’un million d’euros.',
    test: (s, X) => (X.rec.bestBuy?.fee || 0) >= 1e6 },
  { id: 'legend', cat: 'squad', title: 'Une légende', desc: 'Un joueur dispute 100 matchs sous le maillot du club.',
    test: (s) => [...s.players, ...(s.alumni || [])].some((p) => (p.hist || []).reduce((n, h) => n + (h.apps || 0), 0) + (p.season?.apps || 0) >= 100) },
  // finances
  ...[[1e6, 'million', 'Premier million'], [1e7, 'ten_millions', '10 millions'], [1e8, 'hundred_millions', '100 millions']].map(([n, id, title]) => ({
    id, cat: 'money', title, desc: `Avoir ${fmt(n)} € en caisse.`, test: (s) => s.money >= n,
  })),
];

const context = (s) => ({ rec: s.records || rebuildRecords(s), honours: honoursOf(s), hist: s.history || [], matches: s.matches || [] });

// Succès nouvellement acquis : [[id, { season, round }]] (date retrouvée dans l'historique, sinon maintenant).
export function newAchievements(s) {
  const X = context(s);
  const have = s.achievements || {};
  const now = { season: s.seasonNumber, round: s.round ?? null };
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (have[a.id] || !a.test(s, X)) continue;
    const d = (a.date && a.date(s, X)) || now;
    out.push([a.id, { season: d.season, round: d.round ?? null }]);
  }
  return out;
}

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);
