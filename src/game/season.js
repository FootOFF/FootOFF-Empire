import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from './constants';
import { refreshTransfers } from './transfers';
import { logMove } from './mercato';
import { expectedGate, matchGate, prizeFor, sponsorIncome, ticketPrice, upkeepOf } from './economy';
import { clamp, ordinal, pick, rnd } from './utils';
import { clubAfter, randomClubName } from './names';
import { assignNumber, freshSeason, makePlayer, playerRating, progressPlayer, saleValue, wageOf, wantsRetirement } from './players';
import { quickMatch } from './live';
import { ensureLineup } from './tactics';
import { closeSeasonGoals, reputationStatusEvent, resetSeasonStats } from './goals';
import { book, closeLedger, markTreasury } from './ledger';
import { C1_ENTRY, COMPS, STAGES, buildCalendar, cupPrize, drawOpponent, fixtureLabel, fixtureShort, nextFixture, ofDiv } from './cups';
import { addMatch, rebuildRecords } from './records';

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
  refreshTransfers(s, 'full'); // mercato neuf : joueurs libres et joueurs sous contrat (transfers.js)
  resetSeasonStats(s);
  // Coupe d'Europe : qualifié par le classement de l'Elite la saison passée ; la participation est payée d'avance
  s.c1 = !!s.c1Next;
  s.c1Next = false;
  buildCalendar(s);
  if (s.c1) {
    s.money += C1_ENTRY;
    book(s, 'cups', C1_ENTRY);
    pushJournal(s, {
      season: s.seasonNumber, kind: 'club', title: `${s.clubName} dispute la Coupe d’Europe des clubs`,
      text: `Grand soir européen en vue : premier tour face ${clubAfter('à ', s.cups.c1.opp.name)}. Prime de participation : ${C1_ENTRY.toLocaleString('fr-FR')} €.`,
    });
  }
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
    id: p.id, name: p.name, pos: p.pos, num: p.num, foot: p.foot, traits: p.traits || [],
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
    opp: res.oppName, oppStrength: Math.round((res.oppStrength || 0) * 10) / 10, myRating: res.myRating,
    tactic: res.tactic || s.tactic, formation: res.formation || s.formation || '433', gf: res.gf, ga: res.ga,
    stats: st ? {
      possession: st.possession, shots: [...st.shots], onTarget: [...st.onTarget], yellow: [...st.yellow], red: [...st.red],
      xg: st.xg ? st.xg.map((v) => Math.round(v * 100) / 100) : null, saves: st.saves ? [...st.saves] : null,
      post: st.post ? [...st.post] : null, wide: st.wide ? [...st.wide] : null, big: st.big ? [...st.big] : null,
      possHalf: st.possHalf ? [...st.possHalf] : null, longShots: st.longShots ?? null,
    } : null,
    shots: (res.shots || []).map(({ m, h, s: side, o, p, x, q }) => ({ m, h, s: side, o, p, x, q })), // tous les tirs, pour le déroulé
    scorers: (res.scorers || []).map(({ name, id, minute, assist }) => ({ name, id, minute, assist })),
    players: (res.players || []).map(({ id, name, pos, rating, goals, assists, yellow, red, shots, onTarget, minutes }) => ({
      id, name, pos, rating, goals, assists, yellow, red, shots, onTarget, minutes,
    })),
    motm: best ? best.id : null,
    events: (res.highlights || []).map(({ minute, type, side, player }) => ({ minute, type, side, player })), // buts et cartons des deux équipes
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
    note.text = `L’aventure s’arrête en ${STAGES[stage].toLowerCase()}.`;
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
    note.text = `Le trophée rejoint la vitrine du club. Prime : ${prize.toLocaleString('fr-FR')} €.`;
    return note;
  }
  c.stage = stage + 1;
  c.opp = drawOpponent(s, ctx.comp, c.stage);
  note.next = c.opp;
  note.text = `Prime : ${prize.toLocaleString('fr-FR')} €. Prochain tour (${STAGES[c.stage].toLowerCase()}) : ${c.opp.name}${c.opp.division && c.opp.division !== 'Europe' ? `, ${c.opp.division}` : ''}.`;
  return note;
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
  const f = nextFixture(s);
  if (!f) return null;
  const repMult = 1 + s.buildings.fans * 0.1;
  if (f.comp !== 'league') { // coupe : élimination directe, tirs au but en cas d'égalité
    const opp = s.cups[f.comp].opp;
    return {
      comp: f.comp, stage: f.stage, fixture: f.index, knockout: true, opp, oppIdx: -1,
      label: fixtureLabel(f), short: fixtureShort(f), gate: expectedGate(s, opp, f.comp), repMult: repMult * (f.comp === 'c1' ? 1.6 : 1.2),
    };
  }
  const pr = s.schedule[s.round].find((p) => p.includes(0));
  const oppIdx = pr[0] === 0 ? pr[1] : pr[0];
  const opp = s.rivals[oppIdx - 1];
  return {
    comp: 'league', stage: null, fixture: f.index, knockout: false,
    opp,
    oppIdx,
    label: fixtureLabel(f, s.round + 1),
    short: fixtureShort(f, s.round + 1),
    gate: expectedGate(s, opp), // estimation : affluence, recettes (sans l'aléa du jour)
    repMult,
  };
}

