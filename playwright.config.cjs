const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/layout',
  outputDir: '.tmp/layout-test-results',
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:3107', launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),
  }},
  webServer: {command: 'node tests/layout/server.cjs', url: 'http://127.0.0.1:3107', reuseExistingServer: false},
});
