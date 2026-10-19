import { clamp, pick, ri, rnd } from './utils';
import { FIRST, LAST } from './names';
import { saleFor, signingFor, wageFor } from './economy';

// Joueurs : 9 caractéristiques (1 à 20) pour tous, 6 de plus pour les gardiens, un profil (pied fort,
// poste de dépannage, signes distinctifs, numéro) et une vie (forme, statistiques de saison, historique).
// Les caractéristiques sont gardées avec une décimale pour que la progression soit continue ; l'interface
// les affiche arrondies.

export const ATTRS = [
  { key: 'fin', short: 'FIN', name: 'Finition', fam: 'tech' },
  { key: 'pas', short: 'PAS', name: 'Passe', fam: 'tech' },
  { key: 'dri', short: 'DRI', name: 'Dribble', fam: 'tech' },
  { key: 'vit', short: 'VIT', name: 'Vitesse', fam: 'phys' },
  { key: 'end', short: 'END', name: 'Endurance', fam: 'phys' },
  { key: 'pui', short: 'PUI', name: 'Puissance', fam: 'phys' },
  { key: 'pla', short: 'PLA', name: 'Placement', fam: 'tac' },
  { key: 'def', short: 'DÉF', name: 'Défense', fam: 'tac' },
  { key: 'sfr', short: 'SFR', name: 'Sang-froid', fam: 'tac' },
];
export const GK_ATTRS = [
  { key: 'ref', short: 'RÉF', name: 'Réflexes', fam: 'gk' },
  { key: 'gpl', short: 'PLA', name: 'Placement', fam: 'gk' },
  { key: 'aer', short: 'AÉR', name: 'Jeu aérien', fam: 'gk' },
  { key: 'uns', short: '1C1', name: 'Un contre un', fam: 'gk' },
  { key: 'rel', short: 'REL', name: 'Relance', fam: 'gk' },
  { key: 'gsf', short: 'SFR', name: 'Sang-froid', fam: 'gk' },
];
export const FAMILIES = { tech: 'Technique', phys: 'Physique', tac: 'Tactique et mental', gk: 'Gardien de but' };

// Poids de chaque caractéristique dans la note d'un poste (somme = 1).
export const WEIGHTS = {
  A: { fin: 0.26, dri: 0.16, vit: 0.14, sfr: 0.12, pui: 0.1, pas: 0.08, pla: 0.08, end: 0.04, def: 0.02 },
  M: { pas: 0.22, pla: 0.14, end: 0.14, dri: 0.12, sfr: 0.1, vit: 0.08, fin: 0.08, def: 0.08, pui: 0.04 },
  D: { def: 0.28, pla: 0.2, pui: 0.16, vit: 0.1, sfr: 0.1, end: 0.06, pas: 0.06, dri: 0.02, fin: 0.02 },
  G: { ref: 0.28, gpl: 0.2, uns: 0.16, aer: 0.14, gsf: 0.12, rel: 0.1 },
};

// Signes distinctifs : une touche de personnalité, avec un petit effet en match (voir live.js / tactics.js).
export const TRAITS = {
  finisseur: { name: 'Finisseur', desc: 'Transforme plus souvent ses occasions.' },
  passeur: { name: 'Passeur', desc: 'Délivre plus souvent la passe décisive.' },
  infatigable: { name: 'Infatigable', desc: 'Garde son niveau jusqu’au coup de sifflet final.' },
  fleche: { name: 'Flèche', desc: 'Fait la différence en contre grâce à sa vitesse.' },
  roc: { name: 'Roc', desc: 'Gagne ses duels : l’adversaire se crée moins d’occasions.' },
  leader: { name: 'Leader', desc: 'Son onze gagne en sérénité (+0,1 au niveau d’équipe).' },
  sangChaud: { name: 'Sang chaud', desc: 'Prend plus souvent des cartons.' },
  frappe: { name: 'Frappe lointaine', desc: 'Tente sa chance de loin.' },
  grandsSoirs: { name: 'Joueur des grands soirs', desc: 'Se transcende contre les équipes plus fortes.' },
  chat: { name: 'Chat', desc: 'Réflexes de félin : plus d’arrêts décisifs.' },
};

const r1 = (v) => Math.round(v * 10) / 10;
const LINE = { D: 0, M: 1, A: 2 };
const ALT = { D: ['M'], M: ['D', 'A'], A: ['M'], G: [] };

// Hors de son poste, un joueur perd en efficacité : poste de dépannage −5 %, ligne voisine −12 %,
// ligne opposée −25 %, gardien ↔ joueur de champ −50 %.
function positionFactor(p, pos) {
  if (p.pos === pos) return 1;
  if (p.alt === pos) return 0.95;
  if (p.pos === 'G' || pos === 'G') return 0.5;
  return Math.abs(LINE[p.pos] - LINE[pos]) === 1 ? 0.88 : 0.75;
}

