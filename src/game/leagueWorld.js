import { upgradeCost } from './constants';
import { ATTRS, GK_ATTRS, assignNumber, freshSeason, makePlayer, marketValue, playerRating, progressPlayer, ratingAt } from './players';
import { squadName } from './names';
import { FORMATION_ORDER, autoLineup, lineupRating, slotsOf } from './tactics';
import { ELITE_PACE, bestCat, catsFor, collectiveGain, sessionGain, suggestFor } from './training';
import { pick, rnd } from './utils';
import { t } from '../i18n/index';

// État d'un championnat entre amis après une journée : chaque club (son budget, ses joueurs), calculé avec les matchs
// par le jeu qui joue la journée (league.js, roundPayload), à l'identique chez chaque ami, et gardé avec le résultat
// (le serveur n'en sait rien). Un joueur y tient en peu de place : son identifiant de ligue, son âge, son potentiel,
// ses qualités au centième et ses signes ; son nom, son visage, son pied et son poste se retrouvent d'après son
// identifiant (effectifs de départ tirés de la graine, league.js). Identifiants : place du club × 100 + rang (1 à 15).

export const LEAGUE_TRAINING = 2; // centre d'entraînement d'un club de l'ordinateur au départ (niveau 2)
export const START_BUDGET = 20000; // budget de départ de chaque club
export const LINES = ['G', 'D', 'M', 'A'];

const FIELD = ATTRS.map((x) => x.key);
const KEEPER = GK_ATTRS.map((x) => x.key);
const pack = (o, keys) => keys.map((k) => Math.round((o[k] ?? 1) * 100));
const unpack = (arr, keys) => Object.fromEntries(keys.map((k, i) => [k, (Array.isArray(arr) && Number.isFinite(arr[i]) ? arr[i] : 100) / 100]));

// Un joueur venu du marché commun (identifiant 1000 et plus) garde avec lui ce qui le décrit (b : nom, poste, pied,
// poste de dépannage, visage) : il n'est pas dans les effectifs de départ.
const baseFields = (p) => ({ n: p.name, pos: p.pos, foot: p.foot, alt: p.alt || null, face: p.face });
export const compactPlayer = (p) => ({
  i: p.id, g: p.age, p: Math.round(p.pot * 100) / 100, a: pack(p.a, FIELD),
  ...(p.g ? { k: pack(p.g, KEEPER) } : {}), ...(p.traits?.length ? { t: [...p.traits] } : {}),
  ...(p.id >= 1000 ? { b: baseFields(p) } : {}),
});

// Le joueur d'origine d'un identifiant (nom, visage, pied, poste, numéro) ; squads : effectifs de départ (leagueSquads).
function baseOf(squads, c) {
  if (c.b) return { name: c.b.n, pos: c.b.pos, foot: c.b.foot, alt: c.b.alt, face: c.b.face, season: freshSeason(), hist: [], joined: 1 };
  const slot = Math.floor(c.i / 100);
  return squads[slot]?.[(c.i % 100) - 1] || null;
}

export function expandPlayer(squads, c) {
  const base = baseOf(squads, c);
  if (!base) return null;
  return {
    ...base, id: c.i, age: c.g, pot: c.p, a: unpack(c.a, FIELD), ...(c.k ? { g: unpack(c.k, KEEPER) } : {}),
    traits: c.t ? [...c.t] : [], form: [], fit: 100, injury: null, ban: 0,
  };
}

// Un joueur de l'effectif qu'un ami envoie avec son équipe (sa partie est sur son appareil) : tout ce que le moteur et
// l'écran du match en lisent, condition et indisponibilité comprises. i : son identifiant dans la partie de l'ami ;
// l : son identifiant de ligue (place × 100 + rang au départ, 1000 et plus pour le marché), qui le suit d'un club à l'autre.
export const snapPlayer = (p) => ({
  i: p.id, l: p.lid ?? null, n: p.name, pos: p.pos, alt: p.alt || null, ft: p.foot, g: p.age, p: Math.round((p.pot || 0) * 100) / 100,
  a: pack(p.a, FIELD), ...(p.g ? { k: pack(p.g, KEEPER) } : {}), ...(p.traits?.length ? { t: [...p.traits] } : {}),
  num: p.num, f: p.face || null, fit: Math.round(p.fit ?? 100), ...(p.injury?.out > 0 || p.ban > 0 ? { x: 1 } : {}),
});
// Relu d'un autre appareil (équipe envoyée, joueur cédé) : chaque champ vérifié, une valeur piégée ne fait jamais tomber
// le jeu (audit cyber-auditor du 2026-10-28) ; un joueur bien formé reste exactement le même.
const POS = ['G', 'D', 'M', 'A'];
const FEET = ['droit', 'gauche', 'les deux'];
const int = (v, d) => (Number.isSafeInteger(v) ? v : d);
const fin = (v, d) => (Number.isFinite(v) ? v : d);
export const unsnapPlayer = (x) => ({
  id: int(x?.i, 0), lid: int(x?.l, null), name: typeof x?.n === 'string' ? x.n : '?', pos: POS.includes(x?.pos) ? x.pos : 'M',
  alt: POS.includes(x?.alt) ? x.alt : null, foot: FEET.includes(x?.ft) ? x.ft : 'droit', age: fin(x?.g, 25), pot: fin(x?.p, 0), a: unpack(x?.a, FIELD),
  ...(x?.k ? { g: unpack(x.k, KEEPER) } : {}), traits: Array.isArray(x?.t) ? x.t.filter((t) => typeof t === 'string') : [],
  num: int(x?.num, null), face: x?.f && typeof x.f === 'object' && !Array.isArray(x.f) ? x.f : null, fit: fin(x?.fit, 100),
  ...(x?.x ? { injury: { out: 1, total: 1, label: t('Indisponible') } } : {}), form: [], season: freshSeason(), hist: [],
});
// Un joueur de l'état de la ligue (club de l'ordinateur, marché) devenu joueur d'une partie : son identifiant de ligue.
export const toSnap = (p) => snapPlayer({ ...p, lid: p.lid ?? p.id });

