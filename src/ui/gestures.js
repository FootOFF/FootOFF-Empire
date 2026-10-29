import { useEffect, useRef, useSyncExternalStore } from 'react';
import { haptic } from './haptics';

// Téléphone en portrait : fenêtres en feuilles qui montent du bas. Téléphone couché (0.8.13) : la mise en page de
// l'ordinateur étroit, resserrée par landscape.css (les mêmes conditions que styles.css).
export const PHONE = '(max-width: 760px) and (orientation: portrait), (max-width: 760px) and (min-height: 501px)';
export const LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';

// Condition d'écran suivie en direct (la mise en page change quand la fenêtre passe du format PC au téléphone).
export function useMedia(query) {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', f);
      return () => m.removeEventListener('change', f);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Gestes au doigt : glisser vers le bas pour fermer, vers la gauche ou la droite pour passer au suivant ou au
// précédent. L'élément suit le doigt ; au lâcher, le geste aboutit s'il est assez long ou assez vif, sinon
// l'élément revient en place. Le défilement reste prioritaire : on ne ferme vers le bas que si le contenu est
// déjà tout en haut, et on ne capte pas un geste horizontal dans une rangée qui défile en largeur.
// downMedia : condition d'écran pour le geste vers le bas (ex. seulement sur téléphone, où la fenêtre est une
// feuille qui monte du bas). Sans suivant (ou précédent), l'élément ne suit le doigt que de loin, et revient.
// sideIf(cible) : le geste de côté n'est permis que si le doigt est posé sur une cible acceptée (le panneau d'une
// section ne change pas de section sous une fiche ouverte). sideExit : l'élément quitte l'écran par le côté (il ne
// revient pas en place : sa sortie, styles.css, repart de la position du doigt).
export function useSwipe(ref, { onDown, onLeft, onRight, downMedia = null, sideIf = null, sideExit = false } = {}) {
  const cb = useRef({});
  cb.current = { onDown, onLeft, onRight, sideIf, sideExit };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let g = null;

    const scroller = (node, axis) => {
      for (let n = node; n && n !== el.parentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (axis === 'y' && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
        if (axis === 'x' && /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return n;
      }
      return null;
    };
    const settle = () => { // retour en place, en douceur
      el.style.transition = 'transform .25s cubic-bezier(.2, .8, .2, 1), opacity .25s';
      el.style.transform = '';
      el.style.opacity = '';
      setTimeout(() => { if (!g) el.style.transition = ''; }, 300);
    };

    const start = (e) => {
      g = null;
      if (e.__swipe || e.touches.length !== 1) return;
      if (e.target.closest('input, select, textarea, [data-noswipe]')) return;
      e.__swipe = true; // fenêtre dans une fenêtre : la plus proche du doigt prend le geste
      const t = e.touches[0];
      const sy = scroller(e.target, 'y');
      g = {
        x: t.clientX, y: t.clientY, t: performance.now(), axis: null, dx: 0, dy: 0,
        top: !sy || sy.scrollTop <= 0,
        rowScroll: !!scroller(e.target, 'x'),
        side: !cb.current.sideIf || cb.current.sideIf(e.target),
        down: !!cb.current.onDown && (!downMedia || window.matchMedia(downMedia).matches),
      };
    };
    const move = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        const sideways = (cb.current.onLeft || cb.current.onRight) && g.side;
        if (g.down && g.top && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) g.axis = 'y';
        else if (sideways && !g.rowScroll && Math.abs(dx) > Math.abs(dy) * 1.5) g.axis = 'x';
        else { g = null; return; } // geste ordinaire : le navigateur fait défiler
        el.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      g.dx = dx;
      g.dy = dy;
      if (g.axis === 'y') el.style.transform = `translateY(${Math.max(0, dy)}px)`;
      else {
        const can = dx < 0 ? cb.current.onLeft : cb.current.onRight;
        el.style.transform = `translateX(${dx * (can ? 0.5 : 0.12)}px)`;
        if (can) el.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, 0.25));
      }
    };
    const end = () => {
      const s = g;
      g = null;
      if (!s || !s.axis) return;
      const ms = Math.max(1, performance.now() - s.t);
      if (s.axis === 'y' && (s.dy > 120 || (s.dy > 40 && s.dy / ms > 0.6))) {
        el.dataset.swiped = 'down'; // la sortie repart de la position du doigt, vers le bas (styles.css)
        haptic('tap');
        cb.current.onDown();
        setTimeout(() => { // fermeture refusée : on remet en place
          if (el.isConnected && !el.closest('.leaving')) { delete el.dataset.swiped; settle(); }
        }, 450);
        return;
      }
      const go = s.dx < 0 ? cb.current.onLeft : cb.current.onRight;
      if (s.axis === 'x' && go && (Math.abs(s.dx) > 80 || (Math.abs(s.dx) > 30 && Math.abs(s.dx) / ms > 0.5))) {
        haptic('tap');
        if (cb.current.sideExit) {
          el.dataset.swiped = s.dx < 0 ? 'left' : 'right';
          go();
          setTimeout(() => { // sortie refusée : on remet en place
            if (el.isConnected && !el.closest('.leaving')) { delete el.dataset.swiped; settle(); }
          }, 450);
          return;
        }
        settle();
        go();
        return;
      }
      settle();
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, downMedia]);
}
