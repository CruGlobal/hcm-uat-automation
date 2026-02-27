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

async function dumpFormElements(page: any, label: string) {
  const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"], [role="radio"], [role="checkbox"], [role="button"], [role="listbox"], [role="option"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).slice(0, 150).map((el: any) => ({
      tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 150) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 120) || '',
      placeholder: (el as any).placeholder || '',
      name: (el as any).name || '',
      for: el.getAttribute('for') || '',
      role: el.getAttribute('role') || '',
      required: el.getAttribute('aria-required') || el.required || '',
    }))
  );
  console.log(`\n=== ${label} — ${els.length} elements ===`);
  console.log(JSON.stringify(els, null, 2));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Navigate to My Client Groups > New Person
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }

  // Click the Workforce Management "New Person" (My Client Groups)
  const wmNewPerson = page.locator('[id$="nv_itemNode_workforce_management_new_person"]');
  await wmNewPerson.click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  // Click "Add a Pending Worker"
  console.log('Clicking Add a Pending Worker...');
  await page.locator('a[title="Add a Pending Worker"]').first().click();
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(8000);

  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/add-pw-form-step1.png', fullPage: true });

  // Dump all form elements
  await dumpFormElements(page, 'Add Pending Worker — Step 1');

  // Look for sections / headings
  const headings = await page.locator('h1, h2, h3, [role="heading"], .x1lz').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
      tag: el.tagName, text: el.textContent?.trim().substring(0, 100),
      level: el.getAttribute('aria-level') || el.tagName,
    }))
  );
  console.log('\n=== HEADINGS ===');
  console.log(JSON.stringify(headings, null, 2));

  // Scroll down and capture more
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/add-pw-form-step1-scroll.png', fullPage: true });

  // Try to scroll further for more fields
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/add-pw-form-step1-scroll2.png', fullPage: true });

  await browser.close();
})();
