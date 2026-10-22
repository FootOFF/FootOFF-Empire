import { SQUAD_MAX } from './constants';
import { costOf, playerRating, potentialRange, ratingAt, saleValue } from './players';
import { slotsOf } from './tactics';
import { clamp } from './utils';
import { mercatoRep } from './reputation';

// Mercato : un seul marché (joueurs libres et joueurs sous contrat), des offres négociées et des ventes aux clubs
// adverses. Ce module ne contient que des calculs : les actions (offre, signature, vente) sont dans engine.js.
//
// Négociation : chaque vendeur (club ou agent d'un joueur libre) a un seuil, en part du prix demandé, autour duquel
// il dit oui une fois sur deux. Le seuil dépend de la situation du joueur (contrat, âge, potentiel, clubs rivaux
// intéressés, temps passé sur le marché), du réseau de recruteurs du club et des offres déjà refusées. La chance
// d'accord affichée est exactement celle qui décide de la réponse.

export const TRIES = 3; // offres possibles par joueur et par journée
export const HAGGLE_CHANCE = 0.5; // « faire monter » une offre reçue : une chance sur deux d'obtenir 10 % de plus
const SPREAD = 0.07; // largeur de la zone d'hésitation du vendeur (en part du prix demandé)

export const roundKey = (s) => `${s.seasonNumber}:${s.round}`;
export const poolOf = (s) => [...(s.market || []), ...(s.transfers || [])];
export const findOnMarket = (s, id) => poolOf(s).find((p) => p.id === id) || null;

// Montants ronds à l'échelle du prix (curseur d'offre, contre-propositions).
export const stepFor = (v) => (v < 5000 ? 50 : v < 50000 ? 250 : v < 500000 ? 2500 : v < 5e6 ? 25000 : 100000);
export const roundTo = (v, step = stepFor(v)) => Math.max(step, Math.round(v / step) * step);
export const ceilTo = (v, step = stepFor(v)) => Math.max(step, Math.ceil(v / step) * step);

// Pourcentage affiché : 0 % seulement si c'est impossible, 100 % seulement si c'est certain.
export const pctOf = (prob) => (prob <= 0 ? 0 : prob >= 1 ? 100 : clamp(Math.round(prob * 100), 1, 99));

// Potentiel estimé par les recruteurs (milieu de la fourchette affichée), ou la note actuelle s'il est atteint.
const potMid = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 : playerRating(p); };

// Ce que l'onze gagnerait : écart entre la recrue et le titulaire le plus faible à son poste (peut être négatif).
export function fitGain(s, p) {
  const slots = slotsOf(s.formation);
  let gain = null;
  (s.lineup || []).forEach((id, k) => {
    if (slots[k] !== p.pos) return;
    const q = s.players.find((x) => x.id === id);
    const g = ratingAt(p, p.pos) - (q ? ratingAt(q, p.pos) : 0);
    if (gain === null || g > gain) gain = g;
  });
  return gain ?? 0;
}

// Étiquettes d'une carte du marché.
export function tagsOf(s, p) {
  const tags = [];
  if (p.listedAt === roundKey(s)) tags.push('new');
  if (p.age <= 21 && potMid(s, p) - playerRating(p) >= 3) tags.push('gem');
  if (p.interest) tags.push('courted');
  if ((p.priceMod || 1) <= 0.92) tags.push('bargain');
  if (p.trend < 0) tags.push('falling');
  else if (p.trend > 0) tags.push('rising');
  if (p.club && p.contract === 1) tags.push('lastyear');
  return tags;
}

