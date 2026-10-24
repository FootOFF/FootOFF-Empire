/* Service worker de FootOFF Empire (publié à la construction par le greffon de vite.config.js, qui remplit la version
   et la liste des fichiers de l'enveloppe). Trois caches :
   - l'enveloppe de la version (scripts, styles, page) : précachée à l'installation, servie d'abord ; une nouvelle
     version attend que le jeu lui dise de prendre la main (message SKIP_WAITING, bandeau « Nouvelle version ») ;
   - les ressources lourdes (modèles 3D, ciels, vignettes, végétation, icônes) : servies depuis le cache et rafraîchies
     en arrière-plan (elles gardent leur nom d'une version à l'autre) ;
   - les polices : de même.
   La page elle-même se demande d'abord au réseau, puis au cache : le jeu s'ouvre hors ligne après une première visite. */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const APP = `fo-app-${VERSION}`;
const STATIC = 'fo-static-v1';
const FONTS = 'fo-fonts-v1';
const scope = self.registration.scope;
const abs = (p) => new URL(p, scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL.map(abs))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fo-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

// ignoreVary : un script demandé avec crossorigin (en-tête Origin) doit retrouver la réponse précachée sans lui
const OPTS = { ignoreVary: true };
const staleWhileRevalidate = async (cacheName, req) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, OPTS);
  const fetching = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fetching) || Response.error();
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { // la page : réseau d'abord, cache ensuite (hors ligne)
    e.respondWith((async () => {
      try { const res = await fetch(req); const c = await caches.open(APP); c.put(abs('index.html'), res.clone()); return res; } catch {
        return (await caches.match(abs('index.html'), OPTS)) || (await caches.match(abs('./'), OPTS)) || Response.error();
      }
    })());
    return;
  }
  if (url.origin === location.origin) {
    if (url.pathname.includes('/assets/')) { // scripts et styles de la version (noms hachés) : cache d'abord
      e.respondWith(caches.match(req, OPTS).then((hit) => hit || fetch(req).then((res) => { if (res.ok) caches.open(APP).then((c) => c.put(req, res.clone())); return res; }).catch(() => Response.error())));
      return;
    }
    if (/\/(models|sky|ui|vegetation|icons)\/|\.(webmanifest|svg)$/.test(url.pathname)) { e.respondWith(staleWhileRevalidate(STATIC, req)); return; }
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(staleWhileRevalidate(FONTS, req));
});
