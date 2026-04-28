/**
 * Playwright config for parallel multi-user execution.
 *
 * Differences from main config:
 * - No globalSetup (no shared SSO login)
 * - No storageState (each process logs in independently as its bot user)
 * - Each spawned process uses this config via --config flag
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// Per-bot JSON report file: test-results/results-<botName>.json
const botName = process.env.PARALLEL_BOT_ACCOUNT || process.env.PARALLEL_BOT || 'unknown';
const jsonOutputFile = `test-results/results-${botName}.json`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: jsonOutputFile }],
    ['./src/reporters/tracking-sheet-reporter.ts'],
  ],
  timeout: 420_000, // 7 min — hire wizards take 3-4 min, server load can add latency
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.ORACLE_HCM_URL || 'https://placeholder.oraclecloud.com',
    headless: process.env.HEADLESS !== 'false',
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    // Use a real Chrome user-agent (Playwright's default includes "HeadlessChrome",
    // which Okta SAML uses to block the auto-redirect after IDCS authentication).
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  },
  projects: [
    {
      name: 'oracle-hcm',
      use: {
        ...devices['Desktop Chrome'],
        // Hide the automation flag (`navigator.webdriver`) — Okta uses it as a
        // signal to stop the SAML redirect chain in headless runs.
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
  ],
});
