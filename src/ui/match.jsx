import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TACTICS, TACTIC_ORDER, formationOf, lineupRating, reshapeLineup } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { SUBS_MAX, createLiveMatch, pairSubs, prematchOdds, prematchXg, subMinute } from '../game/live';
import { absenceOf, available, fitAt } from '../game/players';
import { BestEleven, FormationPicker, LineupBoard, displayNames } from './lineup';
import { IconChevron, IconClose, IconMute, IconPlay, IconSound, IconUsers } from './icons';
import { IconMedic } from './kit';
import { IconBall, IconSwap, IconWhistle } from './kit';
import { useKeydown } from './presence';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';
import { ClubCrest, Crest } from './crest';
import { clubStars } from '../game/crest';

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

// Carte de la composition repliée (avant-match, mi-temps) : un toucher la déploie.
function CompoCard({ title, detail, onOpen }) {
  return (
    <button type="button" className="compo-card" onClick={onOpen} aria-expanded="false">
      <span className="compo-card-icon"><IconUsers /></span>
      <span className="compo-card-text"><b>{title}</b><em>{detail}</em></span>
      <IconChevron className="compo-card-go" />
    </button>
  );
}

const narrowScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

// Joueurs indisponibles pour le match (blessés, suspendus), sous la composition.
function Absent({ players }) {
  const list = players.map((p) => [p, absenceOf(p)]).filter(([, a]) => a);
  if (!list.length) return null;
  return (
    <p className="pm-absent">
      <span className="eyebrow muted-eyebrow">Absents</span>
      {list.map(([p, a]) => <span key={p.id} className={`pm-absent-one ${a.kind}`}><b>{p.name}</b> {a.label.toLowerCase()}</span>)}
    </p>
  );
}

// --- Avant-match -------------------------------------------------------------------------------------
// En haut, l'affiche et ce qui l'entoure (niveaux, affluence, recettes) ; puis la composition, le dispositif et la
// tactique ; en bas, collés à l'écran, le pronostic et le coup d'envoi : chaque réglage montre aussitôt son effet sur
// les chances de victoire, juste au-dessus du bouton qui lance le match. Sur téléphone, la composition est repliée
// dans une carte, comme à la mi-temps (dépliée, elle cachait tout le reste de l'avant-match).

