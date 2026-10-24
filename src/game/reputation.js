import { clamp } from './utils';

// Notoriété du club. La réputation ne ferme plus rien : toutes les parcelles sont ouvertes dès la fondation, et
// chaque bâtiment se pose où l'on veut. Elle attire, sans rien imposer : des bonus doux, comptés par rapport à
// la réputation de la fondation (5), qui grandissent avec elle à rendement décroissant :
//  - public au stade et dépenses à la boutique (repFactor, economy.js) ;
//  - contrats de sponsoring (×0,9 pour un club sans nom, jusqu'à ×1,25 environ pour une légende) ;
//  - mercato : les vendeurs écoutent plus volontiers un club réputé (quelques pour cent de moins sur le prix).
// Le statut du club (paliers nommés) suit la même échelle que les objectifs de saison (goals.js). Le détail
// affiché (repEffects) est dans economy.js, à côté de repFactor.

export const REP_START = 5;

// Une victoire rapporte selon la division (REP_DIVISION), et chaque intersaison efface une part de la notoriété
// (REP_DECAY) : un club de Départementale plafonne autour de 25, la légende (80) se bâtit par des titres en Elite.
export const REP_LEVELS = [
  { min: 0, name: 'Club de quartier' },
  { min: 6, name: 'Club qui monte' },
  { min: 12, name: 'Club régional' },
  { min: 25, name: 'Club national' },
  { min: 45, name: 'Grand club' },
  { min: 80, name: 'Club de légende' },
];
export const REP_DIVISION = [0.35, 0.55, 0.8, 1];
export const REP_DECAY = 0.12;

const reach = (rep) => Math.max(0, rep) / (Math.max(0, rep) + 15); // 0 → 1, rendement décroissant
const fromStart = (rep) => reach(rep) - reach(REP_START);

// Statut actuel, prochain palier et avancée vers lui (0 à 1).
export function repLevel(rep) {
  let i = 0;
  REP_LEVELS.forEach((l, k) => { if (rep >= l.min) i = k; });
  const level = REP_LEVELS[i];
  const next = REP_LEVELS[i + 1] || null;
  const progress = next ? clamp((rep - level.min) / (next.min - level.min), 0, 1) : 1;
  return { index: i, level, next, progress };
}

// Contrats de sponsoring : multiplicateur des revenus (1 à la fondation).
export const sponsorRep = (rep) => clamp(1 + 0.4 * fromStart(rep), 0.9, 1.3);

// Mercato : baisse du seuil d'acceptation des vendeurs (0,01 = 1 % du prix demandé ; négatif : plus dur).
export const mercatoRep = (rep) => clamp(0.08 * fromStart(rep), -0.02, 0.06);
