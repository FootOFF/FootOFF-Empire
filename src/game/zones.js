import { clamp } from './utils';
import { detailsOf } from './attributes';
import { formationOf } from './tactics';
import { typeOf } from './posts';

// Moteur de match à zones (1.0.49, moteur des ligues 7). Demande du PDG (13/11) : « que mon jeu soit une référence
// comme Football Manager 27 tactiquement » ; ses choix : le moteur d'abord, des rôles façon FM26/27 ensuite, toute la
// tactique dans les ligues entre amis, et ses choix du 12/11 gardés (effet immédiat des consignes, pas de familiarité,
// pas de jauge, pas d'adjoint, joueurs égaux dans un même rôle).
//
// Le terrain est découpé en 9 zones : 3 tiers (le sien, le milieu, le dernier tiers) × 3 couloirs (gauche, axe, droite,
// vus de l'équipe qui attaque). Le ballon passe de zone en zone, phase après phase : construction dans son tiers,
// progression au milieu, finition dans le dernier tiers, et les transitions quand il change de camp (récupération haute
// d'un pressing, contre-attaque, contre-pressing). Chaque minute compte K phases ; la possession est le temps passé avec
// le ballon.
// Chaque phase oppose, dans la zone du ballon, les joueurs de l'équipe qui attaque à ceux qui défendent : leur nombre
// (le dispositif place chaque poste dans les zones, avec et sans ballon), le niveau des deux onze, le profil des joueurs
// concernés (relance, pressing, vitesse, jeu aérien, centres, dribble, vision, solidité, frappe de loin) et les consignes
// des deux équipes (pressing, ligne défensive, largeur, tempo, jeu direct, contre-attaque, contre-pressing).
// Les occasions naissent de ces phases, chacune avec son couloir et son type d'action (centre, ouverture, contre…).
// Ce module ne tire aucun hasard lui-même : les tables de transition sont des probabilités ; live.js les tire avec
// Math.random (rendu déterministe par la graine d'un match de ligue).

// --- Consignes -------------------------------------------------------------------------------------------------------
// Chaque consigne a 5 crans (1 très bas … 5 très haut, 3 = neutre), comme le tableau tactique (tacticboard.jsx).
// Les trois tactiques sont des préréglages : le mode expert réglera chaque cran (étape suivante).
export const INSTR_KEYS = Object.freeze(['press', 'line', 'width', 'tempo', 'direct', 'counter', 'cpress']);
export const PLAN_PRESETS = Object.freeze(Object.assign(Object.create(null), {
  // pressing haut, ligne haute, latéraux projetés, on joue vite et on reprend le ballon tout de suite
  offensive: Object.freeze({ press: 4, line: 4, width: 4, tempo: 4, direct: 3, counter: 3, cpress: 4 }),
  // bloc médian, transitions maîtrisées : tout au cran du milieu
  balanced: Object.freeze({ press: 3, line: 3, width: 3, tempo: 3, direct: 3, counter: 3, cpress: 3 }),
  // bloc bas resserré, on se replie à la perte et on contre vite, en direct
  low: Object.freeze({ press: 2, line: 2, width: 2, tempo: 3, direct: 4, counter: 5, cpress: 1 }),
}));
export function instructionsOf(plan) {
  if (plan && typeof plan === 'object') {
    const o = {};
    for (const k of INSTR_KEYS) o[k] = clamp(Math.round(Number(plan[k]) || 3), 1, 5);
    return o;
  }
  return PLAN_PRESETS[plan] || PLAN_PRESETS.balanced;
}

// --- Paramètres du moteur (calés sur tools/sim/zones.mjs) --------------------------------------------------------------
export const Z = {
  K: 5, // phases par minute de jeu
  prof: 3.5, // poids du profil des joueurs (ce qui les distingue d'un joueur ordinaire de leur ligne)
  lvl: 0.135, // poids de l'écart de niveau (par point de note) dans les duels de la construction et de la progression
  lvlF: 0.12, // … et dans la finition
  weak: 0.09, // nettement plus faible : occasions encore raréfiées (par point d'écart, au carré)
  home: 0.27, // avantage du terrain, en points de note
  // construction (son tiers) : perte sous le pressing adverse
  b0: -1.25, bN: 0.6, bBuild: 0.3, bPress: 0.2,
  long0: 0.045, longDirect: 0.6, longPressed: 0.25, // jeu long
  fwd0: 0.5, // part des phases de construction qui avancent au milieu (neutre)
  pressShot: 0.022, // récupération haute : occasion immédiate
  // progression (milieu)
  l1: -2.0, l1N: 0.45, l1Vision: 0.22, l1Wall: 0.2,
  thr: 0.02, thrOk: -2.3, thrLine: 0.45, thrPace: 0.25, // ouverture dans le dos de la défense (tentative, réussite)
  fwd1: 0.4,
  regain: 0.1, // contre-pressing : ballon repris dans la foulée
  ctr1: -1.6, ctr2: -2.6, ctrInstr: 0.06, ctrCommit: 0.5, ctrLine: 0.3, // départ d'un contre après une perte au milieu, ou dans le dernier tiers
  // finition (dernier tiers)
  ch: 0.026, chN: 0.75, // occasion construite
  l2: -1.5, l2N: 0.6, l2Wall: 0.25,
  spWide: 0.07, spAxis: 0.04, spShotWide: 0.11, spShotAxis: 0.18, // corners, coups francs
  back2: 0.1,
  // contre-attaque lancée
  cch: -2.6, cchLine: 0.3,
};

