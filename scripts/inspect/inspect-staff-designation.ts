#!/usr/bin/env npx tsx
/**
 * Inspect the "Staff Account and Designation" EIT form on the Person Management
 * Extra Information tab. Navigation path:
 *
 * 1. Login → Person Management → Search person 10817020 → Click person
 * 2. More Information → Personal and Employment → Person
 * 3. Click "Extra Information" tab
 * 4. Click "Staff Account and Designation" link in left sidebar
 * 5. Click Add/Create to create new row, inspect field selectors
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const HCM_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'uat.bot_hr_admin';
const PASSWORD = 'WinBuildSend!1951@cru';
const PERSON_NUMBER = '10817020';

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
  const path = `/tmp/sd-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  Screenshot: ${path}`);
}

function saveReport() {
  const report = findings.join('\n');
  fs.writeFileSync('/tmp/staff-designation-inspection.md', report);
  console.log('Report saved to /tmp/staff-designation-inspection.md');
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(60000);

  log('# Staff Account and Designation EIT Inspection');
  log(`Date: ${new Date().toISOString()}`);
  log('');

  // ===== Login =====
  console.log('Logging in...');
  await page.goto(`${HCM_URL}/fscmUI/faces/AtkHomePageWelcome`);
  await page.waitForLoadState('networkidle');
  await page.locator('#userid').first().fill(USERNAME);
  await page.locator('#password').first().fill(PASSWORD);
  await page.locator('button:has-text("Sign In"), input[value="Sign In"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // ===== Navigate to Person Management =====
  console.log('Navigating to Person Management...');
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")');
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click({ force: true });
    await page.waitForTimeout(1000);
  }
  await page.locator('a[title="Person Management"]').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await removeGlassPane(page);

  // ===== Search for person =====
  console.log(`Searching for person ${PERSON_NUMBER}...`);
  const pnf = page.locator('[id$="q1:value10::content"]').first();
  await pnf.waitFor({ timeout: 15000 });
  await pnf.fill(PERSON_NUMBER);
  await page.locator('[id$="q1::search"]').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  await removeGlassPane(page);

  // Click first result
  console.log('Clicking person in results...');
  const personLink = page.locator('[id*="table2:0:gl"]').first();
  if (await personLink.isVisible({ timeout: 10000 }).catch(() => false)) {
    await personLink.click();
  } else {
    await page.evaluate(() => {
      const links = document.querySelectorAll('table a, td a');
      for (const link of links) {
        if ((link.textContent?.trim() || '').includes('bot')) {
          (link as HTMLElement).click();
          return;
        }
      }
    });
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(10000);
  await removeGlassPane(page);
  await screenshot(page, '01-after-search-click');

  // ===== Navigate to Person detail page =====
  // Search result click lands on Employment page. Navigate: More Info → Personal and Employment → Person
  const moreInfoLink = page.locator('a[title="More Information"]').first();
  if (await moreInfoLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    log('## Navigating to Person detail via More Information');
    await removeGlassPane(page);
    await moreInfoLink.click({ force: true });
    await page.waitForTimeout(3000);

    const personalEmpLink = page.locator('a:has-text("Personal and Employment")').first();
    if (await personalEmpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await personalEmpLink.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Click "Person" quick action
    const personAction = page.locator('[id$="dci12:16:cml13"]').first();
    if (await personAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Clicking "Person" quick action...');
      await personAction.click({ force: true });
    } else {
      // Broader fallback
      const personLinks = await page.evaluate(() => {
        const results: any[] = [];
        document.querySelectorAll('a').forEach((el: any) => {
          const text = el.textContent?.trim() || '';
          if (text === 'Person' && el.getBoundingClientRect().width > 0) {
            results.push({ id: el.id, text });
          }
        });
        return results;
      });
      log(`Person links found: ${JSON.stringify(personLinks)}`);
      if (personLinks.length > 0) {
        await page.locator(`#${personLinks[0].id}`).click({ force: true });
      }
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(10000);
    await removeGlassPane(page);
    await screenshot(page, '02-person-page');
  }

  // ===== Click "Extra Information" tab =====
  log('');
  log('## Step 1: Click "Extra Information" tab');
  const extraInfoTab = page.locator('a, [role="tab"]').filter({ hasText: /^Extra Information$/ }).first();
  if (await extraInfoTab.isVisible({ timeout: 8000 }).catch(() => false)) {
    log('- Found Extra Information tab');
    await removeGlassPane(page);
    await extraInfoTab.click({ force: true });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(8000);
    await removeGlassPane(page);
    await screenshot(page, '03-extra-info-tab');
    log('- Extra Information tab opened');
  } else {
    log('- ERROR: Extra Information tab not found!');
    saveReport();
    await browser.close();
    return;
  }

  // ===== Capture sidebar links and their IDs =====
  log('');
  log('## Step 2: Left sidebar EIT type links');
  const eitLinks = await page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll('a').forEach((el: any) => {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.x < 300 && rect.y > 200 && text.length > 3 && text.length < 100) {
        results.push({ id: el.id || '', text, x: Math.round(rect.x), y: Math.round(rect.y) });
      }
    });
    return results;
  });
  for (const l of eitLinks) {
    const marker = l.text.toLowerCase().includes('staff') ? ' ** STAFF **' : '';
    log(`- id="${l.id}" text="${l.text}"${marker}`);
  }

  // ===== Click "Staff Account and Designation" =====
  log('');
  log('## Step 3: Click "Staff Account and Designation"');
  const staffLink = page.locator('a').filter({ hasText: 'Staff Account and Designation' }).first();
  if (await staffLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    const staffLinkId = await staffLink.getAttribute('id').catch(() => '') || '';
    log(`- Link ID: "${staffLinkId}"`);
    await removeGlassPane(page);
    await staffLink.click({ force: true });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(8000);
    await removeGlassPane(page);
    await screenshot(page, '04-staff-designation-clicked');
    log('- Clicked successfully');
  } else {
    log('- ERROR: "Staff Account and Designation" link not visible');
    saveReport();
    await browser.close();
    return;
  }

  // ===== Inspect the right panel content =====
  log('');
  log('## Step 4: Staff Designation section content');

  // Headers
  const headers = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .filter((h: any) => h.getBoundingClientRect().width > 0)
      .map((h: any) => `${h.tagName} id="${h.id}" text="${h.textContent?.trim().slice(0, 120)}"`);
  });
  log('### Headers:');
  for (const h of headers) log(`- ${h}`);

  // All visible text on the page (deduplicated)
  const pageText = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim();
      if (t && t.length > 2 && t.length < 200) {
        const parent = node.parentElement;
        if (parent && (parent as HTMLElement).offsetParent !== null) texts.push(t);
      }
    }
    return [...new Set(texts)];
  });
  log('');
  log('### Visible text:');
  log('```');
  log(pageText.join('\n').slice(0, 4000));
  log('```');

  // Form fields
  log('');
  log('### All visible form fields:');
  const formFields = await page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll('input, select, textarea').forEach((el: any) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        let labelText = '';
        const labelFor = document.querySelector(`label[for="${el.id}"]`);
        if (labelFor) labelText = labelFor.textContent?.trim() || '';
        if (!labelText) {
          const parentTd = el.closest('td');
          if (parentTd) {
            const prevTd = parentTd.previousElementSibling;
            if (prevTd) labelText = prevTd.textContent?.trim().slice(0, 60) || '';
          }
        }
        results.push({
          tag: el.tagName,
          id: el.id?.slice(0, 150) || '',
          type: el.getAttribute('type') || el.tagName.toLowerCase(),
          label: labelText.slice(0, 60),
          aria: (el.getAttribute('aria-label') || '').slice(0, 60),
          value: (el.value || '').slice(0, 50),
          readonly: el.hasAttribute('readonly'),
          disabled: el.disabled
        });
      }
    });
    return results;
  });
  for (const f of formFields) {
    const flags = [f.readonly ? 'READONLY' : '', f.disabled ? 'DISABLED' : ''].filter(Boolean).join(' ');
    log(`- ${f.tag} id="${f.id}" type="${f.type}" label="${f.label}" aria="${f.aria}" value="${f.value}" ${flags}`);
  }

  // Labels
  log('');
  log('### Labels:');
  const labels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('label'))
      .filter((el: any) => el.getBoundingClientRect().width > 0 && el.textContent?.trim())
      .map((el: any) => `for="${el.getAttribute('for') || ''}" text="${el.textContent?.trim().slice(0, 80)}"`);
  });
  for (const l of labels) log(`- ${l}`);

  // Buttons
  log('');
  log('### All buttons:');
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a[role="button"], img[title]'))
      .filter((el: any) => el.getBoundingClientRect().width > 0 && (el.textContent?.trim() || el.getAttribute('title')))
      .map((el: any) => ({
        tag: el.tagName,
        id: el.id?.slice(0, 120) || '',
        text: (el.textContent?.trim() || '').slice(0, 60),
        title: el.getAttribute('title') || ''
      }));
  });
  for (const b of buttons) log(`- ${b.tag} id="${b.id}" text="${b.text}" title="${b.title}"`);

  // ADF add/create elements
  log('');
  log('### ADF add/create elements:');
  const adfAdds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id*="::add"], [id*="Add"], [id*="create"], [id*="Create"], img[title*="Add"], img[title*="Create"], a[title*="Add"]'))
      .filter((el: any) => el.getBoundingClientRect().width > 0)
      .map((el: any) => ({
        tag: el.tagName,
        id: el.id?.slice(0, 150) || '',
        text: (el.textContent?.trim() || '').slice(0, 60),
        title: el.getAttribute('title') || ''
      }));
  });
  for (const a of adfAdds) log(`- ${a.tag} id="${a.id}" text="${a.text}" title="${a.title}"`);

  // ADF table rows
  log('');
  const tableRows = await page.evaluate(() => {
    const rows = document.querySelectorAll('[_afrrk]');
    return Array.from(rows).map((r: any) => ({
      afrrk: r.getAttribute('_afrrk'),
      text: r.textContent?.trim().slice(0, 200) || ''
    }));
  });
  log(`### ADF table rows: ${tableRows.length}`);
  for (const r of tableRows.slice(0, 10)) log(`- afrrk=${r.afrrk} text="${r.text}"`);

  // ===== Try clicking Add button to create new EIT row =====
  log('');
  log('## Step 5: Click Add to create new EIT row');

  // Look for the Add button — check multiple patterns
  const addSelectors = [
    'img[title="Add Row"]',
    'a[title="Add Row"]',
    'img[title="Create"]',
    'a[title="Create"]',
    'a[id*="::add"]',
    'img[title="Add"]',
    'a[title="Add"]',
    'button:has-text("Add")',
    'a[role="button"]:has-text("Add")',
    '[id*="::_afrCrt"]'
  ];

  let addFound = false;
  for (const sel of addSelectors) {
    const btn = page.locator(sel).first();
    const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      const id = await btn.getAttribute('id').catch(() => '') || '';
      const title = await btn.getAttribute('title').catch(() => '') || '';
      log(`- Found Add button: selector="${sel}" id="${id}" title="${title}"`);
      await removeGlassPane(page);
      await btn.click({ force: true });
      addFound = true;
      await page.waitForTimeout(5000);
      await removeGlassPane(page);
      await screenshot(page, '05-after-add-click');
      break;
    }
  }

  if (!addFound) {
    log('- No Add button found with standard selectors');
    // Try ADF action event on any component with "add" in the ID
    const addComponents = await page.evaluate(() => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return [];
      const results: string[] = [];
      const allEls = document.querySelectorAll('[id]');
      for (const el of allEls) {
        if (/add|crt|create/i.test(el.id) && (el as HTMLElement).getBoundingClientRect().width > 0) {
          const comp = adfPage.findComponentByAbsoluteId(el.id);
          if (comp) results.push(el.id);
        }
      }
      return results;
    });
    log(`- ADF components with add/create IDs: ${JSON.stringify(addComponents)}`);

    if (addComponents.length > 0) {
      log(`- Trying ADF action event on: ${addComponents[0]}`);
      await page.evaluate((id: string) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        const comp = adfPage.findComponentByAbsoluteId(id);
        if (comp) {
          const evt = new (window as any).AdfActionEvent(comp);
          evt.queue();
        }
      }, addComponents[0]);
      addFound = true;
      await page.waitForTimeout(5000);
      await removeGlassPane(page);
      await screenshot(page, '05-after-adf-add');
    }
  }

  if (addFound) {
    // Re-inspect form fields after Add
    log('');
    log('## After Add: Form inspection');

    // Form fields
    log('### Form fields after Add:');
    const newFields = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll('input, select, textarea').forEach((el: any) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          let labelText = '';
          const labelFor = document.querySelector(`label[for="${el.id}"]`);
          if (labelFor) labelText = labelFor.textContent?.trim() || '';
          if (!labelText) {
            const parentTd = el.closest('td');
            if (parentTd) {
              const prevTd = parentTd.previousElementSibling;
              if (prevTd) labelText = prevTd.textContent?.trim().slice(0, 60) || '';
            }
          }
          results.push({
            tag: el.tagName,
            id: el.id?.slice(0, 150) || '',
            type: el.getAttribute('type') || el.tagName.toLowerCase(),
            label: labelText.slice(0, 60),
            aria: (el.getAttribute('aria-label') || '').slice(0, 60),
            value: (el.value || '').slice(0, 50),
            readonly: el.hasAttribute('readonly'),
            disabled: el.disabled
          });
        }
      });
      return results;
    });
    for (const f of newFields) {
      const flags = [f.readonly ? 'READONLY' : '', f.disabled ? 'DISABLED' : ''].filter(Boolean).join(' ');
      log(`- ${f.tag} id="${f.id}" type="${f.type}" label="${f.label}" aria="${f.aria}" value="${f.value}" ${flags}`);
    }

    // Find fields specifically matching staff/designation/effective/primary
    log('');
    log('### Staff-specific fields:');
    const staffFields = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll('input, select, textarea').forEach((el: any) => {
        const id = el.id || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && (
          /staff|desig|effective|primary|account/i.test(id) ||
          /staff|desig|effective|primary|account/i.test(ariaLabel)
        )) {
          let labelText = '';
          const labelFor = document.querySelector(`label[for="${el.id}"]`);
          if (labelFor) labelText = labelFor.textContent?.trim() || '';
          results.push({
            tag: el.tagName,
            id: id.slice(0, 150),
            type: el.getAttribute('type') || el.tagName.toLowerCase(),
            label: labelText.slice(0, 60),
            aria: ariaLabel.slice(0, 60),
            value: (el.value || '').slice(0, 50),
            readonly: el.hasAttribute('readonly'),
            disabled: el.disabled
          });
        }
      });
      return results;
    });
    for (const s of staffFields) {
      const flags = [s.readonly ? 'READONLY' : '', s.disabled ? 'DISABLED' : ''].filter(Boolean).join(' ');
      log(`- ${s.tag} id="${s.id}" type="${s.type}" label="${s.label}" aria="${s.aria}" value="${s.value}" ${flags}`);
    }

    // New labels
    log('');
    log('### Labels after Add:');
    const newLabels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label'))
        .filter((el: any) => el.getBoundingClientRect().width > 0 && el.textContent?.trim())
        .map((el: any) => `for="${el.getAttribute('for') || ''}" text="${el.textContent?.trim().slice(0, 80)}"`);
    });
    for (const l of newLabels) log(`- ${l}`);

    // Text visible on page after add
    log('');
    log('### Page text after Add:');
    const afterAddText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent?.trim();
        if (t && t.length > 2 && t.length < 200) {
          const parent = node.parentElement;
          if (parent && (parent as HTMLElement).offsetParent !== null) texts.push(t);
        }
      }
      return [...new Set(texts)];
    });
    log('```');
    log(afterAddText.join('\n').slice(0, 4000));
    log('```');
  }

  // ===== Cancel out without saving =====
  log('');
  log('## Cleanup: Cancel without saving');
  const cancelBtn = page.locator('a[role="button"]:has-text("Cancel"), button:has-text("Cancel")').first();
  if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await removeGlassPane(page);
    await cancelBtn.click({ force: true });
    await page.waitForTimeout(3000);
    // Confirm cancel if dialog appears
    const yesBtn = page.getByRole('button', { name: 'Yes' }).first();
    if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yesBtn.click();
    }
    const noSaveBtn = page.getByRole('button', { name: 'No' }).first();
    if (await noSaveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await noSaveBtn.click();
    }
    log('- Cancelled successfully');
  }

  saveReport();
  await browser.close();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  findings.push(`\nFATAL: ${e.message}\n${e.stack}`);
  saveReport();
  process.exit(1);
});
