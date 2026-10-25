// Livre de comptes du club (écran Finances) : chaque mouvement d'argent est rangé par poste pour la saison en
// cours ; une saison bouclée garde ses totaux par poste et sa trésorerie de début et de fin (12 dernières).

export const INCOME = [
  ['billetterie', 'Billetterie'],
  ['buvette', 'Buvette'],
  ['boutique', 'Boutique'],
  ['loges', 'Loges et hospitalités'],
  ['tv', 'Droits TV'],
  ['sponsors', 'Sponsors'],
  ['prize', 'Prime de classement'],
  ['cups', 'Primes de coupes'],
  ['titles', 'Primes de titre'],
  ['bonus', 'Primes d’objectif'],
  ['sales', 'Ventes de joueurs'],
  ['offline', 'Revenus en ton absence'],
];
export const EXPENSE = [
  ['wages', 'Salaires'],
  ['upkeep', 'Entretien'],
  ['works', 'Travaux'],
  ['signings', 'Recrutements'],
  ['medical', 'Soins médicaux'],
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
