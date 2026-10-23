import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installFrenchTypography } from './ui/typography';
import { installScrollCues } from './ui/scrollcue';

// ?galerie : tous les écrans côte à côte · ?ecran=nom : un écran seul avec une partie fictive (jamais sauvegardée)
const params = new URLSearchParams(window.location.search);
const Gallery = lazy(() => import('./ui/gallery'));
installFrenchTypography(document.body); // espaces insécables, apostrophes, unités (voir typography.js)
installScrollCues(); // défilement aux couleurs du jeu : curseur doré au doigt, bords estompés (voir scrollcue.js)

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
const root = createRoot(document.getElementById('root'));
if (params.has('galerie')) root.render(<Suspense fallback={null}><Gallery /></Suspense>);
else if (params.has('ecran')) root.render(<App preview={params.get('ecran')} />);
else root.render(<App />);
