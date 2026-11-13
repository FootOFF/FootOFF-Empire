import { clamp } from './utils';
import { ratingAt } from './players';
import { detailsOf } from './attributes';
import { t } from '../i18n/index';

// Postes façon Football Manager (1.0.41, PDG 13/11 : « placer les joueurs où on veut pour créer le dispositif que l'on
// souhaite avec liberté » ; ses choix : une grille de postes, des postes complets, partout dès ce soir).
// Le terrain est une grille de 5 lignes (de la défense à l'attaque) × 5 couloirs (gauche, trois au centre, droite), plus
// le gardien : 26 postes. Un dispositif est le gardien et 10 postes de la grille, chacun occupé par un joueur.
// Chaque poste a sa note : celle de sa ligne (players.js, ratingAt : défense, milieu ou attaque, avec la pénalité d'un
// joueur hors de sa ligne), plus ce que le profil du joueur (attributs sur 20 de la fiche, attributes.js) apporte ou
// retire à ce poste précis par rapport à sa ligne : un ailier rapide et bon dribbleur gagne sur le côté, un défenseur
// lent perd en latéral, un meneur a besoin de vision. Les dispositifs tout faits (433, 442…) sont des postes de la grille.

export const ROWS = 5;
export const COLS = 5;
// type de poste de chaque case, et sa ligne pour le moteur (G, D, M, A)
const GRID = [
  ['DG', 'DC', 'DC', 'DC', 'DD'],
  ['DLG', 'MDC', 'MDC', 'MDC', 'DLD'],
  ['MG', 'MC', 'MC', 'MC', 'MD'],
  ['MOG', 'MOC', 'MOC', 'MOC', 'MOD'],
  ['ATG', 'BT', 'BT', 'BT', 'ATD'],
];
export const POST_LINE = Object.freeze({
  G: 'G', DG: 'D', DC: 'D', DD: 'D', DLG: 'D', DLD: 'D', MDC: 'M', MG: 'M', MC: 'M', MD: 'M', MOG: 'M', MOC: 'M', MOD: 'M',
  ATG: 'A', BT: 'A', ATD: 'A',
});
export const POST_NAMES = Object.freeze({
  G: t('Gardien de but', undefined, 'poste'),
  DG: t('Défenseur gauche'), DC: t('Défenseur central'), DD: t('Défenseur droit'),
  DLG: t('Défenseur latéral gauche'), MDC: t('Milieu défensif central'), DLD: t('Défenseur latéral droit'),
  MG: t('Milieu gauche'), MC: t('Milieu central'), MD: t('Milieu droit'),
  MOG: t('Milieu offensif gauche'), MOC: t('Milieu offensif central'), MOD: t('Milieu offensif droit'),
  ATG: t('Attaquant gauche'), BT: t('Buteur', undefined, 'poste'), ATD: t('Attaquant droit'),
});
// sigle sur le terrain : ceux de Football Manager en français (PDG, 13/11 : « la même terminologie que sur FM »).
// Les deux attaquants de côté (ATG, ATD) n'existent pas dans FM, où la ligne d'attaque n'a que trois buteurs : gardés
// sous ce nom (décision du PDG, 13/11), la grille exacte de FM pourra venir ensuite.
export const POST_SHORT = Object.freeze({
  G: t('GB', undefined, 'poste'),
  DG: t('DG', undefined, 'poste'), DC: t('DC', undefined, 'poste'), DD: t('DD', undefined, 'poste'),
  DLG: t('DLG', undefined, 'poste'), MDC: t('MDC', undefined, 'poste'), DLD: t('DLD', undefined, 'poste'),
  MG: t('MG', undefined, 'poste'), MC: t('MC', undefined, 'poste'), MD: t('MD', undefined, 'poste'),
  MOG: t('MOG', undefined, 'poste'), MOC: t('MOC', undefined, 'poste'), MOD: t('MOD', undefined, 'poste'),
  ATG: t('ATG', undefined, 'poste'), BT: t('BT', undefined, 'poste'), ATD: t('ATD', undefined, 'poste'),
});

