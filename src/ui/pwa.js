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

// La feuille s'invite à chaque visite au téléphone et à la tablette tant que le jeu n'est pas installé (1.0.36, PDG :
// « je veux recommander absolument d'installer l'app ») ; « Plus tard » ne la ferme que pour cette visite (App). Sur
// ordinateur, elle ne s'ouvre que depuis les réglages ou le menu de l'écran titre.
export function installDue() {
  const kind = installKind();
  return kind === 'ios' || kind === 'android';
}

// Ouvrir la feuille depuis n'importe où (réglages, notifications des championnats) : App écoute.
export const openInstall = () => window.dispatchEvent(new CustomEvent('fo-install'));
