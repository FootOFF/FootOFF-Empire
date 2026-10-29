import React from 'react';
import { DIVISIONS } from '../game/constants';
import { fmtRating } from './format';
import { t } from '../i18n/index';

// Briques de l'interface FootOFF Empire (voir docs/DESIGN.md) : un seul dessin pour chaque élément récurrent,
// pour que les écrans partagent les mêmes tailles, espacements et alignements.

// Niveau de référence de la division du club (milieu de la fourchette des adversaires) : les niveaux se lisent par
// rapport à lui. Rang d'un joueur pour la division (teinte de sa carte et de sa fiche) : élite, or, argent, bronze.
export const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };
export const tierOf = (r, ref) => (r >= ref + 3 ? 'elite' : r >= ref + 1 ? 'gold' : r <= ref - 2 ? 'bronze' : 'silver');

// Libellé en capitales (Geist Mono), au-dessus d'un titre ou d'un bloc.
export function Eyebrow({ children, muted = false, className = '' }) {
  return <span className={`eyebrow ${muted ? 'muted-eyebrow' : ''} ${className}`}>{children}</span>;
}

// En-tête de section : libellé à gauche, complément aligné à droite.
export function SectionHead({ label, aside }) {
  return (
    <div className="ui-section-head">
      <Eyebrow>{label}</Eyebrow>
      {aside && <span className="ui-section-aside">{aside}</span>}
    </div>
  );
}

// Tuile de statistique : libellé, valeur, précision facultative.
export function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className={`ui-stat ${tone}`}>
      <span className="ui-stat-label">{label}</span>
      <b className="ui-stat-value">{value}</b>
      {sub && <span className="ui-stat-sub">{sub}</span>}
    </div>
  );
}

// Comparaison club / adversaire sur une ligne : valeur, barres opposées, valeur.
// flip : match joué chez l'adversaire, qui passe à gauche (0.8.1) ; chaque barre garde la couleur de son équipe.
export function VersusBar({ label, home, away, suffix = '', format = (v) => v, flip = false }) {
  const [l, r, lc, rc] = flip ? [away, home, 'a', 'h'] : [home, away, 'h', 'a'];
  const total = l + r;
  const w = total ? (l / total) * 100 : 50;
  return (
    <div className="ui-vs">
      <b className={l > r || (l === r && !flip) ? 'lead' : ''}>{format(l)}{suffix}</b>
      <div className="ui-vs-mid">
        <span className="ui-vs-label">{label}</span>
        <span className="ui-vs-bars"><i className={lc} style={{ width: `${w}%` }} /><i className={rc} style={{ width: `${100 - w}%` }} /></span>
      </div>
      <b className={r > l || (l === r && flip) ? 'lead' : ''}>{format(r)}{suffix}</b>
    </div>
  );
}

// Note de match sur 10 (couleur selon la performance).
export function RatingBadge({ value, size = 'md' }) {
  const tone = value >= 7.5 ? 'good' : value < 5.5 ? 'low' : ''; // mêmes seuils que la forme de la fiche joueur
  return <span className={`ui-rate ${size} ${tone}`}>{fmtRating(value)}</span>;
}

// Icônes des temps forts (pas d'emoji dans l'interface).
const svg = (children) => (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);
export const IconBall = svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8L8.4 10.2z" /><path d="M12 3.5v4.1M15.6 10.2l4-1.3M14.2 14.4l2.4 3.4M9.8 14.4l-2.4 3.4M8.4 10.2l-4-1.3" /></>);
export const IconAssist = svg(<><path d="M4 16c3-6 8-9 15-9" /><path d="M15 3.5L19 7l-3.5 4" /><circle cx="5.5" cy="17.5" r="1.8" /></>);
export const IconSwap = svg(<><path d="M5 8h13l-3.5-3.5M19 16H6l3.5 3.5" /></>);
export const IconWhistle = svg(<><path d="M3.5 10.5h9l5-3v9.2a3.8 3.8 0 1 1-7.4-1.2H6.5a3 3 0 0 1-3-3z" /><circle cx="14" cy="14.8" r="1.2" /></>);
export const IconMedic = svg(<><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M12 9.5v6M9 12.5h6" /><path d="M9.5 6V4.5h5V6" /></>); // blessure (croix médicale)
export const IconStar = svg(<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />);
export const Card = ({ color = 'yellow' }) => <i className={`card ${color}`} aria-label={color === 'red' ? t('carton rouge') : t('carton jaune')} />;
