import React, { useId } from 'react';
import { CLUB_BLACK, clubInitials, hexLum, normalizeCrest, rivalCrest, shortName } from '../game/crest';

// Dessin des écussons (données : src/game/crest.js). Repère 100 × 116, trois familles :
// - blason : bouclier sur un liseré de métal, couronne (ou étoiles de titres) au-dessus, ruban en bas ;
// - médaillon : anneau de métal, bandeau où le nom du club court en cercle (et l'année de fondation en bas), disque
//   central ;
// - moderne : badge aux formes franches, monogramme ou symbole, bandeau du nom court.
// Rendu « métal émaillé » : liserés et symboles en or ou argent poli (dégradés à reflets), émail bombé (ombre et
// lumière douces), reflet en haut, léger relief sous le symbole. Le nom, l'année et le ruban ne s'écrivent qu'en
// grand (full) : en petit, l'écusson garde sa silhouette, ses couleurs et son symbole.

const GOLD = {
  rim: [[0, '#fbefc6'], [0.18, '#d5a955'], [0.34, '#946a2b'], [0.5, '#f6e1a3'], [0.64, '#c29343'], [0.82, '#835e25'], [1, '#e6c983']],
  em: [[0, '#fff3cb'], [0.4, '#dcb162'], [0.72, '#a97c34'], [1, '#76531f']],
  edge: '#3d2a0e',
  text: '#f6e3ad',
  ink: '#241805',
};
const SILVER = {
  rim: [[0, '#ffffff'], [0.18, '#c9d0d6'], [0.34, '#7a838c'], [0.5, '#f4f7f9'], [0.64, '#a9b2ba'], [0.82, '#646d75'], [1, '#e2e7eb']],
  em: [[0, '#ffffff'], [0.4, '#d3d9de'], [0.72, '#9aa3ab'], [1, '#69727a']],
  edge: '#262b30',
  text: '#eef2f5',
  ink: '#181c20',
};
const GOLD_FIELD = [[0, '#e7cd8f'], [0.5, '#c7a15a'], [1, '#9c7634']]; // fond or de notre club
const WHITE_EM = [[0, '#ffffff'], [0.55, '#ecebe6'], [1, '#c4c3bb']];
const DARK_EM = [[0, '#3a3a3a'], [0.6, '#1b1b1b'], [1, '#0a0a0a']];
const HALO = 5; // contour à la couleur du fond autour du symbole : il se lit sur tous les motifs

// --- Silhouettes --------------------------------------------------------------------------------------------------

const BLASON = {
  ancien: 'M10 11C25 14 38 12.5 50 6C62 12.5 75 14 90 11V58C90 85 72 102 50 110C28 102 10 85 10 58Z',
  espagnol: 'M10 8H90V68C90 92 72 108 50 108C28 108 10 92 10 68Z',
  gothique: 'M10 8H90V52C90 80 73 99 50 110C27 99 10 80 10 52Z',
  crante: 'M10 17L19 8H81L90 17V57C90 84 72 101 50 110C28 101 10 84 10 57Z',
};
const MODERNE = {
  taille: 'M21 7H79L91 19V62C91 85 71 100 50 109C29 100 9 85 9 62V19Z',
  hexa: 'M50 6L91 29.5V86.5L50 110L9 86.5V29.5Z',
  losange: 'M50 5L94 58L50 111L6 58Z',
  capsule: 'M31 8H69A22 22 0 0 1 91 30V86A22 22 0 0 1 69 108H31A22 22 0 0 1 9 86V30A22 22 0 0 1 31 8Z',
};
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const DISC = circle(50, 60, 29.6); // disque du médaillon

// --- Motifs (dans le repère 100 × 116, découpés dans le champ) -----------------------------------------------------

const P = (cx, cy, a, d) => `${(cx + Math.cos(a) * d).toFixed(2)} ${(cy + Math.sin(a) * d).toFixed(2)}`;
const stripes = (x0, w, gap, n) => Array.from({ length: n }, (_, i) => `M${x0 + i * gap} 0h${w}v116H${x0 + i * gap}Z`).join('');
const checks = () => {
  let d = '';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2 === 0) d += `M${c * 20} ${r * 20}h20v20H${c * 20}Z`;
  return d;
};
const wedges = (cx, cy, n) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n;
  return `M${cx} ${cy}L${P(cx, cy, a, 95)}L${P(cx, cy, a + Math.PI / n, 95)}Z`;
}).join('');

const PATTERNS = {
  uni: null,
  bandes: 'M14 0h14v116H14ZM43 0h14v116H43ZM72 0h14v116H72Z',
  rayures: stripes(5, 5.5, 11, 9),
  parti: 'M50 0H100V116H50Z',
  coupe: 'M0 0H100V57H0Z',
  echarpe: 'M-8 14L14-8 108 86 86 108Z',
  chevron: 'M0 76 50 46l50 30v18L50 64 0 94Z',
  pal: 'M38 0H62V116H38Z',
  fasce: 'M0 47H100V69H0Z',
  quartiers: 'M0 0H50V58H0ZM50 58H100V116H50Z',
  croix: 'M41 0H59V116H41ZM0 49H100V67H0Z',
  sautoir: 'M-4 4 8-8l100 108-12 12ZM92-8l12 12L4 124l-12-12Z',
  damier: checks(),
  rayons: wedges(50, 60, 12),
};

