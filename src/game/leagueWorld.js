import { SQUAD_MAX, SQUAD_MIN } from './constants';
import { ATTRS, GK_ATTRS, assignNumber, freshSeason, makePlayer, marketValue, progressPlayer } from './players';
import { squadName } from './names';
import { autoLineup, lineupRating } from './tactics';
import { ELITE_PACE, bestCat, catsFor, collectiveGain, sessionGain, suggestFor } from './training';
import { pick, rnd } from './utils';

// État d'un championnat entre amis après une journée : chaque club (son budget, ses joueurs), calculé avec les matchs
// par le jeu qui joue la journée (league.js, roundPayload), à l'identique chez chaque ami, et gardé avec le résultat
// (le serveur n'en sait rien). Un joueur y tient en peu de place : son identifiant de ligue, son âge, son potentiel,
// ses qualités au centième et ses signes ; son nom, son visage, son pied et son poste se retrouvent d'après son
// identifiant (effectifs de départ tirés de la graine, league.js). Identifiants : place du club × 100 + rang (1 à 15).

export const LEAGUE_TRAINING = 2; // centre d'entraînement de chaque club de ligue : le même pour tous (niveau 2)
export const START_BUDGET = 20000; // budget de départ de chaque club
export const LINES = ['G', 'D', 'M', 'A'];

