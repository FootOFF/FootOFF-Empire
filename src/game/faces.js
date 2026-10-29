import { originOf } from './names';
import { t } from '../i18n/index';

// Visages des joueurs (0.6.1) : traits tirés une fois, gardés sur le joueur (p.face), dessinés par src/ui/portrait.jsx.
// Teint, couleur et texture des cheveux, coiffure (une vingtaine), pilosité, forme du visage, yeux et leur couleur,
// nez, bouche, sourcils, oreilles, et parfois (un joueur sur cinq) un signe particulier : taches de rousseur, grain de
// beauté, cicatrice au sourcil, nez cassé, bandeau, oreilles décollées. Les cheveux grisonnent et se dégarnissent avec
// l'âge (greyAt, baldAt).
// L'origine du nom de famille (names.js, originOf) oriente un peu le teint, donc les cheveux : un joueur sur quatre
// environ fait mélange, comme dans la vie. Aucun sosie dans un effectif (distinctFace). Les joueurs d'avant la 0.6.1
// gardent la base de leur ancien portrait : teint, cheveux, coiffure, barbe (legacyFace).

export const SKINS = ['#f6d7bc', '#f2cba8', '#e3b28c', '#d29e76', '#c98c65', '#a26b46', '#7d4d31', '#5c3723'];
export const HAIRS = ['#15110e', '#2c2018', '#4a3221', '#6d482b', '#b38c4e', '#8c4021', '#d8c391'];
export const GREY = '#8e8a85';
export const EYES = { dark: '#1a1411', brown: '#3b2416', hazel: '#6b4a22', green: '#4c6b3a', blue: '#4a6f96' };
export const BANDS = ['#f1efe9', '#16151a', '#c7a15a'];

