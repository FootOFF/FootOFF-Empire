import { clamp } from './utils';

export const SAVE_KEY = 'footoff-empire-save-v1';

export const DIVISIONS = [
  { name: 'Départementale', oppMin: 5.2, oppMax: 7.4, ticket: 5, sponsorMult: 1.0, prize: 130 },
  { name: 'Régionale', oppMin: 7.6, oppMax: 9.8, ticket: 8, sponsorMult: 1.9, prize: 320 },
  { name: 'Nationale', oppMin: 10.0, oppMax: 12.2, ticket: 12, sponsorMult: 3.4, prize: 750 },
  { name: 'Elite', oppMin: 12.6, oppMax: 15.0, ticket: 18, sponsorMult: 5.8, prize: 1700 },
];

export const POS_LABELS = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', A: 'Attaquant' };
export const SQUAD_MAX = 18;
export const SQUAD_MIN = 11;

export const BUILDINGS = {
  terrain: { name: 'Stade', max: 4, baseCost: 900, mult: 2.7 },
  training: { name: 'Centre d’entraînement', max: 5, baseCost: 600, mult: 2.3 },
  academy: { name: 'Académie', max: 5, baseCost: 750, mult: 2.4 },
  fans: { name: 'Espace supporters', max: 5, baseCost: 500, mult: 2.2 },
  sponsor: { name: 'Siège & partenaires', max: 5, baseCost: 1000, mult: 2.5 },
};

export const OFFLINE_RATE = 16; // € par heure et par niveau de siège
export const OFFLINE_CAP = 12; // plafond d'heures comptées hors ligne

export function upgradeCost(key, targetLevel) {
  const b = BUILDINGS[key];
  return Math.round(b.baseCost * b.mult ** (targetLevel - 1));
}

export const capacity = (lvl) => 200 * 2 ** (lvl - 1);

export const fillRate = (rep, fansLvl) => clamp(0.35 + rep * 0.012 + fansLvl * 0.05, 0.2, 0.95);

export const sponsorIncome = (lvl, divIndex) => Math.round(220 * lvl * DIVISIONS[divIndex].sponsorMult);

export function buildingEffect(key, lvl, divIndex) {
  switch (key) {
    case 'terrain':
      return `Capacité d’accueil : ${capacity(lvl)} places.`;
    case 'training':
      return `Progression estivale des joueurs : +${lvl * 25} %.`;
    case 'academy':
      return lvl > 0
        ? 'Révèle un jeune talent à fort potentiel à chaque fin de saison.'
        : 'Aucune révélation de talent tant que l’académie n’est pas construite.';
    case 'fans':
      return `Remplissage du stade : +${lvl * 5} % · Réputation gagnée par match : +${lvl * 10} %.`;
    case 'sponsor':
      return `Sponsors : ${sponsorIncome(lvl, divIndex)} € par saison · ${OFFLINE_RATE * lvl} € par heure, même hors ligne.`;
    default:
      return '';
  }
}
