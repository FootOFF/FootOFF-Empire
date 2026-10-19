import React, { useEffect, useMemo, useRef, useState } from 'react';
import { POS_LABELS } from '../game/constants';
import { ratingAt } from '../game/players';
import { SLOTS, TACTICS, TACTIC_ORDER, expectedGoals, lineupRating, matchOdds } from '../game/tactics';
import { createLiveMatch } from '../game/live';
import { IconClose, IconPlay } from './icons';

// Avant-match (onze + tactique + pronostic) et match en direct (score, chrono, fil de commentaires,
// vitesse, mi-temps avec changement). La 3D derrière est en mode « jour de match ».

const PITCH = [ // positions des postes sur le schéma (en %, attaque vers le haut)
  [50, 88], [14, 68], [37, 73], [63, 73], [86, 68], [27, 47], [50, 52], [73, 47], [20, 21], [50, 15], [80, 21],
];
const lastName = (n) => n.split(' ').slice(1).join(' ') || n;
const pct = (v) => `${Math.round(v * 100)} %`;

function OddsBar({ odds }) {
  return (
    <div className="odds">
      <div className="odds-bar">
        <i className="w" style={{ width: `${odds.win * 100}%` }} />
        <i className="d" style={{ width: `${odds.draw * 100}%` }} />
        <i className="l" style={{ width: `${odds.loss * 100}%` }} />
      </div>
      <div className="odds-legend">
        <span><b>{pct(odds.win)}</b> Victoire</span>
        <span><b>{pct(odds.draw)}</b> Nul</span>
        <span><b>{pct(odds.loss)}</b> Défaite</span>
      </div>
    </div>
  );
}

function TacticPicker({ value, onChange, compact }) {
  return (
    <div className={`tactics ${compact ? 'compact' : ''}`}>
      {TACTIC_ORDER.map((id) => (
        <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <strong>{TACTICS[id].name}</strong>
          {!compact && <span>{TACTICS[id].blurb}</span>}
        </button>
      ))}
    </div>
  );
}

// --- Avant-match -------------------------------------------------------------------------------------

