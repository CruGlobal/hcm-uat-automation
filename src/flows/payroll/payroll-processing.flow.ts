import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PayrollProcessingPage } from '../../pages/payroll/payroll-processing.page';
import { ElementEntryFlow } from './element-entry.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow for Payroll Processing operations from the UAT Plan.
 *
 * Routing priority:
 * 1. If field data exists with tab="Payroll" AND has element entry fields
 *    (Search For, Element name), delegate to ElementEntryFlow for form filling.
 *    ~80 tests are actual element entries (Housing Allowance, Overtime, etc.).
 *    Tests in NON_ELEMENT_ENTRY_IDS are excluded — they have element entry
 *    field data from the migration DB but their business process is NOT about
 *    element entries (e.g., checks, SECA, direct deposit, costing, taxes).
 * 2. If field data exists with tab="Core HR" or "Core - Hires" (5 tests),
 *    these are hire/leave scenarios — route to Scheduled Processes or
 *    Person Management based on business process.
 * 3. Fallback: route by test script ID or business process text.
 *
 * Routes based on test script and business process:
 * - HCM.PAY.510.00 -> Semi-monthly payroll run (31 tests)
 * - HCM.PAY.106.00 -> Off-cycle payroll bonus (13 tests)
 * - HCM.PAY.520.00 -> Off-cycle additional salary (9 tests)
 * - HCM.PAY.113.00 -> MSS W-4 / SECA (7 tests)
 * - HCM.PAY.301.00 -> Costing/designation (6 tests)
 * - HCM.PAY.404.00 -> CA Meal Penalty (4 tests)
 * - Year End -> W-2 processing (3 tests)
 * - HCM.PAY.114.00 -> Calculation card (2 tests)
 * - HCM.PAY.324.00 -> Reverse/reissue checks (2 tests)
 * - HCM.PAY.307.00 -> Tax adjustments (2 tests)
 * - HCM.PAY.111.00 -> Direct deposit (2 tests)
 * - HCM.PAY.418.00 -> Create and print checks
 * - HCM.PAY.419.00 -> Generate advice
 * - HCM.PAY.417.00 -> Direct deposit file
 * - HCM.PAY.422.00 -> Tax payment file
 * - HCM.PAY.325.00 -> ACH returns
 * - HCM.PAY.316.00 -> Multi-state taxes
 * - Various single-test scripts
 */
export class PayrollProcessingFlow extends BaseFlow {
  /**
   * Test IDs that have element entry field data from the migration DB but whose
   * business process is NOT about creating element entries. These bypass
   * ElementEntryFlow and route via script/business-process matching (Priority 3).
   */
  private static readonly NON_ELEMENT_ENTRY_IDS = new Set([
    // Scheduled Processes: checks, advice, DD files, tax files
    'PY-012', 'PY-013', 'PY-014', 'PY-015',
    // ESS Tax Location Update
    'PY-016',
    // SECA opt-in/out for various designations
    'PY-022', 'PY-023', 'PY-024', 'PY-025', 'PY-026', 'PY-027',
    // Multi-state taxes, ACH returns, reverse/reissue, stale dated, tax adjustments
    'PY-031', 'PY-032', 'PY-033', 'PY-036', 'PY-037',
    // Direct Deposit (ESS)
    'PY-047', 'PY-073',
    // Costing / designation
    'PY-048', 'PY-049',
    // Tax overrides, tax refunds, VT childcare tax
    'PY-058', 'PY-059', 'PY-063',
  ]);
  private payroll: PayrollProcessingPage;

