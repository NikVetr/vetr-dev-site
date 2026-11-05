import { defineConfig } from '@playwright/test';

// Browser smoke test. Uses an existing @playwright/test install (npm ci here, or a
// node_modules link to another tool's) and serves the site root on port 4187.
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 60_000,
  expect: { timeout: 20_000 }, // a run of the example takes a few seconds
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4187/crossword/',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 -m http.server 4187 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:4187/crossword/',
    reuseExistingServer: true,
    stderr: 'ignore',
  },
});
