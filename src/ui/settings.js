// Réglages du joueur (par appareil) : qualité graphique de la vue 3D et image en mouvement. Le son a sa propre
// préférence (voir sound.js, clé « fo-sound »).

const KEY_QUALITY = 'fo-quality';
const KEY_MOTION = 'fo-motion';

export const QUALITIES = [
  { id: 'economie', label: 'Économie', hint: 'Sans ombres, résolution standard : idéal sur batterie ou appareil ancien.' },
  { id: 'auto', label: 'Auto', hint: 'Réglée selon ton appareil.' },
  { id: 'haute', label: 'Haute', hint: 'Ombres et netteté maximales.' },
];

export function loadQuality() {
  try { return localStorage.getItem(KEY_QUALITY) || 'auto'; } catch { return 'auto'; }
}

export function saveQuality(q) {
  try { localStorage.setItem(KEY_QUALITY, q); } catch { /* préférence non conservée */ }
}

// Image pendant les déplacements et le zoom de la caméra, comme les modes qualité et performance des consoles :
// nette (pleine résolution en permanence) ou fluide (si l'appareil ne suit pas, résolution plus basse le temps du
// mouvement, pour garder le plus d'images par seconde).
export const MOTIONS = [
  { id: 'nette', label: 'Nette', hint: 'Pleine résolution, même pendant les déplacements et le zoom.' },
  { id: 'fluide', label: 'Fluide', hint: 'Plus d’images par seconde, image moins nette en mouvement.' },
];

export function loadMotion() {
  try { return localStorage.getItem(KEY_MOTION) === 'fluide' ? 'fluide' : 'nette'; } catch { return 'nette'; }
}

export function saveMotion(m) {
  try { localStorage.setItem(KEY_MOTION, m); } catch { /* préférence non conservée */ }
}
