import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Payroll Details section — payroll frequency, tax unit, time card, overtime.
 */
export class PayrollDetailsPage extends BasePage {
  private readonly payrollFrequency = this.page.locator('select[aria-label*="Payroll"], input[aria-label*="Payroll"], [id*="PayrollName"]').first();
  private readonly taxReportingUnit = this.page.locator('select[aria-label*="Tax"], input[aria-label*="Tax reporting"], [id*="TaxReportingUnit"]').first();
  private readonly timeCardPayroll = this.page.locator('select[aria-label*="Time Card required for pay"], [id*="TimeCardRequired"]').first();
  private readonly timeCardAssignment = this.page.locator('select[aria-label*="Time Card required for Assignment"], [id*="TimeCardAssignment"]').first();
  private readonly overtimePeriodPayroll = this.page.locator('[aria-label*="Overtime Period for Payroll"], [id*="OvertimePeriodPayroll"]').first();
  private readonly overtimePeriodAssignment = this.page.locator('[aria-label*="Overtime Period for Assginment"], [id*="OvertimePeriodAssignment"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const payrollFreq = getField(tc, 'Payroll Frequency');
    const taxUnit = getField(tc, 'Tax reporting Unit');
    const timeCardPay = getField(tc, 'Time Card required for pay');
    const timeCardAssign = getField(tc, 'Time Card required for Assignment');

    if (payrollFreq) await this.fillInput(this.payrollFrequency, payrollFreq);
    if (taxUnit) await this.fillInput(this.taxReportingUnit, taxUnit);
    if (timeCardPay) await this.selectValue(this.timeCardPayroll, timeCardPay);
    if (timeCardAssign) await this.selectValue(this.timeCardAssignment, timeCardAssign);
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
