/**
 * Inspection v2: Fill required fields on Add Pending Worker, then navigate
 * to see if Employment Information step exists.
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
  await page.waitForTimeout(5000);
  console.log('[Login] Success');
}

async function waitForJET(page: any) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const oj = (window as any).oj;
      if (!oj?.Context) { resolve(); return; }
      const ctx = oj.Context.getPageContext().getBusyContext();
      ctx.whenReady(30000).then(() => resolve()).catch(() => resolve());
    });
  }).catch(() => {});
}

async function clickAdfButton(page: any, buttonText: string): Promise<boolean> {
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

  if (!componentId) {
    console.log(`[ADF] Button "${buttonText}" NOT FOUND`);
    return false;
  }

  await page.evaluate((id: string) => {
    const comp = (window as any).AdfPage.PAGE.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);
  await page.waitForTimeout(2000);
  await waitForJET(page);
  console.log(`[ADF] Clicked button "${buttonText}" (id=${componentId})`);
  return true;
}

async function clickAdfLink(page: any, componentId: string) {
  await page.evaluate((id: string) => {
    const comp = (window as any).AdfPage.PAGE.findComponentByAbsoluteId(id);
    if (!comp) throw new Error(`ADF component not found: ${id}`);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);
  await page.waitForTimeout(2000);
  await waitForJET(page);
}

async function captureFormElements(page: any, label: string) {
  const elements = await page.evaluate(() => {
    const results: any[] = [];
    const els = document.querySelectorAll('input, select, textarea');
    for (const el of Array.from(els) as HTMLElement[]) {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const id = el.id || '';
      if (!id) continue;
      if (id.includes('::') && !id.endsWith('::content')) continue;

      const tagName = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || '';
      const readonly = (el as HTMLInputElement).readOnly || false;
      const value = (el as HTMLInputElement).value || '';
      const ariaLabel = el.getAttribute('aria-label') || '';

      results.push({
        id: id.substring(0, 120),
        tag: tagName,
        type,
        readonly,
        value: value.substring(0, 50),
        ariaLabel: ariaLabel.substring(0, 60),
      });
    }
    return results;
  });

  console.log(`\n=== ${label} (${elements.length} elements) ===`);
  for (const el of elements) {
    const flags = [
      el.readonly ? 'READONLY' : '',
      el.value ? `val="${el.value}"` : '',
      el.ariaLabel ? `aria="${el.ariaLabel}"` : '',
    ].filter(Boolean).join(' ');
    console.log(`  [${el.tag}${el.type ? ':' + el.type : ''}] id="${el.id}" ${flags}`);
  }
  return elements;
}

async function getWizardSteps(page: any) {
  const steps = await page.evaluate(() => {
    // ADF wizard train stops
    const trainStops = document.querySelectorAll('[class*="train"], [role="tab"], [class*="step"]');
    const results: any[] = [];
    for (const el of Array.from(trainStops) as HTMLElement[]) {
      if (el.offsetWidth === 0) continue;
      results.push({
        text: el.textContent?.trim().substring(0, 80) || '',
        tag: el.tagName,
        id: el.id?.substring(0, 80) || '',
        class: el.className?.substring(0, 60) || '',
        ariaSelected: el.getAttribute('aria-selected'),
      });
    }
    // Also check for step progress indicators
    const steps = document.querySelectorAll('.xjl, .x2kp, .x2kw');
    for (const el of Array.from(steps) as HTMLElement[]) {
      if (el.offsetWidth === 0) continue;
      results.push({
        text: el.textContent?.trim().substring(0, 80) || '',
        tag: el.tagName,
        id: el.id?.substring(0, 80) || '',
        class: el.className?.substring(0, 60) || '',
      });
    }
    return results;
  });
  return steps;
}

async function getAllVisibleButtons(page: any) {
  const buttons = await page.evaluate(() => {
    const results: any[] = [];
    const btns = document.querySelectorAll('a[role="button"], button');
    for (const el of Array.from(btns) as HTMLElement[]) {
      if (el.offsetWidth === 0) continue;
      const text = el.textContent?.trim() || '';
      if (!text) continue;
      results.push({
        text: text.substring(0, 50),
        id: el.id?.substring(0, 80) || '',
        tag: el.tagName,
      });
    }
    return results;
  });
  return buttons;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await login(page);

    // Navigate to New Person
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

    // Click "Add a Pending Worker" (task index 3)
    const prefix = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:';
    const linkId = `${prefix}cl01Lv:3:cl01Pse:cl01Cl`;
    await clickAdfLink(page, linkId);
    await page.waitForTimeout(10000);
    console.log('[Nav] On Add Pending Worker form');

    // Check wizard steps/train stops
    const steps = await getWizardSteps(page);
    console.log('\n[Wizard] Train stops/steps:', JSON.stringify(steps, null, 2));

    // Check available buttons
    const buttons = await getAllVisibleButtons(page);
    console.log('\n[Buttons]', buttons.map((b: any) => b.text).join(', '));

    // Fill Legal Employer via typing + autocomplete
    const legalEmployer = page.locator('[id$="SP1:selectOneChoice3::content"]');
    await legalEmployer.click();
    await legalEmployer.pressSequentially('Campus Crusade', { delay: 50 });
    await page.waitForTimeout(2000);
    const suggestion = page.locator('li:has-text("Campus Crusade")').first();
    if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await suggestion.click();
    } else {
      await legalEmployer.press('Tab');
    }
    await page.waitForTimeout(5000);
    await waitForJET(page);
    console.log('[Step 1] Legal Employer filled');

    // Fill Last Name (required!)
    const lastName = page.locator('[id$="it20::content"]').first();
    await lastName.fill('TEST-INSPECT');
    await lastName.press('Tab');
    await page.waitForTimeout(1000);
    console.log('[Step 1] Last Name filled');

    // Fill First Name
    const firstName = page.locator('[id$="it60::content"]').first();
    await firstName.fill('Pending');
    await firstName.press('Tab');
    await page.waitForTimeout(1000);
    console.log('[Step 1] First Name filled');

    await captureFormElements(page, 'Step 1: After filling required fields');
    await page.screenshot({ path: '/tmp/pending-v2-step1.png', fullPage: true });

    // Try "Next" to advance
    console.log('\n--- Clicking Next (Step 1 → Step 2) ---');
    const nextResult = await clickAdfButton(page, 'Next');
    if (!nextResult) {
      console.log('No "Next" button found. Trying "Continue"...');
      await clickAdfButton(page, 'Continue');
    }
    await page.waitForTimeout(10000);

    const steps2 = await getWizardSteps(page);
    console.log('\n[Wizard] After Next - steps:', JSON.stringify(steps2, null, 2));
    const buttons2 = await getAllVisibleButtons(page);
    console.log('[Buttons]', buttons2.map((b: any) => b.text).join(', '));
    await page.screenshot({ path: '/tmp/pending-v2-step2.png', fullPage: true });
    await captureFormElements(page, 'After first Next');

    // Try Next again to see if we reach Employment Information
    console.log('\n--- Clicking Next (Step 2 → Step 3) ---');
    const nextResult2 = await clickAdfButton(page, 'Next');
    if (!nextResult2) {
      await clickAdfButton(page, 'Continue');
    }
    await page.waitForTimeout(10000);

    const steps3 = await getWizardSteps(page);
    console.log('\n[Wizard] After 2nd Next - steps:', JSON.stringify(steps3, null, 2));
    const buttons3 = await getAllVisibleButtons(page);
    console.log('[Buttons]', buttons3.map((b: any) => b.text).join(', '));
    await page.screenshot({ path: '/tmp/pending-v2-step3.png', fullPage: true });
    const step3Elements = await captureFormElements(page, 'After second Next');

    // Check for Assignment fields specifically
    const assignmentFields = step3Elements.filter((e: any) =>
      e.id.includes('businessUnit') || e.id.includes('jobId') ||
      e.id.includes('departmentId') || e.id.includes('locationId') ||
      e.id.includes('NewPe1:0:') || e.id.includes('JobDe1:0:') ||
      e.id.includes('NewPe3:0:')
    );
    console.log('\n[Assignment Fields Found]', assignmentFields.length);
    for (const f of assignmentFields) {
      console.log(`  ${f.id} ${f.value || ''}`);
    }

    // If still no assignment fields, try one more Next
    if (assignmentFields.length === 0) {
      console.log('\n--- Clicking Next (Step 3 → Step 4) ---');
      const nextResult3 = await clickAdfButton(page, 'Next');
      if (!nextResult3) {
        // No more Next buttons — check for Submit
        const hasSubmit = await clickAdfButton(page, 'Submit');
        console.log('[Wizard] Submit button:', hasSubmit ? 'found' : 'not found');
      } else {
        await page.waitForTimeout(10000);
        await captureFormElements(page, 'After third Next');
        await page.screenshot({ path: '/tmp/pending-v2-step4.png', fullPage: true });
      }
    }

    // === Now cancel and try Add Nonworker ===
    console.log('\n\n===== ADD NON-WORKER WIZARD =====');
    await clickAdfButton(page, 'Cancel');
    await page.waitForTimeout(3000);
    // Confirm cancel if dialog appears
    await clickAdfButton(page, 'Yes').catch(() => {});
    await page.waitForTimeout(5000);

    // Navigate home
    await page.goto(process.env.ORACLE_HCM_URL + '/fscmUI/faces/AtkHomePageWelcome');
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(5000);

    // Navigate to New Person again
    await page.locator('a[title="Navigator"]').click();
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(2000);
    }
    await page.locator('[id$="nv_itemNode_workforce_management_new_person"]').click({ force: true });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(5000);

    // Click "Add a Nonworker" (task index 4)
    const nonworkerLinkId = `${prefix}cl01Lv:4:cl01Pse:cl01Cl`;
    await clickAdfLink(page, nonworkerLinkId);
    await page.waitForTimeout(10000);
    console.log('[Nav] On Add Nonworker form');

    // Check buttons
    const nwButtons = await getAllVisibleButtons(page);
    console.log('[Buttons]', nwButtons.map((b: any) => b.text).join(', '));

    await captureFormElements(page, 'Nonworker Step 1: Initial');

    // Fill Legal Employer
    const nwLegalEmp = page.locator('[id$="SP1:selectOneChoice3::content"]');
    if (await nwLegalEmp.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nwLegalEmp.click();
      await nwLegalEmp.pressSequentially('Campus Crusade', { delay: 50 });
      await page.waitForTimeout(2000);
      const sug = page.locator('li:has-text("Campus Crusade")').first();
      if (await sug.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sug.click();
      } else {
        await nwLegalEmp.press('Tab');
      }
      await page.waitForTimeout(5000);
      await waitForJET(page);
    }

    // Fill Last Name
    const nwLastName = page.locator('[id$="it20::content"]').first();
    await nwLastName.fill('TEST-NW-INSPECT');
    await nwLastName.press('Tab');
    await page.waitForTimeout(1000);

    // Fill First Name
    const nwFirstName = page.locator('[id$="it60::content"]').first();
    await nwFirstName.fill('Nonworker');
    await nwFirstName.press('Tab');
    await page.waitForTimeout(1000);

    console.log('[NW Step 1] Required fields filled');

    // Click Next
    console.log('\n--- NW: Clicking Next (Step 1 → Step 2) ---');
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/nonworker-step2.png', fullPage: true });
    await captureFormElements(page, 'Nonworker: After first Next');
    const nwButtons2 = await getAllVisibleButtons(page);
    console.log('[Buttons]', nwButtons2.map((b: any) => b.text).join(', '));

    // Click Next again
    console.log('\n--- NW: Clicking Next (Step 2 → Step 3) ---');
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/nonworker-step3.png', fullPage: true });
    const nwStep3 = await captureFormElements(page, 'Nonworker: After second Next');
    const nwButtons3 = await getAllVisibleButtons(page);
    console.log('[Buttons]', nwButtons3.map((b: any) => b.text).join(', '));

    // Check for assignment fields
    const nwAssignment = nwStep3.filter((e: any) =>
      e.id.includes('businessUnit') || e.id.includes('jobId') ||
      e.id.includes('departmentId') || e.id.includes('locationId') ||
      e.id.includes('NewPe1:0:') || e.id.includes('JobDe1:0:') ||
      e.id.includes('NewPe3:0:')
    );
    console.log('\n[NW Assignment Fields]', nwAssignment.length);
    for (const f of nwAssignment) {
      console.log(`  ${f.id} ${f.value || ''}`);
    }

    // Try one more Next
    console.log('\n--- NW: Clicking Next (Step 3 → Step 4) ---');
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/nonworker-step4.png', fullPage: true });
    await captureFormElements(page, 'Nonworker: After third Next');

    console.log('\n[Done]');
  } catch (err: any) {
    console.error('[Error]', err.message);
    await page.screenshot({ path: '/tmp/pending-v2-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
