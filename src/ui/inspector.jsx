import React, { useEffect, useRef, useState } from 'react';
import { BUILDINGS, YOUTH_PLACES, upgradeCost } from '../game/constants';
import { PLOTS, PLOT_LABELS, SECTORS, allowedBuildingsFor, plotBuilding } from '../game/map';
import { fmtMoney, fmtNum } from './format';
import { BUILDING_KIND, TICKET_ORDER, TICKET_POLICIES, buildingStats, expectedGate } from '../game/economy';
import { Tabs } from './glass';
import { recommendedBuilding } from '../game/advice';
import {
  IconAcademy, IconArrowUp, IconChevron, IconChevronLeft, IconClose, IconCrane, IconExpand, IconEye, IconFans, IconSponsor, IconStadium,
  IconTraining, IconTransfer, IconDirection,
} from './icons';
import { Eyebrow } from './kit';
import { Presence, useKeydown } from './presence';
import { PHONE, useMedia, useSwipe } from './gestures';
import { usePanelSound } from './panels';
import { uiSound } from './uisound';
import { haptic } from './haptics';
import { BuildCard, BuildWindow, HoldButton, Payoff, StatRows, imgOf, spendHint } from './build';

const ICONS = { terrain: IconStadium, training: IconTraining, academy: IconAcademy, fans: IconFans, sponsor: IconSponsor, transfers: IconTransfer, direction: IconDirection };
const KINDS = ['Sport', 'Revenus', 'Mercato'];

// Tarifs des billets : le joueur voit tout de suite le public et les recettes attendus à chaque match.
export function TicketPricing({ state, onChange }) {
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

// Coque commune : même famille que les panneaux (en-tête, corps qui défile, action en bas), en carte à gauche sur
// PC et en feuille basse sur téléphone (on la ferme en la glissant vers le bas).
function Shell({ eyebrow, title, Icon, nav = null, onClose, foot = null, className = '', children }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose });
  return (
    <aside ref={ref} className={`inspector ${className}`} role="dialog" aria-label={title}>
      <span className="grip" aria-hidden="true" />
      <header className="ins-head">
        <span className="ins-icon"><Icon /></span>
        <div className="panel-title">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3>{title}</h3>
        </div>
        {nav}
        <button type="button" className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div className="ins-body">{children}</div>
      {foot && <footer className="ins-foot">{foot}</footer>}
    </aside>
  );
}

// Parcelles libres (hors stade), dans l'ordre du plan : le sélecteur ‹ › de la vitrine passe de l'une à l'autre.
export const freePlotsOf = (s) => PLOTS.filter((p) => !p.building && !plotBuilding(s, p.id)).map((p) => p.id);