// --- Postes dans les zones ----------------------------------------------------------------------------------------------
// Part du temps qu'un poste passe dans chaque tiers (son tiers, le milieu, le dernier tiers), avec le ballon (ATT) et sans
// (DEF, vu de l'équipe qui défend : son propre tiers d'abord).
const ATT_T = {
  DC: [0.86, 0.14, 0], DG: [0.5, 0.38, 0.12], DLG: [0.26, 0.46, 0.28], MDC: [0.42, 0.52, 0.06], MG: [0.08, 0.5, 0.42],
  MC: [0.14, 0.6, 0.26], MOG: [0, 0.34, 0.66], MOC: [0, 0.4, 0.6], ATG: [0, 0.2, 0.8], BT: [0, 0.14, 0.86],
};
const DEF_T = {
  DC: [0.84, 0.16, 0], DG: [0.72, 0.25, 0.03], DLG: [0.56, 0.38, 0.06], MDC: [0.52, 0.43, 0.05], MG: [0.3, 0.55, 0.15],
  MC: [0.28, 0.57, 0.15], MOG: [0.12, 0.53, 0.35], MOC: [0.1, 0.55, 0.35], ATG: [0.08, 0.47, 0.45], BT: [0.03, 0.37, 0.6],
};
for (const [a, b] of [['DD', 'DG'], ['DLD', 'DLG'], ['MD', 'MG'], ['MOD', 'MOG'], ['ATD', 'ATG']]) { ATT_T[a] = ATT_T[b]; DEF_T[a] = DEF_T[b]; }
const BACK = new Set(['DC', 'DG', 'DD', 'DLG', 'DLD', 'MDC']);
const FULLBACK = new Set(['DG', 'DD', 'DLG', 'DLD']);
const MIDS = new Set(['MG', 'MC', 'MD']);
const FRONT = new Set(['MOG', 'MOC', 'MOD', 'ATG', 'BT', 'ATD']);
// déplace une part du tiers a vers le tiers b (négatif : de b vers a), sans rendre une part négative
function shift(arr, a, b, amt) {
  if (amt >= 0) { const x = Math.min(amt, arr[a]); arr[a] -= x; arr[b] += x; } else { const x = Math.min(-amt, arr[b]); arr[b] -= x; arr[a] += x; }
}
function attThirds(type, I) {
  const a = [...(ATT_T[type] || ATT_T.MC)];
  if (BACK.has(type)) shift(a, 0, 1, 0.04 * (I.line - 3));
  if (FULLBACK.has(type)) shift(a, 1, 2, 0.05 * (I.width - 3));
  if (MIDS.has(type) || FRONT.has(type)) shift(a, 1, 2, 0.02 * (I.tempo - 3));
  if (I.line < 3 && (MIDS.has(type) || FULLBACK.has(type))) shift(a, 1, 2, -0.14 * (3 - I.line)); // bloc bas : on attaque à peu
  if (I.line < 3 && FRONT.has(type)) shift(a, 1, 2, -0.04 * (3 - I.line));
  return a;
}
function defThirds(type, I) {
  const d = [...(DEF_T[type] || DEF_T.MC)];
  if (BACK.has(type)) shift(d, 0, 1, (I.line < 3 ? 0.06 : 0.08) * (I.line - 3));
  if (MIDS.has(type)) { shift(d, 1, 2, 0.04 * (I.press - 3)); if (I.line < 3) shift(d, 1, 0, 0.07 * (3 - I.line)); }
  if (FRONT.has(type)) { shift(d, 1, 2, 0.07 * (I.press - 3)); if (I.line < 3) shift(d, 1, 0, 0.04 * (3 - I.line)); }
  return d;
}
// couloirs d'une colonne de la grille (0 gauche … 4 droite), avec et sans ballon, selon la largeur
function lanesOf(c, w, attack, front = false) {
  if (c === 2) return [0, 1, 0];
  const side = c < 2 ? 0 : 2;
  let inside;
  if (c === 0 || c === 4) inside = attack ? (front ? 0.22 : 0) + 0.08 * Math.max(0, 3 - w) : 0.05 + 0.08 * Math.max(0, 3 - w); // un ailier rentre dans l'axe
  else inside = attack ? 1 - clamp(0.25 + 0.07 * (w - 3), 0.05, 0.45) : 1 - clamp(0.2 + 0.05 * (w - 3), 0.05, 0.4);
  const out = [0, 0, 0];
  out[side] = 1 - inside;
  out[1] = inside;
  return out;
}

