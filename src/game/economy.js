import {
  BUILDINGS, DIVISIONS, DRILLS, PROGRAM_STEPS, SCOUTED, TRAINING_COLLECTIVE, TRAINING_MULT, YOUTH_GEN, YOUTH_PLACES, upgradeCost,
} from './constants';
import { clamp, rnd } from './utils';
import { isAwayRound, leagueLength } from './cups';
import { REP_START, mercatoRep, sponsorRep } from './reputation';
import { localTv, tvPerMatch } from './direction';
import { eur, LANG, numLocale, t } from '../i18n/index';

// Direction du club : chaque niveau baisse de 2 % les exigences de salaire des joueurs (contracts.js).
export const DIRECTION_EASE = 2;
import { treatPct } from './medical';

// Économie du club : affluence, recettes d'un match, revenus de saison, salaires, entretien.
// Ordres de grandeur réalistes, du football amateur (quelques centaines de spectateurs, budgets de
// quelques dizaines de milliers d'euros) à l'élite (stades de 38 000 à 75 000 places, budgets de plus de cent millions,
// droits TV et sponsors d'abord, comme les grands clubs européens).
// Réglages validés par simulation de carrières sur 50 saisons (voir docs/ECONOMIE.md).

// Capacité du stade par niveau : terrain municipal, tribune couverte, stade 4 tribunes, arène moderne, puis
// l'arène fermée (deux étages, toit en selle) et sa version agrandie.
export const STADIUM_CAPACITY = [0, 600, 3500, 14000, 38000, 55000, 75000];
export const capacity = (lvl) => STADIUM_CAPACITY[clamp(lvl, 1, 6)];

// Politique tarifaire (inspecteur du stade) : prix du billet et effet sur le public. Quand le stade refuse du
// monde, des billets plus chers remplissent quand même l'enceinte et rapportent davantage.
export const TICKET_POLICIES = {
  popular: { id: 'popular', name: t('Populaire'), price: 0.75, demand: 1.12, blurb: t('Billets à prix doux : plus de monde, ambiance garantie.') },
  standard: { id: 'standard', name: t('Normal'), price: 1, demand: 1, blurb: t('Le tarif de la division.') },
  premium: { id: 'premium', name: t('Premium'), price: 1.35, demand: 0.84, blurb: t('Plus cher : un peu moins de monde, plus de recettes si le stade est plein.') },
  prestige: { id: 'prestige', name: t('Prestige'), price: 1.8, demand: 0.64, blurb: t('Places de luxe : rentable seulement quand la demande dépasse largement la capacité.') },
};
export const TICKET_ORDER = ['popular', 'standard', 'premium', 'prestige'];
export const policyOf = (s) => TICKET_POLICIES[s.ticketPolicy] || TICKET_POLICIES.standard;

// Soirées de coupe : plus de public, et la Coupe d'Europe se vend plus cher, avec ses droits TV européens.
export const COMP_GATE = {
  league: { demand: 1, ticket: 1, tv: 1 },
  cup: { demand: 1.15, ticket: 1.1, tv: 1.5 },
  c1: { demand: 1.55, ticket: 1.5, tv: 0 },
};
export const C1_TV = 5000000; // droits TV par match européen (1,5 M€ avant la 0.6.0)

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

// Droits TV d'un match : base de la division (par match de championnat ; en Élite, à domicile comme à l'extérieur),
// Direction du club et hausse négociée (direction.js), plus en coupe.
export const tvOfMatch = (s, comp = 'league') => (comp === 'c1' ? C1_TV : Math.round(tvPerMatch(s) * (COMP_GATE[comp] || COMP_GATE.league).tv));

// Match à l'extérieur (Élite) : pas de billetterie, de buvette ni de boutique, seulement les droits TV.
export function awayGate(s) {
  const tv = tvOfMatch(s, 'league');
  return { capacity: 0, demand: 0, attendance: 0, away: true, breakdown: { billetterie: 0, buvette: 0, boutique: 0, loges: 0, tv }, revenue: tv };
}

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
    tv: tvOfMatch(s, comp),
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

