import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import {
  ATTRS, FAMILIES, GK_ATTRS, TRAITS, WEIGHTS, playerRating, potentialRange, ratingAt, saleValue, signingFee, wageOf,
} from '../game/players';
import { sellPlayer, signPlayer } from '../game/engine';
import { endOfSeasonForecast, seasonForecast } from '../game/economy';
import { standingsOf } from '../game/season';
import { bestSigning } from '../game/advice';
import { SLOTS } from '../game/tactics';
import { fmtMoney, fmtRating } from './format';
import { IconChevron, IconChevronLeft, IconClose, IconRadar } from './icons';
import { Panel } from './panels';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';

// Effectif : tableau d'analyste (PC) ou liste compacte (mobile), fiche joueur façon magazine FootOFF Media,
// comparateur radar. Les couleurs des cases disent si une valeur est forte ou faible pour ta division.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const FILTERS = [['all', 'Tous'], ['G', 'Gardiens'], ['D', 'Défense'], ['M', 'Milieu'], ['A', 'Attaque']];
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
const formAvg = (p) => (p.form?.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };

// force d'une valeur par rapport au niveau moyen de la division
function heat(v, ref) {
  if (v >= ref + 3) return 'hi';
  if (v >= ref + 1) return 'good';
  if (v <= ref - 2) return 'low';
  return '';
}