// --- Profil des joueurs -------------------------------------------------------------------------------------------------
// attributs détaillés (sur 20) d'un joueur, gardés tant qu'il ne change pas
const detMemo = new Map();
function det(p) {
  const key = `${p.id ?? ''}|${p.name || ''}|${p.age}|${p.pos}|${p.a ? Object.values(p.a).join(',') : ''}|${p.g ? Object.values(p.g).join(',') : ''}|${(p.traits || []).join(',')}`;
  let d = detMemo.get(key);
  if (!d) {
    if (detMemo.size > 6000) detMemo.clear();
    d = {};
    for (const c of detailsOf(p).cats) for (const r of c.rows) d[r.key] = r.v;
    detMemo.set(key, d);
  }
  return d;
}
const v = (d, k) => d[k] ?? 10;
function skillsOf(p) {
  const d = det(p);
  return {
    build: 0.5 * v(d, 'passes') + 0.25 * v(d, 'sangFroid') + 0.25 * v(d, 'decisions'), // relancer sous pression
    press: 0.35 * v(d, 'activite') + 0.25 * v(d, 'endurance') + 0.2 * v(d, 'acceleration') + 0.2 * v(d, 'anticipation'), // presser
    pace: 0.55 * v(d, 'vitesse') + 0.45 * v(d, 'acceleration'),
    air: 0.7 * v(d, 'jeuAerien') + 0.3 * v(d, 'detente'),
    cross: v(d, 'centres'),
    drib: 0.6 * v(d, 'dribble') + 0.2 * v(d, 'agilite') + 0.2 * v(d, 'technique'),
    vision: 0.5 * v(d, 'vision') + 0.3 * v(d, 'passes') + 0.2 * v(d, 'controle'),
    wall: 0.3 * v(d, 'tacles') + 0.3 * v(d, 'marquage') + 0.25 * v(d, 'placement') + 0.15 * v(d, 'concentration'),
    shoot: v(d, 'tirsLoin'),
  };
}
const coreOf = (p) => { const a = Object.values(p?.a || {}).filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 10; };
// profil ordinaire d'un joueur de chaque ligne (moyenne de 4 000 joueurs tirés comme ceux du jeu, à tous les niveaux) :
// un défenseur tacle mieux qu'il ne dribble, un milieu voit le jeu, un attaquant frappe. Le profil d'un joueur, c'est ce
// qui le distingue d'un joueur ordinaire de sa ligne : ni le niveau (l'écart de niveau compte déjà), ni la composition
// du onze (cinq défenseurs ne font pas un « mur » de plus : leur nombre compte déjà dans les zones).
const POSBASE = {
  D: { build: -0.46, press: -0.26, pace: -0.28, air: 1.54, cross: -0.83, drib: -1.54, vision: -0.94, wall: 2.38, shoot: -1.46 },
  M: { build: 1.08, press: 0.41, pace: -0.44, air: -1.52, cross: 2.04, drib: 0.16, vision: 1.86, wall: -0.12, shoot: -0.47 },
  A: { build: -0.12, press: -0.62, pace: 0.56, air: -0.19, cross: -0.47, drib: 0.77, vision: -0.21, wall: -1.08, shoot: 2.46 },
};
const GK_BASE = -0.93; // relance du gardien (jeu au pied, dégagement) comparée à ses qualités de gardien
const BASE = { build: 0, press: 0, pace: 0, defPace: 0, air: 0, defAir: 0, crossL: 0, crossR: 0, drib: 0, vision: 0, wall: 0, shoot: 0 };
export const Q_KEYS = Object.keys(BASE);

