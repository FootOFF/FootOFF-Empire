import { useSyncExternalStore } from 'react';
import { t } from '../i18n/index';

// Commandes : souris et clavier, toucher, manette. La manette est traduite en touches du clavier (flèches, Échap, et
// les raccourcis du complexe) envoyées à l'élément qui a le focus, et son bouton A appuie sur cet élément : tout ce
// qui se pilote au clavier se pilote aussi à la manette. Là où aucun écran ne prend une direction, la navigation
// spatiale déplace le focus vers l'élément le plus proche dans ce sens. Le dernier moyen utilisé choisit les aides
// affichées au bas des écrans (touches, boutons, rien au doigt) et la marque du focus (html[data-input]).

const finePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
let mode = finePointer ? 'keyboard' : 'touch';
const subs = new Set();
function setMode(m) {
  if (m === mode) return;
  mode = m;
  if (typeof document !== 'undefined') document.documentElement.dataset.input = m;
  if (m !== 'gamepad') placeRing();
  subs.forEach((f) => f());
}

// Cadre de sélection de la manette, posé par-dessus l'élément qui a le focus et suivi à chaque image : les boutons en
// biais et les cartes à coin coupé rognent leur propre contour, qui n'apparaissait pas (le contour CSS est retiré en
// mode manette, styles.css). Jamais au clavier, à la souris ni au doigt.
let ring = null;
function placeRing() {
  const el = document.activeElement;
  const r = mode === 'gamepad' && el && el !== document.body && !el.matches('[tabindex="-1"]') ? el.getBoundingClientRect() : null;
  if (!r || r.width < 2 || r.height < 2) { if (ring) ring.style.display = 'none'; return; }
  if (!ring) {
    ring = document.createElement('div');
    ring.className = 'pad-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
  }
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  ring.style.display = 'block';
  ring.style.transform = `translate(${Math.round(r.left - 6)}px, ${Math.round(r.top - 6)}px)`;
  ring.style.width = `${Math.round(r.width + 12)}px`;
  ring.style.height = `${Math.round(r.height + 12)}px`;
  ring.style.borderRadius = radius ? `${Math.min(radius + 6, (r.height + 12) / 2)}px` : '0';
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const read = () => mode;
export const useInputMode = () => useSyncExternalStore(subscribe, read, read);

// --- Navigation spatiale ------------------------------------------------------------------------------------------
// Éléments qu'on peut atteindre : visibles et pas recouverts (ce qui est réellement à l'écran à leur place est eux, ou
// la zone qui défile pour les y amener) : rien derrière une fenêtre ouverte, sans liste des fenêtres à tenir à jour.
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="menuitem"], [role="option"]';
const scroller = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if ((/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) || (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2)) return p;
  }
  return null;
};
const hitsSelf = (el, r) => {
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const hit = document.elementFromPoint(x, y);
  return !!hit && (hit === el || el.contains(hit));
};
function reachable(el) {
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.pointerEvents === 'none') return false;
  // effacé par un parent (bandeau du complexe à opacité nulle pendant le direct) : invisible, donc hors d'atteinte
  if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const box = scroller(el);
  const clip = box ? box.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const vis = { left: Math.max(r.left, clip.left, 0), top: Math.max(r.top, clip.top, 0), right: Math.min(r.right, clip.right, innerWidth), bottom: Math.min(r.bottom, clip.bottom, innerHeight) };
  if (vis.right - vis.left > 4 && vis.bottom - vis.top > 4) {
    return hitsSelf(el, { left: vis.left, top: vis.top, width: vis.right - vis.left, height: vis.bottom - vis.top });
  }
  return !!box && hitsSelf(box, box.getBoundingClientRect()); // hors de vue dans une zone qui défile et visible : on y va
}
const candidates = () => [...document.querySelectorAll(FOCUSABLE)].filter(reachable);
function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll: true, focusVisible: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}
// premier focus : dans la fenêtre qui a le focus (un panneau qui vient de s'ouvrir le prend), l'élément marqué
// (data-pad-default : l'action principale, autofocus), sinon le bouton principal, sinon le premier
function initialFocus(items, within = null) {
  const inside = within && within !== document.body ? items.filter((el) => within.contains(el)) : [];
  const pool = inside.length ? inside : items;
  return pool.find((el) => el.matches('[data-pad-default], [autofocus]'))
    || pool.find((el) => el.matches('.btn:not(.ghost)'))
    || pool[0];
}
// focus de départ d'une fenêtre ouverte à la manette (fiche d'un bâtiment) : son action principale
export function padFocusDefault(selector = '[role="dialog"]') {
  if (mode !== 'gamepad') return;
  const items = candidates();
  const layers = [...document.querySelectorAll(selector)];
  const layer = layers[layers.length - 1] || null; // la dernière fenêtre ouverte
  focusEl(items.find((el) => el.matches('[data-pad-default]')) || initialFocus(items, layer));
}
// une fenêtre ouverte par un bouton de la manette (avant-match, boutique, panneau) et rien de choisi : son action
// principale prend le focus, A la lance tout de suite (rien hors d'une fenêtre : le complexe reste sans focus imposé)
const LAYERS = '[role="dialog"], [aria-modal="true"], .matchscreen';
function settleFocus() {
  if (mode !== 'gamepad') return;
  const cur = document.activeElement;
  if (cur && cur !== document.body && reachable(cur)) return;
  const items = candidates();
  const layers = [...document.querySelectorAll(LAYERS)].filter((l) => items.some((el) => l.contains(el)));
  if (layers.length) focusEl(initialFocus(items, layers[layers.length - 1]));
}
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
function spatialMove(key) {
  const items = candidates();
  if (!items.length) return;
  const cur = document.activeElement;
  if (!cur || cur === document.body || !items.includes(cur)) { focusEl(initialFocus(items, cur)); return; }
  // curseur, liste : gauche et droite changent la valeur (le clavier le ferait de lui-même)
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && (cur.matches('input[type="range"]') || cur.tagName === 'SELECT')) {
    const d = key === 'ArrowRight' ? 1 : -1;
    if (cur.tagName === 'SELECT') cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + d));
    else if (d > 0) cur.stepUp(); else cur.stepDown();
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    cur.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const [dx, dy] = DIRS[key];
  const a = cur.getBoundingClientRect();
  const ac = [a.left + a.width / 2, a.top + a.height / 2];
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect();
    const bc = [b.left + b.width / 2, b.top + b.height / 2];
    if ((bc[0] - ac[0]) * dx + (bc[1] - ac[1]) * dy <= 1) continue; // pas dans ce sens
    // écart dans le sens demandé (bord à bord), et décalage de côté (nul quand les deux se font face)
    const gap = dx ? Math.max(0, dx > 0 ? b.left - a.right : a.left - b.right) : Math.max(0, dy > 0 ? b.top - a.bottom : a.top - b.bottom);
    const side = dx ? Math.max(0, b.top - a.bottom, a.top - b.bottom) : Math.max(0, b.left - a.right, a.left - b.right);
    const score = gap + side * 3 + Math.abs(dx ? bc[1] - ac[1] : bc[0] - ac[0]) * 0.05;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { focusEl(best); return; }
  // rien plus loin : la zone qui défile avance d'un cran
  const box = scroller(cur);
  if (box) box.scrollBy({ left: dx * box.clientWidth * 0.4, top: dy * box.clientHeight * 0.4, behavior: 'smooth' });
}

