import React from 'react';
import { HOME_KIT, ourKit, teamKitOf } from '../game/kits';
import { BANDS, EYES, GREY, HAIRS, SKINS, agedFace, faceOf } from '../game/faces';

// Portrait d'un joueur, dessiné (SVG) et toujours le même pour un même joueur (ses traits : src/game/faces.js) : forme
// du visage, teint, yeux et leur couleur, nez, bouche, sourcils, oreilles, coiffure (une vingtaine), cheveux qui
// grisonnent et se dégarnissent avec l'âge, barbe, parfois un signe particulier (taches de rousseur, grain de beauté,
// cicatrice, nez cassé, bandeau, oreilles décollées) ; buste au maillot de son club (notre or, le gris anthracite de nos
// gardiens, les couleurs du club adverse, un haut d'entraînement pour un joueur libre), avec son numéro dès 52 px.
// Un style sobre (aplats, un éclairage doux par la gauche), lisible de 28 à 136 px : en petit (moins de 40 px), seuls
// comptent la silhouette (coiffure, teint, barbe, bandeau, oreilles) ; les traits fins viennent ensuite.

const FREE_TOP = 0x3a3d42; // joueur libre : haut d'entraînement

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const rgbOf = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
// assombrit (k < 1) ou éclaircit (k > 1) une couleur #rrggbb
function shade(c, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  const [r, g, b] = rgbOf(c);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
// mélange de deux couleurs #rrggbb (k = part de la seconde) : le poivre et sel
function mix(a, b, k) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
const light = (c) => { const [r, g, b] = rgbOf(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5; };

// Formes du visage, et la place des oreilles qui va avec
const HEADS = {
  oval: 'M15.8 20.5C15.8 13.5 19.6 10.6 24 10.6S32.2 13.5 32.2 20.5C32.2 26.8 28.6 31 24 31S15.8 26.8 15.8 20.5Z',
  round: 'M15.4 20.3C15.4 13.4 19.4 10.6 24 10.6S32.6 13.4 32.6 20.3C32.6 26.2 28.9 30.4 24 30.4S15.4 26.2 15.4 20.3Z',
  square: 'M15.8 19.8C15.8 13.2 19.6 10.6 24 10.6S32.2 13.2 32.2 19.8C32.2 24.2 31.6 27.4 29.6 29.2C28 30.6 26.2 31 24 31S20 30.6 18.4 29.2C16.4 27.4 15.8 24.2 15.8 19.8Z',
  long: 'M16.3 20.5C16.3 13.2 19.8 10.2 24 10.2S31.7 13.2 31.7 20.5C31.7 27.4 28.4 31.8 24 31.8S16.3 27.4 16.3 20.5Z',
};
const EAR_X = { oval: [15.9, 32.1], round: [15.5, 32.5], square: [15.9, 32.1], long: [16.4, 31.6] };

// Coiffures : back (derrière la tête : cheveux longs, nuque, tresses), front (sur la tête), fade (côtés rasés, en
// transparence), lines (texture : boucles, tresses, reflets).
const BUZZ = 'M15.9 19.6C15.9 13.1 19.7 10.1 24 10.1S32.1 13.1 32.1 19.6C30.6 16.1 28 14.5 24 14.5S17.4 16.1 15.9 19.6Z';
const SHORT = 'M15.5 20.2C14.9 12.6 19.3 9.1 24.2 9.1 29.4 9.1 33.3 12.7 32.5 20.2 31.7 17.2 30.5 15.6 28.7 14.8 26.1 16.3 21.6 16.5 18.6 15.2 17.2 16.4 16.1 18.1 15.5 20.2Z';
const SLICK = 'M15.7 19.6C15.2 12.8 19.4 9.4 24.1 9.4S32.9 12.8 32.3 19.6C31.6 16.8 30.4 15.2 28.6 14.6 26.2 15.3 21.8 15.3 19.4 14.6 17.6 15.2 16.4 16.8 15.7 19.6Z';
const HAIRDO = {
  buzz: { front: BUZZ },
  short: { front: SHORT },
  side: { front: 'M15.3 21.1C14.5 12.3 19.5 8.5 24.6 8.7 30.1 8.9 33.7 12.6 32.7 20.5 31.9 16.5 30.7 15.2 29.6 14.4 27 15.9 21.9 15.7 19.5 13.5 18.1 15.2 16.5 17.7 15.3 21.1Z' },
  crop: { front: 'M15.6 19.6C15 12.6 19.3 9.3 24.1 9.3S33.2 12.6 32.4 19.6C31.9 17.6 31.1 16.3 30.2 15.8L17.8 15.8C16.9 16.3 16.1 17.6 15.6 19.6Z' },
  quiff: { front: 'M15.6 20C15 13.6 17.6 10.6 20.6 9.8 21.6 7.6 25.6 6.4 28.6 7.8 31.6 9.2 33.1 13.4 32.4 20 31.6 17 30.4 15.4 28.8 14.8 26.4 15.8 21.4 15.8 18.8 14.9 17.4 16 16.2 17.6 15.6 20Z' },
  undercut: { fade: BUZZ, front: 'M17.4 15.4C17.2 10.8 20.4 8.4 24.6 8.4 28.8 8.4 31.6 10.8 30.9 15.2 28.6 13.8 26.4 13.4 23.6 13.6 21.2 13.8 19 14.4 17.4 15.4Z' },
  slick: { front: SLICK, lines: 'M19.6 12.2Q23.6 10.4 28.4 12M18.6 13.6Q23.4 11.8 29.4 13.4', shine: true },
  messy: { front: 'M15.5 20C15 13.6 17.4 10.6 19.6 10.1L20.4 8.1 22.2 9.6 23.8 7.6 25.4 9.4 27.4 8 28.2 10.2C31.4 11.4 33 14.4 32.5 20 31.7 17.2 30.5 15.6 28.7 14.8L27.2 16.2 25.6 15 24 16.4 22.4 15.1 20.6 16.1 18.6 15.2C17.2 16.4 16.1 18.1 15.5 20Z' },
  curly: { front: 'M14.3 21C12.1 12.4 17.3 6.4 24 6.4S35.9 12.4 33.7 21C33 17.4 31.4 15.6 29.6 15.1 27 16.8 21 16.8 18.4 15.1 16.6 15.6 15 17.4 14.3 21Z', lines: 'M15.6 15.4a2 2 0 0 1 3.4-1.6M21 12.4a2 2 0 0 1 3.6-.6M27 12.6a2 2 0 0 1 3.4 1.4' },
  afro: { front: 'M13 22.5C10.6 14.8 14.6 5.4 24 5.4S37.4 14.8 35 22.5C34.2 19.8 33 17.6 31.6 16.6 28.4 17.8 19.6 17.8 16.4 16.6 15 17.6 13.8 19.8 13 22.5Z', lines: 'M15.6 12.4a1.6 1.6 0 0 1 2.6-1.2M19.4 9a1.6 1.6 0 0 1 2.8-.4M25.8 8.6a1.6 1.6 0 0 1 2.8.6M30 11.4a1.6 1.6 0 0 1 2.2 1.6M14.4 17.2a1.4 1.4 0 0 1 1.4-2M33.6 15.2a1.4 1.4 0 0 1 .2 2.2M22.4 13.4a1.4 1.4 0 0 1 2.4-.2' },
  afroShort: { front: 'M15 20.6C13.6 12.6 18 8.2 24 8.2S34.4 12.6 33 20.6C32.3 17.4 30.9 15.6 29.4 15 26.8 16.4 21.2 16.4 18.6 15 17.1 15.6 15.7 17.4 15 20.6Z', lines: 'M17.4 13.6a1.2 1.2 0 0 1 2-.8M21.6 10.8a1.2 1.2 0 0 1 2.2-.2M26.4 11a1.2 1.2 0 0 1 2 .6M29.6 13.8a1.2 1.2 0 0 1 1.2 1.4' },
  locs: {
    back: 'M18.6 24L18.8 32.6M21 26L21.2 33.4M27 26L26.8 33.4M29.4 24L29.2 32.6', backStroke: 1.5,
    front: 'M15.4 20.4C14.8 12.6 19.2 8.9 24 8.9S33.2 12.6 32.6 20.4C31.8 17.4 30.6 15.8 28.8 15 26.2 16.4 21.8 16.4 19.2 15 17.4 15.8 16.2 17.4 15.4 20.4Z',
    strands: 'M16.2 17.6L15.6 27.6M17.6 16.2L17.2 25.4M31.8 17.6L32.4 27.6M30.4 16.2L30.8 25.4',
  },
  braids: { front: 'M15.8 19.4C15.8 12.9 19.6 9.7 24 9.7S32.2 12.9 32.2 19.4C30.7 16 28.1 14.6 24 14.6S17.3 16 15.8 19.4Z', rows: 'M18.6 15.6Q19.2 12 21.2 10.4M21.6 14.8Q22 11.2 23.2 9.9M26.4 14.8Q26 11.2 24.8 9.9M29.4 15.6Q28.8 12 26.8 10.4' },
  mohawk: { fade: BUZZ, fadeOpacity: 0.32, front: 'M21.9 15.4C21.4 10.8 22.4 6.2 24 4.8 25.6 6.2 26.6 10.8 26.1 15.4 25.4 15.8 22.6 15.8 21.9 15.4Z' },
  hightop: {
    fade: BUZZ, fadeOpacity: 0.55, front: 'M17.4 15.6C17 12.6 17.1 9.6 17.8 7.9Q18.5 6.6 20.4 6.5L27.6 6.5Q29.5 6.6 30.2 7.9C30.9 9.6 31 12.6 30.6 15.6 27.6 16.4 20.4 16.4 17.4 15.6Z',
    lines: 'M19.6 8.4a1.2 1.2 0 0 1 2-.4M23.4 7.6a1.2 1.2 0 0 1 2 .2M26.8 8.6a1.2 1.2 0 0 1 1.8.8M20.6 11.6a1.2 1.2 0 0 1 2 0M25.4 11.4a1.2 1.2 0 0 1 2 .4',
  },
  long: { front: 'M15.1 26.4C13.8 12.2 18.9 8.5 24 8.5S34.2 12.2 32.9 26.4C32.2 22.2 31.7 18.3 30.4 16.1 27 17.2 21 17.2 17.6 16.1 16.3 18.3 15.8 22.2 15.1 26.4Z' },
  bun: { front: 'M15.8 19.8C15.4 13 19.6 9.8 24.1 9.8 28.7 9.8 32.8 13 32.3 19.8 31.1 16.7 29.4 15.3 27.6 14.8 25.3 15.8 21.6 15.7 19.4 14.7 17.8 15.6 16.7 17.3 15.8 19.8Z', bun: true },
  ponytail: { back: 'M30.4 16.8C34 17.6 35.6 22.2 34.6 27.8 34.1 25 33.1 22.8 31.4 21.2Z', front: SLICK, lines: 'M19.6 12.2Q23.6 10.4 28.4 12' },
  mullet: { back: 'M16.1 21.6C15.4 26.6 16 31 18.4 33.4L29.6 33.4C32 31 32.6 26.6 31.9 21.6Z', front: SHORT },
  receding: { front: 'M15.5 21.2C15 17 15.6 14.4 17.4 13.2 17.9 15.4 17.7 17.8 17.1 19.6ZM32.5 21.2C33 17 32.4 14.4 30.6 13.2 30.1 15.4 30.3 17.8 30.9 19.6Z' },
  bald: { shine: true },
};

const BEARD = 'M16.3 22.6C16.5 28.6 19.9 31.7 24 31.7S31.5 28.6 31.7 22.6C30.6 26 28.6 27.5 26.5 27.9 25.1 28.5 22.9 28.5 21.5 27.9 19.4 27.5 17.4 26 16.3 22.6Z';
const FULL = 'M16.1 22.2C16.2 29.2 19.8 32.6 24 32.6S31.8 29.2 31.9 22.2C30.8 25.8 28.8 27.4 26.6 27.8 25.2 28.4 22.8 28.4 21.4 27.8 19.2 27.4 17.2 25.8 16.1 22.2Z';
const GOATEE = 'M22.1 28.4Q24 29.1 25.9 28.4Q25.7 30.9 24 31.3Q22.3 30.9 22.1 28.4Z';
const MOUSTACHE = 'M21.9 26.75Q22.9 25.75 24 26.25Q25.1 25.75 26.1 26.75Q25 26.45 24 26.65Q23 26.45 21.9 26.75Z';
const CHINSTRAP = 'M16.5 23C16.9 28.6 20.1 31.2 24 31.2S31.1 28.6 31.5 23';

const NOSES = {
  short: 'M24.1 21.6Q23.2 24.3 24.7 24.5',
  straight: 'M24.1 21.3L23.6 24.4Q23.9 24.9 24.8 24.7',
  wide: 'M24 21.7Q23.5 23.6 23.2 24.3M22.7 24.4Q23.4 25.4 24 24.9Q24.6 25.4 25.3 24.4',
  aquiline: 'M24.1 21.2Q25 22.7 24.1 24.4Q24.3 25 25 24.7',
  button: 'M24 22.4Q23.4 24.1 23.9 24.5Q24.4 24.8 24.9 24.4',
  broken: 'M24.1 21.2L24.7 22.5L23.7 24.3Q24 24.9 24.9 24.7',
};
const MOUTHS = {
  neutral: 'M22.1 27.1Q24 27.9 25.9 27.1',
  thin: 'M22.5 27.3Q24 27.55 25.5 27.3',
  full: 'M22.1 27.1Q24 27.9 25.9 27.1',
  smile: 'M22 26.9Q24 28.5 26 26.9',
  serious: 'M22.2 27.5Q24 26.95 25.8 27.5',
};
const FRECKLES = [[19.4, 23.3], [20.5, 23.8], [21.5, 23.2], [26.5, 23.2], [27.5, 23.8], [28.6, 23.3], [23.4, 22.5], [24.6, 22.6]];

// Un œil (centre x, y = 21) selon sa forme ; dir : −1 œil gauche, 1 œil droit (le coin extérieur des yeux tombants)
function eyeShape(kind, x, dir, fill) {
  switch (kind) {
    case 'almond': return <path d={`M${x - 1.15} 21Q${x} 20.15 ${x + 1.15} 21Q${x} 21.7 ${x - 1.15} 21Z`} fill={fill} />;
    case 'narrow': return <ellipse cx={x} cy="21.05" rx="1.1" ry=".62" fill={fill} />;
    case 'round': return <ellipse cx={x} cy="21" rx="1" ry=".96" fill={fill} />;
    case 'droopy': {
      const o = x + dir * 1.1; // coin extérieur, plus bas
      const i = x - dir * 1.1;
      return <path d={`M${i} 20.9Q${x} 20.1 ${o} 21.3Q${x} 21.8 ${i} 20.9Z`} fill={fill} />;
    }
    default: return <ellipse cx={x} cy="21" rx=".95" ry=".85" fill={fill} />;
  }
}

// p : joueur ; club : nom du club du joueur (sinon le nôtre), free : joueur libre ; size en px
export function Portrait({ p, club = null, free = false, size = 32, className = '' }) {
  ensureDefs();
  const F = faceOf(p);
  const age = p.age || 25;
  const { grey, style, beard: fh } = agedFace(F, age);
  const detail = size >= 40; // traits fins (forme des yeux, nez, bouche, taches, grain de beauté, cicatrice)
  const fine = size >= 64; // couleur des yeux et leur reflet
  const our = ourKit(); // nos couleurs d'écusson (0.8.8)
  const kit = free ? FREE_TOP : club ? (p.pos === 'G' ? teamKitOf(club).keeper : teamKitOf(club).shirt) : p.pos === 'G' ? our.keeper : our.shirt;
  const shirt = hex(kit);
  const ours = !club && !free;
  const trim = ours ? (p.pos === 'G' ? hex(our.shirt) : our.trim === HOME_KIT.trim ? '#14120e' : hex(our.trim)) : shade(shirt, 0.62);
  const skin = SKINS[F.sk] || SKINS[2];
  const skinShade = shade(skin, 0.8);
  const line = shade(skin, 0.55);
  const baseHair = HAIRS[F.hc] || HAIRS[0];
  const hair = grey ? mix(baseHair, GREY, grey) : baseHair;
  const beardColor = grey ? mix(baseHair, '#6f6b66', grey) : baseHair;
  const browColor = F.hc === 4 || F.hc === 6 || grey >= 0.6 ? shade(hair, 0.7) : hair;
  const head = HEADS[F.sh] || HEADS.oval;
  const [earL, earR] = EAR_X[F.sh] || EAR_X.oval;
  const out = F.sg === 'ears'; // oreilles décollées
  const earRx = out ? 2 : F.ea === 'small' ? 1.2 : 1.45;
  const earRy = out ? 2.7 : F.ea === 'small' ? 1.95 : 2.3;
  const earDx = out ? 0.8 : 0;
  const H = HAIRDO[style] || HAIRDO.short;
  const es = F.es || 0;
  const xl = 20.8 - es;
  const xr = 27.2 + es;
  const browY = 18.3 - (F.by || 0);
  const bw = { fine: 0.8, normal: 1.15, thick: 1.6 }[F.bw] || 1.15;
  const brows = F.ba === 'straight'
    ? `M${xl - 1.8} ${browY + 0.15}Q${xl - 0.1} ${browY - 0.15} ${xl + 1.6} ${browY + 0.05}M${xr - 1.6} ${browY + 0.05}Q${xr + 0.1} ${browY - 0.15} ${xr + 1.8} ${browY + 0.15}`
    : F.ba === 'angled'
      ? `M${xl - 1.8} ${browY - 0.1}Q${xl} ${browY - 0.45} ${xl + 1.6} ${browY + 0.55}M${xr - 1.6} ${browY + 0.55}Q${xr} ${browY - 0.45} ${xr + 1.8} ${browY - 0.1}`
      : `M${xl - 1.8} ${browY + 0.4}Q${xl - 0.1} ${browY - 0.5} ${xl + 1.6} ${browY + 0.1}M${xr - 1.6} ${browY + 0.1}Q${xr + 0.1} ${browY - 0.5} ${xr + 1.8} ${browY + 0.4}`;
  const eyeFill = EYES.dark;
  const iris = F.ec && F.ec !== 'dark' ? EYES[F.ec] : null;
  const moustache = fh === 'moustache' || fh === 'vandyke';
  const goatee = fh === 'goatee' || fh === 'vandyke';
  const mouth = detail ? MOUTHS[F.mo] || MOUTHS.neutral : MOUTHS.neutral;
  const nose = F.sg === 'broken' ? NOSES.broken : detail ? NOSES[F.no] || NOSES.short : NOSES.short;
  const num = size >= 52 && p.num != null && p.num !== '' ? p.num : null;
  return (
    <svg className={`pf ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <g clipPath="url(#pf-clip)">
        <rect width="48" height="48" fill="url(#pf-bg)" />
        <g transform="translate(24 26.2) scale(1.17) translate(-24 -24)">{/* cadrage serré : le visage remplit le médaillon */}
        {/* buste : maillot, numéro, col */}
        <path d="M2.5 48C3 40.4 8.7 36 16.4 34.4Q24 38.4 31.6 34.4C39.3 36 45 40.4 45.5 48Z" fill={shirt} />
        <path d="M2.5 48C3 40.4 8.7 36 16.4 34.4Q24 38.4 31.6 34.4C39.3 36 45 40.4 45.5 48Z" fill="url(#pf-shirt)" />
        {num != null && (
          <text x="24" y="41.7" textAnchor="middle" fontSize="4.6" fontWeight="700" fill={light(shirt) ? '#14120e' : '#f3f2ee'} style={{ fontFamily: 'var(--font-disp)' }}>{num}</text>
        )}
        <g transform={`translate(24 0) scale(${F.jw || 1} 1) translate(-24 0)`}>
          {/* cheveux derrière la tête : longs, mulet, queue de cheval, dreadlocks */}
          {H.back && (H.backStroke
            ? <path d={H.back} fill="none" stroke={hair} strokeWidth={H.backStroke} strokeLinecap="round" />
            : <path d={H.back} fill={hair} />)}
        </g>
        <path d="M20.1 27.4V33.6Q24 36.3 27.9 33.6V27.4Z" fill={skinShade} />
        <path d="M17.2 34.1Q24 40.4 30.8 34.1" fill="none" stroke={trim} strokeWidth="1.7" strokeLinecap="round" />
        {/* tête : oreilles, visage (forme, mâchoire plus ou moins large), éclairage, pilosité, cheveux */}
        <g transform={`translate(24 0) scale(${F.jw || 1} 1) translate(-24 0)`}>
          <ellipse cx={earL - earDx} cy="21.6" rx={earRx} ry={earRy} fill={skinShade} transform={out ? `rotate(-12 ${earL - earDx} 21.6)` : undefined} />
          <ellipse cx={earR + earDx} cy="21.6" rx={earRx} ry={earRy} fill={skinShade} transform={out ? `rotate(12 ${earR + earDx} 21.6)` : undefined} />
          <path d={head} fill={skin} />
          {detail && F.sg === 'freckles' && FRECKLES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".26" fill={shade(skin, 0.7)} opacity=".75" />)}
          {detail && F.sg === 'mole' && <circle cx={F.sx ? 27.6 : 20.3} cy={F.sx ? 25.4 : 25.7} r=".36" fill={shade(skin, 0.45)} />}
          {(fh === 'stubble' || fh === 'short') && <path d={BEARD} fill={beardColor} opacity={fh === 'stubble' ? 0.32 : 0.62} />}
          {fh === 'full' && <path d={FULL} fill={beardColor} opacity=".92" />}
          {fh === 'chinstrap' && <path d={CHINSTRAP} fill="none" stroke={beardColor} strokeWidth="1.1" strokeLinecap="round" opacity=".9" />}
          {goatee && <path d={GOATEE} fill={beardColor} opacity=".9" />}
          <path d={head} fill="url(#pf-light)" />
          {H.fade && <path d={H.fade} fill={hair} opacity={H.fadeOpacity ?? 0.45} />}
          {H.front && <path d={H.front} fill={hair} />}
          {H.bun && <circle cx="24" cy="8.6" r="3.1" fill={hair} />}
          {H.strands && <path d={H.strands} fill="none" stroke={hair} strokeWidth="1.5" strokeLinecap="round" />}
          {H.rows && detail && <path d={H.rows} fill="none" stroke={shade(hair, 1.45)} strokeOpacity=".55" strokeWidth=".55" strokeLinecap="round" />}
          {H.lines && detail && <path d={H.lines} fill="none" stroke={style === 'slick' || style === 'ponytail' ? '#fff' : '#000'} strokeOpacity={style === 'slick' || style === 'ponytail' ? 0.16 : 0.22} strokeWidth={style === 'slick' || style === 'ponytail' ? 0.6 : 0.9} strokeLinecap="round" />}
          {H.shine && style === 'bald' && <ellipse cx="21.6" cy="13.2" rx="3" ry="1.4" fill="#fff" opacity=".1" />}
          {F.sg === 'band' && <path d="M15.9 16.8C17.6 14.6 20.6 13.6 24 13.6S30.4 14.6 32.1 16.8L32.3 18.6C30.4 16.8 27.4 15.8 24 15.8S17.6 16.8 15.7 18.6Z" fill={BANDS[F.bc] || BANDS[0]} />}
        </g>
        {/* traits : sourcils (et cicatrice), yeux, nez, bouche, moustache */}
        <g fill="none" strokeLinecap="round">
          <path d={brows} stroke={browColor} strokeWidth={bw} />
          {detail && F.sg === 'scar' && <path d={F.sx ? 'M27.7 17.1L27 19.5' : 'M20.3 17.1L21 19.5'} stroke={shade(skin, 1.35)} strokeWidth=".45" />}
          {detail ? eyeShape(F.ey, xl, -1, eyeFill) : <ellipse cx={xl} cy="21" rx=".95" ry=".85" fill={eyeFill} />}
          {detail ? eyeShape(F.ey, xr, 1, eyeFill) : <ellipse cx={xr} cy="21" rx=".95" ry=".85" fill={eyeFill} />}
          {fine && iris && F.ey !== 'narrow' && (
            <>
              <circle cx={xl} cy="21" r=".5" fill={iris} /><circle cx={xr} cy="21" r=".5" fill={iris} />
              <circle cx={xl} cy="21" r=".22" fill={eyeFill} /><circle cx={xr} cy="21" r=".22" fill={eyeFill} />
            </>
          )}
          {fine && F.ey !== 'narrow' && <><circle cx={xl - 0.3} cy="20.7" r=".15" fill="#fff" opacity=".75" /><circle cx={xr - 0.3} cy="20.7" r=".15" fill="#fff" opacity=".75" /></>}
          <path d={nose} stroke={line} strokeWidth=".8" opacity=".6" />
          {detail && F.mo === 'full' && fh !== 'full' && !moustache && (
            <>
              <path d="M22 27Q23 26.55 24 26.9Q25 26.55 26 27Q24 27.25 22 27Z" fill={shade(skin, 0.7)} stroke="none" />
              <path d="M22.2 27.15Q24 28.6 25.8 27.15Q24 27.5 22.2 27.15Z" fill={shade(skin, 0.78)} stroke="none" />
            </>
          )}
          {fh !== 'full' && <path d={mouth} stroke={line} strokeWidth=".95" />}
          {moustache && <path d={MOUSTACHE} fill={beardColor} stroke="none" opacity=".92" />}
        </g>
        </g>
      </g>
      <circle cx="24" cy="24" r="23.5" fill="none" stroke={ours ? 'rgba(199, 161, 90, .55)' : 'rgba(255, 255, 255, .14)'} />
    </svg>
  );
}

// Dégradés et découpe communs à tous les portraits : déclarés une seule fois dans la page (un effectif en montre 25,
// chacun redéclarait les siens).
let defsReady = false;
function ensureDefs() {
  if (defsReady || typeof document === 'undefined') return;
  defsReady = true;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  box.innerHTML = `<svg width="0" height="0"><defs>
    <radialGradient id="pf-bg" cx="50%" cy="38%" r="72%"><stop offset="0" stop-color="#24242a"/><stop offset="1" stop-color="#0d0d10"/></radialGradient>
    <linearGradient id="pf-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <linearGradient id="pf-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <clipPath id="pf-clip"><circle cx="24" cy="24" r="24"/></clipPath>
  </defs></svg>`;
  document.body.appendChild(box);
}
