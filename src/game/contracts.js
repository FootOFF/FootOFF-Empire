import { DIVISIONS } from './constants';
import { DIRECTION_EASE } from './economy';
import { costOf, playerRating, potentialRange, refWage } from './players';
import { mercatoRep } from './reputation';
import { ceilTo, roundKey, stepFor } from './mercato';
import { clamp, ri } from './utils';

// Contrats (0.8.0). Chaque joueur de l'effectif a un contrat (p.deal) : un salaire par saison fixe, sa dernière saison
// (until), une clause de montée (hausse du salaire à chaque montée, en part du salaire) et sa saison de signature. Le
// salaire ne suit plus la note ni la division : seule une prolongation le change, avec la clause de montée ; à la
// descente, un salaire qui dépasse celui de son niveau dans la nouvelle division y est ramené (clause de descente, la
// même pour tous). Sans prolongation, le joueur part libre à la fin de sa dernière saison, sans indemnité.
//
// Négociation (recrue, une fois l'indemnité convenue avec son club ; joueur libre, d'emblée ; prolongation) : salaire,
// durée (1 à 5 saisons, la saison en cours comptée), prime à la signature et clause de montée. Chaque joueur a un seuil
// t, en part du salaire de référence de son niveau dans la division du club (refWage), autour duquel il dit oui une
// fois sur deux. L'offre vaut son salaire, plus la prime étalée sur la durée (moins celle qu'attend un joueur libre),
// plus la clause de montée, moins l'écart à la durée qu'il souhaite. La chance affichée est exactement celle qui décide
// (même courbe que l'indemnité, mercato.js). Ce module ne fait que des calculs : les actions sont dans engine.js.

export const MAX_YEARS = 5;
export const CLAUSES = [0, 0.25, 0.5, 1];
export const C_TRIES = 3; // propositions par joueur et par journée
const W = 0.07; // largeur de la zone d'hésitation du joueur (en part du salaire de référence)
export const BASE = 1.06; // seuil de départ : un joueur vise un peu plus que la référence (calé sur des carrières simulées, 2026-10-28)

export const refWageOf = (s, p) => refWage(p, s.divisionIndex);
// Pas des salaires : cinq fois plus fin que celui des indemnités (10 € pour un salaire de Départementale).
export const wageStep = (v) => Math.max(10, stepFor(v) / 5);
// Saisons de contrat restantes, celle en cours comprise (1 : dernière année).
export const yearsLeft = (s, p) => (p.deal ? p.deal.until - s.seasonNumber + 1 : 0);
export const lastYear = (s, p) => !!p.deal && p.deal.until <= s.seasonNumber;
// La clause de montée n'a de sens que là où l'on peut monter (pas en Élite, pas dans une ligue entre amis).
export const clauseOpen = (s) => !s.league && s.divisionIndex < DIVISIONS.length - 1;
const isOwn = (s, p) => s.players.includes(p);

// Dans la course à la montée : parmi les trois premiers, passé la deuxième journée.
export function contending(s) {
  if (!clauseOpen(s) || !s.table?.length || (s.round || 0) < 2) return false;
  const me = s.table[0];
  return s.table.filter((t, i) => i > 0 && (t.pts > me.pts || (t.pts === me.pts && t.gd > me.gd))).length <= 2;
}

const roomOf = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 - playerRating(p) : 0; };

// Durée souhaitée : un jeune à fort potentiel veut un contrat court (se revaloriser vite), les autres veulent de la
// sécurité, d'autant plus passé 30 ans.
export function wishOf(s, p) {
  if (p.age <= 23 && roomOf(s, p) >= 3) return { years: 2, young: true };
  return { years: p.age >= 30 ? 4 : 3, young: false };
}
function yearsGap(wish, years) {
  const d = years - wish.years;
  return d > 0 ? d * (wish.young ? 0.035 : 0.01) : -d * (wish.young ? 0.015 : 0.035);
}

// Prime attendue : un joueur libre attend sa prime de signature (le prix affiché au mercato) ; une recrue sous contrat
// (son club touche l'indemnité) ou un joueur qui prolonge n'en attend aucune.
export const bonusWish = (s, p) => (!isOwn(s, p) && !p.club ? costOf(p, s) : 0);

// Discussions de contrat du jour (propositions refusées, contre-proposition) : elles valent jusqu'à la prochaine journée.
export const ctalksOf = (s, p) => (p.ctalks?.at === roundKey(s) ? p.ctalks : {});

// Prolongation : la nouvelle durée doit dépasser l'actuelle (au plus cinq saisons, la saison en cours comptée).
export const minYears = (s, p, renew) => (renew ? Math.min(MAX_YEARS + 1, yearsLeft(s, p) + 1) : 1);
export const renewOpen = (s, p) => isOwn(s, p) && !!p.deal && yearsLeft(s, p) < MAX_YEARS;

