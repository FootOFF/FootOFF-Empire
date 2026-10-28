export const SAVE_KEY = 'footoff-empire-save-v1';

// Divisions : niveau des adversaires, prix du billet, dépense par spectateur (buvette, boutique),
// public potentiel, droits TV par match de championnat, sponsoring de base et prime du champion (en euros).
// L'Élite joue à l'échelle d'un grand championnat européen depuis la 0.6.0 (droits TV, sponsors et primes de plusieurs
// millions, salaires et valeurs des joueurs ×4 : economy.js) ; les petites divisions gardent des budgets modestes.
// Niveau des adversaires (oppMin à oppMax, répartis dans la division) : chaque division commence un peu au-dessus de
// la précédente, et le haut de l'Élite (17,0) reste un défi pour un onze arrivé au sommet (18 au plus, en pratique).
export const DIVISIONS = [
  { name: 'Départementale', oppMin: 5.0, oppMax: 7.4, ticket: 6, food: 2, shop: 1, demand: 650, tv: 0, sponsor: 5000, prize: 6000 },
  { name: 'Régionale', oppMin: 7.6, oppMax: 10.0, ticket: 10, food: 3, shop: 2, demand: 3800, tv: 4000, sponsor: 35000, prize: 40000 },
  { name: 'Nationale', oppMin: 10.2, oppMax: 12.8, ticket: 16, food: 4, shop: 3.5, demand: 15000, tv: 45000, sponsor: 220000, prize: 300000 },
  { name: 'Élite', oppMin: 13.4, oppMax: 17.0, ticket: 40, food: 7, shop: 9, demand: 40000, tv: 1800000, sponsor: 8000000, prize: 6400000 },
];

export const POS_LABELS = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', A: 'Attaquant' };
export const SQUAD_MAX = 25; // effectif professionnel : de quoi tourner sur le championnat et les coupes
export const SQUAD_MIN = 13; // jamais moins (0.8.4) : ventes refusées à 13, un jeune de l'académie monte d'office en dessous (squadFloor.js)

// Académie (academy.js) : six places dans l'équipe de jeunes, départ à 19 ans sans montée en équipe première,
// jeunes repérés après chaque journée de championnat selon le niveau de l'académie (0 à 5). Rééquilibré en 0.5.0 :
// 2 à 6 jeunes par journée, presque tous au potentiel de 18 à 20 au niveau 5, faisaient une équipe de prodiges.
export const YOUTH_PLACES = 6;
export const YOUTH_LEAVE_AGE = 19;
export const SCOUTED = [0, 1, 1, 2, 2, 2];
// Tirage d'un jeune repéré (players.js, makePlayer) : centre = base + perLevel × académie + U(0, spread) + perAge × (âge
// − 15), niveau à l'arrivée = centre + 0,8 (± 0,3) ; potentiel = centre + potBase + potPerLevel × académie + potTail × U³
// (rarement très haut), arrondi, de 8 à 20. Au niveau 5, sur une saison (16 jeunes repérés : 2 au début de la saison et
// après chacune des 7 journées, toutes les deux en Élite) : environ 4 potentiels de 16 ou plus, 1,7 de 18 ou plus, 0,8 de 19 ou plus, et un 20
// toutes les cinq à six saisons.
export const YOUTH_GEN = { base: 2.2, perLevel: 0.55, spread: 1.6, perAge: 0.5, potBase: 4.2, potPerLevel: 0.4, potTail: 7 };

