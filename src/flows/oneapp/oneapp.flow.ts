import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PersonManagementPage } from '../../pages/core-hr/person-management.page';
import { WhenAndWhyPage } from '../../pages/core-hr/when-and-why.page';
import { AssignmentPage } from '../../pages/core-hr/assignment.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import type { UATTestCase } from '../../data/types';

/**
 * Flow for OneApp module.
 *
 * OneApp covers Cru's integrated onboarding application which combines
 * Prepare for Hire, New Hire, Job Reclass, Payroll Changes, and
 * Additional Salary operations for different worker types:
 * - Intern, International Intern, PTFS, RMO
 *
 * These operations use the same Oracle HCM New Person wizard as Core HR
 * but with Cru-specific business rules and approval workflows.
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
    await this.loginToHCM();

    const process = tc.businessProcess.toLowerCase();

    if (process.includes('prepare for hire')) {
      await this.executePrepareForHire(tc);
    } else if (process.includes('new hire')) {
      await this.executeNewHire(tc);
    } else if (process.includes('2nd year') || process.includes('second year')) {
      await this.executeSecondYear(tc);
    } else if (process.includes('job reclass')) {
      await this.executeJobReclass(tc);
    } else if (process.includes('payroll change')) {
      await this.executePayrollChange(tc);
    } else if (process.includes('additional salary')) {
      await this.executeAdditionalSalary(tc);
    } else if (process.includes('transfer')) {
      await this.executeTransfer(tc);
    } else {
      await this.executeGenericOneApp(tc);
    }
  }

  /** Prepare for Hire — creates a pending worker. */
  private async executePrepareForHire(tc: UATTestCase): Promise<void> {
    await this.homePage.goToAddPendingWorker();
    await this.page.waitForTimeout(5000);
    // "What info do you want to manage" — select applicable boxes, Continue
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // When and Why — enter dates
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Personal Details
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Employment Details — guided flow
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** New Hire & Additional Salary — hires and sets up salary. */
  private async executeNewHire(tc: UATTestCase): Promise<void> {
    await this.homePage.goToHireEmployee();
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** 2nd Year & Additional Salary — assignment change for returning worker. */
  private async executeSecondYear(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    // Search for the worker and initiate assignment change
    await this.selectPersonAction('Change Assignment');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Job Reclass & Additional Salary — change job classification. */
  private async executeJobReclass(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    await this.selectPersonAction('Change Assignment');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Payroll Change — update payroll details for worker. */
  private async executePayrollChange(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    await this.selectPersonAction('Manage Salary');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Additional Salary — add additional salary elements. */
  private async executeAdditionalSalary(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    // Navigate to Element Entries for the person
    await this.selectPersonAction('Manage Salary');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Transfer from one worker type to another (e.g., PTFS to RMO). */
  private async executeTransfer(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    await this.selectPersonAction('Transfer');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  /** Generic OneApp action. */
  private async executeGenericOneApp(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    await this.page.waitForTimeout(5000);
  }

  /** Select a person action from the Actions menu. */
  private async selectPersonAction(actionText: string): Promise<void> {
    const actionsBtn = this.page.locator(
      'button:has-text("Actions"), a[role="button"]:has-text("Actions"), [id*="Actions"]'
    ).first();
    if (await actionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await actionsBtn.click();
      await this.page.waitForTimeout(2000);
      await this.page.getByText(actionText, { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();
    }
  }
}
