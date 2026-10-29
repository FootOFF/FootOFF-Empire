import { BUILDINGS, DIVISIONS, ELITE_SCALE, POS_LABELS, SQUAD_MAX, SQUAD_MIN, START_MONEY, upgradeCost } from './constants';
import { OFFLINE_CAP, offlinePerHour } from './economy';
import { assignNumber, costOf, makePlayer, saleValue, wageOf } from './players';
import {
  C_TRIES, cleanTerms, contractChance, contractSerious, counterTerms, ctalksOf, demandOf, ensureDeals, renewOpen, setDeal,
} from './contracts';
import { distinctFace } from './faces';
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
import { raiseYouth } from './squadFloor';
import { snapPlayer, unsnapPlayer } from './leagueWorld';
import { book, ensureLedger } from './ledger';
import { addSigning, emptyRecords, rebuildRecords } from './records';
import { normalizeCrest } from './crest';
import { journalLearned, setPick, setStaff, staffSession, startProgram, stopProgram, tidyTraining, trainLine } from './training';
import { gameLang, numLocale, t, tn } from '../i18n/index';

export { playRound, endSeason };
export { applyMatchResult, matchContext } from './season';
export { upkeepOf, capacity } from './economy';

export function createInitialState(clubName, crest = null) {
  registerNames([]); // nouvelle partie : aucun nom de joueur encore porté
  const s = {
    version: 4,
    eliteScale: ELITE_SCALE, // économie de l'Élite à l'échelle d'un grand championnat (0.6.0, save.js)
    clubName,
    lang: gameLang(), // langue de la partie (src/i18n) : fixée à la fondation, les noms en dépendent
    crest: normalizeCrest(crest), // écusson composé à la fondation, toujours noir et or (crest.js)
    createdAt: Date.now(),
    lastSeen: Date.now(),
    money: START_MONEY,
    reputation: 5,
    divisionIndex: 0,
    seasonNumber: 1,
    round: 0,
    buildings: { terrain: 1, training: 0, academy: 0, fans: 0, sponsor: 0, transfers: 0, direction: 0, medical: 0, league: 0 },
    slots: Array(PLOTS.length).fill(null),
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
    distinctFace(s.players, p); // aucun sosie dans l'effectif
    s.players.push(p);
  }
  addReserves(s);
  ensureDeals(s); // contrats de départ : deux à quatre saisons (contracts.js)
  ensureFixedPlots(s); // le stade occupe sa parcelle dès le départ
  ensureLineup(s); // onze de départ et tactique équilibrée
  startSeason(s);
  prepareFirstSeason(s); // premier adversaire à portée, recrue abordable sur le marché
  s.tutorial = { step: 'welcome' };
  initGoals(s);
  pushJournal(s, {
    season: 1,
    kind: 'club',
    title: t('Le projet {clubName} est lancé', { clubName }),
    text: t('{clubName} entame sa première saison en {name}. Le terrain est modeste, l’ambition immense.', { clubName, name: DIVISIONS[0].name }),
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
    distinctFace(s.players, p); // aucun sosie dans l'effectif
    s.players.push(p);
  }
  return s;
}

// where : la parcelle choisie (t1…t8), où que ce soit ; à défaut (ancien appel par secteur), la première libre.
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
    season: s.seasonNumber, kind: 'infra', title: t('{name} : premier coup de pioche', { name: BUILDINGS[key].name }),
    text: t('Le club investit {toLocaleString} € dans un nouveau bâtiment.', { toLocaleString: upgradeCost(key, 1).toLocaleString(numLocale()) }),
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
    season: s.seasonNumber, kind: 'infra', title: t('{name} : cap sur le niveau {v}', { name: BUILDINGS[key].name, v: lvl + 1 }),
    text: t('Travaux d’amélioration engagés pour {toLocaleString} €.', { toLocaleString: cost.toLocaleString(numLocale()) }),
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
    season: s.seasonNumber, round: s.round, kind: 'academie', title: t('{name} rejoint l’académie', { name: p.name }),
    text: t('{v} de {age} ans, repéré par les éducateurs du club.', { v: POS_LABELS[p.pos], age: p.age }),
  });
  return s;
}

