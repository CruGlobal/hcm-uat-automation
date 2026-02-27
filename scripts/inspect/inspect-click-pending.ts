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

  // Navigate to New Person
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

  // Get the exact href and attributes of Pending Workers links
  const links = await page.locator('a[title="Pending Workers"]').evaluateAll((els: any[]) =>
    els.map((el: any) => ({
      id: el.id,
      href: el.href,
      onclick: el.getAttribute('onclick'),
      class: el.className,
      outerHTML: el.outerHTML.substring(0, 300),
    }))
  );
  console.log('Pending Workers links:', JSON.stringify(links, null, 2));

  // Try JavaScript click on the text link
  console.log('\nJS-clicking Pending Workers text link...');
  await page.evaluate(() => {
    const links = document.querySelectorAll('a[title="Pending Workers"]');
    // Click the last one (text link)
    if (links.length > 0) (links[links.length - 1] as any).click();
  });

  // Wait for navigation or new content
  await page.waitForTimeout(8000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const newUrl = page.url();
  console.log('URL after click:', newUrl);
  await page.screenshot({ path: '/tmp/after-pending-click.png', fullPage: true });

  // Check if page changed
  const h1 = await page.locator('h1').first().textContent().catch(() => 'N/A');
  console.log('H1:', h1);

  // Dump form elements
  const els = await page.locator('input:not([type="hidden"]), select, textarea, [role="combobox"], label, h1, h2, h3').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).slice(0, 60).map((el: any) => ({
      tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 120) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 100) || '',
      placeholder: (el as any).placeholder || '',
    }))
  );
  console.log('Elements:', JSON.stringify(els, null, 2));

  await browser.close();
})();
