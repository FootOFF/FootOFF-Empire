import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Service worker : src/sw.js est publié tel quel sous sw.js, avec la liste des fichiers de la version (scripts, styles,
// page) et une empreinte de cette liste comme numéro de version du cache (un déploiement sans changement garde son cache).
function serviceWorker() {
  return {
    name: 'footoff-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const shell = ['./', './index.html', ...Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f) && !/draco|basis/.test(f)).map((f) => `./${f}`)];
      const version = createHash('sha1').update(shell.join('\n')).digest('hex').slice(0, 10);
      const src = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8').replaceAll('__VERSION__', version).replaceAll('__SHELL__', JSON.stringify(shell));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// base './' : le build peut être servi depuis n'importe quel chemin (footoff.media/footoffempire/, GitHub Pages)
export default defineConfig({
  plugins: [react(), serviceWorker()],
  base: './',
  // championnats entre amis en développement : le serveur des ligues du site lancé en local (next dev -p 3130), servi
  // sous la même origine que le jeu, comme en ligne (www.footoff.media/api/ligue)
  server: { proxy: { '/api/ligue': 'http://localhost:3130' } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
});
