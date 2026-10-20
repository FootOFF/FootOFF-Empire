import React, { useEffect, useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { TACTICS } from '../game/tactics';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum, fmtRating } from './format';
import { IconBall, RatingBadge, SectionHead, Stat, VersusBar } from './kit';
import { IconChevron, IconChevronLeft, IconClose } from './icons';
import { Panel } from './panels';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';

// Stats : le club (saison et records), tous les matchs, les joueurs (classements saison ou carrière), et pour chaque
// match une fiche « Stats Pass » au format de footoff.media (en-tête, rapport de forces, fil du match, Note FootOFF,
// compositions, dynamique, confrontations, chiffres). Domicile en or, adversaire en blanc cassé.

const outcome = (m) => (m.gf > m.ga ? 'win' : m.gf < m.ga ? 'loss' : 'draw');
const LETTER = { win: 'V', draw: 'N', loss: 'D' };
const WORD = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const shortName = (n) => { const [f, ...r] = n.split(' '); return r.length ? `${f[0]}. ${r.join(' ')}` : n; };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function summary(list) {
  const t = { played: list.length, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, clean: 0, poss: 0, shots: 0, onT: 0, shotsA: 0, yellow: 0, red: 0, att: 0, rev: 0 };
  for (const m of list) {
    t[outcome(m)]++;
    t.gf += m.gf; t.ga += m.ga; if (m.ga === 0) t.clean++;
    t.att += m.attendance || 0; t.rev += m.revenue || 0;
    if (m.stats) {
      t.poss += m.stats.possession; t.shots += m.stats.shots[0]; t.onT += m.stats.onTarget[0]; t.shotsA += m.stats.shots[1];
      t.yellow += m.stats.yellow[0]; t.red += m.stats.red[0];
    }
  }
  return t;
}

