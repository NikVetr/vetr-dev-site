const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: { executablePath: "/usr/bin/google-chrome" },
    viewport: { width: 1440, height: 900 },
  },
  reporter: "line",
});