// --- Symboles et animaux --------------------------------------------------------------------------------------------
// Repère centré en (50, 60), tenant dans 48 × 48 (« aucun » : pas de symbole). Pièces : d (chemin), w (trait : épaisseur), cut (détail gravé,
// sombre), m (pièce doublée en miroir autour de x = 50), t (transformation).

const star = (cx, cy, R, r) => `M${Array.from({ length: 10 }, (_, i) => P(cx, cy, -Math.PI / 2 + (i * Math.PI) / 5, i % 2 ? r : R)).join(' ')}Z`;
const rays = (cx, cy, r0, r1, n) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n;
  return `M${P(cx, cy, a - Math.PI / n, r0)} ${P(cx, cy, a, r1)} ${P(cx, cy, a + Math.PI / n, r0)}Z`;
}).join('');
const spikes = (cx, cy, r0, r1, n, rot = 0) => `M${Array.from({ length: n * 2 }, (_, i) => P(cx, cy, rot - Math.PI / 2 + (i * Math.PI) / n, i % 2 ? r0 : r1)).join(' ')}Z`;
// couronne de laurier : deux branches de feuilles en arc, nouées en bas
const leaf = (x, y, a, L = 7.4, W = 2.6) => {
  const tip = [x + Math.cos(a) * L, y + Math.sin(a) * L];
  const mid = [x + (Math.cos(a) * L) / 2, y + (Math.sin(a) * L) / 2];
  const n = [-Math.sin(a) * W, Math.cos(a) * W];
  const f = (v) => v.toFixed(2);
  return `M${f(x)} ${f(y)}Q${f(mid[0] + n[0])} ${f(mid[1] + n[1])} ${f(tip[0])} ${f(tip[1])}Q${f(mid[0] - n[0])} ${f(mid[1] - n[1])} ${f(x)} ${f(y)}Z`;
};
const LAUREL = (() => {
  let d = '';
  for (let i = 0; i < 7; i++) { // branche gauche, du bas vers le haut ; la droite est son miroir
    const ang = ((104 + i * 21) * Math.PI) / 180;
    const x = 50 + Math.cos(ang) * 21;
    const y = 59 + Math.sin(ang) * 21;
    const t = ang + Math.PI / 2;
    d += leaf(x, y, t - 0.62, 9.4, 3.3) + leaf(x, y, t + 0.5, 8, 2.9);
  }
  return d;
})();
const gear = (cx, cy, r0, r1, n) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const w = Math.PI / n;
    d += `${i ? 'L' : 'M'}${P(cx, cy, a - w * 0.62, r0)} L${P(cx, cy, a - w * 0.38, r1)} L${P(cx, cy, a + w * 0.38, r1)} L${P(cx, cy, a + w * 0.62, r0)} `;
  }
  return `${d}Z`;
};
const OAK = 'M50 34C55 36 59 39 58 43C57 46 54 46 55 48C60 48 64 51 63 55C62 58 58 58 57 60C62 61 64 65 61 69C59 72 55 71 54 73C55 76 53 79 50 80'
  + 'C47 79 45 76 46 73C45 71 41 72 39 69C36 65 38 61 43 60C42 58 38 58 37 55C36 51 40 48 45 48C46 46 43 46 42 43C41 39 45 36 50 34Z';
const KEY = [ // clé verticale (anneau en haut, panneton en bas), tournée de 35° de part et d'autre
  { d: 'M50 33.5a7 7 0 1 1-.01 0Z' },
  { d: 'M48.4 46.5H51.6V82H48.4Z' },
  { d: 'M51.6 72H58V75.2H55.2V78H58V82H51.6Z' },
  { d: 'M50 37.2a3.3 3.3 0 1 1-.01 0Z', cut: true },
];

