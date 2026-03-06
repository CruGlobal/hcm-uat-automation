import { type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { HomePage } from '../pages/home.page';
import { resolveUser, needsSwitch, getCurrentUser, setCurrentUser } from '../config/user-session-manager';
import type { UATTestCase } from '../data/types';
import { provisionEmployeeLogin } from '../../scripts/lib/hcm-rest-api';
import { resolveApiCredentials } from '../validation/api-credentials';

/**
 * Base flow shared across all modules.
 * Handles login → navigate to module → verify landing.
 */
export class BaseFlow {
  protected loginPage: LoginPage;
  protected homePage: HomePage;

  constructor(protected readonly page: Page) {
    this.loginPage = new LoginPage(page);
    this.homePage = new HomePage(page);
  }

  /**
   * Login as the bot user assigned to this test case.
   *
   * All tests run with bot users (direct Oracle login, no SSO).
   * When called with a UATTestCase, resolves the correct bot and switches if needed.
   * When called without tc (sub-flows), ensures we're still logged in.
   */
  async loginToHCM(tc?: UATTestCase): Promise<void> {
    if (tc && needsSwitch(tc)) {
      const user = resolveUser(tc);
      console.log(`[BaseFlow] Login as ${user.botName} (${user.sheetName || 'default'}) for test ${tc.testId}`);

      // Only logout if someone is currently logged in
      if (getCurrentUser() !== null) {
        await this.loginPage.logout();
        setCurrentUser(null);
      }

      // Login as bot user
      await this.loginPage.fullLogin(user.username, user.password, user.totpSecret);
      setCurrentUser(user.botName);
    } else if (tc) {
      // Same bot user — just ensure we're logged in
      const user = resolveUser(tc);
      await this.loginPage.fullLogin(user.username, user.password, user.totpSecret);
    } else {
      // No tc (sub-flow) — parent already logged in, ensure session is alive
      await this.loginPage.fullLogin();
    }
  }

  /**
   * Login as a specific employee by person number.
   * Provisions their credentials via SCIM (reset password + ensure active),
   * then does a direct Oracle login as that employee.
   * Used for ESS tests where the bot needs to act as the target employee.
   */
  async loginAsEmployee(personNumber: string, testId?: string): Promise<void> {
    const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    const apiCreds = resolveApiCredentials();

    const loginCreds = await provisionEmployeeLogin(baseUrl, personNumber, undefined, apiCreds);
    if (!loginCreds) {
      throw new Error(`[BaseFlow] Cannot provision login for person ${personNumber}${testId ? ` (${testId})` : ''} — no SCIM user found`);
    }

    console.log(`[BaseFlow] Logging in as employee ${loginCreds.username} (person ${personNumber})${testId ? ` for test ${testId}` : ''}`);

    // Logout current session if any
    if (getCurrentUser() !== null) {
      await this.loginPage.logout();
      setCurrentUser(null);
    }

    await this.loginPage.fullLogin(loginCreds.username, loginCreds.password);
    setCurrentUser(`employee:${personNumber}`);
  }

  /** Navigate to the home page. */
  async navigateHome(): Promise<void> {
    await this.homePage.goHome();
  }
}
