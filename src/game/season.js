import { DIVISIONS, SQUAD_MIN } from './constants';
import { pushJournal } from './journal';
import { REP_DECAY, REP_DIVISION } from './reputation';
import { refreshSales, refreshTransfers } from './transfers';
import { refreshScouting, trainYouth, youthSeasonEnd } from './academy';
import { leagueRounds, logMove } from './mercato';
import { accrueDues, awayGate, expectedGate, matchGate, prizeFor, sponsorIncome, ticketPrice, upkeepOf } from './economy';
import { clamp, ordinal, pick, rnd } from './utils';
import { clubAfter, leagueClubNames, randomClubName } from './names';
import { drawInjury, fitOf, freshSeason, matchCost, playerRating, progressPlayer, recoveryOf, saleValue, wageOf, wantsRetirement } from './players';
import { quickMatch } from './live';
import { ensureLineup } from './tactics';
import { reputationStatusEvent, resetSeasonStats } from './goals';
import { closeSeasonObjectives, drawObjectives } from './objectives';
import { book, closeLedger, markTreasury } from './ledger';
import { C1_ENTRY, COMPS, STAGES, buildCalendar, cupPrize, drawOpponent, fixtureLabel, fixtureShort, isAwayRound, leagueLength, nextFixture, ofDiv } from './cups';
import { addMatch, rebuildRecords } from './records';
import { distinctSquad } from './faces';
import { collectiveSession, staffSession, tidyTraining, windowKey } from './training';
import { leagueSeasonStart, officialTable } from './leagueSeason';
import { divisionWages, ensureDeals, lastYear } from './contracts';
import { ensureSquadMin } from './squadFloor';
import { comma, minuteLabel, numLocale, t, tn } from '../i18n/index';

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

export { pushJournal } from './journal';

// Partie de championnat entre amis (s.league, leagueSeason.js) : les adversaires, le calendrier et le classement viennent
// de la ligue ; ni coupes ni marché privé. Le reste de la reprise (académie, objectifs, sponsors) est celui de la carrière.
// Reprise : les joueurs qui entament leur dernière année de contrat, au journal (prolonger à temps, ou les vendre).
function announceLastYear(s) {
  const last = s.players.filter((p) => lastYear(s, p));
  if (!last.length) return;
  const many = last.length > 1;
  pushJournal(s, {
    season: s.seasonNumber, kind: 'club',
    title: many ? t('{length} joueurs entament leur dernière année de contrat', { length: last.length }) : t('{name} entame sa dernière année de contrat', { name: last[0].name }),
    text: t('{v} : sans prolongation, {v2} libre{v3} à la fin de la saison, sans indemnité.', { v: many ? t('{join} et {name}', { join: last.slice(0, -1).map((p) => p.name).join(comma()), name: last.at(-1).name }) : last[0].name, v2: many ? t('ils partiront') : t('il partira'), v3: many ? 's' : '' }),
  });
}

export function startSeason(s) {
  if (s.league) {
    leagueSeasonStart(s);
    refreshScouting(s);
    resetSeasonStats(s);
    drawObjectives(s);
    if (s.seasonNumber > 1) paySponsors(s);
    announceLastYear(s);
    return;
  }
  const div = DIVISIONS[s.divisionIndex];
  s.rivals = [];
  const names = leagueClubNames(7, s.clubName); // sept clubs tous différents, jamais deux du même lieu
  for (let i = 0; i < 7; i++) {
    const str = div.oppMin + (div.oppMax - div.oppMin) * (i / 6) + rnd(-0.3, 0.3);
    s.rivals.push({ name: names[i], strength: Math.round(clamp(str, 3, 18) * 10) / 10 });
  }
  // ordre aléatoire : le calendrier ne commence plus toujours par le favori de la division
  for (let i = s.rivals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s.rivals[i], s.rivals[j]] = [s.rivals[j], s.rivals[i]];
  }
  // Élite (0.6.0) : aller-retour, quatorze journées ; la seconde moitié reprend les mêmes affiches, lieux inversés. Notre
  // lieu alterne : domicile, extérieur… (sept de chaque) ; ailleurs, toutes nos journées se jouent à domicile.
  const first = roundRobin(8);
  const elite = s.divisionIndex === DIVISIONS.length - 1;
  s.schedule = elite ? [...first, ...first] : first;
  s.away = elite ? Array.from({ length: 14 }, (_, r) => (r < 7 ? r % 2 === 1 : (r - 7) % 2 === 0)) : null;
  s.round = 0;
  s.table = Array.from({ length: 8 }, () => ({ pts: 0, gd: 0, played: 0, w: 0, d: 0, l: 0 }));
  refreshTransfers(s, 'full'); // mercato neuf : joueurs libres et joueurs sous contrat (transfers.js)
  refreshScouting(s); // académie : premiers jeunes repérés de la saison
  resetSeasonStats(s);
  // Coupe d'Europe : qualifié par le classement de l'Élite la saison passée ; la participation est payée d'avance
  s.c1 = !!s.c1Next;
  s.c1Next = false;
  buildCalendar(s);
  drawObjectives(s); // les trois objectifs du conseil d'administration pour la saison (objectives.js)
  // ce qui tombe à la reprise compte dans les recettes de la saison (objectif « dans le vert » compris)
  if (s.c1) {
    s.money += C1_ENTRY;
    book(s, 'cups', C1_ENTRY);
    pushJournal(s, {
      season: s.seasonNumber, kind: 'club', title: t('{clubName} dispute la Coupe d’Europe des clubs', { clubName: s.clubName }),
      text: t('Grand soir européen en vue : premier tour face {clubAfter}. Prime de participation : {toLocaleString} €.', { clubAfter: clubAfter('à ', s.cups.c1.opp.name), toLocaleString: C1_ENTRY.toLocaleString(numLocale()) }),
    });
  }
  if (s.seasonNumber > 1) paySponsors(s);
  announceLastYear(s);
}

