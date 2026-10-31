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
      // jamais plus grand qu'au départ (1.0.14) : au téléphone couché, le nom de l'avant-match part de 18 px pour un
      // minimum de 22 : il grossissait, puis était raccourci (« ESTUDIANTES DE CAS… »)
      const floor = Math.min(min, max * 0.75);
      el.style.fontSize = `${Math.max(floor, Math.floor((max * el.clientWidth) / el.scrollWidth))}px`;
      if (el.scrollWidth > el.clientWidth + 1) el.classList.add('long');
    };
    fit();
    document.fonts?.ready.then(() => { if (ref.current === el) fit(); });
    // chaque police qui finit d'arriver (1.0.14) : « ready » peut se résoudre avant même que la police du titre soit
    // demandée, le nom restait alors mesuré dans la police de secours (« KESTREL BAY SPORTI… » au tableau d'affichage)
    document.fonts?.addEventListener?.('loadingdone', fit);
    // et deux remesures différées : une mise en page qui se termine après coup (blasons, entrée animée d'un écran) sans
    // changer la largeur du parent laissait parfois un nom raccourci (« BLEUS BOIS-J… » à l'avant-match)
    const late = [setTimeout(fit, 400), setTimeout(fit, 1200)];
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement);
    return () => { ro.disconnect(); late.forEach(clearTimeout); document.fonts?.removeEventListener?.('loadingdone', fit); };
  }, [text, min]);
  return ref;
}
