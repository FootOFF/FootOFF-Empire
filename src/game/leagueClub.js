import { createInitialState } from './engine';
import { applyMatchResult, archivePlayer, startSeason } from './season';
import { logMove } from './mercato';
import { repairSave, validSave } from './save';
import { autoLineup, ensureLineup } from './tactics';
import { assignNumber, freshSeason, refWage } from './players';
import { distinctFace } from './faces';
import { book, markTreasury } from './ledger';
import { pushJournal } from './journal';
import { leagueClubs, leagueSquads, replayOf, startWorld } from './league';
import { expandPlayer, marketPlayers, priceOf, snapPlayer, unsnapPlayer } from './leagueWorld';
import { officialTable, perspectiveResult, refreshRivals } from './leagueSeason';
import { clone } from './utils';
import { ensureDeals, setDeal } from './contracts';

// Partie de championnat entre amis : une partie solo à part entière (même moteur, mêmes écrans : complexe, bâtiments,
// entraînement, académie, finances), gardée sur l'appareil de chaque ami, à côté de sa carrière. La ligue lui donne ses
// adversaires, son calendrier et ses matchs (leagueSeason.js) : le joueur valide son équipe (« Jouer » envoie l'équipe
// et l'effectif au serveur, teamSheet), le premier jeu qui ouvre la ligue après l'heure calcule la journée (league.js),
// puis chacun regarde son match (rejeu) et l'applique à sa partie (applyLeagueRound), comme un match de carrière.

const KEY = (code) => `fo-ligue-club-${code}`;

// Où en est la partie de ligue de l'appareil (écran titre) : saison et journée, sans la réparer ni la charger en jeu.
export function leagueClubProgress(code) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(code)) || 'null');
    return raw?.league ? { season: raw.seasonNumber, round: raw.round || 0, rounds: raw.schedule?.length || 0 } : null;
  } catch {
    return null;
  }
}

export function loadLeagueClub(code) {
  try {
    return readLeagueClub(JSON.parse(localStorage.getItem(KEY(code)) || 'null'), code);
  } catch {
    return null;
  }
}
// Une partie de ligue lue ailleurs (appareil, copie du serveur : leagueCloud.js) : valable et de ce championnat, réparée.
export function readLeagueClub(raw, code) {
  try {
    return raw && validSave(raw) && raw.league?.code === code ? repairSave(raw) : null;
  } catch {
    return null;
  }
}
export function saveLeagueClub(s) {
  try {
    s.version = 4;
    localStorage.setItem(KEY(s.league.code), JSON.stringify({ ...s, lastSeen: Date.now() }));
  } catch { /* stockage plein ou indisponible : la partie reste jouable jusqu'à la fermeture */ }
}
export const dropLeagueClub = (code) => { try { localStorage.removeItem(KEY(code)); } catch { /* rien à effacer */ } };

// Ce que la partie garde de la ligue (s.league), relu du serveur à chaque visite : les clubs (le niveau de chacun d'après
// la dernière journée), le nom, le niveau, l'échéance de la journée, et l'état en cours (journée ouverte côté serveur).
function leagueInfoOf(d, slot) {
  const clubs = leagueClubs(d.league, d.members);
  const last = d.results[d.results.length - 1];
  return {
    code: d.league.code, seed: d.league.seed, format: d.league.settings.format, name: d.league.name, slot,
    level: d.league.level || 0, deadline: d.league.deadline, server: { season: d.league.season, round: d.league.round, status: d.league.status },
    clubs: clubs.filter((c) => !c.open).map((c) => ({
      slot: c.slot, name: c.name, crest: c.crest || null, human: !!c.human, pseudo: c.pseudo || null, strength: last?.str?.[c.slot] ?? 6.8,
    })),
  };
}

