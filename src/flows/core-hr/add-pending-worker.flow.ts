import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Pending Worker
 * Tab: "Core - Add Pending Workers"
 * Creates a new person with "Add Pending Worker" action.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Add a Pending Worker
 */
export class AddPendingWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Login and navigate to the Add a Pending Worker form
    await this.loginToHCM();
    await this.homePage.goToAddPendingWorker();

    // Fill wizard steps and submit
    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