// Fait monter un jeune en équipe première (s'il y a de la place) : il garde la marque « formé au club » et sa saison
// d'arrivée à l'académie (youthSince : son potentiel reste aussi bien cerné).
export function promoteYouth(s, id) {
  const p = (s.youth || []).find((q) => q.id === id);
  if (!p || s.players.length >= SQUAD_MAX) return null;
  raiseYouth(s, p); // premier contrat professionnel : trois saisons (squadFloor.js)
  return s;
}

// Libère un jeune : il quitte l'académie (et le club).
export function releaseYouth(s, id) {
  const p = (s.youth || []).find((q) => q.id === id);
  if (!p) return null;
  s.youth = s.youth.filter((q) => q !== p);
  pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'academie', title: t('{name} quitte l’académie', { name: p.name }), text: t('Libéré à {age} ans.', { age: p.age }) });
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
  if (r.learned) journalLearned(s, r);
  return s;
}
export const setTrainingPick = setPick;
export const setTrainingStaff = setStaff;
export { staffSession, startProgram, stopProgram };

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
    season: s.seasonNumber, kind: 'mercato', title: t('{name} quitte le club', { name: p.name }),
    text: t('Le joueur rejoint {withArticle} pour {toLocaleString} €.', { withArticle: withArticle(to), toLocaleString: amount.toLocaleString(numLocale()) }),
  });
  return s;
}
export const releasePlayer = sellPlayer;

// Signature d'une recrue du marché : indemnité convenue avec son club (0 pour un joueur libre) et contrat signé avec
// le joueur (salaire, durée, prime, clause : contracts.js). La prime se paie à la signature ; pour un joueur libre,
// c'est elle qui fait le montant du transfert (bilan du mercato, fiche, records).
function completeSigning(s, p, fee, terms) {
  const pool = s.market.includes(p) ? s.market : s.transfers;
  pool.splice(pool.indexOf(p), 1);
  const from = p.club;
  const paid = from ? fee : terms.bonus;
  for (const k of ['club', 'contract', 'listedAt', 'priceMod', 'trend', 'interest', 'listedRounds', 'talks', 'ctalks']) delete p[k];
  for (const k of ['leagueKind', 'leaguePrice', 'leagueSlot', 'leagueMember', 'price', 'since']) delete p[k]; // championnat entre amis
  s.money -= fee + terms.bonus;
  book(s, 'signings', fee + terms.bonus);
  addSigning(s.records ||= rebuildRecords(s), p, paid, s); // record : plus gros achat
  p.joined = s.seasonNumber;
  setDeal(s, p, terms);
  // montant, club d'origine et moment de la signature (fiche du joueur) ; pas de revente avant quatre journées de
  // championnat au club (mercato.js, saleBlock)
  p.signed = { fee: paid, from: from || null, season: s.seasonNumber, round: s.round, date: dateKey(s), ...(from && terms.bonus ? { bonus: terms.bonus } : {}) };
  lockResale(s, p);
  assignNumber(s.players, p);
  distinctFace(s.players, p); // aucun sosie dans l'effectif
  s.players.push(p);
  s.signings = (s.signings || 0) + 1;
  logMove(s, 'in', p, paid, from);
  s.shortlist = (s.shortlist || []).filter((x) => x.id !== p.id);
  const years = tn(terms.years, '{n} an', '{n} ans', { n: terms.years }, terms.years > 1);
  const eur = (v) => `${v.toLocaleString(numLocale())} €`;
  pushJournal(s, {
    season: s.seasonNumber, kind: 'mercato', title: `${p.name} rejoint ${s.clubName}`,
    text: from
      ? t('Transfert conclu : il arrive {clubAfter} pour {fee}, à {age} ans. Contrat de {years} à {wage} par saison.', { clubAfter: clubAfter('de ', from), fee: eur(fee), age: p.age, years, wage: eur(terms.wage) })
      : t('À {age} ans, il s’engage pour {years} à {wage} par saison{v}.', { age: p.age, years, wage: eur(terms.wage), v: terms.bonus ? t(', avec une prime de {bonus}', { bonus: eur(terms.bonus) }) : '' }),
  });
  return s;
}

