import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { MPDXPage } from '../../pages/mpdx/mpdx.page';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow for MPDX (Ministry Partner Development) operations.
 * Module: MPDX (24 tests, all with field data)
 *
 * Field data structure (from migration DB):
 *   Person Name:       "Porter, Michael" (Last, First format)
 *   Person Number:     "10000007"
 *   MHA Amount:        "37200" (dollar amount)
 *   Board Approved:    "2009-01-01T05:00:00.000Z" (ISO date)
 *   Salary Amount:     "24889" (dollar amount)
 *   Salary Basis:      "Supported Staff RMO"
 *   Person Type:       "Employee - Staff"
 *   Legal Employer:    "Campus Crusade for Christ, Inc."
 *   Certification Type: (may be present for some tests)
 *   Certification Date: (may be present for some tests)
 *
 * Routes based on test script name (primary) and business process (fallback):
 *   "Salary Calc"                -> Salary calculation (12 tests)
 *   "MHA Calc"                   -> MHA calculation (3 tests)
 *   "Additional Salary Request"  -> Salary request submission (3 tests)
 *   "Senior Staff MPD Goal Calc" -> MPD goal calculation (3 tests)
 *   "Savings Funds Transfer"     -> Funds transfer (1 test)
 *   "Staff Expense Report"       -> Expense report (1 test)
 *   "MPGA Income Expense"        -> MPGA report (1 test)
 *
 * Self-service operations (from pay-ess-deep.json card tiles):
 *   My Payslips, Payment Methods, Tax Withholding
 */
export class MPDXFlow extends BaseFlow {
  private mpdx: MPDXPage;

  constructor(page: Page) {
    super(page);
    this.mpdx = new MPDXPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const fieldData = getFieldData(tc.testId);
    const script = tc.testScript.toLowerCase();
    const process = tc.businessProcess.toLowerCase();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      const salaryAmount = getField(fieldData, 'Salary Amount');
      const mhaAmount = getField(fieldData, 'MHA Amount');
      console.log(`[MPDX] ${tc.testId}: person="${personName}", salary=${salaryAmount}, mha=${mhaAmount}`);
    }

    if (script.includes('salary calc') || process.includes('salary calc')) {
      await this.executeSalaryCalculation(tc, fieldData);
    } else if (script.includes('mpd goal') || process.includes('mpd goal')) {
      await this.executeMPDGoalCalculation(tc, fieldData);
    } else if (script.includes('mha calc') || process.includes('mha calc')) {
      await this.executeMHACalculation(tc, fieldData);
    } else if (script.includes('additional salary') || process.includes('additional salary') || process.includes('asr')) {
      await this.executeAdditionalSalaryRequest(tc, fieldData);
    } else if (script.includes('savings') || process.includes('saving')) {
      await this.executeSavingsFundsTransfer(tc, fieldData);
    } else if (script.includes('expense report') || process.includes('expense report')) {
      await this.executeStaffExpenseReport(tc, fieldData);
    } else if (script.includes('mpga') || process.includes('mpga')) {
      await this.executeMPGAReport(tc, fieldData);
    } else if (script.includes('payslip') || process.includes('payslip')) {
      await this.executeViewPayslips(tc, fieldData);
    } else if (script.includes('payment method') || process.includes('payment method')) {
      await this.executeManagePaymentMethods(tc, fieldData);
    } else if (script.includes('tax withholding') || process.includes('tax withholding')) {
      await this.executeViewTaxWithholding(tc, fieldData);
    } else {
      // Default: try salary calculation (most common MPDX operation)
      await this.executeSalaryCalculation(tc, fieldData);
    }
  }

  /** Run salary calculation via Scheduled Processes with field data. */
  private async executeSalaryCalculation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : undefined;
    const salaryAmount = fieldData ? getField(fieldData, 'Salary Amount') : undefined;
    const salaryBasis = fieldData ? getField(fieldData, 'Salary Basis') : undefined;

    if (!await this.mpdx.goToSalaryCalculation()) {
      console.log(`[MPDX] ${tc.testId}: Skipping — bot lacks Scheduled Processes access`);
      return;
    }
    await this.mpdx.fillSalaryCalculation({
      employeeName: personName || tc.testData || undefined,
    });

    if (salaryAmount) {
      console.log(`[MPDX] Expected salary: ${salaryAmount} (${salaryBasis})`);
    }

    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MPD goal calculation via Scheduled Processes. */
  private async executeMPDGoalCalculation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : undefined;

    if (!await this.mpdx.goToMPDGoalCalculation()) {
      console.log(`[MPDX] ${tc.testId}: Skipping — bot lacks Scheduled Processes access`);
      return;
    }
    await this.mpdx.fillMPDGoalCalculation({
      employeeName: personName || tc.testData || undefined,
    });
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MHA calculation via Scheduled Processes. */
  private async executeMHACalculation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : undefined;
    const mhaAmount = fieldData ? getField(fieldData, 'MHA Amount') : undefined;

    if (!await this.mpdx.goToMHACalculation()) {
      console.log(`[MPDX] ${tc.testId}: Skipping — bot lacks Scheduled Processes access`);
      return;
    }
    await this.mpdx.fillMHACalculation({
      employeeName: personName || tc.testData || undefined,
    });

    if (mhaAmount) {
      console.log(`[MPDX] Expected MHA amount: ${mhaAmount}`);
    }

    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Submit additional salary request via Person Management. */
  private async executeAdditionalSalaryRequest(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : undefined;

    await this.mpdx.goToAdditionalSalaryRequest();

    // Search for person if name available
    if (personName) {
      const searchInput = this.page.locator(
        '[id$="q1:value00::content"], input[aria-label*="Search"], input[placeholder*="Search"]'
      ).first();
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill(personName);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(5000);
        await this.mpdx.waitForJET();
      }
    }

    await this.mpdx.submitRequest();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run savings funds transfer via Scheduled Processes. */
  private async executeSavingsFundsTransfer(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    if (!await this.mpdx.goToSavingsFundsTransfer()) {
      console.log(`[MPDX] ${tc.testId}: Skipping — bot lacks Scheduled Processes access`);
      return;
    }
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Navigate to and create a staff expense report. */
  private async executeStaffExpenseReport(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.mpdx.goToStaffExpenseReport();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MPGA income/expense report via Scheduled Processes. */
  private async executeMPGAReport(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    if (!await this.mpdx.goToMPGAReport()) {
      console.log(`[MPDX] ${tc.testId}: Skipping — bot lacks Scheduled Processes access`);
      return;
    }
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** View payslips via self-service card tile. */
  private async executeViewPayslips(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.mpdx.viewPayslips();
  }

  /** Manage payment methods via self-service card tile. */
  private async executeManagePaymentMethods(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.mpdx.managePaymentMethods();
  }

  /** View tax withholding via self-service card tile. */
  private async executeViewTaxWithholding(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.mpdx.viewTaxWithholding();
  }
}