// --- Modèle d'une équipe ------------------------------------------------------------------------------------------------
// eleven : [{ p, type, c }] des joueurs de champ sur le terrain (type de poste, colonne de la grille) ; keeper : le gardien
// (ou null) ; plan : tactique ou consignes. Le modèle fixe (couloirs, tiers, profil) ne dépend que du onze et des
// consignes ; la fatigue s'applique minute par minute (teamAt).
export function teamStatic(eleven, keeper, plan) {
  const I = instructionsOf(plan);
  const rows = eleven.map(({ p, type, c }) => ({
    p, type,
    at: attThirds(type, I), dt: defThirds(type, I),
    al: lanesOf(c, I.width, true, FRONT.has(type)), dl: lanesOf(c, I.width, false),
    sk: p ? skillsOf(p) : null, core: p ? coreOf(p) : null,
    front: FRONT.has(type), back: BACK.has(type),
  }));
  const withP = rows.filter((r) => r.sk);
  for (const r of withP) {
    const pb = POSBASE[r.p.pos] || POSBASE.D;
    r.rel = {};
    for (const k in r.sk) r.rel[k] = r.sk[k] - r.core - (pb[k] || 0);
  }
  const teamCore = withP.length ? withP.reduce((s, r) => s + r.core, 0) / withP.length : 10;
  const Q = {};
  const mean = (key, w) => {
    let sw = 0, sv = 0;
    for (const r of withP) { const x = w(r); if (x > 0) { sw += x; sv += x * r.rel[key]; } }
    return sw ? sv / sw : 0;
  };
  let gkRel = null;
  if (keeper?.g) {
    const gk = det(keeper);
    const gv = Object.values(keeper.g).filter(Number.isFinite);
    gkRel = 0.6 * v(gk, 'jeuPied') + 0.4 * v(gk, 'degagement') - gv.reduce((a, b) => a + b, 0) / (gv.length || 1) - GK_BASE;
  }
  const buildBase = mean('build', (r) => r.at[0]);
  Q.build = gkRel === null ? buildBase : (buildBase * 3 + gkRel) / 4;
  Q.press = mean('press', (r) => r.dt[2]);
  Q.pace = mean('pace', (r) => r.at[2]);
  Q.defPace = mean('pace', (r) => (r.back ? r.dt[0] : 0));
  Q.air = mean('air', (r) => r.at[2] * r.al[1]);
  Q.defAir = mean('air', (r) => r.dt[0] * r.dl[1]);
  Q.crossL = mean('cross', (r) => (r.at[1] + r.at[2]) * r.al[0]);
  Q.crossR = mean('cross', (r) => (r.at[1] + r.at[2]) * r.al[2]);
  Q.drib = mean('drib', (r) => r.at[2]);
  Q.vision = mean('vision', (r) => r.at[1]);
  Q.wall = mean('wall', (r) => r.dt[0] + 0.5 * r.dt[1]);
  Q.shoot = mean('shoot', (r) => r.at[1] + r.at[2]);
  const raw = { ...Q };
  for (const k of Q_KEYS) Q[k] = withP.length ? clamp((Q[k] - BASE[k]) * Z.prof, -6, 6) : 0;
  return { I, rows, Q, raw, teamCore };
}
// onze d'un dispositif : players dans l'ordre des postes (null : poste vide), off : joueurs sortis (expulsés, blessés)
export function elevenOf(players, formation, off = null) {
  const f = formationOf(formation);
  const out = [];
  let keeper = null;
  f.cells.forEach((cell, k) => {
    const p = players[k] ?? null;
    if (cell === 'G') { keeper = p && !(off && off.has(p)) ? p : null; return; }
    if (!p || (off && off.has(p))) return; // poste vide : personne dans ses zones
    out.push({ p, type: typeOf(cell), c: Number(cell[1]) });
  });
  return { eleven: out, keeper };
}
// onze ordinaire d'un dispositif (adversaire dont on ne connaît pas les joueurs) : présence des postes, profil neutre
export function neutralStatic(formation, plan) {
  const f = formationOf(formation);
  const eleven = f.cells.filter((c) => c !== 'G').map((cell) => ({ p: null, type: typeOf(cell), c: Number(cell[1]) }));
  return teamStatic(eleven, null, plan);
}
// Modèle d'une minute : présence dans les zones (fatigue comprise : un joueur épuisé couvre moins de terrain), pressing
// qui s'use, niveau du onze. fit(p) : facteur de condition du joueur (0,85 à 1), absent : 1.
export function teamAt(st, level, fit = null) {
  const ATT = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const DEF = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let frontFit = 0, frontW = 0;
  for (const r of st.rows) {
    const f = r.p && fit ? fit(r.p) : 1;
    const k = 0.4 + 0.6 * ((f - 0.85) / 0.15); // 1 en pleine forme, 0,4 épuisé
    const kk = clamp(0.85 + 0.15 * k, 0.85, 1);
    for (let t = 0; t < 3; t++) for (let l = 0; l < 3; l++) { ATT[t][l] += kk * r.at[t] * r.al[l]; DEF[t][l] += kk * r.dt[t] * r.dl[l]; }
    if (r.dt[2] > 0) { frontFit += r.dt[2] * k; frontW += r.dt[2]; }
  }
  const I = st.I;
  const tired = frontW ? 1 - frontFit / frontW : 0; // 0 frais … 0,6 épuisé
  const pressFit = clamp((1 + 0.12 * st.Q.press) * (1 - 0.55 * tired), 0.4, 1.5);
  const commit = ATT[2][0] + ATT[2][1] + ATT[2][2];
  return { st, I, Q: st.Q, ATT, DEF, level, pressFit, commit };
}

