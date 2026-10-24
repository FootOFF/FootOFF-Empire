import React, { useMemo, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { playerRating, wageOf } from '../game/players';
import {
  TV_ASK_MAX, localTv, maxCut, negotiateTv, negotiateWage, tvBoost, tvChance, tvOpen, tvPerMatch, wageChance, wageOpen,
} from '../game/direction';
import { setTicketPolicy } from '../game/engine';
import { Panel } from './panels';
import { Tabs } from './glass';
import { Portrait } from './portrait';
import { TicketPricing } from './inspector';
import { fmtMoney, fmtRating } from './format';

// Direction du club (src/game/direction.js) : le bureau du président, trois onglets.
// - Droits TV : une demande de hausse par saison au diffuseur, avec la chance exacte qu'il accepte ; puis le contrat
//   de la saison (accordé ou refusé).
// - Salaires : un joueur, une baisse proposée (jusqu'au plafond du niveau), l'économie sur la saison et la chance exacte
//   qu'il accepte ; une seule discussion par joueur et par saison.
// - Billetterie : la formule des billets et la recette prévue de chacune (même outil que la fiche du stade).

const pct = (v) => `${Math.round(v * 100)} %`;
const tone = (c) => (c >= 0.7 ? 'good' : c >= 0.4 ? 'mid' : 'low');

function Chance({ value }) {
  return (
    <div className={`dir-chance ${tone(value)}`}>
      <span>Chance d’accord</span>
      <b>{pct(value)}</b>
      <i aria-hidden="true"><em style={{ width: `${Math.round(value * 100)}%` }} /></i>
    </div>
  );
}

function TvTab({ state, run, notify }) {
  const lvl = state.buildings.direction || 0;
  const [ask, setAsk] = useState(0.15);
  const deal = state.tvDeal?.season === state.seasonNumber ? state.tvDeal : null;
  const base = tvPerMatch(state, null);
  const local = !DIVISIONS[state.divisionIndex].tv;
  if (deal) {
    return (
      <section className={`dir-card ${deal.ok ? 'ok' : 'ko'}`}>
        <span className="eyebrow">Contrat de la saison {state.seasonNumber}</span>
        <h3>{deal.ok ? `Accordé : +${pct(deal.ask)} sur les droits` : 'Refusé : le contrat de base est reconduit'}</h3>
        <p className="dir-big"><b>{fmtMoney(tvPerMatch(state))}</b> par match à domicile</p>
        <p className="dir-note">Prochaine négociation au début de la saison {state.seasonNumber + 1}.</p>
      </section>
    );
  }
  const chance = tvChance(state, ask);
  const after = tvPerMatch(state, { season: state.seasonNumber, ok: true, ask });
  const propose = () => run((s) => {
    const r = negotiateTv(s, ask);
    if (r) setTimeout(() => notify({ kind: r.tvDeal.ok ? 'success' : 'warn', eyebrow: 'Droits TV', title: r.tvDeal.ok ? `Le diffuseur accepte +${pct(ask)}` : 'Le diffuseur refuse la hausse' }), 0);
    return r;
  }, 'Négociation impossible.');
  return (
    <section className="dir-card">
      <span className="eyebrow">Droits TV · saison {state.seasonNumber}</span>
      <h3>{local ? 'Télé locale' : 'Diffuseur de la division'}</h3>
      <p className="dir-note">
        Contrat de base : {fmtMoney(base)} par match à domicile{lvl ? `, dont +${pct(tvBoost(lvl))} grâce à la Direction` : ''}
        {local ? ` (pas de télévision nationale en ${DIVISIONS[state.divisionIndex].name} : ${fmtMoney(localTv(lvl))} de la télé locale)` : ''}.
        Une seule demande par saison : bien dosée, elle s’ajoute à chaque match.
      </p>
      <label className="dir-slider">
        <span>Hausse demandée <b>+{pct(ask)}</b></span>
        <input type="range" min="0" max={TV_ASK_MAX} step="0.05" value={ask} onChange={(e) => setAsk(+e.target.value)} disabled={!tvOpen(state)} aria-label="Hausse demandée" />
      </label>
      <p className="dir-big"><b>{fmtMoney(after)}</b> par match si le diffuseur accepte</p>
      <Chance value={chance} />
      <button type="button" className="btn" onClick={propose} disabled={!tvOpen(state)}>Proposer au diffuseur</button>
    </section>
  );
}

function WagesTab({ state, run, notify }) {
  const lvl = state.buildings.direction || 0;
  const cap = maxCut(lvl);
  const players = useMemo(() => [...state.players].sort((a, b) => wageOf(b, state.divisionIndex) - wageOf(a, state.divisionIndex)), [state.players, state.divisionIndex]);
  const [sel, setSel] = useState(null);
  const [cut, setCut] = useState(Math.min(0.1, cap));
  const p = players.find((q) => q.id === sel) || null;
  const base = p ? Math.round(wageOf({ ...p, wageCut: 0 }, state.divisionIndex)) : 0;
  const propose = () => run((s) => {
    const r = negotiateWage(s, p.id, cut);
    const q = r && r.players.find((x) => x.id === p.id);
    if (q) setTimeout(() => notify({ kind: q.wageCut === cut && cut > 0 ? 'success' : 'warn', eyebrow: 'Salaires', title: q.wageCut === cut && cut > 0 ? `${q.name} accepte −${pct(cut)}` : `${q.name} refuse la baisse` }), 0);
    return r;
  }, 'Négociation impossible.');
  return (
    <div className="dir-wages">
      <p className="dir-note">
        Propose une baisse de salaire à un joueur, jusqu’à {pct(cap)} au niveau {lvl} de la Direction. Un joueur fort pour la
        division résiste davantage ; acceptée, la baisse reste jusqu’à une prochaine renégociation. Une discussion par
        joueur et par saison.
      </p>
      <ul className="dir-list">
        {players.map((q) => {
          const w = wageOf(q, state.divisionIndex);
          const open = wageOpen(state, q);
          return (
            <li key={q.id}>
              <button type="button" className={`dir-row ${sel === q.id ? 'on' : ''}`} onClick={() => setSel(sel === q.id ? null : q.id)} disabled={!open} aria-expanded={sel === q.id}>
                <Portrait p={q} size={34} />
                <span className="dir-who"><strong>{q.name}</strong><em>{q.pos} · niveau {fmtRating(playerRating(q))}</em></span>
                <span className="dir-wage"><b>{fmtMoney(w)}</b><em>{q.wageCut ? `−${pct(q.wageCut)} négocié` : open ? 'par saison' : 'déjà discuté'}</em></span>
              </button>
              {sel === q.id && p && (
                <div className="dir-talk">
                  <label className="dir-slider">
                    <span>Baisse proposée <b>−{pct(cut)}</b></span>
                    <input type="range" min="0.02" max={cap} step="0.01" value={Math.min(cut, cap)} onChange={(e) => setCut(+e.target.value)} aria-label="Baisse proposée" />
                  </label>
                  <p className="dir-big"><b>{fmtMoney(Math.round(base * (1 - cut)))}</b> par saison · économie de {fmtMoney(base - Math.round(base * (1 - cut)))}</p>
                  <Chance value={wageChance(state, p, cut)} />
                  <button type="button" className="btn" onClick={propose}>Proposer à {p.name.split(' ')[0]}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DirectionView({ state, run, notify = () => {}, initialTab = 'tv', onClose, onBuilding }) {
  const [tab, setTab] = useState(initialTab || 'tv');
  const lvl = state.buildings.direction || 0;
  return (
    <Panel
      id="direction"
      size="lg"
      title="Direction du club"
      eyebrow={<>Niveau {lvl} / 5<span className="hide-sm"> · {DIVISIONS[state.divisionIndex].name}</span></>}
      money={state.money}
      onClose={onClose}
      toolbar={(
        <>
          <p className="dir-intro">
            Le bureau du président : les chances affichées sont celles qui décident.
            {onBuilding && <> <button type="button" className="linkbtn" onClick={onBuilding}>bâtiment</button></>}
          </p>
          <Tabs items={[['tv', 'Droits TV'], ['wages', 'Salaires'], ['tickets', 'Billetterie']]} value={tab} onChange={setTab} />
        </>
      )}
    >
      {tab === 'tv' ? <TvTab state={state} run={run} notify={notify} />
        : tab === 'wages' ? <WagesTab state={state} run={run} notify={notify} />
          : (
            <section className="dir-card">
              <TicketPricing state={state} onChange={(id) => run((s) => setTicketPolicy(s, id))} />
            </section>
          )}
    </Panel>
  );
}
