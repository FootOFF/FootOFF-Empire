import { BUILDINGS, DIVISIONS, SQUAD_MAX, SQUAD_MIN, START_MONEY, upgradeCost } from './constants';
import { OFFLINE_CAP, offlinePerHour } from './economy';
import { assignNumber, costOf, makePlayer, saleValue } from './players';
import { refreshTransfers } from './transfers';
import { clubAfter, randomClubName } from './names';
import { endSeason, playRound, pushJournal, startSeason } from './season';
import { initGoals } from './goals';
import { PLOTS, ensureFixedPlots, plotIndexOf } from './map';
import { ensureLineup } from './tactics';
import { prepareFirstSeason } from './tutorial';
import { rnd } from './utils';
import { book, ensureLedger } from './ledger';

export { playRound, endSeason };
export { applyMatchResult, matchContext } from './season';
export { upkeepOf, capacity } from './economy';

export function createInitialState(clubName) {
  const s = {
    version: 4,
    clubName,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    money: START_MONEY,
    reputation: 5,
    divisionIndex: 0,
    seasonNumber: 1,
    round: 0,
    buildings: { terrain: 1, training: 0, academy: 0, fans: 0, sponsor: 0, transfers: 0 },
    slots: Array(8).fill(null),
    players: [],
    rivals: [],
    schedule: [],
    table: [],
    market: [],
    transfers: [],
    journal: [],
    history: [],
    lastMatch: null,
    seasonReview: null,
    offline: null,
    goals: null,
    nextId: 1,
  };
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A']) {
    const p = makePlayer({ level: rnd(0.5, 1), pos });
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
    const p = makePlayer({ level: rnd(0.2, 0.6), pos });
    p.id = s.nextId++;
    p.joined = s.seasonNumber || 1;
    assignNumber(s.players, p);
    s.players.push(p);
  }
  return s;
}

export function build(s, sectorId, key) {
  // jamais sur une parcelle réservée (le stade occupe t0)
  const plot = PLOTS.find((p) => p.sector === sectorId && !p.building && s.slots[plotIndexOf(p.id)] === null);
  if (!plot || s.buildings[key] > 0 || s.money < upgradeCost(key, 1)) return null;
  s.slots[plotIndexOf(plot.id)] = key;
  s.buildings[key] = 1;
  s.money -= upgradeCost(key, 1);
  book(s, 'works', upgradeCost(key, 1));
  if (key === 'transfers') refreshTransfers(s, 'full'); // les recruteurs livrent leur première liste
  pushJournal(s, {
    season: s.seasonNumber, kind: 'infra', title: `${BUILDINGS[key].name} : premier coup de pioche`,
    text: `Le club investit ${upgradeCost(key, 1).toLocaleString('fr-FR')} € dans un nouveau bâtiment.`,
  });
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
  pushJournal(s, {
    season: s.seasonNumber, kind: 'infra', title: `${BUILDINGS[key].name} : cap sur le niveau ${lvl + 1}`,
    text: `Travaux d’amélioration engagés pour ${cost.toLocaleString('fr-FR')} €.`,
  });
  return s;
}

// Vente d'un joueur : il rejoint un autre club, sa valeur de revente entre en caisse.
export function sellPlayer(s, id) {
  if (s.players.length <= SQUAD_MIN) return null;
  const idx = s.players.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [p] = s.players.splice(idx, 1);
  const fee = saleValue(p, s.divisionIndex);
  s.money += fee;
  book(s, 'sales', fee);
  ensureLineup(s);
  pushJournal(s, {
    season: s.seasonNumber, kind: 'mercato', title: `${p.name} quitte le club`,
    text: `Le joueur rejoint ${randomClubName()} pour ${fee.toLocaleString('fr-FR')} €.`,
  });
  return s;
}
export const releasePlayer = sellPlayer;

export function signPlayer(s, id) {
  if (s.players.length >= SQUAD_MAX) return null;
  // joueur libre (marché de l'effectif) ou joueur sous contrat (bureau des transferts)
  const pool = s.market.some((p) => p.id === id) ? s.market : s.transfers || [];
  const idx = pool.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const p = pool[idx];
  const fee = costOf(p, s);
  if (s.money < fee) return null;
  pool.splice(idx, 1);
  const from = p.club;
  delete p.club; delete p.contract; delete p.listedAt;
  s.money -= fee;
  book(s, 'signings', fee);
  p.joined = s.seasonNumber;
  assignNumber(s.players, p);
  s.players.push(p);
  s.signings = (s.signings || 0) + 1;
  pushJournal(s, {
    season: s.seasonNumber, kind: 'mercato', title: `${p.name} rejoint ${s.clubName}`,
    text: from
      ? `Transfert conclu : il arrive ${clubAfter('de ', from)} pour ${fee.toLocaleString('fr-FR')} €, à ${p.age} ans.`
      : `À ${p.age} ans, il s’engage avec le club pour ${fee.toLocaleString('fr-FR')} €.`,
  });
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
