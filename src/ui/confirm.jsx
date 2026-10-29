import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocus, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { t, tr } from '../i18n/index';

// Fenêtre de confirmation du jeu (remplace les boîtes de dialogue du navigateur).
// Entrée confirme, Échap ou un clic à côté annule. onAlt : deux vrais choix (le bouton de gauche est le second) ; Échap et
// un clic à côté ferment alors sans rien choisir.
// autoFocus faux : aucun bouton ne prend le focus (Entrée ne choisit rien), pour deux choix sans conseil.
// typed : un mot à taper pour confirmer (suppression définitive) ; le bouton reste inactif tant qu'il ne correspond pas
// (casse, accents composés, espaces en trop et forme de l'apostrophe ignorés : l'iPhone tape « ’ »).
const norm = (v) => String(v).normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[’‘ʼ´`]/g, "'").toLocaleLowerCase('fr');
export default function ConfirmDialog({ title, text, rows = [], confirmLabel = t('Confirmer'), cancelLabel = t('Annuler'), tone = 'gold', eyebrow = null, autoFocus = true, typed = null, onConfirm, onCancel, onAlt = null }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const cardRef = useRef(null);
  const typedRef = useRef(null);
  const [entry, setEntry] = useState('');
  const ready = !typed || norm(entry) === norm(typed);
  useDialogFocus(cardRef, { autoFocus: false }); // avant l'effet qui place le focus sur un bouton
  useSwipe(cardRef, { onDown: onCancel, downMedia: PHONE });

  useEffect(() => {
    // action risquée : le focus va sur « Annuler », pour qu'une touche Entrée par réflexe ne détruise rien
    if (typed) typedRef.current?.focus();
    else if (autoFocus) (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
  }, [tone, autoFocus, typed]);
  useKeydown((e) => {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } // ne ferme pas aussi le panneau dessous
  }, { capture: true });

  return (
    <div className="scrim confirm-scrim" onClick={onCancel}>
      <div ref={cardRef} className={`confirm-card glass ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <span className="grip" aria-hidden="true" />
        <span className="eyebrow">{eyebrow || (tone === 'danger' ? t('Attention') : t('Confirmation'))}</span>
        <h3 id="confirm-title">{title}</h3>
        {text && <p className="confirm-text">{text}</p>}
        {rows.length > 0 && (
          <dl className="confirm-rows">
            {rows.map(([label, value, kind]) => (
              <div key={label}><dt>{label}</dt><dd className={kind || ''}>{value}</dd></div>
            ))}
          </dl>
        )}
        {typed && (
          <label className="confirm-typed">
            <span>{tr('Pour confirmer, tape <0/>', [<b>{typed}</b>])}</span>
            <span className="lig-input">
              <input ref={typedRef} value={entry} onChange={(e) => setEntry(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ready) onConfirm(); }}
                autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={t('Tape {typed} pour confirmer', { typed })} />
            </span>
          </label>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn ghost" onClick={onAlt || onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn ${tone === 'danger' ? 'danger' : ''}`} disabled={!ready} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
