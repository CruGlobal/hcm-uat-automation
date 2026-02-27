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
    await this.setup();

    // Search for pending worker by person number
    const personNumber = getField(tc, 'Search for Person Number');
    if (personNumber) {
      // TODO: Update with actual person number search flow
      const searchInput = this.page.locator('input[aria-label*="Person Number"], input[placeholder*="Person"]').first();
      await searchInput.fill(personNumber);
      await searchInput.press('Enter');
      await this.person.waitForReady();
    }

    // TODO: Click "Hire" action for pending worker
    await this.page.locator('button:has-text("Hire"), a:has-text("Hire")').first().click();
    await this.person.waitForReady();

    await this.fillCommonSections(tc);

    // Staff and Designation section (specific to this tab)
    await this.staffDesignation.fillFromTestCase(tc);
    await this.staffDesignation.fillTraining(tc);

    await this.submitAndVerify();
  }
}