// Ce que demande chaque poste (attributs de attributes.js, poids de somme 1)
const NEEDS = {
  DC: { marquage: 0.2, tacles: 0.18, jeuAerien: 0.14, placement: 0.14, anticipation: 0.1, puissance: 0.08, concentration: 0.08, sangFroid: 0.04, vitesse: 0.04 },
  DG: { tacles: 0.16, marquage: 0.12, vitesse: 0.14, acceleration: 0.1, endurance: 0.12, centres: 0.12, placement: 0.1, activite: 0.08, passes: 0.06 },
  DLG: { endurance: 0.16, centres: 0.14, vitesse: 0.12, acceleration: 0.1, activite: 0.12, tacles: 0.1, dribble: 0.08, passes: 0.08, deplacements: 0.1 },
  MDC: { tacles: 0.16, placement: 0.16, passes: 0.12, anticipation: 0.12, marquage: 0.1, concentration: 0.1, decisions: 0.1, activite: 0.08, puissance: 0.06 },
  MG: { centres: 0.16, passes: 0.14, endurance: 0.14, activite: 0.12, dribble: 0.1, vitesse: 0.1, deplacements: 0.1, collectif: 0.08, technique: 0.06 },
  MC: { passes: 0.2, vision: 0.14, decisions: 0.12, controle: 0.1, endurance: 0.1, activite: 0.1, collectif: 0.1, technique: 0.08, placement: 0.06 },
  MOG: { dribble: 0.18, acceleration: 0.14, vitesse: 0.12, centres: 0.14, technique: 0.1, inspiration: 0.1, agilite: 0.08, controle: 0.08, deplacements: 0.06 },
  MOC: { vision: 0.18, passes: 0.16, technique: 0.12, controle: 0.12, inspiration: 0.1, decisions: 0.1, dribble: 0.08, tirsLoin: 0.08, deplacements: 0.06 },
  ATG: { finition: 0.18, dribble: 0.14, acceleration: 0.14, deplacements: 0.12, controle: 0.1, sangFroid: 0.08, technique: 0.08, vitesse: 0.08, tirsLoin: 0.08 },
  BT: { finition: 0.24, deplacements: 0.14, sangFroid: 0.12, controle: 0.1, jeuAerien: 0.1, puissance: 0.08, anticipation: 0.08, acceleration: 0.08, technique: 0.06 },
};
NEEDS.DD = NEEDS.DG; NEEDS.DLD = NEEDS.DLG; NEEDS.MD = NEEDS.MG; NEEDS.MOD = NEEDS.MOG; NEEDS.ATD = NEEDS.ATG;
// postes de référence de chaque ligne : la note d'un poste est comparée à leur moyenne
const ANCHORS = { D: ['DC', 'DG'], M: ['MDC', 'MC', 'MOC', 'MG', 'MOG'], A: ['BT', 'ATG'] };
const LEFT = new Set(['DG', 'DLG', 'MG', 'MOG', 'ATG']);
const RIGHT = new Set(['DD', 'DLD', 'MD', 'MOD', 'ATD']);
const CUT_IN = new Set(['MOG', 'MOD', 'ATG', 'ATD']); // milieux offensifs et attaquants de côté : le mauvais pied pour rentrer, c'est permis

// attributs détaillés d'un joueur, gardés le temps qu'ils ne changent pas (progression, âge)
const memo = new Map();
function fmOf(p) {
  const key = `${p.id ?? p.name}|${p.age}|${p.pos}|${p.a ? Object.values(p.a).join(',') : ''}|${(p.traits || []).join(',')}`;
  let d = memo.get(key);
  if (!d) {
    if (memo.size > 4000) memo.clear();
    d = {};
    for (const c of detailsOf(p).cats) for (const r of c.rows) d[r.key] = r.v;
    memo.set(key, d);
  }
  return d;
}
const score = (fm, type) => { let s = 0; for (const [k, w] of Object.entries(NEEDS[type])) s += w * (fm[k] ?? 10); return s; };
// profil du joueur pour ce poste, comparé aux postes de sa ligne (brut, avant calage)
export function postProfile(p, type) {
  const fm = fmOf(p);
  const anchors = ANCHORS[POST_LINE[type]];
  const mean = anchors.reduce((s, a) => s + score(fm, a), 0) / anchors.length;
  return score(fm, type) - mean;
}
// calage : l'écart moyen d'un joueur ordinaire de la ligne à chaque poste (tools/sim/postes.mjs, 6 000 joueurs) ; retiré,
// un joueur ordinaire vaut à chaque poste la note de sa ligne, et seul ce qui le distingue compte
const BIAS = { DC: 0.632, DG: -0.632, DD: -0.632, DLG: -1.365, DLD: -1.365, MDC: -0.325, MG: 0.192, MD: 0.192, MC: 0.336, MOG: -0.364, MOD: -0.364, MOC: 0.162, ATG: 0.156, ATD: 0.156, BT: -0.156 };
const GAIN = 1.2; // poids du profil : environ un demi-point de note entre un joueur taillé pour le poste et un autre
// ce que le poste apporte ou retire au joueur par rapport à sa ligne, en points de note
export function postDelta(p, type) {
  if (type === 'G' || !p?.a || p.pos === 'G') return 0;
  let d = GAIN * (postProfile(p, type) - (BIAS[type] || 0));
  // le pied : un gaucher sur le côté gauche, un droitier sur le côté droit
  const side = LEFT.has(type) ? 'gauche' : RIGHT.has(type) ? 'droit' : null;
  if (side) d += p.foot === side ? 0.2 : p.foot === 'les deux' ? 0.15 : CUT_IN.has(type) ? 0 : -0.15;
  return clamp(d, -2.5, 2);
}
// note d'un joueur à un poste de la grille (type de poste : 'DC', 'MOG'…)
export function ratingAtPost(p, type) {
  const line = POST_LINE[type] || 'M';
  const base = ratingAt(p, line);
  return line === 'G' ? base : Math.max(1, base + postDelta(p, type));
}

