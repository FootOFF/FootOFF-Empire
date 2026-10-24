export const SAVE_KEY = 'footoff-empire-save-v1';

// Divisions : niveau des adversaires, prix du billet, dépense par spectateur (buvette, boutique),
// public potentiel, droits TV par match, sponsoring de base et prime du champion (en euros).
// Niveau des adversaires (oppMin à oppMax, répartis dans la division) : chaque division commence un peu au-dessus de
// la précédente, et le haut de l'Elite (17,0) reste un défi pour un onze arrivé au sommet (18 au plus, en pratique).
export const DIVISIONS = [
  { name: 'Départementale', oppMin: 5.0, oppMax: 7.4, ticket: 6, food: 2, shop: 1, demand: 650, tv: 0, sponsor: 5000, prize: 6000 },
  { name: 'Régionale', oppMin: 7.6, oppMax: 10.0, ticket: 10, food: 3, shop: 2, demand: 3800, tv: 4000, sponsor: 35000, prize: 40000 },
  { name: 'Nationale', oppMin: 10.2, oppMax: 12.8, ticket: 16, food: 4, shop: 3.5, demand: 15000, tv: 45000, sponsor: 220000, prize: 300000 },
  { name: 'Elite', oppMin: 13.4, oppMax: 17.0, ticket: 28, food: 5, shop: 6, demand: 40000, tv: 220000, sponsor: 1000000, prize: 1600000 },
];

export const POS_LABELS = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', A: 'Attaquant' };
export const SQUAD_MAX = 25; // effectif professionnel : de quoi tourner sur le championnat et les coupes
export const SQUAD_MIN = 11;

// Académie (academy.js) : six places dans l'équipe de jeunes, départ à 19 ans sans montée en équipe première,
// jeunes repérés après chaque journée de championnat selon le niveau de l'académie (0 à 5).
export const YOUTH_PLACES = 6;
export const YOUTH_LEAVE_AGE = 19;
export const SCOUTED = [0, 2, 3, 4, 5, 6];

// Centre d'entraînement (training.js), selon son niveau (0 à 5) : gains d'une séance, séance collective après chaque
// match (part de la marge vers le potentiel), séances d'un programme de signe distinctif (dès le niveau 3).
export const TRAINING_MULT = [0, 1, 1.25, 1.5, 1.75, 2];
export const TRAINING_COLLECTIVE = [0, 0.01, 0.0125, 0.015, 0.0175, 0.02];
export const PROGRAM_STEPS = [0, 0, 0, 6, 5, 4];
// Épreuves : quatre de base, une par famille (gk : gardiens), puis une nouvelle à chaque niveau du centre (2 à 5),
// plus exigeante et plus payante (bonus sur le gain).
export const DRILLS = {
  precision: { family: 'tech', level: 1, bonus: 1, label: 'Précision' },
  sprint: { family: 'phys', level: 1, bonus: 1, label: 'Sprint et haies' },
  lecture: { family: 'tac', level: 1, bonus: 1, label: 'Lecture du jeu' },
  arrets: { family: 'gk', level: 1, bonus: 1, label: 'Arrêts réflexes' },
  coupsFrancs: { family: 'tech', level: 2, bonus: 1.2, label: 'Coups francs' },
  penalties: { family: 'gk', level: 3, bonus: 1.2, label: 'Penalties' },
  centres: { family: 'phys', level: 4, bonus: 1.2, label: 'Centres' },
  contre: { family: 'tac', level: 5, bonus: 1.2, label: 'Contre-attaque' },
};

// Coût du niveau N = baseCost × mult^(N − first) ; le stade est livré au niveau 1. `costs` fixe le prix de
// certains niveaux à la main (l'arène fermée des niveaux 5 et 6, au-delà de l'arène moderne).
export const BUILDINGS = {
  terrain: { name: 'Stade', max: 6, baseCost: 40000, mult: 10, first: 2, costs: { 5: 22000000, 6: 55000000 } },
  training: { name: 'Centre d’entraînement', max: 5, baseCost: 4000, mult: 6.2, first: 1 },
  academy: { name: 'Académie', max: 5, baseCost: 5000, mult: 6.2, first: 1 },
  fans: { name: 'Espace supporters', max: 5, baseCost: 3500, mult: 6.2, first: 1 },
  sponsor: { name: 'Siège & partenaires', max: 5, baseCost: 6000, mult: 6.2, first: 1 },
  transfers: { name: 'Bureau des transferts', max: 5, baseCost: 4500, mult: 6.2, first: 1 },
  direction: { name: 'Direction du club', max: 5, baseCost: 5500, mult: 6.2, first: 1 },
};

export const START_MONEY = 8000;
// Les salaires et l'entretien se paient par septième à chaque journée de championnat (plus de grosse note en fin de
// saison) : la trésorerie suit la vraie vie du club.
export const PAY_SPLIT = 7;

export function upgradeCost(key, targetLevel) {
  const b = BUILDINGS[key];
  if (b.costs?.[targetLevel]) return b.costs[targetLevel];
  return Math.round(b.baseCost * b.mult ** (targetLevel - b.first));
}
