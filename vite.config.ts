import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le build s'ouvre aussi depuis un sous-dossier (aperçu en ligne, itch.io...)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: '0.0.0.0' },
});
