import React, { useId } from 'react';
import { CLUB_BLACK, clubInitials, normalizeCrest, rivalCrest } from '../game/crest';

// Dessin des écussons (données : src/game/crest.js). Repère 100 × 116 : forme, motif découpé dans la forme,
// emblème entouré de la couleur du fond (lisible sur les motifs), liseré, léger reflet en haut.

const SHAPES = {
  ecu: 'M50 3 94 14v38c0 31-19 50-44 61C25 102 6 83 6 52V14Z',
  blason: 'M7 6h86v52c0 29-19 46-43 55C26 104 7 87 7 58Z',
  moderne: 'M13 5h74l8 14v40L50 112 5 59V19Z',
  rond: 'M50 12a46 46 0 1 1-.01 0Z',
  hexa: 'M50 4 93 28v60L50 112 7 88V28Z',
  pointe: 'M8 6h84v42c0 16-7 31-19 44L50 112 27 92C15 79 8 64 8 48Z',
  cercle: 'M50 12a46 46 0 1 1-.01 0Z',
  badge: 'M20 10h60a14 14 0 0 1 14 14v68a14 14 0 0 1-14 14H20A14 14 0 0 1 6 92V24a14 14 0 0 1 14-14Z',
  ecusson: 'M7 9c15 6 29 6 43 0 14 6 28 6 43 0v47c0 29-18 46-43 56C25 102 7 85 7 56Z',
  octo: 'M33 8h34l25 25v50L67 108H33L8 83V33Z',
};

const stripes = (x0, w, gap, n) => Array.from({ length: n }, (_, i) => `M${x0 + i * gap} 0h${w}v116H${x0 + i * gap}Z`).join('');
const checks = () => {
  let d = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) d += `M${c * 25} ${r * 29}h25v29H${c * 25}Z`;
  return d;
};

const PATTERNS = {
  uni: null,
  bandes: 'M21 0h12v116H21ZM44 0h12v116H44ZM67 0h12v116H67Z',
  fasce: 'M0 41h100v20H0Z',
  chevron: 'M0 52 50 26l50 26v17L50 43 0 69Z',
  echarpe: 'M-8 22 14 0l94 94-22 22Z',
  quartiers: 'M0 0h50v58H0ZM50 58h50v58H50Z',
  pal: 'M37 0h26v116H37Z',
  parti: 'M50 0h50v116H50Z',
  coupe: 'M0 0h100v50H0Z',
  sautoir: 'M-4 4 8-8l100 108-12 12ZM92-8l12 12L4 124l-12-12Z',
  croix: 'M40 0h20v116H40ZM0 46h100v20H0Z',
  damier: checks(),
  rayures: stripes(9, 5, 11, 8),
  bordure: 'border', // liseré intérieur large, tracé à part (voir CrestArt)
};

