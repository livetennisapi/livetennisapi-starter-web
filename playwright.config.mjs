import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The web server builds the page twice: keyless, and with a placeholder key
// for the live-mode tests. Those tests answer every API call themselves, so
// no request ever reaches the real API and no real key is used.
export default defineConfig({
  testDir: 'test/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/build.mjs --keyless --outdir .e2e/keyless && node scripts/build.mjs --outdir .e2e/live && node scripts/serve.mjs .e2e ${PORT}`,
    url: `http://127.0.0.1:${PORT}/keyless/`,
    env: { LIVETENNISAPI_KEY: 'twjp_e2e_placeholder_not_a_key' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