export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [formation, setFormation] = useState(formationOf(state.formation).id);
  const [board, setBoard] = useState(() => !narrowScreen()); // composition dépliée sur PC, repliée sur téléphone
  const rating = lineupRating(state.players, lineup, formation);
  const xg = prematchXg(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // même moteur que le pronostic
  const odds = prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // calculé sur le moteur
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); };
  const form = formationOf(formation);

  useKeydown((e) => { if (e.key === 'Escape') onCancel(); });

  return (
    <div className={`matchscreen prematch ${board ? 'board-open' : 'board-closed'}`}>
      <header className="ms-head">
        <div>
          <span className={`eyebrow hm-comp-${ctx.comp || 'league'}`}>{ctx.label || `Journée ${state.round + 1} / 7`} · à domicile</span>
          <h2 className="ms-versus">
            <span className="ms-side"><ClubCrest crest={state.crest} name={state.clubName} className="ms-crest" stars={clubStars(state)} />{state.clubName}</span>
            {/* « vs » reste avec l'adversaire : sur une ligne étroite, il passe à la ligne avec lui */}
            <span className="ms-side"><em>vs</em><Crest name={ctx.opp.name} className="ms-crest" />{ctx.opp.name}</span>
          </h2>
          <div className="pm-facts">
            <span>Niveau <b>{fmtRating(rating)}</b> contre <b>{fmtRating(ctx.opp.strength)}</b></span>
            {ctx.gate && <span>Affluence <b>{fmtNum(ctx.gate.attendance)}</b> / {fmtNum(ctx.gate.capacity)}</span>}
            {ctx.gate && <span>Recettes ≈ <b>{fmtMoney(ctx.gate.revenue)}</b></span>}
          </div>
        </div>
        <button className="hud-icon" onClick={onCancel} aria-label="Retour"><IconClose /></button>
      </header>

      <div className="pm-grid">
        {board && (
          <section className="pm-pitch-wrap glass">
            <div className="pm-sub">
              <span className="eyebrow">Onze de départ · <span className="nowrap">{form.name}</span></span>
              <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
              <span className="pm-rating">Niveau <b>{fmtRating(rating)}</b></span>
              <button type="button" className="linkbtn pm-fold" onClick={() => setBoard(false)}>Replier</button>
            </div>
            <LineupBoard players={state.players} lineup={lineup} formation={formation} onChange={setLineup} fitness={(p) => fitAt(p, 0)} />
            <Absent players={state.players} />
          </section>
        )}

        <section className="pm-side">
          {!board && (
            <div className="pm-compo">
              <CompoCard title="Composition" detail={`Onze en ${form.name} · niveau ${fmtRating(rating)}`} onOpen={() => setBoard(true)} />
              <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
            </div>
          )}
          <div className="glass pm-card">
            <span className="eyebrow">Dispositif</span>
            <FormationPicker value={formation} onChange={reshape} />
            <p className="pm-blurb">{form.blurb}</p>
          </div>
          <div className="glass pm-card">
            <span className="eyebrow">Tactique</span>
            <TacticPicker value={tactic} onChange={setTactic} />
          </div>
          <div className="pm-go">
            <div className="pm-odds glass">
              <div className="pm-odds-head">
                <span className="eyebrow">Pronostic</span>
                <span className="pm-xg">Buts attendus <b>{fmtRating(xg.for)}</b> – <b>{fmtRating(xg.against)}</b></span>
              </div>
              <OddsBar odds={odds} />
              {ctx.knockout && <div className="pm-xg">Élimination directe : tirs au but en cas d’égalité · qualification ≈ <b>{Math.round((odds.win + odds.draw * 0.5) * 100)} %</b></div>}
              <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation)}><IconPlay /> Coup d’envoi</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------

const ICON = { goal: <IconBall />, sub: <IconSwap />, injury: <IconMedic />, kickoff: <IconWhistle />, halftime: <IconWhistle />, fulltime: <IconWhistle /> };
const LOOKAHEAD = 14; // minutes simulées d'avance sur l'horloge : la scène 3D prépare chaque action avant son commentaire

