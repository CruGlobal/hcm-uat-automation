import { type Page } from '@playwright/test';
import { BaseTimeLaborFlow } from './base-time-labor.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Time Approval (Manager)
 * Module: Time and Labor
 *
 * Handles these test script categories:
 * - HCM.OTL.4xx: Edit Existing Timecard in Redwood UI (manager)
 * - HCM.OTL.5xx: Mass Action Using Existing Timecard (Redwood)
 * - HCM.OTL.7xx: Edit Timecard in Classic UI (manager)
 * - HCM.OTL.8xx: Mass Action of Timecard in Classic UI (manager)
 * - HCM.OTL.1402: Manager View Team Time Change Requests
 * - HCM.OTL.1501/1801: Manager Approves Via Bell
 * - HCM.OTL.1502: Manager Approves Time Change Requests from UI
 * - HCM.OTL.1802: Manager Approves Time Card from Redwood UI
 */
export class TimeApprovalFlow extends BaseTimeLaborFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const category = this.getScriptCategory(tc.testScript);
    const bp = tc.businessProcess.toLowerCase();

    switch (category) {
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

      case 'approve-via-bell':
        await this.approveViaBell(tc);
        break;

      case 'manager-approve-redwood':
        await this.managerApproveRedwood(tc);
        break;

      default:
        await this.executeByBusinessProcess(tc, bp);
        break;
    }
  }

  /**
   * HCM.OTL.401.00: Edit Existing Timecard in Redwood UI.
   * Steps:
   * 1. My Client Groups > Quick Actions > Show More > Team Time Cards in Redwood UI
   * 2. Search for employee and Time Card week (From/To Date)
   * 3. Select timecard checkbox > Action > Edit
   * 4. Update Time Type and/or hours, or add new row
   * 5. Click Submit from Actions
   */
  private async editTimecardRedwood(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamTimeCards();

    await this.timecardPage.editTimecardRedwood({
      personName: this.extractField(tc.testData, 'person'),
      fromDate: this.extractField(tc.testData, 'from'),
      toDate: this.extractField(tc.testData, 'to'),
      hoursType: this.extractField(tc.testData, 'hours type') ||
                 this.extractField(tc.testData, 'time type'),
      hours: this.extractField(tc.testData, 'hours'),
    });

    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.501.00: Mass Action Using Existing Timecard in Redwood UI.
   * Steps:
   * 1. My Client Groups > Quick Actions > Show More > Team Time Cards in Redwood UI
   * 2. Search for employees and date range
   * 3. Select timecards (checkbox or select all)
   * 4. Click Actions > Submit or Approve
   */
  private async massActionRedwood(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamTimeCards();

    const personName = this.extractField(tc.testData, 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }

    const fromDate = this.extractField(tc.testData, 'from');
    if (fromDate) await this.timecardPage.setFromDate(fromDate);
    const toDate = this.extractField(tc.testData, 'to');
    if (toDate) await this.timecardPage.setToDate(toDate);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    const action = bp.includes('approve') ? 'Approve' : 'Submit';
    await this.timecardPage.massApproveTimecards(action);
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.701.00: Edit Timecard in Classic UI.
   * Steps:
   * 1. My Client Groups > Time Management > Team Time Cards
   * 2. Search by person name/number and date range
   * 3. Click Search
   * 4. Click on the date range hyperlink to open timecard
   * 5. Update Time Type and/or hours
   * 6. Save and Close or Submit
   */
  private async editTimecardClassic(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    await this.timecardPage.editTimecardClassic({
      personName: this.extractField(tc.testData, 'person'),
      fromDate: this.extractField(tc.testData, 'from'),
      toDate: this.extractField(tc.testData, 'to'),
      timeType: this.extractField(tc.testData, 'time type'),
      hours: this.extractField(tc.testData, 'hours'),
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
   * HCM.OTL.801.00: Mass Action of Timecard in Classic UI.
   * Steps:
   * 1. My Client Groups > Time Management > Team Time Cards
   * 2. Search by person/date range
   * 3. Select rows (select all via top-left checkbox)
   * 4. Click Submit or Approve
   */
  private async massActionClassic(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();
    await this.timecardPage.clickTeamTimeCards();

    const personName = this.extractField(tc.testData, 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    const fromDate = this.extractField(tc.testData, 'from');
    if (fromDate) await this.timecardPage.setFromDate(fromDate);
    const toDate = this.extractField(tc.testData, 'to');
    if (toDate) await this.timecardPage.setToDate(toDate);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    const action = bp.includes('approve') ? 'Approve' : 'Submit';
    await this.timecardPage.massApproveTimecards(action);
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1501.00 / HCM.OTL.1801.00: Manager Approves Via Bell.
   * Steps:
   * 1. Click notifications icon (bell) at top-right
   * 2. Click on the notification to view details
   * 3. Take approval action (Approve/Reject)
   * 4. Return to home page
   */
  private async approveViaBell(_tc: UATTestCase): Promise<void> {
    await this.timecardPage.approveViaBell();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1802.00: Manager Approves Time Card from Redwood UI.
   * Steps:
   * 1. My Team > Quick Actions > Show More > Team Time Cards
   * 2. Filter by status = Submitted
   * 3. Select timecards > Actions > Approve
   */
  private async managerApproveRedwood(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamTimeCards();

    await this.timecardPage.setStatusFilter('Submitted');

    const personName = this.extractField(tc.testData, 'person');
    if (personName) await this.timecardPage.searchPerson(personName);

    await this.timecardPage.clickSearch();

    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('reject')) {
      const reason = this.extractField(tc.testData, 'reason');
      await this.timecardPage.rejectTimecard(undefined, reason);
    } else {
      await this.timecardPage.approveTimecard();
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * Fallback: determine action from business process text.
   */
  private async executeByBusinessProcess(tc: UATTestCase, bp: string): Promise<void> {
    if (bp.includes('reject')) {
      await this.navigateToTeamTimeCards();
      const reason = this.extractField(tc.testData, 'reason');
      const personName = this.extractField(tc.testData, 'person');
      await this.timecardPage.rejectTimecard(personName, reason);
    } else if (bp.includes('request') && bp.includes('info')) {
      await this.navigateToTeamTimeCards();
      await this.timecardPage.requestMoreInfo();
    } else if (bp.includes('bell') || bp.includes('notification')) {
      await this.timecardPage.approveViaBell();
    } else if (bp.includes('mass')) {
      await this.navigateToTeamTimeCards();
      const action = bp.includes('approve') ? 'Approve' : 'Submit';
      await this.timecardPage.massApproveTimecards(action);
    } else if (bp.includes('change request') || bp.includes('team change')) {
      await this.navigateToTeamChangeRequests();
      const pendingLink = this.page.getByText(/Pending Approval/i).first();
      const hasPending = await pendingLink.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasPending) {
        await pendingLink.click();
        await this.page.waitForTimeout(3000);
      }
      await this.timecardPage.approveTimecard();
    } else {
      await this.navigateToTeamTimeCards();
      const personName = this.extractField(tc.testData, 'person');
      await this.timecardPage.approveTimecard(personName);
    }

    await this.timecardPage.expectSuccess();
  }

  /** Extract a field value from testData string using partial key match. */
  private extractField(testData: string, key: string): string | undefined {
    if (!testData) return undefined;
    const regex = new RegExp(`${key}[:\\s]+([^\\n,;]+)`, 'i');
    const match = testData.match(regex);
    return match ? match[1].trim() : undefined;
  }
}