// Sponsors : depuis la 0.6.0, les contrats de la saison se signent et se paient à la reprise (au bilan avant ; la
// première saison du club, au bilan) : un club promu touche tout de suite les sponsors de sa nouvelle division, de quoi
// se renforcer avant d'affronter des salaires bien plus lourds. Montant selon la division, le siège et la réputation.
function paySponsors(s) {
  const amount = sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation);
  s.money += amount;
  book(s, 'sponsors', amount);
  s.seasonStats.sponsors = amount;
  s.sponsorsPaid = s.seasonNumber;
  pushJournal(s, {
    season: s.seasonNumber, kind: 'club', title: t('Sponsors de la saison : {n} €', { n: n(amount) }),
    text: t('Les partenaires du club signent pour la saison {seasonNumber} {ofDiv} et paient leur contrat à la reprise.', { seasonNumber: s.seasonNumber, ofDiv: ofDiv(DIVISIONS[s.divisionIndex].name) }),
  });
}
export const sponsorsPaid = (s) => s.sponsorsPaid === s.seasonNumber;

function applyResult(s, i, j, gi, gj) {
  const a = s.table[i];
  const b = s.table[j];
  a.played++;
  b.played++;
  a.gd += gi - gj;
  b.gd += gj - gi;
  // victoires, nuls, défaites (colonnes G, N, P du classement ; absentes des saisons commencées avant leur ajout)
  const tally = (t, k) => { if (t.w != null) t[k] += 1; };
  if (gi > gj) {
    a.pts += 3;
    tally(a, 'w');
    tally(b, 'l');
  } else if (gj > gi) {
    b.pts += 3;
    tally(b, 'w');
    tally(a, 'l');
  } else {
    a.pts++;
    b.pts++;
    tally(a, 'd');
    tally(b, 'd');
  }
}

function quickSim(si, sj) {
  const d = si - sj;
  const g1 = Math.max(0, Math.round(1.15 + d * 0.22 + rnd(-0.9, 0.9)));
  const g2 = Math.max(0, Math.round(1.15 - d * 0.22 + rnd(-0.9, 0.9)));
  return [g1, g2];
}

// Ligne de carrière d'une saison (fiche joueur, onglet Stats) : niveau à la fin de la saison et statistiques.
export function seasonLine(s, p, st = p.season || freshSeason()) {
  return {
    season: s.seasonNumber, rating: Math.round(playerRating(p) * 10) / 10, age: p.age, division: DIVISIONS[s.divisionIndex].name,
    apps: st.apps || 0, goals: st.goals || 0, assists: st.assists || 0,
    avg: st.apps ? Math.round((st.sum / st.apps) * 10) / 10 : null,
    yellow: st.yellow || 0, red: st.red || 0, motm: st.motm || 0,
    minutes: st.minutes || 0, shots: st.shots || 0, onTarget: st.onTarget || 0, clean: st.clean || 0,
  };
}

// Anciens joueurs : un joueur qui quitte le club (vente, plan de redressement, retraite) est archivé avec tout son
// parcours, pour qu'on puisse le retrouver dans l'effectif et l'onglet Stats. ageSeason : saison où il a l'âge
// enregistré (pour calculer son âge aujourd'hui).
export function archivePlayer(s, p, { reason, fee = null, club = null }) {
  const hist = [...(p.hist || [])];
  const st = p.season;
  if (st && st.apps > 0 && !hist.some((h) => h.season === s.seasonNumber)) hist.push(seasonLine(s, p, st));
  const peak = Math.max(Math.round(playerRating(p) * 10) / 10, ...hist.map((h) => h.rating || 0));
  s.alumni = [...(s.alumni || []).filter((a) => a.id !== p.id), {
    id: p.id, name: p.name, pos: p.pos, num: p.num, foot: p.foot, traits: p.traits || [], face: p.face || null,
    joined: p.joined ?? 1, left: s.seasonNumber, leftRound: s.round, reason, fee, club, academy: !!p.academy,
    age: p.age, ageSeason: reason === 'retraite' ? s.seasonNumber + 1 : s.seasonNumber,
    rating: Math.round(playerRating(p) * 10) / 10, peak, hist,
    a: p.a ? { ...p.a } : null, g: p.g ? { ...p.g } : null, pot: p.pot, alt: p.alt || null, // qualités au départ
  }].slice(-150);
}

