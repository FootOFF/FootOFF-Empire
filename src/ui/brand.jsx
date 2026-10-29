import React, { useId } from 'react';
import { t, tr } from '../i18n/index';

// Identité FootOFF Media : monogramme « FO » vectorisé d'après le logo officiel
// (assets-src/brand/), dégradé or #B9924C -> #DEC17F.
// Géométrie (repère du logo 1932 px) : fût du F 594-689 avec pied biseauté, barre haute jusqu'à 1035,
// anneau centré (1038, 724), rayons 300 / 218, coupé entre y = 588 et 662 par le bras du F.
const F_PATH = 'M594 256H1035V351H689V588H770.6A300 300 0 0 0 744.5 662H689V835L594 938Z';
const O_PATH = 'M770.6 588A300 300 0 1 1 744.5 662H829A218 218 0 1 0 867.6 588Z';

export function FOMonogram({ className, title = t('FootOFF'), flat = false }) {
  const id = useId().replace(/:/g, '');
  const fill = flat ? 'currentColor' : `url(#fo-${id})`;
  return (
    <svg className={className} viewBox="594 256 744 768" role="img" aria-label={title}>
      {!flat && (
        <defs>
          <linearGradient id={`fo-${id}`} gradientUnits="userSpaceOnUse" x1="940" y1="640" x2="1180" y2="300">
            <stop offset="0" stopColor="#B9924C" />
            <stop offset="0.55" stopColor="#B9924C" />
            <stop offset="1" stopColor="#DEC17F" />
          </linearGradient>
        </defs>
      )}
      <path d={F_PATH} fill={fill} />
      <path d={O_PATH} fill={fill} />
    </svg>
  );
}

// Lockup horizontal façon FootOFF Media : monogramme | FootOFF / <sous-titre espacé>. Toujours dans cet ordre, même
// en arabe (dir="ltr") : un logo ne se retourne pas.
export function FootOFFLockup({ sub = t('Empire'), size = 'md', className = '' }) {
  return (
    <span className={`lockup lockup-${size} ${className}`} dir="ltr">
      <FOMonogram className="lockup-mark" />
      <span className="lockup-sep" aria-hidden="true" />
      <span className="lockup-text">
        <span className="lockup-name">{tr('Foot<0>OFF</0>', [(c) => <b>{c}</b>])}</span>
        <span className="lockup-sub">{sub}</span>
      </span>
    </span>
  );
}
