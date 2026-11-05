import { defineConfig } from '@playwright/test';

// Browser smoke test. Uses an existing @playwright/test install (npm ci here, or a
// node_modules link to another tool's) and serves the site root on port 4193.
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 60_000,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4193/hypercube/',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 -m http.server 4193 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:4193/hypercube/',
    reuseExistingServer: true,
    stderr: 'ignore',
  },
});
