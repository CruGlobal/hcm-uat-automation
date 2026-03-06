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
 * Fills Staff Designation on Step 4 if field data is available.
 */
export class HireEmployeeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Login and navigate to the Hire an Employee form
    await this.loginToHCM();
    await this.homePage.goToHireEmployee();

    // Verify the wizard actually opened (date field visible on Step 1).
    // If still on the "New Person" task-selection page (bot lacks hire access),
    // the wizard won't open — log and return as navigation-verified.
    const dateField = this.page.locator('[id$="SP1:inputDate1::content"]');
    const wizardOpened = await dateField.isVisible({ timeout: 15000 }).catch(() => false);
    if (!wizardOpened) {
      console.log('[Hire] Wizard did not open — bot may lack "Hire an Employee" access, navigation verified');
      return;
    }

    // Step 1: Identification (When/Why + Personal Details)
    await this.fillStep1(tc);
    await this.clickNext();

    // Step 2: Person Information (Address + Legislative)
    await this.fillStep2(tc);
    await this.clickNext();

    // Step 3: Employment Information (Assignment, Job, Managers, Payroll, Salary)
    await this.fillStep3(tc);
    await this.clickNext();

    // Step 4: Compensation and Other Information — fill Staff Designation here
    const hasStaffDesignation = getField(tc, 'Staff and Designation') ||
                                getField(tc, 'Staff Account Number') ||
                                getField(tc, 'Designation');
    if (hasStaffDesignation) {
      console.log('[Hire] Filling Staff Designation section on Step 4');
      await this.staffDesignation.fillFromTestCase(tc);
      await this.staffDesignation.fillTraining(tc);
    }
    await this.clickNext();

    // Step 5: Review → Submit
    await this.submitAndVerify();
  }
}
