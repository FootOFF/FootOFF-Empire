import { REP_LEVELS, repLevel } from './reputation';
import { book } from './ledger';
import { pushJournal } from './journal';

// Système d'objectifs : 4 paliers, chacun lié à un seuil de réputation.
// Le palier courant est DÉCIDE PAR LA REPUTATION (c'est elle qui mène l'Empire).
// L'objectif actif est le premier palier (dans le range de ta réputation) dont la
// récompense n'a pas encore été touchée. Accomplir l'objectif de saison -> récompense.
//
// État vécu par le joueur, dans s.goals :
//   { completed: [bool x4] } — récompense du palier i déjà obtenue ?

export const GOALS = [
  {
    id: 'rises',
    tier: 0,
    repNeeded: 0,
    name: 'Tête haute',
    blurb: 'Prouve que ton projet mérite mieux qu’un terrain de quartier.',
    reward: { label: '8 000 € de prime de palier', short: '+8 000 €', apply: (s) => { s.money += 8000; } },
    active: () => ({
      id: 'top-half',
      name: 'Terminer dans la première moitié du classement',
      desc: (s) => `Terminer S${s.seasonNumber} à la 4e place ou mieux.`,
      done: (s) => (s.seasonReview ? s.seasonReview.position <= 4 : false),
    }),
  },
  {
    id: 'fans',
    tier: 1,
    repNeeded: 6,
    name: 'Le public s’attache',
    blurb: 'Un stade qui vibre, un quartier qui t’accompagne.',
    reward: { label: '30 000 € de prime de palier', short: '+30 000 €', apply: (s) => { s.money += 30000; } },
    active: () => ({
      id: 'crowd',
      name: 'Combler le stade',
      desc: (s) => `Atteindre un remplissage ≥ 60 % sur un match (S${s.seasonNumber}).`,
      done: (s) => s.seasonStats?.crowd ?? false,
    }),
  },
  {
    id: 'academy',
    tier: 2,
    repNeeded: 12,
    name: 'Maison des talents',
    blurb: 'Ne plus dépendre du marché : forger tes propres histoires.',
    reward: { label: 'Académie +1 niveau offert', short: 'Académie +1 niveau', apply: (s) => { if (s.buildings.academy < 5) s.buildings.academy += 1; } },
    active: () => ({
      id: 'revelation',
      name: 'Révéler un talent',
      desc: 'Atteindre l’académie niveau 3 ou plus d’ici la fin de la saison.',
      done: (s) => s.buildings.academy >= 3,
    }),
  },
  {
    id: 'empire',
    tier: 3,
    repNeeded: 25,
    name: 'L’Empire',
    blurb: 'Ton complexe sportif tient sa promesse : un club que tout le pays connaît.',
    // une étape d'Élite : prime à l'échelle de la division depuis la 0.6.0 (3 M€ avant)
    reward: { label: '12 M€ + 2 de réputation', short: '+12 M€, +2 de réputation', apply: (s) => { s.money += 12000000; s.reputation = Math.round((s.reputation + 2) * 10) / 10; } },
    active: () => ({
      id: 'elite',
      name: 'Tenir ta place en Élite',
      desc: 'Terminer parmi les trois premiers de l’Élite.',
      done: (s) => s.seasonReview ? s.divisionIndex === 3 && s.seasonReview.position <= 3 : false,
    }),
  },
];

// Palier courant = f(réputation).
export function tierOf(rep) {
  let t = 0;
  GOALS.forEach((g, i) => {
    if (rep >= g.repNeeded) t = i;
  });
  return t;
}

export function goalNameAt(tier) {
  return GOALS[tier]?.name || 'L’Empire';
}

// Crée l'état de progression (au début de partie).
export function initGoals(s) {
  s.goals = { completed: Array(GOALS.length).fill(false) };
  s.seasonStats = { crowd: false };
  return s;
}

// Objectif actif : le premier palier dans le range de réputation dont la récompense
// n'a pas encore été obtenue.
export function activeGoal(s) {
  const tier = tierOf(s.reputation);
  for (let i = 0; i <= tier; i++) {
    if (!s.goals.completed[i]) return { tier: i, goal: GOALS[i], active: GOALS[i].active() };
  }
  return { tier, goal: GOALS[tier], active: GOALS[tier].active() };
}

// En fin de saison : si l'objectif actif est atteint -> récompense + marque le palier.
export function closeSeasonGoals(s, events) {
  if (!s.goals) return s;
  const { tier, goal, active } = activeGoal(s);
  if (active.done(s) && !s.goals.completed[tier]) {
    const before = s.money;
    goal.reward.apply(s);
    book(s, 'bonus', s.money - before);
    s.goals.completed[tier] = true;
    events.push(`Objectif « ${active.name} » accompli : ${goal.reward.label} !`);
    pushJournal(s, {
      season: s.seasonNumber,
      kind: 'objectif',
      title: `Objectif accompli : ${active.name.toLowerCase()}`,
      text: `Récompense : ${goal.reward.label}.`,
    });
  } else if (!active.done(s)) {
    events.push(`Objectif « ${active.name} » non atteint cette saison : il se poursuit.`);
  }
  return s;
}

// Reset des stats de saison (appelé au début de chaque saison).
export function resetSeasonStats(s) {
  s.seasonStats = { crowd: false };
  return s;
}

// La réputation franchit-elle un palier de notoriété (reputation.js) ? Le club change de statut : une ligne au
// journal, et la nouvelle est rendue à l'interface (bandeau doré). Un statut ne s'annonce qu'une fois : un club
// qui redescend sous un palier puis le repasse ne le regagne pas (repTop : plus haut statut déjà atteint).
export function reputationStatusEvent(s, before) {
  let reached = null;
  const top = s.repTop ?? repLevel(before).index;
  for (let i = 0; i < REP_LEVELS.length; i++) {
    const lvl = REP_LEVELS[i];
    if (i > top && before < lvl.min && s.reputation >= lvl.min) {
      reached = lvl;
      pushJournal(s, {
        season: s.seasonNumber,
        kind: 'club',
        title: `Nouveau statut : ${lvl.name}`,
        text: `Avec ${lvl.min} de réputation, ${s.clubName} attire davantage : plus de public, de meilleurs sponsors, des vendeurs plus conciliants.`,
      });
    }
  }
  s.repTop = Math.max(top, repLevel(s.reputation).index);
  return reached;
}