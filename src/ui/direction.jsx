import React, { useMemo, useState } from 'react';
import { DIVISIONS, divisionOf } from '../game/constants';
import { playerRating, wageOf } from '../game/players';
import { TV_ASK_MAX, localTv, negotiateTv, tvBoost, tvChance, tvOpen, tvPerMatch } from '../game/direction';
import { lastYear, renewOpen } from '../game/contracts';
import { DIRECTION_EASE } from '../game/economy';
import { setTicketPolicy } from '../game/engine';
import { pctOf } from '../game/mercato';
import { Panel } from './panels';
import { Tabs } from './glass';
import { Portrait } from './portrait';
import { TicketPricing } from './inspector';
import { fmtMoney, fmtRating } from './format';
import { t, tr } from '../i18n/index';

// Direction du club (src/game/direction.js) : le bureau du président, trois onglets.
// - Droits TV : une demande de hausse par saison au diffuseur, avec la chance exacte qu'il accepte ; puis le contrat
//   de la saison (accordé ou refusé).
// - Contrats (0.8.0) : les contrats de l'effectif, les plus proches de leur fin d'abord ; « Prolonger » ouvre la
//   négociation de prolongation (la fenêtre du mercato, mercato.jsx), posée sur tout l'écran (App).
// - Billetterie : la formule des billets et la recette prévue de chacune (même outil que la fiche du stade).

const pct = (v) => `${Math.round(v * 100)} %`;
const tone = (c) => (c >= 0.7 ? 'good' : c >= 0.4 ? 'mid' : 'low');

// jauge de la chance exacte d'accord (aussi au centre médical, chance d'un soin) : 0 % et 100 % seulement quand
// c'est certain (99,6 % s'écrit 99 %, comme au mercato)
export function Chance({ value, label = t('Chance d’accord') }) {
  return (
    <div className={`dir-chance ${tone(value)}`}>
      <span>{label}</span>
      <b>{pctOf(value)} %</b>
      <i aria-hidden="true"><em style={{ width: `${Math.round(value * 100)}%` }} /></i>
    </div>
  );
}

function TvTab({ state, run, notify }) {
  const lvl = state.buildings.direction || 0;
  const [ask, setAsk] = useState(0.15);
  const deal = state.tvDeal?.season === state.seasonNumber ? state.tvDeal : null;
  const base = tvPerMatch(state, null);
  const local = !divisionOf(state).tv;
  if (deal) {
    return (
      <section className={`dir-card ${deal.ok ? 'ok' : 'ko'}`}>
        <span className="eyebrow">{tr('Contrat de la saison <0/>', [state.seasonNumber])}</span>
        <h3>{deal.ok ? t('Accordé : +{pct} sur les droits', { pct: pct(deal.ask) }) : t('Refusé : le contrat de base est reconduit')}</h3>
        <p className="dir-big">{tr('<0/> par match de championnat', [<b>{fmtMoney(tvPerMatch(state))}</b>])}</p>
        <p className="dir-note">{tr('Prochaine négociation au début de la saison <0/>.', [state.seasonNumber + 1])}</p>
      </section>
    );
  }
  const chance = tvChance(state, ask);
  const after = tvPerMatch(state, { season: state.seasonNumber, ok: true, ask });
  const propose = () => run((s) => {
    const r = negotiateTv(s, ask);
    if (r) setTimeout(() => notify({ kind: r.tvDeal.ok ? 'success' : 'warn', eyebrow: t('Droits TV'), title: r.tvDeal.ok ? t('Le diffuseur accepte +{pct}', { pct: pct(ask) }) : t('Le diffuseur refuse la hausse') }), 0);
    return r;
  }, t('Négociation impossible.'));
  return (
    <section className="dir-card">
      <span className="eyebrow">{tr('Droits TV · saison <0/>', [state.seasonNumber])}</span>
      <h3>{local ? t('Télé locale') : t('Diffuseur de la division')}</h3>
      <p className="dir-note">{tr('Contrat de base : <0/> par match de championnat<1/><2/>. Une seule demande par saison : bien dosée, elle s’ajoute à chaque match.', [fmtMoney(base), lvl ? t(', dont +{pct} grâce à la Direction', { pct: pct(tvBoost(lvl)) }) : '', local ? t(' (pas de télévision nationale en {name} : {localTv} de la télé locale)', { name: divisionOf(state).name, localTv: fmtMoney(localTv(lvl)) }) : ''])}</p>
      <label className="dir-slider">
        <span>{tr('Hausse demandée <0/>', [<b>+{pct(ask)}</b>])}</span>
        <input type="range" min="0" max={TV_ASK_MAX} step="0.05" value={ask} onChange={(e) => setAsk(+e.target.value)} disabled={!tvOpen(state)} aria-label={t('Hausse demandée')} />
      </label>
      <p className="dir-big">{tr('<0/> par match si le diffuseur accepte', [<b>{fmtMoney(after)}</b>])}</p>
      <Chance value={chance} />
      <button type="button" className="btn" onClick={propose} disabled={!tvOpen(state)}>{t('Proposer au diffuseur')}</button>
    </section>
  );
}