// Position du vendeur : seuil (part du prix demandé à laquelle il accepte une fois sur deux), largeur de la zone
// d'hésitation, et raisons, du point de vue de l'acheteur (down : en ta faveur, up : contre toi).
export function stanceOf(s, p) {
  const reasons = [];
  const lvl = s.buildings.transfers || 0;
  let t;
  if (p.club) {
    t = 0.86;
    const c = p.contract || 2;
    if (c <= 1) { t -= 0.07; reasons.push(['down', 'Dernière année de contrat : son club préfère le vendre maintenant.']); }
    else if (c === 2) { t -= 0.02; reasons.push(['', 'Contrat de 2 ans : son club peut le céder sans le brader.']); }
    else { t += c >= 4 ? 0.05 : 0.02; reasons.push(['up', `Contrat de ${c} ans : son club ne le brade pas.`]); }
    if (lvl) { t -= 0.012 * lvl; reasons.push(['down', `Tes recruteurs négocient pour toi (bureau des transferts niveau ${lvl}).`]); }
  } else {
    t = 0.9;
    reasons.push(['', 'Joueur libre : son agent discute la prime de signature.']);
  }
  if (p.age >= 31) { t -= 0.04; reasons.push(['down', `${p.age} ans : le vendeur accepte de discuter.`]); }
  if (p.age <= 21 && potMid(s, p) - playerRating(p) >= 3) { t += 0.04; reasons.push(['up', 'Jeune à fort potentiel : le vendeur en veut un bon prix.']); }
  if (p.interest) { t += 0.04 * p.interest; reasons.push(['up', `Courtisé par ${p.interest} club${p.interest > 1 ? 's' : ''} : la concurrence fait monter le prix.`]); }
  if (p.trend < 0) { t -= 0.02; reasons.push(['down', 'Son prix baisse : le vendeur est prêt à discuter.']); }
  else if ((p.listedRounds || 0) >= 3 && !p.interest) { t -= 0.02; reasons.push(['down', `Sans preneur depuis ${p.listedRounds} journées : le prix se discute.`]); }
  const tries = p.talks?.tries || 0;
  if (tries) { t += 0.015 * tries; reasons.push(['up', `${tries} offre${tries > 1 ? 's' : ''} refusée${tries > 1 ? 's' : ''} : le vendeur se braque.`]); }
  const fame = mercatoRep(s.reputation); // notoriété du club (reputation.js)
  if (fame >= 0.005) { t -= fame; reasons.push(['down', 'Ta notoriété attire : le vendeur écoute plus volontiers un club réputé.']); }
  else if (fame <= -0.005) { t -= fame; reasons.push(['up', 'Club encore peu connu : le vendeur se méfie un peu.']); }
  t += ((((p.id || 1) * 7919) % 100) / 100 - 0.5) * 0.06; // chaque vendeur a son caractère
  return { t: clamp(t, 0.6, 1.05), w: SPREAD, reasons };
}

// Chance que le vendeur accepte une offre (0 à 1).
export function acceptChance(s, p, offer, ask = costOf(p, s)) {
  if (!ask) return 1;
  const { t, w } = stanceOf(s, p);
  const x = clamp((offer / ask - (t - w)) / (2 * w), 0, 1);
  return x * x * (3 - 2 * x);
}

// Une offre jugée sérieuse (même refusée) appelle une contre-proposition ; en dessous, le vendeur refuse sèchement.
export function isSerious(s, p, offer, ask = costOf(p, s)) {
  const { t, w } = stanceOf(s, p);
  return offer / ask >= t - 2 * w;
}

// Contre-proposition : le prix auquel le vendeur signe à coup sûr, arrondi, plafonné à 125 % du prix demandé.
export function counterFor(s, p, ask = costOf(p, s)) {
  const { t, w } = stanceOf(s, p);
  return Math.min(ceilTo(ask * 1.25), ceilTo(ask * (t + w)));
}

// Ce qui empêche de faire une offre, ou null.
export function offerBlock(s, p, amount) {
  if (s.players.length >= SQUAD_MAX) return `Effectif complet (${SQUAD_MAX} joueurs) : vends d’abord un joueur.`;
  if (p.talks?.closed) return 'Le vendeur ne discutera plus avant la prochaine journée.';
  if (amount > s.money) return 'Trésorerie insuffisante pour cette offre.';
  return null;
}

// Négociations en cours : contre-propositions à accepter avant la prochaine journée.
export const pendingCounters = (s) => poolOf(s).filter((p) => p.talks?.counter);

// Valeur d'un joueur de l'effectif (base des offres reçues) et écart d'une offre à cette valeur.
export const valueOf = (s, p) => saleValue(p, s.divisionIndex);

// Historique des transferts (bilan du mercato) : arrivées et départs, avec leur montant. board : vente décidée par
// le conseil (plan de redressement).
export function logMove(s, kind, p, fee, club, board = false) {
  s.mercatoLog = [...(s.mercatoLog || []), {
    season: s.seasonNumber, round: s.round, kind, id: p.id, name: p.name, pos: p.pos, age: p.age,
    rating: Math.round(playerRating(p) * 10) / 10, fee, club: club || null, ...(board ? { board: true } : {}),
  }].slice(-200);
}
