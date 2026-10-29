import { LEAGUE_OPEN } from './constants';
import { distinctFace, drawFace, hash } from './faces';
import { SUBS_MAX, createLiveMatch } from './live';
import { distinctClubName, squadName } from './names';
import { seeded } from './opponents';
import {
  START_BUDGET, aiBuild, appliedSheet, buildingsOf, compactPlayer, expandPlayer, incomeOf, initialWorld, paceOfLeague, priceOf, refill, runMarket, summer,
  toSnap, trainClub, unsnapPlayer, worldSquads,
} from './leagueWorld';
import { assignNumber, available, makePlayer } from './players';
import { FORMATIONS, TACTICS, autoLineup, lineupRating, repairLineup } from './tactics';
import { clone } from './utils';
import { LANGS, numLocale, t } from '../i18n/index';

// Championnats entre amis (Siège de la Ligue). Le serveur des ligues (site footoff.media, /api/ligue ; leagueNet.js)
// garde chaque ligue, ses membres, les équipes validées et les résultats officiels. Le jeu calcule le reste à
// l'identique chez chaque ami, à partir de la graine de la ligue : les clubs de l'ordinateur, le calendrier, le
// classement tiré des résultats.

// Version du moteur des matchs entre amis : le serveur (ENGINE_CURRENT de src/lib/ligue/core.ts du site) refuse un
// numéro plus haut que le sien. À relever là-bas, et publier le site, AVANT de publier un jeu au moteur relevé.
// 2 (0.8.3) : plans de mi-temps, mercato immédiat (mouvements du serveur rejoués) ; un match sans plan ni mouvement se
// joue comme en version 1. 3 (0.8.4) : équilibre « Prudente » des tactiques (tactics.js) et ordinateur accordé.
export const LEAGUE_ENGINE = 4;
export const LEAGUE_CLUBS = 8; // amis complétés par l'ordinateur
export const LEAGUE_MIN_HUMANS = 2;
export const MAX_MY_LEAGUES = 3; // championnats à la fois sur un appareil
export const leagueRounds = (league) => (LEAGUE_CLUBS - 1) * (league.settings?.format === 'single' ? 1 : 2);
// Championnats ouverts au public (LEAGUE_OPEN), ou en développement (npm run dev) pour les essayer contre le serveur
// des ligues lancé en local. Le bâtiment, lui, ne se construit qu'une fois LEAGUE_OPEN (map.js).
export const leagueOpen = () => LEAGUE_OPEN || !!import.meta.env?.DEV;

// Code d'invitation : six signes, sans I, O, 0 ni 1 (rien à confondre en le dictant), comme sur le serveur.
export const isLeagueCode = (c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c || '');
export const cleanCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01]/g, '').slice(0, 6);

// Couleurs du logo de la ligue, choisies par le créateur : le noir et or FootOFF, ou deux couleurs bien contrastées.
export const LEAGUE_COLORS = [
  ['noir-or', t('Noir et or'), []],
  ['marine', t('Marine et ciel'), ['#1d2c5e', '#9fd0f5']],
  ['rouge', t('Rouge et blanc'), ['#c0392b', '#ffffff']],
  ['bleu', t('Bleu et blanc'), ['#2463c9', '#ffffff']],
  ['vert', t('Vert et blanc'), ['#1f8a4c', '#ffffff']],
  ['grenat', t('Grenat et ciel'), ['#7b1e3a', '#9fd0f5']],
  ['violet', t('Violet et jaune'), ['#6c3fa0', '#f2c94c']],
  ['orange', t('Orange et noir'), ['#e67e22', '#151515']],
  ['blanc', t('Blanc et noir'), ['#f2f2f2', '#151515']],
];

