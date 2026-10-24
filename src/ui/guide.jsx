import React from 'react';
import { FOMonogram } from './brand';
import { IconClose, IconCoin } from './icons';

// Guidage du joueur : carte du tutoriel (premières minutes) et « Conseil du staff » (ensuite).

export function CoachCard({ content, onPrimary, onSecondary, onSkip }) {
  if (!content) return null;
  return (
    <aside className="hud-coach glass" key={content.step} aria-live="polite">
      <header className="coach-head">
        <FOMonogram className="coach-mark" />
        <span className="eyebrow">Premiers pas · {content.index}/{content.total}</span>
        <span className="coach-dots" aria-hidden="true">
          {Array.from({ length: content.total }, (_, i) => <i key={i} className={i < content.index ? 'on' : ''} />)}
        </span>
      </header>
      <span className="coach-who">Ta directrice sportive</span>
      <strong className="coach-title">{content.title}</strong>
      <p className="coach-text">{content.text}</p>
      {content.why && <p className="coach-why">{content.why}</p>}
      {content.reward && <span className="coach-reward"><IconCoin /> Prime de l’étape : +{content.reward.toLocaleString('fr-FR')} €</span>}
      <div className="coach-actions">
        <button className="btn btn-sm" onClick={onPrimary}>{content.cta}</button>
        {content.secondary && <button className="btn btn-sm ghost" onClick={onSecondary}>{content.secondary.label}</button>}
        {content.step !== 'stadium' && <button className="linkbtn coach-skip" onClick={onSkip}>Passer le tutoriel</button>}
      </div>
    </aside>
  );
}

export function StaffTip({ tip, onAction, onDismiss }) {
  if (!tip) return null;
  return (
    <aside className={`hud-tip glass ${tip.tone || ''}`} key={tip.id} aria-live="polite">
      <span className="tip-eyebrow">Conseil du staff</span>
      <button className="tip-main" onClick={onAction}>
        <strong>{tip.title}</strong>
        <span className="tip-text">{tip.text}</span>
        <span className="tip-cta">{tip.action.label} →</span>
      </button>
      <button className="tip-close" onClick={onDismiss} aria-label="Masquer ce conseil"><IconClose /></button>
    </aside>
  );
}
