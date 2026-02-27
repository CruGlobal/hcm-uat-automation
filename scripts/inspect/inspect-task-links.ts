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

  // Navigate to My Client Groups > New Person
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  const wmNewPerson = page.locator('[id$="nv_itemNode_workforce_management_new_person"]');
  await wmNewPerson.click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dump ALL links with "Add" or "Hire" or "Pending" in the title — full detail
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[title]')).filter((a: any) =>
      /add|hire|pending|nonworker|contingent|dashboard/i.test(a.title)
    ).map((a: any) => ({
      id: a.id,
      title: a.title,
      disabled: a.getAttribute('aria-disabled'),
      className: a.className?.toString().substring(0, 80),
      onclick: a.getAttribute('onclick'),
      href: a.getAttribute('href'),
      visible: a.offsetWidth > 0,
      boundingBox: a.offsetWidth > 0 ? { x: a.getBoundingClientRect().x, y: a.getBoundingClientRect().y, w: a.offsetWidth, h: a.offsetHeight } : null,
    }));
  });
  console.log('=== TASK LINKS ===');
  console.log(JSON.stringify(links, null, 2));

  // Try clicking the text link (cl01Cl) for "Add a Pending Worker"
  console.log('\nClicking the text link (cl01Cl) for Add a Pending Worker...');
  const textLink = page.locator('[id$="cl01Lv:3:cl01Pse:cl01Cl"]');
  const isVisible = await textLink.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('Text link visible:', isVisible);
  if (isVisible) {
    await textLink.click();
  } else {
    // Try with force
    await textLink.click({ force: true });
  }

  // Listen for navigation
  await Promise.race([
    page.waitForURL(/PersonCreatePG|pending-worker|faces\//, { timeout: 15000 }).catch(() => {}),
    page.waitForTimeout(15000),
  ]);

  console.log('URL after text click:', page.url());
  const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('H1:', h1);
  await page.screenshot({ path: '/tmp/task-link-click.png', fullPage: true });

  // Dump form elements if we got somewhere new
  if (h1 !== 'New Person') {
    const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"]').evaluateAll((els: any[]) =>
      els.filter((el: any) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
      }).slice(0, 200).map((el: any) => ({
        tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 180) || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        text: el.textContent?.trim().substring(0, 120) || '',
        placeholder: (el as any).placeholder || '',
        role: el.getAttribute('role') || '',
        required: el.getAttribute('aria-required') || '',
      }))
    );
    console.log(`\n=== FORM ELEMENTS — ${els.length} ===`);
    console.log(JSON.stringify(els, null, 2));
  }

  await browser.close();
})();
