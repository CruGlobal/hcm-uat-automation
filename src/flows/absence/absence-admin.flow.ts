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
    const found = await this.absence.clickPlanName(planName);
    if (!found) {
      throw new Error(`${tc.testId}: No plan enrollments found — cannot review enrollments`);
    }

    // Close the popup
    await this.absence.clickOk();
  }

  /**
   * HCM.ABS.102 -- HR Specialist Adds a New Enrollment.
   */
  private async addEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();
    const enrolled = await this.absence.clickAddEnrollment().then(() => true).catch(() => false);
    if (!enrolled) {
      throw new Error(`${tc.testId}: Add Enrollment not accessible`);
    }

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
    const rowSelected = await this.absence.selectPlanRow(0);
    if (!rowSelected) {
      throw new Error(`${tc.testId}: No plan enrollments to update`);
    }
    const updated = await this.absence.clickUpdateEnrollment();
    if (!updated) {
      throw new Error(`${tc.testId}: Update Enrollment not accessible`);
    }

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
    const rowSelected = await this.absence.selectPlanRow(0);
    if (!rowSelected) {
      throw new Error(`${tc.testId}: No plan enrollments to delete`);
    }

    const deleted = await this.absence.clickDeleteEnrollment();
    if (!deleted) {
      throw new Error(`${tc.testId}: Delete Enrollment not accessible`);
    }
  }

  /**
   * HCM.ABS.203/304/403/603 -- HR Specialist Reviews Accrual Balance.
   */
  private async reviewAccrualBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToPlanParticipation();

    const planName = this.extractPlanNameFromFieldData(tc);
    const found = await this.absence.clickPlanName(planName);
    if (!found) {
      throw new Error(`${tc.testId}: No plan enrollments found for accrual balance review`);
    }

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
    const rowSelected = await this.absence.selectPlanRow(0);
    if (!rowSelected) {
      throw new Error(`${tc.testId}: No plan enrollments for balance adjustment`);
    }

    const adjusted = await this.absence.clickAdjustBalance();
    if (!adjusted) {
      throw new Error(`${tc.testId}: Adjust Balance not accessible`);
    }

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
      throw new Error(`${tc.testId}: Bot lacks Schedule and Monitor Processes access`);
    }

    const calcLink = this.page.getByText('Calculate Accruals and Balances', { exact: false }).first();
    if (await calcLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcLink.click();
      await this.page.waitForTimeout(5000);
      await this.absence.waitForJET();
    } else {
      throw new Error(`${tc.testId}: Calculate Accruals and Balances link not found`);
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
      throw new Error(`${tc.testId}: No submit button found on Calculate Accruals form`);
    }
  }

  /**
   * HCM.ABS.502 -- HR Specialist Disburses from Balance.
   * "Disburse Balance" is an admin-only operation — NOT available via ESS.
   * Navigate via Absence Administration → Absences and Entitlements (Redwood) →
   * search person → Plans tab → "..." menu → Disburse balance.
   */
  private async disburseBalance(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceAdmin(tc);

    // Open the "Absences and Entitlements" task link → Redwood worker search page
    await this.absence.openAbsencesAndEntitlements();

    // Search for the target person by person number
    const fieldData = getFieldData(tc.testId);
    const personNumber = fieldData ? getField(fieldData, 'Person Number') : null;
    const personName = this.extractPersonName(tc);
    const searchTerm = personNumber || personName;
    if (!searchTerm) {
      throw new Error(`${tc.testId}: No person number or name in field data — cannot perform disburse balance`);
    }

    const found = await this.absence.searchPersonRedwood(searchTerm);
    if (!found) {
      throw new Error(`${tc.testId}: Person "${searchTerm}" not found on Absences and Entitlements page`);
    }

    // Click the "Plans" tab on the person's detail page
    const plansTabClicked = await this.absence.clickPlansTab();
    if (!plansTabClicked) {
      // Fallback: try the ADF-style plan participation navigation
      await this.absence.navigateToPlanParticipation();
    }

    // Click "Disburse balance" from the plan row's "..." action menu
    const planName = this.extractPlanNameFromFieldData(tc);
    const result = await this.absence.clickPlanRowAction(planName, 'Disburse balance');

    if (result === 'disabled') {
      // Disburse is disabled for this plan — try other plans
      console.log(`[AbsenceAdmin] ${tc.testId}: Disburse disabled for "${planName}" — trying other plans`);
      const altResult = await this.absence.clickPlanRowAction(undefined, 'Disburse balance');
      if (altResult !== 'clicked') {
        throw new Error(`${tc.testId}: "Disburse balance" is disabled for all plans — plan configuration does not support disbursement`);
      }
    } else if (result === 'not-found') {
      throw new Error(`${tc.testId}: No plan rows found or "Disburse balance" option missing from actions menu`);
    }

    // If we got here with 'clicked', fill the disbursement dialog
    if (fieldData) {
      const amount = getField(fieldData, 'Disbursement Amount') || getField(fieldData, 'Amount');
      const date = getField(fieldData, 'Date') || getField(fieldData, 'Effective Date');
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
      throw new Error(`${tc.testId}: Bot lacks Schedule and Monitor Processes access`);
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
      throw new Error(`${tc.testId}: Bot lacks Schedule and Monitor Processes access`);
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

    // On Absence Administration, search for person FIRST (sets person context),
    // then click the "Work Schedule Assignment" task link.
    const personName = this.extractPersonName(tc);
    if (personName) {
      await this.absence.searchPerson(personName);
    }

    await this.absence.openWorkScheduleAssignment();

    // After clicking Work Schedule Assignment with person context, Oracle opens
    // the person's work schedule page. Look for Add/Create button.
    const addButton = this.page.locator(
      'button:has-text("Add"), a:has-text("Add"), a[role="button"]:has-text("Add"), ' +
      'button:has-text("Create"), a:has-text("Create"), a[role="button"]:has-text("Create")'
    ).first();
    if (await addButton.isVisible({ timeout: 8000 }).catch(() => false)) {
      await addButton.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
    } else {
      throw new Error(`${tc.testId}: Work Schedule Assignment page reached — no Add button found`);
    }

    // Try to fill work-schedule-specific fields (Work Schedule name)
    const fieldData = getFieldData(tc.testId);
    const workSchedule = fieldData ? getField(fieldData, 'Work Schedule') || getField(fieldData, 'Schedule') : undefined;
    if (workSchedule) {
      const scheduleField = this.page.locator(
        'input[aria-label*="Work Schedule"], input[aria-label*="Schedule"], ' +
        'select[aria-label*="Work Schedule"], select[aria-label*="Schedule"]'
      ).first();
      if (await scheduleField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.absence.fillField(scheduleField, workSchedule);
      }
    }

    // Try to fill Start Date if available in field data
    const startDate = fieldData ? getField(fieldData, 'Start Date') : undefined;
    if (startDate) {
      const dateField = this.page.locator(
        'input[aria-label*="Start Date"], input[aria-label*="From"]'
      ).first();
      if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.absence.fillField(dateField, this.convertDate(startDate));
      }
    }

    // Submit if a form is visible, otherwise navigation-only verification
    const submitBtn = this.page.locator(
      'button:has-text("Submit"), button:has-text("Save"), a[role="button"]:has-text("Submit"), a[role="button"]:has-text("Save")'
    ).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await this.page.waitForTimeout(3000);
      await this.absence.waitForJET();
      await this.absence.confirmDialog();
    } else {
      throw new Error(`${tc.testId}: Work Schedule Assignment — no submit button found`);
    }
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
