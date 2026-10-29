import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index';

// Animations de sortie. <Presence> garde le dernier contenu affiché le temps de son animation de sortie
// (classe « leaving », voir styles.css), puis le retire. Le contenu reste au même endroit de l'arbre React :
// son état interne (onglet, défilement, filtre) est conservé pendant qu'il s'efface.
export const EXIT_MS = 200;

// Vrai pour un contenu en train de sortir : ses raccourcis clavier se coupent aussitôt (sinon une fenêtre qui
// s'efface intercepterait encore Échap destiné à la suivante).
const LeavingContext = createContext(false);

export function Presence({ children, ms = EXIT_MS }) {
  const present = !!children;
  const last = useRef(null);
  const [, refresh] = useState(0);
  if (present) last.current = children;

  useEffect(() => {
    if (present || !last.current) return undefined;
    const t = setTimeout(() => { last.current = null; refresh((n) => n + 1); }, ms);
    return () => clearTimeout(t);
  }, [present, ms]);

  const content = present ? children : last.current;
  if (!content) return null;
  return (
    <LeavingContext.Provider value={!present}>
      <div className={present ? 'presence' : 'presence leaving'}>{content}</div>
    </LeavingContext.Provider>
  );
}

// Vrai pendant l'animation de sortie du contenu (pour un son de fermeture, par exemple).
export const useLeaving = () => useContext(LeavingContext);

// Raccourci clavier d'une fenêtre, actif seulement tant qu'elle est à l'écran. capture : passe avant les
// fenêtres dessous (qui peuvent alors être protégées par e.stopImmediatePropagation()).
export function useKeydown(onKey, { capture = false } = {}) {
  const leaving = useContext(LeavingContext);
  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(() => {
    if (leaving) return undefined;
    const h = (e) => handler.current(e);
    window.addEventListener('keydown', h, capture);
    return () => window.removeEventListener('keydown', h, capture);
  }, [leaving, capture]);
}

// Fenêtres et panneaux : le focus entre dans la fenêtre à l'ouverture et revient à l'élément d'origine
// (bouton du dock, du menu…) à la fermeture, pour qu'on ne se perde pas au clavier.
export function useDialogFocus(ref, { autoFocus = true } = {}) {
  useEffect(() => {
    const opener = document.activeElement;
    if (autoFocus && ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    return () => {
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
