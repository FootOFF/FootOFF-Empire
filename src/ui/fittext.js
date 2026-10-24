import { useLayoutEffect, useRef } from 'react';

// Nom trop long pour sa case (club, adversaire) : le texte rapetisse juste assez pour tenir sur une ligne, jusqu'à
// « min » pixels ; s'il déborde encore, classe « long » : deux lignes à cette taille, jamais coupé. Remesuré quand la
// case change de largeur et quand la police arrive. À poser sur un élément en « white-space: nowrap; overflow: hidden ».
export function useFitText(text, min) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = '';
      el.classList.remove('long');
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const max = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(min, Math.floor((max * el.clientWidth) / el.scrollWidth))}px`;
      if (el.scrollWidth > el.clientWidth + 1) el.classList.add('long');
    };
    fit();
    document.fonts?.ready.then(() => { if (ref.current === el) fit(); });
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [text, min]);
  return ref;
}
