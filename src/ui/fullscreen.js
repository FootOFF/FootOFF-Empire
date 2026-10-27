import { useSyncExternalStore } from 'react';

// Plein écran sur PC : le réglage « Plein écran » (console.jsx, SettingsView). Le navigateur n'y entre qu'à la suite
// d'un geste du joueur : si le réglage est resté allumé, le premier clic ou la première touche de la séance suivante y
// remet le jeu (installFullscreen, au démarrage). Sortir du plein écran (Échap, F11) éteint le réglage. Pas sur
// téléphone ni tablette : réservé aux écrans à souris (l'iPhone ne sait pas mettre une page en plein écran).

const KEY = 'fo-fullscreen';
const root = () => document.documentElement;
const isOn = () => !!document.fullscreenElement;
const remember = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* préférence non conservée */ } };
const wanted = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };

export const canFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled && !!root().requestFullscreen
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function setFullscreen(on) {
  remember(on);
  if (on && !isOn()) return root().requestFullscreen({ navigationUI: 'hide' }).catch(() => remember(false));
  if (!on && isOn()) return document.exitFullscreen().catch(() => {});
  return Promise.resolve();
}

// Le jeu est-il en plein écran (suivi en direct : Échap le quitte sans passer par le réglage).
export function useFullscreen() {
  return useSyncExternalStore(
    (f) => { document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); },
    isOn,
    () => false,
  );
}

export function installFullscreen() {
  if (!canFullscreen()) return;
  document.addEventListener('fullscreenchange', () => { if (!isOn()) remember(false); });
  if (!wanted()) return;
  const again = (e) => {
    if (e.key === 'Escape') return; // Échap ne compte pas comme un geste pour le navigateur
    window.removeEventListener('pointerdown', again, true);
    window.removeEventListener('keydown', again, true);
    if (wanted() && !isOn()) root().requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
  window.addEventListener('pointerdown', again, true);
  window.addEventListener('keydown', again, true);
}
