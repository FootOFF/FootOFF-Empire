import { BUILDINGS, DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN, START_MONEY, upgradeCost } from './constants';
import { OFFLINE_CAP, offlinePerHour } from './economy';
import { assignNumber, costOf, makePlayer, saleValue, wageOf } from './players';
import {
  SALE_TRIES, TRIES, acceptChance, auctionDone, counterFor, dateKey, demandChance, findOnMarket, isSerious, lastWordOf,
  lockResale, logMove, offersFor, outbidAmount, outbidChance, roundKey, roundTo, saleBlock, valueOf,
} from './mercato';
import { listingOffers, refreshTransfers } from './transfers';
import { PLANS, YOUTH_PLACES, advisedPlan, refreshScouting } from './academy';
import { clubAfter, randomClubName, registerNames, withArticle } from './names';
import { archivePlayer, endSeason, playRound, pushJournal, startSeason } from './season';
import { initGoals } from './goals';
import { PLOTS, ensureFixedPlots, plotIndexOf } from './map';
import { ensureLineup } from './tactics';
import { prepareFirstSeason } from './tutorial';
import { rnd } from './utils';
import { book, ensureLedger } from './ledger';
import { addSigning, emptyRecords, rebuildRecords } from './records';
import { normalizeCrest } from './crest';
import { PROGRAMS, programDesc, programLabel, setPick, startProgram, stopProgram, tidyTraining, trainLine } from './training';

export { playRound, endSeason };
export { applyMatchResult, matchContext } from './season';
export { upkeepOf, capacity } from './economy';

export function createInitialState(clubName, crest = null) {
  registerNames([]); // nouvelle partie : aucun nom de joueur encore porté
  const s = {
    version: 4,
    clubName,
    crest: normalizeCrest(crest), // écusson composé à la fondation, toujours noir et or (crest.js)
    createdAt: Date.now(),
    lastSeen: Date.now(),
    money: START_MONEY,
    reputation: 5,
    divisionIndex: 0,
    seasonNumber: 1,
    round: 0,
    buildings: { terrain: 1, training: 0, academy: 0, fans: 0, sponsor: 0, transfers: 0, direction: 0, medical: 0 },
    slots: Array(8).fill(null),
    players: [],
    youth: [], // équipe de jeunes de l'académie (academy.js)
    scouting: null, // jeunes repérés de la journée
    rivals: [],
    schedule: [],
    table: [],
    market: [],
    transfers: [],
    trophies: [],
    records: emptyRecords(), // records du club, tenus match après match
    achievements: {}, // succès débloqués : id -> { season, round }
    ticketPolicy: 'standard',
    journal: [],
    history: [],
    lastMatch: null,
    seasonReview: null,
    offline: null,
    goals: null,
    nextId: 1,
  };
  // onze de départ au niveau du milieu de la Départementale (environ 6,2) : la montée se gagne, elle n'est pas offerte
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A']) {
    const p = makePlayer({ level: rnd(0.3, 0.8), pos });
    p.id = s.nextId++;
    p.joined = 1;
    assignNumber(s.players, p);
    s.players.push(p);
  }
  addReserves(s);
  ensureFixedPlots(s); // le stade occupe sa parcelle dès le départ
  ensureLineup(s); // onze de départ et tactique équilibrée
  startSeason(s);
  prepareFirstSeason(s); // premier adversaire à portée, recrue abordable sur le marché
  s.tutorial = { step: 'welcome' };
  initGoals(s);
  pushJournal(s, {
    season: 1,
    kind: 'club',
    title: `Le projet ${clubName} est lancé`,
    text: `${clubName} entame sa première saison en ${DIVISIONS[0].name}. Le terrain est modeste, l’ambition immense.`,
  });
  ensureLedger(s);
  return s;
}

// Banc de départ : 4 remplaçants (un par ligne), un peu moins forts que les titulaires.
export function addReserves(s) {
  if (s.reserves) return s;
  s.reserves = true;
  for (const pos of ['G', 'D', 'M', 'A']) {
    if (s.players.length >= SQUAD_MAX) break;
    const p = makePlayer({ level: rnd(0.1, 0.45), pos });
    p.id = s.nextId++;
    p.joined = s.seasonNumber || 1;
    assignNumber(s.players, p);
    s.players.push(p);
  }
  return s;
}

