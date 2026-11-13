import { hash } from './faces';
import { t } from '../i18n/index';

// Attributs détaillés façon Football Manager (1.0.38, PDG : « des fiches de joueurs avec des notes sur 20 visibles, jeu
// aérien, contrôle, tirs, passe… un jeu complet type FM »).
// Les 9 caractéristiques du jeu (players.js, ATTRS), et les 6 du gardien (GK_ATTRS), restent la base du niveau et de la
// progression. Depuis la 1.0.39 (moteur des ligues 5), trois attributs détaillés entrent aussi dans le match (live.js,
// fmOf) : le jeu aérien sur les centres et les corners, les balles arrêtées sur les coups francs, les tirs de loin sur les
// frappes lointaines. Chacune se détaille en attributs de sa famille ; leur moyenne pondérée la redonne
// à peu près (un joueur à 12 en Passe a des Passes, une Vision, des Centres autour de 12), plus ou moins selon son profil
// (graine fixe du joueur), sa taille (jeu aérien, détente), son âge (anticipation, accélération) et ses signes distinctifs.

// [clé, nom, catégorie, caractéristique de base, poids dans sa famille]
const OUTFIELD = [
  ['finition', t('Finition'), 'tech', 'fin', 1],
  ['tirsLoin', t('Tirs de loin'), 'tech', 'fin', 0.6],
  ['penalty', t('Penalty', undefined, 'attribut'), 'tech', 'fin', 0.4],
  ['passes', t('Passes', undefined, 'attribut'), 'tech', 'pas', 1],
  ['centres', t('Centres', undefined, 'attribut'), 'tech', 'pas', 0.6],
  ['cpa', t('Balles arrêtées'), 'tech', 'pas', 0.4],
  ['dribble', t('Dribble'), 'tech', 'dri', 1],
  ['controle', t('Contrôle'), 'tech', 'dri', 0.9],
  ['technique', t('Technique', undefined, 'attribut'), 'tech', 'dri', 0.8],
  ['tacles', t('Tacles'), 'tech', 'def', 1],
  ['marquage', t('Marquage'), 'tech', 'def', 1],
  ['jeuAerien', t('Jeu aérien'), 'tech', 'pui', 0.8],
  ['vision', t('Vision'), 'ment', 'pas', 0.8],
  ['placement', t('Placement'), 'ment', 'pla', 1],
  ['deplacements', t('Déplacements'), 'ment', 'pla', 0.8],
  ['anticipation', t('Anticipation'), 'ment', 'pla', 0.8],
  ['collectif', t('Jeu collectif'), 'ment', 'pla', 0.6],
  ['concentration', t('Concentration'), 'ment', 'pla', 0.5],
  ['sangFroid', t('Sang-froid'), 'ment', 'sfr', 1],
  ['decisions', t('Décisions'), 'ment', 'sfr', 0.9],
  ['determination', t('Détermination'), 'ment', 'sfr', 0.6],
  ['leadership', t('Leadership'), 'ment', 'sfr', 0.3],
  ['courage', t('Courage'), 'ment', 'def', 0.4],
  ['activite', t('Volume de jeu'), 'ment', 'end', 0.8],
  ['inspiration', t('Inspiration'), 'ment', 'dri', 0.5],
  ['agressivite', t('Agressivité'), 'ment', 'pui', 0.3],
  ['vitesse', t('Vitesse'), 'phys', 'vit', 1],
  ['acceleration', t('Accélération'), 'phys', 'vit', 1],
  ['endurance', t('Endurance'), 'phys', 'end', 1],
  ['puissance', t('Puissance'), 'phys', 'pui', 1],
  ['detente', t('Détente'), 'phys', 'pui', 0.7],
  ['equilibre', t('Équilibre'), 'phys', 'pui', 0.5],
  ['agilite', t('Agilité'), 'phys', 'dri', 0.5],
];
// Gardien : ses attributs de gardien remplacent la technique ; son mental vient de ses qualités de gardien (sang-froid,
// placement), son physique de ses caractéristiques de joueur et de sa détente.
const KEEPER = [
  ['reflexes', t('Réflexes'), 'gk', 'g.ref', 1],
  ['priseBalle', t('Prise de balle'), 'gk', 'g.ref', 0.7],
  ['gPlacement', t('Placement'), 'gk', 'g.gpl', 1],
  ['autorite', t('Autorité'), 'gk', 'g.gpl', 0.6],
  ['sorties', t('Sorties'), 'gk', 'g.gpl', 0.6],
  ['gAerien', t('Jeu aérien'), 'gk', 'g.aer', 1],
  ['unContreUn', t('Un contre un'), 'gk', 'g.uns', 1],
  ['degagement', t('Dégagement'), 'gk', 'g.rel', 1],
  ['relanceMain', t('Relance à la main'), 'gk', 'g.rel', 0.8],
  ['jeuPied', t('Jeu au pied'), 'gk', 'g.rel', 0.6],
  ['anticipation', t('Anticipation'), 'ment', 'g.gpl', 0.8],
  ['concentration', t('Concentration'), 'ment', 'g.gsf', 0.8],
  ['sangFroid', t('Sang-froid'), 'ment', 'g.gsf', 1],
  ['decisions', t('Décisions'), 'ment', 'g.gsf', 0.9],
  ['determination', t('Détermination'), 'ment', 'g.gsf', 0.6],
  ['leadership', t('Leadership'), 'ment', 'g.gsf', 0.3],
  ['courage', t('Courage'), 'ment', 'g.uns', 0.5],
  ['communication', t('Communication'), 'ment', 'g.gpl', 0.5],
  ['vitesse', t('Vitesse'), 'phys', 'vit', 1],
  ['acceleration', t('Accélération'), 'phys', 'vit', 1],
  ['endurance', t('Endurance'), 'phys', 'end', 1],
  ['puissance', t('Puissance'), 'phys', 'pui', 1],
  ['detente', t('Détente'), 'phys', 'g.aer', 0.8],
  ['agilite', t('Agilité'), 'phys', 'g.ref', 0.6],
];
export const CATS = { tech: t('Technique'), ment: t('Mental'), phys: t('Physique'), gk: t('Gardien', undefined, 'attribut') }; // (contexte : « Passes » est ailleurs le total des passes décisives)

