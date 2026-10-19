import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from './constants';
import { expectedGate, matchGate, prizeFor, sponsorIncome, upkeepOf } from './economy';
import { clamp, ordinal, pick, rnd } from './utils';
import { clubAfter, randomClubName } from './names';
import { assignNumber, freshSeason, makePlayer, playerRating, progressPlayer, saleValue, wageOf, wantsRetirement } from './players';
import { quickMatch } from './live';
import { ensureLineup } from './tactics';
import { closeSeasonGoals, resetSeasonStats, sectorUnlockedEvent } from './goals';
import { book, closeLedger, markTreasury } from './ledger';

export function roundRobin(n) {
  const rounds = [];
  const rot = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (let r = 0; r < n - 1; r++) {
    const arr = [0, ...rot];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);
    rounds.push(pairs);
    rot.push(rot.shift());
  }
  return rounds;
}

export function pushJournal(s, entry) {
  s.journal.unshift(entry);
  if (s.journal.length > 40) s.journal.length = 40;
}

export function startSeason(s) {
  const div = DIVISIONS[s.divisionIndex];
  s.rivals = [];
  for (let i = 0; i < 7; i++) {
    const str = div.oppMin + (div.oppMax - div.oppMin) * (i / 6) + rnd(-0.3, 0.3);
    s.rivals.push({ name: randomClubName(), strength: Math.round(clamp(str, 3, 18) * 10) / 10 });
  }
  // ordre aléatoire : le calendrier ne commence plus toujours par le favori de la division
  for (let i = s.rivals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s.rivals[i], s.rivals[j]] = [s.rivals[j], s.rivals[i]];
  }
  s.schedule = roundRobin(8);
  s.round = 0;
  s.table = Array.from({ length: 8 }, () => ({ pts: 0, gd: 0, played: 0 }));
  s.market = [];
  for (let i = 0; i < 3; i++) {
    const p = makePlayer({ level: s.divisionIndex + 1 + rnd(-0.3, 0.4) });
    p.id = s.nextId++;
    s.market.push(p);
  }
  resetSeasonStats(s);
}

function applyResult(s, i, j, gi, gj) {
  const a = s.table[i];
  const b = s.table[j];
  a.played++;
  b.played++;
  a.gd += gi - gj;
  b.gd += gj - gi;
  if (gi > gj) a.pts += 3;
  else if (gj > gi) b.pts += 3;
  else {
    a.pts++;
    b.pts++;
  }
}

function quickSim(si, sj) {
  const d = si - sj;
  const g1 = Math.max(0, Math.round(1.15 + d * 0.22 + rnd(-0.9, 0.9)));
  const g2 = Math.max(0, Math.round(1.15 - d * 0.22 + rnd(-0.9, 0.9)));
  return [g1, g2];
}

function reportText(s, res) {
  const att = res.attendance;
  const opp = (prep = '') => clubAfter(prep, res.oppName); // « contre l’AS… », « face au FC… »
  const buts = res.gf
    ? `Buts : ${res.scorers.map((x) => `${x.name} ${ordinal(x.minute, true)}`).join(', ')}.`
    : `${s.clubName} n’a pas trouvé la faille.`;
  let intro;
  if (res.gf > res.ga) {
    intro = pick([
      `Devant ${att} spectateurs, ${s.clubName} a fait le métier contre ${opp()}.`,
      `Soirée propre : ${s.clubName} maîtrise ${opp()} et repart avec les trois points.`,
      `Le projet avance. ${s.clubName} a construit son succès sur un bloc solide, devant ${att} spectateurs.`,
    ]);
  } else if (res.gf === res.ga) {
    intro = pick([
      `${s.clubName} et ${opp()} se sont neutralisés (${att} spectateurs). Un point de plus, mais on en voulait trois.`,
      `Match serré face ${opp('à ')} : aucune équipe n’a trouvé la faille décisive.`,
    ]);
  } else {
    intro = pick([
      `Frustration au coup de sifflet final : ${s.clubName} s’incline contre ${opp()}.`,
      `Soirée difficile devant ${att} spectateurs — ${s.clubName} a manqué de tranchant dans la surface.`,
      `Rien ne fonctionne ce soir. Défaite logique face ${opp('à ')}.`,
    ]);
  }
  return `${intro} ${buts} Recettes : ${new Intl.NumberFormat('fr-FR').format(res.revenue)} €.`;
}

