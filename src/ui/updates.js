// Service worker (src/sw.js, publié par vite.config.js) : enregistré en production seulement. Quand une nouvelle version
// est prête (installée, en attente), on prévient le jeu par un événement « fo-update » (App : notification « Nouvelle
// version ») ; applyUpdate() lui dit de prendre la main, puis la page se recharge. On revérifie à chaque retour au
// premier plan et toutes les trente minutes : sur iPhone, l'app installée reste ouverte des jours.

let registration = null;
let reloading = false;
let wanted = false; // le joueur a demandé la nouvelle version : la page peut se recharger

export function registerUpdates() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const announce = (reg) => { if (reg.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('fo-update')); };
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
