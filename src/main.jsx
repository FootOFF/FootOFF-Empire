import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Hébergement Netlify gratuit : un badge imposé occupe le coin bas-droit ; le jeu lui laisse une bande en bas.
if (/\.netlify\.app$/.test(window.location.hostname)) {
  document.documentElement.style.setProperty('--host-badge-h', '56px');
}

createRoot(document.getElementById('root')).render(<App />);
