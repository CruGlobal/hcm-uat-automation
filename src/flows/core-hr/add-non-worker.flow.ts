import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Add Non Worker
 * Tab: "Core - Add Non Worker"
 * Creates a new non-worker with "Add Non Worker" action and Non Worker Type.
 *
 * Navigation: Login → Navigator → My Client Groups > New Person → Add a Nonworker
 *
 * The Add Non-Worker wizard is a 5-step wizard (same structure as Hire Employee):
 *   Step 1: Identification — When/Why (date, action, legal employer, nonworker type)
 *           + Personal Details (name, gender, DOB)
 *   Step 2: Person Information — Address + Legislative (usually skipped for non-workers)
 *   Step 3: Employment Information — Simpler than Hire (fewer fields)
 *   Step 4: Compensation and Other Information — usually skipped
 *   Step 5: Review → Submit
 *
 * The When/Why section uses `NonWo1:0:AP1:` prefix — this does NOT match
 * WhenAndWhyPage's `[id$="SP1:..."]` selectors. This flow fills When/Why
 * fields directly using `AP1:` suffix selectors.
 */
export class AddNonWorkerFlow extends BaseCoreHRFlow {
  // Non-Worker When/Why fields use AP1: prefix (not SP1: like Hire/Add Pending Worker)
  private readonly nwDate = this.page.locator('[id$="AP1:inputDate1::content"]');
  private readonly nwAction = this.page.locator('[id$="AP1:selectOneChoice1::content"]');
  private readonly nwReason = this.page.locator('[id$="AP1:selectOneChoice2::content"]');
  private readonly nwLegalEmployer = this.page.locator('[id$="AP1:selectOneChoice3::content"]');
  private readonly nwWorkerType = this.page.locator('[id$="AP1:selectOneChoice4::content"]');

  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToAddNonworker();

    // Step 1: Identification — fill When/Why + Personal Details
    await this.fillWhenAndWhy(tc);
    await this.person.fillIdentificationFromTestCase(tc);
    await this.dismissMatchingPersonDialog();

    // Navigate through remaining wizard steps to reach Review
    console.log('[AddNonWorker] Navigating Step 1 → Step 2 (Person Information)');
    await this.clickNext();

    console.log('[AddNonWorker] Navigating Step 2 → Step 3 (Employment Information)');
    await this.clickNext();

    // Step 3: Employment Information — fill Business Unit if required
    await this.fillNonWorkerAssignment(tc);

    console.log('[AddNonWorker] Navigating Step 3 → Step 4 (Compensation)');
    await this.clickNext();

    console.log('[AddNonWorker] Navigating Step 4 → Step 5 (Review)');
    await this.clickNext();

    // Step 5: Review — Submit
    const personNumber = await this.submitAndVerify();

    // Post-submission: Create Staff Designation EIT via Person Management
    const hasStaffDesignation = getField(tc, 'Staff Account Number') || getField(tc, 'Designation');
    if (hasStaffDesignation && personNumber) {
      console.log(`[AddNonWorker] Creating post-submission Staff Designation EIT for person ${personNumber}`);
      await this.staffDesignation.createPostSubmissionEIT(personNumber, tc);
    }
  }

  /**
   * Fill the When/Why section using AP1: selectors.
   * WhenAndWhyPage can't be used because it targets SP1: prefix.
   */
  /**
   * Fill Business Unit on Step 3 (Employment Information) if the field is empty and required.
   * Non-workers need at least a Business Unit to pass validation.
   */
  private async fillNonWorkerAssignment(tc: TestCase): Promise<void> {
    // Try role-based locator first (works regardless of ADF ID patterns)
    const buField = this.page.getByRole('combobox', { name: 'Business Unit' });
    const buVisible = await buField.isVisible({ timeout: 8000 }).catch(() => false);
    if (buVisible) {
      const currentValue = await buField.inputValue().catch(() => '');
      if (!currentValue) {
        const bu = getField(tc, 'Business Unit') || 'Campus Crusade for Christ';
        console.log(`[AddNonWorker] Filling Business Unit: ${bu}`);
        await this.person.fillCombobox(buField, bu, 5000);
      }
    }
  }

  private async fillWhenAndWhy(tc: TestCase): Promise<void> {
    const when = getField(tc, 'When') || getField(tc, 'Proposed Start Date') || getField(tc, 'Effective date');
    const legalEmployer = getField(tc, 'Legal Employer');
    const action = getField(tc, "What's the way") || getField(tc, 'What') || getField(tc, 'Action');
    const reason = getField(tc, 'Why') || getField(tc, 'Reason');
    const workerType = getField(tc, 'Non Worker Type') || getField(tc, 'Worker Type') || getField(tc, 'Proposed Worker type');
    const businessUnit = getField(tc, 'Business Unit');

    if (when) {
      const dateStr = excelSerialToDate(when);
      await this.person.fillField(this.nwDate, dateStr);
    }
    // Legal Employer must be filled before other fields (triggers partial refresh)
    if (legalEmployer) {
      await this.person.fillCombobox(this.nwLegalEmployer, legalEmployer, 5000);
    }
    if (action) await this.person.fillCombobox(this.nwAction, action);
    if (reason) await this.person.fillCombobox(this.nwReason, reason);
    if (workerType) await this.person.fillCombobox(this.nwWorkerType, workerType);

    // Business Unit may appear on When/Why for non-workers
    if (businessUnit) {
      const buField = this.page.getByRole('combobox', { name: 'Business Unit' });
      const buVisible = await buField.isVisible({ timeout: 3000 }).catch(() => false);
      if (buVisible) {
        console.log(`[AddNonWorker] Filling Business Unit on Step 1: ${businessUnit}`);
        await this.person.fillCombobox(buField, businessUnit, 5000);
      }
    }
  }
}
