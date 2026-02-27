import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Staff & Designation section — Cru-specific fields for staff account, designation, training.
 * Only present in certain tabs (e.g., "Core - One app Pending to Hire").
 */
export class StaffDesignationPage extends BasePage {
  private readonly effectiveDate = this.page.locator('input[aria-label*="Effective Date"], [id*="StaffEffectiveDate"]').first();
  private readonly staffAccountNumber = this.page.locator('input[aria-label*="Staff Account"], [id*="StaffAccount"]').first();
  private readonly designation = this.page.locator('input[aria-label*="Designation"], [id*="Designation"]').first();
  private readonly primary = this.page.locator('select[aria-label*="Primary"], [id*="PrimaryDesignation"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const effDate = getField(tc, 'Staff and Designation > Effective Date');
    const staffAcct = getField(tc, 'Staff Account Number');
    const designation = getField(tc, 'Designation');
    const primary = getField(tc, 'Primary');

    if (effDate) {
      const dateStr = excelSerialToDate(effDate);
      await this.fillInput(this.effectiveDate, dateStr);
    }
    if (staffAcct) await this.fillInput(this.staffAccountNumber, staffAcct);
    if (designation) await this.fillInput(this.designation, designation);
    if (primary) await this.selectValue(this.primary, primary);
  }

  /** Fill training status rows if present. */
  async fillTraining(tc: TestCase): Promise<void> {
    const type = getField(tc, 'Training Status > Type');
    const course = getField(tc, 'Training Status > Course');
    const status = getField(tc, 'Training Status > Status');

    if (!type) return;

    // Training types/courses/statuses are comma-separated for multiple rows
    const types = type.split(',').map((s) => s.trim());
    const courses = course.split(',').map((s) => s.trim());
    const statuses = status.split(',').map((s) => s.trim());

    for (let i = 0; i < types.length; i++) {
      // ADF table rows use _afrrk attribute for row keys; training rows are in a table with id containing "TrainingStatus"
      const rowLocator = this.page.locator(`table[id*="TrainingStatus"] tbody tr:nth-child(${i + 1}), [id*="training"] tr[_afrrk="${i}"]`).first();
      const typeInput = rowLocator.locator('select, [id*="Type"]').first();
      const courseInput = rowLocator.locator('input[id*="Course"], [id*="course"]').first();
      const statusInput = rowLocator.locator('select[id*="Status"], [id*="status"]').first();

      if (types[i]) await this.selectValue(typeInput, types[i]);
      if (courses[i]) await this.selectValue(courseInput, courses[i]);
      if (statuses[i]) await this.selectValue(statusInput, statuses[i]);
    }
  }

  private async fillInput(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
    await locator.press('Tab');
    await this.waitForJET();
  }

  private async selectValue(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.click();
    await this.page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
    await this.waitForJET();
  }
}
