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
 * Oracle HCM Hire/Add Worker wizard has 3 actual steps:
 *   Step 1: Identification (Basic Details + Personal Details)
 *     - Train stops: "Basic Details", "Personal Details"
 *   Step 2: Person Information (Address + Legislative + Contacts)
 *     - Train stops: "Home Address", "Phone Details", "Email Details",
 *       "Legislative Information", "Citizenship and Visa Information", "Contacts"
 *   Step 3: Employment Information (ALL remaining sections on one scrollable page)
 *     - Train stops: "Work Relationship Details", "Service Dates", "Job",
 *       "Collective Agreement", "Location Headcount"
 *     - Sections: Work Relationship, Assignment, Job Details, Manager Details,
 *       Payroll Details, Special Assignment Details, Probation, etc.
 *
 * The "Next" button within Step 3 scrolls between train stops, not new pages.
 * Submit is available from Step 3 at any time.
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
    await this.confirmation.clickSubmit();
  }

  /** Click the Cancel button and confirm. */
  async clickCancel(): Promise<void> {
    await this.person.clickAdfButton('Cancel');
    await this.page.waitForTimeout(3000);
    try {
      await this.person.clickAdfButton('Yes');
    } catch {
      // No confirmation dialog
    }
  }

  /**
   * Fill Step 1 (Identification): Basic Details + Personal Details.
   * This is the first wizard page with When/Why and personal name fields.
   */
  async fillStep1(tc: TestCase): Promise<void> {
    await this.whenAndWhy.fillFromTestCase(tc);
    await this.person.fillIdentificationFromTestCase(tc);
  }

  /**
   * Fill Step 2 (Person Information): Address + Legislative.
   * This is the second wizard page with address and legislative info.
   */
  async fillStep2(tc: TestCase): Promise<void> {
    await this.person.fillPersonInfoFromTestCase(tc);
  }

  /**
   * Fill Step 3 (Employment Information): All assignment-level fields.
   * This is a single scrollable page containing Assignment, Managers,
   * Payroll Details, and more.
   */
  async fillStep3(tc: TestCase): Promise<void> {
    // Scroll through the page to ensure all sections are loaded
    await this.page.evaluate(() => {
      const body = document.querySelector('.af_document_content') || document.body;
      body.scrollTop = 0;
    });

    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);
  }

  /**
   * Fill all common sections from a test case.
   * Walks through all 3 wizard steps filling applicable fields.
   */
  async fillCommonSections(tc: TestCase): Promise<void> {
    // Step 1: Identification
    await this.fillStep1(tc);
    await this.clickNext();

    // Step 2: Person Information
    await this.fillStep2(tc);
    await this.clickNext();

    // Step 3: Employment Information (single scrollable page)
    await this.fillStep3(tc);
    await this.clickNext();

    // Step 4: Compensation and Other Information (skip — no fields to fill)
    await this.clickNext();

    // Now on Step 5: Review — Submit should be enabled
  }

  /** Submit and verify success. */
  async submitAndVerify(): Promise<string> {
    return this.confirmation.submitAndVerify();
  }
}
