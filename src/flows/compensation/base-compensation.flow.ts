import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { CompensationPage } from '../../pages/compensation/compensation.page';
import type { UATTestCase } from '../../data/types';

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
  async navigateToCompensation(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.compensation.navigateToCompensation();
  }
}
