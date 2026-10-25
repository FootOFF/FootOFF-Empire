import {
  BUILDINGS, DIVISIONS, DRILLS, PAY_SPLIT, PROGRAM_STEPS, SCOUTED, TRAINING_COLLECTIVE, TRAINING_MULT, YOUTH_PLACES, upgradeCost,
} from './constants';
import { clamp, rnd } from './utils';
import { REP_START, mercatoRep, sponsorRep } from './reputation';
import { localTv, maxCut, tvPerMatch } from './direction';
import { treatPct } from './medical';

// Économie du club : affluence, recettes d'un match, revenus de saison, salaires, entretien.
// Ordres de grandeur réalistes, du football amateur (quelques centaines de spectateurs, budgets de
// quelques dizaines de milliers d'euros) à l'élite (stade de 38 000 places, budgets de plusieurs millions).
// Réglages validés par simulation de carrières sur 50 saisons (voir docs/ECONOMIE.md).

// Capacité du stade par niveau : terrain municipal, tribune couverte, stade 4 tribunes, arène moderne, puis
// l'arène fermée (deux étages, toit en selle) et sa version agrandie.
export const STADIUM_CAPACITY = [0, 600, 3500, 14000, 38000, 55000, 75000];
export const capacity = (lvl) => STADIUM_CAPACITY[clamp(lvl, 1, 6)];

// Politique tarifaire (inspecteur du stade) : prix du billet et effet sur le public. Quand le stade refuse du
// monde, des billets plus chers remplissent quand même l'enceinte et rapportent davantage.
export const TICKET_POLICIES = {
  popular: { id: 'popular', name: 'Populaire', price: 0.75, demand: 1.12, blurb: 'Billets à prix doux : plus de monde, ambiance garantie.' },
  standard: { id: 'standard', name: 'Normal', price: 1, demand: 1, blurb: 'Le tarif de la division.' },
  premium: { id: 'premium', name: 'Premium', price: 1.35, demand: 0.84, blurb: 'Plus cher : un peu moins de monde, plus de recettes si le stade est plein.' },
  prestige: { id: 'prestige', name: 'Prestige', price: 1.8, demand: 0.64, blurb: 'Places de luxe : rentable seulement quand la demande dépasse largement la capacité.' },
};
export const TICKET_ORDER = ['popular', 'standard', 'premium', 'prestige'];
export const policyOf = (s) => TICKET_POLICIES[s.ticketPolicy] || TICKET_POLICIES.standard;

// Soirées de coupe : plus de public, et la Coupe d'Europe se vend plus cher, avec ses droits TV européens.
export const COMP_GATE = {
  league: { demand: 1, ticket: 1, tv: 1 },
  cup: { demand: 1.15, ticket: 1.1, tv: 1.5 },
  c1: { demand: 1.55, ticket: 1.5, tv: 0 },
};
export const C1_TV = 1500000; // droits TV par match européen

// Loges et hospitalités : une part des places vendues très cher, dans les grands stades (niveau 3 et plus).
const LOGES_SHARE = [0, 0, 0, 0.012, 0.02, 0.025, 0.03];

// Notoriété : plus le club est réputé, plus il attire (rendement décroissant, plafonné à ×1,45).
export const repFactor = (rep) => 0.45 + Math.max(0, rep) / (Math.max(0, rep) + 12);

// Public potentiel d'un match à domicile, avant la limite de capacité.
export function demandFor(s, opp, comp = 'league') {
  const div = DIVISIONS[s.divisionIndex];
  const me = s.table?.[0];
  const form = me && me.played > 0 ? 0.9 + 0.2 * (me.pts / (3 * me.played)) : 1; // une équipe qui gagne attire
  const mid = (div.oppMin + div.oppMax) / 2;
  const oppF = opp ? 1 + 0.08 * clamp((opp.strength - mid) / ((div.oppMax - div.oppMin) / 2), -1, 1) : 1; // affiche
  const titles = Math.min(6, (s.trophies || []).length); // chaque trophée attire de nouveaux supporters
  return div.demand * repFactor(s.reputation) * (1 + 0.07 * s.buildings.fans) * form * oppF * (1 + titles * 0.03)
    * policyOf(s).demand * (COMP_GATE[comp] || COMP_GATE.league).demand;
}