// where : la parcelle choisie (t1…t7), où que ce soit ; à défaut (ancien appel par secteur), la première libre.
export function build(s, where, key) {
  const free = (p) => !p.building && s.slots[plotIndexOf(p.id)] === null; // jamais sur le stade (t0)
  const plot = PLOTS.some((p) => p.id === where) ? PLOTS.find((p) => p.id === where && free(p)) : PLOTS.find(free);
  if (!plot || s.buildings[key] > 0 || s.money < upgradeCost(key, 1)) return null;
  s.slots[plotIndexOf(plot.id)] = key;
  s.buildings[key] = 1;
  s.money -= upgradeCost(key, 1);
  book(s, 'works', upgradeCost(key, 1));
  if (key === 'transfers') refreshTransfers(s, 'grow'); // les recruteurs livrent leur première liste
  if (key === 'academy') refreshScouting(s); // premiers jeunes repérés, tout de suite
  pushJournal(s, {
    season: s.seasonNumber, kind: 'infra', title: `${BUILDINGS[key].name} : premier coup de pioche`,
    text: `Le club investit ${upgradeCost(key, 1).toLocaleString('fr-FR')} € dans un nouveau bâtiment.`,
  });
  return s;
}

// Politique tarifaire du stade (populaire, normal, premium, prestige).
export function setTicketPolicy(s, id) {
  if (!['popular', 'standard', 'premium', 'prestige'].includes(id)) return null;
  s.ticketPolicy = id;
  return s;
}

export function upgrade(s, key) {
  const lvl = s.buildings[key];
  const cost = upgradeCost(key, lvl + 1);
  if (lvl >= BUILDINGS[key].max || s.money < cost) return null;
  s.buildings[key] = lvl + 1;
  s.money -= cost;
  book(s, 'works', cost);
  if (key === 'transfers') refreshTransfers(s, 'grow'); // liste allongée tout de suite
  if (key === 'academy') refreshScouting(s); // des jeunes repérés en plus, tout de suite
  pushJournal(s, {
    season: s.seasonNumber, kind: 'infra', title: `${BUILDINGS[key].name} : cap sur le niveau ${lvl + 1}`,
    text: `Travaux d’amélioration engagés pour ${cost.toLocaleString('fr-FR')} €.`,
  });
  return s;
}

// --- Académie (voir academy.js) ---------------------------------------------------------------------------

// Recrute un jeune repéré dans l'équipe de jeunes : gratuit, dans la limite des places ; plan conseillé pour son poste.
export function signYouth(s, id) {
  const list = s.scouting?.list || [];
  const p = list.find((q) => q.id === id);
  if (!p || !(s.buildings.academy > 0) || (s.youth || []).length >= YOUTH_PLACES) return null;
  s.scouting.list = list.filter((q) => q !== p);
  Object.assign(p, { academy: true, plan: advisedPlan(p), youthSince: s.seasonNumber, gain: { round: 0, season: 0, summer: null } });
  s.youth = [...(s.youth || []), p];
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: `${p.name} rejoint l’académie`,
    text: `${POS_LABELS[p.pos]} de ${p.age} ans, repéré par les éducateurs du club.`,
  });
  return s;
}

// Fait monter un jeune en équipe première (s'il y a de la place) : il garde la marque « formé au club » et sa saison
// d'arrivée à l'académie (youthSince : son potentiel reste aussi bien cerné).
export function promoteYouth(s, id) {
  const p = (s.youth || []).find((q) => q.id === id);
  if (!p || s.players.length >= SQUAD_MAX) return null;
  s.youth = s.youth.filter((q) => q !== p);
  delete p.plan;
  delete p.gain;
  p.joined = s.seasonNumber;
  lockResale(s, p); // pas de vente avant quatre journées de championnat en équipe première
  assignNumber(s.players, p);
  s.players.push(p);
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: `${p.name} monte en équipe première`,
    text: `Formé à l’académie, il rejoint l’effectif professionnel à ${p.age} ans, avec le numéro ${p.num}.`,
  });
  return s;
}

// Libère un jeune : il quitte l'académie (et le club).
export function releaseYouth(s, id) {
  const p = (s.youth || []).find((q) => q.id === id);
  if (!p) return null;
  s.youth = s.youth.filter((q) => q !== p);
  pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'academie', title: `${p.name} quitte l’académie`, text: `Libéré à ${p.age} ans.` });
  return s;
}

