import { type Page } from '@playwright/test';
import { BaseTimeLaborFlow } from './base-time-labor.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Time Administration / HR Specialist / System Processes
 * Module: Time and Labor
 *
 * Handles these test script categories:
 * - HCM.OTL.1xx: Generate Timecard for Exempt (admin scheduled process)
 * - HCM.OTL.2xx: Generate Time Events (admin)
 * - HCM.OTL.9xx: Evaluate HCM Group / Validate Group Membership
 * - HCM.OTL.19xx: Admin Mass Submit Time Cards (scheduled process)
 * - HCM.OTL.20xx: Admin Mass Approve Time Cards (scheduled process)
 *
 * All admin flows navigate via: My Client Groups > Time Management
 * and use the right-side Tasks panel for scheduled processes and admin tasks.
 */
export class TimeAdminFlow extends BaseTimeLaborFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const category = this.getScriptCategory(tc.testScript);
    const bp = tc.businessProcess.toLowerCase();

    switch (category) {
      case 'generate-timecards':
        await this.generateTimecards(tc);
        break;

      case 'generate-events':
        await this.generateTimeEvents(tc);
        break;

      case 'hcm-group':
        await this.evaluateHCMGroup(tc);
        break;

      case 'mass-submit-admin':
        await this.massSubmitTimecards(tc);
        break;

      case 'mass-approve-admin':
        await this.massApproveTimecards(tc);
        break;

      default:
        await this.executeByBusinessProcess(tc, bp);
        break;
    }
  }

  /**
   * HCM.OTL.101.00: Generate Timecard for Exempt Employees.
   * Steps:
   * 1. Navigator > My Client Groups > Time Management
   * 2. Tasks panel > Time Transactions > Generate Time Cards
   * 3. Select Group Name (e.g., "Exempt Employees")
   * 4. Choose time card period
   * 5. Under Entries: Generate time cards using schedule hours
   * 6. Add Time Card Attribute: Payroll Time Type = Regular
   * 7. Submit
   * 8. Validate via Team Time Cards (status = Entered)
   * 9. Run "Mass submit and approve time cards" scheduled process
   * 10. Validate submitted status in Time Management Overview
   */
  private async generateTimecards(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    const groupName = this.extractField(tc.testData, 'group') || 'Exempt Employees';

    await this.timecardPage.generateTimeCards({
      groupName,
      useScheduleHours: true,
      payrollTimeType: 'Regular',
    });

    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.201.00: Generate Time Events.
   * Steps:
   * 1. Navigator > My Client Groups > Time Management
   * 2. Tasks panel > Time Transactions > Time Events
   * 3. Click Generate button
   * 4. Enter person name/number or group, set effective date
   * 5. Click Search
   * 6. Select rows
   * 7. Choose supplier device event and enter time
   * 8. Submit
   * 9. Validate: Time Events with status "New"
   *
   * HCM.OTL.202.00: Generate Timecard from Time Collection Device
   * Uses scheduled process "Generate Time Cards from Time Collection Devices"
   */
  private async generateTimeEvents(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    const testScript = tc.testScript || '';
    const isFromDevice = testScript.includes('202');

    if (isFromDevice) {
      await this.timecardPage.runScheduledProcess(
        'Generate Time Cards from Time Collection Devices'
      );
      await this.timecardPage.submitScheduledProcess();
      await this.timecardPage.waitForProcessSuccess();
    } else {
      await this.timecardPage.generateTimeEvents({
        personName: this.extractField(tc.testData, 'person'),
        groupName: this.extractField(tc.testData, 'group'),
        effectiveDate: this.extractField(tc.testData, 'date'),
      });
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * HCM.OTL.901.00: Evaluate HCM Group.
   * Steps:
   * 1. Navigator > My Client Groups > Time Management
   * 2. Tasks panel > Scheduled Processes
   * 3. Schedule New Process > Search "Evaluate Group Membership"
   * 4. Set parameters (group name, person name, evaluation date)
   * 5. Submit
   * 6. Refresh until status = Succeeded
   *
   * HCM.OTL.902.00: Validate HCM Group Membership
   * Steps:
   * 1. Time Management > Tasks > Worker Time Processing Profiles
   * 2. Click Troubleshoot
   * 3. Search for person and verify profile
   */
  private async evaluateHCMGroup(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();

    const testScript = tc.testScript || '';
    const isValidate = testScript.includes('902');

    if (isValidate) {
      await this.validateGroupMembership(tc);
    } else {
      await this.timecardPage.runScheduledProcess('Evaluate Group Membership');

      const groupName = this.extractField(tc.testData, 'group');
      if (groupName) {
        await this.timecardPage.fillGroupName(groupName);
      }

      const personName = this.extractField(tc.testData, 'person');
      if (personName) {
        await this.timecardPage.searchPerson(personName);
      }

      await this.timecardPage.submitScheduledProcess();
      await this.timecardPage.waitForProcessSuccess();
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * Validate HCM Group Membership via Worker Time Processing Profiles.
   * HCM.OTL.902.00 steps:
   * 1. Tasks > Worker Time Processing Profiles
   * 2. Click Troubleshoot
   * 3. Search for person
   * 4. Verify assigned profile
   */
  private async validateGroupMembership(tc: UATTestCase): Promise<void> {
    const tasksPanel = this.page.locator(
      'a[title="Tasks"], button[aria-label="Tasks"]'
    ).first();
    const hasTasks = await tasksPanel.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTasks) {
      await tasksPanel.click();
      await this.page.waitForTimeout(2000);
    }

    const profilesLink = this.page.locator(
      'a:has-text("Worker Time Processing Profiles")'
    ).first();
    const hasProfiles = await profilesLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasProfiles) {
      await profilesLink.click();
      await this.page.waitForTimeout(5000);
      await this.timecardPage.waitForJET();
    }

    const troubleshootBtn = this.page.getByRole('button', { name: /Troubleshoot/i }).first();
    const hasTroubleshoot = await troubleshootBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTroubleshoot) {
      await troubleshootBtn.click();
      await this.page.waitForTimeout(5000);
      await this.timecardPage.waitForJET();
    }

    const personName = this.extractField(tc.testData, 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }
  }

  /**
   * HCM.OTL.1901.00: Admin Mass Submit Time Cards.
   * Steps:
   * 1. Navigator > My Client Groups > Time Management
   * 2. Tasks panel > Scheduled Processes
   * 3. Schedule New Process > "Mass Submit and Approve Time Cards"
   * 4. Select "Submit Time Cards"
   * 5. Set Date Range, Group Name
   * 6. Move "Entered" to Selected Values
   * 7. Submit process
   * 8. Validate status in Time Management dashboard
   */
  private async massSubmitTimecards(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();
    await this.runMassSubmitApproveProcess(tc, 'Submit Time Cards');
  }

  /**
   * HCM.OTL.2001.00: Admin Mass Approve Time Cards.
   * Steps:
   * 1. Navigator > My Client Groups > Time Management
   * 2. Tasks panel > Scheduled Processes
   * 3. Schedule New Process > "Mass Submit and Approve Time Cards"
   * 4. Select "Approve Time Cards"
   * 5. Set Date Range, Group Name
   * 6. Move statuses to Selected Values
   * 7. Submit process
   * 8. Validate status
   */
  private async massApproveTimecards(tc: UATTestCase): Promise<void> {
    await this.navigateToTimeAdmin();
    await this.runMassSubmitApproveProcess(tc, 'Approve Time Cards');
  }

  /**
   * Common logic for mass submit/approve scheduled process.
   * Both HCM.OTL.1901.00 and HCM.OTL.2001.00 use the same
   * "Mass Submit and Approve Time Cards" process with different parameters.
   */
  private async runMassSubmitApproveProcess(
    tc: UATTestCase,
    action: string
  ): Promise<void> {
    await this.timecardPage.runScheduledProcess('Mass Submit and Approve Time Cards');

    const actionDropdown = this.page.locator(
      'select[aria-label*="Action"], [aria-label*="Action"], ' +
      'oj-select-single[aria-label*="Action"]'
    ).first();
    const hasAction = await actionDropdown.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasAction) {
      await this.timecardPage.fillCombobox(actionDropdown, action);
    }

    const fromDate = this.extractField(tc.testData, 'from');
    if (fromDate) await this.timecardPage.setFromDate(fromDate);
    const toDate = this.extractField(tc.testData, 'to');
    if (toDate) await this.timecardPage.setToDate(toDate);

    const groupName = this.extractField(tc.testData, 'group');
    if (groupName) await this.timecardPage.fillGroupName(groupName);

    await this.timecardPage.submitScheduledProcess();
    await this.timecardPage.waitForProcessSuccess();
    await this.timecardPage.expectSuccess();
  }

  /**
   * Fallback: determine action from business process text.
   */
  private async executeByBusinessProcess(tc: UATTestCase, bp: string): Promise<void> {
    await this.navigateToTimeAdmin();

    if (bp.includes('generate') && bp.includes('time card')) {
      await this.timecardPage.generateTimeCards({
        groupName: this.extractField(tc.testData, 'group'),
      });
    } else if (bp.includes('generate') && bp.includes('event')) {
      await this.timecardPage.generateTimeEvents({
        personName: this.extractField(tc.testData, 'person'),
        groupName: this.extractField(tc.testData, 'group'),
      });
    } else if (bp.includes('evaluate') || bp.includes('group membership')) {
      await this.timecardPage.runScheduledProcess('Evaluate Group Membership');
      await this.timecardPage.submitScheduledProcess();
      await this.timecardPage.waitForProcessSuccess();
    } else if (bp.includes('mass submit')) {
      await this.runMassSubmitApproveProcess(tc, 'Submit Time Cards');
    } else if (bp.includes('mass approve')) {
      await this.runMassSubmitApproveProcess(tc, 'Approve Time Cards');
    } else if (bp.includes('calculation') || bp.includes('calculate')) {
      await this.handleTimeCalculation(tc);
    } else if (bp.includes('process') || bp.includes('transfer')) {
      await this.handleTimeProcessing(tc);
    } else if (bp.includes('scheduled') || bp.includes('process')) {
      const processName = this.extractField(tc.testData, 'process');
      if (processName) {
        await this.timecardPage.runScheduledProcess(processName);
        await this.timecardPage.submitScheduledProcess();
        await this.timecardPage.waitForProcessSuccess();
      }
    } else {
      await this.timecardPage.fillFromTestCase(tc);
      await this.timecardPage.submitTimecard();
    }

    await this.timecardPage.expectSuccess();
  }

  /**
   * Handle time calculation process.
   */
  private async handleTimeCalculation(tc: UATTestCase): Promise<void> {
    const personName = this.extractField(tc.testData, 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }

    const calculateBtn = this.page.getByRole('button', { name: /Calculate/i }).or(
      this.page.locator('a[role="button"]:has-text("Calculate")')
    ).first();

    const hasCalc = await calculateBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCalc) {
      await calculateBtn.click();
      await this.page.waitForTimeout(10000);
      await this.timecardPage.waitForJET();
    } else {
      await this.timecardPage.clickAdfButton('Calculate');
    }
  }

  /**
   * Handle time processing (e.g., transfer to payroll).
   */
  private async handleTimeProcessing(tc: UATTestCase): Promise<void> {
    const personName = this.extractField(tc.testData, 'person');
    if (personName) {
      await this.timecardPage.searchPerson(personName);
    }

    const processBtn = this.page.getByRole('button', { name: /Process/i }).or(
      this.page.locator('a[role="button"]:has-text("Process")')
    ).first();

    const hasProcess = await processBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasProcess) {
      await processBtn.click();
      await this.page.waitForTimeout(10000);
      await this.timecardPage.waitForJET();
    } else {
      await this.timecardPage.clickAdfButton('Process');
    }
  }

  /** Extract a field value from testData string using partial key match. */
  private extractField(testData: string, key: string): string | undefined {
    if (!testData) return undefined;
    const regex = new RegExp(`${key}[:\\s]+([^\\n,;]+)`, 'i');
    const match = testData.match(regex);
    return match ? match[1].trim() : undefined;
  }
}
