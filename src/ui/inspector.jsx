import React, { useRef } from 'react';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { PLOT_LABELS, SECTORS, allowedBuildingsFor, buildingEffect, plotBuilding } from '../game/map';
import { fmtMoney, fmtNum } from './format';
import { TICKET_ORDER, TICKET_POLICIES, expectedGate, investmentPreview } from '../game/economy';
import { Tabs } from './glass';
import { seasonEndForecast } from '../game/advice';
import { IconAcademy, IconArrowUp, IconClose, IconFans, IconSponsor, IconStadium, IconTraining, IconTransfer } from './icons';
import { Eyebrow } from './kit';
import { useKeydown } from './presence';
import { useSwipe } from './gestures';
import { usePanelSound } from './panels';

const ICONS = { terrain: IconStadium, training: IconTraining, academy: IconAcademy, fans: IconFans, sponsor: IconSponsor, transfers: IconTransfer };

// Ce que rapporte l'investissement, avant de cliquer : recettes en plus par saison, entretien, rentabilité.
const SPORTING = { training: 'il fait progresser l’équipe', academy: 'il fait progresser l’équipe', transfers: 'il ouvre le marché des joueurs sous contrat' };
function Payoff({ state, k, compact = false }) {
  const inv = investmentPreview(state, k);
  if (SPORTING[k]) {
    return <span className="ins-money">Investissement sportif{compact ? '' : ` : il ne rapporte pas d’argent, ${SPORTING[k]}`} · entretien +{fmtMoney(inv.upkeep)} par saison</span>;
  }
  if (inv.gain <= 0) {
    return <span className="ins-money muted">{k === 'terrain' ? 'Aucune recette en plus tant que le stade n’est pas plein' : 'Aucune recette en plus pour l’instant'} · entretien +{fmtMoney(inv.upkeep)}</span>;
  }
  const when = inv.payback === null ? 'ne couvre pas son entretien'
    : inv.payback <= 1 ? 'rentabilisé en moins d’une saison' : `rentabilisé en ${Math.ceil(inv.payback)} saisons environ`;
  return (
    <span className={`ins-money ${inv.payback === null ? 'muted' : 'good'}`}>
      +{fmtMoney(inv.gain)} de recettes par saison{compact ? '' : ` · entretien +${fmtMoney(inv.upkeep)}`} · {when}
    </span>
  );
}

// Tarifs des billets : le joueur voit tout de suite le public et les recettes attendus à chaque match.
function TicketPricing({ state, onChange }) {
  const current = state.ticketPolicy || 'standard';
  const at = (id) => expectedGate({ ...state, ticketPolicy: id }, null);
  const g = at(current);
  return (
    <div className="ins-effect ins-pricing">
      <Eyebrow muted>Tarif des billets</Eyebrow>
      <Tabs className="segmented tp-tabs" role="radiogroup" label="Tarif des billets" items={TICKET_ORDER.map((id) => [id, TICKET_POLICIES[id].name])} value={current} onChange={onChange} />
      <p>{TICKET_POLICIES[current].blurb}</p>
      <ul className="tp-compare">
        {TICKET_ORDER.map((id) => {
          const x = at(id);
          return <li key={id} className={id === current ? 'on' : ''}><span>{TICKET_POLICIES[id].name}</span><em>{fmtNum(x.attendance)} spect.</em><b>{fmtMoney(x.revenue)}</b></li>;
        })}
      </ul>
      <p className="ins-hint">Par match de championnat à domicile : {fmtNum(g.attendance)} spectateurs{g.demand > g.capacity ? `, ${fmtNum(g.demand - g.capacity)} restent dehors` : ''}.</p>
    </div>
  );
}