// Gâchettes hautes (LB, RB) : onglet voisin dans la rangée d'onglets de l'écran (celle du focus, sinon la première
// visible) ; sans onglets, section voisine du menu du bas.
const TABROWS = '[role="tablist"], .section-tabs';
function stepTabs(d) {
  const rows = [...document.querySelectorAll(TABROWS)].filter((row) => [...row.querySelectorAll('button, [role="tab"]')].some(reachable));
  const row = rows.find((r) => r.contains(document.activeElement)) || rows[rows.length - 1];
  const dock = document.querySelector('.hud-dock');
  const group = row || (dock && reachable(dock.querySelector('button') || dock) ? dock : null);
  if (!group) return;
  const tabs = [...group.querySelectorAll('button, [role="tab"]')].filter((b) => !b.disabled);
  if (document.documentElement.dir === 'rtl') d = -d; // en arabe, RB va vers l'onglet de droite : le précédent
  const at = tabs.findIndex((b) => b.matches('[aria-selected="true"], [aria-current="page"], .on, .active'));
  const next = tabs[Math.max(0, Math.min(tabs.length - 1, (at < 0 ? 0 : at) + d))];
  if (!next || next === tabs[at]) return;
  const hadFocus = group.contains(document.activeElement);
  next.click();
  if (hadFocus) requestAnimationFrame(() => focusEl(next.isConnected ? next : group.querySelector('[aria-current="page"], [aria-selected="true"]')));
}

