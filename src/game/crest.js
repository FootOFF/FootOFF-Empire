// Écussons des clubs, en trois familles comme dans un vrai championnat : le blason (bouclier héraldique, couronne ou
// ruban), le médaillon (nom du club en cercle, année de fondation) et le badge moderne (monogramme, bandeau). Tous ont
// un liseré de métal, or ou argent, et un émail bombé (dessin : src/ui/crest.jsx).
// Le nôtre se compose à la fondation (style, forme, motif, symbole, inscription, fond) et reste toujours noir et or :
// la charte FootOFF. Ceux des autres clubs se déduisent de leur nom, aux couleurs de leur maillot (kits.js) : toujours
// le même écusson pour un même club.

import { kitOf } from './kits';

export const CREST_STYLES = [['blason', 'Blason'], ['medaillon', 'Médaillon'], ['moderne', 'Moderne']];
export const CREST_SHAPES = {
  blason: [['ancien', 'Ancien'], ['espagnol', 'Arrondi'], ['gothique', 'Pointu'], ['crante', 'Cranté']],
  medaillon: [['cercle', 'Cercle'], ['cranelure', 'Crénelé'], ['double', 'Double cercle']],
  moderne: [['taille', 'Taillé'], ['hexa', 'Hexagone'], ['losange', 'Losange'], ['capsule', 'Capsule']],
};
export const CREST_PATTERNS = [
  ['uni', 'Uni'],
  ['bandes', 'Bandes'],
  ['rayures', 'Rayures'],
  ['parti', 'Parti'],
  ['coupe', 'Coupé'],
  ['echarpe', 'Écharpe'],
  ['chevron', 'Chevron'],
  ['pal', 'Pal'],
  ['fasce', 'Fasce'],
  ['quartiers', 'Quartiers'],
  ['croix', 'Croix'],
  ['sautoir', 'Sautoir'],
  ['damier', 'Damier'],
  ['rayons', 'Rayons'],
  ['bordure', 'Bordure'],
];
export const CREST_ANIMALS = [
  ['lion', 'Lion'], ['aigle', 'Aigle'], ['loup', 'Loup'], ['coq', 'Coq'],
  ['sanglier', 'Sanglier'], ['cheval', 'Cheval'], ['ours', 'Ours'], ['cerf', 'Cerf'],
];
export const CREST_SYMBOLS = [
  ['etoile', 'Étoile'], ['couronne', 'Couronne'], ['chateau', 'Château'], ['tour', 'Tour'], ['ballon', 'Ballon'],
  ['lys', 'Lys'], ['chene', 'Chêne'], ['sapin', 'Sapin'], ['epi', 'Épi'], ['ancre', 'Ancre'], ['navire', 'Navire'],
  ['vague', 'Vagues'], ['montagne', 'Montagne'], ['soleil', 'Soleil'], ['eclair', 'Éclair'], ['pont', 'Pont'],
  ['epees', 'Épées'], ['cles', 'Clés'], ['roue', 'Roue'],
];
export const CREST_EMBLEMS = [['monogramme', 'Monogramme'], ...CREST_ANIMALS, ...CREST_SYMBOLS];
export const CREST_TEXTS = [['les-deux', 'Nom et année'], ['nom', 'Nom'], ['annee', 'Année'], ['aucune', 'Aucune']];
// fond noir (motifs or) ou fond or (motifs noirs) : les deux seules couleurs de notre club
export const CREST_GROUNDS = [['noir', 'Noir'], ['or', 'Or']];

export const CLUB_BLACK = '#0d0d0e';
export const CLUB_GOLD = '#c7a15a';

const ids = (list) => list.map(([id]) => id);
const thisYear = () => new Date().getFullYear();

export function defaultCrest() {
  return { v: 2, style: 'blason', shape: 'ancien', pattern: 'uni', emblem: 'lion', text: 'annee', ground: 'noir', year: thisYear() };
}

export function randomCrest(rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)][0];
  const style = pick(CREST_STYLES);
  return {
    v: 2,
    style,
    shape: pick(CREST_SHAPES[style]),
    pattern: pick(CREST_PATTERNS),
    emblem: pick(CREST_EMBLEMS),
    text: style === 'medaillon' ? 'les-deux' : pick(CREST_TEXTS),
    ground: rng() < 0.75 ? 'noir' : 'or',
    year: thisYear(),
  };
}

// Anciens écussons (une forme parmi dix, sans style) : la famille la plus proche.
const OLD_SHAPES = {
  ecu: ['blason', 'ancien'], blason: ['blason', 'espagnol'], pointe: ['blason', 'gothique'], ecusson: ['blason', 'crante'],
  rond: ['medaillon', 'cercle'], cercle: ['medaillon', 'double'], moderne: ['moderne', 'taille'], hexa: ['moderne', 'hexa'],
  badge: ['moderne', 'capsule'], octo: ['moderne', 'capsule'],
};

// écusson enregistré : chaque champ connu, sinon celui par défaut (anciennes parties, données abîmées)
export function normalizeCrest(c) {
  const d = defaultCrest();
  if (!c || typeof c !== 'object') return d;
  const ok = (v, list, dflt) => (ids(list).includes(v) ? v : dflt);
  let style = ok(c.style, CREST_STYLES, null);
  let shape = c.shape;
  if (!style) [style, shape] = OLD_SHAPES[c.shape] || [d.style, d.shape];
  const emblem = c.emblem === 'initiales' ? 'monogramme' : c.emblem;
  return {
    v: 2,
    style,
    shape: ok(shape, CREST_SHAPES[style], CREST_SHAPES[style][0][0]),
    pattern: ok(c.pattern, CREST_PATTERNS, d.pattern),
    emblem: ok(emblem, CREST_EMBLEMS, d.emblem),
    text: ok(c.text, CREST_TEXTS, style === 'medaillon' ? 'les-deux' : 'annee'),
    ground: ok(c.ground, CREST_GROUNDS, d.ground),
    year: Number.isInteger(c.year) && c.year > 1800 && c.year < 3000 ? c.year : thisYear(),
  };
}

