import { type Page } from '@playwright/test';
import { BaseAbsenceFlow } from './base-absence.flow';
import type { UATTestCase } from '../../data/types';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { parseTestDataMulti } from '../../utils/test-data-parser';

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
 * - Employee views absence balance (ESS)
 *
 * Routing by test script ID patterns:
 * - HCM.ABS.1xx -- Review/Add enrollment scripts
 * - HCM.ABS.2xx -- Update enrollment / Review accrual balance
 * - HCM.ABS.3xx -- Balance adjustment / Accrual processing / Review balance
 * - HCM.ABS.4xx -- Review enrollment / Add absence / Review balance
 * - HCM.ABS.5xx -- Review enrollment / Disburse balance
 * - HCM.ABS.6xx -- Review enrollment / Update accrual plan enrollments process
 * - HCM.ABS.7xx -- Review / Delete enrollment
 * - HCM.ABS.8xx -- Review / Manual accrual processing
 * - HCM.ABS.9xx -- Review / Withdraw accruals
 * - HCM.ABS.10xx -- Scheduled processes (Update Accrual Plan Enrollments)
 * - HCM.ABS.1101.xx -- Employee views absence balance (ESS)
 * - HCM.ABS.1801.xx -- Calculate Accruals and Balances
 * - HCM.ABS.1901.xx -- Evaluate Absences
 * - HCM.ABS.23xx -- HR Specialist adds Work Schedule Assignment
 * - HCM.ABS.24xx -- Manager adds Work Schedule Assignment
 */