// Historique détaillé de chaque match (onglet Stats) : score, statistiques, buteurs, notes, affluence.
// L'homme du match (meilleure note) est compté dans la saison du joueur.
function recordMatch(s, res) {
  const best = (res.players || []).reduce((b, x) => (!b || x.rating > b.rating ? x : b), null);
  const star = best && s.players.find((q) => q.id === best.id);
  if (star) { star.season ||= freshSeason(); star.season.motm = (star.season.motm || 0) + 1; }
  const st = res.stats;
  if (!s.records) s.records = rebuildRecords(s); // parties commencées avant les records
  s.matches = [...(s.matches || []), {
    season: s.seasonNumber, round: s.round, division: DIVISIONS[s.divisionIndex].name,
    comp: res.comp || 'league', stage: res.stage ?? null, label: res.label || null, pens: res.pens || null,
    opp: res.oppName, oppStrength: Math.round((res.oppStrength || 0) * 10) / 10, myRating: res.myRating, ...(res.away ? { away: true } : {}),
    ...(res.preOdds ? { odds: res.preOdds } : {}), // chances annoncées au coup d'envoi (Stats : fiabilité du pronostic)
    tactic: res.tactic || s.tactic, formation: res.formation || s.formation || '433', gf: res.gf, ga: res.ga,
    stats: st ? {
      possession: st.possession, shots: [...st.shots], onTarget: [...st.onTarget], yellow: [...st.yellow], red: [...st.red],
      xg: st.xg ? st.xg.map((v) => Math.round(v * 100) / 100) : null, saves: st.saves ? [...st.saves] : null,
      post: st.post ? [...st.post] : null, wide: st.wide ? [...st.wide] : null, big: st.big ? [...st.big] : null,
      possHalf: st.possHalf ? [...st.possHalf] : null, longShots: st.longShots ?? null,
    } : null,
    shots: (res.shots || []).map(({ m, h, s: side, o, p, x, q }) => ({ m, h, s: side, o, p, x, q })), // tous les tirs, pour le déroulé
    scorers: (res.scorers || []).map(({ name, id, minute, assist, pen }) => ({ name, id, minute, assist, ...(pen ? { pen: true } : {}) })),
    players: (res.players || []).map(({ id, name, pos, rating, goals, assists, yellow, red, shots, onTarget, minutes }) => ({
      id, name, pos, rating, goals, assists, yellow, red, shots, onTarget, minutes,
    })),
    motm: best ? best.id : null,
    events: (res.highlights || []).map(({ minute, type, side, player, pen }) => ({ minute, type, side, player, ...(pen ? { pen: true } : {}) })), // buts et cartons des deux équipes
    lineup: res.lineup ? [...res.lineup] : null, // onze de départ, dans l'ordre des postes du dispositif
    subs: (res.subs || []).map(({ in: inId, out, minute }) => ({ in: inId, out, minute })),
    attendance: res.attendance, capacity: res.capacity, revenue: res.revenue, demand: res.demand ?? null,
    // formule des billets du jour et recettes détaillées (billetterie, buvette, boutique, loges, droits TV)
    tickets: s.ticketPolicy || 'standard', ticketPrice: Math.round(ticketPrice(s, res.comp || 'league') * 100) / 100,
    breakdown: res.breakdown ? { ...res.breakdown } : null,
  }].slice(-400);
  addMatch(s.records, s.matches[s.matches.length - 1]);
}