// Revenus hors ligne (siège & partenaires) : par niveau du siège et par heure d'absence, selon la division (le centième
// des sponsors de base d'avant la 0.6.0 : l'Élite en reçoit quatre fois plus, comme le reste de ses comptes).
export const OFFLINE_CAP = 12; // heures comptées au maximum
const OFFLINE_BASE = [50, 350, 2200, 40000];
export const offlinePerHour = (lvl, divIndex) => Math.round(OFFLINE_BASE[divIndex] * lvl);

// Salaire annuel : il suit la note du joueur (×1,7 par point jusqu'à 13, puis ×1,55) et la division du club (contrats
// de plus en plus professionnels). En Élite, à l'échelle d'un grand championnat depuis la 0.6.0 (×4) : 1,3 M€ à 13,
// 4,9 M€ à 16, 11,8 M€ à 18, 28 M€ à 20 ; en Nationale, 200 000 € à 13.
export const WAGE_BASE = 800;
export const WAGE_DIVISION = [1, 2.7, 6.2, 40];
export function wageFor(rating, divIndex) {
  const r = Math.max(1, rating);
  const curve = 1.7 ** (Math.min(r, 13) - 6) * 1.55 ** Math.max(0, r - 13);
  return Math.round(WAGE_BASE * curve * WAGE_DIVISION[divIndex]);
}

// Prime à la signature d'un joueur libre : 70 % de sa valeur de marché (pas d'indemnité : il n'a pas de club). Une
// saison de salaire avant la 0.5.0, soit 0,38 fois sa valeur : racheté puis revendu, il rapportait 1,5 à 2 fois son prix.
export const FREE_AGENT_SHARE = 0.7;
export const signingFor = (value) => Math.round(value * FREE_AGENT_SHARE);

// Entretien des installations : 4 % de ce qui a été investi dans les bâtiments, chaque saison.
export function investedIn(key, lvl) {
  let sum = 0;
  for (let l = key === 'terrain' ? 2 : 1; l <= lvl; l++) sum += upgradeCost(key, l);
  return sum;
}
// Entretien : 4 % de l'investissement par saison ; le Siège de la Ligue n'en coûte pas (monde à part de la carrière).
export const upkeepOf = (s) => Math.round(Object.keys(BUILDINGS).filter((k) => k !== 'league').reduce((a, k) => a + investedIn(k, s.buildings[k] || 0), 0) * 0.04);

// Recettes de championnat d'une saison : billetterie, buvette, boutique et loges des matchs à domicile (sept, en Élite
// comme ailleurs), droits TV de toutes les journées.
export function leagueSeasonGate(s) {
  const gate = expectedGate(s, null);
  const len = leagueLength(s);
  const homes = len - (s.away ? s.away.filter(Boolean).length : 0);
  return (gate.revenue - gate.breakdown.tv) * homes + gate.breakdown.tv * len;
}

// Prévision d'une saison complète (championnat, deux tours de Coupe nationale, deux soirs de Coupe d'Europe quand on la
// joue, sponsors, prime de milieu de classement) : sert aux alertes de l'effectif quand la masse salariale devient trop
// lourde, et à la part des salaires affichée dans les Finances.
export function seasonForecast(s, wages) {
  const cups = expectedGate(s, null, 'cup').revenue * 2 + (s.c1 ? (expectedGate(s, null, 'c1').revenue) * 2 : 0);
  const income = leagueSeasonGate(s) + cups + sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation) + prizeFor(4, s.divisionIndex);
  const upkeep = upkeepOf(s);
  return { income, wages, upkeep, net: income - wages - upkeep, wageShare: wages / Math.max(1, income) };
}

// Salaires et entretien (0.8.8) : chaque journée de championnat en ajoute sa part (un septième, un quatorzième en Élite)
// à ce que le club doit, payé en une fois au bilan de la saison (season.js). s.dues : ce qui est déjà dû { wages, upkeep }.
// Un joueur ne coûte donc que les journées passées au club, et une recrue de mars ne paie pas une saison entière.
export function accrueDues(s, wages, upkeep) {
  const d = s.dues || (s.dues = { wages: 0, upkeep: 0 });
  d.wages += wages;
  d.upkeep += upkeep;
}

