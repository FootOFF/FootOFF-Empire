import React from 'react';
import { DIVISIONS } from '../game/constants';
import { FOMonogram } from './brand';
import { fmtMoney, fmtNum } from './format';
import { AnimatedMoney } from './moneyfx';

// Écrans « cinématiques » : résultat de match, bilan de saison, retour hors ligne.

export function SeasonReview({ state, onClose }) {
  const r = state.seasonReview;
  if (!r) return null;
  const net = (r.matchday || 0) + r.prize + r.sponsors - r.wages - (r.upkeep || 0);
  return (
    <div className="cine">
      <div className="cine-card">
        <span className="eyebrow">Bilan de saison</span>
        <div className="cine-rank"><b>{r.position}<sup>e</sup></b><span>sur 8 · {r.division}</span></div>
        {r.promoted && <span className="cine-word win">Montée en {r.nextDivision}</span>}
        {r.relegated && <span className="cine-word loss">Descente en {r.nextDivision}</span>}
        {!r.promoted && !r.relegated && <span className="cine-word draw">Maintien</span>}
        <div className="cine-facts">
          {r.matchday > 0 && <div><span>Recettes des matchs</span><b className="up">+{fmtMoney(r.matchday)}</b></div>}
          <div><span>Prime</span><b className="up">+{fmtMoney(r.prize)}</b></div>
          <div><span>Sponsors</span><b className="up">+{fmtMoney(r.sponsors)}</b></div>
          <div><span>Salaires</span><b className="down">−{fmtMoney(r.wages)}</b></div>
          {r.upkeep > 0 && <div><span>Entretien</span><b className="down">−{fmtMoney(r.upkeep)}</b></div>}
          <div><span>Bilan de la saison</span><b className={net >= 0 ? 'up' : 'down'}><AnimatedMoney value={Math.abs(net)} from={0} delay={600} duration={1300} prefix={net >= 0 ? '+' : '−'} /></b></div>
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
        <div className="cine-big"><AnimatedMoney value={data.amount} from={0} delay={400} duration={1200} prefix="+" /></div>
        <p className="muted">Vos partenaires sont restés fidèles : revenus encaissés en {data.hours} h.</p>
        <button className="btn btn-xl" onClick={onClose}>Reprendre</button>
      </div>
    </div>
  );
}
