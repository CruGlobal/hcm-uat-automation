import { type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { HomePage } from '../pages/home.page';
import { resolveUser, needsSwitch, getCurrentUser, setCurrentUser } from '../config/user-session-manager';
import type { UATTestCase } from '../data/types';

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

  /** Navigate to the home page. */
  async navigateHome(): Promise<void> {
    await this.homePage.goHome();
  }
}