// Contexte du prochain match à domicile : adversaire et affluence attendue.
export function matchContext(s) {
  if (s.round >= 7) return null;
  const pr = s.schedule[s.round].find((p) => p.includes(0));
  const oppIdx = pr[0] === 0 ? pr[1] : pr[0];
  const opp = s.rivals[oppIdx - 1];
  return {
    opp,
    oppIdx,
    gate: expectedGate(s, opp), // estimation : affluence, recettes (sans l'aléa du jour)
    repMult: 1 + s.buildings.fans * 0.1,
  };
}

// Applique le résultat de notre match (joué en direct ou d'un bloc) et joue les autres rencontres.
export function applyMatchResult(s, live) {
  const ctx = matchContext(s);
  if (!ctx) return s;
  for (const [i, j] of s.schedule[s.round]) {
    if (i === 0 || j === 0) continue;
    const [gi, gj] = quickSim(s.rivals[i - 1].strength, s.rivals[j - 1].strength);
    applyResult(s, i, j, gi, gj);
  }
  const gate = matchGate(s, ctx.opp); // affluence et recettes du jour (avant mise à jour du classement)
  const res = {
    ...live,
    attendance: gate.attendance,
    capacity: gate.capacity,
    demand: gate.demand,
    breakdown: gate.breakdown,
    revenue: gate.revenue,
    repDelta: Math.round((live.gf > live.ga ? 1 : live.gf === live.ga ? 0.2 : -0.6) * ctx.repMult * 10) / 10,
  };
  applyResult(s, 0, ctx.oppIdx, res.gf, res.ga);
  // vie des joueurs : matchs, buts, passes, cartons, note du match et forme (5 derniers matchs)
  for (const st of live.players || []) {
    const p = s.players.find((q) => q.id === st.id);
    if (!p) continue;
    p.season ||= freshSeason();
    p.season.apps++;
    p.season.goals += st.goals;
    p.season.assists += st.assists;
    p.season.yellow += st.yellow;
    p.season.red += st.red;
    p.season.sum += st.rating;
    p.form = [...(p.form || []), st.rating].slice(-5);
  }
  s.money += res.revenue;
  for (const [k, v] of Object.entries(res.breakdown)) book(s, k, v);
  markTreasury(s);
  s.seasonStats.gate = (s.seasonStats.gate || 0) + res.revenue; // recettes cumulées, pour le bilan
  if (gate.attendance >= gate.capacity * 0.6) s.seasonStats.crowd = true;
  s.reputation = Math.max(0, Math.round((s.reputation + res.repDelta) * 10) / 10);
  s.round++;
  s.lastMatch = { ...res, round: s.round };
  const score = `${res.gf}–${res.ga}`;
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'match',
    title: res.gf > res.ga ? `Victoire ${score} face ${clubAfter('à ', res.oppName)}` : res.gf === res.ga ? `Match nul ${score} contre ${clubAfter('', res.oppName)}` : `Défaite ${score} face ${clubAfter('à ', res.oppName)}`,
    text: reportText(s, res),
  });
  return s;
}

// Match joué d'un bloc, sans écran de direct.
export function playRound(s) {
  const ctx = matchContext(s);
  if (!ctx) return s;
  ensureLineup(s);
  return applyMatchResult(s, quickMatch(s, ctx));
}

