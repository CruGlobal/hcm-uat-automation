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
  const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"], [role="radio"], [role="checkbox"], [role="button"], [role="listbox"], [role="option"], [role="spinbutton"]').evaluateAll((els: any[]) =>
    els.filter((el: any) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
    }).slice(0, 200).map((el: any) => ({
      tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 180) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: el.textContent?.trim().substring(0, 120) || '',
      placeholder: (el as any).placeholder || '',
      name: (el as any).name || '',
      for: el.getAttribute('for') || '',
      role: el.getAttribute('role') || '',
      required: el.getAttribute('aria-required') || '',
    }))
  );
  console.log(`\n=== ${label} — ${els.length} elements ===`);
  console.log(JSON.stringify(els, null, 2));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Logging in...');
  await login(page);
  console.log('Logged in!');

  // Navigate to My Client Groups > New Person
  await page.locator('a[title="Navigator"]').click();
  await page.waitForTimeout(2000);
  const showMore = page.locator('a:has-text("Show More")').first();
  if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showMore.click();
    await page.waitForTimeout(2000);
  }
  const wmNewPerson = page.locator('[id$="nv_itemNode_workforce_management_new_person"]');
  await wmNewPerson.click({ force: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dump the full structure around "Add a Pending Worker" to understand the click target
  const structure = await page.evaluate(() => {
    const link = document.querySelector('a[title="Add a Pending Worker"]');
    if (!link) return 'LINK NOT FOUND';
    // Get parent hierarchy
    let el: Element | null = link;
    const chain: string[] = [];
    for (let i = 0; i < 8 && el; i++) {
      chain.push(`${el.tagName}#${el.id?.substring(0, 80)} class="${el.className?.toString().substring(0, 60)}" onclick="${el.getAttribute('onclick')?.substring(0, 60) || ''}"`);
      el = el.parentElement;
    }
    // Get siblings of the link
    const parent = link.parentElement!;
    const siblings = Array.from(parent.children).map((c: any) => `${c.tagName}#${c.id?.substring(0, 80)} title="${c.getAttribute('title') || ''}" class="${c.className?.toString().substring(0, 40)}"`);
    return { chain, siblings, parentHTML: parent.outerHTML.substring(0, 2000) };
  });
  console.log('=== LINK STRUCTURE ===');
  console.log(JSON.stringify(structure, null, 2));

  // Try clicking the parent container which may have the real event handler
  // The list items are cl01Lv:N:cl01Pse — the icon area may be the actual target
  console.log('\nTrying to click the icon (cl01Cil) element...');
  const iconLink = page.locator('[id$="cl01Lv:3:cl01Pse:cl01Cil"]');
  if (await iconLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await iconLink.click();
    await page.waitForTimeout(10000);
    console.log('URL after icon click:', page.url());
    const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
    console.log('H1:', h1);
    await page.screenshot({ path: '/tmp/add-pw-form3-icon.png', fullPage: true });
    if (h1 !== 'New Person') {
      await dumpFormElements(page, 'Add Pending Worker Form');
    }
  } else {
    console.log('Icon not visible, trying keyboard navigation...');
  }

  // If that didn't work either, try Tab + Enter approach
  const h1Check = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  if (h1Check === 'New Person') {
    console.log('\nTrying focus + Enter on the link...');
    await page.evaluate(() => {
      const el = document.querySelector('a[title="Add a Pending Worker"]') as HTMLElement;
      if (el) el.focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(10000);
    console.log('URL after Enter:', page.url());
    const h1b = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
    console.log('H1 after Enter:', h1b);
    await page.screenshot({ path: '/tmp/add-pw-form3-enter.png', fullPage: true });
    if (h1b !== 'New Person') {
      await dumpFormElements(page, 'Add Pending Worker Form');
    }
  }

  // Last resort: look for an ADF action queue approach
  const h1Check2 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  if (h1Check2 === 'New Person') {
    console.log('\nTrying AdfActionEvent...');
    await page.evaluate(() => {
      // Try to trigger the ADF action event on the link
      const el = document.querySelector('a[title="Add a Pending Worker"]') as HTMLElement;
      if (el && (window as any).AdfPage) {
        const page = (window as any).AdfPage.PAGE;
        const comp = page.findComponentByAbsoluteId(el.id.replace('::content', ''));
        if (comp) {
          const ae = new (window as any).AdfActionEvent(comp);
          ae.queue();
        }
      }
    });
    await page.waitForTimeout(10000);
    console.log('URL after AdfActionEvent:', page.url());
    const h1c = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
    console.log('H1 after AdfActionEvent:', h1c);
    await page.screenshot({ path: '/tmp/add-pw-form3-adf.png', fullPage: true });
    if (h1c !== 'New Person') {
      await dumpFormElements(page, 'Add Pending Worker Form');
    }
  }

  await browser.close();
})();
