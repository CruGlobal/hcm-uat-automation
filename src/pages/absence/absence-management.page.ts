import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase } from '../../data/types';
import { parseTestData } from '../../utils/test-data-parser';

/**
 * Absence Management page object for Oracle HCM.
 *
 * Covers two distinct page contexts:
 * 1. Admin view (Absence Administration) — ADF task list page accessed via
 *    Navigator > My Client Groups > Absences. Contains task links like
 *    "Absences and Entitlements", "Work Schedule Assignment", etc.
 * 2. Self-Service (ESS) view — Redwood card tiles accessed via
 *    Navigator > My Information > Time and Absences. Contains cards like
 *    "Add Absence", "Absence Balance", "Existing Absences", etc.
 *
 * Selectors are based on live UI inspection data captured from the Oracle HCM
 * test environment at stafflife-icahjb-test.fa.ocs.oraclecloud.com.
 */
export class AbsenceManagementPage extends BasePage {

  // ==========================================================================
  // Admin Page — Task Search and Navigation Links
  // ==========================================================================

  /** "Search for tasks" input on the Absence Administration page. */
  private readonly taskSearchInput = this.page.locator(
    'input[aria-label="Search for tasks"]'
  );

  /** Search icon/button next to the task search input. */
  private readonly taskSearchButton = this.page.locator(
    'a[title="Search for tasks"]'
  );

  /** Back button on the admin page (top-left arrow). */
  private readonly backButton = this.page.locator('a[title="Back"]');

  // --- Person Management section task links ---

  /** "Absences and Entitlements" task link (Person Management section). */
  private readonly absencesAndEntitlementsLink = this.page.locator(
    'a[title="Absences and Entitlements"]'
  ).first();

  /** "Work Schedule Assignment" task link (Person Management section). */
  private readonly workScheduleAssignmentLink = this.page.locator(
    'a[title="Work Schedule Assignment"]'
  ).first();

  // --- Absence Processes section task links ---

  /** "Schedule and Monitor Absence Processes" task link. */
  private readonly scheduleMonitorLink = this.page.locator(
    'a[title="Schedule and Monitor Absence Processes"]'
  ).first();

  /** "Configure Absence Batch Parameters" task link. */
  private readonly configureBatchLink = this.page.locator(
    'a[title="Configure Absence Batch Parameters"]'
  ).first();

  // --- Absence Definitions section task links ---

  private readonly absenceReasonsLink = this.page.locator('a[title="Absence Reasons"]').first();
  private readonly absenceCertificationsLink = this.page.locator('a[title="Absence Certifications"]').first();
  private readonly absencePlansLink = this.page.locator('a[title="Absence Plans"]').first();
  private readonly absenceTypesLink = this.page.locator('a[title="Absence Types"]').first();
  private readonly leaveAgreementsLink = this.page.locator('a[title="Leave Agreements"]').first();
  private readonly absenceCategoriesLink = this.page.locator('a[title="Absence Categories"]').first();

  // --- Formulas and Rates / Eligibility / Time Periods ---

  private readonly rateDefinitionsLink = this.page.locator('a[title="Rate Definitions"]').first();
  private readonly derivedFactorsLink = this.page.locator('a[title="Derived Factors"]').first();
  private readonly eligibilityProfilesLink = this.page.locator('a[title="Eligibility Profiles"]').first();
  private readonly repeatingTimePeriodsLink = this.page.locator('a[title="Repeating Time Periods"]').first();

  // ==========================================================================
  // ESS (Self-Service) Page — Redwood Card Tiles
  // ==========================================================================

  /**
   * ESS tile base ID prefix. Tiles use IDs like:
   *   _FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:lp1Upl:UPsp1:i2:{index}:tb1:TBcl1
   * Visible tiles from the screenshot:
   *   0=Current Time Card, 1=Add Time Card, 2=Existing Time Cards, 3=Team Schedule
   *   4=Add Absence, 5=Absence Balance, 6=Existing Absences, 7=Absence Bid
   *   8=Calendar
   */
  private readonly ESS_TILE_PREFIX =
    '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:lp1Upl:UPsp1:i2:';

  /** Get an ESS tile link by its index. */
  private essTile(index: number): Locator {
    return this.page.locator(`[id="${this.ESS_TILE_PREFIX}${index}:tb1:TBcl1"]`);
  }

  // ==========================================================================
  // Notifications (top bar)
  // ==========================================================================

