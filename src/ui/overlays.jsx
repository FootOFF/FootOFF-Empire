import React from 'react';
import { divisionOf } from '../game/constants';
import { OFFLINE_CAP } from '../game/economy';
import { FOMonogram } from './brand';
import { fmtMoney, fmtNum } from './format';
import { AnimatedMoney } from './moneyfx';
import { Trophy } from './trophy';
import { ofDiv } from '../game/cups';
import { ordSuffix, t, tn, tr } from '../i18n/index';

// Écrans « cinématiques » : résultat de match, bilan de saison, retour hors ligne.

export function SeasonReview({ state, onClose }) {
  const r = state.seasonReview;
  if (!r) return null;
  const net = (r.matchday || 0) + r.prize + r.sponsors + (r.titleBonus || 0) + (r.cups || 0) - r.wages - (r.upkeep || 0);
  const trophies = r.trophies || [];
  return (
    <div className={`cine ${trophies.length ? 'cine-champion' : ''}`}>
      <div className="cine-card">
        {trophies.length > 0 && (
          <div className="cine-trophies">
            {trophies.map((t, i) => <Trophy key={i} comp={t.comp} className="cine-trophy" />)}
          </div>
        )}
        {r.champion && <span className="cine-champ">{tr('Champion <0/> !', [ofDiv(r.division)])}</span>}
        <span className="eyebrow">{t('Bilan de saison')}</span>
        <div className="cine-rank"><b>{r.position}<sup>{ordSuffix(r.position)}</sup></b><span>{tr('sur 8 · <0/>', [r.division])}</span></div>
        {r.promoted && <span className="cine-word win">{tr('Montée en <0/>', [r.nextDivision])}</span>}
        {r.relegated && <span className="cine-word loss">{tr('Descente en <0/>', [r.nextDivision])}</span>}
        {!r.promoted && !r.relegated && !r.league && <span className={`cine-word ${r.champion ? 'win' : 'draw'}`}>{r.champion ? t('Titre conservé en Élite') : t('Maintien')}</span>}
        {r.league && !r.champion && r.position <= 3 && <span className="cine-word win">{t('Sur le podium')}</span>}{/* entre amis : ni montée ni descente */}
        <div className="cine-facts">
          {r.matchday > 0 && <div><span>{t('Recettes des matchs')}</span><b className="up">+{fmtMoney(r.matchday)}</b></div>}
          <div><span>{t('Prime')}</span><b className="up">+{fmtMoney(r.prize)}</b></div>
          {r.titleBonus > 0 && <div><span>{t('Primes de titre')}</span><b className="up">+{fmtMoney(r.titleBonus)}</b></div>}
          {r.cups > 0 && <div><span>{t('Primes de coupes')}</span><b className="up">+{fmtMoney(r.cups)}</b></div>}
          <div><span>{tr('Sponsors<0/>', [r.sponsorsUpfront ? t(' (à la reprise)') : ''])}</span><b className="up">+{fmtMoney(r.sponsors)}</b></div>
          <div><span>{t('Salaires')}</span><b className="down">−{fmtMoney(r.wages)}</b></div>
          {r.upkeep > 0 && <div><span>{t('Entretien')}</span><b className="down">−{fmtMoney(r.upkeep)}</b></div>}
          <div><span>{t('Bilan de la saison')}</span><b className={net >= 0 ? 'up' : 'down'}><AnimatedMoney value={Math.abs(net)} from={0} delay={600} duration={1300} prefix={net >= 0 ? '+' : '−'} /></b></div>
        </div>
        {r.cupRuns?.length > 0 && (
          <div className="cine-cups">
            {r.cupRuns.map((c) => <span key={c.comp} className={c.won ? 'won' : ''}>{c.comp === 'c1' ? t('Coupe d’Europe') : t('Coupe nationale')} · {c.reached}</span>)}
          </div>
        )}
        {r.events.length > 0 && <ul className="cine-events">{r.events.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <button className="btn btn-xl" onClick={onClose}>{tr('Saison <0/> · <1/>', [state.seasonNumber, divisionOf(state).name])}</button>
      </div>
    </div>
  );
}

// durée d'absence à la française : « 45 min », « 4 h 42 »
const duration = (h) => {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
};

export function OfflineReturn({ data, onClose }) {
  return (
    <div className="cine">
      <div className="cine-card small">
        <FOMonogram className="cine-mark" />
        <span className="eyebrow">{t('Pendant ton absence')}</span>
        <div className="cine-big"><AnimatedMoney value={data.amount} from={0} delay={400} duration={1200} prefix="+" /></div>
        <p className="muted">
          {data.hours >= OFFLINE_CAP
            ? t('Tes partenaires sont restés fidèles : {OFFLINE_CAP} h de revenus encaissés, le maximum pendant une absence.', { OFFLINE_CAP })
            : t('Tes partenaires sont restés fidèles : revenus encaissés en {duration}.', { duration: duration(data.hours) })}
        </p>
        <button className="btn btn-xl" onClick={onClose}>{t('Reprendre')}</button>
      </div>
    </div>
  );
}
