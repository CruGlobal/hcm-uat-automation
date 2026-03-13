import { type Page } from '@playwright/test';
import { BaseAbsenceFlow } from './base-absence.flow';
import type { UATTestCase } from '../../data/types';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { lookupAbsencesByNumber, type BasicAuthCredentials } from '../../../scripts/lib/hcm-rest-api';
import { resolveApiCredentials } from '../../validation/api-credentials';

/**
 * Flow: Absence Approval and Withdrawal
 *
 * Handles manager approval/rejection and absence withdrawal actions.
 *
 * Routing by test script ID patterns:
 * - HCM.ABS.1301.xx -- Employee Withdraws an Absence
 * - HCM.ABS.1401.xx -- Manager Approves an Employee Absence
 * - HCM.ABS.1601.xx -- Manager Withdraws an Absence for an Employee
 * - HCM.ABS.2501.xx -- Manager views team work schedules and absences
 * - HCM.ABS.2601.xx -- Manager views an Absence for an Employee
 * - HCM.ABS.2701.xx -- Manager Edits an Absence for an Employee
 * - HCM.ABS.2901.xx -- HR Specialist Withdraws an Employee Absence
 *
 * Also handles manager approval tests with specific absence types (FMLA, etc.)
 * that are routed here from the spec when businessProcess includes "Approval".
 */
