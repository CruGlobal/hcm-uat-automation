import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Create Work Relationship
 * Tab: "Core - Create Work Relationship"
 *
 * Steps:
 * 1. Navigate to Person Management
 * 2. Search for existing person (field: "Search for Person" — format: "Name - PersonNumber")
 * 3. Open the person's record
 * 4. Initiate "Create Work Relationship" action
 * 5. Fill wizard (When/Why, Assignment, Managers, Payroll)
 * 6. Submit
 */
export class CreateWorkRelationshipFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for person — field format is "Name - PersonNumber" (e.g. "Ella Crockett - 10449952")
    const personSearch = getField(tc, 'Search for Person');
    if (personSearch) {
      // Extract just the name part before the dash, or use the whole string
      const namePart = personSearch.includes(' - ')
        ? personSearch.split(' - ')[0].trim()
        : personSearch;
      await this.person.searchByName(namePart);
    }

    // Initiate Create Work Relationship action
    await this.initiateCreateWorkRelationship();

    // Fill the wizard
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);

    await this.submitAndVerify();
  }

  private async initiateCreateWorkRelationship(): Promise<void> {
    const actionsButton = this.page.locator(
      'button:has-text("Actions"), [id*="Actions"], a[role="button"]:has-text("Actions")'
    ).first();

    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await actionsButton.click();
      await this.page.waitForTimeout(2000);

      const cwrOption = this.page.locator(
        'td:has-text("Create Work Relationship"), li:has-text("Create Work Relationship"), [role="menuitem"]:has-text("Create Work Relationship")'
      ).first();
      if (await cwrOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cwrOption.click();
        await this.page.waitForTimeout(10000);
        await this.person.waitForJET();
      }
    }
  }
}
