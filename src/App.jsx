import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMatchResult, applyOffline, build, createInitialState, dismissOffline, dismissReview, endSeason, matchContext, staffSession, upgrade,
} from './game/engine';
import { staffOn } from './game/training';
import { BUILDINGS, DIVISIONS, upgradeCost } from './game/constants';
import { fmtMoney } from './ui/format';
import { clubAfter, withArticle } from './game/names';
import { dealOnScreen, leagueNote } from './ui/mercato';
import { clearGame, clearLive, decodeCode, exportCode, importForeign, importSave, langOf, lastLoad, loadGame, loadLive, saveGame } from './game/save';
import { LIVE_VERSION, liveKeyOf } from './game/live';
import { applyUpdate } from './ui/updates';
import { CrashScreen } from './ui/crash';
import { clone } from './game/utils';
import Empire2D from './ui/EmpireView';
import { Dock, MatchCta, ObjectiveWidget, PadHints, SceneTools, TopHud } from './ui/hud';
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
import { LeagueView } from './ui/league';
import { deadlineText, leagueLang, leagueOpen } from './game/league';
import { LeagueError, deadlineAt, kickoffAt, leagueHumans, leagueResults, myLeagues, publishRoster, pulseUrgent, refreshLeague, sendMove, sendSheet, takeInvite, userActive, watchPulse } from './game/leagueNet';
import { applyLeagueRound, closeGoneDeals, createLeagueClub, leagueClubProgress, leagueRequest, leagueRoster, leagueRosterSig, loadLeagueClub, myReplay, readLeagueClub, saveLeagueClub, settleLeague, syncLeagueClub, teamSheet } from './game/leagueClub';
import { adoptPulled, cloudNote, cloudPlan, isPushing, markUnreadable, playedPrint, pullClub, pushClub, savedWhen, stageOf, syncOf } from './game/leagueCloud';
import ConfirmDialog from './ui/confirm';
import { Presence } from './ui/presence';
import { LoadingScreen } from './ui/loading';
import { knowCrests } from './game/crest';
import { setOurKit } from './game/kits';
import { TitleScreen } from './ui/title';
import { PauseMenu } from './ui/pause';
import { setUiSound } from './ui/console';
import { padFocusDefault } from './ui/input'; // manette : traduite en touches du clavier pour tous les menus
import { moneyBurst } from './ui/moneyfx';
import { previewState, previewUi, silentSound } from './ui/preview';
import { FacesSheet } from './ui/facesheet';
import { canVibrate, haptic, setVibration, vibrationEnabled } from './ui/haptics';
import { fluidEnabled, setFluid } from './three/adapt';
import { actionablePlots, dismissTip, dockSignals, seasonEndForecast, sessionPin, staffTip } from './game/advice';
import { PLOTS, allowedBuildingsFor, plotBuilding, plotOf } from './game/map';
import { leavingYouth, missionCount } from './game/academy';
import { advanceTutorial, setTutorialStep, stepContent } from './game/tutorial';
import { roundKey } from './game/mercato';
import { createStadiumSound } from './ui/sound';
import { achievementById, newAchievements } from './game/achievements';
import { advanceJourney, journeyDue } from './game/journey';
import { LOCKS, NavContext, SECTION_ENTRY, sectionNear, sectionOf } from './ui/nav';
import { bootIntent, eur, gameLang, LANG, numLocale, reloadInLang, setPreferredLang, t, tn } from './i18n/index';

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
  const when = phase === 'halftime' ? t('mi-temps') : t('{v}e minute', { v: mm > base ? `${base}+${mm - base}` : mm });
  return t('Match en cours · {when} contre {name}', { when, name: rec.ctx.opp.name });
}

