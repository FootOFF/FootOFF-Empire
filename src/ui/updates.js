// Service worker (src/sw.js, publié par vite.config.js) : enregistré en production seulement. Quand une nouvelle version
// est prête (installée, en attente), on prévient le jeu par un événement « fo-update » (App : notification « Nouvelle
// version ») ; applyUpdate() lui dit de prendre la main, puis la page se recharge. On revérifie à chaque retour au
// premier plan et toutes les trente minutes : sur iPhone, l'app installée reste ouverte des jours.
// La page se demande d'abord au réseau : relancé, le jeu tourne déjà la nouvelle version, alors que l'ancien service
// worker garde la main et que le nouveau attend (sur iPhone, fermer l'app ne le libère pas). Si la page en cours est
// déjà la version qui attend (son script principal et sa feuille de style figurent dans la liste de fichiers du service
// worker en attente), celui-ci prend la main sans bruit : plus de bandeau « Nouvelle version » à chaque lancement pour
// une version déjà là.

let registration = null;
let reloading = false;
let wanted = false; // le joueur a demandé la nouvelle version : la page peut se recharger

// Liste des fichiers de la version d'un service worker installé (null s'il ne répond pas : version d'avant ce dialogue).
const shellOf = (worker) => new Promise((resolve) => {
  const ch = new MessageChannel();
  const t = setTimeout(() => resolve(null), 3000);
  ch.port1.onmessage = (e) => { clearTimeout(t); resolve(Array.isArray(e.data) ? e.data : null); };
  try { worker.postMessage('SHELL', [ch.port2]); } catch { clearTimeout(t); resolve(null); }
});
// La page en cours est-elle cette version ? Son script principal et sa feuille de style (./assets/index-<empreinte>.js,
// .css : noms hachés) sont dans la liste.
const runsShell = (shell) => {
  const own = [...document.querySelectorAll('script[type="module"][src*="assets/"], link[rel="stylesheet"][href*="assets/"]')]
    .map((el) => new URL(el.src || el.href).pathname.split('/').pop());
  return own.length > 0 && own.every((file) => shell.some((f) => f.endsWith(`/${file}`)));
};

export function registerUpdates() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const announce = async (reg) => {
    const w = reg.waiting;
    if (!w || !navigator.serviceWorker.controller) return;
    const shell = await shellOf(w);
    if (shell && runsShell(shell)) { w.postMessage('SKIP_WAITING'); return; } // déjà la bonne version : il suit, sans bandeau
    window.dispatchEvent(new CustomEvent('fo-update'));
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    registration = reg;
    announce(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') announce(reg); });
    });
    const check = () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', check);
    setInterval(check, 30 * 60 * 1000);
  }).catch((e) => console.warn('[maj] service worker refusé', e));
  // à la toute première installation, le service worker prend la page sans la recharger ; ensuite, seule une mise à
  // jour demandée par le joueur recharge
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wanted && !reloading) { reloading = true; window.location.reload(); } });
}

// Une nouvelle version attend : elle prend la main, la page se recharge (controllerchange).
export function applyUpdate() {
  wanted = true;
  const w = registration?.waiting;
  if (w) w.postMessage('SKIP_WAITING'); else window.location.reload();
}
