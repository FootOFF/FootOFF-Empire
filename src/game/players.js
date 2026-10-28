import { clamp, pick, ri, rnd } from './utils';
import { YOUTH_GEN } from './constants';
import { playerName } from './names';
import { drawFace } from './faces';
import { scoutingError, signingFor, wageFor } from './economy';

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

// Signes distinctifs : une touche de personnalité, avec un vrai effet en match (0.8.5 : environ +0,1 point par match là où
// le signe agit, mesuré ; live.js, TRAIT_FX, et tactics.js, LEADER_BONUS). Les adversaires ont les leurs.
export const TRAITS = {
  finisseur: { name: 'Finisseur', desc: 'Transforme 50 % d’occasions de plus que les autres.' },
  passeur: { name: 'Passeur', desc: 'Son équipe se crée 10 % d’occasions en plus, et il délivre bien plus souvent la passe décisive.' },
  infatigable: { name: 'Infatigable', desc: 'Se fatigue 40 % moins vite. À partir de la 70e minute, son équipe se crée 40 % d’occasions en plus.' },
  fleche: { name: 'Flèche', desc: 'Sa vitesse fait la différence : 9 % d’occasions en plus pour son équipe, 15 % en bloc bas.' },
  roc: { name: 'Roc', desc: 'Gagne ses duels : l’adversaire se crée 10 % d’occasions en moins.' },
  leader: { name: 'Leader', desc: 'Son onze gagne en sérénité : +0,3 au niveau d’équipe (un seul leader compte).' },
  sangChaud: { name: 'Sang chaud', desc: 'Engagé dans les duels (3 % d’occasions en plus), mais son équipe prend 40 % de cartons jaunes en plus et 2,2 fois plus de rouges.' },
  frappe: { name: 'Frappe lointaine', desc: 'Tente souvent sa chance de loin : 9 % d’occasions en plus pour son équipe.' },
  grandsSoirs: { name: 'Joueur des grands soirs', desc: 'Contre un adversaire plus fort, il transforme 30 % d’occasions de plus, et son équipe s’en crée 6 % de plus.' },
  chat: { name: 'Chat', desc: 'Réflexes de félin : l’adversaire transforme 12 % d’occasions en moins, et rate plus souvent ses penalties.' },
};

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100; // progrès : deux décimales, pour ne rien perdre des petits gains
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

// Jeune repéré par l'académie (0 à 5) : un niveau de 3 à 9 environ selon son âge (15 à 17 ans) et l'académie, et un
// potentiel rarement très haut (YOUTH_GEN, constants.js ; fourchettes affichées : academyTalent, economy.js).
const youthCenter = (academy, age) => YOUTH_GEN.base + YOUTH_GEN.perLevel * academy + rnd(0, YOUTH_GEN.spread) + YOUTH_GEN.perAge * (age - 15);
const youthPot = (center, academy) => center + YOUTH_GEN.potBase + YOUTH_GEN.potPerLevel * academy + YOUTH_GEN.potTail * Math.random() ** 3;

