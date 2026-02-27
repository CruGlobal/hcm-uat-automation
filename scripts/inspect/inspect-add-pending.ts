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

  // Try the deep link for "Add Pending Worker" - classic Oracle HCM deep link pattern
  const deepLinks = [
    '/hcmUI/faces/PersonCreatePG?pAction=ADD_PW',
    '/hcmUI/faces/FndOverview?fndGlobalItemNodeId=PER_ADD_PENDING_WORKER',
    '/hcmUI/faces/deeplink?objType=ADD_PENDING_WORKER&action=NONE',
    '/fscmUI/faces/deeplink?objType=PENDING_WORKER&action=CREATE',
  ];

  for (const path of deepLinks) {
    console.log(`\nTrying: ${path}`);
    try {
      await page.goto(URL + path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      const title = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
      console.log(`  URL: ${page.url()}`);
      console.log(`  H1: ${title}`);
      if (title !== 'N/A' && !title.includes('Error')) {
        await page.screenshot({ path: `/tmp/deeplink-${path.replace(/[\/\?=&]/g, '_')}.png`, fullPage: true });
      }
    } catch (e: any) {
      console.log(`  Failed: ${e.message?.substring(0, 100)}`);
    }
  }

  // Also try via the Navigator > My Client Groups section (using force click)
  console.log('\nTrying Navigator > My Client Groups...');
  await page.goto(URL + '/fscmUI/faces/AtkHomePageWelcome', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);

  // Click Show More
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }

  // Use force click on "My Client Groups" expand arrow
  const expandMCG = page.locator('a[title="Expand My Client Groups"]');
  if (await expandMCG.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expandMCG.click({ force: true });
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: '/tmp/nav-mcg-force.png', fullPage: true });

  // Dump all visible nav items with "Person" in the text
  const navItems = await page.locator('a').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null && el.textContent?.toLowerCase().includes('person')).map((el: any) => ({
      id: el.id, title: el.getAttribute('title'), text: el.textContent?.trim(),
    }))
  );
  console.log('Person-related nav items:', JSON.stringify(navItems, null, 2));

  await browser.close();
})();