function streak(list, ok) {
  let best = 0, cur = 0;
  for (const m of list) { cur = ok(m) ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
}

function FormPills({ list, onOpen }) {
  if (!list.length) return <span className="st-muted">Aucun match</span>;
  return (
    <div className="st-form">
      {list.map((m) => (
        <button key={`${m.season}-${m.round}`} className={`st-pill ${outcome(m)}`} onClick={() => onOpen?.(m)} title={`J${m.round} · ${m.gf}–${m.ga} contre ${m.opp}`}>
          {LETTER[outcome(m)]}
        </button>
      ))}
    </div>
  );
}

// --- Le club : saison choisie, forme, records, saison par saison -------------------------------------------------
function ClubTab({ state, matches, season, onOpen }) {
  const list = matches.filter((m) => m.season === season);
  const t = summary(list);
  const withStats = list.filter((m) => m.stats).length || 1;
  const all = matches;
  const best = (score) => all.reduce((b, m) => (!b || score(m) > score(b) ? m : b), null);
  const bigWin = best((m) => m.gf - m.ga);
  const bigLoss = best((m) => m.ga - m.gf);
  const goals = best((m) => m.gf + m.ga);
  const crowd = best((m) => m.attendance || 0);
  const cash = best((m) => m.revenue || 0);
  const seasons = [...new Set([...state.history.map((h) => h.season), ...all.map((m) => m.season)])].sort((a, b) => b - a);

  return (
    <>
      <SectionHead label={`Saison ${season}`} aside={list[0]?.division || DIVISIONS[state.divisionIndex].name} />
      {list.length === 0 ? <p className="st-muted">Aucun match enregistré pour cette saison : les statistiques détaillées démarrent au prochain match joué.</p> : (
        <>
          <div className="st-tiles">
            <Stat label="Matchs" value={t.played} sub={`${t.win} V · ${t.draw} N · ${t.loss} D`} />
            <Stat label="Buts" value={`${t.gf} – ${t.ga}`} sub={`diff. ${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}`} />
            <Stat label="Possession" value={`${Math.round(t.poss / withStats)} %`} sub="en moyenne" />
            <Stat label="Clean sheets" value={t.clean} sub={plural(t.clean, 'match sans but', 'matchs sans but')} />
            <Stat label="Tirs par match" value={fmtRating(t.shots / withStats)} sub={`${fmtRating(t.shotsA / withStats)} concédés`} />
            <Stat label="Précision" value={`${pct(t.onT, t.shots)} %`} sub="tirs cadrés" />
            <Stat label="Efficacité" value={`${pct(t.gf, t.shots)} %`} sub="tirs transformés" />
            <Stat label="Affluence" value={fmtNum(Math.round(t.att / (t.played || 1)))} sub="par match" />
          </div>
          <div className="st-row"><span className="st-cap">Forme</span><FormPills list={list.slice(-7)} onOpen={onOpen} /></div>
          <div className="st-row"><span className="st-cap">Discipline</span><span>{plural(t.yellow, 'carton jaune', 'cartons jaunes')} · {plural(t.red, 'carton rouge', 'cartons rouges')}</span></div>
          <div className="st-row"><span className="st-cap">Recettes des matchs</span><b>{fmtMoney(t.rev)}</b></div>
        </>
      )}

      {all.length > 0 && (
        <>
          <SectionHead label="Records du club" aside="toutes saisons" />
          <ul className="st-records">
            {bigWin && bigWin.gf > bigWin.ga && <Record label="Plus large victoire" m={bigWin} value={`${bigWin.gf}–${bigWin.ga}`} onOpen={onOpen} />}
            {bigLoss && bigLoss.ga > bigLoss.gf && <Record label="Plus lourde défaite" m={bigLoss} value={`${bigLoss.gf}–${bigLoss.ga}`} onOpen={onOpen} />}
            {goals && <Record label="Match le plus prolifique" m={goals} value={plural(goals.gf + goals.ga, 'but', 'buts')} onOpen={onOpen} />}
            {crowd && <Record label="Record d’affluence" m={crowd} value={fmtNum(crowd.attendance)} onOpen={onOpen} />}
            {cash && <Record label="Recette record" m={cash} value={fmtMoney(cash.revenue)} onOpen={onOpen} />}
            <li><span>Plus longue série sans défaite</span><b>{plural(streak(all, (m) => m.gf >= m.ga), 'match', 'matchs')}</b></li>
            <li><span>Plus longue série de victoires</span><b>{plural(streak(all, (m) => m.gf > m.ga), 'match', 'matchs')}</b></li>
          </ul>
        </>
      )}

      {seasons.length > 0 && (
        <>
          <SectionHead label="Saison par saison" />
          <table className="table st-seasons">
            <thead><tr><th>Saison</th><th>Division</th><th>Place</th><th>V-N-D</th><th>Buts</th></tr></thead>
            <tbody>
              {seasons.map((n) => {
                const h = state.history.find((x) => x.season === n);
                const ms = all.filter((m) => m.season === n);
                const s2 = summary(ms);
                return (
                  <tr key={n}>
                    <td className="t-pos">{n}</td>
                    <td className="t-club">{h?.division || ms[0]?.division || '—'}</td>
                    <td>{h ? ordinal(h.position, true) : 'en cours'}</td>
                    <td>{ms.length ? `${s2.win}-${s2.draw}-${s2.loss}` : '—'}</td>
                    <td>{ms.length ? `${s2.gf}–${s2.ga}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function Record({ label, m, value, onOpen }) {
  return (
    <li>
      <button className="st-record" onClick={() => onOpen(m)}>
        <span>{label}<em>S{m.season} · J{m.round} · {m.opp}</em></span>
        <b>{value}</b>
      </button>
    </li>
  );
}

// --- Tous les matchs ---------------------------------------------------------------------------------------------
function MatchesTab({ matches, onOpen }) {
  const seasons = [...new Set(matches.map((m) => m.season))].sort((a, b) => b - a);
  const [season, setSeason] = useState('all');
  const list = (season === 'all' ? matches : matches.filter((m) => m.season === season)).slice().reverse();
  if (!matches.length) return <p className="st-muted">Aucun match enregistré pour l’instant : chaque match joué apparaîtra ici, avec sa fiche Stats Pass.</p>;
  return (
    <>
      <div className="chips">
        <button className={season === 'all' ? 'active' : ''} onClick={() => setSeason('all')}>Toutes</button>
        {seasons.map((n) => <button key={n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>Saison {n}</button>)}
      </div>
      <ul className="st-matches">
        {list.map((m) => (
          <li key={`${m.season}-${m.round}`}>
            <button className="st-match" onClick={() => onOpen(m)}>
              <span className="st-when">S{m.season} · J{m.round}</span>
              <span className="st-opp">{m.opp}</span>
              <span className={`st-score ${outcome(m)}`}>{m.gf}–{m.ga}</span>
              <span className="st-mini">{m.stats ? `${m.stats.possession} % · ${m.stats.shots[0]}–${m.stats.shots[1]} tirs` : ''}</span>
              <IconChevron />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Joueurs : classements de la saison ou de la carrière ----------------------------------------------------------
function PlayersTab({ state }) {
  const [scope, setScope] = useState('season');
  const rows = state.players.map((p) => {
    const st = p.season || {};
    const base = { apps: st.apps || 0, goals: st.goals || 0, assists: st.assists || 0, motm: st.motm || 0, yellow: st.yellow || 0, red: st.red || 0, sum: st.sum || 0 };
    if (scope === 'career') for (const h of p.hist || []) {
      base.apps += h.apps || 0; base.goals += h.goals || 0; base.assists += h.assists || 0; base.motm += h.motm || 0;
      base.yellow += h.yellow || 0; base.red += h.red || 0; base.sum += (h.avg || 0) * (h.apps || 0);
    }
    return { p, ...base, avg: base.apps ? base.sum / base.apps : 0 };
  });
  const boards = [
    ['Buteurs', (r) => r.goals, (r) => plural(r.goals, 'but', 'buts')],
    ['Passeurs décisifs', (r) => r.assists, (r) => plural(r.assists, 'passe', 'passes')],
    ['Hommes du match', (r) => r.motm, (r) => `${r.motm} fois`],
    ['Note moyenne', (r) => (r.apps >= 3 ? r.avg : 0), (r) => `${fmtRating(r.avg)} / 10`],
    ['Matchs joués', (r) => r.apps, (r) => plural(r.apps, 'match', 'matchs')],
    ['Discipline', (r) => r.yellow + r.red * 3, (r) => `${r.yellow} J · ${r.red} R`],
  ];
  return (
    <>
      <div className="segmented st-scope" role="radiogroup" aria-label="Période">
        <button role="radio" aria-checked={scope === 'season'} className={scope === 'season' ? 'on' : ''} onClick={() => setScope('season')}>Saison {state.seasonNumber}</button>
        <button role="radio" aria-checked={scope === 'career'} className={scope === 'career' ? 'on' : ''} onClick={() => setScope('career')}>Carrière au club</button>
      </div>
      <div className="st-boards">
        {boards.map(([title, score, label]) => {
          const top = rows.filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 5);
          return (
            <section key={title} className="st-board">
              <span className="st-cap">{title}</span>
              {top.length === 0 ? <span className="st-muted">—</span> : (
                <ol>
                  {top.map((r, i) => (
                    <li key={r.p.id}>
                      <span className="st-rank">{i + 1}</span>
                      <span className={`pos-pill ${r.p.pos}`}>{r.p.pos}</span>
                      <span className="st-name">{shortName(r.p.name)}</span>
                      <b>{label(r)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      <p className="st-muted">Joueurs actuellement au club{scope === 'career' ? ', toutes leurs saisons chez toi' : ''}.</p>
    </>
  );
}

// --- Fiche Stats Pass d'un match ---------------------------------------------------------------------------------
function StatsPass({ state, m, matches, onClose, onPrev, onNext }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, onLeft: onNext, onRight: onPrev, downMedia: PHONE });
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [m]);
  const o = outcome(m);
  const idx = matches.indexOf(m);
  const before = matches.slice(Math.max(0, idx - 5), idx);
  const h2h = matches.filter((x) => x.opp === m.opp && x !== m).slice(-5).reverse();
  const players = (m.players || []).slice().sort((a, b) => b.rating - a.rating);
  const motm = players.find((p) => p.id === m.motm) || players[0];
  const lines = ['G', 'D', 'M', 'A'].map((pos) => [pos, players.filter((p) => p.pos === pos)]);
  const events = (m.events || []).filter((e) => e.type === 'goal' || e.type === 'red' || e.type === 'yellow');
  const st = m.stats;
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass sp" onClick={(e) => e.stopPropagation()} aria-label={`Stats Pass : ${state.clubName} contre ${m.opp}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={onPrev} aria-label="Match précédent"><IconChevronLeft /></button>
            <span>Stats Pass</span>
            <button className="hud-icon" onClick={onNext} aria-label="Match suivant"><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>

        <section className="sp-card">
          <span className="sp-meta">Journée {m.round} · {m.division} · saison {m.season}</span>
          <div className="sp-grid">
            <div className="sp-team"><span className="sp-dot dom" />{state.clubName}</div>
            <div className={`sp-score ${o}`}>{m.gf}<i>–</i>{m.ga}</div>
            <div className="sp-team ext">{m.opp}<span className="sp-dot ext" /></div>
          </div>
          <span className={`sp-state ${o}`}>{WORD[o]}</span>
          <div className="sp-strip">
            <span><b>{fmtNum(m.attendance || 0)}</b> spectateurs{m.capacity ? ` · ${pct(m.attendance, m.capacity)} % de remplissage` : ''}</span>
            <span>Recette <b>{fmtMoney(m.revenue || 0)}</b></span>
          </div>
        </section>

        {st && (
          <section className="sh-sec">
            <span className="sh-cap">Le rapport de forces</span>
            <VersusBar label="Possession" home={st.possession} away={100 - st.possession} suffix=" %" />
            <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} />
            <VersusBar label="Tirs cadrés" home={st.onTarget[0]} away={st.onTarget[1]} />
            <VersusBar label="Cartons" home={st.yellow[0] + st.red[0]} away={st.yellow[1] + st.red[1]} />
            <div className="sp-levels"><span>Niveau du onze <b className="dom">{fmtRating(m.myRating || 0)}</b></span><span>Adversaire <b>{fmtRating(m.oppStrength || 0)}</b></span></div>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">Le fil du match</span>
          {events.length === 0 && (m.scorers || []).length === 0 ? <p className="st-muted">Aucun but ni carton.</p> : (
            <ul className="sp-events">
              {(events.length ? events : (m.scorers || []).map((g) => ({ minute: g.minute, type: 'goal', side: 'home', player: g.name }))).map((e, i) => {
                const assist = e.type === 'goal' && e.side === 'home' ? (m.scorers || []).find((g) => g.name === e.player && String(g.minute) === String(e.minute).split('+')[0])?.assist : null;
                return (
                  <li key={i} className={e.side === 'home' ? 'dom' : 'ext'}>
                    <span className="sp-min">{e.minute}′</span>
                    <span className="sp-ico">{e.type === 'goal' ? <IconBall /> : <i className={`card ${e.type}`} />}</span>
                    <span className="sp-who">{e.player}{assist ? <em> · passe de {shortName(assist)}</em> : null}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {motm && (
          <section className="sh-sec">
            <span className="sh-cap">Note FootOFF</span>
            <div className="sp-motm"><RatingBadge value={motm.rating} /><div><b>{motm.name}</b><span>Homme du match{motm.goals ? ` · ${plural(motm.goals, 'but', 'buts')}` : ''}{motm.assists ? ` · ${plural(motm.assists, 'passe déc.', 'passes déc.')}` : ''}</span></div></div>
            <div className="sp-lines">
              {lines.filter(([, ps]) => ps.length).map(([pos, ps]) => (
                <div key={pos} className="sp-line">
                  <span className={`pos-pill ${pos}`}>{pos}</span>
                  <div>{ps.map((p) => <span key={p.id} className="sp-chip"><RatingBadge value={p.rating} />{shortName(p.name)}</span>)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">La dynamique avant ce match</span>
          <FormPills list={before} />
        </section>

        <section className="sh-sec">
          <span className="sh-cap">Les dernières confrontations</span>
          {h2h.length === 0 ? <p className="st-muted">Première rencontre entre les deux clubs.</p> : (
            <ul className="sp-h2h">{h2h.map((x) => <li key={`${x.season}-${x.round}`}><span>Saison {x.season} · J{x.round}</span><b className={outcome(x)}>{x.gf}–{x.ga}</b></li>)}</ul>
          )}
        </section>

        <section className="sh-sec">
          <span className="sh-cap">Les chiffres</span>
          <ul className="sp-facts">
            <li><span>Tactique</span><b>{TACTICS[m.tactic]?.name || '—'}</b></li>
            {st && <li><span>Efficacité</span><b>{pct(m.gf, st.shots[0])} % des tirs transformés</b></li>}
            {st && <li><span>Précision</span><b>{pct(st.onTarget[0], st.shots[0])} % de tirs cadrés</b></li>}
            <li><span>Joueurs utilisés</span><b>{players.length}</b></li>
          </ul>
        </section>
      </article>
    </div>
  );
}

export function StatsPanel({ state, onClose, initialMatch = null }) {
  const matches = state.matches || [];
  const [tab, setTab] = useState(initialMatch ? 'matches' : 'club');
  const seasons = [...new Set([state.seasonNumber, ...matches.map((m) => m.season)])].sort((a, b) => b - a);
  const [season, setSeason] = useState(state.seasonNumber);
  const [open, setOpen] = useState(initialMatch === 'last' ? matches[matches.length - 1] || null : null);
  const go = (d) => {
    const i = matches.indexOf(open);
    const next = matches[(i + d + matches.length) % matches.length];
    if (next) setOpen(next);
  };
  const onEscape = () => { if (open) setOpen(null); else onClose(); };
  const pick = (id) => { // chaque onglet s'ouvre en haut de sa liste
    setTab(id);
    document.querySelector('.panel.lg .panel-body')?.scrollTo(0, 0);
  };
  return (
    <Panel
      size="lg"
      title="Statistiques"
      eyebrow={`${plural(matches.length, 'match enregistré', 'matchs enregistrés')}`}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <div className="sq-tabs" role="tablist">
          {[['club', 'Le club'], ['matches', 'Matchs'], ['players', 'Joueurs']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => pick(id)}>{label}</button>
          ))}
        </div>
      )}
      overlay={<Presence>{open && <StatsPass state={state} m={open} matches={matches} onClose={() => setOpen(null)} onPrev={() => go(-1)} onNext={() => go(1)} />}</Presence>}
    >
      {tab === 'club' && (
        <>
          {seasons.length > 1 && (
            <div className="chips">{seasons.map((n) => <button key={n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>Saison {n}</button>)}</div>
          )}
          <ClubTab state={state} matches={matches} season={season} onOpen={setOpen} />
        </>
      )}
      {tab === 'matches' && <MatchesTab matches={matches} onOpen={setOpen} />}
      {tab === 'players' && <PlayersTab state={state} />}
    </Panel>
  );
}
