/**
 * Inspect ALL wizard steps of "Hire an Employee" form.
 * Fills Step 1 + Step 2 with minimal data, then captures every subsequent step.
 */
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
  const linkId = `_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:${index}:cl01Pse:cl01Cl`;
  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, linkId);
  await page.waitForTimeout(15000);
}

async function clickAdfButton(page: any, buttonText: string) {
  const componentId = await page.evaluate((text: string) => {
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
  if (!componentId) throw new Error(`ADF button "${buttonText}" not found`);
  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage?.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(id);
    new (window as any).AdfActionEvent(comp).queue();
  }, componentId);
  await page.waitForTimeout(10000);
}

async function waitForJET(page: any) {
  await page.waitForFunction(() => {
    const jet = (window as any).oj;
    if (jet?.Context) {
      const bc = jet.Context.getPageContext().getBusyContext();
      return !bc.isReady || bc.isReady();
    }
    return true;
  }, { timeout: 30000 });
}

/** Fill a combobox that might be readonly — use ADF setValue if needed */
async function fillCombobox(page: any, selector: string, value: string) {
  const field = page.locator(selector);
  const isReadonly = await field.getAttribute('readonly');
  if (isReadonly !== null) {
    // For readonly ADF comboboxes, we need to open the dropdown and select
    console.log(`  Field ${selector} is readonly (current value: "${await field.inputValue()}")`);
    // Try using ADF API to set value
    const fieldId = await field.getAttribute('id');
    if (fieldId) {
      const parentId = fieldId.replace('::content', '');
      try {
        await page.evaluate(({ pid, val }: { pid: string; val: string }) => {
          const adfPage = (window as any).AdfPage?.PAGE;
          if (!adfPage) return;
          const comp = adfPage.findComponentByAbsoluteId(pid);
          if (comp && comp.setValue) {
            comp.setValue(val);
          }
        }, { pid: parentId, val: value });
        await page.waitForTimeout(2000);
      } catch (e: any) {
        console.log(`  Could not set value via ADF: ${e.message}`);
      }
    }
    return;
  }
  await field.click();
  await field.fill(value);
  await page.waitForTimeout(1500);
  await field.press('Tab');
  await page.waitForTimeout(3000);
  await waitForJET(page);
}

/** Fill a regular text input */
async function fillInput(page: any, selector: string, value: string) {
  const field = page.locator(selector);
  await field.clear();
  await field.fill(value);
  await field.press('Tab');
  await page.waitForTimeout(1000);
}

async function dumpAllFormElements(page: any, label: string) {
  // Scroll to reveal all content
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 600) {
    await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const els = await page.evaluate(() => {
    const results: any[] = [];
    const selectors = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="listbox"], [role="radio"], [role="checkbox"], [role="tab"]';
    const formEls = document.querySelectorAll(selectors);
    for (const el of Array.from(formEls)) {
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || (el as any).offsetWidth === 0) continue;
      let labelText = '';
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) labelText = label.textContent?.trim() || '';
      }
      const ariaLabel = el.getAttribute('aria-label') || '';
      if (!labelText) {
        let prev = el.previousElementSibling;
        if (prev && prev.tagName === 'LABEL') labelText = prev.textContent?.trim() || '';
      }
      // Walk up to find section headers
      let section = '';
      let parent = el.parentElement;
      for (let i = 0; i < 20 && parent; i++) {
        const heading = parent.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > [role="heading"], :scope > .x2t');
        if (heading && heading !== el) {
          section = heading.textContent?.trim().substring(0, 80) || '';
          break;
        }
        parent = parent.parentElement;
      }
      results.push({
        tag: el.tagName,
        type: (el as any).type || '',
        id: id?.substring(0, 200) || '',
        ariaLabel,
        labelText: labelText.substring(0, 100),
        section: section.substring(0, 80),
        role: el.getAttribute('role') || '',
        required: el.getAttribute('aria-required') || '',
        readonly: el.hasAttribute('readonly') ? 'Y' : '',
        value: (el as any).value?.substring(0, 60) || '',
      });
    }
    return results;
  });
  console.log(`\n=== ${label} — ${els.length} elements ===`);
  for (const el of els) {
    const desc = [
      el.tag.toLowerCase(),
      el.type ? `type=${el.type}` : '',
      el.role ? `role=${el.role}` : '',
      el.required ? 'REQUIRED' : '',
      el.readonly ? 'READONLY' : '',
    ].filter(Boolean).join(' ');
    const idShort = el.id ? `id="${el.id}"` : '';
    const label = el.ariaLabel ? `aria="${el.ariaLabel}"` : (el.labelText ? `label="${el.labelText}"` : '');
    const val = el.value ? `value="${el.value}"` : '';
    console.log(`  [${desc}] ${idShort} ${label} ${el.section ? `section="${el.section}"` : ''} ${val}`);
  }
}

