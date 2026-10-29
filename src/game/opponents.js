import { distinctFace, hash, rng } from './faces';
import { squadName } from './names';
import { assignNumber, makePlayer } from './players';
import { slotsOf } from './tactics';
import { t } from '../i18n/index';

// Onze adverse (0.7) : de vrais joueurs (noms, postes, numéros, âge, qualités, signes, visages) au niveau de
// l'adversaire, les mêmes à chaque rencontre avec ce club pendant la saison : ils sont tirés d'une graine (le club et la
// saison), sans toucher aux noms ni au hasard de la partie. Le moteur du match compte encore les occasions adverses sur
// le niveau du club (ctx.opp.strength) ; ces joueurs donnent les buteurs, les cartons, les notes du match, les visages
// et les numéros de la 3D. Opposer deux effectifs réels (ligue entre amis) partira de là.

// fn sous un hasard tiré de la graine (Math.random rendu ensuite tel quel, même en cas d'erreur)
export function seeded(seed, fn) {
  const saved = Math.random;
  Math.random = rng(seed);
  try { return fn(); } finally { Math.random = saved; }
}

// Dispositif du club adverse : le 4-3-3 le plus souvent, les autres selon le club.
const OPP_FORMATIONS = [['433', 4], ['442', 3], ['4231', 3], ['352', 1], ['343', 1], ['532', 1]];

export function opponentEleven(s, opp) {
  const taken = new Set((s.players || []).map((p) => p.name));
  return seeded(hash(`${opp.name}|${s.seasonNumber || 1}|onze`), () => {
    let r = Math.random() * OPP_FORMATIONS.reduce((a, [, w]) => a + w, 0);
    const formation = (OPP_FORMATIONS.find(([, w]) => (r -= w) < 0) || OPP_FORMATIONS[0])[0];
    const lasts = new Set();
    // une note autour du niveau du club (makePlayer : note ≈ 5,3 + 2 × level), chacun un peu au-dessus ou en dessous
    const level = ((opp.strength || 8) - 5.3) / 2;
    const players = [];
    for (const pos of slotsOf(formation)) {
      const p = makePlayer({ level: level + (Math.random() - 0.5) * 0.7, pos, name: squadName(taken, lasts) });
      taken.add(p.name);
      assignNumber(players, p);
      distinctFace(players, p);
      players.push(p);
    }
    return { formation, players };
  });
}
