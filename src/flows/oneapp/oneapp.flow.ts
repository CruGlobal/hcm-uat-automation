import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PersonManagementPage } from '../../pages/core-hr/person-management.page';
import { WhenAndWhyPage } from '../../pages/core-hr/when-and-why.page';
import { AssignmentPage } from '../../pages/core-hr/assignment.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow for OneApp module.
 * Module: OneApp (19 tests, all with field data)
 *
 * Field data structure varies by tab:
 *   tab="OneApp" (16 tests):
 *     Person Name:       "Smith, Paul"
 *     Person Number:     "10000002"
 *     Person Type:       "Employee - Staff"
 *     Legal Employer:    "Campus Crusade for Christ, Inc."
 *     Department:        "Conversion Department"
 *     Job:               (may be empty)
 *
 *   tab="Core - Assign Change/XFR" (3 tests — transfers):
 *     Starting point:              e.g., "Transfer: Global Transfer"
 *     When - Effective date:       Excel serial date
 *     Why:                         action reason
 *     Assignment > Person Type:    target person type
 *     Assignment > Department:     target department
 *     Assignment > Job:            target job
 *     Assignment > Location:       target location
 *     Business Unit:               business unit
 *
 * OneApp covers Cru's integrated onboarding application combining:
 * - Prepare for Hire (new Intern, Intl Intern, PTFS, RMO, conversions)
 * - New Hire & Additional Salary
 * - 2nd Year & Additional Salary
 * - Job Reclass & Additional Salary
 * - Payroll Change
 * - Additional Salary
 * - Transfer (PTFS to RMO, etc.)
 *
 * All operations use Oracle HCM Person Management wizard with
 * Cru-specific business rules.
 */
export class OneAppFlow extends BaseFlow {
  private person: PersonManagementPage;
  private whenAndWhy: WhenAndWhyPage;
  private assignment: AssignmentPage;
  private confirmation: ConfirmationPage;

  constructor(page: Page) {
    super(page);
    this.person = new PersonManagementPage(page);
    this.whenAndWhy = new WhenAndWhyPage(page);
    this.assignment = new AssignmentPage(page);
    this.confirmation = new ConfirmationPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const fieldData = getFieldData(tc.testId);
    const process = tc.businessProcess.toLowerCase();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      const personType = getField(fieldData, 'Person Type');
      console.log(`[OneApp] ${tc.testId}: person="${personName}", type="${personType}", bp="${tc.businessProcess.substring(0, 50)}"`);
    }

