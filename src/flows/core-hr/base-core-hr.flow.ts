import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PersonManagementPage } from '../../pages/core-hr/person-management.page';
import { WhenAndWhyPage } from '../../pages/core-hr/when-and-why.page';
import { AssignmentPage } from '../../pages/core-hr/assignment.page';
import { PayrollDetailsPage } from '../../pages/core-hr/payroll-details.page';
import { SalaryPage } from '../../pages/core-hr/salary.page';
import { ManagersPage } from '../../pages/core-hr/managers.page';
import { StaffDesignationPage } from '../../pages/core-hr/staff-designation.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import type { TestCase } from '../../data/types';

/**
 * Shared base flow for all Core HR actions.
 * Composes page objects and provides common section-fill helpers.
 *
 * Oracle HCM uses a multi-step wizard:
 *   Step 1: Identification (Basic Details + Personal Details)
 *   Step 2: Person Information (Address + Legislative + Contacts)
 *   Step 3+: Assignment, Payroll, Salary, Manager, etc.
 *
 * Navigation between steps uses ADF wizard buttons (Next/Back).
 */
export class BaseCoreHRFlow extends BaseFlow {
  protected person: PersonManagementPage;
  protected whenAndWhy: WhenAndWhyPage;
  protected assignment: AssignmentPage;
  protected payrollDetails: PayrollDetailsPage;
  protected salary: SalaryPage;
  protected managers: ManagersPage;
  protected staffDesignation: StaffDesignationPage;
  protected confirmation: ConfirmationPage;

  constructor(page: Page) {
    super(page);
    this.person = new PersonManagementPage(page);
    this.whenAndWhy = new WhenAndWhyPage(page);
    this.assignment = new AssignmentPage(page);
    this.payrollDetails = new PayrollDetailsPage(page);
    this.salary = new SalaryPage(page);
    this.managers = new ManagersPage(page);
    this.staffDesignation = new StaffDesignationPage(page);
    this.confirmation = new ConfirmationPage(page);
  }

  /** Click the Next button in the ADF wizard. */
  async clickNext(): Promise<void> {
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(10_000); // ADF wizard step transitions are slow
  }

  /** Click the Submit button in the ADF wizard. */
  async clickSubmit(): Promise<void> {
    await this.person.clickAdfButton('Submit');
    await this.page.waitForTimeout(10_000);
  }

  /** Click the Cancel button and confirm. */
  async clickCancel(): Promise<void> {
    await this.person.clickAdfButton('Cancel');
    await this.page.waitForTimeout(3000);
    // Handle "Are you sure?" confirmation dialog
    try {
      await this.person.clickAdfButton('Yes');
    } catch {
      // No confirmation dialog
    }
  }

  /**
   * Fill Step 1 (Identification): Basic Details + Personal Details.
   */
  async fillStep1(tc: TestCase): Promise<void> {
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.person.fillIdentificationFromTestCase(tc);
  }

  /**
   * Fill Step 2 (Person Information): Address + Legislative.
   */
  async fillStep2(tc: TestCase): Promise<void> {
    await this.person.fillPersonInfoFromTestCase(tc);
  }

  /**
   * Fill all common sections from a test case.
   * Walks through wizard steps filling applicable fields.
   */
  async fillCommonSections(tc: TestCase): Promise<void> {
    // Step 1: Identification
    await this.fillStep1(tc);
    await this.clickNext();

    // Step 2: Person Information
    await this.fillStep2(tc);
    await this.clickNext();

    // Step 3+: Assignment, Payroll, Salary, Manager (TODO: inspect these steps)
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);
  }

  /** Submit and verify success. */
  async submitAndVerify(): Promise<string> {
    return this.confirmation.submitAndVerify();
  }
}
