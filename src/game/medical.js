import { isInjured, wageOf } from './players';
import { pushJournal } from './journal';
import { book } from './ledger';
import { dateKey } from './mercato';

// Centre médical : le staff soigne les blessés et prévient les blessures. Son niveau (0 à 5) décide de tout, et la
// chance affichée d'un soin est celle qui décide (tirage au moment du soin).
// - Prévention : en match, le risque de blessure baisse de 8 % par niveau (live.js) : kinés, préparation, récupération.
// - Soins : entre deux matchs, un soin par joueur blessé et par date, payé (15 % de son salaire annuel). Réussi, il
//   retire un match d'absence : un joueur à qui il ne restait qu'un match est guéri, disponible pour le prochain. La
//   chance monte avec le niveau et baisse avec la gravité (un coup se soigne mieux qu'une fracture). Raté, l'argent
//   est dépensé et la blessure suit son cours ; un nouveau soin est possible à la date suivante.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const injuryCut = (lvl) => 0.08 * lvl;
// chance d'un soin, en centièmes exacts : niveau du centre, matchs d'absence restants
export const treatPct = (lvl, out) => (lvl > 0 ? clamp(32 + 9 * lvl - 5 * (out - 1), 10, 85) : 0);
export const treatChance = (s, p) => (isInjured(p) ? treatPct(s.buildings.medical || 0, p.injury.out) / 100 : 0);
export const treatFee = (s, p) => Math.max(100, Math.round((wageOf(p, s.divisionIndex) * 0.15) / 50) * 50);
export const treatedToday = (s, p) => p.treated?.at === dateKey(s);
export const treatOpen = (s, p) => (s.buildings.medical || 0) > 0 && isInjured(p) && !treatedToday(s, p);

// Soin d'un joueur blessé (action du jeu, écran du centre médical) : l'état, ou null si impossible. Résultat dans
// s.lastTreatment.
export function treatPlayer(s, id) {
  const p = s.players.find((q) => q.id === id);
  if (!p || !treatOpen(s, p)) return null;
  const fee = treatFee(s, p);
  if (s.money < fee) return null;
  const chance = treatChance(s, p);
  const before = p.injury.out;
  s.money -= fee;
  book(s, 'medical', fee);
  const ok = Math.random() < chance;
  p.treated = { at: dateKey(s), ok, before }; // soin du jour : un seul par date, et sa réponse pour l'écran
  if (ok) {
    p.injury.out -= 1;
    if (p.injury.out <= 0) delete p.injury;
    pushJournal(s, {
      season: s.seasonNumber, round: s.round, kind: 'club',
      title: p.injury ? `Soins réussis : ${p.name} revient un match plus tôt` : `${p.name} est guéri`,
      text: p.injury ? `Encore ${p.injury.out} match${p.injury.out > 1 ? 's' : ''} d’absence au lieu de ${before}.` : 'Le centre médical l’a remis sur pied : il est disponible pour le prochain match.',
    });
  }
  s.lastTreatment = { id: p.id, ok, fee, chance, before, after: p.injury?.out || 0, at: Date.now() };
  return s;
}
