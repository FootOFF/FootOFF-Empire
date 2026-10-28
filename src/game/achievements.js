import { BUILDINGS, DIVISIONS } from './constants';
import { HONOURS, honoursOf } from './honours';
import { outcome, rebuildRecords } from './records';
import { playerRating } from './players';
import { totals } from './ledger';

// Succès : les grandes étapes de la vie du club, datées (saison, journée). Débloqués au fil du jeu ; une partie déjà
// commencée retrouve ceux que l'historique permet de dater (matchs, classements, palmarès, anciens joueurs).

const LAST = DIVISIONS[DIVISIONS.length - 1].name;
const fmt = (n) => n.toLocaleString('fr-FR');

// Familles (0.8.11, demande du PDG : des succès repensés, cohérents, plus nombreux). Une ligue entre amis n'affiche que
// ce qu'elle peut gagner (mode : « solo » ou « league », sinon les deux) : ni montée ni coupes, des amis à battre.
export const ACH_CATS = [
  ['honours', 'Titres et montées'], ['matches', 'Matchs et exploits'], ['players', 'Joueurs et académie'],
  ['club', 'Complexe et finances'], ['league', 'Ligue entre amis'],
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
const won = (m) => outcome(m) === 'win';
// tous les joueurs passés par le club, leurs saisons (hist) et la saison en cours
const everyone = (s) => [...s.players, ...(s.alumni || [])];
const bestSeason = (s, key, n) => everyone(s).some((p) => (p.hist || []).some((h) => (h[key] || 0) >= n) || (p.season?.[key] || 0) >= n);
// saisons de championnat terminées : { season: [matchs] }
const leagueSeasons = (s, X) => {
  const by = {};
  for (const m of X.matches) if ((m.comp || 'league') === 'league') (by[m.season] ||= []).push(m);
  return Object.entries(by).filter(([n, list]) => Number(n) < s.seasonNumber && list.length >= 7).map(([n, list]) => ({ season: Number(n), list }));
};
const appsOf = (p) => (p.hist || []).reduce((n, h) => n + (h.apps || 0), 0) + (p.season?.apps || 0);
const friendNames = (s) => new Set((s.rivals || []).filter((r) => r.human).map((r) => r.name));
const friendWins = (s, X, margin = 1) => { const f = friendNames(s); return X.matches.filter((m) => f.has(m.opp) && m.gf - m.ga >= margin); };

// test(s, X) : acquis ? date(s, X) : date retrouvée dans l'historique (sinon : maintenant).
export const ACHIEVEMENTS = [
  // palmarès : montées, titres, Europe
  { id: 'promotion', cat: 'honours', mode: 'solo', title: 'Montée', desc: 'Monter dans la division supérieure.',
    test: (s, X) => X.hist.some(promoted), date: (s, X) => seasonOf(X.hist.find(promoted)) },
  { id: 'elite', cat: 'honours', mode: 'solo', title: 'Parmi l’élite', desc: `Atteindre la division ${LAST}.`,
    test: (s, X) => s.divisionIndex === DIVISIONS.length - 1 || X.hist.some((h) => h.division === LAST),
    date: (s, X) => seasonOf(X.hist.find((h) => h.division === LAST)) },
  { id: 'europe', cat: 'honours', mode: 'solo', title: 'Les nuits européennes', desc: 'Jouer la Coupe d’Europe des clubs.',
    test: (s, X) => !!s.c1 || X.matches.some((m) => m.comp === 'c1'), date: (s, X) => firstMatch(X, (m) => m.comp === 'c1') },
  { id: 'first_title', cat: 'honours', mode: 'solo', title: 'Premier titre', desc: 'Être sacré champion de ta division.',
    test: (s, X) => X.honours.some((h) => h.comp === 'league'), date: (s, X) => firstHonour(X, (h) => h.comp === 'league') },
  { id: 'cup', cat: 'honours', mode: 'solo', title: 'La Coupe !', desc: 'Remporter la Coupe nationale.',
    test: (s, X) => X.honours.some((h) => h.comp === 'cup'), date: (s, X) => firstHonour(X, (h) => h.comp === 'cup') },
  { id: 'champion_elite', cat: 'honours', mode: 'solo', title: `Champion ${LAST === 'Élite' ? 'd’' : 'de '}${LAST}`, desc: 'Gagner le championnat de la plus haute division.',
    test: (s, X) => X.honours.some((h) => h.id === `league${DIVISIONS.length}`), date: (s, X) => firstHonour(X, (h) => h.id === `league${DIVISIONS.length}`) },
  { id: 'europe_win', cat: 'honours', mode: 'solo', title: 'Roi d’Europe', desc: 'Remporter la Coupe d’Europe des clubs.',
    test: (s, X) => X.honours.some((h) => h.comp === 'c1'), date: (s, X) => firstHonour(X, (h) => h.comp === 'c1') },
  { id: 'double', cat: 'honours', mode: 'solo', title: 'Le doublé', desc: 'Championnat et Coupe nationale la même saison.',
    test: (s, X) => !!sameSeason(X, ['league', 'cup']), date: (s, X) => sameSeason(X, ['league', 'cup']) },
  { id: 'treble', cat: 'honours', mode: 'solo', title: 'Le triplé', desc: 'Championnat, Coupe nationale et Coupe d’Europe la même saison.',
    test: (s, X) => !!sameSeason(X, ['league', 'cup', 'c1']), date: (s, X) => sameSeason(X, ['league', 'cup', 'c1']) },
  { id: 'full_cabinet', cat: 'honours', mode: 'solo', title: 'Vitrine complète', desc: 'Gagner au moins une fois chacune des six compétitions.',
    test: (s, X) => X.honours.length === HONOURS.length },

  // matchs et exploits
  { id: 'first_win', cat: 'matches', title: 'Première victoire', desc: 'Gagner un premier match officiel.',
    test: (s, X) => X.rec.totals.win > 0, date: (s, X) => X.rec.firsts.win },
  { id: 'first_clean', cat: 'matches', title: 'Cage inviolée', desc: 'Finir un match sans encaisser de but.',
    test: (s, X) => X.rec.totals.clean > 0, date: (s, X) => X.rec.firsts.clean },
  { id: 'comeback', cat: 'matches', title: 'Renversement', desc: 'Gagner un match après avoir été mené au score.',
    test: (s, X) => X.rec.comebacks > 0, date: (s, X) => X.rec.firsts.comeback },
  { id: 'late_goal', cat: 'matches', title: 'Au bout du suspense', desc: 'Gagner un match en marquant à la 90e minute ou après.',
    test: (s, X) => X.matches.some((m) => won(m) && (m.scorers || []).some((g) => g.minute >= 90)),
    date: (s, X) => firstMatch(X, (m) => won(m) && (m.scorers || []).some((g) => g.minute >= 90)) },
  { id: 'ten_men', cat: 'matches', title: 'À dix contre onze', desc: 'Gagner un match malgré un joueur expulsé.',
    test: (s, X) => X.matches.some((m) => won(m) && (m.stats?.red?.[0] || 0) > 0), date: (s, X) => firstMatch(X, (m) => won(m) && (m.stats?.red?.[0] || 0) > 0) },
  { id: 'shootout', cat: 'matches', mode: 'solo', title: 'Nerfs d’acier', desc: 'Gagner une séance de tirs au but.',
    test: (s, X) => X.matches.some((m) => m.pens && m.pens[0] > m.pens[1]), date: (s, X) => firstMatch(X, (m) => m.pens && m.pens[0] > m.pens[1]) },
  { id: 'giant_killer', cat: 'matches', title: 'Tombeur de géants', desc: 'Battre une équipe plus forte d’au moins un point et demi de niveau.',
    test: (s, X) => X.matches.some((m) => won(m) && m.myRating && (m.oppStrength || 0) - m.myRating >= 1.5),
    date: (s, X) => firstMatch(X, (m) => won(m) && m.myRating && (m.oppStrength || 0) - m.myRating >= 1.5) },
  { id: 'rout', cat: 'matches', title: 'Démonstration', desc: 'Gagner un match avec cinq buts d’écart.',
    test: (s, X) => !!X.rec.firsts.rout, date: (s, X) => X.rec.firsts.rout },
  { id: 'goal_fest', cat: 'matches', title: 'Festival offensif', desc: 'Marquer six buts dans un même match.',
    test: (s, X) => X.matches.some((m) => m.gf >= 6), date: (s, X) => firstMatch(X, (m) => m.gf >= 6) },
  { id: 'hat_trick', cat: 'matches', title: 'Coup du chapeau', desc: 'Un joueur marque trois buts dans le même match.',
    test: (s, X) => X.rec.hatTricks > 0, date: (s, X) => X.rec.firsts.hatTrick },
  { id: 'streak_5', cat: 'matches', title: 'Série en or', desc: 'Enchaîner cinq victoires.',
    test: (s, X) => (X.rec.best.win?.n || 0) >= 5, date: (s, X) => X.rec.best.win?.n >= 5 && X.rec.best.win.to },
  { id: 'streak_10', cat: 'matches', title: 'Série historique', desc: 'Enchaîner dix victoires.',
    test: (s, X) => (X.rec.best.win?.n || 0) >= 10, date: (s, X) => X.rec.best.win?.n >= 10 && X.rec.best.win.to },
  { id: 'unbeaten_10', cat: 'matches', title: 'Invaincus', desc: 'Dix matchs officiels sans défaite.',
    test: (s, X) => (X.rec.best.unbeaten?.n || 0) >= 10, date: (s, X) => X.rec.best.unbeaten?.n >= 10 && X.rec.best.unbeaten.to },
  { id: 'clean_5', cat: 'matches', title: 'Le mur', desc: 'Cinq matchs d’affilée sans encaisser.',
    test: (s, X) => (X.rec.best.clean?.n || 0) >= 5, date: (s, X) => X.rec.best.clean?.n >= 5 && X.rec.best.clean.to },
  { id: 'season_unbeaten', cat: 'matches', title: 'Saison sans défaite', desc: 'Finir une saison de championnat sans perdre un match.',
    test: (s, X) => leagueSeasons(s, X).some(({ list }) => list.every((m) => outcome(m) !== 'loss')),
    date: (s, X) => seasonOf(leagueSeasons(s, X).find(({ list }) => list.every((m) => outcome(m) !== 'loss'))) },
  { id: 'flawless', cat: 'matches', title: 'Sans faute', desc: 'Gagner tous tes matchs de championnat sur une saison.',
    test: (s, X) => leagueSeasons(s, X).some(({ list }) => list.every(won)), date: (s, X) => seasonOf(leagueSeasons(s, X).find(({ list }) => list.every(won))) },
  ...[[50, 'wins_50'], [100, 'wins_100'], [250, 'wins_250']].map(([n, id]) => ({
    id, cat: 'matches', title: `${fmt(n)} victoires`, desc: `Gagner ${fmt(n)} matchs officiels.`, test: (s, X) => X.rec.totals.win >= n,
  })),
  ...[[100, 'goals_100'], [500, 'goals_500']].map(([n, id]) => ({
    id, cat: 'matches', title: `${fmt(n)} buts`, desc: `Marquer ${fmt(n)} buts en matchs officiels.`, test: (s, X) => X.rec.totals.gf >= n,
  })),

  // joueurs et académie
  { id: 'academy', cat: 'players', title: 'Fait maison', desc: 'Faire jouer en match officiel un jeune formé au club.',
    test: (s) => s.players.some((p) => p.academy && p.season?.apps > 0) || (s.alumni || []).some((a) => a.academy && a.hist?.some((h) => h.apps > 0)) },
  { id: 'golden_gen', cat: 'players', title: 'Génération dorée', desc: 'Compter cinq joueurs formés au club dans l’effectif.',
    test: (s) => s.players.filter((p) => p.academy).length >= 5 },
  { id: 'prodigy', cat: 'players', title: 'La pépite', desc: 'Un joueur formé au club atteint 12 de niveau.',
    test: (s) => s.players.some((p) => p.academy && playerRating(p) >= 12) },
  { id: 'scorer_20', cat: 'players', title: 'Buteur de la saison', desc: 'Un joueur marque vingt buts dans la même saison.',
    test: (s) => bestSeason(s, 'goals', 20) },
  { id: 'playmaker', cat: 'players', title: 'Le maître à jouer', desc: 'Un joueur délivre quinze passes décisives dans la même saison.',
    test: (s) => bestSeason(s, 'assists', 15) },
  { id: 'motm_5', cat: 'players', title: 'Homme du match', desc: 'Un joueur est élu homme du match cinq fois dans la même saison.',
    test: (s) => bestSeason(s, 'motm', 5) },
  { id: 'characters', cat: 'players', title: 'Galerie de caractères', desc: 'Réunir dans l’effectif cinq signes distinctifs différents.',
    test: (s) => new Set(s.players.flatMap((p) => p.traits || [])).size >= 5 },
  { id: 'loyal', cat: 'players', title: 'Fidèle au maillot', desc: 'Un joueur dispute cinq saisons sous le maillot du club.',
    test: (s) => everyone(s).some((p) => (p.hist || []).filter((h) => h.apps > 0).length >= 5) },
  { id: 'legend', cat: 'players', title: 'Une légende', desc: 'Un joueur dispute cent matchs sous le maillot du club.',
    test: (s) => everyone(s).some((p) => appsOf(p) >= 100) },
  { id: 'free_gem', cat: 'players', title: 'Coup de flair', desc: 'Un joueur recruté libre dispute trente matchs pour le club.',
    test: (s) => { const free = new Set((s.mercatoLog || []).filter((x) => x.kind === 'in' && !x.fee).map((x) => x.id)); return everyone(s).some((p) => free.has(p.id) && appsOf(p) >= 30); } },
  { id: 'profit', cat: 'players', title: 'Plus-value', desc: 'Revendre un joueur au moins deux fois son prix d’achat.',
    test: (s) => { const log = s.mercatoLog || []; return log.some((o) => o.kind === 'out' && o.fee > 0 && log.some((i) => i.kind === 'in' && i.id === o.id && i.fee > 0 && o.fee >= 2 * i.fee)); } },
  { id: 'big_sale', cat: 'players', title: 'Vente millionnaire', desc: 'Vendre un joueur plus d’un million d’euros.',
    test: (s) => (s.alumni || []).some((a) => (a.fee || 0) >= 1e6),
    date: (s) => { const a = (s.alumni || []).find((x) => (x.fee || 0) >= 1e6); return a ? { season: a.left, round: a.leftRound ?? null } : null; } },
  { id: 'big_buy', cat: 'players', title: 'Recrue de prestige', desc: 'Recruter un joueur pour plus d’un million d’euros.',
    test: (s, X) => (X.rec.bestBuy?.fee || 0) >= 1e6 },

  // complexe et finances
  { id: 'first_build', cat: 'club', title: 'Premier chantier', desc: 'Construire un premier bâtiment au complexe.',
    test: (s) => Object.keys(BUILDINGS).some((k) => k !== 'terrain' && k !== 'league' && (s.buildings[k] || 0) > 0) || s.buildings.terrain >= 2 },
  { id: 'complex', cat: 'club', title: 'Complexe complet', desc: 'Construire tous les bâtiments du complexe.',
    test: (s) => Object.keys(BUILDINGS).filter((k) => k !== 'league').every((k) => (s.buildings[k] || 0) >= 1) }, // le Siège à part
  { id: 'modern', cat: 'club', title: 'Complexe moderne', desc: 'Porter tous les bâtiments du complexe au niveau 3.',
    test: (s) => Object.keys(BUILDINGS).filter((k) => k !== 'league').every((k) => (s.buildings[k] || 0) >= 3) },
  { id: 'partners', cat: 'club', title: 'Partenaires de prestige', desc: 'Porter le siège et les partenaires à leur niveau maximum.',
    test: (s) => (s.buildings.sponsor || 0) >= BUILDINGS.sponsor.max },
  { id: 'sold_out', cat: 'club', title: 'Guichets fermés', desc: 'Jouer dans un stade plein jusqu’à la dernière place.',
    test: (s, X) => X.rec.soldOut > 0, date: (s, X) => X.rec.firsts.soldOut },
  ...[[10000, 'crowd_10k'], [40000, 'crowd_40k']].map(([n, id]) => ({
    id, cat: 'club', title: `${fmt(n)} spectateurs`, desc: `Accueillir ${fmt(n)} spectateurs pour un match.`,
    test: (s, X) => (X.rec.crowd?.attendance || 0) >= n, date: (s, X) => firstMatch(X, (m) => (m.attendance || 0) >= n),
  })),
  { id: 'arena', cat: 'club', title: 'L’arène', desc: 'Construire l’arène (stade niveau 5).', test: (s) => s.buildings.terrain >= 5 },
  { id: 'stadium_max', cat: 'club', title: 'Le stade ultime', desc: 'Porter le stade à son niveau maximum.',
    test: (s) => s.buildings.terrain >= BUILDINGS.terrain.max },
  { id: 'gate_million', cat: 'club', title: 'Recette d’un million', desc: 'Un match rapporte plus d’un million d’euros.',
    test: (s, X) => (X.rec.gate?.revenue || 0) >= 1e6, date: (s, X) => firstMatch(X, (m) => (m.revenue || 0) >= 1e6) },
  { id: 'profit_season', cat: 'club', title: 'Saison bénéficiaire', desc: 'Finir une saison avec plus de recettes que de dépenses.',
    test: (s) => (s.ledger?.past || []).some((p) => totals(p.lines).net > 0), date: (s) => seasonOf((s.ledger?.past || []).find((p) => totals(p.lines).net > 0)) },
  ...[[1e6, 'million', 'Premier million'], [1e7, 'ten_millions', '10 millions'], [1e8, 'hundred_millions', '100 millions']].map(([n, id, title]) => ({
    id, cat: 'club', title, desc: `Avoir ${fmt(n)} € en caisse.`, test: (s) => s.money >= n,
  })),
  { id: 'seasons_10', cat: 'club', title: 'Une décennie', desc: 'Disputer dix saisons.',
    test: (s, X) => X.hist.length >= 10, date: (s, X) => seasonOf(X.hist[9]) },

  // ligue entre amis
  { id: 'derby_5', cat: 'league', mode: 'league', title: 'Patron du derby', desc: 'Battre des amis cinq fois en championnat.',
    test: (s, X) => friendWins(s, X).length >= 5, date: (s, X) => friendWins(s, X)[4] || null },
  { id: 'friend_rout', cat: 'league', mode: 'league', title: 'Correction amicale', desc: 'Battre un ami avec trois buts d’écart.',
    test: (s, X) => friendWins(s, X, 3).length > 0, date: (s, X) => friendWins(s, X, 3)[0] || null },
  { id: 'league_title', cat: 'league', mode: 'league', title: 'Champion entre amis', desc: 'Être sacré champion de la ligue.',
    test: (s) => (s.trophies || []).some((t) => t.comp === 'league'), date: (s) => seasonOf((s.trophies || []).find((t) => t.comp === 'league')) },
  { id: 'friend_deal', cat: 'league', mode: 'league', title: 'Affaire entre amis', desc: 'Conclure un transfert avec un ami.',
    test: (s) => { const f = friendNames(s); return (s.mercatoLog || []).some((x) => x.club && f.has(x.club)); } },
  { id: 'haggler', cat: 'league', mode: 'league', title: 'Négociateur', desc: 'Conclure un transfert entre amis après une contre-offre.',
    test: (s) => !!s.feats?.haggle },
];

// Les succès qu'une partie peut gagner : une ligue entre amis n'a ni montée ni coupes, une carrière n'a pas d'amis.
export const achievementsFor = (s) => ACHIEVEMENTS.filter((a) => !a.mode || (a.mode === 'league') === !!s.league);

const context = (s) => ({ rec: s.records || rebuildRecords(s), honours: honoursOf(s), hist: s.history || [], matches: s.matches || [] });

// Succès nouvellement acquis : [[id, { season, round }]] (date retrouvée dans l'historique, sinon maintenant).
export function newAchievements(s) {
  const X = context(s);
  const have = s.achievements || {};
  const now = { season: s.seasonNumber, round: s.round ?? null };
  const out = [];
  for (const a of achievementsFor(s)) {
    if (have[a.id] || !a.test(s, X)) continue;
    const d = (a.date && a.date(s, X)) || now;
    out.push([a.id, { season: d.season, round: d.round ?? null }]);
  }
  return out;
}

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);
