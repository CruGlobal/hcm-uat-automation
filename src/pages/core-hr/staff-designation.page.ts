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
      // TODO: Update with actual Oracle HCM training row selectors
      // Each training row needs Type, Course, and Status filled
      const rowSelector = `[data-row-index="${i}"]`;
      const typeInput = this.page.locator(`${rowSelector} [aria-label*="Type"]`).first();
      const courseInput = this.page.locator(`${rowSelector} [aria-label*="Course"]`).first();
      const statusInput = this.page.locator(`${rowSelector} [aria-label*="Status"]`).first();

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