const EMBLEMS = {
  etoile: [{ d: star(50, 60, 24, 10) }],
  ballon: [
    { d: circle(50, 60, 20) },
    { d: 'M50 52.5 57.6 58l-2.9 9h-9.4l-2.9-9Z', cut: true },
    { d: 'M50 52.5V42M57.6 58l10-3.2M54.7 67l6 8.2M45.3 67l-6 8.2M42.4 58l-10-3.2', cut: true, w: 2.2 },
  ],
  couronne: [
    { d: 'M27 74 23.5 45l12 10.5L43 39l7 15.5L57 39l7.5 16.5 12-10.5L73 74Z' },
    { d: 'M26 74H74V83H26Z' },
    { d: circle(23.5, 44, 2.8) + circle(43, 38, 2.8) + circle(57, 38, 2.8) + circle(76.5, 44, 2.8) + circle(50, 52, 2.4) },
    { d: circle(37, 78.5, 1.9) + circle(50, 78.5, 1.9) + circle(63, 78.5, 1.9), cut: true },
  ],
  tour: [
    { d: 'M33 86V52h-3V39h7v6h6v-6h14v6h6v-6h7v13h-3v34Z' },
    { d: 'M45 86V75a5 5 0 0 1 10 0v11Z', cut: true },
    { d: 'M48.5 56h3v6h-3Z', cut: true },
  ],
  chateau: [
    { d: 'M30 86V64H70V86Z' },
    { d: 'M26 86V52H23.5V45H27.5V48.5H31V45H35V48.5H38.5V45H42.5V52H40V86Z', m: true },
    { d: 'M42 66V43H39.5V35H44V39H48V35H52V39H56V35H60.5V43H58V66Z' },
    { d: 'M45 86V77A5 5 0 0 1 55 77V86Z', cut: true },
    { d: 'M48.6 46.5h2.8v7h-2.8ZM31.6 57h2.8v6h-2.8Z', cut: true, m: true },
  ],
  chene: [{ d: OAK }, { d: 'M50 80v7', w: 3 }, { d: 'M50 42v34M50 52l5-3M50 60l-5-3M50 67l4-3', cut: true, w: 1.6 }],
  sapin: [{ d: 'M50 33l12 15h-6l10 13h-8l12 16H54v9h-8v-9H30l12-16h-8l10-13h-6Z' }],
  epi: [
    { d: 'M50 86V44', w: 3 },
    { d: 'M50 36c3.2 3.2 3.2 8.4 0 11.6-3.2-3.2-3.2-8.4 0-11.6Z' },
    { d: 'M49 54c-6-1-10-5-11-10 6 0 10 4 11 10ZM49 63c-6-1-10-5-11-10 6 0 10 4 11 10ZM49 72c-6-1-10-5-11-10 6 0 10 4 11 10Z', m: true },
  ],
  lys: [
    { d: 'M50 33c6 6 8 13 6 20l-3 9h-6l-3-9c-2-7 0-14 6-20Z' },
    { d: 'M47 61c-4-7-11-10-16-7-4 2-4 8 0 10 3 2 6 0 6-3 2 1 4 2 5 4Z', m: true },
    { d: 'M37 63h26v5.5H37Z' },
    { d: 'M47 68.5h6l2 9c1 4-2 6-5 4-3 2-6 0-5-4Z' },
    { d: 'M50 38v20', cut: true, w: 1.2 },
  ],
  ancre: [
    { d: 'M50 44v40M38 52h24M30 68c2 10 10 16 20 16s18-6 20-16', w: 5 },
    { d: circle(50, 38.5, 5.5), w: 3.6 },
    { d: 'M26 71l4-8 6 6Z', m: true },
  ],
  navire: [
    { d: 'M50 32V70', w: 2 },
    { d: 'M52 35C61 39.5 64.5 47.5 62.5 55.5 61.5 60 58.5 63 52 65Z' },
    { d: 'M48 40C41.5 44 39 50.5 40.5 56.5 41.5 60 44 62.5 48 64Z' },
    { d: 'M50 30.5 58 32.6 50 34.7Z' },
    { d: 'M26 69H74L67.5 80C60 82.5 40 82.5 32.5 80Z' },
    { d: circle(40, 74, 1.4) + circle(50, 74.5, 1.4) + circle(60, 74, 1.4), cut: true },
    { d: 'M27 86q5.75-4 11.5 0t11.5 0 11.5 0 11.5 0', w: 2.4 },
  ],
  vague: [{ d: 'M27 50q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0M27 61q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0M27 72q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0', w: 4.6 }],
  montagne: [
    { d: 'M23 83 41 49l9 15.5 8-11.5L77 83Z' },
    { d: 'M41 49l-6.5 12 4-2.4 2.5 3.4 2.6-3.6 2.6 1.9ZM58 53l-4.2 6.2 2.6-1.4 1.6 2 1.8-2.2 1.9 1.2Z', cut: true },
  ],
  soleil: [{ d: circle(50, 60, 11.5) }, { d: rays(50, 60, 15, 26, 12) }, { d: circle(50, 60, 7.5), cut: true, w: 1.2 }],
  eclair: [{ d: 'M57 33 34 65h13l-7 26 25-35H52l5-23Z' }],
  pont: [
    { d: 'M23 61h54v6H23Z' },
    { d: 'M26 67h48v17h-8c0-9-7-15.5-16-15.5S34 75 34 84h-8Z' },
    { d: 'M29 61V52M41 61V52M59 61V52M71 61V52M27 52h46', w: 2.6 },
  ],
  epees: [
    { d: 'M33 39 67 79M67 39 33 79', w: 4 },
    { d: 'M36 73.5l8.5 6M64 73.5l-8.5 6', w: 4.4 },
    { d: circle(30.5, 83, 3.4) + circle(69.5, 83, 3.4) },
  ],
  cles: [
    ...KEY.map((p) => ({ ...p, t: 'rotate(35 50 60)' })),
    ...KEY.map((p) => ({ ...p, t: 'rotate(-35 50 60) matrix(-1 0 0 1 100 0)' })),
  ],
  roue: [{ d: gear(50, 60, 16, 22, 10) }, { d: circle(50, 60, 8.5), cut: true }, { d: circle(50, 60, 3.2) }],
  // --- animaux ---
  etoiles: [{ d: star(50, 45.5, 11.5, 4.8) + star(37, 68.5, 11.5, 4.8) + star(63, 68.5, 11.5, 4.8) }],
  croix: [ // croix de Malte : quatre branches échancrées
    ...[0, 90, 180, 270].map((a) => ({ d: 'M50 57.4 41.2 35.4 50 41.6 58.8 35.4Z', t: `rotate(${a} 50 60)` })),
    { d: circle(50, 60, 3.4) },
  ],
  hermine: [ // moucheture d'hermine (Bretagne)
    { d: circle(45.4, 39.6, 2.7) + circle(50, 36.4, 2.7) + circle(54.6, 39.6, 2.7) },
    { d: 'M50 43C51.6 50 53.6 57 57.4 64.5 59.6 69 60.6 75 58.6 80.5L55.4 76 53.6 83 50 77.5 46.4 83 44.6 76 41.4 80.5C39.4 75 40.4 69 42.6 64.5 46.4 57 48.4 50 50 43Z' },
  ],
  rose: [ // rose héraldique : cinq pétales, sépales entre eux, cœur
    { d: [0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + k * 1.2566 + 0.6283; return `M${P(50, 60, a - 0.13, 13)}L${P(50, 60, a, 24)}L${P(50, 60, a + 0.13, 13)}Z`; }).join('') },
    { d: [0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + k * 1.2566; const [x, y] = P(50, 60, a, 10.5).split(' ').map(Number); return circle(x, y, 9); }).join('') },
    { d: circle(50, 60, 7.2) },
    { d: circle(50, 60, 3.2), cut: true },
  ],
  laurier: [
    { d: 'M47 80C36 76 29 66 30 52 30.6 45 33.4 40 37 36.6', w: 2.2, m: true },
    { d: LAUREL, m: true },
    { d: 'M44.6 81.4 50 77.6 55.4 81.4 52.6 84.6 50 82.2 47.4 84.6Z' },
    { d: star(50, 57.5, 11, 4.6) },
  ],
  flambeau: [
    { d: 'M50 33C55.5 39 58.5 44.5 55.5 50.5 57.5 49.5 58.6 47.4 58.4 45.4 61.6 50.6 59.6 56.6 54.6 58.6H45.4C40.4 56.6 38.4 50.6 41.6 45.4 41.4 47.4 42.5 49.5 44.5 50.5 41.5 44.5 44.5 39 50 33Z' },
    { d: 'M50 44C52.5 47.5 53.5 50.5 52 54 51.2 55.6 48.8 55.6 48 54 46.5 50.5 47.5 47.5 50 44Z', cut: true },
    { d: 'M42.5 59.6H57.5L55 65H45Z' },
    { d: 'M46.2 65H53.8L52 86H48Z' },
    { d: 'M46.8 71H53.2M47.4 78H52.6', cut: true, w: 1.2 },
  ],
  phare: [
    { d: 'M44.4 84 46.2 49.5H53.8L55.6 84Z' },
    { d: 'M42.6 46.5H57.4V50H42.6Z' },
    { d: 'M46 46.5V39.5H54V46.5Z' },
    { d: 'M44.6 39.5 50 34.2 55.4 39.5Z' },
    { d: 'M45.4 60.5H54.6M44.9 71.5H55.1', cut: true, w: 3 },
    { d: 'M48 41.2H52V44.8H48Z', cut: true },
    { d: 'M41 41.5 32 39.5M41 44.8 32 46.8', w: 1.8, m: true },
    { d: 'M34 86H66', w: 2.6 },
  ],
  aigle: [ // aigle déployé, tête tournée à gauche
    { d: 'M46.5 50C41 46 34 42 24.5 39L28 44.5 21 45 27.5 50 20 52.2 27.5 55.6 21.5 59.6 30 60.6 27 65.6 36 63.6C40 62 44 60 46.5 58Z', m: true },
    { d: 'M44 52 31 47M44 56 30 55M43.5 60 32 62', cut: true, w: 0.9, m: true },
    { d: 'M46 69 42 80 46.5 78 48 83 50 79 52 83 53.5 78 58 80 54 69Z' },
    { d: 'M50 45C54 45 56.5 49 56.5 55 56.5 62 54 68 50 71 46 68 43.5 62 43.5 55 43.5 49 46 45 50 45Z' },
    { d: 'M46 67.5 41 72.5M54 67.5 59 72.5', w: 2 },
    { d: 'M50 35.5C53 35.5 55.2 37.8 55.2 40.8 55.2 43.4 53.6 45.4 51 46H47.2C45.6 45 45 43 45.5 40.8Z' },
    { d: 'M45.6 39.6 40.2 42.4 45.4 43.8Z' },
    { d: circle(49.3, 40, 1), cut: true },
  ],
  coq: [ // coq gaulois de profil, regard à gauche
    { d: 'M60 60C66 52 69 45 66 37M62 63C70 58 74 51 74 43M62 67C71 66 77 61 79 54', w: 3.4 },
    { d: 'M40 63C40 55 46 51 54 52 61 53 64 58 63 65 62 73 55 77 47 77 42.5 77 40 72 40 63Z' },
    { d: 'M41 64C38 57 37.5 49 40 44 42 40.5 46.5 40 48.5 43 50.5 46 48.5 50 47.5 55 47 58 47.5 61 48 63Z' },
    { d: 'M40.5 41.5C40 38 42 36.5 43.6 38.6 43.5 35.5 46.2 34.5 47 37.5 48 35.2 50.5 36 49.5 39.5 48 41 44 42 40.5 41.5Z' },
    { d: 'M39.6 45 34.5 46.6 39.4 48Z' },
    { d: 'M40.5 48.5C39.5 52 41.5 54 42.5 51Z' },
    { d: 'M47 77V84M53 76.5V84M44.5 84H49M50.5 84H55.5', w: 2 },
    { d: 'M47 62C51 58 57 58 60 62', cut: true, w: 1.2 },
    { d: circle(43.2, 44.6, 0.95), cut: true },
  ],
  cheval: [ // tête de profil, regard à gauche
    { d: 'M60 84H38.5C38.5 77 41 72 45.5 68.5 41.5 67 36 66 33 62.5 30.5 59.5 31 55.5 34.5 53L42.5 47C43 42 45 38 48.5 35.5L50.5 30.5 53.5 35.2C60.5 37 67 44 68 53.5 69 63 66 72 60 84Z' },
    { d: 'M54.5 36.5 58.5 41 56.5 43.5 61.5 46.5 59 50 64.5 53.5 61.5 57.5 66.5 61', cut: true, w: 1.2 },
    { d: 'M45.5 47.5 49.5 46.5 48.5 49Z', cut: true },
    { d: circle(35.6, 58.5, 1.1), cut: true },
    { d: 'M33.5 62 38 61.5', cut: true, w: 1 },
  ],
  cerf: [ // tête de face, bois ramifiés
    { d: 'M45.5 47C42 42 39 37 38.5 29M40.5 40 33 37.5M39 34.5 33 30.5M41.5 44 36 44.5', w: 2.6, m: true },
    { d: 'M43 51C38 47.5 33 48 30.5 50.5 34 53 39 54 43 54Z', m: true },
    { d: 'M50 84C46.5 81.5 45 77 44.5 70.5L42.5 58C42 52.5 45.5 48.5 50 48.5 54.5 48.5 58 52.5 57.5 58L55.5 70.5C55 77 53.5 81.5 50 84Z' },
    { d: 'M45 59 48 60.5 45.4 61.6Z', cut: true, m: true },
    { d: 'M47.5 79.5H52.5C52.5 82 51.5 83 50 83 48.5 83 47.5 82 47.5 79.5Z', cut: true },
    { d: 'M50 52.5V66', cut: true, w: 0.9 },
  ],
};