// Dépense moyenne par spectateur (hors billet) : buvette et boutique, dopées par l'espace supporters.
export function spendPerHead(s) {
  const div = DIVISIONS[s.divisionIndex];
  const fans = s.buildings.fans;
  return { food: div.food * (1 + 0.1 * fans), shop: div.shop * (1 + 0.12 * fans) * repFactor(s.reputation) };
}

// Prix moyen d'un billet : tarif de la division × formule choisie (inspecteur du stade) × affiche de la compétition.
export const ticketPrice = (s, comp = 'league') => DIVISIONS[s.divisionIndex].ticket * policyOf(s).price * (COMP_GATE[comp] || COMP_GATE.league).ticket;

// Affluence et recettes d'un match à domicile.
export function matchGate(s, opp, noise = rnd(0.93, 1.07), comp = 'league') {
  const div = DIVISIONS[s.divisionIndex];
  const cg = COMP_GATE[comp] || COMP_GATE.league;
  const lvl = s.buildings.terrain;
  const cap = capacity(lvl);
  const demand = Math.round(demandFor(s, opp, comp) * noise);
  const attendance = Math.min(cap, demand);
  const per = spendPerHead(s);
  const ticket = ticketPrice(s, comp);
  const loges = Math.min(Math.round(cap * (LOGES_SHARE[clamp(lvl, 0, 6)] || 0)), Math.round(demand * 0.05));
  const breakdown = {
    billetterie: Math.round(attendance * ticket),
    buvette: Math.round(attendance * per.food),
    boutique: Math.round(attendance * per.shop),
    loges: Math.round(loges * div.ticket * cg.ticket * 10),
    tv: comp === 'c1' ? C1_TV : Math.round(tvPerMatch(s) * cg.tv), // droits TV : base, Direction du club, hausse négociée
  };
  const revenue = breakdown.billetterie + breakdown.buvette + breakdown.boutique + breakdown.loges + breakdown.tv;
  return { capacity: cap, demand, attendance, breakdown, revenue };
}

// Estimation sans aléa (avant-match, inspecteur du stade).
export const expectedGate = (s, opp, comp = 'league') => matchGate(s, opp, 1, comp);

// --- Revenus et charges de saison ---------------------------------------------------------------

// rep : réputation du club (les sponsors paient mieux un club réputé, reputation.js) ; celle de la fondation par défaut
export const sponsorIncome = (lvl, divIndex, rep = REP_START) => Math.round(DIVISIONS[divIndex].sponsor * (1 + 0.4 * lvl) * sponsorRep(rep));

// Ce que la notoriété apporte aujourd'hui, en écart par rapport à la fondation (panneau Notoriété).
export function repEffects(rep) {
  const crowd = repFactor(rep) / repFactor(REP_START) - 1;
  return { crowd, shop: crowd, sponsors: sponsorRep(rep) - 1, mercato: mercatoRep(rep) };
}

// Prime de classement : le champion touche la prime pleine, le dernier 10 %.
export const prizeFor = (position, divIndex) => Math.round(DIVISIONS[divIndex].prize * (0.1 + (0.9 * (8 - position)) / 7));

// Revenus hors ligne (siège & partenaires) : une part des contrats de sponsoring, par heure d'absence.
export const OFFLINE_CAP = 12; // heures comptées au maximum
export const offlinePerHour = (lvl, divIndex) => Math.round(DIVISIONS[divIndex].sponsor * 0.01 * lvl);

// Salaire annuel : il suit la note du joueur (×1,7 par point jusqu'à 13, puis ×1,55 : les stars de l'Elite coûtent
// vraiment cher, 2,9 M€ à 18, 7 M€ à 20) et la division du club (contrats de plus en plus professionnels).
export const WAGE_BASE = 800;
export const WAGE_DIVISION = [1, 2.7, 6.2, 10];
export function wageFor(rating, divIndex) {
  const r = Math.max(1, rating);
  const curve = 1.7 ** (Math.min(r, 13) - 6) * 1.55 ** Math.max(0, r - 13);
  return Math.round(WAGE_BASE * curve * WAGE_DIVISION[divIndex]);
}

// Prime à la signature d'un joueur libre : une saison de salaire (pas d'indemnité : c'est l'affaire du mercato).
export const signingFor = (wage) => Math.round(wage * 1.0);

// Entretien des installations : 4 % de ce qui a été investi dans les bâtiments, chaque saison.
export function investedIn(key, lvl) {
  let sum = 0;
  for (let l = key === 'terrain' ? 2 : 1; l <= lvl; l++) sum += upgradeCost(key, l);
  return sum;
}
export const upkeepOf = (s) => Math.round(Object.keys(BUILDINGS).reduce((a, k) => a + investedIn(k, s.buildings[k] || 0), 0) * 0.04);