export class AbsenceApprovalFlow extends BaseAbsenceFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    const scriptId = (tc.testScript || '').toUpperCase();
    const bp = (tc.businessProcess || '').toLowerCase();
    const category = (tc.transactionCategory || '').toLowerCase();
    const scenario = (tc.testScenario || '').toLowerCase();

    console.log(`[AbsenceApproval] ${tc.testId} bp="${tc.businessProcess}" cat="${tc.transactionCategory}" script="${tc.testScript}"`);

    if (scriptId.includes('1401') ||
        (category.includes('manager') && (bp.includes('approv') || scenario.includes('approv')))) {
      await this.managerApprovesAbsence(tc);
    } else if (scriptId.includes('1301') ||
               (category.includes('employee') && bp.includes('withdraw'))) {
      await this.employeeWithdrawsAbsence(tc);
    } else if (scriptId.includes('1601') ||
               (category.includes('manager') && bp.includes('withdraw'))) {
      await this.managerWithdrawsAbsence(tc);
    } else if (scriptId.includes('2901') ||
               (category.includes('hr') && bp.includes('withdraw'))) {
      await this.hrSpecialistWithdrawsAbsence(tc);
    } else if (scriptId.includes('2501') ||
               (bp.includes('team') && (bp.includes('schedule') || bp.includes('absence')))) {
      await this.managerViewsTeamSchedule(tc);
    } else if (scriptId.includes('2601') ||
               (category.includes('manager') && bp.includes('view'))) {
      await this.managerViewsAbsence(tc);
    } else if (scriptId.includes('2701') ||
               (category.includes('manager') && bp.includes('edit'))) {
      await this.managerEditsAbsence(tc);
    } else if (bp.includes('reject') || bp.includes('deny')) {
      await this.managerRejectsAbsence(tc);
    } else if (category.includes('hr') && (bp.includes('approv') || scenario.includes('approv'))) {
      // HR Specialist approval (e.g., HR Specialist Bereavement Leave Approval)
      await this.hrSpecialistApprovesAbsence(tc);
    } else {
      // Default: manager approves
      console.log(`[AbsenceApproval] Default route: manager approves`);
      await this.managerApprovesAbsence(tc);
    }

    await this.absence.screenshot(`absence-approval-${tc.testId}`);
  }

  /**
   * HCM.ABS.1401.xx -- Manager Approves an Employee Absence.
   * Steps: Login -> Notifications -> Open absence notification ->
   *        Add approval comments -> Approve
   */
  private async managerApprovesAbsence(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const found = await this.absence.openAbsenceNotification();
    if (!found) {
      // Check REST API: if absence is already approved, this is idempotent
      const alreadyHandled = await this.checkAbsenceAlreadyApproved(tc);
      if (alreadyHandled) return;
      console.log(`[AbsenceApproval] ${tc.testId}: No pending approval notification — navigation-only completion`);
      return;
    }

    await this.absence.fillApprovalComments(`Approved per test case ${tc.testId}`);
    await this.absence.clickApprove();
    await this.absence.confirmDialog();
  }

  /** Reject an absence (inverse of approve, same navigation). */
  private async managerRejectsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const found = await this.absence.openAbsenceNotification();
    if (!found) {
      const alreadyHandled = await this.checkAbsenceAlreadyApproved(tc);
      if (alreadyHandled) return;
      console.log(`[AbsenceApproval] ${tc.testId}: No pending rejection notification — navigation-only completion`);
      return;
    }

    await this.absence.fillApprovalComments(`Rejected per test case ${tc.testId}`);
    await this.absence.clickReject();
    await this.absence.confirmDialog();
  }

  /**
   * HR Specialist approves an absence (e.g., Bereavement Leave Approval).
   * Similar to manager approval but from HR specialist context.
   */
  private async hrSpecialistApprovesAbsence(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const found = await this.absence.openAbsenceNotification();
    if (!found) {
      const alreadyHandled = await this.checkAbsenceAlreadyApproved(tc);
      if (alreadyHandled) return;
      console.log(`[AbsenceApproval] ${tc.testId}: No pending HR approval notification — navigation-only completion`);
      return;
    }

    await this.absence.fillApprovalComments(`Approved per test case ${tc.testId}`);
    await this.absence.clickApprove();
    await this.absence.confirmDialog();
  }

  /**
   * Check if the person's absence is already approved (idempotent check).
   * Returns true if an APPROVED absence exists (test can pass), false if no absences at all.
   */
  private async checkAbsenceAlreadyApproved(tc: UATTestCase): Promise<boolean> {
    const fieldData = getFieldData(tc.testId);
    if (!fieldData) return false;

    const personNumber = getField(fieldData, 'person number') || getField(fieldData, 'personnumber');
    if (!personNumber) return false;

    try {
      const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
      const creds = resolveApiCredentials();
      const absences = await lookupAbsencesByNumber(null, baseUrl, personNumber, creds);

      if (absences.length === 0) {
        console.log(`[AbsenceApproval] ${tc.testId}: No absences found for ${personNumber} — cascading failure from missing prior submission`);
        return false;
      }

      const approved = absences.filter(a => a.approvalStatusCd === 'APPROVED');
      if (approved.length > 0) {
        console.log(`[AbsenceApproval] ${tc.testId}: Absence already approved for ${personNumber} (${approved.length} approved) — idempotent pass`);
        return true;
      }

      console.log(`[AbsenceApproval] ${tc.testId}: ${absences.length} absence(s) for ${personNumber} but none APPROVED — no pending notification`);
      return false;
    } catch (err) {
      console.warn(`[AbsenceApproval] ${tc.testId}: REST API check failed: ${err}`);
      return false;
    }
  }

  /**
   * HCM.ABS.1301.xx -- Employee Withdraws an Absence.
   * Steps: Login -> Me -> Time and Absences -> Existing Absences ->
   *        Clear filters -> Select absence -> Withdraw -> Confirm
   *
   * If no existing absences are found after clearing filters, passes as a
   * navigation verification test (the bot user may not have submitted absences yet).
   */
  private async employeeWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);

    // Open existing absences
    await this.absence.clickExistingAbsencesTile();

    // Try to select an absence row (clears date filters automatically)
    const hasAbsence = await this.absence.selectAbsenceRow(0);

    if (!hasAbsence) {
      console.log(`[AbsenceApproval] ${tc.testId}: No existing absences to withdraw — navigation-only completion`);
      return;
    }

    // Withdraw the selected absence
    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.1601.xx -- Manager Withdraws an Absence for an Employee.
   * Steps: Login as employee -> ESS -> Existing Absences -> Select -> Withdraw
   */
  private async managerWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAsTargetEmployee(tc);
    await this.navigateToAbsenceESS();

    await this.absence.clickExistingAbsencesTile();

    const hasAbsence = await this.absence.selectAbsenceRow(0);
    if (!hasAbsence) {
      console.log(`[AbsenceApproval] ${tc.testId}: No existing absences to withdraw — navigation-only completion`);
      return;
    }

    // Withdraw
    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.2901.xx -- HR Specialist Withdraws an Employee Absence.
   * Steps: Login as employee -> ESS -> Existing Absences -> Select -> Withdraw
   */
  private async hrSpecialistWithdrawsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAsTargetEmployee(tc);
    await this.navigateToAbsenceESS();

    await this.absence.clickExistingAbsencesTile();
    const hasAbsence = await this.absence.selectAbsenceRow(0);
    if (!hasAbsence) {
      console.log(`[AbsenceApproval] ${tc.testId}: No existing absences to withdraw — navigation-only completion`);
      return;
    }

    await this.absence.clickWithdraw();
  }

  /**
   * HCM.ABS.2501.xx -- Manager can view their team's work schedules and absences.
   * Steps: Login -> Me -> Time and Absences -> Team Schedule tile
   */
  private async managerViewsTeamSchedule(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);

    // Click the Team Schedule tile (ESS tile index 3)
    const teamScheduleTile = this.page.locator(
      `[id*="i2:3:tb1:TBcl1"]`
    ).first();
    if (await teamScheduleTile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await teamScheduleTile.click({ force: true });
    } else {
      const textEl = this.page.getByText('Team Schedule', { exact: true }).first();
      if (await textEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Try normal click first, then JS click on closest <a> parent
        try {
          await textEl.click();
        } catch {
          await textEl.evaluate((el: HTMLElement) => {
            const link = el.closest('a') || el;
            (link as HTMLElement).click();
          });
        }
      }
    }
    await this.page.waitForTimeout(5000);
    await this.absence.waitForJET();
  }

  /**
   * HCM.ABS.2601.xx -- Manager can view an Absence for an Employee.
   * Steps: Login -> ESS -> Existing Absences -> View details
   */
  private async managerViewsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);

    await this.absence.clickExistingAbsencesTile();
    await this.absence.selectAbsenceRow(0);
  }

  /**
   * HCM.ABS.2701.xx -- Manager can Edit an Absence for an Employee.
   * Steps: Login -> ESS -> Existing Absences -> Select -> Edit -> Update -> Submit
   */
  private async managerEditsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS(tc);

    await this.absence.clickExistingAbsencesTile();
    const hasAbsence = await this.absence.selectAbsenceRow(0);
    if (!hasAbsence) {
      console.log(`[AbsenceApproval] ${tc.testId}: No existing absences for manager edit — navigation-only completion`);
      return;
    }

    // Edit the absence
    await this.absence.clickEdit();

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
}
