import React from 'react';
import { DIVISIONS } from '../game/constants';
import { FOMonogram } from './brand';
import { fmtMoney, fmtNum } from './format';

// Écrans « cinématiques » : résultat de match, bilan de saison, retour hors ligne.

export function MatchResult({ state, onClose }) {
  const lm = state.lastMatch;
  if (!lm) return null;
  const outcome = lm.gf > lm.ga ? 'win' : lm.gf < lm.ga ? 'loss' : 'draw';
  const word = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' }[outcome];
  return (
    <div className="cine">
      <div className="cine-card">
        <span className="eyebrow">Journée {lm.round} · coup de sifflet final</span>
        <div className="cine-score">
          <span className="cs-team">{state.clubName}</span>
          <span className="cs-num">{lm.gf}<i>–</i>{lm.ga}</span>
          <span className="cs-team">{lm.oppName}</span>
        </div>
        <span className={`cine-word ${outcome}`}>{word}</span>
        {lm.scorers.length > 0 && (
          <ul className="cine-scorers">
            {lm.scorers.map((x, i) => <li key={i}><b>{x.minute}′</b>{x.name}</li>)}
          </ul>
        )}
        {lm.stats && (
          <div className="cine-stats">
            <span>Possession <b>{lm.stats.possession} %</b></span>
            <span>Tirs <b>{lm.stats.shots[0]} – {lm.stats.shots[1]}</b></span>
            <span>Cadrés <b>{lm.stats.onTarget[0]} – {lm.stats.onTarget[1]}</b></span>
            {lm.stats.yellow[0] + lm.stats.red[0] > 0 && <span>Cartons <b>{lm.stats.yellow[0]}<i className="card yellow" />{lm.stats.red[0] > 0 && <> {lm.stats.red[0]}<i className="card red" /></>}</b></span>}
          </div>
        )}
        <div className="cine-facts">
          <div><span>Affluence</span><b>{fmtNum(lm.attendance)}</b></div>
          <div><span>Recettes</span><b>{fmtMoney(lm.revenue)}</b></div>
          <div><span>Réputation</span><b className={lm.repDelta >= 0 ? 'up' : 'down'}>{lm.repDelta >= 0 ? '+' : ''}{lm.repDelta}</b></div>
        </div>
        <button className="btn btn-xl" onClick={onClose}>Continuer</button>
      </div>
    </div>
  );
}

export function SeasonReview({ state, onClose }) {
  const r = state.seasonReview;
  if (!r) return null;
  const net = r.prize + r.sponsors - r.wages;
  return (
    <div className="cine">
      <div className="cine-card">
        <span className="eyebrow">Bilan de saison</span>
        <div className="cine-rank"><b>{r.position}<sup>e</sup></b><span>sur 8 · {r.division}</span></div>
        {r.promoted && <span className="cine-word win">Montée en {r.nextDivision}</span>}
        {r.relegated && <span className="cine-word loss">Descente en {r.nextDivision}</span>}
        {!r.promoted && !r.relegated && <span className="cine-word draw">Maintien</span>}
        <div className="cine-facts">
          <div><span>Prime</span><b className="up">+{fmtMoney(r.prize)}</b></div>
          <div><span>Sponsors</span><b className="up">+{fmtMoney(r.sponsors)}</b></div>
          <div><span>Salaires</span><b className="down">−{fmtMoney(r.wages)}</b></div>
          <div><span>Solde</span><b className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : '−'}{fmtMoney(Math.abs(net))}</b></div>
        </div>
        {r.events.length > 0 && <ul className="cine-events">{r.events.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <button className="btn btn-xl" onClick={onClose}>
          Saison {state.seasonNumber} · {DIVISIONS[state.divisionIndex].name}
        </button>
      </div>
    </div>
  );
}

export function OfflineReturn({ data, onClose }) {
  return (
    <div className="cine">
      <div className="cine-card small">
        <FOMonogram className="cine-mark" />
        <span className="eyebrow">Pendant votre absence</span>
        <div className="cine-big">+{fmtMoney(data.amount)}</div>
        <p className="muted">Vos partenaires sont restés fidèles : revenus encaissés en {data.hours} h.</p>
        <button className="btn btn-xl" onClick={onClose}>Reprendre</button>
      </div>
    </div>
  );
}