export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [slot, setSlot] = useState(null);
  const byId = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p])), [state.players]);
  const rating = lineupRating(state.players, lineup);
  const xg = expectedGoals(rating, ctx.opp.strength, tactic);
  const odds = matchOdds(xg);
  const bench = state.players.filter((p) => !lineup.includes(p.id));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (slot !== null) setSlot(null); else onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slot, onCancel]);

  const choose = (k, id) => {
    const next = [...lineup];
    const from = next.indexOf(id);
    if (from !== -1) next[from] = next[k]; // échange de postes entre deux titulaires
    next[k] = id;
    setLineup(next);
    setSlot(null);
  };

  return (
    <div className="matchscreen prematch">
      <header className="ms-head">
        <div>
          <span className="eyebrow">Journée {state.round + 1} / 7 · à domicile</span>
          <h2>{state.clubName} <em>vs</em> {ctx.opp.name}</h2>
        </div>
        <button className="hud-icon" onClick={onCancel} aria-label="Retour"><IconClose /></button>
      </header>

      <div className="pm-grid">
        <section className="pm-pitch-wrap glass">
          <div className="pm-sub">
            <span className="eyebrow">Onze de départ · 4-3-3</span>
            <span className="pm-rating">Niveau <b>{rating.toFixed(1)}</b></span>
          </div>
          <div className="pitch2d">
            <div className="p2-lines"><i className="half" /><i className="circle" /><i className="box top" /><i className="box bottom" /></div>
            {lineup.map((id, k) => {
              const p = byId[id];
              if (!p) return null;
              const natural = p.pos === SLOTS[k];
              return (
                <button
                  key={k}
                  className={`p2-chip ${natural ? '' : 'off'} ${slot === k ? 'sel' : ''}`}
                  style={{ left: `${PITCH[k][0]}%`, top: `${PITCH[k][1]}%` }}
                  onClick={() => setSlot(slot === k ? null : k)}
                  title={natural ? '' : `Hors de son poste (${POS_LABELS[p.pos]})`}
                >
                  <span className="p2-num">{ratingAt(p, SLOTS[k]).toFixed(1)}</span>
                  <span className="p2-name">{lastName(p.name)}</span>
                </button>
              );
            })}
          </div>
          {slot !== null ? (
            <div className="pm-picker">
              <div className="pm-sub"><span className="eyebrow">Poste : {POS_LABELS[SLOTS[slot]]}</span><button className="linkbtn" onClick={() => setSlot(null)}>Fermer</button></div>
              <ul>
                {[...state.players].sort((a, b) => ratingAt(b, SLOTS[slot]) - ratingAt(a, SLOTS[slot])).map((p) => (
                  <li key={p.id}>
                    <button className={lineup[slot] === p.id ? 'current' : ''} onClick={() => choose(slot, p.id)}>
                      <span className={`pos ${p.pos}`}>{p.pos}</span>
                      <span className="pk-name">{p.name}{lineup.includes(p.id) && lineup[slot] !== p.id ? <em> · titulaire</em> : ''}</span>
                      <b>{ratingAt(p, SLOTS[slot]).toFixed(1)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="pm-bench">
              <span className="eyebrow muted-eyebrow">Remplaçants</span>
              <div>
                {bench.length === 0 && <span className="muted small">Aucun remplaçant : recrute dans l’Effectif.</span>}
                {bench.map((p) => <span key={p.id} className="bench-chip"><i className={`pos ${p.pos}`}>{p.pos}</i>{lastName(p.name)}</span>)}
              </div>
            </div>
          )}
        </section>

        <section className="pm-side">
          <div className="glass pm-card">
            <span className="eyebrow">Pronostic</span>
            <OddsBar odds={odds} />
            <div className="pm-xg">Buts attendus <b>{xg.for.toFixed(1)}</b> – <b>{xg.against.toFixed(1)}</b> · Adversaire niveau {ctx.opp.strength.toFixed(1)}</div>
          </div>
          <div className="glass pm-card">
            <span className="eyebrow">Tactique</span>
            <TacticPicker value={tactic} onChange={setTactic} />
          </div>
          <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic)}><IconPlay /> Coup d’envoi</button>
        </section>
      </div>
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------

const SEC_PER_MIN = 0.42; // ~40 s pour 90 minutes à vitesse normale
const ICON = { goal: '⚽', yellow: '', red: '', chance: '', sub: '⇄', kickoff: '', halftime: '', fulltime: '', info: '' };

function EventRow({ e }) {
  return (
    <li className={`ev ev-${e.type} ${e.side || ''} ${e.outcome || ''}`}>
      <span className="ev-min">{e.minute}′</span>
      <span className="ev-icon">{e.type === 'yellow' || e.type === 'red' ? <i className={`card ${e.type}`} /> : ICON[e.type]}</span>
      <span className="ev-text">{e.type === 'goal' && e.lead ? <><span className="ev-lead">{e.lead}</span> {e.text}</> : e.text}</span>
    </li>
  );
}

// probabilités finales depuis un score donné, pour la seconde période
function secondHalfOdds(xg, score) {
  const h = { for: xg.for / 2, against: xg.against / 2 };
  const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) {
    const p = pois(h.for, i) * pois(h.against, j);
    const a = score.home + i, b = score.away + j;
    if (a > b) w += p; else if (a === b) d += p; else l += p;
  }
  const t = w + d + l;
  return { win: w / t, draw: d / t, loss: l / t };
}

export function LiveMatch({ state, ctx, sound, onFx, onFinish }) {
  const [live] = useState(() => createLiveMatch(state, ctx)); // un seul match par montage (jamais recréé)
  const [half, setHalf] = useState(1);
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState('playing'); // playing | halftime | fulltime
  const [events, setEvents] = useState(() => live.playHalf(1));
  const [shown, setShown] = useState([]);
  const [banner, setBanner] = useState(null);
  const [muted, setMuted] = useState(sound.muted);
  const pause = useRef(0);
  const clockRef = useRef(0);
  const revealed = useRef(0);
  const [sub, setSub] = useState({ out: null, in: null });
  const [tactic2, setTactic2] = useState(live.state.tactic);

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // horloge : avance le temps de jeu, révèle les événements, marque une pause sur les buts
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (pause.current > 0) { pause.current -= dt; return; }
      const end = live.halfEnd;
      const next = Math.min(end, clockRef.current + (dt * speed) / SEC_PER_MIN);
      clockRef.current = next;
      setClock(next);
      while (revealed.current < events.length && events[revealed.current].at <= next) {
        const e = events[revealed.current++];
        setShown((s) => [e, ...s]);
        react(e);
        if (e.type === 'goal') break; // la suite attendra la fin de la célébration
      }
      if (next >= end && revealed.current >= events.length) {
        setPhase(half === 1 ? 'halftime' : 'fulltime');
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, speed, events, half]); // eslint-disable-line react-hooks/exhaustive-deps

  function react(e) {
    if (e.type === 'goal') {
      const ours = e.side === 'home';
      setBanner({ ...e, ours, fast: speed > 1 });
      pause.current = speed > 1 ? 1.6 : 4.4;
      setTimeout(() => setBanner(null), (speed > 1 ? 1.6 : 4.2) * 1000);
      if (ours) sound.goal(); else sound.conceded();
      onFx({ type: ours ? 'goal' : 'conceded', fast: speed > 1 });
    } else if (e.type === 'chance' && (e.outcome === 'post' || e.outcome === 'saved')) sound.chance();
    else if (e.type === 'yellow' || e.type === 'red') sound.card();
    else if (e.type === 'halftime') { sound.whistle(2); onFx({ type: 'halftime' }); }
    else if (e.type === 'fulltime') { sound.whistle(3); onFx({ type: 'fulltime' }); }
  }

  const skip = () => { // fin de la mi-temps en cours, sans célébration
    const end = live.halfEnd;
    pause.current = 0;
    const rest = events.slice(revealed.current);
    revealed.current = events.length;
    clockRef.current = end;
    setClock(end);
    setShown((s) => [...rest.reverse(), ...s]);
    setBanner(null);
    if (rest.some((e) => e.type === 'goal')) onFx({ type: 'skip' });
    setPhase(half === 1 ? 'halftime' : 'fulltime');
    sound.whistle(half === 1 ? 2 : 3);
  };

  const resume = () => {
    if (sub.out !== null && sub.in !== null) live.substitute(sub.out, sub.in);
    live.setTactic(tactic2);
    const h2 = live.playHalf(2);
    setEvents(h2);
    revealed.current = 0;
    clockRef.current = 45;
    setClock(45);
    setHalf(2);
    setPhase('playing');
    sound.whistle(1);
  };

  const m = live.state;
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;
  const xg2 = expectedGoals(lineupRating(state.players, sub.out !== null && sub.in !== null ? m.lineup.map((id) => (id === sub.out ? sub.in : id)) : m.lineup), m.oppStrength, tactic2);

  return (
    <div className="matchscreen live">
      <div className="scoreboard glass">
        <span className="sb-team">{m.home}</span>
        <span className="sb-score"><b key={`h${goalsH}`}>{goalsH}</b><i>–</i><b key={`a${goalsA}`}>{goalsA}</b></span>
        <span className="sb-team right">{m.away}</span>
        <span className="sb-clock">{phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? 'Terminé' : <><i className="live-dot" />{minuteLabel}′</>}</span>
      </div>

      {banner && (
        <div key={`${banner.half}-${banner.at}`} className={`goal-banner ${banner.ours ? 'ours' : 'theirs'} ${banner.fast ? 'fast' : ''}`}>
          <span className="gb-word">{banner.ours ? 'BUT !' : `But de ${m.away}`}</span>
          <span className="gb-who">{banner.player} · {banner.minute}′</span>
        </div>
      )}
      {banner?.ours && !banner.fast && <span key={`r${banner.at}`} className="replay-tag"><i />Ralenti</span>}

      <aside className="feed glass">
        <div className="feed-head">
          <span className="eyebrow">En direct</span>
          <div className="feed-stats">
            <span>Possession <b>{m.stats.possession}%</b></span>
            <span>Tirs <b>{shown.filter((e) => (e.type === 'chance' || e.type === 'goal') && e.side === 'home').length}–{shown.filter((e) => (e.type === 'chance' || e.type === 'goal') && e.side === 'away').length}</b></span>
          </div>
        </div>
        <ol className="feed-list">{shown.map((e, i) => <EventRow key={`${e.half}-${e.at}-${i}`} e={e} />)}</ol>
      </aside>

      {phase === 'playing' && (
        <div className="live-controls glass">
          <button className={speed === 1 ? 'on' : ''} onClick={() => setSpeed(1)}>x1</button>
          <button className={speed === 4 ? 'on' : ''} onClick={() => setSpeed(4)}>Accélérer x4</button>
          <button onClick={skip}>{half === 1 ? 'Aller à la mi-temps' : 'Aller au coup de sifflet'}</button>
          <button className="lc-sound" onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>{muted ? 'Son coupé' : 'Son'}</button>
        </div>
      )}

      {phase === 'halftime' && (
        <div className="halftime glass">
          <span className="eyebrow">Mi-temps</span>
          <div className="ht-score">{m.home} <b>{m.score.home} – {m.score.away}</b> {m.away}</div>
          <div className="ht-stats">
            <span>Possession <b>{m.stats.possession}%</b></span>
            <span>Tirs <b>{m.stats.shots[0]} – {m.stats.shots[1]}</b></span>
            <span>Cadrés <b>{m.stats.onTarget[0]} – {m.stats.onTarget[1]}</b></span>
          </div>
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Changement</span>
            <div className="ht-sub">
              <select value={sub.out ?? ''} onChange={(e) => setSub((x) => ({ ...x, out: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">Joueur qui sort…</option>
                {m.lineup.filter((id) => !m.sent.home.has(id)).map((id) => <option key={id} value={id}>{byId[id]?.name} ({byId[id]?.pos})</option>)}
              </select>
              <select value={sub.in ?? ''} onChange={(e) => setSub((x) => ({ ...x, in: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">Joueur qui entre…</option>
                {state.players.filter((p) => !m.lineup.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pos})</option>)}
              </select>
            </div>
          </div>
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Tactique de la seconde période</span>
            <TacticPicker value={tactic2} onChange={setTactic2} compact />
          </div>
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Pronostic final</span>
            <OddsBar odds={secondHalfOdds(xg2, m.score)} />
          </div>
          <button className="btn btn-xl" onClick={resume}><IconPlay /> Reprendre la seconde période</button>
        </div>
      )}

      {phase === 'fulltime' && (
        <div className="fulltime glass">
          <span className="eyebrow">Coup de sifflet final</span>
          <div className="ht-score">{m.home} <b>{m.score.home} – {m.score.away}</b> {m.away}</div>
          <button className="btn btn-xl" onClick={() => onFinish(live.result())}>Voir le résumé</button>
        </div>
      )}
    </div>
  );
}