// État de départ : les effectifs tirés de la graine, le même budget pour tous.
export function initialWorld(squads) {
  return {
    v: 1,
    clubs: squads.map((players, slot) => ({ money: START_BUDGET, players: players.map((p) => compactPlayer({ ...p, id: slot * 100 + p.id })) })),
  };
}

// Les effectifs d'un état, joueurs complets (un numéro de maillot libre pour chacun dans son club).
export function worldSquads(squads, world) {
  return world.clubs.map((club, slot) => {
    const players = [];
    const list = club ? club.players : squads[slot].map((p) => compactPlayer({ ...p, id: slot * 100 + p.id }));
    for (const c of list) {
      const p = expandPlayer(squads, c);
      if (!p) continue;
      if (p.num == null || players.some((q) => q.num === p.num)) assignNumber(players, p);
      players.push(p);
    }
    return players;
  });
}

// Rythme de la saison : quatorze journées en aller-retour, chaque séance y compte pour deux tiers (comme l'Élite).
export const paceOfLeague = (league) => (league.settings?.format === 'single' ? 1 : ELITE_PACE);

// Séance de la semaine, une par ligne : le joueur et la catégorie choisis (orders : { G: { id, cat }, … }), sinon le
// joueur et la catégorie conseillés (ceux qui progresseraient le plus) ; puis la séance collective pour tous les autres.
// Simulée, au gain moyen : le même chez chaque ami. level : le centre d'entraînement du club. Renvoie ce qui a été
// travaillé ([identifiant, catégorie, gain]).
export function trainClub(players, orders, scale, level = LEAGUE_TRAINING) {
  const s = { players, buildings: { training: level } };
  const done = [];
  for (const pos of LINES) {
    const o = orders?.[pos];
    let p = o ? players.find((q) => q.id === o.id && q.pos === pos) : null;
    let cat = p && catsFor(pos)[o.cat] ? o.cat : null;
    if (!p) p = suggestFor(s, pos);
    if (!p) continue;
    if (!cat) cat = bestCat(s, p);
    const gain = sessionGain(level, p, cat, scale);
    done.push([p.id, cat, Math.round(gain * 1000)]);
  }
  const trained = new Set(done.map(([id]) => id));
  for (const p of players) if (!trained.has(p.id)) collectiveGain(level, p, scale);
  return done;
}

// Recettes d'une journée : une somme fixe (plus grande à domicile avec un stade agrandi), plus une prime de victoire ou de
// match nul.
export const INCOME = { base: 1500, win: 1000, draw: 400 };
const STADIUM_GATE = [1, 1, 1.6, 2.4, 3.6, 5, 7]; // recette de base selon le niveau du stade (match à domicile)
export const incomeOf = (gf, ga, stadium = 1) => Math.round(INCOME.base * (STADIUM_GATE[stadium] ?? 1)) + (gf > ga ? INCOME.win : gf === ga ? INCOME.draw : 0);

