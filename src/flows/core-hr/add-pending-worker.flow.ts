import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Pending Worker
 * Tab: "Core - Add Pending Workers"
 * Creates a new person with "Add Pending Worker" action.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Add a Pending Worker
 *
 * 6-step wizard:
 *   Step 1: Identification (Basic Details + Personal Details)
 *   Step 2: Person Information (Address + Legislative)
 *   Step 3: Person Profile
 *   Step 4: Employment Information (Assignment, Job, Managers, Payroll)
 *   Step 5: Compensation and Other Information
 *   Step 6: Review → Submit
 */
export class AddPendingWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToAddPendingWorker();

    // Verify the wizard actually opened (date field visible on Step 1).
    const dateField = this.page.locator('[id$="SP1:inputDate1::content"]');
    const wizardOpened = await dateField.isVisible({ timeout: 15000 }).catch(() => false);
    if (!wizardOpened) {
      throw new Error(`${tc.testId}: Add Pending Worker wizard did not open — bot may lack access`);
    }

    // Step 1: Identification (Basic Details + Personal Details)
    await this.fillStep1(tc);
    await this.clickNext();

    // Step 2: Person Information (Address + Legislative)
    await this.fillStep2(tc);
    await this.clickNext();

    // Step 3: Person Profile (skip — no fields to fill)
    await this.clickNext();

    // Step 4: Employment Information (Assignment, Job, Managers, Payroll)
    await this.fillStep3(tc);
    await this.clickNext();

    // Step 5: Compensation and Other Information (skip — Staff Designation filled post-submission)
    await this.clickNext();

    // Step 6: Review → Submit
    const personNumber = await this.submitAndVerify();

    // Post-submission: Create Staff Designation EIT via Person Management
    const hasStaffDesignation = getField(tc, 'Staff Account Number') || getField(tc, 'Designation');
    if (hasStaffDesignation && personNumber) {
      console.log(`[AddPendingWorker] Creating post-submission Staff Designation EIT for person ${personNumber}`);
      await this.staffDesignation.createPostSubmissionEIT(personNumber, tc);
    }
  }
}
