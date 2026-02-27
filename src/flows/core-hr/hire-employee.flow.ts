import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Hire an Employee
 * Tab: "Core - Hires"
 * Full person creation with "Hire" action.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Hire an Employee
 */
export class HireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Login and navigate to the Hire an Employee form
    await this.loginToHCM();
    await this.homePage.goToHireEmployee();

    // Fill wizard steps and submit
    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
