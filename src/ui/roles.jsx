import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { POST_SHORT } from '../game/posts';
import { ROLES, ROLE_FAMILY, roleOf } from '../game/roles';
import { Portrait } from './portrait';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { t } from '../i18n/index';
import { PHONE, useSwipe } from './gestures';

// Rôles des joueurs (1.0.54 ; écran refait en 1.0.55, choix du PDG du 14/11 : « B · Tableau ») : ils se choisissent sur le
// terrain (mode Rôles du terrain de composition, lineup.jsx) ; un joueur touché ouvre cette feuille, où chacun de ses
// trois rôles avec ballon et trois rôles sans ballon est une carte illustrée : un petit terrain montre où il joue. Aucune
// note ni jauge (choix du PDG : l'aptitude compte sans rien afficher).

// rôles d'un joueur à son poste : { w, d } (les objets de roles.js), custom : autres que ceux du poste
export function rolesAt(type, r) {
  const fam = ROLES[ROLE_FAMILY[type] || ''];
  if (!fam) return null;
  const pick = roleOf(type, r);
  const w = fam.with.find((x) => x.id === pick.w) || fam.with[0];
  const d = fam.without.find((x) => x.id === pick.d) || fam.without[0];
  return { fam, w, d, custom: w !== fam.with[0] || d !== fam.without[0] };
}

