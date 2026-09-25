import { defineConfig, devices } from '@playwright/test'

// Browser tests for pages whose behaviour needs real layout (charts). They run
// against the Vite dev server with the API mocked per test (see e2e/*Mock.js),
// so no backend is needed.
const PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // The dev server compiles modules on first request, which can be slow while
  // several workers load the page at once.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 1000 },
    timezoneId: 'Africa/Dar_es_Salaam',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
