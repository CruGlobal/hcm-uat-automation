import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const authFile = path.resolve(__dirname, '.auth/storage-state.json');
const hasAuth = fs.existsSync(authFile);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Serial — Oracle HCM sessions conflict
  globalSetup: './tests/fixtures/global-setup.ts',
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    ['./src/reporters/tracking-sheet-reporter.ts'],
  ],
  timeout: 300_000,       // 5 min per test (multi-step Oracle wizards)
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.ORACLE_HCM_URL || 'https://placeholder.oraclecloud.com',
    headless: process.env.HEADLESS !== 'false',
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Reuse login session if available (created by global-setup.ts)
    ...(hasAuth ? { storageState: authFile } : {}),
  },

  projects: [
    {
      name: 'oracle-hcm',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
