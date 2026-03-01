/**
 * Global setup: Log in to Oracle HCM once and save the session state.
 * All subsequent tests reuse this session, avoiding repeated Okta MFA
 * and preventing rate limiting ("Too many attempts").
 *
 * The saved state includes cookies and localStorage from after a successful login.
 * Each test starts with this state pre-loaded, so it's already authenticated.
 */
import { chromium, type FullConfig } from '@playwright/test';
import { LoginPage } from '../../src/pages/login.page';
import { isMultiUserEnabled, configuredBotCount } from '../../src/config/bot-users';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_STATE_PATH = path.resolve(__dirname, '../../.auth/storage-state.json');

async function globalSetup(config: FullConfig) {
  // Log multi-user mode status
  if (isMultiUserEnabled()) {
    console.log(`[GlobalSetup] Multi-user mode: ${configuredBotCount()} bot users with credentials`);
  } else {
    console.log('[GlobalSetup] Single-user mode (no bot credentials configured)');
  }

  const baseURL = process.env.ORACLE_HCM_URL || 'https://placeholder.oraclecloud.com';

  // Check if we have a recent valid session (< 2 hours old)
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    const stat = fs.statSync(STORAGE_STATE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    const twoHoursMs = 2 * 60 * 60 * 1000;

    if (ageMs < twoHoursMs) {
      console.log(`[GlobalSetup] Reusing existing session (${Math.round(ageMs / 60000)}min old)`);

      // Verify the session is still valid by trying to load HCM
      const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
      const context = await browser.newContext({
        storageState: STORAGE_STATE_PATH,
        baseURL,
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      try {
        await page.goto('/', { timeout: 30_000 });
        // Check if we're redirected to HCM (session valid) or login page (expired)
        await page.waitForTimeout(5000);
        if (page.url().includes('fscmUI')) {
          console.log('[GlobalSetup] Existing session is still valid');
          await page.close();
          await context.close();
          await browser.close();
          return;
        }
      } catch {
        // Session expired, re-login below
      }

      await page.close();
      await context.close();
      await browser.close();
      console.log('[GlobalSetup] Existing session expired, re-authenticating...');
    }
  }

  // Create .auth directory if needed
  const authDir = path.dirname(STORAGE_STATE_PATH);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Launch browser and log in
  console.log('[GlobalSetup] Logging in to Oracle HCM...');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.fullLogin();

  // Wait for HCM to fully load
  await page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
  await page.waitForTimeout(5000);

  // Save storage state (cookies + localStorage)
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`[GlobalSetup] Session saved to ${STORAGE_STATE_PATH}`);

  await page.close();
  await context.close();
  await browser.close();
}

export default globalSetup;
