import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { TOTP } from 'otpauth';
dotenv.config();

const URL = process.env.ORACLE_HCM_URL!;
const USER = process.env.ORACLE_HCM_USERNAME!;
const PASS = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET!;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Step 1: Navigate to Oracle HCM...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

  console.log('Step 2: Click Company Single Sign-On...');
  await page.locator('#ssoBtn').click();
  await page.waitForLoadState('networkidle');

  console.log('Step 3: Enter username...');
  await page.locator('input[name="identifier"]').fill(USER);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  console.log('Step 4: Enter password...');
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(PASS);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  console.log('Step 5: MFA — select Google Authenticator...');
  await page.locator('a[aria-label="Select Google Authenticator."]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('a[aria-label="Select Google Authenticator."]').click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/step5-mfa-code.png', fullPage: true });

  // Dump MFA code input page elements
  const elements = await page.locator('input, button, a[href]').evaluateAll((els: any[]) =>
    els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).map((el: any) => ({
      tag: el.tagName, type: el.type || '', id: el.id, name: el.name || '',
      ariaLabel: el.getAttribute('aria-label') || '', placeholder: el.placeholder || '',
      text: el.textContent?.trim().substring(0, 60) || '',
    }))
  );
  console.log('MFA code page elements:', JSON.stringify(elements, null, 2));

  console.log('Step 6: Enter TOTP code...');
  const totp = new TOTP({ secret: TOTP_SECRET });
  const code = totp.generate();
  console.log(`Generated TOTP: ${code}`);
  await page.locator('input[name="credentials.passcode"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="credentials.passcode"]').fill(code);
  await page.locator('input[type="submit"]').click();

  console.log('Step 7: Waiting for Oracle HCM redirect...');
  try {
    await page.waitForURL('**/fscmUI/**', { timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(5000);
    console.log('SUCCESS! Landed at:', page.url());
    await page.screenshot({ path: '/tmp/step7-home.png', fullPage: true });

    // Dump home page elements
    const homeEls = await page.locator('a, button, input').evaluateAll((els: any[]) =>
      els.filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0).slice(0, 40).map((el: any) => ({
        tag: el.tagName, type: el.type || '', id: el.id,
        ariaLabel: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
        text: el.textContent?.trim().substring(0, 60) || '',
      }))
    );
    console.log('Home page elements:', JSON.stringify(homeEls, null, 2));
  } catch (e: any) {
    console.log('Failed to reach fscmUI. Current URL:', page.url());
    await page.screenshot({ path: '/tmp/step7-failed.png', fullPage: true });
  }

  await browser.close();
})();
