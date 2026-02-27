import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Rehire an Employee
 * Tab: "Core - rehires"
 * Searches by name from "Use Person" section, then rehires.
 */
export class RehireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // Search for existing person from "Use Person" section
    const lastName = getField(tc, 'Use Person > Last Name');
    const firstName = getField(tc, 'Use Person > First Name');
    if (lastName) {
      // TODO: Update with actual person search in rehire context
      const searchInput = this.page.locator('input[aria-label*="Search"], input[placeholder*="Person"]').first();
      const searchTerm = firstName ? `${lastName}, ${firstName}` : lastName;
      await searchInput.fill(searchTerm);
      await searchInput.press('Enter');
      await this.person.waitForReady();

      // Select the person from results
      await this.page.locator(`text="${lastName}"`).first().click();
      await this.person.waitForReady();
    }

    // The "Use Person" section contains When/Why fields with different prefixes
    await this.whenAndWhy.fillFromTestCase(tc);

    // Assignment and other sections
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);
    await this.staffDesignation.fillFromTestCase(tc);

    await this.submitAndVerify();
  }
}