// Championnat entre amis (0.8.3) : la recrue dont le serveur des ligues a confirmé la signature (leagueClub.js,
// settleLeague) ; item : la demande gardée dans la file (le joueur tel qu'il était sur le marché, l'indemnité, le contrat).
// Si la place a été relue entre-temps (il n'y est plus : c'est lui qu'on vient de signer), il est refait d'après la demande.
export function signLeagueRecruit(s, item) {
  let p = findOnMarket(s, item.id);
  if (!p) {
    p = { ...unsnapPlayer(item.pl), id: item.id, club: item.kind === 'a' ? item.club || t('Club de la ligue') : null };
    s.transfers = [...(s.transfers || []), p];
  }
  return completeSigning(s, p, item.kind === 'a' ? item.fee : 0, item.terms);
}

// Achat au prix demandé et aux conditions demandées par le joueur, sans négociation (aperçus de la galerie).
export function signPlayer(s, id) {
  const p = findOnMarket(s, id);
  if (!p || s.players.length >= SQUAD_MAX) return null;
  const fee = p.club ? costOf(p, s) : 0;
  const terms = demandOf(s, p);
  if (s.money < fee + terms.bonus) return null;
  return completeSigning(s, p, fee, terms);
}

// Indemnité convenue avec le club vendeur : elle est réservée jusqu'à la prochaine journée (le marché referme alors les
// négociations, transfers.js), le temps de s'accorder avec le joueur sur son contrat.
function agreeFee(s, p, fee) {
  p.talks = { tries: p.talks?.tries || 0, fee };
  delete p.ctalks;
}

// Offre d'achat à un club : réponse immédiate du vendeur. Accord (avec exactement la chance affichée) : l'indemnité est
// réservée et la négociation passe au contrat du joueur ; contre-proposition si l'offre était sérieuse, refus sec sinon ;
// trois tentatives par joueur et par journée. Résultat dans s.lastDeal. Un joueur libre n'a pas d'indemnité : on négocie
// directement son contrat (offerContract).
export function makeOffer(s, id, amount) {
  const p = findOnMarket(s, id);
  if (!p || !p.club || s.players.length >= SQUAD_MAX || !(amount > 0) || amount > s.money || p.talks?.closed || p.talks?.fee) return null;
  const ask = costOf(p, s);
  if (Math.random() < acceptChance(s, p, amount, ask)) {
    agreeFee(s, p, amount);
    s.lastDeal = { id: p.id, name: p.name, result: 'agreed', amount, ask, at: Date.now() };
    return s;
  }
  const serious = isSerious(s, p, amount, ask);
  p.talks = { ...(p.talks || {}), tries: (p.talks?.tries || 0) + 1 };
  if (serious) p.talks.counter = counterFor(s, p, ask); // le vendeur durcit sa position après chaque refus
  p.talks.closed = p.talks.tries >= TRIES;
  s.lastDeal = { id: p.id, name: p.name, result: serious ? 'countered' : 'refused', amount, ask, counter: p.talks.counter || null, at: Date.now() };
  return s;
}

// Contre-proposition du vendeur acceptée : l'indemnité est convenue, place au contrat.
export function acceptCounter(s, id) {
  const p = findOnMarket(s, id);
  const fee = p?.talks?.counter;
  if (!fee || p.talks.fee || s.players.length >= SQUAD_MAX || fee > s.money) return null;
  const ask = costOf(p, s);
  agreeFee(s, p, fee);
  s.lastDeal = { id: p.id, name: p.name, result: 'agreed', amount: fee, ask, at: Date.now() };
  return s;
}

