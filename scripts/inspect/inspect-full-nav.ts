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

  // Open Navigator and Show More
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }

  // Dump ALL visible nav items
  const navItems = await page.locator('a[title]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null && el.offsetWidth > 0 && el.title)
      .map((el: any) => ({ id: el.id, title: el.title, text: el.textContent?.trim().substring(0, 80) }))
  );
  console.log('=== ALL NAV ITEMS ===');
  console.log(JSON.stringify(navItems, null, 2));

  await page.screenshot({ path: '/tmp/full-nav.png', fullPage: true });

  // Now click the Workforce Management "New Person" link
  console.log('\n=== Clicking Workforce Management New Person ===');
  const wmNewPerson = page.locator('#pt1\\:_UISnvr\\:0\\:nv_itemNode_workforce_management_new_person');
  await wmNewPerson.click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/wm-new-person.png', fullPage: true });

  // Dump task options on this page
  const tasks = await page.locator('a, button, [role="link"], [role="button"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).map((el: any) => ({
      tag: el.tagName, id: el.id?.substring(0, 120) || '',
      title: el.getAttribute('title') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 100) || '',
    })).filter((e: any) => e.text && !['Navigator','Home','Settings and Actions','Help','Oracle Logo Home','Access Accessibility Settings'].includes(e.title))
  );
  console.log('Available tasks/actions:', JSON.stringify(tasks, null, 2));

  await browser.close();
})();
