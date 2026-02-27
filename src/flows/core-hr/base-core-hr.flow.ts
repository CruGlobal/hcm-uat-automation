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

  /** Login and navigate to Person Management. */
  async setup(): Promise<void> {
    await this.loginAndNavigate('Person Management');
  }

  /**
   * Fill all common sections from a test case.
   * Subclasses override execute() to control order and add tab-specific logic.
   */
  async fillCommonSections(tc: TestCase): Promise<void> {
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.person.fillFromTestCase(tc);
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
