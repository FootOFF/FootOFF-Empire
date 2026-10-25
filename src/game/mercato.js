import { DIVISIONS, SQUAD_MAX } from './constants';
import { absenceOf, costOf, marketValue, playerRating, potentialRange, ratingAt } from './players';
import { slotsOf } from './tactics';
import { clamp, rnd } from './utils';
import { mercatoRep } from './reputation';

// Mercato : un seul marché (joueurs libres et joueurs sous contrat), des offres négociées et des ventes aux clubs
// adverses. Ce module ne contient que des calculs : les actions (offre, signature, vente, enchères) sont dans
// engine.js, l'arrivée des clubs acheteurs dans transfers.js.
//
// Négociation : chaque vendeur (club ou agent d'un joueur libre) a un seuil, en part du prix demandé, autour duquel
// il dit oui une fois sur deux. Le seuil dépend de la situation du joueur (contrat, âge, potentiel, clubs rivaux
// intéressés, temps passé sur le marché), du réseau de recruteurs du club et des offres déjà refusées. La chance
// d'accord affichée est exactement celle qui décide de la réponse.

export const TRIES = 3; // offres possibles par joueur et par journée
const SPREAD = 0.07; // largeur de la zone d'hésitation du vendeur (en part du prix demandé)

export const roundKey = (s) => `${s.seasonNumber}:${s.round}`;
// Date du calendrier : la période entre deux matchs, coupes comprises (roundKey ne change qu'aux journées de
// championnat). Une recrue ne se revend pas avant le match suivant sa signature.
export const dateKey = (s) => `${s.seasonNumber}:${s.calIndex || 0}:${s.round}`;
// Moment d'un transfert, pour le bilan du mercato et la fiche du joueur.
export const moveWhen = (season, round) => `Saison ${season}${round ? `, après la journée ${round}` : ', avant la 1re journée'}`;

// Pourquoi un joueur de l'effectif ne peut pas être vendu maintenant (null : il peut l'être). Blessé ou suspendu, il
// attend son retour ; recruté depuis le dernier match, il attend le suivant. Ni mise en vente, ni offre acceptée ou
// négociée, ni offre des clubs (transfers.js) tant que dure le blocage.
export function saleBlock(s, p) {
  const a = absenceOf(p);
  if (a?.kind === 'injury') return { short: 'Blessé', text: 'Blessé : il ne peut pas être vendu avant son retour.' };
  if (a) return { short: 'Suspendu', text: 'Suspendu : il ne peut pas être vendu avant d’avoir purgé sa suspension.' };
  if (p.signed?.date === dateKey(s)) return { short: 'Recruté aujourd’hui', text: 'Recruté aujourd’hui : il ne peut pas être revendu avant le prochain match.' };
  return null;
}

// Arrivée d'un joueur de l'effectif : montant, club d'origine (null : joueur libre) et moment de la signature.
// Signatures d'avant cette fiche : retrouvées dans le bilan du mercato. null : effectif de départ ou formé au club.
export function arrivalOf(s, p) {
  if (p.signed) return p.signed;
  const m = [...(s.mercatoLog || [])].reverse().find((x) => x.kind === 'in' && x.id === p.id);
  return m ? { fee: m.fee, from: m.club, season: m.season, round: m.round } : null;
}
export const poolOf = (s) => [...(s.market || []), ...(s.transfers || [])];
export const findOnMarket = (s, id) => poolOf(s).find((p) => p.id === id) || null;

// Montants ronds à l'échelle du prix (curseur d'offre, contre-propositions).
export const stepFor = (v) => (v < 5000 ? 50 : v < 50000 ? 250 : v < 500000 ? 2500 : v < 5e6 ? 25000 : 100000);
export const roundTo = (v, step = stepFor(v)) => Math.max(step, Math.round(v / step) * step);
export const ceilTo = (v, step = stepFor(v)) => Math.max(step, Math.ceil(v / step) * step);
export const floorTo = (v, step = stepFor(v)) => Math.max(step, Math.floor(v / step) * step);

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

// Valeur de marché d'un joueur de l'effectif (players.js) : la référence des offres reçues, la même que la fiche.
export const valueOf = (s, p) => marketValue(p, s.divisionIndex);

// --- Ventes ------------------------------------------------------------------------------------------------
//
// Mise en vente à un prix demandé : CANDIDATES clubs étudient le joueur, ceux qui s'y intéressent font aussitôt leur
// offre (transfers.js), d'autres suivent après chaque journée. Chaque club a un plafond b, en part de la valeur v du
// joueur au moment de l'offre : jusqu'à (b − w)·v il paie à coup sûr, au-delà de (b + w)·v jamais ; entre les deux il
// accepte une demande avec la chance affichée (même courbe qu'à l'achat). Une demande refusée l'amène à son dernier
// mot (son offre monte à ce qu'il paie à coup sûr, il se braque un peu plus) ; une demande sans aucune chance le fait
// partir. Les grands clubs paient plus mais négocient dur (offre d'ouverture loin de leur plafond, qui baisse vite
// après un refus) ; les petits paient moins mais acceptent vite.

