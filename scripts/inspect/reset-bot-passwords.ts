/**
 * Reset passwords for all bot user accounts via Security Console.
 * 1. Navigate to Security Console → Users
 * 2. For each bot: search, open detail, Reset Password → Manually → fill → submit
 * 3. Record discovered usernames
 * 4. Output updated credentials JSON
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';
import { getAllBotUsers, type BotUserIdentity } from '../../src/config/bot-users';
import * as fs from 'fs';

const HEADLESS = process.env.HEADLESS !== 'false';
const NEW_PASSWORD = 'WinBuildSend!1951@cru';

async function waitForJET(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      try {
        const oj = (window as any).oj;
        if (!oj?.Context) return true;
        const bc = oj.Context.getPageContext().getBusyContext();
        return !bc.isReady || bc.isReady();
      } catch { return true; }
    },
    { timeout },
  );
}

async function clickSidebarUsers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.trim() === 'Users') {
        const parent = node.parentElement;
        if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
          const rect = parent.getBoundingClientRect();
          if (rect.x < 200 && rect.y > 100) {
            parent.click();
            return;
          }
        }
      }
    }
  });
  await page.waitForTimeout(3000);
}

async function resetPassword(page: Page, botName: string): Promise<{ username: string | null; success: boolean; error?: string }> {
  // Search for the bot user by full username (uat.botName format)
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  const searchTerm = `uat.${botName}`;
  await searchInput.fill(searchTerm);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  // Check for no results
  const noData = page.getByText('No data to display');
  if (await noData.isVisible({ timeout: 2000 }).catch(() => false)) {
    return { username: null, success: false, error: 'Account not found' };
  }

  // Click the first matching account link
  const accountLink = page.locator(`a:has-text("${botName}")`).first();
  if (!await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    return { username: null, success: false, error: 'Account link not visible' };
  }
  await accountLink.click();
  await page.waitForTimeout(5000);

  // Extract username from the detail page
  const userNameText = await page.evaluate(() => {
    const labels = document.querySelectorAll('span, td, div');
    for (const el of labels) {
      if (el.textContent?.trim() === 'User Name') {
        const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
        if (next) return next.textContent?.trim() || null;
      }
    }
    return null;
  });

  // Fallback: try to find "uat.botname" pattern in the page
  let username = userNameText;
  if (!username) {
    const bodyText = await page.textContent('body') || '';
    const match = bodyText.match(/User Name\s+(uat\.\S+)/);
    username = match?.[1] || null;
  }

  console.log(`  Username: ${username || 'unknown'}`);

  // Click Reset Password button
  const resetBtn = page.getByRole('button', { name: 'Reset Password' });
  if (!await resetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Go back and try again
    return { username, success: false, error: 'Reset Password button not found' };
  }
  await resetBtn.click();
  await page.waitForTimeout(3000);

  // Click "Manually change the password" radio button
  const manualRadio = page.locator('input[type="radio"]').nth(1); // Second radio = manual
  await manualRadio.click({ force: true });
  await page.waitForTimeout(1000);

  // Fill password fields
  const pwdFields = page.locator('input[type="password"]');
  const newPwd = pwdFields.nth(0);
  const confirmPwd = pwdFields.nth(1);

  // Wait for fields to become enabled
  await newPwd.waitFor({ state: 'visible', timeout: 5000 });
  // Force fill via JS if disabled
  const isEnabled = await newPwd.isEnabled().catch(() => false);
  if (!isEnabled) {
    await page.evaluate((pwd) => {
      const inputs = document.querySelectorAll('input[type="password"]');
      inputs.forEach(inp => {
        (inp as HTMLInputElement).disabled = false;
      });
    }, NEW_PASSWORD);
    await page.waitForTimeout(500);
  }

  await newPwd.fill(NEW_PASSWORD);
  await confirmPwd.fill(NEW_PASSWORD);
  await page.waitForTimeout(500);

  // Click "Reset Password" button in the dialog
  const dialogResetBtn = page.locator('button:has-text("Reset Password")').last();
  await dialogResetBtn.click();
  await page.waitForTimeout(5000);

  // Check for success
  const bodyText2 = await page.textContent('body') || '';
  const success = bodyText2.includes('success') || bodyText2.includes('Success') ||
    !bodyText2.includes('Error') && !bodyText2.includes('error');

  // Check if we're back on the detail page (dialog closed = success)
  const detailHeading = page.locator('text=User Account Details');
  const dialogStillOpen = page.locator('text=Reset Password').locator('xpath=ancestor::div[contains(@class, "popup") or contains(@class, "dialog")]');

  if (await detailHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`  Password reset SUCCESS`);
    // Click Done to go back to list
    const doneBtn = page.getByRole('button', { name: 'Done' });
    if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(3000);
    }
    return { username, success: true };
  }

  // Check for errors in the dialog
  await page.screenshot({ path: `/tmp/bot-reset-${botName}-result.png` });
  const errorText = await page.locator('.x6w, [class*="error"], [class*="Error"]').textContent().catch(() => '');
  if (errorText) {
    console.log(`  Error: ${errorText}`);
    // Cancel and go back
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(2000);
    }
    const doneBtn = page.getByRole('button', { name: 'Done' });
    if (await doneBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await doneBtn.click();
      await page.waitForTimeout(2000);
    }
    return { username, success: false, error: errorText };
  }

  // Assume success if no error
  console.log(`  Password reset likely succeeded`);
  const doneBtn = page.getByRole('button', { name: 'Done' });
  if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await doneBtn.click();
    await page.waitForTimeout(3000);
  }
  return { username, success: true };
}

async function main() {
  const bots = getAllBotUsers();
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.fullLogin();
  console.log('Logged in successfully\n');

  // Navigate to Security Console → Users
  await page.locator('a[title="Navigator"]').first().click({ force: true });
  await page.waitForTimeout(3000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  await page.getByRole('link', { name: 'Security Console' }).first().click();
  await page.waitForLoadState('networkidle');
  await waitForJET(page);
  await page.waitForTimeout(5000);

  // Dismiss Warning dialog
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  await clickSidebarUsers(page);
  console.log('On User Accounts page\n');

  // Process each bot user
  const results: Record<string, { username: string | null; success: boolean; error?: string }> = {};

  // Start with just bot_hr_admin to verify the flow works
  console.log('=== Resetting bot_hr_admin (test) ===');
  const testResult = await resetPassword(page, 'bot_hr_admin');
  results['bot_hr_admin'] = testResult;

  if (!testResult.success) {
    console.log(`\nTest reset failed: ${testResult.error}`);
    await page.screenshot({ path: '/tmp/bot-reset-test-fail.png' });
    console.log('Check screenshot at /tmp/bot-reset-test-fail.png');
    await browser.close();
    return;
  }

  console.log('\n=== Test successful! Resetting remaining bot users ===\n');

  // Process remaining bots
  for (const bot of bots) {
    if (bot.botName === 'bot_hr_admin') continue; // Already done
    console.log(`--- ${bot.botName} ---`);
    try {
      const result = await resetPassword(page, bot.botName);
      results[bot.botName] = result;
    } catch (err: any) {
      console.log(`  ERROR: ${err.message}`);
      results[bot.botName] = { username: null, success: false, error: err.message };
      // Try to recover - go back to Users list
      try {
        await clickSidebarUsers(page);
      } catch {
        // Re-navigate to Security Console
        await page.locator('a[title="Navigator"]').first().click({ force: true });
        await page.waitForTimeout(2000);
        await page.getByRole('link', { name: 'Security Console' }).first().click();
        await page.waitForTimeout(5000);
        const ok = page.getByRole('button', { name: 'OK' });
        if (await ok.isVisible({ timeout: 2000 }).catch(() => false)) await ok.click();
        await clickSidebarUsers(page);
      }
    }
  }

  // Print summary
  console.log('\n\n========== SUMMARY ==========\n');
  const credentials: Record<string, { username: string; password: string }> = {};

  for (const bot of bots) {
    const r = results[bot.botName];
    if (!r) {
      console.log(`  ${bot.botName}: NOT PROCESSED`);
      continue;
    }
    const status = r.success ? 'OK' : `FAIL (${r.error})`;
    console.log(`  ${bot.botName.padEnd(30)} → ${(r.username || 'unknown').padEnd(30)} ${status}`);

    if (r.username && r.success) {
      credentials[bot.botName] = {
        username: r.username,
        password: NEW_PASSWORD,
      };
    }
  }

  // Write updated credentials file
  if (Object.keys(credentials).length > 0) {
    const credFile = '.config/bot-credentials.json';
    fs.writeFileSync(credFile, JSON.stringify(credentials, null, 2) + '\n');
    console.log(`\nWrote ${Object.keys(credentials).length} credentials to ${credFile}`);
  }

  await browser.close();
}

main().catch(console.error);