// preview : nom d'un écran à afficher d'emblée avec une partie fictive (galerie), sans sauvegarde ni 3D.
export default function App({ preview = null }) {
  if (preview === 'erreur') return <CrashScreen error={new Error('TypeError: Cannot read properties of null (reading \'C\')')} summary={t('FootOFF FC · saison 3 · Régionale')} preview />;
  if (preview === 'visages') return <FacesSheet />; // planche de visages (galerie)
  const [boot] = useState(() => {
    if (!preview) {
      const st = loadGame();
      // foreign : la carrière fondée dans une autre langue, qui ne s'ouvre que dans la sienne (game/save.js) ; intent : ce
      // que le rechargement dans une langue devait faire (reprendre la partie, fonder un club, rouvrir Langue, une ligue)
      return { state: st, ui: {}, live: pendingLive(st), foreign: lastLoad.foreign, intent: bootIntent() };
    }
    const st = previewState(preview);
    return { state: st, ui: previewUi(preview, st) };
  });
  const [state, setState] = useState(boot.state);
  knowCrests(state?.league ? state.rivals : null); // écussons des amis, sur tous les écrans (game/crest.js)
  setOurKit(state?.crest); // notre tenue aux couleurs de l'écusson : 3D, portraits (game/kits.js)
  const [foreign, setForeign] = useState(boot.foreign || null);
  const go = boot.intent?.go;
  const [screen, setScreen] = useState(boot.ui.screen || (preview || (go === 'continue' && boot.state) ? 'game' : 'title')); // 'title' | 'game'
  const [titleView, setTitleView] = useState(boot.ui.titleView || (go === 'create' || go === 'lang' ? go : 'menu')); // menu, réglages, langue, création du club
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
  const [goalCollapsed, setGoalCollapsed] = useState(() => window.innerWidth < 760 || window.innerHeight <= 500); // replié sur mobile, en portrait comme couché
  const [menu, setMenu] = useState(!!boot.ui.menu);
  const [menuFocus, setMenuFocus] = useState(null); // menu pause ouvert sur une entrée des réglages (notification)
  useEffect(() => { if (!menu) setMenuFocus(null); }, [menu]);
  const [vibration, setVibrationState] = useState(vibrationEnabled);
  const [fluid, setFluidState] = useState(fluidEnabled); // réglage « Fluidité sur appareil lent » (three/adapt.js)
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
  const [confirm, setConfirm] = useState(boot.ui.confirm || null); // fenêtre de confirmation du jeu (vente, nouvelle partie…)
  // Siège de la Ligue ouvert sur l'écran titre (un invité n'a besoin ni du bâtiment ni d'une partie) : { invite } quand
  // on arrive par un lien d'invitation (…/footoffempire/?ligue=CODE), la fenêtre s'ouvre alors sur « rejoindre »
  // match d'un championnat entre amis revu en 3D (league.js replayOf) : l'écran du direct en rejeu, par-dessus tout ;
  // result : la journée à appliquer à la partie de ligue en cours une fois le match vu
  const [replay, setReplay] = useState(null);
  // Partie de ligue en cours (state.league, leagueClub.js) : la dernière lecture du serveur { d, m, prev } (prev : les
  // résultats de la saison d'avant, tant que la partie ne les a pas tous appliqués)
  const [leagueLive, setLeagueLive] = useState(null);
  const [leagueHub, setLeagueHub] = useState(() => {
    if (preview || !leagueOpen()) return null;
    const code = takeInvite();
    if (code) return { invite: code };
    return boot.intent?.hub ? { open: boot.intent.hub } : null; // championnat rouvert dans sa langue (league.jsx)
  });
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
    if (state.league) saveLeagueClub(state); else saveGame(state);
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
  const cinematic = !!replay || (!!state && (!!matchPhase || showResult || !!state.seasonReview || !!state.offline || !!drills));
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
      notify({ kind: 'warn', eyebrow: t('Sauvegarde'), title: t('Partie restaurée depuis la copie de secours'), text: t('Ta sauvegarde était illisible. Tu reprends là où tu en étais à l’ouverture de ta dernière session.') });
    } else if (lastLoad.corrupt) {
      notify({ kind: 'warn', eyebrow: t('Sauvegarde'), title: t('Sauvegarde illisible'), text: t('Elle a été mise de côté, sans copie de secours disponible. Fonde un nouveau club, ou colle un code de sauvegarde dans les réglages.') });
    }
    // une nouvelle version du jeu est prête (service worker) : un bandeau propose de recharger
    const onUpdate = () => notify({ kind: 'info', eyebrow: t('Nouvelle version'), title: t('FootOFF Empire a été mis à jour'), text: t('Recharge pour en profiter : ta partie est sauvegardée.'), action: { kind: 'update' } });
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
      eyebrow: tn(list.length, 'Succès débloqué', '{length} succès débloqués', { length: list.length }, list.length > 1),
      title: list[0].title,
      text: list.length > 1 ? t('Et aussi : {join}', { join: list.slice(1).map((a) => a.title).join(' · ') }) : list[0].desc,
      action: { panel: 'trophies', tab: 'achievements', ids: fresh.map(([id]) => id) },
    });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parcours de carrière (journey.js, 0.8.11) : un chapitre accompli verse sa prime aussitôt et s'annonce. La première
  // fois, une partie déjà avancée retrouve sans prime les chapitres déjà accomplis. Mise à jour fonctionnelle : elle
  // s'ajoute à celle des succès, juste au-dessus, sans l'écraser.
  useEffect(() => {
    if (!state || preview || !journeyDue(state)) return;
    const done = advanceJourney(clone(state));
    setState((s) => { if (!s) return s; const n = clone(s); advanceJourney(n); return n; });
    if (done) {
      notify({
        kind: 'achievement', eyebrow: t('Carrière · chapitre accompli'), title: done.title, text: t('{goal} Récompense : {label}.', { goal: done.goal, label: done.reward.label }),
        action: { panel: 'trophies', tab: 'career' },
      });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manette : L3 et R3 (clic des sticks) passent d'un bâtiment du complexe à son voisin et ouvrent sa fiche, comme un
  // clic sur le bâtiment en 3D (ui/input.js). Réinscrit à chaque rendu : lit toujours l'état courant.
  useEffect(() => {
    if (!hudKeys) return undefined;
    const onPlot = (e) => {
      const built = PLOTS.filter((p) => plotBuilding(state, p.id));
      if (!built.length) return;
      const at = built.findIndex((p) => p.id === sel?.plotId);
      const next = at < 0 ? built[e.detail > 0 ? 0 : built.length - 1] : built[(at + e.detail + built.length) % built.length];
      uiSound('tab');
      selectPlot(next.id, next.sector);
      setTimeout(padFocusDefault, 420); // la fiche ouverte : focus sur son action principale
    };
    window.addEventListener('padplot', onPlot);
    return () => window.removeEventListener('padplot', onPlot);
  });

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
  // En match (0.8.6, demande du PDG : avant-match, direct, mi-temps, après-match, rejeu) : l'entrée posée à l'ouverture
  // efface toute page « suivante » (le glissement de bord de Safari ramenait l'image figée d'une fenêtre fermée), et un
  // retour ne fait rien : l'entrée revient aussitôt. Posée une fois l'écran du match affiché, l'image que Safari garde
  // de l'entrée d'avant est celle du match : le geste de côté ne montre rien d'autre.
  const inMatch = inGame && !preview && !!(matchPhase || showResult || replay);
  const layered = inGame && !preview && !!(panel || sel || inMatch);
  const layeredRef = useRef(layered);
  layeredRef.current = layered;
  const inMatchRef = useRef(inMatch);
  inMatchRef.current = inMatch;
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
      if (inMatchRef.current) { window.history.pushState({ fo: 'layer' }, ''); return; } // en match : rien ne bouge
      g.armed = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      setTimeout(() => { // une fenêtre reste ouverte (la fiche fermée, le panneau dessous) : la garde revient
        if (layeredRef.current && !g.armed) { window.history.pushState({ fo: 'layer' }, ''); g.armed = true; }
      }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Partout dans le jeu (0.8.10 en match, 0.8.16 sur tous les écrans, demande du PDG : au téléphone couché, glisser de
  // côté faisait défiler la page) : le glissement depuis le bord de l'écran (iPhone : retour, avance) ne s'amorce plus.
  // La garde ci-dessus empêchait le retour, mais Safari montrait encore l'image de l'écran d'avant pendant le geste :
  // un toucher qui commence à moins de EDGE du bord est retenu. Un toucher bref sur un bouton du bord reste un clic,
  // sur un champ il y place le curseur.
  useEffect(() => {
    if (preview) return undefined;
    const EDGE = 24;
    let held = null; // { target, x, y } : toucher retenu au bord
    const start = (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || (t.clientX > EDGE && t.clientX < window.innerWidth - EDGE)) { held = null; return; }
      e.preventDefault();
      held = { target: e.target, x: t.clientX, y: t.clientY };
    };
    const end = (e) => {
      if (!held) return;
      const t = e.changedTouches[0];
      const tap = Math.hypot(t.clientX - held.x, t.clientY - held.y) < 10;
      const el = held.target instanceof Element ? held.target.closest('button, a, [role="button"], input, select, textarea, label') : null;
      held = null;
      if (!tap || !el || el.disabled) return;
      if (el.matches('textarea, select, input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"])')) el.focus();
      else el.click();
    };
    document.addEventListener('touchstart', start, { passive: false, capture: true });
    document.addEventListener('touchend', end, { capture: true });
    return () => {
      document.removeEventListener('touchstart', start, { capture: true });
      document.removeEventListener('touchend', end, { capture: true });
    };
  }, [preview]);

  const run = (fn, failMsg) => {
    const base = clone(state);
    if (base?.tutorial) base.tutorial.just = []; // seules les primes gagnées par cette action s'annoncent, une fois
    const ns = fn(base);
    if (!ns) { notify({ kind: 'warn', title: failMsg || t('Action impossible.') }); return false; }
    if (ns.league) closeGoneDeals(ns); // un joueur parti autrement rompt ses négociations entre amis
    setState(advanceTutorial(ns)); // une étape du tutoriel se valide dès que son objectif est atteint
    for (const r of ns.tutorial?.just || []) { // et sa prime s'annonce
      notify({ kind: 'success', eyebrow: t('Étape réussie'), title: t('{label} : +{amount}', { label: r.label, amount: LANG !== 'fr' ? eur(r.money) : `${r.money.toLocaleString(numLocale())} €` }), text: t('La prime est versée au club.') });
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
      notify({ kind: 'info', eyebrow: t('Complexe'), title: t('{name} : à construire', { name: BUILDINGS[need].name }), text: t('Bâtis-le sur une parcelle libre du complexe (bouton Bâtir) pour ouvrir cet écran.') });
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
    else if (k === 'league' && leagueOpen()) openPanel('league'); // le Siège de la Ligue : les championnats entre amis
    else selectPlot(plotId, sector);
  };
  // une notification ouvre ce qu'elle annonce : le succès lui-même (salle des trophées, mis en évidence), les offres
  // reçues ou les joueurs suivis du mercato
  const onNoteAction = (a) => {
    if (a.kind === 'update') { applyUpdate(); return; }
    if (a.kind === 'settings') { setMenuFocus(a.row || null); setMenu(true); return; }
    if (a.panel === 'trophies') { setTrophyTab(a.tab || 'honours'); setTrophyFocus(a.ids || []); }
    if ((a.panel === 'squad' && a.tab === 'market') || a.panel === 'mercato') { openMercato(a.view || null); return; }
    if (a.panel === 'squad') { setSquadTab(a.tab || 'players'); setSquadSheet(a.sheet ?? null); }
    if (a.panel === 'academy') setAcademyNav({ tab: a.tab || 'youth', ids: a.ids || [] });
    if (a.panel === 'training') setTrainingTab(a.tab || 'session');
    setNavKey((k) => k + 1);
    openPanel(a.panel);
  };
  // ligue : compte à rebours lancé, les équipes sont verrouillées (0.8.20, règle du PDG) ; plus d'avant-match ni d'envoi
  const leagueLocked = () => !!(state?.league && leagueKickoff && leagueKickoff > Date.now());
  const lockedNote = () => notify({ kind: 'info', eyebrow: state.league.name, title: t('Équipes verrouillées'), text: t('Tout le monde a validé : le compte à rebours est lancé et le match se joue avec les équipes validées.'), key: 'league-locked' });
  const play = () => { // ouvre l'avant-match, le stade passe en configuration jour de match
    const ctx = matchContext(state);
    if (!ctx) return;
    if (leagueLocked()) { lockedNote(); return; }
    if (staffOn(state)) run((s) => { staffSession(s); return s; }); // séances confiées au staff : faites avant le match
    // ligue : l'avant-match valide l'équipe de la journée (le match se joue à l'heure, pour tous) ; l'écusson d'un ami
    setMatchCtx(state.league ? { ...ctx, opp: { ...ctx.opp, crest: ctx.opp.human ? ctx.opp.crest : null }, goLabel: state.league.sent ? t('Valider ces changements') : t('Valider mon équipe') } : ctx);
    setPanel(null); setSel(null); setMenu(false);
    setMatchDay(true);
    setMatchPhase('prematch');
  };
  const cancelMatch = () => { setMatchPhase(null); setMatchDay(false); };
  const kickoff = (lineup, tactic, formation, plans) => {
    if (state.league) { sendLeagueTeam(lineup, tactic, formation, plans); return; }
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
        kind: 'academy', eyebrow: t('Académie · fin de saison'),
        title: many ? t('{length} jeunes vont quitter le club', { length: leaving.length }) : t('{name} va quitter le club', { name: leaving[0].name }),
        text: t('Fais-{v} monter en équipe première avant de terminer la saison, sinon {v2}.', { v: many ? t('les') : t('le'), v2: many ? t('ils partiront') : t('il partira') }),
        action: { panel: 'academy', tab: 'youth', ids: leaving.map((p) => p.id) },
      });
    }
    // mission en cours (0.8.12) : la nouvelle du repérage de cette journée
    const news = state.mission?.news?.at(-1);
    if (news && state.lastMatch?.comp === 'league' && news.season === state.seasonNumber && news.round === state.round) {
      notify({ kind: 'academy', eyebrow: t('Académie · mission en cours, repérage {step} sur {steps}', { step: news.step, steps: state.mission.steps }), title: news.up && news.best === 'rare' ? t('Un talent rare repéré') : t('Nouvelles des recruteurs'), text: news.up && news.best === 'rare' ? news.text.replace(new RegExp(`\\s?:\\s?${t('un talent rare').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.$`), '.') : news.text, action: { panel: 'academy', tab: 'scout' } });
    }
    // retour de mission des recruteurs, après cette journée : la liste ramenée est à voir à l'académie
    const back = state.scouting?.mission;
    if (back && state.lastMatch?.comp === 'league' && back.season === state.seasonNumber && back.round === state.round) {
      notify({
        kind: 'academy', eyebrow: t('Académie · retour de mission'), title: tn(back.back, 'Un jeune à voir', '{back} jeunes à voir', { back: back.back }, back.back > 1),
        text: t('{tn} parmi les {missionCount} vus par tes recruteurs.', { tn: tn(back.back, 'Le plus prometteur', 'Les plus prometteurs', {}, back.back > 1), missionCount: missionCount(back, back.seen) }),
        action: { panel: 'academy', tab: 'scout' },
      });
    }
    // blessés et suspendus du match : ils manqueront les prochaines dates
    const abs = state.lastMatch?.absences || [];
    if (abs.length) {
      const one = abs[0];
      notify({
        kind: 'warn', eyebrow: abs.length > 1 ? t('{length} absents pour la suite', { length: abs.length }) : one.kind === 'injury' ? t('Blessure') : t('Suspension'),
        title: abs.length > 1 ? abs.map((a) => a.name).join(', ') : tn(one.matches, '{name} : {v} {matches} match', '{name} : {v} {matches} matchs', { name: one.name, v: one.kind === 'injury' ? t('blessé') : t('suspendu'), matches: one.matches }, one.matches > 1),
        text: abs.length > 1 ? abs.map((a) => tn(a.matches, '{name} {n} match', '{name} {n} matchs', { name: a.name, n: a.matches }, a.matches > 1)).join(' · ') : one.why[0].toUpperCase() + one.why.slice(1) + '.',
        // centre médical construit et un blessé : la notification mène aux soins
        action: state.buildings.medical > 0 && abs.some((a) => a.kind === 'injury') ? { panel: 'medical' } : { panel: 'squad', tab: 'players' },
      });
    }
    // ce qui a bougé au mercato pendant la journée : offres reçues, joueurs suivis partis ailleurs
    const n = state.mercatoNews;
    if (!n || n.key !== roundKey(state) || n.season) return;
    const gone = n.followedGone || [];
    const bits = [];
    if (n.offers) bits.push(tn(n.offers, '{offers} offre reçue pour tes joueurs', '{offers} offres reçues pour tes joueurs', { offers: n.offers }, n.offers > 1));
    if (gone.length) bits.push(t('{join} {tn} signé ailleurs', { join: gone.join(', '), tn: tn(gone.length, 'a', 'ont', {}, gone.length > 1) }));
    if (bits.length) {
      notify({
        kind: 'mercato', eyebrow: t('Mercato · pendant la journée'), title: bits[0][0].toUpperCase() + bits[0].slice(1), text: bits[1],
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
      text: t('Avec cette dépense, la saison finirait dans le rouge. Au coup de sifflet final, le conseil vendrait tes plus gros salaires pour redresser les comptes.'),
      rows: [
        [t('Coût'), `−${fmtMoney(cost)}`, 'down'],
        [t('Entretien en plus'), t('{upkeep} / saison', { upkeep: fmtMoney(upkeep) }), 'down'],
        [t('Fin de saison prévue'), `${fmtMoney(end)} → ${fmtMoney(after)}`, 'down'],
      ],
      confirmLabel: t('Dépenser quand même'),
      cancelLabel: t('Renoncer'),
      onConfirm: go,
    });
  };
  const onBuild = (plotId, key) => guardSpend(upgradeCost(key, 1), t('Construire : {name} ?', { name: BUILDINGS[key].name }), () => {
    if (run((s) => build(s, plotId, key), t('Fonds insuffisants.'))) {
      haptic('build');
      uiSound('build');
      notify({ kind: 'build', eyebrow: t('Chantier lancé'), title: BUILDINGS[key].name });
    }
  });
  const onUpgrade = (key) => guardSpend(upgradeCost(key, state.buildings[key] + 1), t('{name} : passer au niveau {v} ?', { name: BUILDINGS[key].name, v: state.buildings[key] + 1 }), () => {
    if (run((s) => upgrade(s, key), t('Fonds insuffisants ou niveau maximum.'))) {
      haptic('build');
      uiSound('build');
      notify({ kind: 'build', eyebrow: t('Amélioration'), title: t('{name} · niveau {v}', { name: BUILDINGS[key].name, v: state.buildings[key] + 1 }) });
    }
  });

  // Le jeu rame fort sur cet appareil (sous 15 images par seconde), réglage de fluidité coupé : il est proposé une seule
  // fois, la notification mène au réglage lui-même (menu pause, Réglages).
  // Musique de fond (1.0.6) : à l'écran titre et dans le complexe ; elle s'efface pendant les matchs (avant-match, direct,
  // après-match), les rejeux de ligue, les épreuves en 3D, le bilan de saison et les gains hors ligne, et quand le jeu
  // passe en arrière-plan ; elle reprend ensuite (sound.js)
  const [hiddenPage, setHiddenPage] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  useEffect(() => {
    const seen = () => setHiddenPage(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, []);
  useEffect(() => { sound.current.setMusic?.(!preview && !cinematic && !hiddenPage); }, [cinematic, hiddenPage]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLag = () => {
    try { if (localStorage.getItem('fo-fluid-hint')) return; localStorage.setItem('fo-fluid-hint', '1'); } catch { return; }
    notify({ kind: 'info', eyebrow: t('Fluidité'), title: t('Le jeu rame sur cet appareil'), text: t('Active « Fluidité sur appareil lent » dans les réglages : la 3D sera un peu moins nette, mais fluide.'), action: { kind: 'settings', row: 'fluid' } });
  };

  // Réglages partagés par l'écran titre et le menu pause ; code de sauvegarde à copier (d'un appareil à l'autre) ou à
  // coller (la partie importée remplace l'actuelle après confirmation, l'ancienne devient la copie de secours).
  const settings = {
    muted: sound.current.muted,
    onToggleSound: () => { sound.current.setMuted(!sound.current.muted); bumpSound((n) => n + 1); },
    musicVolume: sound.current.musicVolume ?? 0,
    onMusicVolume: (v) => { sound.current.setMusicVolume?.(v); bumpSound((n) => n + 1); },
    vibration,
    canVibrate: canVibrate(),
    onToggleVibration: () => { setVibration(!vibration); setVibrationState(!vibration); },
    fluid,
    onToggleFluid: () => { setFluid(!fluid); setFluidState(!fluid); },
    save: state ? { clubName: state.clubName, season: state.seasonNumber, division: DIVISIONS[state.divisionIndex].name } : null,
    onExport: state ? () => exportCode(state) : null,
    onImport: async (code) => {
      const raw = await decodeCode(code);
      if (!raw) return t('Ce code n’est pas une sauvegarde FootOFF Empire.');
      const cur = state || foreign;
      const apply = () => {
        if (langOf(raw) !== gameLang()) { if (importForeign(raw)) reloadInLang(langOf(raw), { go: 'continue' }); return; }
        const next = importSave(raw);
        if (!next) return;
        setState(next); setForeign(null);
        setMenu(false); setSel(null); setPanel(null); setMatchDay(false); setShowResult(false); setMatchPhase(null); setResumeLive(null);
        setTitleView('menu');
        setScreen('game');
        notify({ kind: 'success', eyebrow: t('Sauvegarde'), title: t('{clubName} : partie restaurée', { clubName: next.clubName }), text: t('Saison {seasonNumber}, {name}. L’ancienne partie est gardée en copie de secours.', { seasonNumber: next.seasonNumber, name: DIVISIONS[next.divisionIndex].name }) });
      };
      if (!cur) { apply(); return null; }
      setConfirm({
        tone: 'danger',
        title: t('Remplacer {clubName} par {clubName2} ?', { clubName: cur.clubName, clubName2: raw.clubName }),
        text: t('La partie actuelle (saison {seasonNumber}, {name}) sera mise en copie de secours, et {clubName} (saison {seasonNumber2}, {name2}) prendra sa place.', { seasonNumber: cur.seasonNumber, name: DIVISIONS[cur.divisionIndex].name, clubName: raw.clubName, seasonNumber2: raw.seasonNumber, name2: DIVISIONS[raw.divisionIndex].name }),
        confirmLabel: t('Restaurer cette partie'),
        cancelLabel: t('Garder ma partie'),
        onConfirm: apply,
      });
      return null;
    },
  };
  // Retour à l'écran titre (la partie reste sauvegardée) : la caméra repart en vitrine autour du complexe.
  const toTitle = () => {
    setMenu(false); setSel(null); setPanel(null); setMatchDay(false);
    if (state?.league) { // la carrière reprend sa place ; le club de ligue part d'abord en ligne (un choix éventuel attendra l'entrée suivante)
      cloudSave({ quiet: true });
      prevMoney.current = null; setState(loadGame()); setForeign(lastLoad.foreign); setLeagueLive(null);
    }
    setTitleView('menu');
    setScreen('title');
  };

  // --- Partie de championnat entre amis (leagueClub.js) -----------------------------------------------------------------
  // Entrer dans son club de ligue : la partie de l'appareil, ou sa copie en ligne (nouvel appareil, partie avancée sur un
  // autre : leagueCloud.js), ou une nouvelle (première visite, comme une nouvelle partie solo) ; relue avec la ligue. Tout le
  // jeu passe à ce club (complexe, HUD, écrans), la carrière reste sauvegardée à côté.
  // again : déjà rechargé dans la langue du championnat (une seconde fois serait une boucle)
  const enterLeague = async (m, again = false) => {
    try {
      const d = await refreshLeague(m);
      if (d.league.status !== 'running') { notify({ kind: 'info', eyebrow: d.league.name, title: t('La saison n’a pas commencé'), text: t('Le créateur lancera la saison depuis le Siège de la Ligue.') }); return; }
      // un championnat se joue dans sa langue, la même pour tous les amis : le jeu se recharge, puis ouvre le club
      if (leagueLang(d.league) !== gameLang()) {
        if (!again) { reloadInLang(leagueLang(d.league), { league: m.code }); return; }
        notify({ kind: 'warn', eyebrow: d.league.name, title: t('Club non repris'), text: t('Réessaie dans un moment.') });
        return;
      }
      const local = loadLeagueClub(m.code);
      const plan = cloudPlan(m.code, local, d.save);
      if (plan === 'blocked') {
        notify({ kind: 'warn', eyebrow: d.league.name, title: t('Navigateur trop ancien'), text: t('Ton club est sauvegardé en ligne, mais ce navigateur ne peut pas l’ouvrir : mets-le à jour ou joue sur ton autre appareil.') });
      } else if (plan === 'conflict') askCloudChoice(m, d, local, d.save, true);
      else if (plan === 'pull') await openPulled(m, d, local);
      else await openLeagueClub(m, d, local);
    } catch (x) {
      notify(x instanceof LeagueError
        ? { kind: 'warn', eyebrow: t('Championnat entre amis'), title: t('Serveur des ligues injoignable'), text: x.message }
        : { kind: 'warn', eyebrow: t('Championnat entre amis'), title: t('Club non repris'), text: t('Réessaie dans un moment.') });
    }
  };
  // Rechargé dans la langue d'un championnat pour y entrer : on y entre dès la fin de l'écran de chargement.
  useEffect(() => {
    if (!booted || !boot.intent?.league) return;
    const m = myLeagues().find((x) => x.code === boot.intent.league);
    if (m) enterLeague(m, true);
  }, [booted]); // eslint-disable-line react-hooks/exhaustive-deps
  // La partie choisie (celle de l'appareil, la copie en ligne, ou une nouvelle), relue avec la ligue, à l'écran. restored :
  // la fiche de la copie en ligne reprise (son empreinte est prise sur la partie relue : rien à renvoyer ensuite) ;
  // replaced : la partie de l'appareil qu'elle remplace, gardée à côté.
  const openLeagueClub = async (m, d, base, restored = null, replaced = null) => {
    const s = syncLeagueClub(base || createLeagueClub(d, m), d);
    if (restored) adoptPulled(m, restored, playedPrint(s), replaced);
    const prev = d.league.season > s.league.season ? (await leagueResults(m, s.league.season)).results : null;
    prevMoney.current = null;
    setState(s);
    setLeagueLive({ d, m, prev });
    setLeagueHub(null); setPanel(null); setSel(null); setMenu(false); setMatchDay(false); setShowResult(false); setMatchPhase(null); setReplay(null);
    setTitleView('menu');
    setScreen('game');
    if (restored) notify({ kind: 'success', eyebrow: d.league.name, title: t('Club repris'), text: t('Tu reprends ta partie sauvegardée en ligne {savedWhen} : {stageOf}.', { savedWhen: savedWhen(restored.at), stageOf: stageOf(restored.season, restored.round) }) });
  };
  // La copie en ligne devient la partie de l'appareil (l'ancienne est gardée à côté, au cas où). Illisible ici : retenue
  // comme telle (plus redemandée), la partie de l'appareil continue.
  const openPulled = async (m, d, local) => {
    let got;
    try {
      got = await pullClub(m);
    } catch (x) {
      if (x instanceof LeagueError) throw x; // réseau, serveur : réessayé plus tard
      got = { s: null, card: d.save }; // copie qui ne se décompresse pas
    }
    if (!got) { await openLeagueClub(m, d, local); return; } // la copie a disparu entre-temps : la partie de l'appareil (ou une nouvelle)
    const s = got.s && readLeagueClub(got.s, m.code);
    if (!s) {
      markUnreadable(m.code, got.card?.version);
      notify(local
        ? { kind: 'warn', eyebrow: d.league.name, title: t('Sauvegarde en ligne illisible'), text: t('Tu continues avec la partie de cet appareil.') }
        : { kind: 'warn', eyebrow: d.league.name, title: t('Club non repris'), text: t('Ta sauvegarde en ligne n’a pas pu être lue.') });
      if (local) await openLeagueClub(m, d, local);
      return;
    }
    await openLeagueClub(m, d, s, got.card, local);
  };
  // Les deux versions ont changé (club joué sur deux appareils) : le joueur choisit celle à garder, l'autre est remplacée.
  // entering : en entrant dans le club (la partie de l'appareil n'est pas encore à l'écran) ; sinon pendant la partie, où
  // la partie gardée est celle du moment. Fermée sans choisir : plus redemandé pour cette copie avant la prochaine entrée.
  const conflictSeen = useRef(null);
  // La plus avancée des deux est le choix conseillé (en or, prend le focus) ; à égalité, aucun bouton n'est mis en avant.
  const askCloudChoice = (m, d, local, card, entering = false) => {
    if (!entering && conflictSeen.current === card.version) return;
    const here = entering ? local : latest.current;
    const ahead = (card.season - here.seasonNumber) || (card.round - (here.round || 0)); // > 0 : la version en ligne est plus avancée
    const online = {
      label: t('Reprendre la version en ligne'),
      run: () => openPulled(m, d, entering ? local : latest.current).catch((x) => notify({ kind: 'warn', eyebrow: d.league.name, title: t('Club non repris'), text: x instanceof LeagueError ? x.message : t('Réessaie dans un moment.') })),
    };
    const device = {
      label: t('Garder la version de cet appareil'),
      run: () => {
        pushClub(m, entering ? local : latest.current, { force: true }).then(() => setCloudTick((n) => n + 1)).catch(() => { /* renvoyée à la prochaine occasion */ });
        if (entering) openLeagueClub(m, d, local).catch(() => {});
      },
    };
    const [main, alt] = ahead < 0 ? [device, online] : [online, device];
    const row = (label, season, round, when, best) => [best ? t('{label} · la plus avancée', { label }) : label, <>{cap(stageOf(season, round))}<small>{when}</small></>, best ? 'up' : ''];
    setConfirm({
      eyebrow: t('Deux appareils'),
      title: t('Quelle version de ton club garder ?'),
      text: t('Ton club a aussi été joué sur un autre appareil depuis ta dernière partie ici. La version que tu ne gardes pas sera remplacée.'),
      rows: [
        row(t('En ligne'), card.season, card.round, t('sauvegardée {savedWhen}', { savedWhen: savedWhen(card.at) }), ahead > 0),
        row(t('Sur cet appareil'), here.seasonNumber, here.round || 0, t('jouée ici {savedWhen}', { savedWhen: savedWhen(entering ? local.lastSeen : Date.now()) }), ahead < 0),
      ],
      confirmLabel: main.label,
      cancelLabel: alt.label,
      autoFocus: ahead !== 0,
      onConfirm: main.run,
      onAlt: alt.run,
      onDismiss: () => { conflictSeen.current = card.version; },
    });
  };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  // Sauvegarde en ligne du club de ligue (leagueCloud.js) : après chaque journée appliquée et chaque saison, toutes les
  // quinze minutes de jeu si la partie a changé, quand le joueur revient à l'écran titre ou quitte l'onglet. Lue dans des refs :
  // les minuteries gardent la partie et la ligue du moment.
  const latest = useRef(null);
  latest.current = state;
  const leagueRef = useRef(null);
  leagueRef.current = leagueLive;
  const uiBusy = useRef(false);
  uiBusy.current = !!(matchPhase || replay || showResult || confirm || state?.seasonReview);
  const [, setCloudTick] = useState(0); // la mention « sauvegardé il y a… » suit les envois
  const cloudSave = (opts = {}) => {
    const s = latest.current;
    const live = leagueRef.current;
    if (!s?.league || !live?.m || live.m.code !== s.league.code) return;
    pushClub(live.m, s, opts).then((r) => { if (r?.version) setCloudTick((n) => n + 1); }).catch((x) => {
      // un autre appareil a sauvegardé entre-temps : le joueur choisit, hors match et hors fenêtre ouverte (sinon plus tard)
      if (x?.status === 409 && x.data?.conflict && !uiBusy.current && !opts.keepalive && !opts.quiet) askCloudChoice(live.m, live.d, s, x.data.conflict);
    });
  };
  const stageKey = state?.league ? `${state.league.code}|${state.seasonNumber}|${state.round}|${state.seasonReview ? 1 : 0}` : null;
  useEffect(() => {
    if (!stageKey || !leagueLive?.m) return undefined;
    const t = setTimeout(() => cloudSave(), 1500);
    return () => clearTimeout(t);
  }, [stageKey, leagueLive?.m]); // eslint-disable-line react-hooks/exhaustive-deps
  // la ligue relue chaque minute (amis qui valident, journée jouée), dès que son pouls change, et au retour sur le jeu ; le club joué entre-temps sur
  // un autre appareil est repris (ou, s'il a changé ici aussi, le joueur choisit)
  const leagueCode = state?.league?.code || null;
  const leagueTick = useRef(null);
  const leagueLiveRef = useRef(null);
  leagueLiveRef.current = leagueLive;
  // coup d'envoi annoncé (tous ont validé, 0.8.6) : la ligue est relue à l'heure dite, la journée se joue et se regarde
  const leagueKickoff = kickoffAt(leagueLive?.d);
  // le compte à rebours démarre pendant que l'avant-match de la ligue est ouvert (le dernier ami vient de valider) : il se
  // ferme, les équipes sont verrouillées
  useEffect(() => {
    if (leagueKickoff && leagueKickoff > Date.now() && state?.league && matchPhase === 'prematch') { cancelMatch(); lockedNote(); }
  }, [leagueKickoff]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!leagueKickoff) return undefined;
    const t = setTimeout(() => leagueTick.current?.(), Math.max(0, leagueKickoff - Date.now()) + 1200);
    return () => clearTimeout(t);
  }, [leagueKickoff]);
  useEffect(() => {
    if (!leagueCode || !leagueLive?.m) return undefined;
    const m = leagueLive.m;
    const save = () => cloudSave();
    const away = () => { if (document.visibilityState === 'hidden') cloudSave({ keepalive: true }); };
    const t2 = setInterval(save, 15 * 60000);
    document.addEventListener('visibilitychange', away);
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const d = await refreshLeague(m);
        if ((d.save?.version || 0) > syncOf(m.code).base && !isPushing(m.code) && !uiBusy.current && latest.current?.league?.code === m.code) {
          const plan = cloudPlan(m.code, latest.current, d.save);
          if (plan === 'pull') { await openPulled(m, d, latest.current); return; }
          if (plan === 'conflict') { askCloudChoice(m, d, latest.current, d.save); return; }
        }
        let prev = null;
        const local = state?.league?.season;
        if (local && d.league.season > local) prev = (await leagueResults(m, local)).results;
        setLeagueLive({ d, m, prev });
        setState((s) => (s?.league?.code === m.code ? closeGoneDeals(syncLeagueClub(clone(s), d)) : s));
      } catch { /* hors ligne : on réessaiera */ }
    };
    leagueTick.current = tick;
    const t = setInterval(() => { if (userActive()) tick(); }, 60000);
    const stopPulse = watchPulse(m, tick, () => pulseUrgent(leagueLiveRef.current?.d)); // offres, réponses, amis qui valident : vus en quelques secondes (0.8.6)
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t); clearInterval(t2); stopPulse(); leagueTick.current = null;
      document.removeEventListener('visibilitychange', tick); document.removeEventListener('visibilitychange', away);
    };
  }, [leagueCode, leagueLive?.m]); // eslint-disable-line react-hooks/exhaustive-deps
  // Effectif publié (1.0.4, demande du PDG) : quand les joueurs du club de ligue changent (recrue, vente, départ, niveau,
  // blessure), le jeu l'envoie au serveur quelques secondes après ; l'onglet Amis des autres se met à jour, vente hors de
  // la ligue et joueur libéré compris. Hors ligne : renvoyé à la relecture suivante de la ligue.
  const rosterSent = useRef({}); // signature envoyée, en mémoire d'abord (stockage plein : jamais de renvoi en boucle)
  const rosterSig = state?.league ? leagueRosterSig(state) : null;
  useEffect(() => {
    const m = leagueLive?.m;
    const key = m ? `fo-ligue-rsig:${m.code}` : null;
    const sent = () => { if (rosterSent.current[m.code]) return rosterSent.current[m.code]; try { return localStorage.getItem(key); } catch { return null; } };
    if (!rosterSig || !m || leagueLive?.d?.league?.status !== 'running' || sent() === rosterSig) return undefined;
    const t = setTimeout(async () => {
      const s = latest.current;
      if (s?.league?.code !== m.code) return;
      const sig = leagueRosterSig(s);
      const mark = () => { rosterSent.current[m.code] = sig; try { localStorage.setItem(key, sig); } catch { /* gardée en mémoire */ } };
      try { await publishRoster(m, leagueRoster(s)); mark(); } catch (e) {
        if ([401, 409, 413].includes(e?.status)) mark(); // refus définitif : pas de relance en boucle (hors ligne : plus tard)
        else if (e?.status === 429) setTimeout(() => leagueTick.current?.(), 61000); // envoyé il y a moins d'une minute : à nouveau ensuite
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [rosterSig, leagueLive?.m, leagueLive?.d]); // eslint-disable-line react-hooks/exhaustive-deps
  // Offre refusée d'office parce que le joueur avait déjà quitté le club de l'ami (1.0.5, demande du PDG) : l'acheteur en
  // est prévenu une fois, avec la raison (offres vues : s.league.goneSeen)
  const goneOffers = (state?.league?.offersOut || []).filter((o) => o.status === 'no' && o.g && !(state.league.goneSeen || []).includes(o.id));
  useEffect(() => {
    if (!goneOffers.length || !state?.league) return;
    for (const o of goneOffers) {
      const pseudo = state.league.clubs.find((c) => c.slot === o.s)?.pseudo || t('ton ami');
      notify({ kind: 'warn', eyebrow: state.league.name, title: t('Offre refusée d’office'), text: t('{name} a déjà quitté le club de {pseudo} : ton offre ne peut pas aboutir.', { name: o.n, pseudo }), key: `gone-${o.id}` });
    }
    const ids = goneOffers.map((o) => o.id);
    run((s) => { if (s.league) s.league.goneSeen = [...(s.league.goneSeen || []), ...ids].slice(-60); return s; });
  }, [goneOffers.map((o) => o.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // File des demandes au serveur des ligues (leagueClub.js : signature d'une recrue négociée, offre pour le joueur d'un
  // ami, réponse à une offre reçue) : une à la fois, dans l'ordre, et la réponse s'applique à la partie. Serveur
  // injoignable : la demande attend la relecture suivante de la ligue (toutes les minutes).
  const outbox = state?.league?.outbox || [];
  const outboxKey = outbox.length ? `${outbox[0].k}:${outbox[0].at}` : null;
  const outboxBusy = useRef(false);
  useEffect(() => {
    if (!outboxKey || !leagueLive?.m || outboxBusy.current) return;
    const item = outbox[0];
    const { m } = leagueLive;
    outboxBusy.current = true;
    sendMove(m, leagueRequest(state, item)).then((res) => {
      outboxBusy.current = false;
      setState((s) => (s?.league?.code === m.code ? settleLeague(clone(s), item, res) : s));
      if (item.k === 'sign' && dealOnScreen.id !== item.id) { // la fenêtre de négociation ouverte le dit déjà
        notify(res?.id
          ? { kind: 'success', eyebrow: state.league.name, title: t('Accord conclu'), text: t('{n} rejoint ton effectif.', { n: item.n }), key: 'league-sign' }
          : { kind: 'warn', eyebrow: state.league.name, title: res?.taken ? t('Trop tard') : t('Signature non confirmée'), text: res?.taken ? t('Un autre club de la ligue a signé {n} juste avant toi.', { n: item.n }) : leagueNote(res?.error, 'sign'), key: 'league-sign' });
      }
      if (item.k === 'answer' && res?.status === 'done') {
        const fee = Number.isSafeInteger(res.fee) ? res.fee : item.fee;
        if (item.role === 'b') {
          const from = state.league.clubs.find((c) => c.slot === item.s)?.name;
          notify({ kind: 'success', eyebrow: state.league.name, title: t('Transfert conclu'), text: t('{v} arrive {v2} : {fee} versés.', { v: item.n || t('Le joueur'), v2: from ? clubAfter('de ', from) : t('du club de ton ami'), fee: fmtMoney(fee) }), key: 'league-sale' });
        } else {
          const who = state.players.find((p) => p.lid === item.lid)?.name || t('Le joueur');
          const to = state.league.clubs.find((c) => c.slot === item.b)?.name;
          notify({ kind: 'success', eyebrow: state.league.name, title: t('Transfert conclu'), text: t('{who} rejoint {v} : {fee} arrivent sur ton compte.', { who, v: to ? withArticle(to) : t('le club de ton ami'), fee: fmtMoney(fee) }), key: 'league-sale' });
        }
      }
      if (item.k !== 'sign' && res?.error) {
        notify({
          kind: 'warn', eyebrow: state.league.name, key: 'league-move',
          title: item.k === 'answer' ? t('Réponse non prise en compte') : item.k === 'withdraw' ? t('Retrait non pris en compte') : t('Offre non envoyée'),
          text: item.k === 'withdraw' ? t('Ton offre n’a pas pu être retirée : elle reste en attente. Réessaie dans un moment.') : leagueNote(res.error, item.k === 'answer' ? 'answer' : 'offer'),
        });
      }
    }, () => { outboxBusy.current = false; });
  }, [outboxKey, leagueLive]); // eslint-disable-line react-hooks/exhaustive-deps
  // La journée à appliquer : celle de notre prochaine journée, une fois jouée par la ligue (saison d'avant comprise).
  const leaguePending = (() => {
    if (!state?.league || !leagueLive) return null;
    const { d, prev } = leagueLive;
    const list = d.league.season === state.league.season ? d.results : state.league.season < d.league.season ? prev || [] : [];
    return list.find((r) => r.round === state.round) || null;
  })();
  // « Valider mon équipe » : l'équipe et l'effectif partent au serveur (teamSheet), pour la journée ouverte.
  const sendLeagueTeam = async (lineup, tactic, formation, plans = state.league.plans) => {
    const { d, m } = leagueLive;
    const key = `${d.league.season}:${d.league.round}`;
    if (leagueLocked()) { lockedNote(); cancelMatch(); return; } // le dernier ami a validé pendant que l'avant-match était ouvert
    try {
      if (d.league.season !== state.league.season || d.league.round !== state.round) throw new Error('La journée a changé : regarde d’abord le match de la journée précédente.');
      await sendSheet(m, d.league.season, d.league.round, teamSheet(clone(state), { lineup, tactic, formation, plans }));
      run((s) => { s.lineup = lineup; s.tactic = tactic; s.formation = formation; s.league.plans = plans || {}; s.league.sent = key; return s; });
      notify({ kind: 'success', eyebrow: state.league.name, title: t('Équipe validée'), text: t('Journée {v} : coup d’envoi dix minutes après la validation de la dernière équipe, au plus tard {deadlineText}.', { v: d.league.round + 1, deadlineText: deadlineText(d.league.deadline) }), key: 'league-sent' });
    } catch (x) {
      notify({ kind: 'warn', eyebrow: state.league.name, title: t('Équipe non envoyée'), text: x.message });
    }
    cancelMatch();
  };
  // « Regarder le match » : notre match de la journée, revu comme un direct (temps forts en 3D), puis l'après-match
  const watchLeague = (skip = false) => {
    const result = leaguePending;
    if (!result) return;
    const rp = skip ? null : myReplay(state, result);
    setPanel(null); setSel(null);
    if (!rp) { // sans rejeu possible (autre version du moteur) ou résumé demandé : l'après-match directement
      run((s) => applyLeagueRound(s, result));
      setMatchDay(true);
      setShowResult(true);
      return;
    }
    setMatchDay(true);
    setReplay({ ...rp, result });
  };
  // Nouvelle partie (0.8.23, demande du PDG) : d'abord la langue de la partie, choisie une seule fois (écran titre, vue
  // « lang » ; elle n'est plus au menu), puis le club se fonde dans cette langue (src/i18n) ; le jeu se recharge si ce
  // n'est pas celle de la session. La carrière en cours, dans cette langue ou une autre, est d'abord effacée (confirmé).
  const askNewGame = () => {
    setMenu(false);
    setScreen('title');
    setTitleView('lang');
  };
  const startNewGame = (l) => {
    const cur = state || foreign;
    const fresh = () => { // la langue devient la préférence une fois la partie lancée (pas si l'effacement est annulé)
      setPreferredLang(l);
      if (l !== gameLang()) { reloadInLang(l, { go: 'create' }); return; }
      setTitleView('create');
    };
    if (!cur) { fresh(); return; }
    setConfirm({
      tone: 'danger',
      title: t('Recommencer une nouvelle aventure ?'),
      text: t('La sauvegarde de {clubName} (saison {seasonNumber}, {name}) sera effacée définitivement.', { clubName: cur.clubName, seasonNumber: cur.seasonNumber, name: DIVISIONS[cur.divisionIndex].name }),
      confirmLabel: t('Effacer et recommencer'),
      cancelLabel: t('Garder ma partie'),
      onConfirm: () => {
        clearGame({ withBackup: true });
        setState(null); setForeign(null);
        setMenu(false); setSel(null); setPanel(null); setMatchDay(false); setShowResult(false); setMatchPhase(null); setResumeLive(null);
        setScreen('title');
        fresh();
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
      if (a.panel === 'squad') { setSquadTab(a.tab || 'players'); setSquadSheet(a.sheet ?? null); }
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
    else if (tutoStep === 'stadium') { setTuto('done'); notify({ kind: 'success', title: t('À toi de jouer, président !') }); }
    else doAction(tuto.action);
  };
  const tip = state && !tuto && !sel && !panel ? staffTip(state) : null;
  const shownTip = tip; // les conseils écartés sont gardés dans la partie (advice.js, dismissTip)
  const signals = state ? dockSignals(state) : {};
  const navPage = navDir && navDir.panel === panel ? navDir.dir : null; // sens du passage à la section voisine
  // navigation par sections (nav.jsx) : l'en-tête de chaque panneau y lit l'onglet actif et ses pastilles
  const nav = {
    panel, squadTab, seasonTab, mercatoView, go: goNav, step: stepSection, badges: signals.items || {}, switching: (navSwitch || !!navPage) && !!panel, league: !!state?.league,
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
  const sceneState = state || (demo.current ||= createInitialState(t('FootOFF FC')));

  // la fiche (et ce qu'elle ouvre : carrière, comparaison, mise en vente) posée sur le panneau en cours ; elle se retire
  // d'elle-même une fois tout refermé (SquadView mode « sheet »)
  // calque au-dessus des fenêtres du panneau (la fiche carrière des Stats, qui l'a ouverte, passe dessous)
  // peek : l'identifiant du joueur (sa fiche), ou { id, renew } pour la prolongation ouverte depuis la Direction
  const peekSheet = <Presence>{peek !== null && <div className="peek-layer"><SquadView key={peek?.id ?? peek} mode="sheet" state={state} run={run} ask={setConfirm} initialSheet={peek?.renew ? null : peek} initialDeal={peek?.renew ? peek.id : null} onMercato={openMercato} onClose={() => setPeek(null)} /></div>}</Presence>;

  return (
    <NavContext.Provider value={nav}>
    <div className={`game ${inGame ? 'playing' : 'titled'} ${menu ? 'paused' : ''} ${cinematic ? 'cinematic' : ''} ${panel ? 'has-panel' : ''} ${['squad', 'mercato', 'academy', 'training', 'season', 'stats', 'trophies'].includes(panel) ? 'wide-panel' : ''} ${sel ? 'has-sel' : ''} ${navSwitch && panel ? 'nav-switch' : ''} ${replay ? 'replaying' : ''}`} data-tuto={inGame && tuto ? tutoStep : undefined} data-nav={navPage || undefined}>
      <div className="stage">
        {preview ? (
          <div className="stage-preview" aria-hidden="true" />
        ) : webglOk ? (
          <Suspense fallback={null}>
            <Empire3D
              state={sceneState}
              timeMode={timeMode}
              matchDay={matchDay || !!replay}
              live={matchPhase === 'live' || !!replay}
              matchFx={matchFx}
              matchInfo={replay ? { opp: replay.ctx.opp.name, oppCrest: replay.ctx.opp.crest, home: replay.state.clubName, homeCrest: replay.state.crest, side: replay.side || 'home' } : matchInfo}
              recenter={recenter}
              selectedPlot={inGame ? sel?.plotId || null : null}
              holo={holo}
              badges={plotBadges}
              session={session}
              onSession={() => openPanel('training')}
              attract={!inGame && !replay}
              paused={menu || !!drills}
              hidden={!!drills}
              onLag={onLag}
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
              onSkip={() => { setTuto('done'); notify({ kind: 'info', title: t('Tutoriel passé'), text: t('Le staff continuera de te conseiller.') }); }}
            />
          ) : (
            <ObjectiveWidget state={state} collapsed={goalCollapsed} onToggle={() => setGoalCollapsed((c) => !c)} />
          )}
          <Presence>
            {shownTip && !webglOk && ( // sans 3D, pas de colonne d'outils : le conseil garde sa carte
              <StaffTip
                tip={shownTip}
                onAction={() => doAction(shownTip.action)}
                onDismiss={() => run((s) => dismissTip(s, shownTip.id))}
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
              onTipDismiss={() => run((s) => dismissTip(s, shownTip.id))}
            />
          )}
          <MatchCta state={state} onPlay={play} onEndSeason={() => run(endSeason)} keys={hudKeys && !panel && !sel}
            league={state.league ? { pending: !!leaguePending, sent: state.league.sent === `${leagueLive?.d.league.season}:${leagueLive?.d.league.round}`, deadline: leagueLive?.d.league.deadline, deadlineAt: deadlineAt(leagueLive?.d), humans: leagueHumans(leagueLive?.d), kickoff: leagueKickoff, onWatch: watchLeague, seasonOver: (leagueLive?.d.league.season || 0) > state.league.season } : null} />
          <Dock panel={panel} onPanel={openPanel} badges={signals} keys={hudKeys} />
          <PadHints build={!!buildTool} context={panel ? 'panel' : sel ? 'sheet' : 'home'} />
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
            onRenew={(id) => setPeek({ id, renew: true })}
            sheetOpen={peek !== null}
            onClose={() => setPanel(null)}
            onBuilding={() => { const plot = plotOf(state, 'direction'); if (plot) selectPlot(plot.id, plot.sector); }}
          />
        )}
      </Presence>
      {/* prolongation ouverte depuis la Direction : posée sur tout l'écran (le panneau est trop étroit pour la grande fenêtre) */}
      {inGame && panel === 'direction' && peekSheet}
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
      <Presence>
        {((inGame && panel === 'league') || (screen === 'title' && booted && leagueHub)) && (
          <LeagueView
            state={state}
            ask={setConfirm}
            invite={screen === 'title' ? leagueHub?.invite : null}
            openCode={screen === 'title' ? leagueHub?.open : null}
            overTitle={screen === 'title'}
            replaying={!!replay}
            onReplay={setReplay}
            onPlayClub={enterLeague}
            onClose={() => { if (screen === 'title') setLeagueHub(null); else setPanel(null); }}
          />
        )}
      </Presence>
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
            onLeague={leagueOpen() ? () => openPanel('league') : null}
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
      {replay && (
        <div className="lig-match">
          <LiveMatch
            state={replay.state}
            ctx={replay.ctx}
            replay={replay.live}
            side={replay.side || 'home'}
            sound={sound.current}
            onFx={(fx) => { if (fx.type === 'goal') haptic('goal'); setMatchFx({ ...fx, id: performance.now() }); }}
            onFinish={() => {
              if (replay.result) { const { result, live } = replay; run((s) => applyLeagueRound(s, result, live)); setShowResult(true); }
              setReplay(null);
              setMatchFx(null);
            }}
          />
        </div>
      )}
      <Presence>{inGame && showResult && <PostMatch state={state} initialStep={boot.ui.postStep} onClose={closeResult} onStats={() => { closeResult(); setStatsMatch('last'); setPanel('stats'); }} />}</Presence>
      <Presence>{inGame && !matchPhase && !showResult && state.seasonReview && <SeasonReview state={state} onClose={() => run(dismissReview)} />}</Presence>
      <Presence>{inGame && !matchPhase && !showResult && !state.seasonReview && state.offline && <OfflineReturn data={state.offline} onClose={() => run(dismissOffline)} />}</Presence>

      <Presence ms={450}>
        {screen === 'title' && booted && (
          <TitleScreen
            state={state}
            foreign={state ? null : foreign}
            view={titleView}
            onView={setTitleView}
            settings={settings}
            blocked={!!confirm || !!leagueHub}
            onContinue={() => { setLeagueHub(null); if (!state && foreign) reloadInLang(foreign.lang, { go: 'continue' }); else setScreen('game'); }}
            liveNote={resumeLive && matchPhase === 'live' ? liveNoteOf(resumeLive) : null}
            onNewGame={askNewGame}
            onPickLang={startNewGame}
            leagues={leagueOpen() ? { count: myLeagues().length, clubs: myLeagues().map((m) => ({ ...m, progress: leagueClubProgress(m.code) })), onOpen: () => setLeagueHub({}), onPlay: enterLeague } : null}
            onCreate={(name, crest) => { setLeagueHub(null); setForeign(null); setState(createInitialState(name, crest)); setTitleView('menu'); setScreen('game'); }}
          />
        )}
      </Presence>
      <Presence>{inGame && menu && (
        <PauseMenu
          state={state}
          settings={settings}
          inMatch={!!matchPhase}
          blocked={!!confirm}
          focus={menuFocus}
          onResume={() => setMenu(false)}
          onTitle={toTitle}
          onNewGame={state.league ? null : askNewGame}
          saveNote={state.league ? cloudNote(state.league.code) : null}
        />
      )}</Presence>
      <Presence>
        {confirm && (
          <ConfirmDialog
            {...confirm}
            onCancel={() => { setConfirm(null); confirm.onDismiss?.(); }}
            onConfirm={() => { setConfirm(null); confirm.onConfirm(); }}
            onAlt={confirm.onAlt ? () => { setConfirm(null); confirm.onAlt(); } : null}
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