export const SALE_TRIES = 3; // demandes possibles pour chaque offre reçue
export const CANDIDATES = 4; // clubs qui étudient un joueur mis en vente
const SELL_W = 0.08; // zone d'hésitation d'un club acheteur (en part de la valeur du joueur)
const REACH = 0.35; // un club ignore un joueur dont le prix dépasse son plafond de plus de 35 % de sa valeur
const CHARACTER = 0.06; // caractère de chaque club : plafond à ± 6 % de la valeur
const SPONTANEOUS = 0.2; // pour un joueur qui n'est pas à vendre, un club met 20 % de sa valeur en plus
// step : division du club acheteur par rapport à la nôtre
// Plafonds en part de la valeur de marché : un petit club paie moins que la valeur, un grand club davantage.
export const BUYERS = {
  small: { label: 'Petit club', base: 0.84, gap: [0.02, 0.06], hard: 0.01, step: -1 },
  mid: { label: 'Club ambitieux', base: 0.97, gap: [0.04, 0.1], hard: 0.02, step: 0 },
  big: { label: 'Grand club', base: 1.12, gap: [0.08, 0.16], hard: 0.03, step: 1 },
};

export const formOf = (p) => (p.form?.length >= 2 ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 6);
const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };
const smooth = (x) => x * x * (3 - 2 * x);
const exact = (x) => (x < 1e-9 ? 0 : x > 1 - 1e-9 ? 1 : x); // bruit des calculs : 0 et 1 restent exacts

// Regard des clubs sur un joueur de l'effectif : prime sur leur plafond (forme, âge, potentiel), attrait (chance
// qu'un club étudie le dossier) et sortes de clubs intéressés selon son niveau pour la division, avec les raisons
// (good : en ta faveur, bad : contre toi).
export function buyerView(s, p) {
  const reasons = [];
  const f = formOf(p);
  let prem = 0;
  let attract = 0.5;
  if (f >= 7) { prem += 0.06; attract += 0.15; reasons.push(['good', 'En grande forme : plus de clubs le regardent, et ils paient plus.']); }
  else if (f < 5.5) { prem -= 0.05; attract -= 0.15; reasons.push(['bad', 'En méforme : moins de clubs le regardent, et ils paient moins.']); }
  if (p.age <= 23) { prem += 0.06; attract += 0.1; reasons.push(['good', `${p.age} ans : les clubs misent aussi sur sa revente.`]); }
  else if (p.age >= 31) { prem -= 0.08; attract -= 0.1; reasons.push(['bad', `${p.age} ans : les clubs paient moins un joueur en fin de carrière.`]); }
  if (p.age <= 21 && potMid(s, p) - playerRating(p) >= 3) { prem += 0.05; reasons.push(['good', 'Fort potentiel : les clubs paient pour l’avenir.']); }
  const gap = playerRating(p) - divRef(s);
  let weights;
  if (gap >= 1.5) { weights = { small: 0.25, mid: 0.45, big: 0.3 }; reasons.push(['good', 'Fort pour ta division : les grands clubs s’y intéressent.', 'tiers']); }
  else if (gap < -1) { weights = { small: 0.6, mid: 0.35, big: 0.05 }; reasons.push(['bad', 'Faible pour ta division : surtout des petits clubs.', 'tiers']); }
  else { weights = { small: 0.45, mid: 0.4, big: 0.15 }; reasons.push(['', 'Du niveau de ta division : petits clubs et clubs ambitieux, parfois un grand.', 'tiers']); }
  return { prem, attract: clamp(attract, 0.25, 0.8), weights, reasons };
}

// Club acheteur tiré au hasard selon ce regard : sa sorte et son plafond.
export function drawBuyer(view, extra = 0) {
  let r = Math.random();
  let tier = 'big';
  for (const [t, w] of Object.entries(view.weights)) {
    if (r < w) { tier = t; break; }
    r -= w;
  }
  return { tier, b: BUYERS[tier].base + view.prem + extra + rnd(-CHARACTER, CHARACTER) };
}

// Un club étudie-t-il un joueur à ce prix ? Non si le prix dépasse de loin son plafond.
export const withinReach = (buyer, price, v) => price / v <= buyer.b + REACH;

// Offre d'ouverture d'un club : le prix demandé s'il le paie à coup sûr, sinon un peu sous ce qu'il paie à coup sûr
// (plus loin pour un grand club, qui négocie dur), jamais moins de 60 % de la valeur.
export function openingOffer(buyer, v, price = Infinity) {
  if (price <= (buyer.b - SELL_W) * v) return { amount: price, atAsk: true };
  const [g0, g1] = BUYERS[buyer.tier].gap;
  const amount = floorTo(Math.max(0.6, buyer.b - SELL_W - rnd(g0, g1)) * v);
  return amount < price ? { amount, atAsk: false } : { amount: price, atAsk: true };
}

// Offre spontanée pour un joueur qui n'est pas à vendre : plutôt un grand club, prêt à payer plus.
export function spontaneousBuyer(s, p) {
  return drawBuyer({ ...buyerView(s, p), weights: { small: 0.1, mid: 0.4, big: 0.5 } }, SPONTANEOUS);
}

