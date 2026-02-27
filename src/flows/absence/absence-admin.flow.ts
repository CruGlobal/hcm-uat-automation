import { type Page } from '@playwright/test';
import { BaseAbsenceFlow } from './base-absence.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Absence Administration
 *
 * Handles HR Specialist administrative actions:
 * - Review/Add/Update/Delete enrollments
 * - Balance adjustments and disbursements
 * - Accrual processing (manual run, review, withdraw)
 * - Scheduled processes (Update Accrual Plan Enrollments)
 * - Work schedule assignments
 * - Evaluate absences
 *
 * Routing by test script ID patterns:
 * - HCM.ABS.1xx — Review/Add enrollment scripts
 * - HCM.ABS.2xx — Update enrollment / Review accrual balance
 * - HCM.ABS.3xx — Balance adjustment / Accrual processing / Review balance
 * - HCM.ABS.4xx — Review enrollment / Add absence / Review balance
 * - HCM.ABS.5xx — Review enrollment / Disburse balance
 * - HCM.ABS.6xx — Review enrollment / Update accrual plan enrollments process
 * - HCM.ABS.7xx — Review / Delete enrollment
 * - HCM.ABS.8xx — Review / Manual accrual processing
 * - HCM.ABS.9xx — Review / Withdraw accruals
 * - HCM.ABS.10xx — Scheduled processes (Update Accrual Plan Enrollments)
 * - HCM.ABS.1101.xx — Employee views absence balance (ESS)
 * - HCM.ABS.1801.xx — Calculate Accruals and Balances
 * - HCM.ABS.1901.xx — Evaluate Absences
 * - HCM.ABS.23xx — HR Specialist adds Work Schedule Assignment
 * - HCM.ABS.24xx — Manager adds Work Schedule Assignment
 */
