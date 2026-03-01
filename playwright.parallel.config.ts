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

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
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
  },
  projects: [
    { name: 'oracle-hcm', use: { ...devices['Desktop Chrome'] } },
  ],
});