// Parcelle libre : la vitrine. Toutes les cartes d'un coup d'œil (rien à faire défiler), la recommandée du staff
// choisie d'emblée ; le bâtiment choisi apparaît en hologramme doré sur la parcelle. Sur PC, la fenêtre d'aperçu
// (à droite) détaille les niveaux et porte l'action ; sur téléphone, le détail tient sous les vignettes et la
// fenêtre s'ouvre en grand à la demande.
function FreePlot({ state, sel, onClose, onBuild, onPreview, onSwitchPlot }) {
  const phone = useMedia(PHONE);
  const options = allowedBuildingsFor(state);
  const rec = recommendedBuilding(state);
  const [pick, setPick] = useState(() => (options.includes(sel.pick) ? sel.pick : rec));
  const [filter, setFilter] = useState('all');
  const [shown, setShown] = useState(1);
  const [win, setWin] = useState(!!sel.window); // téléphone : fenêtre d'aperçu ouverte en grand
  const gridRef = useRef(null);
  const k = options.includes(pick) ? pick : options[0] || null;
  const kinds = KINDS.filter((x) => options.some((o) => BUILDING_KIND[o] === x));
  // filtres sur PC, dès quatre bâtiments de familles différentes ; sur téléphone toutes les vignettes tiennent sur
  // une rangée, sans filtre
  const filters = !phone && kinds.length > 1 && options.length >= 4;
  const list = !filters || filter === 'all' ? options : options.filter((o) => BUILDING_KIND[o] === filter);
  const windowShown = !!k && (!phone || win);

  useEffect(() => {
    onPreview(k ? { plotId: sel.plotId, key: k, lvl: shown, holo: true, window: windowShown } : null);
  }, [sel.plotId, k, shown, windowShown]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o, e) => {
    if (o === k && e?.detail === 0) { // clavier ou manette : valider la carte déjà choisie lance la construction
      if (state.money >= upgradeCost(o, 1)) onBuild(sel.plotId, o);
      return;
    }
    if (o === k) return;
    setPick(o);
    setShown(1);
    uiSound('tab');
    haptic('tap');
  };
  const focusCard = (o) => gridRef.current?.querySelector(`[data-key="${o}"]`)?.focus();

  // Clavier et manette : flèches dans la vitrine (et vers le bouton d'achat), dans la rangée des niveaux ; Échap.
  useKeydown((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (phone && win) setWin(false); else onClose();
      return;
    }
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !k) return;
    const at = document.activeElement;
    const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 };
    if (!(e.key in arrows)) return;
    if (at?.closest?.('.lvstrip')) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const l = Math.max(1, Math.min(BUILDINGS[k].max, shown + arrows[e.key]));
      setShown(l);
      requestAnimationFrame(() => document.querySelector(`.lvstrip .lv:nth-child(${l})`)?.focus());
      return;
    }
    if (at?.closest?.('.bw-foot, .ins-foot')) {
      if (e.key === 'ArrowUp') { e.preventDefault(); focusCard(k); }
      return;
    }
    if (at && at !== document.body && !at.closest?.('.bgrid')) return;
    e.preventDefault();
    const cols = phone ? list.length : 2;
    const step = Math.abs(arrows[e.key]) === 2 ? Math.sign(arrows[e.key]) * cols : arrows[e.key];
    const i = Math.max(0, list.indexOf(k));
    const j = i + step;
    if (j > list.length - 1 && e.key === 'ArrowDown') { document.querySelector('.bw-foot .hold, .ins-foot .hold')?.focus(); return; }
    const o = list[Math.max(0, Math.min(list.length - 1, j))];
    if (o) { choose(o); focusCard(o); }
  });

  const plots = freePlotsOf(state);
  const pi = plots.indexOf(sel.plotId);
  const nav = plots.length > 1 && pi !== -1 ? (
    <div className="ins-nav">
      <button type="button" className="hud-icon" onClick={() => onSwitchPlot(plots[(pi - 1 + plots.length) % plots.length])} aria-label="Parcelle libre précédente" title="Parcelle libre précédente"><IconChevronLeft /></button>
      <button type="button" className="hud-icon" onClick={() => onSwitchPlot(plots[(pi + 1) % plots.length])} aria-label="Parcelle libre suivante" title="Parcelle libre suivante"><IconChevron /></button>
    </div>
  ) : null;

  if (!k) {
    return (
      <Shell eyebrow={`${PLOT_LABELS[sel.plotId]} · libre`} title="Parcelle libre" Icon={IconCrane} onClose={onClose}>
        <p className="ins-text">Tous les bâtiments sont déjà construits : cette parcelle reste libre.</p>
      </Shell>
    );
  }

  const cost = upgradeCost(k, 1);
  const hint = spendHint(state, cost);
  const hero = buildingStats(k, 1, state)[0];
  const doBuild = () => onBuild(sel.plotId, k);
  return (
    <>
      <Shell
        className="shop"
        eyebrow={PLOT_LABELS[sel.plotId]}
        title="Construire"
        Icon={IconCrane}
        nav={nav}
        onClose={onClose}
        foot={phone ? (
          <>
            <HoldButton k={k} onConfirm={doBuild} disabled={state.money < cost}>Construire · {fmtMoney(cost)}</HoldButton>
            <span className={`ins-hint ${hint.tone}`}>{hint.text}</span>
          </>
        ) : null}
      >
        {filters && (
          <Tabs
            className="segmented bfilter"
            role="radiogroup"
            label="Filtrer les bâtiments"
            items={[['all', 'Tout'], ...kinds.map((x) => [x, x])]}
            value={filter}
            onChange={(f) => {
              setFilter(f);
              const l = f === 'all' ? options : options.filter((o) => BUILDING_KIND[o] === f);
              if (!l.includes(k)) { setPick(l[0]); setShown(1); }
            }}
          />
        )}
        <div ref={gridRef} className="bgrid" style={{ '--count': list.length }}>
          {list.map((o) => <BuildCard key={o} state={state} k={o} picked={o === k} recommended={o === rec} onPick={choose} />)}
        </div>
        {phone && (
          <div className="bdetail">
            <div className="bdetail-head">
              <div className="panel-title">
                <Eyebrow>{BUILDING_KIND[k]}{k === rec ? ' · Conseillé' : ''}</Eyebrow>
                <strong>{BUILDINGS[k].name}</strong>
              </div>
              <button type="button" className="btn ghost btn-sm" onClick={() => setWin(true)}><IconExpand /> Aperçu</button>
            </div>
            <p className="bdetail-hero">{hero.label} : <b>{hero.value}</b>{hero.sub ? ` ${hero.sub}` : ''}</p>
            <Payoff state={state} k={k} target={1} compact />
          </div>
        )}
      </Shell>
      <Presence>
        {windowShown && (
          <BuildWindow
            state={state}
            k={k}
            current={0}
            shown={shown}
            onShow={setShown}
            onAction={doBuild}
            recommended={k === rec}
            onClose={phone ? () => setWin(false) : null}
          />
        )}
      </Presence>
    </>
  );
}