// Chance que le plafond d'un club pris au hasard atteigne x (caractère uniforme dans ± CHARACTER).
function reachChance(view, x) {
  let sum = 0;
  for (const [t, w] of Object.entries(view.weights)) sum += w * clamp((BUYERS[t].base + view.prem + CHARACTER - x) / (2 * CHARACTER), 0, 1);
  return sum;
}

// Mise en vente à un prix : chance exacte qu'un club au moins paie ce prix tout de suite, et qu'au moins deux clubs se
// présentent (enchères possibles). Chaque candidat étudie le dossier (attrait a) et s'y intéresse si le prix est à sa
// portée (h) ; il paie le prix d'emblée s'il le paie à coup sûr (g). Si aucun ne s'y intéresse, celui qui a le plus
// haut plafond se présente quand même : il paie le prix d'emblée si l'un des candidats le pouvait.
//   pays = 1 − (1 − a·g)ⁿ + (1 − a·h)ⁿ − (1 − a·h − g + a·g)ⁿ
export function listingOutlook(s, p, price) {
  const view = buyerView(s, p);
  const d = price / valueOf(s, p);
  const a = view.attract;
  const g = reachChance(view, d + SELL_W);
  const h = reachChance(view, d - REACH);
  const q = a * h;
  const n = CANDIDATES;
  const pays = 1 - (1 - a * g) ** n + (1 - q) ** n - (1 - q - g + a * g) ** n;
  const duo = 1 - (1 - q) ** n - n * q * (1 - q) ** (n - 1);
  return { pays: exact(clamp(pays, 0, 1)), duo: exact(clamp(duo, 0, 1)), reasons: view.reasons };
}

// Plafond d'un club après ses refus : il se braque à chaque demande refusée (plus vite pour un grand club).
export const capOf = (o) => o.b - (BUYERS[o.tier]?.hard ?? 0.02) * (o.talks?.tries || 0);

// Chance qu'un club accepte une demande au-dessus de son offre (0 à 1). 0 : demande hors de sa portée, il part.
export function demandChance(o, demand) {
  if (demand <= o.amount) return 1;
  return exact(smooth(clamp((capOf(o) + SELL_W - demand / o.v) / (2 * SELL_W), 0, 1)));
}

// Dernier mot d'un club qui vient de refuser une demande : ce qu'il paie à coup sûr, jamais moins que son offre.
export const lastWordOf = (o) => Math.max(o.amount, floorTo((capOf(o) - SELL_W) * o.v));

// Offres reçues pour un joueur, la meilleure d'abord.
export const offersFor = (s, id) => (s.offers || []).filter((o) => o.playerId === id).sort((a, b) => b.amount - a.amount || a.id - b.id);

// Enchères (deux offres au moins, une fois par journée) : la meilleure offre tient ; chaque autre club la bat ou se
// retire. Sous la pression, un club peut monter jusqu'au haut de sa zone d'hésitation.
export const auctionDone = (s, id) => s.auctions?.[id] === roundKey(s);
const auctionTop = (o) => floorTo((capOf(o) + SELL_W) * o.v);
export function outbidChance(o, best) {
  if (auctionTop(o) <= best) return 0;
  return exact(smooth(clamp((capOf(o) + SELL_W - best / o.v) / (2 * SELL_W), 0, 1)));
}
export const outbidAmount = (o, best) => Math.min(auctionTop(o), ceilTo(best + rnd(0.04, 0.1) * o.v));

// Ce qui joue dans la négociation avec un club (good : en ta faveur, bad : contre toi).
export function saleReasons(s, o) {
  const p = s.players.find((q) => q.id === o.playerId);
  const reasons = [];
  if (o.tier === 'big') reasons.push(['', 'Grand club : il paie plus, mais négocie dur et se braque vite.']);
  else if (o.tier === 'small') reasons.push(['', 'Petit club : budget serré, mais il accepte vite.']);
  else reasons.push(['', 'Club ambitieux : il discute sans trop se braquer.']);
  if (o.unsolicited) reasons.push(['good', 'Offre spontanée : il tient à ce joueur, qui n’est pas à vendre.']);
  const tries = o.talks?.tries || 0;
  if (tries) reasons.push(['bad', `${tries} demande${tries > 1 ? 's' : ''} refusée${tries > 1 ? 's' : ''} : le club se braque.`]);
  if (p) reasons.push(...buyerView(s, p).reasons.filter(([tone, , kind]) => tone && kind !== 'tiers')); // ce qui joue sur son plafond
  return reasons;
}

// Historique des transferts (bilan du mercato) : arrivées et départs, avec leur montant. board : vente décidée par
// le conseil (plan de redressement).
export function logMove(s, kind, p, fee, club, board = false) {
  s.mercatoLog = [...(s.mercatoLog || []), {
    season: s.seasonNumber, round: s.round, kind, id: p.id, name: p.name, pos: p.pos, age: p.age,
    rating: Math.round(playerRating(p) * 10) / 10, fee, club: club || null, ...(board ? { board: true } : {}),
  }].slice(-200);
}
