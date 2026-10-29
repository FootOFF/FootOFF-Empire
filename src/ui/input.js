import { useSyncExternalStore } from 'react';
import { t } from '../i18n/index';

// Commandes : souris et clavier, toucher, manette. La manette est traduite en touches du clavier (flèches, Échap)
// et son bouton A appuie sur l'élément qui a le focus : tout menu piloté au clavier l'est aussi à la manette, sans
// code de plus. Le dernier moyen utilisé choisit les aides affichées au bas des écrans (touches, boutons, rien au
// doigt).

const finePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
let mode = finePointer ? 'keyboard' : 'touch';
const subs = new Set();
function setMode(m) {
  if (m === mode) return;
  mode = m;
  subs.forEach((f) => f());
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const read = () => mode;
export const useInputMode = () => useSyncExternalStore(subscribe, read, read);

// --- Manette (API Gamepad, disposition standard) ----------------------------------------------------------------
// Croix et stick gauche : flèches (répétées quand on garde appuyé) ; B et Start : Échap ; A : appui sur le focus.
const PAD_KEYS = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 1: 'Escape', 9: 'Escape' };
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const held = new Map(); // touche tenue -> instant de la prochaine répétition
const before = new Map(); // manette -> boutons enfoncés à l'image précédente
let raf = 0;

const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

function poll() {
  raf = requestAnimationFrame(poll);
  const now = performance.now();
  const down = new Set();
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp || !gp.connected) continue;
    const prev = before.get(gp.index) || [];
    const cur = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    cur.forEach((on, i) => {
      if (!on) return;
      if (PAD_KEYS[i]) down.add(PAD_KEYS[i]);
      if (i === 0 && !prev[i]) {
        setMode('gamepad');
        const el = document.activeElement;
        if (el && el !== document.body) el.click();
      }
    });
    const [x = 0, y = 0] = gp.axes;
    if (y < -0.55) down.add('ArrowUp'); else if (y > 0.55) down.add('ArrowDown');
    if (x < -0.55) down.add('ArrowLeft'); else if (x > 0.55) down.add('ArrowRight');
    before.set(gp.index, cur);
  }
  for (const key of down) {
    const next = held.get(key);
    if (next === undefined) { held.set(key, now + 380); setMode('gamepad'); press(key); } else if (ARROWS.has(key) && now >= next) { held.set(key, now + 110); press(key); }
  }
  for (const key of [...held.keys()]) if (!down.has(key)) held.delete(key);
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.isTrusted) setMode('keyboard'); }, true);
  window.addEventListener('pointerdown', (e) => setMode(e.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
  if (navigator.getGamepads) {
    window.addEventListener('gamepadconnected', () => { if (!raf) raf = requestAnimationFrame(poll); });
    window.addEventListener('gamepaddisconnected', () => {
      if ([...(navigator.getGamepads() || [])].some(Boolean)) return;
      cancelAnimationFrame(raf);
      raf = 0;
      held.clear();
      before.clear();
    });
  }
}
