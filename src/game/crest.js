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
];
export const CREST_PATTERNS = [
  ['uni', 'Uni'],
  ['bandes', 'Bandes'],
  ['fasce', 'Bande'],
  ['chevron', 'Chevron'],
  ['echarpe', 'Écharpe'],
  ['quartiers', 'Quartiers'],
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

// Écusson d'un autre club : forme, motif et emblème tirés de son nom (un club sur trois porte ses initiales),
// fond à la couleur de son maillot, motifs blancs (noirs sur un maillot clair).
export function rivalCrest(name = '') {
  const h = (k) => hash(name, k);
  const kit = kitOf(name);
  const shirt = `#${kit.shirt.toString(16).padStart(6, '0')}`;
  const lum = ((kit.shirt >> 16) & 255) * 0.299 + ((kit.shirt >> 8) & 255) * 0.587 + (kit.shirt & 255) * 0.114;
  const emblems = ids(CREST_EMBLEMS);
  return {
    shape: ids(CREST_SHAPES)[h(1) % CREST_SHAPES.length],
    pattern: ids(CREST_PATTERNS)[h(2) % CREST_PATTERNS.length],
    emblem: h(3) % 3 === 0 ? 'initiales' : emblems[h(4) % (emblems.length - 1)],
    base: shirt,
    accent: lum > 150 ? '#151515' : '#ffffff',
  };
}

// Monogramme d'un club : initiale du premier et du dernier mot qui comptent (« US des Fontaines » → UF).
export function clubInitials(name = '') {
  const words = name.replace(/[’']/g, ' ').split(/[\s-]+/).filter((w) => w && !/^(de|des|du|la|le|les|l|d)$/i.test(w));
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