const MIRROR = 'matrix(-1 0 0 1 100 0)';
const expand = (parts) => parts.flatMap((p) => (p.m ? [p, { ...p, m: false, t: p.t ? `${p.t} ${MIRROR}` : MIRROR }] : [p]));

// Symbole (ou monogramme) au centre (cx, cy), à l'échelle s : contour à la couleur du fond, ombre portée (relief),
// pièce en métal poli ou en émail, détails gravés.
function Emblem({ id, initials, cx, cy, s, ink, halo, cut, edge }) {
  if (id === 'aucun') return null;
  const tr = `translate(${cx} ${cy}) scale(${s}) translate(-50 -60)`;
  if (id === 'monogramme') {
    const size = initials.length > 2 ? 28 : initials.length > 1 ? 36 : 46;
    const y = 60 + size * 0.355;
    const common = { x: 50, y, textAnchor: 'middle', fontSize: size, fontWeight: 800, style: { fontFamily: 'var(--font-title)', letterSpacing: '-0.05em' } };
    return (
      <g transform={tr}>
        <text {...common} fill={halo} stroke={halo} strokeWidth={HALO * 1.6} strokeLinejoin="round">{initials}</text>
        <text {...common} x={51} y={y + 1.4} fill="#000" opacity=".45">{initials}</text>
        <text {...common} fill={ink} stroke={edge} strokeWidth=".9" paintOrder="stroke">{initials}</text>
      </g>
    );
  }
  const parts = expand(EMBLEMS[id] || EMBLEMS.etoile);
  const main = parts.filter((p) => !p.cut);
  const cuts = parts.filter((p) => p.cut);
  const draw = (p, k, paint) => <path key={k} d={p.d} transform={p.t} {...paint(p)} />;
  return (
    <g transform={tr} strokeLinecap="round" strokeLinejoin="round">
      {main.map((p, k) => draw(p, `h${k}`, (q) => (q.w ? { fill: 'none', stroke: halo, strokeWidth: q.w + HALO } : { fill: halo, stroke: halo, strokeWidth: HALO })))}
      <g transform="translate(.9 1.3)" opacity=".5">
        {main.map((p, k) => draw(p, `s${k}`, (q) => (q.w ? { fill: 'none', stroke: '#000', strokeWidth: q.w } : { fill: '#000' })))}
      </g>
      {main.map((p, k) => draw(p, `m${k}`, (q) => (q.w ? { fill: 'none', stroke: ink, strokeWidth: q.w } : { fill: ink, stroke: edge, strokeWidth: 0.8 })))}
      {cuts.map((p, k) => draw(p, `c${k}`, (q) => (q.w ? { fill: 'none', stroke: cut, strokeWidth: q.w } : { fill: cut })))}
    </g>
  );
}

