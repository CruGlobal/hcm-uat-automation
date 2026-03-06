import { type Page } from '@playwright/test';
import { BasePage } from './base.page';
import { env } from '../config/environment';
import { TOTP } from 'otpauth';
import { unlockBotAccount } from '../../scripts/lib/hcm-rest-api';

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
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async login(username?: string, password?: string, totpSecret?: string): Promise<void> {
    const user = username || env.oracle.username;
    const pass = password || env.oracle.password;
    const secret = totpSecret || env.okta.totpSecret;

    // Step 1: Click "Company Single Sign-On" on Oracle login page
    await this.ssoButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});

    // Step 2: Okta — enter username
    await this.oktaUsername.waitFor({ state: 'visible', timeout: 15_000 });
    await this.oktaUsername.fill(user);
    await this.oktaNextButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(3_000);

    // Step 3: Okta — two-factor verification
    // New Okta flow (2026-03): passwordless-first, then password as second factor.
    // Old flow: username → password → MFA selection → TOTP
    // New flow: username → MFA selection → TOTP → second factor selection → password
    const totp = new TOTP({ secret: secret });

    // Check if we're on the MFA selection page or the password page
    const gaSelectVisible = await this.googleAuthSelect.isVisible({ timeout: 5_000 }).catch(() => false);

    if (gaSelectVisible) {
      // New flow: MFA selection first (passwordless)
      await this.googleAuthSelect.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(3_000);

      // Enter TOTP code
      await this.mfaCodeInput.waitFor({ state: 'visible', timeout: 15_000 });
      await this.enterTOTP(totp);

      // After TOTP, Okta may ask for a second factor (password)
      if (!this.page.url().includes('fscmUI')) {
        const pwdSelect = this.page.locator('a[aria-label="Select Password."]');
        const pwdSelectVisible = await pwdSelect.isVisible({ timeout: 5_000 }).catch(() => false);
        if (pwdSelectVisible) {
          await pwdSelect.click();
          await this.page.waitForLoadState('networkidle').catch(() => {});
          await this.page.waitForTimeout(3_000);
          await this.oktaPassword.waitFor({ state: 'visible', timeout: 10_000 });
          await this.oktaPassword.fill(pass);
          await this.oktaNextButton.click();
        }
      }
    } else {
      // Old flow: password first, then MFA
      await this.oktaPassword.waitFor({ state: 'visible', timeout: 15_000 });
      await this.oktaPassword.fill(pass);
      await this.oktaNextButton.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});

      await this.googleAuthSelect.waitFor({ state: 'visible', timeout: 15_000 });
      await this.googleAuthSelect.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});

      await this.mfaCodeInput.waitFor({ state: 'visible', timeout: 15_000 });
      await this.enterTOTP(totp);
    }

    // Ensure we're on the HCM page
    if (!this.page.url().includes('fscmUI')) {
      await this.page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
    }
    await this.waitForReady();
    await this.dismissPopups();
  }

  /**
   * Enter TOTP code with retry logic for code reuse and rate limiting.
   */
  private async enterTOTP(totp: TOTP): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const rateLimitAlert = this.page.getByText('Too many attempts', { exact: false });
      const isRateLimited = await rateLimitAlert.isVisible({ timeout: 2000 }).catch(() => false);
      if (isRateLimited) {
        const waitSecs = 30 + attempt * 15;
        console.log(`[Login] Okta rate limited, waiting ${waitSecs}s (attempt ${attempt})...`);
        await this.page.waitForTimeout(waitSecs * 1000);
        await this.page.reload({ waitUntil: 'networkidle' });
        if (this.page.url().includes('fscmUI')) return;
        const hasMfaInput = await this.mfaCodeInput.isVisible({ timeout: 5000 }).catch(() => false);
        if (!hasMfaInput) return; // Page changed, caller handles next step
      }

      const code = totp.generate();
      await this.mfaCodeInput.fill(code);
      await this.oktaNextButton.click();

      // Check for redirect or second factor page
      await this.page.waitForTimeout(3_000);
      if (this.page.url().includes('fscmUI')) return;

      // Check if we landed on a second-factor selection page (success for TOTP step)
      const secondFactorPage = await this.page.locator('a[aria-label="Select Password."]').isVisible({ timeout: 2000 }).catch(() => false);
      if (secondFactorPage) return;

      // Check for errors
      const errorMsg = this.page.locator('.o-form-has-errors, [data-se="o-form-error-container"]');
      const hasError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasError && attempt < 5) {
        console.log(`[Login] TOTP attempt ${attempt} failed, waiting for next period...`);
        const now = Math.floor(Date.now() / 1000);
        const secondsUntilNext = 30 - (now % 30) + 1;
        await this.page.waitForTimeout(secondsUntilNext * 1000);
        continue;
      }

      if (attempt === 5 && !this.page.url().includes('fscmUI')) {
        await this.page.waitForURL('**/fscmUI/**', { timeout: 30_000 }).catch(() => {});
      }
    }
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
      // Auto-unlock via SCIM REST API (set active=true)
      if (username.startsWith('uat.')) {
        const unlocked = await this.tryUnlockBot(username);
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
   * Attempt to unlock a locked Oracle bot account via SCIM REST API.
   * Sets active=true on the user account. Takes ~2 seconds vs ~5 minutes for the old UI approach.
   */
  private async tryUnlockBot(username: string): Promise<boolean> {
    console.log(`[Login] Account locked for ${username} — attempting SCIM REST API unlock...`);
    const baseUrl = env.oracle.url.replace(/\/$/, '');
    return unlockBotAccount(baseUrl, username);
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
