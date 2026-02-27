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
  // Scroll to load all lazy content
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
  console.log('On form:', await page.locator('h1').first().textContent().catch(() => 'N/A'));

  // Fill Hire Date
  const hireDateInput = page.locator('[id$="SP1:inputDate1::content"]');
  await hireDateInput.fill('7/1/25');
  await hireDateInput.press('Tab');
  await page.waitForTimeout(2000);

  // Legal Employer: type "Campus" then Tab to auto-complete
  const leInput = page.locator('[id$="SP1:selectOneChoice3::content"]');
  await leInput.click();
  await leInput.fill('Campus');
  await page.waitForTimeout(2000);
  // Tab to trigger autocomplete
  await leInput.press('Tab');
  await page.waitForTimeout(3000);

  // Check what value was set
  const leValue = await leInput.inputValue();
  console.log('Legal Employer value:', leValue);

  // Set Last Name
  await page.locator('[id$="i1:0:it20::content"]').fill('TestAutomation');
  await page.locator('[id$="i1:0:it20::content"]').press('Tab');
  await page.waitForTimeout(1000);

  // Set First Name
  await page.locator('[id$="i1:1:it60::content"]').fill('UAT');
  await page.locator('[id$="i1:1:it60::content"]').press('Tab');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/hire-step1-v3.png', fullPage: true });

  // Find all ADF command buttons/links
  console.log('\nFinding ADF wizard buttons...');
  const adfButtons = await page.evaluate(() => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) return 'AdfPage not found';

    // Look for elements with the expected button ID patterns
    const buttonsInfo: any[] = [];
    const allLinks = document.querySelectorAll('a[role="button"]');
    allLinks.forEach((a: any) => {
      if (a.offsetWidth > 0 && a.textContent?.trim()) {
        const text = a.textContent.trim();
        // Try to find ADF component by looking at aria-describedby
        const describedBy = a.getAttribute('aria-describedby') || '';
        buttonsInfo.push({ text, describedBy, id: a.id });

        // Try to find parent ADF component
        let el = a;
        for (let i = 0; i < 5; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.id) {
            const comp = adfPage.findComponentByAbsoluteId(el.id);
            if (comp) {
              buttonsInfo[buttonsInfo.length - 1].adfComponentId = el.id;
              buttonsInfo[buttonsInfo.length - 1].adfType = comp.getComponentType?.();
              break;
            }
          }
        }
      }
    });
    return buttonsInfo;
  });
  console.log('ADF buttons:', JSON.stringify(adfButtons, null, 2));

  // Click Next using the ADF component
  const nextBtn = (adfButtons as any[])?.find((b: any) => b.text === 'Next');
  if (nextBtn?.adfComponentId) {
    console.log(`\nClicking Next via AdfActionEvent on: ${nextBtn.adfComponentId}`);
    await page.evaluate((id: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      const comp = adfPage.findComponentByAbsoluteId(id);
      const evt = new (window as any).AdfActionEvent(comp);
      evt.queue();
    }, nextBtn.adfComponentId);
    await page.waitForTimeout(15000);
  } else {
    console.log('Next button ADF component not found, trying force click...');
    await page.locator('a[role="button"]:has-text("Next")').click({ force: true });
    await page.waitForTimeout(15000);
  }

  const h1step2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('\nAfter Next - H1:', h1step2);
  await page.screenshot({ path: '/tmp/hire-step2-v3.png', fullPage: true });

  // Check for errors
  const errors = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.p_AFError, .af_message_text, [class*="Error"]'))
      .filter((el: any) => el.offsetWidth > 0 && el.textContent?.trim())
      .map((el: any) => el.textContent?.trim().substring(0, 200));
  });
  if (errors.length > 0) console.log('Errors:', JSON.stringify(errors));

  // If we got to step 2, dump everything
  if (h1step2 && !h1step2.includes('Identification')) {
    await dumpAllFormElements(page, `Hire: ${h1step2}`);

    // Look for all section headings
    const headings = await page.locator('h1, h2, h3, [role="heading"]').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetWidth > 0).map((el: any) => ({
        tag: el.tagName, text: el.textContent?.trim().substring(0, 100),
      }))
    );
    console.log('\nHeadings:', JSON.stringify(headings, null, 2));
  }

  // Cancel
  const cancelBtn = (adfButtons as any[])?.find((b: any) => b.text === 'Cancel');
  if (cancelBtn?.adfComponentId) {
    await page.evaluate((id: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      const comp = adfPage.findComponentByAbsoluteId(id);
      const evt = new (window as any).AdfActionEvent(comp);
      evt.queue();
    }, cancelBtn.adfComponentId);
    await page.waitForTimeout(3000);
    // Handle Yes confirmation
    const yesBtn = await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a[role="button"], button');
      const yes = Array.from(allLinks).find((el: any) => el.textContent?.trim() === 'Yes' && el.offsetWidth > 0);
      if (!yes) return null;
      let el = yes as any;
      for (let i = 0; i < 5; i++) {
        el = el.parentElement;
        if (!el) break;
        if (el.id) {
          const adfPage = (window as any).AdfPage?.PAGE;
          const comp = adfPage?.findComponentByAbsoluteId(el.id);
          if (comp) return el.id;
        }
      }
      return null;
    });
    if (yesBtn) {
      await page.evaluate((id: string) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        const comp = adfPage.findComponentByAbsoluteId(id);
        const evt = new (window as any).AdfActionEvent(comp);
        evt.queue();
      }, yesBtn);
    }
  }
  await page.waitForTimeout(3000);

  await browser.close();
})();
