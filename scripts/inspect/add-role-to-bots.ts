/**
 * Add "Application Implementation Consultant" role to all bot users
 * via Security Console UI automation.
 */
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TOTP } from 'otpauth';

const ENV_PATH = '/home/ai/htdocs/hcm-uat-automation/.env';
const CREDS_PATH = '/home/ai/htdocs/hcm-uat-automation/.config/bot-credentials.json';
const ROLE_NAME = 'Application Implementation Consultant';

// Load .env
const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^(\w+)=(.+)$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
const botNames = Object.keys(creds).sort();

async function waitForJET(page: any, timeout = 30000) {
  await page.waitForFunction(() => {
    try {
      const oj = (window as any).oj;
      if (!oj?.Context) return true;
      const bc = oj.Context.getPageContext().getBusyContext();
      return !bc.isReady || bc.isReady();
    } catch { return true; }
  }, { timeout });
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 30 });
  const page = await browser.newPage({ baseURL: env.ORACLE_HCM_URL });

  // SSO login (the SSO user has IT Security Manager → Security Console access)
  console.log('Logging in via Okta SSO...');
  await page.goto(env.ORACLE_HCM_URL + '/fscmUI/faces/AtkHomePageWelcome', { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Click Company Single Sign-On
  const ssoBtn = page.locator('#ssoBtn');
  if (await ssoBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await ssoBtn.click();
    await page.waitForTimeout(5000);
  }

  // Okta username
  const usernameField = page.locator('input[name="identifier"]');
  if (await usernameField.isVisible({ timeout: 15000 }).catch(() => false)) {
    await usernameField.fill(env.ORACLE_HCM_USERNAME);
    await page.locator('input[type="submit"]').click();
    await page.waitForTimeout(5000);
  }

  // Okta password
  const passwordField = page.locator('input[name="credentials.passcode"]');
  if (await passwordField.isVisible({ timeout: 15000 }).catch(() => false)) {
    await passwordField.fill(env.ORACLE_HCM_PASSWORD);
    await page.locator('input[type="submit"]').click();
    await page.waitForTimeout(5000);
  }

  // MFA - may show security method selection first
  // Old flow: Google Authenticator link → TOTP code
  // New flow: "Verify it's you" page → select "Password" → enter TOTP code
  const gaLink = page.locator('a[aria-label*="Google Authenticator"]');
  const passwordSelect = page.locator('button:has-text("Select")').nth(1); // "Password" option's Select button

  if (await gaLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Old flow: Click Google Authenticator
    await gaLink.click();
    await page.waitForTimeout(5000);
  } else if (await page.getByText('Verify it\'s you with a security method').isVisible({ timeout: 5000 }).catch(() => false)) {
    // New flow: Select "Password" method (which allows TOTP)
    console.log('New Okta MFA flow detected — selecting Password method');
    // Find the "Select" button next to "Password"
    const pwdRow = page.locator('div:has(> div:has-text("Password")) button:has-text("Select")').first();
    if (await pwdRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pwdRow.click();
    } else {
      // Try clicking the second "Select" button (Password is usually second option)
      await passwordSelect.click();
    }
    await page.waitForTimeout(5000);
  }

  // TOTP code
  const mfaField = page.locator('input[name="credentials.passcode"], input[type="password"]').first();
  if (await mfaField.isVisible({ timeout: 15000 }).catch(() => false)) {
    const totp = new TOTP({ secret: env.OKTA_TOTP_SECRET });
    const code = totp.generate();
    console.log('Entering TOTP code...');
    await mfaField.fill(code);
    await page.locator('input[type="submit"], button[type="submit"]').first().click();
  }

  // Wait for login with generous timeout
  try {
    await page.waitForURL('**/fscmUI/**', { timeout: 120000 });
    console.log('Logged in');
  } catch {
    await page.screenshot({ path: '/tmp/sso-login-fail.png', fullPage: true });
    console.log('Login URL:', page.url());
    throw new Error('SSO login timed out');
  }
  await page.waitForTimeout(5000);

  // Navigate to Security Console
  await page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=_SECURITY_CONSOLE', { timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dismiss warning dialog
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  // Take screenshot to see Security Console state
  await page.screenshot({ path: '/tmp/security-console.png', fullPage: true });
  console.log('Security Console URL:', page.url());

  // Click Users in sidebar — use JS evaluation for reliability
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim() === 'Users') {
        const parent = walker.currentNode.parentElement;
        if (parent && parent.offsetWidth > 0) {
          parent.click();
          return;
        }
      }
    }
  });
  await page.waitForTimeout(5000);
  await waitForJET(page);

  // Verify we're on Users page
  const searchBox = page.locator('input[placeholder*="3 or more"], input[placeholder*="Search"]').first();
  if (!await searchBox.isVisible({ timeout: 10000 }).catch(() => false)) {
    // Try clicking "User Accounts" link directly
    const userAccounts = page.locator('a:has-text("User Accounts"), span:has-text("User Accounts")').first();
    if (await userAccounts.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userAccounts.click();
      await page.waitForTimeout(5000);
    } else {
      // Screenshot and continue anyway
      await page.screenshot({ path: '/tmp/security-console-users-fail.png', fullPage: true });
      console.log('WARNING: Could not navigate to Users page, will try anyway');
    }
  }
  console.log('On Users page');

  let added = 0, skipped = 0, failed = 0;

  for (const botName of botNames) {
    const username = `uat.${botName}`;
    try {
      // Search for user
      const searchBox = page.locator('input[placeholder*="3 or more"], input[placeholder*="Search"]').first();
      await searchBox.clear();
      await searchBox.fill(username);
      await searchBox.press('Enter');
      await page.waitForTimeout(5000);

      // Check if found
      const noData = page.getByText('No data to display');
      if (await noData.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`  SKIP ${username} — not found`);
        failed++;
        continue;
      }

      // Click user link
      const userLink = page.locator(`a:has-text("${username}"), a:has-text("${botName}")`).first();
      if (!await userLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Try first link in results
        const firstLink = page.locator('td a').first();
        if (await firstLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstLink.click();
        } else {
          console.log(`  SKIP ${username} — can't click`);
          failed++;
          continue;
        }
      } else {
        await userLink.click();
      }
      await page.waitForTimeout(5000);
      await waitForJET(page);

      // Click Roles tab
      const rolesTab = page.locator('a:has-text("Roles"), span:has-text("Roles")').first();
      await rolesTab.click({ force: true });
      await page.waitForTimeout(3000);

      // Check if role already assigned
      const hasRole = await page.getByText(ROLE_NAME).isVisible({ timeout: 3000 }).catch(() => false);
      if (hasRole) {
        console.log(`  SKIP ${username} — already has role`);
        skipped++;
        // Go back to user list
        const doneBtn = page.getByRole('button', { name: 'Done' });
        if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await doneBtn.click();
          await page.waitForTimeout(3000);
        }
        continue;
      }

      // Click "Add Role"
      const addRoleBtn = page.getByRole('button', { name: 'Add Role' });
      if (!await addRoleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`  FAIL ${username} — Add Role button not found`);
        failed++;
        const doneBtn = page.getByRole('button', { name: 'Done' });
        await doneBtn.click().catch(() => {});
        await page.waitForTimeout(3000);
        continue;
      }
      await addRoleBtn.click();
      await page.waitForTimeout(3000);

      // Search for role in dialog
      const roleSearch = page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').last();
      await roleSearch.clear();
      await roleSearch.fill(ROLE_NAME);
      await roleSearch.press('Enter');
      await page.waitForTimeout(5000);

      // Select the role (checkbox or click)
      const roleRow = page.getByText(ROLE_NAME, { exact: true }).first();
      if (await roleRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleRow.click();
        await page.waitForTimeout(1000);
      }

      // Click "Add Role Membership" or "Done" in dialog
      const addMembershipBtn = page.getByRole('button', { name: /Add Role Membership|OK|Done/i }).first();
      if (await addMembershipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addMembershipBtn.click();
        await page.waitForTimeout(3000);
      }

      console.log(`  OK   ${username} — role added`);
      added++;

      // Go back to user list
      const doneBtn = page.getByRole('button', { name: 'Done' });
      if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await doneBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch (err: any) {
      console.log(`  FAIL ${username} — ${err.message?.substring(0, 80)}`);
      failed++;
      // Try to get back to user list
      await page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=_SECURITY_CONSOLE', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const okBtn2 = page.getByRole('button', { name: 'OK' });
      if (await okBtn2.isVisible({ timeout: 2000 }).catch(() => false)) await okBtn2.click();
      await page.waitForTimeout(2000);
      const usersLink2 = page.locator('text=Users').first();
      await usersLink2.click({ force: true }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  console.log(`\nDone: ${botNames.length} total, ${added} added, ${skipped} already had role, ${failed} failed`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
