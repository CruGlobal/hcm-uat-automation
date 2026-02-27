import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PayrollProcessingPage } from '../../pages/payroll/payroll-processing.page';
import { ElementEntryFlow } from './element-entry.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import type { UATTestCase } from '../../data/types';

/**
 * Flow for Payroll Processing operations from the UAT Plan.
 *
 * All payroll batch processes are executed via the Scheduled Processes page
 * (Navigator > Tools > Scheduled Processes) using real ADF selectors from
 * scheduled-processes-deep.json:
 * - "Schedule New Process" link (role="button")
 * - Saved Search dropdown (label "Saved Search", default "Last hour")
 * - Action buttons: Put On Hold, Cancel Process, Release Process, View Log, Resubmit
 * - View radio: Flat List / Hierarchy
 *
 * Routes based on test script and business process:
 * - HCM.PAY.510.00 → Semi-monthly payroll run (31 tests)
 * - HCM.PAY.106.00 → Off-cycle payroll bonus (13 tests)
 * - HCM.PAY.520.00 → Off-cycle additional salary (9 tests)
 * - HCM.PAY.113.00 → MSS W-4 (7 tests)
 * - HCM.PAY.301.00 → Costing/designation (6 tests)
 * - HCM.PAY.404.00 → CA Meal Penalty (4 tests)
 * - Year End → W-2 processing (3 tests)
 * - HCM.PAY.114.00 → Calculation card (2 tests)
 * - HCM.PAY.324.00 → Reverse/reissue checks (2 tests)
 * - HCM.PAY.307.00 → Tax adjustments (2 tests)
 * - HCM.PAY.111.00 → Direct deposit (2 tests)
 * - Various single-test scripts
 */
export class PayrollProcessingFlow extends BaseFlow {
  private payroll: PayrollProcessingPage;

  constructor(page: Page) {
    super(page);
    this.payroll = new PayrollProcessingPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    // If field data exists, delegate to ElementEntryFlow for form filling
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const flow = new ElementEntryFlow(this.page);
      await flow.execute(fieldData);
      return;
    }

    await this.loginToHCM();

    const script = tc.testScript;
    const process = tc.businessProcess.toLowerCase();

