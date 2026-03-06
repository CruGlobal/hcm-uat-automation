import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * "Basic Details" / "When and Why" section — step 1 of hire/add worker wizards.
 * Covers: date, action, reason, legal employer, worker type.
 *
 * Field IDs use `[id$="suffix"]` patterns since the full prefix varies per form
 * (Hire uses `pt_r1:0:SP1:`, Add Pending Worker uses `AddPw1:0:SP1:`).
 * The suffixes (inputDate1, selectOneChoice1..4) are stable across forms.
 */
export class WhenAndWhyPage extends BasePage {
  // Date field — "Hire Date" or "Proposed Start Date"
  private readonly dateInput = this.page.locator('[id$="SP1:inputDate1::content"]');
  // Action — "Hire Action" or "Action"
  private readonly action = this.page.locator('[id$="SP1:selectOneChoice1::content"]');
  // Reason — "Hire Reason" or "Action Reason"
  private readonly reason = this.page.locator('[id$="SP1:selectOneChoice2::content"]');
  // Legal Employer (LOV combobox with autocomplete)
  private readonly legalEmployer = this.page.locator('[id$="SP1:selectOneChoice3::content"]');
  // Worker Type / Proposed Worker Type
  // CWR form uses "soc2" suffix; Hire/Add Pending Worker use "selectOneChoice4"
  private readonly workerType = this.page.locator('[id$="SP1:selectOneChoice4::content"], [id$="SP1:soc2::content"]').first();
  // Worker Number (appears after Legal Employer selection on Hire form)
  private readonly workerNumber = this.page.locator('[id$="SP1:it1::content"]');

  async fillFromTestCase(tc: TestCase): Promise<void> {
    // Date — various field names across tabs
    const when = getField(tc, 'When') || getField(tc, 'Proposed Start Date') || getField(tc, 'Effective date');
    const legalEmployer = getField(tc, 'Legal Employer');
    const action = getField(tc, "What's the way") || getField(tc, 'What') || getField(tc, 'Action');
    const reason = getField(tc, 'Why') || getField(tc, 'Reason');
    const workerType = getField(tc, 'Worker Type') || getField(tc, 'Proposed Worker type');

    if (when) await this.fillDate(when);
    // Legal Employer must be filled before other fields (triggers partial refresh)
    if (legalEmployer) await this.selectLegalEmployer(legalEmployer);
    if (action) await this.fillCombobox(this.action, action);
    if (reason) await this.fillCombobox(this.reason, reason);
    if (workerType) {
      // Oracle HCM "Proposed Worker Type" dropdown only has "Employee" and "Contingent worker".
      // Field data may have "Pending Worker" which isn't a valid option — map it.
      const mapped = workerType.toLowerCase().includes('pending') ? 'Employee'
        : workerType.toLowerCase().includes('contingent') ? 'Contingent worker'
        : workerType;
      await this.fillCombobox(this.workerType, mapped);
    }
  }

  /** Convert a date value (Excel serial or date string) to MM/DD/YYYY. */
  convertDate(serial: string): string {
    return excelSerialToDate(serial);
  }

  async fillDate(serial: string): Promise<void> {
    const dateStr = excelSerialToDate(serial);
    // Wait for wizard form to finish loading before trying to fill
    await this.dateInput.waitFor({ state: 'visible', timeout: 60_000 });
    // ADF may have a brief initialization overlay even after the field is visible —
    // wait for JET to settle so the field becomes actionable.
    await this.waitForJET();
    await this.fillField(this.dateInput, dateStr);
  }

  /** Fill effective date directly (already converted to MM/DD/YYYY). */
  async fillEffectiveDate(dateStr: string): Promise<void> {
    await this.fillField(this.dateInput, dateStr);
  }

  async selectLegalEmployer(value: string): Promise<void> {
    // Legal Employer is a LOV combobox — type + Tab to autocomplete.
    // After selection, the form partially refreshes (field indices change).
    await this.fillCombobox(this.legalEmployer, value, 5000);
  }
}