const star = (cx, cy, R, r) => `M${Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const d = i % 2 ? r : R;
  return `${(cx + Math.cos(a) * d).toFixed(2)} ${(cy + Math.sin(a) * d).toFixed(2)}`;
}).join(' ')}Z`;
const rays = (cx, cy, r0, r1, n) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n;
  const b = a + Math.PI / n;
  const c = a - Math.PI / n;
  const p = (ang, d) => `${(cx + Math.cos(ang) * d).toFixed(2)} ${(cy + Math.sin(ang) * d).toFixed(2)}`;
  return `M${p(c, r0)} ${p(a, r1)} ${p(b, r0)}Z`;
}).join('');
// roue dentée : n dents trapézoïdales autour d'un disque
const gear = (cx, cy, r0, r1, n) => {
  const p = (ang, d) => `${(cx + Math.cos(ang) * d).toFixed(2)} ${(cy + Math.sin(ang) * d).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const w = Math.PI / n;
    d += `${i ? 'L' : 'M'}${p(a - w * 0.62, r0)} L${p(a - w * 0.38, r1)} L${p(a + w * 0.38, r1)} L${p(a + w * 0.62, r0)} `;
  }
  return `${d}Z`;
};
// feuille de chêne : trois paires de lobes arrondis, de la pointe à la queue (symétrique)
const OAK = 'M50 34C55 36 59 39 58 43C57 46 54 46 55 48C60 48 64 51 63 55C62 58 58 58 57 60C62 61 64 65 61 69C59 72 55 71 54 73C55 76 53 79 50 80'
  + 'C47 79 45 76 46 73C45 71 41 72 39 69C36 65 38 61 43 60C42 58 38 58 37 55C36 51 40 48 45 48C46 46 43 46 42 43C41 39 45 36 50 34Z';

// Emblèmes : parties pleines (fill), traits (stroke : épaisseur) et découpes à la couleur du fond (cut).
const EMBLEMS = {
  etoile: [{ d: star(50, 60, 22, 9) }],
  ballon: [
    { d: 'M50 41a19 19 0 1 1-.01 0Z' },
    { d: 'M50 52.5 57.6 58l-2.9 9h-9.4l-2.9-9Z', cut: true },
    { d: 'M50 52.5V43M57.6 58l9-3M54.7 67l5.5 7.6M45.3 67l-5.5 7.6M42.4 58l-9-3', cut: true, w: 2.4 },
  ],
  couronne: [{ d: 'M28 74h44l4-28-13 11-13-21-13 21-13-11Z' }, { d: 'M28 78h44v7H28Z' }],
  tour: [
    { d: 'M33 86V52h-3V39h7v6h6v-6h14v6h6v-6h7v13h-3v34Z' },
    { d: 'M45 86V75a5 5 0 0 1 10 0v11Z', cut: true },
  ],
  chene: [{ d: OAK }, { d: 'M50 80v7', w: 3 }, { d: 'M50 42v34M50 52l5-3M50 60l-5-3M50 67l4-3', cut: true, w: 1.8 }],
  eclair: [{ d: 'M57 34 35 65h13l-7 25 24-34H52l5-22Z' }],
  ancre: [
    { d: 'M50 44v40M38 52h24M30 68c2 10 10 16 20 16s18-6 20-16', w: 5.5 },
    { d: 'M50 33a5.5 5.5 0 1 1-.01 0Z', w: 4 },
    { d: 'M26 71l4-8 6 6ZM74 71l-4-8-6 6Z' },
  ],
  soleil: [{ d: 'M50 49a11 11 0 1 1-.01 0Z' }, { d: rays(50, 60, 14, 25, 10) }],
  lys: [
    { d: 'M50 33c6 6 8 13 6 20l-3 9h-6l-3-9c-2-7 0-14 6-20Z' },
    { d: 'M47 61c-4-7-11-10-16-7-4 2-4 8 0 10 3 2 6 0 6-3 2 1 4 2 5 4Z' },
    { d: 'M53 61c4-7 11-10 16-7 4 2 4 8 0 10-3 2-6 0-6-3-2 1-4 2-5 4Z' },
    { d: 'M38 63h24v5H38Z' },
    { d: 'M47 68h6l2 9c1 4-2 6-5 4-3 2-6 0-5-4Z' },
  ],
  montagne: [
    { d: 'M24 82 42 50l9 15 8-11 17 28Z' },
    { d: 'M42 50l-6.5 11.5 4-2.4 2.5 3.4 2.6-3.6 2.6 1.9Z', cut: true },
  ],
  vague: [{ d: 'M27 52q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0M27 63q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0M27 74q5.75-7 11.5 0t11.5 0 11.5 0 11.5 0', w: 4.6 }],
  epi: [
    { d: 'M50 86V44', w: 3 },
    { d: 'M50 37c3 3 3 8 0 11-3-3-3-8 0-11Z' },
    { d: 'M49 54c-6-1-10-5-11-10 6 0 10 4 11 10ZM51 54c6-1 10-5 11-10-6 0-10 4-11 10Z' },
    { d: 'M49 63c-6-1-10-5-11-10 6 0 10 4 11 10ZM51 63c6-1 10-5 11-10-6 0-10 4-11 10Z' },
    { d: 'M49 72c-6-1-10-5-11-10 6 0 10 4 11 10ZM51 72c6-1 10-5 11-10-6 0-10 4-11 10Z' },
  ],
  pont: [
    { d: 'M24 62h52v6H24Z' },
    { d: 'M27 68h46v16h-8c0-9-6.5-15-15-15s-15 6-15 15h-8Z' },
    { d: 'M30 62V54M42 62V54M58 62V54M70 62V54M28 54h44', w: 2.6 },
  ],
  epees: [
    { d: 'M33 40 67 80M67 40 33 80', w: 4.2 },
    { d: 'M36 74l8 6M64 74l-8 6', w: 4.6 },
    { d: 'M30 84a3.5 3.5 0 1 1-.01 0ZM70 84a3.5 3.5 0 1 1-.01 0Z' },
  ],
  roue: [{ d: gear(50, 60, 15, 21, 9) }, { d: 'M50 52a8 8 0 1 1-.01 0Z', cut: true }],
  sapin: [{ d: 'M50 33l12 15h-6l10 13h-8l12 16H54v9h-8v-9H30l12-16h-8l10-13h-6Z' }],
  aigle: [ // ailes déployées aux plumes étagées, corps, queue, tête au bec tourné vers la gauche
    { d: 'M53 52 77 42l-4 8 7 1-7 6 5 3-14 2h-8ZM47 52 23 42l4 8-7 1 7 6-5 3 14 2h8Z' },
    { d: 'M50 47c4 0 6 4 6 9 0 7-2 12-6 14-4-2-6-7-6-14 0-5 2-9 6-9Z' },
    { d: 'M45 68l5 13 5-13Z' },
    { d: 'M50 38a5 5 0 1 1-.01 0ZM46 42l-6 2.5 6 .5Z' },
    { d: 'M51.5 41.5a1.2 1.2 0 1 1-.01 0Z', cut: true },
  ],
};

const HALO = 5.5; // contour de séparation autour de l'emblème, à la couleur du fond

function Emblem({ id, ink, halo, base, initials }) {
  if (id === 'initiales') {
    const size = initials.length > 2 ? 24 : initials.length > 1 ? 30 : 38;
    return (
      <text x="50" y={60 + size * 0.36} textAnchor="middle" fontSize={size} fontWeight="800" fill={ink}
        stroke={halo} strokeWidth={HALO} strokeLinejoin="round" paintOrder="stroke" style={{ fontFamily: 'var(--font-title)', letterSpacing: '-0.02em' }}>
        {initials}
      </text>
    );
  }
  const parts = EMBLEMS[id] || EMBLEMS.etoile;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {parts.filter((p) => !p.cut).map((p, i) => (p.w
        ? <path key={`h${i}`} d={p.d} fill="none" stroke={halo} strokeWidth={p.w + HALO} />
        : <path key={`h${i}`} d={p.d} fill={halo} stroke={halo} strokeWidth={HALO} />))}
      {parts.filter((p) => !p.cut).map((p, i) => (p.w
        ? <path key={`m${i}`} d={p.d} fill="none" stroke={ink} strokeWidth={p.w} />
        : <path key={`m${i}`} d={p.d} fill={ink} />))}
      {parts.filter((p) => p.cut).map((p, i) => (p.w
        ? <path key={`c${i}`} d={p.d} fill="none" stroke={base} strokeWidth={p.w} />
        : <path key={`c${i}`} d={p.d} fill={base} />))}
    </g>
  );
}

// spec : { shape, pattern, emblem, base, accent, second?, rim? } (couleurs CSS, ou 'gold' pour le dégradé or de la
// charte). accent : emblème ; second : motif (l'accent par défaut) ; rim : liseré (l'accent par défaut).
export function CrestArt({ spec, initials = '', className = '', title = null }) {
  const uid = useId().replace(/:/g, '');
  const gold = `url(#cg-${uid})`;
  const col = (c) => (c === 'gold' ? gold : c);
  const shape = SHAPES[spec.shape] || SHAPES.ecu;
  const pattern = PATTERNS[spec.pattern];
  const base = col(spec.base);
  const accent = col(spec.accent);
  const second = col(spec.second || spec.accent);
  const rim = col(spec.rim || spec.accent);
  const clip = `url(#cc-${uid})`;
  return (
    <svg className={`crest ${className}`} viewBox="0 0 100 116" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
      <defs>
        <linearGradient id={`cg-${uid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#a8813f" />
          <stop offset=".5" stopColor="#c7a15a" />
          <stop offset="1" stopColor="#e7cd8f" />
        </linearGradient>
        <linearGradient id={`cs-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`cc-${uid}`}><path d={shape} /></clipPath>
      </defs>
      <path d={shape} fill={base} />
      {pattern === 'border'
        ? <path d={shape} fill="none" stroke={second} strokeWidth="22" clipPath={clip} />
        : pattern && <path d={pattern} fill={second} clipPath={clip} />}
      {spec.shape === 'cercle' && <circle cx="50" cy="58" r="36" fill="none" stroke={rim} strokeWidth="2.5" />}
      <Emblem id={spec.emblem} ink={accent} halo={base} base={base} initials={initials} />
      <path d={shape} fill={`url(#cs-${uid})`} />
      <path d={shape} fill="none" stroke={rim} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

// Notre écusson : toujours noir et or (fond noir et motifs or, ou l'inverse).
export function ClubCrest({ crest, name = '', className = '', title = null }) {
  const c = normalizeCrest(crest);
  const spec = c.ground === 'or'
    ? { ...c, base: 'gold', accent: CLUB_BLACK }
    : { ...c, base: CLUB_BLACK, accent: 'gold' };
  return <CrestArt spec={spec} initials={clubInitials(name)} className={`ours ${className}`} title={title} />;
}

// Écusson d'un autre club, d'après son nom.
export function Crest({ name = '', className = '' }) {
  return <CrestArt spec={rivalCrest(name)} initials={clubInitials(name)} className={className} />;
}

// Écusson de n'importe quel club du jeu : le nôtre si c'est notre nom.
export function AnyCrest({ name = '', state, className = '' }) {
  if (state && name === state.clubName) return <ClubCrest crest={state.crest} name={name} className={className} />;
  return <Crest name={name} className={className} />;
}