// À payer en fin de saison (total) : le dû, plus la part des journées restantes au train de vie actuel (wages : la masse
// salariale d'une saison). Réellement disponible (available) : la caisse moins ce qui est déjà dû aux joueurs et pour
// l'entretien ; les journées à venir se paieront avec leurs recettes.
export function duesOf(s, wages) {
  const len = leagueLength(s);
  const left = Math.max(0, len - s.round);
  const owed = s.dues || { wages: 0, upkeep: 0 };
  const w = owed.wages + Math.round((wages * left) / len);
  const u = owed.upkeep + Math.round((upkeepOf(s) * left) / len);
  return { wages: w, upkeep: u, total: w + u, owed: owed.wages + owed.upkeep, left, len, available: s.money - owed.wages - owed.upkeep };
}

// Prévision de fin de saison (écran Finances) : trésorerie actuelle, plus les matchs restants, les sponsors (s'ils ne
// sont pas déjà payés : depuis la 0.6.0, ils le sont à la reprise, season.js) et la prime au classement actuel, moins
// les salaires et l'entretien à payer au bilan (duesOf). Un match à l'extérieur ne rapporte que ses droits TV.
export function endOfSeasonForecast(s, position, wages) {
  const len = leagueLength(s);
  const left = Math.max(0, len - s.round);
  const perMatch = expectedGate(s, null).revenue;
  let matches = 0;
  let homes = 0;
  for (let r = s.round; r < len; r++) {
    if (isAwayRound(s, r)) matches += awayGate(s).revenue;
    else { matches += perMatch; homes += 1; }
  }
  const sponsorsPaid = s.sponsorsPaid === s.seasonNumber;
  const sponsors = sponsorsPaid ? 0 : sponsorIncome(s.buildings.sponsor, s.divisionIndex, s.reputation);
  const prize = prizeFor(position, s.divisionIndex);
  const due = duesOf(s, wages);
  return {
    left, homes, len, perMatch, matches, sponsors, sponsorsPaid, prize, wages: due.wages, wagesSeason: wages, upkeep: due.upkeep, upkeepSeason: upkeepOf(s),
    due: due.total, owed: due.owed, available: due.available, end: s.money + matches + sponsors + prize - due.total,
  };
}

// Ce que rapporte un niveau de plus (inspecteur) : recettes gagnées par saison (championnat et sponsors), entretien
// supplémentaire (4 % du coût), et nombre de saisons pour rentrer dans ses frais. Les bâtiments sportifs
// (entraînement, académie) ne rapportent pas directement : leur intérêt est sur le terrain.
// target : le niveau visé (le suivant par défaut ; un niveau plus lointain dans la fenêtre d'aperçu, comparé au
// niveau d'avant, comme si les précédents étaient construits).
export function investmentPreview(s, key, target = (s.buildings[key] || 0) + 1) {
  const cost = upgradeCost(key, target);
  const from = { ...s, buildings: { ...s.buildings, [key]: target - 1 } };
  const next = { ...s, buildings: { ...s.buildings, [key]: target } };
  const seasonIncome = (x) => leagueSeasonGate(x) + sponsorIncome(x.buildings.sponsor, x.divisionIndex, x.reputation);
  const gain = seasonIncome(next) - seasonIncome(from);
  const upkeep = key === 'league' ? 0 : Math.round(cost * 0.04);
  const net = gain - upkeep;
  return { cost, gain, upkeep, net, payback: net > 0 ? cost / net : null, sporting: gain <= 0 };
}

// Bureau des transferts : joueurs sous contrat suivis par les recruteurs (aucun sans le bureau).
// Joueurs sous contrat sur le marché : quelques-uns listés publiquement par leurs clubs, beaucoup plus avec le réseau
// de recruteurs du Bureau des transferts.
export const officeSize = (lvl) => (lvl > 0 ? 8 + lvl * 4 : 4);

