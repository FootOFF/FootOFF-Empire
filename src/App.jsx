import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMatchResult, applyOffline, build, createInitialState, dismissOffline, dismissReview, endSeason, matchContext, upgrade,
} from './game/engine';
import { BUILDINGS } from './game/constants';
import { clearGame, loadGame, saveGame } from './game/save';
import { clone } from './game/utils';
import Onboarding from './ui/Onboarding';
import Empire2D from './ui/EmpireView';
import { Dock, GameMenu, MatchCta, ObjectiveWidget, SceneTools, Toasts, TopHud } from './ui/hud';
import { JournalPanel, SeasonPanel, SquadPanel } from './ui/panels';
import PlotInspector from './ui/inspector';
import { MatchResult, OfflineReturn, SeasonReview } from './ui/overlays';
import { LiveMatch, PreMatch } from './ui/match';
import { CoachCard, StaffTip } from './ui/guide';
import { actionablePlots, dockSignals, staffTip } from './game/advice';
import { advanceTutorial, setTutorialStep, stepContent } from './game/tutorial';
import { createStadiumSound } from './ui/sound';

// three.js et la scène vivent dans un chunk séparé, chargé à l'entrée dans le jeu.
const Empire3D = lazy(() => import('./ui/Empire3D'));

function cycle(current, order, storageKey) {
  const next = order[(order.indexOf(current) + 1) % order.length];
  try { localStorage.setItem(storageKey, next); } catch { /* stockage indisponible */ }
  return next;
}

