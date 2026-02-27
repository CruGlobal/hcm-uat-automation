import { type Page } from '@playwright/test';
import { BasePage } from './base.page';
import { env } from '../config/environment';
import { TOTP } from 'otpauth';

export class LoginPage extends BasePage {
  // Oracle login page
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

  async login(username?: string, password?: string): Promise<void> {
    const user = username || env.oracle.username;
    const pass = password || env.oracle.password;

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

    const totp = new TOTP({ secret: env.okta.totpSecret });
    const code = totp.generate();
    await this.mfaCodeInput.waitFor({ state: 'visible', timeout: 15_000 });
    await this.mfaCodeInput.fill(code);
    await this.oktaNextButton.click();

    // Step 5: Wait for redirect back to Oracle HCM
    await this.page.waitForURL('**/fscmUI/**', { timeout: 120_000 });
    await this.waitForReady();
    await this.dismissPopups();
  }

  /** Full login flow: navigate to Oracle → SSO → Okta → MFA → HCM home. */
  async fullLogin(username?: string, password?: string): Promise<void> {
    await this.navigate();
    await this.login(username, password);
  }
}
