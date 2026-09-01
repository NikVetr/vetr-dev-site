// Playwright config. Uses the system Chrome rather than a downloaded browser,
// matching ceo-salary-benchmark/tests/app.spec.js, and serves the app with the
// same http-server the `serve` script uses.
import { defineConfig } from '@playwright/test';

const PORT = 8097;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 180_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' },
    viewport: { width: 1680, height: 1000 },
  },
  webServer: {
    command: `npx http-server . -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
