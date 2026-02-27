import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Pending to Hire (One App)
 * Tab: "Core - One app Pending to Hire"
 * Searches by Person Number, then converts pending worker to hire.
 */
export class PendingToHireFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // TODO: Implement Person Management search by person number
    const personNumber = getField(tc, 'Search for Person Number');
    if (personNumber) {
      // TODO: Use Person Management search to find person by number
      void personNumber; // placeholder until search is implemented
    }

    // TODO: Click "Hire" action for pending worker

    await this.fillCommonSections(tc);

    // Staff and Designation section (specific to this tab)
    await this.staffDesignation.fillFromTestCase(tc);
    await this.staffDesignation.fillTraining(tc);

    await this.submitAndVerify();
  }
}
