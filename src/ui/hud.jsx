import React, { useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { SECTORS, nextLockedSector } from '../game/map';
import { activeGoal, tierOf } from '../game/goals';
import { teamLevel } from '../game/match';
import { nextOpponent } from '../game/season';
import { FOMonogram } from './brand';
import { AnimatedMoney } from './moneyfx';
import { fmtRating } from './format';
import { useDialogFocus, useKeydown } from './presence';
import {
  IconCal, IconCoin, IconEmpire, IconMenu, IconMoon, IconNews, IconPlay, IconStadium, IconStar, IconSun,
  IconTarget, IconTrophy, IconUsers, IconClock, IconCloud, IconRain, IconSnow, IconEye, IconClose,
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
          <span className="hud-club-meta">{div.name}<span className="meta-season"> · Saison {state.seasonNumber}</span></span>
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
  // carte compacte : même hauteur et même ligne de base que le dock
  if (done) {
    return (
      <div className="hud-match glass">
        <div className="hm-info">
          <span className="eyebrow">Saison {state.seasonNumber} terminée</span>
          <strong className="hud-match-title">Place au bilan</strong>
        </div>
        <button className="btn" onClick={onEndSeason}><IconTrophy /> Bilan</button>
      </div>
    );
  }
  const opp = nextOpponent(state);
  const me = teamLevel(state);
  return (
    <div className="hud-match glass">
      <div className="hm-info">
        <span className="hm-line">
          <span className="eyebrow">Journée {state.round + 1} / 7</span>
          <span className="hm-lvl" title="Niveau de ton onze · niveau de l’adversaire"><b>{fmtRating(me)}</b> · {fmtRating(opp.strength)}</span>
        </span>
        <strong className="hud-match-title" title={`${opp.name} (à domicile)`}>{opp.name}</strong>
      </div>
      <button className="btn" onClick={onPlay} title="Jouer le match" aria-label="Jouer le match"><IconPlay /> Jouer</button>
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
  const [open, setOpen] = useState(false); // mobile : outils repliés derrière un seul bouton
  return (
    <div className={`hud-tools glass ${open ? 'open' : ''}`} role="toolbar" aria-label="Vue">
      <button className={`tools-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Réglages de la vue"><IconEye /></button>
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

export function GameMenu({ onClose, onReset, muted, onToggleSound, quality, onQuality, qualities }) {
  const ref = useRef(null);
  useDialogFocus(ref);
  useKeydown((e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }, { capture: true }); // pas le panneau dessous
  return (
    <div className="scrim" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="menu-card glass" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <header className="menu-head">
          <FOMonogram className="menu-mark" />
          <div className="panel-title">
            <span className="eyebrow">FootOFF Empire</span>
            <h2>Menu</h2>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>

        <section className="menu-section">
          <span className="eyebrow muted-eyebrow">Réglages</span>
          <div className="setting">
            <div className="setting-text"><strong>Son</strong><span>Ambiance du stade, sifflet, pièces.</span></div>
            <button className={`switch ${muted ? '' : 'on'}`} role="switch" aria-checked={!muted} onClick={onToggleSound}><i /></button>
          </div>
          <div className="setting column">
            <div className="setting-text"><strong>Qualité graphique</strong><span>{qualities.find((q) => q.id === quality)?.hint}</span></div>
            <div className="segmented" role="radiogroup" aria-label="Qualité graphique">
              {qualities.map((q) => (
                <button key={q.id} role="radio" aria-checked={quality === q.id} className={quality === q.id ? 'on' : ''} onClick={() => onQuality(q.id)}>{q.label}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="menu-section">
          <span className="eyebrow muted-eyebrow">Partie</span>
          <button className="btn btn-xl" onClick={onClose}>Reprendre</button>
          <div className="menu-links">
            <a className="linkbtn menu-link" href="https://footoff.media" target="_blank" rel="noreferrer">FootOFF Media ↗</a>
            <button className="linkbtn menu-link danger" onClick={onReset}>Nouvelle partie</button>
          </div>
        </section>
        <span className="menu-foot">Un jeu FootOFF Media · bêta</span>
      </div>
    </div>
  );
}