// Les huit clubs de la ligue, place par place : les amis (club, écusson, pseudo), puis l'ordinateur aux places restées
// libres au coup d'envoi (avant, en salle d'attente : des places libres). Un ami parti a rendu son club à l'ordinateur
// (pseudo « Ordinateur », refusé à l'inscription : human faux) ; son club garde son nom et son écusson. Un ami absent
// depuis 7 jours (active faux) reste membre : l'ordinateur fait seulement jouer son club en attendant son retour.
export const AI_PSEUDO = 'Ordinateur'; // identifiant des places de l'ordinateur, le même pour tous (serveur) : jamais traduit
export const AI_LABEL = t('Ordinateur');
// Langue d'un championnat (0.8.14) : choisie par le créateur, la même pour tous les amis. Les clubs et les joueurs de
// l'ordinateur, tirés de la graine, y prennent leurs noms : chaque ami ouvre le championnat dans cette langue (App.jsx),
// pour que tous voient les mêmes. Un championnat d'avant les langues, ou d'un serveur qui ne la garde pas, est en français.
export const leagueLang = (league) => (LANGS.includes(league?.settings?.lang) ? league.settings.lang : 'fr');

export function leagueClubs(league, members) {
  const bySlot = new Map(members.map((m) => [m.slot, m]));
  const free = [...Array(LEAGUE_CLUBS).keys()].filter((k) => !bySlot.has(k));
  const taken = members.map((m) => m.club.name);
  const ai = league.status === 'lobby' ? [] : seeded(hash(`${league.code}|${league.seed}|clubs`), () => {
    const out = [];
    for (const _ of free) out.push(distinctClubName([...taken, ...out]));
    return out;
  });
  return [...Array(LEAGUE_CLUBS).keys()].map((slot) => {
    const m = bySlot.get(slot);
    if (m) {
      const human = m.pseudo !== AI_PSEUDO;
      return { slot, name: m.club.name, crest: m.club.crest, pseudo: human ? m.pseudo : null, member: m.id, human, validated: !!m.validated, active: human && m.active !== false };
    }
    const i = free.indexOf(slot);
    return ai[i] ? { slot, name: ai[i], crest: null, pseudo: null, member: null, human: false } : { slot, open: true };
  });
}

// Calendrier d'une saison : chaque club rencontre les sept autres, puis une seconde fois terrain inversé en
// aller-retour. Méthode du polygone sur un ordre des places tiré de la graine et de la saison : un club au centre, les
// sept autres en cercle ; chaque club reçoit trois ou quatre fois à l'aller. [[domicile, extérieur] × 4] par journée.
export function leagueFixtures(league, season = league.season) {
  const n = LEAGUE_CLUBS;
  const m = n - 1;
  const order = seeded(hash(`${league.code}|${league.seed}|${season}|calendrier`), () => {
    const a = [...Array(n).keys()];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });
  const first = [];
  for (let r = 0; r < m; r++) {
    const center = order[m];
    const pairs = [r % 2 ? [order[r], center] : [center, order[r]]];
    for (let k = 1; k < n / 2; k++) {
      const a = order[(r + k) % m];
      const b = order[(r - k + m) % m];
      pairs.push(k % 2 ? [a, b] : [b, a]);
    }
    first.push(pairs);
  }
  if (league.settings?.format === 'single') return first;
  return [...first, ...first.map((pairs) => pairs.map(([h, a]) => [a, h]))];
}

// Effectifs : quinze joueurs par club, sur un même gabarit (postes, âges, qualités et niveaux d'un club de quartier,
// comme un club fondé en carrière : des clubs neufs à égalité), avec des noms et des visages propres à chaque club. Tirés
// de la graine de la ligue : identiques chez chaque ami, rien à garder sur le serveur. Identifiants 1 à 15 dans chaque club.
const STARTERS = ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A'];
const RESERVES = ['G', 'D', 'M', 'A'];
const squadsMemo = new Map();
export function leagueSquads(league) {
  const key = `${league.code}|${league.seed}`;
  if (!squadsMemo.has(key)) {
    squadsMemo.set(key, seeded(hash(`${key}|effectifs`), () => {
      const template = [
        ...STARTERS.map((pos) => makePlayer({ level: 0.55, pos, name: t('Gabarit Commun') })),
        ...RESERVES.map((pos) => makePlayer({ level: 0.28, pos, name: t('Gabarit Commun') })),
      ];
      const taken = new Set();
      return [...Array(LEAGUE_CLUBS).keys()].map(() => {
        const lasts = new Set();
        const players = [];
        template.forEach((t, i) => {
          const p = { ...clone(t), id: i + 1, name: squadName(taken, lasts), joined: 1 };
          delete p.num;
          taken.add(p.name);
          p.face = drawFace(p, Math.floor(Math.random() * 4294967296));
          assignNumber(players, p);
          distinctFace(players, p);
          players.push(p);
        });
        return players;
      });
    }));
  }
  return squadsMemo.get(key);
}

