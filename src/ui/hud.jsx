import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGlass } from './glass';
import { DIVISIONS } from '../game/constants';
import { repLevel } from '../game/reputation';
import { activeGoal, tierOf } from '../game/goals';
import { teamLevel } from '../game/match';
import { matchContext } from '../game/season';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { fmtRating } from './format';
import {
  IconCal, IconCheck, IconCoin, IconEmpire, IconMenu, IconMoon, IconNews, IconPlay, IconStadium, IconStar, IconSun,
  IconTarget, IconTrophy, IconUsers, IconClock, IconEye, IconStats, IconCrane,
} from './icons';
import { clubStars } from '../game/crest';

// HUD du jeu : couches fixes au-dessus de la vue 3D plein écran.

export function TopHud({ state, onMenu, onFinances, onReputation }) {
  const div = DIVISIONS[state.divisionIndex];
  const rl = repLevel(state.reputation); // statut de notoriété et avancée vers le suivant (reputation.js)
  // Nom du club trop long pour une ligne (barre du téléphone) : classe « long », il passe sur deux lignes un peu
  // plus petites au lieu d'être coupé. Remesuré quand la barre change de largeur et quand la police arrive.
  const nameRef = useRef(null);
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return undefined;
    const check = () => {
      el.classList.remove('long');
      el.classList.toggle('long', el.scrollWidth > el.clientWidth + 1);
    };
    check();
    document.fonts?.ready.then(() => { if (nameRef.current === el) check(); });
    const ro = new ResizeObserver(check);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [state.clubName]);
  return (
    <header className="hud-top">
      <div className="hud-club glass">
        <ClubCrest crest={state.crest} name={state.clubName} className="hud-mark" stars={clubStars(state)} />
        <div className="hud-club-text">
          <span className="hud-club-name" ref={nameRef}>{state.clubName}</span>
          <span className="hud-club-meta">{div.name}<span className="meta-season"> · Saison {state.seasonNumber}</span></span>
        </div>
      </div>
      <div className="hud-res">
        <button className={`hud-chip glass hud-money ${state.money < 0 ? 'neg' : ''}`} onClick={onFinances} title="Trésorerie : voir les finances" aria-label="Trésorerie : voir les finances" data-money-target>
          <IconCoin />
          <span className="hud-val"><AnimatedMoney value={state.money} /></span>
        </button>
        <button className="hud-chip glass hud-rep" onClick={onReputation} aria-label={`Notoriété : ${rl.level.name}, réputation ${Math.round(state.reputation)}`}
          title={`${rl.level.name}${rl.next ? ` · prochain statut : ${rl.next.name} à ${rl.next.min} de réputation` : ''} · voir ce qu’elle apporte`}>
          <IconStar />
          <span className="hud-val">{Math.round(state.reputation)}</span>
          <span className="hud-rep-bar"><i style={{ width: `${rl.progress * 100}%` }} /></span>
          {rl.next && <span className="hud-rep-next">{rl.next.min}</span>}
        </button>
        <button className="hud-icon glass" onClick={onMenu} aria-label="Menu"><IconMenu /></button>
      </div>
    </header>
  );
}

export function ObjectiveWidget({ state, collapsed, onToggle }) {
  if (!state.goals) return null;
  const g = activeGoal(state);
  const tier = tierOf(state.reputation);
  const done = state.goals.completed.filter(Boolean).length;
  // atteint en cours de saison (stade comblé, académie au niveau 3) : la prime n'arrive qu'au bilan, on le dit
  const achieved = !state.goals.completed[g.tier] && g.active.done(state);
  return (
    <aside className={`hud-goal glass ${collapsed ? 'collapsed' : ''} ${achieved ? 'achieved' : ''}`}>
      <button className="hud-goal-head" onClick={onToggle} aria-expanded={!collapsed}>
        <IconTrophy />
        <span className="eyebrow">Objectif de saison</span>
        <span className="hud-goal-tier">{done}/{tier + 1}</span>
      </button>
      {!collapsed && (
        <div className="hud-goal-body">
          <strong>{g.active.name}</strong>
          <p>{typeof g.active.desc === 'function' ? g.active.desc(state) : g.active.desc}</p>
          <span className="hud-goal-reward">{achieved ? <><IconCheck /> Atteint · {g.goal.reward.label} au bilan de la saison</> : g.goal.reward.label}</span>
        </div>
      )}
    </aside>
  );
}

// Le stade n'a plus de bouton : on l'ouvre en le touchant dans la vue 3D.
const DOCK = [
  { id: null, label: 'Empire', Icon: IconEmpire },
  { id: 'squad', label: 'Effectif', Icon: IconUsers },
  { id: 'stats', label: 'Stats', Icon: IconStats },
  { id: 'season', label: 'Saison', Icon: IconCal },
  { id: 'journal', label: 'Journal', Icon: IconNews },
];

// Pastille du dock : point doré (action utile), « ! » rouge (alerte) ou nombre.
function DockBadge({ value }) {
  if (!value) return null;
  if (value === 'dot') return <i className="dock-badge dot" aria-label="Action disponible" />;
  if (value === 'warn') return <i className="dock-badge warn" aria-label="Alerte">!</i>;
  return <i className="dock-badge" aria-label={`${value} à traiter`}>{value}</i>;
}

