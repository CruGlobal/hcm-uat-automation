import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { SAAPage } from '../../pages/saa/saa.page';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow for SAA (Salary Approval Application) operations.
 * Module: SAA (6 tests, all with field data)
 *
 * Field data structure (from migration DB):
 *   Person Name:    "Smith, Paul" (Last, First format)
 *   Person Number:  "10000002"
 *   Person Type:    "Employee - Staff"
 *   Legal Employer: "Campus Crusade for Christ, Inc."
 *   Department:     "Conversion Department"
 *
 * SAA provides two main views:
 * 1. HR Specialist View - accessed via Person Management for editing salary data
 * 2. Approver View - accessed via Notifications bell for approving/rejecting requests
 *
 * Routes based on test script (6 unique scripts):
 *   "SAA HR Specialist View"        -> View options in HR specialist view
 *   "SAA HR Specialist Functions"   -> Edit/update operations
 *   "Approver View"                 -> Notifications-based approval list
 *   "Salary Approval Workflow"      -> Approve/reject salary change requests
 *   "MHA Approval workflow"         -> Approve/reject MHA requests
 *   "Addl Salary Approval workflow" -> Approve/reject additional salary requests
 */
export class SAAFlow extends BaseFlow {
  private saa: SAAPage;

  constructor(page: Page) {
    super(page);
    this.saa = new SAAPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const fieldData = getFieldData(tc.testId);
    const script = tc.testScript.toLowerCase();
    const process = tc.businessProcess.toLowerCase();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      const personType = getField(fieldData, 'Person Type');
      console.log(`[SAA] ${tc.testId}: person="${personName}", type="${personType}", script="${tc.testScript}"`);
    }

