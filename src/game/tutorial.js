import { DIVISIONS, POS_LABELS, START_MONEY, upgradeCost } from './constants';
import { capacity } from './economy';
import { costOf, makePlayer, ratingAt, signingFee } from './players';
import { acceptChance } from './mercato';
import { slotsOf } from './tactics';
import { bestSigning } from './advice';
import { book } from './ledger';
import { seasonObjectives } from './objectives';
import { rnd } from './utils';

// Tutoriel des premières minutes, mené par la directrice sportive du club : bienvenue → centre d'entraînement →
// première séance (une épreuve en 3D) → première recrue → premier match → effectif (condition physique, blessures,
// suspensions, changements) → objectifs du président → cap sur le stade. Chaque étape dit ce qu'il faut faire et pourquoi ; une étape d'action réussie rapporte une prime au club
// (annoncée par une notification). Chaque étape se valide toute seule dès que son objectif est atteint ; l'étape
// courante est sauvegardée avec la partie.

export const STEPS = ['welcome', 'build', 'train', 'sign', 'match', 'squad', 'goals', 'stadium'];

const goalReached = {
  build: (s) => s.buildings.training > 0,
  train: (s) => Object.keys(s.training?.done || {}).length > 0,
  sign: (s) => (s.signings || 0) > 0,
  match: (s) => s.round > 0 || s.seasonNumber > 1,
};
// primes des étapes d'action (une fois chacune), et ce qui les justifie
export const REWARDS = {
  build: [1000, 'Subvention de la mairie'], train: [500, 'Premier entraînement'], sign: [500, 'Première recrue'], match: [1000, 'Premier match'],
};

// Fait avancer le tutoriel tant que les objectifs des étapes sont déjà remplis ; les primes gagnées pendant cet
// appel restent dans s.tutorial.just (l'interface les annonce).
export function advanceTutorial(s) {
  const t = s.tutorial;
  if (!t || t.step === 'done') return s;
  t.just = [];
  while (goalReached[t.step]?.(s)) {
    const r = REWARDS[t.step];
    if (r && !(t.paid || []).includes(t.step)) {
      s.money += r[0];
      book(s, 'bonus', r[0]);
      t.paid = [...(t.paid || []), t.step];
      t.just.push({ step: t.step, money: r[0], label: r[1] });
    }
    t.step = STEPS[STEPS.indexOf(t.step) + 1];
  }
  return s;
}

export function setTutorialStep(s, step) {
  s.tutorial = { ...(s.tutorial || {}), step };
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

// Textes des étapes, dits par la directrice sportive : quoi faire (text), pourquoi (why), et la prime de l'étape
// (reward). Le club, la recrue proposée et les objectifs tirés rendent le tutoriel concret.
const eur = (v) => `${v.toLocaleString('fr-FR')} €`;
export function stepContent(step, s) {
  const total = STEPS.length;
  const index = STEPS.indexOf(step) + 1;
  const base = { step, index, total, reward: REWARDS[step]?.[0] || null };
  switch (step) {
    case 'welcome':
      return {
        ...base,
        title: 'Bienvenue, président',
        text: `${s.clubName} démarre en ${DIVISIONS[s.divisionIndex].name} : un terrain municipal, ${eur(START_MONEY)} en caisse et tout à construire. Je suis ta directrice sportive : je te montre l’essentiel en quelques minutes.`,
        why: 'Ton but : monter de division en division jusqu’à l’Elite, et bâtir le complexe le plus prestigieux du pays.',
        cta: 'C’est parti',
      };
    case 'build':
      return {
        ...base,
        title: 'Construis ton centre d’entraînement',
        text: `Touche la parcelle 1 du complexe, puis maintiens « Construire ». Coût : ${eur(upgradeCost('training', 1))}.`,
        why: 'Sans lui, tes joueurs ne progressent qu’à l’intersaison. Avec lui, ils progressent entre chaque match.',
        cta: 'Voir la parcelle',
        action: { kind: 'plot', plot: 't1', sector: 'main' },
      };
    case 'train':
      return {
        ...base,
        title: 'Ta première séance',
        text: 'Ouvre le centre, choisis un joueur et joue son épreuve en 3D : frappes, sprint, lecture du jeu ou arrêts du gardien.',
        why: 'Plus l’épreuve est réussie, plus le joueur progresse, pour de bon. Pressé ? « Simuler » assure un gain moyen.',
        cta: 'Aller à l’entraînement',
        action: { kind: 'panel', panel: 'training' },
      };
    case 'sign': {
      const rec = bestSigning(s)?.player;
      return {
        ...base,
        title: 'Renforce ton équipe',
        text: rec
          ? `${rec.name} (${POS_LABELS[rec.pos].toLowerCase()}) ${rec.club ? `est à vendre (${rec.club})` : 'est libre'} et renforcerait ton onze. Dans le mercato, il est marqué « Recommandé » : fais-lui une offre.`
          : 'Le mercato bouge à chaque journée. Recrute quand un joueur renforce ton onze : il est marqué « Recommandé ».',
        why: 'Avant de confirmer, la jauge de l’offre affiche tes vraies chances d’accord : à toi de doser le prix.',
        cta: 'Ouvrir le mercato',
        action: { kind: 'panel', panel: 'squad', tab: 'market' },
      };
    }
    case 'match':
      return {
        ...base,
        title: 'Joue ton premier match',
        text: 'Choisis ton onze et ta tactique, regarde le pronostic bouger, puis vis la rencontre en direct.',
        why: 'Chaque match à domicile remplit la caisse, et chaque victoire rapproche de la montée.',
        cta: 'Jouer le match',
        action: { kind: 'match' },
      };
    case 'squad':
      return {
        ...base,
        title: 'Ménage ton effectif',
        text: 'Sous chaque joueur, une barre : sa condition physique. Un match la fait baisser selon l’endurance, chaque date la remonte. Fatigué, un joueur joue moins bien et se blesse plus souvent : fais tourner, « Meilleur onze » s’en charge.',
        why: 'Blessés et suspendus (rouge : deux matchs, second jaune ou trois jaunes : un) restent sur le banc, grisés. Pendant un match, « Changement » arrête le jeu à toute minute : cinq changements par match.',
        cta: 'Compris',
      };
    case 'goals': {
      const obj = seasonObjectives(s);
      const list = obj ? obj.list.map((o) => o.title.toLowerCase()).join(', ') : '';
      return {
        ...base,
        title: 'Les objectifs du président',
        text: obj
          ? `Cette saison, il attend trois choses : ${list}. Chacun rapporte une prime ; leur avancée est en haut à gauche.`
          : 'Chaque saison, le président te fixe trois objectifs, chacun avec sa prime ; leur avancée est en haut à gauche.',
        why: obj ? `Les trois réussis valent un bonus de saison parfaite : +${eur(obj.perfect.money)}.` : 'Les trois réussis valent un bonus de saison parfaite.',
        cta: 'Compris',
      };
    }
    case 'stadium': {
      const cost = upgradeCost('terrain', 2);
      return {
        ...base,
        title: 'Ton prochain cap : le stade',
        text: `À ${eur(cost)}, ton stade passera à ${capacity(2).toLocaleString('fr-FR')} places : plus de public, plus de recettes à chaque match.`,
        why: 'Les pastilles dorées montrent ce qui est prêt à être amélioré, et le bouton du staff, à droite de l’écran, te conseille ensuite.',
        cta: 'Terminer',
        secondary: { label: 'Voir le stade', action: { kind: 'plot', plot: 't0', sector: 'main' } },
      };
    }
    default:
      return null;
  }
}
