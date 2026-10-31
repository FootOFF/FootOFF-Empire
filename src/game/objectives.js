import { DIVISIONS } from './constants';
import { leagueLength } from './cups';
import { autoLineup, lineupRating } from './tactics';
import { book } from './ledger';
import { pushJournal } from './journal';
import { standingsOf } from './season';
import { colon, numLocale, ordinal as ordinalText, t, tn } from '../i18n/index';

// Objectifs de la saison : trois défis fixés par le conseil d'administration à chaque début de saison (le président,
// c'est le joueur ; « objectifs du président » avant la 0.5.1), adaptés au club (force de l'onze face à sa division,
// bâtiments construits) : un classement, un défi sportif, un défi du club, d'une seule saison ; les grands chapitres de
// la vie du club, sur plusieurs saisons, sont au parcours de carrière (journey.js, 0.8.11), sans aucun défi en commun.
// Chacun a sa
// prime (argent et réputation), connue d'avance ; les trois réussis valent un bonus « saison parfaite ». La
// progression se lit en direct (HUD, menu pause), le verdict tombe au bilan de la saison (endSeason).
//
// État : s.objectives = { season, startMoney, startBuildings, list: [{ id, kind, target }] }

const SCALE = [1, 2.6, 6, 40]; // primes selon la division (comme les salaires : l'Élite ×4 depuis la 0.6.0)
const PRIZE = { rank: 10000, sport: 5000, club: 5000, perfect: 6000 };
const REP = { rank: 0.5, sport: 0.3, club: 0.3, perfect: 0.5 };
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const levelSum = (s) => Object.values(s.buildings || {}).reduce((a, b) => a + (b || 0), 0);
const leagueMatches = (s) => (s.matches || []).filter((m) => m.season === s.seasonNumber && (m.comp || 'league') === 'league');
const positionOf = (s) => standingsOf(s).findIndex((t) => t.i === 0) + 1;

// L'écart de niveau entre ton meilleur onze et la moyenne de ta division : il règle l'ambition du conseil. Le meilleur
// onze, pas l'onze enregistré : aligner un onze absurde juste avant le bilan donnait des objectifs faciles pour la même
// prime (avant la 0.5.0).
function ambition(s) {
  const d = DIVISIONS[s.divisionIndex];
  const f = s.formation || '433';
  return lineupRating(s.players, autoLineup(s.players, f), f) - (d.oppMin + d.oppMax) / 2;
}

export function prizeOf(s, kind) {
  return { money: Math.round((PRIZE[kind] * SCALE[s.divisionIndex]) / 500) * 500, rep: REP[kind] };
}

// Tirage des trois objectifs d'une saison (début de saison, nouvelle partie, ancienne sauvegarde sans objectifs).
export function drawObjectives(s) {
  const a = ambition(s);
  const top = s.divisionIndex >= DIVISIONS.length - 1;
  const rank = a >= 1.2 ? 1 : a >= 0.4 ? 2 : a >= -0.4 ? 4 : 6;
  // cibles calées sur des saisons simulées : chaque défi se réussit environ deux fois sur trois à niveau attendu ; en
  // Élite, deux fois plus de journées (aller-retour), deux fois plus de victoires, de buts et de cages inviolées
  const k = leagueLength(s) / 7;
  const aim = (v, lo, hi) => clamp(Math.round(v * k), Math.round(lo * k), Math.round(hi * k));
  const sport = pick([
    { id: 'wins', target: aim(3 + a * 1.5, 2, 6) },
    { id: 'goals', target: aim(11 + a * 3, 6, 18) },
    { id: 'defense', target: aim(9 - a * 3, 4, 13) },
    { id: 'clean', target: aim(2 + a, 1, 4) },
  ]);
  const club = pick([
    { id: 'green' },
    { id: 'build' },
    ...(s.buildings.academy > 0 ? [{ id: 'youth' }] : []),
  ]);
  s.objectives = {
    season: s.seasonNumber, startMoney: s.money, startBuildings: levelSum(s), top,
    list: [{ kind: 'rank', id: 'rank', target: rank }, { kind: 'sport', ...sport }, { kind: 'club', ...club }],
  };
  return s;
}

const RANK_TITLE = (s, row) => (row === 1 ? t('Être champion') : row === 2 ? (s.divisionIndex < DIVISIONS.length - 1 && !s.league ? t('Monter en fin de saison') : t('Finir dans les deux premiers'))
  : row === 4 ? t('Finir dans la première moitié') : s.divisionIndex > 0 && !s.league ? t('Se maintenir') : t('Finir 6e ou mieux'));

