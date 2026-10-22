// Réglages du joueur (par appareil) : qualité graphique de la vue 3D. Le son a sa propre préférence
// (voir sound.js, clé « fo-sound »).

const KEY_QUALITY = 'fo-quality';

export const QUALITIES = [
  { id: 'economie', label: 'Économie', hint: 'Sans ombres ni effets de lumière : idéal sur batterie ou appareil ancien.' },
  { id: 'auto', label: 'Auto', hint: 'Réglée selon ton appareil.' },
  { id: 'haute', label: 'Haute', hint: 'Ombres et netteté maximales.' },
];

export function loadQuality() {
  try { return localStorage.getItem(KEY_QUALITY) || 'auto'; } catch { return 'auto'; }
}

export function saveQuality(q) {
  try { localStorage.setItem(KEY_QUALITY, q); } catch { /* préférence non conservée */ }
}
