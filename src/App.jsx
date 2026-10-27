import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMatchResult, applyOffline, build, createInitialState, dismissOffline, dismissReview, endSeason, matchContext, staffSession, upgrade,
} from './game/engine';
import { staffOn } from './game/training';
import { BUILDINGS, DIVISIONS, upgradeCost } from './game/constants';
import { fmtMoney } from './ui/format';
import { clearGame, clearLive, decodeCode, exportCode, importSave, lastLoad, loadGame, loadLive, saveGame } from './game/save';
import { LIVE_VERSION, liveKeyOf } from './game/live';
import { applyUpdate } from './ui/updates';
import { CrashScreen } from './ui/crash';
import { clone } from './game/utils';
import Empire2D from './ui/EmpireView';
import { Dock, MatchCta, ObjectiveWidget, SceneTools, TopHud } from './ui/hud';
import { Notifications, useNotifications } from './ui/notify';
import { TipLayer } from './ui/tips';
import { JournalPanel, SeasonPanel } from './ui/panels';
import { ReputationPanel } from './ui/reputation';
import { FinancesPanel } from './ui/finances';
import { StatsPanel } from './ui/stats';
import { TrophyRoom } from './ui/trophyroom';
import { SquadView } from './ui/squad';
import { AcademyView } from './ui/academy';
import { TrainingView } from './ui/training';
import DrillRunner from './ui/drill';
import PlotInspector, { freePlotsOf } from './ui/inspector';
import { OfflineReturn, SeasonReview } from './ui/overlays';
import PostMatch from './ui/postmatch';
import { LiveMatch, PreMatch } from './ui/match';
import { CoachCard, StaffTip } from './ui/guide';
import { DirectionView } from './ui/direction';
import { MedicalView } from './ui/medical';
import ConfirmDialog from './ui/confirm';
import { Presence } from './ui/presence';
import { LoadingScreen } from './ui/loading';
import { TitleScreen } from './ui/title';
import { PauseMenu } from './ui/pause';
import { setUiSound } from './ui/console';
import './ui/input'; // manette : traduite en touches du clavier pour tous les menus
import { moneyBurst } from './ui/moneyfx';
import { previewState, previewUi, silentSound } from './ui/preview';
import { FacesSheet } from './ui/facesheet';
import { canVibrate, haptic, setVibration, vibrationEnabled } from './ui/haptics';
import { actionablePlots, dockSignals, seasonEndForecast, sessionPin, staffTip } from './game/advice';
import { allowedBuildingsFor, plotBuilding, plotOf } from './game/map';
import { leavingYouth, missionTarget } from './game/academy';
import { advanceTutorial, setTutorialStep, stepContent } from './game/tutorial';
import { roundKey } from './game/mercato';
import { createStadiumSound } from './ui/sound';
import { achievementById, newAchievements } from './game/achievements';
import { LOCKS, NavContext, SECTION_ENTRY, sectionNear, sectionOf } from './ui/nav';

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
// Direct interrompu par la fermeture de l'app (save.js, saveLive) : repris s'il s'agit bien du prochain match de cette
// partie (même club, même date du calendrier, même adversaire) et de la même version du moteur ; sinon oublié.
function pendingLive(st) {
  const rec = loadLive();
  if (!rec) return null;
  const ctx = st && matchContext(st);
  if (ctx && rec.v === LIVE_VERSION && rec.key === liveKeyOf(st, ctx) && rec.engine && rec.ui) return { ...rec, ctx };
  clearLive();
  return null;
}

// « Match en cours · 63e minute contre … » (écran titre, entrée Continuer).
function liveNoteOf(rec) {
  const { half, clock, phase } = rec.ui;
  const base = half === 1 ? 45 : 90;
  const mm = Math.max(half === 1 ? 1 : 46, Math.ceil(clock));
  const when = phase === 'halftime' ? 'mi-temps' : `${mm > base ? `${base}+${mm - base}` : mm}e minute`;
  return `Match en cours · ${when} contre ${rec.ctx.opp.name}`;
}

