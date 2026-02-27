#!/usr/bin/env npx tsx
/**
 * Comprehensive Oracle HCM module inspector.
 * Logs in, navigates to each module area, and captures DOM structure
 * for selector discovery across ALL modules.
 *
 * Run: HEADLESS=false npx tsx scripts/inspect/inspect-all-modules.ts
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
  console.log('Navigating to Oracle HCM...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  console.log('Clicking SSO button...');
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle');

  console.log('Entering username...');
  await page.locator('input[name="identifier"]').fill(USERNAME);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  console.log('Entering password...');
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  console.log('Selecting Google Authenticator...');
  await page.locator('a[aria-label="Select Google Authenticator."]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('a[aria-label="Select Google Authenticator."]').click();
  await page.waitForLoadState('networkidle');

  console.log('Entering TOTP code...');
  const totp = new TOTP({ secret: TOTP_SECRET });
  const code = totp.generate();
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(code);
  await page.locator('input[type="submit"]').click();

  console.log('Waiting for Oracle HCM home page...');
  await page.waitForURL('**/fscmUI/**', { timeout: 120000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  console.log('Logged in successfully!');
}

/** Capture all interactive elements on the page */
async function capturePageElements(page: Page, name: string): Promise<any> {
  console.log(`  Capturing elements for: ${name}`);

  const data = await page.evaluate(() => {
    const elements: any[] = [];

    // Capture inputs
    document.querySelectorAll('input, select, textarea').forEach(el => {
      const e = el as HTMLInputElement;
      if (e.offsetWidth === 0 && e.offsetHeight === 0) return; // Skip hidden
      elements.push({
        tag: e.tagName.toLowerCase(),
        type: e.type || '',
        id: e.id || '',
        name: e.name || '',
        placeholder: e.placeholder || '',
        label: '',
        ariaLabel: e.getAttribute('aria-label') || '',
        value: e.value || '',
        classes: e.className.substring(0, 100),
        parentId: e.parentElement?.id || '',
      });
    });

    // Capture labels
    document.querySelectorAll('label').forEach(el => {
      const label = el as HTMLLabelElement;
      if (label.offsetWidth === 0 && label.offsetHeight === 0) return;
      const forId = label.htmlFor;
      const text = label.textContent?.trim().substring(0, 80) || '';
      if (forId) {
        const match = elements.find(e => e.id === forId);
        if (match) match.label = text;
      }
      elements.push({
        tag: 'label',
        text,
        forId,
        id: label.id || '',
      });
    });

    // Capture buttons and links
    document.querySelectorAll('a[role="button"], button, a[id]').forEach(el => {
      const a = el as HTMLElement;
      if (a.offsetWidth === 0 && a.offsetHeight === 0) return;
      elements.push({
        tag: a.tagName.toLowerCase(),
        role: a.getAttribute('role') || '',
        id: a.id || '',
        text: a.textContent?.trim().substring(0, 80) || '',
        title: a.getAttribute('title') || '',
        ariaLabel: a.getAttribute('aria-label') || '',
        href: (a as HTMLAnchorElement).href || '',
      });
    });

    // Capture navigator links
    document.querySelectorAll('[id*="nv_itemNode"]').forEach(el => {
      elements.push({
        tag: 'nav-link',
        id: el.id,
        text: el.textContent?.trim().substring(0, 80) || '',
        title: (el as HTMLElement).getAttribute('title') || '',
      });
    });

    // Capture ADF components with interesting IDs
    document.querySelectorAll('[id*="::content"], [id*="::drop"], [id*="soc"], [id*="lov"], [id*="inputText"], [id*="inputDate"]').forEach(el => {
      const e = el as HTMLElement;
      if (e.offsetWidth === 0 && e.offsetHeight === 0) return;
      if (elements.some(ex => ex.id === e.id)) return; // Avoid duplicates
      elements.push({
        tag: e.tagName.toLowerCase(),
        id: e.id,
        type: e.getAttribute('type') || '',
        ariaLabel: e.getAttribute('aria-label') || '',
        classes: e.className.substring(0, 100),
      });
    });

    return elements;
  });

  return data;
}

/** Navigate to an area via the Navigator menu */
async function navigateVia(page: Page, linkText: string): Promise<boolean> {
  try {
    console.log(`  Opening navigator...`);
    await page.locator('a[title="Navigator"]').click();
    await page.waitForTimeout(2000);

    // Try Show More
    const showMore = page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(2000);
    }

    // Find and click the target link
    console.log(`  Looking for "${linkText}" in navigator...`);
    const link = page.locator(`[id*="nv_itemNode"] >> text="${linkText}"`).first();
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      await page.waitForTimeout(5000);
      return true;
    }

    // Try clicking by title attribute
    const titleLink = page.locator(`a[title="${linkText}"]`).first();
    if (await titleLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleLink.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      await page.waitForTimeout(5000);
      return true;
    }

    console.log(`  Could not find "${linkText}" in navigator`);
    return false;
  } catch (err) {
    console.log(`  Navigation error: ${err}`);
    return false;
  }
}

