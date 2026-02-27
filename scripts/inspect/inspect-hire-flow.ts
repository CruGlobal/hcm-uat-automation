import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { TOTP } from 'otpauth';
dotenv.config();

const URL = process.env.ORACLE_HCM_URL!;
const USER = process.env.ORACLE_HCM_USERNAME!;
const PASS = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET!;

async function login(page: any) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="identifier"]').fill(USER);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(PASS);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await page.locator('a[aria-label="Select Google Authenticator."]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('a[aria-label="Select Google Authenticator."]').click();
  await page.waitForLoadState('networkidle');
  const totp = new TOTP({ secret: TOTP_SECRET });
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(totp.generate());
  await page.locator('input[type="submit"]').click();
  await page.waitForURL('**/fscmUI/**', { timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function navigateToNewPerson(page: any) {
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  await page.locator('a[title="New Person"]').click();
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function dumpVisible(page: any, label: string) {
  const els = await page.locator('input, button, select, a, label, h1, h2, h3, span[role], div[role="button"], [role="option"], [role="listbox"], [role="link"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).slice(0, 80).map((el: any) => ({
      tag: el.tagName, id: el.id?.substring(0, 80) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      text: el.textContent?.trim().substring(0, 100) || '',
      role: el.getAttribute('role') || '',
    }))
  );
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(els, null, 2));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  await navigateToNewPerson(page);
  console.log('On New Person page');

  // Search for "Hire" to see available tasks
  const searchInput = page.locator('input[aria-label="Search for tasks"]');

  for (const searchTerm of ['Hire', 'Add Pending', 'Add Non', 'Rehire']) {
    console.log(`\nSearching for "${searchTerm}"...`);
    await searchInput.clear();
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/search-${searchTerm.replace(/\s/g, '-').toLowerCase()}.png`, fullPage: true });
    await dumpVisible(page, `Search: ${searchTerm}`);
  }

  // Now click "Hire an Employee" and see the form
  console.log('\nClicking Hire an Employee...');
  await searchInput.clear();
  await searchInput.fill('Hire');
  await page.waitForTimeout(2000);

  const hireLink = page.locator('a:has-text("Hire an Employee"), [role="link"]:has-text("Hire an Employee")').first();
  if (await hireLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await hireLink.click();
  } else {
    // Try clicking the text directly
    await page.locator('text="Hire an Employee"').first().click();
  }

  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('\nHire form URL:', page.url());
  await page.screenshot({ path: '/tmp/hire-form.png', fullPage: true });
  await dumpVisible(page, 'Hire an Employee Form');

  await browser.close();
})();