    // Route to appropriate payroll operation
    if (script.includes('PAY.510') || process.includes('semi-monthly')) {
      await this.executePayrollRun(tc);
    } else if (script.includes('PAY.106') || script.includes('PAY.103') || process.includes('off cycle') || process.includes('bonus')) {
      await this.executeOffCyclePayroll(tc);
    } else if (script.includes('PAY.520') || process.includes('off-cycle') || process.includes('additional salary')) {
      await this.executeOffCyclePayroll(tc);
    } else if (script.includes('PAY.113') || script.includes('PAY.602') || process.includes('w-4')) {
      await this.executeW4(tc);
    } else if (script.includes('PAY.114') || process.includes('calculation card')) {
      await this.executeCalculationCard(tc);
    } else if (script.includes('PAY.301') || process.includes('costing') || process.includes('designation')) {
      await this.executeCosting(tc);
    } else if (script.includes('PAY.111') || process.includes('direct deposit')) {
      await this.executeDirectDeposit(tc);
    } else if (script.includes('PAY.324') || process.includes('reverse') || process.includes('reissue')) {
      await this.executeCheckProcessing(tc);
    } else if (script.includes('PAY.307') || process.includes('tax adjust')) {
      await this.executeTaxAdjustment(tc);
    } else if (script.includes('PAY.404') || process.includes('meal penalty')) {
      await this.executeMealPenalty(tc);
    } else if (script.includes('PAY.418') || process.includes('print check')) {
      await this.executeCheckGeneration(tc);
    } else if (script.includes('PAY.419') || process.includes('advice')) {
      await this.executePayAdvice(tc);
    } else if (script.includes('PAY.417') || process.includes('direct deposit file')) {
      await this.executeDirectDepositFile(tc);
    } else if (script.includes('PAY.422') || process.includes('tax payment')) {
      await this.executeTaxPaymentFile(tc);
    } else if (script.includes('Year End') || process.includes('w-2')) {
      await this.executeYearEnd(tc);
    } else if (script.includes('PAY.309') || process.includes('403b') || process.includes('loan')) {
      await this.execute403bLoan(tc);
    } else if (script.includes('PAY.316') || process.includes('multi-state') || process.includes('reciprocity')) {
      await this.executeMultiStateTax(tc);
    } else if (script.includes('PAY.325') || process.includes('ach return')) {
      await this.executeACHReturns(tc);
    } else {
      // Default: schedule the payroll run via Scheduled Processes
      await this.executePayrollRun(tc);
    }
  }

  /** Semi-monthly payroll run via Scheduled Processes. */
  private async executePayrollRun(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Calculate Payroll');
    await this.payroll.fillPayrollRunParams({
      effectiveDate: tc.testDate || undefined,
    });
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** Off-cycle payroll (bonus, additional salary) via Scheduled Processes. */
  private async executeOffCyclePayroll(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Off-Cycle Payroll');
    await this.payroll.fillOffCycleParams({
      employeeName: tc.testData || undefined,
    });
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** MSS W-4 / tax withholding setup. */
  private async executeW4(tc: UATTestCase): Promise<void> {
    await this.payroll.goToCalculationCard();
    await this.payroll.fillW4Info({
      employeeName: tc.testData || undefined,
    });
    await this.payroll.save();
    await this.payroll.verifyResult();
  }

  /** Calculation card setup. */
  private async executeCalculationCard(tc: UATTestCase): Promise<void> {
    await this.payroll.goToCalculationCard();
    await this.payroll.fillW4Info({
      employeeName: tc.testData || undefined,
    });
    await this.payroll.save();
    await this.payroll.verifyResult();
  }

  /** Costing / designation setup. */
  private async executeCosting(tc: UATTestCase): Promise<void> {
    await this.payroll.goToCosting();
    await this.payroll.fillCostingParams({
      employeeName: tc.testData || undefined,
    });
    await this.payroll.save();
    await this.payroll.verifyResult();
  }

  /** Direct deposit / payment methods setup. */
  private async executeDirectDeposit(tc: UATTestCase): Promise<void> {
    await this.payroll.goToDirectDeposit();
    await this.payroll.fillDirectDeposit({});
    await this.payroll.save();
    await this.payroll.verifyResult();
  }

  /** Reverse and reissue checks. */
  private async executeCheckProcessing(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.reverseAndReissue({});
    await this.payroll.verifyResult();
  }

  /** Tax adjustments. */
  private async executeTaxAdjustment(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Tax Adjustment');
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** CA Meal Penalty - element entry based via Scheduled Processes. */
  private async executeMealPenalty(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Calculate Payroll');
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** Generate check payments via Scheduled Processes. */
  private async executeCheckGeneration(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.generateChecks();
    await this.payroll.verifyResult();
  }

  /** Generate pay advice via Scheduled Processes. */
  private async executePayAdvice(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.generatePayAdvice();
    await this.payroll.verifyResult();
  }

  /** Run direct deposit file generation via Scheduled Processes. */
  private async executeDirectDepositFile(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.runDirectDepositFile();
    await this.payroll.verifyResult();
  }

  /** Generate tax payment file via Scheduled Processes. */
  private async executeTaxPaymentFile(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.generateTaxPaymentFile();
    await this.payroll.verifyResult();
  }

  /** Year end processing (W-2) via Scheduled Processes. */
  private async executeYearEnd(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Year End Process');
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** 403b loan payback via Scheduled Processes. */
  private async execute403bLoan(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('403b Loan');
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** Multi-state tax / reciprocity via calculation card. */
  private async executeMultiStateTax(tc: UATTestCase): Promise<void> {
    await this.payroll.goToCalculationCard();
    await this.payroll.save();
    await this.payroll.verifyResult();
  }

  /** ACH returns processing via Scheduled Processes. */
  private async executeACHReturns(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('ACH Returns');
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }
}