// Coupe : qualification ou élimination, prime du tour gagné, tirage du tour suivant, trophée en finale.
function cupResult(s, ctx, res) {
  const c = s.cups[ctx.comp];
  const won = res.gf > res.ga || (res.gf === res.ga && !!res.pens && res.pens[0] > res.pens[1]);
  const stage = ctx.stage;
  c.results.push({ stage, opp: res.oppName, gf: res.gf, ga: res.ga, pens: res.pens || null, won });
  const note = { comp: ctx.comp, stage, won, trophy: false, prize: 0, next: null, text: '' };
  if (!won) {
    c.alive = false;
    note.text = t('L’aventure s’arrête en {toLowerCase}.', { toLowerCase: STAGES[stage].toLowerCase() });
    return note;
  }
  const prize = cupPrize(ctx.comp, stage, s.divisionIndex);
  s.money += prize;
  book(s, 'cups', prize);
  note.prize = prize;
  if (stage === STAGES.length - 1) {
    c.alive = false;
    c.won = true;
    note.trophy = true;
    s.trophies = [...(s.trophies || []), { comp: ctx.comp, season: s.seasonNumber, division: DIVISIONS[s.divisionIndex].name, opp: res.oppName }];
    s.reputation = Math.round((s.reputation + (ctx.comp === 'c1' ? 6 : 3)) * 10) / 10;
    note.text = t('Le trophée rejoint la vitrine du club. Prime : {toLocaleString} €.', { toLocaleString: prize.toLocaleString(numLocale()) });
    return note;
  }
  c.stage = stage + 1;
  c.opp = drawOpponent(s, ctx.comp, c.stage);
  note.next = c.opp;
  note.text = t('Prime : {toLocaleString} €. Prochain tour ({toLowerCase}) : {name}{v}.', { toLocaleString: prize.toLocaleString(numLocale()), toLowerCase: STAGES[c.stage].toLowerCase(), name: c.opp.name, v: c.opp.division && c.opp.division !== t('Europe') ? `${comma()}${c.opp.division}` : '' });
  return note;
}

function reportText(s, res) {
  const att = res.attendance;
  const opp = (prep = '') => clubAfter(prep, res.oppName); // « contre l’AS… », « face au FC… »
  const buts = res.gf
    ? t('Buts : {join}.', { join: res.scorers.map((x) => `${x.name} ${minuteLabel(x.minute)}`).join(comma()) })
    : t('{clubName} n’a pas trouvé la faille.', { clubName: s.clubName });
  const money = new Intl.NumberFormat(numLocale()).format(res.revenue);
  if (res.away) { // à l'extérieur (Élite) : ni public à nous, ni billetterie, seulement les droits TV
    const intro = res.gf > res.ga
      ? pick([t('Victoire à l’extérieur : {clubName} fait taire le stade {opp}.', { clubName: s.clubName, opp: opp('de ') }), t('{clubName} s’impose chez {clubAfter} : trois points précieux loin de ses bases.', { clubName: s.clubName, clubAfter: clubAfter('', res.oppName) })])
      : res.gf === res.ga
        ? pick([t('Point arraché chez {clubAfter}.', { clubAfter: clubAfter('', res.oppName) }), t('Match nul à l’extérieur face {opp} : un point pris loin de chez soi.', { opp: opp('à ') })])
        : pick([t('Défaite à l’extérieur : {clubName} cède chez {clubAfter}.', { clubName: s.clubName, clubAfter: clubAfter('', res.oppName) }), t('Soirée difficile dans le stade {opp} : {clubName} repart bredouille.', { opp: opp('de '), clubName: s.clubName })]);
    return t('{intro} {buts} Droits TV : {money} €.', { intro, buts, money });
  }
  let intro;
  if (res.gf > res.ga) {
    intro = pick([
      t('Devant {att} spectateurs, {clubName} a fait le métier contre {opp}.', { att, clubName: s.clubName, opp: opp() }),
      t('Soirée propre : {clubName} maîtrise {opp} et repart avec les trois points.', { clubName: s.clubName, opp: opp() }),
      t('Le projet avance. {clubName} a construit son succès sur un bloc solide, devant {att} spectateurs.', { clubName: s.clubName, att }),
    ]);
  } else if (res.gf === res.ga) {
    intro = pick([
      t('{clubName} et {opp} se sont neutralisés ({att} spectateurs). Un point de plus, mais on en voulait trois.', { clubName: s.clubName, opp: opp(), att }),
      t('Match serré face {opp} : aucune équipe n’a trouvé la faille décisive.', { opp: opp('à ') }),
    ]);
  } else {
    intro = pick([
      t('Frustration au coup de sifflet final : {clubName} s’incline contre {opp}.', { clubName: s.clubName, opp: opp() }),
      t('Soirée difficile devant {att} spectateurs — {clubName} a manqué de tranchant dans la surface.', { att, clubName: s.clubName }),
      t('Rien ne fonctionne ce soir. Défaite logique face {opp}.', { opp: opp('à ') }),
    ]);
  }
  return t('{intro} {buts} Recettes : {money} €.', { intro, buts, money });
}

