// Le journal du club : une entrée par événement (match, mercato, bâtiment, saison, objectif, club, académie,
// entraînement), la plus récente en tête. Il garde l'histoire du club : jusqu'à JOURNAL_MAX entrées (une saison en
// écrit une trentaine), et au-delà, les plus anciennes des rubriques les moins marquantes partent d'abord
// (entraînement, académie, puis les matchs), jamais une saison bouclée, un titre, un objectif ou un fait du club.
export const JOURNAL_MAX = 600;
const EXPENDABLE = ['entrainement', 'academie', 'match'];

export function trimJournal(s) {
  const j = s.journal;
  if (!j || j.length <= JOURNAL_MAX) return;
  for (const kind of EXPENDABLE) {
    while (j.length > JOURNAL_MAX) {
      let k = -1;
      for (let i = j.length - 1; i >= 0; i--) if ((j[i].kind || 'club') === kind) { k = i; break; }
      if (k < 0) break;
      j.splice(k, 1);
    }
    if (j.length <= JOURNAL_MAX) return;
  }
  j.length = JOURNAL_MAX;
}

export function pushJournal(s, entry) {
  s.journal.unshift(entry);
  trimJournal(s);
}
