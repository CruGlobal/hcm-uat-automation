import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { TOTP } from 'otpauth';
dotenv.config();

const URL = process.env.ORACLE_HCM_URL!;
const USER = process.env.ORACLE_HCM_USERNAME!;
const PASS = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET!;

async function dumpVisible(page: any, label: string, selector = 'a, button, input, select') {
  const els = await page.locator(selector).evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).slice(0, 50).map((el: any) => ({
      tag: el.tagName, type: el.type || '', id: el.id,
      ariaLabel: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
      text: el.textContent?.trim().substring(0, 80) || '',
      role: el.getAttribute('role') || '',
    }))
  );
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(els, null, 2));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Login
  console.log('Logging in...');
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
  console.log('Logged in! URL:', page.url());

  // Navigate via Navigator menu
  console.log('\nOpening Navigator menu...');
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/navigator-menu.png', fullPage: true });
  await dumpVisible(page, 'Navigator Menu');

  // Look for "My Client Groups" or "Person Management" in the navigator
  const personMgmt = page.locator('a:has-text("Person Management")').first();
  const myClientGroups = page.locator('a:has-text("My Client Groups")').first();

  if (await personMgmt.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('\nClicking Person Management...');
    await personMgmt.click();
  } else if (await myClientGroups.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('\nClicking My Client Groups...');
    await myClientGroups.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/my-client-groups.png', fullPage: true });
    await dumpVisible(page, 'My Client Groups submenu');

    const pm = page.locator('a:has-text("Person Management")').first();
    if (await pm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pm.click();
    }
  }

  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  console.log('\nPerson Management URL:', page.url());
  await page.screenshot({ path: '/tmp/person-management.png', fullPage: true });
  await dumpVisible(page, 'Person Management Page');

  await browser.close();
})();
