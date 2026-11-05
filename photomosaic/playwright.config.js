import { defineConfig } from '@playwright/test';

// Browser smoke test. Uses an existing @playwright/test install (npm ci here, or a
// node_modules link to another tool's) and serves the site root on port 4197.
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 90_000,
  expect: { timeout: 30_000 }, // the example reads 442 photos before its first mosaic
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4197/photomosaic/',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 -m http.server 4197 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:4197/photomosaic/',
    reuseExistingServer: true,
    stderr: 'ignore',
  },
});
