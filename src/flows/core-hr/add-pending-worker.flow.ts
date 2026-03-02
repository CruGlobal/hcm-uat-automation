import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
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

    // Step 5: Compensation and Other Information (skip)
    await this.clickNext();

    // Step 6: Review → Submit
    await this.submitAndVerify();
  }
}
