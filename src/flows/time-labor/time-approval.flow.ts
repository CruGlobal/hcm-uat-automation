import { type Page } from '@playwright/test';
import { BaseTimeLaborFlow } from './base-time-labor.flow';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow: Time Approval (Manager Self-Service)
 * Module: Time and Labor
 *
 * Handles Manager Self-Service operations:
 * - Time Approval: approve/reject submitted timecards via bell or Team Time Cards
 * - Manager Timecard Entry: create timecards for team members
 * - Manager Absence on Timecard: absence entries on behalf of team
 * - Timecard Amendments: return timecards for correction
 * - Manager Update: update existing team timecards
 *
 * Routing uses getFlowAction() which combines script number + business process + category.
 */
export class TimeApprovalFlow extends BaseTimeLaborFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const action = this.getFlowAction(tc);
    console.log(`[TimeApproval] ${tc.testId} action="${action}" bp="${tc.businessProcess}" script="${tc.testScript}"`);

    switch (action) {
      case 'approve-via-bell':
        await this.approveViaBell(tc);
        break;

      case 'manager-approve-redwood':
        await this.managerApproveRedwood(tc);
        break;

      case 'manager-create':
        await this.managerCreateTimecard(tc);
        break;

      case 'manager-update':
        await this.managerUpdateTimecard(tc);
        break;

      case 'manager-absence-on-timecard':
        await this.managerAbsenceOnTimecard(tc);
        break;

      case 'timecard-amendments':
        await this.timecardAmendments(tc);
        break;

      case 'time-change-request':
        await this.viewTeamTimeChangeRequests(tc);
        break;

      case 'edit-redwood':
        await this.editTimecardRedwood(tc);
        break;

      case 'mass-action-redwood':
        await this.massActionRedwood(tc);
        break;

      case 'edit-classic':
        await this.editTimecardClassic(tc);
        break;

      case 'mass-action-classic':
        await this.massActionClassic(tc);
        break;

      default:
        // Fallback: determine from business process text
        await this.executeByBusinessProcess(tc);
        break;
    }
  }

  /**
   * Manager approves via the notification bell.
   * Steps: Click bell > Open time notification > Approve
   */
  private async approveViaBell(tc: UATTestCase): Promise<void> {
    await this.timecardPage.approveViaBell();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Manager approves from Redwood Team Time Cards UI.
   * Steps: Team Time Cards > Filter submitted > Select > Approve
   */
  private async managerApproveRedwood(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — manager approval cannot proceed (likely Manager Self-Service path needed)`);
    }

    await this.timecardPage.setStatusFilter('Submitted');

    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('reject')) {
      const reason = this.extractFieldWithFallback(fd, tc.testData, 'Reason', 'reason');
      await this.timecardPage.rejectTimecard(undefined, reason);
    } else {
      await this.timecardPage.approveTimecard();
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * Manager creates a timecard for a team member.
   * Steps: Team Time Cards > Create > Search person > Fill > Submit
   */
  private async managerCreateTimecard(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — manager cannot create timecard for team member (bot likely lacks Manager Self-Service access)`);
    }

    // Click create button
    await this.timecardPage.clickCreateTimecard();

    // Search and select employee
    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }

    // Fill timecard data
    await this.timecardPage.fillFromTestCase(tc, fd);

    // Submit
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Manager updates an existing team timecard.
   * Steps: Team Time Cards > Search > Edit > Update > Submit
   * Falls back to ESS "Existing Time Cards" when Team Time Cards isn't available.
   */
  private async managerUpdateTimecard(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — manager cannot update team timecard (bot likely lacks Manager Self-Service access)`);
    }

    const fd = this.getTestFieldData(tc.testId);
    await this.timecardPage.editTimecardRedwood({
      personName: this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person'),
      fromDate: this.extractFieldWithFallback(fd, tc.testData, 'From Date', 'from'),
      toDate: this.extractFieldWithFallback(fd, tc.testData, 'To Date', 'to'),
      hoursType: this.extractFieldWithFallback(fd, tc.testData, 'Hours Type', 'hours type'),
      hours: this.extractFieldWithFallback(fd, tc.testData, 'Hours', 'hours'),
    });

    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Manager enters absence on timecard for a team member.
   * Steps: Team Time Cards > Create > Fill absence hours > Submit
   */
  private async managerAbsenceOnTimecard(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — manager cannot enter absence on team timecard (bot likely lacks Manager Self-Service access)`);
    }

    await this.timecardPage.clickCreateTimecard();

    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    await this.timecardPage.fillFromTestCase(tc, fd);
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Timecard amendments: return a submitted timecard for correction and resubmission.
   * Steps: Team Time Cards > Search submitted > Select > Return for Correction
   */
  private async timecardAmendments(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — timecard amendments cannot proceed`);
    }

    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    await this.timecardPage.clickSearch();
    await this.timecardPage.selectFirstTimecardRow();

    // Try "Return for Correction" or "Request More Info"
    const returnBtn = this.page.getByRole('button', { name: /Return for Correction/i })
      .or(this.page.locator('a:has-text("Return for Correction")'))
      .first();
    const hasReturn = await returnBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasReturn) {
      await returnBtn.click();
    } else {
      await this.timecardPage.requestMoreInfo();
    }

    await this.page.waitForTimeout(5000);
    await this.timecardPage.waitForJET();
    await this.timecardPage.handleConfirmationDialog();
    await this.timecardPage.expectSuccess();
  }

  /**
   * View team time change requests.
   * Steps: My Team > Quick Actions > Team Change Requests > View pending
   */
  private async viewTeamTimeChangeRequests(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamChangeRequests();
    const pendingLink = this.page.getByText(/Pending Approval/i).first();
    const hasPending = await pendingLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPending) {
      throw new Error(`${tc.testId}: No pending time change requests found — cannot validate approval flow`);
    }
    await pendingLink.click();
    await this.page.waitForTimeout(3000);
    await this.timecardPage.approveTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Edit Existing Timecard in Redwood UI (manager).
   */
  private async editTimecardRedwood(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — cannot edit team timecard in Redwood UI`);
    }

    const fd = this.getTestFieldData(tc.testId);
    await this.timecardPage.editTimecardRedwood({
      personName: this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person'),
      fromDate: this.extractFieldWithFallback(fd, tc.testData, 'From Date', 'from'),
      toDate: this.extractFieldWithFallback(fd, tc.testData, 'To Date', 'to'),
      hoursType: this.extractFieldWithFallback(fd, tc.testData, 'Hours Type', 'hours type') ||
                 this.extractFieldWithFallback(fd, tc.testData, 'Time Type', 'time type'),
      hours: this.extractFieldWithFallback(fd, tc.testData, 'Hours', 'hours'),
    });

    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Mass Action Using Existing Timecard in Redwood UI.
   */
  private async massActionRedwood(tc: UATTestCase): Promise<void> {
    const hasTeamTC = await this.navigateToTeamTimeCards();
    if (!hasTeamTC) {
      throw new Error(`${tc.testId}: Team Time Cards not available — cannot perform mass action in Redwood UI`);
    }

    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    const fromDate = this.extractFieldWithFallback(fd, tc.testData, 'From Date', 'from');
    if (fromDate) await this.timecardPage.setFromDate(fromDate);
    const toDate = this.extractFieldWithFallback(fd, tc.testData, 'To Date', 'to');
    if (toDate) await this.timecardPage.setToDate(toDate);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    const action = bp.includes('approve') ? 'Approve' : 'Submit';
    await this.timecardPage.massApproveTimecards(action);
    await this.timecardPage.expectSuccess();
  }

  /**
   * Edit Timecard in Classic UI (manager).
   */
  private async editTimecardClassic(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    const fd = this.getTestFieldData(tc.testId);
    await this.timecardPage.editTimecardClassic({
      personName: this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person'),
      fromDate: this.extractFieldWithFallback(fd, tc.testData, 'From Date', 'from'),
      toDate: this.extractFieldWithFallback(fd, tc.testData, 'To Date', 'to'),
      timeType: this.extractFieldWithFallback(fd, tc.testData, 'Time Type', 'time type'),
      hours: this.extractFieldWithFallback(fd, tc.testData, 'Hours', 'hours'),
    });

    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('submit')) {
      await this.timecardPage.submitTimecard();
    } else {
      await this.timecardPage.clickSaveAndClose();
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * Mass Action of Timecard in Classic UI (manager).
   */
  private async massActionClassic(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();
    await this.timecardPage.clickTeamTimeCards();

    const fd = this.getTestFieldData(tc.testId);
    const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    const fromDate = this.extractFieldWithFallback(fd, tc.testData, 'From Date', 'from');
    if (fromDate) await this.timecardPage.setFromDate(fromDate);
    const toDate = this.extractFieldWithFallback(fd, tc.testData, 'To Date', 'to');
    if (toDate) await this.timecardPage.setToDate(toDate);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    const action = bp.includes('approve') ? 'Approve' : 'Submit';
    await this.timecardPage.massApproveTimecards(action);
    await this.timecardPage.expectSuccess();
  }

  /**
   * Fallback: determine action from business process text and transaction category.
   */
  private async executeByBusinessProcess(tc: UATTestCase): Promise<void> {
    const fd = this.getTestFieldData(tc.testId);
    const bp = tc.businessProcess.toLowerCase();
    const cat = (tc.transactionCategory || '').toLowerCase();

    console.log(`[TimeApproval] Fallback routing: bp="${bp}" cat="${cat}"`);

    // Helper: navigate and require the Team Time Cards page for any manager
    // mutation. Without it, every downstream action is a navigation-only no-op.
    const requireTeamTimeCards = async (op: string): Promise<void> => {
      const ok = await this.navigateToTeamTimeCards();
      if (!ok) {
        throw new Error(`${tc.testId}: Team Time Cards not available — ${op} cannot proceed`);
      }
    };

    if (bp.includes('reject')) {
      await requireTeamTimeCards('reject timecard');
      const reason = this.extractFieldWithFallback(fd, tc.testData, 'Reason', 'reason');
      const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
      await this.timecardPage.rejectTimecard(personName, reason);
    } else if (bp.includes('request') && bp.includes('info')) {
      await requireTeamTimeCards('request more info');
      await this.timecardPage.requestMoreInfo();
    } else if (bp.includes('bell') || bp.includes('notification')) {
      await this.timecardPage.approveViaBell();
    } else if (bp.includes('mass')) {
      await requireTeamTimeCards('mass action');
      const action = bp.includes('approve') ? 'Approve' : 'Submit';
      await this.timecardPage.massApproveTimecards(action);
    } else if (bp.includes('change request') || bp.includes('team change')) {
      await this.navigateToTeamChangeRequests();
      const pendingLink = this.page.getByText(/Pending Approval/i).first();
      const hasPending = await pendingLink.isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasPending) {
        throw new Error(`${tc.testId}: No pending change requests found — cannot validate approval flow`);
      }
      await pendingLink.click();
      await this.page.waitForTimeout(3000);
      await this.timecardPage.approveTimecard();
    } else if (bp.includes('approv') || bp.includes('approval')) {
      // Default approval via Team Time Cards
      await requireTeamTimeCards('approve timecard');
      const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
      await this.timecardPage.approveTimecard(personName);
    } else if (bp.includes('entry') || bp.includes('create') || bp.includes('add')) {
      // Manager creating timecard for team member
      await requireTeamTimeCards('manager timecard create');
      await this.timecardPage.clickCreateTimecard();
      const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
      if (personName) await this.timecardPage.searchPerson(personName);
      await this.timecardPage.fillFromTestCase(tc, fd);
      await this.timecardPage.submitTimecard();
    } else if (bp.includes('absence on timecard') || bp.includes('absence')) {
      await requireTeamTimeCards('manager absence on timecard');
      await this.timecardPage.clickCreateTimecard();
      const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
      if (personName) await this.timecardPage.searchPerson(personName);
      await this.timecardPage.fillFromTestCase(tc, fd);
      await this.timecardPage.submitTimecard();
    } else {
      // Default: navigate to Team Time Cards and approve
      await requireTeamTimeCards('approve timecard (default)');
      const personName = this.extractFieldWithFallback(fd, tc.testData, 'Person Name', 'person');
      await this.timecardPage.approveTimecard(personName);
    }

    await this.timecardPage.expectSuccess();
  }
}