// Ce qui empêche de proposer ce contrat, ou null : effectif complet, indemnité pas encore convenue, trésorerie (indemnité
// et prime), discussions closes pour la journée, prolongation impossible.
export function contractBlock(s, p, terms) {
  if (ctalksOf(s, p).closed) return t('Il ne discutera plus avant la prochaine journée.');
  if (!s.players.includes(p) && s.league?.outbox?.some((x) => x.k === 'sign')) return t('Une signature attend la réponse de la ligue.');
  if (s.players.includes(p)) {
    if (!renewOpen(s, p)) return t('Son contrat court déjà sur cinq ans : impossible de le prolonger.');
    if (terms.bonus > s.money) return t('Trésorerie insuffisante pour cette prime.');
    return null;
  }
  if (s.players.length >= SQUAD_MAX) return t('Effectif complet ({SQUAD_MAX} joueurs) : vends d’abord un joueur.', { SQUAD_MAX });
  if (p.club && !p.talks?.fee) return t('Convenir d’abord de l’indemnité avec son club.');
  const fee = p.club ? p.talks.fee : 0;
  if (fee + terms.bonus > s.money) return fee ? t('Trésorerie insuffisante pour l’indemnité et la prime.') : t('Trésorerie insuffisante pour cette prime.');
  return null;
}

// Contrat signé : recrue (signature du transfert) ou prolongation (nouveau contrat, prime payée tout de suite).
function sealContract(s, p, terms, renew) {
  if (!renew) {
    const fee = p.club ? p.talks.fee : 0;
    if (s.league && (p.leagueKind === 'market' || p.leagueKind === 'ai')) {
      // championnat entre amis (0.8.3) : la signature part au serveur des ligues, le premier club qui conclut l'emporte ;
      // la recrue arrive à sa réponse (leagueClub.js, settleLeague)
      const item = { k: 'sign', id: p.id, kind: p.leagueKind === 'ai' ? 'a' : 'm', pid: p.lid, slot: p.leagueSlot ?? null, club: p.club || null, fee, terms, n: p.name, pl: snapPlayer(p), at: Date.now() };
      s.league.outbox = [...(s.league.outbox || []).filter((x) => !(x.k === 'sign' && x.pid === p.lid)), item];
      s.lastContract = { id: p.id, name: p.name, result: 'pending', renew, terms, fee, at: Date.now() };
      return s;
    }
    completeSigning(s, p, fee, terms);
    s.lastContract = { id: p.id, name: p.name, result: 'accepted', renew, terms, fee, at: Date.now() };
    return s;
  }
  const before = wageOf(p, s.divisionIndex);
  setDeal(s, p, terms);
  s.money -= terms.bonus;
  book(s, 'wages', terms.bonus);
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'club', title: t('{name} prolonge jusqu’à la saison {until}', { name: p.name, until: p.deal.until }),
    text: t('Nouveau contrat à {toLocaleString} € par saison ({toLocaleString2} € jusqu’ici){v}{v2}.', { toLocaleString: terms.wage.toLocaleString(numLocale()), toLocaleString2: before.toLocaleString(numLocale()), v: terms.bonus ? t(', prime de {toLocaleString} €', { toLocaleString: terms.bonus.toLocaleString(numLocale()) }) : '', v2: terms.clause ? t(', clause de montée de +{round} %', { round: Math.round(terms.clause * 100) }) : '' }),
  });
  s.lastContract = { id: p.id, name: p.name, result: 'accepted', renew, terms, before, at: Date.now() };
  return s;
}

