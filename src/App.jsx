import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMatchResult, applyOffline, build, createInitialState, dismissOffline, dismissReview, endSeason, matchContext, upgrade,
} from './game/engine';
import { BUILDINGS, DIVISIONS } from './game/constants';
import { clearGame, loadGame, saveGame } from './game/save';
import { clone } from './game/utils';
import Onboarding from './ui/Onboarding';
import Empire2D from './ui/EmpireView';
import { Dock, GameMenu, MatchCta, ObjectiveWidget, SceneTools, Toasts, TopHud } from './ui/hud';
import { JournalPanel, SeasonPanel } from './ui/panels';
import { FinancesPanel } from './ui/finances';
import { StatsPanel } from './ui/stats';
import { SquadView } from './ui/squad';
import PlotInspector from './ui/inspector';
import { OfflineReturn, SeasonReview } from './ui/overlays';
import PostMatch from './ui/postmatch';
import { LiveMatch, PreMatch } from './ui/match';
import { CoachCard, StaffTip } from './ui/guide';
import ConfirmDialog from './ui/confirm';
import { Presence } from './ui/presence';
import { LoadingScreen } from './ui/loading';
import { moneyBurst } from './ui/moneyfx';
import { previewState, previewUi, silentSound } from './ui/preview';
import { QUALITIES, loadQuality, saveQuality } from './ui/settings';
import { canVibrate, haptic, setVibration, vibrationEnabled } from './ui/haptics';
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