// Les classes tirées des données du match sont toujours préfixées (ev-side-…, ev-out-…) : un nom nu comme
// « post » (tir sur le poteau) prenait les styles de l'écran d'après-match (.post) et figeait la ligne en haut du fil.
// Ligne mémorisée : l'horloge du direct avance vingt fois par seconde, le fil ne se redessine pas pour autant.
const EventRow = React.memo(function EventRow({ e }) {
  return (
    <li className={['ev', `ev-${e.type}`, e.side && `ev-side-${e.side}`, e.outcome && `ev-out-${e.outcome}`].filter(Boolean).join(' ')}>
      <span className="ev-min">{e.minute}′</span>
      <span className="ev-icon">{e.type === 'yellow' || e.type === 'red' ? <i className={`card ${e.type}`} /> : ICON[e.type] || null}</span>
      <span className="ev-text">{e.type === 'goal' && e.lead ? <><span className="ev-lead">{e.lead}</span> {e.text}</> : e.text}</span>
    </li>
  );
});

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
  const [phase, setPhase] = useState('playing'); // playing | subs (changement en cours de jeu) | halftime | fulltime
  // événements de la mi-temps en cours : un tableau que le moteur remplit au fil de l'horloge (advanceTo), avec
  // quelques minutes d'avance ; la scène 3D lit le même tableau
  const [events, setEvents] = useState(() => { live.beginHalf(1); live.advanceTo(LOOKAHEAD); return live.eventsOf(1); });
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
  const [plan, setPlan] = useState(null); // onze composé sur le terrain (mi-temps, changement en cours de jeu)
  const [tactic2, setTactic2] = useState(live.state.tactic);
  const [board, setBoard] = useState(false); // composition repliée : on la déploie pour faire ses changements
  const [sub, setSub] = useState(null); // changement en cours de jeu : { at: minute d'effet, note, err }
  const [lineupKey, setLineupKey] = useState(0); // le onze a changé : la scène 3D relit les noms

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // scène 3D : elle lit l'horloge et les événements de la mi-temps dans le canal du direct
  const homeNames = () => live.state.lineup.map((id) => state.players.find((p) => p.id === id)?.name || '');
  useEffect(() => {
    Object.assign(matchFeed, {
      active: !preview, ended: false, phase: 'playing', half: 1, clock: 0, speed: 1, pause: 0, events,
      formation: live.state.formation, homeNames: homeNames(), awayNames: live.state.awayRoster.map((p) => p.name),
      awayName: live.state.away, skipped: 0, rewound: 0,
    });
    return () => { matchFeed.active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Object.assign(matchFeed, { phase: phase === 'subs' ? 'playing' : phase, half, events, speed, homeNames: homeNames(), rewound: live.state.rewound });
    if (phase === 'fulltime') matchFeed.ended = true;
  }, [phase, half, events, speed, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // aperçu (galerie) : direct déjà entamé, mi-temps, ou changement en cours de jeu
  useEffect(() => {
    if (!preview) return;
    const halftime = preview.phase === 'halftime';
    live.advanceTo(Infinity);
    const upTo = halftime ? Infinity : preview.minute;
    const seen = events.filter((e) => e.at <= upTo);
    revealed.current = seen.length;
    setShown([...seen].reverse());
    const t = halftime ? live.halfEnd : preview.minute;
    clockRef.current = t;
    setClock(t);
    if (halftime) setPhase('halftime');
    else if (preview.phase === 'subs') openSubs(null, true);
    else pause.current = Infinity; // vignette figée sur la minute demandée
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // coup de sifflet final : un court temps de respiration (« Terminé »), puis l'écran d'après-match
  const finished = useRef(false);
  useEffect(() => {
    if (phase !== 'fulltime' || finished.current) return undefined;
    const t = setTimeout(() => { finished.current = true; onFinish(live.result()); }, 1700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // horloge : avance le temps de jeu, simule quelques minutes d'avance, révèle les événements, marque une pause sur
  // les buts
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
      live.advanceTo(Math.ceil(clockRef.current) + LOOKAHEAD);
      let next = Math.min(end, clockRef.current + (dt * speed) / SEC_PER_MIN);
      // la 3D finit son action (tir en vol, faute pas encore commise) : le commentaire attend que le ballon arrive,
      // au plus quelques secondes (matchFeed.js)
      const up = events[revealed.current];
      if (up && matchFeed.waitAt === up.at && now < matchFeed.waitUntil && next >= up.at) next = Math.max(clockRef.current, up.at - 1e-6);
      clockRef.current = next;
      matchFeed.clock = next;
      setClock(Math.ceil(next)); // l'écran n'affiche que la minute : un rendu par minute de jeu, pas vingt par seconde
      while (revealed.current < events.length && events[revealed.current].at <= next) {
        const e = events[revealed.current++];
        setShown((s) => [e, ...s]);
        react(e);
        if (e.type === 'goal' || e.type === 'injury') break; // la suite attendra la fin de la célébration, ou le changement
      }
      if (next >= end && live.halfDone && revealed.current >= events.length) {
        setPhase(half === 1 ? 'halftime' : 'fulltime');
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, speed, events, half]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = live.state;
  const subsLeftNow = () => SUBS_MAX - m.subsUsed;
  // remplaçants qui peuvent encore entrer : disponibles (ni blessés ni suspendus), pas déjà sortis
  const benchReady = () => state.players.some((p) => !m.lineup.includes(p.id) && available(p) && !m.gone.has(p.id) && !m.out.has(p.id));
  const canSub = () => subsLeftNow() > 0 && benchReady() && subMinute(clockRef.current) <= live.halfEnd;

  // changement en cours de jeu : le match s'arrête, la composition s'ouvre ; le changement prendra effet au prochain
  // arrêt de jeu (une à deux minutes plus tard, après tout ce que le direct a montré)
  function openSubs(note = null, open = false) {
    const at = subMinute(clockRef.current);
    setPlan([...m.lineup]);
    setTactic2(m.tactic);
    setBoard(open || !narrowScreen());
    setSub({ at, note, err: null });
    matchFeed.pause = 1e9; // la scène 3D attend
    setPhase('subs');
  }
  function closeSubs(apply) {
    if (apply && sub) {
      const err = live.change(sub.at, { lineup: plan, tactic: tactic2 });
      if (err) { setSub((x) => ({ ...x, err })); return; }
      live.advanceTo(Math.ceil(clockRef.current) + LOOKAHEAD);
      setLineupKey((k) => k + 1);
    }
    setSub(null);
    matchFeed.pause = Math.max(0, pause.current);
    setPhase('playing');
  }

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
    else if (e.type === 'injury') { // un blessé : s'il reste un changement, le match s'arrête pour le faire
      sound.whistle(1);
      if (canSub()) openSubs(`${e.player} est blessé et ne peut pas continuer : fais entrer un remplaçant, ou continue à dix.`);
    } else if (e.type === 'halftime') { sound.whistle(2); onFx({ type: 'halftime' }); }
    else if (e.type === 'fulltime') { sound.whistle(3); onFx({ type: 'fulltime' }); }
  }

  const skip = () => { // fin de la mi-temps en cours, sans célébration
    live.advanceTo(Infinity);
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

  const resume = () => { // reprise de la seconde période, avec les changements et la tactique de la pause
    live.change(45, { lineup: plan || m.lineup, tactic: tactic2, halftime: true });
    live.beginHalf(2);
    live.advanceTo(45 + LOOKAHEAD);
    const h2 = live.eventsOf(2);
    setEvents(h2);
    revealed.current = 0;
    clockRef.current = 45;
    matchFeed.clock = 45;
    setClock(45);
    setHalf(2);
    setPhase('playing');
    sound.whistle(1);
  };

  useEffect(() => { if (phase === 'halftime') { setPlan([...m.lineup]); setTactic2(m.tactic); setBoard(!!preview?.board); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = plan || m.lineup;
  const plannedSubs = pairSubs(m.lineup, planned).length; // changements prévus sur le terrain
  const subsLeft = SUBS_MAX - m.subsUsed - plannedSubs; // changements encore possibles
  const boardOpen = phase === 'halftime' || phase === 'subs';
  // notes du match à cet instant (aide à choisir qui sort)
  const notes = useMemo(() => (boardOpen
    ? Object.fromEntries(live.result().players.filter(Boolean).map((x) => [x.id, x.rating])) : {}), [boardOpen, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const since = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : clockRef.current);
  const unavailable = useMemo(() => new Set([...state.players.filter((p) => !available(p)).map((p) => p.id), ...m.gone, ...m.out]), [boardOpen, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;
  const oddsMinute = phase === 'halftime' ? 45 : sub?.at ?? minute;

  const boardEl = (
    <LineupBoard
      players={state.players}
      lineup={planned}
      formation={m.formation}
      onChange={setPlan}
      original={m.lineup}
      maxIn={SUBS_MAX - m.subsUsed}
      locked={m.sent.home}
      hurt={m.out}
      unavailable={unavailable}
      booked={m.booked.home}
      notes={notes}
      fitness={(p) => fitAt(p, oddsMinute, since(p.id))}
    />
  );

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''}`}>
      <div className="scoreboard glass">
        <span className="sb-team"><ClubCrest crest={state.crest} name={m.home} className="sb-crest" stars={clubStars(state)} /><span className="sb-name">{m.home}</span></span>
        <span className="sb-score"><b key={`h${goalsH}`}>{goalsH}</b><i>–</i><b key={`a${goalsA}`}>{goalsA}</b></span>
        <span className="sb-team right"><span className="sb-name">{m.away}</span><Crest name={m.away} className="sb-crest" /></span>
        <span className="sb-clock">{phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Terminé${m.pens ? ` · t.a.b. ${m.pens[0]}–${m.pens[1]}` : ''}` : <><i className={`live-dot ${phase === 'subs' ? 'hold' : ''}`} />{minuteLabel}′</>}</span>
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
            <span>Possession <b>{m.stats.possession} %</b></span>
            <span>Tirs <b>{shown.filter((e) => (e.type === 'chance' || e.type === 'goal') && e.side === 'home').length} – {shown.filter((e) => (e.type === 'chance' || e.type === 'goal') && e.side === 'away').length}</b></span>
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
          <button className="lc-sub" onClick={() => openSubs()} disabled={!canSub()} title={canSub() ? 'Faire un changement ou changer de tactique' : subsLeftNow() <= 0 ? 'Plus de changement disponible' : 'Attends la mi-temps'}>
            <IconSwap /><span className="hide-sm"> Changement</span><small>{subsLeftNow()}</small>
          </button>
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

      {boardOpen && (
        <div className={`halftime glass ${phase === 'subs' ? 'subs' : ''} ${board ? 'board-open' : 'board-closed'}`}>
          <div className="ht-col">
            <span className="eyebrow">{phase === 'halftime' ? 'Mi-temps · tes consignes' : `${minuteLabel}′ · changement`}</span>
            {phase === 'subs' && (
              <p className={`ht-note ${sub?.note ? 'warn' : ''}`}>{sub?.note || `Le match est arrêté. Ce que tu décides prend effet à la ${sub?.at}e minute, au prochain arrêt de jeu.`}</p>
            )}
            <div className="ht-stats">
              <span>Possession <b>{m.stats.possession} %</b></span>
              <span>Tirs <b>{m.stats.shots[0]} – {m.stats.shots[1]}</b></span>
              <span>Cadrés <b>{m.stats.onTarget[0]} – {m.stats.onTarget[1]}</b></span>
            </div>
            <div className="ht-block">
              <span className="eyebrow muted-eyebrow">Pronostic final</span>
              <OddsBar odds={live.oddsFrom(oddsMinute, { lineup: planned, tactic: tactic2 })} />
            </div>
            {!board && (
              <CompoCard
                title="Composition et changements"
                detail={`${formationOf(m.formation).name} · ${plannedSubs ? `${plannedSubs} changement${plannedSubs > 1 ? 's' : ''} prévu${plannedSubs > 1 ? 's' : ''} · ` : ''}${subsLeft} possible${subsLeft > 1 ? 's' : ''} sur ${SUBS_MAX}`}
                onOpen={() => setBoard(true)}
              />
            )}
            {board && ( /* repliée, la carte résume les changements : rien d'autre de la composition à l'écran */
              <div className="ht-block ht-b-changes">
                <span className="eyebrow muted-eyebrow">Changements</span>
                <HalftimeChanges state={state} m={m} plan={planned} onReset={() => setPlan([...m.lineup])} />
              </div>
            )}
            <div className="ht-block ht-b-tactic">
              <span className="eyebrow muted-eyebrow">{phase === 'halftime' ? 'Tactique de la seconde période' : 'Tactique'}</span>
              <TacticPicker value={tactic2} onChange={setTactic2} compact />
            </div>
            {sub?.err && <p className="ht-note warn">{sub.err}</p>}
          </div>
          {board && <div className="ht-col ht-board">
            <div className="ht-board-head">
              <span className="eyebrow muted-eyebrow">Ton équipe · pastille : note du match · barre : condition</span>
              <button type="button" className="linkbtn ht-board-close" onClick={() => setBoard(false)}>Replier</button>
            </div>
            {boardEl}
          </div>}
          <div className="ht-go">
            {phase === 'halftime'
              ? <button className="btn btn-xl" onClick={resume}><IconPlay /> Reprendre la seconde période</button>
              : <>
                <button className="btn ghost btn-xl" onClick={() => closeSubs(false)}>Annuler</button>
                <button className="btn btn-xl" onClick={() => closeSubs(true)}><IconPlay /> Reprendre</button>
              </>}
          </div>
        </div>
      )}

    </div>
  );
}