// Contexte du prochain match : adversaire, lieu (home : à domicile ; les coupes se jouent toujours à domicile, le
// championnat aussi hors de l'Élite) et affluence attendue.
export function matchContext(s) {
  const f = nextFixture(s);
  if (!f) return null;
  const repMult = 1 + s.buildings.fans * 0.1;
  if (f.comp !== 'league') { // coupe : élimination directe, tirs au but en cas d'égalité
    const opp = s.cups[f.comp].opp;
    return {
      comp: f.comp, stage: f.stage, fixture: f.index, knockout: true, home: true, opp, oppIdx: -1,
      label: fixtureLabel(f), short: fixtureShort(f), gate: expectedGate(s, opp, f.comp), repMult: repMult * (f.comp === 'c1' ? 1.6 : 1.2),
    };
  }
  const pr = s.schedule[s.round].find((p) => p.includes(0));
  const oppIdx = pr[0] === 0 ? pr[1] : pr[0];
  const opp = s.rivals[oppIdx - 1];
  const home = !isAwayRound(s);
  const len = leagueLength(s);
  return {
    comp: 'league', stage: null, fixture: f.index, knockout: false, home,
    opp,
    oppIdx,
    label: fixtureLabel(f, s.round + 1, len),
    short: fixtureShort(f, s.round + 1, len),
    gate: home ? expectedGate(s, opp) : awayGate(s), // estimation : affluence, recettes (sans l'aléa du jour)
    // réputation : une journée d'une saison de quatorze compte moitié moins (même total sur la saison)
    repMult: repMult * (7 / len),
  };
}