// preview : nom d'un écran à afficher d'emblée avec une partie fictive (galerie), sans sauvegarde ni 3D.
export default function App({ preview = null }) {
  const [boot] = useState(() => {
    if (!preview) return { state: loadGame(), ui: {} };
    const st = previewState(preview);
    return { state: st, ui: st ? previewUi(preview, st) : {} };
  });
  const [state, setState] = useState(boot.state);
  const [panel, setPanel] = useState(boot.ui.panel || null);
  const [sel, setSel] = useState(boot.ui.sel || null);
  const [toasts, setToasts] = useState([]);
  // préférences de vue (confort, par navigateur) : heure réelle / jour / nuit, météo auto / forcée
  const [timeMode, setTimeMode] = useState(() => { try { return localStorage.getItem('fo-time') || 'auto'; } catch { return 'auto'; } });
  const [weatherMode, setWeatherMode] = useState(() => { try { return localStorage.getItem('fo-weather') || 'auto'; } catch { return 'auto'; } });
  const [matchDay, setMatchDay] = useState(!!boot.ui.matchDay);
  const [recenter, setRecenter] = useState(0);
  const [showResult, setShowResult] = useState(!!boot.ui.showResult);
  const [goalCollapsed, setGoalCollapsed] = useState(() => window.innerWidth < 760); // replié sur mobile
  const [menu, setMenu] = useState(!!boot.ui.menu);
  const [quality, setQuality] = useState(loadQuality); // qualité graphique (par appareil)
  const [vibration, setVibrationState] = useState(vibrationEnabled);
  const [sceneLoaded, setSceneLoaded] = useState(false); // écran de chargement jusqu'à l'arrivée des modèles 3D
  const [loadProgress, setLoadProgress] = useState(null);
  useEffect(() => { // filet de sécurité : l'écran de chargement ne reste jamais plus de 20 s
    if (sceneLoaded || !state) return undefined;
    const t = setTimeout(() => setSceneLoaded(true), 20000);
    return () => clearTimeout(t);
  }, [sceneLoaded, !state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [webglOk, setWebglOk] = useState(true);
  // match : null → 'prematch' (onze + tactique) → 'live' (direct) → résumé (showResult)
  const [matchPhase, setMatchPhase] = useState(boot.ui.matchPhase || null);
  const [matchCtx, setMatchCtx] = useState(boot.ui.matchCtx || null);
  const [matchFx, setMatchFx] = useState(null); // effets 3D du direct : but, but encaissé, mi-temps…
  const [dismissedTips, setDismissedTips] = useState(() => new Set()); // conseils masqués (session)
  const [confirm, setConfirm] = useState(boot.ui.confirm || null); // fenêtre de confirmation du jeu (vente, nouvelle partie…)
  const [squadTab, setSquadTab] = useState(boot.ui.squadTab || 'players'); // onglet d'ouverture de l'effectif
  const [statsMatch, setStatsMatch] = useState(boot.ui.statsMatch || null); // 'last' : Stats Pass du dernier match ouvert d'emblée
  const sound = useRef(null);
  if (!sound.current) sound.current = preview ? silentSound : createStadiumSound();
  const toastId = useRef(0);
  const [, bumpSound] = useState(0); // le son se coupe aussi pendant le direct : on relit sound.current.muted

  useEffect(() => { if (state && !preview) saveGame(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  // chaque gain ou dépense s'anime (pièces vers la trésorerie, « +1 252 € », tintement)
  const prevMoney = useRef(null);
  useEffect(() => {
    const m = state ? state.money : null;
    if (m !== null && prevMoney.current !== null && m !== prevMoney.current) moneyBurst(m - prevMoney.current, sound.current);
    prevMoney.current = m;
  }, [state?.money]); // eslint-disable-line react-hooks/exhaustive-deps
  // revenus hors ligne calculés une seule fois au chargement
  useEffect(() => { if (!preview) setState((prev) => (prev ? applyOffline(clone(prev)) : prev)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const kickoff = (lineup, tactic, formation) => {
    if (run((s) => { s.lineup = lineup; s.tactic = tactic; s.formation = formation; return s; })) setMatchPhase('live');
  };
  const finishMatch = (result) => {
    run((s) => applyMatchResult(s, result));
    setMatchPhase(null);
    setMatchFx(null);
    setShowResult(true);
  };
  const closeResult = () => { setShowResult(false); setMatchDay(false); };
  // jour de match : adversaire et affluence pour la scène 3D (match à venir, en cours, ou qui vient de finir)
  const matchInfo = (() => {
    if (!matchDay) return null;
    const lm = state.lastMatch;
    if (showResult && lm) return { opp: lm.oppName, attendance: lm.attendance, capacity: lm.capacity, played: true };
    const c = matchCtx || matchContext(state);
    if (c) return { opp: c.opp.name, attendance: c.gate?.attendance, capacity: c.gate?.capacity };
    return lm ? { opp: lm.oppName, attendance: lm.attendance, capacity: lm.capacity, played: true } : null;
  })();
  const onBuild = (sectorId, key) => {
    if (run((s) => build(s, sectorId, key), 'Fonds insuffisants.')) { haptic('build'); toast(`Chantier lancé : ${BUILDINGS[key].name}`, 'gold'); }
  };
  const onUpgrade = (key) => {
    if (run((s) => upgrade(s, key), 'Fonds insuffisants ou niveau maximum.')) {
      haptic('build');
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
    else if (a.kind === 'panel') { setSquadTab(a.tab || 'players'); openPanel(a.panel); }
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
    <div className={`game ${cinematic ? 'cinematic' : ''} ${panel ? 'has-panel' : ''} ${panel === 'squad' ? 'wide-panel' : ''} ${sel ? 'has-sel' : ''}`} data-tuto={tuto ? tutoStep : undefined}>
      <div className="stage">
        {preview ? (
          <div className="stage-preview" aria-hidden="true" />
        ) : webglOk ? (
          <Suspense fallback={null}>
            <Empire3D
              state={state}
              timeMode={timeMode}
              weatherMode={weatherMode}
              matchDay={matchDay}
              live={matchPhase === 'live'}
              matchFx={matchFx}
              matchInfo={matchInfo}
              recenter={recenter}
              selectedPlot={sel?.plotId || null}
              badges={plotBadges}
              quality={quality}
              onLoadProgress={setLoadProgress}
              onLoaded={() => setSceneLoaded(true)}
              onSelectPlot={selectPlot}
              onEmptyTap={() => setSel(null)}
              onWebGLFail={() => setWebglOk(false)}
            />
          </Suspense>
        ) : (
          <Empire2D state={state} onSelect={selectPlot} />
        )}
      </div>

      <div className="hud">
        <TopHud state={state} onMenu={() => setMenu(true)} onFinances={() => openPanel('finances')} />
        <div className="hud-left">
        {tuto ? (
          <CoachCard
            content={tuto}
            onPrimary={onCoachPrimary}
            onSecondary={() => { doAction(tuto.secondary?.action); setTuto('done'); }}
            onSkip={() => { setTuto('done'); toast('Tutoriel passé : le staff continuera de te conseiller.', 'gold'); }}
          />
        ) : (
          <ObjectiveWidget state={state} collapsed={goalCollapsed} onToggle={() => setGoalCollapsed((c) => !c)} />
        )}
        <Presence>
          {shownTip && (
            <StaffTip
              tip={shownTip}
              onAction={() => doAction(shownTip.action)}
              onDismiss={() => setDismissedTips((d) => new Set(d).add(shownTip.id))}
            />
          )}
        </Presence>
        </div>
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
        <Dock panel={panel} onPanel={openPanel} badges={signals} />
      </div>

      <Presence>
        {panel === 'squad' && (
          <SquadView
            state={state}
            run={run}
            ask={setConfirm}
            preview={boot.ui.squad}
            initialTab={tutoStep === 'sign' ? 'market' : squadTab}
            onClose={() => { setPanel(null); setSquadTab('players'); }}
            onFinances={() => openPanel('finances')}
          />
        )}
      </Presence>
      <Presence>{panel === 'season' && <SeasonPanel state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{panel === 'journal' && <JournalPanel state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{panel === 'stats' && <StatsPanel state={state} initialMatch={statsMatch} onClose={() => { setPanel(null); setStatsMatch(null); }} />}</Presence>
      <Presence>
        {panel === 'finances' && (
          <FinancesPanel state={state} onClose={() => setPanel(null)} onOpenSquad={() => { setSquadTab('players'); openPanel('squad'); }} />
        )}
      </Presence>
      <Presence>
        {sel && (
          <PlotInspector
            state={state}
            sel={sel}
            onClose={() => setSel(null)}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onMatchDay={() => { setSel(null); setMatchDay(true); }}
            onTransfers={() => { setSel(null); setSquadTab('transfers'); setPanel('squad'); }}
          />
        )}
      </Presence>

      <Presence>
        {matchPhase === 'prematch' && matchCtx && (
          <PreMatch state={state} ctx={matchCtx} onCancel={cancelMatch} onKickoff={kickoff} />
        )}
      </Presence>
      {matchPhase === 'live' && matchCtx && (
        <LiveMatch
          state={state}
          ctx={matchCtx}
          sound={sound.current}
          preview={boot.ui.live}
          onFx={(fx) => { if (fx.type === 'goal') haptic('goal'); setMatchFx({ ...fx, id: performance.now() }); }}
          onFinish={finishMatch}
        />
      )}
      <Presence>{showResult && <PostMatch state={state} onClose={closeResult} onStats={() => { closeResult(); setStatsMatch('last'); setPanel('stats'); }} />}</Presence>
      <Presence>{!matchPhase && !showResult && state.seasonReview && <SeasonReview state={state} onClose={() => run(dismissReview)} />}</Presence>
      <Presence>{!matchPhase && !showResult && !state.seasonReview && state.offline && <OfflineReturn data={state.offline} onClose={() => run(dismissOffline)} />}</Presence>
      <Presence>{menu && (
        <GameMenu
          onClose={() => setMenu(false)}
          muted={sound.current.muted}
          onToggleSound={() => { sound.current.setMuted(!sound.current.muted); bumpSound((n) => n + 1); }}
          quality={quality}
          qualities={QUALITIES}
          onQuality={(q) => { setQuality(q); if (!preview) saveQuality(q); }}
          vibration={vibration}
          canVibrate={canVibrate()}
          onToggleVibration={() => { setVibration(!vibration); setVibrationState(!vibration); }}
          onReset={() => {
            setMenu(false);
            setConfirm({
              tone: 'danger',
              title: 'Recommencer une nouvelle aventure ?',
              text: `La sauvegarde de ${state.clubName} (saison ${state.seasonNumber}, ${DIVISIONS[state.divisionIndex].name}) sera effacée définitivement.`,
              confirmLabel: 'Effacer et recommencer',
              cancelLabel: 'Garder ma partie',
              onConfirm: () => { clearGame(); setState(null); setSceneLoaded(false); setLoadProgress(null); },
            });
          }}
        />
      )}</Presence>
      <Presence>
        {confirm && (
          <ConfirmDialog
            {...confirm}
            onCancel={() => setConfirm(null)}
            onConfirm={() => { setConfirm(null); confirm.onConfirm(); }}
          />
        )}
      </Presence>
      <Toasts items={toasts} />
      <Presence ms={500}>
        {((webglOk && !preview && !sceneLoaded) || boot.ui.loading != null) && <LoadingScreen progress={boot.ui.loading ?? loadProgress} />}
      </Presence>
    </div>
  );
}
