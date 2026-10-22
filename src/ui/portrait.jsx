import React from 'react';
import { HOME_KIT, kitOf } from '../game/kits';

// Portrait d'un joueur, dessiné (SVG) et toujours le même pour un même joueur : teint, forme du visage, coiffure,
// couleur des cheveux (qui grisonnent avec l'âge), barbe, sourcils ; buste au maillot de son club (notre or, le
// gris anthracite de nos gardiens, les couleurs du club adverse, un haut d'entraînement pour un joueur libre).
// Un style sobre (aplats, un éclairage doux par la gauche), lisible de 28 à 96 px.

const SKINS = ['#f2cba8', '#e3b28c', '#c98c65', '#a26b46', '#7d4d31', '#5c3723'];
const HAIRS = ['#15110e', '#2c2018', '#4a3221', '#6d482b', '#b38c4e', '#8c4021'];
const GREY = '#8e8a85';
const FREE_TOP = 0x3a3d42; // joueur libre : haut d'entraînement

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) { // mulberry32
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
// assombrit (k < 1) ou éclaircit (k > 1) une couleur #rrggbb
function shade(c, k) {
  const n = parseInt(c.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// Traits du joueur, tirés de son identité (stables d'une partie à l'autre).
export function looksOf(p) {
  const r = rng(hash(`${p.id ?? ''}|${p.name}`));
  const age = p.age || 25;
  const skin = SKINS[Math.floor(r() * SKINS.length)];
  const dark = SKINS.indexOf(skin) >= 3;
  // cheveux : plus souvent foncés sur une peau mate ; gris de plus en plus fréquents après 31 ans
  let hair = dark ? HAIRS[Math.floor(r() * 3)] : HAIRS[Math.floor(r() * HAIRS.length)];
  if (age >= 31 && r() < 0.18 + (age - 31) * 0.08) hair = GREY;
  const styles = dark ? ['buzz', 'curly', 'curly', 'short', 'buzz', 'bun', 'short'] : ['short', 'side', 'side', 'buzz', 'long', 'bun', 'curly', 'short'];
  let style = styles[Math.floor(r() * styles.length)];
  if (age >= 27 && r() < 0.08 + (age - 27) * 0.03) style = 'bald'; // le crâne rasé ou dégarni vient avec l'âge
  const b = r();
  const beard = age >= 24 ? (b < 0.22 ? 'full' : b < 0.48 ? 'stubble' : 'none') : b < 0.16 ? 'stubble' : 'none';
  return { skin, hair, style, beard, jaw: 0.94 + r() * 0.12, brow: r() < 0.5 ? 0 : 0.5 };
}

const HAIR_PATHS = {
  buzz: 'M15.9 19.6C15.9 13.1 19.7 10.1 24 10.1S32.1 13.1 32.1 19.6C30.6 16.1 28 14.5 24 14.5S17.4 16.1 15.9 19.6Z',
  short: 'M15.5 20.2C14.9 12.6 19.3 9.1 24.2 9.1 29.4 9.1 33.3 12.7 32.5 20.2 31.7 17.2 30.5 15.6 28.7 14.8 26.1 16.3 21.6 16.5 18.6 15.2 17.2 16.4 16.1 18.1 15.5 20.2Z',
  side: 'M15.3 21.1C14.5 12.3 19.5 8.5 24.6 8.7 30.1 8.9 33.7 12.6 32.7 20.5 31.9 16.5 30.7 15.2 29.6 14.4 27 15.9 21.9 15.7 19.5 13.5 18.1 15.2 16.5 17.7 15.3 21.1Z',
  curly: 'M14.3 21C12.1 12.4 17.3 6.4 24 6.4S35.9 12.4 33.7 21C33 17.4 31.4 15.6 29.6 15.1 27 16.8 21 16.8 18.4 15.1 16.6 15.6 15 17.4 14.3 21Z',
  long: 'M15.1 26.4C13.8 12.2 18.9 8.5 24 8.5S34.2 12.2 32.9 26.4C32.2 22.2 31.7 18.3 30.4 16.1 27 17.2 21 17.2 17.6 16.1 16.3 18.3 15.8 22.2 15.1 26.4Z',
  bun: 'M15.8 19.8C15.4 13 19.6 9.8 24.1 9.8 28.7 9.8 32.8 13 32.3 19.8 31.1 16.7 29.4 15.3 27.6 14.8 25.3 15.8 21.6 15.7 19.4 14.7 17.8 15.6 16.7 17.3 15.8 19.8Z',
};
const HEAD = 'M15.8 20.5C15.8 13.5 19.6 10.6 24 10.6S32.2 13.5 32.2 20.5C32.2 26.8 28.6 31 24 31S15.8 26.8 15.8 20.5Z';
const BEARD = 'M16.3 22.6C16.5 28.6 19.9 31.7 24 31.7S31.5 28.6 31.7 22.6C30.6 26 28.6 27.5 26.5 27.9 25.1 28.5 22.9 28.5 21.5 27.9 19.4 27.5 17.4 26 16.3 22.6Z';

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

// p : joueur ; club : nom du club du joueur (sinon le nôtre), free : joueur libre ; size en px
export function Portrait({ p, club = null, free = false, size = 32, className = '' }) {
  ensureDefs();
  const L = looksOf(p);
  const kit = free ? FREE_TOP : club ? (p.pos === 'G' ? kitOf(club).keeper : kitOf(club).shirt) : p.pos === 'G' ? HOME_KIT.keeper : HOME_KIT.shirt;
  const shirt = hex(kit);
  const ours = !club && !free;
  const trim = ours ? (p.pos === 'G' ? '#c7a15a' : '#14120e') : shade(shirt, 0.62);
  const skinShade = shade(L.skin, 0.8);
  const line = shade(L.skin, 0.55);
  const browY = 18.3 - L.brow;
  return (
    <svg className={`pf ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <g clipPath="url(#pf-clip)">
        <rect width="48" height="48" fill="url(#pf-bg)" />
        <g transform="translate(24 26.2) scale(1.17) translate(-24 -24)">{/* cadrage serré : le visage remplit le médaillon */}
        {/* buste : maillot, col, ombre du cou */}
        <path d="M2.5 48C3 40.4 8.7 36 16.4 34.4Q24 38.4 31.6 34.4C39.3 36 45 40.4 45.5 48Z" fill={shirt} />
        <path d="M2.5 48C3 40.4 8.7 36 16.4 34.4Q24 38.4 31.6 34.4C39.3 36 45 40.4 45.5 48Z" fill="url(#pf-shirt)" />
        <path d="M20.1 27.4V33.6Q24 36.3 27.9 33.6V27.4Z" fill={skinShade} />
        <path d="M17.2 34.1Q24 40.4 30.8 34.1" fill="none" stroke={trim} strokeWidth="1.7" strokeLinecap="round" />
        {/* tête : oreilles, visage (mâchoire plus ou moins large), éclairage */}
        <g transform={`translate(24 0) scale(${L.jaw} 1) translate(-24 0)`}>
          <ellipse cx="15.9" cy="21.6" rx="1.45" ry="2.3" fill={skinShade} />
          <ellipse cx="32.1" cy="21.6" rx="1.45" ry="2.3" fill={skinShade} />
          <path d={HEAD} fill={L.skin} />
          {L.beard !== 'none' && <path d={BEARD} fill={L.hair === GREY ? '#6f6b66' : L.hair} opacity={L.beard === 'full' ? 0.92 : 0.32} />}
          <path d={HEAD} fill="url(#pf-light)" />
          {L.style !== 'bald' && <path d={HAIR_PATHS[L.style]} fill={L.hair} />}
          {L.style === 'bun' && <circle cx="24" cy="8.6" r="3.1" fill={L.hair} />}
          {L.style === 'curly' && <path d="M15.6 15.4a2 2 0 0 1 3.4-1.6M21 12.4a2 2 0 0 1 3.6-.6M27 12.6a2 2 0 0 1 3.4 1.4" fill="none" stroke="#000" strokeOpacity=".22" strokeWidth=".9" strokeLinecap="round" />}
        </g>
        {/* traits : sourcils, yeux, nez, bouche */}
        <g fill="none" strokeLinecap="round">
          <path d={`M19 ${browY + 0.4}Q20.7 ${browY - 0.5} 22.4 ${browY + 0.1}M25.6 ${browY + 0.1}Q27.3 ${browY - 0.5} 29 ${browY + 0.4}`} stroke={L.hair === '#b38c4e' || L.hair === GREY ? shade(L.hair, 0.7) : L.hair} strokeWidth="1.15" />
          <ellipse cx="20.8" cy="21" rx=".95" ry=".85" fill="#1a1411" stroke="none" />
          <ellipse cx="27.2" cy="21" rx=".95" ry=".85" fill="#1a1411" stroke="none" />
          <path d="M24.1 21.6Q23.2 24.3 24.7 24.5" stroke={line} strokeWidth=".8" opacity=".6" />
          {L.beard !== 'full' && <path d="M22.1 27.1Q24 27.9 25.9 27.1" stroke={line} strokeWidth=".95" />}
        </g>
        </g>
      </g>
      <circle cx="24" cy="24" r="23.5" fill="none" stroke={ours ? 'rgba(199, 161, 90, .55)' : 'rgba(255, 255, 255, .14)'} />
    </svg>
  );
}
