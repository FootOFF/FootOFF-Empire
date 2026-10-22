import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Infobulles du jeu (PC, à la souris) : remplacent celles du navigateur, lentes et sans style. Tout élément qui
// porte un title (ou data-tip) en profite : au survol, son texte s'affiche au-dessus de lui après un court instant,
// dans le style du jeu, sans jamais sortir de l'écran. Rien au doigt : on lit tout sans survol sur téléphone.

const DELAY = 280; // survol volontaire, pas un simple passage de la souris
const HIDE = 60;

export function TipLayer() {
  const [tip, setTip] = useState(null); // { text, x, y, below }
  const timer = useRef(0);
  const cur = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
    const place = (el, text) => {
      const r = el.getBoundingClientRect();
      const below = r.top < 64; // près du haut de l'écran : dessous
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 10 : r.top - 10, below });
    };
    // le title de l'élément survolé est retiré le temps du survol (pas d'infobulle du navigateur en double), puis
    // rendu : React reste maître de l'attribut (un texte vidé ou changé entre-temps n'est jamais remplacé)
    const held = new WeakMap();
    const giveBack = (el) => {
      if (!el || !held.has(el)) return;
      if (!el.hasAttribute('title')) el.setAttribute('title', held.get(el));
      held.delete(el);
    };
    const over = (e) => {
      const el = e.target.closest?.('[title], [data-tip]');
      if (!el || el === cur.current) return;
      let text = el.getAttribute('data-tip');
      if (el.hasAttribute('title')) {
        const t = el.getAttribute('title');
        held.set(el, t);
        el.removeAttribute('title');
        text = t || text;
      }
      if (cur.current && cur.current !== el) giveBack(cur.current);
      if (!text) { giveBack(el); return; }
      cur.current = el;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (cur.current === el && document.contains(el)) place(el, text); }, DELAY);
    };
    let clicked = null; // élément cliqué : son title revient quand la souris le quitte (sinon l'infobulle du navigateur)
    const out = (e) => {
      if (clicked && !(e.relatedTarget && clicked.contains(e.relatedTarget))) { giveBack(clicked); clicked = null; }
      const el = cur.current;
      if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
      giveBack(el);
      cur.current = null;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setTip(null), HIDE);
    };
    const hide = () => { if (cur.current) clicked = cur.current; cur.current = null; clearTimeout(timer.current); setTip(null); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('keydown', hide);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('keydown', hide);
      clearTimeout(timer.current);
    };
  }, []);

  // reste dans l'écran : décalage horizontal mesuré une fois la bulle posée, avant qu'elle ne s'affiche
  useLayoutEffect(() => {
    const el = box.current;
    if (!tip || !el) return;
    el.style.setProperty('--dx', '0px');
    const r = el.getBoundingClientRect();
    const m = 8;
    const shift = r.left < m ? m - r.left : r.right > window.innerWidth - m ? window.innerWidth - m - r.right : 0;
    el.style.setProperty('--dx', `${shift}px`);
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      className={`tip-bubble ${tip.below ? 'below' : ''}`}
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
