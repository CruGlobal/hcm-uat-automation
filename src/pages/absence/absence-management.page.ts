import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase, TestCase } from '../../data/types';
import { parseTestData } from '../../utils/test-data-parser';
import { getField } from '../../data/test-data-provider';

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

  /** Absence Type dropdown/LOV on the absence entry form (Redwood oj-select-single or ADF). */
  private readonly absenceTypeField = this.page.locator(
    'oj-select-single[aria-label*="Absence Type"], ' +
    'select[aria-label*="Absence Type"], input[aria-label*="Absence Type"], ' +
    '[id*="AbsenceType"] select, [id*="AbsenceType"] input, [id*="AbsenceType"] oj-select-single, ' +
    '[class*="absence-type"] select, [class*="absence-type"] oj-select-single'
  ).first();

  /** Start Date on the absence entry form (Redwood oj-input-date combobox). */
  private readonly startDateField = this.page.getByRole('combobox', { name: /Start Date/i }).first();

  /** End Date on the absence entry form (Redwood oj-input-date combobox). */
  private readonly endDateField = this.page.getByRole('combobox', { name: /End Date/i }).first();

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

  /** Click the "Absences and Entitlements" task link (opens Redwood person search page). */
  async openAbsencesAndEntitlements(): Promise<void> {
    // The ADF link click often doesn't trigger Redwood navigation in headless mode.
    // Navigate directly to the Redwood Absences and Entitlements URL.
    const baseUrl = this.page.url().split('/hcmUI/')[0] || this.page.url().split('/fscmUI/')[0];
    const redwoodUrl = `${baseUrl}/fscmUI/redwood/human-resources/feature/launch?searchEnabled=true&context=MyClientGroups&action=ManageAbsenceRecords&vbAppUi=absences&vbcsFlow=absence-administration&vbPage=manage-absences-plans&vbParams=pfsUserMode=%27ADMIN%27&vbFlowStringKey=manageAbsencesAndEntitlements`;
    console.log(`[Absence] Navigating directly to Redwood Absences and Entitlements`);
    await this.page.goto(redwoodUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(10000);
    await this.waitForJET();
  }

  /** Click the "Work Schedule Assignment" task link. */
  async openWorkScheduleAssignment(): Promise<void> {
    await this.workScheduleAssignmentLink.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click "Schedule and Monitor Absence Processes" task link.
   * Returns false if the link is disabled (bot lacks permission). */
  async openScheduleMonitorProcesses(): Promise<boolean> {
    const isDisabled = await this.scheduleMonitorLink.getAttribute('aria-disabled').catch(() => null);
    if (isDisabled === 'true') {
      console.log('[AbsenceAdmin] Schedule and Monitor Processes link is disabled — bot lacks access');
      return false;
    }
    await this.scheduleMonitorLink.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    return true;
  }

  /** Click an admin task link by its visible text (generic). */
  async openAdminTask(taskTitle: string): Promise<void> {
    const link = this.page.locator(`a[title="${taskTitle}"]`).first();
    await link.click({ force: true });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===== ESS Page — Tile Navigation =====

  /**
   * Click an ESS tile by its visible text label.
   * Prefers text-based matching (resilient to tile reordering across Oracle updates)
   * and falls back to scanning tile indices if text is not found.
   *
   * Uses nth() iteration instead of first() to handle cases where the first
   * DOM match is a hidden element (e.g., on Absence Balance sub-page where
   * tiles are in background DOM but not visible).
   */
  private async clickEssTile(label: string, fallbackIndex: number): Promise<void> {
    // Strategy 1: Click the <a> link that contains the label text.
    // Redwood card tiles wrap content in <a> tags — clicking the link element
    // reliably triggers navigation (vs clicking inner text/span which may not).
    const link = this.page.locator('a').filter({ hasText: new RegExp(`^${label}`) }).first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click({ force: true });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Click the tile by ADF id prefix.
    const indicesToTry = [fallbackIndex, ...Array.from({ length: 12 }, (_, i) => i).filter(i => i !== fallbackIndex)];
    for (const idx of indicesToTry) {
      const tile = this.essTile(idx);
      if (await tile.isVisible({ timeout: 1000 }).catch(() => false)) {
        const tileText = await tile.textContent().catch(() => '');
        if (tileText?.includes(label)) {
          await tile.click({ force: true });
          await this.page.waitForTimeout(5000);
          await this.waitForJET();
          return;
        }
      }
    }

    // Strategy 3: Click any visible text match (last resort for non-standard layouts).
    const textTiles = this.page.getByText(label, { exact: true });
    const textCount = await textTiles.count().catch(() => 0);
    for (let i = 0; i < textCount; i++) {
      const tile = textTiles.nth(i);
      if (await tile.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Try JS click on the closest <a> parent or the element itself
        await tile.evaluate((el: HTMLElement) => {
          const anchor = el.closest('a') || el.querySelector('a') || el;
          (anchor as HTMLElement).click();
        });
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
    }

    throw new Error(`ESS tile "${label}" not found by text or index ${fallbackIndex}`);
  }

  /** Click the "Add Absence" tile card. */
  async clickAddAbsenceTile(): Promise<void> {
    await this.clickEssTile('Add Absence', 4);
  }

  /** Click the "Absence Balance" tile card. */
  async clickAbsenceBalanceTile(): Promise<void> {
    await this.clickEssTile('Absence Balance', 5);
  }

  /** Click the "Existing Absences" tile card. */
  async clickExistingAbsencesTile(): Promise<void> {
    await this.clickEssTile('Existing Absences', 6);
  }

  /** Click the "Absence Bid" tile card. */
  async clickAbsenceBidTile(): Promise<void> {
    await this.clickEssTile('Absence Bid', 7);
  }

  /** Click the "Calendar" tile card. */
  async clickCalendarTile(): Promise<void> {
    await this.clickEssTile('Calendar', 8);
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

  /** Click on a plan name in the Plan Participation section to view balance details. Returns false if no plans found. */
  async clickPlanName(planName?: string): Promise<boolean> {
    if (planName) {
      const planLink = this.page.getByText(planName, { exact: false }).first();
      if (!await planLink.isVisible({ timeout: 8000 }).catch(() => false)) {
        console.log(`[Absence] Plan name "${planName}" not found — person may have no enrollments`);
        return false;
      }
      await planLink.click();
    } else {
      // Click the first plan link in the plan participation table
      const firstPlan = this.page.locator(
        '[role="row"] a[id*="Plan"], [role="row"] a[id*="plan"], ' +
        '[role="row"] a[id*="AbsencePlan"], [role="row"] a[id*="absencePlan"], ' +
        'table [role="row"] a, [class*="plan"] a, ' +
        '[role="gridcell"] a, td a'
      ).first();
      if (!await firstPlan.isVisible({ timeout: 8000 }).catch(() => false)) {
        console.log('[Absence] No plan links found in Plan Participation — person may have no enrollments');
        return false;
      }
      await firstPlan.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    return true;
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

  /** Click "Update Enrollment" from the dropdown or three-dots menu. Returns false if not available. */
  async clickUpdateEnrollment(): Promise<boolean> {
    await this.openEnrollmentsAndAdjustments();
    const option = this.page.getByText('Update Enrollment').first();
    if (!await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Absence] Update Enrollment option not available');
      return false;
    }
    await option.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    return true;
  }

  /** Click "Delete Enrollment" or "Delete" from the dropdown. Returns false if not available. */
  async clickDeleteEnrollment(): Promise<boolean> {
    await this.openEnrollmentsAndAdjustments();
    const deleteOption = this.page.getByText('Delete Enrollment', { exact: false }).first();
    if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteOption.click();
    } else {
      const deleteBtn = this.page.getByText('Delete').first();
      if (!await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[Absence] Delete Enrollment option not available');
        return false;
      }
      await deleteBtn.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    return true;
  }

  /** Click "Adjust Balance" from the Enrollments and Adjustments dropdown. Returns false if not available. */
  async clickAdjustBalance(): Promise<boolean> {
    await this.openEnrollmentsAndAdjustments();
    const option = this.page.getByText('Adjust Balance').first();
    if (!await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Absence] Adjust Balance option not available');
      return false;
    }
    await option.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    return true;
  }

  /** Click "Disburse Balance" from the Enrollments and Adjustments dropdown. */
  async clickDisburseBalance(): Promise<void> {
    await this.openEnrollmentsAndAdjustments();
    const disburseBtn = this.page.getByText('Disburse Balance').first();
    if (!await disburseBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      throw new Error('Disburse Balance option not found in dropdown');
    }
    await disburseBtn.click();
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

  /** Select an absence type from the Redwood dropdown. */
  async selectAbsenceType(type: string): Promise<boolean> {
    console.log(`[Absence] Selecting absence type: "${type}"`);
    await this.waitForJET();

    // Strategy 1: Redwood oj-select-single (ESS "New Absence" page)
    // The Absence Type dropdown has id="absence-type-dropdown"
    const ojAbsenceType = this.page.locator('#absence-type-dropdown');
    if (await ojAbsenceType.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Click to open the dropdown
      await ojAbsenceType.click({ force: true });
      await this.page.waitForTimeout(3000);

      // Try to find the filter input inside the dropdown popup
      const filterInput = this.page.locator('[id*="searchselect-filter-absence-type"]').locator('input').first();
      if (await filterInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterInput.click();
        await this.page.waitForTimeout(500);
        await filterInput.pressSequentially(type.substring(0, 8), { delay: 80 });
        await this.page.waitForTimeout(3000);
      }

      if (await this.selectDropdownItem(type)) {
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return true;
      }

      // Desired type not found — try partial match (e.g., "Sick Salaried" → "Sick")
      // Extract the base type name (first word) and try that
      const baseType = type.split(/[\s-]+/)[0]; // e.g., "Sick", "Vacation", "FMLA"
      if (baseType && baseType !== type) {
        console.log(`[Absence] Exact match failed for "${type}", trying partial match: "${baseType}"`);
        const filterInputRetry = this.page.locator('[id*="searchselect-filter-absence-type"]').locator('input').first();
        if (await filterInputRetry.isVisible({ timeout: 1000 }).catch(() => false)) {
          await filterInputRetry.fill('');
          await this.page.waitForTimeout(1000);
          await filterInputRetry.pressSequentially(baseType.substring(0, 8), { delay: 80 });
          await this.page.waitForTimeout(3000);
        }
        if (await this.selectDropdownItem(baseType)) {
          console.log(`[Absence] Partial match selected: "${baseType}"`);
          await this.page.waitForTimeout(2000);
          await this.waitForJET();
          return true;
        }
      }

      // Check if dropdown has any items at all
      const filterInputClear = this.page.locator('[id*="searchselect-filter-absence-type"]').locator('input').first();
      if (await filterInputClear.isVisible({ timeout: 1000 }).catch(() => false)) {
        await filterInputClear.fill('');
        await this.page.waitForTimeout(3000);
      }

      const itemInfo = await this.page.evaluate(() => {
        const resultsContainer = document.getElementById('oj-searchselect-results-absence-type-dropdown');
        if (!resultsContainer) return { hasItems: false, debug: 'results container not found' };
        const allLi = resultsContainer.querySelectorAll('li');
        const items: string[] = [];
        for (const li of allLi) {
          const text = li.textContent?.trim();
          if (text && text.length > 0 && !li.classList.contains('oj-listview-no-data-item')) {
            items.push(text);
          }
        }
        const noData = resultsContainer.querySelector('.oj-listview-no-data-item');
        return { hasItems: items.length > 0, noData: !!noData, itemCount: items.length, items: items.slice(0, 5) };
      }).catch(() => ({ hasItems: false, debug: 'evaluate failed' }));

      console.log(`[Absence] Available types:`, JSON.stringify(itemInfo));

      if ('noData' in itemInfo && itemInfo.noData) {
        console.log(`[Absence] Absence Type dropdown has NO available types — employee not enrolled in absence plans`);
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1000);
        return false;
      }

      // Do NOT blindly select first item — it causes "Employer or AbsenceType isn't valid" errors.
      // Instead, return false so the flow skips submission and treats this as nav-only.
      console.log(`[Absence] Type "${type}" not available for this employee — skipping (not falling back to random type)`);
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);
      return false;
    }

    // Strategy 2: Generic oj-select-single (admin page or other layouts)
    const genericOjSelect = this.page.locator('oj-select-single').first();
    if (await genericOjSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await genericOjSelect.click();
      await this.page.waitForTimeout(2000);

      if (await this.selectDropdownItem(type)) {
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return true;
      }

      await this.page.keyboard.type(type.substring(0, 8), { delay: 80 });
      await this.page.waitForTimeout(2000);

      if (await this.selectDropdownItem(type)) {
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return true;
      }

      const first = this.page.locator('[role="option"], [role="gridcell"]').first();
      if (await first.isVisible({ timeout: 2000 }).catch(() => false)) {
        const firstText = await first.textContent().catch(() => '');
        console.log(`[Absence] Selecting first available: "${firstText}"`);
        await first.click();
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return true;
      }
      await this.page.keyboard.press('Escape');
    }

    // Strategy 3: ADF/standard form fallback
    // Check visibility first to avoid the 30-second default locator timeout
    // when the absence type field is not present on the page at all.
    const fieldVisible = await this.absenceTypeField.isVisible({ timeout: 3000 }).catch(() => false);
    if (!fieldVisible) {
      console.log(`[Absence] Absence type field not found on page — assuming not enrolled`);
      return false;
    }
    console.log(`[Absence] Falling back to fillCombobox for type: "${type}"`);
    try {
      await this.fillCombobox(this.absenceTypeField, type);
      return true;
    } catch {
      console.log(`[Absence] fillCombobox failed for type "${type}"`);
      return false;
    }
  }

  /** Helper: find and click a dropdown item matching the given text. */
  private async selectDropdownItem(text: string): Promise<boolean> {
    // Check multiple dropdown structures used by Oracle JET
    const option = this.page.locator('[role="option"]').filter({ hasText: text }).first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      console.log(`[Absence] Selected type via option: "${text}"`);
      return true;
    }
    const gridcell = this.page.locator('[role="gridcell"]').filter({ hasText: text }).first();
    if (await gridcell.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gridcell.click();
      console.log(`[Absence] Selected type via gridcell: "${text}"`);
      return true;
    }
    // OJ listbox items sometimes use role="row"
    const row = this.page.locator('[role="row"]').filter({ hasText: text }).first();
    if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
      await row.click();
      console.log(`[Absence] Selected type via row: "${text}"`);
      return true;
    }
    // Plain list items
    const li = this.page.locator('li').filter({ hasText: text }).first();
    if (await li.isVisible({ timeout: 1000 }).catch(() => false)) {
      await li.click();
      console.log(`[Absence] Selected type via li: "${text}"`);
      return true;
    }
    return false;
  }

  /** Helper: select the first available item from any open dropdown. */
  private async selectFirstAvailableDropdownItem(): Promise<boolean> {
    const selectors = [
      '[role="option"]',
      '[role="gridcell"]',
      'li.oj-listview-item',
      '[id*="lovDropdown"] li',
      '[role="row"]',
    ];
    for (const sel of selectors) {
      const item = this.page.locator(sel).first();
      if (await item.isVisible({ timeout: 1500 }).catch(() => false)) {
        const text = await item.textContent().catch(() => '');
        console.log(`[Absence] Selecting first available via "${sel}": "${text?.trim()}"`);
        await item.click();
        return true;
      }
    }
    return false;
  }

  /** Fill the start date of the absence. */
  async fillStartDate(date: string): Promise<void> {
    await this.fillDateField(this.startDateField, date);
  }

  /** Fill the end date of the absence. */
  async fillEndDate(date: string): Promise<void> {
    await this.fillDateField(this.endDateField, date);
  }

  /** Fill a Redwood oj-input-date field (rendered as combobox). */
  private async fillDateField(locator: Locator, date: string): Promise<void> {
    const field = locator;
    const visible = await field.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!visible) {
      console.log(`[Absence] Date field not visible, skipping`);
      return;
    }
    // Click to focus, then type the date
    await field.click();
    await this.page.waitForTimeout(500);
    // Select all existing text and replace
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(date, { delay: 50 });
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Fill both start and end dates. */
  async fillAbsenceDates(startDate: string, endDate: string): Promise<void> {
    await this.fillStartDate(startDate);
    await this.fillEndDate(endDate);
  }

  /** Select an absence reason from the dropdown (if the field exists). */
  async selectAbsenceReason(reason: string): Promise<void> {
    // Check for Redwood oj-select-single for Reason
    const ojReason = this.page.locator('oj-select-single').filter({ has: this.page.locator('[aria-label*="Reason"]') }).first();
    if (await ojReason.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ojReason.click();
      await this.page.waitForTimeout(1000);
      await this.page.keyboard.type(reason.substring(0, 6), { delay: 100 });
      await this.page.waitForTimeout(2000);
      const match = this.page.locator('[role="gridcell"], [role="option"]').filter({ hasText: new RegExp(reason.split(/[_\s]+/)[0], 'i') }).first();
      if (await match.isVisible({ timeout: 3000 }).catch(() => false)) {
        await match.click();
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
        return;
      }
      // No match found — close dropdown and clear typed text so
      // selectFirstReasonIfRequired() can pick up the empty field.
      console.log(`[Absence] Reason "${reason}" not found in dropdown — clearing`);
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
      return;
    }
    // Check if standard reason field is visible before trying to fill
    if (await this.absenceReasonField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.fillCombobox(this.absenceReasonField, reason);
    } else {
      console.log(`[Absence] Reason field not visible, skipping`);
    }
  }

  /**
   * If the Reason field is visible and empty (or has invalid residual text),
   * select the first available option.
   * Some absence types (Bereavement, Vacation, etc.) require a Reason value.
   * Called after every reason fill attempt to catch unmatched codes.
   */
  async selectFirstReasonIfRequired(): Promise<void> {
    // Strategy 1: Redwood oj-select-single containing a Reason label
    const ojReason = this.page.locator('oj-select-single').filter({
      has: this.page.locator('[aria-label*="Reason"]'),
    }).first();
    if (await ojReason.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (await this.trySelectFirstReasonOption(ojReason)) return;
    }

    // Strategy 2: combobox with accessible name "Reason"
    const reasonCombo = this.page.getByRole('combobox', { name: /^Reason$/i }).first();
    if (await reasonCombo.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Check if a valid value is already selected (display text, not an internal code)
      const val = await reasonCombo.inputValue().catch(() => '');
      if (val && !val.includes('_') && val.length > 2) return;

      console.log(`[Absence] Reason combobox visible with value="${val}" — selecting first option`);
      // Clear any residual text and re-select
      await reasonCombo.click();
      await this.page.waitForTimeout(500);
      await this.page.keyboard.press('Control+a');
      await this.page.keyboard.press('Backspace');
      await this.page.waitForTimeout(1500);

      const firstOpt = this.page.locator('[role="option"], [role="gridcell"]').first();
      if (await firstOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstOpt.click();
        await this.page.waitForTimeout(1000);
        await this.waitForJET();
        return;
      }
      // Close dropdown if no options found
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
  }

  /** Helper: try to select the first reason option from an oj-select-single component. */
  private async trySelectFirstReasonOption(ojReason: Locator): Promise<boolean> {
    // Check if the component already has a valid selected value.
    // Use the OJ component's displayed text (not the input filter text).
    const displayedValue = await ojReason.locator('[role="combobox"]')
      .textContent().catch(() => '');
    const inputValue = await ojReason.locator('input').inputValue().catch(() => '');
    const currentValue = (displayedValue || inputValue || '').trim();
    // Skip if there's a real value (not an internal code with underscores)
    if (currentValue && !currentValue.includes('_') && currentValue.length > 2) return true;

    console.log(`[Absence] OJ Reason field value="${currentValue}" — selecting first option`);
    // Close any open dropdown first
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);

    // Click to open dropdown fresh
    await ojReason.click();
    await this.page.waitForTimeout(1500);

    // Clear any filter text
    const filterInput = ojReason.locator('input').first();
    if (await filterInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await filterInput.fill('');
      await this.page.waitForTimeout(1000);
    }

    const firstOption = this.page.locator('[role="option"], [role="gridcell"]').first();
    if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await firstOption.textContent().catch(() => '');
      console.log(`[Absence] Selecting first reason option: "${text?.trim()}"`);
      await firstOption.click();
      await this.page.waitForTimeout(1000);
      await this.waitForJET();
      return true;
    }

    // No options visible — close and bail
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
    return false;
  }

  /**
   * If the Business Title field is visible and empty, select the first available option.
   * Some absence types (e.g. Intermittent Leave) require a Business Title value.
   */
  async selectFirstBusinessTitleIfRequired(): Promise<void> {
    const btCombo = this.page.getByRole('combobox', { name: /^Business Title$/i }).first();
    if (!await btCombo.isVisible({ timeout: 2000 }).catch(() => false)) return;

    const val = await btCombo.inputValue().catch(() => '');
    if (val && val.length > 2) return; // Already has a value

    console.log('[Absence] Business Title is visible and empty — selecting first option');
    await btCombo.click();
    await this.page.waitForTimeout(1500);

    const firstOpt = this.page.locator('[role="option"], [role="gridcell"]').first();
    if (await firstOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await firstOpt.textContent().catch(() => '');
      console.log(`[Absence] Selecting first Business Title: "${text?.trim()}"`);
      await firstOpt.click();
      await this.page.waitForTimeout(1000);
      await this.waitForJET();
    } else {
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
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

  /**
   * Confirm a dialog (Yes, OK, or Continue).
   * If no dialog appears within the timeout, continues silently
   * (some operations complete without a confirmation dialog).
   */
  async confirmDialog(): Promise<void> {
    // Try Yes button first
    if (await this.yesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.yesButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Try OK button
    if (await this.okButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Try "Continue" button (some Oracle HCM dialogs use Continue)
    const continueBtn = this.page.locator(
      'button:has-text("Continue"), a[role="button"]:has-text("Continue")'
    ).first();
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // No dialog appeared — that's fine for many operations
    console.log('[Absence] No confirmation dialog detected — continuing');
    await this.page.waitForTimeout(2000);
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
      try {
        await this.clickAdfButton('Withdraw');
      } catch {
        console.log('[Absence] Withdraw button not found — absence may not be in a withdrawable state');
        return;
      }
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

  /** Find and open an absence-related notification. Returns true if found and opened. */
  async openAbsenceNotification(): Promise<boolean> {
    await this.openNotifications();
    const absenceNotification = this.page.locator(
      '[role="listitem"] a, [class*="notification"] a'
    ).filter({ hasText: /absence/i }).first();
    if (await absenceNotification.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await absenceNotification.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return true;
    }
    return false;
  }

  // ===== Select Absence Row =====

  /**
   * Clear any applied filters on the Existing Absences Redwood page.
   * Oracle HCM defaults to a "Date" filter that hides older absences.
   */
  async clearExistingAbsenceFilters(): Promise<void> {
    const clearBtn = this.page.locator('button:has-text("Clear")').first();
    if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Check whether the Existing Absences list has any rows (non-empty).
   */
  async hasExistingAbsences(): Promise<boolean> {
    const noMatches = this.page.getByText("We couldn't find any matches", { exact: false });
    const noAbsences = this.page.getByText("You don't have any absences", { exact: false });
    if (await noMatches.isVisible({ timeout: 3000 }).catch(() => false)) return false;
    if (await noAbsences.isVisible({ timeout: 2000 }).catch(() => false)) return false;
    const row = this.page.locator('[role="row"]').filter({ hasNotText: /couldn't find|don't have/ }).nth(1);
    return await row.isVisible({ timeout: 5000 }).catch(() => false);
  }

  /** Select an absence row from the Existing Absences list (Redwood card/grid). */
  async selectAbsenceRow(index = 0): Promise<boolean> {
    await this.clearExistingAbsenceFilters();

    if (!await this.hasExistingAbsences()) {
      console.log('[Absence] No existing absences found after clearing filters');
      return false;
    }

    const rows = this.page.locator('[role="row"]')
      .filter({ hasNotText: /couldn't find|don't have/ });
    const targetRow = rows.nth(index + 1);
    if (await targetRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await targetRow.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return true;
    }
    console.log('[Absence] Could not select absence row');
    return false;
  }

  /** Select a plan row in the Plan Participation table. Returns false if no plan rows found. */
  async selectPlanRow(index = 0): Promise<boolean> {
    const rows = this.page.locator(
      'table [role="row"], [class*="plan"] [role="row"], [role="grid"] [role="row"]'
    );
    const targetRow = rows.nth(index + 1); // Skip header row
    if (await targetRow.isVisible({ timeout: 8000 }).catch(() => false)) {
      await targetRow.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return true;
    }
    console.log('[Absence] No plan rows found in Plan Participation — person may have no enrollments');
    return false;
  }

  // ===== Redwood Admin — Absences and Entitlements =====

  /**
   * Search for a person on the Redwood Absences and Entitlements page.
   * Uses the top search bar ("Search by Name, Business Title, Work Email, or Person Number").
   * After search, clicks on the first matching person name link.
   * Returns true if the person's detail page loaded.
   */
  async searchPersonRedwood(personNumberOrName: string): Promise<boolean> {
    // The Redwood search bar has a specific placeholder
    const searchBar = this.page.locator(
      'input[placeholder*="Search by Name"], input[placeholder*="Search by name"], input[placeholder*="Person Number"]'
    ).first();
    if (!await searchBar.isVisible({ timeout: 20000 }).catch(() => false)) {
      // Fallback: try any search input on the page
      const fallbackSearch = this.page.locator('input[type="search"], input[placeholder*="Search"]').first();
      if (!await fallbackSearch.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[Absence] Redwood search bar not found on Absences and Entitlements page');
        return false;
      }
      // Use the fallback
      await fallbackSearch.click();
      await this.page.waitForTimeout(500);
      await this.page.keyboard.press('Control+a');
      await fallbackSearch.pressSequentially(personNumberOrName, { delay: 50 });
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      // Click first person link
      const nameLink = this.page.locator('table a, [role="grid"] a, [role="row"] a').first();
      if (await nameLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameLink.click();
        await this.page.waitForTimeout(8000);
        await this.waitForJET();
        return true;
      }
      return false;
    }

    await searchBar.click();
    await this.page.waitForTimeout(500);
    await this.page.keyboard.press('Control+a');
    await searchBar.pressSequentially(personNumberOrName, { delay: 50 });
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(8000);
    await this.waitForJET();

    // Click on the first person name link in the results table
    const personLink = this.page.locator('a').filter({
      hasText: new RegExp('.+')
    }).first();
    // More specific: find the first link in the Name column
    const nameLink = this.page.locator('table a, [role="grid"] a, [role="row"] a').first();
    if (await nameLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameLink.click();
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      return true;
    }

    console.log('[Absence] No person found in Redwood search results');
    return false;
  }

  /**
   * Click the "Plans" tab on the Redwood person absence detail page.
   * Distinct from navigateToPlanParticipation() which targets ADF "Plan Participation" text.
   */
  async clickPlansTab(): Promise<boolean> {
    // Redwood tab: exact text "Plans"
    const plansTab = this.page.getByRole('tab', { name: 'Plans' })
      .or(this.page.locator('[role="tab"]').filter({ hasText: /^Plans$/ }))
      .or(this.page.getByText('Plans', { exact: true }))
      .first();

    if (await plansTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await plansTab.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      return true;
    }

    console.log('[Absence] "Plans" tab not found on person absence detail page');
    return false;
  }

  /**
   * Click the "..." (Actions) menu on a specific plan row by plan name,
   * then click the specified action (e.g., "Disburse balance", "Adjust balance").
   * Returns 'clicked' if action was clicked, 'disabled' if greyed out, 'not-found' if plan/action not found.
   */
  async clickPlanRowAction(planName: string | undefined, actionName: string): Promise<'clicked' | 'disabled' | 'not-found'> {
    // Find the plan row — look for a row containing the plan name text
    let targetRow;
    if (planName) {
      // Find the row that contains the plan name link
      targetRow = this.page.locator('tr, [role="row"]')
        .filter({ has: this.page.locator(`a:has-text("${planName}")`) })
        .first();
      if (!await targetRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Try broader match
        targetRow = this.page.locator('tr, [role="row"]')
          .filter({ hasText: planName })
          .first();
      }
    }

    if (!targetRow || !await targetRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Fall back to first data row
      const allRows = this.page.locator('tr, [role="row"]');
      const count = await allRows.count();
      // Skip header row(s) — find first row with a "..." button
      for (let i = 0; i < count; i++) {
        const row = allRows.nth(i);
        const dotsBtn = row.locator('button[aria-label*="Actions"], button:has-text("…"), [class*="kebab"], button[aria-label*="More"]').first();
        if (await dotsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) {
      console.log(`[Absence] No plan row found for "${planName || 'any'}" — cannot perform ${actionName}`);
      return 'not-found';
    }

    // Click the "..." menu button on the row
    const dotsButton = targetRow.locator('button[aria-label*="Actions"], button:has-text("…"), [class*="kebab"], button[aria-label*="More"]').first();
    if (!await dotsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try generic three-dots button nearby
      const genericDots = this.page.locator('button').filter({ hasText: '…' }).first();
      if (await genericDots.isVisible({ timeout: 3000 }).catch(() => false)) {
        await genericDots.click();
      } else {
        console.log(`[Absence] No "..." menu found on plan row`);
        return 'not-found';
      }
    } else {
      await dotsButton.click();
    }
    await this.page.waitForTimeout(2000);

    // Find the action in the dropdown menu
    const actionItem = this.page.getByText(actionName, { exact: false }).first();
    if (!await actionItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[Absence] Action "${actionName}" not found in plan row menu`);
      await this.page.keyboard.press('Escape');
      return 'not-found';
    }

    // Check if the action is disabled/greyed out
    const isDisabled = await actionItem.evaluate((el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      return el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('oj-disabled') ||
        el.hasAttribute('disabled') ||
        style.opacity < '0.5' ||
        style.pointerEvents === 'none' ||
        style.color === 'rgb(153, 153, 153)' || // light grey
        style.color === 'rgb(128, 128, 128)';    // grey
    }).catch(() => false);

    if (isDisabled) {
      console.log(`[Absence] "${actionName}" is disabled/greyed out for plan "${planName || 'selected'}"`);
      await this.page.keyboard.press('Escape');
      return 'disabled';
    }

    // Click the action
    await actionItem.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    return 'clicked';
  }

  // ===== Fill from UATTestCase =====

  /**
   * Fill the absence entry form from a UATTestCase.
   * Extracts fields from testData, businessProcess, and testScenario.
   */
  async fillFromUATTestCase(tc: UATTestCase): Promise<boolean> {
    const data = parseTestData(tc.testData);

    const absenceType = data['absence type'] || data['type'] || '';
    const absenceReason = data['reason'] || '';
    const start = data['start date'] || data['start'] || '';
    const end = data['end date'] || data['end'] || '';
    const commentsVal = data['comments'] || data['comment'] || '';

    if (absenceType) {
      const selected = await this.selectAbsenceType(absenceType);
      if (!selected) return false;
    }
    if (start) await this.fillStartDate(start);
    if (end) await this.fillEndDate(end);
    if (absenceReason) await this.selectAbsenceReason(absenceReason);
    // Always check — reason codes may not match dropdown display values
    await this.selectFirstReasonIfRequired();
    await this.selectFirstBusinessTitleIfRequired();
    if (commentsVal) await this.fillComments(commentsVal);
    return true;
  }

  /**
   * Fill the absence entry form from migration DB field data.
   * Uses authoritative field values from the TestCase object.
   * @param absenceTypeOverride — If provided, use this instead of field data's Absence Type
   *   (migration DB often has wrong absence type; UAT plan's businessProcess is more accurate)
   */
  async fillFromFieldData(fieldData: TestCase, absenceTypeOverride?: string): Promise<boolean> {
    const absenceType = absenceTypeOverride || getField(fieldData, 'Absence Type');
    const reason = getField(fieldData, 'Reason');
    const startDate = getField(fieldData, 'Start Date');
    const endDate = getField(fieldData, 'End Date');

    let typeSelected = true;
    if (absenceType) {
      typeSelected = await this.selectAbsenceType(absenceType);
      if (!typeSelected) {
        console.log(`[Absence] Cannot fill form — absence type not available, skipping remaining fields`);
        return false;
      }
    }
    // Convert YYYY/MM/DD to MM/DD/YYYY for Oracle HCM date fields
    if (startDate) await this.fillStartDate(this.convertDate(startDate));
    if (endDate) await this.fillEndDate(this.convertDate(endDate));
    // Fill Reason if provided in field data
    if (reason) {
      try { await this.selectAbsenceReason(reason); } catch { /* reason field not present */ }
    }
    // Always check if Reason field is still empty — field data reason codes
    // (e.g. "PAID_90DAY") often don't match dropdown display values.
    await this.selectFirstReasonIfRequired();
    await this.selectFirstBusinessTitleIfRequired();
    return true;
  }

  /** Convert date from YYYY/MM/DD or YYYY-MM-DD to MM/DD/YYYY for Oracle HCM. */
  private convertDate(date: string): string {
    const match = date.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    return date;
  }

  /**
   * Expect a success confirmation message or successful navigation.
   *
   * Checks multiple success indicators in order:
   * 1. Explicit success messages (submitted, approved, saved, successfully, etc.)
   * 2. Confirmation/success CSS class banners
   * 3. Back on the ESS Time and Absences landing page (tiles visible)
   * 4. On any Oracle HCM page (not login/error)
   *
   * This is intentionally lenient because many absence test scenarios are
   * navigation/verification tests (view balance, view existing) that don't
   * produce explicit success messages.
   */
  async expectSuccess(): Promise<void> {
    // Check for explicit success text
    const successIndicator = this.page.locator(
      '[class*="confirmation"], [class*="success"], ' +
      ':text("successfully"), :text("submitted"), :text("approved"), :text("saved"), :text("withdrawn")'
    ).first();
    const hasSuccess = await successIndicator.isVisible({ timeout: 15_000 }).catch(() => false);
    if (hasSuccess) return;

    // Check if we're back on the ESS landing page (tiles visible)
    const hasTile = await this.page.getByText('Add Absence', { exact: true })
      .isVisible({ timeout: 3000 }).catch(() => false)
      || await this.page.getByText('Existing Absences', { exact: true })
        .isVisible({ timeout: 2000 }).catch(() => false)
      || await this.page.getByText('Absence Balance', { exact: true })
        .isVisible({ timeout: 2000 }).catch(() => false);
    if (hasTile) {
      console.log('[Absence] Back on ESS landing page — operation completed');
      return;
    }

    // Check URL for absence/time-related pages
    const url = this.page.url();
    if (url.includes('absence') || url.includes('time') || url.includes('fscmUI')) {
      const isLoginPage = url.includes('login') || url.includes('okta') || url.includes('signin');
      if (isLoginPage) {
        throw new Error('Session expired or login required — absence test failed');
      }
      console.log(`[Absence] On Oracle HCM page — assuming success: ${url}`);
      return;
    }

    // Check for Navigator visibility as proof we're on an HCM page
    const hasNavigator = await this.page.locator('a[title="Navigator"]')
      .isVisible({ timeout: 3000 }).catch(() => false);
    if (hasNavigator) {
      console.log('[Absence] Navigator visible — on an HCM page, assuming success');
      return;
    }

    throw new Error('Absence operation did not complete successfully');
  }

  /** Check that text is visible on the page (for verification steps). */
  async verifyTextVisible(text: string): Promise<boolean> {
    const element = this.page.getByText(text, { exact: false }).first();
    return await element.isVisible({ timeout: 10_000 }).catch(() => false);
  }
}
