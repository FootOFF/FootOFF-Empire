import { DIVISIONS, POS_LABELS, START_MONEY, upgradeCost } from './constants';
import { capacity } from './economy';
import { costOf, makePlayer, ratingAt, signingFee } from './players';
import { acceptChance } from './mercato';
import { slotsOf } from './tactics';
import { bestSigning } from './advice';
import { rnd } from './utils';

// Tutoriel des premières minutes : bienvenue → centre d'entraînement → première recrue → premier match
// → cap sur le stade. Chaque étape se valide toute seule dès que son objectif est atteint (dans
// n'importe quel ordre) ; l'étape courante est sauvegardée avec la partie.

export const STEPS = ['welcome', 'build', 'sign', 'match', 'stadium'];

const goalReached = {
  build: (s) => s.buildings.training > 0,
  sign: (s) => (s.signings || 0) > 0,
  match: (s) => s.round > 0 || s.seasonNumber > 1,
};

// Fait avancer le tutoriel tant que les objectifs des étapes sont déjà remplis.
export function advanceTutorial(s) {
  const t = s.tutorial;
  if (!t || t.step === 'done') return s;
  while (goalReached[t.step]?.(s)) t.step = STEPS[STEPS.indexOf(t.step) + 1];
  return s;
}

export function setTutorialStep(s, step) {
  s.tutorial = { step };
  return advanceTutorial(s);
}

// Parties existantes : un club déjà lancé n'a pas besoin du tutoriel.
export function ensureTutorial(s) {
  if (!s.tutorial) {
    const fresh = s.seasonNumber === 1 && s.round === 0 && s.buildings.training === 0;
    s.tutorial = { step: fresh ? 'welcome' : 'done' };
  }
  return s;
}

// Première partie : le premier adversaire est le plus faible de la division (une première victoire
// est à portée), et le marché propose une recrue abordable sur la ligne la plus faible de l'onze.
export function prepareFirstSeason(s) {
  const pair = s.schedule[0].find((p) => p.includes(0));
  const firstIdx = (pair[0] === 0 ? pair[1] : pair[0]) - 1;
  const weakest = s.rivals.reduce((w, r, i) => (r.strength < s.rivals[w].strength ? i : w), 0);
  [s.rivals[firstIdx], s.rivals[weakest]] = [s.rivals[weakest], s.rivals[firstIdx]];
  s.rivals[firstIdx].strength = Math.round((DIVISIONS[0].oppMin - rnd(0.8, 1.2)) * 10) / 10;

  // ligne la plus faible et son titulaire le moins bon
  const lines = {};
  s.lineup.forEach((id, k) => {
    const p = s.players.find((q) => q.id === id);
    const slot = slotsOf(s.formation)[k];
    (lines[slot] ||= []).push(ratingAt(p, slot));
  });
  const pos = Object.keys(lines).filter((x) => x !== 'G')
    .sort((a, b) => lines[a].reduce((x, y) => x + y, 0) / lines[a].length - lines[b].reduce((x, y) => x + y, 0) / lines[b].length)[0];
  const worst = Math.min(...lines[pos]);
  const budget = START_MONEY - upgradeCost('training', 1) - 200;
  // son agent accepte à coup sûr une offre au prix demandé (première négociation sans mauvaise surprise)
  let pick = null;
  for (let i = 0; i < 80 && !pick; i++) {
    const p = makePlayer({ level: 1.4 - i * 0.012, pos });
    Object.assign(p, { id: s.nextId, priceMod: 1, interest: 0, listedRounds: 0 });
    if (ratingAt(p, pos) >= worst + 0.8 && signingFee(p, 0) <= budget && acceptChance(s, p, costOf(p, s)) >= 1) pick = p;
  }
  if (pick) {
    s.nextId++;
    s.market[0] = pick;
  }
  for (const p of s.market) p.interest = 0; // premier jour : aucun club rival sur les joueurs libres
  return s;
}

// Textes des étapes (le club et la recrue proposée rendent le tutoriel concret).
export function stepContent(step, s) {
  const total = STEPS.length;
  const index = STEPS.indexOf(step) + 1;
  const base = { step, index, total };
  switch (step) {
    case 'welcome':
      return {
        ...base,
        title: 'Bienvenue, président',
        text: `${s.clubName} démarre en ${DIVISIONS[s.divisionIndex].name} avec un terrain municipal et ${START_MONEY.toLocaleString('fr-FR')} €. En trois minutes, on lance ton projet.`,
        cta: 'C’est parti',
      };
    case 'build':
      return {
        ...base,
        title: 'Construis ton centre d’entraînement',
        text: `Tes joueurs progresseront à chaque intersaison. La parcelle 1 du complexe t’attend : ${upgradeCost('training', 1).toLocaleString('fr-FR')} €.`,
        cta: 'Voir la parcelle',
        action: { kind: 'plot', plot: 't1', sector: 'main' },
      };
    case 'sign': {
      const rec = bestSigning(s)?.player;
      return {
        ...base,
        title: 'Renforce ton équipe',
        text: rec
          ? `${rec.name} (${POS_LABELS[rec.pos].toLowerCase()}) ${rec.club ? `est à vendre (${rec.club})` : 'est libre'} et renforcerait ton onze. Dans le mercato, la recrue recommandée est marquée en or : fais-lui une offre, la jauge te donne tes chances.`
          : 'Le mercato bouge à chaque journée. Recrute quand un joueur renforce ton onze : il sera marqué en or.',
        cta: 'Ouvrir le mercato',
        action: { kind: 'panel', panel: 'squad', tab: 'market' },
      };
    }
    case 'match':
      return {
        ...base,
        title: 'Joue ton premier match',
        text: 'Choisis ton onze et ta tactique, regarde le pronostic bouger, puis vis la rencontre en direct.',
        cta: 'Jouer le match',
        action: { kind: 'match' },
      };
    case 'stadium': {
      const cost = upgradeCost('terrain', 2);
      return {
        ...base,
        title: 'Ton prochain cap : le stade',
        text: `Chaque match remplit la caisse. À ${cost.toLocaleString('fr-FR')} €, ton stade passera à ${capacity(2).toLocaleString('fr-FR')} places. Les pastilles dorées montrent ce qui est prêt à être amélioré, et la carte « Conseil du staff » te guide ensuite.`,
        cta: 'Terminer',
        secondary: { label: 'Voir le stade', action: { kind: 'plot', plot: 't0', sector: 'main' } },
      };
    }
    default:
      return null;
  }
}
