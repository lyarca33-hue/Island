import { defineConfig, devices } from '@playwright/test';

// Test de fumée : le jeu se lance dans Chromium (sans écran, WebGL logiciel) et on y fait quelques gestes.
const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 600_000,
  expect: { timeout: 60_000 },
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 960, height: 600 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // WebGL sans carte graphique (SwiftShader)
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    // le jeu construit (comme en ligne), pas le serveur de dev qui peut recharger la page en plein test
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