// Jeune repéré par l'académie de niveau a (refreshScouting, academy.js ; makePlayer, players.js ; YOUTH_GEN,
// constants.js). Fourchettes affichées, calculées sur une grille régulière de tirages de la même formule : le niveau à
// l'arrivée de neuf jeunes sur dix (level), le potentiel de huit sur dix (pot) et celui qu'environ un jeune sur cent
// atteint ou dépasse (top).
const talentCache = new Map();
export function academyTalent(a) {
  if (talentCache.has(a)) return talentCache.get(a);
  const g = YOUTH_GEN;
  const grid = (n) => Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  const level = [];
  const pot = [];
  for (const u of grid(40)) {
    for (const years of [0, 1, 2]) {
      const center = g.base + g.perLevel * a + g.spread * u + g.perAge * years;
      for (const j of grid(5)) level.push(center + 0.8 + 0.6 * (j - 0.5));
      for (const t of grid(40)) pot.push(clamp(Math.round(center + g.potBase + g.potPerLevel * a + g.potTail * t ** 3), 8, 20));
    }
  }
  level.sort((x, y) => x - y);
  pot.sort((x, y) => x - y);
  const at = (arr, f) => arr[Math.floor(f * (arr.length - 1))];
  const t = {
    level: [Math.round(at(level, 0.05)), Math.round(at(level, 0.95))],
    pot: [at(pot, 0.1), at(pot, 0.9)],
    top: at(pot, 0.99),
  };
  talentCache.set(a, t);
  return t;
}

// Incertitude sur le potentiel d'un joueur qu'on découvre (demi-largeur de la fourchette affichée, en points de
// note ; potentialRange, players.js) : les éducateurs d'une académie développée savent mieux juger.
export const scoutingError = (academyLvl = 0) => clamp(2.5 - 0.35 * academyLvl, 0.75, 3);
const dec = (v) => (Math.round(v * 10) / 10).toLocaleString(numLocale());
const dec2 = (v) => (Math.round(v * 100) / 100).toLocaleString(numLocale());

// Centre d'entraînement à un niveau (training.js) : épreuves ouvertes, la dernière débloquée.
const drillsAt = (lvl) => Object.values(DRILLS).filter((d) => d.level <= lvl);
const newDrill = (lvl) => Object.values(DRILLS).find((d) => d.level === lvl && lvl > 1);

// Famille d'un bâtiment (vitrine de construction) : ce qu'il apporte d'abord.
export const BUILDING_KIND = { terrain: t('Revenus'), training: t('Sport'), academy: t('Sport'), fans: t('Revenus'), sponsor: t('Revenus'), transfers: t('Mercato'), direction: t('Revenus'), medical: t('Sport'), league: t('Prestige') };

