import { type Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Oracle HCM Home/Springboard page.
 * Provides navigation to any HCM module via the springboard or navigator menu.
 */
export class HomePage extends BasePage {
  // TODO: Update selectors for actual Oracle HCM springboard
  private readonly springboardIcon = this.page.locator('[title="Home"], .oj-fwk-icon-home').first();
  private readonly navigatorMenu = this.page.locator('[title="Navigator"], button[aria-label="Navigator"]').first();
  private readonly searchBar = this.page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').first();

  /** Open the navigator/hamburger menu. */
  async openNavigator(): Promise<void> {
    await this.navigatorMenu.click();
    await this.waitForJET();
  }

  /** Navigate to a module via the springboard search. */
  async navigateToModule(moduleName: string): Promise<void> {
    await this.springboardIcon.click();
    await this.waitForJET();
    await this.dismissPopups();

    // Use search to find the module
    await this.searchBar.fill(moduleName);
    await this.searchBar.press('Enter');
    await this.waitForJET();

    // Click the matching result
    await this.page.locator(`a:has-text("${moduleName}"), [title="${moduleName}"]`).first().click();
    await this.waitForReady();
    await this.dismissPopups();
  }

  /** Navigate directly to Benefits. */
  async goToBenefits(): Promise<void> {
    await this.navigateToModule('Benefits');
  }

  /** Navigate directly to My Client Groups > Benefits. */
  async goToMyClientGroupsBenefits(): Promise<void> {
    await this.openNavigator();
    // TODO: Update path for actual Oracle HCM navigator structure
    await this.page.locator('text="My Client Groups"').first().click();
    await this.waitForJET();
    await this.page.locator('text="Benefits"').first().click();
    await this.waitForReady();
    await this.dismissPopups();
  }

  /** Navigate to Compensation. */
  async goToCompensation(): Promise<void> {
    await this.navigateToModule('Compensation');
  }

  /** Navigate to Absence Management. */
  async goToAbsenceManagement(): Promise<void> {
    await this.navigateToModule('Absence Management');
  }

  /** Navigate to Time and Labor. */
  async goToTimeAndLabor(): Promise<void> {
    await this.navigateToModule('Time and Labor');
  }

  /** Navigate to Payroll. */
  async goToPayroll(): Promise<void> {
    await this.navigateToModule('Payroll');
  }

  /** Go to the home springboard. */
  async goHome(): Promise<void> {
    await this.springboardIcon.click();
    await this.waitForReady();
    await this.dismissPopups();
  }
}
