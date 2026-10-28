import { SQUAD_MAX, SQUAD_MIN } from './constants';
import { assignNumber, available, makePlayer, playerRating, ratingAt, refWage } from './players';
import { setDeal } from './contracts';
import { lockResale } from './mercato';
import { distinctFace } from './faces';
import { pushJournal } from './journal';
import { formationOf } from './tactics';

// Effectif minimum (0.8.4, demande du PDG) : jamais moins de SQUAD_MIN joueurs (13). Vendre ou libérer un joueur est
// refusé à 13 ; si l'effectif tombe malgré tout en dessous (fins de contrat, retraites, vente d'un ami, ancienne partie),
// le jeune le plus utile de l'académie monte d'office, sinon un amateur de secours complète l'effectif.

// Un jeune monte en équipe première : il garde la marque « formé au club » et sa saison d'arrivée à l'académie (son
// potentiel reste aussi bien cerné) ; premier contrat professionnel de trois saisons. auto : monté d'office (effectif
// sous le minimum). joined : sa première saison en équipe première (à l'intersaison, la suivante).
export function raiseYouth(s, p, { auto = false, joined = s.seasonNumber } = {}) {
  s.youth = (s.youth || []).filter((q) => q !== p);
  delete p.plan;
  delete p.gain;
  p.joined = joined;
  setDeal(s, p, { wage: refWage(p, s.divisionIndex), years: 3 + joined - s.seasonNumber }); // trois saisons à compter de son arrivée
  lockResale(s, p); // pas de vente avant quatre journées de championnat en équipe première
  assignNumber(s.players, p);
  distinctFace(s.players, p); // aucun sosie dans l'effectif
  s.players.push(p);
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: `${p.name} monte en équipe première`,
    text: auto
      ? `L’effectif tombait sous ${SQUAD_MIN} joueurs : formé à l’académie, il monte d’office à ${p.age} ans, avec le numéro ${p.num}.`
      : `Formé à l’académie, il rejoint l’effectif professionnel à ${p.age} ans, avec le numéro ${p.num}.`,
  });
  return p;
}

// Le poste le plus dégarni de l'effectif : un gardien d'abord s'il en reste moins de deux, puis la ligne la plus courte
// au regard du dispositif (un remplaçant par ligne). null : aucune ligne n'en manque.
export function thinnestLine(s) {
  const [d, m, a] = formationOf(s.formation).lines;
  const want = { G: 2, D: d + 1, M: m + 1, A: a + 1 };
  const have = { G: 0, D: 0, M: 0, A: 0 };
  for (const p of s.players) have[p.pos] += 1;
  const [pos, gap] = ['G', 'D', 'M', 'A'].map((k) => [k, want[k] - have[k]]).sort((x, y) => y[1] - x[1])[0];
  return gap > 0 ? pos : null;
}

// Le jeune le plus utile : le meilleur au poste le plus dégarni, sinon le meilleur tout court ; extra : des jeunes qui
// allaient quitter l'académie (intersaison), candidats eux aussi.
export function mostUsefulYouth(s, extra = []) {
  const pool = [...(s.youth || []), ...extra].filter((p) => available(p));
  if (!pool.length) return null;
  const pos = thinnestLine(s);
  const score = (p) => (pos ? ratingAt(p, pos) + (p.pos === pos ? 0.5 : 0) : playerRating(p));
  return pool.sort((x, y) => score(y) - score(x) || y.pot - x.pot || x.id - y.id)[0];
}

// L'effectif remis au minimum. Renvoie les phrases du bilan et les jeunes montés. joined : la saison d'arrivée des
// nouveaux (à l'intersaison, la suivante) ; extra : les jeunes sur le départ, candidats aussi.
export function ensureSquadMin(s, { joined = s.seasonNumber, extra = [] } = {}) {
  const lines = [];
  const raised = [];
  let left = [...extra];
  while (s.players.length < SQUAD_MIN && s.players.length < SQUAD_MAX) {
    const y = mostUsefulYouth(s, left);
    if (y) {
      left = left.filter((q) => q !== y);
      raiseYouth(s, y, { auto: true, joined });
      raised.push(y);
      lines.push(`${y.name} (${y.age} ans) monte d’office de l’académie : l’effectif ne descend jamais sous ${SQUAD_MIN} joueurs.`);
      continue;
    }
    const pos = thinnestLine(s) || ['G', 'D', 'M', 'A'][s.players.length % 4];
    const p = makePlayer({ level: Math.max(0, s.divisionIndex - 0.5), pos });
    p.id = s.nextId++;
    p.joined = joined;
    assignNumber(s.players, p);
    distinctFace(s.players, p); // aucun sosie dans l'effectif
    s.players.push(p);
    setDeal(s, p, { wage: refWage(p, s.divisionIndex), years: 2 + joined - s.seasonNumber }); // deux saisons pour faire ses preuves
    lines.push(`Amateur de secours : ${p.name} (${p.age} ans) complète l’effectif.`);
  }
  return { lines, raised };
}