  /** Notifications bell icon in the global header. */
  private readonly notificationsIcon = this.page.locator(
    'a[title*="Notifications"]'
  ).first();

  // ==========================================================================
  // Absences and Entitlements detail page elements
  // These appear after clicking "Absences and Entitlements" then searching a person.
  // ==========================================================================

  /** Person search field on the Absence Records search page. */
  private readonly personSearchInput = this.page.locator(
    'input[placeholder*="Search"], input[aria-label*="Name"], input[aria-label*="Person"]'
  ).first();

  /** Search button on the Absence Records search page. */
  private readonly personSearchButton = this.page.locator(
    'button:has-text("Search"), a[role="button"]:has-text("Search")'
  ).first();

  /** "Existing Absences" section heading or tab on the person absence page. */
  private readonly existingAbsencesSection = this.page.getByText('Existing Absences', { exact: false }).first();

  /** "Plan Participation" section heading or "Plan" tab on the person absence page. */
  private readonly planParticipationSection = this.page.getByText('Plan Participation', { exact: false }).first();

  /** "Plan" tab on the person absence page (alternative to scrolling). */
  private readonly planTab = this.page.locator(
    'a:has-text("Plan"), [role="tab"]:has-text("Plan")'
  ).first();

  /** "Add" button in the Existing Absences section to create a new absence. */
  private readonly addAbsenceButtonAdmin = this.page.locator(
    'a:has-text("Add"), button:has-text("Add")'
  ).filter({ hasNotText: /Add Enrollment|Add Time/ }).first();

  /** "Add Enrollment" link on the Plan Participation section (Redwood). */
  private readonly addEnrollmentLink = this.page.getByText('Add Enrollment', { exact: false }).first();

  /** "Enrollments and Adjustments" dropdown button on Plan Participation section. */
  private readonly enrollmentsAndAdjustmentsDropdown = this.page.locator(
    'button:has-text("Enrollments and Adjustments"), a:has-text("Enrollments and Adjustments"), ' +
    '[aria-label*="Enrollments and Adjustments"]'
  ).first();

  /** Three-dots menu (actions menu) on plan rows in Redwood view. */
  private readonly planActionsMenu = this.page.locator(
    'button[aria-label*="Actions"], a[aria-label*="Actions"], [class*="kebab"], [class*="three-dot"]'
  ).first();

  /** "Accruals" dropdown button on the Plan Participation section. */
  private readonly accrualsDropdown = this.page.locator(
    'button:has-text("Accruals"), a:has-text("Accruals")'
  ).first();

  // --- Absence Entry Form fields (after clicking Add) ---

  /** Absence Type dropdown/LOV on the absence entry form. */
  private readonly absenceTypeField = this.page.locator(
    'select[aria-label*="Absence Type"], input[aria-label*="Absence Type"], ' +
    '[id*="AbsenceType"] select, [id*="AbsenceType"] input, ' +
    'label:has-text("Absence Type") + * select, label:has-text("Absence Type") + * input'
  ).first();

  /** Start Date input on the absence entry form. */
  private readonly startDateField = this.page.locator(
    'input[aria-label*="Start Date"], input[id*="StartDate"], input[id*="startDate"]'
  ).first();

  /** End Date input on the absence entry form. */
  private readonly endDateField = this.page.locator(
    'input[aria-label*="End Date"], input[id*="EndDate"], input[id*="endDate"]'
  ).first();

  /** Absence Reason dropdown on the absence entry form. */
  private readonly absenceReasonField = this.page.locator(
    'select[aria-label*="Reason"], input[aria-label*="Reason"], ' +
    '[id*="Reason"] select, [id*="Reason"] input'
  ).first();

  /** Duration display field (read-only, appears after dates are set). */
  private readonly durationField = this.page.locator(
    '[aria-label*="Duration"], [id*="Duration"], [id*="duration"]'
  ).first();

  /** Comments/notes textarea on the absence entry form. */
  private readonly commentsField = this.page.locator(
    'textarea[aria-label*="Comment"], textarea[id*="Comment"], textarea[id*="comment"]'
  ).first();

  // --- Dialog fields for enrollment/balance operations ---

  /** "Select Plan" dropdown in the Add Enrollment dialog. */
  private readonly selectPlanDropdown = this.page.locator(
    'select[aria-label*="Plan"], input[aria-label*="Plan"], ' +
    'select[aria-label*="Select Plan"], input[aria-label*="Select Plan"]'
  ).first();

