const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  webServer: {
    command: "python3 scripts/serve_local.py --port 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/ceo-salary-benchmark/",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: { executablePath: "/usr/bin/google-chrome" },
    viewport: { width: 1440, height: 900 },
  },
  reporter: "line",
});