function ContractsTab({ state, onRenew }) {
  const lvl = state.buildings.direction || 0;
  const players = useMemo(
    () => [...state.players].sort((a, b) => (a.deal?.until ?? 99) - (b.deal?.until ?? 99) || wageOf(b, state.divisionIndex) - wageOf(a, state.divisionIndex)),
    [state.players, state.divisionIndex],
  );
  return (
    <div className="dir-wages">
      <p className="dir-note">
        <b>{tr('Saison en cours : <0/>.', [state.seasonNumber])}</b>{t(' Les contrats de l’effectif, les plus proches de leur fin d’abord. Sans prolongation, un joueur en dernière année part libre à l’intersaison, sans indemnité. ')}
        {lvl ? t('Au niveau {lvl}, ta Direction baisse de {v} % les exigences de salaire des joueurs.', { lvl, v: lvl * DIRECTION_EASE }) : t('Construis la Direction pour baisser les exigences de salaire des joueurs.')}
      </p>
      <ul className="dir-list">
        {players.map((q) => {
          const last = lastYear(state, q);
          const open = renewOpen(state, q);
          return (
            <li key={q.id}>
              <div className={`dir-row dir-contract ${last ? 'last' : ''}`}>
                <Portrait p={q} size={34} />
                <span className="dir-who"><strong>{q.name}</strong><em>{tr('<0/> · niveau <1/> · <2/> ans', [q.pos, fmtRating(playerRating(q)), q.age])}</em></span>
                <span className="dir-side">
                  <span className="dir-wage"><b>{fmtMoney(wageOf(q, state.divisionIndex))}</b><em>{last ? t('dernière année') : q.deal ? t('jusqu’à la saison {until}', { until: q.deal.until }) : t('par saison')}</em></span>
                  <button type="button" className="btn btn-sm" disabled={!open} onClick={() => onRenew(q.id)} title={open ? '' : t('Contrat au plus long')}>{t('Prolonger')}</button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// onRenew : ouvre la prolongation d'un joueur, posée sur tout l'écran (App) ; sheetOpen : elle a la main sur Échap.
export function DirectionView({ state, run, notify = () => {}, initialTab = 'tv', onClose, onBuilding, onRenew = () => {}, sheetOpen = false }) {
  const [tab, setTab] = useState(initialTab === 'wages' ? 'contracts' : initialTab || 'tv');
  const lvl = state.buildings.direction || 0;
  return (
    <Panel
      id="direction"
      title={t('Direction du club')}
      eyebrow={<>{t('Niveau ')}{lvl} / 5<span className="hide-sm"> · {divisionOf(state).name}</span></>}
      money={state.money}
      onClose={onClose}
      onEscape={sheetOpen ? () => {} : undefined}
      toolbar={(
        <>
          <p className="dir-intro">{tr('Le bureau du président : les chances affichées sont celles qui décident.<0/>', [onBuilding && <> <button type="button" className="linkbtn" onClick={onBuilding}>{t('bâtiment')}</button></>])}</p>
          <Tabs items={[['tv', t('Droits TV')], ['contracts', t('Contrats')], ['tickets', t('Billetterie')]]} value={tab} onChange={setTab} />
        </>
      )}
    >
      {tab === 'tv' ? <TvTab state={state} run={run} notify={notify} />
        : tab === 'contracts' ? <ContractsTab state={state} onRenew={onRenew} />
          : (
            <section className="dir-card">
              <TicketPricing state={state} onChange={(id) => run((s) => setTicketPolicy(s, id))} />
            </section>
          )}
    </Panel>
  );
}
