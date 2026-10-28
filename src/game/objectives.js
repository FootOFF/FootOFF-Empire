import { DIVISIONS } from './constants';
import { leagueLength } from './cups';
import { autoLineup, lineupRating } from './tactics';
import { book } from './ledger';
import { pushJournal } from './journal';
import { standingsOf } from './season';

// Objectifs de la saison : trois défis fixés par le conseil d'administration à chaque début de saison (le président,
// c'est le joueur ; « objectifs du président » avant la 0.5.1), adaptés au club (force de l'onze face à sa division,
// bâtiments construits) : un classement, un défi sportif, un défi du club. Chacun a sa
// prime (argent et réputation), connue d'avance ; les trois réussis valent un bonus « saison parfaite ». La
// progression se lit en direct (HUD, menu pause), le verdict tombe au bilan de la saison (endSeason). Les grandes
// étapes de réputation (goals.js) continuent à part.
//
// État : s.objectives = { season, startMoney, startBuildings, list: [{ id, kind, target }] }

const SCALE = [1, 2.6, 6, 40]; // primes selon la division (comme les salaires : l'Elite ×4 depuis la 0.6.0)
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
  // Elite, deux fois plus de journées (aller-retour), deux fois plus de victoires, de buts et de cages inviolées
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

const RANK_TITLE = (s, t) => (t === 1 ? 'Être champion' : t === 2 ? (s.divisionIndex < DIVISIONS.length - 1 && !s.league ? 'Monter en fin de saison' : 'Finir dans les deux premiers')
  : t === 4 ? 'Finir dans la première moitié' : s.divisionIndex > 0 && !s.league ? 'Se maintenir' : 'Finir 6e ou mieux');

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
        title: RANK_TITLE(s, o.target), text: o.target === 1 ? 'Finir 1er du championnat.' : `Finir ${o.target}e ou mieux.`,
        ratio: played ? clamp((8 - pos + 1) / (8 - o.target + 1), 0, 1) : 0, state: over ? (ok ? 'done' : 'failed') : 'live',
        now: played ? `${pos === 1 ? '1er' : `${pos}e`} aujourd’hui` : 'pas encore joué',
      };
    }
    case 'wins': {
      const w = tally((m) => (m.gf > m.ga ? 1 : 0));
      return { title: `Gagner ${o.target} matchs`, text: 'En championnat.', ratio: clamp(w / o.target, 0, 1), state: w >= o.target ? 'done' : over ? 'failed' : 'live', now: `${w} / ${o.target}` };
    }
    case 'goals': {
      const g = tally((m) => m.gf);
      return { title: `Marquer ${o.target} buts`, text: 'En championnat.', ratio: clamp(g / o.target, 0, 1), state: g >= o.target ? 'done' : over ? 'failed' : 'live', now: `${g} / ${o.target}` };
    }
    case 'defense': {
      const ga = tally((m) => m.ga);
      return {
        title: `Encaisser ${o.target} buts au plus`, text: 'En championnat, sur toute la saison.', ratio: clamp(1 - ga / (o.target + 1), 0, 1),
        state: ga > o.target ? 'failed' : over ? 'done' : 'live', now: `${ga} encaissé${ga > 1 ? 's' : ''}`,
      };
    }
    case 'clean': {
      const c = tally((m) => (m.ga === 0 ? 1 : 0));
      return {
        title: o.target > 1 ? `Garder sa cage inviolée ${o.target} fois` : 'Garder sa cage inviolée', text: 'Des matchs de championnat sans encaisser de but.',
        ratio: clamp(c / o.target, 0, 1), state: c >= o.target ? 'done' : over ? 'failed' : 'live', now: `${c} / ${o.target}`,
      };
    }
    case 'green': {
      const start = s.objectives?.startMoney ?? s.money;
      const ok = s.money >= start;
      return {
        title: 'Finir la saison dans le vert', text: 'Avoir au bilan au moins autant d’argent qu’au début de la saison.', ratio: ok ? 1 : 0,
        state: over ? (ok ? 'done' : 'failed') : 'live', now: ok ? 'dans le vert' : 'dans le rouge',
      };
    }
    case 'crowd': {
      const best = ms.reduce((b, m) => (m.capacity && m.attendance ? Math.max(b, m.attendance / m.capacity) : b), 0);
      return {
        title: 'Remplir le stade à 80 %', text: 'Sur un match de championnat à domicile.', ratio: clamp(best / o.target, 0, 1),
        state: best >= o.target ? 'done' : over ? 'failed' : 'live', now: `meilleur : ${Math.round(best * 100)} %`,
      };
    }
    case 'build': {
      const ok = levelSum(s) > (s.objectives?.startBuildings ?? levelSum(s));
      return { title: 'Faire grandir le complexe', text: 'Construire ou améliorer un bâtiment.', ratio: ok ? 1 : 0, state: ok ? 'done' : over ? 'failed' : 'live', now: ok ? 'chantier lancé' : 'aucun chantier' };
    }
    case 'youth': {
      const ok = s.players.some((p) => p.academy && p.joined === s.seasonNumber);
      return { title: 'Lancer un jeune du club', text: 'Faire monter un jeune de l’académie en équipe première.', ratio: ok ? 1 : 0, state: ok ? 'done' : over ? 'failed' : 'live', now: ok ? 'c’est fait' : 'pas encore' };
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
    if (!ok) { events.push(`Objectif manqué : ${title.toLowerCase()}.`); continue; }
    reached += 1;
    const prize = prizeOf(s, o.kind);
    s.money += prize.money;
    book(s, 'bonus', prize.money);
    s.reputation = r1(s.reputation + prize.rep);
    events.push(`Objectif atteint : ${title.toLowerCase()} (+${prize.money.toLocaleString('fr-FR')} €).`);
  }
  if (reached === results.length) {
    const prize = prizeOf(s, 'perfect');
    s.money += prize.money;
    book(s, 'bonus', prize.money);
    s.reputation = r1(s.reputation + prize.rep);
    events.push(`Saison parfaite : les trois objectifs du conseil sont atteints (+${prize.money.toLocaleString('fr-FR')} €).`);
  }
  pushJournal(s, {
    season: s.seasonNumber, kind: 'objectif',
    title: reached === results.length ? 'Saison parfaite : les trois objectifs atteints' : `Objectifs de la saison : ${reached} sur ${results.length}`,
    text: results.map((x) => `${x.title} : ${x.ok ? 'atteint' : 'manqué'}`).join(' · '),
  });
  return s;
}
