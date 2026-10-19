export const SAVE_KEY = 'footoff-empire-save-v1';

// Divisions : niveau des adversaires, prix du billet, dépense par spectateur (buvette, boutique),
// public potentiel, droits TV par match, sponsoring de base et prime du champion (en euros).
export const DIVISIONS = [
  { name: 'Départementale', oppMin: 5.2, oppMax: 7.4, ticket: 6, food: 2, shop: 1, demand: 650, tv: 0, sponsor: 5000, prize: 6000 },
  { name: 'Régionale', oppMin: 7.6, oppMax: 9.8, ticket: 10, food: 3, shop: 2, demand: 3800, tv: 4000, sponsor: 35000, prize: 40000 },
  { name: 'Nationale', oppMin: 10.0, oppMax: 12.2, ticket: 16, food: 4, shop: 3.5, demand: 15000, tv: 45000, sponsor: 220000, prize: 300000 },
  { name: 'Elite', oppMin: 13.0, oppMax: 16.0, ticket: 28, food: 5, shop: 6, demand: 40000, tv: 220000, sponsor: 1000000, prize: 1600000 },
];

export const POS_LABELS = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', A: 'Attaquant' };
export const SQUAD_MAX = 18;
export const SQUAD_MIN = 11;

// Coût du niveau N = baseCost × mult^(N − first) ; le stade est livré au niveau 1.
export const BUILDINGS = {
  terrain: { name: 'Stade', max: 4, baseCost: 40000, mult: 10, first: 2 },
  training: { name: 'Centre d’entraînement', max: 5, baseCost: 4000, mult: 6.2, first: 1 },
  academy: { name: 'Académie', max: 5, baseCost: 5000, mult: 6.2, first: 1 },
  fans: { name: 'Espace supporters', max: 5, baseCost: 3500, mult: 6.2, first: 1 },
  sponsor: { name: 'Siège & partenaires', max: 5, baseCost: 6000, mult: 6.2, first: 1 },
};

export const START_MONEY = 8000;

export function upgradeCost(key, targetLevel) {
  const b = BUILDINGS[key];
  return Math.round(b.baseCost * b.mult ** (targetLevel - b.first));
}