// Texte en majuscules, à la taille qui tient dans la longueur donnée (unités du repère).
const caps = (s) => String(s).toLocaleUpperCase('fr-FR');
const fit = (text, room, max) => Math.min(max, room / Math.max(1, String(text).length * 0.74));
const TEXT_STYLE = { fontFamily: 'var(--font-title)', fontWeight: 700, letterSpacing: '0.12em' };

function Grad({ id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1, user = false }) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits={user ? 'userSpaceOnUse' : undefined}>
      {stops.map(([o, c, op]) => <stop key={o} offset={o} stopColor={c} stopOpacity={op ?? 1} />)}
    </linearGradient>
  );
}

// spec : { style, shape, pattern, emblem, base, second, metal ('or' | 'argent'), ink ('metal' | 'light' | 'dark'),
// band?, year?, text ('nom' | 'annee' | 'les-deux' | 'aucune'), crown? } ; couleurs CSS, ou 'gold' (dégradé or de la
// charte). full : nom, année et ruban écrits (grands écussons) ; stars : étoiles de titres au-dessus. short : le nom écrit
// sur l'écusson (par défaut le nom court d'un club, shortName ; une ligue garde son nom entier).
export function CrestArt({ spec, initials = '', name = '', className = '', title = null, full = false, stars = 0, short: written = null }) {
  const uid = useId().replace(/:/g, '');
  const ref = (k) => `${k}-${uid}`;
  const url = (k) => `url(#${ref(k)})`;
  const metal = spec.metal === 'argent' ? SILVER : GOLD;
  const paint = (c) => (c === 'gold' ? url('gf') : c);
  const style = spec.style || 'blason';
  const field = style === 'medaillon' ? DISC : style === 'moderne' ? MODERNE[spec.shape] || MODERNE.taille : BLASON[spec.shape] || BLASON.ancien;
  const base = paint(spec.base);
  const second = paint(spec.second);
  const ink = spec.ink === 'dark' ? url('ed') : spec.ink === 'light' ? url('el') : url('em');
  const edge = spec.ink === 'metal' ? metal.edge : 'rgba(0, 0, 0, .55)';
  const cut = spec.ink === 'dark' ? base : '#141414';
  const short = written || shortName(name);
  const year = spec.year;
  const want = full ? spec.text || 'aucune' : 'aucune';
  const pattern = spec.pattern === 'bordure'
    ? <path d={field} fill="none" stroke={second} strokeWidth="20" />
    : PATTERNS[spec.pattern] ? <path d={PATTERNS[spec.pattern]} fill={second} /> : null;

  // couronne ou étoiles de titres : le blason se resserre vers le bas pour leur faire place
  const top = style === 'blason' && (spec.crown || stars > 0);
  const lift = style === 'blason' && top ? 'translate(50 112) scale(.85) translate(-50 -112)' : undefined;
  const em = style === 'medaillon' ? { cx: 50, cy: 60, s: 0.72 }
    : style === 'moderne' ? { cx: 50, cy: want !== 'aucune' && spec.shape !== 'losange' ? 51 : 58, s: want !== 'aucune' && spec.shape !== 'losange' ? 0.84 : 1 }
      : { cx: 50, cy: 54, s: 1 };
  const halo = paint(spec.base);

  const body = (
    <>
      <g clipPath={url('fc')}>
        <path d={field} fill={base} />
        {pattern}
      </g>
      <Emblem id={spec.emblem} initials={initials} cx={em.cx} cy={em.cy} s={em.s} ink={ink} halo={halo} cut={cut} edge={edge} />
      <g clipPath={url('fc')} pointerEvents="none">
        <path d={field} fill={url('sh')} />
        <path d="M0 0H100V42C78 34 22 34 0 46Z" fill={url('gl')} />
      </g>
    </>
  );

  return (
    <svg className={`crest crest-${style} ${className}`} viewBox="0 0 100 116" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
      <defs>
        <Grad id={ref('rim')} stops={metal.rim} x1={12} y1={6} x2={88} y2={110} user />
        <Grad id={ref('em')} stops={metal.em} x1={32} y1={34} x2={68} y2={86} user />
        <Grad id={ref('el')} stops={WHITE_EM} x1={32} y1={34} x2={68} y2={86} user />
        <Grad id={ref('ed')} stops={DARK_EM} x1={32} y1={34} x2={68} y2={86} user />
        <Grad id={ref('gf')} stops={GOLD_FIELD} x1={0} y1={0} x2={0} y2={1} />
        <Grad id={ref('gl')} stops={[[0, '#ffffff', 0.3], [1, '#ffffff', 0]]} x1={0} y1={0} x2={0} y2={1} />
        <radialGradient id={ref('sh')} cx="38" cy="26" r="96" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".2" />
          <stop offset=".45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity=".42" />
        </radialGradient>
        <clipPath id={ref('fc')}><path d={field} /></clipPath>
      </defs>

      {style === 'medaillon' ? (
        <Medallion spec={spec} body={body} url={url} ref_={ref} metal={metal} want={want} short={short} name={name} year={year} stars={stars} />
      ) : style === 'moderne' ? (
        <Modern spec={spec} field={field} body={body} url={url} metal={metal} want={want} short={short} year={year} second={second} />
      ) : (
        <>
          <g transform={lift}>
            <path d={field} fill="#0a0a0a" stroke="#0a0a0a" strokeWidth="9" strokeLinejoin="round" />
            {body}
            <path d={field} fill="none" stroke={url('rim')} strokeWidth="6.5" strokeLinejoin="round" />
            <path d={field} fill="none" stroke="rgba(0, 0, 0, .55)" strokeWidth="1" strokeLinejoin="round" transform="translate(50 58) scale(.915 .935) translate(-50 -58)" />
          </g>
          {spec.crown && <Crown url={url} metal={metal} />}
          {!spec.crown && stars > 0 && <Stars n={stars} y={11} url={url} metal={metal} />}
          {want !== 'aucune' && <Ribbon text={want === 'annee' ? year : want === 'nom' ? short : `${short} · ${year}`} url={url} ref_={ref} metal={metal} />}
        </>
      )}
    </svg>
  );
}

