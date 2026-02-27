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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Go to Pending Workers dashboard directly
  await page.goto(URL + '/fscmUI/redwood/employment-pending-workers/view/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Click "More Actions" button
  console.log('Clicking More Actions...');
  await page.locator('button[aria-label="More Actions"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/more-actions-menu.png', fullPage: true });

  // Dump menu items
  const menuItems = await page.locator('[role="menuitem"], [role="option"], oj-option, li').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).map((el: any) => ({
      tag: el.tagName, text: el.textContent?.trim().substring(0, 80),
      role: el.getAttribute('role'),
      id: el.id,
    }))
  );
  console.log('Menu items:', JSON.stringify(menuItems, null, 2));

  await browser.close();
})();
