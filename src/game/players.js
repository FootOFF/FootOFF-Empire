import { clamp, pick, ri, rnd } from './utils';
import { FIRST, LAST } from './names';
import { saleFor, signingFor, wageFor } from './economy';

// Poids (attaque, défense, mental) par poste pour la note globale
const W = { A: [0.6, 0.1, 0.3], M: [0.35, 0.25, 0.4], D: [0.15, 0.65, 0.2], G: [0.05, 0.85, 0.1] };

export function makePlayer({ level = 0, youth = false, academy = 0, pos = null } = {}) {
  const p = pos || pick(['D', 'D', 'M', 'M', 'A', 'A', 'G']);
  const age = youth ? ri(16, 18) : ri(19, 30);
  const center = youth ? 3 + academy + rnd(0, 2) : 4 + level * 2 + rnd(-1, 2);
  const pot = clamp(Math.round(center + (youth ? ri(5, 9) + academy : ri(2, 6))), 8, 20);
  const s = () => clamp(Math.round(center + rnd(-1.5, 1.5)), 1, 20);
  const base = { name: `${pick(FIRST)} ${pick(LAST)}`, pos: p, age, att: s(), def: s(), men: s(), pot };
  const bump = { A: 'att', D: 'def', G: 'def', M: 'men' }[p];
  base[bump] = clamp(base[bump] + ri(1, 2), 1, 20);
  return base;
}

// Note d'un joueur à un poste donné (un défenseur aligné en attaque est noté avec les poids de l'attaque).
// Hors de son poste, un joueur perd en efficacité : ligne voisine −12 %, ligne opposée −25 %,
// gardien ↔ joueur de champ −50 %.
const LINE = { D: 0, M: 1, A: 2 };
function positionFactor(natural, pos) {
  if (natural === pos) return 1;
  if (natural === 'G' || pos === 'G') return 0.5;
  return Math.abs(LINE[natural] - LINE[pos]) === 1 ? 0.88 : 0.75;
}

export function ratingAt(p, pos) {
  const w = W[pos];
  return (p.att * w[0] + p.def * w[1] + p.men * w[2]) * positionFactor(p.pos, pos);
}

export function playerRating(p) {
  return ratingAt(p, p.pos);
}

// Salaire annuel (voir economy.js) : suit la note du joueur et la division du club.
export const wageOf = (p, divisionIndex = 0) => wageFor(playerRating(p), divisionIndex);

export const signingFee = (p, divisionIndex = 0) => signingFor(wageOf(p, divisionIndex));
export const saleValue = (p, divisionIndex = 0) => saleFor(wageOf(p, divisionIndex));

export function starsOf(p) {
  const n = clamp(Math.round(p.pot / 4), 1, 5);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function progressPlayer(p, trainingLvl) {
  const room = Math.max(0, p.pot - playerRating(p));
  const t = 1 + trainingLvl * 0.25;
  let gain = 0;
  if (p.age <= 19) gain = room * rnd(0.3, 0.55) * t;
  else if (p.age <= 23) gain = room * rnd(0.15, 0.35) * t;
  else if (p.age <= 28) gain = room * rnd(0.04, 0.15) * t;
  const loss = p.age >= 32 ? rnd(0.4, 1.4) : 0;
  const w = W[p.pos];
  ['att', 'def', 'men'].forEach((k, i) => {
    p[k] = clamp(Math.round(p[k] + gain * w[i] - loss * w[i]), 1, 20);
  });
}

export function wantsRetirement(p) {
  return p.age >= 36 || (p.age >= 34 && Math.random() < 0.5);
}