// Plan d'entraînement d'un jeune : les qualités qu'il travaille en priorité.
export function setYouthPlan(s, id, plan) {
  const p = (s.youth || []).find((q) => q.id === id);
  if (!p || !PLANS[plan]) return null;
  p.plan = plan;
  return s;
}

// --- Centre d'entraînement (voir training.js) -------------------------------------------------------------

// Épreuve d'un joueur de la séance (jouée : score de 0 à 1 ; simulée : score null). Un signe distinctif appris au
// bout d'un programme entre au journal.
export function trainPlayer(s, pos, pick) {
  if (!trainLine(s, pos, pick)) return null;
  const r = s.training.done[pos];
  if (r.learned) {
    const removed = !!PROGRAMS[r.learned].remove;
    pushJournal(s, {
      season: s.seasonNumber, round: s.round, kind: 'entrainement',
      title: removed ? `${r.name} apprend à se maîtriser` : `${r.name} gagne un signe distinctif : ${programLabel(r.learned)}`,
      text: `Au bout de son programme au centre d’entraînement. ${programDesc(r.learned)}`,
    });
  }
  return s;
}
export const setTrainingPick = setPick;
export { startProgram, stopProgram };

// --- Mercato (voir mercato.js et transfers.js) ------------------------------------------------------------

// Vente d'un joueur à un autre club, au prix d'une offre reçue (il n'y a plus de vente immédiate : toute vente passe
// par la mise en vente et les offres des clubs). Sans montant (aperçus de la galerie) : à sa valeur.
export function sellPlayer(s, id, fee = null, club = null) {
  if (s.players.length <= SQUAD_MIN) return null;
  const idx = s.players.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const amount = fee ?? saleValue(s.players[idx], s.divisionIndex);
  const to = club || randomClubName();
  archivePlayer(s, s.players[idx], { reason: 'vente', fee: amount, club: to });
  const [p] = s.players.splice(idx, 1);
  s.money += amount;
  book(s, 'sales', amount);
  logMove(s, 'out', p, amount, to);
  s.saleList = (s.saleList || []).filter((x) => x.id !== id);
  s.offers = (s.offers || []).filter((o) => o.playerId !== id);
  tidyTraining(s); // son programme au centre d'entraînement s'arrête
  ensureLineup(s);
  pushJournal(s, {
    season: s.seasonNumber, kind: 'mercato', title: `${p.name} quitte le club`,
    text: `Le joueur rejoint ${withArticle(to)} pour ${amount.toLocaleString('fr-FR')} €.`,
  });
  return s;
}
export const releasePlayer = sellPlayer;

// Signature d'une recrue du marché au montant convenu.
function completeSigning(s, p, fee) {
  const pool = s.market.includes(p) ? s.market : s.transfers;
  pool.splice(pool.indexOf(p), 1);
  const from = p.club;
  for (const k of ['club', 'contract', 'listedAt', 'priceMod', 'trend', 'interest', 'listedRounds', 'talks']) delete p[k];
  s.money -= fee;
  book(s, 'signings', fee);
  addSigning(s.records ||= rebuildRecords(s), p, fee, s); // record : plus gros achat
  p.joined = s.seasonNumber;
  // montant, club d'origine et moment de la signature (fiche du joueur) ; pas de revente avant quatre journées de
  // championnat au club (mercato.js, saleBlock)
  p.signed = { fee, from: from || null, season: s.seasonNumber, round: s.round, date: dateKey(s) };
  lockResale(s, p);
  assignNumber(s.players, p);
  s.players.push(p);
  s.signings = (s.signings || 0) + 1;
  logMove(s, 'in', p, fee, from);
  s.shortlist = (s.shortlist || []).filter((x) => x.id !== p.id);
  pushJournal(s, {
    season: s.seasonNumber, kind: 'mercato', title: `${p.name} rejoint ${s.clubName}`,
    text: from
      ? `Transfert conclu : il arrive ${clubAfter('de ', from)} pour ${fee.toLocaleString('fr-FR')} €, à ${p.age} ans.`
      : `À ${p.age} ans, il s’engage avec le club pour ${fee.toLocaleString('fr-FR')} €.`,
  });
  return s;
}

