#!/usr/bin/env npx tsx
/**
 * Deep inspector for Oracle HCM modules.
 * Uses direct URL navigation and ADF component inspection
 * to discover form selectors for each module.
 */
import { chromium, type Page, type Browser } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { TOTP } from 'otpauth';

dotenv.config();

const BASE_URL = process.env.ORACLE_HCM_URL || '';
const USERNAME = process.env.ORACLE_HCM_USERNAME || '';
const PASSWORD = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET || '';
const OUTPUT_DIR = path.resolve(process.cwd(), '.cache', 'inspect');

async function login(page: Page): Promise<void> {
  console.log('Logging in...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="identifier"]').fill(USERNAME);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await page.locator('a[aria-label="Select Google Authenticator."]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('a[aria-label="Select Google Authenticator."]').click();
  await page.waitForLoadState('networkidle');
  const totp = new TOTP({ secret: TOTP_SECRET });
  const code = totp.generate();
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(code);
  await page.locator('input[type="submit"]').click();
  await page.waitForURL('**/fscmUI/**', { timeout: 120000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  console.log('Logged in!');
}

/** Comprehensive element capture including Redwood/VB components */
async function captureAllElements(page: Page, name: string): Promise<any[]> {
  console.log(`  Capturing all elements for: ${name}`);

  // Wait for any lazy loading
  await page.waitForTimeout(3000);

  const elements = await page.evaluate(() => {
    const els: any[] = [];

    // All visible interactive elements
    const interactives = document.querySelectorAll(
      'input, select, textarea, button, [role="button"], [role="combobox"], ' +
      '[role="listbox"], [role="tab"], [role="menuitem"], ' +
      'a[id], [data-afr-fgrid], [id*="::content"], [id*="inputText"], ' +
      '[id*="inputDate"], [id*="inputCombobox"], [id*="selectOneChoice"], ' +
      '[id*="soc"], [id*="lov"]'
    );

    interactives.forEach(el => {
      const e = el as HTMLElement;
      if (e.offsetWidth === 0 && e.offsetHeight === 0) return;

      // Find label text
      let labelText = '';
      const labelEl = document.querySelector(`label[for="${e.id}"]`);
      if (labelEl) labelText = labelEl.textContent?.trim() || '';

      // Check for nearby label
      if (!labelText && e.parentElement) {
        const prevLabel = e.parentElement.querySelector('label');
        if (prevLabel) labelText = prevLabel.textContent?.trim() || '';
      }

      els.push({
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || '',
        id: e.id || '',
        name: e.getAttribute('name') || '',
        role: e.getAttribute('role') || '',
        ariaLabel: e.getAttribute('aria-label') || '',
        placeholder: (e as HTMLInputElement).placeholder || '',
        label: labelText.substring(0, 100),
        text: e.tagName === 'BUTTON' || e.getAttribute('role') === 'button'
          ? e.textContent?.trim().substring(0, 80) || '' : '',
        value: (e as HTMLInputElement).value?.substring(0, 100) || '',
        classes: e.className.substring(0, 200),
        dataAttr: e.getAttribute('data-afr-fgrid') || '',
      });
    });

    // Also capture VB/Redwood components
    const vbComponents = document.querySelectorAll(
      'oj-input-text, oj-input-date, oj-select-single, oj-combobox-one, ' +
      'oj-input-number, oj-text-area, oj-radioset, oj-checkboxset, ' +
      'oj-input-date-time, oj-button'
    );

    vbComponents.forEach(el => {
      const e = el as HTMLElement;
      if (e.offsetWidth === 0 && e.offsetHeight === 0) return;
      els.push({
        tag: e.tagName.toLowerCase(),
        id: e.id || '',
        label: e.getAttribute('label-hint') || e.getAttribute('label-edge') || '',
        value: e.getAttribute('value') || '',
        ariaLabel: e.getAttribute('aria-label') || '',
        classes: e.className.substring(0, 200),
        isVB: true,
      });
    });

    return els;
  });

  return elements;
}

/** Navigate via ADF using page.evaluate to avoid interception issues */
async function navigateViaAdf(page: Page, navNodeId: string): Promise<boolean> {
  console.log(`  Navigating via ADF to: ${navNodeId}`);
  try {
    const success = await page.evaluate((nodeId: string) => {
      const el = document.getElementById(nodeId) || document.querySelector(`[id$="${nodeId}"]`);
      if (!el) return false;

      // Try AdfActionEvent first
      const adfPage = (window as any).AdfPage?.PAGE;
      if (adfPage) {
        const comp = adfPage.findComponentByAbsoluteId(el.id);
        if (comp) {
          const evt = new (window as any).AdfActionEvent(comp);
          evt.queue();
          return true;
        }
      }

      // Fallback to click
      (el as HTMLElement).click();
      return true;
    }, navNodeId);

    if (success) {
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(8000);
    }
    return success;
  } catch (err) {
    console.log(`  ADF navigation error: ${err}`);
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    await login(page);

    // === Navigate to Absence Administration (My Client Groups > Absences) ===
    console.log('\n=== Absence Administration ===');
    const absNavId = 'pt1:_UISnvr:0:nv_itemNode_workforce_management_absence_administration';
    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    const showMore = page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    if (await navigateViaAdf(page, absNavId)) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'absence-admin-deep.png'), fullPage: true });
      const absElements = await captureAllElements(page, 'absence-admin');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'absence-admin-deep.json'), JSON.stringify(absElements, null, 2));
      console.log(`  Captured ${absElements.length} elements`);

      // Try to find and click "Add Absence" or similar
      const addBtns = absElements.filter((e: any) =>
        (e.text || '').toLowerCase().includes('add') ||
        (e.ariaLabel || '').toLowerCase().includes('add') ||
        (e.text || '').toLowerCase().includes('create')
      );
      console.log(`  Add/Create buttons: ${JSON.stringify(addBtns.map((b: any) => ({ id: b.id, text: b.text })))}`);
    }

    // === Navigate to Absences self-service (Me > Time and Absences) ===
    console.log('\n=== Absence Self-Service ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    const absESSId = 'pt1:_UISnvr:0:nv_itemNode_my_information_absences1';
    if (await navigateViaAdf(page, absESSId)) {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'absence-ess-deep.png'), fullPage: true });
      const absESSElements = await captureAllElements(page, 'absence-ess');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'absence-ess-deep.json'), JSON.stringify(absESSElements, null, 2));
      console.log(`  Captured ${absESSElements.length} elements`);
    }

    // === Navigate to Benefits (Me > Benefits) ===
    console.log('\n=== Benefits Self-Service ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    const benId = 'pt1:_UISnvr:0:nv_itemNode_itemNode_my_information_benefits_Redwood';
    if (await navigateViaAdf(page, benId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'benefits-ess-deep.png'), fullPage: true });
      const benElements = await captureAllElements(page, 'benefits-ess');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'benefits-ess-deep.json'), JSON.stringify(benElements, null, 2));
      console.log(`  Captured ${benElements.length} elements`);
    }

    // === Navigate to Benefits Administration ===
    console.log('\n=== Benefits Administration ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const benAdminId = 'pt1:_UISnvr:0:nv_itemNode_groupNode_benefits_BenefitsActivityCenter';
    if (await navigateViaAdf(page, benAdminId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'benefits-admin-deep.png'), fullPage: true });
      const benAdminElements = await captureAllElements(page, 'benefits-admin');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'benefits-admin-deep.json'), JSON.stringify(benAdminElements, null, 2));
      console.log(`  Captured ${benAdminElements.length} elements`);
    }

    // === Navigate to Workforce Compensation ===
    console.log('\n=== Workforce Compensation ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    const compId = 'pt1:_UISnvr:0:nv_itemNode_manager_resources_workforce_compensation';
    if (await navigateViaAdf(page, compId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'compensation-deep.png'), fullPage: true });
      const compElements = await captureAllElements(page, 'compensation');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'compensation-deep.json'), JSON.stringify(compElements, null, 2));
      console.log(`  Captured ${compElements.length} elements`);
    }

    // === Navigate to Workforce Structures ===
    console.log('\n=== Workforce Structures ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const wsId = 'pt1:_UISnvr:0:nv_itemNode_workforce_management_workforce_structures';
    if (await navigateViaAdf(page, wsId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'workforce-structures-deep.png'), fullPage: true });
      const wsElements = await captureAllElements(page, 'workforce-structures');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'workforce-structures-deep.json'), JSON.stringify(wsElements, null, 2));
      console.log(`  Captured ${wsElements.length} elements`);
    }

    // === Navigate to Journeys (My Client Groups > Journeys) ===
    console.log('\n=== Journeys Admin ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const jrnAdminId = 'pt1:_UISnvr:0:nv_itemNode_workforce_management_Journeys';
    if (await navigateViaAdf(page, jrnAdminId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'journeys-admin-deep.png'), fullPage: true });
      const jrnElements = await captureAllElements(page, 'journeys-admin');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'journeys-admin-deep.json'), JSON.stringify(jrnElements, null, 2));
      console.log(`  Captured ${jrnElements.length} elements`);
    }

    // === Navigate to Scheduled Processes (for payroll flows) ===
    console.log('\n=== Scheduled Processes ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const schedId = 'pt1:_UISnvr:0:nv_itemNode_tools_scheduled_processes_fuse_plus';
    if (await navigateViaAdf(page, schedId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'scheduled-processes-deep.png'), fullPage: true });
      const schedElements = await captureAllElements(page, 'scheduled-processes');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'scheduled-processes-deep.json'), JSON.stringify(schedElements, null, 2));
      console.log(`  Captured ${schedElements.length} elements`);
    }

    // === Navigate to Pay (Me > Pay) - for W-4, Direct Deposit ===
    console.log('\n=== Pay Self-Service ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    const payESSId = 'pt1:_UISnvr:0:nv_itemNode_my_information_pay';
    if (await navigateViaAdf(page, payESSId)) {
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'pay-ess-deep.png'), fullPage: true });
      const payElements = await captureAllElements(page, 'pay-ess');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'pay-ess-deep.json'), JSON.stringify(payElements, null, 2));
      console.log(`  Captured ${payElements.length} elements`);
    }

    // === Person Management - search and actions menu ===
    console.log('\n=== Person Management - Actions ===');
    await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);

    await page.locator('a[title="Navigator"]').click({ force: true });
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const pmId = 'pt1:_UISnvr:0:nv_itemNode_workforce_management_person_management';
    if (await navigateViaAdf(page, pmId)) {
      await page.waitForTimeout(8000);

      // Search for a person
      const searchName = page.locator('[id$="q1:value00::content"]');
      if (await searchName.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchName.fill('Johnson');
        await page.locator('[id$="q1::search"]').click();
        await page.waitForTimeout(8000);

        // Click first result
        const firstResult = page.locator('table[id*="resId1"] tbody tr:first-child a, [id*="resId1"] [role="row"] a').first();
        if (await firstResult.isVisible({ timeout: 10000 }).catch(() => false)) {
          await firstResult.click();
          await page.waitForTimeout(8000);

          await page.screenshot({ path: path.join(OUTPUT_DIR, 'person-detail-deep.png'), fullPage: true });
          const personElements = await captureAllElements(page, 'person-detail');
          fs.writeFileSync(path.join(OUTPUT_DIR, 'person-detail-deep.json'), JSON.stringify(personElements, null, 2));
          console.log(`  Captured ${personElements.length} elements`);

          // Try to find the Actions menu
          const actionsBtn = page.locator('button:has-text("Actions"), [id*="Actions"], a:has-text("Actions")').first();
          if (await actionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await actionsBtn.click();
            await page.waitForTimeout(3000);

            // Capture actions menu items
            const actionItems = await page.evaluate(() => {
              const items: any[] = [];
              document.querySelectorAll('[role="menuitem"], [role="menu"] a, [role="menu"] li').forEach(el => {
                const e = el as HTMLElement;
                if (e.offsetWidth === 0 && e.offsetHeight === 0) return;
                items.push({
                  tag: e.tagName.toLowerCase(),
                  id: e.id,
                  text: e.textContent?.trim().substring(0, 80) || '',
                  role: e.getAttribute('role') || '',
                });
              });
              return items;
            });

            fs.writeFileSync(path.join(OUTPUT_DIR, 'person-actions-menu.json'), JSON.stringify(actionItems, null, 2));
            console.log(`  Actions menu items: ${actionItems.length}`);
            await page.screenshot({ path: path.join(OUTPUT_DIR, 'person-actions-menu.png'), fullPage: true });
          }
        }
      }
    }

    console.log('\n=== Deep inspection complete ===');
  } catch (err) {
    console.error('Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'deep-error.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