// --- Tables de transition -----------------------------------------------------------------------------------------------
// États : camp qui a le ballon (0 : le club qui reçoit, 1 : le visiteur) × zone (tiers × 3 + couloir), plus un contre
// lancé dans chaque couloir : 2 × 12 = 24 états.
export const N_STATES = 24;
export const stateOf = (side, t, l) => side * 12 + t * 3 + l;
export const counterState = (side, l) => side * 12 + 9 + l;
export const sideOfState = (st) => (st >= 12 ? 1 : 0);
export const zoneOfState = (st) => { const z = st % 12; return z >= 9 ? { t: 1, l: z - 9, counter: true } : { t: Math.floor(z / 3), l: z % 3, counter: false }; };
const sig = (x) => 1 / (1 + Math.exp(-x));
const PRESS_E = [0.12, 0.3, 0.5, 0.66, 0.82]; // pressing : part des relances adverses attaquées, selon le cran
const WIDTH_W = [[0.2, 0.6, 0.2], [0.25, 0.5, 0.25], [0.3, 0.4, 0.3], [0.35, 0.3, 0.35], [0.4, 0.2, 0.4]];
// joueurs autour du ballon dans un couloir : le couloir, à 35 % les couloirs voisins, à 10 % l'autre côté
const near = (M, t, l) => (l === 1 ? M[t][1] + 0.35 * (M[t][0] + M[t][2]) : M[t][l] + 0.35 * M[t][1] + 0.1 * M[t][2 - l]);
// supériorité dans une zone : rapport des effectifs (logarithme), comparable dans l'axe et sur un côté
const sup = (a, d) => Math.log((a + 0.6) / (d + 0.6));

// Répartition du ballon entre les couloirs quand il passe dans le tiers t : la largeur voulue, les joueurs qui s'y
// proposent, l'espace laissé par l'adversaire, et le ballon qui reste souvent dans son couloir.
function laneDist(X, Y, t, from) {
  const w = WIDTH_W[X.I.width - 1];
  const avgA = (X.ATT[t][0] + X.ATT[t][1] + X.ATT[t][2]) / 3 || 1;
  const yt = 2 - t;
  const avgD = (Y.DEF[yt][0] + Y.DEF[yt][1] + Y.DEF[yt][2]) / 3 || 1;
  const out = [0, 1, 2].map((l) => w[l] * (0.6 + 0.4 * X.ATT[t][l] / avgA) * Math.exp(-0.15 * (Y.DEF[yt][2 - l] - avgD) / Math.max(0.5, avgD)) * (l === from ? 1.6 : 1));
  const s = out[0] + out[1] + out[2];
  return out.map((x) => x / s);
}

// Types d'action d'une occasion construite dans le dernier tiers, par couloir (poids) : sur un côté, le centre, le
// centre en retrait, le dribble ; dans l'axe, la combinaison, la frappe de loin (plus encore face à un bloc bas),
// l'ouverture (face à une ligne haute), le dribble, le cafouillage.
export function kindWeights(X, Y, l) {
  const q = X.Q, d = Y.Q;
  if (l !== 1) {
    const cr = l === 0 ? q.crossL : q.crossR;
    return [
      ['cross', 3.1 * Math.exp(0.15 * cr + 0.12 * (q.air - d.defAir))],
      ['cutback', 1.35 * Math.exp(0.12 * q.drib)],
      ['solo', 1.1 * Math.exp(0.2 * q.drib)],
      ['combo', 0.7 * Math.exp(0.1 * q.vision)],
      ['long', 0.65 * Math.exp(0.2 * q.shoot)],
    ];
  }
  return [
    ['combo', 2.5 * Math.exp(0.12 * q.vision)],
    ['long', 2.6 * Math.exp(0.2 * q.shoot + 0.2 * (3 - Y.I.line))],
    ['solo', 1.0 * Math.exp(0.2 * q.drib)],
    ['through', 0.6 * Math.exp(0.3 * (Y.I.line - 3) + 0.2 * (q.pace - d.defPace))],
    ['cutback', 0.3],
    ['scramble', 0.28],
  ];
}

// Qualité d'une occasion selon son type (grosse, normale, difficile) : la même répartition qu'avant le moteur à zones
// pour un match ordinaire (la qualité moyenne reste 1), mais une équipe qui se crée des contres et des ouvertures a de
// meilleures occasions qu'une équipe réduite aux frappes de loin.
export const QMIX = Object.freeze({
  through: [0.55, 0.45, 0], counter: [0.45, 0.55, 0], cutback: [0.45, 0.55, 0], cross: [0.17, 0.64, 0.19],
  combo: [0.21, 0.79, 0], scramble: [1, 0, 0], solo: [0, 0.69, 0.31], corner: [0, 0.69, 0.31], press: [0, 1, 0],
  long: [0, 0, 1], freekick: [0, 0, 1],
});

