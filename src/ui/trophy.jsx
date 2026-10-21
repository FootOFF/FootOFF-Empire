import React, { useId } from 'react';

// Trophées dessinés (or FootOFF) : la coupe du championnat (coupe classique à deux anses), la Coupe nationale
// (haute, avec couvercle) et la Coupe d'Europe des clubs (coupe aux grandes anses). Socle noir avec bandeau doré.

export const TROPHY_NAMES = { league: 'Championnat', cup: 'Coupe nationale', c1: 'Coupe d’Europe' };

export function Trophy({ comp = 'league', className = '', title }) {
  const id = useId().replace(/:/g, '');
  const gold = `url(#tg-${id})`;
  const shine = `url(#ts-${id})`;
  return (
    <svg className={`trophy ${className}`} viewBox="0 0 100 120" role="img" aria-label={title || TROPHY_NAMES[comp]}>
      <defs>
        <linearGradient id={`tg-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9c7a3c" />
          <stop offset="0.45" stopColor="#dec17f" />
          <stop offset="0.7" stopColor="#c7a15a" />
          <stop offset="1" stopColor="#8f6f36" />
        </linearGradient>
        <linearGradient id={`ts-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* socle */}
      <rect x="28" y="100" width="44" height="14" rx="2" fill="#151517" />
      <rect x="28" y="104" width="44" height="3" fill={gold} />
      <rect x="34" y="94" width="32" height="7" rx="1.5" fill="#1d1d20" />
      {comp === 'league' && (
        <g>
          <path d="M44 94 L46 76 L54 76 L56 94 Z" fill={gold} />
          <path d="M26 20 H74 C74 52 64 70 50 74 C36 70 26 52 26 20 Z" fill={gold} />
          <path d="M26 26 C12 26 12 50 30 52" fill="none" stroke={gold} strokeWidth="5" strokeLinecap="round" />
          <path d="M74 26 C88 26 88 50 70 52" fill="none" stroke={gold} strokeWidth="5" strokeLinecap="round" />
          <rect x="24" y="17" width="52" height="6" rx="2" fill={gold} />
          <path d="M33 24 C34 46 40 60 47 66" fill="none" stroke={shine} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      {comp === 'cup' && (
        <g>
          <path d="M45 94 L47 80 L53 80 L55 94 Z" fill={gold} />
          <path d="M34 24 H66 L63 66 C62 74 56 80 50 80 C44 80 38 74 37 66 Z" fill={gold} />
          <path d="M34 30 C22 32 24 52 37 54" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" />
          <path d="M66 30 C78 32 76 52 63 54" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" />
          <path d="M32 24 C36 12 64 12 68 24 Z" fill={gold} />
          <circle cx="50" cy="9" r="4.5" fill={gold} />
          <rect x="48.5" y="11" width="3" height="6" fill={gold} />
          <path d="M40 28 C40 50 43 64 48 72" fill="none" stroke={shine} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
      {comp === 'c1' && (
        <g>
          <path d="M43 94 L46 74 L54 74 L57 94 Z" fill={gold} />
          <path d="M32 14 H68 C68 46 62 66 50 72 C38 66 32 46 32 14 Z" fill={gold} />
          <path d="M32 18 C6 10 4 54 34 50" fill="none" stroke={gold} strokeWidth="5.5" strokeLinecap="round" />
          <path d="M68 18 C94 10 96 54 66 50" fill="none" stroke={gold} strokeWidth="5.5" strokeLinecap="round" />
          <rect x="30" y="11" width="40" height="6" rx="2" fill={gold} />
          <path d="M38 20 C38 42 42 56 47 64" fill="none" stroke={shine} strokeWidth="4" strokeLinecap="round" />
          <path d="M44 86 H56" stroke="#151517" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