// Couronne posée sur le blason.
function Crown({ url, metal }) {
  return (
    <g strokeLinejoin="round">
      <path d="M33 19.5 30.5 8.5l8 4.5L44 5l6 6.5L56 5l5.5 8 8-4.5L67 19.5Z" fill={url('rim')} stroke={metal.edge} strokeWidth=".8" />
      <path d="M32.5 19.5H67.5V24.5H32.5Z" fill={url('rim')} stroke={metal.edge} strokeWidth=".8" />
      <path d={circle(30.5, 8, 2) + circle(44, 4.6, 2) + circle(56, 4.6, 2) + circle(69.5, 8, 2) + circle(50, 10.8, 1.7)} fill={url('rim')} stroke={metal.edge} strokeWidth=".6" />
      <path d={circle(40, 22, 1.3) + circle(50, 22, 1.5) + circle(60, 22, 1.3)} fill="#7a1420" />
    </g>
  );
}

// Étoiles de titres, en arc au-dessus de l'écusson (une par titre de champion, cinq au plus).
function Stars({ n, y, url, metal }) {
  const gap = 10;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x = 50 + (i - (n - 1) / 2) * gap;
        const yy = y + Math.abs(i - (n - 1) / 2) * 1.6;
        return <path key={i} d={star(x, yy, 4.6, 1.9)} fill={url('rim')} stroke={metal.edge} strokeWidth=".6" strokeLinejoin="round" />;
      })}
    </g>
  );
}