// une chaîne → un entier, puis un générateur pseudo-aléatoire (mulberry32) : un même joueur, un même visage
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// tirage pondéré : weights est un tableau de poids, ou un objet { clé: poids }
function weighted(r, weights) {
  const entries = Array.isArray(weights) ? weights.map((w, i) => [i, w]) : Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return entries[entries.length - 1][0];
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

// Teint (du plus clair au plus foncé) selon l'origine du nom ; « mélange » : un joueur sur quatre, un teint plus libre
// mais toujours vraisemblable pour l'origine (0.8.20, remarque du PDG : un Abdoulaye Niang au teint le plus clair, tiré
// dans un mélange de toutes les origines). Les mêmes origines servent aux quatre langues (names-*.js).
const SKIN_BY_ORIGIN = {
  fr: [0.16, 0.22, 0.22, 0.14, 0.1, 0.07, 0.05, 0.04],
  ant: [0, 0.03, 0.08, 0.14, 0.2, 0.25, 0.18, 0.12],
  itpt: [0.08, 0.2, 0.26, 0.22, 0.14, 0.07, 0.03, 0],
  mag: [0.02, 0.07, 0.17, 0.27, 0.25, 0.14, 0.06, 0.02],
  afr: [0, 0, 0, 0.06, 0.12, 0.24, 0.31, 0.27],
};
const SKIN_MIX = [0.11, 0.13, 0.14, 0.14, 0.13, 0.13, 0.12, 0.1]; // nom français : tous les teints
const MIX_BY_ORIGIN = {
  fr: SKIN_MIX,
  ant: [0, 0.02, 0.1, 0.16, 0.2, 0.2, 0.18, 0.14],
  itpt: [0.12, 0.18, 0.2, 0.2, 0.16, 0.1, 0.04, 0],
  mag: [0.04, 0.1, 0.18, 0.22, 0.2, 0.14, 0.08, 0.04],
  afr: [0, 0, 0, 0.08, 0.16, 0.24, 0.28, 0.24],
};
export const MIX = 0.25;
// un teint possible pour l'origine du nom (tirage habituel ou mélange) : sinon le visage est retiré (save.js)
export const plausibleSkin = (p) => {
  const o = originOf(p.name);
  const sk = (p.face || {}).sk;
  return !Number.isInteger(sk) || (SKIN_BY_ORIGIN[o] || SKIN_MIX)[sk] > 0 || (MIX_BY_ORIGIN[o] || SKIN_MIX)[sk] > 0;
};
const tone = (sk) => (sk <= 2 ? 0 : sk <= 4 ? 1 : 2); // clair, mat, foncé

// Texture des cheveux selon le teint, puis coiffures possibles pour chaque texture (toutes restent possibles ailleurs
// par le mélange du teint).
const TEXTURE = [
  { straight: 0.5, wavy: 0.32, curly: 0.16, coily: 0.02 },
  { straight: 0.25, wavy: 0.3, curly: 0.33, coily: 0.12 },
  { straight: 0.04, wavy: 0.08, curly: 0.3, coily: 0.58 },
];
export const STYLES = {
  straight: { short: 3, side: 3, crop: 2, quiff: 2, undercut: 2, slick: 1.5, messy: 1.5, long: 1.2, bun: 0.8, ponytail: 0.6, mullet: 0.8, buzz: 1.5, mohawk: 0.3 },
  wavy: { short: 2, side: 2, crop: 1.5, quiff: 1.5, undercut: 2, messy: 2, curly: 1, long: 1.2, bun: 1, ponytail: 0.5, mullet: 1, buzz: 1.5, mohawk: 0.3 },
  curly: { curly: 3, afroShort: 1.5, undercut: 1.5, crop: 1, buzz: 2, long: 0.6, bun: 1, mohawk: 0.5, messy: 1, hightop: 0.4 },
  coily: { buzz: 3, afro: 1.2, afroShort: 2.5, locs: 1.6, braids: 1.4, hightop: 0.6, mohawk: 0.7, curly: 1, bun: 0.3 },
};
// Couleur des cheveux selon le teint (noir, châtain foncé, brun, châtain, blond, roux, blond très clair)
const HAIR_BY_SKIN = [
  [0.08, 0.2, 0.24, 0.2, 0.18, 0.07, 0.03],
  [0.08, 0.2, 0.24, 0.2, 0.18, 0.07, 0.03],
  [0.2, 0.3, 0.25, 0.14, 0.07, 0.02, 0.02],
  [0.2, 0.3, 0.25, 0.14, 0.07, 0.02, 0.02],
  [0.45, 0.33, 0.14, 0.05, 0.01, 0, 0.02],
  [0.45, 0.33, 0.14, 0.05, 0.01, 0, 0.02],
  [0.66, 0.26, 0.05, 0.01, 0, 0, 0.02],
  [0.66, 0.26, 0.05, 0.01, 0, 0, 0.02],
];
const EYE_BY_TONE = [
  { dark: 0.1, brown: 0.35, hazel: 0.15, green: 0.12, blue: 0.28 },
  { dark: 0.2, brown: 0.5, hazel: 0.18, green: 0.07, blue: 0.05 },
  { dark: 0.55, brown: 0.4, hazel: 0.05, green: 0, blue: 0 },
];
// pilosité selon l'âge
const BEARD_BY_AGE = (age) => (age < 20 ? { none: 0.85, stubble: 0.15 }
  : age < 24 ? { none: 0.55, stubble: 0.25, short: 0.08, goatee: 0.06, moustache: 0.03, chinstrap: 0.03 }
    : { none: 0.35, stubble: 0.22, short: 0.15, full: 0.1, goatee: 0.08, moustache: 0.04, chinstrap: 0.03, vandyke: 0.03 });
export const SIGN_RATE = 0.2; // un joueur sur cinq a un signe particulier
export const SIGNS = ['freckles', 'mole', 'scar', 'broken', 'band', 'ears'];

// Traits fins (tout sauf teint, cheveux, coiffure et pilosité) : communs au nouveau tirage et aux anciens joueurs.
function details(r, f) {
  f.sh = weighted(r, { oval: 0.35, round: 0.22, square: 0.22, long: 0.21 });
  f.ey = weighted(r, { dot: 0.24, almond: 0.24, narrow: 0.18, round: 0.18, droopy: 0.16 });
  f.ec = weighted(r, EYE_BY_TONE[tone(f.sk)]);
  f.es = Math.round((r() * 0.6 - 0.3) * 100) / 100; // écart des yeux
  f.no = weighted(r, { short: 0.24, straight: 0.22, wide: 0.2, aquiline: 0.16, button: 0.18 });
  f.mo = weighted(r, { neutral: 0.3, thin: 0.2, full: 0.2, smile: 0.15, serious: 0.15 });
  f.bw = weighted(r, { fine: 0.3, normal: 0.42, thick: 0.28 });
  f.ba = weighted(r, { straight: 0.34, arched: 0.36, angled: 0.3 });
  f.ea = r() < 0.2 ? 'small' : 'normal';
  f.sg = null;
  if (r() < SIGN_RATE) {
    let sg = SIGNS[Math.floor(r() * SIGNS.length)];
    if (sg === 'freckles' && tone(f.sk) === 2) sg = 'mole'; // taches de rousseur : peaux claires et mates
    f.sg = sg;
    if (sg === 'band') f.bc = Math.floor(r() * BANDS.length);
    if (sg === 'mole' || sg === 'scar') f.sx = r() < 0.5 ? 0 : 1; // côté
  }
  // âge où les cheveux grisonnent (0 : jamais) ; front qui se dégarnit (cheveux lisses ou ondulés surtout)
  f.gr = r() < 0.35 ? 0 : ri(r, 31, 38);
  f.bd = (f.tx === 'straight' || f.tx === 'wavy') && r() < 0.16 ? ri(r, 28, 34) : 0;
  f.later = ri(r, 1, 4); // ancien joueur : délai avant de grisonner ou de se dégarnir, s'il n'y est pas déjà
  return f;
}

// Nouveau visage (0.6.1). seed : un nombre (le visage d'un joueur créé), ou absent pour un visage tiré de son
// identité (adversaires du direct, joueurs sans visage gardé).
export function drawFace(p, seed = null) {
  const r = rng(seed ?? hash(`${p.id ?? ''}|${p.name}|v2`));
  const age = p.age || 25;
  const origin = originOf(p.name);
  const f = { v: 2 };
  f.sk = weighted(r, r() < MIX ? MIX_BY_ORIGIN[origin] || SKIN_MIX : SKIN_BY_ORIGIN[origin] || SKIN_MIX);
  f.tx = weighted(r, TEXTURE[tone(f.sk)]);
  f.hc = weighted(r, HAIR_BY_SKIN[f.sk]);
  f.hs = weighted(r, STYLES[f.tx]);
  f.fh = weighted(r, BEARD_BY_AGE(age));
  if (age < 24) { // un jeune : sa barbe d'adulte viendra plus tard
    f.fa = weighted(r, BEARD_BY_AGE(26));
    f.fhAt = ri(r, Math.max(age + 1, 20), 26);
  }
  f.jw = Math.round((0.94 + r() * 0.12) * 100) / 100;
  f.by = r() < 0.5 ? 0 : 0.5;
  details(r, f);
  delete f.later;
  return f;
}

// Visage d'un joueur d'avant la 0.6.1 : la base de son ancien portrait (même tirage, à son âge d'aujourd'hui : teint,
// cheveux et leur gris, coiffure, barbe, mâchoire, sourcils), plus les nouveaux traits.
const OLD_SKIN = [1, 2, 4, 5, 6, 7]; // anciens teints dans la nouvelle palette
export function legacyFace(p) {
  const r = rng(hash(`${p.id ?? ''}|${p.name}`));
  const age = p.age || 25;
  const skin = Math.floor(r() * 6);
  const dark = skin >= 3;
  const hair = dark ? Math.floor(r() * 3) : Math.floor(r() * 6);
  const grey = age >= 31 && r() < 0.18 + (age - 31) * 0.08;
  const styles = dark ? ['buzz', 'curly', 'curly', 'short', 'buzz', 'bun', 'short'] : ['short', 'side', 'side', 'buzz', 'long', 'bun', 'curly', 'short'];
  let style = styles[Math.floor(r() * styles.length)];
  if (age >= 27 && r() < 0.08 + (age - 27) * 0.03) style = 'bald';
  const b = r();
  const beard = age >= 24 ? (b < 0.22 ? 'full' : b < 0.48 ? 'stubble' : 'none') : b < 0.16 ? 'stubble' : 'none';
  const jaw = 0.94 + r() * 0.12;
  const brow = r() < 0.5 ? 0 : 0.5;
  const f = {
    v: 2, sk: OLD_SKIN[skin], tx: style === 'curly' ? 'curly' : dark ? 'coily' : 'straight', hc: hair, hs: style, fh: beard,
    jw: Math.round(jaw * 100) / 100, by: brow,
  };
  // l'ancien portrait changeait de barbe à 24 ans (même tirage) : il le fera encore
  if (age < 24) { f.fa = b < 0.22 ? 'full' : b < 0.48 ? 'stubble' : 'none'; f.fhAt = 24; }
  details(rng(hash(`${p.id ?? ''}|${p.name}|v2`)), f);
  // il garde son visage d'aujourd'hui : gris s'il l'était (tout à fait), sinon il grisonnera ou se dégarnira plus tard
  if (grey) f.gr = age - 2;
  else if (f.gr && f.gr <= age) f.gr = age + f.later;
  if (style === 'bald') f.bd = 0;
  else if (f.bd && f.bd <= age) f.bd = age + f.later;
  delete f.later;
  return f;
}

// Le visage d'un joueur : gardé (p.face), sinon tiré de son identité.
export const faceOf = (p) => p.face || drawFace(p);

// Ce qui change avec l'âge : cheveux gris (un temps poivre et sel), front dégarni, barbe d'adulte.
export function agedFace(f, age = 25) {
  const grey = f.gr > 0 && age >= f.gr ? Math.min(1, (age - f.gr + 1) / 3) : 0;
  const style = f.bd > 0 && age >= f.bd && f.hs !== 'bald' ? (age >= f.bd + 5 && f.hs === 'buzz' ? 'bald' : 'receding') : f.hs;
  const beard = f.fa && age >= f.fhAt ? f.fa : f.fh || 'none';
  return { grey, style, beard };
}

// Silhouette d'un visage, ce qu'on distingue d'un coup d'œil (même en petit) : teint, cheveux, coiffure, barbe, bandeau.
export function silhouetteOf(f, age = 25) {
  const { grey, style, beard: fh } = agedFace(f, age);
  const hair = grey >= 1 ? 'g' : f.hc === 4 || f.hc === 6 ? 'b' : f.hc === 5 ? 'r' : f.hc === 3 ? 'c' : 'd';
  const beard = { none: 0, stubble: 0, short: 1, full: 1, chinstrap: 1, goatee: 2, vandyke: 2, moustache: 3 }[fh] ?? 0;
  return `${tone(f.sk)}|${hair}|${style}|${beard}|${f.sg === 'band' ? 'band' : f.sg === 'ears' ? 'ears' : ''}`;
}

// Aucun sosie dans l'effectif : un joueur qui ressemble trop à un coéquipier (même silhouette) prend une coiffure (ou
// une barbe) voisine, gardée sur son visage. Renvoie le joueur.
export function distinctFace(squad, p) {
  p.face ||= drawFace(p);
  const others = new Set(squad.filter((q) => q !== p && q.id !== p.id).map((q) => silhouetteOf(faceOf(q), q.age)));
  const r = rng(hash(`${p.id ?? ''}|${p.name}|sosie`));
  for (let k = 0; k < 24 && others.has(silhouetteOf(p.face, p.age)); k++) {
    const f = { ...p.face };
    if (k % 3 !== 2 || (p.age || 25) < 20) f.hs = weighted(r, STYLES[f.tx] || STYLES.straight);
    else { f.fh = weighted(r, BEARD_BY_AGE(p.age || 25)); delete f.fa; delete f.fhAt; }
    if (f.hs !== p.face.hs && f.bd && (p.age || 25) >= f.bd) f.bd = 0; // nouvelle coupe : plus de front dégarni
    p.face = f;
  }
  return p;
}

// Tout un effectif, dans l'ordre d'arrivée : seul le dernier arrivé de deux sosies change.
export function distinctSquad(players) {
  const order = [...players].sort((a, b) => (a.joined ?? 0) - (b.joined ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  const seen = [];
  for (const p of order) { distinctFace(seen, p); seen.push(p); }
  return players;
}