// Nouvelle partie de ligue : une partie solo neuve (8 000 €, le terrain de quartier, aucun bâtiment), avec l'effectif de
// quartier de sa place, le même gabarit pour tous (leagueSquads), et la saison de la ligue. d : l'état du serveur
// (refreshLeague) ; m : son inscription (leagueNet.js).
export function createLeagueClub(d, m) {
  const me = d.members.find((x) => x.id === m.id);
  const slot = me.slot;
  const s = createInitialState(m.club.name, m.club.crest);
  s.players = [];
  for (const base of leagueSquads(d.league)[slot]) {
    const p = { ...clone(base), lid: slot * 100 + base.id, joined: 1, season: freshSeason(), hist: [], form: [] };
    s.players.push(p);
  }
  s.nextId = s.players.length + 1;
  ensureDeals(s); // contrats de départ (contracts.js)
  s.market = [];
  s.transfers = [];
  s.tutorial = { step: 'done' };
  s.league = { ...leagueInfoOf(d, slot), season: d.league.season, round: 0, results: [], sent: null, orders: {} };
  s.formation = '433';
  s.tactic = 'balanced';
  s.lineup = autoLineup(s.players, '433');
  // la saison de la ligue à la place de celle de la carrière (adversaires, calendrier, classement)
  s.seasonNumber = d.league.season;
  startSeason(s);
  return s;
}

// La partie relit la ligue (clubs, nom, niveau, échéance, journée du serveur) : à chaque visite.
export function syncLeagueClub(s, d) {
  const keep = { season: s.league.season, round: s.league.round, results: s.league.results, sent: s.league.sent, orders: s.league.orders || {} };
  s.league = { ...leagueInfoOf(d, s.league.slot), ...keep };
  refreshRivals(s);
  leagueMercato(s, d);
  return s;
}

// Identifiant de ligue d'un joueur de la partie (créé à l'académie, amateur de secours : place × 100 000 + son numéro de
// partie, unique dans la ligue).
export function ensureLids(s) {
  for (const p of s.players) if (p.lid == null) p.lid = s.league.slot * 100000 + p.id;
  return s;
}

// L'équipe et l'effectif envoyés pour la journée (POST sheet) : dispositif, onze, tactique, tout l'effectif tel qu'il est
// (qualités, condition, indisponibles), le centre médical, le budget, et les ordres de la semaine (marché commun, offres
// entre amis, réponses).
export function teamSheet(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation } = {}) {
  ensureLids(s);
  const o = s.league.orders || {};
  return {
    formation, lineup: [...lineup], tactic, squad: s.players.map(snapPlayer), med: s.buildings.medical || 0, money: Math.round(s.money),
    bids: o.bids || [], offers: o.offers || [], accept: o.accept || [], refuse: o.refuse || [],
  };
}

// --- Une journée appliquée à la partie -------------------------------------------------------------------------------
// Les clubs de la ligue par place (écussons, noms), pour rejouer un match.
const bySlot = (L) => Array.from({ length: 8 }, (_, slot) => L.clubs.find((c) => c.slot === slot) || { slot, name: '?', crest: null });
const leagueOf = (L) => ({ code: L.code, seed: L.seed, name: L.name, settings: { format: L.format } });

// Notre match de la journée `result`, rejoué depuis la journée officielle : { live, state, ctx, side } (null si le moteur
// ne retrouve pas le score officiel : le résumé seul).
export function myReplay(s, result) {
  const L = s.league;
  const x = result.matches.find((m) => m.h === L.slot || m.a === L.slot);
  if (!x) return null;
  const rp = replayOf(leagueOf(L), bySlot(L), result.round, x, L.season);
  return rp ? { ...rp, side: x.h === L.slot ? 'home' : 'away' } : null;
}

// Le match vu de notre côté sans rejeu (autre version du moteur) : le score et nos buteurs, rien d'autre.
function summaryResult(s, x, side) {
  const mine = side === 'home' ? 0 : 1;
  const opp = s.league.clubs.find((c) => c.slot === (side === 'home' ? x.a : x.h));
  return {
    players: [], gf: mine ? x.ag : x.hg, ga: mine ? x.hg : x.ag, injuries: [], subs: [], lineup: [], highlights: [], shots: [],
    scorers: (x.g || []).filter((g) => g.s === mine).map((g) => ({ name: g.p, id: s.players.find((p) => p.name === g.p)?.id ?? null, minute: Number.parseInt(g.m, 10) || 0, assist: null, pen: !!g.pen })),
    formation: s.formation, tactic: s.tactic, oppName: opp?.name || '?', oppStrength: opp?.strength || 6.8, myRating: null, stats: null, comp: 'league',
  };
}

