/**
 * Find the 2 missing bot user accounts and the @cru.org format one.
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';

const HEADLESS = process.env.HEADLESS !== 'false';
const PASSWORD = 'WinBuildSend!1951@cru';

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
          if (rect.x < 200 && rect.y > 100) { parent.click(); return; }
        }
      }
    }
  });
  await page.waitForTimeout(3000);
}

async function searchAndReport(page: Page, term: string): Promise<void> {
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  await searchInput.fill(term);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  const noData = page.getByText('No data to display');
  if (await noData.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`  "${term}": No results`);
  } else {
    // Extract User Name from page text
    const bodyText = await page.textContent('body') || '';
    const regex = /User Name\s+(\S+)/g;
    let match;
    const usernames: string[] = [];
    while ((match = regex.exec(bodyText)) !== null) {
      if (match[1].includes('uat') || match[1].includes('bot') || match[1].includes('Bot')) {
        usernames.push(match[1]);
      }
    }
    console.log(`  "${term}": Found ${usernames.length} accounts: ${usernames.join(', ')}`);
    await page.screenshot({ path: `/tmp/bot-search-${term.replace(/[.\s@]/g, '_')}.png` });
  }
}

async function main() {
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
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }
  await clickSidebarUsers(page);
  console.log('On User Accounts page\n');

  // Search for the 2 missing accounts with different variations
  console.log('=== Searching for bot_payroll_spec ===');
  await searchAndReport(page, 'uat.bot_payroll_spec');
  await searchAndReport(page, 'payroll_spec');
  await searchAndReport(page, 'uat.bot_payroll');
  await searchAndReport(page, 'bot_payroll');

  console.log('\n=== Searching for bot_comp_comm_approver ===');
  await searchAndReport(page, 'uat.bot_comp_comm_approver');
  await searchAndReport(page, 'comp_comm');
  await searchAndReport(page, 'uat.bot_comp');
  await searchAndReport(page, 'uat.bot_comp_comm');

  // Also verify the @cru.org format account works
  console.log('\n=== Testing @cru.org format login ===');
  await browser.close();

  // Test the @cru.org username
  const browser2 = await chromium.launch({ headless: HEADLESS });
  const ctx2 = await browser2.newContext({ baseURL: env.oracle.url, viewport: { width: 1280, height: 720 } });
  const page2 = await ctx2.newPage();

  console.log('Testing uat.bot_hr_generalist_no_nid@cru.org...');
  await page2.goto(env.oracle.url);
  await page2.waitForLoadState('networkidle');
  await page2.getByRole('textbox', { name: 'User ID' }).fill('uat.bot_hr_generalist_no_nid@cru.org');
  await page2.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page2.getByRole('button', { name: 'Sign In' }).click();
  const ok = await page2.waitForURL('**/fscmUI/**', { timeout: 30_000 }).then(() => true).catch(() => false);
  console.log(`  Result: ${ok ? 'SUCCESS' : 'FAILED'}`);
  if (!ok) {
    const text = await page2.textContent('body') || '';
    if (text.includes('Authentication failed')) console.log('  Error: Authentication failed');
    await page2.screenshot({ path: '/tmp/bot-cru-org-login.png' });

    // Also try without @cru.org
    console.log('Testing uat.bot_hr_generalist_no_nid (without @cru.org)...');
    await page2.goto(env.oracle.url);
    await page2.waitForLoadState('networkidle');
    await page2.getByRole('textbox', { name: 'User ID' }).fill('uat.bot_hr_generalist_no_nid');
    await page2.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
    await page2.getByRole('button', { name: 'Sign In' }).click();
    const ok2 = await page2.waitForURL('**/fscmUI/**', { timeout: 30_000 }).then(() => true).catch(() => false);
    console.log(`  Result: ${ok2 ? 'SUCCESS' : 'FAILED'}`);
  }

  await browser2.close();
}

main().catch(console.error);
