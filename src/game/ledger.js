import { t } from '../i18n/index';
// Livre de comptes du club (écran Finances) : chaque mouvement d'argent est rangé par poste pour la saison en
// cours ; une saison bouclée garde ses totaux par poste et sa trésorerie de début et de fin (12 dernières).

export const INCOME = [
  ['billetterie', t('Billetterie')],
  ['buvette', t('Buvette')],
  ['boutique', t('Boutique')],
  ['loges', t('Loges et hospitalités')],
  ['tv', t('Droits TV')],
  ['sponsors', t('Sponsors')],
  ['prize', t('Prime de classement')],
  ['cups', t('Primes de coupes')],
  ['titles', t('Primes de titre')],
  ['bonus', t('Primes d’objectif')],
  ['sales', t('Ventes de joueurs')],
  ['offline', t('Revenus en ton absence')],
];
export const EXPENSE = [
  ['wages', t('Salaires')],
  ['upkeep', t('Entretien')],
  ['works', t('Travaux')],
  ['signings', t('Recrutements')],
  ['medical', t('Soins médicaux')],
];

const fresh = (season, money) => ({ season, start: money, lines: {}, points: [money] });

export function ensureLedger(s) {
  if (!s.ledger) s.ledger = { ...fresh(s.seasonNumber, s.money), past: [] };
  return s.ledger;
}

// amount toujours positif : le poste dit s'il s'agit d'une recette ou d'une dépense
export function book(s, key, amount) {
  if (!amount) return;
  const l = ensureLedger(s);
  l.lines[key] = (l.lines[key] || 0) + Math.round(amount);
}

// trésorerie après chaque match (courbe de la saison)
export function markTreasury(s) {
  ensureLedger(s).points.push(s.money);
}

// fin de saison : la saison rejoint l'historique, la suivante démarre avec la trésorerie restante
export function closeLedger(s, division) {
  const l = ensureLedger(s);
  const past = [...l.past, { season: l.season, division, start: l.start, end: s.money, lines: l.lines }].slice(-12);
  s.ledger = { ...fresh(s.seasonNumber + 1, s.money), past };
}

export function totals(lines) {
  const sum = (list) => list.reduce((a, [k]) => a + (lines[k] || 0), 0);
  const income = sum(INCOME);
  const expense = sum(EXPENSE);
  return { income, expense, net: income - expense };
}
