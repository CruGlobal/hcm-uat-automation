#!/usr/bin/env npx tsx
/**
 * Inspect the Add Pending Worker wizard to find Staff Designation selectors.
 * Staff Designation is on Step 5 (Compensation and Other Information) of the 6-step wizard.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';

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
    console.log(`  ADF button "${buttonText}" not found`);
    return false;
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

async function dismissDialog(page: any): Promise<void> {
  const dialog = page.getByText('Matching Person Records');
  if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('  Dismissing "Matching Person Records"...');
    const btn = page.getByRole('button', { name: 'Continue' }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(5000);
    }
  }
}

async function clearGlassPane(page: any): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('.AFModalGlassPane').forEach(el => el.remove());
  });
}

async function getWizardTitle(page: any): Promise<string> {
  return page.evaluate(() => {
    const h1s = document.querySelectorAll('h1');
    for (const h of h1s) {
      const t = h.textContent?.trim() || '';
      if (t.includes('Pending Worker') || t.includes('Compensation')) return t;
    }
    return document.querySelector('h1')?.textContent?.trim() || '';
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  // Login
  console.log('Logging in...');
  await page.goto(`${HCM_URL}/fscmUI/faces/AtkHomePageWelcome`);
  await page.waitForLoadState('networkidle');
  await page.locator('#userid, input[name="userid"]').first().fill(USERNAME);
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page.locator('button:has-text("Sign In"), input[value="Sign In"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // Navigate to New Person > Add a Pending Worker
  console.log('Navigating to Add Pending Worker...');
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

  // Click "Add a Pending Worker"
  const pendingLink = page.getByRole('link', { name: 'Add a Pending Worker' });
  await pendingLink.waitFor({ timeout: 15000 });
  await pendingLink.click();
  console.log('Clicked "Add a Pending Worker"...');
  await page.waitForTimeout(10000);

  // Step 1: Fill minimal required fields
  const dateField = page.locator('[id$="SP1:inputDate1::content"]');
  const opened = await dateField.isVisible({ timeout: 30000 }).catch(() => false);
  if (!opened) {
    console.log('Wizard did not open.');
    await page.screenshot({ path: '/tmp/pending-not-opened.png', fullPage: true });
    await browser.close();
    return;
  }
  console.log('Step 1 opened.');

  // Fill Legal Employer
  const legalEmployer = page.locator('[id$="SP1:selectOneChoice3::content"]');
  if (await legalEmployer.isVisible({ timeout: 5000 }).catch(() => false)) {
    await legalEmployer.click();
    await legalEmployer.pressSequentially('Campus Crusade', { delay: 50 });
    await page.waitForTimeout(2000);
    await legalEmployer.press('Tab');
    await page.waitForTimeout(5000);
    console.log('  Legal Employer filled.');
  }

  // Fill Proposed Worker Type (required — "A selection is required" error if empty)
  const workerType = page.locator('[id$="SP1:selectOneChoice4::content"]');
  if (await workerType.isVisible({ timeout: 5000 }).catch(() => false)) {
    const wtId = await workerType.getAttribute('id') || '';
    const compId = wtId.replace('::content', '');
    await page.evaluate(({ id }: { id: string }) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return;
      const comp = adfPage.findComponentByAbsoluteId(id);
      if (!comp) return;
      const items = comp.getSelectItems?.();
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const label = items[i].getLabel?.() || '';
          if (label && !label.includes('--')) {
            comp.setValue(items[i].getValue());
            return;
          }
        }
      }
    }, { id: compId });
    await page.waitForTimeout(3000);
    const val = await workerType.inputValue().catch(() => '');
    console.log(`  Proposed Worker Type filled: "${val}"`);
  }

  // Fill Last Name
  const lastName = page.locator('[id$="it20::content"]').first();
  if (await lastName.isVisible({ timeout: 5000 }).catch(() => false)) {
    await lastName.fill('PendingInspect');
    await lastName.press('Tab');
    console.log('  Last Name filled.');
  }
  await page.waitForTimeout(1000);

  // Step 1 → Step 2
  console.log('Step 1 → Step 2...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(8000);
  await dismissDialog(page);
  console.log(`  Title: "${await getWizardTitle(page)}"`);

  // Step 2 → Step 3
  console.log('Step 2 → Step 3...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(8000);
  await dismissDialog(page);
  console.log(`  Title: "${await getWizardTitle(page)}"`);

  // Step 3 → Step 4
  console.log('Step 3 → Step 4...');
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(8000);
  await dismissDialog(page);
  console.log(`  Title: "${await getWizardTitle(page)}"`);

  // Fill Business Unit on Step 4 (required for advancing)
  console.log('Filling Business Unit on Step 4...');
  const bizUnit = page.locator('[id$="businessUnitId::content"]').first();
  if (await bizUnit.isVisible({ timeout: 5000 }).catch(() => false)) {
    await bizUnit.click();
    await bizUnit.fill('');
    await bizUnit.pressSequentially('Campus Crusade', { delay: 50 });
    await page.waitForTimeout(2000);
    await bizUnit.press('Tab');
    await page.waitForTimeout(5000);
    await clearGlassPane(page);
    const bizVal = await bizUnit.inputValue().catch(() => '');
    console.log(`  Business Unit: "${bizVal}"`);
  }
  await page.screenshot({ path: '/tmp/pending-step4-filled.png', fullPage: true });

  // Step 4 → Step 5 (Compensation — where Staff Designation should be)
  console.log('Step 4 → Step 5...');
  await clearGlassPane(page);
  await clickAdfButton(page, 'Next');
  await page.waitForTimeout(10000);
  await dismissDialog(page);
  
  const title = await getWizardTitle(page);
  console.log(`  Title: "${title}"`);
  await page.screenshot({ path: '/tmp/pending-step5-overview.png', fullPage: true });

  // If still stuck, try dismissing errors and retrying
  if (!title.includes('Compensation')) {
    console.log('  Not on Compensation step yet. Dismissing errors...');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a[role="button"]');
      for (const b of btns) {
        if (b.textContent?.trim() === 'OK' && (b as HTMLElement).offsetWidth > 0) {
          (b as HTMLElement).click();
        }
      }
    });
    await page.waitForTimeout(3000);
    await clearGlassPane(page);
    await clickAdfButton(page, 'Next');
    await page.waitForTimeout(10000);
    console.log(`  Title after retry: "${await getWizardTitle(page)}"`);
    await page.screenshot({ path: '/tmp/pending-step5-retry.png', fullPage: true });
  }

  // ========= INSPECT STEP 5 =========
  console.log('\n=== INSPECTING STEP 5 ===\n');

  // 1. Section headers
  console.log('--- Section Headers ---');
  const headers = await page.locator('h1, h2, h3').all();
  for (const h of headers) {
    if (await h.isVisible().catch(() => false)) {
      const text = (await h.textContent().catch(() => ''))?.trim().slice(0, 120) || '';
      const tag = await h.evaluate((e: Element) => e.tagName).catch(() => '');
      if (text) console.log(`  ${tag}: "${text}"`);
    }
  }

  // 2. All visible text (look for Staff/Designation)
  console.log('\n--- Page Text (staff/designation related) ---');
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
  const staffRelated = allText.filter(t => 
    /staff|designation|extra|eit|primary|account/i.test(t)
  );
  for (const t of staffRelated) console.log(`  "${t}"`);
  if (staffRelated.length === 0) console.log('  (none found)');

  // 3. All visible form fields
  console.log('\n--- All Visible Form Fields ---');
  const fields = await page.locator('input, select, textarea').all();
  for (const f of fields) {
    if (!await f.isVisible().catch(() => false)) continue;
    const id = await f.getAttribute('id').catch(() => '') || '';
    const aria = await f.getAttribute('aria-label').catch(() => '') || '';
    const val = await f.inputValue().catch(() => '') || '';
    const tag = await f.evaluate((e: Element) => e.tagName).catch(() => '');
    console.log(`  ${tag} id="${id}" aria="${aria}" value="${val.slice(0, 40)}"`);
  }

  // 4. Elements with Staff/Designation/Extra/EIT in ID (visible or not)
  console.log('\n--- Elements by ID Pattern (Staff/Designation/Extra/EIT) ---');
  for (const pattern of ['Staff', 'staff', 'Designation', 'designation', 'Extra', 'extra', 'EIT', 'eit', 'PEI', 'pei', 'Account', 'account', 'Primary', 'primary']) {
    const elems = await page.locator(`[id*="${pattern}"]`).all();
    for (const el of elems.slice(0, 10)) {
      const id = await el.getAttribute('id').catch(() => '') || '';
      const tag = await el.evaluate((e: Element) => e.tagName).catch(() => '');
      const visible = await el.isVisible().catch(() => false);
      if (visible || id.toLowerCase().includes('staff') || id.toLowerCase().includes('designation')) {
        const text = (await el.textContent().catch(() => ''))?.trim().slice(0, 80) || '';
        console.log(`  [${visible ? 'VIS' : 'hid'}] ${tag} id="${id}" text="${text}"`);
      }
    }
  }

  // 5. Add/Create buttons
  console.log('\n--- Add/Create Buttons ---');
  const addBtns = await page.locator('img[title*="Add"], a[title*="Add"], a[title*="Create"], img[title*="Create"], [id*="::add"], [id*="Create"]').all();
  for (const btn of addBtns) {
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;
    const id = await btn.getAttribute('id').catch(() => '') || '';
    const title = await btn.getAttribute('title').catch(() => '') || '';
    const tag = await btn.evaluate((e: Element) => e.tagName).catch(() => '');
    console.log(`  ${tag} id="${id}" title="${title}"`);
  }

  // 6. Scroll down and expand collapsed sections
  console.log('\n--- Expanding collapsed sections ---');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  const disclosures = await page.locator('a[class*="disclosure"], [class*="showDetailHeader"] a, .af_showDetailHeader_title-text0').all();
  for (const d of disclosures.slice(0, 15)) {
    if (!await d.isVisible().catch(() => false)) continue;
    const id = await d.getAttribute('id').catch(() => '') || '';
    const text = (await d.textContent().catch(() => ''))?.trim().slice(0, 60) || '';
    console.log(`  Expanding: id="${id}" text="${text}"`);
    await d.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: '/tmp/pending-step5-expanded.png', fullPage: true });

  // 7. Re-check after expansion
  console.log('\n--- After expansion: Staff/Designation elements ---');
  for (const pattern of ['Staff', 'staff', 'Designation', 'designation', 'Extra', 'extra', 'Account', 'account']) {
    const elems = await page.locator(`[id*="${pattern}"]`).all();
    for (const el of elems.slice(0, 10)) {
      const id = await el.getAttribute('id').catch(() => '') || '';
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        const tag = await el.evaluate((e: Element) => e.tagName).catch(() => '');
        const text = (await el.textContent().catch(() => ''))?.trim().slice(0, 80) || '';
        console.log(`  [VIS] ${tag} id="${id}" text="${text}"`);
      }
    }
  }

  // 8. Re-check form fields after expansion
  console.log('\n--- Form fields after expansion ---');
  const fields2 = await page.locator('input, select, textarea').all();
  for (const f of fields2) {
    if (!await f.isVisible().catch(() => false)) continue;
    const id = await f.getAttribute('id').catch(() => '') || '';
    const aria = await f.getAttribute('aria-label').catch(() => '') || '';
    if (id.toLowerCase().match(/staff|designat|extra|account|primary/) || 
        aria.toLowerCase().match(/staff|designat|extra|account|primary/)) {
      const val = await f.inputValue().catch(() => '') || '';
      const tag = await f.evaluate((e: Element) => e.tagName).catch(() => '');
      console.log(`  ** ${tag} id="${id}" aria="${aria}" value="${val}"`);
    }
  }

  // Full page text dump for context
  console.log('\n--- Full visible text (first 2000 chars) ---');
  console.log(allText.join('\n').slice(0, 2000));

  // Save screenshot
  await page.screenshot({ path: '/tmp/pending-step5-final.png', fullPage: true });

  // Cancel
  console.log('\nCancelling...');
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
  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
