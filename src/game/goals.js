import { REP_LEVELS, repLevel } from './reputation';
import { pushJournal } from './journal';

// Statuts de notoriété (annonce d'un nouveau statut) et statistiques de la saison. Les quatre paliers de la « Grande
// étape » (jusqu'à la 0.8.10) ont laissé la place au parcours de carrière (journey.js) ; s.goals reste dans les
// sauvegardes, sans usage.

// Crée l'état de progression (au début de partie).
export function initGoals(s) {
  s.goals = { completed: [false, false, false, false] }; // marque d'une partie initialisée (save.js)
  s.seasonStats = { crowd: false };
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