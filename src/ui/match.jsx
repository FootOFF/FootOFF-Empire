import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TACTICS, TACTIC_ORDER, expectedGoals, formationOf, lineupRating, reshapeLineup } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { SUBS_MAX, createLiveMatch, pairSubs, prematchOdds } from '../game/live';
import { BestEleven, FormationPicker, LineupBoard, displayNames } from './lineup';
import { IconChevron, IconClose, IconMute, IconPlay, IconSound, IconUsers } from './icons';
import { IconBall, IconSwap, IconWhistle } from './kit';
import { useKeydown } from './presence';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';

// Avant-match (onze + tactique + pronostic) et match en direct (score, chrono, fil de commentaires,
// vitesse, mi-temps avec changements sur le terrain). La 3D derrière est en mode « jour de match ».

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

// --- Avant-match -------------------------------------------------------------------------------------

export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [formation, setFormation] = useState(formationOf(state.formation).id);
  const rating = lineupRating(state.players, lineup, formation);
  const xg = expectedGoals(rating, ctx.opp.strength, tactic, formation);
  const odds = prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // calculé sur le moteur
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); };

  useKeydown((e) => { if (e.key === 'Escape') onCancel(); });

  return (
    <div className="matchscreen prematch">
      <header className="ms-head">
        <div>
          <span className={`eyebrow hm-comp-${ctx.comp || 'league'}`}>{ctx.label || `Journée ${state.round + 1} / 7`} · à domicile</span>
          <h2>{state.clubName} <em>vs</em> {ctx.opp.name}</h2>
        </div>
        <button className="hud-icon" onClick={onCancel} aria-label="Retour"><IconClose /></button>
      </header>

      <div className="pm-grid">
        <section className="pm-pitch-wrap glass">
          <div className="pm-sub">
            <span className="eyebrow">Onze de départ · <span className="nowrap">{formationOf(formation).name}</span></span>
            <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
            <span className="pm-rating">Niveau <b>{fmtRating(rating)}</b></span>
          </div>
          <LineupBoard players={state.players} lineup={lineup} formation={formation} onChange={setLineup} />
        </section>

        <section className="pm-side">
          <div className="glass pm-card">
            <span className="eyebrow">Pronostic</span>
            <OddsBar odds={odds} />
            {ctx.knockout && <div className="pm-xg">Élimination directe : en cas d’égalité, tirs au but. Qualification ≈ <b>{Math.round((odds.win + odds.draw * 0.5) * 100)} %</b></div>}
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
          <div className="pm-go">
            <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation)}><IconPlay /> Coup d’envoi</button>
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------

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