// Effets d'un bâtiment à un niveau, en chiffres (vitrine et fenêtre d'aperçu) : le premier est l'effet phare, celui
// que montre la carte ; les suivants détaillent. Mêmes formules que buildingEffect.
export function buildingStats(key, lvl, s) {
  const fmt = (n) => new Intl.NumberFormat(numLocale()).format(n);
  switch (key) {
    case 'terrain': {
      const loges = LOGES_SHARE[lvl] ? Math.round(capacity(lvl) * LOGES_SHARE[lvl]) : 0;
      return [
        { label: t('Places'), value: fmt(capacity(lvl)), short: t('{fmt} places', { fmt: fmt(capacity(lvl)) }) },
        ...(loges ? [{ label: t('Places en loges'), value: fmt(loges) }] : []),
      ];
    }
    case 'training': {
      const fresh = newDrill(lvl);
      return [
        { label: t('Progrès par séance'), value: `×${dec2(TRAINING_MULT[lvl])}`, short: t('Séances entre les matchs'), sub: t('quatre joueurs entre deux matchs') },
        { label: t('Épreuves en 3D'), value: fmt(drillsAt(lvl).length), sub: fresh ? t('nouvelle : {toLowerCase}', { toLowerCase: fresh.label.toLowerCase() }) : t('une par catégorie') },
        { label: t('Séance collective'), value: `${dec(TRAINING_COLLECTIVE[lvl] * 100)} %`, sub: t('de la marge de progrès, après chaque match') },
        { label: t('Programmes de signes'), value: PROGRAM_STEPS[lvl] ? t('{v} séances', { v: PROGRAM_STEPS[lvl] }) : t('au niveau 3'), sub: t('un signe distinctif appris') },
      ];
    }
    case 'academy': {
      const row = academyTalent(lvl);
      return [
        { label: t('Potentiel des jeunes'), value: t('{v} à {v2}', { v: row.pot[0], v2: row.pot[1] }), short: t('Potentiel {v} à {v2}', { v: row.pot[0], v2: row.pot[1] }), sub: t('huit sur dix · rarement {top}', { top: row.top }) },
        { label: t('Jeunes repérés'), value: fmt(SCOUTED[lvl]), sub: t('après chaque journée') },
        { label: t('Niveau à leur arrivée'), value: t('{v} à {v2}', { v: row.level[0], v2: row.level[1] }) },
        { label: t('Fourchette du potentiel'), value: t('{dec} points', { dec: dec(2 * scoutingError(lvl)) }), sub: t('plus étroite, mieux cernée') },
        { label: t('Équipe de jeunes'), value: t('{fmt} places', { fmt: YOUTH_PLACES }), sub: t('recrutement gratuit, sans salaire') },
      ];
    }
    case 'fans':
      return [
        { label: t('Public'), value: `+${lvl * 7} %`, short: t('Public +{v} %', { v: lvl * 7 }) },
        { label: t('Buvette'), value: `+${lvl * 10} %` },
        { label: t('Boutique'), value: `+${lvl * 12} %` },
        { label: t('Réputation par match'), value: `+${lvl * 10} %` },
      ];
    case 'sponsor': {
      const year = sponsorIncome(lvl, s.divisionIndex, s.reputation);
      return [
        { label: t('Sponsors'), value: LANG !== 'fr' ? eur(year) : `${fmt(year)} €`, short: t('{fmt} € / saison', { fmt: fmt(year) }), sub: t('par saison, versés à la reprise') },
        { label: t('Revenus hors ligne'), value: LANG !== 'fr' ? eur(offlinePerHour(lvl, s.divisionIndex)) : `${fmt(offlinePerHour(lvl, s.divisionIndex))} €`, sub: t('par heure d’absence') },
      ];
    }
    case 'direction':
      return [
        { label: t('Droits TV'), value: `+${lvl * 8} %`, short: t('Droits TV +{v} %', { v: lvl * 8 }), sub: s && !DIVISIONS[s.divisionIndex].tv ? t('télé locale : {fmt} € par match', { fmt: fmt(localTv(lvl)) }) : t('par match de championnat') },
        { label: t('Contrats'), value: `−${lvl * DIRECTION_EASE} %`, sub: t('sur les exigences de salaire des joueurs') },
        { label: t('Négociations'), value: t('droits TV, contrats'), sub: t('chances d’accord exactes') },
        { label: t('Billetterie'), value: t('4 formules'), sub: t('recette prévue de chacune') },
      ];
    case 'medical':
      return [
        { label: t('Soin d’une blessure légère'), value: `${treatPct(lvl, 1)} %`, short: t('Soins réussis à {treatPct} %', { treatPct: treatPct(lvl, 1) }), sub: t('un match d’absence en moins') },
        { label: t('Soin d’une fracture'), value: `${treatPct(lvl, 9)} %`, sub: t('neuf matchs d’absence') },
        { label: t('Risque de blessure'), value: `−${lvl * 8} %`, sub: t('en match, grâce à la prévention') },
        { label: t('Coût d’un soin'), value: t('15 % du salaire'), sub: t('annuel du joueur soigné') },
      ];
    case 'league':
      return [
        { label: t('Championnats entre amis'), value: t('3 à la fois'), short: t('Ligues entre amis'), sub: t('créés ou rejoints') },
        { label: t('Clubs par championnat'), value: '8', sub: t('tes amis, complétés par l’ordinateur') },
        { label: t('Invitation'), value: t('lien ou code'), sub: t('tes amis entrent gratuitement') },
        { label: t('Entretien'), value: t('aucun'), sub: t('un monde à part de ta carrière') },
      ];
    case 'transfers':
      return [
        { label: t('Joueurs sous contrat'), value: fmt(officeSize(lvl)), short: t('{officeSize} joueurs suivis', { officeSize: officeSize(lvl) }), sub: t('sur ton mercato') },
        { label: t('Indemnités'), value: `−${lvl * 3} %` },
        { label: t('Vendeurs'), value: t('plus conciliants') },
      ];
    default:
      return [];
  }
}