// Prévision d'une saison complète (7 journées à domicile, deux tours de Coupe nationale, deux soirs de Coupe d'Europe
// quand on la joue, sponsors, prime de milieu de classement) : sert aux alertes de l'effectif quand la masse salariale
// devient trop lourde, et à la part des salaires affichée dans les Finances.
export function seasonForecast(s, wages) {
  const gate = expectedGate(s, null);
  const cups = expectedGate(s, null, 'cup').revenue * 2 + (s.c1 ? (expectedGate(s, null, 'c1').revenue) * 2 : 0);
  const income = gate.revenue * 7 + cups + sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation) + prizeFor(4, s.divisionIndex);
  const upkeep = upkeepOf(s);
  return { income, wages, upkeep, net: income - wages - upkeep, wageShare: wages / Math.max(1, income) };
}

// Prévision de fin de saison (écran Finances) : trésorerie actuelle, plus les matchs restants, les sponsors et
// la prime au classement actuel, moins les salaires et l'entretien qui tombent au coup de sifflet final.
// Les salaires et l'entretien se paient par septième à chaque journée (constants.js, PAY_SPLIT) : il ne reste à payer
// que la part des journées restantes.
export function endOfSeasonForecast(s, position, wages) {
  const left = Math.max(0, 7 - s.round);
  const perMatch = expectedGate(s, null).revenue;
  const matches = perMatch * left;
  const sponsors = sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation);
  const prize = prizeFor(position, s.divisionIndex);
  const upkeepAll = upkeepOf(s);
  const wagesLeft = Math.round((wages * left) / PAY_SPLIT);
  const upkeep = Math.round((upkeepAll * left) / PAY_SPLIT);
  return { left, perMatch, matches, sponsors, prize, wages: wagesLeft, wagesSeason: wages, upkeep, upkeepSeason: upkeepAll, end: s.money + matches + sponsors + prize - wagesLeft - upkeep };
}

// Ce que rapporte un niveau de plus (inspecteur) : recettes gagnées par saison (7 matchs et sponsors), entretien
// supplémentaire (4 % du coût), et nombre de saisons pour rentrer dans ses frais. Les bâtiments sportifs
// (entraînement, académie) ne rapportent pas directement : leur intérêt est sur le terrain.
// target : le niveau visé (le suivant par défaut ; un niveau plus lointain dans la fenêtre d'aperçu, comparé au
// niveau d'avant, comme si les précédents étaient construits).
export function investmentPreview(s, key, target = (s.buildings[key] || 0) + 1) {
  const cost = upgradeCost(key, target);
  const from = { ...s, buildings: { ...s.buildings, [key]: target - 1 } };
  const next = { ...s, buildings: { ...s.buildings, [key]: target } };
  const seasonIncome = (x) => expectedGate(x, null).revenue * 7 + sponsorIncome(x.buildings.sponsor, x.divisionIndex, x.reputation);
  const gain = seasonIncome(next) - seasonIncome(from);
  const upkeep = Math.round(cost * 0.04);
  const net = gain - upkeep;
  return { cost, gain, upkeep, net, payback: net > 0 ? cost / net : null, sporting: gain <= 0 };
}

// Bureau des transferts : joueurs sous contrat suivis par les recruteurs (aucun sans le bureau).
// Joueurs sous contrat sur le marché : quelques-uns listés publiquement par leurs clubs, beaucoup plus avec le réseau
// de recruteurs du Bureau des transferts.
export const officeSize = (lvl) => (lvl > 0 ? 8 + lvl * 4 : 4);

// Jeune repéré par l'académie de niveau a (refreshScouting, academy.js ; makePlayer, players.js) : niveau 3 + a +
// [0 ; 2] (+ 0,8 une fois ses qualités réparties), potentiel = départ + [5 ; 9] + a, plafonné à 20. Fourchettes
// arrondies, pour l'affichage.
export function academyTalent(a) {
  return { level: [Math.round(3.8 + a), Math.round(5.8 + a)], pot: [Math.min(20, 8 + 2 * a), Math.min(20, 14 + 2 * a)] };
}

