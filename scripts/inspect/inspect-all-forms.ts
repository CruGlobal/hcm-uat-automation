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

async function goToNewPersonPage(page: any) {
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  await page.locator('[id$="nv_itemNode_workforce_management_new_person"]').click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);
}

async function clickTaskByIndex(page: any, index: number) {
  // Use AdfActionEvent to trigger the task link
  const linkId = `_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:${index}:cl01Pse:cl01Cl`;
  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, linkId);
  await page.waitForTimeout(15000);
}

async function dumpAllFormElements(page: any, label: string) {
  // Scroll to reveal all content first
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 600) {
    await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"], [role="radio"], [role="checkbox"], button[id]').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).slice(0, 300).map((el: any) => ({
      tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 180) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 120) || '',
      placeholder: (el as any).placeholder || '',
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

  // ===== ADD A PENDING WORKER (index 3) =====
  console.log('\n========== ADD A PENDING WORKER ==========');
  await goToNewPersonPage(page);
  await clickTaskByIndex(page, 3);
  const h1pw = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('H1:', h1pw);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/form-add-pw.png', fullPage: true });
  await dumpAllFormElements(page, 'Add a Pending Worker: Identification');

  // Look for Next/Submit buttons
  const buttons = await page.locator('button, [role="button"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetWidth > 0 && el.textContent?.trim()).map((el: any) => ({
      id: el.id?.substring(0, 120), text: el.textContent?.trim().substring(0, 60),
      ariaLabel: el.getAttribute('aria-label'),
    }))
  );
  console.log('\nButtons:', JSON.stringify(buttons, null, 2));

  // Navigate back to home for next form
  await page.goto(URL + '/fscmUI/faces/AtkHomePageWelcome', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // ===== HIRE AN EMPLOYEE (index 1) =====
  console.log('\n========== HIRE AN EMPLOYEE ==========');
  await goToNewPersonPage(page);
  await clickTaskByIndex(page, 1);
  const h1hire = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('H1:', h1hire);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/form-hire.png', fullPage: true });
  await dumpAllFormElements(page, 'Hire an Employee: Identification');

  const buttons2 = await page.locator('button, [role="button"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetWidth > 0 && el.textContent?.trim()).map((el: any) => ({
      id: el.id?.substring(0, 120), text: el.textContent?.trim().substring(0, 60),
      ariaLabel: el.getAttribute('aria-label'),
    }))
  );
  console.log('\nButtons:', JSON.stringify(buttons2, null, 2));

  await browser.close();
})();
