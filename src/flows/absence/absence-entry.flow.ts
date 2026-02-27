import { type Page } from '@playwright/test';
import { BaseAbsenceFlow } from './base-absence.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Absence Entry
 *
 * Handles creating new absences by both HR Specialists (admin) and Employees (ESS).
 * Also handles viewing existing absences and viewing submitted absences.
 *
 * Routing by test script ID patterns:
 * - HCM.ABS.402.xx — HR Specialist Adds an Employee Absence (admin view)
 * - HCM.ABS.1201.xx — Employee Submits an Absence (ESS view)
 * - HCM.ABS.1501.xx — Manager Schedules an Absence for an Employee
 * - HCM.ABS.1701.xx — Employee extends/shortens leave (edit existing)
 * - HCM.ABS.2001.xx — Employee views a Submitted Absence
 * - HCM.ABS.2101.xx — HR Specialist Views an Employee Absence
 * - HCM.ABS.2201.xx — HR Specialist Edits an Employee Absence
 * - HCM.ABS.2801.xx — Manager Adds an Absence for an Employee
 * - HCM.ABS.3001.xx — Manager submits Military leave
 * - HCM.ABS.3002.xx — Manager submits Domestic Violence Leave
 */
export class AbsenceEntryFlow extends BaseAbsenceFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    const scriptId = (tc.testScript || '').toUpperCase();
    const category = (tc.transactionCategory || '').toLowerCase();
    const process = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();

    // Route based on script ID or category/process keywords
    if (scriptId.includes('1201') || (category.includes('employee') && process.includes('submit'))) {
      await this.employeeSubmitsAbsence(tc);
    } else if (scriptId.includes('2001') || process.includes('view') && category.includes('employee')) {
      await this.employeeViewsSubmittedAbsence(tc);
    } else if (scriptId.includes('1701') || process.includes('extend') || process.includes('shorten')) {
      await this.employeeExtendsOrShortensLeave(tc);
    } else if (scriptId.includes('1501') || scriptId.includes('2801') ||
               scriptId.includes('3001') || scriptId.includes('3002') ||
               (category.includes('manager') && process.includes('add'))) {
      await this.managerSchedulesAbsence(tc);
    } else if (scriptId.includes('2201') || process.includes('edit')) {
      await this.hrSpecialistEditsAbsence(tc);
    } else if (scriptId.includes('2101') || (category.includes('hr') && process.includes('view'))) {
      await this.hrSpecialistViewsAbsence(tc);
    } else {
      // Default: HR Specialist adds absence (HCM.ABS.402.xx)
      await this.hrSpecialistAddsAbsence(tc);
    }

    await this.absence.screenshot(`absence-entry-${tc.testId}`);
  }

  /**
   * HCM.ABS.402.xx — HR Specialist Adds an Employee Absence.
   * Steps: Login -> My Client Groups -> Absences -> Absence Records ->
   *        Search person -> Existing Absences -> Add -> Select type ->
   *        Fill dates -> Reason -> Comments -> Submit
   */
  private async hrSpecialistAddsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Step 6: Navigate to Existing Absences section
    await this.absence.navigateToExistingAbsences();

    // Step 7: Click Add button
    await this.absence.clickAddAbsence();

    // Steps 8-11: Fill absence details
    await this.absence.fillFromUATTestCase(tc);

    // Step 12: Submit
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1201.xx — Employee Submits an Absence (self-service).
   * Steps: Login -> Me -> Time and Absences -> Add Absence tile ->
   *        Select type -> Fill dates -> Reason -> Comments -> Submit
   */
  private async employeeSubmitsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();

    // Click the "Add Absence" tile card
    await this.absence.clickAddAbsenceTile();

    // Fill absence details from test case data
    await this.absence.fillFromUATTestCase(tc);

    // Submit the absence request
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.2001.xx — Employee views a Submitted Absence.
   * Steps: Login -> Me -> Time and Absences -> Existing Absences tile ->
   *        View submitted absence details
   */
  private async employeeViewsSubmittedAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();

    // Click the "Existing Absences" tile card
    await this.absence.clickExistingAbsencesTile();

    // Select first absence row to view details
    await this.absence.selectAbsenceRow(0);
  }

  /**
   * HCM.ABS.1701.xx — Employee extends/shortens leave.
   * Steps: Login -> Me -> Time and Absences -> Existing Absences ->
   *        Select absence -> Edit -> Update dates -> Submit
   */
  private async employeeExtendsOrShortensLeave(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToAbsenceESS();

    // View existing absences
    await this.absence.clickExistingAbsencesTile();

    // Select the absence to modify
    await this.absence.selectAbsenceRow(0);

    // Edit the absence
    await this.absence.clickEdit();

    // Update fields from test case
    await this.absence.fillFromUATTestCase(tc);

    // Submit changes
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.1501.xx / 2801.xx / 3001.xx / 3002.xx —
   * Manager Schedules/Adds an Absence for an Employee.
   * Steps: Login -> My Team or Navigator -> Absences ->
   *        Search employee -> Add Absence -> Fill details -> Submit
   */
  private async managerSchedulesAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to Existing Absences and add
    await this.absence.navigateToExistingAbsences();
    await this.absence.clickAddAbsence();

    // Fill absence details
    await this.absence.fillFromUATTestCase(tc);

    // Submit
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }

  /**
   * HCM.ABS.2101.xx — HR Specialist Views an Employee Absence.
   * Steps: Login -> Absences Admin -> Absence Records -> Search person ->
   *        View Existing Absences
   */
  private async hrSpecialistViewsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to Existing Absences section to view
    await this.absence.navigateToExistingAbsences();

    // Select the first absence row to view details
    await this.absence.selectAbsenceRow(0);
  }

  /**
   * HCM.ABS.2201.xx — HR Specialist Edits an Employee Absence.
   * Steps: Login -> Absences Admin -> Absence Records -> Search person ->
   *        Select absence -> Edit -> Update fields -> Submit
   */
  private async hrSpecialistEditsAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToPersonAbsences(tc);

    // Navigate to Existing Absences and select the absence to edit
    await this.absence.navigateToExistingAbsences();
    await this.absence.selectAbsenceRow(0);

    // Click Edit
    await this.absence.clickEdit();

    // Fill updated fields from test case
    await this.absence.fillFromUATTestCase(tc);

    // Submit
    await this.absence.clickSubmit();
    await this.absence.confirmDialog();
  }
}
