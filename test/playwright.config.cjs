// @ts-check
const { defineConfig } = require('@playwright/test');

const TEST_SERVER_PORT = 4173;
const TEST_SERVER_URL = `http://127.0.0.1:${TEST_SERVER_PORT}`;

module.exports = defineConfig({
  testDir: './browser',
  testMatch: '**/*.spec.cjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',

  use: {
    baseURL: TEST_SERVER_URL,
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
    command: `cd .. && mise exec -- bundle exec jekyll build --quiet && PORT=${TEST_SERVER_PORT} node test/browser/server.cjs`,
    url: TEST_SERVER_URL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
