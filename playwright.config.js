// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
    viewport: { width: 1920, height: 4000 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],

  webServer: {
    command: 'node tests/server.cjs',
    url: 'http://localhost:4000',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