export class AbsenceAdminFlow extends BaseAbsenceFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    const scriptId = (tc.testScript || '').toUpperCase();
    const process = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();

    // Route based on script ID patterns
    if (this.matchScript(scriptId, ['101', '201', '301', '401', '501', '601', '701', '801', '901'])) {
      await this.reviewEnrollments(tc);
    } else if (this.matchScript(scriptId, ['102'])) {
      await this.addEnrollment(tc);
    } else if (this.matchScript(scriptId, ['202'])) {
      await this.updateEnrollment(tc);
    } else if (this.matchScript(scriptId, ['203', '304', '403', '603'])) {
      await this.reviewAccrualBalance(tc);
    } else if (this.matchScript(scriptId, ['302'])) {
      await this.adjustBalance(tc);
    } else if (this.matchScript(scriptId, ['303', '802'])) {
      await this.processAccrualsManually(tc);
    } else if (this.matchScript(scriptId, ['502'])) {
      await this.disburseBalance(tc);
    } else if (this.matchScript(scriptId, ['602'])) {
      await this.runUpdateAccrualPlanEnrollments(tc);
    } else if (this.matchScript(scriptId, ['702'])) {
      await this.deleteEnrollment(tc);
    } else if (this.matchScript(scriptId, ['902'])) {
      await this.withdrawAccruals(tc);
    } else if (this.matchScript(scriptId, ['1001'])) {
      await this.runScheduledProcess(tc);
    } else if (this.matchScript(scriptId, ['1101'])) {
      await this.employeeViewsAbsenceBalance(tc);
    } else if (this.matchScript(scriptId, ['1801'])) {
      await this.calculateAccrualsAndBalances(tc);
    } else if (this.matchScript(scriptId, ['1901'])) {
      await this.evaluateAbsences(tc);
    } else if (this.matchScript(scriptId, ['2301'])) {
      await this.hrAddWorkScheduleAssignment(tc);
    } else if (this.matchScript(scriptId, ['2401'])) {
      await this.managerAddWorkScheduleAssignment(tc);
    } else if (process.includes('enroll') && process.includes('add')) {
      await this.addEnrollment(tc);
    } else if (process.includes('enroll') && (process.includes('update') || process.includes('edit'))) {
      await this.updateEnrollment(tc);
    } else if (process.includes('enroll') && process.includes('delete')) {
      await this.deleteEnrollment(tc);
    } else if (process.includes('balance') && process.includes('adjust')) {
      await this.adjustBalance(tc);
    } else if (process.includes('disburse')) {
      await this.disburseBalance(tc);
    } else if (process.includes('accrual') && (process.includes('run') || process.includes('process'))) {
      await this.processAccrualsManually(tc);
    } else if (process.includes('accrual') && process.includes('withdraw')) {
      await this.withdrawAccruals(tc);
    } else if (process.includes('balance') && process.includes('review')) {
      await this.reviewAccrualBalance(tc);
    } else if (process.includes('work schedule')) {
      await this.hrAddWorkScheduleAssignment(tc);
    } else if (process.includes('evaluate')) {
      await this.evaluateAbsences(tc);
    } else {
      // Default: review enrollments
      await this.reviewEnrollments(tc);
    }

    await this.absence.screenshot(`absence-admin-${tc.testId}`);
  }

  /** Check if script ID matches any of the given suffixes. */
  private matchScript(scriptId: string, suffixes: string[]): boolean {
    return suffixes.some(s => scriptId.includes(`.${s}.`) || scriptId.endsWith(`.${s}`));
  }

  /**
   * HCM.ABS.101/201/301/401/501/601/701/801/901 — Review Current Enrollments.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Click plan name to review details
   */
  private async reviewEnrollments(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Step 6: Navigate to Plan Participation
    await this.absence.navigateToPlanParticipation();

    // Step 7: Click on a plan name to review details
    const planName = this.extractPlanName(tc);
    await this.absence.clickPlanName(planName || undefined);

    // The popup shows accrual balance summary and details
    // Close with OK when done
    await this.absence.clickOk();
  }

  /**
   * HCM.ABS.102 — HR Specialist Adds a New Enrollment.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Add Enrollment link/dropdown ->
   *        Select Plan -> Enter Start Date -> Submit
   */
  private async addEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Step 6: Navigate to Plan Participation
    await this.absence.navigateToPlanParticipation();

    // Step 7: Click Add Enrollment
    await this.absence.clickAddEnrollment();

    // Step 8: Select plan from the dropdown in the dialog
    const planName = this.extractPlanName(tc);
    if (planName) {
      await this.absence.selectPlan(planName);
    }

    // Step 9: Enter Start Date
    const data = this.parseTestData(tc);
    if (data['start date'] || data['start']) {
      await this.absence.fillEnrollmentStartDate(data['start date'] || data['start']);
    }

    // Submit
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.202 — HR Specialist Updates an Existing Enrollment.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Select plan -> Update Enrollment ->
   *        Update Start/End Date -> Submit
   */
  private async updateEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Step 6: Navigate to Plan Participation
    await this.absence.navigateToPlanParticipation();

    // Step 7: Select a plan row
    await this.absence.selectPlanRow(0);

    // Step 8: Click Update Enrollment
    await this.absence.clickUpdateEnrollment();

    // Steps 9-10: Update Start/End dates, then submit
    const data = this.parseTestData(tc);
    if (data['start date'] || data['start']) {
      await this.absence.fillEnrollmentStartDate(data['start date'] || data['start']);
    }
    if (data['end date'] || data['end']) {
      await this.absence.fillEnrollmentEndDate(data['end date'] || data['end']);
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.702 — HR Specialist Deletes an Existing Enrollment.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Select plan -> Delete Enrollment -> Confirm
   */
  private async deleteEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    await this.absence.clickDeleteEnrollment();
  }

  /**
   * HCM.ABS.203/304/403/603 — HR Specialist Reviews Accrual Balance.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Click plan name -> Enter Balance Calculation Date ->
   *        View Summary/Details tabs -> OK
   */
  private async reviewAccrualBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to Plan Participation
    await this.absence.navigateToPlanParticipation();

    // Click on a plan name to open the accrual balance popup
    const planName = this.extractPlanName(tc);
    await this.absence.clickPlanName(planName || undefined);

    // Enter a Balance Calculation Date if provided
    const data = this.parseTestData(tc);
    const calcDate = data['balance calculation date'] || data['calculation date'] || data['date'] || '';
    if (calcDate) {
      await this.absence.fillBalanceCalculationDate(calcDate);
    }

    // View the balance, then close
    await this.absence.clickOk();
  }

  /**
   * HCM.ABS.302 — HR Specialist Performs a Balance Adjustment.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Select plan -> Enrollments and Adjustments dropdown ->
   *        Adjust Balance -> Select Reason, Enter Amount, Enter Date -> Submit
   */
  private async adjustBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    // Click Adjust Balance from the dropdown
    await this.absence.clickAdjustBalance();

    // Fill adjustment details
    const data = this.parseTestData(tc);
    const reason = data['reason'] || '';
    const amount = data['adjustment amount'] || data['amount'] || '';
    const date = data['date'] || '';
    await this.absence.fillBalanceAdjustment(reason, amount, date);

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.303/802 — HR Specialist Manually Processes Accruals.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Accruals dropdown ->
   *        Run Accruals for All Active Plans -> Enter Balance As-of-Date ->
   *        Calculate accruals and balances -> Submit
   */
  private async processAccrualsManually(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();

    // Click Accruals dropdown and run accruals
    await this.absence.clickRunAccrualsAllPlans();

    // Enter a Balance As-of-Date if provided
    const data = this.parseTestData(tc);
    const asOfDate = data['balance as-of-date'] || data['as-of-date'] || data['date'] || '';
    if (asOfDate) {
      await this.absence.fillBalanceCalculationDate(asOfDate);
    }

    // Submit to run accrual calculation
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.502 — HR Specialist Disburses from Balance.
   * Steps: Login -> Admin -> Absences and Entitlements -> Search person ->
   *        Plan Participation -> Select plan -> Enrollments and Adjustments ->
   *        Disburse Balance -> Enter Date and Disbursement Amount -> Submit
   */
  private async disburseBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    // Click Disburse Balance from the dropdown
    await this.absence.clickDisburseBalance();

    // Fill disbursement details
    const data = this.parseTestData(tc);
    const amount = data['disbursement amount'] || data['amount'] || '';
    const date = data['date'] || '';
    await this.absence.fillDisbursement(amount, date);

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.602 — HR Specialist Runs Update Accrual Plan Enrollments Process.
   * Steps: Login -> Admin -> Absences -> Schedule and Monitor Absence Processes ->
   *        Select process -> Submit
   */
  private async runUpdateAccrualPlanEnrollments(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin();

    // Click "Schedule and Monitor Absence Processes"
    await this.absence.openScheduleMonitorProcesses();

    // Select the "Update Accrual Plan Enrollments" process
    const processLink = this.page.getByText('Update Accrual Plan Enrollments', { exact: false }).first();
    if (await processLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await processLink.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    // Submit the process
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.902 — HR Specialist Manually Withdraws Accruals.
   * Similar to manual processing but with withdraw action.
   */
  private async withdrawAccruals(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();

    // Open Accruals dropdown and select withdraw option
    await this.absence.openAccrualsDropdown();
    const withdrawOption = this.page.getByText('Withdraw Accruals', { exact: false })
      .or(this.page.getByText('Reverse Accruals', { exact: false }))
      .first();
    if (await withdrawOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await withdrawOption.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1001 — Runs Update Accrual Plan Enrollments via Scheduled Processes.
   * Steps: Login -> Tools -> Scheduled Processes -> Submit process
   */
  private async runScheduledProcess(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    // Navigate to Scheduled Processes via Navigator > Tools
    await this.homePage.goToScheduledProcesses();

    // Look for the submit/schedule new process button
    const submitNewProcess = this.page.getByText('Schedule New Process', { exact: false })
      .or(this.page.getByText('Submit New Process', { exact: false }))
      .first();
    if (await submitNewProcess.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitNewProcess.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    // Search for the process name
    const processSearch = this.page.locator(
      'input[aria-label*="Name"], input[aria-label*="Process"], input[placeholder*="Search"]'
    ).first();
    if (await processSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.absence.fillField(processSearch, 'Update Accrual Plan Enrollments');
    }

    // Submit
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1101 — Employee Views Absence Balance (ESS).
   * Steps: Login -> Me -> Time and Absences -> Absence Balance tile
   */
  private async employeeViewsAbsenceBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();
    await this.absence.clickAbsenceBalanceTile();
  }

  /**
   * HCM.ABS.1801 — Calculate Accruals and Balances by HR Specialist.
   * Steps: Login -> Absences Admin -> Schedule and Monitor ->
   *        Calculate Accruals and Balances -> Submit
   */
  private async calculateAccrualsAndBalances(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin();

    await this.absence.openScheduleMonitorProcesses();

    const calcLink = this.page.getByText('Calculate Accruals and Balances', { exact: false }).first();
    if (await calcLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcLink.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1901 — Evaluate Absences by HR Specialist.
   * Steps: Login -> Absences Admin -> Schedule and Monitor ->
   *        Evaluate Absences -> Submit
   */
  private async evaluateAbsences(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin();

    await this.absence.openScheduleMonitorProcesses();

    const evalLink = this.page.getByText('Evaluate Absences', { exact: false }).first();
    if (await evalLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await evalLink.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.2301 — HR Specialist Adds Work Schedule Assignment.
   * Steps: Login -> Absences Admin -> Work Schedule Assignment ->
   *        Search person -> Add assignment -> Fill details -> Submit
   */
  private async hrAddWorkScheduleAssignment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin();

    // Click Work Schedule Assignment task
    await this.absence.openWorkScheduleAssignment();

    // Search for the person
    const personName = this.extractPersonName(tc);
    if (personName) {
      await this.absence.searchPerson(personName);
    }

    // Add a new work schedule assignment
    const addButton = this.page.locator(
      'button:has-text("Add"), a:has-text("Add"), a[role="button"]:has-text("Add")'
    ).first();
    if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    // Fill details from test case
    await this.absence.fillFromUATTestCase(tc);

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.2401 — Manager Adds Work Schedule Assignment.
   * Same flow as HR Specialist but from manager perspective.
   */
  private async managerAddWorkScheduleAssignment(tc: UATTestCase): Promise<void> {
    // Manager uses the same admin navigation for work schedule
    await this.hrAddWorkScheduleAssignment(tc);
  }

  /**
   * Parse test data from a UATTestCase into key-value pairs.
   */
  private parseTestData(tc: UATTestCase): Record<string, string> {
    const result: Record<string, string> = {};
    const sources = [tc.testData || '', tc.preConditions || ''];
    for (const source of sources) {
      const lines = source.split(/[\n;]+/);
      for (const line of lines) {
        const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
        if (match) {
          result[match[1].toLowerCase().trim()] = match[2].trim();
        }
      }
    }
    return result;
  }
}
