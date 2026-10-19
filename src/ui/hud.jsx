import React from 'react';
import { DIVISIONS } from '../game/constants';
import { SECTORS, nextLockedSector } from '../game/map';
import { activeGoal, tierOf } from '../game/goals';
import { teamLevel } from '../game/match';
import { nextOpponent } from '../game/season';
import { FOMonogram } from './brand';
import { AnimatedMoney } from './moneyfx';
import { fmtRating } from './format';
import {
  IconCal, IconCoin, IconEmpire, IconMenu, IconMoon, IconNews, IconPlay, IconStadium, IconStar, IconSun,
  IconTarget, IconTrophy, IconUsers, IconClock, IconCloud, IconRain, IconSnow,
} from './icons';

// HUD du jeu : couches fixes au-dessus de la vue 3D plein écran.

export function TopHud({ state, onMenu }) {
  const div = DIVISIONS[state.divisionIndex];
  const next = nextLockedSector(state);
  const prevNeed = next ? Math.max(0, ...SECTORS.filter((s) => s.repNeeded <= state.reputation).map((s) => s.repNeeded)) : 0;
  const repPct = next ? Math.min(1, (state.reputation - prevNeed) / (next.repNeeded - prevNeed)) : 1;
  return (
    <header className="hud-top">
      <div className="hud-club glass">
        <FOMonogram className="hud-mark" />
        <div className="hud-club-text">
          <span className="hud-club-name">{state.clubName}</span>
          <span className="hud-club-meta">{div.name} · Saison {state.seasonNumber}</span>
        </div>
        <div className="hud-rounds" aria-label={`Journée ${Math.min(state.round + 1, 7)} sur 7`}>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={i < state.round ? 'done' : i === state.round ? 'next' : ''} />
          ))}
        </div>
      </div>
      <div className="hud-res">
        <div className={`hud-chip glass ${state.money < 0 ? 'neg' : ''}`} title="Trésorerie" data-money-target>
          <IconCoin />
          <span className="hud-val"><AnimatedMoney value={state.money} /></span>
        </div>
        <div className="hud-chip glass hud-rep" title={next ? `Prochaine ouverture : ${next.name} à ${next.repNeeded} de réputation` : 'Tous les secteurs sont ouverts'}>
          <IconStar />
          <span className="hud-val">{Math.round(state.reputation)}</span>
          <span className="hud-rep-bar"><i style={{ width: `${repPct * 100}%` }} /></span>
          {next && <span className="hud-rep-next">{next.repNeeded}</span>}
        </div>
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
  return (
    <aside className={`hud-goal glass ${collapsed ? 'collapsed' : ''}`}>
      <button className="hud-goal-head" onClick={onToggle} aria-expanded={!collapsed}>
        <IconTrophy />
        <span className="eyebrow">Objectif de saison</span>
        <span className="hud-goal-tier">{done}/{tier + 1}</span>
      </button>
      {!collapsed && (
        <div className="hud-goal-body">
          <strong>{g.active.name}</strong>
          <p>{typeof g.active.desc === 'function' ? g.active.desc(state) : g.active.desc}</p>
          <span className="hud-goal-reward">{g.goal.reward.label}</span>
        </div>
      )}
    </aside>
  );
}

const DOCK = [
  { id: null, label: 'Empire', Icon: IconEmpire },
  { id: 'stadium', label: 'Stade', Icon: IconStadium },
  { id: 'squad', label: 'Effectif', Icon: IconUsers },
  { id: 'season', label: 'Saison', Icon: IconCal },
  { id: 'journal', label: 'Journal', Icon: IconNews },
];

// Pastille du dock : point doré (action utile), « ! » rouge (alerte) ou nombre.
function DockBadge({ value }) {
  if (!value) return null;
  if (value === 'dot') return <i className="dock-badge dot" aria-label="Action disponible" />;
  if (value === 'warn') return <i className="dock-badge warn" aria-label="Alerte">!</i>;
  return <i className="dock-badge">{value}</i>;
}

