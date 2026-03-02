import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Hire an Employee
 * Tab: "Core - Hires"
 * Full person creation with "Hire" action.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Hire an Employee
 *
 * 5-step wizard:
 *   Step 1: Identification (When/Why + Personal Details)
 *   Step 2: Person Information (Address + Legislative)
 *   Step 3: Employment Information (Assignment, Job, Managers, Payroll, Salary)
 *   Step 4: Compensation and Other Information
 *   Step 5: Review → Submit
 *
 * After submission, fills Staff Designation if field data is available
 * (only for tests that include "Staff and Designation" section data).
 */
export class HireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Login and navigate to the Hire an Employee form
    await this.loginToHCM();
    await this.homePage.goToHireEmployee();

    // Fill wizard steps and submit
    await this.fillCommonSections(tc);

    // Fill Staff Designation if data is available (before submit on Step 5)
    const hasStaffDesignation = getField(tc, 'Staff and Designation') ||
                                getField(tc, 'Staff Account Number') ||
                                getField(tc, 'Designation');
    if (hasStaffDesignation) {
      console.log('[Hire] Filling Staff Designation section');
      await this.staffDesignation.fillFromTestCase(tc);
      await this.staffDesignation.fillTraining(tc);
    }

    await this.submitAndVerify();
  }
}