// Centre d'entraînement (training.js), selon son niveau (0 à 5) : gains d'une séance, séance collective après chaque
// match (part de la marge vers le potentiel), séances d'un programme de signe distinctif (dès le niveau 3).
export const TRAINING_MULT = [0, 1, 1.15, 1.3, 1.45, 1.6];
export const TRAINING_COLLECTIVE = [0, 0.004, 0.005, 0.006, 0.007, 0.008];
export const PROGRAM_STEPS = [0, 0, 0, 6, 5, 4];
// Épreuves : quatre de base, une par famille (gk : gardiens), puis une nouvelle à chaque niveau du centre (2 à 5),
// plus exigeante et plus payante (bonus sur le gain).
export const DRILLS = {
  precision: { family: 'tech', level: 1, bonus: 1, label: 'Précision' },
  sprint: { family: 'phys', level: 1, bonus: 1, label: 'Sprint et haies' },
  lecture: { family: 'tac', level: 1, bonus: 1, label: 'Lecture du jeu' },
  arrets: { family: 'gk', level: 1, bonus: 1, label: 'Arrêts réflexes' },
  coupsFrancs: { family: 'tech', level: 2, bonus: 1.1, label: 'Coups francs' },
  penalties: { family: 'gk', level: 3, bonus: 1.1, label: 'Penalties' },
  centres: { family: 'phys', level: 4, bonus: 1.1, label: 'Centres' },
  contre: { family: 'tac', level: 5, bonus: 1.1, label: 'Contre-attaque' },
};

// Coût du niveau N = baseCost × mult^(N − first) ; le stade est livré au niveau 1. `costs` fixe le prix de
// certains niveaux à la main (l'arène fermée des niveaux 5 et 6, au-delà de l'arène moderne : un chantier d'Élite,
// 22 et 55 M€ avant la 0.6.0).
export const BUILDINGS = {
  terrain: { name: 'Stade', max: 6, baseCost: 40000, mult: 10, first: 2, costs: { 5: 55000000, 6: 140000000 } },
  training: { name: 'Centre d’entraînement', max: 5, baseCost: 4000, mult: 6.2, first: 1 },
  academy: { name: 'Académie', max: 5, baseCost: 5000, mult: 6.2, first: 1 },
  fans: { name: 'Espace supporters', max: 5, baseCost: 3500, mult: 6.2, first: 1 },
  sponsor: { name: 'Siège & partenaires', max: 5, baseCost: 6000, mult: 6.2, first: 1 },
  transfers: { name: 'Bureau des transferts', max: 5, baseCost: 4500, mult: 6.2, first: 1 },
  direction: { name: 'Direction du club', max: 5, baseCost: 5500, mult: 6.2, first: 1 },
  medical: { name: 'Centre médical', max: 5, baseCost: 4500, mult: 6.2, first: 1 },
  // Siège de la Ligue (0.8.0) : un seul niveau, 60 M€, en Élite seulement (map.js) ; il ouvre les championnats entre
  // amis (league.js), un monde à part de la carrière : il ne rapporte rien et ne coûte aucun entretien (economy.js).
  league: { name: 'Siège de la Ligue', max: 1, baseCost: 60000000, mult: 1, first: 1 },
};
// Division d'une partie pour l'écran : une partie de championnat entre amis (leagueClub.js) porte le nom de sa ligue,
// avec l'échelle économique de son niveau.
export const divisionOf = (s) => (s.league ? { ...DIVISIONS[s.divisionIndex], name: s.league.name } : DIVISIONS[s.divisionIndex]);
// Championnats entre amis : ouverts au public depuis la 0.8.3 (2026-10-28, demande du PDG ; serveur des ligues en service,
// mercato immédiat déposé). Faux : le Siège ne se propose plus et seuls les essais en développement y accèdent.
export const LEAGUE_OPEN = true;

export const START_MONEY = 8000;
// Échelle de l'argent en Élite depuis la 0.6.0 (×4 : salaires, valeurs, recettes) : les parties commencées avant
// et déjà en Élite y sont portées une fois (save.js).
export const ELITE_SCALE = 4;
// Les salaires et l'entretien se paient à chaque journée de championnat (un septième de la saison, un quatorzième en
// Élite ; season.js) : pas de grosse note en fin de saison, la trésorerie suit la vraie vie du club.

export function upgradeCost(key, targetLevel) {
  const b = BUILDINGS[key];
  if (b.costs?.[targetLevel]) return b.costs[targetLevel];
  return Math.round(b.baseCost * b.mult ** (targetLevel - b.first));
}
