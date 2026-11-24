// Ejecutar desde la raíz del frontend:
//   npx playwright test -c docs/evidence/sprint-02/EN-CONC-001-QA-frontend/scripts/qa.playwright.config.js
// QA_MODE=historico|distribuido. Vite usa VITE_API_URL=/ y la prueba reenvía /api al backend de loopback.
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.env.QA_MODE ?? 'historico';
const port = mode === 'distribuido' ? '5192' : '5191';
const frontend = fileURLToPath(new URL('../../../../../', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'qa-ui.spec.js',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: path.join(frontend, 'test-results', `qa-en-conc-001-${mode}`),
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium', serviceWorkers: 'block', trace: 'off' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { cwd: frontend, command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60_000,
    env: { VITE_API_URL: '/', ...(mode === 'distribuido' && { VITE_OPTIMIZATION_MODE: 'distributed' }) } },
});
