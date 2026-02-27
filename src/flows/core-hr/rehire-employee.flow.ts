import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Rehire an Employee
 * Tab: "Core - rehires"
 *
 * Steps:
 * 1. Navigate to Person Management
 * 2. Search for existing person by name (from "Use Person" section)
 * 3. Initiate "Create Work Relationship" action for rehire
 * 4. Fill When/Why (rehire action + reason)
 * 5. Fill Assignment, Payroll, Salary, Manager sections
 * 6. Submit
 */
export class RehireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for existing person from "Use Person" section
    const lastName = getField(tc, 'Use Person > Last Name');
    const firstName = getField(tc, 'Use Person > First Name');
    if (lastName) {
      const searchTerm = firstName ? `${lastName}, ${firstName}` : lastName;
      await this.person.searchByName(searchTerm);
    }

    // After selecting person, need to initiate rehire action
    // This typically involves clicking "Actions" menu then "Create Work Relationship"
    // or navigating to the "Hire" action from the person's record
    await this.initiateRehireAction();

    // Fill the rehire wizard
    // The "Use Person" section has When/Why fields with different prefixes
    await this.whenAndWhy.fillFromTestCase(tc);

    // Assignment and other sections (on Employment Information step)
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);

    await this.submitAndVerify();
  }

  private async initiateRehireAction(): Promise<void> {
    // Look for Actions menu or "Create Work Relationship" button
    // This varies by page state — try common patterns
    const actionsButton = this.page.locator(
      'button:has-text("Actions"), [id*="Actions"], a[role="button"]:has-text("Actions")'
    ).first();

    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await actionsButton.click();
      await this.page.waitForTimeout(2000);

      // Select "Create Work Relationship" from the menu
      const rehireOption = this.page.locator(
        'td:has-text("Create Work Relationship"), li:has-text("Create Work Relationship"), [role="menuitem"]:has-text("Create Work Relationship")'
      ).first();
      if (await rehireOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rehireOption.click();
        await this.page.waitForTimeout(10000);
        await this.person.waitForJET();
      }
    }
  }
}