// Applique le résultat de notre match (joué en direct ou d'un bloc) et joue les autres rencontres.
export function applyMatchResult(s, live) {
  const ctx = matchContext(s);
  if (!ctx) return s;
  const league = ctx.comp === 'league';
  if (league) {
    for (const [i, j] of s.schedule[s.round]) {
      if (i === 0 || j === 0) continue;
      const [gi, gj] = quickSim(s.rivals[i - 1].strength, s.rivals[j - 1].strength);
      applyResult(s, i, j, gi, gj);
    }
  }
  const gate = matchGate(s, ctx.opp, undefined, ctx.comp); // affluence et recettes du jour
  const res = {
    ...live,
    attendance: gate.attendance,
    capacity: gate.capacity,
    demand: gate.demand,
    breakdown: gate.breakdown,
    revenue: gate.revenue,
    repDelta: Math.round((live.gf > live.ga ? 1 : live.gf === live.ga ? 0.2 : -0.6) * ctx.repMult * 10) / 10,
  };
  if (league) applyResult(s, 0, ctx.oppIdx, res.gf, res.ga);
  const cupNote = league ? null : cupResult(s, ctx, res);
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
  }
  s.money += res.revenue;
  for (const [k, v] of Object.entries(res.breakdown)) book(s, k, v);
  markTreasury(s);
  s.seasonStats.gate = (s.seasonStats.gate || 0) + res.revenue; // recettes cumulées, pour le bilan
  if (gate.attendance >= gate.capacity * 0.6) s.seasonStats.crowd = true;
  const repWas = s.reputation;
  s.reputation = Math.max(0, Math.round((s.reputation + res.repDelta) * 10) / 10);
  const status = reputationStatusEvent(s, repWas); // nouveau statut de notoriété atteint sur ce match
  if (league) s.round++;
  if (ctx.fixture >= 0) s.calIndex = ctx.fixture + 1;
  s.lastMatch = { ...res, round: s.round, comp: ctx.comp, stage: ctx.stage, label: league ? fixtureLabel(null, s.round) : ctx.label, cup: cupNote, status: status?.name || null };
  recordMatch(s, s.lastMatch);
  refreshTransfers(s); // le marché des transferts bouge à chaque journée
  const score = `${res.gf}–${res.ga}${res.pens ? ` (t.a.b. ${res.pens[0]}–${res.pens[1]})` : ''}`;
  if (!league) {
    pushJournal(s, {
      season: s.seasonNumber, round: s.round, kind: 'match',
      title: cupNote.trophy ? `${s.clubName} remporte ${cupNote.comp === 'c1' ? 'la Coupe d’Europe des clubs' : 'la Coupe nationale'} !`
        : cupNote.won ? `${COMPS[ctx.comp].short} : qualification contre ${clubAfter('', res.oppName)} (${score})`
          : `${COMPS[ctx.comp].short} : élimination face ${clubAfter('à ', res.oppName)} (${score})`,
      text: `${ctx.label}. ${cupNote.text}`,
    });
    return s;
  }
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
  return matchContext(s)?.opp || null;
}