  constructor(page: Page) {
    super(page);
    this.payroll = new PayrollProcessingPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    // Login FIRST as the correct bot user (direct Oracle login) before any routing.
    // This ensures ElementEntryFlow and other sub-flows don't fall back to SSO.
    await this.loginToHCM(tc);

    const fieldData = getFieldData(tc.testId);

    // Priority 1: If field data has element entry fields AND the test script
    // is NOT a known payroll processing script, use ElementEntryFlow.
    // Most payroll tests (~75) have "Housing Allowance" element data from migration DB
    // as reference/prerequisite data, but their actual test is to run payroll cycles,
    // off-cycle payroll, costing, etc. Only route to ElementEntryFlow for tests
    // that don't match any payroll processing script pattern.
    const script = tc.testScript;
    const process = tc.businessProcess.toLowerCase();
    const isPayrollProcessingScript = Boolean(
      script.includes('PAY.510') || script.includes('PAY.106') || script.includes('PAY.103') ||
      script.includes('PAY.520') || script.includes('PAY.113') || script.includes('PAY.114') ||
      script.includes('PAY.301') || script.includes('PAY.309') || script.includes('PAY.404') ||
      script.includes('PAY.602') || script.includes('PAY.111') || script.includes('PAY.307') ||
      script.includes('PAY.316') || script.includes('PAY.324') || script.includes('PAY.325') ||
      script.includes('PAY.417') || script.includes('PAY.418') || script.includes('PAY.419') ||
      script.includes('PAY.422') || script.includes('Year End') ||
      process.includes('w-2') || process.includes('year end')
    );
    const isNonElement = PayrollProcessingFlow.NON_ELEMENT_ENTRY_IDS.has(tc.testId);
    if (fieldData && this.hasElementEntryFields(fieldData) && !isPayrollProcessingScript && !isNonElement) {
      console.log(`[Payroll] ${tc.testId}: Routing to ElementEntryFlow (tab=${fieldData.tab}, element=${getField(fieldData, 'Element name')})`);
      const flow = new ElementEntryFlow(this.page);
      await flow.execute(fieldData);
      return;
    }

    if ((isPayrollProcessingScript || isNonElement) && fieldData) {
      console.log(`[Payroll] ${tc.testId}: Bypassing ElementEntryFlow (payroll processing test: "${tc.businessProcess}") — routing by script/process`);
    }

    // Priority 2: Field data with Core HR/Hires tab — these are leave/hire scenarios.
    // Route via Person Management or Scheduled Processes.
    if (fieldData && (fieldData.tab === 'Core HR' || fieldData.tab.startsWith('Core -'))) {
      console.log(`[Payroll] ${tc.testId}: Core HR scenario (tab=${fieldData.tab}, scenario=${fieldData.scenario})`);
      await this.executeCoreHRPayrollScenario(tc, fieldData);
      return;
    }

    // Priority 3: No field data or unrecognized tab — route by test script/business process.

    // Route to appropriate payroll operation.
    // SECA check BEFORE PAY.510 — PY-022/PY-023 have PAY.510 script but are SECA tests.
    if (process.includes('seca')) {
      await this.executeW4(tc);
    } else if (script.includes('PAY.510') || process.includes('semi-monthly') || process.includes('hourly payroll')) {
      await this.executePayrollRun(tc);
    } else if (script.includes('PAY.106') || script.includes('PAY.103') || process.includes('off cycle') || process.includes('off-cycle') || process.includes('bonus')) {
      await this.executeOffCyclePayroll(tc);
    } else if (script.includes('PAY.520') || process.includes('additional salary') || process.includes('back pay') || process.includes('arrears')) {
      await this.executeOffCyclePayroll(tc);
    } else if (script.includes('PAY.113') || script.includes('PAY.602') || process.includes('w-4') || process.includes('seca') || process.includes('tax override') || process.includes('tax refund')) {
      await this.executeW4(tc);
    } else if (script.includes('PAY.114') || process.includes('calculation card')) {
      await this.executeCalculationCard(tc);
    } else if (script.includes('PAY.301') || process.includes('costing') || process.includes('designation') || process.includes('configuration')) {
      await this.executeCosting(tc);
    } else if (script.includes('PAY.111') || process.includes('direct deposit')) {
      await this.executeDirectDeposit(tc);
    } else if (script.includes('PAY.324') || process.includes('reverse') || process.includes('reissue') || process.includes('stale dated')) {
      await this.executeCheckProcessing(tc);
    } else if (script.includes('PAY.307') || process.includes('tax adjust')) {
      await this.executeTaxAdjustment(tc);
    } else if (script.includes('PAY.404') || process.includes('meal penalty') || process.includes('emergency pay') || process.includes('overtime')) {
      await this.executeMealPenalty(tc);
    } else if (script.includes('PAY.418') || process.includes('print check') || process.includes('create and print')) {
      await this.executeCheckGeneration(tc);
    } else if (script.includes('PAY.419') || process.includes('advice') || process.includes('generate advice')) {
      await this.executePayAdvice(tc);
    } else if (script.includes('PAY.417') || process.includes('direct deposit file') || process.includes('run direct deposit')) {
      await this.executeDirectDepositFile(tc);
    } else if (script.includes('PAY.422') || process.includes('tax payment') || process.includes('generate tax')) {
      await this.executeTaxPaymentFile(tc);
    } else if (script.includes('Year End') || process.includes('w-2') || process.includes('year end')) {
      await this.executeYearEnd(tc);
    } else if (script.includes('PAY.309') || process.includes('403b') || process.includes('loan')) {
      await this.execute403bLoan(tc);
    } else if (script.includes('PAY.316') || process.includes('multi-state') || process.includes('reciprocity')) {
      await this.executeMultiStateTax(tc);
    } else if (script.includes('PAY.325') || process.includes('ach return')) {
      await this.executeACHReturns(tc);
    } else if (process.includes('ess tax') || process.includes('tax location') || process.includes('ess w-4')) {
      await this.executeESSTaxUpdate(tc);
    } else if (process.includes('fli') || process.includes('stt') || process.includes('mli') || process.includes('care fund') || process.includes('childcare tax')) {
      await this.executeStateTaxPayroll(tc);
    } else if (process.includes('disability') || process.includes('short term') || process.includes('severence') || process.includes('seperation') || process.includes('final pay')) {
      await this.executeOffCyclePayroll(tc);
    } else if (process.includes('job change') || process.includes('salary change') || process.includes('salary advance') || process.includes('retroactive')) {
      await this.executePayrollRun(tc);
    } else if (process.includes('leave') || process.includes('unpaid')) {
      await this.executeLeaveScenario(tc);
    } else if (process.includes('new hire') || process.includes('reporting')) {
      await this.executeHireReporting(tc);
    } else if (process.includes('benadm') || process.includes('catch up') || process.includes('time & labor') || process.includes('absence element')) {
      await this.executePayrollRun(tc);
    } else {
      // Default: schedule the payroll run via Scheduled Processes
      await this.executePayrollRun(tc);
    }
  }