// tables[state] = [{ p, to, ev }] ; ev : ce qui se passe (occasion : { ch, lane }, entrée dans le dernier tiers,
// récupération haute, contre lancé, hors-jeu…). homeAdv : avantage du terrain du club qui reçoit (1 à domicile, −1 en
// Élite à l'extérieur, 0 neutre). mult : facteurs d'occasions de chaque camp (signes distinctifs, joueurs en moins).
export function buildTables(H, A, { homeAdv = 1, mult = [1, 1] } = {}) {
  const tables = new Array(N_STATES);
  const teams = [H, A];
  for (let side = 0; side < 2; side++) {
    const X = teams[side], Y = teams[1 - side];
    const other = 1 - side;
    const delta = X.level - Y.level + Z.home * homeAdv * (side === 0 ? 1 : -1);
    const L = Z.lvl * delta;
    const Lf = Z.lvlF * delta;
    // nettement plus faible : ses occasions se raréfient plus vite (comme la droite des buts attendus d'avant, qui touchait
    // presque zéro à quatre points d'écart)
    const weak = -Z.weak * Math.max(0, -delta) ** 2;
    const mu = mult[side];
    const qx = X.Q, qy = Y.Q;
    const afterChance = stateOf(other, 0, 1); // après l'occasion : le gardien ou une sortie de but, au camp d'en face
    const E = PRESS_E[Y.I.press - 1] * Y.pressFit;
    const regainX = clamp(Z.regain * (1 + 0.5 * (X.I.cpress - 3)) * X.pressFit, 0.01, 0.3);
    // départ d'un contre : la consigne de celui qui récupère (plus encore avec des attaquants rapides), la vitesse de ses
    // attaquants contre celle de nos défenseurs, ce que nous avons laissé derrière (joueurs montés, ligne haute : moins grave
    // avec des défenseurs rapides), notre contre-pressing
    const ctrBase = (base) => sig(base + (Y.I.counter - 3) * (Z.ctrInstr + 0.06 * qy.pace) + 0.28 * qy.pace - 0.25 * qx.defPace + Z.ctrCommit * (X.commit - 3.3) + (X.I.line - 3) * (Z.ctrLine - 0.12 * qx.defPace) - 0.1 * (X.I.cpress - 3) + L * -0.5);
    for (let l = 0; l < 3; l++) {
      const m = 2 - l; // le même couloir vu de l'adversaire
      // --- construction ---
      {
        const out = [];
        const nA = near(X.ATT, 0, l), nD = near(Y.DEF, 2, m);
        const loss = E * sig(Z.b0 - L - Z.bN * sup(nA, nD) - Z.bBuild * qx.build + Z.bPress * qy.press);
        const long = clamp(Z.long0 * (1 + Z.longDirect * (X.I.direct - 3) / 2) + Z.longPressed * loss, 0.01, 0.3);
        const rest = Math.max(0, 1 - loss - long);
        const fwd = rest * clamp(Z.fwd0 + 0.06 * (X.I.tempo - 3) + 0.12 * sup(near(X.ATT, 1, l), near(Y.DEF, 1, m)), 0.2, 0.85);
        const stay = rest - fwd;
        // récupération haute de l'adversaire : une occasion tout de suite, sinon il s'installe dans notre tiers
        const ps = clamp(Z.pressShot * Math.exp(0.15 * qy.pace + 0.1 * qy.drib + Z.lvlF * -delta), 0.01, 0.6) * mult[other];
        // (après cette occasion, le ballon revient à l'équipe qui l'a perdu : son gardien relance)
        out.push({ p: loss * ps, to: stateOf(side, 0, 1), ev: { ch: 'press', lane: m, side: other, rec: 2, by: other } });
        out.push({ p: loss * (1 - ps), to: stateOf(other, 2, m), ev: { rec: 2, by: other } });
        // jeu long : duel aérien dans le dernier tiers
        const dl = laneDist(X, Y, 2, l);
        const win = sig(-0.35 + 0.28 * (qx.air - qy.defAir) + 0.5 * L);
        for (let k = 0; k < 3; k++) {
          out.push({ p: long * dl[k] * win, to: stateOf(side, 2, k), ev: { entry: k, long: 1 } });
          out.push({ p: long * dl[k] * (1 - win), to: stateOf(other, 0, 2 - k), ev: { rec: 0, by: other } });
        }
        const d1 = laneDist(X, Y, 1, l);
        for (let k = 0; k < 3; k++) out.push({ p: fwd * d1[k], to: stateOf(side, 1, k) });
        const d0 = laneDist(X, Y, 0, l);
        for (let k = 0; k < 3; k++) out.push({ p: stay * d0[k], to: stateOf(side, 0, k) });
        tables[stateOf(side, 0, l)] = out;
      }
      // --- progression ---
      {
        const out = [];
        const nA = near(X.ATT, 1, l), nD = near(Y.DEF, 1, m);
        const loss = sig(Z.l1 - L - Z.l1N * sup(nA, nD) - Z.l1Vision * qx.vision + Z.l1Wall * qy.wall) * (1 + 0.08 * (X.I.tempo - 3) * (1 - 0.12 * qx.vision));
        const thr = Z.thr * Math.exp((Y.I.line - 3) * (Z.thrLine - 0.15 * qy.defPace) + Z.thrPace * (qx.pace - qy.defPace) + 0.12 * qx.vision + 0.06 * (X.I.direct - 3));
        const thrOk = sig(Z.thrOk + 0.3 * (qx.pace - qy.defPace) + L);
        const rest = Math.max(0, 1 - loss - thr);
        const fwd = rest * clamp(Z.fwd1 + 0.06 * (X.I.tempo - 3) + 0.12 * sup(near(X.ATT, 2, l), near(Y.DEF, 0, m)), 0.15, 0.8);
        const back = rest * clamp(0.1 - 0.03 * (X.I.tempo - 3), 0.02, 0.2);
        const stay = rest - fwd - back;
        // ouverture : seul face au gardien, ou hors-jeu (coup franc pour l'adversaire)
        out.push({ p: thr * thrOk * mu, to: afterChance, ev: { ch: 'through', lane: l, side } });
        const miss = Math.max(0, thr * (1 - thrOk * mu));
        out.push({ p: miss * 0.55, to: stateOf(other, 0, m), ev: { offside: side } });
        out.push({ p: miss * 0.45, to: stateOf(other, 0, m), ev: { rec: 0, by: other } });
        // perte au milieu : contre-pressing (repris aussitôt), contre adverse, ou l'adversaire s'installe
        const ctr = ctrBase(Z.ctr1);
        out.push({ p: loss * regainX, to: stateOf(side, 1, l), ev: { regain: side } });
        out.push({ p: loss * (1 - regainX) * ctr, to: counterState(other, m), ev: { rec: 1, by: other, ctr: other } });
        out.push({ p: loss * (1 - regainX) * (1 - ctr), to: stateOf(other, 1, m), ev: { rec: 1, by: other } });
        const d2 = laneDist(X, Y, 2, l);
        for (let k = 0; k < 3; k++) out.push({ p: fwd * d2[k], to: stateOf(side, 2, k), ev: { entry: k } });
        out.push({ p: back, to: stateOf(side, 0, l) });
        const d1 = laneDist(X, Y, 1, l);
        for (let k = 0; k < 3; k++) out.push({ p: stay * d1[k], to: stateOf(side, 1, k) });
        tables[stateOf(side, 1, l)] = out;
      }
      // --- finition ---
      {
        const out = [];
        const nA = near(X.ATT, 2, l), nD = near(Y.DEF, 0, m);
        const wide = l !== 1;
        // un bloc bas resserré tient l'axe ; il s'y appuie sur ses défenseurs
        const deep = 1 + 0.5 * Math.max(0, 3 - Y.I.line);
        const prof = wide ? 0.15 * ((l === 0 ? qx.crossL : qx.crossR) + 0.5 * (qx.air - qy.defAir)) - 0.05 * qy.wall : 0.15 * (qx.vision + 0.5 * qx.drib) - 0.1 * qy.wall * deep;
        const ch = clamp(Z.ch * Math.exp(Z.chN * sup(nA, nD) + Lf + weak + prof), 0.003, 0.25) * mu;
        const sp = wide ? Z.spWide : Z.spAxis;
        const spShot = (wide ? Z.spShotWide : Z.spShotAxis) * mu;
        const loss = sig(Z.l2 - L - Z.l2N * sup(nA, nD) + Z.l2Wall * qy.wall * (1 + 0.4 * Math.max(0, 3 - Y.I.line)));
        const back = Z.back2;
        const stay = Math.max(0, 1 - ch - sp - loss - back);
        out.push({ p: ch, to: afterChance, ev: { ch: 'final', lane: l, side } });
        out.push({ p: sp * spShot, to: afterChance, ev: { ch: wide ? 'corner' : 'freekick', lane: l, side } });
        out.push({ p: sp * (1 - spShot), to: stateOf(other, 0, m), ev: { sp: wide ? 'corner' : 'freekick', side } });
        const ctr = ctrBase(Z.ctr2);
        out.push({ p: loss * ctr, to: counterState(other, m), ev: { rec: 0, by: other, ctr: other } });
        out.push({ p: loss * (1 - ctr), to: stateOf(other, 0, m), ev: { rec: 0, by: other } });
        out.push({ p: back, to: stateOf(side, 1, l) });
        const d2 = laneDist(X, Y, 2, l);
        for (let k = 0; k < 3; k++) out.push({ p: stay * d2[k], to: stateOf(side, 2, k) });
        tables[stateOf(side, 2, l)] = out;
      }
      // --- contre lancé ---
      {
        const out = [];
        const cch = sig(Z.cch + 0.35 * qx.pace - 0.28 * qy.defPace + (Y.I.line - 3) * (Z.cchLine - 0.12 * qy.defPace) + 0.5 * L) * mu;
        const foul = 0.15, stop = 0.2;
        const on = Math.max(0, 1 - cch - foul - stop);
        out.push({ p: cch, to: afterChance, ev: { ch: 'counter', lane: l, side } });
        out.push({ p: foul, to: stateOf(side, 1, l), ev: { foul: other } });
        out.push({ p: stop, to: stateOf(other, 0, m), ev: { rec: 0, by: other } });
        out.push({ p: on, to: stateOf(side, 2, l), ev: { entry: l } });
        tables[counterState(side, l)] = out;
      }
    }
  }
  // probabilités normalisées (un reste négatif est ramené à zéro)
  for (const tb of tables) {
    let s = 0;
    for (const o of tb) { if (!(o.p > 0)) o.p = 0; s += o.p; }
    if (s > 0) for (const o of tb) o.p /= s;
  }
  return tables;
}