const n = (v) => new Intl.NumberFormat('fr-FR').format(v);

export function endSeason(s) {
  for (let guard = 0; nextFixture(s) && guard < 20; guard++) playRound(s); // dates restantes jouées d'un bloc
  const standings = standingsOf(s);
  const position = standings.findIndex((t) => t.i === 0) + 1;
  const div = DIVISIONS[s.divisionIndex];
  const prize = prizeFor(position, s.divisionIndex);
  const sponsors = sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation);
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
  // Champion : trophée, prime de titre (moitié de la prime du champion), bonus des sponsors et réputation
  let titleBonus = 0;
  if (position === 1) {
    titleBonus = Math.round(prize * 0.5 + sponsors * 0.3);
    s.money += titleBonus;
    book(s, 'titles', titleBonus);
    s.trophies = [...(s.trophies || []), { comp: 'league', season: s.seasonNumber, division: div.name }];
    events.unshift(`Champion ${ofDiv(div.name)} ! Le trophée rejoint la vitrine et rapporte ${n(titleBonus)} € de primes de titre.`);
  }
  // Coupe d'Europe : les deux premiers de l'Elite la disputent la saison suivante
  if (s.divisionIndex === DIVISIONS.length - 1 && position <= 2) {
    s.c1Next = true;
    events.push(`Qualifié pour la Coupe d’Europe des clubs : ${n(C1_ENTRY)} € de prime de participation dès la reprise.`);
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
    events.push(`Plan de redressement : comptes dans le rouge, le conseil vend ${p.name} (${n(fee)} €).`);
  }
  const repBefore = s.reputation;
  s.reputation = Math.max(0, Math.round((s.reputation + (promoted ? 4 : relegated ? -3 : 0) + (position === 1 ? 3 : 0)) * 10) / 10);

  for (const p of s.players) {
    // bilan individuel de la saison, puis progression de l'été
    p.hist = [...(p.hist || []), seasonLine(s, p)].slice(-20); // carrière : 20 saisons gardées
    p.season = freshSeason();
    progressPlayer(p, s.buildings.training);
    p.age += 1;
  }
  const staying = [];
  for (const p of s.players) {
    if (wantsRetirement(p)) {
      events.push(`${p.name} (${p.age} ans) raccroche les crampons.`);
      archivePlayer(s, p, { reason: 'retraite' });
    } else staying.push(p);
  }
  s.players = staying;

  if (s.buildings.academy > 0 && s.players.length < SQUAD_MAX) {
    const y = makePlayer({ youth: true, academy: s.buildings.academy });
    y.id = s.nextId++;
    y.academy = true; // formé au club (succès « Fait maison »)
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
  const cupsMoney = (s.ledger?.lines?.cups || 0);
  const trophies = (s.trophies || []).filter((t) => t.season === s.seasonNumber);
  const cupRuns = ['cup', 'c1'].filter((k) => s.cups?.[k]).map((k) => {
    const c = s.cups[k];
    return { comp: k, won: c.won, reached: c.won ? 'vainqueur' : `éliminé en ${STAGES[Math.max(0, (c.results.at(-1)?.stage ?? 0))].toLowerCase()}` };
  });
  s.seasonReview = {
    position, division: div.name, matchday, prize, sponsors, wages, upkeep, promoted, relegated, events, nextDivision: nextDivName,
    titleBonus, cups: cupsMoney, trophies, cupRuns, champion: position === 1, c1Next: !!s.c1Next,
  };
  closeSeasonGoals(s, events);
  reputationStatusEvent(s, repBefore);
  pushJournal(s, {
    season: s.seasonNumber,
    kind: 'saison',
    title: promoted ? `Montée ! ${s.clubName} termine ${ordinal(position)} ${ofDiv(div.name)}` : relegated ? `Descente : ${ordinal(position, true)} place en ${div.name}` : `Saison ${s.seasonNumber} bouclée à la ${ordinal(position, true)} place`,
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