// Où en est un objectif : titre, texte, avancée (0 à 1), état ('live', 'done' atteint, 'failed' manqué pour de bon),
// et l'avancée en mots.
export function progressOf(s, o) {
  const ms = leagueMatches(s);
  const played = s.table?.[0]?.played || 0;
  const total = s.schedule?.length || 7;
  const over = played >= total;
  const tally = (f) => ms.reduce((n, m) => n + f(m), 0);
  switch (o.id) {
    case 'rank': {
      const pos = positionOf(s);
      const ok = pos <= o.target;
      return {
        title: RANK_TITLE(s, o.target), text: tn(o.target, 'Finir 1er du championnat.', 'Finir {target}e ou mieux.', { target: o.target }, !(o.target === 1)),
        ratio: played ? clamp((8 - pos + 1) / (8 - o.target + 1), 0, 1) : 0, state: over ? (ok ? 'done' : 'failed') : 'live',
        now: played ? t('{v} aujourd’hui', { v: ordinalText(pos) }) : t('pas encore joué'),
      };
    }
    case 'wins': {
      const w = tally((m) => (m.gf > m.ga ? 1 : 0));
      return { title: t('Gagner {target} matchs', { target: o.target }), text: t('En championnat.'), ratio: clamp(w / o.target, 0, 1), state: w >= o.target ? 'done' : over ? 'failed' : 'live', now: `${w} / ${o.target}` };
    }
    case 'goals': {
      const g = tally((m) => m.gf);
      return { title: t('Marquer {target} buts', { target: o.target }), text: t('En championnat.'), ratio: clamp(g / o.target, 0, 1), state: g >= o.target ? 'done' : over ? 'failed' : 'live', now: `${g} / ${o.target}` };
    }
    case 'defense': {
      const ga = tally((m) => m.ga);
      return {
        title: t('Encaisser {target} buts au plus', { target: o.target }), text: t('En championnat, sur toute la saison.'), ratio: clamp(1 - ga / (o.target + 1), 0, 1),
        state: ga > o.target ? 'failed' : over ? 'done' : 'live', now: tn(ga, '{ga} encaissé', '{ga} encaissés', { ga }, ga > 1),
      };
    }
    case 'clean': {
      const c = tally((m) => (m.ga === 0 ? 1 : 0));
      return {
        title: tn(o.target, 'Garder sa cage inviolée', 'Garder sa cage inviolée {target} fois', { target: o.target }, o.target > 1), text: t('Des matchs de championnat sans encaisser de but.'),
        ratio: clamp(c / o.target, 0, 1), state: c >= o.target ? 'done' : over ? 'failed' : 'live', now: `${c} / ${o.target}`,
      };
    }
    case 'green': {
      const start = s.objectives?.startMoney ?? s.money;
      const ok = s.money >= start;
      return {
        title: t('Finir la saison dans le vert'), text: t('Avoir au bilan au moins autant d’argent qu’au début de la saison.'), ratio: ok ? 1 : 0,
        state: over ? (ok ? 'done' : 'failed') : 'live', now: ok ? t('dans le vert') : t('dans le rouge'),
      };
    }
    case 'build': {
      const ok = levelSum(s) > (s.objectives?.startBuildings ?? levelSum(s));
      return { title: t('Faire grandir le complexe'), text: t('Construire ou améliorer un bâtiment.'), ratio: ok ? 1 : 0, state: ok ? 'done' : over ? 'failed' : 'live', now: ok ? t('chantier lancé') : t('aucun chantier') };
    }
    case 'youth': {
      const ok = s.players.some((p) => p.academy && p.joined === s.seasonNumber);
      return { title: t('Lancer un jeune du club'), text: t('Faire monter un jeune de l’académie en équipe première.'), ratio: ok ? 1 : 0, state: ok ? 'done' : over ? 'failed' : 'live', now: ok ? t('c’est fait') : t('pas encore') };
    }
    default:
      return { title: '', text: '', ratio: 0, state: 'live', now: '' };
  }
}

// Objectifs de la saison en cours, prêts à afficher (null pour une partie sans objectifs tirés).
export function seasonObjectives(s) {
  if (!s.objectives || s.objectives.season !== s.seasonNumber) return null;
  const list = s.objectives.list.map((o) => ({ ...o, ...progressOf(s, o), prize: prizeOf(s, o.kind) }));
  return { list, done: list.filter((o) => o.state === 'done').length, perfect: prizeOf(s, 'perfect') };
}

// Bilan (endSeason, après les comptes de la saison) : primes des objectifs atteints, bonus si les trois le sont.
export function closeSeasonObjectives(s, events) {
  if (!s.objectives || s.objectives.season !== s.seasonNumber) return s;
  // verdicts d'abord (avant les primes : « dans le vert » se juge sur les comptes de la saison)
  const results = s.objectives.list.map((o) => { const p = progressOf(s, o); return { o, title: p.title, ok: p.state === 'done' }; });
  let reached = 0;
  for (const { o, title, ok } of results) {
    if (!ok) { events.push(t('Objectif manqué : {toLowerCase}.', { toLowerCase: title.toLowerCase() })); continue; }
    reached += 1;
    const prize = prizeOf(s, o.kind);
    s.money += prize.money;
    book(s, 'bonus', prize.money);
    s.reputation = r1(s.reputation + prize.rep);
    events.push(t('Objectif atteint : {toLowerCase} (+{toLocaleString} €).', { toLowerCase: title.toLowerCase(), toLocaleString: prize.money.toLocaleString(numLocale()) }));
  }
  if (reached === results.length) {
    const prize = prizeOf(s, 'perfect');
    s.money += prize.money;
    book(s, 'bonus', prize.money);
    s.reputation = r1(s.reputation + prize.rep);
    events.push(t('Saison parfaite : les trois objectifs du conseil sont atteints (+{toLocaleString} €).', { toLocaleString: prize.money.toLocaleString(numLocale()) }));
  }
  pushJournal(s, {
    season: s.seasonNumber, kind: 'objectif',
    title: reached === results.length ? t('Saison parfaite : les trois objectifs atteints') : t('Objectifs de la saison : {reached} sur {length}', { reached, length: results.length }),
    text: results.map((x) => `${x.title}${colon()}${x.ok ? t('atteint') : t('manqué')}`).join(' · '),
  });
  return s;
}
