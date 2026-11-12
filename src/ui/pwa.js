// Installer le jeu sur l'écran d'accueil (1.0.35, demande du PDG) : au téléphone, un joueur qui joue dans le navigateur
// reçoit une feuille qui le lui recommande et lui montre comment (install.jsx). Ce module ne fait que détecter : l'appareil,
// le navigateur, le mode installé, et garde l'événement « beforeinstallprompt » (Chrome, Edge, Samsung Internet) pour un
// vrai bouton « Installer ». Il est chargé au démarrage (boot.jsx) : l'événement arrive tôt, souvent avant l'écran titre.

let deferred = null; // l'événement gardé : il ne sert qu'une fois
let installed = false; // installé pendant cette visite (appinstalled)
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export const onInstallChange = (f) => { subs.add(f); return () => subs.delete(f); };

export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
}

// Essais (développement seulement) : ?appareil=ios, ios-chrome, ios-instagram, android, android-instagram, installe
const forced = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('appareil') : null;
const ua = () => navigator.userAgent || '';

export const isIOS = () => (forced ? forced.startsWith('ios') : /iP(hone|ad|od)/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isAndroid = () => (forced ? forced.startsWith('android') : /Android/i.test(ua()));
export const isStandalone = () => (forced ? forced === 'installe'
  : !!window.matchMedia?.('(display-mode: standalone)').matches || !!window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true);

// Navigateur intégré d'une application (Instagram, Facebook, TikTok, Snapchat, LinkedIn) : on n'y installe rien, et il
// garde ses propres données, à part du navigateur du téléphone.
export const inAppBrowser = () => (forced ? forced.endsWith('instagram')
  : /Instagram|FBAN|FBAV|FB_IAB|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp/i.test(ua()));

// 'safari' | 'chrome' | 'other' (iPhone et iPad)
export function iosBrowser() {
  if (forced) return forced === 'ios-chrome' ? 'chrome' : 'safari';
  if (/CriOS/.test(ua())) return 'chrome';
  if (/FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua())) return 'other';
  return 'safari';
}

// Ce qu'on peut proposer ici : 'ios', 'android', 'pc' (un ordinateur dont le navigateur sait installer), ou null (déjà
// installé, ou rien à proposer).
export function installKind() {
  if (installed || isStandalone()) return null;
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return deferred ? 'pc' : null;
}
export const canPrompt = () => !!deferred;

// La fenêtre d'installation du navigateur : 'accepted', 'dismissed' ou 'unavailable'
export async function promptInstall() {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  emit();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') { installed = true; emit(); }
    return outcome;
  } catch { return 'unavailable'; }
}

// Rappel : « Plus tard » le repousse de 3 jours, puis 7, puis 30 ; « Compris » d'un jour (le joueur l'installe sans doute
// tout de suite). Ouvert depuis les réglages, il s'affiche toujours.
const KEY = 'fo-installer';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch { /* stockage plein */ } };
const DAY = 24 * 3600 * 1000;
export function installDue(now = Date.now()) {
  const kind = installKind();
  if (kind !== 'ios' && kind !== 'android') return false; // la feuille ne s'invite qu'au téléphone et à la tablette
  const { later = 0 } = read();
  return now >= later;
}
export function installLater(soon = false, now = Date.now()) {
  if (soon) { write({ later: now + DAY }); return; }
  const n = (read().n || 0) + 1;
  write({ n, later: now + [3, 7, 30][Math.min(n, 3) - 1] * DAY });
}

// Première ouverture de l'app installée : la carte « Colle ta partie » ne revient plus une fois vue
const WELCOME = 'fo-app-accueil';
export const welcomeDue = () => { try { return isStandalone() && !localStorage.getItem(WELCOME); } catch { return false; } };
export const welcomeDone = () => { try { localStorage.setItem(WELCOME, '1'); } catch { /* stockage plein */ } };

// Ouvrir la feuille depuis n'importe où (réglages, notifications des championnats) : App écoute.
export const openInstall = () => window.dispatchEvent(new CustomEvent('fo-install'));