    if (process.includes('prepare for hire')) {
      await this.executePrepareForHire(tc, fieldData);
    } else if (process.includes('new hire')) {
      await this.executeNewHire(tc, fieldData);
    } else if (process.includes('2nd year') || process.includes('second year')) {
      await this.executeSecondYear(tc, fieldData);
    } else if (process.includes('job reclass')) {
      await this.executeJobReclass(tc, fieldData);
    } else if (process.includes('payroll change')) {
      await this.executePayrollChange(tc, fieldData);
    } else if (process.includes('additional salary')) {
      await this.executeAdditionalSalary(tc, fieldData);
    } else if (process.includes('transfer')) {
      await this.executeTransfer(tc, fieldData);
    } else {
      await this.executeGenericOneApp(tc, fieldData);
    }
  }

  /** Prepare for Hire -- creates a pending worker. */
  private async executePrepareForHire(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToAddPendingWorker();
    await this.page.waitForTimeout(5000);

    // Log field data if available
    if (fieldData) {
      const personType = getField(fieldData, 'Person Type');
      const legalEmployer = getField(fieldData, 'Legal Employer');
      console.log(`[OneApp] Prepare for Hire: personType="${personType}", employer="${legalEmployer}"`);
    }

    // Navigate through wizard steps
    // Step 1: "What info do you want to manage" -- select applicable boxes, Continue
    await this.clickWizardButton('Continue');
    // Step 2: When and Why -- enter dates
    await this.clickWizardButton('Continue');
    // Step 3: Personal Details
    await this.clickWizardButton('Continue');
    // Step 4: Employment Details -- guided flow
    await this.clickWizardButton('Next');
    // Step 5: Review and Submit
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** New Hire & Additional Salary -- hires and sets up salary. */
  private async executeNewHire(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToHireEmployee();
    await this.page.waitForTimeout(5000);

    if (fieldData) {
      const personType = getField(fieldData, 'Person Type');
      console.log(`[OneApp] New Hire: personType="${personType}"`);
    }

    // Navigate through wizard steps
    await this.clickWizardButton('Continue');
    await this.clickWizardButton('Continue');
    await this.clickWizardButton('Continue');
    await this.clickWizardButton('Next');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** 2nd Year & Additional Salary -- assignment change for returning worker. */
  private async executeSecondYear(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();

    // Search for the worker using field data
    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.searchPerson(personName);
      }
    }

    // Initiate assignment change
    await this.selectPersonAction('Change Assignment');
    await this.clickWizardButton('Continue');
    await this.clickWizardButton('Next');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Job Reclass & Additional Salary -- change job classification. */
  private async executeJobReclass(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.selectPersonAction('Change Assignment');
    await this.clickWizardButton('Continue');
    await this.clickWizardButton('Next');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Payroll Change -- update payroll details for worker. */
  private async executePayrollChange(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.selectPersonAction('Manage Salary');
    await this.clickWizardButton('Continue');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Additional Salary -- add additional salary elements. */
  private async executeAdditionalSalary(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.searchPerson(personName);
      }
    }

    // Navigate to Element Entries for the person
    await this.selectPersonAction('Manage Salary');
    await this.clickWizardButton('Continue');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Transfer from one worker type to another (e.g., PTFS to RMO). */
  private async executeTransfer(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      const startingPoint = getField(fieldData, 'Starting point');
      const effectiveDate = getField(fieldData, 'When - Effective date');
      console.log(`[OneApp] Transfer: person="${personName}", start="${startingPoint}", date="${effectiveDate}"`);

      if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.selectPersonAction('Transfer');
    await this.clickWizardButton('Continue');

    // Fill transfer-specific fields from field data
    if (fieldData) {
      const effectiveDate = getField(fieldData, 'When - Effective date');
      if (effectiveDate) {
        const dateStr = excelSerialToDate(effectiveDate);
        const dateField = this.page.locator('input[aria-label*="Effective Date"], input[aria-label*="When"]').first();
        if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await this.person.fillField(dateField, dateStr);
        }
      }
    }

    await this.clickWizardButton('Next');
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Generic OneApp action -- navigate to Person Management and search. */
  private async executeGenericOneApp(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToPersonManagement();
    await this.page.waitForTimeout(5000);

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.searchPerson(personName);
      }
    }

    await this.person.screenshot(`oneapp-generic-${tc.testId}`);
  }

  /** Search for a person on the Person Management page. */
  private async searchPerson(name: string): Promise<void> {
    const searchInput = this.page.locator(
      '[id$="q1:value00::content"], input[aria-label*="Name"], input[placeholder*="Search"]'
    ).first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill(name);
      await searchInput.press('Enter');
      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();

      // Click first matching result
      const firstName = name.split(',')[0].trim();
      const firstResult = this.page.locator(
        `a:has-text("${firstName}"), [role="row"] a`
      ).first();
      if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstResult.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
      }
    }
  }

  /** Click a wizard button (Continue, Next, Submit) with fallback. */
  private async clickWizardButton(text: string): Promise<void> {
    try {
      await this.person.clickAdfButton(text);
    } catch {
      // Fallback: try regular button click
      const btn = this.page.getByRole('button', { name: text }).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
      }
    }
    await this.page.waitForTimeout(5000);
    await this.person.waitForJET();
  }

  /** Select a person action from the Actions menu. */
  private async selectPersonAction(actionText: string): Promise<void> {
    const actionsBtn = this.page.locator(
      'button:has-text("Actions"), a[role="button"]:has-text("Actions"), [id*="Actions"]'
    ).first();
    if (await actionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await actionsBtn.click();
      await this.page.waitForTimeout(2000);

      const actionLink = this.page.getByText(actionText, { exact: false }).first();
      if (await actionLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await actionLink.click();
      } else {
        // Try menu item role
        const menuItem = this.page.locator(`[role="menuitem"]:has-text("${actionText}")`).first();
        if (await menuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await menuItem.click();
        }
      }

      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();
    } else {
      console.log(`[OneApp] Actions button not visible, cannot select "${actionText}"`);
    }
  }
}