// Raccourci clavier du HUD (PC) : touche physique (code), sans modificateur, jamais pendant une saisie ; actif
// seulement quand le HUD est utilisable (pas de menu, d'écran de match ni de confirmation).
export function useHudKey(codes, onKey, enabled) {
  const fn = useRef(onKey);
  fn.current = onKey;
  useEffect(() => {
    if (!enabled) return undefined;
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = codes.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      fn.current(i);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
const DOCK_KEYS = [1, 2, 3, 4, 5];
const DOCK_CODES = [...DOCK_KEYS.map((n) => `Digit${n}`), ...DOCK_KEYS.map((n) => `Numpad${n}`)];

// Menu du bas : la sélection est une pastille en verre liquide (façon iOS) qui glisse d'un bouton à l'autre en
// s'étirant ; on peut aussi la faire glisser au doigt le long du menu, la section s'ouvre au relâché. Sur PC, les
// touches 1 à 5 ouvrent les sections (rappelées au survol).
export function Dock({ panel, onPanel, badges = {}, keys = false }) {
  const active = DOCK.some((d) => d.id === panel) ? panel : null; // panneau hors menu : l'Empire reste sélectionné
  const keyOf = (id) => id || 'empire';
  const { ref, glass, handlers, hoverKey } = useGlass(keyOf(active), (k) => {
    const d = DOCK.find((x) => keyOf(x.id) === k);
    if (d) onPanel(d.id);
  });
  useHudKey(DOCK_CODES, (i) => {
    const { id } = DOCK[i % DOCK.length];
    onPanel(active === id ? null : id);
  }, keys);
  return (
    <nav ref={ref} className="hud-dock glass" aria-label="Navigation" {...handlers}>
      {glass}
      {DOCK.map(({ id, label, Icon }, i) => {
        const lit = hoverKey === null ? active === id : hoverKey === keyOf(id);
        return (
          <button
            key={label}
            className={lit ? 'active' : ''}
            data-id={keyOf(id)}
            data-key={keyOf(id)}
            onClick={() => onPanel(active === id ? null : id)}
            aria-current={active === id ? 'page' : undefined}
            aria-keyshortcuts={String(DOCK_KEYS[i])}
          >
            <Icon />
            <span>{label}</span>
            <kbd className="dock-key" aria-hidden="true">{DOCK_KEYS[i]}</kbd>
            <DockBadge value={badges[keyOf(id)]} />
          </button>
        );
      })}
    </nav>
  );
}

export function MatchCta({ state, onPlay, onEndSeason, keys = false }) {
  const ctx = matchContext(state);
  const done = !ctx;
  useHudKey(['KeyJ'], () => (done ? onEndSeason() : onPlay()), keys); // J : jouer (ou bilan de fin de saison)
  // carte compacte : même hauteur et même ligne de base que le dock
  if (done) {
    return (
      <div className="hud-match glass">
        <div className="hm-info">
          <span className="eyebrow">Saison {state.seasonNumber} terminée</span>
          <strong className="hud-match-title">Place au bilan</strong>
        </div>
        <button className="btn" onClick={onEndSeason} aria-keyshortcuts="J"><IconTrophy /> Bilan<kbd className="hm-key" aria-hidden="true">J</kbd></button>
      </div>
    );
  }
  const opp = ctx.opp;
  const me = teamLevel(state);
  return (
    <div className="hud-match glass">
      <Crest name={opp.name} className="hm-crest" />
      <div className="hm-info">
        <span className="hm-line">
          <span className={`eyebrow hm-comp-${ctx.comp}`} title={ctx.label}>{ctx.short || ctx.label}</span>
          <span className="hm-lvl" title="Niveau de ton onze · niveau de l’adversaire"><b>{fmtRating(me)}</b> · {fmtRating(opp.strength)}</span>
        </span>
        <strong className="hud-match-title" title={`${opp.name} (à domicile)`}>{opp.name}</strong>
      </div>
      <button className="btn" onClick={onPlay} title="Jouer le match (J)" aria-label="Jouer le match" aria-keyshortcuts="J"><IconPlay /> Jouer<kbd className="hm-key" aria-hidden="true">J</kbd></button>
    </div>
  );
}

const TIME_UI = {
  auto: { Icon: IconClock, title: 'Heure réelle (cycle jour / nuit)' },
  day: { Icon: IconSun, title: 'Toujours en journée' },
  night: { Icon: IconMoon, title: 'Toujours la nuit' },
};

// Outils de la vue, et en tête le bouton Construire (vitrine des bâtiments, touche B) : build vaut null (rien à
// construire), 'idle', 'dot' (un bâtiment est payable tout de suite : pastille dorée) ou 'open' (vitrine ouverte).
export function SceneTools({ timeMode, matchDay, onTime, onMatchDay, onRecenter, build = null, onBuild, keys = false }) {
  const T = TIME_UI[timeMode] || TIME_UI.auto;
  const [open, setOpen] = useState(false); // mobile : outils repliés derrière un seul bouton
  useHudKey(['KeyB'], () => onBuild?.(), keys && !!build);
  return (
    <div className={`hud-tools glass ${open ? 'open' : ''}`} role="toolbar" aria-label="Construction et vue">
      <button className={`tools-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Réglages de la vue"><IconEye /></button>
      {build && (
        <button className={`tools-build ${build === 'open' ? 'on' : ''}`} onClick={onBuild} aria-pressed={build === 'open'} aria-keyshortcuts="B" title="Construire · touche B">
          <IconCrane />
          {build === 'dot' && <i className="tools-dot" aria-hidden="true" />}
        </button>
      )}
      <button className={timeMode !== 'auto' ? 'on' : ''} onClick={onTime} disabled={matchDay} title={`${T.title} — cliquer pour changer`}>
        <T.Icon />
      </button>
      <button className={matchDay ? 'on' : ''} onClick={onMatchDay} title="Jour de match : stade plein, projecteurs">
        <IconStadium />
      </button>
      <button onClick={onRecenter} title="Recentrer la vue"><IconTarget /></button>
    </div>
  );
}
