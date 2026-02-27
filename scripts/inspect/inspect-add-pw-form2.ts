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
  const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"], [role="radio"], [role="checkbox"], [role="button"], [role="listbox"], [role="option"], [role="spinbutton"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).slice(0, 200).map((el: any) => ({
      tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 180) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 120) || '',
      placeholder: (el as any).placeholder || '',
      name: (el as any).name || '',
      for: el.getAttribute('for') || '',
      role: el.getAttribute('role') || '',
      required: el.getAttribute('aria-required') || '',
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

  // Click the Workforce Management "New Person"
  const wmNewPerson = page.locator('[id$="nv_itemNode_workforce_management_new_person"]');
  await wmNewPerson.click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  // Click "Add a Pending Worker" using JS click (onclick=return false workaround)
  console.log('Clicking Add a Pending Worker via JS...');
  const addPW = page.locator('a[title="Add a Pending Worker"]').first();

  // Try AdfPage.PAGE approach — Oracle ADF uses this for navigation
  await page.evaluate(() => {
    const el = document.querySelector('a[title="Add a Pending Worker"]') as HTMLElement;
    if (el) {
      // Simulate ADF click
      const evt = document.createEvent('MouseEvents');
      evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      el.dispatchEvent(evt);
    }
  });
  await page.waitForTimeout(10000);

  console.log('URL after click:', page.url());
  await page.screenshot({ path: '/tmp/add-pw-form2-step1.png', fullPage: true });

  // Check if we navigated or still on same page
  const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('H1:', h1);

  // If still on same page, try double-click or a different approach
  if (h1 === 'New Person') {
    console.log('Still on New Person page. Trying page.click with position...');
    // Get the bounding box and click the icon/text area
    const box = await addPW.boundingBox();
    if (box) {
      console.log('Bounding box:', JSON.stringify(box));
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(10000);
      console.log('URL after mouse click:', page.url());
      const h1b = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
      console.log('H1 after mouse click:', h1b);
      await page.screenshot({ path: '/tmp/add-pw-form2-step2.png', fullPage: true });
    }
  }

  // If we got to the form, dump it
  if (page.url().includes('PersonCreatePG') || page.url().includes('pending-worker')) {
    await dumpFormElements(page, 'Add Pending Worker Form');
  } else {
    // Check what's on the page now
    await dumpFormElements(page, 'Current Page State');
  }

  await browser.close();
})();
