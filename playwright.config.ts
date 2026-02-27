import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Serial — Oracle HCM sessions conflict
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 120_000,       // 2 min per test
  expect: { timeout: 15_000 },

  globalSetup: './src/data/global-setup.ts',

  use: {
    baseURL: process.env.ORACLE_HCM_URL || 'https://placeholder.oraclecloud.com',
    headless: process.env.HEADLESS !== 'false',
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'oracle-hcm',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
