#!/usr/bin/env npx tsx
/**
 * Inspect the "Add a Pending Worker" wizard (6-step) to find the Staff Designation section.
 * Staff Designation should be on Step 5 (Compensation and Other Information).
 *
 * 6-step wizard:
 *   Step 1: Identification
 *   Step 2: Person Information
 *   Step 3: Person Profile (skip)
 *   Step 4: Employment Information
 *   Step 5: Compensation and Other Information  ← INSPECT THIS
 *   Step 6: Review → Submit
 */
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';

const findings: string[] = [];

function log(msg: string) {
  console.log(msg);
  findings.push(msg);
}

async function clickAdfButton(page: Page, buttonText: string): Promise<boolean> {
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
    console.log(`  ADF button "${buttonText}" not found, trying force click...`);
    const btn = page.getByRole('button', { name: buttonText });
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ force: true });
    } else {
      console.log(`  Button "${buttonText}" not visible either.`);
      return false;
    }
    return true;
  }

  await page.evaluate((id: string) => {
    const adfPage = (window as any).AdfPage.PAGE;
    const comp = adfPage.findComponentByAbsoluteId(id);
    const evt = new (window as any).AdfActionEvent(comp);
    evt.queue();
  }, componentId);

  await page.waitForTimeout(2000);
  await page.waitForFunction(() => {
    try {
      const ctx = (window as any).oj?.Context?.getPageContext()?.getBusyContext();
      return ctx ? ctx.isReady() : true;
    } catch { return true; }
  }, { timeout: 30000 }).catch(() => {});
  return true;
}

async function dismissMatchingPersonDialog(page: Page): Promise<void> {
  const dialog = page.getByText('Matching Person Records');
  if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Dismissing "Matching Person Records" dialog...');
    const btn = page.getByRole('button', { name: 'Continue' }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(5000);
    }
  }
}

async function dismissErrorDialogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a[role="button"]');
    for (const b of btns) {
      if (b.textContent?.trim() === 'OK' && (b as HTMLElement).offsetWidth > 0) {
        (b as HTMLElement).click();
      }
    }
  });
  await page.waitForTimeout(2000);
}

async function clearGlassPane(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const glass = document.querySelector('.AFModalGlassPane');
    return !glass || glass.getBoundingClientRect().width === 0;
  }, { timeout: 30000 }).catch(() => console.log('  Glass pane wait timed out'));
  await page.evaluate(() => {
    document.querySelectorAll('.AFModalGlassPane').forEach(el => el.remove());
  });
}