/** Go back to home */
async function goHome(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`);
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: 100,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    await login(page);

    // Save screenshot of home
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'home.png'), fullPage: true });

    // === 1. Capture Navigator Links ===
    console.log('\n=== Capturing Navigator Links ===');
    await page.locator('a[title="Navigator"]').click();
    await page.waitForTimeout(2000);
    const showMore = page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(2000);
    }

    const navLinks = await page.evaluate(() => {
      const links: any[] = [];
      document.querySelectorAll('a[id*="nv_itemNode"], a[title]').forEach(el => {
        const a = el as HTMLAnchorElement;
        if (a.offsetWidth === 0 && a.offsetHeight === 0) return;
        links.push({
          id: a.id,
          title: a.title || '',
          text: a.textContent?.trim().substring(0, 100) || '',
          href: a.href || '',
        });
      });
      return links;
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'navigator-links.json'), JSON.stringify(navLinks, null, 2));
    console.log(`  Found ${navLinks.length} navigator links`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'navigator.png'), fullPage: true });

    // Close navigator
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // === 2. Inspect each module area ===
    const modules = [
      { name: 'absence', navText: 'Absences', altNavText: 'Time and Absences' },
      { name: 'time-labor', navText: 'Time', altNavText: 'Time and Absences' },
      { name: 'benefits', navText: 'Benefits', altNavText: 'Benefits' },
      { name: 'compensation', navText: 'Compensation', altNavText: 'Workforce Compensation' },
      { name: 'payroll-admin', navText: 'Payroll', altNavText: 'Submit a Flow' },
      { name: 'person-management', navText: 'Person Management', altNavText: 'Person Management' },
      { name: 'journeys', navText: 'Journeys', altNavText: 'Checklists' },
      { name: 'my-team', navText: 'My Team', altNavText: 'My Team' },
    ];

    for (const mod of modules) {
      console.log(`\n=== Inspecting: ${mod.name} ===`);
      await goHome(page);

      let found = await navigateVia(page, mod.navText);
      if (!found && mod.altNavText !== mod.navText) {
        found = await navigateVia(page, mod.altNavText);
      }

      if (found) {
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${mod.name}.png`), fullPage: true });
        const elements = await capturePageElements(page, mod.name);
        fs.writeFileSync(path.join(OUTPUT_DIR, `${mod.name}-elements.json`), JSON.stringify(elements, null, 2));
        console.log(`  Captured ${elements.length} elements`);
      } else {
        console.log(`  Could not navigate to ${mod.name}`);
      }
    }

    // === 3. Inspect the Hire Employee wizard ===
    console.log('\n=== Inspecting Hire Employee Wizard ===');
    await goHome(page);

    // Navigate to New Person
    await page.locator('a[title="Navigator"]').click();
    await page.waitForTimeout(2000);
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(2000);
    }

    // Try to find "New Person" link
    const newPersonLink = page.locator('[id$="nv_itemNode_workforce_management_new_person"]');
    if (await newPersonLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newPersonLink.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      await page.waitForTimeout(5000);

      await page.screenshot({ path: path.join(OUTPUT_DIR, 'new-person.png'), fullPage: true });
      const elements = await capturePageElements(page, 'new-person');
      fs.writeFileSync(path.join(OUTPUT_DIR, 'new-person-elements.json'), JSON.stringify(elements, null, 2));
      console.log(`  Captured ${elements.length} elements`);
    }

    // === 4. Inspect Redwood pages (deep links) ===
    console.log('\n=== Inspecting Redwood deep links ===');
    const deepLinks = [
      { name: 'absence-entry', url: '/fscmUI/redwood/absences/view/dashboard' },
      { name: 'time-entry', url: '/fscmUI/redwood/time/view/time-entry' },
      { name: 'benefits-enrollment', url: '/fscmUI/redwood/benefits/view/benefits-enrollment' },
      { name: 'pending-workers', url: '/fscmUI/redwood/employment-pending-workers/view/dashboard' },
      { name: 'journeys-dashboard', url: '/fscmUI/redwood/journeys/view/dashboard' },
    ];

    for (const dl of deepLinks) {
      console.log(`\n  Trying deep link: ${dl.name} (${dl.url})`);
      try {
        await page.goto(`${BASE_URL}${dl.url}`, { timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(5000);

        const url = page.url();
        console.log(`  Final URL: ${url}`);

        await page.screenshot({ path: path.join(OUTPUT_DIR, `${dl.name}.png`), fullPage: true });
        const elements = await capturePageElements(page, dl.name);
        fs.writeFileSync(path.join(OUTPUT_DIR, `${dl.name}-elements.json`), JSON.stringify(elements, null, 2));
        console.log(`  Captured ${elements.length} elements`);
      } catch (err) {
        console.log(`  Deep link failed: ${err}`);
      }
    }

    console.log('\n=== Inspection complete ===');
    console.log(`Results saved to: ${OUTPUT_DIR}`);

  } catch (err) {
    console.error('Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
