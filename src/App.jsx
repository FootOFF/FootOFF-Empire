import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMatchResult, applyOffline, build, setTicketPolicy, createInitialState, dismissOffline, dismissReview, endSeason, matchContext, upgrade,
} from './game/engine';
import { BUILDINGS, DIVISIONS, upgradeCost } from './game/constants';
import { fmtMoney } from './ui/format';
import { clearGame, loadGame, saveGame } from './game/save';
import { clone } from './game/utils';
import Empire2D from './ui/EmpireView';
import { Dock, MatchCta, ObjectiveWidget, SceneTools, Toasts, TopHud } from './ui/hud';
import { JournalPanel, SeasonPanel } from './ui/panels';
import { FinancesPanel } from './ui/finances';
import { StatsPanel } from './ui/stats';
import { TrophyRoom } from './ui/trophyroom';
import { SquadView } from './ui/squad';
import PlotInspector from './ui/inspector';
import { OfflineReturn, SeasonReview } from './ui/overlays';
import PostMatch from './ui/postmatch';
import { LiveMatch, PreMatch } from './ui/match';
import { CoachCard, StaffTip } from './ui/guide';
import ConfirmDialog from './ui/confirm';
import { Presence } from './ui/presence';
import { LoadingScreen } from './ui/loading';
import { TitleScreen } from './ui/title';
import { PauseMenu } from './ui/pause';
import { setUiSound } from './ui/console';
import './ui/input'; // manette : traduite en touches du clavier pour tous les menus
import { moneyBurst } from './ui/moneyfx';
import { previewState, previewUi, silentSound } from './ui/preview';
import { MOTIONS, QUALITIES, loadMotion, loadQuality, saveMotion, saveQuality } from './ui/settings';
import { canVibrate, haptic, setVibration, vibrationEnabled } from './ui/haptics';
import { actionablePlots, dockSignals, seasonEndForecast, staffTip } from './game/advice';
import { advanceTutorial, setTutorialStep, stepContent } from './game/tutorial';
import { roundKey } from './game/mercato';
import { createStadiumSound } from './ui/sound';
import { achievementById, newAchievements } from './game/achievements';

// three.js et la scène vivent dans un chunk séparé, chargé dès le démarrage (derrière l'écran de chargement).
const Empire3D = lazy(() => import('./ui/Empire3D'));

function cycle(current, order, storageKey) {
  const next = order[(order.indexOf(current) + 1) % order.length];
  try { localStorage.setItem(storageKey, next); } catch { /* stockage indisponible */ }
  return next;
}

