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

  // Approach 1: Use AdfRichCommandLink client component's __handleEvent
  console.log('=== Approach 1: AdfPage component click ===');
  const result1 = await page.evaluate(() => {
    try {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return 'AdfPage.PAGE not found';

      // Find all ADF components matching "Add a Pending Worker"
      const linkId = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:3:cl01Pse:cl01Cl';
      const comp = adfPage.findComponentByAbsoluteId(linkId);
      if (!comp) return `Component not found for ${linkId}`;

      return {
        componentType: comp.getComponentType?.() || 'unknown',
        clientId: comp.getClientId?.() || 'unknown',
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(comp)).filter((m: string) => m.startsWith('get') || m.includes('Action') || m.includes('click') || m.includes('event')).slice(0, 20),
      };
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  });
  console.log('ADF component info:', JSON.stringify(result1, null, 2));

  // Approach 2: Try triggering AdfActionEvent
  console.log('\n=== Approach 2: Queue AdfActionEvent ===');
  const result2 = await page.evaluate(() => {
    try {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return 'AdfPage.PAGE not found';

      const linkId = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:cl01Lv:3:cl01Pse:cl01Cl';
      const comp = adfPage.findComponentByAbsoluteId(linkId);
      if (!comp) return 'Component not found';

      const AdfActionEvent = (window as any).AdfActionEvent;
      if (!AdfActionEvent) return 'AdfActionEvent not found';

      const evt = new AdfActionEvent(comp);
      evt.queue();
      return 'AdfActionEvent queued successfully';
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  });
  console.log('Result:', result2);

  // Wait for the form to load after queuing the event
  await page.waitForTimeout(15000);

  console.log('URL:', page.url());
  const h1 = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => 'N/A');
  console.log('H1:', h1);
  await page.screenshot({ path: '/tmp/adf-click-result.png', fullPage: true });

  if (h1 !== 'New Person') {
    // Dump form elements
    const els = await page.locator('input:not([type="hidden"]), select, textarea, label, h1, h2, h3, [role="heading"], [role="tab"], [role="combobox"]').evaluateAll((els: any[]) =>
      els.filter((el: any) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0;
      }).slice(0, 200).map((el: any) => ({
        tag: el.tagName, type: (el as any).type || '', id: el.id?.substring(0, 180) || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        text: el.textContent?.trim().substring(0, 120) || '',
        placeholder: (el as any).placeholder || '',
        role: el.getAttribute('role') || '',
        required: el.getAttribute('aria-required') || '',
      }))
    );
    console.log(`\n=== FORM ELEMENTS — ${els.length} ===`);
    console.log(JSON.stringify(els, null, 2));
  } else {
    console.log('Still on New Person page. Dumping page content...');
    // Check if a popup or dialog appeared
    const dialogs = await page.locator('[role="dialog"], .af_popup, .af_dialog').evaluateAll((els: any[]) =>
      els.map((el: any) => ({
        tag: el.tagName, id: el.id, role: el.getAttribute('role'),
        visible: el.offsetWidth > 0,
        text: el.textContent?.trim().substring(0, 200),
      }))
    );
    console.log('Dialogs:', JSON.stringify(dialogs, null, 2));
  }

  await browser.close();
})();
