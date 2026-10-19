import { BUILDINGS, DIVISIONS, upgradeCost } from './constants';
import { clamp, rnd } from './utils';

// Économie du club : affluence, recettes d'un match, revenus de saison, salaires, entretien.
// Ordres de grandeur réalistes, du football amateur (quelques centaines de spectateurs, budgets de
// quelques dizaines de milliers d'euros) à l'élite (stade de 38 000 places, budgets de plusieurs millions).
// Réglages validés par simulation de carrières sur 50 saisons (voir docs/ECONOMIE.md).

// Capacité du stade par niveau : terrain municipal, tribune couverte, stade 4 tribunes, arène moderne.
export const STADIUM_CAPACITY = [0, 600, 3500, 14000, 38000];
export const capacity = (lvl) => STADIUM_CAPACITY[clamp(lvl, 1, 4)];

// Notoriété : plus le club est réputé, plus il attire (rendement décroissant, plafonné à ×1,45).
export const repFactor = (rep) => 0.45 + Math.max(0, rep) / (Math.max(0, rep) + 12);

// Public potentiel d'un match à domicile, avant la limite de capacité.
export function demandFor(s, opp) {
  const div = DIVISIONS[s.divisionIndex];
  const me = s.table?.[0];
  const form = me && me.played > 0 ? 0.9 + 0.2 * (me.pts / (3 * me.played)) : 1; // une équipe qui gagne attire
  const mid = (div.oppMin + div.oppMax) / 2;
  const oppF = opp ? 1 + 0.08 * clamp((opp.strength - mid) / ((div.oppMax - div.oppMin) / 2), -1, 1) : 1; // affiche
  return div.demand * repFactor(s.reputation) * (1 + 0.07 * s.buildings.fans) * form * oppF;
}

// Dépense moyenne par spectateur (hors billet) : buvette et boutique, dopées par l'espace supporters.
export function spendPerHead(s) {
  const div = DIVISIONS[s.divisionIndex];
  const fans = s.buildings.fans;
  return { food: div.food * (1 + 0.1 * fans), shop: div.shop * (1 + 0.12 * fans) * repFactor(s.reputation) };
}

// Affluence et recettes d'un match à domicile.
export function matchGate(s, opp, noise = rnd(0.93, 1.07)) {
  const div = DIVISIONS[s.divisionIndex];
  const cap = capacity(s.buildings.terrain);
  const demand = Math.round(demandFor(s, opp) * noise);
  const attendance = Math.min(cap, demand);
  const per = spendPerHead(s);
  const breakdown = {
    billetterie: Math.round(attendance * div.ticket),
    buvette: Math.round(attendance * per.food),
    boutique: Math.round(attendance * per.shop),
    tv: div.tv,
  };
  const revenue = breakdown.billetterie + breakdown.buvette + breakdown.boutique + breakdown.tv;
  return { capacity: cap, demand, attendance, breakdown, revenue };
}

// Estimation sans aléa (avant-match, inspecteur du stade).
export const expectedGate = (s, opp) => matchGate(s, opp, 1);

// --- Revenus et charges de saison ---------------------------------------------------------------

export const sponsorIncome = (lvl, divIndex) => Math.round(DIVISIONS[divIndex].sponsor * (1 + 0.4 * lvl));

// Prime de classement : le champion touche la prime pleine, le dernier 10 %.
export const prizeFor = (position, divIndex) => Math.round(DIVISIONS[divIndex].prize * (0.1 + (0.9 * (8 - position)) / 7));

// Revenus hors ligne (siège & partenaires) : une part des contrats de sponsoring, par heure d'absence.
export const OFFLINE_CAP = 12; // heures comptées au maximum
export const offlinePerHour = (lvl, divIndex) => Math.round(DIVISIONS[divIndex].sponsor * 0.01 * lvl);

// Salaire annuel : il suit la note du joueur (×1,7 par point jusqu'à 13, puis ×1,35 : au sommet, les
// écarts de talent coûtent moins cher) et la division du club (contrats de plus en plus professionnels).
export const WAGE_BASE = 800;
export const WAGE_DIVISION = [1, 2.7, 6.2, 10];
export function wageFor(rating, divIndex) {
  const r = Math.max(1, rating);
  const curve = 1.7 ** (Math.min(r, 13) - 6) * 1.35 ** Math.max(0, r - 13);
  return Math.round(WAGE_BASE * curve * WAGE_DIVISION[divIndex]);
}

// Prime à la signature d'un joueur libre : une saison et demie de salaire.
export const signingFor = (wage) => Math.round(wage * 1.5);

// Valeur de revente : un peu plus d'une saison de salaire. Acheter puis revendre aussitôt fait perdre
// de l'argent ; former un jeune et le revendre une fois progressé en rapporte.
export const saleFor = (wage) => Math.round(wage * 1.2);

// Entretien des installations : 4 % de ce qui a été investi dans les bâtiments, chaque saison.
export function investedIn(key, lvl) {
  let sum = 0;
  for (let l = key === 'terrain' ? 2 : 1; l <= lvl; l++) sum += upgradeCost(key, l);
  return sum;
}
export const upkeepOf = (s) => Math.round(Object.keys(BUILDINGS).reduce((a, k) => a + investedIn(k, s.buildings[k] || 0), 0) * 0.04);

// Prévision d'une saison complète (7 matchs à domicile, milieu de classement) : sert aux alertes
// de l'effectif quand la masse salariale devient trop lourde.
export function seasonForecast(s, wages) {
  const gate = expectedGate(s, null);
  const income = gate.revenue * 7 + sponsorIncome(s.buildings.sponsor, s.divisionIndex) + prizeFor(4, s.divisionIndex);
  const upkeep = upkeepOf(s);
  return { income, wages, upkeep, net: income - wages - upkeep, wageShare: wages / Math.max(1, income) };
}

// Effet d'un bâtiment à un niveau donné (inspecteur).
export function buildingEffect(key, lvl, divIndex) {
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
  switch (key) {
    case 'terrain':
      return `Capacité d’accueil : ${fmt(capacity(lvl))} places.`;
    case 'training':
      return `Progression estivale des joueurs : +${lvl * 25} %.`;
    case 'academy':
      return lvl > 0
        ? 'Révèle un jeune talent à fort potentiel à chaque fin de saison.'
        : 'Aucune révélation de talent tant que l’académie n’est pas construite.';
    case 'fans':
      return `Public attiré : +${lvl * 7} % · Buvette +${lvl * 10} %, boutique +${lvl * 12} % · Réputation par match : +${lvl * 10} %.`;
    case 'sponsor':
      return `Sponsors : ${fmt(sponsorIncome(lvl, divIndex))} € par saison · ${fmt(offlinePerHour(lvl, divIndex))} € par heure, même hors ligne.`;
    default:
      return '';
  }
}
