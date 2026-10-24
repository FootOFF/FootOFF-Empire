import React, { useEffect, useRef, useState } from 'react';
import { POS_LABELS } from '../game/constants';
import { ATTRS, GK_ATTRS, playerRating, potentialRange } from '../game/players';
import { DRILLS, GREAT, PLAY_MAX, PLAY_MIN, attrsAfter, catsFor, factorOf, programLabel, programNeed, programOf, sessionPreview } from '../game/training';
import { trainPlayer } from '../game/engine';
import { fmtRating } from './format';
import { IconArrowUp, IconCheck, IconClose, IconPlay, IconStar } from './icons';
import { Portrait } from './portrait';
import { useInputMode } from './input';
import { DRILL_TEXT } from './training';
import { haptic } from './haptics';

// Épreuves du centre d'entraînement, en plein écran : pour chaque joueur de la séance, l'intro (épreuve, joueur,
// commandes, gain attendu), le compte à rebours, l'épreuve en 3D (src/three/drills, chargé à la première épreuve),
// le résultat (score, mention, progrès, programme) ; à la fin, le bilan de la séance. Échap (ou B / Start à la
// manette) met en pause : reprendre, ou arrêter là (une épreuve interrompue n'est pas comptée).

const gainTxt = (g) => `+${(Math.max(0, Math.round(g * 100)) / 100).toFixed(2).replace('.', ',')}`;
const dec = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR');
const GREAT_SCORE = (GREAT - PLAY_MIN) / (PLAY_MAX - PLAY_MIN); // score d'une épreuve très réussie
const mention = (sc) => (sc >= 0.85 ? 'Exceptionnel' : sc >= GREAT_SCORE ? 'Très réussie' : sc >= 0.45 ? 'Réussie' : sc >= 0.25 ? 'Correcte' : 'Difficile');
const attrName = (p, k) => (p.pos === 'G' ? GK_ATTRS : ATTRS).find((a) => a.key === k)?.name || k;

// commandes de chaque épreuve, selon le moyen utilisé : [touche ou bouton (null au doigt), explication]
const CONTROLS = {
  precision: { keyboard: ['Espace', 'deux fois : la direction, puis la hauteur, ou glisse à la souris du ballon vers le but'], touch: [null, 'Glisse du ballon vers le but : il part là où ton doigt se lève. Courbe ton geste pour lui donner de l’effet.'], gamepad: ['A', 'deux fois : la direction, puis la hauteur'] },
  sprint: { keyboard: ['Espace', 'au signal, puis pour sauter chaque haie'], touch: [null, 'Touche l’écran au signal, puis pour sauter chaque haie.'], gamepad: ['A', 'au signal, puis pour sauter chaque haie'] },
  lecture: { keyboard: ['1 · 2 · 3', 'ou les flèches puis Espace : la passe choisie'], touch: [null, 'Touche le partenaire à qui faire la passe.'], gamepad: ['Croix puis A', 'pour choisir la passe'] },
  arrets: { keyboard: ['← ↓ →', 'plonger à gauche, rester au centre, plonger à droite'], touch: [null, 'Touche la gauche, le centre ou la droite de l’écran pour plonger.'], gamepad: ['Croix', 'gauche, bas ou droite pour plonger'] },
  coupsFrancs: { keyboard: ['Espace', 'deux fois : la direction, puis la hauteur, ou glisse à la souris du ballon vers le but'], touch: [null, 'Glisse du ballon vers le but, au-dessus du mur : courbe ton geste pour enrouler le ballon autour.'], gamepad: ['A', 'deux fois : la direction, puis la hauteur'] },
  penalties: { keyboard: ['← ↓ →', 'plonger à gauche, rester au centre, plonger à droite'], touch: [null, 'Touche la gauche, le centre ou la droite de l’écran pour plonger.'], gamepad: ['Croix', 'gauche, bas ou droite pour plonger'] },
  centres: { keyboard: ['Espace', 'pour lancer la course, puis pour sauter'], touch: [null, 'Touche l’écran pour lancer la course, puis pour sauter.'], gamepad: ['A', 'pour lancer la course, puis pour sauter'] },
  contre: { keyboard: ['← → ↑', 'passe à gauche, passe à droite, tir (ou 1, 2, 3)'], touch: [null, 'Touche le partenaire à servir, ou « Tir ».'], gamepad: ['Croix', 'gauche, droite pour passer, haut pour tirer'] },
};

