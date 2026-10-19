import React, { useEffect, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import { playerRating, saleValue, signingFee, starsOf, wageOf } from '../game/players';
import { sellPlayer, signPlayer } from '../game/engine';
import { seasonForecast } from '../game/economy';
import { bestSigning } from '../game/advice';
import { teamLevel } from '../game/match';
import { standingsOf } from '../game/season';
import { fmtMoney, fmtNum } from './format';
import { IconClose } from './icons';

// Panneau latéral en verre, glissant au-dessus de la vue 3D (plein écran sur mobile).
export function Drawer({ title, eyebrow, onClose, children, wide }) {
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
        <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div className="drawer-body">{children}</div>
    </section>
  );
}

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const FILTERS = [['all', 'Tous'], ['G', 'Gardiens'], ['D', 'Défense'], ['M', 'Milieu'], ['A', 'Attaque']];

function Rating({ v }) {
  return <span className="p-rating">{v.toFixed(1)}</span>;
}

function Stats({ p }) {
  return (
    <div className="p-stats">
      {[['ATT', p.att], ['DÉF', p.def], ['MEN', p.men]].map(([l, v]) => (
        <span key={l} className="p-stat"><em>{l}</em><span className="p-track"><i style={{ width: `${(v / 20) * 100}%` }} /></span><b>{v}</b></span>
      ))}
    </div>
  );
}

export function SquadPanel({ state, run, ask, onClose }) {
  const [filter, setFilter] = useState('all');
  const squad = [...state.players].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a));
  const shown = filter === 'all' ? squad : squad.filter((p) => p.pos === filter);
  const rating = teamLevel(state);
  const wages = squad.reduce((s, p) => s + wageOf(p, state.divisionIndex), 0);
  const forecast = seasonForecast(state, wages);
  const recommended = bestSigning(state)?.player.id;
  return (
    <Drawer title="Effectif" eyebrow={`${squad.length}/${SQUAD_MAX} joueurs`} onClose={onClose}>
      <div className="kpis">
        <div className="kpi"><span>Niveau d’équipe</span><b>{rating.toFixed(1)}</b></div>
        <div className="kpi"><span>Masse salariale</span><b>{fmtMoney(wages)}</b></div>
        <div className="kpi"><span>Âge moyen</span><b>{(squad.reduce((s, p) => s + p.age, 0) / squad.length).toFixed(1)}</b></div>
      </div>
      <p className={`budget-line ${forecast.net < 0 ? 'bad' : forecast.wageShare > 0.75 ? 'warn' : ''}`}>
        Salaires : <b>{Math.round(forecast.wageShare * 100)} %</b> des revenus attendus sur la saison ({fmtMoney(forecast.income)})
        {forecast.net < 0 ? ' · saison déficitaire en vue : vends un remplaçant ou agrandis le stade.' : forecast.wageShare > 0.75 ? ' · attention, la marge se réduit.' : '.'}
      </p>
      <div className="chips">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <ul className="plist">
        {shown.map((p) => (
          <li key={p.id} className="pcard">
            <span className={`pos ${p.pos}`}>{p.pos}</span>
            <div className="p-main">
              <span className="p-name">{p.name}</span>
              <span className="p-meta">{p.age} ans · {POS_LABELS[p.pos]} · <span className="stars">{starsOf(p)}</span></span>
              <Stats p={p} />
            </div>
            <div className="p-side">
              <Rating v={playerRating(p)} />
              <span className="p-wage">{fmtMoney(wageOf(p, state.divisionIndex))}/saison</span>
              <button
                className="linkbtn"
                disabled={squad.length <= SQUAD_MIN}
                title={squad.length <= SQUAD_MIN ? 'Effectif au minimum' : 'Vendre le joueur à un autre club'}
                onClick={() => {
                  const fee = saleValue(p, state.divisionIndex);
                  const starter = state.lineup?.includes(p.id);
                  ask({
                    title: `Vendre ${p.name} ?`,
                    text: `${p.name} (${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, note ${playerRating(p).toFixed(1)}) rejoindra un autre club.${starter ? ' C’est un titulaire : ton onze sera recomposé.' : ''}`,
                    rows: [
                      ['Montant de la vente', `+${fmtMoney(fee)}`, 'up'],
                      ['Salaire économisé', `${fmtMoney(wageOf(p, state.divisionIndex))} / saison`, 'up'],
                    ],
                    confirmLabel: `Vendre · ${fmtMoney(fee)}`,
                    onConfirm: () => run((s) => sellPlayer(s, p.id), 'Effectif au minimum (11 joueurs).'),
                  });
                }}
              >
                Vendre · {fmtMoney(saleValue(p, state.divisionIndex))}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="section-head">
        <span className="eyebrow">Marché des joueurs libres</span>
        <span className="muted small">Renouvelé à chaque saison</span>
      </div>
      <ul className="plist">
        {state.market.length === 0 && <li className="empty">Plus de joueur disponible cette saison.</li>}
        {state.market.map((p) => {
          const fee = signingFee(p, state.divisionIndex);
          return (
            <li key={p.id} className={`pcard market ${p.id === recommended ? 'recommended' : ''}`}>
              <span className={`pos ${p.pos}`}>{p.pos}</span>
              <div className="p-main">
                <span className="p-name">{p.name}{p.id === recommended && <em className="rec-tag">Recommandé</em>}</span>
                <span className="p-meta">{p.age} ans · {POS_LABELS[p.pos]} · <span className="stars">{starsOf(p)}</span></span>
                <Stats p={p} />
              </div>
              <div className="p-side">
                <Rating v={playerRating(p)} />
                <button
                  className="btn btn-sm"
                  disabled={state.money < fee || squad.length >= SQUAD_MAX}
                  onClick={() => run((s) => signPlayer(s, p.id), 'Fonds insuffisants ou effectif complet.')}
                >
                  Signer · {fmtMoney(fee)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Drawer>
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