// Équipe d'une journée : { formation, lineup (onze identifiants, dans l'ordre des postes du dispositif), tactic }.
// L'équipe automatique (club de l'ordinateur, ami absent ou sans équipe) : le meilleur onze en 4-3-3, tactique équilibrée.
export const autoSheet = (players) => ({ formation: '433', tactic: 'balanced', lineup: autoLineup(players, '433'), auto: true });
// Plans de mi-temps (0.8.3) : ce que fait le club à la pause selon le score, vu de son camp (il mène, égalité, il est
// mené) : { f: dispositif, t: tactique, s: [[sortant, entrant]…], l: le onze voulu dans l'ordre des postes }, chaque
// réglage facultatif, cinq changements au plus. Ils se jouent sans que personne soit connecté ; les blessés restent
// remplacés par le staff, à la minute.
export const HT_CASES = ['lead', 'draw', 'trail'];
export const htCase = (gap) => (gap > 0 ? 'lead' : gap < 0 ? 'trail' : 'draw');
export function cleanPlans(ht, ids) {
  if (!ht || typeof ht !== 'object') return null;
  const out = {};
  for (const k of HT_CASES) {
    const x = ht[k];
    if (!x || typeof x !== 'object') continue;
    const plan = {};
    if (FORMATIONS[x.f]) plan.f = x.f;
    if (TACTICS[x.t]) plan.t = x.t;
    const seen = new Set();
    const subs = (Array.isArray(x.s) ? x.s : []).filter((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((id) => ids.has(id))
      && pair[0] !== pair[1] && !seen.has(pair[0]) && !seen.has(pair[1]) && seen.add(pair[0]) && seen.add(pair[1])).slice(0, SUBS_MAX);
    if (subs.length) plan.s = subs.map(([a, b]) => [a, b]);
    const named = Array.isArray(x.l) ? x.l.filter((id) => id !== null) : [];
    if (Array.isArray(x.l) && x.l.length === 11 && new Set(named).size === named.length && named.every((id) => ids.has(id))) plan.l = [...x.l];
    if (Object.keys(plan).length) out[k] = plan;
  }
  return Object.keys(out).length ? out : null;
}

// Équipe relue du serveur (envoyée par un autre ami) : gardée seulement si tout y est valable, sinon l'équipe automatique.
// Un poste vide (null) est valable, comme en solo : effectif trop court, blessés et suspendus compris (tactics.js).
export function cleanSheet(sheet, players) {
  const ids = new Set(players.map((p) => p.id));
  const lineup = Array.isArray(sheet?.lineup) ? sheet.lineup : [];
  const named = lineup.filter((id) => id !== null);
  const ok = sheet && FORMATIONS[sheet.formation] && TACTICS[sheet.tactic] && lineup.length === 11
    && new Set(named).size === named.length && named.every((id) => ids.has(id));
  if (!ok) return autoSheet(players);
  const ht = cleanPlans(sheet.ht, ids);
  return { formation: sheet.formation, tactic: sheet.tactic, lineup: [...lineup], auto: !!sheet.auto, ...(ht ? { ht } : {}) };
}

// Les joueurs sur le terrain après les changements, placés pour la seconde période : la composition voulue du plan (l)
// si ce sont bien les mêmes joueurs (rien n'a dérangé le plan : blessure, expulsion, changement de trop) ; sinon, avec
// un nouveau dispositif, le meilleur placement. Un expulsé garde sa place (il ne compte plus, et le moteur refuse
// qu'il change de poste). null : les postes ne bougent pas.
const sameEleven = (a, b) => { const key = (x) => x.map((id) => (id === null ? '-' : id)).sort().join(); return key(a) === key(b); };
function arrangeEleven(plan, players, lineup, formation, sentIds) {
  const fixed = (next) => [...sentIds].every((id) => !lineup.includes(id) || next.indexOf(id) === lineup.indexOf(id));
  if (plan.l && sameEleven(plan.l, lineup) && fixed(plan.l)) return plan.l.some((id, k) => id !== lineup[k]) ? [...plan.l] : null;
  if (!plan.f || plan.f === formation) return null;
  const eleven = lineup.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const next = autoLineup(eleven, plan.f);
  for (const id of sentIds) {
    const k0 = lineup.indexOf(id);
    const k1 = next.indexOf(id);
    if (k0 >= 0 && k1 >= 0 && k0 !== k1) [next[k0], next[k1]] = [next[k1], next[k0]];
  }
  return sameEleven(next, lineup) ? next : null; // autoLineup écarte un blessé ou un suspendu : rien
}

// Changements d'un plan, au même poste : un sortant encore sur le terrain et pas expulsé, un entrant disponible qui
// n'a pas encore joué ; left : changements qui restent. Renvoie le onze et les paires retenues.
function planSubs(plan, lineup, players, { sent, gone, left }) {
  const next = [...lineup];
  const pairs = [];
  for (const [o, i] of plan.s || []) {
    if (pairs.length >= left) break;
    const k = next.indexOf(o);
    const p = players.find((q) => q.id === i);
    if (k < 0 || sent.has(o) || !p || next.includes(i) || gone.has(i) || !available(p)) continue;
    next[k] = i;
    gone.add(o);
    pairs.push([o, i]);
  }
  return { lineup: next, pairs };
}

// À la pause : le plan de chaque club pour le score du moment. Celui qui reçoit passe par le direct comme en solo
// (change : changements, puis dispositif et tactique) ; le visiteur par awayChange.
function halftimePlans(live, home, away) {
  const m = live.state;
  const gap = m.score.home - m.score.away;
  const hp = home.sheet.ht?.[htCase(gap)];
  if (hp) {
    const { lineup } = planSubs(hp, m.lineup, home.players, { sent: m.sent.home, gone: new Set([...m.gone, ...m.out]), left: SUBS_MAX - m.subsUsed });
    if (lineup.some((id, k) => id !== m.lineup[k])) live.change(45, { lineup, halftime: true });
    const shaped = arrangeEleven(hp, home.players, m.lineup, m.formation, m.sent.home);
    const f = hp.f && hp.f !== m.formation && (shaped || sameEleven(m.lineup, hp.l || [])) ? hp.f : null;
    live.change(45, { lineup: shaped, formation: f, tactic: hp.t || null, halftime: true });
  }
  const ap = away.sheet.ht?.[htCase(-gap)];
  if (ap) {
    const byId = (id) => away.players.find((p) => p.id === id);
    const sent = new Set(away.players.filter((p) => m.sent.away.has(p.name)).map((p) => p.id));
    const { lineup, pairs } = planSubs(ap, away.sheet.lineup, away.players, { sent, gone: new Set(), left: SUBS_MAX });
    const shaped = arrangeEleven(ap, away.players, lineup, away.sheet.formation, sent);
    const f = ap.f && ap.f !== away.sheet.formation && (shaped || sameEleven(lineup, ap.l || [])) ? ap.f : null;
    const formation = f || away.sheet.formation;
    const ids = shaped || lineup;
    if (pairs.length || f || shaped || (ap.t && ap.t !== away.sheet.tactic)) {
      live.awayChange({
        subs: pairs.map(([o, i]) => [byId(o), byId(i)]), eleven: ids.map(byId).filter(Boolean), formation: f, tactic: ap.t || null,
        strength: lineupRating(away.players, ids, formation),
      });
    }
  }
}

// Un match de la ligue, joué d'un bloc sous la graine de la rencontre : le même chez chaque ami (même version du moteur,
// LEAGUE_ENGINE). Le moteur suit le club qui reçoit joueur par joueur ; le visiteur y entre avec son vrai onze, son
// niveau, son dispositif et sa tactique. home, away : { slot, name, crest, players, sheet }.
export function leagueMatch(league, season, round, home, away) {
  return seeded(hash(`${league.code}|${league.seed}|${season}|${round}|${home.slot}-${away.slot}|match`), () => {
    const s = { clubName: home.name, crest: home.crest, players: home.players, lineup: [...home.sheet.lineup], formation: home.sheet.formation, tactic: home.sheet.tactic, buildings: { medical: home.medical || 0 } };
    const ctx = {
      comp: 'friends',
      home: true,
      holes: false, // pénalité d'infériorité numérique comme en version 1 : personne ne déplace d'expulsé dans un match joué sans lui
      opp: { name: away.name, crest: away.crest, strength: lineupRating(away.players, away.sheet.lineup, away.sheet.formation) },
      awayEleven: { formation: away.sheet.formation, players: away.sheet.lineup.map((id) => away.players.find((p) => p.id === id)).filter(Boolean) }, // poste vide : rien
      oppPlan: { tactic: away.sheet.tactic, formation: away.sheet.formation },
    };
    const live = createLiveMatch(s, ctx);
    live.playHalf(1);
    halftimePlans(live, home, away);
    live.playHalf(2);
    return { live, state: s, ctx };
  });
}

// État de départ de la ligue : les effectifs tirés de la graine, le même budget pour tous, le premier marché commun.
const startMemo = new Map();
export function startWorld(league) {
  const key = `${league.code}|${league.seed}`;
  if (!startMemo.has(key)) {
    const squads = leagueSquads(league);
    startMemo.set(key, seeded(hash(`${key}|depart`), () => ({ ...initialWorld(squads), ...refill([], squads.flat(), 1000, 100) })));
  }
  return startMemo.get(key);
}

// Effectifs d'un état de la ligue (leagueWorld.js) ; sans état (avant la première journée) : ceux de départ.
export const squadsOf = (league, world) => worldSquads(leagueSquads(league), world || startWorld(league));

// Un club prêt à jouer sa rencontre. Un ami joue avec l'effectif qu'il a envoyé (sa partie est sur son appareil) et son
// équipe validée ; absent depuis 7 jours, parti, ou sans équipe validée cette journée : l'équipe automatique de son
// dernier effectif connu. Un club de l'ordinateur : l'effectif de l'état de la ligue, équipe automatique. sold : les
// joueurs (identifiants de ligue) qu'un ami a vendus à un autre depuis son équipe envoyée (mercato immédiat) : ils n'y
// jouent plus, leur poste revient au meilleur remplaçant.
function sideOf(clubs, teams, squads, world, slot, sold = null) {
  const c = clubs[slot];
  const sent = c.member ? teams?.[c.member] : null;
  if (Array.isArray(sent?.squad) && sent.squad.length >= 11) {
    const all = sent.squad.map(unsnapPlayer);
    const players = sold?.size ? all.filter((p) => !sold.has(p.lid)) : all;
    const own = c.human && c.active && !sent.auto;
    let sheet = own ? cleanSheet(sent, all) : autoSheet(players);
    if (players.length < all.length) {
      const ids = new Set(players.map((p) => p.id));
      sheet = own
        ? cleanSheet({ ...sheet, lineup: repairLineup(players, sheet.lineup.map((id) => (ids.has(id) ? id : null)), sheet.formation) }, players)
        : autoSheet(players);
    }
    return { slot, name: c.name, crest: c.crest, players, sheet, medical: Number(sent.med) || 0, money: Number(sent.money) || 0, sent };
  }
  const b = buildingsOf(world.clubs[slot]);
  return { slot, name: c.name, crest: c.crest, players: squads[slot], sheet: autoSheet(squads[slot]), medical: b[2], stadium: b[0], money: world.clubs[slot]?.money ?? START_BUDGET, sent: null };
}
const packSheet = (sh) => ({ f: sh.formation, t: sh.tactic, l: sh.lineup, ...(sh.auto ? { a: 1 } : {}), ...(sh.ht ? { ht: sh.ht } : {}) });
export const unpackSheet = (x) => ({ formation: x.f, tactic: x.t, lineup: x.l, auto: !!x.a, ...(x.ht ? { ht: x.ht } : {}) });
// joueurs du visiteur gardés avec le résultat : son onze, et les entrants de ses plans de mi-temps (rejeu)
const elevenOf = (side) => {
  const ids = [...side.sheet.lineup.filter((id) => id !== null)];
  for (const plan of Object.values(side.sheet.ht || {})) for (const [, i] of plan.s || []) if (!ids.includes(i)) ids.push(i);
  return ids.map((id) => side.players.find((p) => p.id === id)).filter(Boolean);
};

// Mouvements du mercato conclus pendant la journée (serveur, dans l'ordre où ils l'ont été) appliqués à l'état de la
// ligue d'avant, chacun vérifié contre lui (le même chez chaque ami) : joueur libre signé (m) retiré du marché s'il y est,
// joueur d'un club de l'ordinateur (a) retiré de son effectif s'il y est, et l'indemnité versée à ce club seulement
// alors ; transferts entre amis (f) : les joueurs vendus, par place du vendeur (retirés de son équipe envoyée s'ils y
// sont, sideOf). count : tous les mouvements conclus, même ceux qui ne s'appliquent pas (le serveur les compte aussi).
// base : les effectifs de départ (leagueSquads), pour la valeur d'un joueur de l'ordinateur : une indemnité sous la
// moitié de sa valeur (la négociation ne descend jamais sous 60 % du prix demandé) laisse le joueur à son club.
export const MIN_FEE_SHARE = 0.5;
export function withMoves(world, moves, clubs, base = null) {
  const done = (moves || []).filter((x) => x.status === 'done').sort((a, b) => a.id - b.id);
  if (!done.length) return { world, sold: new Map(), count: 0 };
  const taken = new Set(done.filter((x) => x.kind === 'm').map((x) => x.pid));
  const fees = new Map();
  const gone = new Set();
  for (const x of done.filter((y) => y.kind === 'a')) {
    const slot = Number(x.seller);
    const club = clubs[slot] && !clubs[slot].human ? world.clubs?.[slot] : null;
    const c = club?.players.find((p) => p.i === x.pid);
    if (!c || gone.has(x.pid)) continue;
    const full = base ? expandPlayer(base, c) : null;
    if (full && !(x.fee >= Math.floor(priceOf(full) * MIN_FEE_SHARE))) continue;
    gone.add(x.pid);
    fees.set(slot, (fees.get(slot) || 0) + (Number.isSafeInteger(x.fee) && x.fee > 0 ? x.fee : 0));
  }
  const sold = new Map();
  for (const x of done.filter((y) => y.kind === 'f')) {
    const slot = clubs.find((c) => c.member === x.seller)?.slot;
    if (slot == null) continue;
    if (!sold.has(slot)) sold.set(slot, new Set());
    sold.get(slot).add(x.pid);
  }
  const next = {
    ...world,
    market: (world.market || []).filter((m) => !taken.has(m.i)),
    clubs: world.clubs.map((c, slot) => (c ? { ...c, money: c.money + (fees.get(slot) || 0), players: c.players.filter((p) => !gone.has(p.i)) } : c)),
  };
  return { world: next, sold, count: done.length };
}

// Une journée entière, à envoyer au serveur (le premier envoi fait foi) : chaque rencontre avec son score, ses buts
// (minute, camp 0 domicile ou 1 extérieur, buteur, penalty), les équipes jouées et les joueurs du match (effectif du club
// qui reçoit, onze du visiteur : sq), de quoi la rejouer à l'identique chez chacun et l'appliquer à sa partie ; puis la
// semaine des clubs de l'ordinateur (séances, recettes, intersaison après la dernière journée, achats sur le marché
// commun), et l'état de la ligue qui en sort. world : l'état d'avant la journée (null : le départ) ; moves : les
// mouvements du mercato de la journée (serveur), comptés dans mv (le serveur refuse une journée qui en oublie un).
export function playLeagueRound(league, members, teams, world, moves = []) {
  const clubs = leagueClubs(league, members);
  const applied = withMoves(world || startWorld(league), moves, clubs, leagueSquads(league));
  const before = applied.world;
  const squads = squadsOf(league, before);
  const sides = [...Array(LEAGUE_CLUBS).keys()].map((slot) => sideOf(clubs, teams, squads, before, slot, applied.sold.get(slot)));
  // l'équipe automatique (club de l'ordinateur, ami absent ou sans équipe) se compose en joueur appliqué, d'après le
  // niveau de son adversaire du jour
  const level = sides.map((x) => (x.sheet.auto ? appliedSheet(x.players) : x.sheet)).map((sh, slot) => lineupRating(sides[slot].players, sh.lineup, sh.formation));
  const applied2 = (slot, opp) => (sides[slot].sheet.auto ? { ...sides[slot], sheet: appliedSheet(sides[slot].players, level[opp]) } : sides[slot]);
  const matches = (leagueFixtures(league)[league.round] || []).map(([h, a]) => {
    sides[h] = applied2(h, a);
    sides[a] = applied2(a, h);
    const { live } = leagueMatch(league, league.season, league.round, sides[h], sides[a]);
    const goals = [...live.eventsOf(1), ...live.eventsOf(2)].filter((e) => e.type === 'goal')
      .map((e) => ({ m: e.minute, s: e.side === 'home' ? 0 : 1, p: e.player || '', ...(e.q === 'pen' ? { pen: 1 } : {}) }));
    return {
      h, a, hg: live.state.score.home, ag: live.state.score.away, g: goals, sh: packSheet(sides[h].sheet), sa: packSheet(sides[a].sheet),
      sq: [sides[h].players.map(toSnap), elevenOf(sides[a]).map(toSnap)], md: sides[h].medical,
    };
  });
  const last = league.round + 1 >= leagueRounds(league);
  const ai = (slot) => !sides[slot].sent; // clubs tenus par l'état de la ligue
  const humans = clubs.filter((c) => c.human && c.active).map((c) => c.slot);
  const money = sides.map((x) => x.money);
  for (const x of matches) {
    if (ai(x.h)) money[x.h] += incomeOf(x.hg, x.ag, sides[x.h].stadium);
    if (ai(x.a)) money[x.a] += incomeOf(x.ag, x.hg);
  }
  const builds = sides.map((x, slot) => (ai(slot) ? { money: money[slot], b: [...buildingsOf(before.clubs[slot])] } : null));
  const week = seeded(hash(`${league.code}|${league.seed}|${league.season}|${league.round}|semaine`), () => {
    const scale = paceOfLeague(league);
    squads.forEach((players, slot) => { if (ai(slot)) trainClub(players, null, scale, builds[slot].b[1]); });
    if (last) squads.forEach((players, slot) => { if (ai(slot)) summer(players); });
    // chantiers de la semaine, puis le marché
    const works = [];
    builds.forEach((club, slot) => {
      if (!club) return;
      const w = aiBuild(club);
      money[slot] = club.money;
      if (w) works.push({ k: 'build', s: slot, b: w.key, l: w.level, x: w.cost });
    });
    const list = sides.map((x, slot) => (ai(slot) ? squads[slot] : x.players));
    const m = runMarket({ squads: list, money, world: before, round: league.season * 100 + league.round, humans });
    list.forEach((players, slot) => { if (ai(slot)) squads[slot] = players; });
    return { ...m, moves: [...works, ...m.moves] };
  });
  const next = {
    v: 2,
    clubs: squads.map((players, slot) => (ai(slot) ? { money: money[slot], b: builds[slot].b, players: players.map(compactPlayer) } : null)),
    market: week.market, nextId: week.nextId,
  };
  // niveau de chaque club (onze automatique de son effectif) : ce que montrent l'avant-match et le classement
  const str = sides.map((x) => Math.round(lineupRating(x.players, autoSheet(x.players).lineup, '433') * 10) / 10);
  // e : la version du moteur qui a joué la journée (un rejeu d'un autre moteur peut ainsi s'en remettre au résumé)
  return { v: 3, e: LEAGUE_ENGINE, matches, moves: week.moves, str, world: next, ...(applied.count ? { mv: applied.count } : {}) };
}

// Un match joué, à revoir en 3D (l'écran du direct, en rejeu) et à appliquer à sa partie : rejoué à l'identique depuis
// les joueurs et les équipes gardés avec le résultat. Seulement si le moteur retrouve le score officiel (une autre
// version du jeu, ou un calcul d'un autre navigateur qui diverge : pas de rejeu, le résumé reste). clubs : leagueClubs ;
// x : la rencontre ({ h, a, hg, ag, sh, sa, sq, md }).
export function replayOf(league, clubs, round, x, season = league.season) {
  if (!x.sh || !x.sa || !x.sq) return null;
  const home = x.sq[0].map(unsnapPlayer);
  const away = x.sq[1].map(unsnapPlayer);
  const side = (slot, players, packed, md = 0) => ({ slot, name: clubs[slot].name, crest: clubs[slot].crest, players, sheet: unpackSheet(packed), medical: md });
  const { live, state, ctx } = leagueMatch(league, season, round, side(x.h, home, x.sh, x.md), side(x.a, away, x.sa));
  if (live.state.score.home !== x.hg || live.state.score.away !== x.ag) return null;
  live.state.half = 1; // le direct montre la première période d'abord (la seconde est déjà jouée)
  return { live, state, ctx: { ...ctx, label: t('{name} · journée {v}', { name: league.name, v: round + 1 }) } };
}

// Ce que le jeu envoie pour une journée due : ses matchs et l'état de la ligue qui suit, et à la dernière journée le
// champion de la saison (palmarès de la ligue). full : l'état du serveur avec les équipes (leagueState, teams) ;
// world : l'état de la ligue d'avant la journée.
export function roundPayload({ league, members, teams, results = [], moves = [] }, world = null) {
  const data = playLeagueRound(league, members, teams, world, moves.filter((x) => x.season === league.season && x.round === league.round));
  if (league.round + 1 < leagueRounds(league)) return { data };
  const [champion] = leagueTable(leagueClubs(league, members), [...results, data]);
  return { data, seasonEnd: { honour: { season: league.season, club: champion.name, pseudo: champion.human ? champion.pseudo : null } } };
}

// Classement tiré des résultats officiels de la saison ({ matches: [{ h, a, hg, ag }] } par journée, places des
// clubs) : 3 points la victoire, 1 le nul ; puis la différence de buts, les buts marqués, le nom.
export function leagueTable(clubs, results = []) {
  const rows = new Map(clubs.filter((c) => !c.open).map((c) => [c.slot, { ...c, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }]));
  const goals = (v) => Number.isInteger(v) && v >= 0 && v < 30;
  for (const r of results) {
    for (const m of r.matches || []) {
      const h = rows.get(m.h);
      const a = rows.get(m.a);
      if (!h || !a || h === a || !goals(m.hg) || !goals(m.ag)) continue;
      h.played++; a.played++;
      h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; } else if (m.hg < m.ag) { a.w++; h.l++; } else { h.d++; a.d++; }
    }
  }
  return [...rows.values()]
    .map((t) => ({ ...t, gd: t.gf - t.ga, pts: 3 * t.w + t.d }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name, 'fr'));
}

