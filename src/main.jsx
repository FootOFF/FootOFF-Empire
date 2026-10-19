import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installFrenchTypography } from './ui/typography';

// Hébergement Netlify gratuit : un badge imposé occupe le coin bas-droit ; le jeu lui laisse une bande en bas.
if (/\.netlify\.app$/.test(window.location.hostname)) {
  document.documentElement.style.setProperty('--host-badge-h', '56px');
}

// ?galerie : tous les écrans côte à côte · ?ecran=nom : un écran seul avec une partie fictive (jamais sauvegardée)
const params = new URLSearchParams(window.location.search);
const Gallery = lazy(() => import('./ui/gallery'));
installFrenchTypography(document.body); // espaces insécables, apostrophes, unités (voir typography.js)
const root = createRoot(document.getElementById('root'));
if (params.has('galerie')) root.render(<Suspense fallback={null}><Gallery /></Suspense>);
else if (params.has('ecran')) root.render(<App preview={params.get('ecran')} />);
else root.render(<App />);
