import React, { useEffect, useMemo, useRef, useState } from 'react';
import { POS_LABELS } from '../game/constants';
import { ratingAt } from '../game/players';
import { FORMATIONS, FORMATION_ORDER, TACTICS, TACTIC_ORDER, autoLineup, expectedGoals, formationOf, lineupRating, reshapeLineup, slotsOf } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { createLiveMatch, prematchOdds } from '../game/live';
import { IconClose, IconMute, IconPlay, IconSound } from './icons';
import { IconBall, IconSwap, IconWhistle, RatingBadge } from './kit';
import { useKeydown } from './presence';

// Avant-match (onze + tactique + pronostic) et match en direct (score, chrono, fil de commentaires,
// vitesse, mi-temps avec changement). La 3D derrière est en mode « jour de match ».

const lastName = (n) => n.split(' ').slice(1).join(' ') || n;
// « L. Ferrand » : l'initiale départage deux joueurs au même nom de famille
const shortName = (n) => { const [first, ...rest] = n.split(' '); return rest.length ? `${first[0]}. ${rest.join(' ')}` : n; };

function OddsBar({ odds }) {
  const [w, d, l] = roundPercents([odds.win, odds.draw, odds.loss]); // somme toujours égale à 100 %
  return (
    <div className="odds">
      <div className="odds-bar">
        <i className="w" style={{ width: `${odds.win * 100}%` }} />
        <i className="d" style={{ width: `${odds.draw * 100}%` }} />
        <i className="l" style={{ width: `${odds.loss * 100}%` }} />
      </div>
      <div className="odds-legend">
        <span><b>{w.label}</b> Victoire</span>
        <span><b>{d.label}</b> Nul</span>
        <span><b>{l.label}</b> Défaite</span>
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

// Dispositif : six formations, avec leur effet résumé.
function FormationPicker({ value, onChange }) {
  return (
    <div className="formations" role="radiogroup" aria-label="Dispositif">
      {FORMATION_ORDER.map((id) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <strong>{FORMATIONS[id].name}</strong>
        </button>
      ))}
    </div>
  );
}

// --- Avant-match -------------------------------------------------------------------------------------

export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [formation, setFormation] = useState(formationOf(state.formation).id);
  const [slot, setSlot] = useState(null);
  const byId = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p])), [state.players]);
  const SLOTS = slotsOf(formation);
  const PITCH = formationOf(formation).pitch;
  const rating = lineupRating(state.players, lineup, formation);
  const xg = expectedGoals(rating, ctx.opp.strength, tactic, formation);
  const odds = prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // calculé sur le moteur
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); setSlot(null); };
  const bench = state.players.filter((p) => !lineup.includes(p.id));

  useKeydown((e) => { if (e.key === 'Escape') { if (slot !== null) setSlot(null); else onCancel(); } });

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
            <span className="eyebrow">Onze de départ · <span className="nowrap">{formationOf(formation).name}</span></span>
            <button className="linkbtn pm-best" onClick={() => { setLineup(autoLineup(state.players, formation)); setSlot(null); }}>Meilleur onze</button>
            <span className="pm-rating">Niveau <b>{fmtRating(rating)}</b></span>
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
                  <span className="p2-num">{fmtRating(ratingAt(p, SLOTS[k]))}</span>
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
                      <b>{fmtRating(ratingAt(p, SLOTS[slot]))}</b>
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
            <div className="pm-xg">Buts attendus <b>{xg.for.toFixed(1)}</b> – <b>{xg.against.toFixed(1)}</b> · Adversaire niveau {fmtRating(ctx.opp.strength)}</div>
            {ctx.gate && (
              <div className="pm-xg">
                Affluence attendue <b>{fmtNum(ctx.gate.attendance)}</b> / {fmtNum(ctx.gate.capacity)} · Recettes ≈ <b>{fmtMoney(ctx.gate.revenue)}</b>
              </div>
            )}
          </div>
          <div className="glass pm-card">
            <span className="eyebrow">Dispositif</span>
            <FormationPicker value={formation} onChange={reshape} />
            <p className="pm-blurb">{formationOf(formation).blurb}</p>
          </div>
          <div className="glass pm-card">
            <span className="eyebrow">Tactique</span>
            <TacticPicker value={tactic} onChange={setTactic} />
          </div>
          <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation)}><IconPlay /> Coup d’envoi</button>
        </section>
      </div>
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------