// Incertitude sur le potentiel d'un joueur qu'on découvre (demi-largeur de la fourchette affichée, en points de
// note ; potentialRange, players.js) : les éducateurs d'une académie développée savent mieux juger.
export const scoutingError = (academyLvl = 0) => clamp(2.5 - 0.35 * academyLvl, 0.75, 3);
const dec = (v) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');
const dec2 = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR');

// Centre d'entraînement à un niveau (training.js) : épreuves ouvertes, la dernière débloquée.
const drillsAt = (lvl) => Object.values(DRILLS).filter((d) => d.level <= lvl);
const newDrill = (lvl) => Object.values(DRILLS).find((d) => d.level === lvl && lvl > 1);

// Famille d'un bâtiment (vitrine de construction) : ce qu'il apporte d'abord.
export const BUILDING_KIND = { terrain: 'Revenus', training: 'Sport', academy: 'Sport', fans: 'Revenus', sponsor: 'Revenus', transfers: 'Mercato', direction: 'Revenus', medical: 'Sport' };

// Effets d'un bâtiment à un niveau, en chiffres (vitrine et fenêtre d'aperçu) : le premier est l'effet phare, celui
// que montre la carte ; les suivants détaillent. Mêmes formules que buildingEffect.
export function buildingStats(key, lvl, s) {
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
  switch (key) {
    case 'terrain': {
      const loges = LOGES_SHARE[lvl] ? Math.round(capacity(lvl) * LOGES_SHARE[lvl]) : 0;
      return [
        { label: 'Places', value: fmt(capacity(lvl)), short: `${fmt(capacity(lvl))} places` },
        ...(loges ? [{ label: 'Places en loges', value: fmt(loges) }] : []),
      ];
    }
    case 'training': {
      const fresh = newDrill(lvl);
      return [
        { label: 'Progrès par séance', value: `×${dec2(TRAINING_MULT[lvl])}`, short: 'Séances entre les matchs', sub: 'quatre joueurs entre deux matchs' },
        { label: 'Épreuves en 3D', value: fmt(drillsAt(lvl).length), sub: fresh ? `nouvelle : ${fresh.label.toLowerCase()}` : 'une par catégorie' },
        { label: 'Séance collective', value: `${dec(TRAINING_COLLECTIVE[lvl] * 100)} %`, sub: 'de la marge de progrès, après chaque match' },
        { label: 'Programmes de signes', value: PROGRAM_STEPS[lvl] ? `${PROGRAM_STEPS[lvl]} séances` : 'au niveau 3', sub: 'un signe distinctif appris' },
      ];
    }
    case 'academy': {
      const t = academyTalent(lvl);
      return [
        { label: 'Potentiel des jeunes', value: `${t.pot[0]} à ${t.pot[1]}`, short: `Potentiel ${t.pot[0]} à ${t.pot[1]}` },
        { label: 'Jeunes repérés', value: fmt(SCOUTED[lvl]), sub: 'après chaque journée' },
        { label: 'Niveau à leur arrivée', value: `${t.level[0]} à ${t.level[1]}` },
        { label: 'Fourchette du potentiel', value: `${dec(2 * scoutingError(lvl))} points`, sub: 'plus étroite, mieux cernée' },
        { label: 'Équipe de jeunes', value: `${YOUTH_PLACES} places`, sub: 'recrutement gratuit, sans salaire' },
      ];
    }
    case 'fans':
      return [
        { label: 'Public', value: `+${lvl * 7} %`, short: `Public +${lvl * 7} %` },
        { label: 'Buvette', value: `+${lvl * 10} %` },
        { label: 'Boutique', value: `+${lvl * 12} %` },
        { label: 'Réputation par match', value: `+${lvl * 10} %` },
      ];
    case 'sponsor': {
      const year = sponsorIncome(lvl, s.divisionIndex, s.reputation);
      return [
        { label: 'Sponsors', value: `${fmt(year)} €`, short: `${fmt(year)} € / saison`, sub: 'par saison' },
        { label: 'Revenus hors ligne', value: `${fmt(offlinePerHour(lvl, s.divisionIndex))} €`, sub: 'par heure d’absence' },
      ];
    }
    case 'direction':
      return [
        { label: 'Droits TV', value: `+${lvl * 8} %`, short: `Droits TV +${lvl * 8} %`, sub: s && !DIVISIONS[s.divisionIndex].tv ? `télé locale : ${fmt(localTv(lvl))} € par match` : 'par match à domicile' },
        { label: 'Baisse de salaire', value: `jusqu’à ${Math.round(maxCut(lvl) * 100)} %`, sub: 'négociée joueur par joueur' },
        { label: 'Négociations', value: 'droits TV, salaires', sub: 'chances d’accord exactes' },
        { label: 'Billetterie', value: '4 formules', sub: 'recette prévue de chacune' },
      ];
    case 'medical':
      return [
        { label: 'Soin d’une blessure légère', value: `${treatPct(lvl, 1)} %`, short: `Soins réussis à ${treatPct(lvl, 1)} %`, sub: 'un match d’absence en moins' },
        { label: 'Soin d’une fracture', value: `${treatPct(lvl, 9)} %`, sub: 'neuf matchs d’absence' },
        { label: 'Risque de blessure', value: `−${lvl * 8} %`, sub: 'en match, grâce à la prévention' },
        { label: 'Coût d’un soin', value: '15 % du salaire', sub: 'annuel du joueur soigné' },
      ];
    case 'transfers':
      return [
        { label: 'Joueurs sous contrat', value: fmt(officeSize(lvl)), short: `${officeSize(lvl)} joueurs suivis`, sub: 'sur ton mercato' },
        { label: 'Indemnités', value: `−${lvl * 3} %` },
        { label: 'Vendeurs', value: 'plus conciliants' },
      ];
    default:
      return [];
  }
}

