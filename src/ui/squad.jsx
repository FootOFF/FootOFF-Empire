import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import {
  ATTRS, FAMILIES, GK_ATTRS, TRAITS, WEIGHTS, costOf, playerRating, potentialRange, ratingAt, saleValue, wageOf,
} from '../game/players';
import { sellPlayer } from '../game/engine';
import { endOfSeasonForecast, seasonForecast } from '../game/economy';
import { standingsOf } from '../game/season';
import { deName } from '../game/names';
import { bestSigning } from '../game/advice';
import { findOnMarket, pendingCounters, poolOf } from '../game/mercato';
import { slotsOf } from '../game/tactics';
import { fmtMoney, fmtRating } from './format';
import { IconChevron, IconChevronLeft, IconClose, IconRadar } from './icons';
import { Panel } from './panels';
import { Tabs } from './glass';
import { PlayerCareer, departureText, reasonTag } from './career';
import { LineupEditor } from './lineup';
import { careerOf } from '../game/career';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';
import { FollowButton, Mercato, Negotiation, SaleToggle, heat } from './mercato';

// Effectif : tableau d'analyste (PC) ou liste compacte (mobile), fiche joueur façon magazine FootOFF Media,
// comparateur radar. Les couleurs des cases disent si une valeur est forte ou faible pour ta division.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const FILTERS = [['all', 'Tous'], ['G', 'Gardiens'], ['D', 'Défense'], ['M', 'Milieu'], ['A', 'Attaque']];
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
const formAvg = (p) => (p.form?.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };
const onSale = (s, p) => (s.saleList || []).some((x) => x.id === p.id); // mis en vente au mercato

