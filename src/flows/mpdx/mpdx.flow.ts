import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { MPDXPage } from '../../pages/mpdx/mpdx.page';
import type { UATTestCase } from '../../data/types';

/**
 * Flow for MPDX (Ministry Partner Development) operations.
 *
 * MPDX operations are executed via Oracle HCM Scheduled Processes for batch
 * calculations, and via self-service pages for employee-facing operations.
 *
 * Routes to the appropriate MPDX function based on the test script name:
 * - Salary Calc → Salary calculation (via Scheduled Processes)
 * - Senior Staff MPD Goal Calc → MPD goal calculation (via Scheduled Processes)
 * - MHA Calc → MHA calculation (via Scheduled Processes)
 * - Additional Salary Request → Salary request submission (via Person Management)
 * - Savings Funds Transfer → Funds transfer (via Scheduled Processes)
 * - Staff Expense Report → Expense report (via Expenses module)
 * - MPGA Income Expense → MPGA report (via Scheduled Processes)
 *
 * Self-service operations (from pay-ess-deep.json card tiles):
 * - My Payslips, Payment Methods, Tax Withholding
 */
export class MPDXFlow extends BaseFlow {
  private mpdx: MPDXPage;

  constructor(page: Page) {
    super(page);
    this.mpdx = new MPDXPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const script = tc.testScript.toLowerCase();
    const process = tc.businessProcess.toLowerCase();

    if (script.includes('salary calc') || process.includes('salary calc')) {
      await this.executeSalaryCalculation(tc);
    } else if (script.includes('mpd goal') || process.includes('mpd goal')) {
      await this.executeMPDGoalCalculation(tc);
    } else if (script.includes('mha calc') || process.includes('mha calc')) {
      await this.executeMHACalculation(tc);
    } else if (script.includes('additional salary') || process.includes('additional salary')) {
      await this.executeAdditionalSalaryRequest(tc);
    } else if (script.includes('savings') || process.includes('saving')) {
      await this.executeSavingsFundsTransfer(tc);
    } else if (script.includes('expense report') || process.includes('expense report')) {
      await this.executeStaffExpenseReport(tc);
    } else if (script.includes('mpga') || process.includes('mpga')) {
      await this.executeMPGAReport(tc);
    } else if (script.includes('payslip') || process.includes('payslip')) {
      await this.executeViewPayslips(tc);
    } else if (script.includes('payment method') || process.includes('payment method')) {
      await this.executeManagePaymentMethods(tc);
    } else if (script.includes('tax withholding') || process.includes('tax withholding')) {
      await this.executeViewTaxWithholding(tc);
    } else {
      // Default: try salary calculation
      await this.executeSalaryCalculation(tc);
    }
  }

  /** Run salary calculation via Scheduled Processes. */
  private async executeSalaryCalculation(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToSalaryCalculation();
    await this.mpdx.fillSalaryCalculation({
      employeeName: tc.testData || undefined,
    });
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MPD goal calculation via Scheduled Processes. */
  private async executeMPDGoalCalculation(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToMPDGoalCalculation();
    await this.mpdx.fillMPDGoalCalculation({
      employeeName: tc.testData || undefined,
    });
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MHA calculation via Scheduled Processes. */
  private async executeMHACalculation(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToMHACalculation();
    await this.mpdx.fillMHACalculation({
      employeeName: tc.testData || undefined,
    });
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Submit additional salary request via Person Management. */
  private async executeAdditionalSalaryRequest(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToAdditionalSalaryRequest();
    await this.mpdx.submitRequest();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run savings funds transfer via Scheduled Processes. */
  private async executeSavingsFundsTransfer(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToSavingsFundsTransfer();
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** Navigate to and create a staff expense report. */
  private async executeStaffExpenseReport(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToStaffExpenseReport();
    await this.mpdx.verifyCalculationResult();
  }

  /** Run MPGA income/expense report via Scheduled Processes. */
  private async executeMPGAReport(tc: UATTestCase): Promise<void> {
    await this.mpdx.goToMPGAReport();
    await this.mpdx.runCalculation();
    await this.mpdx.verifyCalculationResult();
  }

  /** View payslips via self-service card tile. */
  private async executeViewPayslips(tc: UATTestCase): Promise<void> {
    await this.mpdx.viewPayslips();
  }

  /** Manage payment methods via self-service card tile. */
  private async executeManagePaymentMethods(tc: UATTestCase): Promise<void> {
    await this.mpdx.managePaymentMethods();
  }

  /** View tax withholding via self-service card tile. */
  private async executeViewTaxWithholding(tc: UATTestCase): Promise<void> {
    await this.mpdx.viewTaxWithholding();
  }
}
