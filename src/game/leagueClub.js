import { createInitialState, signLeagueRecruit } from './engine';
import { applyMatchResult, archivePlayer, startSeason } from './season';
import { logMove, poolOf } from './mercato';
import { SQUAD_MIN } from './constants';
import { repairSave, validSave } from './save';
import { FORMATIONS, TACTICS, autoLineup, ensureLineup } from './tactics';
import { assignNumber, available, freshSeason, refWage } from './players';
import { distinctFace } from './faces';
import { book, markTreasury } from './ledger';
import { pushJournal } from './journal';
import { HT_CASES, leagueClubs, leagueSquads, replayOf, squadsOf, startWorld } from './league';
import { SUBS_MAX } from './live';
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
    me: d.me?.id || null,
    clubs: clubs.filter((c) => !c.open).map((c) => ({
      slot: c.slot, name: c.name, crest: c.crest || null, human: !!c.human, pseudo: c.pseudo || null, member: c.member || null, strength: last?.str?.[c.slot] ?? 6.8,
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
  s.league = { ...leagueInfoOf(d, slot), season: d.league.season, round: 0, results: [], sent: null, plans: {}, outbox: [], done: [] };
  s.formation = '433';
  s.tactic = 'balanced';
  s.lineup = autoLineup(s.players, '433');
  // la saison de la ligue à la place de celle de la carrière (adversaires, calendrier, classement)
  s.seasonNumber = d.league.season;
  startSeason(s);
  return s;
}

// La partie relit la ligue (clubs, nom, niveau, échéance, journée du serveur) : à chaque visite. Elle applique au passage
// les transferts conclus avec un ami (applyLeagueMoves), puis relit le mercato.
export function syncLeagueClub(s, d) {
  const L = s.league;
  const keep = { season: L.season, round: L.round, results: L.results, sent: L.sent, plans: L.plans || {}, outbox: L.outbox || [], done: L.done || [] };
  s.league = { ...leagueInfoOf(d, L.slot), ...keep };
  refreshRivals(s);
  applyLeagueMoves(s, d);
  leagueMercato(s, d);
  return s;
}

// Identifiant de ligue d'un joueur de la partie (créé à l'académie, amateur de secours : place × 100 000 + son numéro de
// partie, unique dans la ligue).
export function ensureLids(s) {
  for (const p of s.players) if (p.lid == null) p.lid = s.league.slot * 100000 + p.id;
  return s;
}

// L'équipe et l'effectif envoyés pour la journée (POST sheet) : dispositif, onze, tactique, plans de mi-temps, tout
// l'effectif tel qu'il est (qualités, condition, indisponibles), le centre médical et le budget.
export function teamSheet(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation, plans = s.league.plans } = {}) {
  ensureLids(s);
  const ht = packPlans(s.players, lineup, formation, tactic, plans);
  return {
    formation, lineup: [...lineup], tactic, ...(ht ? { ht } : {}), squad: s.players.map(snapPlayer), med: s.buildings.medical || 0, money: Math.round(s.money),
  };
}

// --- Plans de mi-temps (0.8.3) ---------------------------------------------------------------------------------------
// Gardés dans la partie (s.league.plans : { lead, draw, trail }, chacun { f, t, s: [[sortant, entrant]…], l }), réglés
// à l'avant-match et envoyés avec l'équipe (league.js les applique à la pause). Un plan se relit toujours sur le onze du
// moment : ses changements encore possibles (sortant titulaire, entrant disponible sur le banc, cinq au plus), puis sa
// composition si elle part bien de ces joueurs, sinon les mêmes joueurs placés au mieux dans son dispositif.
const sameSet = (a, b) => { const key = (x) => x.map((id) => (id === null ? '-' : id)).sort().join(); return key(a) === key(b); };
export function arrangeFor(players, lineup, formation) {
  const eleven = lineup.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const next = autoLineup(eleven, formation);
  return sameSet(next, lineup) ? next : [...lineup];
}
export function planView(players, lineup, formation, tactic, plan = null) {
  const f = FORMATIONS[plan?.f] ? plan.f : formation;
  const t = TACTICS[plan?.t] ? plan.t : tactic;
  const next = [...lineup];
  const s = [];
  for (const [o, i] of Array.isArray(plan?.s) ? plan.s : []) {
    const p = players.find((q) => q.id === i);
    const k = next.indexOf(o);
    if (s.length >= SUBS_MAX || k < 0 || !p || !available(p) || next.includes(i) || s.some(([a]) => a === i)) continue;
    next[k] = i;
    s.push([o, i]);
  }
  const l = Array.isArray(plan?.l) && plan.l.length === next.length && sameSet(plan.l, next) ? [...plan.l] : f === formation ? next : arrangeFor(players, next, f);
  return { f, t, s, l };
}
// Ce qui part avec l'équipe : seulement ce qui change à la pause (null : aucun plan).
export function packPlans(players, lineup, formation, tactic, plans) {
  const out = {};
  for (const k of HT_CASES) {
    const v = planView(players, lineup, formation, tactic, plans?.[k]);
    const x = {};
    if (v.f !== formation) x.f = v.f;
    if (v.t !== tactic) x.t = v.t;
    if (v.s.length) x.s = v.s;
    const plain = [...lineup];
    for (const [o, i] of v.s) plain[plain.indexOf(o)] = i;
    if (x.f || v.l.some((id, n) => id !== plain[n])) x.l = v.l;
    if (Object.keys(x).length) out[k] = x;
  }
  return Object.keys(out).length ? out : null;
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
  refreshRivals(s);
  ensureLineup(s);
  return s;
}

// Un joueur qui arrive d'un autre club de la ligue (transfert conclu avec un ami ; recrue des journées d'avant la 0.8.3) :
// il signe trois saisons au salaire de son niveau.
function arrive(s, p, fee, from) {
  p.id = s.nextId++;
  p.joined = s.seasonNumber;
  p.season = freshSeason();
  p.hist ||= [];
  p.form = [];
  p.sellFrom = 0;
  delete p.injury;
  p.ban = 0;
  delete p.ctalks;
  setDeal(s, p, { wage: refWage(p, s.divisionIndex), years: 3 });
  if (s.players.some((q) => q.num === p.num) || p.num == null) assignNumber(s.players, p);
  distinctFace(s.players, p);
  s.players.push(p);
  s.money -= fee;
  book(s, 'signings', fee);
  logMove(s, 'in', p, fee, from);
}
// Un joueur vendu à un ami : il quitte la partie, l'indemnité arrive.
function depart(s, p, fee, to) {
  archivePlayer(s, p, { reason: 'vente', fee, club: to });
  s.players = s.players.filter((q) => q !== p);
  s.money += fee;
  book(s, 'sales', fee);
  logMove(s, 'out', p, fee, to);
  pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} quitte le club`, text: `Transfert conclu avec ${to} pour ${fee.toLocaleString('fr-FR')} €.` });
  ensureLineup(s);
}

// Mouvements gardés avec une journée (avant la 0.8.3 : recrue du marché commun, transfert conclu avec un ami).
function applyMoves(s, moves) {
  const L = s.league;
  const name = (slot) => L.clubs.find((c) => c.slot === slot)?.name || 'un club';
  for (const mv of moves) {
    if (mv.k === 'buy' && mv.s === L.slot && mv.pl) {
      const p = expandPlayer([], mv.pl);
      if (!p) continue;
      p.lid = mv.i;
      arrive(s, p, mv.x, 'Marché commun');
      pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} signe au club`, text: `Remporté sur le marché commun de la ligue pour ${mv.x.toLocaleString('fr-FR')} €.` });
    } else if (mv.k === 'deal' && mv.b === L.slot && mv.pl) {
      const p = unsnapPlayer(mv.pl);
      arrive(s, p, mv.x, name(mv.s));
      pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} signe au club`, text: `Transfert conclu avec ${name(mv.s)} pour ${mv.x.toLocaleString('fr-FR')} €.` });
    } else if (mv.k === 'deal' && mv.s === L.slot) {
      const p = s.players.find((q) => q.lid === mv.l);
      if (p) depart(s, p, mv.x, name(mv.b));
    }
  }
  markTreasury(s);
}

// --- Mercato d'une partie de ligue (l'écran Mercato du solo, 0.8.3) ---------------------------------------------------
// Entre deux journées, comme en solo : les joueurs libres du marché commun (state.market) et ceux des clubs de
// l'ordinateur (state.transfers, avec leur club) se négocient (l'indemnité avec le club, puis le contrat du joueur) ;
// l'accord conclu, le serveur des ligues confirme la signature au premier club qui l'obtient (file des demandes,
// s.league.outbox, envoyée par App.jsx). Les joueurs des amis (state.transfers aussi) : une offre, à laquelle l'ami
// répond ; acceptée, le transfert est conclu aussitôt. D'après le dernier état connu de la ligue et les mouvements de la
// journée en cours (serveur) : un joueur déjà signé n'y est plus. Un joueur d'ami se lit dans les journées jouées
// (l'effectif complet d'un ami dans son dernier match à domicile, son onze dans un match à l'extérieur). Identifiants :
// AI_ID, FRIEND_ID ou MARKET_ID + son identifiant de ligue (aucun ne croise ceux de la partie).
export const AI_ID = 1000000;
export const FRIEND_ID = 2000000;
export const MARKET_ID = 3000000;
const AI_STARTER = 1.25; // un titulaire d'un club de l'ordinateur coûte un quart de plus
const priceStep = (v) => Math.max(500, Math.round(v / 250) * 250);
const roundMoves = (d) => (d.moves || []).filter((x) => x.season === d.league.season && x.round === d.league.round);
const slotOfMember = (L, id) => L.clubs.find((c) => c.member === id)?.slot ?? null;

export function leagueMercato(s, d) {
  const L = s.league;
  const world = d.world || startWorld(d.league); // avant la première journée : le marché de départ
  const moves = roundMoves(d);
  const signed = new Set(moves.filter((x) => x.status === 'done').map((x) => `${x.kind}:${x.pid}`));
  // négociations en cours (indemnité convenue, tentatives du jour) : gardées d'une relecture à l'autre
  const prev = new Map(poolOf(s).map((p) => [p.id, p]));
  const keep = (p) => {
    const o = prev.get(p.id);
    return o ? { ...p, ...(o.talks ? { talks: o.talks } : {}), ...(o.ctalks ? { ctalks: o.ctalks } : {}) } : p;
  };
  s.market = marketPlayers(world).filter((p) => !signed.has(`m:${p.id}`))
    .map((p) => keep({ ...p, id: MARKET_ID + p.id, lid: p.id, leaguePrice: p.price, leagueKind: 'market', club: null, priceMod: 1 }));
  s.transfers = [];
  // clubs de l'ordinateur : tout l'effectif, sauf sous le minimum (un titulaire coûte plus cher)
  const squads = squadsOf(d.league, world);
  for (const c of L.clubs) {
    if (c.human || c.slot === L.slot || !world.clubs?.[c.slot]) continue;
    const players = squads[c.slot];
    if (players.length <= SQUAD_MIN + 2) continue;
    const eleven = new Set(autoLineup(players, '433'));
    for (const p of players) {
      if (signed.has(`a:${p.id}`)) continue;
      const price = priceStep(priceOf(p) * (eleven.has(p.id) ? AI_STARTER : 1));
      s.transfers.push(keep({ ...p, id: AI_ID + p.id, lid: p.id, leaguePrice: price, leagueKind: 'ai', leagueSlot: c.slot, club: c.name, contract: 2, priceMod: 1 }));
    }
  }
  // joueurs des amis
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
  for (const [slot, known] of seen) {
    const club = L.clubs.find((q) => q.slot === slot);
    for (const snap of known.values()) {
      if (signed.has(`f:${snap.l}`) || s.players.some((q) => q.lid === snap.l)) continue;
      const p = unsnapPlayer(snap);
      s.transfers.push({ ...p, id: FRIEND_ID + p.lid, leaguePrice: priceOf(p), leagueKind: 'friend', leagueSlot: slot, leagueMember: club.member, club: club.name, priceMod: 1, contract: 2 });
    }
  }
  // offres entre amis de la journée : reçues (en attente de ta réponse), faites (en attente, refusées)
  const mine = moves.filter((x) => x.kind === 'f');
  L.offersIn = mine.filter((x) => x.seller === L.me && x.status === 'open').map((x) => ({ id: x.id, l: x.pid, n: x.data?.n || '?', x: x.fee, b: slotOfMember(L, x.buyer) }));
  L.offersOut = mine.filter((x) => x.buyer === L.me && x.status !== 'done').map((x) => ({ id: x.id, l: x.pid, n: x.data?.n || '?', x: x.fee, s: slotOfMember(L, x.seller), status: x.status }));
  return s;
}

// Mouvements conclus qui concernent la partie et qu'elle n'a pas encore appliqués (L.done : ceux qu'elle a appliqués) :
// un joueur acheté à un ami (il arrive, avec ce que l'ami a envoyé de lui), un joueur vendu à un ami (sur un autre
// appareil), une recrue signée dont la réponse du serveur s'est perdue (coupure au mauvais moment).
export function applyLeagueMoves(s, d) {
  const L = s.league;
  if (!L.me) return s;
  const done = new Set(L.done || []);
  const name = (id) => L.clubs.find((c) => c.member === id)?.name || 'un club';
  for (const x of d.moves || []) {
    if (x.status !== 'done' || done.has(x.id) || !x.data) continue;
    // un mouvement illisible (envoyé piégé par un autre appareil) est passé, jamais il ne bloque la relecture de la ligue
    try {
      if (x.buyer === L.me && x.kind === 'f' && x.data.pl?.l === x.pid && Number.isSafeInteger(x.fee)) {
        const p = unsnapPlayer(x.data.pl);
        arrive(s, p, x.fee, name(x.seller));
        pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'mercato', title: `${p.name} signe au club`, text: `Transfert conclu avec ${name(x.seller)} pour ${x.fee.toLocaleString('fr-FR')} €.` });
      } else if (x.buyer === L.me && x.kind !== 'f' && x.data.pl && x.data.t) {
        if (!s.players.some((q) => q.lid === x.pid)) {
          const item = (L.outbox || []).find((o) => o.k === 'sign' && o.pid === x.pid) || { id: x.data.pl.i, kind: x.kind, pid: x.pid, fee: x.fee, terms: x.data.t, pl: x.data.pl, club: x.data.c || null };
          signLeagueRecruit(s, item);
        }
        L.outbox = (L.outbox || []).filter((o) => !(o.k === 'sign' && o.pid === x.pid));
      } else if (x.seller === L.me && x.kind === 'f') {
        const p = s.players.find((q) => q.lid === x.pid);
        if (p) depart(s, p, x.fee, name(x.buyer));
      }
    } catch { /* mouvement illisible : sans effet */ }
    done.add(x.id);
  }
  L.done = [...done].slice(-200);
  markTreasury(s);
  return s;
}

// --- File des demandes au serveur des ligues ---------------------------------------------------------------------------
// Gardée dans la partie (s.league.outbox), envoyée une à une dans l'ordre (App.jsx) : une demande coupée par le réseau
// repart à la visite suivante. sign : une recrue négociée (engine.js, sealContract) ; offer, withdraw : une offre pour le
// joueur d'un ami, la retirer ; answer : la réponse à une offre reçue.
const sameItem = (a, b) => a.k === b.k && (a.k === 'offer' ? a.lid === b.lid : a.k === 'sign' ? a.pid === b.pid : a.id === b.id);
export function queueLeague(s, item) {
  const L = s.league;
  L.outbox = [...(L.outbox || []).filter((x) => !sameItem(x, item)), { ...item, at: Date.now() }];
  return s;
}
export const queuedFor = (s, test) => (s.league?.outbox || []).find(test) || null;

// Offre pour le joueur d'un ami (fee null : l'offre en attente est retirée).
export function offerFriend(s, p, fee) {
  const open = (s.league.offersOut || []).find((o) => o.l === p.lid && o.status === 'open');
  if (fee == null) return open ? queueLeague(s, { k: 'withdraw', id: open.id, lid: p.lid }) : s;
  return queueLeague(s, { k: 'offer', lid: p.lid, fee, to: p.leagueMember, n: p.name, slot: p.leagueSlot });
}
// Réponse à une offre reçue : acceptée, le joueur part aussitôt (il doit encore être là, et l'effectif garder son minimum).
export const answerFriend = (s, o, yes) => queueLeague(s, { k: 'answer', id: o.id, lid: o.l, yes, fee: o.x, b: o.b });
export const canSell = (s, lid) => s.players.some((q) => q.lid === lid) && s.players.length > SQUAD_MIN + 2;

// La demande telle qu'elle part au serveur (leagueNet.js, moveRequest).
export function leagueRequest(s, item) {
  const L = s.league;
  const at = { season: L.server?.season, round: L.server?.round };
  if (item.k === 'sign') return { action: 'sign', body: { ...at, kind: item.kind, pid: item.pid, fee: item.fee, ...(item.kind === 'a' ? { slot: item.slot } : {}), data: { pl: item.pl, t: item.terms, ...(item.club ? { c: item.club } : {}) } } };
  if (item.k === 'offer') return { action: 'offer', body: { ...at, pid: item.lid, fee: item.fee, to: item.to, data: { n: item.n } } };
  if (item.k === 'withdraw') return { action: 'withdraw', body: { id: item.id } };
  const p = s.players.find((q) => q.lid === item.lid);
  const yes = !!item.yes && canSell(s, item.lid);
  return { action: 'answer', body: { ...at, id: item.id, yes, data: yes ? { pl: snapPlayer(p) } : {} } };
}

// La réponse du serveur appliquée à la partie (res : sa réponse, ou { error, taken } quand il a refusé). La demande sort
// de la file ; s.lastLeague garde la dernière réponse (écrans du mercato).
export function settleLeague(s, item, res) {
  const L = s.league;
  L.outbox = (L.outbox || []).filter((x) => !(x.k === item.k && x.at === item.at));
  const at = Date.now();
  if (item.k === 'sign') {
    if (res?.id) {
      if (!(L.done || []).includes(res.id)) {
        signLeagueRecruit(s, item);
        L.done = [...(L.done || []), res.id].slice(-200);
      }
      s.lastContract = { id: item.id, name: item.n, result: 'accepted', renew: false, terms: item.terms, fee: item.fee, at };
    } else {
      // un autre club l'a signé le premier (il quitte la liste), ou le mercato est fermé le temps de la journée
      if (res?.taken) {
        s.market = (s.market || []).filter((p) => p.id !== item.id);
        s.transfers = (s.transfers || []).filter((p) => p.id !== item.id);
      }
      s.lastContract = { id: item.id, name: item.n, result: res?.taken ? 'taken' : 'blocked', renew: false, terms: item.terms, fee: item.fee, note: res?.error || '', at };
    }
    return s;
  }
  if (item.k === 'offer') {
    if (res?.id) L.offersOut = [...(L.offersOut || []).filter((o) => o.l !== item.lid), { id: res.id, l: item.lid, n: item.n, x: item.fee, s: item.slot, status: 'open' }];
    s.lastLeague = { k: 'offer', lid: item.lid, ok: !!res?.id, note: res?.error || '', at };
    return s;
  }
  if (item.k === 'withdraw') {
    if (!res?.error) L.offersOut = (L.offersOut || []).filter((o) => o.id !== item.id); // refusé : l'offre reste en attente
    return s;
  }
  // answer
  L.offersIn = (L.offersIn || []).filter((x) => x.id !== item.id);
  if (res?.status === 'done' && !(L.done || []).includes(item.id)) {
    const p = s.players.find((q) => q.lid === item.lid);
    const buyer = L.clubs.find((c) => c.slot === item.b)?.name || 'un club';
    if (p) depart(s, p, item.fee, buyer);
    L.done = [...(L.done || []), item.id].slice(-200);
    markTreasury(s);
  }
  s.lastLeague = { k: 'answer', id: item.id, ok: !!res?.status, sold: res?.status === 'done', note: res?.error || '', at };
  return s;
}