// Achat au prix demandé, sans négociation.
export function signPlayer(s, id) {
  const p = findOnMarket(s, id);
  if (!p || s.players.length >= SQUAD_MAX) return null;
  const fee = costOf(p, s);
  if (s.money < fee) return null;
  return completeSigning(s, p, fee);
}

// Offre d'achat : réponse immédiate du vendeur. Accord (avec exactement la chance affichée), contre-proposition
// si l'offre était sérieuse, refus sec sinon ; trois tentatives par joueur et par journée. Résultat dans s.lastDeal.
export function makeOffer(s, id, amount) {
  const p = findOnMarket(s, id);
  if (!p || s.players.length >= SQUAD_MAX || !(amount > 0) || amount > s.money || p.talks?.closed) return null;
  const ask = costOf(p, s);
  if (Math.random() < acceptChance(s, p, amount, ask)) {
    completeSigning(s, p, amount);
    s.lastDeal = { id: p.id, name: p.name, result: 'accepted', amount, ask, at: Date.now() };
    return s;
  }
  const serious = isSerious(s, p, amount, ask);
  p.talks = { ...(p.talks || {}), tries: (p.talks?.tries || 0) + 1 };
  if (serious) p.talks.counter = counterFor(s, p, ask); // le vendeur durcit sa position après chaque refus
  p.talks.closed = p.talks.tries >= TRIES;
  s.lastDeal = { id: p.id, name: p.name, result: serious ? 'countered' : 'refused', amount, ask, counter: p.talks.counter || null, at: Date.now() };
  return s;
}

// Contre-proposition acceptée : la signature est certaine.
export function acceptCounter(s, id) {
  const p = findOnMarket(s, id);
  const fee = p?.talks?.counter;
  if (!fee || s.players.length >= SQUAD_MAX || fee > s.money) return null;
  const ask = costOf(p, s);
  completeSigning(s, p, fee);
  s.lastDeal = { id: p.id, name: p.name, result: 'accepted', amount: fee, ask, at: Date.now() };
  return s;
}

// Joueur suivi (liste de souhaits) : son prix au moment où on l'ajoute sert de repère.
export function toggleShortlist(s, id) {
  s.shortlist ||= [];
  const i = s.shortlist.findIndex((x) => x.id === id);
  if (i >= 0) { s.shortlist.splice(i, 1); return s; }
  const p = findOnMarket(s, id);
  if (!p) return null;
  s.shortlist.push({ id, name: p.name, pos: p.pos, price: costOf(p, s), at: roundKey(s) });
  return s;
}

// Joueur de l'effectif mis sur le marché à un prix (ou retiré). Mis en vente, les clubs intéressés font aussitôt leur
// offre (transfers.js), d'autres suivent après chaque journée. Retiré, ses offres encore ouvertes sont mises de côté
// jusqu'à la fin de la journée : remis en vente, il les retrouve, sans nouveaux clubs avant la journée suivante.
export function setForSale(s, id, on, price = null) {
  const p = s.players.find((q) => q.id === id);
  if (!p || (on && saleBlock(s, p))) return null; // blessé, suspendu ou tout juste recruté : pas de mise en vente
  const was = (s.saleList || []).find((x) => x.id === id);
  s.saleList = (s.saleList || []).filter((x) => x.id !== id);
  s.offers ||= [];
  if (on) {
    const ask = price > 0 ? Math.round(price) : was?.price || roundTo(valueOf(s, p));
    s.saleList.push({ id, at: roundKey(s), price: ask });
    if (!s.offers.some((o) => o.playerId === id && !o.unsolicited)) s.offers.push(...listingOffers(s, p, ask));
  } else {
    const open = s.offers.filter((o) => o.playerId === id && !o.unsolicited);
    s.parkedOffers = [...(s.parkedOffers || []).filter((o) => o.playerId !== id), ...open];
    s.offers = s.offers.filter((o) => o.playerId !== id || o.unsolicited);
  }
  return s;
}

// Trace de la dernière réponse à une offre reçue (vue Offres, négociation et écran de vente conclue).
const saleNote = (s, o, p, result, extra = {}) => ({
  offerId: o.id, playerId: p.id, name: p.name, club: o.club, tier: o.tier, div: o.div, amount: o.amount, value: o.v,
  wage: wageOf(p, s.divisionIndex), result, at: Date.now(), ...extra,
});

