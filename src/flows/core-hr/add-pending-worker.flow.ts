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
 * IMPORTANT: The Add Pending Worker wizard is a SINGLE-PAGE form — it does NOT
 * have the multi-step Employment Information page that the Hire Employee wizard has.
 * Fields available: When/Why (date, action, reason, legal employer, worker type),
 * Personal Details (name, gender, DOB). No Assignment, Job, Payroll, or Manager fields.
 * The When/Why section uses `AddPw1:0:SP1:` prefix — suffix selectors `[id$="SP1:..."]`
 * from WhenAndWhyPage match correctly.
 */
export class AddPendingWorkerFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToAddPendingWorker();

    // Single-page wizard: fill When/Why + Personal Details, then Submit.
    // No step navigation needed — all fields are on the initial page.
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.person.fillIdentificationFromTestCase(tc);
    await this.dismissMatchingPersonDialog();
    await this.submitAndVerify();
  }
}
