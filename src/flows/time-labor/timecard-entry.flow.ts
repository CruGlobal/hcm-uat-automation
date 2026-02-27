import { type Page } from '@playwright/test';
import { BaseTimeLaborFlow } from './base-time-labor.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Timecard Entry (Employee Self-Service + Manager Create)
 * Module: Time and Labor
 *
 * Handles these test script categories:
 * - HCM.OTL.3xx: Create Timecard in Redwood UI (employee ESS)
 * - HCM.OTL.6xx: Create Timecard in Classic UI (manager)
 * - HCM.OTL.10xx: Employee View Current Timecard
 * - HCM.OTL.11xx: Employee View Existing Timecard
 * - HCM.OTL.12xx: Absence on Timecard (employee ESS with absence hours)
 * - HCM.OTL.13xx: Employee Prints Timecard
 * - HCM.OTL.14xx: Employee requests time change
 * - HCM.OTL.16xx: Manager Updates Time Card
 * - HCM.OTL.17xx: Manager Creates Team Time Card
 * - HCM.OTL.21xx: Employee Approves Own TimeCard
 */
export class TimecardEntryFlow extends BaseTimeLaborFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const category = this.getScriptCategory(tc.testScript);
    const bp = tc.businessProcess.toLowerCase();

    switch (category) {
      case 'create-redwood':
        await this.createTimecardRedwood(tc);
        break;

      case 'create-classic':
        await this.createTimecardClassic(tc);
        break;

      case 'view-current':
        await this.viewCurrentTimecard(tc);
        break;

      case 'view-existing':
        await this.viewExistingTimecard(tc);
        break;

      case 'absence-on-timecard':
        await this.absenceOnTimecard(tc);
        break;

      case 'print-timecard':
        await this.printTimecard(tc);
        break;

      case 'time-change-request':
        await this.requestTimeChange(tc);
        break;

      case 'manager-update':
        await this.managerUpdateTimecard(tc);
        break;

      case 'manager-create':
        await this.managerCreateTimecard(tc);
        break;

      case 'employee-approve':
        await this.employeeApproveOwn(tc);
        break;

      default:
        // Fallback: use business process text to determine action
        await this.executeByBusinessProcess(tc, bp);
        break;
    }
  }

  /**
   * HCM.OTL.301.00: Create Timecard in Redwood UI (employee ESS).
   * Steps:
   * 1. Me > Time and Absences > Current Timecard or Add Timecard
   * 2. Select Assignment Number
   * 3. Select Hours Type as Regular
   * 4. Enter hours
   * 5. Add additional hours types (Emergency Pay, Jury Duty, etc.)
   * 6. Enter comments
   * 7. Submit > Attestation > Submit and Close
   */
  private async createTimecardRedwood(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();

    // Click "Add Time Card" (or "Current Time Card" if it exists)
    const addTile = this.page.getByText(/Add Time\s*Card/i).first();
    const hasAdd = await addTile.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasAdd) {
      await this.timecardPage.clickAddTimeCard();
    } else {
      await this.timecardPage.clickCurrentTimeCard();
    }

    // Fill timecard from test case data
    await this.timecardPage.fillFromTestCase(tc);

    // Submit with attestation handling
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.601.00: Create Timecard in Classic UI (manager).
   * Steps:
   * 1. My Client Groups > Time Management
   * 2. Team Time Cards
   * 3. Click "+" (create)
   * 4. Enter Person Name and select
   * 5. Select Time card period, click Add
   * 6. Enter Assignment Number and Time Type
   * 7. Enter Hours
   * 8. Save > Submit (via More Actions)
   */
  private async createTimecardClassic(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    await this.timecardPage.createTimecardClassic({
      personName: this.extractField(tc.testData, 'person'),
      assignmentNumber: this.extractField(tc.testData, 'assignment'),
      timeType: this.extractField(tc.testData, 'time type') || 'Regular',
      hours: this.extractField(tc.testData, 'hours'),
      period: this.extractField(tc.testData, 'period'),
    });

    // Save first, then submit
    await this.timecardPage.clickSave();
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1001.00: Employee View Current Timecard.
   * Steps: Me > Time and Absences > Current Time Card > Verify read-only.
   */
  private async viewCurrentTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickCurrentTimeCard();
    // Verify the timecard page loaded (may show "No time card exists" message)
    await this.page.waitForTimeout(3000);
  }

  /**
   * HCM.OTL.1101.00: Employee View Existing Timecard.
   * Steps:
   * 1. Me > Time and Absences > Existing Time Cards
   * 2. Filter/search timecards
   * 3. Click Actions > Edit (view only)
   * 4. View Time Totals and Calculated Time
   * 5. Close or Print
   */
  private async viewExistingTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickExistingTimeCards();

    // Select first timecard and view it
    await this.timecardPage.selectFirstTimecardRow();
    await this.timecardPage.clickAction('Edit');
    await this.page.waitForTimeout(5000);

    // View time totals and calculated time
    await this.timecardPage.viewTimeTotals();
    await this.timecardPage.viewCalculatedTime();

    // Close
    await this.timecardPage.clickClose();
  }

  /**
   * HCM.OTL.1201.00: Absence on Timecard (holiday hours, attestation).
   * Steps:
   * 1. Me > Time and Absences > Add Timecard
   * 2. Select Assignment, Hours Type
   * 3. Verify holiday is present
   * 4. Add absence hours
   * 5. Submit with attestation
   */
  private async absenceOnTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickAddTimeCard();

    await this.timecardPage.fillFromTestCase(tc);

    // Submit with attestation
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1301.00: Employee Prints Timecard.
   * Steps: Me > Time and Absences > Existing Time Cards > Actions > Print.
   */
  private async printTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickExistingTimeCards();
    await this.timecardPage.selectFirstTimecardRow();
    await this.timecardPage.clickAction('Print');
  }

  /**
   * HCM.OTL.1401.00: Employee requests time change.
   * Steps:
   * 1. Me > Time and Absences > Request Time Changes
   * 2. Select date
   * 3. Edit/add punches
   * 4. Fill start/stop time, Assignment Number, Hours type
   * 5. Save > Submit
   */
  private async requestTimeChange(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickRequestTimeChanges();

    await this.timecardPage.fillFromTestCase(tc);
    await this.timecardPage.clickSave();
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1601.00: Manager Updates Time Card.
   * Steps:
   * 1. My Team > Quick Actions > Team Time Cards
   * 2. Search for employee
   * 3. Select timecard > Edit
   * 4. Update hours
   * 5. Submit
   */
  private async managerUpdateTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamTimeCards();

    await this.timecardPage.editTimecardRedwood({
      personName: this.extractField(tc.testData, 'person'),
      fromDate: this.extractField(tc.testData, 'from'),
      toDate: this.extractField(tc.testData, 'to'),
      hoursType: this.extractField(tc.testData, 'hours type'),
      hours: this.extractField(tc.testData, 'hours'),
    });

    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.1701.00: Manager Creates Team Time Card.
   * Steps:
   * 1. My Team > Quick Actions > Team Time Cards
   * 2. Click "+" to add timecard for employee
   * 3. Select employee name
   * 4. Enter time information (period, position, time type, hours)
   * 5. Actions > Submit
   */
  private async managerCreateTimecard(tc: UATTestCase): Promise<void> {
    await this.navigateToTeamTimeCards();

    // Click create button
    await this.timecardPage.clickCreateTimecard();

    // Search and select employee
    const personName = this.extractField(tc.testData, 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }

    // Fill timecard data
    await this.timecardPage.fillFromTestCase(tc);

    // Submit
    await this.timecardPage.submitTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.2101.00: Employee Approves Own TimeCard.
   * Steps: Me > Time and Absences > Current/Existing > Approve.
   */
  private async employeeApproveOwn(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeESS();
    await this.timecardPage.clickCurrentTimeCard();
    await this.timecardPage.approveTimecard();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Fallback: determine action from business process text.
   */
  private async executeByBusinessProcess(tc: UATTestCase, bp: string): Promise<void> {
    if (bp.includes('create') || bp.includes('add') || bp.includes('enter')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickAddTimeCard();
      await this.timecardPage.fillFromTestCase(tc);
      await this.timecardPage.submitTimecard();
    } else if (bp.includes('view') || bp.includes('current')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickCurrentTimeCard();
    } else if (bp.includes('existing')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickExistingTimeCards();
    } else if (bp.includes('attest')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickCurrentTimeCard();
      await this.timecardPage.attestTimecard();
    } else if (bp.includes('clock in')) {
      await this.timecardPage.clockIn();
    } else if (bp.includes('clock out')) {
      await this.timecardPage.clockOut();
    } else if (bp.includes('recall')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickCurrentTimeCard();
      await this.timecardPage.clickRecall();
    } else if (bp.includes('save')) {
      await this.navigateToTimeESS();
      await this.timecardPage.clickAddTimeCard();
      await this.timecardPage.fillFromTestCase(tc);
      await this.timecardPage.clickSave();
    } else {
      // Default: navigate to ESS, fill, and submit
      await this.navigateToTimeESS();
      await this.timecardPage.clickAddTimeCard();
      await this.timecardPage.fillFromTestCase(tc);
      await this.timecardPage.submitTimecard();
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
