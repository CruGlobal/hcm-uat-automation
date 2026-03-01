/**
 * Discover available Oracle HCM security roles via Security Console.
 * Searches the Roles section for HR/Payroll/Benefits/Compensation roles.
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

async function searchRoles(page: Page, term: string): Promise<string[]> {
  const searchInput = page.locator('input[placeholder*="3 or more"]').first();
  await searchInput.clear();
  await searchInput.fill(term);
  await searchInput.press('Enter');
  await page.waitForTimeout(5000);

  // Extract role names from the results
  const bodyText = await page.textContent('body') || '';
  // Roles are displayed as Name + Code pairs
  const roleNames: string[] = [];
  const nameRegex = /Name([A-Za-z][A-Za-z\s\-_]+?)Code/g;
  let match;
  while ((match = nameRegex.exec(bodyText)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && name.length < 80) {
      roleNames.push(name);
    }
  }
  return roleNames;
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

  // Dismiss Warning
  const okBtn = page.getByRole('button', { name: 'OK' });
  if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(2000);
  }

  // We're on the Roles page by default
  console.log('=== Searching for available roles ===\n');

  // Change search dropdown to "Roles and Privileges" > "Job roles" if possible
  // The search has dropdowns: [All] [Job roles;Duty roles;Abstract roles;Oth]
  // Let's search with the default settings

  const searchTerms = [
    'Human Resource',
    'HR Specialist',
    'HR Admin',
    'Payroll',
    'Benefits',
    'Compensation',
    'Line Manager',
    'Absence',
    'Time and Labor',
    'Cru',
    'Journey',
    'Manager',
  ];

  for (const term of searchTerms) {
    console.log(`--- Search: "${term}" ---`);

    const searchInput = page.locator('input[placeholder*="3 or more"]').first();
    await searchInput.clear();
    await searchInput.fill(term);
    await searchInput.press('Enter');
    await page.waitForTimeout(5000);

    // Check count
    const countText = await page.locator('text=Search Result Count').textContent().catch(() => '');
    console.log(`  ${countText}`);

    // Get role names from the list
    // The roles page shows cards with Name and Code fields
    // Let's extract from the visible elements
    const results = await page.evaluate(() => {
      const items: { name: string; code: string }[] = [];
      // Look for role name elements - they appear as links
      const links = document.querySelectorAll('a[id*="RoleName"], a[id*="roleName"]');
      for (const link of links) {
        const name = link.textContent?.trim();
        if (name) items.push({ name, code: '' });
      }

      // Alternative: parse from the structured display
      // Each role card has: Name <value> Code <value> Description <value>
      const allText = document.body.textContent || '';
      const nameCodePairs = allText.match(/Name\s+([^\n]+?)\s*Code\s+([A-Z_]+)/g);
      if (nameCodePairs) {
        for (const pair of nameCodePairs) {
          const m = pair.match(/Name\s+(.+?)\s*Code\s+([A-Z_]+)/);
          if (m) items.push({ name: m[1].trim(), code: m[2].trim() });
        }
      }

      return items;
    });

    if (results.length > 0) {
      for (const r of results.slice(0, 15)) {
        console.log(`  - ${r.name}${r.code ? ` (${r.code})` : ''}`);
      }
      if (results.length > 15) console.log(`  ... and ${results.length - 15} more`);
    }

    // Take screenshot for first few searches
    if (['Human Resource', 'Cru', 'Payroll', 'Benefits'].includes(term)) {
      await page.screenshot({ path: `/tmp/roles-search-${term.replace(/\s/g, '_').toLowerCase()}.png` });
    }
    console.log('');
  }

  // Now let's also check what roles Josh Starcher has
  console.log('=== Checking Josh Starcher roles (reference) ===\n');

  // Click Users sidebar
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

  // Search for Josh Starcher
  const userSearch = page.locator('input[placeholder*="3 or more"]').first();
  await userSearch.fill('josh.starcher');
  await userSearch.press('Enter');
  await page.waitForTimeout(5000);

  // Click on the account
  const joshLink = page.locator('a:has-text("Joshua Starcher"), a:has-text("Josh Starcher")').first();
  if (await joshLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await joshLink.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/josh-starcher-roles.png' });

    // Extract roles
    const roles = await page.evaluate(() => {
      const items: string[] = [];
      const rows = document.querySelectorAll('table tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const roleName = cells[0]?.textContent?.trim();
          const roleCode = cells[1]?.textContent?.trim();
          if (roleName && roleName !== 'Role') {
            items.push(`${roleName} (${roleCode})`);
          }
        }
      }
      return items;
    });

    console.log(`Josh Starcher roles (${roles.length}):`);
    for (const role of roles) {
      console.log(`  - ${role}`);
    }
  }

  // Also check bot_hr_admin's current roles
  console.log('\n=== Checking bot_hr_admin current roles ===\n');

  // Go back to Users
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

  // Back button or Done
  const doneBtn = page.getByRole('button', { name: 'Done' });
  if (await doneBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await doneBtn.click();
    await page.waitForTimeout(3000);
  }

  await userSearch.fill('uat.bot_hr_admin');
  await userSearch.press('Enter');
  await page.waitForTimeout(5000);

  const botLink = page.locator('a:has-text("bot_hr_admin")').first();
  if (await botLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await botLink.click();
    await page.waitForTimeout(5000);

    const botRoles = await page.evaluate(() => {
      const items: string[] = [];
      const rows = document.querySelectorAll('table tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const roleName = cells[0]?.textContent?.trim();
          const roleCode = cells[1]?.textContent?.trim();
          if (roleName && roleName !== 'Role') {
            items.push(`${roleName} (${roleCode})`);
          }
        }
      }
      return items;
    });

    console.log(`bot_hr_admin roles (${botRoles.length}):`);
    for (const role of botRoles) {
      console.log(`  - ${role}`);
    }
  }

  await browser.close();
}

main().catch(console.error);
