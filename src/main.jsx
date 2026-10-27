import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installFrenchTypography } from './ui/typography';
import { installScrollCues } from './ui/scrollcue';
import ErrorBoundary from './ui/crash';
import { installErrorLog } from './ui/errlog';
import { registerUpdates } from './ui/updates';

// ?galerie : tous les écrans côte à côte · ?ecran=nom : un écran seul avec une partie fictive (jamais sauvegardée)
const params = new URLSearchParams(window.location.search);
const Gallery = lazy(() => import('./ui/gallery'));
installFrenchTypography(document.body); // espaces insécables, apostrophes, unités (voir typography.js)
installScrollCues(); // défilement sans barre : bords estompés là où il reste du contenu (voir scrollcue.js)

// Pas de zoom de la page au doigt : le pincement agrandissait toute l'interface (écran titre compris). Safari sur
// iPhone ignore user-scalable=no (index.html) : on bloque ses gestes de pincement. La caméra 3D garde son propre
// zoom à deux doigts (OrbitControls suit les événements « pointer », que ce blocage ne touche pas).
const noPageZoom = (e) => e.preventDefault();
document.addEventListener('gesturestart', noPageZoom, { passive: false });
document.addEventListener('gesturechange', noPageZoom, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// Rien ne se sélectionne dans le jeu, quel que soit le geste (appui long, double toucher, « Tout sélectionner » du
// système) : la bulle « Copier / Traduire » n'apparaît jamais. Seule la saisie du nom du club garde sa sélection.
const editable = (n) => {
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return !!el?.closest?.('input, textarea, [contenteditable="true"]');
};
document.addEventListener('selectstart', (e) => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener('selectionchange', () => {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || editable(document.activeElement) || editable(sel.anchorNode)) return;
  sel.removeAllRanges();
});
document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });

// iPhone : un double toucher maintenu ouvre la loupe de texte de Safari, même là où rien ne se sélectionne (HUD, fiches).
// Le second appui d'un double toucher (juste après un toucher bref, au même endroit) est bloqué à la source, comme sur
// le complexe 3D (Empire3D.jsx) ; s'il reste un toucher bref, son clic est rejoué : un bouton touché deux fois de suite
// répond deux fois. Seul un toucher bref ouvre la fenêtre : les défilements enchaînés ne sont jamais bloqués. Les
// gestes au doigt (pointer events) ne sont pas touchés : maintenir « Construire » ou le double toucher glissé du zoom 3D
// marchent comme avant.
let lastTap = null; // dernier toucher bref : { t, x, y }
let touch = null; // toucher en cours : { t, x, y, moved, blocked, target }
document.addEventListener('touchstart', (e) => {
  touch = null;
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  touch = { t: performance.now(), x: t.clientX, y: t.clientY, moved: false, blocked: false, target: e.target };
  const again = lastTap && touch.t - lastTap.t < 350 && Math.hypot(touch.x - lastTap.x, touch.y - lastTap.y) < 40;
  if (again && !editable(e.target) && e.cancelable) { e.preventDefault(); touch.blocked = true; }
}, { passive: false, capture: true });
document.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (touch && t && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) touch.moved = true;
}, { passive: true, capture: true });
document.addEventListener('touchend', () => {
  if (!touch) return;
  const now = performance.now();
  const tap = !touch.moved && now - touch.t < 300;
  // clic rejoué (le blocage l'a annulé), comme un toucher (detail 1 : un bouton à maintenir, « Construire », l'ignore et
  // garde son appui long ; detail 0 passerait pour le clavier), sauf sur la 3D : elle sélectionne au relâcher
  if (touch.blocked && tap && touch.target.isConnected && !touch.target.closest?.('canvas')) {
    touch.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, detail: 1, clientX: touch.x, clientY: touch.y }));
  }
  lastTap = tap ? { t: now, x: touch.x, y: touch.y } : null;
  touch = null;
}, { capture: true });
document.addEventListener('touchcancel', () => { touch = null; lastTap = null; }, { capture: true });
window.__foBoot.started = true; // le code du jeu tourne : index.html n'affichera pas « le jeu n'a pas pu démarrer »
installErrorLog(); // dernières erreurs du navigateur, pour le rapport de l'écran d'erreur
const root = createRoot(document.getElementById('root'));
if (window.__foMoving) { /* changement d'adresse en cours (index.html) : la page va être remplacée, le jeu ne démarre pas */ }
else if (params.has('galerie')) root.render(<Suspense fallback={null}><Gallery /></Suspense>);
else if (params.has('ecran')) root.render(<ErrorBoundary><App preview={params.get('ecran')} /></ErrorBoundary>);
else {
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
  registerUpdates(); // service worker : jeu hors ligne, ressources en cache, bandeau « Nouvelle version »
}
