import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Pending Worker
 * Tab: "Core - Add Pending Workers"
 * Creates a new person with "Add Pending Worker" action.
 */
export class AddPendingWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // TODO: Click "Add Pending Worker" task/button in Person Management
    await this.page.locator('button:has-text("Add"), a:has-text("Add Pending Worker")').first().click();
    await this.person.waitForReady();

    await this.fillCommonSections(tc);
    await this.submitAndVerify();
  }
}
