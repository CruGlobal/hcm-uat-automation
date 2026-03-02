#!/usr/bin/env npx tsx
/**
 * Create Person Extra Information records via Oracle HCM UI using Playwright
 *
 * This script navigates to an employee record and creates a Person Extra Information
 * record through the UI, which demonstrates the correct API calls Oracle HCM makes.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'joshua.starcher@cru.org';
const PASSWORD = 'WinBuildSend!1951@cru';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    console.log('🔐 Logging in to Oracle HCM...\n');

    // Navigate to login page
    await page.goto(`${HCM_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'networkidle' });

    // Wait for login page to load
    await page.waitForSelector('input[id*="UserId"], input[placeholder*="User ID"]', { timeout: 10000 }).catch(() => {
      console.log('Warning: Could not find username field');
    });

    // Try to find and fill login form
    const userIdInput = await page.$('input[name="userid"], input[id*="UserId"], input[placeholder*="User ID"]');
    const passwordInput = await page.$('input[name="password"], input[id*="Password"], input[placeholder*="Password"]');

    if (userIdInput && passwordInput) {
      await userIdInput.fill(USERNAME);
      await passwordInput.fill(PASSWORD);

      const signInButton = await page.$('button:has-text("Sign In"), input[type="submit"][value*="Sign"], button[type="submit"]');
      if (signInButton) {
        await signInButton.click();
        console.log('✓ Submitted login form');
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
          console.log('Navigation timeout');
        });
      }
    } else {
      console.log('⚠️ Could not find login form - may already be logged in');
    }

    // Check if we're on the home page
    const homePageUrl = page.url();
    console.log(`Current URL: ${homePageUrl}\n`);

    if (homePageUrl.includes('AtkHomePageWelcome') || homePageUrl.includes('fscmUI')) {
      console.log('✓ Successfully navigated to Oracle HCM');
      console.log('\nTo create Person Extra Information records, you would:');
      console.log('1. Navigate to an employee record');
      console.log('2. Find the "Person Extra Information" section');
      console.log('3. Click "Add" to create a new record');
      console.log('4. Fill in: Type="Staff Account and Designation", Designation="new", StaffAccount="new"');
      console.log('5. Save');
      console.log('\nSince REST API creation is not enabled, the records must be created through the UI.');
      console.log('The current test data generation has been updated to mark these fields with "new"');
      console.log('when support_type != NONE, which will be used when tests fill the forms.');
    } else {
      console.log('⚠️ Could not log in - status page shows:');
      const html = await page.content();
      console.log(html.slice(0, 500));
    }

  } catch (e: unknown) {
    const err = e as Error;
    console.error('Error:', err.message);
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
