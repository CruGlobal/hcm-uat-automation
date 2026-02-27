/**
 * Inspect the Person Management search page.
 * Used by rehires, assignment changes, work relationships, terminations.
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

async function dumpFormElements(page: any, label: string) {
  const els = await page.evaluate(() => {
    const results: any[] = [];
    const selectors = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="searchbox"], [role="tab"], a[role="button"], button';
    const formEls = document.querySelectorAll(selectors);
    for (const el of Array.from(formEls)) {
      if ((el as any).offsetWidth === 0) continue;
      results.push({
        tag: el.tagName,
        type: (el as any).type || '',
        id: (el.id || '').substring(0, 200),
        ariaLabel: el.getAttribute('aria-label') || '',
        text: (el.textContent?.trim() || '').substring(0, 80),
        placeholder: (el as any).placeholder || '',
        role: el.getAttribute('role') || '',
      });
    }
    return results;
  });
  console.log(`\n=== ${label} — ${els.length} elements ===`);
  for (const el of els) {
    const desc = [el.tag, el.type ? `type=${el.type}` : '', el.role ? `role=${el.role}` : ''].filter(Boolean).join(' ');
    console.log(`  [${desc}] id="${el.id}" aria="${el.ariaLabel}" placeholder="${el.placeholder}" text="${el.text}"`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Navigate to Person Management via navigator
  console.log('\nNavigating to Person Management...');
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  await page.locator('[id$="nv_itemNode_workforce_management_person_management"]').click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(8000);

  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/person-mgmt.png', fullPage: true });

  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
      .filter((el: any) => el.offsetWidth > 0)
      .map((el: any) => el.textContent?.trim().substring(0, 100));
  });
  console.log('Headings:', headings);

  await dumpFormElements(page, 'Person Management Landing');

  // Search for a person
  console.log('\n--- Searching for "Smith" ---');
  const searchSelectors = [
    'input[placeholder*="Search"]', 'input[aria-label*="Search"]', 'input[aria-label*="Person"]',
    'input[id*="search"]', 'input[id*="Search"]', '[role="searchbox"]', 'input[type="search"]',
    'input[id*="qryId"]', 'input[id*="query"]', // ADF query fields
  ];

  let searchField = null;
  for (const sel of searchSelectors) {
    const field = page.locator(sel).first();
    if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
      searchField = field;
      const fieldId = await field.getAttribute('id');
      console.log(`Found search: selector="${sel}" id="${fieldId}"`);
      break;
    }
  }

  if (searchField) {
    await searchField.fill('Smith');
    await searchField.press('Enter');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/person-mgmt-search.png', fullPage: true });
    await dumpFormElements(page, 'After Search');

    // Look for result table rows
    const tableData = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr, [role="row"]');
      return Array.from(rows).filter((r: any) => r.offsetWidth > 0).slice(0, 10).map((r: any) => ({
        text: r.textContent?.trim().substring(0, 200),
        id: r.id?.substring(0, 100) || '',
      }));
    });
    console.log('\nTable rows:');
    for (const r of tableData) {
      console.log(`  id="${r.id}" text="${r.text}"`);
    }

    // Check for result links (person names)
    const links = await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a');
      return Array.from(allLinks)
        .filter((a: any) => a.offsetWidth > 0 && a.textContent?.match(/Smith/i))
        .slice(0, 5)
        .map((a: any) => ({
          text: a.textContent?.trim().substring(0, 100),
          id: a.id?.substring(0, 150) || '',
          href: a.getAttribute('href')?.substring(0, 100) || '',
        }));
    });
    console.log('\nPerson links:');
    for (const l of links) {
      console.log(`  text="${l.text}" id="${l.id}" href="${l.href}"`);
    }
  } else {
    console.log('No search field found');
    // Check if it's a Redwood page
    console.log('URL pattern:', page.url());
  }

  await browser.close();
  console.log('\nDone!');
})();
