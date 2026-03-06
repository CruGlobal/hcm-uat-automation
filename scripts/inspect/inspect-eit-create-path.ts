#!/usr/bin/env npx tsx
/**
 * Inspect the EIT section for a clone bot person to determine
 * if they have existing Staff Designation data or not,
 * and what the UI looks like in each case.
 *
 * Uses direct URL navigation instead of Navigator menu (more reliable).
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';
const PERSON_NUM = '10817090'; // Clone bot — likely no EIT data

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

async function screenshot(page: any, name: string) {
  const dir = '/tmp/eit-create';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  log(`  Screenshot: ${path}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  log('# EIT Create Path Inspection');
  log(`Date: ${new Date().toISOString()}`);
  log(`Person: ${PERSON_NUM}`);
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

  // Navigate to Person Management via Navigator
  console.log('Navigating to Person Management...');
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")');
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(1000);
  }
  await page.locator('a[title="Person Management"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(8000);
  await removeGlassPane(page);

  // Check if we're on Person Management search page
  const searchField = page.locator('[id$="q1:value10::content"]').first();
  const onSearchPage = await searchField.isVisible({ timeout: 10000 }).catch(() => false);
  if (!onSearchPage) {
    log('ERROR: Not on Person Management search page');
    await screenshot(page, 'not-on-search-page');
    // Try pressing Escape and waiting
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    await removeGlassPane(page);
    const retry = await searchField.isVisible({ timeout: 5000 }).catch(() => false);
    if (!retry) {
      log('Still not on search page after Escape. Aborting.');
      await browser.close();
      fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
      return;
    }
  }
  log('On Person Management search page.');

  // Search by person number
  console.log(`Searching for person ${PERSON_NUM}...`);
  await searchField.fill(PERSON_NUM);
  await page.locator('[id$="q1::search"]').first().click({ force: true });
  await page.waitForTimeout(8000);
  await removeGlassPane(page);
  await screenshot(page, '01-search-results');

  // Click first result using the established selector pattern
  const resultLink = page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
  const resultVisible = await resultLink.isVisible({ timeout: 10000 }).catch(() => false);
  if (!resultVisible) {
    log(`ERROR: No search results for person ${PERSON_NUM}`);
    // Dump page content for debugging
    const pageText = await page.evaluate(() => {
      const el = document.querySelector('[id*="table2"], [id*="resId1"]');
      return el ? el.textContent?.trim().slice(0, 500) : 'No results table found';
    });
    log(`Page text: ${pageText}`);
    await browser.close();
    fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
    return;
  }
  const resultText = await resultLink.textContent().catch(() => '');
  log(`Found result: "${resultText}"`);
  await resultLink.click();
  await page.waitForTimeout(10000);
  await removeGlassPane(page);
  await screenshot(page, '02-person-employment');

  // We should be on Employment detail. Navigate to Person detail via More Information.
  console.log('Navigating to Person detail...');
  const moreInfoLink = page.locator('a[title="More Information"]').first();
  const hasMoreInfo = await moreInfoLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (!hasMoreInfo) {
    log('ERROR: "More Information" not found on person page');
    await screenshot(page, '02b-no-more-info');
    await browser.close();
    fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
    return;
  }
  await removeGlassPane(page);
  await moreInfoLink.click({ force: true });
  await page.waitForTimeout(3000);
  await screenshot(page, '03-more-info-menu');

  // Click "Personal and Employment"
  const personalEmpLink = page.locator('a:has-text("Personal and Employment")').first();
  if (await personalEmpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await personalEmpLink.click({ force: true });
    await page.waitForTimeout(2000);
  }
  await screenshot(page, '04-personal-emp-menu');

  // Click "Person" link — try known ADF ID, then text fallback
  let personClicked = false;
  const personAction = page.locator('[id$="dci12:16:cml13"]').first();
  if (await personAction.isVisible({ timeout: 5000 }).catch(() => false)) {
    await personAction.click({ force: true });
    personClicked = true;
  } else {
    // Fallback: "Person" links with y > 200 (in popup, not header)
    const personLinks = page.locator('a').filter({ hasText: /^Person$/ });
    const count = await personLinks.count();
    for (let i = 0; i < count; i++) {
      const link = personLinks.nth(i);
      const rect = await link.boundingBox().catch(() => null);
      if (rect && rect.y > 200) {
        await link.click({ force: true });
        personClicked = true;
        break;
      }
    }
  }
  if (!personClicked) {
    log('ERROR: Could not find "Person" action link');
    // Dump all visible links for debugging
    const links = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('a').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const text = el.textContent?.trim() || '';
          if (text.length > 0 && text.length < 60) {
            results.push(`"${text}" (y=${Math.round(rect.y)}, id=${el.id?.slice(0, 50)})`);
          }
        }
      });
      return results.filter((_, i) => i < 40);
    });
    log('Visible links:');
    for (const l of links) log(`  ${l}`);
    await screenshot(page, '04b-no-person-link');
    await browser.close();
    fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
    return;
  }
  log('Clicked "Person" action.');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(10000);
  await removeGlassPane(page);
  await screenshot(page, '05-person-detail');

  // Click Extra Information tab
  console.log('Clicking Extra Information tab...');
  const extraInfoTab = page.locator('a, [role="tab"]').filter({ hasText: /^Extra Information$/ }).first();
  const tabVisible = await extraInfoTab.isVisible({ timeout: 8000 }).catch(() => false);
  if (!tabVisible) {
    log('ERROR: Extra Information tab not found');
    const allTabs = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('[role="tab"], a[id*="tab"]').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 60) results.push(text);
      });
      return results;
    });
    log(`Available tabs: ${allTabs.join(', ')}`);
    await screenshot(page, '05b-no-extra-info');
    await browser.close();
    fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
    return;
  }
  await removeGlassPane(page);
  await extraInfoTab.click({ force: true });
  await page.waitForTimeout(8000);
  await removeGlassPane(page);
  await screenshot(page, '06-extra-info-tab');

  // Click Staff Account and Designation link
  console.log('Clicking Staff Account and Designation...');
  const staffLink = page.locator('[id*="PER_EITStaff__Account__and__Designation"]').first();
  const staffLinkAlt = page.locator('a').filter({ hasText: 'Staff Account and Designation' }).first();
  let staffClicked = false;
  if (await staffLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await removeGlassPane(page);
    await staffLink.click({ force: true });
    staffClicked = true;
  } else if (await staffLinkAlt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await removeGlassPane(page);
    await staffLinkAlt.click({ force: true });
    staffClicked = true;
  }
  if (!staffClicked) {
    log('ERROR: Staff Account and Designation link not found');
    const sidebarLinks = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('a').forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        if (rect.width > 0 && rect.x < 400 && text.length > 3 && text.length < 80) {
          results.push(`"${text}" (x=${Math.round(rect.x)}, y=${Math.round(rect.y)})`);
        }
      });
      return results;
    });
    log('Sidebar links:');
    for (const l of sidebarLinks) log(`  ${l}`);
    await screenshot(page, '06b-no-staff-link');
    await browser.close();
    fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
    return;
  }
  log('On Staff Account and Designation section.');
  await page.waitForTimeout(8000);
  await removeGlassPane(page);
  await screenshot(page, '07-staff-section');

  // === INSPECT THE SECTION ===
  log('');
  log('## Section State (View Mode)');

  // Check for field elements
  const fieldState = await page.evaluate(() => {
    const result: Record<string, string> = {};
    const patterns = ['staffAccountNumber', 'designationNumber', 'primaryPerson', 'spouse',
      'EffectiveStartDate', 'staffAccountRecordId', 'effectiveStartDate'];
    for (const p of patterns) {
      const els = document.querySelectorAll(`[id*="${p}"]`);
      els.forEach((el, i) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const key = i === 0 ? p : `${p}[${i}]`;
        result[key] = `tag=${el.tagName} id=${el.id?.slice(0, 80)} value="${(el as HTMLInputElement).value || el.textContent?.trim().slice(0, 50) || ''}" visible=${rect.width > 0}`;
      });
    }
    return result;
  });
  log('Field elements found:');
  if (Object.keys(fieldState).length === 0) {
    log('  (NONE — no field elements found)');
  }
  for (const [k, v] of Object.entries(fieldState)) {
    log(`  ${k}: ${v}`);
  }

  // Check for empty state text
  const contentAreaText = await page.evaluate(() => {
    const results: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim();
      if (t && t.length > 2 && t.length < 200) {
        const parent = node.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          // Content area is x > 300 (right of sidebar)
          if (rect.width > 0 && rect.x > 200) {
            if (/staff|design|account|primary|spouse|effective|record|extra|no data|no item|add|create|edit|empty/i.test(t)) {
              results.push(t);
            }
          }
        }
      }
    }
    return [...new Set(results)];
  });
  log('');
  log('Content area staff-related text:');
  for (const t of contentAreaText) log(`  - "${t}"`);

  // Check for Edit dropdown
  const editDropdown = page.locator('[id*="editDropDown::icon"]').first();
  const editExists = await editDropdown.isVisible({ timeout: 3000 }).catch(() => false);
  log(`\nEdit dropdown visible: ${editExists}`);

  // Check for Add/Create buttons
  const addButtons = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('img, a, button, [role="button"]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const title = el.getAttribute('title') || '';
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width > 0 && (/add|create/i.test(text) || /add|create/i.test(title))) {
        results.push(`${el.tagName} id="${el.id?.slice(0, 60)}" text="${text.slice(0, 40)}" title="${title}"`);
      }
    });
    return results;
  });
  log('Add/Create buttons:');
  if (addButtons.length === 0) log('  (none found)');
  for (const b of addButtons) log(`  - ${b}`);

  // If Edit dropdown exists, click it and inspect menu
  if (editExists) {
    log('');
    log('## Edit Dropdown Menu');
    await removeGlassPane(page);
    await editDropdown.click({ force: true });
    await page.waitForTimeout(3000);
    await screenshot(page, '08-edit-dropdown');

    const menuItems = await page.evaluate(() => {
      const results: string[] = [];
      // Look for all visible menu-like items
      document.querySelectorAll('tr, td, [role="menuitem"], [role="option"]').forEach(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        const id = el.id || '';
        if (rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 60) {
          if (id.includes('EFF') || id.includes('eff') || /update|correct|delete|add|create/i.test(text)) {
            results.push(`tag=${el.tagName} id="${id.slice(0, 60)}" text="${text}"`);
          }
        }
      });
      return results;
    });
    log('Menu items:');
    for (const item of menuItems) log(`  - ${item}`);

    // Close dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // === Also check: what does the section look like when there IS no data? ===
  // Look for indicators like "No data to display", empty table, etc.
  log('');
  log('## Full Section HTML Structure');
  const sectionHtml = await page.evaluate(() => {
    // Find the main content area for Staff Account section
    const eitSection = document.querySelector('[id*="EFFFlow"], [id*="effFlow"]');
    if (eitSection) {
      return eitSection.innerHTML.slice(0, 3000);
    }
    // Fallback: content after the sidebar
    const mainContent = document.querySelector('[id*="mainPanel"], [id*="contentContainer"], main');
    if (mainContent) {
      return mainContent.innerHTML.slice(0, 3000);
    }
    return 'Could not find section container';
  });
  log('Section HTML (truncated):');
  log(sectionHtml.slice(0, 2000));

  log('\n## Inspection Complete');

  // Save findings
  const report = findings.join('\n');
  fs.writeFileSync('/tmp/eit-create-inspection.md', report);
  console.log('\n=== DONE ===');
  console.log('Report: /tmp/eit-create-inspection.md');
  console.log('Screenshots: /tmp/eit-create/');

  await browser.close();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  findings.push(`\nFATAL ERROR: ${e.message}\n${e.stack}`);
  fs.writeFileSync('/tmp/eit-create-inspection.md', findings.join('\n'));
  process.exit(1);
});
