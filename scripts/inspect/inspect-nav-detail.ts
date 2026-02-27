import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { TOTP } from 'otpauth';
dotenv.config();

const URL = process.env.ORACLE_HCM_URL!;
const USER = process.env.ORACLE_HCM_USERNAME!;
const PASS = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET!;

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
  console.log('Logged in!');

  // Open Navigator
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);

  // Click "Show More" to expand full navigator
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Clicking Show More...');
    await showMore.click();
    await page.waitForTimeout(2000);
  }

  // Expand "My Client Groups"
  console.log('Expanding My Client Groups...');
  const mcgExpand = page.locator('a[title="Expand My Client Groups"]').first();
  if (await mcgExpand.isVisible({ timeout: 3000 }).catch(() => false)) {
    await mcgExpand.click();
    await page.waitForTimeout(2000);
  } else {
    // Try clicking the text
    await page.locator('text="My Client Groups"').first().click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: '/tmp/nav-mcg-expanded.png', fullPage: true });

  // Dump all visible nav items
  const navItems = await page.locator('[id*="UISnvr"] a[title]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null).map((el: any) => ({
      id: el.id,
      title: el.getAttribute('title'),
      text: el.textContent?.trim().substring(0, 60),
    }))
  );
  console.log('Nav items:', JSON.stringify(navItems, null, 2));

  // Now click "New Person" to see that page
  console.log('\nNavigating to New Person...');
  const newPerson = page.locator('a[title="New Person"]').first();
  if (await newPerson.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newPerson.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('New Person URL:', page.url());
    await page.screenshot({ path: '/tmp/new-person-page.png', fullPage: true });

    // Dump page elements
    const els = await page.locator('input, button, select, a, label, h1, h2, h3').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).slice(0, 60).map((el: any) => ({
        tag: el.tagName, type: el.type || '', id: el.id,
        ariaLabel: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
        text: el.textContent?.trim().substring(0, 80) || '',
        name: el.name || '',
      }))
    );
    console.log('New Person page elements:', JSON.stringify(els, null, 2));
  }

  await browser.close();
})();
