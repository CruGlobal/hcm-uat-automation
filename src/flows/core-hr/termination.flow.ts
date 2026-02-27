import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Termination / End Work Relationship
 * Tab: "Core - Terms/Ends"
 * Placeholder — currently 0 test cases in the sheet.
 */
export class TerminationFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // TODO: Implement termination flow when test cases are added to the sheet.
    // Expected steps:
    // 1. Search for person
    // 2. Select termination action
    // 3. Fill effective date and reason
    // 4. Submit

    await this.whenAndWhy.fillFromTestCase(tc);
    await this.submitAndVerify();
  }
}