// Distribution stationnaire de la chaîne (le temps passé dans chaque état) et ce qui en découle : occasions par minute
// de chaque camp, possession, part des occasions par source et par couloir.
export function chainSummary(tables, iters = 80) {
  let pi = new Float64Array(N_STATES).fill(1 / N_STATES);
  let nx = new Float64Array(N_STATES);
  for (let it = 0; it < iters; it++) {
    nx.fill(0);
    for (let s = 0; s < N_STATES; s++) { const w = pi[s]; if (!w) continue; for (const o of tables[s]) nx[o.to] += w * o.p; }
    [pi, nx] = [nx, pi];
  }
  const chances = [0, 0];
  const bySrc = [{}, {}];
  const events = [{}, {}]; // par minute : récupérations par tiers, contres, hors-jeu, coups de pied arrêtés, entrées
  const add = (side, key, w) => { events[side][key] = (events[side][key] || 0) + w * Z.K; };
  let poss = 0;
  const thirds = [[0, 0, 0], [0, 0, 0]];
  for (let s = 0; s < N_STATES; s++) {
    const side = sideOfState(s);
    if (side === 0) poss += pi[s];
    const z = zoneOfState(s);
    thirds[side][z.t] += pi[s];
    for (const o of tables[s]) {
      const ev = o.ev;
      if (!ev) continue;
      const w = pi[s] * o.p;
      if (ev.rec !== undefined) add(ev.by, `rec${ev.rec}`, w);
      if (ev.ctr !== undefined) add(ev.ctr, 'ctr', w);
      if (ev.offside !== undefined) add(ev.offside, 'off', w);
      if (ev.entry !== undefined) add(side, 'entry', w);
      if (ev.sp) add(ev.side, ev.sp, w);
      if (ev.regain !== undefined) add(ev.regain, 'regain', w);
      if (!ev.ch) continue;
      chances[ev.side] += w;
      if (ev.ch === 'corner' || ev.ch === 'freekick') add(ev.side, ev.ch, w);
      const key = `${ev.ch}:${ev.lane}`;
      bySrc[ev.side][key] = (bySrc[ev.side][key] || 0) + w;
    }
  }
  return { pi, perMinute: [chances[0] * Z.K, chances[1] * Z.K], possession: poss, bySrc, events, thirds };
}