// Garde-fou : une erreur dans l'épreuve ne doit jamais emporter le jeu ; on referme simplement l'écran.
export default class DrillScreen extends React.Component {
  constructor(props) { super(props); this.state = { broken: false }; }
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(err) {
    console.warn('[drill] erreur', err);
    this.props.onClose();
  }
  render() { return this.state.broken ? null : <DrillRunner {...this.props} />; }
}

function DrillRunner({ state, queue, run, sound, notify = () => {}, onClose }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const engine = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState('intro'); // intro | count | play | result | summary
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState({});
  const [pops, setPops] = useState([]);
  const [results, setResults] = useState([]);
  const [paused, setPaused] = useState(false);
  const inputMode = useInputMode();
  const item = queue[i];
  const player = item ? state.players.find((q) => q.id === item.id) : null;
  const latest = useRef({});
  latest.current = { state, run, item, phase, paused, i };
  const sfx = (k) => sound?.sfx?.(k);

  // moteur 3D : chargé à part (three.js est déjà là, seules les épreuves arrivent)
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    import('../three/drills/index.js').then(({ createDrillEngine }) => {
      if (!alive || !canvasRef.current) return;
      try {
        engine.current = createDrillEngine(canvasRef.current, {
          onHud: (h) => setHud((x) => ({ ...x, ...h })),
          onPop: (p) => {
            const id = Math.random();
            setPops((list) => [...list.slice(-4), { ...p, id }]);
            setTimeout(() => setPops((list) => list.filter((x) => x.id !== id)), 1300);
          },
          onEnd: (score) => finish(score),
          sfx,
        });
        if (import.meta.env.DEV) window.__drill = engine.current; // essais en développement
        setLoaded(true);
      } catch (e) {
        console.warn('[drill] 3D indisponible', e);
        setFailed(true);
      }
    }).catch(() => setFailed(true));
    return () => { alive = false; engine.current?.dispose(); engine.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // nouvelle épreuve : la scène se met en place derrière l'intro
  useEffect(() => {
    if (!loaded || !item || phase !== 'intro' || !engine.current) return;
    setHud({});
    try {
      engine.current.load(item.drill, { pos: item.pos });
    } catch (e) {
      console.warn('[drill] épreuve indisponible', e);
      setFailed(true);
    }
  }, [loaded, i]); // eslint-disable-line react-hooks/exhaustive-deps

  // compte à rebours, puis l'épreuve
  useEffect(() => {
    if (phase !== 'count') return undefined;
    if (count <= 0) {
      sfx('go');
      engine.current?.start();
      setPhase('play');
      wrapRef.current?.focus();
      return undefined;
    }
    sfx('beep');
    const t = setTimeout(() => setCount((c) => c - 1), 720);
    return () => clearTimeout(t);
  }, [phase, count]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { engine.current?.pause(paused); }, [paused]);

  const begin = () => { setCount(3); setPhase('count'); };
  // épreuve finie (score de 0 à 1) ou simulée (null) : la séance la compte, le résultat s'affiche
  function finish(score) {
    const { run: runNow, item: it } = latest.current;
    let got = null;
    runNow((s) => {
      const ns = trainPlayer(s, it.pos, { id: it.id, cat: it.cat, drill: it.drill, score });
      got = ns ? ns.training.done[it.pos] : null;
      return ns;
    }, 'Épreuve impossible.');
    if (got) {
      setResults((r) => [...r, got]);
      if (score !== null) haptic(score >= GREAT_SCORE ? 'goal' : 'tap');
      if (got.learned) setTimeout(() => sfx('perfect'), 400);
    }
    setPhase('result');
  }
  const next = () => {
    if (i + 1 < queue.length) { setI(i + 1); setPhase('intro'); setPops([]); } else if (queue.length > 1) setPhase('summary'); else close();
  };
  const nextRef = useRef(null);
  const closeRef = useRef(null);
  nextRef.current = () => next();
  closeRef.current = () => close();
  const close = () => {
    const total = results.reduce((a, r) => a + r.gain, 0);
    if (results.length) {
      const learned = results.find((r) => r.learned);
      notify({
        kind: 'training', eyebrow: results.length > 1 ? 'Séance terminée' : 'Épreuve terminée',
        title: learned ? `${learned.name} acquiert le signe ${programLabel(learned.learned)}` : `${gainTxt(total)} de niveau`,
        text: results.map((r) => `${r.name} ${gainTxt(r.gain)}`).join(' · '),
        action: { panel: 'training', tab: 'session' },
      });
    }
    onClose();
  };

  // commandes pendant l'épreuve : toucher / clic, clavier, manette (A lu directement ; B et Start donnent Échap)
  useEffect(() => {
    const onKey = (e) => {
      const { phase: ph, paused: pz } = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (ph === 'play' || ph === 'count') setPaused((v) => !v);
        else if (ph === 'result') nextRef.current();
        else closeRef.current();
        return;
      }
      if (ph !== 'play' || pz) return;
      const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) engine.current?.press({ key: true }); } else if (dirs[e.key]) { e.preventDefault(); engine.current?.dir(dirs[e.key]); } else if (/^[1-4]$/.test(e.key)) { e.preventDefault(); engine.current?.press({ index: Number(e.key) - 1 }); }
    };
    const onKeyUp = (e) => { if ((e.key === ' ' || e.key === 'Enter') && latest.current.phase === 'play') engine.current?.release({ key: true }); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    let raf = 0;
    let wasA = false;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.() || [];
      const a = [...pads].some((gp) => gp?.connected && (gp.buttons[0]?.pressed || gp.buttons[0]?.value > 0.5));
      if (a && !wasA && latest.current.phase === 'play' && !latest.current.paused) engine.current?.press({ pad: true });
      wasA = a;
    };
    if (navigator.getGamepads) raf = requestAnimationFrame(poll);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // doigt ou souris : appui (avec sa position), glissé (frappes : le tracé doré suit le doigt), relâché
  const [trail, setTrail] = useState(null);
  const dragging = useRef(false);
  const local = (e) => { const r = wrapRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r]; };
  const onPointerDown = (e) => {
    if (phase !== 'play' || paused || e.target.closest('button')) return;
    const [x, y, r] = local(e);
    dragging.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    if (hud.swipe) setTrail([[x, y]]);
    engine.current?.press({ x, y, cx: e.clientX, cy: e.clientY, w: r.width, h: r.height, pointer: true });
  };
  const onPointerMove = (e) => {
    if (!dragging.current || phase !== 'play') return;
    const [x, y] = local(e);
    engine.current?.move({ x, y, cx: e.clientX, cy: e.clientY, pointer: true });
    setTrail((t) => (t ? [...t.slice(-60), [x, y]] : t));
  };
  const onPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    setTimeout(() => setTrail(null), 260);
    if (phase === 'play') engine.current?.release({ cx: e.clientX, cy: e.clientY, pointer: true });
  };

  const cat = item ? catsFor(item.pos)[item.cat] : null;
  const ctl = item ? (CONTROLS[item.drill]?.[inputMode] || CONTROLS[item.drill]?.keyboard) : null;
  const last = results[results.length - 1];
  return (
    <div
      ref={wrapRef}
      className={`drill drill-${item?.drill || 'none'} ph-${phase}`}
      tabIndex={-1}
      role="dialog"
      aria-label="Épreuve d’entraînement"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="drill-canvas" />
      <div className="drill-shade" aria-hidden="true" />
      {!loaded && !failed && <div className="drill-loading"><span className="drill-spinner" aria-hidden="true" />Préparation du terrain…</div>}
      {failed && (
        <div className="drill-card drill-fail">
          <h3>Épreuve en 3D indisponible</h3>
          <p>Ton appareil n’a pas pu afficher le terrain d’entraînement. Tu peux simuler l’épreuve : le gain moyen est assuré.</p>
          <div className="drill-actions">
            <button type="button" className="btn ghost" onClick={close}>Fermer</button>
            {item && phase === 'intro' && <button type="button" className="btn" onClick={() => finish(null)}>Simuler</button>}
          </div>
        </div>
      )}

      {/* tableau de bord de l'épreuve */}
      {item && (phase === 'play' || phase === 'count') && (
        <div className="drill-hud" aria-live="polite">
          <div className="drill-hud-left">
            <span className="eyebrow"><span className="hide-sm">Épreuve {i + 1} / {queue.length} · </span>{cat?.label}</span>
            <strong>{DRILLS[item.drill].label}</strong>
            <span className="drill-who">{player && <Portrait p={player} size={26} />}{player?.name}</span>
          </div>
          <div className="drill-hud-right">
            {hud.chrono ? <b className="drill-points drill-chrono">{hud.chrono}</b> : <b className="drill-points">{hud.points ?? 0}<small> / {hud.max ?? 0}</small></b>}
            {hud.rounds > 0 && (
              <span className="drill-pips" aria-label={`Tentative ${hud.round} sur ${hud.rounds}`}>
                {Array.from({ length: hud.rounds }, (_, k) => <i key={k} className={k < (hud.round || 0) - 1 ? 'done' : k === (hud.round || 0) - 1 ? 'on' : ''} />)}
              </span>
            )}
            {hud.timer != null && <span className="drill-timer"><i style={{ width: `${Math.max(0, Math.min(1, hud.timer)) * 100}%` }} /></span>}
          </div>
          {hud.prompt && phase === 'play' && (
            <div className="drill-prompt">
              <span>{hud.prompt}</span>
              {hud.action && ctl?.[0] && <kbd>{ctl[0]}</kbd>}
            </div>
          )}
        </div>
      )}
      {item?.drill === 'lecture' && phase !== 'summary' && <div className="drill-tablet" aria-hidden="true"><span>Analyse vidéo</span></div>}
      {phase === 'play' && hud.swipe && hud.hint && !trail && (
        <span className="drill-swipe-hint" style={{ left: hud.hint.x, top: hud.hint.y }} aria-hidden="true"><IconArrowUp /></span>
      )}
      {trail && trail.length > 1 && (
        <svg className="drill-trail" aria-hidden="true"><polyline points={trail.map(([x, y]) => `${x},${y}`).join(' ')} /></svg>
      )}
      {phase === 'play' && hud.marks?.map((m) => (
        <span key={m.n} className={`drill-mark ${m.on ? 'on' : ''}`} style={{ left: m.x, top: m.y }} aria-hidden="true">{m.n}</span>
      ))}
      {pops.map((p) => (
        <span key={p.id} className={`drill-pop ${p.tone || ''}`} style={{ left: p.at?.x ?? '50%', top: p.at?.y ?? '40%' }}>
          <b>{p.points}</b><em>{p.text}</em>
        </span>
      ))}
      {phase === 'count' && <div className="drill-count" key={count}>{count > 0 ? count : 'Go'}</div>}

      {/* intro */}
      {item && player && phase === 'intro' && loaded && (
        <Intro state={state} item={item} p={player} index={i} total={queue.length} ctl={ctl} onGo={begin} onSim={() => finish(null)} onQuit={close} />
      )}
      {/* résultat d'une épreuve */}
      {phase === 'result' && last && (
        <Result r={last} p={player} item={item} last={i + 1 >= queue.length} single={queue.length === 1} onNext={next} />
      )}
      {phase === 'summary' && <Summary results={results} onClose={close} />}
      {paused && (
        <div className="drill-pause">
          <div className="drill-card">
            <span className="eyebrow">Pause</span>
            <h3>{DRILLS[item?.drill]?.label}</h3>
            <p>Si tu t’arrêtes maintenant, cette épreuve n’est pas comptée : tu pourras la refaire avant le match.</p>
            <div className="drill-actions">
              <button type="button" className="btn ghost" onClick={close}>Arrêter là</button>
              <button type="button" className="btn" autoFocus onClick={() => setPaused(false)}><IconPlay /> Reprendre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Intro({ state, item, p, index, total, ctl, onGo, onSim, onQuit }) {
  const pv = sessionPreview(state, p, item.cat, item.drill);
  const after = attrsAfter(state, p, item.cat, item.drill);
  const pool = p.pos === 'G' ? p.g : p.a;
  const prog = programOf(state, p.id);
  const pot = potentialRange(p, state);
  return (
    <div className="drill-card drill-intro">
      <button type="button" className="hud-icon drill-later" onClick={onQuit} aria-label="Plus tard"><IconClose /></button>
      <span className="eyebrow">Épreuve {index + 1} / {total} · {POS_LABELS[item.pos].toLowerCase()} · {catsFor(item.pos)[item.cat].label.toLowerCase()}</span>
      <h2>{DRILLS[item.drill].label}</h2>
      <p className="drill-rule">{DRILL_TEXT[item.drill]}</p>
      <div className="drill-player">
        <Portrait p={p} size={48} />
        <span>
          <b>{p.name}</b>
          <em>{p.age} ans · niveau {fmtRating(playerRating(p))}{pot ? ` · pot. ${fmtRating(pot[0])} – ${fmtRating(pot[1])}` : ''}</em>
        </span>
      </div>
      {ctl && <p className="drill-controls">{ctl[0] && <kbd>{ctl[0]}</kbd>}<span>{ctl[1]}</span></p>}
      <div className="drill-stakes">
        <div><span>Parfaite</span><b>{gainTxt(pv.max)}</b></div>
        <div><span>Simulée</span><b>{gainTxt(pv.sim)}</b></div>
        <div><span>Ratée</span><b>{gainTxt(pv.min)}</b></div>
      </div>
      <p className="drill-attrs">{catsFor(item.pos)[item.cat].attrs.map((k) => `${attrName(p, k)} ${pool[k].toFixed(2).replace('.', ',')} → ${after[k].toFixed(2).replace('.', ',')}`).join(' · ')} <em>(simulée)</em></p>
      {prog && <p className="drill-prog-line">Programme {programLabel(prog.id)} : {prog.steps} / {programNeed(state, prog)} séances</p>}
      <div className="drill-actions">
        <button type="button" className="btn ghost" onClick={onSim}>Simuler</button>
        <button type="button" className="btn" autoFocus onClick={onGo}><IconPlay /> C’est parti</button>
      </div>
    </div>
  );
}

function Result({ r, last, single, onNext }) {
  const sc = r.score;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (sc === null) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 900); setShown(Math.round(sc * 100 * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sc]);
  const steps = r.steps;
  return (
    <div className="drill-card drill-result">
      <span className="eyebrow">{r.name} · {DRILLS[r.drill].label}</span>
      {sc !== null ? (
        <div className="drill-score">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="track" />
            <circle cx="60" cy="60" r="52" className="fill" style={{ strokeDasharray: `${(shown / 100) * 326.7} 326.7` }} />
          </svg>
          <b>{shown} %</b>
          <em>{mention(sc)}</em>
        </div>
      ) : <h2 className="drill-sim">Épreuve simulée</h2>}
      <div className="drill-gain">
        <b>{gainTxt(r.gain)}</b>
        <span>niveau {fmtRating(r.before)} <IconArrowUp /> {fmtRating(r.after)}</span>
      </div>
      {sc !== null && <p className="drill-factor">Gain ×{dec(factorOf(sc))} par rapport à une épreuve simulée.</p>}
      {r.learned ? (
        <p className="drill-learned"><IconStar /> Signe distinctif acquis : <b>{programLabel(r.learned)}</b></p>
      ) : steps ? (
        <p className="drill-prog-line">Programme {programLabel(steps[2])} : {steps[0]} / {steps[1]} séances{sc !== null && sc >= GREAT_SCORE ? ' (épreuve très réussie : deux pas)' : ''}</p>
      ) : null}
      <div className="drill-actions">
        <button type="button" className="btn" autoFocus onClick={onNext}>{single ? <><IconCheck /> Terminer</> : last ? <><IconCheck /> Voir le bilan</> : <><IconPlay /> Épreuve suivante</>}</button>
      </div>
    </div>
  );
}

function Summary({ results, onClose }) {
  const total = results.reduce((a, r) => a + r.gain, 0);
  return (
    <div className="drill-card drill-summary">
      <span className="eyebrow">Séance terminée</span>
      <h2>{gainTxt(total)} de niveau</h2>
      <ul>
        {results.map((r, k) => (
          <li key={k}>
            <b>{r.name}</b>
            <span>{DRILLS[r.drill].label} · {r.score === null ? 'simulée' : `${Math.round(r.score * 100)} %`}{r.learned ? ` · ${programLabel(r.learned)} acquis` : ''}</span>
            <em>{gainTxt(r.gain)}</em>
          </li>
        ))}
      </ul>
      <div className="drill-actions">
        <button type="button" className="btn" autoFocus onClick={onClose}><IconCheck /> Retour au centre</button>
      </div>
    </div>
  );
}