const SEC_PER_MIN = 0.42; // ~40 s pour 90 minutes à vitesse normale
const ICON = { goal: <IconBall />, sub: <IconSwap />, kickoff: <IconWhistle />, halftime: <IconWhistle />, fulltime: <IconWhistle /> };

// Les classes tirées des données du match sont toujours préfixées (ev-side-…, ev-out-…) : un nom nu comme
// « post » (tir sur le poteau) prenait les styles de l'écran d'après-match (.post) et figeait la ligne en haut du fil.
function EventRow({ e }) {
  return (
    <li className={['ev', `ev-${e.type}`, e.side && `ev-side-${e.side}`, e.outcome && `ev-out-${e.outcome}`].filter(Boolean).join(' ')}>
      <span className="ev-min">{e.minute}′</span>
      <span className="ev-icon">{e.type === 'yellow' || e.type === 'red' ? <i className={`card ${e.type}`} /> : ICON[e.type] || null}</span>
      <span className="ev-text">{e.type === 'goal' && e.lead ? <><span className="ev-lead">{e.lead}</span> {e.text}</> : e.text}</span>
    </li>
  );
}

// probabilités finales depuis un score donné, pour la seconde période
// Changement à la mi-temps, au doigt : on touche le joueur qui sort (note du match et carton visibles), puis
// celui qui entre (remplaçants du même poste en tête, avec leur niveau à ce poste et l'écart avec le sortant).
function SubPicker({ state, m, notes, sub, onChange }) {
  const byId = (id) => state.players.find((p) => p.id === id);
  const outP = sub.out !== null ? byId(sub.out) : null;
  const inP = sub.in !== null ? byId(sub.in) : null;
  const SLOTS = slotsOf(m.formation);
  const slot = outP ? SLOTS[m.lineup.indexOf(outP.id)] : null;
  const outLvl = outP ? ratingAt(outP, slot) : 0;
  const delta = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtRating(Math.abs(v))}`;

  if (outP && inP) {
    const inLvl = ratingAt(inP, slot);
    return (
      <div className="sub-done">
        <div className="sub-swap">
          <span className="sub-way out">Sort</span><b>{outP.name}</b>
          <span className="sub-way in">Entre</span><b>{inP.name}</b>
        </div>
        <div className="sub-done-foot">
          <span>Niveau au poste ({POS_LABELS[slot].toLowerCase()}) : {fmtRating(outLvl)} → <b className={inLvl >= outLvl ? 'up' : 'down'}>{fmtRating(inLvl)}</b></span>
          <button className="linkbtn sub-reset" onClick={() => onChange({ out: null, in: null })}>Modifier</button>
        </div>
      </div>
    );
  }

  if (outP) {
    const bench = state.players
      .filter((p) => !m.lineup.includes(p.id))
      .map((p) => ({ p, lvl: ratingAt(p, slot) }))
      .sort((a, b) => (b.p.pos === slot) - (a.p.pos === slot) || b.lvl - a.lvl);
    return (
      <div className="sub-step">
        <div className="sub-head">
          <span>Qui remplace <b>{lastName(outP.name)}</b> ({POS_LABELS[slot].toLowerCase()}, niveau {fmtRating(outLvl)}) ?</span>
          <button className="linkbtn sub-reset" onClick={() => onChange({ out: null, in: null })}>Annuler</button>
        </div>
        {bench.length === 0 ? <p className="sub-empty">Aucun remplaçant : recrute dans l’Effectif.</p> : (
          <div className="sub-grid">
            {bench.map(({ p, lvl }) => (
              <button key={p.id} className="sub-chip" onClick={() => onChange({ out: outP.id, in: p.id })}>
                <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
                <span className="sub-name">{shortName(p.name)}</span>
                <span className="sub-lvl">{fmtRating(lvl)}<em className={lvl > outLvl ? 'up' : lvl < outLvl ? 'down' : ''}>{delta(lvl - outLvl)}</em></span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const starters = m.lineup.map((id, k) => ({ p: byId(id), slot: SLOTS[k] })).filter(({ p }) => p && !m.sent.home.has(p.id));
  return (
    <div className="sub-step">
      <p className="sub-hint">Touche le joueur qui sort. Sinon, l’équipe repart telle quelle.</p>
      <div className="sub-grid">
        {starters.map(({ p, slot: s }) => (
          <button key={p.id} className="sub-chip" onClick={() => onChange({ out: p.id, in: null })}>
            <span className={`pos-pill ${s}`}>{s}</span>
            <span className="sub-name">{shortName(p.name)}</span>
            {m.booked.home.has(p.id) && <i className="card yellow" title="Averti" />}
            {notes[p.id] && <RatingBadge value={notes[p.id]} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LiveMatch({ state, ctx, sound, onFx, onFinish, preview = null }) {
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
  // identifiant stable par événement : un nouveau commentaire en tête du fil ne recrée pas (ni ne refait
  // apparaître) tous les autres
  const evKeys = useRef({ map: new WeakMap(), n: 0 });
  const keyOf = (e) => {
    const k = evKeys.current;
    if (!k.map.has(e)) k.map.set(e, ++k.n);
    return k.map.get(e);
  };
  const [sub, setSub] = useState({ out: null, in: null });
  const [tactic2, setTactic2] = useState(live.state.tactic);

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // aperçu (galerie) : direct déjà entamé, ou mi-temps
  useEffect(() => {
    if (!preview) return;
    const upTo = preview.phase === 'halftime' ? Infinity : preview.minute;
    const seen = events.filter((e) => e.at <= upTo);
    revealed.current = seen.length;
    setShown([...seen].reverse());
    const t = preview.phase === 'halftime' ? live.halfEnd : preview.minute;
    clockRef.current = t;
    setClock(t);
    if (preview.phase === 'halftime') setPhase('halftime');
    else pause.current = Infinity; // vignette figée sur la minute demandée
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // coup de sifflet final : un court temps de respiration (« Terminé »), puis l'écran d'après-match
  const finished = useRef(false);
  useEffect(() => {
    if (phase !== 'fulltime' || finished.current) return undefined;
    const t = setTimeout(() => { finished.current = true; onFinish(live.result()); }, 1700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // notes du match à la pause (aide à choisir qui sort)
  const notes = useMemo(() => (phase === 'halftime'
    ? Object.fromEntries(live.result().players.filter(Boolean).map((x) => [x.id, x.rating])) : {}), [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''}`}>
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
        <ol className="feed-list">{shown.map((e) => <EventRow key={keyOf(e)} e={e} />)}</ol>
      </aside>

      {phase === 'playing' && (
        <div className="live-controls glass">
          <div className="lc-speed" role="group" aria-label="Vitesse du match">
            <button className={speed === 1 ? 'on' : ''} aria-pressed={speed === 1} onClick={() => setSpeed(1)} title="Vitesse normale">×1</button>
            <button className={speed === 4 ? 'on' : ''} aria-pressed={speed === 4} onClick={() => setSpeed(4)} title="Accélérer"><span className="hide-sm">Accélérer </span>×4</button>
          </div>
          <button className="lc-skip" onClick={skip}>
            <span className="hide-sm">{half === 1 ? 'Aller à la mi-temps' : 'Aller au coup de sifflet'}</span>
            <span className="show-sm">{half === 1 ? 'Mi-temps' : 'Fin du match'}</span>
          </button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? 'Remettre le son' : 'Couper le son'} title={muted ? 'Son coupé' : 'Son'}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      )}

      {phase === 'halftime' && (
        <div className="halftime glass">
          <div className="ht-col">
          <span className="eyebrow">Mi-temps · tes consignes</span>
          <div className="ht-stats">
            <span>Possession <b>{m.stats.possession}%</b></span>
            <span>Tirs <b>{m.stats.shots[0]} – {m.stats.shots[1]}</b></span>
            <span>Cadrés <b>{m.stats.onTarget[0]} – {m.stats.onTarget[1]}</b></span>
          </div>
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Pronostic final</span>
            <OddsBar odds={live.secondHalfOdds({ lineup: sub.out !== null && sub.in !== null ? m.lineup.map((id) => (id === sub.out ? sub.in : id)) : m.lineup, tactic: tactic2 })} />
          </div>
          </div>
          <div className="ht-col">
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Changement</span>
            <SubPicker state={state} m={m} notes={notes} sub={sub} onChange={setSub} />
          </div>
          <div className="ht-block">
            <span className="eyebrow muted-eyebrow">Tactique de la seconde période</span>
            <TacticPicker value={tactic2} onChange={setTactic2} compact />
          </div>
          <div className="ht-go"><button className="btn btn-xl" onClick={resume}><IconPlay /> Reprendre la seconde période</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