// Cases de la grille : « rc » (ligne, couloir) ; le gardien : « G »
export const cellOf = (key) => (key === 'G' ? null : { r: Number(key[0]), c: Number(key[1]) });
export const typeOf = (key) => (key === 'G' ? 'G' : GRID[Number(key[0])]?.[Number(key[1])] || 'MC');
export const ALL_CELLS = Object.freeze(Array.from({ length: ROWS * COLS }, (_, i) => `${Math.floor(i / COLS)}${i % COLS}`));
// position d'une case sur le schéma (en %, attaque vers le haut, comme FORMATIONS.pitch) : les côtés un peu plus haut
// que l'axe en défense, un peu plus bas devant
const XS = [12, 31, 50, 69, 88];
const YS = [[66, 71], [56, 57], [44, 47], [29, 31], [18, 13]];
export function cellPitch(key) {
  if (key === 'G') return [50, 90];
  const { r, c } = cellOf(key);
  const wide = c === 0 || c === COLS - 1;
  return [XS[c], YS[r][wide ? 0 : 1]];
}
// ordre des postes d'un dispositif : le gardien, puis la défense, le milieu, l'attaque (l'ordre de slotsOf), chaque
// ligne de l'arrière vers l'avant, de gauche à droite
const LINE_ORDER = { G: 0, D: 1, M: 2, A: 3 };
export function sortCells(keys) {
  return [...keys].sort((a, b) => {
    const la = LINE_ORDER[POST_LINE[typeOf(a)]], lb = LINE_ORDER[POST_LINE[typeOf(b)]];
    if (la !== lb) return la - lb;
    if (a === 'G' || b === 'G') return 0;
    return a[0] - b[0] || a[1] - b[1];
  });
}
const valid = (keys) => keys.length === 10 && new Set(keys).size === 10 && keys.every((k) => /^[0-4][0-4]$/.test(k));
export const linesOf = (keys) => {
  const n = { D: 0, M: 0, A: 0 };
  for (const k of keys) n[POST_LINE[typeOf(k)]]++;
  return [n.D, n.M, n.A];
};
export const usable = (keys) => { const [d, m, a] = linesOf(keys); return valid(keys) && d > 0 && m > 0 && a > 0; };
// nom du dispositif, comme on le dit : 4-2-3-1, 3-4-2-1, 4-1-4-1 (la défense et ses pistons, puis chaque ligne du milieu,
// puis l'attaque)
export function shapeName(keys) {
  const row = (r, types) => keys.filter((k) => k[0] === String(r) && (!types || types.includes(typeOf(k)))).length;
  const parts = [row(0) + row(1, ['DLG', 'DLD']), row(1, ['MDC']), row(2), row(3), row(4)].filter((n, i) => n > 0 || i === 0);
  return parts.join('-');
}
// effet sur les occasions d'un dispositif libre (les six tout faits gardent les leurs) : plus d'attaquants ouvre le match
// des deux côtés, plus de défenseurs le ferme (ajusté sur les six : 4-3-3 1, 4-4-2 0,96, 3-4-3 1,12, 5-3-2 0,86…)
export function shapeOpenness(keys) {
  const [d, , a] = linesOf(keys);
  return clamp(1 + 0.04 * (a - 3) - 0.11 * (d - 4), 0.84, 1.14);
}
// identifiant d'un dispositif libre : « g: » suivi des 10 cases dans l'ordre des postes
export const gridId = (keys) => `g:${sortCells(keys).join('')}`;
const cache = new Map();
export function gridFormation(id) {
  if (typeof id !== 'string' || !/^g:[0-4]{20}$/.test(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const keys = id.slice(2).match(/../g);
  if (!usable(keys) || gridId(keys) !== id) { cache.set(id, null); return null; }
  const sorted = sortCells(keys);
  const open = shapeOpenness(sorted);
  const f = Object.freeze({
    id, name: shapeName(sorted), custom: true, lines: linesOf(sorted), for: open, against: open,
    cells: Object.freeze(['G', ...sorted]),
    posts: Object.freeze(['G', ...sorted.map(typeOf)]),
    pitch: Object.freeze(['G', ...sorted].map(cellPitch)),
    blurb: t('Ton dispositif, poste par poste.'),
  });
  cache.set(id, f);
  return f;
}
