/**
 * Check multiple persons for Staff Designation EIT data via browser.
 * Reuses the EXACT Navigator pattern from inspect-eit-create-path.ts (which worked).
 *
 * Strategy: check person 10817020 (first clone). If it has data,
 * search by name for "HR-019" (test-hired persons likely without EIT).
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';
const DIR = '/tmp/eit-create';

const findings: string[] = [];
function log(msg: string) { console.log(msg); findings.push(msg); }

async function removeGlassPane(page: any) {
  await page.evaluate(() =>
    document.querySelectorAll('.AFModalGlassPane').forEach((el: any) => el.remove())
  );
}

async function screenshot(page: any, name: string) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  log(`  Screenshot: ${DIR}/${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  log('# EIT Empty State Inspection');
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

  // Navigate to Person Management (exact pattern from working script)
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

  const searchField = page.locator('[id$="q1:value10::content"]').first();
  const nameField = page.locator('[id$="q1:value00::content"]').first();
  const searchBtn = page.locator('[id$="q1::search"]').first();

  const onSearchPage = await searchField.isVisible({ timeout: 10000 }).catch(() => false);
  if (!onSearchPage) {
    log('ERROR: Not on Person Management search page');
    await screenshot(page, 'err-not-on-search');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    await removeGlassPane(page);
    if (!await searchField.isVisible({ timeout: 5000 }).catch(() => false)) {
      log('Aborting.');
      await browser.close();
      return;
    }
  }
  log('On Person Management search page.');

  // === STEP 1: Search by name for recently-hired test persons ===
  // These persons were created by our automation and should NOT have EIT data
  console.log('Searching for test-hired persons...');
  await nameField.fill('HR-019');
  await personNumClear(page, searchField);
  await searchBtn.click({ force: true });
  await page.waitForTimeout(8000);
  await removeGlassPane(page);
  await screenshot(page, 'search-hr019');

  // Check what results we got
  const resultNames = await page.evaluate(() => {
    const results: { text: string; id: string }[] = [];
    // Look for result links in the search results table
    document.querySelectorAll('a').forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const text = el.textContent?.trim() || '';
      const id = el.id || '';
      if (rect.width > 0 && rect.y > 150 && text.length > 5 && text.length < 80 &&
          (text.includes('HR-019') || id.includes('resId1') || id.includes('table2'))) {
        results.push({ text, id: id.slice(0, 60) });
      }
    });
    return results.slice(0, 10);
  });
  log(`Search results for "HR-019": ${resultNames.length}`);
  for (const r of resultNames) log(`  - "${r.text}" (id: ${r.id})`);

  // If no HR-019 results, try searching for a person number we know
  // Person 10817020 is first clone — let's check it
  let targetPersonNum = '10817020';

  if (resultNames.length > 0) {
    // Click the first HR-019 result — these test-hired persons likely lack EIT
    const firstResult = page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      const resultText = await firstResult.textContent().catch(() => '?');
      log(`Clicking first result: "${resultText}"`);
      await firstResult.click();
      await page.waitForTimeout(10000);
      await removeGlassPane(page);
      await screenshot(page, 'person-detail');

      // Get person number from the employment page
      targetPersonNum = await page.evaluate(() => {
        const spans = document.querySelectorAll('span');
        for (let i = 0; i < spans.length; i++) {
          const text = spans[i].textContent?.trim() || '';
          if (/^108\d{5}$/.test(text)) return text;
        }
        // Also check Person Number label
        const els = document.querySelectorAll('[id*="PersonNumber"], [id*="personNumber"]');
        for (let i = 0; i < els.length; i++) {
          const text = els[i].textContent?.trim() || '';
          if (/\d{8}/.test(text)) return text.match(/\d{8}/)?.[0] || '';
        }
        return '';
      });
      log(`Person number from page: ${targetPersonNum}`);
    }
  } else {
    // No HR-019 results, search by person number directly
    log('No HR-019 results, searching by person number 10817020...');
    await nameField.fill('');
    await searchField.fill('10817020');
    await searchBtn.click({ force: true });
    await page.waitForTimeout(8000);
    await removeGlassPane(page);

    const resultLink = page.locator('[id*="table2:0:gl"], [id*="resId1:0:"] a').first();
    if (await resultLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const resultText = await resultLink.textContent().catch(() => '?');
      log(`Found: "${resultText}"`);
      await resultLink.click();
      await page.waitForTimeout(10000);
      await removeGlassPane(page);
    }
  }

  // === STEP 2: Navigate to Person > Extra Information > Staff Designation ===
  log('\nNavigating to EIT section...');

  const moreInfoLink = page.locator('a[title="More Information"]').first();
  if (!await moreInfoLink.isVisible({ timeout: 8000 }).catch(() => false)) {
    log('ERROR: "More Information" not found');
    await screenshot(page, 'err-no-more-info');
    await browser.close();
    return;
  }
  await removeGlassPane(page);
  await moreInfoLink.click({ force: true });
  await page.waitForTimeout(3000);

  const personalEmpLink = page.locator('a:has-text("Personal and Employment")').first();
  if (await personalEmpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await personalEmpLink.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Click "Person"
  let personClicked = false;
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
  if (!personClicked) {
    // Try by ADF ID
    const personAction = page.locator('[id$="dci12:16:cml13"]').first();
    if (await personAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await personAction.click({ force: true });
      personClicked = true;
    }
  }
  if (!personClicked) {
    log('ERROR: Could not click Person link');
    await screenshot(page, 'err-no-person-link');
    await browser.close();
    return;
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(10000);
  await removeGlassPane(page);

  // Extra Information tab
  const extraInfoTab = page.locator('a, [role="tab"]').filter({ hasText: /^Extra Information$/ }).first();
  if (!await extraInfoTab.isVisible({ timeout: 8000 }).catch(() => false)) {
    log('ERROR: Extra Information tab not found');
    await screenshot(page, 'err-no-extra-info-tab');
    await browser.close();
    return;
  }
  await removeGlassPane(page);
  await extraInfoTab.click({ force: true });
  await page.waitForTimeout(8000);
  await removeGlassPane(page);

  // Staff Account and Designation
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
    await screenshot(page, 'err-no-staff-link');
    await browser.close();
    return;
  }
  await page.waitForTimeout(8000);
  await removeGlassPane(page);
  await screenshot(page, 'staff-section');

  // === STEP 3: Inspect the section ===
  log('\n## Section Analysis');

  // Check for existing data
  const hasData = await page.evaluate(() => {
    const spans = document.querySelectorAll('[id*="staffAccountNumber"] span, [id*="designationNumber"] span');
    let found = false;
    spans.forEach((el: any) => { if (/^\d+$/.test(el.textContent?.trim())) found = true; });
    return found;
  });
  log(`Has existing data: ${hasData}`);

  // Check Edit dropdown
  const editDropdown = page.locator('[id*="editDropDown::icon"]').first();
  const editVisible = await editDropdown.isVisible({ timeout: 3000 }).catch(() => false);
  log(`Edit dropdown visible: ${editVisible}`);

  // Check for action elements
  const actionElements = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('img, a, button, [role="button"]').forEach(el => {
      const text = el.textContent?.trim() || '';
      const title = el.getAttribute('title') || '';
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width > 0 && (/add|create|edit|new|pencil/i.test(text) || /add|create|edit|new|pencil/i.test(title))) {
        results.push(`${el.tagName} id="${el.id?.slice(0, 80)}" text="${text.slice(0, 50)}" title="${title}" x=${Math.round(rect.x)} y=${Math.round(rect.y)}`);
      }
    });
    return results;
  });
  log(`Action elements (${actionElements.length}):`);
  for (const el of actionElements) log(`  - ${el}`);

  // Content text in the staff section area
  const contentText = await page.evaluate(() => {
    const results: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim();
      if (t && t.length > 2 && t.length < 200) {
        const parent = node.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          if (rect.width > 0 && rect.x > 200) {
            if (/staff|design|account|no data|no item|empty|add|create|effective|record|primary|spouse|usage/i.test(t)) {
              results.push(t);
            }
          }
        }
      }
    }
    return [...new Set(results)];
  });
  log('Content text:');
  for (const t of contentText) log(`  - "${t}"`);

  // Click Edit dropdown if visible
  if (editVisible) {
    log('\n## Edit Dropdown Menu');
    await removeGlassPane(page);
    await editDropdown.click({ force: true });
    await page.waitForTimeout(3000);
    await screenshot(page, 'edit-dropdown');

    const menuItems = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('tr, td, [role="menuitem"], [role="option"]').forEach(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        const id = el.id || '';
        if (rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 60) {
          if (/update|correct|delete|add|create/i.test(text) || id.includes('EFF') || id.includes('eff')) {
            results.push(`tag=${el.tagName} id="${id.slice(0, 60)}" text="${text}"`);
          }
        }
      });
      return [...new Set(results)];
    });
    log('Menu items:');
    for (const item of menuItems) log(`  - ${item}`);
    await page.keyboard.press('Escape');
  }

  // Section HTML
  const sectionHtml = await page.evaluate(() => {
    const s = document.querySelector('[id*="EFFFlow"], [id*="effFlow"]');
    return s ? s.innerHTML.slice(0, 4000) : 'Not found';
  });
  fs.writeFileSync(`${DIR}/section-html-${targetPersonNum}.html`, sectionHtml);
  log(`\nSection HTML saved.`);

  log('\n## Inspection Complete');
  fs.writeFileSync('/tmp/eit-empty-inspection.md', findings.join('\n'));
  console.log('\nReport: /tmp/eit-empty-inspection.md');

  await browser.close();
}

async function personNumClear(page: any, field: any) {
  try { await field.fill(''); } catch {}
}

main().catch(e => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  findings.push(`\nFATAL: ${e.message}\n${e.stack}`);
  fs.writeFileSync('/tmp/eit-empty-inspection.md', findings.join('\n'));
  process.exit(1);
});