const coreOf = (p, src) => (src.startsWith('g.') ? p.g?.[src.slice(2)] : p.a?.[src]) ?? 10;
// nombres pseudo-aléatoires fixes par joueur et par attribut : le profil ne change jamais d'un écran à l'autre
const noise = (seed, key) => { const h = hash(`${seed}|${key}|fm`); return ((h % 10007) / 10007 + ((h >>> 13) % 9973) / 9973) - 1; }; // -1 à 1, en cloche

const ANCHORS = new Set(['finition|fin', 'dribble|dri', 'vitesse|vit', 'endurance|end', 'puissance|pui', 'placement|pla', 'sangFroid|sfr', 'reflexes|g.ref', 'gPlacement|g.gpl', 'gAerien|g.aer', 'unContreUn|g.uns', 'sangFroid|g.gsf']);
// Biais des signes distinctifs (players.js, TRAITS), en points
const TRAIT_BIAS = {
  finisseur: { finition: 2, sangFroid: 1, penalty: 1 },
  passeur: { passes: 2, vision: 2, centres: 1 },
  infatigable: { endurance: 2.5, activite: 2.5 },
  fleche: { acceleration: 2.5, vitesse: 1.5 },
  roc: { tacles: 1.5, puissance: 1.5, courage: 2 },
  leader: { leadership: 5, determination: 1.5, communication: 2 },
  sangChaud: { agressivite: 4, sangFroid: -1.5, concentration: -1 },
  frappe: { tirsLoin: 3.5 },
  grandsSoirs: { determination: 2.5, courage: 1.5 },
  chat: { reflexes: 2, unContreUn: 1.5 },
};