// name : nom déjà choisi (onze adverse tiré d'une graine, opponents.js) ; sinon un nom neuf de la partie.
export function makePlayer({ level = 0, youth = false, academy = 0, pos = null, age: forceAge = null, name = null } = {}) {
  const p = pos || pick(['D', 'D', 'M', 'M', 'A', 'A', 'G']);
  const age = forceAge ?? (youth ? ri(15, 17) : ri(19, 30));
  const center = youth ? youthCenter(academy, age) : 4 + level * 2 + rnd(-1, 2);
  const pot = clamp(Math.round(youth ? youthPot(center, academy) : center + ri(2, 6)), 8, 20);
  const player = {
    name: name || playerName(), // jamais deux fois le même nom dans la partie (names.js)
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
  player.face = drawFace(player, Math.floor(Math.random() * 4294967296)); // son visage, tiré une fois (faces.js)
  return player;
}

export const freshSeason = () => ({ apps: 0, goals: 0, assists: 0, yellow: 0, red: 0, sum: 0, motm: 0, minutes: 0, shots: 0, onTarget: 0, clean: 0 });

// Numéros de maillot : les numéros classiques de chaque poste d'abord.
const NUMBERS = { G: [1, 16, 30, 40], D: [2, 3, 4, 5, 12, 13, 15, 23, 24], M: [6, 8, 10, 14, 17, 18, 20, 21], A: [7, 9, 11, 19, 22, 25, 26, 27] };
export function assignNumber(players, p) {
  const used = new Set(players.filter((q) => q !== p).map((q) => q.num));
  p.num = [...NUMBERS[p.pos], ...Array.from({ length: 70 }, (_, i) => i + 28)].find((n) => !used.has(n));
  return p;
}

// Salaire de référence (voir economy.js) : il suit la note du joueur et la division du club. C'est la base des demandes
// de salaire (contracts.js), de la valeur de marché et de la prime de signature d'un joueur libre. Le salaire d'un
// joueur de l'effectif est celui de son contrat (p.deal, depuis la 0.8.0) ; sans contrat (marché, académie), la
// référence (wageCut : baisse négociée à la Direction avant les contrats, reprise dans le contrat au chargement).
const baseWage = (p, divisionIndex) => wageFor(playerRating(p), divisionIndex);
export const refWage = (p, divisionIndex = 0) => Math.round(baseWage(p, divisionIndex));
export const wageOf = (p, divisionIndex = 0) => (p.deal ? p.deal.wage : Math.round(baseWage(p, divisionIndex) * (1 - (p.wageCut || 0))));
export const signingFee = (p, divisionIndex = 0) => signingFor(marketValue(p, divisionIndex));

// Valeur de marché d'un joueur : deux saisons de salaire, plus pour un jeune (à potentiel), moins pour un trentenaire.
// C'est la référence de tous les prix : un club vendeur en demande l'indemnité (selon le contrat, le cours du marché et
// ton réseau de recruteurs), un club acheteur en paie 85 % de base (un grand club davantage, et la négociation fait le
// reste). Une recrue (ou un jeune monté de l'académie) ne se revend qu'après quatre journées de championnat au club
// (mercato.js, saleBlock) : faire progresser un joueur rapporte, pas l'acheter pour le revendre aussitôt.
const ageFactor = (age) => (age <= 21 ? 1.35 : age <= 24 ? 1.15 : age >= 31 ? 0.7 : age >= 29 ? 0.85 : 1);
const roomFactor = (p) => clamp(1 + 0.07 * Math.max(0, p.pot - playerRating(p)), 1, 1.5);
const roundValue = (v) => Math.max(50, Math.round(v / 50) * 50);
export const marketValue = (p, divisionIndex = 0) => roundValue(baseWage(p, divisionIndex) * 2.0 * ageFactor(p.age) * roomFactor(p));
export const saleValue = (p, divisionIndex = 0) => roundValue(marketValue(p, divisionIndex) * 0.85);

// Indemnité de transfert demandée par le club vendeur : sa valeur de marché, plus pour un long contrat, moins en fin
// de contrat. Le réseau du bureau des transferts fait baisser la facture (−3 % par niveau).
export function transferFee(p, divisionIndex = 0, officeLvl = 0) {
  const contract = 0.8 + 0.1 * (p.contract || 2);
  return roundValue(marketValue(p, divisionIndex) * contract * (1 - 0.03 * officeLvl));
}
// Prix demandé pour une recrue : indemnité de transfert (joueur sous contrat) ou prime de signature (joueur libre),
// selon le cours du joueur sur le marché (priceMod : le prix monte s'il est courtisé, baisse s'il ne trouve pas
// preneur). Arrondi à une somme ronde à l'échelle du montant.
export const costOf = (p, s) => {
  if (p.leaguePrice != null) return p.leaguePrice; // championnat entre amis : prix du marché commun, ou prix indicatif d'un joueur d'ami
  const base = (p.club ? transferFee(p, s.divisionIndex, s.buildings.transfers || 0) : signingFee(p, s.divisionIndex)) * (p.priceMod || 1);
  const step = base < 5000 ? 50 : base < 50000 ? 250 : base < 500000 ? 2500 : 25000;
  return Math.max(step, Math.round(base / step) * step);
};

// Potentiel estimé : une fourchette, d'autant plus précise que l'académie est développée et que le joueur
// est suivi au club depuis longtemps (équipe de jeunes comprise). Null quand le joueur a atteint son plafond.
export function potentialRange(p, s) {
  const now = playerRating(p);
  if (p.pot <= now + 0.3) return null;
  const since = p.youthSince ?? p.joined;
  const seasons = since ? Math.max(0, s.seasonNumber - since) : 0;
  const known = s.players.includes(p) || (s.youth || []).includes(p);
  const scouts = p.club ? 0.25 * (s.buildings.transfers || 0) : 0; // rapports des recruteurs sur les joueurs sous contrat
  const u0 = clamp(scoutingError(s.buildings.academy || 0) - scouts - (known ? 0.5 * seasons : 0), known ? 0.5 : 0.75, 3);
  const u = p.sharp ? Math.max(0.5, u0 / 2) : u0; // repéré lors d'une mission dans une région (avant la 0.8.12) : deux fois mieux cerné
  const shift = ((((p.id || 1) * 7919) % 100) / 100 - 0.5) * u; // la fourchette n'est pas centrée sur la vérité
  const half = (v) => Math.round(v * 2) / 2;
  const lo = half(clamp(p.pot + shift - u, now, 20));
  const hi = half(clamp(p.pot + shift + u, lo + 0.5, 20));
  return [lo, hi];
}

// Rythme de progression, calé par simulation de carrières (docs/ECONOMIE.md) : les caractéristiques
// gardent leurs décimales, chaque gain compte, d'où un facteur plus bas que l'ancien modèle arrondi.
const PROGRESSION = 0.5;

// Bond de l'intersaison vers le potentiel, en points de note : d'autant plus grand que le joueur est jeune ; au
// sommet, chaque progrès coûte plus cher. Le même pour les jeunes de l'académie (academy.js) : le centre
// d'entraînement n'y change rien.
export function seasonGain(p) {
  const before = playerRating(p);
  const room = Math.max(0, p.pot - before);
  let gain = 0;
  if (p.age <= 19) gain = room * rnd(0.3, 0.55);
  else if (p.age <= 23) gain = room * rnd(0.15, 0.35);
  else if (p.age <= 28) gain = room * rnd(0.04, 0.15);
  return gain * PROGRESSION * clamp(1.4 - before / 20, 0.45, 1);
}

// Le bond de l'été est réduit depuis que les joueurs progressent au fil de la saison, au centre d'entraînement
// (séances entre les matchs et séance collective : training.js) : six dixièmes du bond, à tous les niveaux du centre.
// Les jeunes de l'académie aussi (academy.js), depuis la 0.5.0 : ils avaient le bond entier.
export const SUMMER = 0.6;

// Intersaison : progression vers le potentiel, puis déclin physique après 32 ans. Les qualités clés du poste
// progressent le plus.
export function progressPlayer(p) {
  const before = playerRating(p);
  const gain = seasonGain(p) * SUMMER;
  if (gain > 0) {
    const w = WEIGHTS[p.pos];
    const pool = p.pos === 'G' ? p.g : p.a;
    const f = {};
    let norm = 0;
    for (const k in pool) { f[k] = (0.5 + 4.5 * (w[k] || 0)) * rnd(0.6, 1.4); norm += (w[k] || 0) * f[k]; }
    for (const k in pool) pool[k] = clamp(r2(pool[k] + (gain * f[k]) / norm), 1, 20);
  }
  if (p.age >= 32) {
    // déclin : le physique d'abord, le reste plus lentement (environ −0,4 de note par saison)
    const loss = rnd(0.4, 1.4);
    for (const k in p.a) p.a[k] = clamp(r2(p.a[k] - loss * (['vit', 'end', 'pui'].includes(k) ? 1 : 0.4) * rnd(0.7, 1.3)), 1, 20);
    if (p.g) for (const k in p.g) p.g[k] = clamp(r2(p.g[k] - loss * (k === 'ref' || k === 'uns' ? 0.9 : 0.35) * rnd(0.7, 1.3)), 1, 20);
  }
  p.lastDelta = r1(playerRating(p) - before);
}

// --- Condition physique, blessures, suspensions ---------------------------------------------------------------
// Condition (fit, 0 à 100, 100 au repos) : un match en coûte selon l'endurance (25 points pour un joueur très
// endurant, 40 pour un joueur peu endurant ; moitié pour un gardien ; « Infatigable » : ×0,6), et d'ici la date
// suivante le joueur en récupère une part (recoveryRate, 0.8.5). En match, la condition baisse minute après minute et
// pèse sur le niveau du joueur (fitFactor : −15 % à zéro). Un joueur fatigué se blesse plus souvent. Avant la 0.8.5,
// chaque date rendait un forfait (24, 21 ou 18 points, +1,5 par niveau du centre) : avec un centre développé, un
// titulaire effaçait tout un match et restait près de 100 %.
export const fitOf = (p) => clamp(p.fit ?? 100, 0, 100);
export const fitFactor = (fit) => 0.85 + (0.15 * clamp(fit, 0, 100)) / 100;
// Forme (0.8.1) : la moyenne des notes de ses derniers matchs (sur 10, deux matchs au moins). Elle se lit sur les fiches
// mais ne pèse plus en match depuis la 0.8.8 (demande du PDG) : seules la condition physique et les capacités comptent.
export const FORM_NEUTRAL = 6.2;
export const formAvg = (p) => (p.form?.length >= 2 ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
export function matchCost(p) {
  const end = p.a?.end ?? 10;
  const base = 30 * (1.35 - end / 40) * (p.pos === 'G' ? 0.5 : 1) * (p.traits?.includes('infatigable') ? 0.6 : 1);
  return Math.round(base * 10) / 10;
}
// Récupération d'ici le prochain match (0.8.5, demande du PDG : la fatigue se voit et se gère) : une part de la fatigue,
// non plus un forfait qui effaçait un match entier. Un titulaire qui enchaîne se stabilise autour de 75 % au coup
// d'envoi (simulé : 73 à 76 % sans centre, 83 à 85 % au niveau 5 ; de 50 % pour un vétéran peu endurant à 90 % pour un
// jeune endurant, davantage pour un gardien ou un Infatigable) : le centre d'entraînement ajoute 2,5 % de part par
// niveau, il aide sans effacer la fatigue. Un remplaçant récupère vite.
export const recoveryRate = (p, trainingLvl = 0) => (p.age <= 27 ? 0.55 : p.age <= 31 ? 0.5 : 0.45) + 0.025 * trainingLvl;
export const recoveryOf = (p, trainingLvl = 0) => (100 - fitOf(p)) * recoveryRate(p, trainingLvl);
// condition d'un joueur à une minute du match, entré à la minute `since`
export const fitAt = (p, minute, since = 0) => Math.max(0, fitOf(p) - (matchCost(p) * Math.max(0, minute - since)) / 90);

// Blessures : durée en dates du calendrier (matchs du club), tirée au moment de la blessure.
export const INJURIES = [
  { out: 1, label: 'Coup reçu', w: 34 }, { out: 2, label: 'Élongation', w: 30 }, { out: 3, label: 'Entorse', w: 16 },
  { out: 4, label: 'Claquage', w: 10 }, { out: 6, label: 'Déchirure musculaire', w: 7 }, { out: 9, label: 'Fracture', w: 3 },
];
export function drawInjury() {
  const total = INJURIES.reduce((a, i) => a + i.w, 0);
  let r = Math.random() * total;
  for (const i of INJURIES) { r -= i.w; if (r <= 0) return { out: i.out, total: i.out, label: i.label }; }
  return { out: 1, total: 1, label: INJURIES[0].label };
}
export const isInjured = (p) => (p.injury?.out || 0) > 0;
export const isBanned = (p) => (p.ban || 0) > 0;
// disponible pour le prochain match (ni blessé, ni suspendu)
export const available = (p) => !isInjured(p) && !isBanned(p);
const matches = (n) => `${n} match${n > 1 ? 's' : ''}`;
// « Blessé · entorse · 3 matchs », « Suspendu · 1 match », ou null
export function absenceOf(p) {
  if (isInjured(p)) return { kind: 'injury', label: `Blessé · ${p.injury.label.toLowerCase()} · ${matches(p.injury.out)}`, short: `Blessé · ${matches(p.injury.out)}`, matches: p.injury.out };
  if (isBanned(p)) return { kind: 'ban', label: `Suspendu · ${matches(p.ban)}`, short: `Suspendu · ${matches(p.ban)}`, matches: p.ban };
  return null;
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