export default function App() {
  const [state, setState] = useState(loadGame);
  const [panel, setPanel] = useState(null);
  const [sel, setSel] = useState(null);
  const [toasts, setToasts] = useState([]);
  // préférences de vue (confort, par navigateur) : heure réelle / jour / nuit, météo auto / forcée
  const [timeMode, setTimeMode] = useState(() => { try { return localStorage.getItem('fo-time') || 'auto'; } catch { return 'auto'; } });
  const [weatherMode, setWeatherMode] = useState(() => { try { return localStorage.getItem('fo-weather') || 'auto'; } catch { return 'auto'; } });
  const [matchDay, setMatchDay] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [goalCollapsed, setGoalCollapsed] = useState(() => window.innerWidth < 760); // replié sur mobile
  const [menu, setMenu] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  // match : null → 'prematch' (onze + tactique) → 'live' (direct) → résumé (showResult)
  const [matchPhase, setMatchPhase] = useState(null);
  const [matchCtx, setMatchCtx] = useState(null);
  const [matchFx, setMatchFx] = useState(null); // effets 3D du direct : but, but encaissé, mi-temps…
  const [dismissedTips, setDismissedTips] = useState(() => new Set()); // conseils masqués (session)
  const sound = useRef(null);
  if (!sound.current) sound.current = createStadiumSound();
  const toastId = useRef(0);

  useEffect(() => { if (state) saveGame(state); }, [state]);
  // revenus hors ligne calculés une seule fois au chargement
  useEffect(() => { setState((prev) => (prev ? applyOffline(clone(prev)) : prev)); }, []);

  const toast = useCallback((text, tone) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  if (!state) {
    return <Onboarding onCreate={(name) => setState(createInitialState(name))} />;
  }

  const run = (fn, failMsg) => {
    const ns = fn(clone(state));
    if (!ns) { toast(failMsg || 'Action impossible.', 'warn'); return false; }
    setState(advanceTutorial(ns)); // une étape du tutoriel se valide dès que son objectif est atteint
    return true;
  };

  const openPanel = (id) => {
    if (id === 'stadium') { setPanel(null); setSel({ plotId: 't0', sector: 'main' }); return; } // accès direct au stade
    setPanel(id);
    if (id) setSel(null);
  };
  const selectPlot = (plotId, sector) => { setSel({ plotId, sector }); setPanel(null); };
  const play = () => { // ouvre l'avant-match, le stade passe en configuration jour de match
    const ctx = matchContext(state);
    if (!ctx) return;
    setMatchCtx(ctx);
    setPanel(null); setSel(null); setMenu(false);
    setMatchDay(true);
    setMatchPhase('prematch');
  };
  const cancelMatch = () => { setMatchPhase(null); setMatchDay(false); };
  const kickoff = (lineup, tactic) => {
    if (run((s) => { s.lineup = lineup; s.tactic = tactic; return s; })) setMatchPhase('live');
  };
  const finishMatch = (result) => {
    run((s) => applyMatchResult(s, result));
    setMatchPhase(null);
    setMatchFx(null);
    setShowResult(true);
  };
  const closeResult = () => { setShowResult(false); setMatchDay(false); };
  const onBuild = (sectorId, key) => {
    if (run((s) => build(s, sectorId, key), 'Fonds insuffisants.')) toast(`Chantier lancé : ${BUILDINGS[key].name}`, 'gold');
  };
  const onUpgrade = (key) => {
    if (run((s) => upgrade(s, key), 'Fonds insuffisants ou niveau maximum.')) {
      toast(`${BUILDINGS[key].name} : niveau ${state.buildings[key] + 1}`, 'gold');
    }
  };

  const cinematic = !!matchPhase || showResult || !!state.seasonReview || !!state.offline;

  // Guidage : tutoriel des premières minutes, puis conseils du staff et pastilles dorées.
  const tutoStep = state.tutorial?.step || 'done';
  const tuto = tutoStep !== 'done' ? stepContent(tutoStep, state) : null;
  const doAction = (a) => {
    if (!a) return;
    if (a.kind === 'plot') selectPlot(a.plot, a.sector);
    else if (a.kind === 'panel') openPanel(a.panel);
    else if (a.kind === 'match') play();
  };
  const setTuto = (step) => run((s) => setTutorialStep(s, step));
  const onCoachPrimary = () => {
    if (tutoStep === 'welcome') setTuto('build');
    else if (tutoStep === 'stadium') { setTuto('done'); toast('À toi de jouer, président !', 'gold'); }
    else doAction(tuto.action);
  };
  const tip = !tuto && !sel && !panel ? staffTip(state) : null;
  const shownTip = tip && !dismissedTips.has(tip.id) ? tip : null;
  const signals = dockSignals(state);
  const plotBadges = cinematic ? [] : actionablePlots(state);

  return (
    <div className={`game ${cinematic ? 'cinematic' : ''} ${panel ? 'has-panel' : ''}`} data-tuto={tuto ? tutoStep : undefined}>
      <div className="stage">
        {webglOk ? (
          <Suspense fallback={<div className="stage-loading"><span className="eyebrow">Chargement de l’Empire…</span></div>}>
            <Empire3D
              state={state}
              timeMode={timeMode}
              weatherMode={weatherMode}
              matchDay={matchDay}
              live={matchPhase === 'live'}
              matchFx={matchFx}
              recenter={recenter}
              selectedPlot={sel?.plotId || null}
              badges={plotBadges}
              onSelectPlot={selectPlot}
              onWebGLFail={() => setWebglOk(false)}
            />
          </Suspense>
        ) : (
          <Empire2D state={state} onSelect={selectPlot} />
        )}
      </div>

      <div className="hud">
        <TopHud state={state} onMenu={() => setMenu(true)} />
        {tuto ? (
          <CoachCard
            content={tuto}
            onPrimary={onCoachPrimary}
            onSecondary={() => { doAction(tuto.secondary?.action); setTuto('done'); }}
            onSkip={() => { setTuto('done'); toast('Tutoriel passé : le staff te conseillera en bas de l’écran.', 'gold'); }}
          />
        ) : (
          <ObjectiveWidget state={state} collapsed={goalCollapsed} onToggle={() => setGoalCollapsed((c) => !c)} />
        )}
        <StaffTip
          tip={shownTip}
          onAction={() => doAction(shownTip.action)}
          onDismiss={() => setDismissedTips((d) => new Set(d).add(shownTip.id))}
        />
        {webglOk && (
          <SceneTools
            timeMode={timeMode}
            weatherMode={weatherMode}
            matchDay={matchDay}
            onTime={() => setTimeMode((m) => cycle(m, ['auto', 'day', 'night'], 'fo-time'))}
            onWeather={() => setWeatherMode((m) => cycle(m, ['auto', 'clear', 'rain', 'snow'], 'fo-weather'))}
            onMatchDay={() => setMatchDay((m) => !m)}
            onRecenter={() => { setMatchDay(false); setRecenter((r) => r + 1); }}
          />
        )}
        <MatchCta state={state} onPlay={play} onEndSeason={() => run(endSeason)} />
        <Dock panel={sel?.plotId === 't0' ? 'stadium' : panel} onPanel={openPanel} badges={signals} />
      </div>

      {panel === 'squad' && <SquadPanel state={state} run={run} onClose={() => setPanel(null)} />}
      {panel === 'season' && <SeasonPanel state={state} onClose={() => setPanel(null)} />}
      {panel === 'journal' && <JournalPanel state={state} onClose={() => setPanel(null)} />}
      {sel && (
        <PlotInspector
          state={state}
          sel={sel}
          onClose={() => setSel(null)}
          onBuild={onBuild}
          onUpgrade={onUpgrade}
          onMatchDay={() => { setSel(null); setMatchDay(true); }}
        />
      )}

      {matchPhase === 'prematch' && matchCtx && (
        <PreMatch state={state} ctx={matchCtx} onCancel={cancelMatch} onKickoff={kickoff} />
      )}
      {matchPhase === 'live' && matchCtx && (
        <LiveMatch
          state={state}
          ctx={matchCtx}
          sound={sound.current}
          onFx={(fx) => setMatchFx({ ...fx, id: performance.now() })}
          onFinish={finishMatch}
        />
      )}
      {showResult && <MatchResult state={state} onClose={closeResult} />}
      {!matchPhase && !showResult && state.seasonReview && <SeasonReview state={state} onClose={() => run(dismissReview)} />}
      {!matchPhase && !showResult && !state.seasonReview && state.offline && <OfflineReturn data={state.offline} onClose={() => run(dismissOffline)} />}
      {menu && (
        <GameMenu
          onClose={() => setMenu(false)}
          onReset={() => {
            if (window.confirm('Effacer la sauvegarde et recommencer une nouvelle aventure ?')) {
              clearGame();
              setMenu(false);
              setState(null);
            }
          }}
        />
      )}
      <Toasts items={toasts} />
    </div>
  );
}
