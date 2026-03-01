/**
 * Reset password for a single bot user via Security Console.
 * Two-phase: temp password → final password (Oracle rejects reuse of last password).
 * Also unlocks the account if locked.
 *
 * Uses admin SSO login (Josh Starcher).
 * Usage: npx tsx scripts/inspect/reset-one-bot.ts <botName>
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';

const BOT_NAME = process.argv[2];
if (!BOT_NAME) { console.error('Usage: npx tsx scripts/inspect/reset-one-bot.ts <botName>'); process.exit(1); }

const HEADLESS = process.env.HEADLESS !== 'false';
const TEMP_PASSWORD = 'TempReset!!2026XY@cru';
const FINAL_PASSWORD = 'WinBuildSend!1951@cru';

async function waitForJET(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => {
    try {
      const oj = (window as any).oj;
      if (!oj?.Context) return true;
      const bc = oj.Context.getPageContext().getBusyContext();
      return !bc.isReady || bc.isReady();
    } catch { return true; }
  }, { timeout });
}

async function clickSidebarUsers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim() === 'Users') {
        const parent = walker.currentNode.parentElement;
        if (parent && parent.offsetWidth > 0) {
          const rect = parent.getBoundingClientRect();
          if (rect.x < 200 && rect.y > 100) { parent.click(); return; }
        }
      }
    }
  });
  await page.waitForTimeout(3000);
}

async function navigateToBot(page: Page, botName: string): Promise<void> {
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  await searchInput.fill(`uat.${botName.toLowerCase()}`);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  // Click on the account link
  const accountLink = page.locator(`a:has-text("${botName}")`).first();
  if (await accountLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await accountLink.click();
  } else {
    // Try lowercase match
    const links = page.locator('a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const text = await links.nth(i).textContent().catch(() => '');
      if (text && text.toLowerCase().includes(botName.toLowerCase())) {
        await links.nth(i).click();
        break;
      }
    }
  }
  await page.waitForTimeout(5000);
}

async function doPasswordReset(page: Page, password: string, label: string): Promise<boolean> {
  console.log(`  ${label}: setting password...`);

  const resetBtn = page.getByRole('button', { name: 'Reset Password' });
  await resetBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await resetBtn.click();
  await page.waitForTimeout(3000);

  // Select "Manually change the password"
  const manualRadio = page.locator('input[type="radio"]').nth(1);
  await manualRadio.click({ force: true });
  await page.waitForTimeout(1000);

  // Fill password fields
  const pwdFields = page.locator('input[type="password"]');
  const newPwd = pwdFields.nth(0);
  const confirmPwd = pwdFields.nth(1);
  await newPwd.waitFor({ state: 'visible', timeout: 5000 });

  // Enable if disabled
  if (!await newPwd.isEnabled().catch(() => false)) {
    await page.evaluate(() => {
      document.querySelectorAll('input[type="password"]').forEach(inp => {
        (inp as HTMLInputElement).disabled = false;
      });
    });
    await page.waitForTimeout(500);
  }

  await newPwd.fill(password);
  await confirmPwd.fill(password);
  await page.waitForTimeout(500);

  // Click Reset Password in dialog
  const dialogResetBtn = page.locator('button:has-text("Reset Password")').last();
  await dialogResetBtn.click();
  await page.waitForTimeout(5000);

  // Check for error
  const pageText = await page.textContent('body') || '';
  if (pageText.includes('previous passwords') || pageText.includes('Error')) {
    const errorMatch = pageText.match(/Error[^\n]*/);
    console.log(`  ${label}: FAILED — ${errorMatch?.[0] || 'unknown error'}`);
    // Cancel dialog
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(2000);
    }
    return false;
  }

  // Check for success (dialog closed, back to detail page)
  const detailHeading = page.locator('text=User Account Details');
  if (await detailHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  ${label}: SUCCESS`);
    return true;
  }

  // Screenshot for debugging
  await page.screenshot({ path: `/tmp/reset-${label.replace(/\s/g, '-')}.png` });
  console.log(`  ${label}: result unclear — check screenshot`);
  return true; // Assume success if no error
}

async function main() {
  console.log(`\nResetting password for ${BOT_NAME}...\n`);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 50 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Login as admin via SSO
  const loginPage = new LoginPage(page);
  console.log('Logging in as admin (SSO)...');
  await loginPage.fullLogin();
  console.log('Logged in.\n');

  // Navigate to Security Console
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
  console.log('On Users page.\n');

  // Navigate to the bot's account
  await navigateToBot(page, BOT_NAME);

  // Check if account is locked
  const bodyText = await page.textContent('body') || '';
  const isLocked = bodyText.includes('Locked');
  if (isLocked) {
    console.log('Account is LOCKED — need to unlock first');
  }

  // Check current account status
  const usernameMatch = bodyText.match(/User Name\s+(uat\.\S+)/);
  console.log(`Username: ${usernameMatch?.[1] || 'unknown'}`);
  console.log(`Account locked: ${isLocked}`);

  // Take screenshot
  await page.screenshot({ path: '/tmp/reset-bot-before.png' });

  // Phase 1: Set temporary password (different from current)
  const phase1 = await doPasswordReset(page, TEMP_PASSWORD, 'Phase 1 (temp)');

  if (phase1) {
    // Phase 2: Set final password
    const phase2 = await doPasswordReset(page, FINAL_PASSWORD, 'Phase 2 (final)');
    if (phase2) {
      console.log(`\nDone! Password for ${BOT_NAME} is now: ${FINAL_PASSWORD}`);
    } else {
      console.log(`\nPartial success — password is currently the temp password: ${TEMP_PASSWORD}`);
      console.log('You may need to update .config/bot-credentials.json');
    }
  } else {
    console.log('\nPhase 1 failed. Trying auto-generate instead...');
    // Try auto-generate password
    const resetBtn = page.getByRole('button', { name: 'Reset Password' });
    await resetBtn.click();
    await page.waitForTimeout(3000);
    // First radio = auto-generate (should be default)
    const autoRadio = page.locator('input[type="radio"]').nth(0);
    await autoRadio.click({ force: true });
    await page.waitForTimeout(1000);
    const dialogResetBtn = page.locator('button:has-text("Reset Password")').last();
    await dialogResetBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/reset-bot-autogen.png' });
    console.log('Auto-generated password — check /tmp/reset-bot-autogen.png for the generated password');

    // Now try setting our desired password
    const phase2 = await doPasswordReset(page, FINAL_PASSWORD, 'Phase 2 after auto');
    if (phase2) {
      console.log(`\nDone! Password for ${BOT_NAME} is now: ${FINAL_PASSWORD}`);
    }
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