// Applique le résultat de notre match (joué en direct ou d'un bloc) et joue les autres rencontres.
export function applyMatchResult(s, live) {
  const ctx = matchContext(s);
  if (!ctx) return s;
  const league = ctx.comp === 'league';
  const before = league ? standingsOf(s).map((t) => t.i) : null; // ordre du classement avant la journée (après-match)
  const trainingWindow = windowKey(s); // séance d'entraînement de l'avant-match (training.js)
  if (league && !s.league) { // en ligue entre amis, les autres matchs sont joués par la ligue (classement officiel)
    for (const [i, j] of s.schedule[s.round]) {
      if (i === 0 || j === 0) continue;
      const [gi, gj] = quickSim(s.rivals[i - 1].strength, s.rivals[j - 1].strength);
      applyResult(s, i, j, gi, gj);
    }
  }
  const gate = ctx.home === false ? awayGate(s) : matchGate(s, ctx.opp, undefined, ctx.comp); // affluence et recettes du jour
  const res = {
    ...live,
    away: ctx.home === false,
    attendance: gate.attendance,
    capacity: gate.capacity,
    demand: gate.demand,
    breakdown: gate.breakdown,
    revenue: gate.revenue,
    repDelta: Math.round((live.gf > live.ga ? 1 : live.gf === live.ga ? 0.2 : -0.6) * ctx.repMult * REP_DIVISION[s.divisionIndex] * 10) / 10,
  };
  if (league && s.league) s.table = officialTable(s);
  else if (league) applyResult(s, 0, ctx.oppIdx, res.gf, res.ga);
  const cupNote = league ? null : cupResult(s, ctx, res);
  // les absents de ce match purgent une date : suspension et blessure diminuent d'un match
  for (const p of s.players) {
    if (p.ban > 0) p.ban -= 1;
    if (p.injury?.out > 0) { p.injury.out -= 1; if (p.injury.out <= 0) delete p.injury; }
  }
  const absences = []; // blessés et suspendus du match, pour l'après-match et le journal
  const fitness = {}; // par joueur entré en jeu : condition au coup de sifflet, puis au prochain match
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
    p.season.minutes = (p.season.minutes || 0) + (st.minutes ?? 90);
    p.season.shots = (p.season.shots || 0) + (st.shots || 0);
    p.season.onTarget = (p.season.onTarget || 0) + (st.onTarget || 0);
    // match sans encaisser : gardien et défenseurs présents au moins une heure
    if (res.ga === 0 && (st.pos === 'G' || st.pos === 'D') && (st.minutes ?? 90) >= 60) p.season.clean = (p.season.clean || 0) + 1;
    p.form = [...(p.form || []), st.rating].slice(-5);
    // suspensions : un rouge direct vaut deux matchs, un second jaune un ; trois jaunes dans la saison, un match
    if (st.red) { p.ban = (p.ban || 0) + (st.yellow ? 1 : 2); absences.push({ id: p.id, name: p.name, kind: 'ban', matches: p.ban, why: st.yellow ? t('second carton jaune') : t('carton rouge') }); }
    else if (st.yellow && p.season.yellow % 3 === 0) { p.ban = (p.ban || 0) + 1; absences.push({ id: p.id, name: p.name, kind: 'ban', matches: p.ban, why: t('trois cartons jaunes') }); }
    // condition physique : le match coûte selon le temps de jeu et l'endurance
    p.fit = Math.max(0, Math.round((fitOf(p) - (matchCost(p) * (st.minutes ?? 90)) / 90) * 10) / 10);
    fitness[p.id] = [p.fit]; // condition au coup de sifflet final (après-match)
  }
  // blessures du match : durée tirée maintenant, en dates du calendrier
  for (const inj of live.injuries || []) {
    const p = s.players.find((q) => q.id === inj.id);
    if (!p) continue;
    p.injury = drawInjury();
    absences.push({ id: p.id, name: p.name, kind: 'injury', matches: p.injury.out, why: p.injury.label.toLowerCase() });
  }
  // récupération avant la prochaine date, pour tous (le centre d'entraînement aide) : l'après-match montre la condition
  // au coup de sifflet et celle du prochain match, les autres écrans celle du prochain match
  for (const p of s.players) {
    p.fit = Math.min(100, Math.round((fitOf(p) + recoveryOf(p, s.buildings.training || 0)) * 10) / 10);
    if (fitness[p.id]) fitness[p.id].push(p.fit);
  }
  s.money += res.revenue;
  for (const [k, v] of Object.entries(res.breakdown)) book(s, k, v);
  if (league) { // part de la journée (un septième des salaires et de l'entretien, un quatorzième en Élite) : due, payée au bilan
    const len = leagueLength(s);
    accrueDues(s, Math.round(s.players.reduce((sum, p) => sum + wageOf(p, s.divisionIndex), 0) / len), Math.round(upkeepOf(s) / len));
  }
  markTreasury(s);
  s.seasonStats.gate = (s.seasonStats.gate || 0) + res.revenue; // recettes cumulées, pour le bilan
  if (gate.capacity && gate.attendance >= gate.capacity * 0.6) s.seasonStats.crowd = true;
  const repWas = s.reputation;
  s.reputation = Math.max(0, Math.round((s.reputation + res.repDelta) * 10) / 10);
  const status = reputationStatusEvent(s, repWas); // nouveau statut de notoriété atteint sur ce match
  if (league) {
    s.leagueTotal = leagueRounds(s) + 1; // journées jouées depuis la fondation (blocage de revente, mercato.js)
    s.round++;
  }
  if (ctx.fixture >= 0) s.calIndex = ctx.fixture + 1;
  s.lastMatch = { ...res, round: s.round, comp: ctx.comp, stage: ctx.stage, label: league ? fixtureLabel(null, s.round, leagueLength(s)) : ctx.label, cup: cupNote, status: status?.name || null, before, absences, fitness };
  recordMatch(s, s.lastMatch);
  if (absences.length) {
    pushJournal(s, {
      season: s.seasonNumber, round: s.round, kind: 'club',
      title: absences.length > 1 ? t('{length} absents après le match', { length: absences.length }) : absences[0].kind === 'injury' ? t('{name} blessé', { name: absences[0].name }) : t('{name} suspendu', { name: absences[0].name }),
      text: absences.map((a) => tn(a.matches, '{name} : {v} {matches} match ({why})', '{name} : {v} {matches} matchs ({why})', { name: a.name, v: a.kind === 'injury' ? t('blessé') : t('suspendu'), matches: a.matches, why: a.why }, a.matches > 1)).join(' · ') + '.',
    });
  }
  ensureLineup(s); // blessés et suspendus quittent le onze du prochain match
  if (!s.league) refreshTransfers(s); // le marché des transferts bouge à chaque journée
  else refreshSales(s); // ligue : marché commun (leagueClub.js), ventes du solo
  if (league) trainYouth(s); // académie : les jeunes progressent à chaque journée de championnat
  refreshScouting(s); // et de nouveaux jeunes sont repérés
  collectiveSession(s, trainingWindow); // centre d'entraînement : séance collective pour ceux qui n'étaient pas à la séance
  const score = `${res.gf}–${res.ga}${res.pens ? ` (t.a.b. ${res.pens[0]}–${res.pens[1]})` : ''}`;
  if (!league) {
    pushJournal(s, {
      season: s.seasonNumber, round: s.round, kind: 'match',
      title: cupNote.trophy ? t('{clubName} remporte {v} !', { clubName: s.clubName, v: cupNote.comp === 'c1' ? t('la Coupe d’Europe des clubs') : t('la Coupe nationale') })
        : cupNote.won ? t('{short} : qualification contre {clubAfter} ({score})', { short: COMPS[ctx.comp].short, clubAfter: clubAfter('', res.oppName), score })
          : t('{short} : élimination face {clubAfter} ({score})', { short: COMPS[ctx.comp].short, clubAfter: clubAfter('à ', res.oppName), score }),
      text: `${ctx.label}. ${cupNote.text}`,
    });
    return s;
  }
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'match',
    title: res.gf > res.ga ? t('Victoire {score} face {clubAfter}', { score, clubAfter: clubAfter('à ', res.oppName) }) : res.gf === res.ga ? t('Match nul {score} contre {clubAfter}', { score, clubAfter: clubAfter('', res.oppName) }) : t('Défaite {score} face {clubAfter}', { score, clubAfter: clubAfter('à ', res.oppName) }),
    text: reportText(s, res),
  });
  return s;
}

// Match joué d'un bloc, sans écran de direct.
export function playRound(s) {
  const ctx = matchContext(s);
  if (!ctx) return s;
  staffSession(s); // séances confiées au staff : les épreuves pas faites, juste avant le match
  ensureLineup(s);
  return applyMatchResult(s, quickMatch(s, ctx));
}