async function getStepTitle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const h1s = document.querySelectorAll('h1');
    for (const h of h1s) {
      const t = h.textContent?.trim() || '';
      if (t.length > 5 && t.length < 200) return t;
    }
    return '';
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  findings.push('# Add Pending Worker — Step 5 Inspection');
  findings.push(`Date: ${new Date().toISOString()}`);
  findings.push('');

  // ========== LOGIN ==========
  console.log('Logging in...');
  await page.goto(`${HCM_URL}/fscmUI/faces/AtkHomePageWelcome`);
  await page.waitForLoadState('networkidle');
  await page.locator('#userid, input[name="userid"]').first().fill(USERNAME);
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page.locator('button:has-text("Sign In"), input[value="Sign In"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // ========== NAVIGATE TO ADD A PENDING WORKER ==========
  console.log('Navigating to New Person > Add a Pending Worker...');
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")');
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(1000);
  }
  await page.locator('a[title="New Person"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  const pendingLink = page.getByRole('link', { name: 'Add a Pending Worker' });
  await pendingLink.waitFor({ timeout: 15000 });
  await pendingLink.click();
  console.log('Clicked "Add a Pending Worker", waiting for wizard...');
  await page.waitForTimeout(10000);

  // ========== STEP 1: Identification ==========
  const dateField = page.locator('[id$="SP1:inputDate1::content"]');
  const opened = await dateField.isVisible({ timeout: 30000 }).catch(() => false);
  if (!opened) {
    console.log('Wizard did not open!');
    await page.screenshot({ path: '/tmp/apw-wizard-not-opened.png', fullPage: true });
    await browser.close();
    return;
  }
  console.log('Step 1 (Identification) opened.');
  await page.screenshot({ path: '/tmp/apw-step1.png', fullPage: true });

  // Fill Legal Employer (required) — ADF selectOneChoice dropdown
  console.log('  Filling Legal Employer...');
  const legalEmployer = page.locator('[id$="SP1:selectOneChoice3::content"]');
  if (await legalEmployer.isVisible({ timeout: 5000 }).catch(() => false)) {
    await legalEmployer.click();
    await legalEmployer.pressSequentially('Campus Crusade', { delay: 50 });
    await page.waitForTimeout(2000);
    await legalEmployer.press('Tab');
    await page.waitForTimeout(5000);
    await clearGlassPane(page);
    console.log('  Legal Employer filled.');
  }

  // Fill Proposed Worker Type (required) — ADF selectOneChoice dropdown
  console.log('  Filling Proposed Worker Type...');
  const workerType = page.locator('[id$="SP1:selectOneChoice4::content"]');
  if (await workerType.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Try ADF setValue first (more reliable for selectOneChoice)
    const setResult = await page.evaluate(() => {
      try {
        const adfPage = (window as any).AdfPage?.PAGE;
        if (!adfPage) return 'no AdfPage';
        // Find the selectOneChoice4 component
        const allInputs = document.querySelectorAll('input[id*="selectOneChoice4"]');
        for (const inp of allInputs) {
          let el: any = inp;
          for (let i = 0; i < 8; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.id && !el.id.includes('::')) {
              const comp = adfPage.findComponentByAbsoluteId(el.id);
              if (comp && comp.getSelectItems) {
                const items = comp.getSelectItems();
                // List available options
                const opts: string[] = [];
                for (const item of items) {
                  const label = item.getLabel?.() || item.label || '';
                  const value = item.getValue?.() || item.value || '';
                  opts.push(`${label}=${value}`);
                }
                // Find "Employee" option
                for (const item of items) {
                  const label = (item.getLabel?.() || item.label || '').toLowerCase();
                  if (label.includes('employee')) {
                    const value = item.getValue?.() || item.value || '';
                    comp.setValue(value);
                    return `Set to Employee (value=${value}). All options: ${opts.join(', ')}`;
                  }
                }
                return `Employee not found. Available options: ${opts.join(', ')}`;
              }
            }
          }
        }
        return 'component not found';
      } catch (e: any) {
        return `error: ${e.message}`;
      }
    });
    console.log(`  Proposed Worker Type ADF result: ${setResult}`);

    // Fallback: click dropdown and select via UI
    if (setResult.includes('not found') || setResult.includes('error')) {
      // Click the dropdown arrow to open options
      const dropdownArrow = page.locator('[id$="SP1:selectOneChoice4::drop"]');
      if (await dropdownArrow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dropdownArrow.click();
        await page.waitForTimeout(1000);
        // Try to click "Employee" option
        const employeeOpt = page.locator('li').filter({ hasText: /^Employee$/ }).first();
        if (await employeeOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
          await employeeOpt.click();
          console.log('  Selected Employee via dropdown UI.');
        }
      }
    }

    await page.waitForTimeout(2000);
    await clearGlassPane(page);
    // Log the current value
    const currentVal = await workerType.inputValue().catch(() => '');
    console.log(`  Proposed Worker Type current value: "${currentVal}"`);
  }

  // Fill Last Name (required)
  console.log('  Filling Last Name...');
  const lastName = page.locator('[id$="it20::content"]').first();
  if (await lastName.isVisible({ timeout: 5000 }).catch(() => false)) {
    await lastName.fill('InspectTest');
    await lastName.press('Tab');
    console.log('  Last Name filled.');
  } else {
    const lnAlt = page.getByLabel('Last Name').first();
    await lnAlt.fill('InspectTest');
    await lnAlt.press('Tab');
    console.log('  Last Name filled (fallback).');
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/apw-step1-filled.png', fullPage: true });

  // Dump any validation errors before clicking Next
  const errors = await page.evaluate(() => {
    const msgs: string[] = [];
    document.querySelectorAll('.x24d, [id*="msgDlg"], .af_message, [class*="error"], [class*="Error"]').forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length < 300 && t.length > 2) msgs.push(t);
    });
    return [...new Set(msgs)];
  });
  if (errors.length > 0) {
    console.log('  Validation errors on Step 1:', errors);
  }

  // Helper: click Next and advance, with retry
  async function advanceStep(fromStep: number, toStep: number): Promise<string> {
    const stepNames = ['', 'Identification', 'Person Information', 'Person Profile', 'Employment Information', 'Compensation and Other Information', 'Review'];
    console.log(`Step ${fromStep} → Step ${toStep} (${stepNames[toStep]})...`);
    await clearGlassPane(page);
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(8000);
    await dismissMatchingPersonDialog(page);
    let title = await getStepTitle(page);
    console.log(`  Title: "${title}"`);

    // If we didn't advance, dismiss errors and retry once
    if (!title.toLowerCase().includes(stepNames[toStep].toLowerCase().split(' ')[0].toLowerCase())) {
      console.log(`  May not have advanced. Checking for errors...`);
      const errs = await page.evaluate(() => {
        const msgs: string[] = [];
        document.querySelectorAll('.x24d, .af_message, [class*="error"], [class*="Error"]').forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length < 300 && t.length > 2) msgs.push(t);
        });
        return [...new Set(msgs)];
      });
      if (errs.length > 0) console.log(`  Errors: ${errs.join('; ')}`);

      await dismissErrorDialogs(page);
      await clearGlassPane(page);
      await clickAdfButton(page, 'Next');
      await page.waitForTimeout(8000);
      await dismissMatchingPersonDialog(page);
      title = await getStepTitle(page);
      console.log(`  Title after retry: "${title}"`);
    }
    await page.screenshot({ path: `/tmp/apw-step${toStep}.png`, fullPage: true });
    return title;
  }

  // ========== NAVIGATE THROUGH STEPS 1→5 ==========
  let title = await advanceStep(1, 2);

  // If stuck on Step 1, the "Proposed Worker Type" might still need attention
  if (title.toLowerCase().includes('identification')) {
    console.log('  STUCK on Step 1! Dumping all dropdown values...');
    const dropdownInfo = await page.evaluate(() => {
      const result: Record<string, string> = {};
      const selects = document.querySelectorAll('input[id*="selectOneChoice"]');
      for (const s of selects) {
        const id = s.id;
        const val = (s as HTMLInputElement).value;
        result[id.replace(/.*:/, '')] = val;
      }
      return result;
    });
    console.log('  Dropdown values:', JSON.stringify(dropdownInfo));

    // Try clicking the dropdown arrow and selecting the first non-empty option
    console.log('  Trying to set Proposed Worker Type via dropdown click...');
    const dropArrow = page.locator('[id$="SP1:selectOneChoice4::drop"]');
    if (await dropArrow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dropArrow.click({ force: true });
      await page.waitForTimeout(1500);
      // Screenshot to see the dropdown options
      await page.screenshot({ path: '/tmp/apw-step1-dropdown.png', fullPage: true });

      // Try to select any visible list item that's not blank
      const selectedOption = await page.evaluate(() => {
        const items = document.querySelectorAll('li[role="option"], li.af_selectOneChoice_item');
        for (const item of items) {
          const text = item.textContent?.trim() || '';
          if (text && text !== '' && !text.includes('--')) {
            (item as HTMLElement).click();
            return text;
          }
        }
        // Also try table-based dropdown options (ADF uses tables in some dropdowns)
        const rows = document.querySelectorAll('table[id*="selectOneChoice4"] tr, [id*="selectOneChoice4::pop"] li');
        for (const row of rows) {
          const text = row.textContent?.trim() || '';
          if (text && text !== '' && !text.includes('--')) {
            (row as HTMLElement).click();
            return text;
          }
        }
        return null;
      });
      console.log(`  Selected option: ${selectedOption}`);
      await page.waitForTimeout(2000);
      await clearGlassPane(page);
    } else {
      // Try typing "Employee" directly
      const wt = page.locator('[id$="SP1:selectOneChoice4::content"]');
      await wt.click();
      await wt.fill('');
      await wt.pressSequentially('Employee', { delay: 50 });
      await page.waitForTimeout(1000);
      await wt.press('Tab');
      await page.waitForTimeout(3000);
      await clearGlassPane(page);
    }

    // Retry Next
    title = await advanceStep(1, 2);
  }

  title = await advanceStep(2, 3);
  title = await advanceStep(3, 4);

  // Step 4 (Employment Information) requires Business Unit — fill it before advancing
  console.log('  Filling Business Unit on Step 4 (required)...');
  const bizUnit = page.locator('[id$="businessUnitId::content"]').first();
  if (await bizUnit.isVisible({ timeout: 5000 }).catch(() => false)) {
    await bizUnit.click();
    await bizUnit.fill('');
    await bizUnit.pressSequentially('Campus Crusade', { delay: 50 });
    await page.waitForTimeout(3000);
    await bizUnit.press('Tab');
    await page.waitForTimeout(5000);
    await clearGlassPane(page);
    const bizVal = await bizUnit.inputValue().catch(() => '');
    console.log(`  Business Unit value: "${bizVal}"`);
    if (!bizVal || bizVal === 'Campus Crusade') {
      // If autocomplete didn't resolve, try "Cru" or search for exact name
      console.log('  Business Unit may not have resolved. Trying "Cru"...');
      await bizUnit.click();
      await bizUnit.fill('');
      await bizUnit.pressSequentially('Cru', { delay: 50 });
      await page.waitForTimeout(3000);
      await bizUnit.press('Tab');
      await page.waitForTimeout(5000);
      await clearGlassPane(page);
      const bizVal2 = await bizUnit.inputValue().catch(() => '');
      console.log(`  Business Unit value after retry: "${bizVal2}"`);
    }
  }
  await page.screenshot({ path: '/tmp/apw-step4-filled.png', fullPage: true });

  // Dismiss any error dialog about Business Unit
  await dismissErrorDialogs(page);
  await clearGlassPane(page);

  title = await advanceStep(4, 5);

  // Final check: if still not on Compensation step, try one more time
  if (!title.toLowerCase().includes('compensation')) {
    console.log('Not on Compensation step. One final retry...');
    await dismissErrorDialogs(page);
    await clearGlassPane(page);
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    title = await getStepTitle(page);
    console.log(`  Title after final retry: "${title}"`);
    await page.screenshot({ path: '/tmp/apw-step5-final-retry.png', fullPage: true });
  }

  findings.push(`## Current Step Title: "${title}"`);
  findings.push('');

  // ========== THOROUGH INSPECTION OF STEP 5 ==========
  console.log('\n========================================');
  console.log('=== INSPECTING STEP 5 IN DETAIL ===');
  console.log('========================================\n');

  // ----- 1. Search for Staff/Designation/Extra/EIT/PEI elements by ID -----
  log('\n## Elements by ID Pattern (Staff/Designation/Extra/EIT/PEI)');
  for (const pattern of ['Staff', 'staff', 'Designation', 'designation', 'Extra', 'extra', 'EIT', 'eit', 'PEI', 'pei']) {
    const elems = await page.locator(`[id*="${pattern}"]`).all();
    for (const el of elems.slice(0, 15)) {
      const id = await el.getAttribute('id').catch(() => '') || '';
      const tag = await el.evaluate((e: Element) => e.tagName).catch(() => '');
      const visible = await el.isVisible().catch(() => false);
      const text = (await el.textContent().catch(() => ''))?.trim().slice(0, 100) || '';
      const cls = await el.getAttribute('class').catch(() => '') || '';
      log(`  [${visible ? 'VISIBLE' : 'hidden'}] ${tag} id="${id}" class="${cls.slice(0, 60)}" text="${text}"`);
    }
  }

  // ----- 2. Section headers (h1, h2, h3, .af_showDetailHeader) -----
  log('\n## Section Headers');
  const headers = await page.locator('h1, h2, h3, .af_showDetailHeader, [class*="panelHeader"], label[class*="Header"]').all();
  for (const h of headers) {
    if (!await h.isVisible().catch(() => false)) continue;
    const id = await h.getAttribute('id').catch(() => '') || '';
    const text = (await h.textContent().catch(() => ''))?.trim().slice(0, 120) || '';
    const tag = await h.evaluate((e: Element) => e.tagName).catch(() => '');
    const cls = await h.getAttribute('class').catch(() => '') || '';
    if (text) log(`  ${tag} id="${id}" class="${cls.slice(0, 60)}" text="${text}"`);
  }

  // ----- 3. All Add/Create buttons and icons -----
  log('\n## Add/Create Buttons');
  const addBtns = await page.locator('img[title*="Add"], img[title*="Create"], a[title*="Add"], a[title*="Create"], [id*="::add"], [id*="Create"]').all();
  const addBtns2 = await page.locator('button, a, [role="button"]').filter({ hasText: /add|create|new/i }).all();
  const allAdds = [...addBtns, ...addBtns2];
  const seenIds = new Set<string>();
  for (const btn of allAdds) {
    if (!await btn.isVisible().catch(() => false)) continue;
    const id = await btn.getAttribute('id').catch(() => '') || '';
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const text = (await btn.textContent().catch(() => ''))?.trim().slice(0, 80) || '';
    const titleAttr = await btn.getAttribute('title').catch(() => '') || '';
    const tag = await btn.evaluate((e: Element) => e.tagName).catch(() => '');
    log(`  ${tag} id="${id}" text="${text}" title="${titleAttr}"`);
  }

  // ----- 4. All visible form inputs with IDs and aria-labels -----
  log('\n## All Visible Form Fields');
  const allInputs = await page.locator('input, select, textarea').all();
  for (const inp of allInputs) {
    if (!await inp.isVisible().catch(() => false)) continue;
    const id = await inp.getAttribute('id').catch(() => '') || '';
    const ariaLabel = await inp.getAttribute('aria-label').catch(() => '') || '';
    const name = await inp.getAttribute('name').catch(() => '') || '';
    const type = await inp.getAttribute('type').catch(() => '') || '';
    const tag = await inp.evaluate((e: Element) => e.tagName).catch(() => '');
    const value = await inp.inputValue().catch(() => '') || '';
    const readonly = await inp.getAttribute('readonly').catch(() => null);
    const disabled = await inp.getAttribute('disabled').catch(() => null);
    log(`  ${tag} id="${id}" type="${type}" aria="${ariaLabel}" name="${name}" value="${value.slice(0, 50)}" ${readonly ? 'READONLY' : ''} ${disabled ? 'DISABLED' : ''}`);
  }

  // ----- 5. Dump visible page text -----
  log('\n## Visible Page Text');
  const allText = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim();
      if (t && t.length > 1 && t.length < 200) {
        const parent = node.parentElement;
        if (parent && parent.offsetParent !== null) texts.push(t);
      }
    }
    return [...new Set(texts)];
  });
  log('```');
  log(allText.join('\n').slice(0, 5000));
  log('```');

  // ----- 6. Try expanding any collapsed disclosure panels -----
  log('\n## Expanding Collapsed Sections');
  const disclosures = await page.locator(
    'a[class*="disclosure"], [class*="showDetailHeader"] a, .af_showDetailHeader_title-text0, ' +
    '.af_panelBox_header, [class*="panelAccordion"] a'
  ).all();
  for (const d of disclosures.slice(0, 15)) {
    if (!await d.isVisible().catch(() => false)) continue;
    const id = await d.getAttribute('id').catch(() => '') || '';
    const text = (await d.textContent().catch(() => ''))?.trim().slice(0, 80) || '';
    log(`  Expanding: id="${id}" text="${text}"`);
    try {
      await d.click({ force: true });
      await page.waitForTimeout(2000);
    } catch (e) {
      log(`    Click failed: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  await page.screenshot({ path: '/tmp/apw-step5-expanded.png', fullPage: true });

  // ----- 7. Re-check for Staff/Designation elements after expansion -----
  log('\n## After Expansion: Staff/Designation/Extra/EIT Elements');
  for (const pattern of ['Staff', 'staff', 'Designation', 'designation', 'Extra', 'extra', 'EIT', 'eit', 'PEI', 'pei']) {
    const elems = await page.locator(`[id*="${pattern}"]`).all();
    for (const el of elems.slice(0, 15)) {
      const id = await el.getAttribute('id').catch(() => '') || '';
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const tag = await el.evaluate((e: Element) => e.tagName).catch(() => '');
      const text = (await el.textContent().catch(() => ''))?.trim().slice(0, 100) || '';
      log(`  [VISIBLE] ${tag} id="${id}" text="${text}"`);
    }
  }

  // ----- 8. Re-check all form fields after expansion -----
  log('\n## Form Fields After Expansion');
  const fields2 = await page.locator('input, select, textarea').all();
  for (const f of fields2) {
    if (!await f.isVisible().catch(() => false)) continue;
    const id = await f.getAttribute('id').catch(() => '') || '';
    const ariaLabel = await f.getAttribute('aria-label').catch(() => '') || '';
    const tag = await f.evaluate((e: Element) => e.tagName).catch(() => '');
    const value = await f.inputValue().catch(() => '') || '';
    const readonly = await f.getAttribute('readonly').catch(() => null);
    log(`  ${tag} id="${id}" aria="${ariaLabel}" value="${value.slice(0, 50)}" ${readonly ? 'READONLY' : ''}`);
  }
  await page.screenshot({ path: '/tmp/apw-step5-fields-expanded.png', fullPage: true });

  // ----- 9. ADF Component Tree analysis -----
  log('\n## ADF Component Tree Analysis');
  const adfResult = await page.evaluate(() => {
    try {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return 'AdfPage not available';
      const root = adfPage.findComponent('pt1');
      if (!root) return 'Root component pt1 not found';

      const found: string[] = [];
      function search(comp: any, depth: number) {
        if (depth > 10) return;
        const id = comp.getClientId?.() || comp.getId?.() || '';
        const type = comp.getComponentType?.() || '';
        if (id.toLowerCase().match(/staff|designation|extra|eit|pei|person.*info/i)) {
          found.push(`${'  '.repeat(depth)}${type} id="${id}"`);
        }
        try {
          const kids = comp.getChildComponents?.() || [];
          for (const kid of kids) {
            search(kid, depth + 1);
          }
        } catch {}
      }
      search(root, 0);
      return found.length > 0 ? found : 'No matching ADF components found';
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  });
  log(`  ADF results: ${JSON.stringify(adfResult, null, 2)}`);

  // ----- 10. Deep DOM search: find all tables (often EIT sections use af_table) -----
  log('\n## Tables on Step 5');
  const tables = await page.locator('table[id], [class*="af_table"]').all();
  for (const t of tables.slice(0, 20)) {
    if (!await t.isVisible().catch(() => false)) continue;
    const id = await t.getAttribute('id').catch(() => '') || '';
    const cls = await t.getAttribute('class').catch(() => '') || '';
    const text = (await t.textContent().catch(() => ''))?.trim().slice(0, 150) || '';
    log(`  TABLE id="${id}" class="${cls.slice(0, 60)}" text="${text}"`);
  }

  // ----- 11. Check for train stops / progress indicators -----
  log('\n## Train Stops / Progress Indicators');
  const trainStops = await page.locator('[class*="train"], [class*="Train"], [role="progressbar"], [class*="step"]').all();
  for (const ts of trainStops.slice(0, 20)) {
    if (!await ts.isVisible().catch(() => false)) continue;
    const id = await ts.getAttribute('id').catch(() => '') || '';
    const text = (await ts.textContent().catch(() => ''))?.trim().slice(0, 100) || '';
    const cls = await ts.getAttribute('class').catch(() => '') || '';
    log(`  id="${id}" class="${cls.slice(0, 60)}" text="${text}"`);
  }

  // ----- 12. Broad DOM structure dump -----
  log('\n## DOM Structure (panels and regions)');
  const domStructure = await page.evaluate(() => {
    const result: string[] = [];
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const id = el.id || '';
      if (!id) continue;
      // Look for panel-like containers
      if (id.match(/panel|region|pgl|pfl|showDetail|section|box|group|tab/i) ||
          el.className?.toString().match(/af_panelBox|af_showDetail|af_panelGroup|af_region/)) {
        const vis = (el as HTMLElement).offsetWidth > 0;
        if (!vis) continue;
        const text = el.textContent?.trim().slice(0, 120) || '';
        // Only include if it mentions compensation, salary, staff, designation, extra, etc.
        const lowerText = text.toLowerCase();
        if (lowerText.match(/staff|designation|extra|eit|pei|salary|compensation|other|info/)) {
          result.push(`${el.tagName} id="${id}" text="${text}"`);
        }
      }
    }
    return result.slice(0, 50);
  });
  for (const item of domStructure) {
    log(`  ${item}`);
  }

  // ----- 13. Full visible text after expansion (re-check) -----
  log('\n## Full Visible Text After Expansion');
  const allText2 = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim();
      if (t && t.length > 1 && t.length < 200) {
        const parent = node.parentElement;
        if (parent && parent.offsetParent !== null) texts.push(t);
      }
    }
    return [...new Set(texts)];
  });
  log('```');
  log(allText2.join('\n').slice(0, 5000));
  log('```');

  // Take final screenshot
  await page.screenshot({ path: '/tmp/apw-step5-final.png', fullPage: true });

  // ========== CANCEL WIZARD ==========
  console.log('\nCancelling wizard...');
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(2000);
    const yesBtn = page.getByRole('button', { name: 'Yes' });
    if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yesBtn.click();
    }
  }
  await page.waitForTimeout(2000);

  // ========== SAVE FINDINGS ==========
  const report = findings.join('\n');
  fs.writeFileSync('/tmp/add-pending-worker-inspection.md', report);
  console.log('\n========================================');
  console.log('Screenshots saved to /tmp/apw-step*.png');
  console.log('Report saved to /tmp/add-pending-worker-inspection.md');
  console.log('========================================');

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