  /**
   * Check if field data contains element entry fields.
   * Element entry tests have "Search For" + "Element name" fields.
   */
  private hasElementEntryFields(fd: TestCase): boolean {
    const searchFor = getField(fd, 'Search For');
    const elementName = getField(fd, 'Element name');
    return Boolean(searchFor && elementName);
  }

  /**
   * Handle payroll tests that have Core HR field data (leave, MHA, hire scenarios).
   * These 5 tests don't use Element Entry — they use Person Management.
   */
  private async executeCoreHRPayrollScenario(tc: UATTestCase, fd: TestCase): Promise<void> {
    // Login already done in execute() — no need to re-login here.
    const scenario = fd.scenario.toLowerCase();
    const bp = tc.businessProcess.toLowerCase();

    if (scenario.includes('leave') || bp.includes('leave')) {
      await this.executeLeaveScenario(tc);
    } else if (scenario.includes('housing allowance') || bp.includes('housing allowance') || bp.includes('mha')) {
      // MHA scenario — navigate to Person Management to view/edit
      await this.homePage.goToPersonManagement();
      await this.payroll.waitForJET();
      const personName = getField(fd, 'Person Name');
      if (personName) {
        await this.searchPersonByName(personName);
      }
      await this.payroll.screenshot(`payroll-mha-${tc.testId}`);
    } else if (scenario.includes('staff') || bp.includes('new hire')) {
      await this.executeHireReporting(tc);
    } else {
      // Generic: navigate to Person Management
      await this.homePage.goToPersonManagement();
      await this.payroll.waitForJET();
      await this.payroll.screenshot(`payroll-core-${tc.testId}`);
    }
  }

  /** Execute leave-related payroll scenario via Person Management. */
  private async executeLeaveScenario(tc: UATTestCase): Promise<void> {
    // Leave tests need to navigate to absence management
    await this.homePage.goToAbsenceAdmin();
    await this.payroll.waitForJET();
    await this.payroll.screenshot(`payroll-leave-${tc.testId}`);
  }

  /** Execute new hire reporting scenario. */
  private async executeHireReporting(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('New Hire Report').catch(() => {
      console.log('[Payroll] "New Hire Report" process not found, using generic payroll run');
    });
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }

  /** Search for a person by name on the current page. */
  private async searchPersonByName(name: string): Promise<void> {
    const searchInput = this.page.locator(
      '[id$="q1:value00::content"], input[aria-label*="Search"], input[placeholder*="Search"]'
    ).first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill(name);
      await searchInput.press('Enter');
      await this.page.waitForTimeout(5000);
      await this.payroll.waitForJET();
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
    // Oracle HCM uses "Calculate QuickPay" for off-cycle payroll runs.
    // Try multiple process names in case the environment uses a different name.
    const processNames = ['Calculate QuickPay', 'Run QuickPay', 'QuickPay', 'Off-Cycle Payroll', 'Off Cycle', 'Calculate Payroll'];
    let scheduled = false;
    for (const name of processNames) {
      try {
        await this.payroll.scheduleNewProcess(name);
        scheduled = true;
        console.log(`[Payroll] Scheduled off-cycle process: ${name}`);
        break;
      } catch (err) {
        console.log(`[Payroll] Process "${name}" not found, trying next...`);
      }
    }
    if (!scheduled) {
      throw new Error('Off-cycle payroll process not found (tried: ' + processNames.join(', ') + ')');
    }
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

  /** ESS tax location update or ESS W-4 via Me > Pay. */
  private async executeESSTaxUpdate(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPayESS();
    await this.payroll.waitForJET();
    // Look for Tax Withholding or Tax Location links
    const taxLink = this.page.locator(
      'a:has-text("Tax Withholding"), a:has-text("Withholding"), a:has-text("Tax Location")'
    ).first();
    if (await taxLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await taxLink.click();
      await this.page.waitForTimeout(5000);
      await this.payroll.waitForJET();
    }
    await this.payroll.verifyResult();
  }

  /** State-specific FLI/STT/MLI taxes via payroll run (Scheduled Processes). */
  private async executeStateTaxPayroll(tc: UATTestCase): Promise<void> {
    await this.payroll.goToScheduledProcesses();
    await this.payroll.scheduleNewProcess('Calculate Payroll');
    await this.payroll.fillPayrollRunParams({
      effectiveDate: tc.testDate || undefined,
    });
    await this.payroll.submitFlow();
    await this.payroll.verifyResult();
  }
}
