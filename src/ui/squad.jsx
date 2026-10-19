import React, { useEffect, useMemo, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import {
  ATTRS, FAMILIES, GK_ATTRS, TRAITS, playerRating, potentialRange, ratingAt, saleValue, signingFee, wageOf,
} from '../game/players';
import { sellPlayer, signPlayer } from '../game/engine';
import { seasonForecast } from '../game/economy';
import { bestSigning } from '../game/advice';
import { SLOTS } from '../game/tactics';
import { fmtMoney, fmtRating } from './format';
import { IconClose } from './icons';
import { Panel } from './panels';
import { Presence } from './presence';

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

export function SquadView({ state, run, ask, onClose, initialTab = 'players', preview = null }) {
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

  const sell = (p) => {
    const fee = saleValue(p, state.divisionIndex);
    ask({
      title: `Vendre ${p.name} ?`,
      text: `${p.name} (${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, note ${fmtRating(playerRating(p))}) rejoindra un autre club.${state.lineup?.includes(p.id) ? ' C’est un titulaire : ton onze sera recomposé.' : ''}`,
      rows: [
        ['Montant de la vente', `+${fmtMoney(fee)}`, 'up'],
        ['Salaire économisé', `${fmtMoney(wageOf(p, state.divisionIndex))} / saison`, 'up'],
      ],
      confirmLabel: `Vendre · ${fmtMoney(fee)}`,
      onConfirm: () => { setSheet(null); run((s) => sellPlayer(s, p.id), 'Effectif au minimum (11 joueurs).'); },
    });
  };
  const sign = (p) => {
    if (run((s) => signPlayer(s, p.id), 'Fonds insuffisants ou effectif complet.')) { setSheet(null); setCompare(null); }
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
          <span className="sq-budget-sub">{fmtMoney(wages)} par saison · revenus attendus {fmtMoney(forecast.income)}</span>
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
          <span>{extra ?? (f === null ? 'pas encore joué' : `forme ${fmtRating(f)}`)}</span>
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
      <p className="sq-hint">Joueurs libres, renouvelés à chaque saison. « Comparer » les met face au titulaire qu’ils remplaceraient.</p>
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
                  <span className="sq-row-name">{p.name}{p.id === recommended && <em className="rec-tag">Recommandé</em>}</span>
                  <span className="sq-row-meta">
                    {p.age} ans · {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}>{a.short} {Math.round(a.v)}</span>)}
                  </span>
                  <span className="sq-row-meta">Potentiel {pot ? `${fmtRating(pot[0])} – ${fmtRating(pot[1])}` : 'atteint'} · salaire {fmtMoney(wageOf(p, state.divisionIndex))}</span>
                </span>
                <b className={`sq-market-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</b>
              </button>
              <div className="sq-market-actions">
                <button className="chipbtn" onClick={() => onCompare(p)}>Comparer</button>
                <button className="btn btn-sm" disabled={state.money < fee || full} onClick={() => onSign(p)} title={full ? 'Effectif complet' : state.money < fee ? `Il manque ${fmtMoney(fee - state.money)}` : ''}>
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

function PlayerSheet({ p, state, refLvl, market, onClose, onPrev, onNext, onCompare, onSell, onSign }) {
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const f = formAvg(p);
  const st = p.season || {};
  const fams = p.pos === 'G' ? ['gk'] : ['tech', 'phys', 'tac'];
  const all = attrsOf(p);
  const fee = signingFee(p, state.divisionIndex);
  const prev = p.hist?.length ? p.hist[p.hist.length - 1] : null;
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article className="sq-sheet glass" onClick={(e) => e.stopPropagation()} aria-label={`Fiche de ${p.name}`}>
        <header className="sh-top">
          <button className="hud-icon sh-nav" onClick={onPrev} aria-label="Joueur précédent">‹</button>
          <span className="eyebrow">{market ? 'Joueur libre' : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant'}</span>
          <button className="hud-icon sh-nav" onClick={onNext} aria-label="Joueur suivant">›</button>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la fiche"><IconClose /></button>
        </header>

        <div className="sh-hero">
          <div className={`sh-rating ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>/ 20</span></div>
          <div className="sh-id">
            <h3>{p.name}</h3>
            <span>{p.num ? `N°${p.num} · ` : ''}{POS_LABELS[p.pos]} · {p.age} ans · pied {p.foot}</span>
            {p.alt && <span>Peut dépanner : {POS_LABELS[p.alt].toLowerCase()} ({fmtRating(ratingAt(p, p.alt))})</span>}
          </div>
        </div>

        {p.traits?.length > 0 && (
          <ul className="sh-traits">
            {p.traits.map((t) => <li key={t}><b>{TRAITS[t].name}</b><span>{TRAITS[t].desc}</span></li>)}
          </ul>
        )}

        <div className="sh-grid">
          <div className="sh-block">
            <span className="sh-label">Potentiel estimé</span>
            <b>{pot ? `${fmtRating(pot[0])} – ${fmtRating(pot[1])}` : 'Plafond atteint'}</b>
            <span className="sh-sub">{pot ? 'La fourchette se précise avec le temps et l’académie.' : 'Il a donné son plein potentiel.'}</span>
          </div>
          <div className="sh-block">
            <span className="sh-label">Forme · 5 derniers matchs</span>
            {p.form?.length ? (
              <div className="sh-form">
                {p.form.map((v, i) => <i key={i} className={v >= 7.5 ? 'good' : v < 5.5 ? 'low' : ''} style={{ height: `${v * 10}%` }} title={`${fmtRating(v)} / 10`} />)}
                <span>{fmtRating(f)} / 10</span>
              </div>
            ) : <span className="sh-sub">Pas encore joué{market ? ' pour le club' : ' cette saison'}.</span>}
          </div>
        </div>

        {!market && (
          <div className="sh-season">
            <div><span>Matchs</span><b>{st.apps || 0}</b></div>
            <div><span>Buts</span><b>{st.goals || 0}</b></div>
            <div><span>Passes déc.</span><b>{st.assists || 0}</b></div>
            <div><span>Cartons</span><b>{(st.yellow || 0) + (st.red || 0)}</b></div>
            <div><span>Note moy.</span><b>{st.apps ? fmtRating(st.sum / st.apps) : '–'}</b></div>
          </div>
        )}
        {!market && (p.lastDelta !== undefined || prev) && (
          <p className="sh-evo">
            {p.lastDelta !== undefined && <>Dernier été : <b className={p.lastDelta > 0 ? 'up' : p.lastDelta < 0 ? 'down' : ''}>{p.lastDelta > 0 ? '+' : ''}{fmtRating(p.lastDelta)}</b></>}
            {prev && <> · saison {prev.season} : {prev.apps} matchs, {prev.goals} buts{prev.avg ? `, note moyenne ${fmtRating(prev.avg)}` : ''}</>}
          </p>
        )}

        {fams.map((fam) => (
          <div className="sh-fam" key={fam}>
            <span className="sh-label">{FAMILIES[fam]}</span>
            {all.filter((a) => a.fam === fam).map((a) => (
              <div className="sh-attr" key={a.key}>
                <span>{a.name}</span>
                <span className="sh-track"><i className={heat(a.v, refLvl)} style={{ width: `${(a.v / 20) * 100}%` }} /></span>
                <b className={heat(a.v, refLvl)}>{Math.round(a.v)}</b>
              </div>
            ))}
          </div>
        ))}

        <footer className="sh-foot">
          <span>Salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b> / saison · {market ? <>Signature <b>{fmtMoney(fee)}</b></> : <>Valeur <b>{fmtMoney(saleValue(p, state.divisionIndex))}</b></>}</span>
          <div className="sh-actions">
            <button className="btn ghost btn-sm" onClick={onCompare}>Comparer</button>
            {market ? (
              <button className="btn btn-sm" disabled={state.money < fee || state.players.length >= SQUAD_MAX} onClick={onSign}>Signer · {fmtMoney(fee)}</button>
            ) : (
              <button className="btn btn-sm" disabled={state.players.length <= SQUAD_MIN} onClick={onSell}>Vendre · {fmtMoney(saleValue(p, state.divisionIndex))}</button>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}

// --- Comparateur radar ----------------------------------------------------------------------------------

function Radar({ a, b, axes }) {
  const cx = 150, cy = 128, R = 92, n = axes.length;
  const pt = (i, r) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; };
  const poly = (vals) => vals.map((v, i) => pt(i, (R * v) / 20).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 300 262" role="img" aria-label="Comparaison des caractéristiques">
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={axes.map((_, i) => pt(i, R * k).join(',')).join(' ')} className="radar-grid" />)}
      {axes.map((ax, i) => { const [x, y] = pt(i, R); return <line key={ax.key} x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />; })}
      <polygon points={poly(a)} className="radar-a" />
      <polygon points={poly(b)} className="radar-b" />
      {axes.map((ax, i) => { const [x, y] = pt(i, R + 16); return <text key={ax.key} x={x} y={y + 4} textAnchor="middle" className="radar-label">{ax.short}</text>; })}
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
  return (
    <div className="sq-overlay center" onClick={onClose}>
      <div className="sq-compare glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comparateur">
        <header className="sh-top">
          <span className="eyebrow">Comparateur</span>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer le comparateur"><IconClose /></button>
        </header>
        <div className="cmp-legend">
          <label className="cmp-a">
            <i />
            <select value={a.id} onChange={(e) => onPick(Number(e.target.value))} aria-label="Joueur comparé">
              {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtRating(playerRating(p))}){state.market.includes(p) ? ' · libre' : ''}</option>)}
            </select>
          </label>
          <span className="cmp-b"><i />{b.name} <b>{fmtRating(playerRating(b))}</b></span>
        </div>
        <Radar a={va} b={vb} axes={axes} />
        <ul className="cmp-deltas">
          {axes.map((x, i) => {
            const d = Math.round(vb[i]) - Math.round(va[i]);
            return <li key={x.key} className={d > 0 ? 'up' : d < 0 ? 'down' : ''}><span>{x.name}</span><b>{d > 0 ? '+' : ''}{d}</b></li>;
          })}
        </ul>
        <p className="cmp-sum">
          Au poste de {POS_LABELS[b.pos].toLowerCase()} : {b.name} <b>{fmtRating(ratingAt(b, b.pos))}</b> contre {a.name} <b>{fmtRating(ratingAt(a, b.pos))}</b>.
        </p>
        {isMarket && (
          <div className="cmp-foot">
            <span>Signature {fmtMoney(fee)} · salaire {fmtMoney(wageOf(b, state.divisionIndex))} / saison</span>
            <button className="btn btn-sm" disabled={state.money < fee || state.players.length >= SQUAD_MAX} onClick={() => onSign(b)}>Signer · {fmtMoney(fee)}</button>
          </div>
        )}
      </div>
    </div>
  );
}