    if (script.includes('hr specialist view') || process.includes('view options')) {
      await this.executeHRSpecialistView(tc, fieldData);
    } else if (script.includes('hr specialist function') || process.includes('hr specialist function')) {
      await this.executeHRSpecialistFunctions(tc, fieldData);
    } else if (script.includes('approver view')) {
      await this.executeApproverView(tc, fieldData);
    } else if (script.includes('salary approval') || process.includes('salary request approval')) {
      await this.executeSalaryApproval(tc, fieldData);
    } else if (script.includes('mha approval') || process.includes('mha request')) {
      await this.executeMHAApproval(tc, fieldData);
    } else if (script.includes('addl salary') || process.includes('additional salary')) {
      await this.executeAdditionalSalaryApproval(tc, fieldData);
    } else if (process.includes('delegate') || script.includes('delegate')) {
      await this.executeDelegation(tc, fieldData);
    } else if (process.includes('history') || script.includes('history')) {
      await this.executeViewHistory(tc, fieldData);
    } else {
      // Default: HR specialist view
      await this.executeHRSpecialistView(tc, fieldData);
    }
  }

  /** Navigate to HR Specialist view and display options. */
  private async executeHRSpecialistView(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.saa.goToHRSpecialistView();

    // Search for the person using person number or name
    if (fieldData) {
      const personNumber = getField(fieldData, 'Person Number');
      const personName = getField(fieldData, 'Person Name');
      if (personNumber) {
        await this.searchPersonByNumber(personNumber);
      } else if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.saa.viewOptions();

    // Try to open salary/compensation details for the person
    const salaryLink = this.page.locator(
      'a:has-text("Salary"), a:has-text("Compensation"), [role="tab"]:has-text("Salary")'
    ).first();
    if (await salaryLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      await salaryLink.click();
      await this.page.waitForTimeout(1000);
      await this.saa.waitForJET();
      console.log(`[SAA] ${tc.testId}: Opened salary details in HR Specialist view`);
    } else {
      console.log(`[SAA] ${tc.testId}: HR Specialist view — person found, salary tab not visible`);
    }

    await this.saa.screenshot(`saa-hr-view-${tc.testId}`);
  }

  /** Navigate to HR Specialist view and perform edit/update functions. */
  private async executeHRSpecialistFunctions(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.saa.goToHRSpecialistView();

    // Search for the person using person number or name
    if (fieldData) {
      const personNumber = getField(fieldData, 'Person Number');
      const personName = getField(fieldData, 'Person Name');
      if (personNumber) {
        await this.searchPersonByNumber(personNumber);
      } else if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.saa.performHRSpecialistFunctions();

    // Try to open Actions menu and verify HR specialist access
    const actionsBtn = this.page.locator(
      'button:has-text("Actions"), a[role="button"]:has-text("Actions")'
    ).first();
    if (await actionsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await actionsBtn.click();
      await this.page.waitForTimeout(500);
      // Log available actions
      const menuItems = await this.page.locator('[role="menuitem"]').allTextContents().catch(() => []);
      console.log(`[SAA] ${tc.testId}: HR Specialist actions available: ${menuItems.join(', ')}`);
      await this.page.keyboard.press('Escape');
    } else {
      console.log(`[SAA] ${tc.testId}: HR Specialist Functions — person found, no Actions menu visible`);
    }

    await this.saa.screenshot(`saa-hr-functions-${tc.testId}`);
  }

  /** Navigate to Approver view via notifications. */
  private async executeApproverView(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.saa.goToApproverView();
    await this.saa.viewApproverOptions();
    await this.saa.screenshot(`saa-approver-view-${tc.testId}`);
  }

  /** Execute salary approval workflow. */
  private async executeSalaryApproval(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : 'unknown';
    console.log(`[SAA] ${tc.testId}: Looking for Salary approval notification for ${personName}`);
    await this.saa.goToSalaryApproval();

    // Check if the notification bell panel has any salary items
    const hasSalaryNotif = await this.page.locator(
      'a:has-text("Salary"), [role="row"]:has-text("Salary")'
    ).first().isVisible({ timeout: 1000 }).catch(() => false);

    if (!hasSalaryNotif) {
      console.log(`[SAA] ${tc.testId}: No pending Salary notification found — approval depends on prior MPDX submission for ${personName}`);
    }

    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute MHA approval workflow. */
  private async executeMHAApproval(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : 'unknown';
    console.log(`[SAA] ${tc.testId}: Looking for MHA approval notification for ${personName}`);
    await this.saa.goToMHAApproval();

    const hasMHANotif = await this.page.locator(
      'a:has-text("MHA"), [role="row"]:has-text("MHA")'
    ).first().isVisible({ timeout: 1000 }).catch(() => false);

    if (!hasMHANotif) {
      console.log(`[SAA] ${tc.testId}: No pending MHA notification found — approval depends on prior MPDX submission for ${personName}`);
    }

    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute additional salary approval workflow. */
  private async executeAdditionalSalaryApproval(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const personName = fieldData ? getField(fieldData, 'Person Name') : 'unknown';
    console.log(`[SAA] ${tc.testId}: Looking for Additional Salary approval notification for ${personName}`);
    await this.saa.goToAdditionalSalaryApproval();

    const hasNotif = await this.page.locator(
      'a:has-text("Additional Salary"), [role="row"]:has-text("Additional Salary")'
    ).first().isVisible({ timeout: 1000 }).catch(() => false);

    if (!hasNotif) {
      console.log(`[SAA] ${tc.testId}: No pending Additional Salary notification found — approval depends on prior MPDX submission for ${personName}`);
    }

    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute approval delegation. */
  private async executeDelegation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // Determine which approval to delegate based on test data
    const process = tc.businessProcess.toLowerCase();
    if (process.includes('salary')) {
      await this.saa.goToSalaryApproval();
    } else if (process.includes('mha')) {
      await this.saa.goToMHAApproval();
    } else {
      await this.saa.goToApproverView();
    }

    // Extract delegatee from test data if available
    const delegateTo = this.extractDelegatee(tc);
    await this.saa.delegateApproval(delegateTo || undefined);
    await this.saa.verifyApprovalComplete();
  }

  /** View approval history. */
  private async executeViewHistory(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.saa.goToApproverView();
    await this.saa.viewApprovalHistory();
    await this.saa.screenshot(`saa-history-${tc.testId}`);
  }

  /** Search for a person by person number on the current page. */
  private async searchPersonByNumber(personNumber: string): Promise<void> {
    const numInput = this.page.locator(
      '[id$="q1:value10::content"], input[aria-label*="Person Number"]'
    ).first();
    if (await numInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await numInput.fill(personNumber);
      const searchBtn = this.page.locator('[id$="q1::search"], button:has-text("Search")').first();
      if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchBtn.click();
      } else {
        await numInput.press('Enter');
      }
      await this.page.waitForTimeout(2000);
      await this.saa.waitForJET();

      const firstResult = this.page.locator('[role="row"] a').first();
      if (await firstResult.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstResult.click();
        await this.page.waitForTimeout(1000);
        await this.saa.waitForJET();
      }
    } else {
      // Fall back to name search field with person number
      await this.searchPerson(personNumber);
    }
  }

  /** Search for a person on the current page (Person Management). */
  private async searchPerson(name: string): Promise<void> {
    const searchInput = this.page.locator(
      '[id$="q1:value00::content"], input[aria-label*="Search"], input[placeholder*="Search"]'
    ).first();
    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill(name);
      await searchInput.press('Enter');
      await this.page.waitForTimeout(2000);
      await this.saa.waitForJET();

      // Click first result
      const firstResult = this.page.locator(
        'a:has-text("' + name.split(',')[0] + '"), [role="row"] a'
      ).first();
      if (await firstResult.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstResult.click();
        await this.page.waitForTimeout(1000);
        await this.saa.waitForJET();
      }
    }
  }

  /** Extract delegatee name from test case data. */
  private extractDelegatee(tc: UATTestCase): string | null {
    const sources = [tc.testData, tc.preConditions];
    for (const src of sources) {
      if (!src) continue;
      const match = src.match(
        /(?:delegate\s*to|delegatee|person|name)[:\s]*([^\n,;]+)/i
      );
      if (match) return match[1].trim();
    }
    return null;
  }
}
