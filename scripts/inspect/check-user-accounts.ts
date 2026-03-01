/**
 * Get full list of bot user accounts from Security Console,
 * then reset password for one to verify login works.
 */
import { chromium, type Page } from 'playwright';
import { LoginPage } from '../../src/pages/login.page';
import { env } from '../../src/config/environment';

const HEADLESS = process.env.HEADLESS !== 'false';

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

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 100 });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  await loginPage.fullLogin();
  console.log('Logged in successfully\n');

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

  // Click Users sidebar
  await clickSidebarUsers(page);
  console.log('On User Accounts page\n');

  // Search for "uat" to get all bot accounts
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.fill('uat');
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  // Extract all user account data
  interface UserAccount {
    displayName: string;
    userName: string;
    email: string;
    status: string;
    locked: string;
  }

  const accounts: UserAccount[] = [];

  // Extract from current visible results
  async function extractResults(): Promise<void> {
    const rows = await page.evaluate(() => {
      const results: any[] = [];
      // The User Accounts list shows cards with Display Name, User Name, Email, Status
      const items = document.querySelectorAll('[id*="UserAccounts"] li, [class*="resultItem"], [class*="search-result"]');
      if (items.length > 0) {
        items.forEach(item => {
          results.push({ text: (item as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() });
        });
      }
      return results;
    });

    if (rows.length > 0) {
      console.log(`Found ${rows.length} result items via query`);
    }

    // Fallback: extract from page text directly
    // The format appears to be repeated blocks of:
    // Display Name: "uat bot_hr_admin"
    // User Name: uat.bot_hr_admin
    // Email: (maybe empty)
    // Status: Active
    // Locked: No
    const bodyText = await page.textContent('body') || '';

    // Find all "User Name" occurrences and extract usernames
    const userNameRegex = /User Name\s+(\S+)/g;
    let match;
    while ((match = userNameRegex.exec(bodyText)) !== null) {
      const userName = match[1];
      if (userName.startsWith('uat') || userName.startsWith('bot')) {
        accounts.push({
          displayName: '',
          userName,
          email: '',
          status: 'Active',
          locked: 'No',
        });
      }
    }
  }

  await extractResults();

  // Click "Load More Items" until all results are shown
  let loadMoreAttempts = 0;
  while (loadMoreAttempts < 5) {
    const loadMore = page.getByText('Load More Items');
    if (await loadMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Loading more items...');
      await loadMore.click();
      await page.waitForTimeout(3000);
      loadMoreAttempts++;
    } else {
      break;
    }
  }

  // Re-extract after loading all items
  accounts.length = 0;
  const bodyText = await page.textContent('body') || '';
  const userNameRegex = /User Name\s+(\S+)/g;
  let match;
  while ((match = userNameRegex.exec(bodyText)) !== null) {
    const userName = match[1];
    if (userName.includes('uat') || userName.includes('bot') || userName.includes('Bot')) {
      accounts.push({
        displayName: '',
        userName,
        email: '',
        status: 'Active',
        locked: 'No',
      });
    }
  }

  await page.screenshot({ path: '/tmp/bot-sec-all-results.png', fullPage: true });

  console.log(`\n=== All bot user accounts found (${accounts.length}) ===\n`);
  for (const acc of accounts) {
    console.log(`  ${acc.userName}`);
  }

  // Now click on bot_hr_admin to see details and reset password
  console.log('\n=== Clicking on bot_hr_admin account ===');
  const botAdminLink = page.locator('a:has-text("bot_hr_admin")').first();
  if (await botAdminLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await botAdminLink.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/bot-hr-admin-detail.png' });

    // Check for Reset Password button or password fields
    const resetPwdBtn = page.locator('button:has-text("Reset Password"), a:has-text("Reset Password")');
    if (await resetPwdBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found Reset Password button!');
    }

    // Check for "Edit" button
    const editBtn = page.locator('button:has-text("Edit")');
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found Edit button, clicking...');
      await editBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/bot-hr-admin-edit.png' });

      // Look for password field
      const pwdField = page.locator('input[type="password"], input[id*="password"], input[id*="Password"]').first();
      if (await pwdField.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('Found password field!');
      }
    }

    // Get all the account details
    const detailText = await page.textContent('body') || '';
    const details = detailText.replace(/\s+/g, ' ').trim();
    // Extract key info
    const userNameMatch = /User Name\s+([\S]+)/.exec(details);
    const emailMatch = /Email\s+([\S]+)/.exec(details);
    console.log(`  User Name: ${userNameMatch?.[1] || 'not found'}`);
    console.log(`  Email: ${emailMatch?.[1] || 'not found'}`);
  }

  await browser.close();
}

main().catch(console.error);