// La journée officielle appliquée à la partie : notre match, vu de notre côté, comme un match de carrière
// (applyMatchResult : notes, forme, condition, cartons, blessures, recettes, salaires, journal ; classement officiel),
// puis ce que la semaine nous apporte (recrue du marché commun, transfert conclu avec un ami). live : le match déjà
// rejoué (écran du direct), sinon rejoué ici.
export function applyLeagueRound(s, result, live = null) {
  const L = s.league;
  L.results = [...(L.results || []).filter((r) => r.round !== result.round), result].sort((a, b) => a.round - b.round);
  const x = result.matches.find((m) => m.h === L.slot || m.a === L.slot);
  if (x) {
    const side = x.h === L.slot ? 'home' : 'away';
    const lv = live || myReplay(s, result)?.live;
    applyMatchResult(s, lv ? perspectiveResult(lv, side, s.players) : summaryResult(s, x, side));
    if (side === 'away') { // chez un ami : l'affichage met l'équipe qui reçoit à gauche (0.8.1), l'économie ne change pas
      if (s.lastMatch) s.lastMatch.away = true;
      const rec = s.matches?.[s.matches.length - 1];
      if (rec) rec.away = true;
    }
  } else {
    s.round += 1;
    s.table = officialTable(s);
  }
  applyMoves(s, result.moves || []);
  L.round = s.round;
  L.sent = null; // l'équipe de la journée suivante reste à envoyer
  L.orders = {};
  refreshRivals(s);
  ensureLineup(s);
  return s;
}