// Ruban au bas du blason : année de fondation ou nom court.
function Ribbon({ text, url, ref_, metal }) {
  const t = caps(text);
  const size = fit(t, 58, 7.4);
  return (
    <g strokeLinejoin="round">
      <path d="M14.5 92.5 3.5 95.5l5 4.5-4.5 4.5 9 1Z" fill={url('rim')} stroke={metal.edge} strokeWidth=".7" />
      <path d="M85.5 92.5 96.5 95.5l-5 4.5 4.5 4.5-9 1Z" fill={url('rim')} stroke={metal.edge} strokeWidth=".7" />
      <path d="M3.5 95.5l5 4.5-4.5 4.5 9 1-1.5-13Z" fill="#000" opacity=".35" />
      <path d="M96.5 95.5l-5 4.5 4.5 4.5-9 1 1.5-13Z" fill="#000" opacity=".35" />
      <path d="M14.5 92.5Q50 101 85.5 92.5L87 105.5Q50 114 13 105.5Z" fill={url('rim')} stroke={metal.edge} strokeWidth=".7" />
      <path id={ref_('rb')} d="M16 102Q50 110.4 84 102" fill="none" />
      <text fontSize={size} fill={metal.ink} style={TEXT_STYLE}>
        <textPath href={`#${ref_('rb')}`} startOffset="50%" textAnchor="middle">{t}</textPath>
      </text>
    </g>
  );
}