export function standingsOf(s) {
  return s.table
    .map((t, i) => ({ i, ...t, name: i === 0 ? s.clubName : s.rivals[i - 1].name }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.name.localeCompare(b.name));
}

export function nextOpponent(s) {
  return matchContext(s)?.opp || null;
}

const n = (v) => new Intl.NumberFormat(numLocale()).format(v);

export function endSeason(s) {
  if (!s.league) for (let guard = 0; nextFixture(s) && guard < 40; guard++) playRound(s); // dates restantes jouées d'un bloc (22 en Élite)
  const standings = standingsOf(s);
  const position = standings.findIndex((t) => t.i === 0) + 1;
  // ligue entre amis : son nom tient lieu de division (trophée, historique, bilan), l'économie garde son échelle
  const div = s.league ? { ...DIVISIONS[s.divisionIndex], name: s.league.name } : DIVISIONS[s.divisionIndex];
  const prize = prizeFor(position, s.divisionIndex);
  // sponsors de la saison : payés à la reprise (paySponsors), sinon maintenant (première saison, partie d'avant la 0.6.0)
  const upfront = sponsorsPaid(s);
  const sponsors = upfront ? s.seasonStats?.sponsors || 0 : sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation);
  // salaires et entretien dus journée après journée : payés maintenant, d'un coup (0.8.8) ; le bilan en montre le total
  const dues = s.dues || { wages: 0, upkeep: 0 };
  s.money -= dues.wages + dues.upkeep;
  book(s, 'wages', dues.wages);
  book(s, 'upkeep', dues.upkeep);
  s.dues = null;
  const wages = s.ledger?.lines?.wages || 0;
  const upkeep = s.ledger?.lines?.upkeep || 0;
  const promoted = !s.league && position <= 2 && s.divisionIndex < 3;
  const relegated = !s.league && position >= 7 && s.divisionIndex > 0;

  s.money += prize + (upfront ? 0 : sponsors);
  book(s, 'prize', prize);
  if (!upfront) book(s, 'sponsors', sponsors);
  const events = [];
  // Champion : trophée, prime de titre (moitié de la prime du champion), bonus des sponsors et réputation
  let titleBonus = 0;
  if (position === 1) {
    titleBonus = Math.round(prize * 0.5 + sponsors * 0.3);
    s.money += titleBonus;
    book(s, 'titles', titleBonus);
    s.trophies = [...(s.trophies || []), { comp: 'league', season: s.seasonNumber, division: div.name }];
    events.unshift(t('Champion {ofDiv} ! Le trophée rejoint la vitrine et rapporte {n} € de primes de titre.', { ofDiv: ofDiv(div.name), n: n(titleBonus) }));
  }
  // Coupe d'Europe : les deux premiers de l'Élite la disputent la saison suivante
  if (!s.league && s.divisionIndex === DIVISIONS.length - 1 && position <= 2) {
    s.c1Next = true;
    events.push(t('Qualifié pour la Coupe d’Europe des clubs : {n} € de prime de participation dès la reprise.', { n: n(C1_ENTRY) }));
  }
  // Plan de redressement : saison bouclée dans le rouge → le conseil vend les plus gros salaires.
  while (s.money < 0 && s.players.length > SQUAD_MIN + 2) {
    const p = [...s.players].sort((a, b) => wageOf(b, s.divisionIndex) - wageOf(a, s.divisionIndex))[0];
    const fee = saleValue(p, s.divisionIndex);
    const club = randomClubName();
    archivePlayer(s, p, { reason: 'conseil', fee, club });
    s.players.splice(s.players.indexOf(p), 1);
    s.money += fee;
    book(s, 'sales', fee);
    logMove(s, 'out', p, fee, club, true); // bilan du mercato
    events.push(t('Plan de redressement : comptes dans le rouge, le conseil vend {name} ({n} €).', { name: p.name, n: n(fee) }));
  }
  const repBefore = s.reputation;
  // l'intersaison efface une part de la notoriété (on oublie vite) ; montée, titre et descente comptent ensuite
  s.reputation = Math.max(0, Math.round((s.reputation * (1 - REP_DECAY) + (promoted ? 4 : relegated ? -3 : 0) + (position === 1 ? 3 : 0)) * 10) / 10);

  for (const p of s.players) {
    // bilan individuel de la saison, puis progression de l'été
    p.hist = [...(p.hist || []), seasonLine(s, p)].slice(-20); // carrière : 20 saisons gardées
    p.season = freshSeason();
    progressPlayer(p);
    p.age += 1;
    p.fit = 100; // l'intersaison repose et soigne tout le monde ; une suspension, elle, se purge à la reprise
    delete p.injury;
  }
  const staying = [];
  for (const p of s.players) {
    if (wantsRetirement(p)) {
      events.push(t('{name} ({age} ans) raccroche les crampons.', { name: p.name, age: p.age }));
      archivePlayer(s, p, { reason: 'retraite' });
    } else staying.push(p);
  }
  // fins de contrat : sans prolongation, le joueur part libre, sans indemnité (contracts.js)
  s.players = staying.filter((p) => {
    if (!lastYear(s, p)) return true;
    events.push(t('{name} ({age} ans) part libre : son contrat est arrivé à son terme.', { name: p.name, age: p.age }));
    archivePlayer(s, p, { reason: 'libre' });
    logMove(s, 'out', p, 0, null);
    return false;
  });
  s.saleList = (s.saleList || []).filter((x) => s.players.some((q) => q.id === x.id));
  s.offers = (s.offers || []).filter((o) => s.players.some((q) => q.id === o.playerId));
  distinctSquad(s.players); // un an de plus (cheveux gris, front dégarni) : pas de sosie pour autant, le dernier arrivé change de coupe
  tidyTraining(s); // programmes d'entraînement des retraités effacés

  // académie : le bond de l'été ; l'effectif remis au minimum (un jeune monte d'office, ceux qui allaient partir
  // compris, sinon un amateur de secours), puis les jeunes de 19 ans qui ne sont pas montés quittent le club
  const leaving = youthSeasonEnd(s);
  const floor = ensureSquadMin(s, { joined: s.seasonNumber + 1, extra: leaving });
  events.push(...floor.lines);
  for (const y of leaving) if (!floor.raised.includes(y)) events.push(t('{name} (19 ans) quitte l’académie : il n’est pas monté en équipe première.', { name: y.name }));
  // salaires à la montée (clauses de montée) ou à la descente (ramenés au niveau de la nouvelle division)
  const nextIndex = clamp(s.divisionIndex + (promoted ? 1 : relegated ? -1 : 0), 0, 3);
  const wageNote = divisionWages(s, s.divisionIndex, nextIndex);
  if (wageNote) events.push(wageNote);

  s.history.push({ season: s.seasonNumber, division: div.name, position });
  const nextDivName = DIVISIONS[nextIndex].name;
  const matchday = s.seasonStats?.gate || 0;
  const cupsMoney = (s.ledger?.lines?.cups || 0);
  const trophies = (s.trophies || []).filter((t) => t.season === s.seasonNumber);
  const cupRuns = ['cup', 'c1'].filter((k) => s.cups?.[k]).map((k) => {
    const c = s.cups[k];
    return { comp: k, won: c.won, reached: c.won ? t('vainqueur') : t('éliminé en {toLowerCase}', { toLowerCase: STAGES[Math.max(0, (c.results.at(-1)?.stage ?? 0))].toLowerCase() }) };
  });
  s.seasonReview = {
    position, division: div.name, matchday, prize, sponsors, sponsorsUpfront: upfront, wages, upkeep, promoted, relegated, events, nextDivision: nextDivName,
    titleBonus, cups: cupsMoney, trophies, cupRuns, champion: position === 1, c1Next: !!s.c1Next, league: !!s.league,
  };
  closeSeasonObjectives(s, events); // objectifs du conseil : primes et bonus de saison parfaite
  reputationStatusEvent(s, repBefore);
  pushJournal(s, {
    season: s.seasonNumber,
    kind: 'saison',
    title: promoted ? t('Montée ! {clubName} termine {ordinal} {ofDiv}', { clubName: s.clubName, ordinal: ordinal(position), ofDiv: ofDiv(div.name) }) : relegated ? t('Descente : {ordinal} place en {name}', { ordinal: ordinal(position, true), name: div.name }) : t('Saison {seasonNumber} bouclée à la {ordinal} place', { seasonNumber: s.seasonNumber, ordinal: ordinal(position, true) }),
    text: t('Saison {seasonNumber} terminée : {ordinal} en {name}.{v} Prime : {n} € · Sponsors : {n2} € · Salaires : −{n3} € · Entretien : −{n4} €.', { seasonNumber: s.seasonNumber, ordinal: ordinal(position), name: div.name, v: promoted ? t(' Montée !') : relegated ? t(' Descente.') : '', n: n(prize), n2: n(sponsors), n3: n(wages), n4: n(upkeep) }),
  });

  closeLedger(s, div.name); // comptes de la saison bouclés (primes d'objectif comprises)
  if (promoted) s.divisionIndex += 1;
  if (relegated) s.divisionIndex -= 1;
  s.seasonNumber += 1;
  if (s.league) s.league.season += 1; // la saison suivante de la ligue (son calendrier)
  s.lastMatch = null;
  ensureDeals(s); // amateurs de secours : un contrat au salaire de la division
  ensureLineup(s); // retraites, départs libres, amateurs de secours : l'onze est complété
  startSeason(s);
  return s;
}
