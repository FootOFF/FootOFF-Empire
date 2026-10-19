import React, { useEffect, useRef, useState } from 'react';
import { fmtMoney } from './format';

// Animation de l'argent, pour tous les mouvements de la trésorerie :
// - gain : « +1 252 € » doré qui monte depuis le geste du joueur, pièces qui filent vers la trésorerie
//   visible (HUD ou en-tête de l'effectif), tintement et petite vibration ;
// - dépense : « −4 000 € » sobre, la trésorerie frémit ;
// - les montants affichés défilent de l'ancienne valeur à la nouvelle.
// Si l'appareil demande moins d'animations, seul le montant change.

let lastPointer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
}
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Montant qui défile vers sa nouvelle valeur (from : valeur de départ au premier affichage).
export function AnimatedMoney({ value, from, delay = 0, duration = 800, prefix = '' }) {
  const start = from ?? value;
  const [shown, setShown] = useState(start);
  const cur = useRef(start);
  useEffect(() => {
    const a = cur.current;
    const b = value;
    if (a === b) return undefined;
    if (reducedMotion()) { cur.current = b; setShown(b); return undefined; }
    let raf = 0;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / duration);
        cur.current = Math.round(a + (b - a) * (1 - (1 - k) ** 3));
        setShown(cur.current);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [value, delay, duration]);
  return <>{prefix}{fmtMoney(shown)}</>;
}

function layer() {
  let el = document.querySelector('.moneyfx-layer');
  if (!el) {
    el = document.createElement('div');
    el.className = 'moneyfx-layer';
    document.body.appendChild(el);
  }
  return el;
}

// Trésorerie réellement visible (pas masquée par un panneau ni par une scène cinématique), la plus proche.
function visibleTarget(origin) {
  let best = null;
  for (const el of document.querySelectorAll('[data-money-target]')) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit))) continue;
    const d = Math.hypot(x - origin.x, y - origin.y);
    if (!best || d < best.d) best = { el, x, y, d };
  }
  return best;
}

function flash(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth; // relance l'animation CSS
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export function moneyBurst(diff, sound) {
  if (!diff || typeof document === 'undefined') return;
  const gain = diff > 0;
  const now = performance.now();
  const origin = lastPointer && now - lastPointer.t < 2500 ? lastPointer : { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
  const target = visibleTarget(origin);
  const reduced = reducedMotion();

  try { navigator.vibrate?.(gain ? [10, 40, 10] : 15); } catch { /* vibration indisponible */ }

  if (!reduced) {
    const tag = document.createElement('div');
    tag.className = `moneyfx-tag ${gain ? 'gain' : 'loss'}`;
    tag.textContent = `${gain ? '+' : '−'}${fmtMoney(Math.abs(diff))}`;
    tag.style.left = `${origin.x}px`;
    tag.style.top = `${origin.y}px`;
    layer().appendChild(tag);
    tag.animate([
      { opacity: 0, transform: 'translate(-50%, -50%) scale(.8)' },
      { opacity: 1, transform: 'translate(-50%, -90%) scale(1.06)', offset: 0.15 },
      { opacity: 1, offset: 0.7 },
      { opacity: 0, transform: `translate(-50%, ${gain ? '-260%' : '60%'}) scale(1)` },
    ], { duration: 1400, easing: 'cubic-bezier(.2, .8, .2, 1)' }).onfinish = () => tag.remove();
  }

  if (!gain) {
    sound?.spend?.();
    if (target) flash(target.el, 'money-loss', 520);
    return;
  }

  const coins = reduced || !target ? 0 : Math.min(12, 4 + Math.round(Math.log10(diff)));
  sound?.coins?.(Math.max(3, coins), coins ? 0.5 : 0.05);
  if (!coins) {
    if (target) flash(target.el, 'money-hit', 480);
    return;
  }
  let landed = false;
  for (let i = 0; i < coins; i++) {
    const c = document.createElement('div');
    c.className = 'moneyfx-coin';
    const x0 = origin.x + (Math.random() - 0.5) * 26;
    const y0 = origin.y + (Math.random() - 0.5) * 18;
    c.style.left = `${x0}px`;
    c.style.top = `${y0}px`;
    layer().appendChild(c);
    // trajectoire en arc (courbe de Bézier quadratique), un peu différente pour chaque pièce
    const cx = (x0 + target.x) / 2 + (Math.random() - 0.5) * 140;
    const cy = Math.min(y0, target.y) - 90 - Math.random() * 80;
    const frames = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * target.x;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * target.y;
      frames.push({ transform: `translate(${x - x0}px, ${y - y0}px) scale(${1 - 0.4 * t}) rotate(${t * 540}deg)`, opacity: k === 10 ? 0.2 : 1 });
    }
    c.animate(frames, { duration: 620 + Math.random() * 160, delay: 260 + i * 55, easing: 'cubic-bezier(.45, 0, .75, 1)', fill: 'backwards' })
      .onfinish = () => {
        c.remove();
        if (!landed) { landed = true; flash(target.el, 'money-hit', 480); }
      };
  }
}
