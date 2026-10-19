import React, { useEffect } from 'react';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { PLOT_LABELS, SECTORS, allowedBuildingsFor, buildingEffect, plotBuilding } from '../game/map';
import { fmtMoney } from './format';
import { IconAcademy, IconArrowUp, IconClose, IconFans, IconLock, IconSponsor, IconStadium, IconTraining } from './icons';

const ICONS = { terrain: IconStadium, training: IconTraining, academy: IconAcademy, fans: IconFans, sponsor: IconSponsor };

function Pips({ lvl, max }) {
  return (
    <div className="pips" aria-label={`Niveau ${lvl} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}
    </div>
  );
}

// Inspecteur de parcelle : carte latérale (feuille basse sur mobile) ouverte au clic dans la vue 3D.
export default function PlotInspector({ state, sel, onClose, onBuild, onUpgrade, onMatchDay }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sec = SECTORS.find((s) => s.id === sel.sector);
  const unlocked = state.reputation >= sec.repNeeded;
  const key = plotBuilding(state, sel.plotId);
  const Icon = key ? ICONS[key] : unlocked ? IconArrowUp : IconLock;

  let body;
  let title;
  if (!unlocked) {
    title = 'Secteur verrouillé';
    const pct = Math.min(1, state.reputation / sec.repNeeded);
    body = (
      <>
        <p className="ins-text">{sec.blurb}</p>
        <div className="ins-req">
          <div className="ins-req-head"><span>Réputation</span><b>{Math.round(state.reputation)} / {sec.repNeeded}</b></div>
          <span className="ins-bar"><i style={{ width: `${pct * 100}%` }} /></span>
        </div>
      </>
    );
  } else if (!key) {
    title = 'Parcelle libre';
    const available = allowedBuildingsFor(state, sec.id);
    body = available.length ? (
      <div className="ins-options">
        {available.map((k) => {
          const B = ICONS[k];
          const cost = upgradeCost(k, 1);
          const short = state.money < cost;
          return (
            <div className="ins-option" key={k}>
              <span className="ins-option-icon"><B /></span>
              <div className="ins-option-main">
                <strong>{BUILDINGS[k].name}</strong>
                <span>{buildingEffect(k, 1, state.divisionIndex)}</span>
              </div>
              <button className="btn btn-sm" disabled={short} onClick={() => onBuild(sec.id, k)} title={short ? `Il manque ${fmtMoney(cost - state.money)}` : ''}>
                {fmtMoney(cost)}
              </button>
            </div>
          );
        })}
      </div>
    ) : (
      <p className="ins-text">Tous les bâtiments de ce secteur sont déjà construits.</p>
    );
  } else {
    const b = BUILDINGS[key];
    const lvl = state.buildings[key];
    const maxed = lvl >= b.max;
    const cost = upgradeCost(key, lvl + 1);
    const short = state.money < cost;
    title = b.name;
    body = (
      <>
        <div className="ins-level"><Pips lvl={lvl} max={b.max} /><span>Niveau {lvl}/{b.max}</span></div>
        <div className="ins-effect">
          <span className="eyebrow muted-eyebrow">Actuellement</span>
          <p>{buildingEffect(key, lvl, state.divisionIndex)}</p>
        </div>
        {!maxed ? (
          <>
            <div className="ins-effect next">
              <span className="eyebrow">Niveau {lvl + 1}</span>
              <p>{buildingEffect(key, lvl + 1, state.divisionIndex)}</p>
            </div>
            <button className="btn btn-xl wide" disabled={short} onClick={() => onUpgrade(key)}>
              <IconArrowUp /> Améliorer · {fmtMoney(cost)}
            </button>
            {short && <span className="ins-hint">Il manque {fmtMoney(cost - state.money)}</span>}
          </>
        ) : (
          <div className="ins-max">Niveau maximum atteint</div>
        )}
        {key === 'terrain' && onMatchDay && (
          <button className="btn ghost wide" onClick={onMatchDay}><IconStadium /> Voir le stade en jour de match</button>
        )}
      </>
    );
  }

  return (
    <aside className="inspector glass" role="dialog" aria-label={title}>
      <header className="ins-head">
        <span className="ins-icon"><Icon /></span>
        <div>
          <span className="eyebrow">{sec.short || sec.name} · {PLOT_LABELS[sel.plotId]}</span>
          <h3>{title}</h3>
        </div>
        <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      {body}
    </aside>
  );
}