// preview : nom d'un écran à afficher d'emblée avec une partie fictive (galerie), sans sauvegarde ni 3D.
export default function App({ preview = null }) {
  if (preview === 'erreur') return <CrashScreen error={new Error('TypeError: Cannot read properties of null (reading \'C\')')} summary="FootOFF FC · saison 3 · Régionale" preview />;
  if (preview === 'visages') return <FacesSheet />; // planche de visages (galerie)
  const [boot] = useState(() => {
    if (!preview) {
      const st = loadGame();
      return { state: st, ui: {}, live: pendingLive(st) };
    }
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
  // vitrine de construction : bâtiment et niveau montrés en hologramme sur la parcelle, fenêtre d'aperçu ouverte
  const [buildView, setBuildView] = useState(null);
  useEffect(() => { if (!sel) setBuildView(null); }, [sel]);
  // préférence de vue (confort, par navigateur) : heure réelle / jour / nuit ; toujours par temps clair
  const [timeMode, setTimeMode] = useState(() => { try { return localStorage.getItem('fo-time') || 'auto'; } catch { return 'auto'; } });
  const [matchDay, setMatchDay] = useState(!!boot.ui.matchDay || !!boot.live);
  const [recenter, setRecenter] = useState(0);
  const [showResult, setShowResult] = useState(!!boot.ui.showResult);
  const [goalCollapsed, setGoalCollapsed] = useState(() => window.innerWidth < 760); // replié sur mobile
  const [menu, setMenu] = useState(!!boot.ui.menu);
  const [vibration, setVibrationState] = useState(vibrationEnabled);
  const [sceneLoaded, setSceneLoaded] = useState(false); // écran de chargement jusqu'à ce que la scène 3D soit prête
  const [loadProgress, setLoadProgress] = useState(null);
  useEffect(() => { // filet de sécurité : l'écran de chargement ne reste jamais plus de 20 s
    if (sceneLoaded || preview) return undefined;
    const t = setTimeout(() => setSceneLoaded(true), 20000);
    return () => clearTimeout(t);
  }, [sceneLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [webglOk, setWebglOk] = useState(true);
  // match : null → 'prematch' (onze + tactique) → 'live' (direct) → résumé (showResult) ; un direct interrompu par la
  // fermeture de l'app reprend à la minute près, dès « Continuer » (resumeLive : save.js, loadLive)
  const [matchPhase, setMatchPhase] = useState(boot.ui.matchPhase || (boot.live ? 'live' : null));
  const [matchCtx, setMatchCtx] = useState(boot.ui.matchCtx || boot.live?.ctx || null);
  const [resumeLive, setResumeLive] = useState(boot.live || null);
  const liveDone = useRef(false); // match terminé : son enregistrement s'efface une fois le résultat sauvegardé
  const [matchFx, setMatchFx] = useState(null); // effets 3D du direct : but, but encaissé, mi-temps…
  const [dismissedTips, setDismissedTips] = useState(() => new Set()); // conseils masqués (session)
  const [confirm, setConfirm] = useState(boot.ui.confirm || null); // fenêtre de confirmation du jeu (vente, nouvelle partie…)
  const [squadTab, setSquadTab] = useState(boot.ui.squadTab && boot.ui.squadTab !== 'market' ? boot.ui.squadTab : 'players'); // onglet de l'Effectif (joueurs, composition, anciens)
  const [seasonTab, setSeasonTab] = useState(boot.ui.seasonTab || 'calendar'); // onglet de la Saison (calendrier, classement)
  const [navSwitch, setNavSwitch] = useState(false); // ouvert depuis un onglet de la même section : sans glissement
  // passage à la section voisine (téléphone : glissé ou barre du bas) : { dir: 'next' | 'prev', panel } ; le panneau
  // arrive par le côté d'où vient le doigt, l'ancien sort par l'autre côté
  const [navDir, setNavDir] = useState(null);
  const lastIn = useRef({}); // dernier écran vu dans chaque section, tant qu'un panneau reste ouvert
  const [squadSheet, setSquadSheet] = useState(null); // fiche joueur ouverte d'emblée dans l'Effectif (notification)
  // fiche joueur ouverte par-dessus Saison ou Stats : on la ferme et on retrouve l'écran tel quel (onglet, défilement)
  const [directionTab, setDirectionTab] = useState(boot.ui.directionTab || 'tv'); // onglet d'ouverture de la Direction
  const [peek, setPeek] = useState(null);
  useEffect(() => {
    setPeek(null);
    if (panel !== 'direction') setDirectionTab('tv');
    if (panel) lastIn.current[sectionOf(panel)] = panel;
    else { lastIn.current = {}; setNavDir(null); }
  }, [panel]);
  const [statsMatch, setStatsMatch] = useState(boot.ui.statsMatch || null); // 'last' : Stats Pass du dernier match ouvert d'emblée
  const [trophyTab, setTrophyTab] = useState('honours'); // onglet d'ouverture de la salle des trophées
  const [trophyFocus, setTrophyFocus] = useState([]); // succès à montrer d'emblée (notification d'un succès débloqué)
  const [mercatoView, setMercatoView] = useState(() => boot.ui?.squad?.mercato || 'buy'); // vue du mercato : recruter, suivis, offres, bilan
  const [academyNav, setAcademyNav] = useState({ tab: boot.ui.academyTab || 'youth', ids: [] }); // onglet et jeunes à montrer
  const [trainingTab, setTrainingTab] = useState(boot.ui.trainingTab || 'session'); // onglet d'ouverture du centre d'entraînement
  const [drills, setDrills] = useState(null); // épreuves en 3D en cours : [{ pos, id, cat, drill }]
  const [drillsKey, setDrillsKey] = useState(0); // chaque séance repart d'un écran d'épreuves neuf
  const playDrills = (queue) => { setDrillsKey((k) => k + 1); setDrills(queue); };
  const [navKey, setNavKey] = useState(0); // une notification rouvre son panneau à neuf, sur ce qu'elle annonce
  const sound = useRef(null);
  if (!sound.current) sound.current = preview ? silentSound : createStadiumSound();
  const [, bumpSound] = useState(0); // le son se coupe aussi pendant le direct : on relit sound.current.muted
  const uiSound = useCallback((kind) => sound.current.ui?.(kind), []);
  useEffect(() => { setUiSound(uiSound); }, [uiSound]);

  useEffect(() => {
    if (!state || preview) return;
    saveGame(state);
    if (liveDone.current) { liveDone.current = false; clearLive(); } // le résultat est sauvegardé : plus rien à reprendre
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  // chaque gain ou dépense s'anime (pièces vers la trésorerie, « +1 252 € », tintement)
  const prevMoney = useRef(null);
  useEffect(() => {
    const m = state ? state.money : null;
    if (m !== null && prevMoney.current !== null && m !== prevMoney.current) moneyBurst(m - prevMoney.current, sound.current);
    prevMoney.current = m;
  }, [state?.money]); // eslint-disable-line react-hooks/exhaustive-deps
  // revenus hors ligne calculés une seule fois au chargement
  useEffect(() => { if (!preview) setState((prev) => (prev ? applyOffline(clone(prev)) : prev)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inGame = screen === 'game' && !!state;
  const cinematic = !!state && (!!matchPhase || showResult || !!state.seasonReview || !!state.offline || !!drills);
  // Notifications (src/ui/notify.jsx) : en attente tant qu'un écran ne doit pas être couvert ; jamais dans les
  // aperçus de la galerie, sauf celui des notifications.
  const notes = useNotifications(preview ? preview !== 'notification' : !inGame || menu || cinematic || !!confirm);
  const { notify } = notes;
  useEffect(() => {
    (boot.ui.notes || []).forEach(notify);
    if (import.meta.env.DEV) window.__notify = notify; // essais en développement
    if (preview) return undefined;
    // la sauvegarde principale était illisible : la copie de secours de la dernière session a pris le relais
    if (lastLoad.source === 'backup') {
      notify({ kind: 'warn', eyebrow: 'Sauvegarde', title: 'Partie restaurée depuis la copie de secours', text: 'Ta sauvegarde était illisible. Tu reprends là où tu en étais à l’ouverture de ta dernière session.' });
    } else if (lastLoad.corrupt) {
      notify({ kind: 'warn', eyebrow: 'Sauvegarde', title: 'Sauvegarde illisible', text: 'Elle a été mise de côté, sans copie de secours disponible. Fonde un nouveau club, ou colle un code de sauvegarde dans les réglages.' });
    }
    // une nouvelle version du jeu est prête (service worker) : un bandeau propose de recharger
    const onUpdate = () => notify({ kind: 'info', eyebrow: 'Nouvelle version', title: 'FootOFF Empire a été mis à jour', text: 'Recharge pour en profiter : ta partie est sauvegardée.', action: { kind: 'update' } });
    window.addEventListener('fo-update', onUpdate);
    return () => window.removeEventListener('fo-update', onUpdate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Succès : débloqués au fil du jeu, datés. Une partie déjà commencée les retrouve d'un coup, sans notification.
  // Plusieurs d'un coup : un seul bandeau.
  useEffect(() => {
    if (!state) return;
    const fresh = newAchievements(state);
    const initial = !state.achievements;
    if (!fresh.length && !initial) return;
    setState((s) => (s ? { ...s, achievements: { ...(s.achievements || {}), ...Object.fromEntries(fresh) } } : s));
    if (initial || !fresh.length) return;
    const list = fresh.map(([id]) => achievementById(id));
    notify({
      kind: 'achievement',
      eyebrow: list.length > 1 ? `${list.length} succès débloqués` : 'Succès débloqué',
      title: list[0].title,
      text: list.length > 1 ? `Et aussi : ${list.slice(1).map((a) => a.title).join(' · ')}` : list[0].desc,
      action: { panel: 'trophies', tab: 'achievements', ids: fresh.map(([id]) => id) },
    });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Retour du navigateur (bouton Précédent, souris, geste ou touche retour d'Android) : il ferme la fenêtre du dessus
  // (fiche, panneau, bâtiment), comme Échap, au lieu de quitter le jeu. Une entrée d'historique, sans changer
  // l'adresse, garde la place tant qu'une fenêtre est ouverte ; fermée autrement, l'entrée est retirée.
  const layered = inGame && !preview && !!(panel || sel);
  const layeredRef = useRef(layered);
  layeredRef.current = layered;
  const backGuard = useRef({ armed: false, skip: false });
  useEffect(() => {
    const g = backGuard.current;
    if (layered && !g.armed) { window.history.pushState({ fo: 'layer' }, ''); g.armed = true; }
    else if (!layered && g.armed) { g.armed = false; g.skip = true; window.history.back(); }
  }, [layered]);
  useEffect(() => {
    const g = backGuard.current;
    const onPop = () => {
      if (g.skip) { g.skip = false; return; }
      if (!g.armed) return;
      g.armed = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      setTimeout(() => { // une fenêtre reste ouverte (la fiche fermée, le panneau dessous) : la garde revient
        if (layeredRef.current && !g.armed) { window.history.pushState({ fo: 'layer' }, ''); g.armed = true; }
      }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const run = (fn, failMsg) => {
    const base = clone(state);
    if (base?.tutorial) base.tutorial.just = []; // seules les primes gagnées par cette action s'annoncent, une fois
    const ns = fn(base);
    if (!ns) { notify({ kind: 'warn', title: failMsg || 'Action impossible.' }); return false; }
    setState(advanceTutorial(ns)); // une étape du tutoriel se valide dès que son objectif est atteint
    for (const r of ns.tutorial?.just || []) { // et sa prime s'annonce
      notify({ kind: 'success', eyebrow: 'Étape réussie', title: `${r.label} : +${r.money.toLocaleString('fr-FR')} €`, text: 'La prime est versée au club.' });
    }
    return true;
  };

  const openPanel = (id) => {
    if (id === 'stadium') { setPanel(null); setSel({ plotId: 't0', sector: 'main' }); return; } // accès direct au stade
    const target = id === 'club' ? 'finances' : id; // section Club : les finances d'abord
    // d'un onglet à l'autre de la même section, l'écran change sur place (sans glissement ni fondu) et le reste tant
    // que le panneau est ouvert : retirer la règle au bout d'un instant relançait l'animation d'entrée (le panneau
    // disparaissait puis revenait, 0,3 s après chaque changement d'onglet)
    const sec = panel ? sectionOf(panel) : null;
    setNavSwitch(!!target && !!sec && sectionOf(target) === sec);
    setNavDir(null);
    setPanel(target);
    if (target) setSel(null);
  };
  // section voisine (Équipe, Mercato, Saison, Club), rouverte sur l'écran qu'on y avait laissé
  const stepSection = (dir) => {
    const to = sectionNear(sectionOf(panel), dir);
    if (!to) return;
    const target = lastIn.current[to] || (SECTION_ENTRY[to] === 'club' ? 'finances' : SECTION_ENTRY[to]);
    uiSound('tab');
    setNavSwitch(false);
    setNavDir({ dir: dir > 0 ? 'next' : 'prev', panel: target });
    setPanel(target);
    setSel(null);
  };
  // onglets d'une section (nav.jsx) : « squad:lineup » ouvre l'Effectif sur la composition ; un bâtiment pas encore
  // construit (centre d'entraînement, académie, direction) le dit au lieu d'ouvrir un écran vide
  const goNav = (key) => {
    const [id, tab] = key.split(':');
    const need = LOCKS[id];
    if (need && !state.buildings[need]) {
      notify({ kind: 'info', eyebrow: 'Complexe', title: `${BUILDINGS[need].name} : à construire`, text: 'Bâtis-le sur une parcelle libre du complexe (bouton Bâtir) pour ouvrir cet écran.' });
      return;
    }
    if (id === 'squad') setSquadTab(tab || 'players');
    if (id === 'season') setSeasonTab(tab || 'calendar');
    if (id === 'mercato') setMercatoView(tab || 'buy');
    if (id === panel) return;
    openPanel(id);
  };
  // mercato ouvert sur une de ses vues (recruter, suivis, offres reçues, bilan)
  const openMercato = (view = null) => {
    setMercatoView(view || 'buy');
    openPanel('mercato');
  };
  const selectPlot = (plotId, sector) => { setSel({ plotId, sector }); setPanel(null); };
  // académie : son écran (l'équipe de jeunes) s'ouvre d'un clic sur le bâtiment ; sa fiche (amélioration) depuis
  // cet écran, la pastille dorée de la 3D ou un conseil du staff
  const openAcademy = (tab = 'youth', ids = []) => {
    setAcademyNav({ tab, ids });
    setNavKey((k) => k + 1);
    openPanel('academy');
  };
  // centre d'entraînement : même principe (la séance d'abord, la fiche du bâtiment depuis l'écran)
  const openTraining = (tab = 'session') => {
    setTrainingTab(tab);
    setNavKey((k) => k + 1);
    openPanel('training');
  };
  const pickPlot = (plotId, sector, how) => {
    if (matchPhase) return; // pendant un match (avant-match, direct), les bâtiments ne s'ouvrent pas
    const k = !how?.pin && state ? plotBuilding(state, plotId) : null;
    if (k === 'academy') openAcademy();
    else if (k === 'training') openTraining();
    else if (k === 'direction') openPanel('direction'); // la Direction du club : ses négociations
    else if (k === 'medical') openPanel('medical'); // le centre médical : les blessés à soigner
    else selectPlot(plotId, sector);
  };
  // une notification ouvre ce qu'elle annonce : le succès lui-même (salle des trophées, mis en évidence), les offres
  // reçues ou les joueurs suivis du mercato
  const onNoteAction = (a) => {
    if (a.kind === 'update') { applyUpdate(); return; }
    if (a.panel === 'trophies') { setTrophyTab(a.tab || 'honours'); setTrophyFocus(a.ids || []); }
    if ((a.panel === 'squad' && a.tab === 'market') || a.panel === 'mercato') { openMercato(a.view || null); return; }
    if (a.panel === 'squad') { setSquadTab(a.tab || 'players'); setSquadSheet(a.sheet ?? null); }
    if (a.panel === 'academy') setAcademyNav({ tab: a.tab || 'youth', ids: a.ids || [] });
    if (a.panel === 'training') setTrainingTab(a.tab || 'session');
    setNavKey((k) => k + 1);
    openPanel(a.panel);
  };
  const play = () => { // ouvre l'avant-match, le stade passe en configuration jour de match
    const ctx = matchContext(state);
    if (!ctx) return;
    if (staffOn(state)) run((s) => { staffSession(s); return s; }); // séances confiées au staff : faites avant le match
    setMatchCtx(ctx);
    setPanel(null); setSel(null); setMenu(false);
    setMatchDay(true);
    setMatchPhase('prematch');
  };
  const cancelMatch = () => { setMatchPhase(null); setMatchDay(false); };
  const kickoff = (lineup, tactic, formation) => {
    setResumeLive(null);
    clearLive();
    if (run((s) => { staffSession(s); s.lineup = lineup; s.tactic = tactic; s.formation = formation; return s; })) setMatchPhase('live');
  };
  const finishMatch = (result) => {
    setResumeLive(null);
    liveDone.current = true;
    run((s) => applyMatchResult(s, result));
    setMatchPhase(null);
    setMatchFx(null);
    setShowResult(true);
  };
  const closeResult = () => {
    setShowResult(false);
    setMatchDay(false);
    // académie : saison finie, les jeunes de 18 ans qui ne sont pas montés partiront à l'intersaison (rappel avant)
    const leaving = leavingYouth(state);
    if (leaving.length && !matchContext(state)) {
      const many = leaving.length > 1;
      notify({
        kind: 'academy', eyebrow: 'Académie · fin de saison',
        title: many ? `${leaving.length} jeunes vont quitter le club` : `${leaving[0].name} va quitter le club`,
        text: `Fais-${many ? 'les' : 'le'} monter en équipe première avant de terminer la saison, sinon ${many ? 'ils partiront' : 'il partira'}.`,
        action: { panel: 'academy', tab: 'youth', ids: leaving.map((p) => p.id) },
      });
    }
    // retour de mission des recruteurs, après cette journée : la liste ramenée est à voir à l'académie
    const back = state.scouting?.mission;
    if (back && state.lastMatch?.comp === 'league' && back.season === state.seasonNumber && back.round === state.round) {
      notify({
        kind: 'academy', eyebrow: 'Académie · retour de mission', title: back.back > 1 ? `${back.back} jeunes à voir` : 'Un jeune à voir',
        text: `${back.back > 1 ? 'Les plus prometteurs' : 'Le plus prometteur'} des ${back.seen} jeunes vus par tes recruteurs (${missionTarget(back)}).`,
        action: { panel: 'academy', tab: 'scout' },
      });
    }
    // blessés et suspendus du match : ils manqueront les prochaines dates
    const abs = state.lastMatch?.absences || [];
    if (abs.length) {
      const one = abs[0];
      notify({
        kind: 'warn', eyebrow: abs.length > 1 ? `${abs.length} absents pour la suite` : one.kind === 'injury' ? 'Blessure' : 'Suspension',
        title: abs.length > 1 ? abs.map((a) => a.name).join(', ') : `${one.name} : ${one.kind === 'injury' ? 'blessé' : 'suspendu'} ${one.matches} match${one.matches > 1 ? 's' : ''}`,
        text: abs.length > 1 ? abs.map((a) => `${a.name} ${a.matches} match${a.matches > 1 ? 's' : ''}`).join(' · ') : one.why[0].toUpperCase() + one.why.slice(1) + '.',
        // centre médical construit et un blessé : la notification mène aux soins
        action: state.buildings.medical > 0 && abs.some((a) => a.kind === 'injury') ? { panel: 'medical' } : { panel: 'squad', tab: 'players' },
      });
    }
    // ce qui a bougé au mercato pendant la journée : offres reçues, joueurs suivis partis ailleurs
    const n = state.mercatoNews;
    if (!n || n.key !== roundKey(state) || n.season) return;
    const gone = n.followedGone || [];
    const bits = [];
    if (n.offers) bits.push(`${n.offers} offre${n.offers > 1 ? 's' : ''} reçue${n.offers > 1 ? 's' : ''} pour tes joueurs`);
    if (gone.length) bits.push(`${gone.join(', ')} ${gone.length > 1 ? 'ont' : 'a'} signé ailleurs`);
    if (bits.length) {
      notify({
        kind: 'mercato', eyebrow: 'Mercato · pendant la journée', title: bits[0][0].toUpperCase() + bits[0].slice(1), text: bits[1],
        action: { panel: 'mercato', view: n.offers ? 'offers' : 'watch' },
      });
    }
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
  const onBuild = (plotId, key) => guardSpend(upgradeCost(key, 1), `Construire : ${BUILDINGS[key].name} ?`, () => {
    if (run((s) => build(s, plotId, key), 'Fonds insuffisants.')) {
      haptic('build');
      uiSound('build');
      notify({ kind: 'build', eyebrow: 'Chantier lancé', title: BUILDINGS[key].name });
    }
  });
  const onUpgrade = (key) => guardSpend(upgradeCost(key, state.buildings[key] + 1), `${BUILDINGS[key].name} : passer au niveau ${state.buildings[key] + 1} ?`, () => {
    if (run((s) => upgrade(s, key), 'Fonds insuffisants ou niveau maximum.')) {
      haptic('build');
      uiSound('build');
      notify({ kind: 'build', eyebrow: 'Amélioration', title: `${BUILDINGS[key].name} · niveau ${state.buildings[key] + 1}` });
    }
  });

  // Réglages partagés par l'écran titre et le menu pause ; code de sauvegarde à copier (d'un appareil à l'autre) ou à
  // coller (la partie importée remplace l'actuelle après confirmation, l'ancienne devient la copie de secours).
  const settings = {
    muted: sound.current.muted,
    onToggleSound: () => { sound.current.setMuted(!sound.current.muted); bumpSound((n) => n + 1); },
    vibration,
    canVibrate: canVibrate(),
    onToggleVibration: () => { setVibration(!vibration); setVibrationState(!vibration); },
    save: state ? { clubName: state.clubName, season: state.seasonNumber, division: DIVISIONS[state.divisionIndex].name } : null,
    onExport: state ? () => exportCode(state) : null,
    onImport: async (code) => {
      const raw = await decodeCode(code);
      if (!raw) return 'Ce code n’est pas une sauvegarde FootOFF Empire.';
      const apply = () => {
        const next = importSave(raw);
        if (!next) return;
        setState(next);
        setMenu(false); setSel(null); setPanel(null); setMatchDay(false); setShowResult(false); setMatchPhase(null); setResumeLive(null);
        setTitleView('menu');
        setScreen('game');
        notify({ kind: 'success', eyebrow: 'Sauvegarde', title: `${next.clubName} : partie restaurée`, text: `Saison ${next.seasonNumber}, ${DIVISIONS[next.divisionIndex].name}. L’ancienne partie est gardée en copie de secours.` });
      };
      if (!state) { apply(); return null; }
      setConfirm({
        tone: 'danger',
        title: `Remplacer ${state.clubName} par ${raw.clubName} ?`,
        text: `La partie actuelle (saison ${state.seasonNumber}, ${DIVISIONS[state.divisionIndex].name}) sera mise en copie de secours, et ${raw.clubName} (saison ${raw.seasonNumber}, ${DIVISIONS[raw.divisionIndex].name}) prendra sa place.`,
        confirmLabel: 'Restaurer cette partie',
        cancelLabel: 'Garder ma partie',
        onConfirm: apply,
      });
      return null;
    },
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
        setMenu(false); setSel(null); setPanel(null); setMatchDay(false); setShowResult(false); setMatchPhase(null); setResumeLive(null);
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
    else if (a.kind === 'panel' && a.panel === 'academy') openAcademy(a.tab, a.ids);
    else if (a.kind === 'panel' && a.panel === 'training') openTraining(a.tab);
    else if (a.kind === 'panel' && (a.panel === 'mercato' || (a.panel === 'squad' && a.tab === 'market'))) openMercato(a.view || null);
    else if (a.kind === 'panel') {
      if (a.panel === 'squad') setSquadTab(a.tab || 'players');
      if (a.panel === 'direction') setDirectionTab(a.tab || 'tv');
      openPanel(a.panel);
    }
    else if (a.kind === 'match') play();
  };
  const setTuto = (step) => run((s) => setTutorialStep(s, step));
  const onCoachPrimary = () => {
    if (tutoStep === 'welcome') setTuto('build');
    else if (tutoStep === 'squad') setTuto('goals');
    else if (tutoStep === 'goals') setTuto('stadium');
    else if (tutoStep === 'stadium') { setTuto('done'); notify({ kind: 'success', title: 'À toi de jouer, président !' }); }
    else doAction(tuto.action);
  };
  const tip = state && !tuto && !sel && !panel ? staffTip(state) : null;
  const shownTip = tip && !dismissedTips.has(tip.id) ? tip : null;
  const signals = state ? dockSignals(state) : {};
  const navPage = navDir && navDir.panel === panel ? navDir.dir : null; // sens du passage à la section voisine
  // navigation par sections (nav.jsx) : l'en-tête de chaque panneau y lit l'onglet actif et ses pastilles
  const nav = {
    panel, squadTab, seasonTab, mercatoView, go: goNav, step: stepSection, badges: signals.items || {}, switching: (navSwitch || !!navPage) && !!panel,
    built: state ? { training: state.buildings.training > 0, academy: state.buildings.academy > 0, direction: state.buildings.direction > 0, medical: state.buildings.medical > 0 } : {},
  };
  const hudKeys = inGame && !menu && !cinematic && !confirm && !preview; // raccourcis clavier du HUD (PC)
  const plotBadges = inGame && !cinematic ? actionablePlots(state) : [];
  const session = inGame && !cinematic ? sessionPin(state) : null; // épingle « Séance » sur le centre d'entraînement
  // bouton Construire du HUD : ouvre la vitrine sur la première parcelle libre (pastille dorée si un bâtiment est
  // payable tout de suite), ou la referme
  const freePlots = state ? freePlotsOf(state) : [];
  const shopOpen = !!sel && freePlots.includes(sel.plotId);
  const buildTool = !state || !freePlots.length || !allowedBuildingsFor(state).length ? null
    : shopOpen ? 'open' : plotBadges.some((id) => freePlots.includes(id)) ? 'dot' : 'idle';
  const toggleShop = () => { if (shopOpen) setSel(null); else if (freePlots.length) selectPlot(freePlots[0], 'main'); };
  // aperçu montré dans la 3D : seulement pour la parcelle dont la fiche est ouverte
  const holo = inGame && sel && buildView?.holo && buildView.plotId === sel.plotId
    ? { plotId: buildView.plotId, key: buildView.key, lvl: buildView.lvl, windowOpen: !!buildView.window } : null;
  // avant la création du club, la scène montre le complexe de départ
  const sceneState = state || (demo.current ||= createInitialState('FootOFF FC'));

  // la fiche (et ce qu'elle ouvre : carrière, comparaison, mise en vente) posée sur le panneau en cours ; elle se retire
  // d'elle-même une fois tout refermé (SquadView mode « sheet »)
  // calque au-dessus des fenêtres du panneau (la fiche carrière des Stats, qui l'a ouverte, passe dessous)
  const peekSheet = <Presence>{peek !== null && <div className="peek-layer"><SquadView key={peek} mode="sheet" state={state} run={run} ask={setConfirm} initialSheet={peek} onMercato={openMercato} onClose={() => setPeek(null)} /></div>}</Presence>;

  return (
    <NavContext.Provider value={nav}>
    <div className={`game ${inGame ? 'playing' : 'titled'} ${menu ? 'paused' : ''} ${cinematic ? 'cinematic' : ''} ${panel ? 'has-panel' : ''} ${['squad', 'mercato', 'academy', 'training', 'season', 'stats', 'trophies'].includes(panel) ? 'wide-panel' : ''} ${sel ? 'has-sel' : ''} ${navSwitch && panel ? 'nav-switch' : ''}`} data-tuto={inGame && tuto ? tutoStep : undefined} data-nav={navPage || undefined}>
      <div className="stage">
        {preview ? (
          <div className="stage-preview" aria-hidden="true" />
        ) : webglOk ? (
          <Suspense fallback={null}>
            <Empire3D
              state={sceneState}
              timeMode={timeMode}
              matchDay={matchDay}
              live={matchPhase === 'live'}
              matchFx={matchFx}
              matchInfo={matchInfo}
              recenter={recenter}
              selectedPlot={inGame ? sel?.plotId || null : null}
              holo={holo}
              badges={plotBadges}
              session={session}
              onSession={() => openPanel('training')}
              attract={!inGame}
              paused={menu || !!drills}
              onLoadProgress={setLoadProgress}
              onLoaded={() => setSceneLoaded(true)}
              onSelectPlot={pickPlot}
              onEmptyTap={() => setSel(null)}
              onOpenTrophies={() => openPanel('trophies')}
              onWebGLFail={() => { setWebglOk(false); setBooted(true); }}
            />
          </Suspense>
        ) : (
          <Empire2D state={sceneState} onSelect={pickPlot} />
        )}
      </div>

      {inGame && (
        <div className="hud">
          <TopHud state={state} onMenu={() => setMenu(true)} onFinances={() => openPanel('finances')} onReputation={() => openPanel('reputation')} onTable={() => goNav('season:table')} />
          <div className="hud-left">
          {tuto ? (
            <CoachCard
              content={tuto}
              onPrimary={onCoachPrimary}
              onSecondary={() => { doAction(tuto.secondary?.action); setTuto('done'); }}
              onSkip={() => { setTuto('done'); notify({ kind: 'info', title: 'Tutoriel passé', text: 'Le staff continuera de te conseiller.' }); }}
            />
          ) : (
            <ObjectiveWidget state={state} collapsed={goalCollapsed} onToggle={() => setGoalCollapsed((c) => !c)} />
          )}
          <Presence>
            {shownTip && !webglOk && ( // sans 3D, pas de colonne d'outils : le conseil garde sa carte
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
              matchDay={matchDay}
              onTime={() => setTimeMode((m) => cycle(m, ['auto', 'day', 'night'], 'fo-time'))}
              onMatchDay={() => setMatchDay((m) => !m)}
              onRecenter={() => { setMatchDay(false); setRecenter((r) => r + 1); }}
              build={buildTool}
              onBuild={toggleShop}
              keys={hudKeys && !panel}
              tip={shownTip}
              onTipAction={() => doAction(shownTip.action)}
              onTipDismiss={() => setDismissedTips((d) => new Set(d).add(shownTip.id))}
            />
          )}
          <MatchCta state={state} onPlay={play} onEndSeason={() => run(endSeason)} keys={hudKeys && !panel && !sel} />
          <Dock panel={panel} onPanel={openPanel} badges={signals} keys={hudKeys} />
        </div>
      )}

      <Presence>
        {inGame && panel === 'squad' && (
          <SquadView
            key={navKey}
            mode="squad"
            state={state}
            run={run}
            ask={setConfirm}
            preview={boot.ui.squad}
            tab={squadTab}
            onTab={setSquadTab}
            onMercato={openMercato}
            initialSheet={squadSheet}
            onClose={() => { setPanel(null); setSquadTab('players'); setSquadSheet(null); }}
            onFinances={() => openPanel('finances')}
          />
        )}
      </Presence>
      <Presence>
        {inGame && panel === 'mercato' && (
          <SquadView
            key={navKey}
            mode="mercato"
            state={state}
            run={run}
            ask={setConfirm}
            preview={boot.ui.squad}
            onTab={(t) => { setSquadTab(t); openPanel('squad'); }}
            mercatoView={mercatoView}
            onMercatoView={setMercatoView}
            onClose={() => setPanel(null)}
            onFinances={() => openPanel('finances')}
          />
        )}
      </Presence>
      <Presence>
        {inGame && panel === 'academy' && (
          <AcademyView
            key={navKey}
            state={state}
            run={run}
            ask={setConfirm}
            notify={notify}
            initialTab={academyNav.tab}
            focus={academyNav.ids}
            preview={boot.ui.academy}
            onClose={() => { setPanel(null); setAcademyNav({ tab: 'youth', ids: [] }); }}
            onBuilding={() => { const plot = plotOf(state, 'academy'); if (plot) selectPlot(plot.id, plot.sector); }}
          />
        )}
      </Presence>
      <Presence>
        {inGame && panel === 'training' && !drills && ( // pendant les épreuves, rien n'est atteignable derrière (clavier, manette)
          <TrainingView
            key={navKey}
            state={state}
            run={run}
            ask={setConfirm}
            notify={notify}
            initialTab={trainingTab}
            preview={boot.ui.training}
            onPlay={playDrills}
            onClose={() => { setPanel(null); setTrainingTab('session'); }}
            onBuilding={() => { const plot = plotOf(state, 'training'); if (plot) selectPlot(plot.id, plot.sector); }}
          />
        )}
      </Presence>
      <Presence>
        {inGame && panel === 'direction' && (
          <DirectionView
            state={state}
            run={run}
            notify={notify}
            initialTab={directionTab}
            onClose={() => setPanel(null)}
            onBuilding={() => { const plot = plotOf(state, 'direction'); if (plot) selectPlot(plot.id, plot.sector); }}
          />
        )}
      </Presence>
      <Presence>
        {inGame && panel === 'medical' && (
          <MedicalView
            state={state}
            run={run}
            onClose={() => setPanel(null)}
            onBuilding={() => { const plot = plotOf(state, 'medical'); if (plot) selectPlot(plot.id, plot.sector); }}
          />
        )}
      </Presence>
      {inGame && drills && <DrillRunner key={drillsKey} state={state} queue={drills} run={run} sound={sound.current} notify={notify} onClose={() => setDrills(null)} />}
      <Presence>{inGame && panel === 'season' && <SeasonPanel state={state} tab={seasonTab} initialSel={boot.ui.seasonSel} onClose={() => setPanel(null)} onPlay={play} onOpenMatch={(m) => { setStatsMatch(m); openPanel('stats'); }} onPlayerSheet={setPeek} sheet={peekSheet} sheetOpen={peek !== null} />}</Presence>
      <Presence>{inGame && panel === 'journal' && <JournalPanel state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{inGame && panel === 'reputation' && <ReputationPanel state={state} onClose={() => setPanel(null)} />}</Presence>
      <Presence>{inGame && panel === 'trophies' && <TrophyRoom key={navKey} state={state} initialTab={trophyTab} focus={trophyFocus} onClose={() => { setPanel(null); setTrophyTab('honours'); setTrophyFocus([]); }} />}</Presence>
      <Presence>{inGame && panel === 'stats' && <StatsPanel state={state} initialMatch={statsMatch} initialTab={boot.ui.statsTab || null} onClose={() => { setPanel(null); setStatsMatch(null); }} onPlayerSheet={setPeek} sheet={peekSheet} sheetOpen={peek !== null} />}</Presence>
      <Presence>
        {inGame && panel === 'finances' && (
          <FinancesPanel state={state} onClose={() => setPanel(null)} onOpenSquad={() => { setSquadTab('players'); setPanel('squad'); }} />
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
            onTransfers={() => { setSel(null); openMercato(); }}
            onAcademy={() => openAcademy()}
            onTraining={() => openTraining()}
            onDirection={() => { setDirectionTab('tv'); openPanel('direction'); }}
            onMedical={() => openPanel('medical')}
            onTickets={() => { setSel(null); setDirectionTab('tickets'); openPanel('direction'); }}
            onPreview={setBuildView}
            onSwitchPlot={(id) => selectPlot(id, 'main')}
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
          restore={resumeLive}
          onFx={(fx) => { if (fx.type === 'goal') haptic('goal'); setMatchFx({ ...fx, id: performance.now() }); }}
          onFinish={finishMatch}
        />
      )}
      <Presence>{inGame && showResult && <PostMatch state={state} initialStep={boot.ui.postStep} onClose={closeResult} onStats={() => { closeResult(); setStatsMatch('last'); setPanel('stats'); }} />}</Presence>
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
            liveNote={resumeLive && matchPhase === 'live' ? liveNoteOf(resumeLive) : null}
            onNewGame={askNewGame}
            onCreate={(name, crest) => { setState(createInitialState(name, crest)); setTitleView('menu'); setScreen('game'); }}
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
      <Notifications current={notes.current} done={notes.done} onAction={onNoteAction} sound={uiSound} />
      <TipLayer />
      <Presence ms={500}>
        {((webglOk && !preview && !booted) || boot.ui.loading != null) && (
          <LoadingScreen info={loadProgress} done={sceneLoaded} fixed={boot.ui.loading ?? null} onFinished={() => setBooted(true)} />
        )}
      </Presence>
    </div>
    </NavContext.Provider>
  );
}
