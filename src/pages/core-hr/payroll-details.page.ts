import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Payroll Details section — part of Employment Information step (Step 3).
 *
 * Contains: Tax Reporting Unit, Payroll, Time Card, Overtime Period.
 * Tax Reporting Unit is under `r1:0:soc1` (readonly).
 * Payroll details are within the "Payroll Relationship Details" header area.
 *
 * Note: The Payroll section on the Hire wizard is embedded in the Employment
 * Information step, not on a separate wizard page.
 */
export class PayrollDetailsPage extends BasePage {
  // Tax Reporting Unit — readonly combobox
  private readonly taxReportingUnit = this.page.locator('[id$="r1:0:soc1::content"]');

  // Payroll-related fields within the embedded payroll section
  // These are typically under "Payroll Relationship Details" heading
  private readonly payrollName = this.page.locator('[id*="PayrollName"], [id*="payrollId"]').first();
  private readonly timeCardRequired = this.page.locator('[id*="TimeCard"], [id*="timeCard"]').first();
  private readonly overtimePeriod = this.page.locator('[id*="OvertimePeriod"], [id*="overtimePeriod"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    // Tax Reporting Unit (readonly)
    const taxUnit = getField(tc, 'Tax reporting Unit');
    if (taxUnit) {
      await this.setReadonlyCombobox(this.taxReportingUnit, taxUnit);
    }

    // Payroll Frequency
    const payrollFreq = getField(tc, 'Payroll Frequency') || getField(tc, 'Frequency');
    if (payrollFreq && payrollFreq !== getField(tc, 'Working hours Frequency')) {
      const payrollField = this.payrollName;
      const isVisible = await payrollField.isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) {
        const isReadonly = await payrollField.getAttribute('readonly');
        if (isReadonly !== null) {
          await this.setReadonlyCombobox(payrollField, payrollFreq);
        } else {
          await this.fillCombobox(payrollField, payrollFreq);
        }
      }
    }

    // Time Card Required
    const timeCard = getField(tc, 'Time Card required');
    if (timeCard) {
      const tcField = this.timeCardRequired;
      const isVisible = await tcField.isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) {
        await this.setReadonlyCombobox(tcField, timeCard === 'Y' ? 'Yes' : timeCard === 'N' ? 'No' : timeCard);
      }
    }
  }

  /** Set value on a readonly ADF combobox via ADF API */
  private async setReadonlyCombobox(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    const fieldId = await locator.getAttribute('id');
    if (!fieldId) return;
    const isReadonly = await locator.getAttribute('readonly');
    if (isReadonly !== null) {
      const parentId = fieldId.replace('::content', '');
      await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        if (!adfPage) return;
        const comp = adfPage.findComponentByAbsoluteId(pid);
        if (comp && comp.setValue) comp.setValue(val);
      }, { pid: parentId, val: value });
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      await this.fillCombobox(locator, value);
    }
  }
}