export function standingsOf(s) {
  return s.table
    .map((t, i) => ({ i, ...t, name: i === 0 ? s.clubName : s.rivals[i - 1].name }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.name.localeCompare(b.name));
}

export function nextOpponent(s) {
  if (s.round >= 7) return null;
  const pr = s.schedule[s.round].find((p) => p.includes(0));
  const oppIdx = pr[0] === 0 ? pr[1] : pr[0];
  return s.rivals[oppIdx - 1];
}

const n = (v) => new Intl.NumberFormat('fr-FR').format(v);

export function endSeason(s) {
  const standings = standingsOf(s);
  const position = standings.findIndex((t) => t.i === 0) + 1;
  const div = DIVISIONS[s.divisionIndex];
  const prize = prizeFor(position, s.divisionIndex);
  const sponsors = sponsorIncome(s.buildings.sponsor, s.divisionIndex);
  const wages = s.players.reduce((sum, p) => sum + wageOf(p, s.divisionIndex), 0);
  const upkeep = upkeepOf(s);
  const promoted = position <= 2 && s.divisionIndex < 3;
  const relegated = position >= 7 && s.divisionIndex > 0;

  s.money += prize + sponsors - wages - upkeep;
  book(s, 'prize', prize);
  book(s, 'sponsors', sponsors);
  book(s, 'wages', wages);
  book(s, 'upkeep', upkeep);
  const events = [];
  // Plan de redressement : saison bouclée dans le rouge → le conseil vend les plus gros salaires.
  while (s.money < 0 && s.players.length > SQUAD_MIN + 2) {
    const p = [...s.players].sort((a, b) => wageOf(b, s.divisionIndex) - wageOf(a, s.divisionIndex))[0];
    const fee = saleValue(p, s.divisionIndex);
    s.players.splice(s.players.indexOf(p), 1);
    s.money += fee;
    book(s, 'sales', fee);
    events.push(`Plan de redressement : comptes dans le rouge, le conseil vend ${p.name} (${n(fee)} €).`);
  }
  const repBefore = s.reputation;
  s.reputation = Math.max(0, Math.round((s.reputation + (promoted ? 4 : relegated ? -3 : 0)) * 10) / 10);

  for (const p of s.players) {
    // bilan individuel de la saison, puis progression de l'été
    const st = p.season || freshSeason();
    p.hist = [...(p.hist || []), {
      season: s.seasonNumber, rating: Math.round(playerRating(p) * 10) / 10, apps: st.apps, goals: st.goals,
      assists: st.assists, avg: st.apps ? Math.round((st.sum / st.apps) * 10) / 10 : null,
    }].slice(-10);
    p.season = freshSeason();
    progressPlayer(p, s.buildings.training);
    p.age += 1;
  }
  const staying = [];
  for (const p of s.players) {
    if (wantsRetirement(p)) events.push(`${p.name} (${p.age} ans) raccroche les crampons.`);
    else staying.push(p);
  }
  s.players = staying;

  if (s.buildings.academy > 0 && s.players.length < SQUAD_MAX) {
    const y = makePlayer({ youth: true, academy: s.buildings.academy });
    y.id = s.nextId++;
    y.joined = s.seasonNumber + 1;
    assignNumber(s.players, y);
    s.players.push(y);
    events.push(`L’académie révèle ${y.name} (${y.age} ans, ${POS_LABELS[y.pos]}).`);
  }
  while (s.players.length < SQUAD_MIN) {
    const p = makePlayer({ level: Math.max(0, s.divisionIndex - 0.5) });
    p.id = s.nextId++;
    p.joined = s.seasonNumber + 1;
    assignNumber(s.players, p);
    s.players.push(p);
    events.push(`Amateur de secours : ${p.name} (${p.age} ans) complète l’effectif.`);
  }

  s.history.push({ season: s.seasonNumber, division: div.name, position });
  const nextDivName = DIVISIONS[clamp(s.divisionIndex + (promoted ? 1 : relegated ? -1 : 0), 0, 3)].name;
  const matchday = s.seasonStats?.gate || 0;
  s.seasonReview = { position, division: div.name, matchday, prize, sponsors, wages, upkeep, promoted, relegated, events, nextDivision: nextDivName };
  closeSeasonGoals(s, events);
  sectorUnlockedEvent(s, repBefore);
  pushJournal(s, {
    season: s.seasonNumber,
    kind: 'saison',
    title: promoted ? `Montée ! ${s.clubName} termine ${ordinal(position)} de ${div.name}` : relegated ? `Descente : ${ordinal(position, true)} place en ${div.name}` : `Saison ${s.seasonNumber} bouclée à la ${ordinal(position, true)} place`,
    text: `Saison ${s.seasonNumber} terminée : ${ordinal(position)} en ${div.name}.${promoted ? ' Montée !' : relegated ? ' Descente.' : ''} Prime : ${n(prize)} € · Sponsors : ${n(sponsors)} € · Salaires : −${n(wages)} € · Entretien : −${n(upkeep)} €.`,
  });

  closeLedger(s, div.name); // comptes de la saison bouclés (primes d'objectif comprises)
  if (promoted) s.divisionIndex += 1;
  if (relegated) s.divisionIndex -= 1;
  s.seasonNumber += 1;
  s.lastMatch = null;
  ensureLineup(s); // retraites, révélations de l'académie : l'onze est complété
  startSeason(s);
  return s;
}