  /** Start Date in the enrollment dialog. */
  private readonly enrollmentStartDate = this.page.locator(
    'input[aria-label*="Start Date"]'
  ).first();

  /** End Date in the enrollment dialog. */
  private readonly enrollmentEndDate = this.page.locator(
    'input[aria-label*="End Date"]'
  ).last();

  /** Reason dropdown in the Adjust Balance dialog. */
  private readonly adjustReasonField = this.page.locator(
    'select[aria-label*="Reason"], input[aria-label*="Reason"]'
  ).first();

  /** Adjustment Amount input in the Adjust Balance dialog. */
  private readonly adjustAmountField = this.page.locator(
    'input[aria-label*="Adjustment Amount"], input[aria-label*="Amount"], input[id*="Amount"]'
  ).first();

  /** Date field in the Adjust Balance dialog. */
  private readonly adjustDateField = this.page.locator(
    'input[aria-label*="Date"]'
  ).first();

  /** Disbursement Amount input in the Disburse Balance dialog. */
  private readonly disbursementAmountField = this.page.locator(
    'input[aria-label*="Disbursement Amount"], input[aria-label*="Amount"]'
  ).first();

  /** Balance Calculation Date input in the accrual balance popup. */
  private readonly balanceCalcDateField = this.page.locator(
    'input[aria-label*="Balance Calculation Date"], input[aria-label*="Balance As-of-Date"]'
  ).first();

  // --- Action Buttons ---

  /** Submit button (appears on absence entry forms and dialogs). */
  private readonly submitButton = this.page.locator(
    'button:has-text("Submit"), a[role="button"]:has-text("Submit")'
  ).first();

  /** Save button. */
  private readonly saveButton = this.page.locator(
    'button:has-text("Save"), a[role="button"]:has-text("Save")'
  ).first();

  /** OK button (dialog confirmation). */
  private readonly okButton = this.page.locator(
    'button:has-text("OK"), a[role="button"]:has-text("OK")'
  ).first();

  /** Yes button (confirmation dialog). */
  private readonly yesButton = this.page.locator(
    'button:has-text("Yes"), a[role="button"]:has-text("Yes")'
  ).first();

  /** Cancel button. */
  private readonly cancelButton = this.page.locator(
    'button:has-text("Cancel"), a[role="button"]:has-text("Cancel")'
  ).first();

  /** Approve button (manager workflow). */
  private readonly approveButton = this.page.locator(
    'button:has-text("Approve"), a[role="button"]:has-text("Approve")'
  ).first();

  /** Reject button (manager workflow). */
  private readonly rejectButton = this.page.locator(
    'button:has-text("Reject"), a[role="button"]:has-text("Reject")'
  ).first();

  /** Withdraw button. */
  private readonly withdrawButton = this.page.locator(
    'button:has-text("Withdraw"), a[role="button"]:has-text("Withdraw")'
  ).first();

  /** Edit button (to edit an existing absence). */
  private readonly editButton = this.page.locator(
    'button:has-text("Edit"), a[role="button"]:has-text("Edit")'
  ).first();

  /** Delete button (to delete an enrollment). */
  private readonly deleteButton = this.page.locator(
    'button:has-text("Delete"), a[role="button"]:has-text("Delete")'
  ).first();

  // ===== Admin Page — Task Navigation =====

