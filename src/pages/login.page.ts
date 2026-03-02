import { type Page } from '@playwright/test';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { BasePage } from './base.page';
import { env } from '../config/environment';
import { TOTP } from 'otpauth';

export class LoginPage extends BasePage {
  // Oracle native login form (direct login, no SSO)
  private readonly nativeUserId = this.page.getByRole('textbox', { name: 'User ID' });
  private readonly nativePassword = this.page.getByRole('textbox', { name: 'Password' });
  private readonly nativeSignIn = this.page.getByRole('button', { name: 'Sign In' });

  // Oracle login page — SSO button
  private readonly ssoButton = this.page.locator('#ssoBtn');

  // Okta SSO — username step
  private readonly oktaUsername = this.page.locator('input[name="identifier"]');
  private readonly oktaNextButton = this.page.locator('input[type="submit"]');

  // Okta SSO — password step
  private readonly oktaPassword = this.page.locator('input[name="credentials.passcode"]');

  // Okta SSO — MFA step
  private readonly googleAuthSelect = this.page.locator('a[aria-label="Select Google Authenticator."]');
  private readonly mfaCodeInput = this.page.locator('input[name="credentials.passcode"]');

  async navigate(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async login(username?: string, password?: string, totpSecret?: string): Promise<void> {
    const user = username || env.oracle.username;
    const pass = password || env.oracle.password;
    const secret = totpSecret || env.okta.totpSecret;

    // Step 1: Click "Company Single Sign-On" on Oracle login page
    await this.ssoButton.click();
    await this.page.waitForLoadState('networkidle');

    // Step 2: Okta — enter username
    await this.oktaUsername.fill(user);
    await this.oktaNextButton.click();
    await this.page.waitForLoadState('networkidle');

    // Step 3: Okta — enter password
    await this.oktaPassword.waitFor({ state: 'visible', timeout: 15_000 });
    await this.oktaPassword.fill(pass);
    await this.oktaNextButton.click();
    await this.page.waitForLoadState('networkidle');

    // Step 4: Okta — MFA with Google Authenticator TOTP
    await this.googleAuthSelect.waitFor({ state: 'visible', timeout: 15_000 });
    await this.googleAuthSelect.click();
    await this.page.waitForLoadState('networkidle');

    const totp = new TOTP({ secret: secret });
    await this.mfaCodeInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Retry TOTP up to 5 times — codes can be rejected if reused within the same
    // 30-second window, or Okta may rate-limit ("Too many attempts").
    for (let attempt = 1; attempt <= 5; attempt++) {
      // Check for Okta rate limiting BEFORE entering the code
      const rateLimitAlert = this.page.getByText('Too many attempts', { exact: false });
      const isRateLimited = await rateLimitAlert.isVisible({ timeout: 2000 }).catch(() => false);
      if (isRateLimited) {
        const waitSecs = 30 + attempt * 15; // 45s, 60s, 75s, 90s, 105s
        console.log(`[Login] Okta rate limited, waiting ${waitSecs}s before retry (attempt ${attempt})...`);
        await this.page.waitForTimeout(waitSecs * 1000);
        // Refresh the page to clear the rate limit state
        await this.page.reload({ waitUntil: 'networkidle' });
        // Re-navigate through login if needed
        if (!this.page.url().includes('fscmUI')) {
          const hasMfaInput = await this.mfaCodeInput.isVisible({ timeout: 5000 }).catch(() => false);
          if (!hasMfaInput) {
            // Need to re-login from scratch
            console.log('[Login] Re-starting login after rate limit...');
            await this.navigate();
            await this.login(user, pass, secret);
            return;
          }
        }
      }

      const code = totp.generate();
      await this.mfaCodeInput.fill(code);
      await this.oktaNextButton.click();

      // Check if we got redirected to HCM or if there's an error
      const redirected = await this.page.waitForURL('**/fscmUI/**', { timeout: 10_000 }).then(() => true).catch(() => false);
      if (redirected) break;

      // Check for errors
      const errorMsg = this.page.locator('.o-form-has-errors, [data-se="o-form-error-container"]');
      const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
      const tooManyAttempts = await rateLimitAlert.isVisible({ timeout: 1000 }).catch(() => false);

      if (tooManyAttempts && attempt < 5) {
        console.log(`[Login] Okta rate limit detected after attempt ${attempt}`);
        continue; // Loop back to the rate limit handler at the top
      }

      if (hasError && attempt < 5) {
        console.log(`[Login] TOTP attempt ${attempt} failed (code reuse), waiting for next period...`);
        // Wait until the next 30-second TOTP window
        const now = Math.floor(Date.now() / 1000);
        const secondsUntilNext = 30 - (now % 30) + 1;
        await this.page.waitForTimeout(secondsUntilNext * 1000);
        continue;
      }

      if (attempt === 5) {
        // Final attempt — wait longer for redirect
        await this.page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
      }
    }

    // Step 5: Ensure we're on the HCM page
    if (!this.page.url().includes('fscmUI')) {
      await this.page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
    }
    await this.waitForReady();
    await this.dismissPopups();
  }

  /**
   * Direct Oracle HCM login (no SSO/Okta/MFA).
   * Uses the native Oracle login form on the login page.
   * Used by bot users that don't have Okta SSO accounts.
   *
   * Handles Oracle intermediate pages that may appear before the HCM dashboard:
   * - Terms of Use / Privacy Policy acceptance
   * - Password change required
   * - Account setup / profile completion
   */
  async directLogin(username: string, password: string): Promise<void> {
    console.log(`[Login] Direct HCM login as ${username}`);

    // Fill the native Oracle login form
    await this.nativeUserId.waitFor({ state: 'visible', timeout: 15_000 });
    await this.nativeUserId.fill(username);
    await this.nativePassword.fill(password);
    await this.nativeSignIn.click();

    // Wait for any navigation after login (may land on intermediate pages)
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

    // Check for Oracle OAM credential rejection (URL stays at auth_cred_submit = login failed)
    if (this.page.url().includes('auth_cred_submit')) {
      // Auto-unlock: extract bot name from username (uat.bot_name → bot_name) and reset
      const botName = username.startsWith('uat.') ? username.slice(4) : null;
      if (botName) {
        const unlocked = await this.tryUnlockBot(botName);
        if (unlocked) {
          // Retry login once after unlock
          console.log(`[Login] Retrying login for ${username} after unlock...`);
          await this.page.goto('/');
          await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
          await this.nativeUserId.waitFor({ state: 'visible', timeout: 15_000 });
          await this.nativeUserId.fill(username);
          await this.nativePassword.fill(password);
          await this.nativeSignIn.click();
          await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
          if (!this.page.url().includes('auth_cred_submit')) return; // retry succeeded
        }
      }
      throw new Error(`[Login] Oracle OAM rejected credentials for ${username} — account may be locked, disabled, or password incorrect. URL: ${this.page.url()}`);
    }

    // Handle Oracle intermediate pages (retry up to 5 times)
    for (let i = 0; i < 5; i++) {
      const url = this.page.url();
      if (url.includes('fscmUI')) break;

      // If still on OAM auth page, credentials failed — fail fast
      if (url.includes('auth_cred_submit') || url.includes('/oam/server/')) {
        throw new Error(`[Login] Oracle OAM login failed for ${username} — URL: ${url}`);
      }

      console.log(`[Login] Intermediate page detected (${username}): ${url}`);

      // Terms of Use / Privacy Policy — click Accept/Continue/OK
      const acceptBtn = this.page.getByRole('button', { name: /Accept|Continue|OK|I Agree|Agree/i }).first();
      if (await acceptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log(`[Login] Accepting terms/prompt for ${username}`);
        await acceptBtn.click();
        await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        continue;
      }

      // Password change required — skip if possible by navigating directly to HCM
      const pwdChangeIndicator = this.page.locator(
        ':text("change your password"), :text("password expired"), :text("reset your password")'
      ).first();
      if (await pwdChangeIndicator.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log(`[Login] Password change page detected for ${username} — navigating to HCM directly`);
        const baseUrl = this.page.url().split('/OA_HTML')[0].split('/fscmUI')[0];
        await this.page.goto(`${baseUrl}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'networkidle', timeout: 60_000 });
        break;
      }

      // Oracle "Complete Your Profile" or other setup screens — try clicking Skip/Later
      const skipBtn = this.page.getByRole('button', { name: /Skip|Later|Remind Me Later/i }).first();
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        console.log(`[Login] Skipping setup screen for ${username}`);
        await skipBtn.click();
        await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        continue;
      }

      // Wait a bit and check again
      await this.page.waitForTimeout(3_000);
    }

    // Final wait for fscmUI
    if (!this.page.url().includes('fscmUI')) {
      await this.page.waitForURL('**/fscmUI/**', { timeout: 60_000 });
    }
    await this.waitForReady();
    await this.dismissPopups();
  }

  /**
   * Attempt to unlock a locked Oracle bot account by running reset-one-bot.ts as a subprocess.
   * Uses admin SSO credentials. Returns true if unlock succeeded, false if it failed.
   */
  private async tryUnlockBot(botName: string): Promise<boolean> {
    console.log(`[Login] Account locked for ${botName} — attempting auto-unlock via reset-one-bot.ts...`);
    const scriptPath = path.resolve(process.cwd(), 'scripts/inspect/reset-one-bot.ts');
    const result = spawnSync('npx', ['tsx', scriptPath, botName], {
      timeout: 5 * 60 * 1000, // 5 minutes max
      encoding: 'utf-8',
      env: { ...process.env },
    });
    if (result.status === 0) {
      console.log(`[Login] Auto-unlock succeeded for ${botName}`);
      return true;
    }
    const errOutput = (result.stderr || result.stdout || '').substring(0, 300);
    console.warn(`[Login] Auto-unlock failed for ${botName} (exit ${result.status}): ${errOutput}`);
    return false;
  }

  /**
   * Full login flow: navigate to Oracle → login → HCM home.
   * Routes to SSO (Okta + MFA) or direct login based on whether totpSecret is provided.
   * - With totpSecret: SSO path (Okta username → password → MFA → HCM)
   * - Without totpSecret: Direct Oracle login (username → password → HCM)
   */
  async fullLogin(username?: string, password?: string, totpSecret?: string): Promise<void> {
    // If we're already on the HCM page (storageState session), just ensure it's ready
    const currentUrl = this.page.url();
    if (currentUrl.includes('fscmUI')) {
      await this.waitForReady();
      await this.dismissPopups();
      return;
    }

    await this.navigate();

    // If the session from storageState redirected us to HCM, skip login
    if (this.page.url().includes('fscmUI')) {
      await this.waitForReady();
      await this.dismissPopups();
      return;
    }

    // Route: direct login (no TOTP) vs SSO login (with TOTP)
    if (username && password && !totpSecret) {
      await this.directLogin(username, password);
    } else {
      await this.login(username, password, totpSecret);
    }
  }

  /** Log out of Oracle HCM by navigating to the signout URL. */
  async logout(): Promise<void> {
    const baseUrl = env.oracle.url.replace(/\/$/, '');
    await this.page.goto(`${baseUrl}/fscmUI/faces/FuseLogout`, { waitUntil: 'networkidle', timeout: 30_000 });
    // Clear cookies to ensure clean state for next login
    await this.page.context().clearCookies();
    // Navigate to base URL so fullLogin() doesn't think we're still on HCM
    await this.page.goto('about:blank');
    console.log('[Login] Logged out and cleared cookies');
  }
}
