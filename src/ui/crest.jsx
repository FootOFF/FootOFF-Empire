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
};

const PATTERNS = {
  uni: null,
  bandes: 'M21 0h12v116H21ZM44 0h12v116H44ZM67 0h12v116H67Z',
  fasce: 'M0 41h100v20H0Z',
  chevron: 'M0 52 50 26l50 26v17L50 43 0 69Z',
  echarpe: 'M-8 22 14 0l94 94-22 22Z',
  quartiers: 'M0 0h50v58H0ZM50 58h50v58H50Z',
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
  chene: [
    { d: 'M50 35c5 3 10 6 9 11-1 3-3 4-2 5 4-2 9 0 9 4 0 4-6 5-6 8 4 0 7 2 6 6-1 4-7 3-10 5-2 1-3 5-5 9h-2c-2-4-3-8-5-9-3-2-9-1-10-5-1-4 2-6 6-6 0-3-6-4-6-8 0-4 5-6 9-4 1-1-1-2-2-5-1-5 4-8 9-11Z' },
    { d: 'M50 42v40', cut: true, w: 2.2 },
  ],
  eclair: [{ d: 'M57 34 35 65h13l-7 25 24-34H52l5-22Z' }],
  ancre: [
    { d: 'M50 44v40M38 52h24M30 68c2 10 10 16 20 16s18-6 20-16', w: 5.5 },
    { d: 'M50 33a5.5 5.5 0 1 1-.01 0Z', w: 4 },
    { d: 'M26 71l4-8 6 6ZM74 71l-4-8-6 6Z' },
  ],
  soleil: [{ d: 'M50 49a11 11 0 1 1-.01 0Z' }, { d: rays(50, 60, 14, 25, 10) }],
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

// spec : { shape, pattern, emblem, base, accent } (couleurs CSS, ou 'gold' pour le dégradé or de la charte)
export function CrestArt({ spec, initials = '', className = '', title = null }) {
  const uid = useId().replace(/:/g, '');
  const gold = `url(#cg-${uid})`;
  const col = (c) => (c === 'gold' ? gold : c);
  const shape = SHAPES[spec.shape] || SHAPES.ecu;
  const pattern = PATTERNS[spec.pattern];
  const base = col(spec.base);
  const accent = col(spec.accent);
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
      {pattern && <path d={pattern} fill={accent} clipPath={`url(#cc-${uid})`} />}
      <Emblem id={spec.emblem} ink={accent} halo={base} base={base} initials={initials} />
      <path d={shape} fill={`url(#cs-${uid})`} />
      <path d={shape} fill="none" stroke={accent} strokeWidth="4" strokeLinejoin="round" />
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
