#!/usr/bin/env npx tsx
/**
 * Inspect EIT creation flow for a person WITHOUT existing Staff Account and Designation.
 * Search by name for clone bot users which likely don't have EIT data.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';

const findings: string[] = [];
function log(msg: string) {
  console.log(msg);
  findings.push(msg);
}

async function removeGlassPane(page: any) {
  await page.evaluate(() =>
    document.querySelectorAll('.AFModalGlassPane').forEach((el: any) => el.remove())
  );
}

async function waitForGlassPaneClear(page: any) {
  await page.waitForFunction(() => {
    const g = document.querySelector('.AFModalGlassPane');
    return !g || g.getBoundingClientRect().width === 0;
  }, { timeout: 30000 }).catch(() => {});
}

async function closeNavigator(page: any) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await page.evaluate(() =>
    document.querySelectorAll('.AFModalGlassPane').forEach((el: any) => el.remove())
  );
}

async function screenshot(page: any, name: string) {
  const path = `/tmp/pei-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  Screenshot: ${path}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  log('# Person EIT CREATE Inspection - Staff Account and Designation');
  log(`Date: ${new Date().toISOString()}`);
  log('');

  // Login
  console.log('Logging in...');
  await page.goto(`${HCM_URL}/fscmUI/faces/AtkHomePageWelcome`);
  await page.waitForLoadState('networkidle');
  await page.locator('#userid').first().fill(USERNAME);
  await page.locator('#password').first().fill(PASSWORD);
  await page.locator('button:has-text("Sign In"), input[value="Sign In"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // Navigate to Person Management
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")');
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(1000);
  }
  await page.locator('a[title="Person Management"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await closeNavigator(page);
  await page.waitForTimeout(2000);

  // Search by PersonNumber for a test-created person without EIT data
  const SEARCH_PERSON_NUM = '10818059'; // "Affiliate HR-237" — test-created, no EIT data
  console.log(`Searching for person ${SEARCH_PERSON_NUM}...`);
  const numField = page.locator('[id$="q1:value10::content"]').first();
  await numField.waitFor({ timeout: 10000 });
  await numField.fill(SEARCH_PERSON_NUM);
  await page.locator('[id$="q1::search"]').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await waitForGlassPaneClear(page);
  await screenshot(page, 'create-01-search');

  // Click the person name link in search results
  const personClicked = await page.evaluate(() => {
    const allLinks = document.querySelectorAll('a');
    for (const link of allLinks) {
      const text = link.textContent?.trim() || '';
      const rect = (link as HTMLElement).getBoundingClientRect();
      // Must be visible and in the results area (below y=350), contain "HR-" or person name
      if (rect.width > 0 && rect.height > 0 && rect.y > 350 && (text.includes('HR-') || text.includes('Affiliate'))) {
        (link as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  if (personClicked) {
    log(`- Clicked person: "${personClicked}"`);
  } else {
    log('- Could not find person link. Trying any link in results area...');
    const fallback = await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        const rect = (link as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.y > 350 && text.length > 3
            && !text.includes('Navigator') && !text.includes('Home') && !text.includes('Access')
            && !text.includes('Notifications') && !text.includes('Settings')) {
          (link as HTMLElement).click();
          return text;
        }
      }
      return null;
    });
    if (fallback) {
      log(`- Fallback clicked: "${fallback}"`);
    } else {
      log('- ERROR: No person link found');
      await browser.close();
      fs.writeFileSync('/tmp/person-eit-create-inspection.md', findings.join('\n'));
      return;
    }
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(10000);
  await waitForGlassPaneClear(page);
  console.log('On person detail page.');

  // Get person number for reference
  const personNum = await page.evaluate(() => {
    const spans = document.querySelectorAll('span, div');
    for (const s of spans) {
      const prev = s.previousElementSibling;
      if (prev && prev.textContent?.trim() === 'Person Number') {
        return s.textContent?.trim() || '';
      }
    }
    // Also try label approach
    const labels = document.querySelectorAll('label');
    for (const l of labels) {
      if (l.textContent?.trim() === 'Person Number') {
        const next = l.parentElement?.querySelector('span, div');
        if (next) return next.textContent?.trim() || '';
      }
    }
    return '';
  });
  log(`- Person Number: ${personNum}`);

  // Navigate to Person > Extra Information > Staff Account and Designation
  console.log('Navigating to Extra Information...');

  // Open sidebar
  const moreInfoLink = page.locator('a[title="More Information"]').first();
  await moreInfoLink.waitFor({ timeout: 10000 });
  await removeGlassPane(page);
  await moreInfoLink.click({ force: true });
  await page.waitForTimeout(3000);

  // Click Personal and Employment
  const personalEmpLink = page.locator('a:has-text("Personal and Employment")').first();
  if (await personalEmpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await personalEmpLink.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Click Person
  const personAction = page.locator('[id$="dci12:16:cml13"]').first();
  await personAction.waitFor({ timeout: 5000 });
  await personAction.click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(10000);
  await waitForGlassPaneClear(page);

  // Click Extra Information tab
  const extraInfoLink = page.locator('a, [role="tab"]').filter({ hasText: /^Extra Information$/ }).first();
  await extraInfoLink.waitFor({ timeout: 10000 });
  await removeGlassPane(page);
  await extraInfoLink.click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(8000);
  await waitForGlassPaneClear(page);

  // Click Staff Account and Designation
  const staffLink = page.locator('a').filter({ hasText: 'Staff Account and Designation' }).first();
  await staffLink.waitFor({ timeout: 10000 });
  await removeGlassPane(page);
  await staffLink.click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(8000);
  await waitForGlassPaneClear(page);

  await screenshot(page, 'create-02-staff-section');
  log('');
  log('## Staff Account and Designation Section (View Mode)');

  // Check if data exists
  const existingData = await page.evaluate(() => {
    const result: Record<string, string> = {};
    const fields = ['staffAccountNumber', 'designationNumber', 'primaryPerson_Display', 'spouse_Display'];
    for (const f of fields) {
      const el = document.querySelector(`[id*="${f}::content"], [id*="${f}"][id$="::content"]`);
      if (el) result[f] = el.textContent?.trim() || '(empty)';
    }
    return result;
  });
  log(`Existing data: ${JSON.stringify(existingData)}`);
  const hasExistingData = Object.values(existingData).some(v => v && v !== '(empty)' && v.length > 0);
  log(`Has existing data: ${hasExistingData}`);

  // ===== Now try Edit → Correct to enter edit mode and see the form =====
  log('');
  log('## Enter Edit Mode (Correct)');

  const editIcon = page.locator('[id$="EFFFlow:0:editDropDown::icon"]').first();
  if (await editIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
    await removeGlassPane(page);
    await editIcon.click({ force: true });
    await page.waitForTimeout(3000);
    await screenshot(page, 'create-03-edit-dropdown');

    // Read dropdown items
    const menuItems = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('tr[id*="EFF"], [role="menuitem"]').forEach(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push(`${el.tagName} id="${el.id}" text="${el.textContent?.trim().slice(0, 80)}"`);
        }
      });
      return results;
    });
    log('Edit dropdown items:');
    for (const item of menuItems) {
      log(`- ${item}`);
    }

    // Click Correct
    const correctItem = page.locator('[id$="correctEFF"]').first();
    if (await correctItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      log('- Clicking Correct...');
      await correctItem.click({ force: true });
      await page.waitForTimeout(8000);
      await waitForGlassPaneClear(page);
      await screenshot(page, 'create-04-correct-mode');

      // ===== INSPECT THE EDITABLE FORM =====
      log('');
      log('## Editable Form (Correct Mode)');

      // All form fields now
      const editableFields = await page.evaluate(() => {
        const results: string[] = [];
        document.querySelectorAll('input, select, textarea').forEach(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const id = el.id || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            const type = el.getAttribute('type') || el.tagName.toLowerCase();
            const value = (el as HTMLInputElement).value || '';
            const readOnly = (el as HTMLInputElement).readOnly || false;
            const disabled = (el as HTMLInputElement).disabled || false;
            results.push(`${el.tagName} id="${id}" type="${type}" aria="${ariaLabel}" value="${value.slice(0, 50)}" readOnly=${readOnly} disabled=${disabled}`);
          }
        });
        return results;
      });
      log('### All visible input fields:');
      for (const f of editableFields) {
        log(`- ${f}`);
      }

      // Labels
      const labels = await page.evaluate(() => {
        const results: string[] = [];
        document.querySelectorAll('label').forEach(el => {
          const text = el.textContent?.trim() || '';
          const forAttr = el.getAttribute('for') || '';
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && text.length > 0 && text.length < 80) {
            results.push(`for="${forAttr}" text="${text}"`);
          }
        });
        return results;
      });
      log('');
      log('### Labels:');
      for (const l of labels) {
        log(`- ${l}`);
      }

      // ADF elements with Staff/Designation IDs (these are the input field IDs)
      const adfInputs = await page.evaluate(() => {
        const results: string[] = [];
        const patterns = ['staffAccount', 'StaffAccount', 'designation', 'Designation', 'primaryPerson', 'PrimaryPerson', 'spouse', 'Spouse', 'staffaccountrecordid'];
        for (const pattern of patterns) {
          document.querySelectorAll(`[id*="${pattern}"]`).forEach(el => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > 0) {
              const id = el.id;
              const tag = el.tagName;
              const type = el.getAttribute('type') || '';
              const role = el.getAttribute('role') || '';
              const value = (el as HTMLInputElement).value || el.textContent?.trim().slice(0, 50) || '';
              const readOnly = (el as HTMLInputElement).readOnly || false;
              results.push(`${tag} id="${id}" type="${type}" role="${role}" value="${value}" readOnly=${readOnly}`);
            }
          });
        }
        return results;
      });
      log('');
      log('### ADF elements matching field names:');
      for (const a of adfInputs) {
        log(`- ${a}`);
      }

      // Buttons (Save, Submit, etc.)
      log('');
      log('### Action buttons:');
      const actionBtns = await page.evaluate(() => {
        const results: string[] = [];
        document.querySelectorAll('button, a[role="button"], a').forEach(el => {
          const text = el.textContent?.trim() || '';
          const title = el.getAttribute('title') || '';
          const id = el.id || '';
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && (/save|submit|cancel|add|create|ok/i.test(text) || /save|submit|cancel|add|create/i.test(title))) {
            results.push(`${el.tagName} id="${id}" text="${text.slice(0, 60)}" title="${title}"`);
          }
        });
        return results;
      });
      for (const b of actionBtns) {
        log(`- ${b}`);
      }

      // Full visible text in the section area (right panel)
      const sectionText = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const texts: string[] = [];
        let node;
        while ((node = walker.nextNode())) {
          const t = node.textContent?.trim();
          if (t && t.length > 2 && t.length < 200) {
            const parent = node.parentElement;
            if (parent && (parent as HTMLElement).offsetParent !== null) {
              if (/staff|designation|account|primary|spouse|effective|usage|extra|record/i.test(t)) {
                texts.push(t);
              }
            }
          }
        }
        return [...new Set(texts)];
      });
      log('');
      log('### Staff-related text in edit mode:');
      for (const t of sectionText) {
        log(`- "${t}"`);
      }

      // Look for Add Row buttons that appeared in edit mode
      const addBtns = await page.evaluate(() => {
        const results: string[] = [];
        document.querySelectorAll('img[title*="Add"], img[title*="Create"], a[title*="Add"], button').forEach(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0) {
            results.push(`${el.tagName} id="${el.id}" title="${el.getAttribute('title')}" text="${el.textContent?.trim().slice(0, 40)}"`);
          }
        });
        return results;
      });
      if (addBtns.length > 0) {
        log('');
        log('### Add/Create buttons in edit mode:');
        for (const b of addBtns) {
          log(`- ${b}`);
        }
      }

      // Cancel to avoid saving
      log('');
      log('Cancelling...');
      const cancelBtn = page.locator('a').filter({ hasText: /^Cancel$/ }).first();
      if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await removeGlassPane(page);
        await cancelBtn.click({ force: true });
        await page.waitForTimeout(2000);
        const yesBtn = page.locator('button:has-text("Yes"), a:has-text("Yes")').first();
        if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await yesBtn.click({ force: true });
        }
      }
    } else {
      log('- Correct not visible. Checking for Update...');
      const updateItem = page.locator('[id$="updateEFF"]').first();
      if (await updateItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        log('- Only Update available');
      }
      await page.keyboard.press('Escape');
    }
  }

  // Save findings
  const report = findings.join('\n');
  fs.writeFileSync('/tmp/person-eit-create-inspection.md', report);
  console.log('\n=== DONE ===');
  console.log('Report: /tmp/person-eit-create-inspection.md');

  await browser.close();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