// Taille du joueur (même calcul que son joueur 3D, players3d.js identityOf) : graine de son nom
function rand(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
export function heightOf(pl = {}, pos = pl.pos || 'M') {
  const r = rand(hash(`${pl.id ?? ''}|${pl.name || ''}|3d`));
  const [mean, sd] = { G: [1.88, 0.045], D: [1.84, 0.05], M: [1.78, 0.055], A: [1.8, 0.06] }[pos] || [1.81, 0.06];
  return Math.min(1.98, Math.max(1.66, mean + (r() + r() + r() - 1.5) * 1.2 * sd));
}

// Attributs détaillés d'un joueur : [{ cat, name, rows: [{ key, name, v, base }] }], valeurs de 1 à 20 (une décimale ;
// l'interface arrondit), plus sa taille en mètres.
export function detailsOf(p) {
  const keeper = p.pos === 'G' && !!p.g;
  const table = keeper ? KEEPER : OUTFIELD;
  const seed = `${p.id ?? ''}|${p.name || ''}`;
  const height = heightOf(p, p.pos);
  const raw = table.map(([key, name, cat, src, w]) => ({ key, name, cat, src, w, v: coreOf(p, src) + noise(seed, key) * 2.6 }));
  // le profil propre au joueur ne déplace pas sa famille : écarts recentrés sur la moyenne pondérée de chaque famille
  const fams = new Map();
  for (const x of raw) { const f = fams.get(x.src) || { sum: 0, w: 0 }; f.sum += (x.v - coreOf(p, x.src)) * x.w; f.w += x.w; fams.set(x.src, f); }
  for (const x of raw) { const f = fams.get(x.src); if (f.w) x.v -= f.sum / f.w; }
  // taille : un grand saute plus haut et gagne ses duels aériens ; un petit est plus vif
  const tall = (height - 1.8) / 0.08; // environ -1,5 à 2,2
  const bias = { jeuAerien: 1.6 * tall, gAerien: 1.2 * tall, detente: 1.4 * tall, agilite: -0.6 * tall, equilibre: -0.4 * tall, acceleration: -0.5 * tall };
  // âge : la lecture du jeu vient avec les saisons, l'explosivité s'en va après 29 ans
  const age = p.age || 25;
  const wise = Math.max(-1.5, Math.min(1.8, (age - 24) * 0.25));
  for (const k of ['anticipation', 'decisions', 'concentration', 'sangFroid', 'leadership', 'communication']) bias[k] = (bias[k] || 0) + wise;
  const old = Math.max(0, age - 29) * 0.35;
  for (const k of ['acceleration', 'agilite', 'vitesse']) bias[k] = (bias[k] || 0) - old;
  if (age <= 21) bias.leadership = (bias.leadership || 0) - 2;
  for (const tr of p.traits || []) for (const [k, v] of Object.entries(TRAIT_BIAS[tr] || {})) bias[k] = (bias[k] || 0) + v;
  const rows = raw.map((x) => ({ key: x.key, name: x.name, cat: x.cat, base: x.src, v: Math.round(Math.min(20, Math.max(1, x.v + (bias[x.key] || 0))) * 10) / 10 }));
  // même mot, même note : l'attribut qui porte le nom d'une caractéristique de base (Finition, Dribble, Vitesse…) en garde
  // la valeur (relecture 1.0.38) ; les autres de sa famille portent le profil
  for (const r of rows) if (ANCHORS.has(`${r.key}|${r.base}`)) r.v = Math.round(coreOf(p, r.base) * 10) / 10;
  const order = keeper ? ['gk', 'ment', 'phys'] : ['tech', 'ment', 'phys'];
  return { height, cats: order.map((cat) => ({ cat, name: CATS[cat], rows: rows.filter((r) => r.cat === cat) })) };
}
