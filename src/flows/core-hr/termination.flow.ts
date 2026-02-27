import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Termination / End Work Relationship
 * Tab: "Core - Terms/Ends"
 *
 * Currently 0 test cases in the sheet, but the flow is ready for when data arrives.
 *
 * Expected steps:
 * 1. Navigate to Person Management
 * 2. Search for person by name or number
 * 3. Open the person's record
 * 4. Initiate "Terminate Work Relationship" action
 * 5. Fill termination date, action, and reason
 * 6. Submit
 */
export class TerminationFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for person
    const personName = getField(tc, 'Person Name') || getField(tc, 'Search for Person');
    const personNumber = getField(tc, 'Person Number') || getField(tc, 'Search for Person Number');
    if (personNumber) {
      await this.person.searchByPersonNumber(personNumber);
    } else if (personName) {
      await this.person.searchByName(personName);
    }

    // Initiate termination action
    await this.initiateTermination();

    // Fill termination details
    const effectiveDate = getField(tc, 'When - Effective date') || getField(tc, 'When');
    if (effectiveDate) {
      await this.whenAndWhy.fillEffectiveDate(excelSerialToDate(effectiveDate));
    }

    await this.whenAndWhy.fillFromTestCase(tc);
    await this.submitAndVerify();
  }

  private async initiateTermination(): Promise<void> {
    const actionsButton = this.page.locator(
      'button:has-text("Actions"), [id*="Actions"], a[role="button"]:has-text("Actions")'
    ).first();

    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await actionsButton.click();
      await this.page.waitForTimeout(2000);

      const termOption = this.page.locator(
        'td:has-text("Terminate Work Relationship"), li:has-text("Terminate"), ' +
        '[role="menuitem"]:has-text("Terminate")'
      ).first();
      if (await termOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await termOption.click();
        await this.page.waitForTimeout(10000);
        await this.person.waitForJET();
      }
    }
  }
}
