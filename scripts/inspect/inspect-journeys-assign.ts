/**
 * Test oj-select-single interaction with pressSequentially.
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config();

const BOT_USER = 'uat.bot_local_us_capacity';
const BOT_PASS = 'WinBuildSend!1951@cru';
const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';

async function waitForJET(page: any) {
  try {
    await page.waitForFunction(() => {
      const oj = (window as any).oj;
      if (!oj?.Context) return false;
      const ctx = oj.Context.getPageContext().getBusyContext();
      return ctx.isReady ? ctx.isReady() : false;
    }, { timeout: 30000 });
  } catch { /* ignore */ }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Login + navigate
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('#userid').first().fill(BOT_USER);
  await page.locator('#password').first().fill(BOT_PASS);
  await page.locator('button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  await page.waitForTimeout(5000);

  await page.locator('a[title="Navigator"]').first().click({ force: true });
  await page.waitForTimeout(3000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click({ force: true });
    await page.waitForTimeout(2000);
  }
  await page.locator('a[title="Journeys"]').first().click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(15000);
  await waitForJET(page);

  await page.locator('a[role="tab"]:has-text("Explore")').first().click();
  await page.waitForTimeout(8000);
  await waitForJET(page);

  const clearBtn = page.locator('button[aria-label*="Clear"]').first();
  if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clearBtn.click();
    await page.waitForTimeout(3000);
  }

  await page.locator('input[aria-label="Search by journey name"]').first().fill('Onboarding');
  await page.locator('button[aria-label="Search by journey name"]').first().click();
  await page.waitForTimeout(8000);
  await waitForJET(page);

  await page.locator('div[role="link"]:has-text("Onboarding Journey")').first().click();
  await page.waitForTimeout(10000);
  await waitForJET(page);

  await page.locator('button[aria-label="Assign"], #assignThisJourneyBtn button').first().click();
  await page.waitForTimeout(10000);
  await waitForJET(page);

  console.log('\n=== Testing assignee LOV with pressSequentially ===');

  // Method 1: Click the display input, then type
  console.log('\nMethod 1: Click display input + pressSequentially');
  const displayInput = page.locator('#assigneeLOV\\|input').first();
  await displayInput.click();
  await page.waitForTimeout(2000);

  let expanded = await displayInput.getAttribute('aria-expanded');
  console.log(`  aria-expanded after click: ${expanded}`);

  // Check if the filter input overlays the display input
  const filterVis = await page.locator('#oj-searchselect-filter-assigneeLOV\\|input').isVisible().catch(() => false);
  console.log(`  Filter input visible: ${filterVis}`);

  // Type on the filter input using pressSequentially
  const filterInput = page.locator('#oj-searchselect-filter-assigneeLOV\\|input').first();
  if (filterVis) {
    console.log('  Typing on filter input...');
    await filterInput.click();
    await filterInput.pressSequentially('Star', { delay: 200 });
    await page.waitForTimeout(8000);
    await waitForJET(page);

    const options = await page.locator('[role="option"]').all();
    console.log(`  Options found: ${options.length}`);
    for (const opt of options.slice(0, 5)) {
      const text = await opt.textContent().catch(() => '');
      console.log(`    → "${text?.trim().substring(0,60)}"`);
    }

    // Also check for listbox or popup
    const listbox = page.locator('[role="listbox"]');
    const listboxCount = await listbox.count();
    console.log(`  Listbox elements: ${listboxCount}`);
    for (let i = 0; i < Math.min(listboxCount, 3); i++) {
      const lb = listbox.nth(i);
      const vis = await lb.isVisible().catch(() => false);
      const text = await lb.textContent().catch(() => '');
      console.log(`    listbox ${i}: visible=${vis}, text="${text?.trim().substring(0,60)}"`);
    }
  }

  await page.screenshot({ path: '/tmp/journeys-assign-method1.png' });

  // Clear and try Method 2: Use keyboard.type on focused element
  console.log('\nMethod 2: keyboard.type after focus');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  await displayInput.click();
  await page.waitForTimeout(1000);
  // Triple-click to select all, then type
  await displayInput.click({ clickCount: 3 });
  await page.keyboard.type('Starcher', { delay: 150 });
  await page.waitForTimeout(8000);
  await waitForJET(page);

  const opts2 = await page.locator('[role="option"]').all();
  console.log(`  Options found: ${opts2.length}`);
  for (const opt of opts2.slice(0, 5)) {
    const text = await opt.textContent().catch(() => '');
    console.log(`    → "${text?.trim().substring(0,60)}"`);
  }

  await page.screenshot({ path: '/tmp/journeys-assign-method2.png' });

  // Method 3: Check Assignee Selection Type first, maybe it needs to be changed
  console.log('\nMethod 3: Check Assignee Selection Type LOV');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  const selType = page.locator('#selectionTypeLOV\\|input').first();
  const selTypeVal = await selType.getAttribute('value').catch(() => '');
  console.log(`  Current Selection Type value: "${selTypeVal}"`);
  const selTypeAriaExpanded = await selType.getAttribute('aria-expanded');
  console.log(`  aria-expanded: ${selTypeAriaExpanded}`);

  // Try to see the current raw value via JS
  const ojSelectVal = await page.evaluate(() => {
    const el = document.querySelector('#selectionTypeLOV') as any;
    return { value: el?.value, rawValue: el?.rawValue, displayValue: el?.displayValue };
  });
  console.log(`  OJ value: ${JSON.stringify(ojSelectVal)}`);

  // Click to open
  await selType.click();
  await page.waitForTimeout(3000);
  const selExpanded = await selType.getAttribute('aria-expanded');
  console.log(`  After click aria-expanded: ${selExpanded}`);

  // Check visible options
  const typeOpts = await page.locator('[role="option"]').all();
  console.log(`  Type options: ${typeOpts.length}`);
  for (const opt of typeOpts) {
    const text = await opt.textContent().catch(() => '');
    const vis = await opt.isVisible().catch(() => false);
    console.log(`    → "${text?.trim()}" visible=${vis}`);
  }

  // Also dump the full dropdown/popup content
  const popup = await page.evaluate(() => {
    const popups = document.querySelectorAll('[role="listbox"], [class*="dropdown"], [class*="popup"]');
    return Array.from(popups).map(p => ({
      tag: p.tagName, id: (p as any).id, role: p.getAttribute('role'),
      childCount: p.children.length,
      text: p.textContent?.trim().substring(0, 200),
      visible: p.getBoundingClientRect().width > 0,
    }));
  });
  console.log(`  Popups/listboxes: ${JSON.stringify(popup, null, 2)}`);

  await page.screenshot({ path: '/tmp/journeys-assign-seltype.png' });

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