// Parcours, façon jeu de console : écran de chargement (progression réelle) → écran titre devant le complexe en 3D
// (Continuer, Nouvelle partie, Réglages) → la caméra plonge vers la vue d'ensemble et le HUD apparaît. En jeu,
// Échap (ou Start à la manette) ouvre le menu pause, qui fige la scène.
// preview : nom d'un écran à afficher d'emblée avec une partie fictive (galerie), sans sauvegarde ni 3D.
export default function App({ preview = null }) {
  const [boot] = useState(() => {
    if (!preview) return { state: loadGame(), ui: {} };
    const st = previewState(preview);
    return { state: st, ui: previewUi(preview, st) };
  });
  const [state, setState] = useState(boot.state);
  const [screen, setScreen] = useState(boot.ui.screen || (preview ? 'game' : 'title')); // 'title' | 'game'
  const [titleView, setTitleView] = useState(boot.ui.titleView || 'menu'); // menu, réglages, création du club
  const [booted, setBooted] = useState(!!preview); // écran de chargement terminé (barre à 100 %)
  const demo = useRef(null); // complexe de départ montré derrière l'écran titre avant la création du club
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
  const [motion, setMotion] = useState(loadMotion); // image en mouvement : nette ou fluide (par appareil)
  const [vibration, setVibrationState] = useState(vibrationEnabled);
  const [sceneLoaded, setSceneLoaded] = useState(false); // écran de chargement jusqu'à ce que la scène 3D soit prête
  const [loadProgress, setLoadProgress] = useState(null);
  useEffect(() => { // filet de sécurité : l'écran de chargement ne reste jamais plus de 20 s
    if (sceneLoaded || preview) return undefined;
    const t = setTimeout(() => setSceneLoaded(true), 20000);
    return () => clearTimeout(t);
  }, [sceneLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [webglOk, setWebglOk] = useState(true);
  // match : null → 'prematch' (onze + tactique) → 'live' (direct) → résumé (showResult)
  const [matchPhase, setMatchPhase] = useState(boot.ui.matchPhase || null);
  const [matchCtx, setMatchCtx] = useState(boot.ui.matchCtx || null);
  const [matchFx, setMatchFx] = useState(null); // effets 3D du direct : but, but encaissé, mi-temps…
  const [dismissedTips, setDismissedTips] = useState(() => new Set()); // conseils masqués (session)
  const [confirm, setConfirm] = useState(boot.ui.confirm || null); // fenêtre de confirmation du jeu (vente, nouvelle partie…)
  const [squadTab, setSquadTab] = useState(boot.ui.squadTab || 'players'); // onglet d'ouverture de l'effectif
  const [squadSheet, setSquadSheet] = useState(null); // fiche joueur ouverte d'emblée (depuis une fiche carrière)
  const [statsMatch, setStatsMatch] = useState(boot.ui.statsMatch || null); // 'last' : Stats Pass du dernier match ouvert d'emblée
  const sound = useRef(null);
  if (!sound.current) sound.current = preview ? silentSound : createStadiumSound();
  const toastId = useRef(0);
  const [, bumpSound] = useState(0); // le son se coupe aussi pendant le direct : on relit sound.current.muted
  useEffect(() => { setUiSound((kind) => sound.current.ui?.(kind)); }, []);

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

  // Succès : débloqués au fil du jeu, datés. Une partie déjà commencée les retrouve d'un coup, sans notification.
  useEffect(() => {
    if (!state) return;
    const fresh = newAchievements(state);
    const initial = !state.achievements;
    if (!fresh.length && !initial) return;
    setState((s) => (s ? { ...s, achievements: { ...(s.achievements || {}), ...Object.fromEntries(fresh) } } : s));
    if (!initial) fresh.forEach(([id]) => toast(`Succès débloqué : ${achievementById(id).title}`, 'gold'));
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const inGame = screen === 'game' && !!state;
  const cinematic = !!state && (!!matchPhase || showResult || !!state.seasonReview || !!state.offline);

  // En jeu, Échap (ou Start à la manette) ouvre le menu pause, quand aucune fenêtre n'est ouverte (sinon Échap la
  // ferme, elle). Réinscrit à chaque rendu : lit toujours l'état courant.
  useEffect(() => {
    if (preview) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !inGame || menu || panel || sel || confirm || cinematic) return;
      e.preventDefault();
      setMenu(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
  const closeResult = () => {
    setShowResult(false);
    setMatchDay(false);
    // ce qui a bougé au mercato pendant la journée : offres reçues, joueurs suivis partis ailleurs
    const n = state.mercatoNews;
    if (!n || n.key !== roundKey(state) || n.season) return;
    const gone = n.followedGone || [];
    const bits = [];
    if (n.offers) bits.push(`${n.offers} offre${n.offers > 1 ? 's' : ''} reçue${n.offers > 1 ? 's' : ''} pour tes joueurs`);
    if (gone.length) bits.push(`${gone.join(', ')} ${gone.length > 1 ? 'ont' : 'a'} signé ailleurs`);
    if (bits.length) toast(`Mercato : ${bits.join(' · ')}`, 'gold');
  };
  // jour de match : adversaire et affluence pour la scène 3D (match à venir, en cours, ou qui vient de finir)
  const matchInfo = (() => {
    if (!matchDay || !state) return null;
    const lm = state.lastMatch;
    if (showResult && lm) return { opp: lm.oppName, attendance: lm.attendance, capacity: lm.capacity, played: true };
    const c = matchCtx || matchContext(state);
    if (c) return { opp: c.opp.name, attendance: c.gate?.attendance, capacity: c.gate?.capacity };
    return lm ? { opp: lm.oppName, attendance: lm.attendance, capacity: lm.capacity, played: true } : null;
  })();
  // Une dépense qui ferait finir la saison dans le rouge demande confirmation : le conseil vendrait alors les plus
  // gros salaires (plan de redressement). La fenêtre montre la fin de saison prévue avant et après.
  const guardSpend = (cost, title, go) => {
    const end = seasonEndForecast(state);
    const upkeep = Math.round(cost * 0.04);
    const after = end - cost - upkeep;
    if (after >= 0) { go(); return; }
    setConfirm({
      title,
      tone: 'danger',
      text: 'Avec cette dépense, la saison finirait dans le rouge. Au coup de sifflet final, le conseil vendrait tes plus gros salaires pour redresser les comptes.',
      rows: [
        ['Coût', `−${fmtMoney(cost)}`, 'down'],
        ['Entretien en plus', `${fmtMoney(upkeep)} / saison`, 'down'],
        ['Fin de saison prévue', `${fmtMoney(end)} → ${fmtMoney(after)}`, 'down'],
      ],
      confirmLabel: 'Dépenser quand même',
      cancelLabel: 'Renoncer',
      onConfirm: go,
    });
  };
  const onBuild = (sectorId, key) => guardSpend(upgradeCost(key, 1), `Construire : ${BUILDINGS[key].name} ?`, () => {
    if (run((s) => build(s, sectorId, key), 'Fonds insuffisants.')) { haptic('build'); toast(`Chantier lancé : ${BUILDINGS[key].name}`, 'gold'); }
  });
  const onUpgrade = (key) => guardSpend(upgradeCost(key, state.buildings[key] + 1), `${BUILDINGS[key].name} : passer au niveau ${state.buildings[key] + 1} ?`, () => {
    if (run((s) => upgrade(s, key), 'Fonds insuffisants ou niveau maximum.')) {
      haptic('build');
      toast(`${BUILDINGS[key].name} : niveau ${state.buildings[key] + 1}`, 'gold');
    }
  });

  // Réglages partagés par l'écran titre et le menu pause.
  const settings = {
    muted: sound.current.muted,
    onToggleSound: () => { sound.current.setMuted(!sound.current.muted); bumpSound((n) => n + 1); },
    quality,
    qualities: QUALITIES,
    onQuality: (q) => { setQuality(q); if (!preview) saveQuality(q); },
    motion,
    motions: MOTIONS,
    onMotion: (m) => { setMotion(m); if (!preview) saveMotion(m); },
    vibration,
    canVibrate: canVibrate(),
    onToggleVibration: () => { setVibration(!vibration); setVibrationState(!vibration); },
  };
  // Retour à l'écran titre (la partie reste sauvegardée) : la caméra repart en vitrine autour du complexe.
  const toTitle = () => {
    setMenu(false); setSel(null); setPanel(null); setMatchDay(false);
    setTitleView('menu');
    setScreen('title');
  };
  const askNewGame = () => {
    if (!state) { setTitleView('create'); return; }
    setConfirm({
      tone: 'danger',
      title: 'Recommencer une nouvelle aventure ?',
      text: `La sauvegarde de ${state.clubName} (saison ${state.seasonNumber}, ${DIVISIONS[state.divisionIndex].name}) sera effacée définitivement.`,
      confirmLabel: 'Effacer et recommencer',
      cancelLabel: 'Garder ma partie',
      onConfirm: () => {
        clearGame();
        setState(null);
        setMenu(false); setSel(null); setPanel(null); setMatchDay(false); setShowResult(false); setMatchPhase(null);
        setTitleView('create');
        setScreen('title');
      },
    });
  };

  // Guidage : tutoriel des premières minutes, puis conseils du staff et pastilles dorées.
  const tutoStep = state?.tutorial?.step || 'done';
  const tuto = state && tutoStep !== 'done' ? stepContent(tutoStep, state) : null;
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
  const tip = state && !tuto && !sel && !panel ? staffTip(state) : null;
  const shownTip = tip && !dismissedTips.has(tip.id) ? tip : null;
  const signals = state ? dockSignals(state) : {};
  const plotBadges = inGame && !cinematic ? actionablePlots(state) : [];
  // avant la création du club, la scène montre le complexe de départ
  const sceneState = state || (demo.current ||= createInitialState('FootOFF FC'));

  return (
    <div className={`game ${inGame ? 'playing' : 'titled'} ${menu ? 'paused' : ''} ${cinematic ? 'cinematic' : ''} ${panel ? 'has-panel' : ''} ${panel === 'squad' ? 'wide-panel' : ''} ${sel ? 'has-sel' : ''}`} data-tuto={inGame && tuto ? tutoStep : undefined}>
      <div className="stage">
        {preview ? (
          <div className="stage-preview" aria-hidden="true" />
        ) : webglOk ? (
          <Suspense fallback={null}>
            <Empire3D
              state={sceneState}
              timeMode={timeMode}
              weatherMode={weatherMode}
              matchDay={matchDay}
              live={matchPhase === 'live'}
              matchFx={matchFx}
              matchInfo={matchInfo}
              recenter={recenter}
              selectedPlot={inGame ? sel?.plotId || null : null}
              badges={plotBadges}
              quality={quality}
              motion={motion}
              attract={!inGame}
              paused={menu}
              onLoadProgress={setLoadProgress}
              onLoaded={() => setSceneLoaded(true)}
              onSelectPlot={selectPlot}
              onEmptyTap={() => setSel(null)}
              onOpenTrophies={() => openPanel('trophies')}
              onWebGLFail={() => { setWebglOk(false); setBooted(true); }}
            />
          </Suspense>
        ) : (
          <Empire2D state={sceneState} onSelect={selectPlot} />
        )}
      </div>

      {inGame && (
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
      )}

      <Presence>
        {inGame && panel === 'squad' && (
          <SquadView
            state={state}
            run={run}
            ask={setConfirm}
            preview={boot.ui.squad}
            initialTab={tutoStep === 'sign' ? 'market' : squadTab}
            initialSheet={squadSheet}
            onClose={() => { setPanel(null); setSquadTab('players'); setSquadSheet(null); }}
            onFinances={() => openPanel('finances')}
          />
        )}
      </Presence>
      <Presence>{inGame && panel === 'season' && <SeasonPanel state={state} initialTab={boot.ui.seasonTab} onClose={() => setPanel(null)} onPlay={play} onOpenMatch={(m) => { setStatsMatch(m); setPanel('stats'); }} />}</Presence>
      <Presence>{inGame && panel === 'journal' && <JournalPanel state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{inGame && panel === 'trophies' && <TrophyRoom state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{inGame && panel === 'stats' && <StatsPanel state={state} initialMatch={statsMatch} onClose={() => { setPanel(null); setStatsMatch(null); }} onPlayerSheet={(id) => { setSquadSheet(id); setSquadTab('players'); setPanel('squad'); }} />}</Presence>
      <Presence>
        {inGame && panel === 'finances' && (
          <FinancesPanel state={state} onClose={() => setPanel(null)} onOpenSquad={() => { setSquadTab('players'); openPanel('squad'); }} />
        )}
      </Presence>
      <Presence>
        {inGame && sel && (
          <PlotInspector
            state={state}
            sel={sel}
            onClose={() => setSel(null)}
            onBuild={onBuild}
            onUpgrade={onUpgrade}
            onMatchDay={() => { setSel(null); setMatchDay(true); }}
            onTransfers={() => { setSel(null); setSquadTab('market'); setPanel('squad'); }}
            onTicketPolicy={(id) => run((s) => setTicketPolicy(s, id))}
          />
        )}
      </Presence>

      <Presence>
        {inGame && matchPhase === 'prematch' && matchCtx && (
          <PreMatch state={state} ctx={matchCtx} onCancel={cancelMatch} onKickoff={kickoff} />
        )}
      </Presence>
      {inGame && matchPhase === 'live' && matchCtx && (
        <LiveMatch
          state={state}
          ctx={matchCtx}
          sound={sound.current}
          preview={boot.ui.live}
          onFx={(fx) => { if (fx.type === 'goal') haptic('goal'); setMatchFx({ ...fx, id: performance.now() }); }}
          onFinish={finishMatch}
        />
      )}
      <Presence>{inGame && showResult && <PostMatch state={state} onClose={closeResult} onStats={() => { closeResult(); setStatsMatch('last'); setPanel('stats'); }} />}</Presence>
      <Presence>{inGame && !matchPhase && !showResult && state.seasonReview && <SeasonReview state={state} onClose={() => run(dismissReview)} />}</Presence>
      <Presence>{inGame && !matchPhase && !showResult && !state.seasonReview && state.offline && <OfflineReturn data={state.offline} onClose={() => run(dismissOffline)} />}</Presence>

      <Presence ms={450}>
        {screen === 'title' && booted && (
          <TitleScreen
            state={state}
            view={titleView}
            onView={setTitleView}
            settings={settings}
            blocked={!!confirm}
            onContinue={() => setScreen('game')}
            onNewGame={askNewGame}
            onCreate={(name) => { setState(createInitialState(name)); setTitleView('menu'); setScreen('game'); }}
          />
        )}
      </Presence>
      <Presence>{inGame && menu && (
        <PauseMenu
          state={state}
          settings={settings}
          inMatch={!!matchPhase}
          blocked={!!confirm}
          onResume={() => setMenu(false)}
          onTitle={toTitle}
          onNewGame={askNewGame}
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
        {((webglOk && !preview && !booted) || boot.ui.loading != null) && (
          <LoadingScreen info={loadProgress} done={sceneLoaded} fixed={boot.ui.loading ?? null} onFinished={() => setBooted(true)} />
        )}
      </Presence>
    </div>
  );
}
