import React, { useEffect, useRef } from 'react';
import { useDialogFocus, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';

// Fenêtre de confirmation du jeu (remplace les boîtes de dialogue du navigateur).
// Entrée confirme, Échap ou un clic à côté annule.
export default function ConfirmDialog({ title, text, rows = [], confirmLabel = 'Confirmer', cancelLabel = 'Annuler', tone = 'gold', onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const cardRef = useRef(null);
  useDialogFocus(cardRef, { autoFocus: false }); // avant l'effet qui place le focus sur un bouton
  useSwipe(cardRef, { onDown: onCancel, downMedia: PHONE });

  useEffect(() => {
    // action risquée : le focus va sur « Annuler », pour qu'une touche Entrée par réflexe ne détruise rien
    (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
  }, [tone]);
  useKeydown((e) => {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } // ne ferme pas aussi le panneau dessous
  }, { capture: true });

  return (
    <div className="scrim confirm-scrim" onClick={onCancel}>
      <div ref={cardRef} className={`confirm-card glass ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <span className="grip" aria-hidden="true" />
        <span className="eyebrow">{tone === 'danger' ? 'Attention' : 'Confirmation'}</span>
        <h3 id="confirm-title">{title}</h3>
        {text && <p className="confirm-text">{text}</p>}
        {rows.length > 0 && (
          <dl className="confirm-rows">
            {rows.map(([label, value, kind]) => (
              <div key={label}><dt>{label}</dt><dd className={kind || ''}>{value}</dd></div>
            ))}
          </dl>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn ghost" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn ${tone === 'danger' ? 'danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
