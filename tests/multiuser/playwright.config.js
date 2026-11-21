import { defineConfig } from '@playwright/test';
import process from 'node:process';

const port = process.env.NEWGLASS_BROWSER_PORT ?? '5189';
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: '.',
  workers: 1,
  forbidOnly: true,
  timeout: 140_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: '../../test-results/multiuser-' + (process.env.NEWGLASS_BROWSER_CAPACITY ?? 'mock'),
  use: { baseURL, browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    viewport: { width: 1440, height: 980 }, serviceWorkers: 'block' },
  webServer: { cwd: process.cwd(),
    command: 'npm run dev -- --host 127.0.0.1 --port ' + port + ' --strictPort',
    url: baseURL, reuseExistingServer: false,
    env: { VITE_API_URL: '/', VITE_OPTIMIZATION_MODE: 'distributed' }, timeout: 35_000 },
});
