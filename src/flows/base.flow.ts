import { type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { HomePage } from '../pages/home.page';

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

  /** Login and navigate to the home page. */
  async loginToHCM(username?: string, password?: string): Promise<void> {
    await this.loginPage.fullLogin(username, password);
  }

  /** Navigate to the home page. */
  async navigateHome(): Promise<void> {
    await this.homePage.goHome();
  }
}