// Position du joueur : seuil t (part du salaire de référence à laquelle il signe une fois sur deux, durée souhaitée et
// sans prime), largeur w et raisons, du point de vue du club (down : en ta faveur, up : contre toi).
export function contractStance(s, p, renew = false) {
  const reasons = [];
  let t = BASE;
  const lvl = s.buildings.direction || 0;
  if (lvl) { t -= (DIRECTION_EASE / 100) * lvl; reasons.push(['down', `Ta Direction mène la discussion (niveau ${lvl}) : −${DIRECTION_EASE * lvl} % sur ses exigences.`]); }
  const fame = mercatoRep(s.reputation); // notoriété du club (reputation.js)
  if (fame >= 0.005) { t -= fame; reasons.push(['down', 'Ta notoriété attire : il accepte de gagner un peu moins.']); }
  else if (fame <= -0.005) { t -= fame; reasons.push(['up', 'Club encore peu connu : il demande un peu plus.']); }
  if (p.age >= 31) { t -= 0.04; reasons.push(['down', `${p.age} ans : il tient à signer et discute plus volontiers.`]); }
  if (p.age <= 21 && roomOf(s, p) >= 3) { t += 0.04; reasons.push(['up', 'Jeune à fort potentiel : il sait ce qu’il vaut.']); }
  if (!renew && p.interest) { t += 0.03 * p.interest; reasons.push(['up', `Courtisé par ${p.interest} club${p.interest > 1 ? 's' : ''} : il a d’autres options.`]); }
  if (renew) {
    const left = yearsLeft(s, p);
    if (left <= 1) { t += 0.03; reasons.push(['up', 'Dernière année : il sait qu’il pourra partir libre.']); }
    else if (left >= 3) { t -= 0.02; reasons.push(['down', `Encore ${left} ans de contrat : il n’est pas en position de force.`]); }
    if (p.deal && p.deal.wage < 0.85 * refWageOf(s, p)) { t += 0.03; reasons.push(['up', 'Payé bien moins que son niveau : il veut un vrai rattrapage.']); }
  }
  const tries = ctalksOf(s, p).tries || 0;
  if (tries) { t += 0.015 * tries; reasons.push(['up', `${tries} proposition${tries > 1 ? 's' : ''} refusée${tries > 1 ? 's' : ''} : il se braque.`]); }
  t += ((((p.id || 1) * 6151) % 100) / 100 - 0.5) * 0.06; // chaque joueur a son caractère
  return { t: clamp(t, 0.85, 1.3), w: W, reasons };
}

// Valeur d'une offre, en part du salaire de référence.
function scoreOf(s, p, terms) {
  const ref = Math.max(1, refWageOf(s, p));
  const bonus = (terms.bonus - bonusWish(s, p)) / (terms.years * ref);
  // clause de montée : elle vaut plus quand le club joue la montée, et son absence y coûte
  const clause = !clauseOpen(s) ? 0 : contending(s) ? (terms.clause ? terms.clause * 0.14 : -0.04) : terms.clause * 0.08;
  return terms.wage / ref + bonus + clause - yearsGap(wishOf(s, p), terms.years);
}

// Chance que le joueur signe ces conditions (0 à 1).
export function contractChance(s, p, terms, renew = false) {
  const { t, w } = contractStance(s, p, renew);
  const x = clamp((scoreOf(s, p, terms) - (t - w)) / (2 * w), 0, 1);
  return x * x * (3 - 2 * x);
}
// Une proposition jugée sérieuse (même refusée) appelle une contre-proposition de son agent ; en dessous, refus sec.
export function contractSerious(s, p, terms, renew = false) {
  const { t, w } = contractStance(s, p, renew);
  return scoreOf(s, p, terms) >= t - 2 * w;
}

// Ses demandes : le salaire auquel il signe à coup sûr pour la durée qu'il souhaite, sans clause, avec la prime qu'il
// attend (joueur libre).
export function demandOf(s, p, renew = false) {
  const { t, w } = contractStance(s, p, renew);
  const years = clamp(wishOf(s, p).years, minYears(s, p, renew), MAX_YEARS);
  const bonus = bonusWish(s, p);
  const base = { wage: 0, years, bonus, clause: 0 };
  const need = t + w - scoreOf(s, p, base); // ce qu'il manque au salaire pour signer à coup sûr
  const wage = need * refWageOf(s, p);
  return { ...base, wage: ceilTo(wage, wageStep(wage)) };
}
export const askedWage = (s, p) => demandOf(s, p, isOwn(s, p)).wage;

// Contre-proposition de son agent : les mêmes conditions, au salaire qui le fait signer à coup sûr (jamais moins que la
// proposition, jamais plus de 125 % de sa demande).
export function counterTerms(s, p, terms, renew = false) {
  const { t, w } = contractStance(s, p, renew);
  const ref = Math.max(1, refWageOf(s, p));
  const need = t + w - (scoreOf(s, p, terms) - terms.wage / ref);
  const ask = demandOf(s, p, renew).wage;
  const wage = Math.min(ceilTo(need * ref, wageStep(need * ref)), ceilTo(ask * 1.25, wageStep(ask)));
  return { ...terms, wage: Math.max(wage, terms.wage) };
}

