import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : le build peut être servi depuis n'importe quel chemin (futur /empire sur footoff.media)
export default defineConfig({
  plugins: [react()],
  base: './',
});