// Changement de style dans le créateur : la forme suit (première forme du nouveau style si l'ancienne n'y est pas).
export function withStyle(c, style) {
  const shapes = ids(CREST_SHAPES[style]);
  return { ...c, style, shape: shapes.includes(c.shape) ? c.shape : shapes[0] };
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
export const lumOf = (rgb) => ((rgb >> 16) & 255) * 0.299 + ((rgb >> 8) & 255) * 0.587 + (rgb & 255) * 0.114;
export const hexLum = (hex) => (hex && hex[0] === '#' ? lumOf(parseInt(hex.slice(1), 16)) : 120);

// Motifs selon la famille : le médaillon garde les découpes qui se lisent dans un disque, le badge moderne les plus
// franches.
const PATTERNS_FOR = {
  blason: ['uni', 'bandes', 'rayures', 'parti', 'coupe', 'echarpe', 'chevron', 'pal', 'fasce', 'quartiers', 'croix', 'sautoir', 'bordure', 'uni', 'parti'],
  medaillon: ['uni', 'rayures', 'bandes', 'rayons', 'quartiers', 'parti', 'damier', 'rayons', 'uni'],
  moderne: ['uni', 'parti', 'echarpe', 'pal', 'coupe', 'uni', 'echarpe'],
};

// Écusson d'un autre club, tiré de son nom : la famille (quatre blasons pour trois médaillons et trois badges), sa
// forme, son motif, son symbole (animal, symbole ou monogramme), son métal, son année de fondation et son
// inscription ; aux deux couleurs du club, le fond à la couleur du maillot et le motif à la seconde couleur.
export function rivalCrest(name = '') {
  const h = (k) => hash(name, k);
  const kit = kitOf(name);
  const base = `#${kit.shirt.toString(16).padStart(6, '0')}`;
  const seconds = SECONDS[kit.shirt] || [WHITE, INK];
  const second = seconds[h(5) % seconds.length];
  const r = h(1) % 100;
  const style = r < 40 ? 'blason' : r < 70 ? 'medaillon' : 'moderne';
  const shapes = ids(CREST_SHAPES[style]);
  const patterns = PATTERNS_FOR[style];
  const animals = ids(CREST_ANIMALS);
  const symbols = ids(CREST_SYMBOLS);
  const e = h(4) % 100;
  const animal = animals[h(6) % animals.length];
  const symbol = symbols[h(7) % symbols.length];
  const emblem = style === 'moderne' ? (e < 50 ? 'monogramme' : e < 78 ? animal : symbol)
    : style === 'medaillon' ? (e < 18 ? 'monogramme' : e < 60 ? animal : symbol)
      : (e < 52 ? animal : symbol);
  const metal = kit.shirt === 0xf2f2f2 || kit.shirt === 0x1d2c5e ? 'or' : kit.shirt === 0xe8dc3a || kit.shirt === 0xe67e22 ? 'argent' : h(8) % 100 < 55 ? 'or' : 'argent';
  const light = lumOf(kit.shirt) > 150;
  const t = h(9) % 100;
  return {
    style,
    shape: shapes[h(2) % shapes.length],
    pattern: patterns[h(3) % patterns.length],
    emblem,
    base,
    second,
    metal,
    ink: h(10) % 100 < 62 ? 'metal' : light ? 'dark' : 'light',
    band: style === 'medaillon' ? (h(11) % 100 < 55 ? INK : second) : null,
    year: 1885 + (h(12) % 100),
    text: style === 'medaillon' ? 'les-deux' : style === 'blason' ? (t < 32 ? 'annee' : t < 54 ? 'nom' : 'aucune') : t < 70 ? 'nom' : 'aucune',
    crown: style === 'blason' && (/^(Real|Royal)\b/.test(name) || h(13) % 100 < 22),
  };
}

// Monogramme d'un club : initiale du premier et du dernier mot qui comptent (« US des Fontaines » → UF).
export function clubInitials(name = '') {
  const words = name.replace(/[’']/g, ' ').split(/[\s-]+/).filter((w) => w && !/^(de|des|du|la|le|les|l|d)$/i.test(w));
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// Nom court d'un club, pour un ruban ou un bandeau : sans les sigles ni les mots de forme (« Union Port-Joli » →
// « Port-Joli », « Yass FC » → « Yass ») ; le nom entier s'il ne reste rien.
const FORM_WORDS = /^(fc|as|us|sc|rc|ac|ca|cs|es|js|oc|so|sa|ss|ssc|afc|cf|sporting|racing|olympique|olympia|stade|union|entente|étoile|etoile|avenir|atlas|jeunesse|club|real|royal|inter|dynamo|athletic|rapid|vitoria|ajax|de|des|du|la|le|les|l|d)$/i;
export function shortName(name = '') {
  const words = name.replace(/[’']/g, ' ').split(/\s+/).filter((w) => w && !FORM_WORDS.test(w));
  return (words.length ? words.join(' ') : name).trim();
}

// Étoiles de notre écusson : une par titre de champion (toutes divisions), cinq au plus.
export const clubStars = (s) => Math.min(5, (s?.trophies || []).filter((t) => t.comp === 'league').length);
