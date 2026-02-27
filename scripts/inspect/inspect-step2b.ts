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

  console.log('Step 1 H1:', await page.locator('h1').first().textContent().catch(() => 'N/A'));

  // First dump all buttons to see how they're structured
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'))
      .filter((el: any) => el.offsetWidth > 0)
      .map((el: any) => ({
        tag: el.tagName, id: el.id?.substring(0, 120), text: el.textContent?.trim().substring(0, 60),
        class: el.className?.toString().substring(0, 60),
        type: el.getAttribute('type'),
      }));
  });
  console.log('\nAll buttons:', JSON.stringify(allButtons, null, 2));

  // Fill Hire Date
  console.log('\nFilling form...');
  const hireDateInput = page.locator('[id$="SP1:inputDate1::content"]');
  await hireDateInput.fill('7/1/25');
  await hireDateInput.press('Tab');
  await page.waitForTimeout(3000);

  // Legal Employer — use ADF component interaction
  // First check what the combobox looks like
  const leInput = page.locator('[id$="SP1:selectOneChoice3::content"]');
  await leInput.click();
  await page.waitForTimeout(1000);

  // Check for dropdown trigger button
  const dropdownButtons = await page.evaluate(() => {
    const input = document.querySelector('[id$="SP1:selectOneChoice3::content"]');
    if (!input) return 'INPUT NOT FOUND';
    const parent = input.closest('.af_selectOneChoice') || input.parentElement?.parentElement;
    return parent ? parent.outerHTML.substring(0, 3000) : 'PARENT NOT FOUND';
  });
  console.log('\nLE dropdown structure (first 3000 chars):', dropdownButtons);

  // Try Tab into the dropdown to trigger it
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(2000);

  // Check for dropdown options
  const opts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], .af_selectOneChoice_content li, select option'))
      .filter((el: any) => el.textContent?.trim())
      .slice(0, 20)
      .map((el: any) => ({ text: el.textContent?.trim().substring(0, 100), id: el.id?.substring(0, 80) }));
  });
  console.log('\nDropdown options:', JSON.stringify(opts, null, 2));

  // Set Last Name anyway
  const lastNameInput = page.locator('[id$="i1:0:it20::content"]');
  await lastNameInput.fill('TestAutomation');
  await lastNameInput.press('Tab');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/hire-step1-v2.png', fullPage: true });

  // Try clicking Next using various selectors
  // Check if it's an anchor styled as button
  const nextButton = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    const next = candidates.find((el: any) => el.textContent?.trim() === 'Next' && el.offsetWidth > 0);
    if (!next) return null;
    return {
      tag: (next as any).tagName, id: (next as any).id, class: (next as any).className?.toString().substring(0, 80),
      onclick: next.getAttribute('onclick')?.substring(0, 80),
      href: next.getAttribute('href'),
      outerHTML: (next as any).outerHTML.substring(0, 500),
    };
  });
  console.log('\nNext button structure:', JSON.stringify(nextButton, null, 2));

  if (nextButton) {
    // Click it via ADF action if it's a commandButton
    if (nextButton.id) {
      const clickResult = await page.evaluate((btnId: string) => {
        try {
          const adfPage = (window as any).AdfPage?.PAGE;
          const comp = adfPage.findComponentByAbsoluteId(btnId);
          if (!comp) return `Component not found for ${btnId}`;
          const evt = new (window as any).AdfActionEvent(comp);
          evt.queue();
          return 'Queued';
        } catch (e: any) {
          return `Error: ${e.message}`;
        }
      }, nextButton.id);
      console.log('AdfActionEvent result:', clickResult);
      await page.waitForTimeout(15000);
    } else {
      // Try regular click on the text
      await page.locator('text=Next').first().click({ force: true });
      await page.waitForTimeout(15000);
    }
  }

  const h1step2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('\nStep 2 H1:', h1step2);
  await page.screenshot({ path: '/tmp/hire-step2-v2.png', fullPage: true });

  if (h1step2 && !h1step2.includes('Identification')) {
    await dumpAllFormElements(page, 'Hire an Employee: Step 2');
  } else {
    // Check for errors
    const errors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.af_message_text, [role="alert"], .x38q, .p_AFError'))
        .filter((el: any) => el.offsetWidth > 0)
        .map((el: any) => el.textContent?.trim().substring(0, 200));
    });
    console.log('Errors:', JSON.stringify(errors));
  }

  // Cancel
  console.log('\nCanceling...');
  const cancelBtn = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    const cancel = candidates.find((el: any) => el.textContent?.trim() === 'Cancel' && el.offsetWidth > 0);
    return cancel ? (cancel as any).id : null;
  });
  if (cancelBtn) {
    await page.evaluate((btnId: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      const comp = adfPage.findComponentByAbsoluteId(btnId);
      if (comp) {
        const evt = new (window as any).AdfActionEvent(comp);
        evt.queue();
      }
    }, cancelBtn);
  }
  await page.waitForTimeout(5000);

  await browser.close();
})();