export function SquadView({ state, run, ask, onClose, onFinances, initialTab = 'players', preview = null, initialSheet = null }) {
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(preview?.sheet ? { id: preview.sheet } : initialSheet ? { id: initialSheet } : null); // { id, market, order }
  const [compare, setCompare] = useState(null); // { a, b } identifiants
  const [career, setCareer] = useState(null); // fiche carrière (joueur actuel ou ancien)
  const [deal, setDeal] = useState(null); // négociation en cours (identifiant du joueur visé)
  const ref = divRef(state);
  const squad = useMemo(
    () => [...state.players].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a)),
    [state.players],
  );
  const wages = squad.reduce((s, p) => s + wageOf(p, state.divisionIndex), 0);
  const forecast = seasonForecast(state, wages);
  const recommended = bestSigning(state)?.player.id;
  const todo = (state.offers || []).length + pendingCounters(state).length; // offres reçues et contre-propositions

  // Échap ferme d'abord la négociation, puis la carrière, le comparateur, la fiche, et enfin le panneau
  const onEscape = () => {
    if (deal !== null) setDeal(null);
    else if (career !== null) setCareer(null);
    else if (compare) setCompare(null);
    else if (sheet) setSheet(null);
    else onClose();
  };

  const shown = filter === 'all' ? squad : squad.filter((p) => p.pos === filter);
  const find = (id) => state.players.find((p) => p.id === id) || findOnMarket(state, id);

  // fin de saison prévue (après salaires et entretien), pour montrer l'effet d'une vente ou d'une recrue
  const position = standingsOf(state).findIndex((t) => t.i === 0) + 1;
  const endNow = endOfSeasonForecast(state, position, wages).end;
  const sell = (p) => {
    const fee = saleValue(p, state.divisionIndex);
    const wage = wageOf(p, state.divisionIndex);
    const endAfter = endNow + fee + wage;
    ask({
      title: `Vendre ${p.name} ?`,
      text: `${p.name} (${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, note ${fmtRating(playerRating(p))}) rejoindra un autre club, à sa valeur.${state.lineup?.includes(p.id) ? ' C’est un titulaire : ton onze sera recomposé.' : ''}${(state.saleList || []).some((x) => x.id === p.id) ? '' : ' Mis en vente, il pourrait recevoir des offres plus élevées après la prochaine journée.'}`,
      rows: [
        ['Montant de la vente', `+${fmtMoney(fee)}`, 'up'],
        ['Salaire économisé', `${fmtMoney(wage)} / saison`, 'up'],
        ['Fin de saison prévue', `${fmtMoney(endNow)} → ${fmtMoney(endAfter)}`, endAfter < 0 ? 'down' : ''],
      ],
      confirmLabel: `Vendre · ${fmtMoney(fee)}`,
      onConfirm: () => { setSheet(null); run((s) => sellPlayer(s, p.id), 'Effectif au minimum (11 joueurs).'); },
    });
  };
  // recrutement : toujours par une offre négociée (fenêtre de négociation, chances d'accord affichées)
  const offer = (p) => setDeal(p.id);
  // comparaison par défaut : la recrue face au titulaire le plus faible à son poste, un joueur du club face
  // au meilleur autre joueur de sa ligne
  const openCompare = (p) => {
    const mates = state.players.filter((q) => q.id !== p.id && q.pos === p.pos);
    let other;
    if (!state.players.includes(p)) {
      const starters = state.lineup.map((id, k) => (slotsOf(state.formation)[k] === p.pos ? find(id) : null)).filter(Boolean);
      other = starters.sort((a, b) => playerRating(a) - playerRating(b))[0] || mates[0];
    } else {
      other = mates.sort((a, b) => playerRating(b) - playerRating(a))[0] || poolOf(state).find((q) => q.pos === p.pos);
    }
    if (other) setCompare({ a: other.id, b: p.id });
  };

  useEffect(() => {
    if (preview?.compare && state.market[0]) openCompare(state.market[0]);
    if (preview?.deal) setDeal(preview.deal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetPlayer = sheet && find(sheet.id);
  const list = sheet?.order ? sheet.order.map(find).filter(Boolean) : sheet?.market ? poolOf(state) : squad;
  const dealPlayer = deal !== null ? find(deal) : null;
  const step = (d) => {
    const i = list.findIndex((p) => p.id === sheet.id);
    const next = list[(i + d + list.length) % list.length];
    if (next) setSheet({ ...sheet, id: next.id });
  };

  return (
    <Panel
      size="lg"
      title={tab === 'market' ? 'Mercato' : 'Effectif'}
      eyebrow={<>{squad.length}/{SQUAD_MAX} joueurs<span className="hide-sm"> · {DIVISIONS[state.divisionIndex].name}</span></>}
      money={state.money}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <>
        <div className="sq-budget">
          <div className="sq-budget-top"><span>Salaires</span><b className={forecast.net < 0 ? 'bad' : forecast.wageShare > 0.75 ? 'warn' : ''}>{Math.round(forecast.wageShare * 100)} % des revenus</b></div>
          <span className="sq-gauge"><i className={forecast.net < 0 ? 'bad' : forecast.wageShare > 0.75 ? 'warn' : ''} style={{ width: `${Math.min(100, forecast.wageShare * 100)}%` }} /></span>
          <span className="sq-budget-sub">{fmtMoney(wages)} par saison · revenus attendus {fmtMoney(forecast.income)}{onFinances && <> · <button className="linkbtn fin-link" onClick={onFinances}>finances</button></>}</span>
        </div>
        <Tabs
          items={[
            ['players', 'Joueurs'],
            ['lineup', <><span className="hide-sm">Composition</span><span className="show-sm">Compo</span></>],
            ['market', 'Mercato', todo ? <em className="sq-tab-count" aria-label={`${todo} à traiter`}>{todo}</em>
              : recommended ? <i className="sq-tab-dot" aria-label="recrue recommandée" /> : null],
            ['alumni', 'Anciens'],
          ]}
          value={tab}
          onChange={setTab}
        />
        </>
      )}
      overlay={(
        <>
          <Presence>{sheetPlayer && (
            <PlayerSheet
              p={sheetPlayer}
              place={`${list.findIndex((q) => q.id === sheetPlayer.id) + 1} / ${list.length}`}
              state={state}
              run={run}
              refLvl={ref}
              market={!state.players.some((q) => q.id === sheetPlayer.id)}
              onClose={() => setSheet(null)}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onCompare={() => openCompare(sheetPlayer)}
              onSell={() => sell(sheetPlayer)}
              onOffer={() => offer(sheetPlayer)}
              onCareer={() => setCareer(sheetPlayer.id)}
            />
          )}</Presence>
          <Presence>{compare && find(compare.a) && find(compare.b) && (
            <CompareView
              state={state}
              a={find(compare.a)}
              b={find(compare.b)}
              onPick={(id) => setCompare({ ...compare, a: id })}
              onClose={() => setCompare(null)}
              onOffer={offer}
            />
          )}</Presence>
          <Presence>{career !== null && <PlayerCareer state={state} id={career} onClose={() => setCareer(null)} onSheet={(pid) => { setCareer(null); setSheet({ id: pid }); }} />}</Presence>
          <Presence>{dealPlayer && (
            <Negotiation
              key={dealPlayer.id}
              state={state}
              p={dealPlayer}
              run={run}
              refLvl={ref}
              onClose={() => setDeal(null)}
              onSheet={(id) => { setDeal(null); setCompare(null); setSheet({ id }); }}
              onLineup={() => { setDeal(null); setCompare(null); setSheet(null); setTab('lineup'); }}
            />
          )}</Presence>
        </>
      )}
    >
        {tab === 'players' ? (
          <>
            <div className="chips">
              {FILTERS.map(([id, label]) => (
                <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
              ))}
              <span className="sq-legend"><i className="hi" /> fort pour la division <i className="low" /> faible</span>
            </div>
            <div className="sq-tables">
              {shown.some((p) => p.pos === 'G') && (
                <PlayerTable title="Gardiens" cols={GK_ATTRS} players={shown.filter((p) => p.pos === 'G')} state={state} refLvl={ref} onOpen={(p) => setSheet({ id: p.id })} />
              )}
              {shown.some((p) => p.pos !== 'G') && (
                <PlayerTable title="Joueurs de champ" cols={ATTRS} players={shown.filter((p) => p.pos !== 'G')} state={state} refLvl={ref} onOpen={(p) => setSheet({ id: p.id })} showPos />
              )}
            </div>
            <ul className="sq-list">
              {shown.map((p) => <PlayerRow key={p.id} p={p} state={state} refLvl={ref} onOpen={() => setSheet({ id: p.id })} />)}
            </ul>
          </>
        ) : tab === 'market' ? (
          <Mercato
            state={state}
            run={run}
            ask={ask}
            refLvl={ref}
            recommended={recommended}
            initialView={preview?.mercato || 'buy'}
            onOpen={(p, order) => setSheet({ id: p.id, market: true, order: (order || [p]).map((q) => q.id) })}
            onCompare={openCompare}
            onOffer={offer}
          />
        ) : tab === 'lineup' ? (
          <LineupEditor state={state} run={run} />
        ) : (
          <Alumni state={state} onOpen={setCareer} />
        )}
    </Panel>
  );
}