// Parcelle bâtie : le bâtiment tel qu'il est (vignette du niveau atteint), le niveau suivant chiffré avant / après,
// l'amélioration sous le pouce. « Aperçu des niveaux » ouvre la fenêtre d'aperçu : sur PC, le niveau montré s'y
// dessine en hologramme à la place du bâtiment.
function BuiltPlot({ state, sel, k, fresh, onClose, onUpgrade, onMatchDay, onTransfers, onAcademy, onTraining, onDirection, onTicketPolicy, onPreview }) {
  const phone = useMedia(PHONE);
  const sec = SECTORS.find((s) => s.id === sel.sector) || SECTORS[0];
  const b = BUILDINGS[k];
  const lvl = state.buildings[k];
  const maxed = lvl >= b.max;
  const [win, setWin] = useState(!!sel.window && !maxed);
  const [shown, setShown] = useState(Math.min(b.max, lvl + 1));
  const seen = useRef({ k, lvl });
  useEffect(() => { // amélioration faite (ou autre bâtiment) : on regarde le chantier, l'aperçu repart du niveau suivant
    if (seen.current.k === k && seen.current.lvl === lvl) return;
    seen.current = { k, lvl };
    setShown(Math.min(b.max, lvl + 1));
    setWin(false);
  }, [k, lvl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const holo = win && !phone && shown !== lvl;
    onPreview(win ? { plotId: sel.plotId, key: k, lvl: shown, holo, window: true } : null);
  }, [sel.plotId, k, shown, win, phone, lvl]); // eslint-disable-line react-hooks/exhaustive-deps
  useKeydown((e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (win) setWin(false); else onClose();
  });

  const cost = maxed ? 0 : upgradeCost(k, lvl + 1);
  const hint = maxed ? null : spendHint(state, cost);
  const gate = k === 'terrain' ? expectedGate(state, null) : null;
  const side = win && !phone; // PC, fenêtre d'aperçu ouverte : c'est elle qui porte l'action
  return (
    <>
      <Shell
        eyebrow={`${sec.short || sec.name}${k === 'terrain' ? ` · ${PLOT_LABELS[sel.plotId]}` : ''}`}
        title={b.name}
        Icon={ICONS[k]}
        onClose={onClose}
        foot={maxed || side ? null : (
          <>
            <HoldButton k={k} onConfirm={() => onUpgrade(k)} disabled={state.money < cost}><IconArrowUp /> Améliorer · {fmtMoney(cost)}</HoldButton>
            <span className={`ins-hint ${hint.tone}`}>{hint.text}</span>
          </>
        )}
      >
        <button type="button" className={`ins-shot ${fresh ? 'fresh' : ''}`} onClick={() => !maxed && setWin(true)} disabled={maxed} aria-label={maxed ? b.name : 'Aperçu des niveaux'}>
          <img src={imgOf(k, lvl)} alt="" draggable="false" />
          <span className="ins-shot-lvl">Niveau {lvl}<i> / {b.max}</i><Pips lvl={lvl} max={b.max} /></span>
          {fresh && <span className="ins-shot-ribbon">{lvl === 1 ? 'Chantier lancé' : `Niveau ${lvl} en chantier`}</span>}
        </button>
        {!maxed ? (
          <div className="ins-effect next">
            <Eyebrow>Niveau {lvl + 1} · avant / après</Eyebrow>
            <StatRows state={state} k={k} lvl={lvl + 1} base={lvl} />
            <Payoff state={state} k={k} target={lvl + 1} />
          </div>
        ) : (
          <>
            <div className="ins-effect">
              <Eyebrow muted>Actuellement</Eyebrow>
              <StatRows state={state} k={k} lvl={lvl} />
            </div>
            <div className="ins-max">Niveau maximum atteint</div>
          </>
        )}
        {gate && (
          <p className={`ins-demand ${gate.demand > gate.capacity ? 'full' : ''}`}>
            Public potentiel : {fmtNum(gate.demand)} spectateurs par match
            {gate.demand > gate.capacity ? ' · stade trop petit, des supporters restent dehors.' : ` · ${Math.round((gate.demand / gate.capacity) * 100)} % de remplissage.`}
          </p>
        )}
        {!maxed && !side && <button type="button" className="btn ghost wide" onClick={() => setWin(true)}><IconEye /> Aperçu des niveaux</button>}
        {k === 'transfers' && onTransfers && (
          <button type="button" className="btn ghost wide" onClick={onTransfers}><IconTransfer /> Ouvrir le mercato · {(state.market || []).length + (state.transfers || []).length} joueurs</button>
        )}
        {k === 'academy' && onAcademy && (
          <button type="button" className="btn ghost wide" onClick={onAcademy}><IconAcademy /> Ouvrir l’académie · {(state.youth || []).length} / {YOUTH_PLACES} jeunes</button>
        )}
        {k === 'training' && onTraining && (
          <button type="button" className="btn ghost wide" onClick={onTraining}><IconTraining /> Séance d’entraînement</button>
        )}
        {k === 'direction' && onDirection && (
          <button type="button" className="btn ghost wide" onClick={onDirection}><IconDirection /> Ouvrir la Direction du club</button>
        )}
        {k === 'terrain' && onTicketPolicy && <TicketPricing state={state} onChange={onTicketPolicy} />}
        {k === 'terrain' && onMatchDay && (
          <button type="button" className="btn ghost wide" onClick={onMatchDay}><IconStadium /> Voir le stade en jour de match</button>
        )}
      </Shell>
      <Presence>
        {win && (
          <BuildWindow
            state={state}
            k={k}
            current={lvl}
            shown={shown}
            onShow={setShown}
            onAction={() => onUpgrade(k)}
            onClose={() => setWin(false)}
          />
        )}
      </Presence>
    </>
  );
}