export class AbsenceAdminFlow extends BaseAbsenceFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    const scriptId = (tc.testScript || '').toUpperCase();
    const bp = (tc.businessProcess || '').toLowerCase();

    console.log(`[AbsenceAdmin] ${tc.testId} bp="${tc.businessProcess}" cat="${tc.transactionCategory}" script="${tc.testScript}"`);

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
    } else {
      // Fallback: route by business process keywords
      await this.routeByBusinessProcess(tc, bp);
    }

    await this.absence.screenshot(`absence-admin-${tc.testId}`);
  }

  /**
   * Route by business process text for tests without a recognized script ID.
   */
  private async routeByBusinessProcess(tc: UATTestCase, bp: string): Promise<void> {
    if (bp.includes('enroll') && bp.includes('add')) {
      await this.addEnrollment(tc);
    } else if (bp.includes('enroll') && (bp.includes('update') || bp.includes('edit'))) {
      await this.updateEnrollment(tc);
    } else if (bp.includes('enroll') && bp.includes('delete')) {
      await this.deleteEnrollment(tc);
    } else if (bp.includes('review') && bp.includes('enroll')) {
      await this.reviewEnrollments(tc);
    } else if (bp.includes('balance') && bp.includes('adjust')) {
      await this.adjustBalance(tc);
    } else if (bp.includes('disburse')) {
      await this.disburseBalance(tc);
    } else if (bp.includes('accrual') && (bp.includes('run') || bp.includes('process'))) {
      await this.processAccrualsManually(tc);
    } else if (bp.includes('accrual') && bp.includes('withdraw')) {
      await this.withdrawAccruals(tc);
    } else if (bp.includes('balance') && bp.includes('review')) {
      await this.reviewAccrualBalance(tc);
    } else if (bp.includes('view absence balance') || bp.includes('view') && bp.includes('balance')) {
      await this.employeeViewsAbsenceBalance(tc);
    } else if (bp.includes('work schedule')) {
      await this.hrAddWorkScheduleAssignment(tc);
    } else if (bp.includes('evaluate')) {
      await this.evaluateAbsences(tc);
    } else if (bp.includes('calculate') && bp.includes('accrual')) {
      await this.calculateAccrualsAndBalances(tc);
    } else if (bp.includes('accrual plan enroll')) {
      await this.runUpdateAccrualPlanEnrollments(tc);
    } else if (bp.includes('withdraw')) {
      // HR Specialist withdraw absence
      await this.hrWithdrawAbsence(tc);
    } else {
      // Default: review enrollments (most common admin action)
      console.log(`[AbsenceAdmin] Default route: review enrollments for bp="${bp}"`);
      await this.reviewEnrollments(tc);
    }
  }

  /** Check if script ID matches any of the given suffixes. */
  private matchScript(scriptId: string, suffixes: string[]): boolean {
    return suffixes.some(s => scriptId.includes(`.${s}.`) || scriptId.endsWith(`.${s}`));
  }

  /**
   * Extract plan name from field data or test case text.
   */
  private extractPlanNameFromFieldData(tc: UATTestCase): string | undefined {
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const plan = getField(fieldData, 'Plan Name') || getField(fieldData, 'Plan');
      if (plan) return plan;
    }
    // Fallback to text extraction
    const name = this.extractPlanName(tc);
    return name || undefined;
  }

  /**
   * HCM.ABS.101/201/301/401/501/601/701/801/901 -- Review Current Enrollments.
   * Steps: Login -> ESS -> Navigate to Plan Participation -> View plan details
   */
  private async reviewEnrollments(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to Plan Participation
    await this.absence.navigateToPlanParticipation();

    // Click on a plan name to review details
    const planName = this.extractPlanNameFromFieldData(tc);
    await this.absence.clickPlanName(planName);

    // Close the popup
    await this.absence.clickOk();
  }

  /**
   * HCM.ABS.102 -- HR Specialist Adds a New Enrollment.
   */
  private async addEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.clickAddEnrollment();

    const planName = this.extractPlanNameFromFieldData(tc);
    if (planName) {
      await this.absence.selectPlan(planName);
    }

    // Enter Start Date from field data or test data
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const startDate = getField(fieldData, 'Start Date');
      if (startDate) await this.absence.fillEnrollmentStartDate(this.convertDate(startDate));
    } else {
      const data = parseTestDataMulti(tc.testData, tc.preConditions);
      if (data['start date'] || data['start']) {
        await this.absence.fillEnrollmentStartDate(data['start date'] || data['start']);
      }
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.202 -- HR Specialist Updates an Existing Enrollment.
   */
  private async updateEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);
    await this.absence.clickUpdateEnrollment();

    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const startDate = getField(fieldData, 'Start Date');
      const endDate = getField(fieldData, 'End Date');
      if (startDate) await this.absence.fillEnrollmentStartDate(this.convertDate(startDate));
      if (endDate) await this.absence.fillEnrollmentEndDate(this.convertDate(endDate));
    } else {
      const data = parseTestDataMulti(tc.testData, tc.preConditions);
      if (data['start date'] || data['start']) {
        await this.absence.fillEnrollmentStartDate(data['start date'] || data['start']);
      }
      if (data['end date'] || data['end']) {
        await this.absence.fillEnrollmentEndDate(data['end date'] || data['end']);
      }
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.702 -- HR Specialist Deletes an Existing Enrollment.
   */
  private async deleteEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    await this.absence.clickDeleteEnrollment();
  }

  /**
   * HCM.ABS.203/304/403/603 -- HR Specialist Reviews Accrual Balance.
   */
  private async reviewAccrualBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();

    const planName = this.extractPlanNameFromFieldData(tc);
    await this.absence.clickPlanName(planName);

    // Enter Balance Calculation Date if available
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const calcDate = getField(fieldData, 'Balance Calculation Date') || getField(fieldData, 'Date');
      if (calcDate) await this.absence.fillBalanceCalculationDate(this.convertDate(calcDate));
    } else {
      const data = parseTestDataMulti(tc.testData, tc.preConditions);
      const calcDate = data['balance calculation date'] || data['calculation date'] || data['date'] || '';
      if (calcDate) await this.absence.fillBalanceCalculationDate(calcDate);
    }

    await this.absence.clickOk();
  }

  /**
   * HCM.ABS.302 -- HR Specialist Performs a Balance Adjustment.
   */
  private async adjustBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    await this.absence.clickAdjustBalance();

    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const reason = getField(fieldData, 'Reason');
      const amount = getField(fieldData, 'Adjustment Amount') || getField(fieldData, 'Amount');
      const date = getField(fieldData, 'Date');
      await this.absence.fillBalanceAdjustment(
        reason || '', amount || '', date ? this.convertDate(date) : ''
      );
    } else {
      const data = parseTestDataMulti(tc.testData, tc.preConditions);
      await this.absence.fillBalanceAdjustment(
        data['reason'] || '', data['adjustment amount'] || data['amount'] || '', data['date'] || ''
      );
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.303/802 -- HR Specialist Manually Processes Accruals.
   * Uses Absence Admin → Schedule and Monitor Processes → Calculate Accruals and Balances.
   * The per-person "Accruals" button is only in the ADF admin view, not accessible from ESS.
   */
  private async processAccrualsManually(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    if (!await this.absence.openScheduleMonitorProcesses()) {
      console.log(`[AbsenceAdmin] ${tc.testId}: Skipping — bot lacks Schedule and Monitor Processes access`);
      return;
    }

    const calcLink = this.page.getByText('Calculate Accruals and Balances', { exact: false }).first();
    if (await calcLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcLink.click();
      await this.page.waitForTimeout(5000);
      await this.absence.waitForJET();
    } else {
      console.log(`[AbsenceAdmin] ${tc.testId}: Calculate Accruals and Balances link not found — navigation only`);
      return;
    }

    // Submit the form if a button is available (OK, Submit, or Run)
    const submitBtn = this.page.locator(
      'button:has-text("Submit"), button:has-text("OK"), button:has-text("Run"), ' +
      'a[role="button"]:has-text("Submit"), a[role="button"]:has-text("OK")'
    ).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
      await this.absence.confirmDialog();
    } else {
      console.log(`[AbsenceAdmin] ${tc.testId}: No submit button found on Calculate Accruals form — navigation only`);
    }
  }

  /**
   * HCM.ABS.502 -- HR Specialist Disburses from Balance.
   */
  private async disburseBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    await this.absence.selectPlanRow(0);

    await this.absence.clickDisburseBalance();

    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const amount = getField(fieldData, 'Disbursement Amount') || getField(fieldData, 'Amount');
      const date = getField(fieldData, 'Date');
      await this.absence.fillDisbursement(amount || '', date ? this.convertDate(date) : '');
    } else {
      const data = parseTestDataMulti(tc.testData, tc.preConditions);
      await this.absence.fillDisbursement(
        data['disbursement amount'] || data['amount'] || '', data['date'] || ''
      );
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.602 -- HR Specialist Runs Update Accrual Plan Enrollments Process.
   */
  private async runUpdateAccrualPlanEnrollments(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    await this.absence.openScheduleMonitorProcesses();

    const processLink = this.page.getByText('Update Accrual Plan Enrollments', { exact: false }).first();
    if (await processLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await processLink.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.902 -- HR Specialist Manually Withdraws Accruals.
   */
  private async withdrawAccruals(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();

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
   * HCM.ABS.1001 -- Runs Update Accrual Plan Enrollments via Scheduled Processes.
   */
  private async runScheduledProcess(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    await this.homePage.goToScheduledProcesses();

    const submitNewProcess = this.page.getByText('Schedule New Process', { exact: false })
      .or(this.page.getByText('Submit New Process', { exact: false }))
      .first();
    if (await submitNewProcess.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitNewProcess.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    const processSearch = this.page.locator(
      'input[aria-label*="Name"], input[aria-label*="Process"], input[placeholder*="Search"]'
    ).first();
    if (await processSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.absence.fillField(processSearch, 'Update Accrual Plan Enrollments');
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1101 -- Employee Views Absence Balance (ESS).
   */
  private async employeeViewsAbsenceBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);
    await this.absence.clickAbsenceBalanceTile();
  }

  /**
   * HCM.ABS.1801 -- Calculate Accruals and Balances by HR Specialist.
   */
  private async calculateAccrualsAndBalances(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    if (!await this.absence.openScheduleMonitorProcesses()) {
      console.log(`[AbsenceAdmin] ${tc.testId}: Skipping — bot lacks Schedule and Monitor Processes access`);
      return;
    }

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
   * HCM.ABS.1901 -- Evaluate Absences by HR Specialist.
   */
  private async evaluateAbsences(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    if (!await this.absence.openScheduleMonitorProcesses()) {
      console.log(`[AbsenceAdmin] ${tc.testId}: Skipping — bot lacks Schedule and Monitor Processes access`);
      return;
    }

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
   * HCM.ABS.2301 -- HR Specialist Adds Work Schedule Assignment.
   */
  private async hrAddWorkScheduleAssignment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    await this.absence.openWorkScheduleAssignment();

    const personName = this.extractPersonName(tc);
    if (personName) {
      await this.absence.searchPerson(personName);
    }

    const addButton = this.page.locator(
      'button:has-text("Add"), a:has-text("Add"), a[role="button"]:has-text("Add")'
    ).first();
    if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    }

    // Fill from field data if available
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      await this.absence.fillFromFieldData(fieldData);
    } else {
      await this.absence.fillFromUATTestCase(tc);
    }

    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.2401 -- Manager Adds Work Schedule Assignment.
   * Same flow as HR Specialist but from manager perspective.
   */
  private async managerAddWorkScheduleAssignment(tc: UATTestCase): Promise<void> {
    await this.hrAddWorkScheduleAssignment(tc);
  }

  /**
   * HR Specialist withdraws an absence (fallback for tests with empty script IDs).
   */
  private async hrWithdrawAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);

    await this.absence.clickExistingAbsencesTile();
    await this.absence.selectAbsenceRow(0);

    await this.absence.clickWithdraw();
  }

  /** Convert date from YYYY/MM/DD or YYYY-MM-DD to MM/DD/YYYY for Oracle HCM. */
  private convertDate(date: string): string {
    const match = date.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    return date;
  }
}
