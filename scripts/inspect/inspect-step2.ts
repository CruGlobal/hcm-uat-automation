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

async function dumpAllFormElements(page: any, label: string) {
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 600) {
    await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"], [role="radio"], [role="checkbox"]').evaluateAll((els: any[]) =>
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

  // Navigate to My Client Groups > New Person
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

  // Click "Hire an Employee" via AdfActionEvent
  console.log('Opening Hire an Employee form...');
  await page.evaluate(() => {
    const linkId = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:1:cl01Pse:cl01Cl';
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(linkId);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  });
  await page.waitForTimeout(15000);

  const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('Step 1 H1:', h1);

  // Fill minimal data to enable Next: Hire Date, Legal Employer, Last Name
  // Set Hire Date
  const hireDateInput = page.locator('[id$="SP1:inputDate1::content"]');
  await hireDateInput.fill('7/1/25');
  await hireDateInput.press('Tab');
  await page.waitForTimeout(2000);

  // Set Legal Employer — this is a combobox, type and select
  const legalEmployer = page.locator('[id$="SP1:selectOneChoice3::content"]');
  await legalEmployer.click();
  await page.waitForTimeout(1000);
  // Type to filter
  await legalEmployer.fill('Cru');
  await page.waitForTimeout(2000);
  // Check what options appeared
  const options = await page.locator('[role="option"], [role="listbox"] li').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
      text: el.textContent?.trim().substring(0, 100),
      id: el.id,
    }))
  );
  console.log('Legal Employer options:', JSON.stringify(options.slice(0, 10), null, 2));

  // Select first option if available
  if (options.length > 0) {
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(3000);
  }

  // Set Last Name
  const lastNameInput = page.locator('[id$="i1:0:it20::content"]');
  await lastNameInput.fill('TestAutomation');
  await lastNameInput.press('Tab');
  await page.waitForTimeout(1000);

  // Set First Name
  const firstNameInput = page.locator('[id$="i1:1:it60::content"]');
  await firstNameInput.fill('UAT');
  await firstNameInput.press('Tab');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/hire-step1-filled.png', fullPage: true });

  // Click Next
  console.log('Clicking Next...');
  await page.locator('button:has-text("Next")').click();
  await page.waitForTimeout(15000);

  const h1step2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('Step 2 H1:', h1step2);
  await page.screenshot({ path: '/tmp/hire-step2.png', fullPage: true });

  // Check if there's an error message
  const errors = await page.locator('.af_message, [role="alert"], .x38q').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
      text: el.textContent?.trim().substring(0, 200),
    }))
  );
  if (errors.length > 0) {
    console.log('Errors:', JSON.stringify(errors, null, 2));
  }

  // If we got to step 2, dump the form
  if (h1step2 !== h1) {
    await dumpAllFormElements(page, 'Hire an Employee: Step 2');

    // Also check for section headings
    const headings = await page.locator('h1, h2, h3, [role="heading"]').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
        tag: el.tagName, text: el.textContent?.trim().substring(0, 100),
      }))
    );
    console.log('\nHeadings:', JSON.stringify(headings, null, 2));

    // Look for buttons
    const buttons = await page.locator('button').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetWidth > 0 && el.textContent?.trim()).map((el: any) => ({
        text: el.textContent?.trim().substring(0, 60),
      }))
    );
    console.log('\nButtons:', JSON.stringify(buttons, null, 2));
  }

  // Cancel so we don't actually create anything
  console.log('Canceling...');
  await page.locator('button:has-text("Cancel")').click();
  await page.waitForTimeout(5000);

  // Handle confirmation dialog
  const yesButton = page.locator('button:has-text("Yes")');
  if (await yesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yesButton.click();
  }
  await page.waitForTimeout(3000);

  await browser.close();
})();
