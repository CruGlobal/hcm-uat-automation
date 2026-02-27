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

async function clickAdfButton(page: any, text: string): Promise<boolean> {
  return page.evaluate((btnText: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) return false;
    const links = document.querySelectorAll('a[role="button"]');
    for (const a of Array.from(links)) {
      if ((a as any).textContent?.trim() === btnText && (a as any).offsetWidth > 0) {
        let el: any = a;
        for (let i = 0; i < 5; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.id) {
            const comp = adfPage.findComponentByAbsoluteId(el.id);
            if (comp) {
              const evt = new (window as any).AdfActionEvent(comp);
              evt.queue();
              return true;
            }
          }
        }
      }
    }
    return false;
  }, text);
}

// Helper to fill input by partial ID suffix
async function fillByIdSuffix(page: any, suffix: string, value: string) {
  await page.locator(`[id$="${suffix}"]`).fill(value);
  await page.locator(`[id$="${suffix}"]`).press('Tab');
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Navigate to Hire form
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
    const p = (window as any).AdfPage?.PAGE;
    new (window as any).AdfActionEvent(p.findComponentByAbsoluteId(linkId)).queue();
  });
  await page.waitForTimeout(15000);
  console.log('Step 1:', await page.locator('h1').first().textContent().catch(() => 'N/A'));

  // Fill form — Hire Date, Legal Employer, then wait for refresh, then names
  await fillByIdSuffix(page, 'SP1:inputDate1::content', '7/1/25');
  await page.waitForTimeout(1000);

  // Legal Employer autocomplete
  await page.locator('[id$="SP1:selectOneChoice3::content"]').click();
  await page.locator('[id$="SP1:selectOneChoice3::content"]').fill('Campus');
  await page.waitForTimeout(2000);
  await page.locator('[id$="SP1:selectOneChoice3::content"]').press('Tab');
  await page.waitForTimeout(5000); // Wait for partial page refresh

  // After LE selection, the personal detail field indices change
  // Use the stable suffix pattern: the field type ids (it20=Last Name, it60=First Name)
  // Find them dynamically
  const lastNameInput = page.locator('input[id*="it20::content"]').first();
  const firstNameInput = page.locator('input[id*="it60::content"]').first();

  await lastNameInput.fill('TestAutomation');
  await lastNameInput.press('Tab');
  await page.waitForTimeout(500);

  await firstNameInput.fill('UAT');
  await firstNameInput.press('Tab');
  await page.waitForTimeout(500);

  await page.screenshot({ path: '/tmp/hire-step1-filled-final.png', fullPage: true });

  // Click Next via ADF
  console.log('Clicking Next...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(20000);

  const h1s2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('Step 2 H1:', h1s2);
  await page.screenshot({ path: '/tmp/hire-step2-final.png', fullPage: true });

  if (h1s2 && !h1s2.includes('Identification')) {
    await dumpAllFormElements(page, `Step 2: ${h1s2}`);

    // Check for more sections below
    const headings = await page.locator('h1, h2, h3, [role="heading"]').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
        tag: el.tagName, text: el.textContent?.trim().substring(0, 100),
      }))
    );
    console.log('\nAll headings:', JSON.stringify(headings, null, 2));
  } else {
    const errors = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.p_AFError, .af_message_text, .x2do'))
        .filter((el: any) => el.offsetWidth > 0)
        .map((el: any) => el.textContent?.trim().substring(0, 200))
    );
    console.log('Errors:', JSON.stringify(errors));
  }

  // Cancel
  await clickAdfButton(page, 'Cancel');
  await page.waitForTimeout(3000);
  await clickAdfButton(page, 'Yes');
  await page.waitForTimeout(3000);

  await browser.close();
})();
