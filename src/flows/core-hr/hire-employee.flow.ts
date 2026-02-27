import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Hire an Employee
 * Tab: "Core - Hires"
 * Full person creation with "Hire" action.
 */
export class HireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // TODO: Click "Hire an Employee" task/button
    await this.page.locator('button:has-text("Hire"), a:has-text("Hire an Employee")').first().click();
    await this.person.waitForReady();

    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
