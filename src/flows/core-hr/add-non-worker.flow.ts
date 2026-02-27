import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Non Worker
 * Tab: "Core - Add Non Worker"
 * Creates a new non-worker with "Add Non Worker" action and Non Worker Type.
 */
export class AddNonWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // TODO: Click "Add Non Worker" task/button
    await this.page.locator('button:has-text("Add"), a:has-text("Add Non Worker")').first().click();
    await this.person.waitForReady();

    // When and Why includes Non Worker Type for this tab
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.person.fillFromTestCase(tc);
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);

    await this.submitAndVerify();
  }
}