// Effet d'un bâtiment à un niveau donné (inspecteur).
export function buildingEffect(key, lvl, divIndex, rep = REP_START) {
  const fmt = (n) => new Intl.NumberFormat(numLocale()).format(n);
  switch (key) {
    case 'terrain':
      return t('Capacité d’accueil : {fmt} places{v}.', { fmt: fmt(capacity(lvl)), v: LOGES_SHARE[lvl] ? t(' · {fmt} places en loges', { fmt: fmt(Math.round(capacity(lvl) * LOGES_SHARE[lvl])) }) : '' });
    case 'training':
      return lvl > 0
        ? t('Séances entre les matchs : progrès ×{dec2} · {length} épreuves en 3D · séance collective après chaque match{v}.', { dec2: dec2(TRAINING_MULT[lvl]), length: drillsAt(lvl).length, v: PROGRAM_STEPS[lvl] ? t(' · signes distinctifs appris en {v} séances', { v: PROGRAM_STEPS[lvl] }) : '' })
        : t('Pas de séances d’entraînement tant que le centre n’est pas construit.');
    case 'academy': {
      if (lvl <= 0) return t('Pas d’équipe de jeunes tant que l’académie n’est pas construite.');
      const row = academyTalent(lvl);
      return t('Équipe de jeunes de {YOUTH_PLACES} places · {v} jeunes repérés après chaque journée : niveau {v2} à {v3}, potentiel {v4} à {v5} (rarement {top}), cerné à {dec} points près.', { YOUTH_PLACES, v: SCOUTED[lvl], v2: row.level[0], v3: row.level[1], v4: row.pot[0], v5: row.pot[1], top: row.top, dec: dec(2 * scoutingError(lvl)) });
    }
    case 'fans':
      return t('Public attiré : +{v} % · Buvette +{v2} %, boutique +{v3} % · Réputation par match : +{v2} %.', { v: lvl * 7, v2: lvl * 10, v3: lvl * 12 });
    case 'direction':
      return lvl > 0
        ? t('Négociations du club : droits TV +{v} %{v2}, hausse à demander chaque saison · exigences de salaire des joueurs −{v3} % (recrues et prolongations) · formule des billets.', { v: lvl * 8, v2: DIVISIONS[divIndex].tv ? '' : t(' (télé locale : {fmt} € par match)', { fmt: fmt(localTv(lvl)) }), v3: lvl * DIRECTION_EASE })
        : t('Pas de négociations tant que la Direction du club n’est pas construite.');
    case 'medical':
      return lvl > 0
        ? t('Soins des blessés : un par joueur et par date, réussis à {treatPct} % pour une blessure légère, {treatPct2} % pour une fracture · risque de blessure en match −{v} %.', { treatPct: treatPct(lvl, 1), treatPct2: treatPct(lvl, 9), v: lvl * 8 })
        : t('Pas de soins tant que le centre médical n’est pas construit : un blessé attend sa guérison.');
    case 'league':
      return lvl > 0
        ? t('Championnats entre amis : jusqu’à 3 à la fois, 8 clubs chacun, tes amis invités par un lien ou un code. Un monde à part de ta carrière, sans entretien.')
        : t('Pas de championnat entre amis tant que le Siège de la Ligue n’est pas construit.');
    case 'transfers':
      return lvl > 0
        ? t('Réseau de recruteurs : {officeSize} joueurs sous contrat sur ton mercato · indemnités −{v} % · vendeurs plus conciliants · potentiel mieux cerné.', { officeSize: officeSize(lvl), v: lvl * 3 })
        : t('Sans bureau, ton mercato ne montre que {officeSize} joueurs sous contrat listés publiquement, en plus des joueurs libres.', { officeSize: officeSize(0) });
    case 'sponsor':
      return t('Sponsors : {fmt} € par saison, versés à la reprise · {fmt2} € par heure, même hors ligne.', { fmt: fmt(sponsorIncome(lvl, divIndex, rep)), fmt2: fmt(offlinePerHour(lvl, divIndex)) });
    default:
      return '';
  }
}