// Recrue du marché commun, transfert conclu avec un ami (dans un sens ou dans l'autre).
function applyMoves(s, moves) {
  const L = s.league;
  const name = (slot) => L.clubs.find((c) => c.slot === slot)?.name || 'un club';
  const arrive = (p, fee, from) => {
    p.id = s.nextId++;
    p.joined = s.seasonNumber;
    p.season = freshSeason();
    p.hist ||= [];
    p.form = [];
    p.sellFrom = 0;
    delete p.injury;
    p.ban = 0;
    delete p.ctalks;
    setDeal(s, p, { wage: refWage(p, s.divisionIndex), years: 3 }); // entre amis, la meilleure offre l'emporte : il signe trois saisons au salaire de son niveau
    if (s.players.some((q) => q.num === p.num) || p.num == null) assignNumber(s.players, p);
    distinctFace(s.players, p);
    s.players.push(p);
    s.money -= fee;
    book(s, 'signings', fee);
    logMove(s, 'in', p, fee, from);
  };
  for (const mv of moves) {
    if (mv.k === 'buy' && mv.s === L.slot && mv.pl) {
      const p = expandPlayer([], mv.pl);
      if (!p) continue;
      p.lid = mv.i;
      arrive(p, mv.x, 'Marché commun');
      pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} signe au club`, text: `Remporté sur le marché commun de la ligue pour ${mv.x.toLocaleString('fr-FR')} €.` });
    } else if (mv.k === 'deal' && mv.b === L.slot && mv.pl) {
      const p = unsnapPlayer(mv.pl);
      arrive(p, mv.x, name(mv.s));
      pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} signe au club`, text: `Transfert conclu avec ${name(mv.s)} pour ${mv.x.toLocaleString('fr-FR')} €.` });
    } else if (mv.k === 'deal' && mv.s === L.slot) {
      const p = s.players.find((q) => q.lid === mv.l);
      if (!p) continue;
      archivePlayer(s, p, { reason: 'vente', fee: mv.x, club: name(mv.b) });
      s.players = s.players.filter((q) => q !== p);
      s.money += mv.x;
      book(s, 'sales', mv.x);
      logMove(s, 'out', p, mv.x, name(mv.b));
      pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} quitte le club`, text: `Transfert conclu avec ${name(mv.b)} pour ${mv.x.toLocaleString('fr-FR')} €.` });
    }
  }
  markTreasury(s);
}

// --- Mercato d'une partie de ligue (l'écran Mercato du solo) ---------------------------------------------------------
// Le marché commun dans state.market (joueurs libres, au prix affiché : leaguePrice), les joueurs des amis dans
// state.transfers (leur club, un prix indicatif : leur valeur), d'après la dernière journée connue : l'effectif complet
// d'un ami se lit dans son dernier match à domicile, son onze dans un match à l'extérieur. Une offre est un ordre de la
// semaine (s.league.orders : bids au marché, offers aux amis ; accept, refuse pour les offres reçues), envoyé avec
// l'équipe validée. Identifiants : ceux du marché (1000 et plus), 2 000 000 + identifiant de ligue pour un joueur d'ami.
export const FRIEND_ID = 2000000;
export function leagueMercato(s, d) {
  const L = s.league;
  const world = d.world || startWorld(d.league); // avant la première journée : le marché de départ
  s.market = marketPlayers(world || null).map((p) => ({ ...p, lid: p.id, leaguePrice: p.price, leagueKind: 'market', club: null, priceMod: 1 }));
  const seen = new Map(); // ami → ses joueurs connus (le plus récent d'abord)
  for (const r of [...(d.results || [])].reverse()) {
    for (const x of r.matches || []) {
      for (const [k, slot] of [[0, x.h], [1, x.a]]) {
        const c = L.clubs.find((q) => q.slot === slot);
        if (!c?.human || slot === L.slot || !x.sq?.[k]) continue;
        const known = seen.get(slot) || new Map();
        for (const snap of x.sq[k]) if (!known.has(snap.l)) known.set(snap.l, snap);
        seen.set(slot, known);
      }
    }
  }
  s.transfers = [];
  for (const [slot, known] of seen) {
    const club = L.clubs.find((q) => q.slot === slot);
    for (const snap of known.values()) {
      const p = unsnapPlayer(snap);
      s.transfers.push({ ...p, id: FRIEND_ID + p.lid, leaguePrice: priceOf(p), leagueKind: 'friend', leagueSlot: slot, club: club.name, priceMod: 1, contract: 2 });
    }
  }
  L.offersIn = (world?.offers || []).filter((o) => o.s === L.slot);
  L.offersOut = (world?.offers || []).filter((o) => o.b === L.slot);
  return s;
}

// Offre de la semaine pour un joueur du marché commun ou d'un ami (amount null : l'offre est retirée).
export function setLeagueOffer(s, p, amount) {
  const o = { ...(s.league.orders || {}) };
  if (p.leagueKind === 'market') {
    o.bids = (o.bids || []).filter((b) => b.i !== p.lid);
    if (amount) o.bids = [...o.bids, { i: p.lid, x: amount }].slice(-3);
  } else {
    o.offers = (o.offers || []).filter((b) => b.l !== p.lid);
    if (amount) o.offers = [...o.offers, { l: p.lid, x: amount }].slice(-3);
  }
  s.league.orders = o;
  return s;
}
export const leagueOfferOf = (s, p) => (p.leagueKind === 'market'
  ? (s.league.orders?.bids || []).find((b) => b.i === p.lid)?.x
  : (s.league.orders?.offers || []).find((b) => b.l === p.lid)?.x) ?? null;

// Réponse à une offre reçue d'un ami (yes : accepter, false : refuser, null : sans réponse).
export function answerLeagueOffer(s, id, yes) {
  const o = { ...(s.league.orders || {}) };
  o.accept = (o.accept || []).filter((x) => x !== id);
  o.refuse = (o.refuse || []).filter((x) => x !== id);
  if (yes === true) o.accept.push(id);
  if (yes === false) o.refuse.push(id);
  s.league.orders = o;
  return s;
}