// Effet d'un bâtiment à un niveau donné (inspecteur).
export function buildingEffect(key, lvl, divIndex, rep = REP_START) {
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
  switch (key) {
    case 'terrain':
      return `Capacité d’accueil : ${fmt(capacity(lvl))} places${LOGES_SHARE[lvl] ? ` · ${fmt(Math.round(capacity(lvl) * LOGES_SHARE[lvl]))} places en loges` : ''}.`;
    case 'training':
      return lvl > 0
        ? `Séances entre les matchs : progrès ×${dec2(TRAINING_MULT[lvl])} · ${drillsAt(lvl).length} épreuves en 3D · séance collective après chaque match${PROGRAM_STEPS[lvl] ? ` · signes distinctifs appris en ${PROGRAM_STEPS[lvl]} séances` : ''}.`
        : 'Pas de séances d’entraînement tant que le centre n’est pas construit.';
    case 'academy': {
      if (lvl <= 0) return 'Pas d’équipe de jeunes tant que l’académie n’est pas construite.';
      const t = academyTalent(lvl);
      return `Équipe de jeunes de ${YOUTH_PLACES} places · ${SCOUTED[lvl]} jeunes repérés après chaque journée : niveau ${t.level[0]} à ${t.level[1]}, potentiel ${t.pot[0]} à ${t.pot[1]}, cerné à ${dec(2 * scoutingError(lvl))} points près.`;
    }
    case 'fans':
      return `Public attiré : +${lvl * 7} % · Buvette +${lvl * 10} %, boutique +${lvl * 12} % · Réputation par match : +${lvl * 10} %.`;
    case 'direction':
      return lvl > 0
        ? `Négociations du club : droits TV +${lvl * 8} %${DIVISIONS[divIndex].tv ? '' : ` (télé locale : ${fmt(localTv(lvl))} € par match)`}, hausse à demander chaque saison · baisses de salaire jusqu’à ${Math.round(maxCut(lvl) * 100)} % · formule des billets.`
        : 'Pas de négociations tant que la Direction du club n’est pas construite.';
    case 'medical':
      return lvl > 0
        ? `Soins des blessés : un par joueur et par date, réussis à ${treatPct(lvl, 1)} % pour une blessure légère, ${treatPct(lvl, 9)} % pour une fracture · risque de blessure en match −${lvl * 8} %.`
        : 'Pas de soins tant que le centre médical n’est pas construit : un blessé attend sa guérison.';
    case 'transfers':
      return lvl > 0
        ? `Réseau de recruteurs : ${officeSize(lvl)} joueurs sous contrat sur ton mercato · indemnités −${lvl * 3} % · vendeurs plus conciliants · potentiel mieux cerné.`
        : `Sans bureau, ton mercato ne montre que ${officeSize(0)} joueurs sous contrat listés publiquement, en plus des joueurs libres.`;
    case 'sponsor':
      return `Sponsors : ${fmt(sponsorIncome(lvl, divIndex, rep))} € par saison · ${fmt(offlinePerHour(lvl, divIndex))} € par heure, même hors ligne.`;
    default:
      return '';
  }
}