// Note d'un joueur à un poste donné (sur 20).
export function ratingAt(p, pos) {
  const w = WEIGHTS[pos];
  let sum = 0;
  if (pos === 'G') {
    if (p.g) for (const k in w) sum += p.g[k] * w[k];
    else sum = ((p.a.pla + p.a.sfr + p.a.pui) / 3) * 0.75; // un joueur de champ dans les cages
  } else {
    for (const k in w) sum += p.a[k] * w[k];
  }
  return sum * positionFactor(p, pos);
}

export const playerRating = (p) => ratingAt(p, p.pos);

// Profil de caractéristiques autour d'un niveau « center » : les qualités clés du poste ressortent.
function makeAttributes(pos, center) {
  const a = {};
  if (pos === 'G') {
    for (const { key } of ATTRS) a[key] = clamp(r1(center - 3 + rnd(-1.5, 1.5)), 1, 20);
    const g = {};
    for (const { key } of GK_ATTRS) g[key] = clamp(r1(center + (WEIGHTS.G[key] - 1 / 6) * 14 + rnd(-1.5, 1.5)), 1, 20);
    return { a, g };
  }
  for (const { key } of ATTRS) a[key] = clamp(r1(center + ((WEIGHTS[pos][key] || 0) - 1 / 9) * 16 + rnd(-1.6, 1.6)), 1, 20);
  return { a };
}

// Décale toutes les caractéristiques pour que la note au poste naturel vaille « target ».
export function tuneTo(p, target) {
  for (let i = 0; i < 3; i++) {
    const d = target - playerRating(p);
    if (Math.abs(d) < 0.05) break;
    for (const k in p.a) p.a[k] = clamp(r1(p.a[k] + d), 1, 20);
    if (p.g) for (const k in p.g) p.g[k] = clamp(r1(p.g[k] + d), 1, 20);
  }
  return p;
}

// Signes distinctifs tirés des points forts du joueur (0 à 2).
function rollTraits(p) {
  const out = [];
  const add = (t, chance) => { if (out.length < 2 && !out.includes(t) && Math.random() < chance) out.push(t); };
  if (p.pos === 'G') {
    if (p.g.ref >= Math.max(...Object.values(p.g)) - 0.5) add('chat', 0.45);
  } else {
    const best = Object.entries(p.a).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    const by = { fin: 'finisseur', pas: 'passeur', end: 'infatigable', vit: 'fleche', pui: p.pos === 'D' ? 'roc' : 'frappe', def: 'roc' };
    for (const k of best) if (by[k]) add(by[k], 0.33);
    if (p.a.sfr <= Math.min(...Object.values(p.a)) + 0.3) add('sangChaud', 0.4); // le sang-froid est son point faible
  }
  if (p.age >= 26 && (p.g ? p.g.gsf : p.a.sfr) >= 10) add('leader', 0.18);
  add('grandsSoirs', 0.06);
  return out;
}

export function makePlayer({ level = 0, youth = false, academy = 0, pos = null } = {}) {
  const p = pos || pick(['D', 'D', 'M', 'M', 'A', 'A', 'G']);
  const age = youth ? ri(16, 18) : ri(19, 30);
  const center = youth ? 3 + academy + rnd(0, 2) : 4 + level * 2 + rnd(-1, 2);
  const pot = clamp(Math.round(center + (youth ? ri(5, 9) + academy : ri(2, 6))), 8, 20);
  const player = {
    name: `${pick(FIRST)} ${pick(LAST)}`,
    pos: p,
    age,
    pot,
    ...makeAttributes(p, center),
    foot: Math.random() < 0.72 ? 'droit' : Math.random() < 0.86 ? 'gauche' : 'les deux',
    alt: Math.random() < 0.55 ? pick(ALT[p]) || null : null,
    form: [],
    season: freshSeason(),
    hist: [],
  };
  // même niveau moyen que l'ancien modèle (attaque, défense, mental) : l'équilibre du jeu est conservé
  tuneTo(player, center + 0.8 + rnd(-0.3, 0.3));
  player.traits = rollTraits(player);
  return player;
}

export const freshSeason = () => ({ apps: 0, goals: 0, assists: 0, yellow: 0, red: 0, sum: 0 });

// Numéros de maillot : les numéros classiques de chaque poste d'abord.
const NUMBERS = { G: [1, 16, 30, 40], D: [2, 3, 4, 5, 12, 13, 15, 23, 24], M: [6, 8, 10, 14, 17, 18, 20, 21], A: [7, 9, 11, 19, 22, 25, 26, 27] };
export function assignNumber(players, p) {
  const used = new Set(players.filter((q) => q !== p).map((q) => q.num));
  p.num = [...NUMBERS[p.pos], ...Array.from({ length: 70 }, (_, i) => i + 28)].find((n) => !used.has(n));
  return p;
}