const FIELD = ATTRS.map((x) => x.key);
const KEEPER = GK_ATTRS.map((x) => x.key);
const pack = (o, keys) => keys.map((k) => Math.round((o[k] ?? 1) * 100));
const unpack = (arr, keys) => Object.fromEntries(keys.map((k, i) => [k, (arr?.[i] ?? 100) / 100]));

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
export const unsnapPlayer = (x) => ({
  id: x.i, lid: x.l, name: x.n, pos: x.pos, alt: x.alt || null, foot: x.ft, age: x.g, pot: x.p, a: unpack(x.a, FIELD),
  ...(x.k ? { g: unpack(x.k, KEEPER) } : {}), traits: x.t ? [...x.t] : [], num: x.num, face: x.f || null, fit: x.fit ?? 100,
  ...(x.x ? { injury: { out: 1, total: 1, label: 'Indisponible' } } : {}), form: [], season: freshSeason(), hist: [],
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

// Rythme de la saison : quatorze journées en aller-retour, chaque séance y compte pour deux tiers (comme l'Elite).
export const paceOfLeague = (league) => (league.settings?.format === 'single' ? 1 : ELITE_PACE);

// Séance de la semaine, une par ligne : le joueur et la catégorie choisis (orders : { G: { id, cat }, … }), sinon le
// joueur et la catégorie conseillés (ceux qui progresseraient le plus) ; puis la séance collective pour tous les autres.
// Simulée, au gain moyen : le même chez chaque ami. Renvoie ce qui a été travaillé ([identifiant, catégorie, gain]).
export function trainClub(players, orders, scale) {
  const s = { players, buildings: { training: LEAGUE_TRAINING } };
  const done = [];
  for (const pos of LINES) {
    const o = orders?.[pos];
    let p = o ? players.find((q) => q.id === o.id && q.pos === pos) : null;
    let cat = p && catsFor(pos)[o.cat] ? o.cat : null;
    if (!p) p = suggestFor(s, pos);
    if (!p) continue;
    if (!cat) cat = bestCat(s, p);
    const gain = sessionGain(LEAGUE_TRAINING, p, cat, scale);
    done.push([p.id, cat, Math.round(gain * 1000)]);
  }
  const trained = new Set(done.map(([id]) => id));
  for (const p of players) if (!trained.has(p.id)) collectiveGain(LEAGUE_TRAINING, p, scale);
  return done;
}

// Recettes d'une journée : une somme fixe, plus une prime de victoire ou de match nul.
export const INCOME = { base: 1500, win: 1000, draw: 400 };
export const incomeOf = (gf, ga) => INCOME.base + (gf > ga ? INCOME.win : gf === ga ? INCOME.draw : 0);

// Intersaison (dernière journée) : chacun prend un an, progresse vers son potentiel ou décline après 32 ans (comme en
// carrière, players.js). Sous une graine : le même chez chaque ami.
export function summer(players) {
  for (const p of players) {
    progressPlayer(p);
    p.age += 1;
  }
}

// --- Marché commun et offres entre amis ---------------------------------------------------------------------------------------------------
// Chaque semaine, six joueurs libres pour toute la ligue (tirés sous la graine de la journée, de tous niveaux : du
// remplaçant au titulaire de premier plan). Chacun fait ses offres sous pli fermé (au moins le prix affiché) ; au calcul
// de la journée, la plus haute l'emporte, si le club en a encore les moyens et la place (22 joueurs au plus). Un joueur
// reste deux semaines sur le marché. On peut aussi vendre un joueur au-dehors, à 85 % de sa valeur (13 joueurs au moins).
// Les clubs de l'ordinateur font parfois une offre au prix, pour un joueur qui renforcerait leur onze. Entre amis :
// une offre pour un joueur d'un autre ami (trois au plus par semaine) ; il l'accepte ou la refuse la semaine suivante,
// et le transfert se fait au calcul de la journée, si chacun en a encore les moyens et la place.
export const MARKET_SIZE = 6;
export const MARKET_WEEKS = 2;
export const SQUAD_CAP = 22;
export const MAX_BIDS = 3;
const MARKET_POS = ['G', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A'];
const roundPrice = (v) => Math.max(500, Math.round(v / 250) * 250);
export const priceOf = (p) => roundPrice(marketValue(p, 0));

// La place du marché, joueurs complets avec leur prix (x) et la journée de leur arrivée (r).
export const marketPlayers = (world) => (world?.market || []).map((m) => ({ ...expandPlayer([], m), price: m.x, since: m.r }));

// Offres d'amis de la semaine passée, offres sur le marché, puis la place renouvelée. Les clubs des amis vivent dans leur
// partie (leagueClub.js) : ici, seulement ce qu'ils ont envoyé avec leur équipe (effectif, budget déclaré, ordres). Ce
// qu'ils gagnent (recrue, transfert conclu) part dans les mouvements de la semaine, avec le joueur ; chaque ami
// l'applique à sa partie en lisant la journée. Les clubs de l'ordinateur, eux, sont modifiés ici (état de la ligue).
// squads : effectifs (ordinateur : ceux de l'état, modifiés ; amis : ceux envoyés) ; money : budgets (ordinateur : ceux
// de l'état, modifiés ; amis : déclarés, décomptés au fil des achats de la journée) ; orders(slot) : les ordres d'un ami
// présent (null sinon) ; humans : places des amis présents. round : la semaine de la ligue (saison × 100 + journée),
// qui ne revient jamais en arrière d'une saison à l'autre.
export function runMarket({ squads, money, orders, world, round, humans = [] }) {
  const moves = [];
  const isHuman = (slot) => humans.includes(slot);
  // offres entre amis de la semaine passée : acceptées, refusées ou restées sans réponse
  for (const o of world?.offers || []) {
    const seller = orders(o.s);
    const verdict = seller?.accept?.includes(o.id) ? 'yes' : seller?.refuse?.includes(o.id) ? 'no' : 'none';
    const p = squads[o.s]?.find((q) => q.lid === o.l);
    const ok = verdict === 'yes' && !!p && isHuman(o.b) && money[o.b] >= o.x
      && squads[o.b].length < SQUAD_MAX && squads[o.s].length > SQUAD_MIN;
    if (ok) {
      money[o.b] -= o.x;
      money[o.s] += o.x;
      squads[o.s] = squads[o.s].filter((q) => q !== p);
    }
    moves.push({ k: ok ? 'deal' : verdict === 'yes' ? 'fail' : verdict === 'no' ? 'refused' : 'expired', s: o.s, b: o.b, l: o.l, n: o.n, x: o.x, ...(ok ? { pl: snapPlayer(p) } : {}) });
  }
  // offres sur le marché
  const market = marketPlayers(world);
  const bids = new Map(market.map((p) => [p.id, []]));
  squads.forEach((players, slot) => {
    const o = orders(slot);
    if (o) {
      for (const b of (o.bids || []).slice(0, MAX_BIDS)) {
        const p = market.find((q) => q.id === b?.i);
        if (p && Number.isFinite(b.x) && b.x >= p.price) bids.get(p.id).push({ slot, x: Math.round(b.x), tie: Math.random() });
      }
    } else if (!isHuman(slot) && world?.clubs?.[slot] && Math.random() < 0.35) {
      // l'ordinateur : le joueur qui renforcerait le plus son onze, au prix
      const eleven = autoLineup(players, '433');
      const now = lineupRating(players, eleven, '433');
      let best = null;
      for (const p of market) {
        if (p.price > money[slot] - 3000) continue;
        const gain = lineupRating([...players, p], autoLineup([...players, p], '433'), '433') - now;
        if (gain > 0.04 && (!best || gain > best.gain)) best = { p, gain };
      }
      if (best) bids.get(best.p.id).push({ slot, x: best.p.price, tie: Math.random() });
    }
  });
  const sold = new Set();
  for (const p of market) {
    const list = bids.get(p.id).sort((a, b) => b.x - a.x || a.tie - b.tie);
    const cap = (slot) => (isHuman(slot) ? SQUAD_MAX : SQUAD_CAP);
    const win = list.find((b) => money[b.slot] >= b.x && squads[b.slot].length < cap(b.slot));
    if (!win) continue;
    money[win.slot] -= win.x;
    const { price, since, ...player } = p;
    squads[win.slot].push(player);
    sold.add(p.id);
    moves.push({ k: 'buy', s: win.slot, i: p.id, n: p.name, x: win.x, o: list.length, ...(isHuman(win.slot) ? { pl: compactPlayer(player) } : {}) });
  }
  // nouvelles offres entre amis (trois au plus par club) : le club vendeur répondra la semaine prochaine
  const offers = [];
  squads.forEach((_, slot) => {
    if (!isHuman(slot)) return;
    for (const b of (orders(slot)?.offers || []).slice(0, MAX_BIDS)) {
      const seller = squads.findIndex((players, s) => s !== slot && isHuman(s) && players.some((p) => p.lid === b?.l));
      if (seller < 0 || !Number.isFinite(b.x) || b.x < 250 || b.x > money[slot]) continue;
      const p = squads[seller].find((q) => q.lid === b.l);
      offers.push({ id: `${round}-${slot}-${b.l}`, b: slot, s: seller, l: b.l, n: p.name, x: Math.round(b.x / 50) * 50 });
    }
  });
  // la place renouvelée : les invendus de moins de deux semaines restent, de nouveaux joueurs complètent
  const keep = (world?.market || []).filter((m) => !sold.has(m.i) && round - m.r < MARKET_WEEKS - 1);
  return { ...refill(keep, [...squads.flat(), ...market], world?.nextId || 1000, round + 1), offers, moves };
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