  /** Search for a task on the Absence Administration page by typing in the search box. */
  async searchTask(taskName: string): Promise<void> {
    await this.fillField(this.taskSearchInput, taskName);
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click the "Absences and Entitlements" task link (opens person search). */
  async openAbsencesAndEntitlements(): Promise<void> {
    await this.absencesAndEntitlementsLink.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Work Schedule Assignment" task link. */
  async openWorkScheduleAssignment(): Promise<void> {
    await this.workScheduleAssignmentLink.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click "Schedule and Monitor Absence Processes" task link. */
  async openScheduleMonitorProcesses(): Promise<void> {
    await this.scheduleMonitorLink.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click an admin task link by its visible text (generic). */
  async openAdminTask(taskTitle: string): Promise<void> {
    const link = this.page.locator(`a[title="${taskTitle}"]`).first();
    await link.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===== ESS Page — Tile Navigation =====

  /** Click the "Add Absence" tile card (ESS tile index 4). */
  async clickAddAbsenceTile(): Promise<void> {
    const tile = this.essTile(4);
    if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tile.click({ force: true });
    } else {
      // Fallback: find the tile by text content
      await this.page.getByText('Add Absence', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Absence Balance" tile card (ESS tile index 5). */
  async clickAbsenceBalanceTile(): Promise<void> {
    const tile = this.essTile(5);
    if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tile.click({ force: true });
    } else {
      await this.page.getByText('Absence Balance', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Existing Absences" tile card (ESS tile index 6). */
  async clickExistingAbsencesTile(): Promise<void> {
    const tile = this.essTile(6);
    if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tile.click({ force: true });
    } else {
      await this.page.getByText('Existing Absences', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Absence Bid" tile card (ESS tile index 7). */
  async clickAbsenceBidTile(): Promise<void> {
    const tile = this.essTile(7);
    if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tile.click({ force: true });
    } else {
      await this.page.getByText('Absence Bid', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Calendar" tile card (ESS tile index 8). */
  async clickCalendarTile(): Promise<void> {
    const tile = this.essTile(8);
    if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tile.click({ force: true });
    } else {
      await this.page.getByText('Calendar', { exact: true }).first().click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===== Person Search (Admin — Absence Records page) =====

  /** Search for a person by name or person number on the Absence Records search page. */
  async searchPerson(nameOrNumber: string): Promise<void> {
    await this.fillField(this.personSearchInput, nameOrNumber);

    // Click search button if visible, otherwise rely on Tab-triggered autocomplete
    if (await this.personSearchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.personSearchButton.click();
    }

    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Click first search result row if a results list appears
    const firstResult = this.page.locator(
      '[role="row"] a, [role="option"]:first-child, [role="listitem"] a'
    ).first();
    if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstResult.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  // ===== Absences and Entitlements Detail Page =====

  /** Scroll to or click the "Plan Participation" section / "Plan" tab. */
  async navigateToPlanParticipation(): Promise<void> {
    // Try clicking the Plan tab first
    if (await this.planTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.planTab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Fallback: scroll to Plan Participation section
    if (await this.planParticipationSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.planParticipationSection.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(2000);
    }
  }

  /** Click on a plan name in the Plan Participation section to view balance details. */
  async clickPlanName(planName?: string): Promise<void> {
    if (planName) {
      const planLink = this.page.getByText(planName, { exact: false }).first();
      await planLink.click();
    } else {
      // Click the first plan link in the plan participation table
      const firstPlan = this.page.locator(
        '[role="row"] a[id*="Plan"], [role="row"] a[id*="plan"], ' +
        'table a, [class*="plan"] a'
      ).first();
      await firstPlan.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Navigate to the "Existing Absences" section on the person detail page. */
  async navigateToExistingAbsences(): Promise<void> {
    if (await this.existingAbsencesSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.existingAbsencesSection.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(2000);
    }
  }

  /** Click the "Add" button in the Existing Absences section to open the absence entry form. */
  async clickAddAbsence(): Promise<void> {
    // On Existing Absences section, look for Add button
    await this.navigateToExistingAbsences();

    if (await this.addAbsenceButtonAdmin.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.addAbsenceButtonAdmin.click();
    } else {
      await this.clickAdfButton('Add');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===== Enrollment Operations =====

  /** Open the "Enrollments and Adjustments" dropdown menu. */
  async openEnrollmentsAndAdjustments(): Promise<void> {
    // First try the dropdown button
    if (await this.enrollmentsAndAdjustmentsDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.enrollmentsAndAdjustmentsDropdown.click();
    } else {
      // Try the three-dots/kebab menu on Redwood
      if (await this.planActionsMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.planActionsMenu.click();
      }
    }
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click "Add Enrollment" from the dropdown or direct link. */
  async clickAddEnrollment(): Promise<void> {
    // Try direct link first (Redwood)
    if (await this.addEnrollmentLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.addEnrollmentLink.click();
    } else {
      // Open dropdown then select
      await this.openEnrollmentsAndAdjustments();
      await this.page.getByText('Add Enrollment').first().click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Click "Update Enrollment" from the dropdown or three-dots menu. */
  async clickUpdateEnrollment(): Promise<void> {
    await this.openEnrollmentsAndAdjustments();
    await this.page.getByText('Update Enrollment').first().click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Click "Delete Enrollment" or "Delete" from the dropdown. */
  async clickDeleteEnrollment(): Promise<void> {
    await this.openEnrollmentsAndAdjustments();
    const deleteOption = this.page.getByText('Delete Enrollment', { exact: false }).first();
    if (await deleteOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteOption.click();
    } else {
      await this.page.getByText('Delete').first().click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Click "Adjust Balance" from the Enrollments and Adjustments dropdown. */
  async clickAdjustBalance(): Promise<void> {
    await this.openEnrollmentsAndAdjustments();
    await this.page.getByText('Adjust Balance').first().click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Click "Disburse Balance" from the Enrollments and Adjustments dropdown. */
  async clickDisburseBalance(): Promise<void> {
    await this.openEnrollmentsAndAdjustments();
    await this.page.getByText('Disburse Balance').first().click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ===== Accrual Operations =====

  /** Open the "Accruals" dropdown. */
  async openAccrualsDropdown(): Promise<void> {
    if (await this.accrualsDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.accrualsDropdown.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  /** Run accruals for all active plans. */
  async clickRunAccrualsAllPlans(): Promise<void> {
    await this.openAccrualsDropdown();
    const option = this.page.getByText('Run Accruals for All Active Plans', { exact: false })
      .or(this.page.getByText('Run Accrual for All Plans', { exact: false }))
      .first();
    await option.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Run accruals for the selected plan. */
  async clickRunAccrualsSelectedPlan(): Promise<void> {
    await this.openAccrualsDropdown();
    await this.page.getByText('Run Accruals for Selected Plan', { exact: false }).first().click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ===== Absence Entry Form =====

  /** Select an absence type from the dropdown/LOV. */
  async selectAbsenceType(type: string): Promise<void> {
    await this.fillCombobox(this.absenceTypeField, type);
  }

  /** Fill the start date of the absence. */
  async fillStartDate(date: string): Promise<void> {
    await this.fillField(this.startDateField, date);
  }

  /** Fill the end date of the absence. */
  async fillEndDate(date: string): Promise<void> {
    await this.fillField(this.endDateField, date);
  }

  /** Fill both start and end dates. */
  async fillAbsenceDates(startDate: string, endDate: string): Promise<void> {
    await this.fillStartDate(startDate);
    await this.fillEndDate(endDate);
  }

  /** Select an absence reason from the dropdown. */
  async selectAbsenceReason(reason: string): Promise<void> {
    await this.fillCombobox(this.absenceReasonField, reason);
  }

  /** Fill the comments/notes field. */
  async fillComments(text: string): Promise<void> {
    if (await this.commentsField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.commentsField.clear();
      await this.commentsField.fill(text);
      await this.waitForJET();
    }
  }

  // ===== Enrollment Dialog Fields =====

  /** Select a plan in the enrollment dialog. */
  async selectPlan(planName: string): Promise<void> {
    await this.fillCombobox(this.selectPlanDropdown, planName);
  }

  /** Fill the enrollment start date. */
  async fillEnrollmentStartDate(date: string): Promise<void> {
    await this.fillField(this.enrollmentStartDate, date);
  }

  /** Fill the enrollment end date. */
  async fillEnrollmentEndDate(date: string): Promise<void> {
    await this.fillField(this.enrollmentEndDate, date);
  }

  // ===== Balance Adjustment Dialog Fields =====

  /** Fill the balance adjustment dialog fields. */
  async fillBalanceAdjustment(reason: string, amount: string, date: string): Promise<void> {
    if (reason) {
      await this.fillCombobox(this.adjustReasonField, reason);
    }
    if (amount) {
      await this.fillField(this.adjustAmountField, amount);
    }
    if (date) {
      await this.fillField(this.adjustDateField, date);
    }
  }

  /** Fill the disbursement dialog fields. */
  async fillDisbursement(amount: string, date: string): Promise<void> {
    if (date) {
      await this.fillField(this.adjustDateField, date);
    }
    if (amount) {
      await this.fillField(this.disbursementAmountField, amount);
    }
  }

  // ===== Balance Review =====

  /** Enter a balance calculation date in the accrual balance popup and refresh. */
  async fillBalanceCalculationDate(date: string): Promise<void> {
    await this.fillField(this.balanceCalcDateField, date);
  }

  /** View absence balance — navigates to balance view. */
  async viewAbsenceBalance(): Promise<void> {
    await this.navigateToPlanParticipation();
  }

  // ===== Action Buttons =====

  /** Submit the form or dialog. */
  async clickSubmit(): Promise<void> {
    if (await this.submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.submitButton.click();
    } else {
      await this.clickAdfButton('Submit');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Save the form (draft). */
  async clickSave(): Promise<void> {
    if (await this.saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.saveButton.click();
    } else {
      await this.clickAdfButton('Save');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click OK on a dialog. */
  async clickOk(): Promise<void> {
    if (await this.okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Confirm a dialog (Yes or OK). */
  async confirmDialog(): Promise<void> {
    if (await this.yesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.yesButton.click();
    } else if (await this.okButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.okButton.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Approve the absence (manager action). */
  async clickApprove(): Promise<void> {
    if (await this.approveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.approveButton.click();
    } else {
      await this.clickAdfButton('Approve');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Reject the absence (manager action). */
  async clickReject(): Promise<void> {
    if (await this.rejectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.rejectButton.click();
    } else {
      await this.clickAdfButton('Reject');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Withdraw an absence. */
  async clickWithdraw(): Promise<void> {
    if (await this.withdrawButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.withdrawButton.click();
    } else {
      await this.clickAdfButton('Withdraw');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    await this.confirmDialog();
  }

  /** Edit an existing absence. */
  async clickEdit(): Promise<void> {
    if (await this.editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.editButton.click();
    } else {
      await this.clickAdfButton('Edit');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Delete (used for enrollment deletion). */
  async clickDelete(): Promise<void> {
    if (await this.deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.deleteButton.click();
    } else {
      await this.clickAdfButton('Delete');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    await this.confirmDialog();
  }

  /** Fill approval comments (manager workflow). */
  async fillApprovalComments(text: string): Promise<void> {
    const commentArea = this.page.locator(
      'textarea[aria-label*="Comment"], textarea[id*="Comment"], textarea'
    ).first();
    if (await commentArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentArea.clear();
      await commentArea.fill(text);
      await this.waitForJET();
    }
  }

  // ===== Notifications =====

  /** Open the notifications panel. */
  async openNotifications(): Promise<void> {
    await this.notificationsIcon.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Find and open an absence-related notification. */
  async openAbsenceNotification(): Promise<void> {
    await this.openNotifications();
    const absenceNotification = this.page.locator(
      '[role="listitem"] a, [class*="notification"] a'
    ).filter({ hasText: /absence/i }).first();
    if (await absenceNotification.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await absenceNotification.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  // ===== Select Absence Row =====

  /** Select an absence row from the Existing Absences table. */
  async selectAbsenceRow(index = 0): Promise<void> {
    await this.navigateToExistingAbsences();
    const rows = this.page.locator(
      'table [role="row"], [class*="absence"] [role="row"]'
    );
    const targetRow = rows.nth(index + 1); // Skip header row
    if (await targetRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await targetRow.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Select a plan row in the Plan Participation table. */
  async selectPlanRow(index = 0): Promise<void> {
    await this.navigateToPlanParticipation();
    const rows = this.page.locator(
      'table [role="row"], [class*="plan"] [role="row"]'
    );
    const targetRow = rows.nth(index + 1); // Skip header row
    if (await targetRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await targetRow.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  // ===== Fill from UATTestCase =====

  /**
   * Fill the absence entry form from a UATTestCase.
   * Extracts fields from testData, businessProcess, and testScenario.
   */
  async fillFromUATTestCase(tc: UATTestCase): Promise<void> {
    const data = parseTestData(tc.testData);

    const absenceType = data['absence type'] || data['type'] || '';
    const absenceReason = data['reason'] || '';
    const start = data['start date'] || data['start'] || '';
    const end = data['end date'] || data['end'] || '';
    const commentsVal = data['comments'] || data['comment'] || '';

    if (absenceType) await this.selectAbsenceType(absenceType);
    if (start) await this.fillStartDate(start);
    if (end) await this.fillEndDate(end);
    if (absenceReason) await this.selectAbsenceReason(absenceReason);
    if (commentsVal) await this.fillComments(commentsVal);
  }

  /** Expect a success confirmation message to be visible. */
  async expectSuccess(): Promise<void> {
    const successIndicator = this.page.locator(
      '[class*="confirmation"], [class*="success"], ' +
      ':text("successfully"), :text("submitted"), :text("approved"), :text("saved")'
    ).first();
    await successIndicator.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Check that text is visible on the page (for verification steps). */
  async verifyTextVisible(text: string): Promise<boolean> {
    const element = this.page.getByText(text, { exact: false }).first();
    return await element.isVisible({ timeout: 10_000 }).catch(() => false);
  }
}
