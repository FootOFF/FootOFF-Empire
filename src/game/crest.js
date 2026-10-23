// Écussons des clubs. Le nôtre se compose à la fondation (forme, motif, emblème, fond) et reste toujours noir et
// or : la charte FootOFF. Ceux des autres clubs se déduisent de leur nom, aux couleurs de leur maillot (kits.js) :
// toujours le même écusson pour un même club.

import { kitOf } from './kits';

export const CREST_SHAPES = [
  ['ecu', 'Écu'],
  ['blason', 'Blason'],
  ['moderne', 'Moderne'],
  ['rond', 'Rond'],
  ['hexa', 'Hexagone'],
  ['pointe', 'Pointe'],
  ['cercle', 'Médaillon'],
  ['badge', 'Badge'],
  ['ecusson', 'Écusson'],
  ['octo', 'Octogone'],
];
export const CREST_PATTERNS = [
  ['uni', 'Uni'],
  ['bandes', 'Bandes'],
  ['fasce', 'Bande'],
  ['chevron', 'Chevron'],
  ['echarpe', 'Écharpe'],
  ['quartiers', 'Quartiers'],
  ['pal', 'Pal'],
  ['parti', 'Parti'],
  ['coupe', 'Coupé'],
  ['sautoir', 'Sautoir'],
  ['croix', 'Croix'],
  ['damier', 'Damier'],
  ['rayures', 'Rayures'],
  ['bordure', 'Bordure'],
];
export const CREST_EMBLEMS = [
  ['etoile', 'Étoile'],
  ['ballon', 'Ballon'],
  ['couronne', 'Couronne'],
  ['tour', 'Tour'],
  ['chene', 'Chêne'],
  ['eclair', 'Éclair'],
  ['ancre', 'Ancre'],
  ['soleil', 'Soleil'],
  ['lys', 'Lys'],
  ['montagne', 'Montagne'],
  ['vague', 'Vagues'],
  ['epi', 'Épi'],
  ['pont', 'Pont'],
  ['epees', 'Épées'],
  ['roue', 'Roue'],
  ['sapin', 'Sapin'],
  ['aigle', 'Aigle'],
  ['initiales', 'Initiales'],
];
// fond noir (motifs or) ou fond or (motifs noirs) : les deux seules couleurs de notre club
export const CREST_GROUNDS = [['noir', 'Noir'], ['or', 'Or']];

export const CLUB_BLACK = '#0d0d0e';
export const CLUB_GOLD = '#c7a15a';

const ids = (list) => list.map(([id]) => id);

export function defaultCrest() {
  return { shape: 'ecu', pattern: 'uni', emblem: 'etoile', ground: 'noir' };
}

export function randomCrest(rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)][0];
  return { shape: pick(CREST_SHAPES), pattern: pick(CREST_PATTERNS), emblem: pick(CREST_EMBLEMS), ground: rng() < 0.75 ? 'noir' : 'or' };
}

// écusson enregistré : chaque champ connu, sinon celui par défaut (anciennes parties, données abîmées)
export function normalizeCrest(c) {
  const d = defaultCrest();
  if (!c || typeof c !== 'object') return d;
  const ok = (v, list, dflt) => (ids(list).includes(v) ? v : dflt);
  return {
    shape: ok(c.shape, CREST_SHAPES, d.shape),
    pattern: ok(c.pattern, CREST_PATTERNS, d.pattern),
    emblem: ok(c.emblem, CREST_EMBLEMS, d.emblem),
    ground: ok(c.ground, CREST_GROUNDS, d.ground),
  };
}

const hash = (s, k = 0) => {
  let h = 2166136261 ^ k;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

// Seconde couleur d'un club, selon celle de son maillot : toujours bien contrastée (le rouge va avec le blanc, le
// noir, le marine ou le jaune ; le bleu avec le blanc, le jaune, le rouge ou le ciel…).
const WHITE = '#ffffff';
const INK = '#151515';
const SECONDS = {
  0xc0392b: [WHITE, INK, '#1d2c5e', '#f2c94c'], // rouge
  0x2463c9: [WHITE, '#f2c94c', '#c0392b', '#9fd0f5'], // bleu
  0xf2f2f2: ['#c0392b', '#2463c9', INK, '#1f8a4c', '#7b1e3a'], // blanc
  0x1f8a4c: [WHITE, INK, '#f2c94c'], // vert
  0x6cb4e8: [WHITE, '#1d2c5e', INK], // ciel
  0x7b1e3a: ['#9fd0f5', WHITE, '#f2c94c'], // grenat
  0xe67e22: [INK, WHITE, '#1d2c5e'], // orange
  0x6c3fa0: [WHITE, '#f2c94c', INK], // violet
  0x1d2c5e: [WHITE, '#9fd0f5', '#c0392b', '#f2c94c'], // marine
  0xe8dc3a: [INK, '#1f8a4c', '#2463c9'], // jaune
};
const lumOf = (rgb) => ((rgb >> 16) & 255) * 0.299 + ((rgb >> 8) & 255) * 0.587 + (rgb & 255) * 0.114;

// Écusson d'un autre club : forme, motif et emblème tirés de son nom (un club sur quatre porte ses initiales), aux
// deux couleurs du club : le fond à la couleur du maillot, le motif à sa seconde couleur ; emblème blanc (noir sur un
// maillot clair) ; liseré blanc, noir ou à la seconde couleur.
export function rivalCrest(name = '') {
  const h = (k) => hash(name, k);
  const kit = kitOf(name);
  const shirt = `#${kit.shirt.toString(16).padStart(6, '0')}`;
  const ink = lumOf(kit.shirt) > 150 ? INK : WHITE;
  const seconds = SECONDS[kit.shirt] || [WHITE, INK];
  const second = seconds[h(5) % seconds.length];
  const emblems = ids(CREST_EMBLEMS).filter((e) => e !== 'initiales');
  return {
    shape: ids(CREST_SHAPES)[h(1) % CREST_SHAPES.length],
    pattern: ids(CREST_PATTERNS)[h(2) % CREST_PATTERNS.length],
    emblem: h(3) % 4 === 0 ? 'initiales' : emblems[h(4) % emblems.length],
    base: shirt,
    accent: ink,
    second,
    rim: h(6) % 2 ? second : ink,
  };
}

// Monogramme d'un club : initiale du premier et du dernier mot qui comptent (« US des Fontaines » → UF).
export function clubInitials(name = '') {
  const words = name.replace(/[’']/g, ' ').split(/[\s-]+/).filter((w) => w && !/^(de|des|du|la|le|les|l|d)$/i.test(w));
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