// Fiche d'une parcelle, ouverte au clic dans la vue 3D (ou par le bouton Construire du HUD).
// onPreview : ce que la scène doit montrer (hologramme du bâtiment et du niveau choisis, fenêtre d'aperçu ouverte).
export default function PlotInspector({ state, sel, onClose, onBuild, onUpgrade, onMatchDay, onTransfers, onAcademy, onTraining, onDirection, onTicketPolicy, onPreview = () => {}, onSwitchPlot = () => {} }) {
  usePanelSound();
  const k = plotBuilding(state, sel.plotId);
  const lvl = k ? state.buildings[k] : 0;
  // chantier tout juste lancé (construction ou amélioration) : la vignette le fête un instant
  const [fresh, setFresh] = useState(false);
  const last = useRef(null);
  useEffect(() => {
    const l = last.current;
    last.current = { plotId: sel.plotId, k, lvl };
    if (!(l && l.plotId === sel.plotId && k && (l.k !== k || l.lvl < lvl))) { setFresh(false); return undefined; }
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 2600);
    return () => clearTimeout(t);
  }, [sel.plotId, k, lvl]);

  return k ? (
    <BuiltPlot
      state={state}
      sel={sel}
      k={k}
      fresh={fresh}
      onClose={onClose}
      onUpgrade={onUpgrade}
      onMatchDay={onMatchDay}
      onTransfers={onTransfers}
      onAcademy={onAcademy}
      onTraining={onTraining}
      onDirection={onDirection}
      onTicketPolicy={onTicketPolicy}
      onPreview={onPreview}
    />
  ) : (
    <FreePlot state={state} sel={sel} onClose={onClose} onBuild={onBuild} onPreview={onPreview} onSwitchPlot={onSwitchPlot} />
  );
}