// Ce qui joue selon les conditions choisies (durée, prime, clause), à ajouter aux raisons de sa position.
export function termReasons(s, p, terms) {
  const out = [];
  const wish = wishOf(s, p);
  const n = (v) => `${Math.round(v).toLocaleString('fr-FR')} €`;
  const y = (k) => `${k} an${k > 1 ? 's' : ''}`;
  if (terms.years === wish.years) out.push(['down', `${y(terms.years)} : la durée qu’il souhaitait.`]);
  else if (wish.young && terms.years > wish.years) out.push(['up', `Jeune et ambitieux : il préfère ${y(wish.years)}, pour se revaloriser vite.`]);
  else if (!wish.young && terms.years < wish.years) out.push(['up', `Il voulait ${y(wish.years)} : un contrat plus court le refroidit.`]);
  else out.push(['', `${y(terms.years)} : il voulait plutôt ${y(wish.years)}.`]);
  const b0 = bonusWish(s, p);
  if (b0 > 0) {
    if (terms.bonus >= b0) out.push(['down', 'Joueur libre : la prime qu’il attendait est là.']);
    else out.push(['up', `Joueur libre : il attend une prime de ${n(b0)}.`]);
  } else if (terms.bonus > 0) out.push(['down', `Prime de ${n(terms.bonus)} : il accepte un salaire un peu plus bas.`]);
  if (clauseOpen(s)) {
    if (terms.clause > 0) out.push(['down', contending(s) ? 'Clause de montée : ton club joue la montée, il y tient.' : 'Clause de montée : il croit au projet du club.']);
    else if (contending(s)) out.push(['up', 'Ton club joue la montée : sans clause, il y perd.']);
  }
  return out;
}

// Conditions valides (bornées), ou null.
export function cleanTerms(s, p, terms, renew = false) {
  const years = Math.round(Number(terms?.years));
  const wage = Math.round(Number(terms?.wage));
  const bonus = Math.round(Number(terms?.bonus) || 0);
  const clause = clauseOpen(s) && CLAUSES.includes(terms?.clause) ? terms.clause : 0;
  if (!(wage > 0) || !(bonus >= 0) || !(years >= minYears(s, p, renew)) || years > MAX_YEARS) return null;
  return { wage, years, bonus, clause };
}

// Contrat signé (recrue, prolongation, jeune monté de l'académie).
export function setDeal(s, p, { wage, years, clause = 0, bonus = 0 }) {
  p.deal = { wage, until: s.seasonNumber + years - 1, clause, since: s.seasonNumber, ...(bonus ? { bonus } : {}) };
  delete p.ctalks;
  return p;
}

// Contrat de départ (effectif de départ, parties d'avant les contrats, club de ligue, recrue de ligue, amateur de
// secours) : le salaire du jour, baisse négociée à la Direction comprise, de deux à quatre saisons selon l'âge. Personne
// ne part donc libre à la fin de la saison en cours sans avoir été annoncé.
export function ensureDeals(s) {
  for (const p of s.players || []) {
    if (p.deal) continue;
    const years = p.age >= 31 ? 2 : p.age <= 23 ? ri(3, 4) : ri(2, 4);
    p.deal = { wage: Math.round(refWage(p, s.divisionIndex) * (1 - (p.wageCut || 0))), until: s.seasonNumber + years - 1, clause: 0, since: s.seasonNumber };
    delete p.wageCut;
    delete p.wageTalk;
  }
  return s;
}

// Montée : les clauses de montée relèvent les salaires. Descente : un salaire au-dessus de celui de son niveau dans la
// nouvelle division y est ramené. Renvoie la phrase du bilan, ou null.
export function divisionWages(s, from, to) {
  const n = (v) => Math.round(v).toLocaleString('fr-FR');
  let count = 0;
  let sum = 0;
  if (to > from) {
    for (const p of s.players) {
      if (!(p.deal?.clause > 0)) continue;
      const before = p.deal.wage;
      p.deal.wage = Math.round(before * (1 + p.deal.clause));
      count++;
      sum += p.deal.wage - before;
    }
    return count ? `Clauses de montée : ${count} salaire${count > 1 ? 's' : ''} relevé${count > 1 ? 's' : ''} (+${n(sum)} € par saison au total).` : null;
  }
  if (to < from) {
    for (const p of s.players) {
      const cap = refWage(p, to);
      if (!p.deal || p.deal.wage <= cap) continue;
      sum += p.deal.wage - cap;
      p.deal.wage = cap;
      count++;
    }
    return count ? `Descente : ${count} salaire${count > 1 ? 's' : ''} ramené${count > 1 ? 's' : ''} au niveau de la ${DIVISIONS[to].name} (−${n(sum)} € par saison au total).` : null;
  }
  return null;
}
