import { ATTRS, GK_ATTRS, assignNumber, playerRating, progressPlayer } from './players';
import { ELITE_PACE, bestCat, catsFor, collectiveGain, sessionGain, suggestFor } from './training';

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

export const compactPlayer = (p) => ({
  i: p.id, g: p.age, p: Math.round(p.pot * 100) / 100, a: pack(p.a, FIELD),
  ...(p.g ? { k: pack(p.g, KEEPER) } : {}), ...(p.traits?.length ? { t: [...p.traits] } : {}),
});

// Le joueur d'origine d'un identifiant (nom, visage, pied, poste, numéro) ; squads : effectifs de départ (leagueSquads).
function baseOf(squads, gid) {
  const slot = Math.floor(gid / 100);
  return squads[slot]?.[(gid % 100) - 1] || null;
}

export function expandPlayer(squads, c) {
  const base = baseOf(squads, c.i);
  if (!base) return null;
  return {
    ...base, id: c.i, age: c.g, pot: c.p, a: unpack(c.a, FIELD), ...(c.k ? { g: unpack(c.k, KEEPER) } : {}),
    traits: c.t ? [...c.t] : [], form: [], fit: 100, injury: null, ban: 0,
  };
}

// État de départ : les effectifs tirés de la graine, le même budget pour tous.
export function initialWorld(squads) {
  return {
    v: 1,
    clubs: squads.map((players, slot) => ({ money: START_BUDGET, players: players.map((p) => compactPlayer({ ...p, id: slot * 100 + p.id })) })),
  };
}

// Les effectifs d'un état, joueurs complets (un numéro de maillot libre pour chacun dans son club).
export function worldSquads(squads, world) {
  return world.clubs.map((club) => {
    const players = [];
    for (const c of club.players) {
      const p = expandPlayer(squads, c);
      if (!p) continue;
      if (players.some((q) => q.num === p.num)) assignNumber(players, p);
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

// Choix de séance d'un club, pour l'écran : ceux de l'ami (valables), sinon les conseillés.
export function trainingPlan(players, orders) {
  const s = { players, buildings: { training: LEAGUE_TRAINING } };
  return Object.fromEntries(LINES.map((pos) => {
    const o = orders?.[pos];
    const p = (o && players.find((q) => q.id === o.id && q.pos === pos)) || suggestFor(s, pos);
    if (!p) return [pos, null];
    const cat = o?.id === p.id && catsFor(pos)[o.cat] ? o.cat : bestCat(s, p);
    return [pos, { id: p.id, cat }];
  }));
}

// Gain de note attendu d'une séance (aperçu, sans rien toucher).
export function sessionPreview(p, cat, scale) {
  const q = { ...p, a: { ...p.a }, g: p.g ? { ...p.g } : p.g };
  return sessionGain(LEAGUE_TRAINING, q, cat, scale);
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