// Réponse à une offre reçue : accepter (vente au montant de l'offre) ou refuser (le club se retire). Résultat dans
// s.lastSale.
export function answerOffer(s, offerId, action) {
  const o = (s.offers || []).find((x) => x.id === offerId);
  const p = o && s.players.find((q) => q.id === o.playerId);
  if (!p) return null;
  if (action === 'accept') {
    if (saleBlock(s, p)) return null;
    const note = saleNote(s, o, p, 'sold');
    if (!sellPlayer(s, p.id, o.amount, o.club)) return null;
    s.lastSale = note;
    return s;
  }
  s.offers = s.offers.filter((x) => x !== o);
  s.lastSale = saleNote(s, o, p, 'refused');
  return s;
}

// Négociation d'une vente : on demande plus que l'offre d'un club. Il accepte avec exactement la chance affichée (vente
// à ce prix) ; sinon, si la demande avait une chance, il se braque et donne son dernier mot (son offre monte à ce qu'il
// paie à coup sûr) ; sans aucune chance, il part. SALE_TRIES demandes par offre. Résultat dans s.lastSale.
export function demandOffer(s, offerId, demand) {
  const o = (s.offers || []).find((x) => x.id === offerId);
  const p = o && s.players.find((q) => q.id === o.playerId);
  if (!p || !(demand > o.amount) || o.talks?.closed || s.players.length <= SQUAD_MIN || saleBlock(s, p)) return null;
  const chance = demandChance(o, demand);
  if (Math.random() < chance) {
    const note = saleNote(s, o, p, 'sold', { amount: demand, demand, offered: o.amount });
    sellPlayer(s, p.id, demand, o.club);
    s.lastSale = note;
    return s;
  }
  if (chance <= 0) {
    s.offers = s.offers.filter((x) => x !== o);
    s.lastSale = saleNote(s, o, p, 'walked', { demand });
    return s;
  }
  const before = o.amount;
  o.talks = { ...(o.talks || {}), tries: (o.talks?.tries || 0) + 1 };
  o.amount = lastWordOf(o);
  o.talks.closed = o.talks.tries >= SALE_TRIES;
  s.lastSale = saleNote(s, o, p, o.amount > before ? 'countered' : 'held', { demand, offered: before });
  return s;
}

// Enchères entre les clubs en lice pour un joueur (deux offres au moins, une fois par journée) : la meilleure offre
// tient ; chaque autre club la bat (avec exactement la chance affichée) ou se retire. Résultat dans s.lastAuction.
export function startAuction(s, playerId) {
  const p = s.players.find((q) => q.id === playerId);
  const [top, ...rest] = offersFor(s, playerId);
  if (!p || !rest.length || auctionDone(s, playerId)) return null;
  const best = top.amount;
  const moves = rest.map((o) => {
    const from = o.amount;
    if (Math.random() < outbidChance(o, best)) {
      o.amount = outbidAmount(o, best);
      return { offerId: o.id, club: o.club, from, to: o.amount };
    }
    s.offers = s.offers.filter((x) => x !== o);
    return { offerId: o.id, club: o.club, from, to: null };
  });
  s.auctions = { ...(s.auctions || {}), [playerId]: roundKey(s) };
  s.lastAuction = { playerId, name: p.name, club: top.club, best, moves, at: Date.now() };
  return s;
}

export function applyOffline(s, now = Date.now()) {
  const lvl = s.buildings.sponsor;
  const hours = (now - (s.lastSeen || now)) / 3600000;
  if (lvl <= 0 || hours < 0.15) {
    s.lastSeen = now;
    return s;
  }
  const h = Math.min(hours, OFFLINE_CAP);
  const amount = Math.round(offlinePerHour(lvl, s.divisionIndex) * h);
  s.money += amount;
  book(s, 'offline', amount);
  s.offline = { hours: Math.round(h * 10) / 10, amount };
  s.lastSeen = now;
  return s;
}

export const dismissOffline = (s) => {
  s.offline = null;
  return s;
};

export const dismissReview = (s) => {
  s.seasonReview = null;
  return s;
};