// --- Manette (API Gamepad, disposition standard) ----------------------------------------------------------------
// Croix et stick gauche : directions (répétées quand on garde appuyé) ; A : appui sur le focus ; B et Start : Échap
// (retour, pause) ; X : Bâtir (B au clavier) ; Y : Jouer (J) ; LB et RB : onglet ou section voisins ; L3 et R3 (clic
// des sticks) : bâtiment voisin du complexe ; Vue : le menu du bas ; stick droit : défilement de la zone du focus,
// sinon la caméra du complexe ; gâchettes LT et RT : zoom.
const PAD_KEYS = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 1: 'Escape', 9: 'Escape', 2: 'KeyB', 3: 'KeyJ' };
const KEY_OF = { KeyB: 'b', KeyJ: 'j' };
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const held = new Map(); // touche tenue -> instant de la prochaine répétition
const before = new Map(); // manette -> boutons enfoncés à l'image précédente
let raf = 0;
let last = 0;
let settle = 0; // instant où regarder si l'appui a ouvert une fenêtre sans focus

// la touche part de l'élément qui a le focus (gestionnaires de l'écran, puis de la fenêtre) ; une direction que
// personne n'a prise déplace le focus
function press(id) {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
  const ev = new KeyboardEvent('keydown', { key: KEY_OF[id] || id, code: KEY_OF[id] ? id : id === 'Escape' ? 'Escape' : id, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  if (ARROWS.has(id) && !ev.defaultPrevented) spatialMove(id);
}

const dead = (v) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
function poll(now) {
  raf = requestAnimationFrame(poll);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
  last = now;
  const down = new Set();
  let rx = 0; let ry = 0; let zoom = 0;
  let pressed = false;
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp || !gp.connected) continue;
    const prev = before.get(gp.index) || [];
    const cur = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    cur.forEach((on, i) => {
      if (!on) return;
      if (PAD_KEYS[i]) down.add(PAD_KEYS[i]);
      if (prev[i]) return;
      pressed = true;
      if (i === 0) {
        setMode('gamepad');
        const el = document.activeElement;
        if (el && el !== document.body) el.click(); else spatialMove('ArrowDown'); // rien de choisi : un premier focus
      } else if (i === 4 || i === 5) { setMode('gamepad'); stepTabs(i === 4 ? -1 : 1); } else if (i === 10 || i === 11) {
        setMode('gamepad');
        window.dispatchEvent(new CustomEvent('padplot', { detail: i === 10 ? -1 : 1 })); // bâtiment voisin (App)
      } else if (i === 8) {
        setMode('gamepad');
        focusEl(document.querySelector('.hud-dock button[aria-current="page"]') || document.querySelector('.hud-dock button'));
      }
    });
    const [x = 0, y = 0, x2 = 0, y2 = 0] = gp.axes;
    if (y < -0.55) down.add('ArrowUp'); else if (y > 0.55) down.add('ArrowDown');
    if (x < -0.55) down.add('ArrowLeft'); else if (x > 0.55) down.add('ArrowRight');
    rx += dead(x2); ry += dead(y2);
    zoom += (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
    before.set(gp.index, cur);
  }
  for (const key of down) {
    const next = held.get(key);
    if (next === undefined) { held.set(key, now + 380); setMode('gamepad'); press(key); } else if (ARROWS.has(key) && now >= next) { held.set(key, now + 110); press(key); }
  }
  for (const key of [...held.keys()]) if (!down.has(key)) held.delete(key);
  if (pressed) settle = now + 350; // le temps que la fenêtre s'ouvre
  else if (settle && now >= settle) { settle = 0; settleFocus(); }
  placeRing();
  if (!dt || (!rx && !ry && Math.abs(zoom) < 0.1)) return;
  setMode('gamepad');
  // stick droit : la zone qui défile autour du focus (vertical), sinon la caméra (événement « padcamera », lu par
  // la scène 3D) ; gâchettes : zoom de la caméra
  const box = ry && document.activeElement !== document.body ? scroller(document.activeElement) : null;
  if (box) box.scrollBy({ top: ry * dt * 900 });
  window.dispatchEvent(new CustomEvent('padcamera', { detail: { x: rx, y: box ? 0 : ry, zoom: Math.abs(zoom) < 0.1 ? 0 : zoom, dt } }));
}

if (typeof window !== 'undefined') {
  document.documentElement.dataset.input = mode;
  window.addEventListener('keydown', (e) => { if (e.isTrusted) setMode('keyboard'); }, true);
  window.addEventListener('pointerdown', (e) => setMode(e.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
  if (navigator.getGamepads) {
    window.addEventListener('gamepadconnected', () => { if (!raf) raf = requestAnimationFrame(poll); });
    window.addEventListener('gamepaddisconnected', () => {
      if ([...(navigator.getGamepads() || [])].some(Boolean)) return;
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (ring) ring.style.display = 'none';
      held.clear();
      before.clear();
    });
  }
}
