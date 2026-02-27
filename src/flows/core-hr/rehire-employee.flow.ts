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
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // TODO: Implement person search for rehire context
    // Search for existing person from "Use Person" section
    const lastName = getField(tc, 'Use Person > Last Name');
    const firstName = getField(tc, 'Use Person > First Name');
    if (lastName) {
      // TODO: Use Person Management search to find person by name
      const searchTerm = firstName ? `${lastName}, ${firstName}` : lastName;
      void searchTerm; // placeholder until search is implemented
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