export function SquadView({ state, run, ask, onClose, onFinances, initialTab = 'players', preview = null }) {
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(preview?.sheet ? { id: preview.sheet } : null); // { id, market }
  const [compare, setCompare] = useState(null); // { a, b } identifiants
  const ref = divRef(state);
  const squad = useMemo(
    () => [...state.players].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a)),
    [state.players],
  );
  const wages = squad.reduce((s, p) => s + wageOf(p, state.divisionIndex), 0);
  const forecast = seasonForecast(state, wages);
  const recommended = bestSigning(state)?.player.id;

  // Échap ferme d'abord le comparateur, puis la fiche, puis le panneau
  const onEscape = () => { if (compare) setCompare(null); else if (sheet) setSheet(null); else onClose(); };

  const shown = filter === 'all' ? squad : squad.filter((p) => p.pos === filter);
  const find = (id) => state.players.find((p) => p.id === id) || state.market.find((p) => p.id === id);

  // fin de saison prévue (après salaires et entretien), pour montrer l'effet d'une vente ou d'une recrue
  const position = standingsOf(state).findIndex((t) => t.i === 0) + 1;
  const endNow = endOfSeasonForecast(state, position, wages).end;
  const sell = (p) => {
    const fee = saleValue(p, state.divisionIndex);
    const wage = wageOf(p, state.divisionIndex);
    const endAfter = endNow + fee + wage;
    ask({
      title: `Vendre ${p.name} ?`,
      text: `${p.name} (${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, note ${fmtRating(playerRating(p))}) rejoindra un autre club.${state.lineup?.includes(p.id) ? ' C’est un titulaire : ton onze sera recomposé.' : ''}`,
      rows: [
        ['Montant de la vente', `+${fmtMoney(fee)}`, 'up'],
        ['Salaire économisé', `${fmtMoney(wage)} / saison`, 'up'],
        ['Fin de saison prévue', `${fmtMoney(endNow)} → ${fmtMoney(endAfter)}`, endAfter < 0 ? 'down' : ''],
      ],
      confirmLabel: `Vendre · ${fmtMoney(fee)}`,
      onConfirm: () => { setSheet(null); run((s) => sellPlayer(s, p.id), 'Effectif au minimum (11 joueurs).'); },
    });
  };
  // recrutement : la fenêtre du jeu montre ce que la recrue coûte maintenant et ce qu'elle pèsera en fin de saison
  const sign = (p) => {
    const fee = signingFee(p, state.divisionIndex);
    const wage = wageOf(p, state.divisionIndex);
    const shareAfter = seasonForecast(state, wages + wage).wageShare;
    const endAfter = endNow - fee - wage;
    ask({
      title: `Recruter ${p.name} ?`,
      text: `${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, niveau ${fmtRating(playerRating(p))} sur 20.${endAfter < 0 ? ' Attention : la saison finirait dans le rouge, le conseil vendrait alors tes plus gros salaires.' : ''}`,
      tone: endAfter < 0 ? 'danger' : 'gold',
      rows: [
        ['Prime de signature', `−${fmtMoney(fee)}`, 'down'],
        ['Salaire', `${fmtMoney(wage)} / saison`],
        ['Salaires / revenus', `${Math.round(forecast.wageShare * 100)} % → ${Math.round(shareAfter * 100)} %`, shareAfter > 0.75 ? 'down' : ''],
        ['Fin de saison prévue', `${fmtMoney(endNow)} → ${fmtMoney(endAfter)}`, endAfter < 0 ? 'down' : ''],
      ],
      confirmLabel: `Signer · ${fmtMoney(fee)}`,
      cancelLabel: 'Pas maintenant',
      onConfirm: () => {
        if (run((s) => signPlayer(s, p.id), 'Fonds insuffisants ou effectif complet.')) { setSheet(null); setCompare(null); }
      },
    });
  };
  // comparaison par défaut : la recrue face au titulaire le plus faible à son poste, un joueur du club face
  // au meilleur autre joueur de sa ligne
  const openCompare = (p) => {
    const mates = state.players.filter((q) => q.id !== p.id && q.pos === p.pos);
    let other;
    if (state.market.includes(p)) {
      const starters = state.lineup.map((id, k) => (SLOTS[k] === p.pos ? find(id) : null)).filter(Boolean);
      other = starters.sort((a, b) => playerRating(a) - playerRating(b))[0] || mates[0];
    } else {
      other = mates.sort((a, b) => playerRating(b) - playerRating(a))[0] || state.market.find((q) => q.pos === p.pos);
    }
    if (other) setCompare({ a: other.id, b: p.id });
  };

  useEffect(() => { if (preview?.compare && state.market[0]) openCompare(state.market[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetPlayer = sheet && find(sheet.id);
  const list = sheet?.market ? state.market : squad;
  const step = (d) => {
    const i = list.findIndex((p) => p.id === sheet.id);
    const next = list[(i + d + list.length) % list.length];
    if (next) setSheet({ ...sheet, id: next.id });
  };

  return (
    <Panel
      size="lg"
      title="Effectif"
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
        <div className="sq-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'players'} className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>Joueurs</button>
          <button role="tab" aria-selected={tab === 'market'} className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>
            Marché{recommended ? <i className="sq-tab-dot" aria-label="recrue recommandée" /> : null}
          </button>
        </div>
        </>
      )}
      overlay={(
        <>
          <Presence>{sheetPlayer && (
            <PlayerSheet
              p={sheetPlayer}
              place={`${list.findIndex((q) => q.id === sheetPlayer.id) + 1} / ${list.length}`}
              state={state}
              refLvl={ref}
              market={!!sheet.market}
              onClose={() => setSheet(null)}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onCompare={() => openCompare(sheetPlayer)}
              onSell={() => sell(sheetPlayer)}
              onSign={() => sign(sheetPlayer)}
            />
          )}</Presence>
          <Presence>{compare && find(compare.a) && find(compare.b) && (
            <CompareView
              state={state}
              a={find(compare.a)}
              b={find(compare.b)}
              onPick={(id) => setCompare({ ...compare, a: id })}
              onClose={() => setCompare(null)}
              onSign={sign}
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
        ) : (
          <Market state={state} refLvl={ref} recommended={recommended} onOpen={(p) => setSheet({ id: p.id, market: true })} onCompare={openCompare} onSign={sign} />
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
          <span className="sq-row-name">{p.num ? <em>{p.num}</em> : null}{p.name}{state.lineup?.includes(p.id) && <i className="sq-starter" title="Titulaire" />}</span>
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

// --- Marché ----------------------------------------------------------------------------------------------

function Market({ state, refLvl, recommended, onOpen, onCompare, onSign }) {
  const full = state.players.length >= SQUAD_MAX;
  return (
    <>
      <p className="sq-hint">Joueurs libres, renouvelés à chaque saison. Le bouton <IconRadar className="inline-ico" /> compare une recrue au titulaire qu’elle remplacerait.</p>
      <ul className="plist">
        {state.market.length === 0 && <li className="empty">Plus de joueur disponible cette saison.</li>}
        {state.market.map((p) => {
          const fee = signingFee(p, state.divisionIndex);
          const pot = potentialRange(p, state);
          const r = playerRating(p);
          return (
            <li key={p.id} className={`pcard market sq-market ${p.id === recommended ? 'recommended' : ''}`}>
              <button className="sq-market-main" onClick={() => onOpen(p)}>
                <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
                <span className="sq-row-main">
                  <span className="sq-row-name">{p.name}{p.id === recommended && <em className="sh-tag on rec-tag">Recommandé</em>}</span>
                  <span className="sq-row-meta">
                    {p.age} ans · {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}>{a.short} {Math.round(a.v)}</span>)}
                  </span>
                  <span className="sq-row-meta">Potentiel {pot ? `${fmtRating(pot[0])} – ${fmtRating(pot[1])}` : 'atteint'} · salaire {fmtMoney(wageOf(p, state.divisionIndex))}</span>
                </span>
                <b className={`sq-market-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</b>
              </button>
              <div className="sq-market-actions">
                <button className="sh-compare sm" onClick={() => onCompare(p)} aria-label={`Comparer ${p.name}`} title="Comparer"><IconRadar /></button>
                <button className="btn" disabled={state.money < fee || full} onClick={() => onSign(p)} title={full ? 'Effectif complet' : state.money < fee ? `Il manque ${fmtMoney(fee - state.money)}` : ''}>
                  Signer · {fmtMoney(fee)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// --- Fiche joueur (magazine FootOFF Media) ---------------------------------------------------------------

function PlayerSheet({ p, state, refLvl, market, place, onClose, onPrev, onNext, onCompare, onSell, onSign }) {
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const f = formAvg(p);
  const st = p.season || {};
  const fams = p.pos === 'G' ? ['gk'] : ['tech', 'phys', 'tac'];
  const all = attrsOf(p);
  const keys = new Set(Object.entries(WEIGHTS[p.pos]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));
  const fee = signingFee(p, state.divisionIndex);
  const value = saleValue(p, state.divisionIndex);
  const prev = p.hist?.length ? p.hist[p.hist.length - 1] : null;
  const role = market ? 'Joueur libre' : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant';
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
      <article ref={ref} className="sq-sheet glass" onClick={(e) => e.stopPropagation()} aria-label={`Fiche de ${p.name}`}>
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
            </div>
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

        <footer className="sh-foot">
          <span>Salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b> par saison</span>
          <div className="sh-actions">
            <button className="sh-compare" onClick={onCompare} aria-label="Comparer" title="Comparer"><IconRadar /></button>
            {market ? (
              <button className="btn" disabled={state.money < fee || state.players.length >= SQUAD_MAX} onClick={onSign}>Signer · {fmtMoney(fee)}</button>
            ) : (
              <button className="btn" disabled={state.players.length <= SQUAD_MIN} onClick={onSell}>Vendre · {fmtMoney(value)}</button>
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

function CompareView({ state, a, b, onPick, onClose, onSign }) {
  const gk = b.pos === 'G';
  const axes = gk ? GK_ATTRS : ATTRS;
  const vals = (p) => axes.map((x) => (gk ? p.g?.[x.key] ?? 1 : p.a[x.key]));
  const va = vals(a);
  const vb = vals(b);
  const options = [...state.players, ...state.market].filter((p) => p.id !== b.id && (p.pos === 'G') === gk);
  const isMarket = state.market.includes(b);
  const fee = signingFee(b, state.divisionIndex);
  const roleOf = (p) => (state.market.includes(p) ? 'Joueur libre' : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant');
  const la = ratingAt(a, b.pos);
  const lb = ratingAt(b, b.pos);
  const ref = useRef(null);
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
            <label className="cmp-pick">
              <span className="cmp-name">{a.name}</span>
              <IconChevron />
              <select value={a.id} onChange={(e) => onPick(Number(e.target.value))} aria-label={`Joueur comparé : ${a.name}. Changer`}>
                {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtRating(playerRating(p))}){state.market.includes(p) ? ' · libre' : ''}</option>)}
              </select>
            </label>
            <b className={la > lb ? 'lead' : ''}>{fmtRating(la)}</b>
          </div>
          <span className="cmp-x">contre</span>
          <div className="cmp-side b">
            <span className="cmp-role"><i />{roleOf(b)}</span>
            <span className="cmp-name">{b.name}</span>
            <b className={lb >= la ? 'lead' : ''}>{fmtRating(lb)}</b>
          </div>
        </div>

        <Radar a={va} b={vb} axes={axes} />

        <section className="cmp-sec">
          <span className="sh-cap">Écart de {b.name.split(' ').slice(-1)[0]} par rapport à {a.name.split(' ').slice(-1)[0]}</span>
          <ul className="cmp-deltas">
            {axes.map((x, i) => {
              const d = Math.round(vb[i]) - Math.round(va[i]);
              return <li key={x.key} className={d > 0 ? 'up' : d < 0 ? 'down' : ''}><span>{x.name}</span><b>{d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d)}</b></li>;
            })}
          </ul>
        </section>

        {isMarket && (
          <footer className="cmp-foot">
            <span>Salaire <b>{fmtMoney(wageOf(b, state.divisionIndex))}</b> par saison</span>
            <button className="btn" disabled={state.money < fee || state.players.length >= SQUAD_MAX} onClick={() => onSign(b)}>Signer · {fmtMoney(fee)}</button>
          </footer>
        )}
      </div>
    </div>
  );
}