// Fuseau du créateur, envoyé au serveur pour l'heure des journées. Un fuseau sans changement d'heure dans l'année qui
// vient part en décalage fixe (Etc/GMT…) : l'échéance ne dépend plus de la base des fuseaux du serveur, qui peut
// retarder sur un pays venant de changer d'heure légale (constaté le 2026-10-27 : une heure d'écart entre le serveur
// et l'appareil). Avec changement d'heure (Europe…) ou une demi-heure de décalage : le nom du fuseau.
export function deviceZone(now = Date.now()) {
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const offsets = new Set([...Array(13).keys()].map((k) => new Date(now + k * 30 * 86400000).getTimezoneOffset()));
  const east = -[...offsets][0]; // minutes d'avance sur Greenwich
  if (offsets.size > 1 || east % 60) return name;
  return east === 0 ? 'Etc/GMT' : `Etc/GMT${east > 0 ? '-' : '+'}${Math.abs(east / 60)}`; // Etc/GMT-1 : une heure d'avance
}

// Échéance d'une journée, à l'heure de l'appareil : « ce soir à 21 h », « demain à 21 h 30 », « jeudi 30 à 21 h ».
export function deadlineText(iso, now = Date.now()) {
  const row = Date.parse(iso);
  if (!Number.isFinite(row)) return '';
  const d = new Date(row);
  const hour = hourText(d.getHours(), d.getMinutes());
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const gap = Math.round((day(d) - day(new Date(now))) / 86400000);
  if (gap === 0) return t('{when} à {hour}', { when: d.getHours() >= 18 ? t('ce soir') : t('aujourd’hui'), hour });
  if (gap === 1) return t('demain à {hour}', { hour });
  return t('{when} à {hour}', { when: d.toLocaleDateString(numLocale(), { weekday: 'long', day: 'numeric' }), hour });
}
export const hourText = (h, m = 0) => `${h}\u00a0h${m ? `\u00a0${String(m).padStart(2, '0')}` : ''}`; // espaces insécables : « 21 h » jamais coupé
