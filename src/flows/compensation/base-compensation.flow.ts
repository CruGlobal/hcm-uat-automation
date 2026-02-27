import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { CompensationPage } from '../../pages/compensation/compensation.page';

/**
 * Base flow for Workforce Compensation module.
 * Handles login and navigation to the Compensation area.
 */
export class BaseCompensationFlow extends BaseFlow {
  protected compensation: CompensationPage;

  constructor(page: Page) {
    super(page);
    this.compensation = new CompensationPage(page);
  }

  /** Login and navigate to the Compensation area. */
  async navigateToCompensation(): Promise<void> {
    await this.loginToHCM();
    await this.compensation.navigateToCompensation();
  }
}