// Salaire annuel (voir economy.js) : suit la note du joueur et la division du club.
export const wageOf = (p, divisionIndex = 0) => wageFor(playerRating(p), divisionIndex);
export const signingFee = (p, divisionIndex = 0) => signingFor(wageOf(p, divisionIndex));
export const saleValue = (p, divisionIndex = 0) => saleFor(wageOf(p, divisionIndex));

// Potentiel estimé : une fourchette, d'autant plus précise que l'académie est développée et que le joueur
// est au club depuis longtemps. Null quand le joueur a atteint son plafond.
export function potentialRange(p, s) {
  const now = playerRating(p);
  if (p.pot <= now + 0.3) return null;
  const seasons = p.joined ? Math.max(0, s.seasonNumber - p.joined) : 0;
  const known = s.players.includes(p);
  const u = clamp(2.5 - 0.35 * (s.buildings.academy || 0) - (known ? 0.5 * seasons : 0), known ? 0.5 : 1, 3);
  const shift = ((((p.id || 1) * 7919) % 100) / 100 - 0.5) * u; // la fourchette n'est pas centrée sur la vérité
  const half = (v) => Math.round(v * 2) / 2;
  const lo = half(clamp(p.pot + shift - u, now, 20));
  const hi = half(clamp(p.pot + shift + u, lo + 0.5, 20));
  return [lo, hi];
}

// Rythme de progression, calé par simulation de carrières (docs/ECONOMIE.md) : les caractéristiques
// gardent leurs décimales, chaque gain compte, d'où un facteur plus bas que l'ancien modèle arrondi.
const PROGRESSION = 0.5;

// Intersaison : progression vers le potentiel (meilleure avec le centre d'entraînement), puis déclin
// physique après 32 ans. Les qualités clés du poste progressent le plus.
export function progressPlayer(p, trainingLvl) {
  const before = playerRating(p);
  const room = Math.max(0, p.pot - before);
  const t = (1 + trainingLvl * 0.25) * PROGRESSION;
  let gain = 0;
  if (p.age <= 19) gain = room * rnd(0.3, 0.55) * t;
  else if (p.age <= 23) gain = room * rnd(0.15, 0.35) * t;
  else if (p.age <= 28) gain = room * rnd(0.04, 0.15) * t;
  gain *= clamp(1.4 - before / 20, 0.45, 1); // au sommet, chaque progrès coûte plus cher
  if (gain > 0) {
    const w = WEIGHTS[p.pos];
    const pool = p.pos === 'G' ? p.g : p.a;
    const f = {};
    let norm = 0;
    for (const k in pool) { f[k] = (0.5 + 4.5 * (w[k] || 0)) * rnd(0.6, 1.4); norm += (w[k] || 0) * f[k]; }
    for (const k in pool) pool[k] = clamp(r1(pool[k] + (gain * f[k]) / norm), 1, 20);
  }
  if (p.age >= 32) {
    // déclin : le physique d'abord, le reste plus lentement (environ −0,4 de note par saison)
    const loss = rnd(0.4, 1.4);
    for (const k in p.a) p.a[k] = clamp(r1(p.a[k] - loss * (['vit', 'end', 'pui'].includes(k) ? 1 : 0.4) * rnd(0.7, 1.3)), 1, 20);
    if (p.g) for (const k in p.g) p.g[k] = clamp(r1(p.g[k] - loss * (k === 'ref' || k === 'uns' ? 0.9 : 0.35) * rnd(0.7, 1.3)), 1, 20);
  }
  p.lastDelta = r1(playerRating(p) - before);
}

export function wantsRetirement(p) {
  return p.age >= 36 || (p.age >= 34 && Math.random() < 0.5);
}

// Conversion des joueurs de l'ancien modèle (attaque, défense, mental) : même note au poste naturel.
const OLD_W = { A: [0.6, 0.1, 0.3], M: [0.35, 0.25, 0.4], D: [0.15, 0.65, 0.2], G: [0.05, 0.85, 0.1] };
export function upgradePlayer(p, s) {
  if (p.a) return p;
  const w = OLD_W[p.pos];
  const old = p.att * w[0] + p.def * w[1] + p.men * w[2];
  Object.assign(p, makeAttributes(p.pos, old - 0.6));
  tuneTo(p, old);
  p.foot ||= Math.random() < 0.72 ? 'droit' : 'gauche';
  if (p.alt === undefined) p.alt = Math.random() < 0.55 ? pick(ALT[p.pos]) || null : null;
  p.traits ||= rollTraits(p);
  p.form ||= [];
  p.season ||= freshSeason();
  p.hist ||= [];
  if (s && p.joined === undefined && s.players.includes(p)) p.joined = Math.max(1, s.seasonNumber - 1);
  delete p.att; delete p.def; delete p.men;
  return p;
}

export function starsOf(p) {
  const n = clamp(Math.round(p.pot / 4), 1, 5);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