async function dumpButtons(page: any) {
  const buttons = await page.evaluate(() => {
    const results: any[] = [];
    const els = document.querySelectorAll('a[role="button"], button');
    for (const el of Array.from(els)) {
      if ((el as any).offsetWidth === 0) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      results.push({
        id: el.id?.substring(0, 150) || '',
        text: text.substring(0, 80),
        tag: el.tagName,
      });
    }
    return results;
  });
  console.log('\nButtons:');
  for (const b of buttons) {
    console.log(`  [${b.tag}] id="${b.id}" text="${b.text}"`);
  }
}

async function dumpStepIndicator(page: any) {
  const steps = await page.evaluate(() => {
    const results: any[] = [];
    // ADF train stops use class patterns like xtf, xte, xtg
    const trains = document.querySelectorAll('[role="tab"], .xte, .xtf, .xtg, [class*="train"], [class*="step"]');
    for (const el of Array.from(trains)) {
      if ((el as any).offsetWidth === 0) continue;
      results.push({
        text: el.textContent?.trim().substring(0, 100) || '',
        id: el.id?.substring(0, 150) || '',
        className: (el.className || '').substring(0, 100),
      });
    }
    return results;
  });
  if (steps.length > 0) {
    console.log('\nWizard Steps/Train:');
    for (const s of steps) {
      console.log(`  text="${s.text}" id="${s.id}" class="${s.className}"`);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // ===== HIRE AN EMPLOYEE =====
  console.log('\n\n========== HIRE AN EMPLOYEE ==========');
  await goToNewPersonPage(page);
  await clickTaskByIndex(page, 1);

  // ===== STEP 1: IDENTIFICATION =====
  console.log('\n--- STEP 1: IDENTIFICATION ---');
  await dumpStepIndicator(page);

  // Fill Step 1 with minimal required data
  console.log('\nFilling Step 1...');

  // Hire Date
  await fillInput(page, '[id$="SP1:inputDate1::content"]', '03/01/2026');

  // Legal Employer (LOV combobox — type + Tab)
  await fillCombobox(page, '[id$="SP1:selectOneChoice3::content"]', 'Campus');
  await page.waitForTimeout(3000);
  await waitForJET(page);

  // Check Action field — it may be pre-filled and readonly
  const actionField = page.locator('[id$="SP1:selectOneChoice1::content"]');
  const actionReadonly = await actionField.getAttribute('readonly');
  const actionValue = await actionField.inputValue().catch(() => '');
  console.log(`Action field: readonly=${actionReadonly}, value="${actionValue}"`);

  // If Action is not "Hire", try to set it
  if (actionReadonly !== null) {
    console.log('Action is readonly — skipping fill');
  } else {
    await fillCombobox(page, '[id$="SP1:selectOneChoice1::content"]', 'Hire');
  }

  // Reason
  const reasonField = page.locator('[id$="SP1:selectOneChoice2::content"]');
  const reasonReadonly = await reasonField.getAttribute('readonly');
  console.log(`Reason field: readonly=${reasonReadonly}`);
  if (reasonReadonly === null) {
    await fillCombobox(page, '[id$="SP1:selectOneChoice2::content"]', 'New Hire');
  }

  // Last Name
  await fillInput(page, 'input[id*="it20::content"]:first-of-type', 'TestWizard');
  // Try alternate selector if first didn't work
  const lastNameVal = await page.locator('input[id*="it20::content"]').first().inputValue().catch(() => '');
  if (!lastNameVal) {
    await page.locator('input[id*="it20::content"]').first().fill('TestWizard');
    await page.locator('input[id*="it20::content"]').first().press('Tab');
    await page.waitForTimeout(1000);
  }

  // First Name
  await page.locator('input[id*="it60::content"]').first().fill('InspectRun');
  await page.locator('input[id*="it60::content"]').first().press('Tab');
  await page.waitForTimeout(1000);

  // Date of Birth
  const dobField = page.locator('[id$="id3::content"]');
  if (await dobField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dobField.clear();
    await dobField.fill('01/15/1990');
    await dobField.press('Tab');
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: '/tmp/wizard-step1-filled.png', fullPage: true });

  // Click Next to go to Step 2
  console.log('\nClicking Next to Step 2...');
  try {
    await clickAdfButton(page, 'Next');
    console.log('Clicked Next successfully');
  } catch (e: any) {
    console.log('Next button error:', e.message);
  }
  await waitForJET(page);

  // ===== STEP 2: PERSON INFORMATION =====
  console.log('\n--- STEP 2: PERSON INFORMATION ---');
  await dumpStepIndicator(page);
  await page.screenshot({ path: '/tmp/wizard-step2.png', fullPage: true });

  // Check headings to understand current state
  const step2Headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
      .filter((el: any) => el.offsetWidth > 0)
      .map((el: any) => el.textContent?.trim().substring(0, 100));
  });
  console.log('Step 2 headings:', step2Headings);

  await dumpAllFormElements(page, 'Step 2: Person Information');

  // Fill Step 2 minimally
  const addr1 = page.locator('[id$="inputText17::content"]').first();
  if (await addr1.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addr1.fill('100 Lake Hart Dr');
    await addr1.press('Tab');
    await page.waitForTimeout(1000);

    // ZIP
    const zip = page.locator('[id$="inputComboboxListOfValues28::content"]').first();
    if (await zip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zip.click();
      await zip.fill('32832');
      await page.waitForTimeout(1500);
      await zip.press('Tab');
      await page.waitForTimeout(3000);
    }
  }

  await page.screenshot({ path: '/tmp/wizard-step2-filled.png', fullPage: true });

  // Click Next to Step 3
  console.log('\nClicking Next to Step 3...');
  try {
    await clickAdfButton(page, 'Next');
    console.log('Clicked Next to Step 3');
  } catch (e: any) {
    console.log('Next button error:', e.message);
  }
  await waitForJET(page);

  // ===== STEP 3+ =====
  for (let step = 3; step <= 10; step++) {
    console.log(`\n\n--- STEP ${step} ---`);
    await dumpStepIndicator(page);

    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
        .filter((el: any) => el.offsetWidth > 0)
        .map((el: any) => el.textContent?.trim().substring(0, 100));
    });
    console.log('Headings:', headings);

    // Check for section headers (ADF uses specific classes)
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.x2t, .x2u, .x2v, [class*="panelHeader"], [class*="disclosure"]'))
        .filter((el: any) => el.offsetWidth > 0)
        .map((el: any) => ({
          text: el.textContent?.trim().substring(0, 100),
          className: (el.className || '').substring(0, 60),
          id: el.id?.substring(0, 120) || '',
        }));
    });
    console.log('Sections:', JSON.stringify(sections.slice(0, 20)));

    await page.screenshot({ path: `/tmp/wizard-step${step}.png`, fullPage: true });
    await dumpAllFormElements(page, `Step ${step}`);
    await dumpButtons(page);

    // Check for Next button
    const hasNext = await page.evaluate(() => {
      const links = document.querySelectorAll('a[role="button"]');
      for (const a of Array.from(links)) {
        if ((a as any).textContent?.trim() === 'Next' && (a as any).offsetWidth > 0) return true;
      }
      return false;
    });

    if (!hasNext) {
      console.log('No Next button — checking for Submit...');
      const hasSubmit = await page.evaluate(() => {
        const links = document.querySelectorAll('a[role="button"]');
        for (const a of Array.from(links)) {
          if ((a as any).textContent?.trim() === 'Submit' && (a as any).offsetWidth > 0) return true;
        }
        return false;
      });
      if (hasSubmit) console.log('Submit button is available — this is the final step');
      break;
    }

    console.log('Clicking Next...');
    try {
      await clickAdfButton(page, 'Next');
      await waitForJET(page);
    } catch (e: any) {
      console.log('Error clicking Next:', e.message);
      break;
    }
  }

  // Cancel
  console.log('\n\nDone inspecting. Cancelling...');
  try {
    await clickAdfButton(page, 'Cancel');
    await page.waitForTimeout(3000);
    try { await clickAdfButton(page, 'Yes'); } catch {}
  } catch {}

  await browser.close();
  console.log('\nInspection complete!');
})();