// Proposition de contrat (recrue après l'indemnité, joueur libre, prolongation) : réponse immédiate du joueur. Accord
// avec exactement la chance affichée ; sinon contre-proposition de son agent si la proposition était sérieuse (au
// salaire qui le fait signer à coup sûr), refus sec sinon ; trois propositions par joueur et par journée. Résultat
// dans s.lastContract.
export function offerContract(s, id, terms) {
  const own = s.players.find((q) => q.id === id);
  const p = own || findOnMarket(s, id);
  if (!p) return null;
  const renew = !!own;
  const t = cleanTerms(s, p, terms, renew);
  if (!t || contractBlock(s, p, t)) return null;
  if (Math.random() < contractChance(s, p, t, renew)) return sealContract(s, p, t, renew);
  const serious = contractSerious(s, p, t, renew);
  const tries = (ctalksOf(s, p).tries || 0) + 1;
  p.ctalks = { at: roundKey(s), tries, closed: tries >= C_TRIES, counter: null };
  if (serious) p.ctalks.counter = counterTerms(s, p, t, renew); // il durcit sa position après chaque refus
  s.lastContract = { id: p.id, name: p.name, result: serious ? 'countered' : 'refused', renew, terms: t, counter: p.ctalks.counter, at: Date.now() };
  return s;
}

// Contre-proposition de son agent acceptée : la signature est certaine (même après trois propositions refusées).
export function acceptContractCounter(s, id) {
  const own = s.players.find((q) => q.id === id);
  const p = own || findOnMarket(s, id);
  const counter = p && ctalksOf(s, p).counter;
  if (!counter) return null;
  const talks = p.ctalks;
  p.ctalks = { ...talks, closed: false }; // la contre-proposition tient même quand les discussions sont closes
  if (contractBlock(s, p, counter)) { p.ctalks = talks; return null; }
  return sealContract(s, p, counter, !!own);
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
// s.lastSale ; après une négociation, la vente garde la trace de l'offre de départ (ce que la négociation a rapporté).
export function answerOffer(s, offerId, action) {
  const o = (s.offers || []).find((x) => x.id === offerId);
  const p = o && s.players.find((q) => q.id === o.playerId);
  if (!p) return null;
  if (action === 'accept') {
    if (saleBlock(s, p)) return null;
    const note = saleNote(s, o, p, 'sold', o.talks?.first > 0 && o.talks.first < o.amount ? { offered: o.talks.first } : {});
    if (!sellPlayer(s, p.id, o.amount, o.club)) return null;
    s.lastSale = note;
    return s;
  }
  s.offers = s.offers.filter((x) => x !== o);
  s.lastSale = saleNote(s, o, p, 'refused');
  return s;
}

// Négociation d'une vente : on demande plus que l'offre d'un club. Il accepte avec exactement la chance affichée : son
// offre passe à ce prix et la négociation est close, mais la vente reste à décider (0.7.6 : elle se faisait aussitôt,
// sans que le joueur l'ait voulu) ; sinon, si la demande avait une chance, il se braque et donne son dernier mot (son
// offre monte à ce qu'il paie à coup sûr) ; sans aucune chance, il part. SALE_TRIES demandes par offre. Résultat dans
// s.lastSale.
export function demandOffer(s, offerId, demand) {
  const o = (s.offers || []).find((x) => x.id === offerId);
  const p = o && s.players.find((q) => q.id === o.playerId);
  if (!p || !(demand > o.amount) || o.talks?.closed || s.players.length <= SQUAD_MIN || saleBlock(s, p)) return null;
  const chance = demandChance(o, demand);
  o.talks = { ...(o.talks || {}), first: o.talks?.first || o.amount }; // offre de départ, avant toute demande
  if (Math.random() < chance) {
    const before = o.amount;
    o.amount = demand;
    o.talks = { ...o.talks, tries: (o.talks.tries || 0) + 1, closed: true, agreed: true };
    s.lastSale = saleNote(s, o, p, 'agreed', { demand, offered: before });
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