// --- Clubs de l'ordinateur : un joueur appliqué (0.8.3) ----------------------------------------------------------------
// Ses bâtiments (b : [stade, centre d'entraînement, centre médical], aux prix du solo) : un chantier au plus par journée,
// quand il lui reste de quoi recruter ensuite (BUILD_RESERVE) ; d'abord le centre médical (moins de blessés à domicile),
// puis le stade (recettes), puis le centre d'entraînement (progression), puis le reste, niveau par niveau.
export const AI_BUILDINGS = ['terrain', 'training', 'medical'];
export const START_BUILDINGS = [1, LEAGUE_TRAINING, 0];
const BUILD_ORDER = [['medical', 1], ['terrain', 2], ['medical', 2], ['training', 3], ['terrain', 3], ['medical', 3], ['training', 4], ['terrain', 4]];
const BUILD_RESERVE = 8000;
export const buildingsOf = (club) => (Array.isArray(club?.b) ? club.b : START_BUILDINGS);
export function aiBuild(club) {
  const b = [...buildingsOf(club)];
  for (const [key, level] of BUILD_ORDER) {
    const k = AI_BUILDINGS.indexOf(key);
    if (b[k] >= level) continue;
    const cost = upgradeCost(key, b[k] + 1);
    if (club.money < cost + BUILD_RESERVE) return null; // il économise pour le chantier suivant
    club.money -= cost;
    b[k] += 1;
    club.b = b;
    return { key, level: b[k], cost };
  }
  return null;
}

// Son équipe du jour : le dispositif qui met le mieux en valeur son effectif, une tactique selon l'écart de niveau avec
// l'adversaire (plus fort : il attaque ; plus faible : il se replie), et ses plans de mi-temps : mené, il attaque et fait
// entrer des forces fraîches ; devant, il gère ; à égalité, il pousse s'il est le plus fort. Les mêmes règles font jouer
// le club d'un ami absent. Seuils accordés à l'équilibre « Prudente » des tactiques (0.8.4) : il attaque plus fort de
// 0,35, se replie en bloc bas plus faible de 1,2, joue équilibré entre les deux.
const AI_GAP = 0.35;
const AI_LOW = 1.2;
export function appliedSheet(players, oppStrength = null) {
  let best = null;
  for (const f of FORMATION_ORDER) {
    const lineup = autoLineup(players, f);
    const r = lineupRating(players, lineup, f);
    if (!best || r > best.r + 1e-9) best = { f, lineup, r };
  }
  const gap = oppStrength == null ? 0 : best.r - oppStrength;
  const tactic = gap > AI_GAP ? 'offensive' : gap < -AI_LOW ? 'low' : 'balanced';
  const fresh = (n) => freshLegs(players, best.lineup, best.f, n);
  const ht = {
    lead: { t: tactic === 'offensive' ? 'balanced' : 'low', ...(fresh(1).length ? { s: fresh(1) } : {}) },
    draw: { t: gap > 0 ? 'offensive' : tactic, ...(fresh(1).length ? { s: fresh(1) } : {}) },
    trail: { t: 'offensive', ...(fresh(2).length ? { s: fresh(2) } : {}) },
  };
  return { formation: best.f, tactic, lineup: best.lineup, auto: true, ht };
}
// Remplaçants frais : les titulaires de champ les plus faibles à leur poste, chacun remplacé par le meilleur remplaçant
// disponible à ce poste s'il n'y perd pas plus de 0,3 (les jambes fraîches compensent) ; n au plus. [[sortant, entrant]…]
function freshLegs(players, lineup, formation, n) {
  const slots = slotsOf(formation);
  const bench = players.filter((p) => !lineup.includes(p.id) && !p.injury && !(p.ban > 0));
  const starters = lineup.map((id, k) => ({ p: players.find((q) => q.id === id), k })).filter((x) => x.p && slots[x.k] !== 'G')
    .sort((a, b) => ratingAt(a.p, slots[a.k]) - ratingAt(b.p, slots[b.k]) || a.k - b.k);
  const out = [];
  const used = new Set();
  for (const { p, k } of starters) {
    if (out.length >= n) break;
    const pos = slots[k];
    const sub = bench.filter((q) => !used.has(q.id) && q.pos !== 'G').sort((a, b) => ratingAt(b, pos) - ratingAt(a, pos) || a.id - b.id)[0];
    if (!sub || ratingAt(sub, pos) < ratingAt(p, pos) - 0.3) continue;
    used.add(sub.id);
    out.push([p.id, sub.id]);
  }
  return out;
}

// Intersaison (dernière journée) : chacun prend un an, progresse vers son potentiel ou décline après 32 ans (comme en
// carrière, players.js). Sous une graine : le même chez chaque ami.
export function summer(players) {
  for (const p of players) {
    progressPlayer(p);
    p.age += 1;
  }
}

