import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Assignment section — status, person type, job, department, location, schedule, etc.
 * Covers ~18 assignment-related fields from the "Assignment >" section of the sheet.
 */
export class AssignmentPage extends BasePage {
  private readonly assignmentStatus = this.page.locator('select[aria-label*="Assignment Status"], [id*="AssignmentStatus"]').first();
  private readonly personType = this.page.locator('select[aria-label*="Person Type"], [id*="PersonType"]').first();
  private readonly proposedPersonType = this.page.locator('select[aria-label*="Proposed Person"], [id*="ProposedPersonType"]').first();
  private readonly job = this.page.locator('input[aria-label*="Job"], [id*="JobName"]').first();
  private readonly grade = this.page.locator('input[aria-label*="Grade"], [id*="GradeName"]').first();
  private readonly department = this.page.locator('input[aria-label*="Department"], [id*="DepartmentName"]').first();
  private readonly location = this.page.locator('input[aria-label*="Location"], [id*="LocationName"]').first();
  private readonly workFromHome = this.page.locator('select[aria-label*="Working at Home"], [id*="WorkAtHome"], select[aria-label*="Work from Home"]').first();
  private readonly assignmentCategory = this.page.locator('select[aria-label*="Assignment Category"], [id*="AssignmentCategory"]').first();
  private readonly regTemp = this.page.locator('select[aria-label*="Reg"], [id*="RegularTemporary"]').first();
  private readonly fullPartTime = this.page.locator('select[aria-label*="Full time"], [id*="FullPartTime"]').first();
  private readonly hourlySalaried = this.page.locator('select[aria-label*="Hourly"], [id*="HourlySalaried"]').first();
  private readonly workingHours = this.page.locator('input[aria-label*="Working hours"], input[aria-label*="Working Hours"], [id*="NormalHours"]').first();
  private readonly frequency = this.page.locator('select[aria-label*="Frequency"], [id*="Frequency"]').first();
  private readonly supportType = this.page.locator('select[aria-label*="Support Type"], [id*="SupportType"]').first();
  private readonly secaStatus = this.page.locator('select[aria-label*="Seca"], [id*="SecaStatus"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const fields: [ReturnType<Page['locator']>, string, 'select' | 'input'][] = [
      [this.assignmentStatus, 'Assignment Status', 'select'],
      [this.personType, 'Person Type', 'select'],
      [this.job, 'Job', 'input'],
      [this.grade, 'Grade', 'input'],
      [this.department, 'Department', 'input'],
      [this.location, 'Location', 'input'],
      [this.assignmentCategory, 'Assignment Category', 'select'],
      [this.regTemp, 'Reg/Temp', 'select'],
      [this.fullPartTime, 'Full time or Part Time', 'select'],
      [this.hourlySalaried, 'Hourly Salary', 'select'],
      [this.workingHours, 'Working hours', 'input'],
      [this.frequency, 'Frequency', 'select'],
      [this.supportType, 'Support Type', 'select'],
      [this.secaStatus, 'Seca Status', 'select'],
    ];

    // Proposed Person Type is only on some tabs
    const proposed = getField(tc, 'Proposed Person type');
    if (proposed) await this.selectValue(this.proposedPersonType, proposed);

    const workHome = getField(tc, 'Working at Home') || getField(tc, 'Work from Home');
    if (workHome) await this.selectValue(this.workFromHome, workHome);

    for (const [locator, key, type] of fields) {
      const value = getField(tc, key);
      if (!value) continue;
      if (type === 'select') {
        await this.selectValue(locator, value);
      } else {
        await this.fillInput(locator, value);
      }
    }
  }

  private async selectValue(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.click();
    await this.page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
    await this.waitForJET();
  }

  private async fillInput(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
    await locator.press('Tab');
    await this.waitForJET();
  }
}
