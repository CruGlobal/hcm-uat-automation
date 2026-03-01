/**
 * Inspection script: Capture Step 3 (Employment Information) element IDs
 * for the "Add a Pending Worker" wizard.
 *
 * Compares with Hire Employee wizard IDs used in AssignmentPage.
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
    const comp = (window as any).AdfPage.PAGE.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);
  await page.waitForTimeout(2000);
  await waitForJET(page);
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

async function navigateToNewPerson(page: any) {
  // Open Navigator
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  // Click New Person
  await page.locator('[id$="nv_itemNode_workforce_management_new_person"]').click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);
}

async function clickNewPersonTask(page: any, taskIndex: number) {
  const prefix = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:';
  const linkId = `${prefix}cl01Lv:${taskIndex}:cl01Pse:cl01Cl`;
  await clickAdfLink(page, linkId);
  await page.waitForTimeout(10000); // ADF forms take time to render
}

/**
 * Capture all input and select element IDs on the current page.
 */
async function captureFormElements(page: any, label: string) {
  const elements = await page.evaluate(() => {
    const results: any[] = [];
    const els = document.querySelectorAll('input, select, textarea');
    for (const el of Array.from(els) as HTMLElement[]) {
      // Only visible elements
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const id = el.id || '';
      if (!id) continue;
      // Skip hidden/system fields
      if (id.includes('::') && !id.endsWith('::content')) continue;

      const tagName = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || '';
      const readonly = (el as HTMLInputElement).readOnly || false;
      const value = (el as HTMLInputElement).value || '';
      const label = el.getAttribute('aria-label') || '';
      const placeholder = (el as HTMLInputElement).placeholder || '';

      // Try to find nearest label
      let labelText = '';
      const labelEl = el.closest('.xh9, .x1nz, .x103')?.querySelector('label');
      if (labelEl) labelText = labelEl.textContent?.trim() || '';

      // Also check previous sibling labels
      if (!labelText) {
        const prev = el.parentElement?.previousElementSibling;
        if (prev?.tagName === 'LABEL' || prev?.querySelector('label')) {
          labelText = (prev.textContent?.trim() || '').substring(0, 60);
        }
      }

      results.push({
        id: id.substring(0, 100),
        tag: tagName,
        type,
        readonly,
        value: value.substring(0, 50),
        ariaLabel: label.substring(0, 60),
        placeholder: placeholder.substring(0, 60),
        label: labelText.substring(0, 60),
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
      el.label ? `label="${el.label}"` : '',
    ].filter(Boolean).join(' ');
    console.log(`  [${el.tag}${el.type ? ':' + el.type : ''}] id="${el.id}" ${flags}`);
  }
  return elements;
}

/**
 * Capture ADF component tree for all form elements.
 */
async function captureAdfComponents(page: any, label: string) {
  const components = await page.evaluate(() => {
    const adfPage = (window as any).AdfPage?.PAGE;
    if (!adfPage) return [];

    const results: any[] = [];
    // Walk all input/select elements and check for ADF components
    const els = document.querySelectorAll('input[id*="::content"], select[id*="::content"]');
    for (const el of Array.from(els) as HTMLElement[]) {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const id = el.id || '';
      const compId = id.replace('::content', '');
      const comp = adfPage.findComponentByAbsoluteId(compId);
      if (!comp) continue;

      const compType = comp.getComponentType?.() || 'unknown';
      const value = comp.getValue?.();
      const items = comp.getSelectItems?.();
      const itemCount = items?.length || 0;
      const itemLabels = items
        ? items.slice(0, 5).map((it: any) => it.getLabel?.() || '?')
        : [];

      results.push({
        elementId: id,
        componentId: compId,
        type: compType,
        value: value != null ? String(value).substring(0, 50) : null,
        itemCount,
        sampleItems: itemLabels,
      });
    }
    return results;
  });

  console.log(`\n=== ADF Components: ${label} (${components.length}) ===`);
  for (const c of components) {
    console.log(`  ${c.componentId} [${c.type}] val=${c.value} items=${c.itemCount} ${c.sampleItems.length ? 'samples=' + c.sampleItems.join(',') : ''}`);
  }
  return components;
}

// Known Hire Employee wizard IDs for comparison
const HIRE_WIZARD_IDS = {
  'Business Unit': 'NewPe1:0:businessUnitId::content',
  'Person Type': 'NewPe1:0:selectOneChoice1::content',
  'Assignment Status': 'NewPe1:0:selectOneChoice2::content',
  'Job': 'JobDe1:0:jobId::content',
  'Grade': 'JobDe1:0:gradeId::content',
  'Department': 'JobDe1:0:departmentId::content',
  'Location': 'JobDe1:0:locationId::content',
  'Position': 'JobDe1:0:positionId::content',
  'Reporting Establishment': 'JobDe1:0:selectOneChoice7::content',
  'Working at Home': 'JobDe1:0:selectOneRadio1::content',
  'Worker Category': 'JobDe1:0:selectOneChoice1::content',
  'Assignment Category': 'JobDe1:0:selectOneChoice3::content',
  'Reg/Temp': 'JobDe1:0:soc2::content',
  'Full/Part Time': 'JobDe1:0:soc1::content',
  'Working as Manager': 'JobDe1:0:selectOneRadio2::content',
  'Hourly/Salaried': 'JobDe1:0:selectOneChoice2::content',
  'Working Hours': 'JobDe1:0:inputText1::content',
  'Frequency': 'JobDe1:0:selectOneChoice6::content',
  'People Group': 'JobDe1:0:kf2CS::content',
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    // === Login ===
    await login(page);

    // === Navigate to New Person page ===
    await navigateToNewPerson(page);
    console.log('[Nav] On New Person page');

    // === Click "Add a Pending Worker" (task index 3) ===
    console.log('[Nav] Clicking "Add a Pending Worker" (task index 3)...');
    await clickNewPersonTask(page, 3);
    console.log('[Nav] Add Pending Worker form loaded');

    // === Step 1: Fill minimal data ===
    console.log('\n[Step 1] Filling minimal data...');
    await captureFormElements(page, 'Step 1: Add Pending Worker - Initial');

    // Fill Legal Employer (LOV combobox — type + Tab)
    const legalEmployer = page.locator('[id$="SP1:selectOneChoice3::content"]');
    if (await legalEmployer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await legalEmployer.click();
      await legalEmployer.pressSequentially('Campus Crusade', { delay: 50 });
      await page.waitForTimeout(2000);
      // Check for autocomplete dropdown
      const suggestion = page.locator('li:has-text("Campus Crusade")').first();
      if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await suggestion.click();
        console.log('[Step 1] Selected Legal Employer from autocomplete');
      } else {
        await legalEmployer.press('Tab');
        console.log('[Step 1] Tabbed out of Legal Employer');
      }
      await page.waitForTimeout(5000);
      await waitForJET(page);
    }

    await captureFormElements(page, 'Step 1: After filling');
    await page.screenshot({ path: '/tmp/pending-worker-step1.png', fullPage: true });

    // === Click Next to Step 2 ===
    console.log('\n[Step 2] Clicking Next...');
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    console.log('[Step 2] On Person Information');
    await page.screenshot({ path: '/tmp/pending-worker-step2.png', fullPage: true });

    // === Click Next to Step 3 ===
    console.log('\n[Step 3] Clicking Next...');
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    console.log('[Step 3] On Employment Information');
    await page.screenshot({ path: '/tmp/pending-worker-step3.png', fullPage: true });

    // === Capture Step 3 elements ===
    const step3Elements = await captureFormElements(page, 'Step 3: Employment Information - Add Pending Worker');
    await captureAdfComponents(page, 'Step 3: ADF Components');

    // === Compare with Hire Employee wizard IDs ===
    console.log('\n=== COMPARISON: Hire Employee vs Add Pending Worker ===');
    for (const [fieldName, hireId] of Object.entries(HIRE_WIZARD_IDS)) {
      const hireSuffix = hireId;
      const found = step3Elements.find((el: any) => el.id.endsWith(hireSuffix));
      if (found) {
        console.log(`  ✓ ${fieldName}: SAME ID (${hireSuffix})`);
      } else {
        // Search for similar IDs
        const baseName = hireSuffix.replace(/.*:/, '');
        const similar = step3Elements.filter((el: any) => el.id.includes(baseName));
        if (similar.length > 0) {
          console.log(`  ✗ ${fieldName}: DIFFERENT! Hire="${hireSuffix}" → Pending="${similar.map((s: any) => s.id).join(', ')}"`);
        } else {
          console.log(`  ? ${fieldName}: NOT FOUND (Hire="${hireSuffix}")`);
        }
      }
    }

    // === Also scroll down to see if more sections load ===
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    await captureFormElements(page, 'Step 3: After scroll');

    console.log('\n[Done] Inspection complete');
  } catch (err: any) {
    console.error('[Error]', err.message);
    await page.screenshot({ path: '/tmp/pending-worker-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