// Changements de la mi-temps : ce qui change entre le onze de la première période et celui composé sur le terrain
// (entrants face aux sortants de leur poste, et niveau du onze avant → après).
function HalftimeChanges({ state, m, plan, onReset }) {
  const names = displayNames(state.players);
  const pairs = pairSubs(m.lineup, plan);
  const moved = plan.some((id, k) => m.lineup.includes(id) && m.lineup[k] !== id);
  if (!pairs.length && !moved) return <p className="ht-none">Aucun changement : l’équipe repart telle quelle.</p>;
  const before = lineupRating(state.players, m.lineup, m.formation);
  const after = lineupRating(state.players, plan, m.formation);
  return (
    <div className="ht-changes">
      {pairs.map(([id, out]) => (
        <div key={id} className="ht-swap">
          <span className="sub-way in">Entre</span><b>{names[id]}</b>
          <span className="sub-way out">Sort</span><b>{names[out]}</b>
        </div>
      ))}
      {moved && <span className="ht-moved">Postes réorganisés</span>}
      <div className="ht-changes-foot">
        <span>Niveau du onze {fmtRating(before)} → <b className={after >= before ? 'up' : 'down'}>{fmtRating(after)}</b></span>
        <button className="linkbtn sub-reset" onClick={onReset}>Annuler</button>
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
  const [plan, setPlan] = useState(null); // onze de la seconde période, composé sur le terrain à la mi-temps
  const [tactic2, setTactic2] = useState(live.state.tactic);
  const [board, setBoard] = useState(false); // composition repliée à la mi-temps : on la déploie pour faire ses changements

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // scène 3D : elle lit l'horloge et les événements de la mi-temps dans le canal du direct
  const homeNames = () => live.state.lineup.map((id) => state.players.find((p) => p.id === id)?.name || '');
  useEffect(() => {
    Object.assign(matchFeed, {
      active: !preview, ended: false, phase: 'playing', half: 1, clock: 0, speed: 1, pause: 0, events,
      formation: live.state.formation, homeNames: homeNames(), awayNames: live.state.awayRoster.map((p) => p.name),
      awayName: live.state.away, skipped: 0,
    });
    return () => { matchFeed.active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Object.assign(matchFeed, { phase, half, events, speed, homeNames: homeNames() });
    if (phase === 'fulltime') matchFeed.ended = true;
  }, [phase, half, events, speed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (pause.current > 0) { pause.current -= dt; matchFeed.pause = Math.max(0, pause.current); return; }
      matchFeed.pause = 0;
      const end = live.halfEnd;
      const next = Math.min(end, clockRef.current + (dt * speed) / SEC_PER_MIN);
      clockRef.current = next;
      matchFeed.clock = next;
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
      matchFeed.pause = pause.current;
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
    matchFeed.clock = end;
    matchFeed.skipped += 1;
    setClock(end);
    setShown((s) => [...rest.reverse(), ...s]);
    setBanner(null);
    if (rest.some((e) => e.type === 'goal')) onFx({ type: 'skip' });
    setPhase(half === 1 ? 'halftime' : 'fulltime');
    sound.whistle(half === 1 ? 2 : 3);
  };

  const resume = () => {
    if (plan) live.applyLineup(plan);
    live.setTactic(tactic2);
    const h2 = live.playHalf(2);
    setEvents(h2);
    revealed.current = 0;
    clockRef.current = 45;
    matchFeed.clock = 45;
    setClock(45);
    setHalf(2);
    setPhase('playing');
    sound.whistle(1);
  };

  const m = live.state;
  useEffect(() => { if (phase === 'halftime') { setPlan([...m.lineup]); setBoard(!!preview?.board); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = plan || m.lineup;
  const subsLeft = SUBS_MAX - m.subsUsed - pairSubs(m.lineup, planned).length; // changements encore possibles
  // notes du match à la pause (aide à choisir qui sort)
  const notes = useMemo(() => (phase === 'halftime'
    ? Object.fromEntries(live.result().players.filter(Boolean).map((x) => [x.id, x.rating])) : {}), [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''}`}>
      <div className="scoreboard glass">
        <span className="sb-team">{m.home}</span>
        <span className="sb-score"><b key={`h${goalsH}`}>{goalsH}</b><i>–</i><b key={`a${goalsA}`}>{goalsA}</b></span>
        <span className="sb-team right">{m.away}</span>
        <span className="sb-clock">{phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Terminé${m.pens ? ` · t.a.b. ${m.pens[0]}–${m.pens[1]}` : ''}` : <><i className="live-dot" />{minuteLabel}′</>}</span>
      </div>

      {banner && (
        <div key={`${banner.half}-${banner.at}`} className={`goal-banner ${banner.ours ? 'ours' : 'theirs'} ${banner.fast ? 'fast' : ''}`}>
          <span className="gb-word">{banner.ours ? 'BUT !' : `But de ${m.away}`}</span>
          <span className="gb-who">{banner.player} · {banner.minute}′</span>
        </div>
      )}

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
        <div className={`halftime glass ${board ? 'board-open' : 'board-closed'}`}>
          <div className="ht-col">
            <span className="eyebrow">Mi-temps · tes consignes</span>
            <div className="ht-stats">
              <span>Possession <b>{m.stats.possession}%</b></span>
              <span>Tirs <b>{m.stats.shots[0]} – {m.stats.shots[1]}</b></span>
              <span>Cadrés <b>{m.stats.onTarget[0]} – {m.stats.onTarget[1]}</b></span>
            </div>
            <div className="ht-block">
              <span className="eyebrow muted-eyebrow">Pronostic final</span>
              <OddsBar odds={live.secondHalfOdds({ lineup: planned, tactic: tactic2 })} />
            </div>
            {!board && (
              <button type="button" className="ht-compo" onClick={() => setBoard(true)} aria-expanded="false">
                <span className="ht-compo-icon"><IconUsers /></span>
                <span className="ht-compo-text">
                  <b>Composition et changements</b>
                  <em>{formationOf(m.formation).name} · {subsLeft} changement{subsLeft > 1 ? 's' : ''} possible{subsLeft > 1 ? 's' : ''} sur {SUBS_MAX}</em>
                </span>
                <IconChevron className="ht-compo-go" />
              </button>
            )}
            <div className="ht-block ht-b-changes">
              <span className="eyebrow muted-eyebrow">Changements</span>
              <HalftimeChanges state={state} m={m} plan={planned} onReset={() => setPlan([...m.lineup])} />
            </div>
            <div className="ht-block ht-b-tactic">
              <span className="eyebrow muted-eyebrow">Tactique de la seconde période</span>
              <TacticPicker value={tactic2} onChange={setTactic2} compact />
            </div>
          </div>
          {board && <div className="ht-col ht-board">
            <div className="ht-board-head">
              <span className="eyebrow muted-eyebrow">Ton équipe · pastille : note de la première période</span>
              <button type="button" className="linkbtn ht-board-close" onClick={() => setBoard(false)}>Replier</button>
            </div>
            <LineupBoard
              players={state.players}
              lineup={planned}
              formation={m.formation}
              onChange={setPlan}
              original={m.lineup}
              maxIn={SUBS_MAX - m.subsUsed}
              locked={m.sent.home}
              booked={m.booked.home}
              notes={notes}
            />
          </div>}
          <div className="ht-go"><button className="btn btn-xl" onClick={resume}><IconPlay /> Reprendre la seconde période</button></div>
        </div>
      )}

    </div>
  );
}
