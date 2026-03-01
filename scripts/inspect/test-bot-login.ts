/**
 * Verify bot user direct login works after password reset.
 */
import { chromium } from 'playwright';
import { env } from '../../src/config/environment';

const HEADLESS = process.env.HEADLESS !== 'false';

async function tryLogin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    baseURL: env.oracle.url,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(env.oracle.url);
    await page.waitForLoadState('networkidle');

    const userIdField = page.getByRole('textbox', { name: 'User ID' });
    await userIdField.waitFor({ state: 'visible', timeout: 15_000 });
    await userIdField.fill(username);

    const passwordField = page.getByRole('textbox', { name: 'Password' });
    await passwordField.fill(password);

    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await signInBtn.click();

    // Wait for redirect to HCM or error
    const redirected = await page.waitForURL('**/fscmUI/**', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (redirected) {
      await page.screenshot({ path: `/tmp/bot-login-ok-${username.replace(/[@.]/g, '_')}.png` });
      return { success: true };
    }

    const pageText = await page.textContent('body') || '';
    if (pageText.includes('Authentication failed')) return { success: false, error: 'Auth failed' };
    if (pageText.includes('password') && pageText.includes('expired')) return { success: false, error: 'Password expired' };
    if (pageText.includes('locked')) return { success: false, error: 'Account locked' };
    if (pageText.includes('change') && pageText.includes('password')) return { success: false, error: 'Must change password' };

    await page.screenshot({ path: `/tmp/bot-login-unknown-${username.replace(/[@.]/g, '_')}.png` });
    return { success: false, error: 'Unknown - no redirect' };
  } catch (err: any) {
    return { success: false, error: err.message.slice(0, 80) };
  } finally {
    await browser.close();
  }
}

async function main() {
  const PASSWORD = 'WinBuildSend!1951@cru';

  // Test with bot_hr_admin (known working username)
  const tests = [
    { name: 'bot_hr_admin', username: 'uat.bot_hr_admin' },
    { name: 'bot_hr_local_usOps', username: 'uat.bot_hr_local_usOps' },
  ];

  console.log('Testing bot user login after password reset...\n');

  for (const test of tests) {
    process.stdout.write(`  ${test.username.padEnd(40)} → `);
    const result = await tryLogin(test.username, PASSWORD);
    if (result.success) {
      console.log('SUCCESS!');
    } else {
      console.log(`FAILED (${result.error})`);
    }
  }
}

main().catch(console.error);
