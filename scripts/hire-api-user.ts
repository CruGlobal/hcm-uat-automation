import { chromium } from 'playwright';
import { LoginPage } from '../src/pages/login.page';
import { HomePage } from '../src/pages/home.page';
import { env } from '../src/config/environment';

async function waitForJET(page: any, timeout = 30000) {
  await page.waitForFunction(() => {
    try {
      const oj = (window as any).oj;
      if (!oj?.Context) return true;
      return oj.Context.getPageContext().getBusyContext().isReady();
    } catch { return true; }
  }, { timeout }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ headless: true, slowMo: 50 });
  const page = await (await browser.newContext({ baseURL: env.oracle.url, viewport: { width: 1920, height: 1080 } })).newPage();

  const loginPage = new LoginPage(page);
  console.log('Logging in via SSO...');
  await loginPage.fullLogin();
  console.log('Logged in.');

  const homePage = new HomePage(page);
  await homePage.goToNewPerson();
  await page.waitForTimeout(3000);
  console.log('On New Person page.');

  // Click 'Hire an Employee'
  await homePage.clickNewPersonTile('Hire an Employee');
  await page.waitForTimeout(5000);
  await waitForJET(page);
  console.log('On hire wizard.');
  await page.screenshot({ path: '/tmp/api-s1.png' });

  // Step 1: Identification — Legal Employer is an ADF selectOneChoice
  // The ADF component renders as an <input> with a dropdown arrow
  // We need to click the dropdown arrow, then select from the popup list
  const legalEmpInput = page.locator('input[id*="selectOneChoice3::content"]').first();
  await legalEmpInput.waitFor({ state: 'visible', timeout: 10000 });

  // Click the dropdown arrow to open the list
  const dropdownArrow = page.locator('[id*="selectOneChoice3"] .afe, [id*="selectOneChoice3::dropdownIcon"], [id*="selectOneChoice3::drop"]').first();
  if (await dropdownArrow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dropdownArrow.click();
  } else {
    // Click the input and use keyboard
    await legalEmpInput.click();
    await page.keyboard.press('ArrowDown');
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/api-le-dropdown.png' });

  // Select "Campus Crusade for Christ, Inc." from the dropdown list
  const campusOption = page.locator('li:has-text("Campus Crusade for Christ")').first();
  if (await campusOption.isVisible({ timeout: 5000 }).catch(() => false)) {
    await campusOption.click();
    await page.waitForTimeout(2000);
    console.log('Legal Employer selected from dropdown.');
  } else {
    // Try typing and tabbing to trigger LOV resolution
    await legalEmpInput.clear();
    await legalEmpInput.pressSequentially('Campus Crusade for Christ', { delay: 30 });
    await page.waitForTimeout(2000);
    // Check for autocomplete suggestions
    const suggestion = page.locator('[role="option"]:has-text("Campus"), li:has-text("Campus")').first();
    if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await suggestion.click();
      console.log('Legal Employer selected from autocomplete.');
    } else {
      await legalEmpInput.press('Tab');
      console.log('Legal Employer typed and tabbed.');
    }
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: '/tmp/api-le-after.png' });

  // Last Name = NewPe1:0:pt_r1:0:r1:0:i1:0:it20
  const lastName = page.locator('input[id*="it20::content"]').first();
  await lastName.waitFor({ state: 'visible', timeout: 10000 });
  await lastName.fill('ApiService');

  // First Name = NewPe1:0:pt_r1:0:r1:0:i1:1:it60
  const firstName = page.locator('input[id*="it60::content"]').first();
  await firstName.fill('UAT');
  await firstName.press('Tab');
  await page.waitForTimeout(2000);
  console.log('Name filled.');

  await page.screenshot({ path: '/tmp/api-s2.png' });

  // Click Next through wizard steps
  const nextBtn = page.getByRole('button', { name: 'Next' });

  for (let step = 2; step <= 4; step++) {
    await nextBtn.click();
    await page.waitForTimeout(5000);
    await waitForJET(page);
    await page.screenshot({ path: `/tmp/api-s${step + 1}.png` });
    console.log(`Step ${step} done.`);
  }

  // Step 5 = Review
  await nextBtn.click();
  await page.waitForTimeout(5000);
  await waitForJET(page);
  console.log('Review step.');
  await page.screenshot({ path: '/tmp/api-review.png' });

  // Submit — force click since it might be an ADF link
  const submitBtn = page.getByRole('button', { name: 'Submit' });
  const isEnabled = await submitBtn.evaluate((el: any) => !el.getAttribute('aria-disabled') || el.getAttribute('aria-disabled') === 'false').catch(() => false);
  console.log('Submit enabled:', isEnabled);

  if (!isEnabled) {
    // Try force click via ADF
    await page.evaluate(() => {
      const btn = document.querySelector('[accesskey="m"][role="button"]') as any;
      if (btn) btn.click();
    });
    console.log('Forced submit click via JS.');
  } else {
    await submitBtn.click();
  }
  await page.waitForTimeout(3000);

  // Confirmation dialog
  const yesBtn = page.getByRole('button', { name: 'Yes' });
  if (await yesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await yesBtn.click();
    await page.waitForTimeout(10000);
  }

  await page.screenshot({ path: '/tmp/api-result.png' });
  const bodyText = await page.textContent('body') || '';
  const personMatch = bodyText.match(/(\d{8})/);
  console.log('Person Number:', personMatch?.[1] || 'not found');

  const okBtn = page.getByRole('button', { name: /OK|Done|Close/ });
  if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await okBtn.click();
  }

  console.log('Done.');
  await browser.close();
}

main().catch(e => { console.error('FAILED:', e.message.substring(0, 500)); process.exit(1); });
