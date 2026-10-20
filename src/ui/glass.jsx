import React, { useLayoutEffect, useRef, useState } from 'react';
import { haptic } from './haptics';

// Sélection en verre liquide (façon iOS) : une pastille posée sous l'élément actif, qui glisse vers le nouvel
// élément choisi en s'étirant, et qu'on peut aussi faire glisser au doigt : elle suit le doigt, se cale sur
// l'élément le plus proche, et la section est sélectionnée quand on relâche.
// Chaque élément sélectionnable porte data-key ; un simple appui garde le comportement normal du bouton.
export function useGlass(activeKey, onPick) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  const [drag, setDrag] = useState(null); // { x, w, key } pendant le glissé
  const [moving, setMoving] = useState(false);
  const g = useRef({ start: null, moved: false, suppress: false, key: null });
  const first = useRef(true);

  const boxOf = (el) => ({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const place = () => {
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

  const items = () => [...ref.current.querySelectorAll('[data-key]')];
  const nearest = (clientX) => {
    let best = null;
    let bd = Infinity;
    for (const el of items()) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  };

  const reset = () => { g.current.start = null; g.current.moved = false; g.current.key = null; setDrag(null); };
  const handlers = {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      g.current.start = { x: e.clientX, y: e.clientY };
      g.current.moved = false;
    },
    onPointerMove: (e) => {
      const st = g.current.start;
      if (!st) return;
      if (!g.current.moved) {
        if (Math.abs(e.clientX - st.x) < 8) return;
        if (Math.abs(e.clientY - st.y) > Math.abs(e.clientX - st.x)) { g.current.start = null; return; } // geste vertical
        g.current.moved = true;
        try { ref.current.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      }
      const el = nearest(e.clientX);
      if (!el) return;
      const root = ref.current.getBoundingClientRect();
      const b = boxOf(el);
      const min = items()[0].offsetLeft;
      const last = items()[items().length - 1];
      const max = last.offsetLeft + last.offsetWidth - b.w;
      const x = Math.min(max, Math.max(min, e.clientX - root.left - b.w / 2));
      const key = el.getAttribute('data-key');
      if (key !== g.current.key) { if (g.current.key !== null) haptic('tap'); g.current.key = key; }
      setDrag({ x, w: b.w, key });
    },
    onPointerUp: () => {
      if (g.current.moved) {
        const key = g.current.key;
        g.current.suppress = true; // le clic qui suit le relâché ne doit pas rebasculer la section
        setTimeout(() => { g.current.suppress = false; }, 0);
        reset();
        if (key !== null && key !== String(activeKey)) onPick(key);
        return;
      }
      reset();
    },
    onPointerCancel: reset,
    onClickCapture: (e) => {
      if (g.current.suppress) { e.preventDefault(); e.stopPropagation(); }
    },
  };

  const style = drag && box ? { '--x': `${drag.x}px`, width: drag.w, top: box.y, height: box.h }
    : box ? { '--x': `${box.x}px`, width: box.w, top: box.y, height: box.h } : null;
  const glass = style ? <span className={`glass-pill ${moving && !drag ? 'moving' : ''} ${drag ? 'dragging' : ''}`} style={style} aria-hidden="true" /> : null;
  return { ref, glass, handlers, hoverKey: drag?.key ?? null };
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