// Qualité moyenne des occasions d'un camp (multiplicateur de la finition), d'après la part de chaque type d'action.
const QV = [2.2, 0.9, (1 - 0.18 * 2.2 - 0.52 * 0.9) / (1 - 0.18 - 0.52)];
const qOf = (kind) => { const m = QMIX[kind] || QMIX.combo; return m[0] * QV[0] + m[1] * QV[1] + m[2] * QV[2]; };
export function qualityMean(summary, side, X, Y) {
  let w = 0, q = 0;
  for (const [key, x] of Object.entries(summary.bySrc[side])) {
    const [src, lane] = key.split(':');
    const l = Number(lane);
    let mean;
    if (src === 'final') {
      const kw = kindWeights(X, Y, l);
      const tot = kw.reduce((s, [, a]) => s + a, 0);
      mean = kw.reduce((s, [k, a]) => s + (a / tot) * qOf(k), 0);
    } else mean = qOf(src === 'corner' ? 'corner' : src === 'freekick' ? 'freekick' : src);
    w += x; q += x * mean;
  }
  return w ? q / w : 1;
}

// Ce que vaut un plan pour un onze (1.0.49) : occasions créées moins occasions concédées par match, à niveau égal et sur
// terrain neutre, contre l'adversaire du jour (vs : son onze et son dispositif, joués en Équilibrée : on ne connaît pas
// son plan) ou, sans lui, contre un adversaire ordinaire (4-3-3, Équilibrée). L'ordinateur s'en sert pour jouer le plan qui
// colle à ses joueurs et à ceux d'en face (coherence.js, aiPlanOf). players : le onze dans l'ordre des postes.
let neutralOpp = null;
export function planValue(players, formation, plan, vs = null) {
  const { eleven, keeper } = elevenOf(players, formation);
  const H = teamAt(teamStatic(eleven, keeper, plan), 10);
  let A;
  if (vs?.players?.length) {
    const o = elevenOf(vs.players, vs.formation);
    A = teamAt(teamStatic(o.eleven, o.keeper, 'balanced'), 10);
  } else A = (neutralOpp ||= teamAt(neutralStatic('433', 'balanced'), 10));
  const s = chainSummary(buildTables(H, A, { homeAdv: 0 }), 60);
  return (s.perMinute[0] - s.perMinute[1]) * 93;
}
