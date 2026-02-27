import { type Page } from '@playwright/test';
import { BaseAbsenceFlow } from './base-absence.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Absence Approval and Withdrawal
 *
 * Handles manager approval/rejection and absence withdrawal actions.
 *
 * Routing by test script ID patterns:
 * - HCM.ABS.1301.xx — Employee Withdraws an Absence
 * - HCM.ABS.1401.xx — Manager Approves an Employee Absence
 * - HCM.ABS.1601.xx — Manager Withdraws an Absence for an Employee
 * - HCM.ABS.2501.xx — Manager views team work schedules and absences
 * - HCM.ABS.2601.xx — Manager views an Absence for an Employee
 * - HCM.ABS.2701.xx — Manager Edits an Absence for an Employee
 * - HCM.ABS.2901.xx — HR Specialist Withdraws an Employee Absence
 */
export class AbsenceApprovalFlow extends BaseAbsenceFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    const scriptId = (tc.testScript || '').toUpperCase();
    const process = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();
    const category = (tc.transactionCategory || '').toLowerCase();

    if (scriptId.includes('1401') || (category.includes('manager') && process.includes('approv'))) {
      await this.managerApprovesAbsence(tc);
    } else if (scriptId.includes('1301') || (category.includes('employee') && process.includes('withdraw'))) {
      await this.employeeWithdrawsAbsence(tc);
    } else if (scriptId.includes('1601') || (category.includes('manager') && process.includes('withdraw'))) {
      await this.managerWithdrawsAbsence(tc);
    } else if (scriptId.includes('2901') || (category.includes('hr') && process.includes('withdraw'))) {
      await this.hrSpecialistWithdrawsAbsence(tc);
    } else if (scriptId.includes('2501') || process.includes('team') && process.includes('schedule')) {
      await this.managerViewsTeamSchedule(tc);
    } else if (scriptId.includes('2601') || (category.includes('manager') && process.includes('view'))) {
      await this.managerViewsAbsence(tc);
    } else if (scriptId.includes('2701') || (category.includes('manager') && process.includes('edit'))) {
      await this.managerEditsAbsence(tc);
    } else if (process.includes('reject') || process.includes('deny')) {
      await this.managerRejectsAbsence(tc);
    } else {
      // Default: manager approves
      await this.managerApprovesAbsence(tc);
    }

    await this.absence.screenshot(`absence-approval-${tc.testId}`);
  }

  /**
   * HCM.ABS.1401.xx — Manager Approves an Employee Absence.
   * Steps: Login -> Notifications -> Open absence notification ->
   *        Add approval comments -> Approve
   */
  private async managerApprovesAbsence(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    // Open notifications and find the absence approval request
    await this.absence.openAbsenceNotification();

    // Add approval comments and approve
    await this.absence.fillApprovalComments(`Approved per test case ${tc.testId}`);
    await this.absence.clickApprove();
    await this.absence.confirmDialog();
  }

  /** Reject an absence (inverse of approve, same navigation). */
  private async managerRejectsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    await this.absence.openAbsenceNotification();

    await this.absence.fillApprovalComments(`Rejected per test case ${tc.testId}`);
    await this.absence.clickReject();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1301.xx — Employee Withdraws an Absence.
   * Steps: Login -> Me -> Time and Absences -> Existing Absences ->
   *        Select absence -> Withdraw -> Confirm
   */
  private async employeeWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();

    // Open existing absences
    await this.absence.clickExistingAbsencesTile();

    // Select the absence to withdraw
    await this.absence.selectAbsenceRow(0);

    // Withdraw
    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.1601.xx — Manager Withdraws an Absence for an Employee.
   * Steps: Login -> Navigate to employee absences -> Select absence ->
   *        Withdraw -> Confirm
   */
  private async managerWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to existing absences
    await this.absence.navigateToExistingAbsences();
    await this.absence.selectAbsenceRow(0);

    // Withdraw
    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.2901.xx — HR Specialist Withdraws an Employee Absence.
   * Steps: Login -> Absence Admin -> Absence Records -> Search person ->
   *        Select absence -> Withdraw -> Confirm
   */
  private async hrSpecialistWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToExistingAbsences();
    await this.absence.selectAbsenceRow(0);

    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.2501.xx — Manager can view their team's work schedules and absences.
   * Steps: Login -> Me -> Time and Absences -> Team Schedule tile
   */
  private async managerViewsTeamSchedule(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();

    // Click the Team Schedule tile (ESS tile index 3)
    const teamScheduleTile = this.page.locator(
      `[id*="i2:3:tb1:TBcl1"]`
    ).first();
    if (await teamScheduleTile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await teamScheduleTile.click({ force: true });
    } else {
      await this.page.getByText('Team Schedule', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.absence.waitForJET();
  }

  /**
   * HCM.ABS.2601.xx — Manager can view an Absence for an Employee.
   * Steps: Login -> Navigate to employee -> View existing absences
   */
  private async managerViewsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToExistingAbsences();
    await this.absence.selectAbsenceRow(0);
  }

  /**
   * HCM.ABS.2701.xx — Manager can Edit an Absence for an Employee.
   * Steps: Login -> Navigate to employee -> Select absence -> Edit ->
   *        Update fields -> Submit
   */
  private async managerEditsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    await this.absence.navigateToExistingAbsences();
    await this.absence.selectAbsenceRow(0);

    // Edit the absence
    await this.absence.clickEdit();
    await this.absence.fillFromUATTestCase(tc);
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }
}
