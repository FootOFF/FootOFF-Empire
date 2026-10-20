import React, { useLayoutEffect, useRef, useState } from 'react';
import { haptic } from './haptics';

// Sélection en verre liquide (façon iOS) : une pastille posée sous l'élément actif, qui glisse vers le nouvel
// élément choisi en s'étirant, et qu'on peut aussi faire glisser au doigt : elle suit le doigt image par image,
// change de largeur progressivement entre deux sections, résiste au-delà des bords, puis se pose sur la section
// la plus proche au relâché (qui est alors sélectionnée).
// Pendant le glissé, rien ne passe par React (pas de rendu à chaque mouvement) : la position est écrite
// directement sur la pastille, une fois par image, à partir de mesures prises au début du geste.
// Chaque élément sélectionnable porte data-key ; un simple appui garde le comportement normal du bouton.
export function useGlass(activeKey, onPick) {
  const ref = useRef(null);
  const pill = useRef(null);
  const [box, setBox] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [moving, setMoving] = useState(false);
  const g = useRef({ start: null, moved: false, suppress: false, key: null, items: null, left: 0, x: 0, raf: 0 });
  const first = useRef(true);

  const boxOf = (el) => ({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const place = () => {
      if (g.current.moved) return; // la pastille appartient au doigt pendant le glissé
      const el = root.querySelector(`[data-key="${activeKey}"]`);
      setBox(el ? boxOf(el) : null);
    };
    place();
    let t;
    if (first.current) first.current = false;
    else { setMoving(true); t = setTimeout(() => setMoving(false), 520); }
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [activeKey]);

  // position du doigt → centre et largeur de la pastille (interpolés entre les sections voisines)
  const layout = (lx) => {
    const it = g.current.items;
    const n = it.length;
    const a = it[0].c;
    const b = it[n - 1].c;
    let c = lx;
    if (lx < a) c = a - (a - lx) * 0.22; // au-delà des bords : la goutte résiste
    if (lx > b) c = b + (lx - b) * 0.22;
    let i = 0;
    while (i < n - 2 && c > it[i + 1].c) i++;
    const span = it[i + 1] ? it[i + 1].c - it[i].c : 1;
    const t = Math.min(1, Math.max(0, (c - it[i].c) / span));
    const w = it[i + 1] ? it[i].w + (it[i + 1].w - it[i].w) * t : it[i].w;
    const key = (t < 0.5 || !it[i + 1] ? it[i] : it[i + 1]).key;
    return { x: c - w / 2, w, key };
  };
  const paint = () => {
    g.current.raf = 0;
    const el = pill.current;
    if (!el || !g.current.items) return;
    const { x, w, key } = layout(g.current.x);
    el.style.setProperty('--x', `${x}px`);
    el.style.width = `${w}px`;
    if (key !== g.current.key) {
      if (g.current.key !== null) haptic('tap');
      g.current.key = key;
      setHoverKey(key);
    }
  };

  const end = (commit) => {
    const st = g.current;
    cancelAnimationFrame(st.raf);
    st.raf = 0;
    const wasMoving = st.moved;
    const key = st.key;
    st.start = null;
    st.moved = false;
    st.key = null;
    ref.current?.classList.remove('glass-dragging');
    pill.current?.classList.remove('dragging');
    setHoverKey(null);
    if (!wasMoving) return;
    st.suppress = true; // le clic qui suit le relâché ne doit pas rebasculer la section
    setTimeout(() => { st.suppress = false; }, 0);
    const target = commit && key !== null ? key : String(activeKey);
    const el = ref.current?.querySelector(`[data-key="${target}"]`);
    if (el && pill.current) { // la goutte se pose (transition élastique de la feuille de style)
      pill.current.style.setProperty('--x', `${el.offsetLeft}px`);
      pill.current.style.width = `${el.offsetWidth}px`;
    }
    st.items = null;
    if (commit && key !== null && key !== String(activeKey)) onPick(key);
  };

  const handlers = {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      cancelAnimationFrame(g.current.raf); // un geste précédent interrompu ne doit rien laisser en attente
      g.current.raf = 0;
      g.current.start = { x: e.clientX, y: e.clientY };
      g.current.moved = false;
    },
    onPointerMove: (e) => {
      const st = g.current;
      if (!st.start) return;
      if (!st.moved) {
        const dx = Math.abs(e.clientX - st.start.x);
        const dy = Math.abs(e.clientY - st.start.y);
        if (dx < 6) return;
        if (dy > dx) { st.start = null; return; } // geste vertical : on laisse défiler
        st.moved = true;
        const root = ref.current;
        try { root.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
        st.left = root.getBoundingClientRect().left;
        st.items = [...root.querySelectorAll('[data-key]')].map((el) => ({
          key: el.getAttribute('data-key'), c: el.offsetLeft + el.offsetWidth / 2, w: el.offsetWidth,
        }));
        st.key = String(activeKey);
        root.classList.add('glass-dragging');
        pill.current?.classList.add('dragging');
      }
      st.x = e.clientX - st.left;
      if (!st.raf) st.raf = requestAnimationFrame(paint);
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onClickCapture: (e) => {
      if (g.current.suppress) { e.preventDefault(); e.stopPropagation(); }
    },
  };

  const style = box ? { '--x': `${box.x}px`, width: box.w, top: box.y, height: box.h } : null;
  const glass = style ? <span ref={pill} className={`glass-pill ${moving ? 'moving' : ''}`} style={style} aria-hidden="true" /> : null;
  return { ref, glass, handlers, hoverKey };
}

// Barre d'onglets (ou choix segmenté) avec pastille en verre : items = [[id, libellé, complément?], …].
export function GlassTabs({ items, value, onChange, className = 'sq-tabs', role = 'tablist', label }) {
  const { ref, glass, handlers, hoverKey } = useGlass(String(value), (k) => {
    const it = items.find(([id]) => String(id) === k);
    if (it) onChange(it[0]);
  });
  const radio = role === 'radiogroup';
  return (
    <div ref={ref} className={`${className} has-glass`} role={role} aria-label={label} data-noswipe {...handlers}>
      {glass}
      {items.map(([id, text, extra]) => {
        const on = value === id;
        const lit = hoverKey === null ? on : hoverKey === String(id);
        return (
          <button
            key={String(id)}
            data-key={String(id)}
            role={radio ? 'radio' : 'tab'}
            aria-selected={radio ? undefined : on}
            aria-checked={radio ? on : undefined}
            className={`${on ? 'on' : ''} ${lit ? 'lit' : ''}`}
            onClick={() => onChange(id)}
          >
            {text}{extra || null}
          </button>
        );
      })}
    </div>
  );
}
