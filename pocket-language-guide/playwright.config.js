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
    viewport: { width: 1680, height: 1000 },
  },
  // Chrome is the suite; WebKit is the engine every iPhone runs and the one this
  // suite never saw. `npm run test:webkit` runs the smoke set in it where the host
  // can launch it (Playwright's WebKit needs system libraries a bare machine may
  // lack -- `npx playwright install-deps webkit`); the default run stays Chrome.
  projects: [
    {
      name: 'chromium',
      use: { launchOptions: { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' } },
    },
    // Only when asked for, so a plain `npx playwright test` on a host without the
    // libraries is not a run that half fails before it starts.
    ...(process.env.WEBKIT ? [{
      name: 'webkit',
      use: { browserName: 'webkit' },
      grep: /@smoke/,
    }] : []),
  ],
  webServer: {
    command: `npx http-server . -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
