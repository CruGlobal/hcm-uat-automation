import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Non Worker
 * Tab: "Core - Add Non Worker"
 * Creates a new non-worker with "Add Non Worker" action and Non Worker Type.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Add a Nonworker
 */
export class AddNonWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Login and navigate to the Add a Nonworker form
    await this.loginToHCM();
    await this.homePage.goToAddNonworker();

    // Fill wizard steps and submit
    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
