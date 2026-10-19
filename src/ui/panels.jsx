import React, { useEffect } from 'react';
import { DIVISIONS } from '../game/constants';
import { standingsOf } from '../game/season';
import { fmtMoney, fmtNum } from './format';
import { IconClose } from './icons';

// Panneau latéral en verre, glissant au-dessus de la vue 3D (plein écran sur mobile).
export function Drawer({ title, eyebrow, onClose, children, wide, headExtra }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section className={`drawer glass ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
      <header className="drawer-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        <div className="drawer-head-side">
          {headExtra}
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </div>
      </header>
      <div className="drawer-body">{children}</div>
    </section>
  );
}

export function SeasonPanel({ state, onClose }) {
  const standings = standingsOf(state);
  const div = DIVISIONS[state.divisionIndex];
  const lm = state.lastMatch;
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < 3;
  return (
    <Drawer title={div.name} eyebrow={`Saison ${state.seasonNumber} · journée ${Math.min(state.round, 7)}/7`} onClose={onClose}>
      {lm && (
        <div className="result-card">
          <span className="eyebrow">Dernier match · J{lm.round}</span>
          <div className="result-score">
            <span className="rs-team">{state.clubName}</span>
            <span className={`rs-num ${lm.gf > lm.ga ? 'win' : lm.gf < lm.ga ? 'loss' : ''}`}>{lm.gf} – {lm.ga}</span>
            <span className="rs-team right">{lm.oppName}</span>
          </div>
          {lm.gf > 0 && <p className="rs-scorers">{lm.scorers.map((x) => `${x.name} ${x.minute}′`).join(' · ')}</p>}
          <div className="rs-facts">
            <span>{fmtNum(lm.attendance)} spectateurs</span>
            <span>{fmtMoney(lm.revenue)} de recettes</span>
            <span>Réputation {lm.repDelta >= 0 ? '+' : ''}{lm.repDelta}</span>
          </div>
        </div>
      )}
      <div className="section-head"><span className="eyebrow">Classement</span></div>
      <table className="table">
        <thead><tr><th>#</th><th>Club</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead>
        <tbody>
          {standings.map((t, i) => (
            <tr key={t.i} className={[t.i === 0 && 'me', promo && i < 2 && 'promo', rel && i >= 6 && 'releg'].filter(Boolean).join(' ')}>
              <td className="t-pos">{i + 1}</td>
              <td className="t-club">{t.name}</td>
              <td>{t.played}</td>
              <td>{t.gd > 0 ? '+' : ''}{t.gd}</td>
              <td className="t-pts">{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend-row">
        {promo && <span><i className="dot promo" /> Montée</span>}
        {rel && <span><i className="dot releg" /> Descente</span>}
      </div>
      {state.history.length > 0 && (
        <>
          <div className="section-head"><span className="eyebrow">Palmarès</span></div>
          <ul className="honours">
            {state.history.slice().reverse().map((h) => (
              <li key={h.season}><span>Saison {h.season}</span><b>{h.position}e</b><em>{h.division}</em></li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}

export function JournalPanel({ state, onClose }) {
  return (
    <Drawer title="Journal du club" eyebrow="Chronique" onClose={onClose}>
      {state.journal.length === 0 && <p className="muted">L’histoire commence au premier coup de sifflet.</p>}
      <ol className="timeline">
        {state.journal.map((e, i) => (
          <li key={i}>
            <span className="tl-chip">{e.round ? `S${e.season} · J${e.round}` : `Saison ${e.season}`}</span>
            <p>{e.text}</p>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