function Pips({ lvl, max }) {
  return (
    <div className="pips" aria-label={`Niveau ${lvl} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}
    </div>
  );
}

// Inspecteur de parcelle : même famille que les panneaux (en-tête, corps), en carte à gauche sur PC et en
// feuille basse sur mobile, ouverte au clic dans la vue 3D.
export default function PlotInspector({ state, sel, onClose, onBuild, onUpgrade, onMatchDay, onTransfers, onTicketPolicy }) {
  const ref = useRef(null);
  useKeydown((e) => { if (e.key === 'Escape') onClose(); });
  useSwipe(ref, { onDown: onClose });
  usePanelSound();

  const sec = SECTORS.find((s) => s.id === sel.sector) || SECTORS[0];
  const key = plotBuilding(state, sel.plotId);
  const Icon = key ? ICONS[key] : IconArrowUp;

  let body;
  let title;
  let foot = null; // action principale, toujours visible en bas (sous le pouce sur téléphone)
  if (!key) {
    title = `${PLOT_LABELS[sel.plotId]} · libre`;
    const available = allowedBuildingsFor(state);
    body = available.length ? (
      <div className="ins-options">
        {available.map((k) => {
          const B = ICONS[k];
          const cost = upgradeCost(k, 1);
          const short = state.money < cost;
          return (
            <div className="ins-option" key={k} data-key={k}>
              <span className="ins-option-icon"><B /></span>
              <strong className="ins-option-name">{BUILDINGS[k].name}</strong>
              <button className={`btn btn-sm ${short ? '' : 'glow'}`} disabled={short} onClick={() => onBuild(sel.plotId, k)} title={short ? `Il manque ${fmtMoney(cost - state.money)}` : ''}>
                {fmtMoney(cost)}
              </button>
              <div className="ins-option-main">
                <span>{buildingEffect(k, 1, state.divisionIndex, state.reputation)}</span>
                <Payoff state={state} k={k} compact />
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <p className="ins-text">Tous les bâtiments sont déjà construits : cette parcelle reste libre.</p>
    );
  } else {
    const b = BUILDINGS[key];
    const lvl = state.buildings[key];
    const maxed = lvl >= b.max;
    const cost = upgradeCost(key, lvl + 1);
    const short = state.money < cost;
    const endAfter = seasonEndForecast(state) - cost - Math.round(cost * 0.04); // fin de saison prévue après les travaux
    title = b.name;
    if (!maxed) {
      foot = (
        <>
          <button className={`btn btn-xl wide ${short ? '' : 'glow'}`} disabled={short} onClick={() => onUpgrade(key)}>
            <IconArrowUp /> Améliorer · {fmtMoney(cost)}
          </button>
          <span className={`ins-hint ${endAfter < 0 ? 'risk' : ''}`}>{short ? `Il manque ${fmtMoney(cost - state.money)}` : endAfter < 0 ? `Attention : fin de saison prévue dans le rouge (${fmtMoney(endAfter)})` : `Trésorerie après travaux : ${fmtMoney(state.money - cost)}`}</span>
        </>
      );
    }
    body = (
      <>
        <div className="ins-level"><Pips lvl={lvl} max={b.max} /><span>Niveau {lvl}/{b.max}</span></div>
        <div className="ins-effect">
          <Eyebrow muted>Actuellement</Eyebrow>
          <p>{buildingEffect(key, lvl, state.divisionIndex, state.reputation)}</p>
          {key === 'terrain' && (() => {
            const gate = expectedGate(state, null);
            return (
              <p className={`ins-demand ${gate.demand > gate.capacity ? 'full' : ''}`}>
                Public potentiel : {fmtNum(gate.demand)} spectateurs par match
                {gate.demand > gate.capacity ? ' · stade trop petit, des supporters restent dehors.' : ` · ${Math.round((gate.demand / gate.capacity) * 100)} % de remplissage.`}
              </p>
            );
          })()}
        </div>
        {!maxed ? (
          <>
            <div className="ins-effect next">
              <Eyebrow>Niveau {lvl + 1}</Eyebrow>
              <p>{buildingEffect(key, lvl + 1, state.divisionIndex, state.reputation)}</p>
              <Payoff state={state} k={key} />
            </div>
          </>
        ) : (
          <div className="ins-max">Niveau maximum atteint</div>
        )}
        {key === 'transfers' && onTransfers && (
          <button className="btn ghost wide" onClick={onTransfers}><IconTransfer /> Ouvrir le mercato · {(state.market || []).length + (state.transfers || []).length} joueurs</button>
        )}
        {key === 'terrain' && onTicketPolicy && <TicketPricing state={state} onChange={onTicketPolicy} />}
        {key === 'terrain' && onMatchDay && (
          <button className="btn ghost wide" onClick={onMatchDay}><IconStadium /> Voir le stade en jour de match</button>
        )}
      </>
    );
  }

  return (
    <aside ref={ref} className="inspector" role="dialog" aria-label={title}>
      <span className="grip" aria-hidden="true" />
      <header className="ins-head">
        <span className="ins-icon"><Icon /></span>
        <div className="panel-title">
          <Eyebrow>{sec.short || sec.name}{key === 'terrain' ? ` · ${PLOT_LABELS[sel.plotId]}` : ''}</Eyebrow>
          <h3>{title}</h3>
        </div>
        <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div className="ins-body">{body}</div>
      {foot && <footer className="ins-foot">{foot}</footer>}
    </aside>
  );
}
