import { REP_LEVELS } from './reputation';
import { book } from './ledger';
import { pushJournal } from './journal';

// Parcours de carrière (0.8.11, demande du PDG : des objectifs repensés et cohérents) : les chapitres de la vie du club,
// l'un après l'autre, sur plusieurs saisons. Chacun a sa prime, versée dès qu'il est accompli. Ils ne répètent jamais
// un objectif du conseil (objectives.js : le classement, le jeu et le club d'une seule saison) : notoriété, stade plein,
// académie, Coupe d'Europe, titres. Remplace la « Grande étape » de réputation (goals.js, jusqu'à la 0.8.10), dont un
// défi doublait celui du conseil (« finir dans la première moitié »).
// Une ligue entre amis a son propre parcours : ni divisions ni coupes, des amis à battre et des titres à empiler.
//
// État : s.journey = { done: { [id]: { season, round } } }. Une partie d'avant la 0.8.11 retrouve d'un coup, sans prime,
// les chapitres qu'elle a déjà accomplis.

const status = (s, name) => {
  const i = REP_LEVELS.findIndex((l) => l.name === name);
  return (s.repTop ?? -1) >= i || s.reputation >= REP_LEVELS[i].min;
};
// Avancée d'un chapitre (0.8.11) : où l'on en est (cur, plafonné à l'objectif), l'objectif (max), l'unité, et la même
// chose en mots pour le bandeau (now).
const step = (cur, max, unit) => {
  const c = Math.min(max, Math.max(0, Math.floor(cur)));
  return { ratio: c / max, cur: c, max, unit, now: `${c} / ${max} ${unit}` };
};
// Montants au format du jeu (fr-FR : espaces fines, « 1,5 M€ »), pour la prime en toutes lettres et en abrégé.
const eur = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0M€` : `${n.toLocaleString('fr-FR')}\u00a0€`);
const prize = (money, rep = 0) => ({
  money, ...(rep ? { rep, extra: `+${rep} de réputation` } : {}), label: rep ? `${eur(money)} et ${rep} de réputation` : eur(money), short: `+${eur(money)}`,
});
const repStep = (s, name) => step(s.reputation, REP_LEVELS.find((l) => l.name === name).min, 'réputation');
const leagueTitles = (s) => (s.trophies || []).filter((t) => t.comp === 'league').length;
const humanNames = (s) => new Set((s.rivals || []).filter((r) => r.human).map((r) => r.name));
const beatFriend = (s) => { const h = humanNames(s); return (s.matches || []).some((m) => h.has(m.opp) && m.gf > m.ga); };

const ACADEMY_FULL = 50000;
const academyLevel = { money: 0, academy: 1, label: 'un niveau d’académie offert', short: 'Académie +1 niveau' };
const soldOuts = (s) => s.records?.soldOut || (s.matches || []).filter((m) => m.capacity && m.attendance >= m.capacity).length;
const euroSeasons = (s) => new Set([...(s.matches || []).filter((m) => m.comp === 'c1').map((m) => m.season), ...(s.c1 ? [s.seasonNumber] : [])]).size;
// Chapitres d'une carrière : id, titre, objectif, test, avancée (en mots : le bandeau la montre), prime. Aucun ne
// répète un succès (achievements.js) : le premier stade plein, la première Coupe d'Europe y sont ; ici, la durée.
const SOLO = [
  {
    id: 'momentum', title: 'Un club qui monte', goal: 'Atteindre 6 de réputation.',
    test: (s) => status(s, 'Club qui monte'), progress: (s) => repStep(s, 'Club qui monte'), reward: prize(8000),
  },
  {
    id: 'full_house', title: 'Un stade qui vibre', goal: 'Jouer cinq matchs à guichets fermés.',
    test: (s) => soldOuts(s) >= 5, progress: (s) => step(soldOuts(s), 5, 'guichets fermés'), reward: prize(30000),
  },
  {
    id: 'talents', title: 'Maison des talents', goal: 'Porter l’académie au niveau 3.',
    test: (s) => (s.buildings.academy || 0) >= 3, progress: (s) => step(s.buildings.academy || 0, 3, 'niveaux d’académie'), reward: academyLevel,
  },
  {
    id: 'national', title: 'Club national', goal: 'Atteindre 25 de réputation.',
    test: (s) => status(s, 'Club national'), progress: (s) => repStep(s, 'Club national'), reward: prize(1500000),
  },
  {
    id: 'grand', title: 'Grand club', goal: 'Atteindre 45 de réputation.',
    test: (s) => status(s, 'Grand club'), progress: (s) => repStep(s, 'Grand club'), reward: prize(8000000),
  },
  {
    id: 'euro_regular', title: 'Habitué de l’Europe', goal: 'Jouer la Coupe d’Europe des clubs trois saisons.',
    test: (s) => euroSeasons(s) >= 3, progress: (s) => step(euroSeasons(s), 3, 'saisons européennes'),
    reward: prize(15000000),
  },
  {
    id: 'legend', title: 'Club de légende', goal: 'Atteindre 80 de réputation.',
    test: (s) => status(s, 'Club de légende'), progress: (s) => repStep(s, 'Club de légende'), reward: prize(30000000, 2),
  },
];
const LEAGUE = [
  {
    id: 'derby', title: 'Premier derby', goal: 'Battre un ami en match de championnat.',
    test: beatFriend, progress: (s) => step(beatFriend(s) ? 1 : 0, 1, 'ami battu'), reward: prize(5000),
  },
  { ...SOLO[1], reward: prize(20000) },
  { ...SOLO[2] },
  {
    id: 'regional', title: 'Un club qui compte', goal: 'Atteindre 12 de réputation.',
    test: (s) => status(s, 'Club régional'), progress: (s) => repStep(s, 'Club régional'), reward: prize(30000),
  },
  {
    id: 'dynasty', title: 'Dynastie', goal: 'Être champion de la ligue deux fois.',
    test: (s) => leagueTitles(s) >= 2, progress: (s) => step(leagueTitles(s), 2, 'titres de champion'),
    reward: prize(80000, 1),
  },
];

export const chaptersOf = (s) => (s.league ? LEAGUE : SOLO);
// La prime telle qu'elle sera versée : un niveau d'académie, ou son équivalent en argent si l'académie est au maximum.
export const rewardOf = (s, c) => (c.reward.academy && (s.buildings?.academy || 0) >= 5 ? prize(ACADEMY_FULL) : c.reward);

// Le chapitre en cours (le premier pas encore accompli), son rang et son avancée ; null : parcours achevé.
export function activeChapter(s) {
  const list = chaptersOf(s);
  const done = s.journey?.done || {};
  const index = list.findIndex((c) => !done[c.id]);
  if (index < 0) return null;
  const chapter = list[index];
  return { chapter, index, total: list.length, progress: chapter.progress(s), reward: rewardOf(s, chapter) };
}

// À faire avancer ? 'init' (première fois : les chapitres déjà accomplis se retrouvent sans prime), 'done' (le chapitre
// en cours vient d'être accompli), sinon null. Lecture seule : App n'appelle advanceJourney que si besoin.
export function journeyDue(s) {
  if (!s.journey) return 'init';
  const a = activeChapter(s);
  return a && a.chapter.test(s) ? 'done' : null;
}

// Fait avancer le parcours (s modifié) : chapitres retrouvés à la première fois, sinon le chapitre en cours accompli, sa
// prime versée, une ligne au journal. Rend le chapitre accompli (pour l'annoncer), sinon null.
export function advanceJourney(s) {
  const now = { season: s.seasonNumber, round: s.round ?? null };
  if (!s.journey) {
    s.journey = { done: {} };
    for (const c of chaptersOf(s)) if (c.test(s)) s.journey.done[c.id] = { season: null, round: null }; // acquis avant le parcours
    return null;
  }
  const a = activeChapter(s);
  if (!a || !a.chapter.test(s)) return null;
  const { chapter: c } = a;
  s.journey = { ...s.journey, done: { ...s.journey.done, [c.id]: now } };
  const r = rewardOf(s, c); // académie au maximum : la prime en argent
  if (r.money) { s.money += r.money; book(s, 'bonus', r.money); }
  if (r.rep) s.reputation = Math.round((s.reputation + r.rep) * 10) / 10;
  if (r.academy) s.buildings.academy += 1;
  pushJournal(s, { season: s.seasonNumber, round: s.round, kind: 'objectif', title: `Carrière : « ${c.title} » accompli`, text: `${c.goal} Récompense : ${r.label}.` });
  return { ...c, reward: r };
}