// --- Marché commun ----------------------------------------------------------------------------------------------------
// Chaque semaine, six joueurs libres pour toute la ligue (tirés sous la graine de la journée, de tous niveaux : du
// remplaçant au titulaire de premier plan). Entre deux journées, les amis les signent comme en solo (négociation, puis
// signature au premier club qui conclut : serveur des ligues, 0.8.3) ; les clubs de l'ordinateur font leurs achats au
// calcul de la journée. Un joueur reste deux semaines sur le marché.
export const MARKET_SIZE = 6;
export const MARKET_WEEKS = 2;
export const SQUAD_CAP = 22;
const AI_SQUAD = 20; // l'ordinateur n'achète plus au-delà
const AI_KEEP = 18; // ni ne garde plus de joueurs que cela
const MARKET_POS = ['G', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A'];
const roundPrice = (v) => Math.max(500, Math.round(v / 250) * 250);
export const priceOf = (p) => roundPrice(marketValue(p, 0));

// La place du marché, joueurs complets avec leur prix (x) et la journée de leur arrivée (r).
export const marketPlayers = (world) => (world?.market || []).map((m) => ({ ...expandPlayer([], m), price: m.x, since: m.r }));

// Achats des clubs de l'ordinateur sur le marché, puis la place renouvelée. Les clubs des amis vivent dans leur partie
// (leagueClub.js) et signent entre deux journées ; les clubs de l'ordinateur sont modifiés ici (état de la ligue).
// squads : effectifs (ordinateur : ceux de l'état, modifiés) ; money : budgets (ordinateur : ceux de l'état, modifiés) ;
// humans : places des amis présents. round : la semaine de la ligue (saison × 100 + journée), qui ne revient jamais en
// arrière d'une saison à l'autre.
export function runMarket({ squads, money, world, round, humans = [] }) {
  const moves = [];
  const isHuman = (slot) => humans.includes(slot);
  const market = marketPlayers(world);
  const bids = new Map(market.map((p) => [p.id, []]));
  squads.forEach((players, slot) => {
    if (!isHuman(slot) && world?.clubs?.[slot] && players.length < AI_SQUAD && Math.random() < 0.6) {
      // l'ordinateur : le joueur qui renforcerait le plus son onze, au prix, s'il en vaut la peine
      const eleven = autoLineup(players, '433');
      const now = lineupRating(players, eleven, '433');
      let best = null;
      for (const p of market) {
        if (p.price > money[slot] - 3000) continue;
        const gain = lineupRating([...players, p], autoLineup([...players, p], '433'), '433') - now;
        if (gain > 0.06 && (!best || gain > best.gain)) best = { p, gain };
      }
      if (best) bids.get(best.p.id).push({ slot, x: best.p.price, tie: Math.random() });
    }
  });
  const sold = new Set();
  for (const p of market) {
    const list = bids.get(p.id).sort((a, b) => b.x - a.x || a.tie - b.tie);
    const win = list.find((b) => money[b.slot] >= b.x && squads[b.slot].length < SQUAD_CAP);
    if (!win) continue;
    money[win.slot] -= win.x;
    const { price, since, ...player } = p;
    squads[win.slot].push(player);
    sold.add(p.id);
    moves.push({ k: 'buy', s: win.slot, i: p.id, n: p.name, x: win.x, o: list.length });
  }
  // l'ordinateur libère son surplus (au-delà de AI_KEEP joueurs) : le moins utile de ses remplaçants rejoint le marché
  // commun, au prix de sa valeur, où les amis peuvent le signer
  const released = [];
  squads.forEach((players, slot) => {
    if (isHuman(slot) || !world?.clubs?.[slot] || players.length <= AI_KEEP) return;
    const eleven = new Set(autoLineup(players, '433'));
    const spare = players.filter((p) => !eleven.has(p.id)).sort((a, b) => playerRating(a) - playerRating(b) || a.age - b.age || a.id - b.id)[0];
    if (!spare) return;
    squads[slot] = players.filter((p) => p !== spare);
    released.push({ ...compactPlayer(spare), b: { n: spare.name, pos: spare.pos, foot: spare.foot, alt: spare.alt || null, face: spare.face }, x: priceOf(spare), r: round + 1 });
    moves.push({ k: 'free', s: slot, i: spare.id, n: spare.name });
  });
  // la place renouvelée : les invendus de moins de deux semaines restent, les joueurs libérés arrivent, de nouveaux
  // joueurs complètent
  const keep = [...(world?.market || []).filter((m) => !sold.has(m.i) && round - m.r < MARKET_WEEKS - 1), ...released];
  return { ...refill(keep, [...squads.flat(), ...market], world?.nextId || 1000, round + 1), moves };
}

// Complète la place à six joueurs (arrivés pour la journée `round`) ; others : les joueurs déjà dans la ligue (noms pris).
export function refill(keep, others, nextId, round) {
  const taken = new Set(others.map((p) => p.name));
  const market = [...keep];
  let next = nextId;
  while (market.length < MARKET_SIZE) {
    const p = makePlayer({ level: rnd(0.1, 1.3), pos: pick(MARKET_POS), name: squadName(taken, new Set()) });
    taken.add(p.name);
    p.id = next++;
    market.push({ ...compactPlayer(p), x: priceOf(p), r: round });
  }
  return { market, nextId: next };
}