export function Dock({ panel, onPanel, badges = {} }) {
  return (
    <nav className="hud-dock glass" aria-label="Navigation">
      {DOCK.map(({ id, label, Icon }) => (
        <button
          key={label}
          className={panel === id ? 'active' : ''}
          data-id={id || 'empire'}
          onClick={() => onPanel(panel === id ? null : id)}
          aria-current={panel === id ? 'page' : undefined}
        >
          <Icon />
          <span>{label}</span>
          <DockBadge value={badges[id || 'empire']} />
        </button>
      ))}
    </nav>
  );
}

export function MatchCta({ state, onPlay, onEndSeason }) {
  const done = state.round >= 7;
  if (done) {
    return (
      <div className="hud-match glass">
        <span className="eyebrow">Saison {state.seasonNumber} terminée</span>
        <strong className="hud-match-title">Place au bilan</strong>
        <button className="btn btn-xl" onClick={onEndSeason}><IconTrophy /> Bilan de saison</button>
      </div>
    );
  }
  const opp = nextOpponent(state);
  const me = teamLevel(state);
  const edge = Math.max(-1, Math.min(1, (me - opp.strength) / 4));
  return (
    <div className="hud-match glass">
      <span className="eyebrow">Journée {state.round + 1} / 7 · à domicile</span>
      <strong className="hud-match-title">{opp.name}</strong>
      <div className="hud-versus">
        <span className="hud-versus-me">{fmtRating(me)}</span>
        <span className="hud-versus-bar"><i style={{ left: `${50 + edge * 50}%` }} /></span>
        <span className="hud-versus-opp">{fmtRating(opp.strength)}</span>
      </div>
      <button className="btn btn-xl" onClick={onPlay}><IconPlay /> Jouer le match</button>
    </div>
  );
}

const TIME_UI = {
  auto: { Icon: IconClock, title: 'Heure réelle (cycle jour / nuit)' },
  day: { Icon: IconSun, title: 'Toujours en journée' },
  night: { Icon: IconMoon, title: 'Toujours la nuit' },
};
const WEATHER_UI = {
  auto: { Icon: IconCloud, title: 'Météo automatique (selon la saison)' },
  clear: { Icon: IconSun, title: 'Temps clair' },
  rain: { Icon: IconRain, title: 'Pluie' },
  snow: { Icon: IconSnow, title: 'Neige' },
};

export function SceneTools({ timeMode, weatherMode, matchDay, onTime, onWeather, onMatchDay, onRecenter }) {
  const T = TIME_UI[timeMode] || TIME_UI.auto;
  const W = WEATHER_UI[weatherMode] || WEATHER_UI.auto;
  return (
    <div className="hud-tools glass" role="toolbar" aria-label="Vue">
      <button className={timeMode !== 'auto' ? 'on' : ''} onClick={onTime} disabled={matchDay} title={`${T.title} — cliquer pour changer`}>
        <T.Icon />
      </button>
      <button className={weatherMode !== 'auto' ? 'on' : ''} onClick={onWeather} title={`${W.title} — cliquer pour changer`}>
        <W.Icon />
      </button>
      <button className={matchDay ? 'on' : ''} onClick={onMatchDay} title="Jour de match : stade plein, projecteurs">
        <IconStadium />
      </button>
      <button onClick={onRecenter} title="Recentrer la vue"><IconTarget /></button>
    </div>
  );
}

export function Toasts({ items }) {
  return (
    <div className="hud-toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`hud-toast glass ${t.tone || ''}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function GameMenu({ onClose, onReset }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="menu-card glass" onClick={(e) => e.stopPropagation()}>
        <span className="eyebrow">Menu</span>
        <button className="menu-item" onClick={onClose}>Reprendre</button>
        <a className="menu-item" href="https://footoff.media" target="_blank" rel="noreferrer">FootOFF Media ↗</a>
        <button className="menu-item danger" onClick={onReset}>Nouvelle partie</button>
        <span className="menu-foot">FootOFF Empire · prototype</span>
      </div>
    </div>
  );
}
