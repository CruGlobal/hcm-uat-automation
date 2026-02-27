import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Pending to Hire (One App)
 * Tab: "Core - One app Pending to Hire"
 *
 * Steps:
 * 1. Navigate to Person Management
 * 2. Search by Person Number (from "Search for Person Number" field)
 * 3. Open the person's record
 * 4. Initiate "Hire" action from Actions menu
 * 5. Fill hire wizard (When/Why, Assignment, Managers, Payroll, Salary)
 * 6. Fill Staff Designation section (specific to this tab)
 * 7. Submit
 */
export class PendingToHireFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search by person number
    const personNumber = getField(tc, 'Search for Person Number');
    if (personNumber) {
      await this.person.searchByPersonNumber(personNumber);
    }

    // Initiate Hire action from the person's record
    await this.initiateHireAction();

    // Fill the hire wizard — When/Why is on Step 1
    await this.whenAndWhy.fillFromTestCase(tc);

    // Personal details may already exist — fill any overrides
    await this.person.fillIdentificationFromTestCase(tc);
    await this.clickNext();

    // Step 2: Person Information (address, legislative)
    await this.person.fillPersonInfoFromTestCase(tc);
    await this.clickNext();

    // Step 3: Employment Information (single scrollable page)
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);

    // Staff Designation section (specific to this tab)
    await this.staffDesignation.fillFromTestCase(tc);
    await this.staffDesignation.fillTraining(tc);

    await this.submitAndVerify();
  }

  private async initiateHireAction(): Promise<void> {
    // From the person's record, click Actions → Hire
    const actionsButton = this.page.locator(
      'button:has-text("Actions"), [id*="Actions"], a[role="button"]:has-text("Actions")'
    ).first();

    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await actionsButton.click();
      await this.page.waitForTimeout(2000);

      const hireOption = this.page.locator(
        'td:has-text("Hire"), li:has-text("Hire"), [role="menuitem"]:has-text("Hire")'
      ).first();
      if (await hireOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await hireOption.click();
        await this.page.waitForTimeout(10000);
        await this.person.waitForJET();
      }
    }
  }
}
