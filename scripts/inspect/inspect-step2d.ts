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

async function findAdfButtonId(page: any, buttonText: string): Promise<string | null> {
  return page.evaluate((text: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) return null;
    const links = document.querySelectorAll('a[role="button"]');
    for (const a of Array.from(links)) {
      if ((a as any).textContent?.trim() === text && (a as any).offsetWidth > 0) {
        let el: any = a;
        for (let i = 0; i < 5; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.id) {
            const comp = adfPage.findComponentByAbsoluteId(el.id);
            if (comp) return el.id;
          }
        }
      }
    }
    return null;
  }, buttonText);
}

async function clickAdfButton(page: any, componentId: string) {
  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Navigate to Hire an Employee form
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

  await page.evaluate(() => {
    const linkId = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:1:cl01Pse:cl01Cl';
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(linkId);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  });
  await page.waitForTimeout(15000);
  console.log('Step 1:', await page.locator('h1').first().textContent().catch(() => 'N/A'));

  // Fill Hire Date
  await page.locator('[id$="SP1:inputDate1::content"]').fill('7/1/25');
  await page.locator('[id$="SP1:inputDate1::content"]').press('Tab');
  await page.waitForTimeout(2000);

  // Legal Employer: type + Tab autocomplete
  await page.locator('[id$="SP1:selectOneChoice3::content"]').click();
  await page.locator('[id$="SP1:selectOneChoice3::content"]').fill('Campus');
  await page.waitForTimeout(2000);
  await page.locator('[id$="SP1:selectOneChoice3::content"]').press('Tab');
  await page.waitForTimeout(5000); // Wait for partial refresh after Legal Employer selection

  // Re-dump form to see current field IDs after partial refresh
  console.log('\nDumping form after Legal Employer selection...');
  await dumpAllFormElements(page, 'After LE Selection');

  // Find the Last Name field (it may have changed after partial refresh)
  const lastNameField = page.locator('input[type="text"]').filter({ has: page.locator('xpath=..') }).locator('xpath=ancestor::td//label[contains(text(),"Last Name")]/ancestor::tr//input[contains(@id,"it20")]');

  // Actually just use a broader selector
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="text"]'))
      .filter((el: any) => el.offsetWidth > 0 && !el.id.includes('hidden'))
      .map((el: any) => ({
        id: el.id?.substring(0, 180),
        value: (el as any).value,
        ariaLabel: el.getAttribute('aria-label'),
        name: (el as any).name?.substring(0, 100),
      }));
  });
  console.log('\nAll visible text inputs:', JSON.stringify(inputs, null, 2));

  // Find Last Name by looking for id containing "it20" (standard pattern)
  const lastNameId = inputs.find((i: any) => i.id?.includes('it20'));
  const firstNameId = inputs.find((i: any) => i.id?.includes('it60'));

  if (lastNameId) {
    console.log(`\nFilling Last Name (${lastNameId.id})...`);
    await page.locator(`#${CSS.escape(lastNameId.id)}`).fill('TestAutomation');
    await page.locator(`#${CSS.escape(lastNameId.id)}`).press('Tab');
    await page.waitForTimeout(1000);
  }

  if (firstNameId) {
    console.log(`Filling First Name (${firstNameId.id})...`);
    await page.locator(`#${CSS.escape(firstNameId.id)}`).fill('UAT');
    await page.locator(`#${CSS.escape(firstNameId.id)}`).press('Tab');
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: '/tmp/hire-step1-v4.png', fullPage: true });

  // Click Next
  const nextId = await findAdfButtonId(page, 'Next');
  console.log(`\nNext button ADF id: ${nextId}`);
  if (nextId) {
    await clickAdfButton(page, nextId);
    await page.waitForTimeout(15000);
  }

  const h1s2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('\nStep 2 H1:', h1s2);
  await page.screenshot({ path: '/tmp/hire-step2-v4.png', fullPage: true });

  if (h1s2 && !h1s2.includes('Identification')) {
    await dumpAllFormElements(page, `Step 2: ${h1s2}`);
  } else {
    // Check for errors
    const errors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.p_AFError, .af_message_text, .x2do'))
        .filter((el: any) => el.offsetWidth > 0)
        .map((el: any) => el.textContent?.trim().substring(0, 200));
    });
    console.log('Errors:', JSON.stringify(errors));
  }

  // Cancel
  const cancelId = await findAdfButtonId(page, 'Cancel');
  if (cancelId) {
    await clickAdfButton(page, cancelId);
    await page.waitForTimeout(3000);
    const yesId = await findAdfButtonId(page, 'Yes');
    if (yesId) await clickAdfButton(page, yesId);
  }
  await page.waitForTimeout(3000);

  await browser.close();
})();