// --- Tableau d'analyste (PC) ------------------------------------------------------------------------

function PlayerTable({ title, cols, players, state, refLvl, onOpen, showPos }) {
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const value = (p, key) => {
    if (key === 'lvl') return playerRating(p);
    if (key === 'age') return p.age;
    if (key === 'form') return formAvg(p) ?? -1;
    if (key === 'wage') return wageOf(p, state.divisionIndex);
    return (p.pos === 'G' ? p.g : p.a)[key];
  };
  const rows = sort.key ? [...players].sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * sort.dir) : players;
  const th = (key, label, cls = '') => (
    <th key={key} className={`${cls} ${sort.key === key ? 'sorted' : ''}`} onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : -1 })} title="Trier">
      {label}{sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
    </th>
  );
  return (
    <div className="sq-table-wrap">
      <div className="sq-table-title">{title}</div>
      <table className="sq-table">
        <thead>
          <tr>
            <th className="c-name">Joueur</th>
            {showPos && <th>Poste</th>}
            {th('age', 'Âge')}
            {th('lvl', 'Niveau', 'c-lvl')}
            {cols.map((c) => th(c.key, c.short))}
            {th('form', 'Forme')}
            {th('wage', 'Salaire', 'c-wage')}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const starter = state.lineup?.includes(p.id);
            const f = formAvg(p);
            return (
              <tr key={p.id} onClick={() => onOpen(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}>
                <td className="c-name">
                  <span className="sq-num">{p.num ?? '–'}</span>
                  <span className="sq-name">{p.name}</span>
                  {starter && <i className="sq-starter" title="Titulaire" />}
                  {onSale(state, p) && <em className="sq-sale">En vente</em>}
                  {p.traits?.length > 0 && <span className="sq-traits">{p.traits.map((t) => TRAITS[t]?.name).join(' · ')}</span>}
                </td>
                {showPos && <td><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>}
                <td>{p.age}</td>
                <td className={`c-lvl ${heat(playerRating(p), refLvl)}`}>{fmtRating(playerRating(p))}</td>
                {cols.map((c) => {
                  const v = (p.pos === 'G' ? p.g : p.a)[c.key];
                  return <td key={c.key} className={`c-attr ${heat(v, refLvl)}`}>{Math.round(v)}</td>;
                })}
                <td className="c-form">{f === null ? '–' : fmtRating(f)}</td>
                <td className="c-wage">{fmtMoney(wageOf(p, state.divisionIndex))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Liste compacte (mobile) ---------------------------------------------------------------------------

function PlayerRow({ p, state, refLvl, onOpen, extra }) {
  const f = formAvg(p);
  const r = playerRating(p);
  return (
    <li>
      <button className="sq-row" onClick={onOpen}>
        <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
        <span className="sq-row-main">
          <span className="sq-row-name">{p.num ? <em>{p.num}</em> : null}{p.name}{state.lineup?.includes(p.id) && <i className="sq-starter" title="Titulaire" />}{onSale(state, p) && <em className="sq-sale">En vente</em>}</span>
          <span className="sq-row-meta">
            {p.age} ans · {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}>{a.short} {Math.round(a.v)}</span>)}
          </span>
        </span>
        <span className="sq-row-side">
          <b className={heat(r, refLvl)}>{fmtRating(r)}</b>
          {extra ? <span>{extra}</span> : f === null ? <span>pas encore joué</span> : (
            <span className="sq-row-form">forme <i className={f >= 7.5 ? 'good' : f < 5.5 ? 'low' : ''}>{fmtRating(f)}</i></span>
          )}
        </span>
      </button>
    </li>
  );
}

// --- Anciens joueurs : ceux qui sont partis (vendus, retraités), pour retrouver leur carrière ---------------------

function Alumni({ state, onOpen }) {
  const list = [...(state.alumni || [])].reverse();
  if (!list.length) {
    return <p className="sq-hint">Aucun ancien pour l’instant. Les joueurs vendus ou partis à la retraite apparaîtront ici, avec toute leur carrière au club.</p>;
  }
  return (
    <>
      <p className="sq-hint">{list.length} {list.length > 1 ? 'anciens joueurs' : 'ancien joueur'}. Touche un nom pour revoir sa carrière au club.</p>
      <ul className="sq-list al-list">
        {list.map((a) => {
          const c = careerOf(state, a.id);
          if (!c) return null;
          return (
            <li key={a.id}>
              <button className="sq-row" onClick={() => onOpen(a.id)}>
                <span className={`pos-pill ${a.pos}`}>{a.pos}</span>
                <span className="sq-row-main">
                  <span className="sq-row-name">{a.name}<em className={`al-tag ${a.reason}`}>{reasonTag(c)}</em></span>
                  <span className="sq-row-meta">{departureText(c)}</span>
                  <span className="sq-row-meta">{plural(c.totals.apps, 'match', 'matchs')} · {plural(c.totals.goals, 'but', 'buts')} · {plural(c.totals.assists, 'passe', 'passes')} · homme du match {c.totals.motm} fois · {c.age} ans aujourd’hui</span>
                </span>
                <span className="sq-row-side"><b>{fmtRating(a.rating)}</b><span>au départ</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// --- Fiche joueur (magazine FootOFF Media) ---------------------------------------------------------------

function PlayerSheet({ p, state, run, refLvl, market, place, onClose, onPrev, onNext, onCompare, onSell, onOffer, onCareer }) {
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const f = formAvg(p);
  const st = p.season || {};
  const fams = p.pos === 'G' ? ['gk'] : ['tech', 'phys', 'tac'];
  const all = attrsOf(p);
  const keys = new Set(Object.entries(WEIGHTS[p.pos]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));
  const fee = costOf(p, state);
  const value = saleValue(p, state.divisionIndex);
  const prev = p.hist?.length ? p.hist[p.hist.length - 1] : null;
  const role = market ? (p.club ? `${p.club} · contrat ${p.contract} an${p.contract > 1 ? 's' : ''}` : 'Joueur libre') : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant';
  const listed = !market && (state.saleList || []).some((x) => x.id === p.id);
  const talks = (market && p.talks) || {};
  const avg = st.apps ? st.sum / st.apps : null;
  const plural = (n, one, many) => (n > 1 ? many : one);

  // changement de joueur : la fiche remonte en haut et le nouveau joueur arrive du côté du geste
  const ref = useRef(null);
  const dir = useRef(0);
  const shown = useRef(p.id);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown.current === p.id) return;
    shown.current = p.id;
    el.scrollTop = 0;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate([{ opacity: 0, transform: `translateX(${dir.current * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }, [p.id]);
  const goPrev = () => { dir.current = -1; onPrev(); };
  const goNext = () => { dir.current = 1; onNext(); };
  useSwipe(ref, { onDown: onClose, onLeft: goNext, onRight: goPrev, downMedia: PHONE });

  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass" onClick={(e) => e.stopPropagation()} aria-label={`Fiche ${deName(p.name)}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={goPrev} aria-label="Joueur précédent"><IconChevronLeft /></button>
            <span>{place}</span>
            <button className="hud-icon" onClick={goNext} aria-label="Joueur suivant"><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la fiche"><IconClose /></button>
        </header>

        <section className="sh-hero">
          <div className="sh-id">
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{p.num ? `N°${p.num} · ` : ''}{p.age} ans · pied {p.foot}</span>
            </div>
            <h3>{p.name}</h3>
            <div className="sh-tags">
              <span className={`sh-tag ${role === 'Titulaire' ? 'on' : ''}`}>{role}</span>
              {listed && <span className="sh-tag sale">En vente</span>}
              {market && p.interest > 0 && <span className="sh-tag warn">Courtisé{p.interest > 1 ? ` par ${p.interest} clubs` : ''}</span>}
              {p.alt && <span className="sh-tag">Dépanne : {POS_LABELS[p.alt].toLowerCase()} {fmtRating(ratingAt(p, p.alt))}</span>}
            </div>
          </div>
          <div className={`sh-level ${heat(r, refLvl)}`}>
            <b>{fmtRating(r)}</b>
            <span>niveau / 20</span>
          </div>
        </section>

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Niveau et potentiel</span>
            <span className="sh-pot">{pot ? <>potentiel <b>{fmtRating(pot[0])} – {fmtRating(pot[1])}</b></> : 'plafond atteint'}</span>
          </div>
          <div className="sh-scale" aria-hidden="true">
            <i className="now" style={{ width: `${(r / 20) * 100}%` }} />
            {pot && <i className="pot" style={{ left: `${(pot[0] / 20) * 100}%`, width: `${((pot[1] - pot[0]) / 20) * 100}%` }} />}
          </div>
          <div className="sh-ticks" aria-hidden="true"><span>0</span><span>10</span><span>20</span></div>
        </section>

        {!market && (
          <section className="sh-sec">
            <span className="sh-cap">Saison {state.seasonNumber}</span>
            <div className="sh-stats">
              <div><b>{st.apps || 0}</b><span>{plural(st.apps || 0, 'match', 'matchs')}</span></div>
              <div><b>{st.goals || 0}</b><span>{plural(st.goals || 0, 'but', 'buts')}</span></div>
              <div><b>{st.assists || 0}</b><span>{plural(st.assists || 0, 'passe', 'passes')}</span></div>
              <div><b>{(st.yellow || 0) + (st.red || 0)}</b><span>{plural((st.yellow || 0) + (st.red || 0), 'carton', 'cartons')}</span></div>
              <div><b className={avg >= 7 ? 'good' : avg !== null && avg < 5.5 ? 'low' : ''}>{avg !== null ? fmtRating(avg) : '–'}</b><span>note</span></div>
              <div className="sh-wrap"><b className={st.motm ? 'gold' : ''}>{st.motm || 0}</b><span>homme du match</span></div>
            </div>
            <button className="btn ghost wide sh-career" onClick={onCareer}>Toute sa carrière au club</button>
            {(p.lastDelta !== undefined || prev) && (
              <p className="sh-evo">
                {p.lastDelta !== undefined && <>Dernier été <b className={p.lastDelta > 0 ? 'up' : p.lastDelta < 0 ? 'down' : ''}>{p.lastDelta > 0 ? '+' : ''}{fmtRating(p.lastDelta)}</b></>}
                {p.lastDelta !== undefined && prev && ' · '}
                {prev && <>saison {prev.season} : {prev.apps} {plural(prev.apps, 'match', 'matchs')}, {prev.goals} {plural(prev.goals, 'but', 'buts')}{prev.avg ? `, note ${fmtRating(prev.avg)}` : ''}</>}
              </p>
            )}
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Forme · notes de match sur 10</span>
            {f !== null && <span className="sh-pot">moyenne <b>{fmtRating(f)}</b></span>}
          </div>
          {p.form?.length ? (
            <div className="sh-form">
              {p.form.map((v, i) => <span key={i} className={v >= 7.5 ? 'good' : v < 5.5 ? 'low' : ''}>{fmtRating(v)}</span>)}
            </div>
          ) : <p className="sh-empty">Pas encore joué{market ? ' pour le club' : ' cette saison'}.</p>}
        </section>

        {p.traits?.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">{plural(p.traits.length, 'Signe distinctif', 'Signes distinctifs')}</span>
            <ul className="sh-traits">
              {p.traits.map((t) => <li key={t}><b>{TRAITS[t].name}</b><span>{TRAITS[t].desc}</span></li>)}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Attributs</span>
            <span className="sh-legend"><i className="key" /> clés au poste · <em>or</em> : fort pour ta division</span>
          </div>
          {fams.map((fam) => (
            <div className="sh-fam" key={fam}>
              {fams.length > 1 && <span className="sh-famname">{FAMILIES[fam]}</span>}
              {all.filter((a) => a.fam === fam).map((a) => (
                <div className={`sh-attr ${keys.has(a.key) ? 'key' : ''}`} key={a.key}>
                  <span>{a.name}</span>
                  <span className="sh-track"><i className={heat(a.v, refLvl)} style={{ width: `${(a.v / 20) * 100}%` }} /></span>
                  <b className={heat(a.v, refLvl)}>{Math.round(a.v)}</b>
                </div>
              ))}
            </div>
          ))}
        </section>

        <footer className={`sh-foot ${market ? 'market' : 'own'}`}>
          {market ? (
            <span>{p.club ? 'Indemnité' : 'Prime'} <b>{fmtMoney(fee)}</b> · salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b></span>
          ) : (
            <span>Salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b> par saison · valeur <b>{fmtMoney(value)}</b></span>
          )}
          <div className="sh-actions">
            {market && <FollowButton state={state} p={p} run={run} />}
            <button className="sh-compare" onClick={onCompare} aria-label="Comparer" title="Comparer"><IconRadar /></button>
            {market ? (
              <button
                className="btn"
                disabled={(state.players.length >= SQUAD_MAX || talks.closed) && !talks.counter}
                onClick={onOffer}
                title={state.players.length >= SQUAD_MAX ? 'Effectif complet' : ''}
              >
                {talks.counter ? 'Contre-offre' : talks.closed ? 'Discussions closes' : 'Faire une offre'}
              </button>
            ) : (
              <>
                <SaleToggle state={state} p={p} run={run} />
                <button className="btn ghost" disabled={state.players.length <= SQUAD_MIN} onClick={onSell} title="Vente immédiate, à sa valeur">Vendre · {fmtMoney(value)}</button>
              </>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}

// --- Comparateur radar ----------------------------------------------------------------------------------

// Radar à l'échelle des joueurs comparés (pas toujours sur 20 : des joueurs à 6–9 rempliraient à peine le centre).
function Radar({ a, b, axes }) {
  const cx = 150, cy = 128, R = 92, n = axes.length;
  const max = Math.min(20, Math.max(10, Math.ceil((Math.max(...a, ...b) + 1) / 5) * 5));
  const pt = (i, r) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; };
  const poly = (vals) => vals.map((v, i) => pt(i, (R * Math.min(v, max)) / max).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 300 262" role="img" aria-label={`Comparaison des caractéristiques, échelle de 0 à ${max}`}>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={axes.map((_, i) => pt(i, R * k).join(',')).join(' ')} className="radar-grid" />)}
      {axes.map((ax, i) => { const [x, y] = pt(i, R); return <line key={ax.key} x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />; })}
      <polygon points={poly(a)} className="radar-a" />
      <polygon points={poly(b)} className="radar-b" />
      {axes.map((ax, i) => { const [x, y] = pt(i, R + 16); return <text key={ax.key} x={x} y={y + 4} textAnchor="middle" className="radar-label">{ax.short}</text>; })}
      <text x={cx + 4} y={cy - R + 12} className="radar-scale">{max}</text>
    </svg>
  );
}

// Choix du joueur comparé : liste du jeu (effectif puis joueurs libres), triée par niveau au poste comparé.
function ComparePicker({ state, a, b, onPick, onClose }) {
  const gk = b.pos === 'G';
  const rows = (list) => list
    .filter((p) => p.id !== b.id && (p.pos === 'G') === gk)
    .sort((x, y) => ratingAt(y, b.pos) - ratingAt(x, b.pos));
  const groups = [['Ton effectif', rows(state.players)], ['Mercato', rows(poolOf(state))]].filter(([, l]) => l.length);
  return (
    <div className="cmp-list" role="listbox" aria-label="Joueur à comparer">
      <div className="cmp-list-head">
        <span className="sh-cap">Comparer {b.name.split(' ').slice(-1)[0]} avec…</span>
        <button className="linkbtn" onClick={onClose}>Fermer</button>
      </div>
      {groups.map(([title, list]) => (
        <section key={title} className="cmp-list-sec">
          <span className="eyebrow muted-eyebrow">{title}</span>
          {list.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === a.id} className={`cmp-opt ${p.id === a.id ? 'on' : ''}`} onClick={() => { onPick(p.id); onClose(); }}>
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span className="cmp-opt-name">{p.name}<em>{p.age} ans{state.lineup?.includes(p.id) ? ' · titulaire' : ''}</em></span>
              <b>{fmtRating(ratingAt(p, b.pos))}</b>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function CompareView({ state, a, b, onPick, onClose, onOffer }) {
  const gk = b.pos === 'G';
  const axes = gk ? GK_ATTRS : ATTRS;
  const vals = (p) => axes.map((x) => (gk ? p.g?.[x.key] ?? 1 : p.a[x.key]));
  const va = vals(a);
  const vb = vals(b);
  const isMarket = !state.players.includes(b);
  const fee = costOf(b, state);
  const roleOf = (p) => (p.club ? p.club : state.market.includes(p) ? 'Joueur libre' : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant');
  const la = ratingAt(a, b.pos);
  const lb = ratingAt(b, b.pos);
  const ref = useRef(null);
  const [picking, setPicking] = useState(false);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  return (
    <div className="sq-overlay center" onClick={onClose}>
      <div ref={ref} className="sq-compare glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comparaison">
        <span className="grip" aria-hidden="true" />
        <header className="cmp-head">
          <div>
            <h3>Comparaison</h3>
            <span>Au poste {/^[aeiouyéh]/i.test(POS_LABELS[b.pos]) ? 'd’' : 'de '}{POS_LABELS[b.pos].toLowerCase()}</span>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la comparaison"><IconClose /></button>
        </header>

        <div className="cmp-vs">
          <div className="cmp-side a">
            <span className="cmp-role"><i />{roleOf(a)}</span>
            <button className={`cmp-pick ${picking ? 'open' : ''}`} onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={`Joueur comparé : ${a.name}. Changer`}>
              <span className="cmp-name">{a.name}</span>
              <IconChevron />
            </button>
            <b className={la > lb ? 'lead' : ''}>{fmtRating(la)}</b>
          </div>
          <span className="cmp-x">contre</span>
          <div className="cmp-side b">
            <span className="cmp-role"><i />{roleOf(b)}</span>
            <span className="cmp-name">{b.name}</span>
            <b className={lb >= la ? 'lead' : ''}>{fmtRating(lb)}</b>
          </div>
        </div>

        {picking ? <ComparePicker state={state} a={a} b={b} onPick={onPick} onClose={() => setPicking(false)} /> : <>
        <Radar a={va} b={vb} axes={axes} />

        <section className="cmp-sec">
          <span className="sh-cap">Écart {deName(b.name.split(' ').slice(-1)[0])} par rapport à {a.name.split(' ').slice(-1)[0]}</span>
          <ul className="cmp-deltas">
            {axes.map((x, i) => {
              const d = Math.round(vb[i]) - Math.round(va[i]);
              return <li key={x.key} className={d > 0 ? 'up' : d < 0 ? 'down' : ''}><span>{x.name}</span><b>{d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d)}</b></li>;
            })}
          </ul>
        </section>
        </>}

        {isMarket && (
          <footer className="cmp-foot">
            <span>{b.club ? 'Indemnité' : 'Prime'} <b>{fmtMoney(fee)}</b> · salaire <b>{fmtMoney(wageOf(b, state.divisionIndex))}</b></span>
            <button className="btn" disabled={state.players.length >= SQUAD_MAX || (b.talks?.closed && !b.talks?.counter)} onClick={() => onOffer(b)}>{b.talks?.counter ? 'Contre-offre' : 'Faire une offre'}</button>
          </footer>
        )}
      </div>
    </div>
  );
}