// Médaillon : anneau de métal (lisse, crénelé ou double), bandeau du nom et de l'année, disque central.
function Medallion({ spec, body, url, ref_, metal, want, short, name, year, stars }) {
  const band = spec.band || '#121212';
  const bandFill = band === 'gold' ? url('gf') : band;
  const light = band !== 'gold' && hexLum(band) < 140;
  const textColor = light ? metal.text : metal.ink;
  const double = spec.shape === 'double';
  const crenel = spec.shape === 'cranelure';
  const R = 37.2; // milieu du bandeau
  const top = want === 'nom' || want === 'les-deux' ? caps(name.length > 22 ? short : name) : null;
  const bottom = want === 'annee' || want === 'les-deux' ? (want === 'annee' ? `FONDÉ EN ${year}` : String(year)) : null;
  const topSize = top ? fit(top, 92, 7.6) : 0;
  const botSize = bottom ? fit(bottom, 70, 7.4) : 0;
  const rt = 34.4;
  const rb = 40.4;
  return (
    <>
      <path d={circle(50, 60, 48)} fill="#0a0a0a" />
      {crenel && <path d={spikes(50, 60, 45.5, 48.2, 30)} fill={url('rim')} stroke={metal.edge} strokeWidth=".6" />}
      <path d={circle(50, 60, 45.2)} fill="none" stroke={url('rim')} strokeWidth="3.6" />
      <path d={circle(50, 60, R)} fill="none" stroke={bandFill} strokeWidth="12" />
      {double && <path d={circle(50, 60, 41.6)} fill="none" stroke={url('rim')} strokeWidth="1" />}
      <path d={circle(50, 60, 43.2) + circle(50, 60, 31.3)} fill="none" stroke="rgba(0, 0, 0, .4)" strokeWidth=".6" />
      <path d={circle(50, 60, 30.6)} fill="none" stroke={url('rim')} strokeWidth="2.4" />
      {body}
      {top && (
        <>
          <path id={ref_('mt')} d={`M${50 - rt} 60A${rt} ${rt} 0 0 1 ${50 + rt} 60`} fill="none" />
          <text fontSize={topSize} fill={textColor} style={TEXT_STYLE}><textPath href={`#${ref_('mt')}`} startOffset="50%" textAnchor="middle">{top}</textPath></text>
        </>
      )}
      {bottom && (
        <>
          <path id={ref_('mb')} d={`M${50 - rb} 60A${rb} ${rb} 0 0 0 ${50 + rb} 60`} fill="none" />
          <text fontSize={botSize} fill={textColor} style={TEXT_STYLE}><textPath href={`#${ref_('mb')}`} startOffset="50%" textAnchor="middle">{bottom}</textPath></text>
        </>
      )}
      {(top || bottom) && <path d={star(50 - R, 60, 2.8, 1.15) + star(50 + R, 60, 2.8, 1.15)} fill={textColor} />}
      {stars > 0 && <Stars n={stars} y={6.5} url={url} metal={metal} />}
    </>
  );
}

// Badge moderne : silhouette franche, liseré de métal fin, bandeau du nom court sous le symbole.
function Modern({ spec, field, body, url, metal, want, short, year, second }) {
  const banded = want !== 'aucune' && spec.shape !== 'losange';
  const name = want === 'nom' || want === 'les-deux' ? caps(short) : null;
  const label = banded ? name || String(year) : null;
  const dark = hexLum(spec.second === 'gold' ? '#c7a15a' : spec.second) > 150;
  return (
    <>
      <path d={field} fill="#0a0a0a" stroke="#0a0a0a" strokeWidth="8" strokeLinejoin="round" />
      {body}
      {label && (
        <g clipPath={url('fc')}>
          <path d="M0 77H100V91H0Z" fill={second} />
          <path d="M0 77H100M0 91H100" stroke="rgba(0, 0, 0, .45)" strokeWidth=".8" />
          <text x="50" y="86.6" textAnchor="middle" fontSize={fit(label, 52, 7.6)} fill={dark ? '#141414' : '#ffffff'} style={TEXT_STYLE}>{label}</text>
        </g>
      )}
      {name && want === 'les-deux' && (
        <text x="50" y="100.5" textAnchor="middle" fontSize="5.6" fill={metal.text} style={TEXT_STYLE}>{year}</text>
      )}
      <path d={field} fill="none" stroke={url('rim')} strokeWidth="4" strokeLinejoin="round" />
      <path d={field} fill="none" stroke="rgba(0, 0, 0, .5)" strokeWidth=".8" strokeLinejoin="round" transform="translate(50 58) scale(.93 .95) translate(-50 -58)" />
    </>
  );
}

// Notre écusson : toujours noir et or (fond noir, motifs et symbole or ; ou fond or, motifs et symbole noirs), liseré
// d'or ; une étoile par titre de champion au-dessus.
export function ClubCrest({ crest, name = '', className = '', title = null, full = false, stars = 0 }) {
  const c = normalizeCrest(crest);
  const gold = c.ground === 'or';
  const spec = {
    ...c,
    base: gold ? 'gold' : CLUB_BLACK,
    second: gold ? CLUB_BLACK : 'gold',
    metal: 'or',
    ink: gold ? 'dark' : 'metal',
    band: gold ? CLUB_BLACK : '#15120c',
    crown: false,
  };
  return <CrestArt spec={spec} initials={clubInitials(name)} name={name} full={full} stars={stars} className={`ours ${className}`} title={title} />;
}

// Écusson d'un autre club, d'après son nom.
export function Crest({ name = '', className = '', full = false }) {
  return <CrestArt spec={rivalCrest(name)} initials={clubInitials(name)} name={name} full={full} className={className} />;
}

// Écusson de n'importe quel club du jeu : le nôtre si c'est notre nom.
export function AnyCrest({ name = '', state, className = '', full = false }) {
  if (state && name === state.clubName) return <ClubCrest crest={state.crest} name={name} className={className} full={full} />;
  return <Crest name={name} className={className} full={full} />;
}