// Pictogramme d'un rôle : un petit terrain (but adverse en haut), la place du joueur à son poste et la flèche de son
// déplacement d'après les effets du rôle dans le moteur (roles.js : at/al avec ballon, flèche pleine ; dt/dl sans ballon,
// pointillés) ; sans déplacement, le geste qui compte (passe, pressing, couverture, jeu aérien, centre, frappe, dribble,
// vitesse) ; le rôle du poste : sa place, sans flèche. (Le terrain ne se retourne pas en arabe.)
// Relecture 1.0.55 : une flèche mesure au moins 16 (sur 40 × 52) et part du bord du point ; si elle sortirait du terrain,
// le point recule d'autant (6 au plus) ; vers la ligne de touche, la course longe la ligne vers l'avant (le débordement) ;
// un rôle de pressing porte en plus les chevrons du pressing au bout de sa flèche (sinon « Presse le latéral » et
// « Reste haut » auraient le même dessin).
const BASE = { G: [20, 45], DC: [20, 35], FB: [8, 35], MDC: [20, 31], MC: [20, 27], WM: [8, 26], MOC: [20, 20], W: [8, 17], BT: [20, 15] };
const GLYPH = { build: 'pass', vision: 'pass', press: 'press', wall: 'cover', defPace: 'cover', defAir: 'air', air: 'air', cross: 'cross', shoot: 'shoot', drib: 'drib', pace: 'pace' };
const head = (x0, y0, x1, y1) => {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const p = (da) => `${(x1 - 4.2 * Math.cos(a + da)).toFixed(2)} ${(y1 - 4.2 * Math.sin(a + da)).toFixed(2)}`;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${p(0.5)} L${p(-0.5)} Z`;
};
export function RolePicto({ fam, part, role, on = false }) {
  const [x0, y0] = BASE[fam] || [20, 28];
  const fx = role.fx || {};
  const sh = part === 'w' ? fx.at : fx.dt;
  const ln = part === 'w' ? fx.al : fx.dl;
  let dx = 0;
  let dy = 0;
  if (sh) dy = -(sh[1] - sh[0]) * (9 + sh[2] * 60);
  if (ln && x0 !== 20) dx = ln > 0 ? ln * 60 : ln * 40;
  let len = Math.hypot(dx, dy);
  if (len > 0 && len < 16) { dx *= 16 / len; dy *= 16 / len; len = 16; }
  if (len > 0 && x0 + dx < 3) { dx = 3 - x0; dy = -Math.sqrt(Math.max(0, len * len - dx * dx)); }
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const sx = x0 - lim(x0 + dx - lim(x0 + dx, 3, 37), -6, 6);
  const sy = y0 - lim(y0 + dy - lim(y0 + dy, 3, 49), -6, 6);
  const x1 = lim(sx + dx, 3, 37);
  const y1 = lim(sy + dy, 3, 49);
  const ux = len ? dx / len : 0;
  const uy = len ? dy / len : 0;
  const q = Object.entries(fx.q || {}).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1])[0]?.[0];
  const gk = fx.gk ? Object.keys(fx.gk)[0] : null;
  const glyph = len ? null : fam === 'G'
    ? (fx.q?.build > 1 ? 'short' : fx.q?.build < 1 ? 'long' : gk === 'defPace' ? 'sweep' : gk === 'defAir' ? 'air' : null)
    : GLYPH[q] || null;
  const c = on ? '#171106' : '#e7cc8c';
  const dot = { stroke: c, strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' };
  return (
    <svg viewBox="0 0 40 52" className="rp" aria-hidden="true">
      <rect x="1" y="1" width="38" height="50" rx="2" className="rp-turf" />
      <path d="M1 26H39M12 1V8H28V1M12 51V44H28V51" className="rp-mark" />
      {!len && !glyph && <circle cx={x0} cy={y0} r="7" className="rp-zone" />}
      {len > 0 && <>
        <line x1={sx + ux * 4.8} y1={sy + uy * 4.8} x2={x1 - ux * 2} y2={y1 - uy * 2} stroke={c} strokeWidth="1.8" strokeDasharray={part === 'd' ? '2.6 2' : undefined} strokeLinecap="round" />
        <path d={head(sx, sy, x1, y1)} fill={c} />
        {part === 'd' && GLYPH[q] === 'press' && <path d={`M${x1 + 5} ${y1 + 7}L${x1 + 9} ${y1 + 3}L${x1 + 13} ${y1 + 7}M${x1 + 5} ${y1 + 11}L${x1 + 9} ${y1 + 7}L${x1 + 13} ${y1 + 11}`} {...dot} strokeLinejoin="round" />}
      </>}
      {glyph === 'pass' && <path d={`M${x0 + 3} ${y0 - 3}L${x0 + 13} ${y0 - 13}`} {...dot} strokeDasharray="1.6 2.2" />}
      {glyph === 'short' && <path d={`M${x0 - 3} ${y0 - 2}L${x0 - 12} ${y0 - 7}`} {...dot} strokeDasharray="1.6 2.2" />}
      {glyph === 'long' && <path d={`M${x0} ${y0 - 4}Q${x0 + 10} ${y0 - 24} ${x0} ${y0 - 34}`} {...dot} strokeDasharray="1.6 2.2" />}
      {glyph === 'sweep' && <><line x1={x0} y1={y0 - 3} x2={x0} y2={y0 - 12} stroke={c} strokeWidth="1.8" strokeDasharray="2.6 2" /><path d={head(x0, y0, x0, y0 - 12)} fill={c} /></>}
      {glyph === 'press' && <path d={`M${x0 - 4} ${y0 - 6}L${x0} ${y0 - 10}L${x0 + 4} ${y0 - 6}M${x0 - 4} ${y0 - 10}L${x0} ${y0 - 14}L${x0 + 4} ${y0 - 10}`} {...dot} strokeLinejoin="round" />}
      {glyph === 'cover' && <path d={`M${x0 - 7} ${y0 + 4}Q${x0} ${y0 + 10} ${x0 + 7} ${y0 + 4}`} {...dot} strokeWidth="1.6" />}
      {glyph === 'air' && <circle cx={x0 + (fam === 'G' ? 0 : 5)} cy={y0 - 8} r="2.6" {...dot} strokeWidth="1.4" />}
      {glyph === 'cross' && <path d={`M${x0} ${y0 - 3}Q${x0 + 6} ${y0 - 14} ${x0 + 14} ${y0 - 6}`} {...dot} strokeDasharray="1.6 2.2" />}
      {glyph === 'shoot' && <><line x1={x0} y1={y0 - 3} x2="20" y2="4" stroke={c} strokeWidth="1.6" /><path d={head(x0, y0, 20, 4)} fill={c} /></>}
      {glyph === 'drib' && <path d={`M${x0} ${y0 - 3}l3 -3l-4 -3l4 -3l-3 -3`} {...dot} strokeLinejoin="round" />}
      {glyph === 'pace' && <path d={`M${x0 - 7} ${y0 - 2}h-4M${x0 - 7} ${y0 + 1}h-6M${x0 - 7} ${y0 + 4}h-4`} {...dot} strokeWidth="1.3" />}
      <circle cx={sx} cy={sy} r="3.4" fill={c} />
    </svg>
  );
}

// Feuille des rôles d'un joueur, du bas de l'écran. roles : { [id]: { w, d } } ; onChange(roles) dès qu'une carte est
// touchée (un joueur revenu aux rôles du poste sort de la liste) ; onClose : « OK », le fond, la touche Échap.
export function RoleSheet({ player, type, roles = {}, onChange, onClose }) {
  const sheet = useRef(null);
  const cur = rolesAt(type, roles[player.id]);
  useEffect(() => {
    const prev = document.activeElement;
    sheet.current?.querySelector('.rs-card.on')?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.({ preventScroll: true }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // au téléphone, la feuille se ferme aussi en la glissant vers le bas (relecture 1.0.55)
  useSwipe(sheet, { onDown: () => { uiSound('back'); onClose(); }, downMedia: PHONE });
  if (!cur) return null;
  const { fam, w, d } = cur;
  const famKey = ROLE_FAMILY[type];
  const pick = (part, r) => {
    const next = { w: w.id, d: d.id, [part]: r.id };
    const out = { ...roles };
    if (next.w === fam.with[0].id && next.d === fam.without[0].id) delete out[player.id]; else out[player.id] = next;
    haptic('tap');
    uiSound('tap');
    onChange(out);
  };
  const close = () => { uiSound('back'); onClose(); };
  return createPortal(
    <div className="rs-wrap">
      <button type="button" className="rs-dim" aria-label={t('Fermer')} tabIndex={-1} onClick={close} />
      <div ref={sheet} className="rs" role="dialog" aria-modal="true" aria-label={t('Rôles de {name}', { name: player.name })}>
        <span className="rs-grip" aria-hidden="true" />
        <div className="rs-head">
          <Portrait p={player} size={46} />
          <div className="rs-who">
            <b>{player.name.slice(player.name.indexOf(' ') + 1)}</b>
            <em>{POST_SHORT[type] || type}{' · '}<span>{w.name}</span>{' · '}<span>{d.name}</span></em>
          </div>
          <button type="button" className="rs-ok" onClick={close}>{t('OK')}</button>
        </div>
        {[['w', t('Avec ballon'), fam.with, w], ['d', t('Sans ballon'), fam.without, d]].map(([part, label, list, on]) => (
          <div key={part} className="rs-group" role="radiogroup" aria-label={label}>
            <span className="rs-label">{label}</span>
            <div className="rs-cards">
              {list.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={r === on} className={`rs-card ${r === on ? 'on' : ''}`} onClick={() => pick(part, r)}>
                  <RolePicto fam={famKey} part={part} role={r} on={r === on} />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
            <p className="rs-desc">{on.desc}</p>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
