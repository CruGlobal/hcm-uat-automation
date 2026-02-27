import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase } from '../../data/types';

/**
 * Timecard page object for Oracle HCM Time and Labor.
 *
 * Covers both Redwood and Classic ADF UI patterns:
 * - Redwood ESS: Me > Time and Absences > Current/Add Time Card (card tiles)
 * - Redwood Manager: My Team > Quick Actions > Team Time Cards
 * - Classic ADF: My Client Groups > Time Management > Team Time Cards
 * - Admin: Time Management > Tasks panel > Scheduled Processes
 *
 * Test script mapping:
 * - HCM.OTL.1xx: Generate Timecard for Exempt (admin scheduled process)
 * - HCM.OTL.2xx: Generate Time Events (admin)
 * - HCM.OTL.3xx: Create Timecard in Redwood UI (employee ESS)
 * - HCM.OTL.4xx: Edit Existing Timecard in Redwood UI (manager)
 * - HCM.OTL.5xx: Mass Action Using Existing Timecard (manager)
 * - HCM.OTL.6xx: Create Timecard in Classic UI (manager)
 * - HCM.OTL.7xx: Edit Timecard in Classic UI (manager)
 * - HCM.OTL.8xx: Mass Action of Timecard in Classic UI (manager)
 * - HCM.OTL.9xx: Evaluate HCM Group (admin scheduled process)
 * - HCM.OTL.10xx: Employee View Current Timecard
 * - HCM.OTL.11xx: Employee View Existing Timecard
 * - HCM.OTL.12xx: Absence on Timecard
 * - HCM.OTL.13xx: Employee Prints Timecard
 * - HCM.OTL.14xx: Employee requests time change
 * - HCM.OTL.15xx: Manager Approves Via Bell
 * - HCM.OTL.16xx: Manager Updates Time Card
 * - HCM.OTL.17xx: Manager Creates Team Time Card
 * - HCM.OTL.18xx: Manager Approves Time Card from Redwood UI
 * - HCM.OTL.19xx: Admin Mass Submit Time Cards
 * - HCM.OTL.20xx: Admin Mass Approve Time Cards
 * - HCM.OTL.21xx: Employee Approves Own TimeCard
 */
export class TimecardPage extends BasePage {

  // ===================== Redwood ESS Card Tiles =====================
  // The ESS "Time and Absences" page shows card tiles for common actions.

  /** "Current Time Card" tile on the ESS Time and Absences page. */
  private readonly currentTimecardTile = this.page.getByRole('link', { name: /Current Time\s*Card/i }).or(
    this.page.locator('[class*="card"], [class*="tile"]').filter({ hasText: /Current Time\s*Card/i })
  ).first();

  /** "Add Time Card" tile on the ESS Time and Absences page. */
  private readonly addTimecardTile = this.page.getByRole('link', { name: /Add Time\s*Card/i }).or(
    this.page.locator('[class*="card"], [class*="tile"]').filter({ hasText: /Add Time\s*Card/i })
  ).first();

  /** "Existing Time Cards" tile/link on the ESS page. */
  private readonly existingTimecardsTile = this.page.getByRole('link', { name: /Existing Time\s*Cards/i }).or(
    this.page.locator('[class*="card"], [class*="tile"]').filter({ hasText: /Existing Time\s*Cards/i })
  ).first();

  /** "Request Time Changes" tile/link on the ESS page. */
  private readonly requestTimeChangesTile = this.page.getByRole('link', { name: /Request Time Changes/i }).or(
    this.page.locator('[class*="card"], [class*="tile"]').filter({ hasText: /Request Time Changes/i })
  ).first();

  // ===================== Redwood Timecard Entry =====================
  // After clicking "Add Time Card" or "Current Time Card", the Redwood
  // timecard entry form appears with weekly grid.

  /** Assignment Number dropdown on the Redwood timecard form. */
  private readonly assignmentNumber = this.page.locator(
    '[aria-label*="Assignment"], select[aria-label*="Assignment"], ' +
    'oj-select-single[aria-label*="Assignment"], [id*="assignment"]'
  ).first();

  /** Hours Type / Payroll Time Type dropdown on Redwood timecard. */
  private readonly hoursType = this.page.locator(
    '[aria-label*="Hours Type"], [aria-label*="Time Type"], ' +
    'oj-select-single[aria-label*="Hours"], select[aria-label*="Hours Type"], ' +
    '[id*="hoursType"], [id*="TimeType"], [id*="payrollTimeType"]'
  ).first();

  /** Absence Reason field (shows when entering absence-type hours). */
  private readonly absenceReason = this.page.locator(
    '[aria-label*="Absence Reason"], select[aria-label*="Absence Reason"], ' +
    '[id*="AbsenceReason"], [id*="absenceReason"]'
  ).first();

  /** Timecard period selector (date range or calendar selection). */
  private readonly timecardPeriod = this.page.locator(
    '[aria-label*="Period"], [aria-label*="Time Card Period"], ' +
    'oj-select-single[aria-label*="Period"], [id*="timePeriod"], [id*="TimePeriod"]'
  ).first();

  /** Hours input cells in the weekly grid (one per day column). */
  private readonly hoursInputs = this.page.locator(
    'input[aria-label*="Hours"], input[aria-label*="hours"], ' +
    'input[type="number"][id*="hours"], oj-input-number[aria-label*="Hours"] input'
  );

  /** Comments / notes text area on the Redwood timecard form. */
  private readonly comments = this.page.locator(
    'textarea[aria-label*="Comment"], oj-text-area[aria-label*="Comment"] textarea, ' +
    'textarea[id*="Comment"], [id*="comments"]'
  ).first();

  /** "Add Row" button/icon to add a new time type row. */
  private readonly addRowButton = this.page.getByRole('button', { name: /Add/i }).or(
    this.page.locator('button[aria-label*="Add"], a[aria-label*="Add Row"], [id*="addRow"]')
  ).first();

  // ===================== Attestation =====================
  // On submit, Oracle HCM may show an attestation dialog.

  /** Attestation dropdown (select answer from dropdown). */
  private readonly attestationDropdown = this.page.locator(
    'select[aria-label*="Attest"], oj-select-single[aria-label*="Attest"], ' +
    '[id*="Attest"], [id*="attest"]'
  ).first();

  /** Attestation checkbox (alternative format). */
  private readonly attestationCheckbox = this.page.locator(
    'input[type="checkbox"][aria-label*="attest" i], oj-checkbox[aria-label*="attest" i] input'
  ).first();

  // ===================== Action Buttons =====================

  /** Submit button (Redwood or Classic). */
  private readonly submitButton = this.page.getByRole('button', { name: 'Submit' }).or(
    this.page.locator('a[role="button"]:has-text("Submit"), [id*="Submit"]')
  ).first();

  /** "Submit and Close" button (Redwood attestation dialog). */
  private readonly submitAndCloseButton = this.page.getByRole('button', { name: /Submit and Close/i }).or(
    this.page.locator('a[role="button"]:has-text("Submit and Close")')
  ).first();

  /** Save button. */
  private readonly saveButton = this.page.getByRole('button', { name: 'Save' }).or(
    this.page.locator('a[role="button"]:has-text("Save"), [id*="Save"]')
  ).first();

  /** "Save and Close" button. */
  private readonly saveAndCloseButton = this.page.getByRole('button', { name: /Save and Close/i }).or(
    this.page.locator('a[role="button"]:has-text("Save and Close")')
  ).first();

  /** Recall button (to recall a submitted timecard). */
  private readonly recallButton = this.page.getByRole('button', { name: 'Recall' }).or(
    this.page.locator('a[role="button"]:has-text("Recall"), [id*="Recall"]')
  ).first();

  /** Actions menu button (Redwood team time cards page). */
  private readonly actionsButton = this.page.getByRole('button', { name: /^Actions$/i }).or(
    this.page.locator('button[aria-label="Actions"], [id*="Actions"]')
  ).first();

  /** Close button (after viewing a timecard). */
  private readonly closeButton = this.page.getByRole('button', { name: 'Close' }).or(
    this.page.locator('a[role="button"]:has-text("Close")')
  ).first();

  /** Print button (employee prints timecard). */
  private readonly printButton = this.page.getByRole('button', { name: 'Print' }).or(
    this.page.locator('a[role="button"]:has-text("Print"), [id*="Print"]')
  ).first();

  // ===================== Manager / Approval =====================

  /** Approve button (manager or admin view). */
  private readonly approveButton = this.page.getByRole('button', { name: 'Approve' }).or(
    this.page.locator('a[role="button"]:has-text("Approve"), [id*="Approve"]')
  ).first();

  /** Reject button (manager view). */
  private readonly rejectButton = this.page.getByRole('button', { name: 'Reject' }).or(
    this.page.locator('a[role="button"]:has-text("Reject"), [id*="Reject"]')
  ).first();

  /** Request More Info button (manager view). */
  private readonly requestInfoButton = this.page.getByRole('button', { name: /Request More Info/i }).or(
    this.page.locator('a[role="button"]:has-text("Request More Info"), [id*="RequestInfo"]')
  ).first();

  /** OK button for confirmation dialogs. */
  private readonly okButton = this.page.getByRole('button', { name: 'OK' }).or(
    this.page.locator('button:has-text("OK"), a[role="button"]:has-text("OK")')
  ).first();

  // ===================== Notifications Bell =====================

  /** Notifications bell icon (top-right of page). */
  private readonly notificationsBell = this.page.locator(
    '[id*="notification"], a[title="Notifications"], ' +
    'button[aria-label*="Notification"], [class*="notification-icon"]'
  ).first();

  // ===================== Classic ADF Team Time Cards =====================

  /** "Team Time Cards" link in the Time Management sidebar. */
  private readonly teamTimeCardsLink = this.page.locator(
    'a:has-text("Team Time Cards"), [id*="TeamTimeCards"], [id*="teamTimeCards"]'
  ).first();

  /** Create ("+") button on the Classic Team Time Cards page. */
  private readonly createTimecardButton = this.page.locator(
    'a[title="Create"], button[title="Create"], [id*="Create"], ' +
    'a[aria-label="Create"]'
  ).first();

  /** Person Name search input on Classic Team Time Cards. */
  private readonly classicPersonName = this.page.locator(
    'input[id*="PersonName"], input[id*="personName"], ' +
    'input[aria-label*="Person Name"], input[aria-label*="Person"]'
  ).first();

  /** Person Number search input on Classic Team Time Cards. */
  private readonly classicPersonNumber = this.page.locator(
    'input[id*="PersonNumber"], input[id*="personNumber"], ' +
    'input[aria-label*="Person Number"]'
  ).first();

  /** From Date input on search criteria. */
  private readonly fromDate = this.page.locator(
    'input[id*="FromDate"], input[id*="fromDate"], input[aria-label*="From"]'
  ).first();

  /** To Date input on search criteria. */
  private readonly toDate = this.page.locator(
    'input[id*="ToDate"], input[id*="toDate"], input[aria-label*="To"]'
  ).first();

  /** Search button on Classic Team Time Cards. */
  private readonly searchButton = this.page.getByRole('button', { name: 'Search' }).or(
    this.page.locator('[id*="search" i][id*="btn" i], a[role="button"]:has-text("Search")')
  ).first();

  /** Classic ADF Assignment Number dropdown. */
  private readonly classicAssignment = this.page.locator(
    'input[id*="AssignmentNumber"], select[id*="AssignmentNumber"], ' +
    '[aria-label*="Assignment Number"]'
  ).first();

  /** Classic ADF Time Type dropdown. */
  private readonly classicTimeType = this.page.locator(
    'input[id*="TimeType"], select[id*="TimeType"], [aria-label*="Time Type"]'
  ).first();

  /** "More Actions" dropdown on Classic ADF (contains Submit option). */
  private readonly moreActionsButton = this.page.locator(
    'a:has-text("More Actions"), button:has-text("More Actions"), ' +
    '[id*="MoreActions"], [id*="moreActions"]'
  ).first();

  /** "Add" button on Classic ADF create timecard page. */
  private readonly classicAddButton = this.page.getByRole('button', { name: 'Add' }).or(
    this.page.locator('a[role="button"]:has-text("Add")')
  ).first();

  // ===================== Admin / Scheduled Processes =====================

  /** Tasks panel link on the right side of Time Management page. */
  private readonly tasksPanel = this.page.locator(
    'a[title="Tasks"], button[aria-label="Tasks"], ' +
    '[id*="taskPanel"], [id*="tasksPanel"]'
  ).first();

  /** "Generate Time Cards" link in the Tasks panel. */
  private readonly generateTimeCardsLink = this.page.locator(
    'a:has-text("Generate Time Cards"), [id*="GenerateTimeCards"]'
  ).first();

  /** "Time Events" link in the Tasks panel. */
  private readonly timeEventsLink = this.page.locator(
    'a:has-text("Time Events"), [id*="TimeEvents"]'
  ).first();

  /** "Scheduled Processes" link in the Tasks panel. */
  private readonly scheduledProcessesLink = this.page.locator(
    'a:has-text("Scheduled Processes"), [id*="ScheduledProcesses"]'
  ).first();

  /** "Schedule New Process" button. */
  private readonly scheduleNewProcessButton = this.page.getByRole('button', { name: /Schedule New Process/i }).or(
    this.page.locator('a:has-text("Schedule New Process"), [id*="ScheduleNewProcess"]')
  ).first();

  /** Process name search input in the Scheduled Processes dialog. */
  private readonly processNameSearch = this.page.locator(
    'input[aria-label*="Name"], input[id*="ProcessName"], input[id*="processName"], ' +
    'input[aria-label*="Search"]'
  ).first();

  /** Group Name search input (for Generate Time Cards, HCM Group eval). */
  private readonly groupNameField = this.page.locator(
    'input[aria-label*="Group Name"], input[id*="GroupName"], input[id*="groupName"]'
  ).first();

  /** Status filter dropdown (for filtering timecards by status). */
  private readonly statusFilter = this.page.locator(
    'select[aria-label*="Status"], [aria-label*="Status"], ' +
    'oj-select-single[aria-label*="Status"], [id*="StatusFilter"], [id*="status"]'
  ).first();

  /** Select-all checkbox at the top of search results table. */
  private readonly selectAllCheckbox = this.page.locator(
    'th input[type="checkbox"], th [role="checkbox"], ' +
    'table thead input[type="checkbox"]'
  ).first();

  /** "View Time Totals" button (on Redwood timecard view). */
  private readonly viewTimeTotalsButton = this.page.getByRole('button', { name: /View Time Totals/i }).or(
    this.page.locator('a:has-text("View Time Totals")')
  ).first();

  /** "View Calculated Time" button (on timecard view). */
  private readonly viewCalculatedTimeButton = this.page.getByRole('button', { name: /View Calculated Time/i }).or(
    this.page.locator('a:has-text("View Calculated Time")')
  ).first();

  /** Refresh icon/button on Scheduled Processes page. */
  private readonly refreshButton = this.page.locator(
    'a[title="Refresh"], button[title="Refresh"], button[aria-label="Refresh"], ' +
    '[id*="refresh" i]'
  ).first();

  /** Export to Excel icon. */
  private readonly exportExcelButton = this.page.locator(
    'a[title*="Export"], button[title*="Export"], [id*="export" i]'
  ).first();

  // ===================== Confirmation / Status =====================

  /** Confirmation message/banner after submission or approval. */
  private readonly confirmationBanner = this.page.locator(
    '[class*="confirmation"], [class*="success"], ' +
    '[role="alert"]:has-text("submitted"), [role="alert"]:has-text("approved"), ' +
    '[role="alert"]:has-text("saved")'
  ).first();

  /** "Time card was submitted" popup message. */
  private readonly timecardSubmittedMessage = this.page.getByText(/time\s*card\s*was\s*submitted/i).first();

  /** Process "Succeeded" status text on Scheduled Processes page. */
  private readonly processSucceededStatus = this.page.getByText('Succeeded').first();

  // ===================== ESS Tile Click Methods =====================

  /** Click the "Current Time Card" tile on the ESS page. */
  async clickCurrentTimeCard(): Promise<void> {
    await this.currentTimecardTile.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Add Time Card" tile on the ESS page. */
  async clickAddTimeCard(): Promise<void> {
    await this.addTimecardTile.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Existing Time Cards" tile on the ESS page. */
  async clickExistingTimeCards(): Promise<void> {
    await this.existingTimecardsTile.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Request Time Changes" tile on the ESS page. */
  async clickRequestTimeChanges(): Promise<void> {
    await this.requestTimeChangesTile.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===================== Redwood Timecard Entry =====================

  /**
   * Create a timecard in the Redwood UI (employee self-service).
   * Follows HCM.OTL.301.00 steps:
   * 1. Select Assignment Number
   * 2. Select Hours Type (Regular, etc.)
   * 3. Enter hours per day
   * 4. Add additional hours types if needed
   * 5. Enter comments if applicable
   */
  async createTimecardRedwood(options: {
    assignmentNumber?: string;
    hoursType?: string;
    hours?: string;
    absenceReason?: string;
    commentsText?: string;
  } = {}): Promise<void> {
    // Select assignment number if provided
    if (options.assignmentNumber) {
      await this.selectAssignment(options.assignmentNumber);
    }

    // Select hours type (e.g., "Regular")
    if (options.hoursType) {
      await this.selectHoursType(options.hoursType);
    }

    // Enter daily hours
    if (options.hours) {
      await this.enterWeeklyHours(options.hours);
    }

    // Fill absence reason if needed
    if (options.absenceReason) {
      await this.fillAbsenceReason(options.absenceReason);
    }

    // Enter comments
    if (options.commentsText) {
      await this.fillComments(options.commentsText);
    }
  }

  /**
   * Edit an existing timecard in the Redwood UI (manager).
   * Follows HCM.OTL.401.00 steps:
   * 1. Search for employee and time card week
   * 2. Select timecard checkbox and click Action > Edit
   * 3. Update hours or add new row
   * 4. Submit
   */
  async editTimecardRedwood(options: {
    personName?: string;
    fromDate?: string;
    toDate?: string;
    hoursType?: string;
    hours?: string;
  } = {}): Promise<void> {
    // Search for the timecard
    if (options.personName) {
      await this.searchPerson(options.personName);
    }
    if (options.fromDate) {
      await this.setFromDate(options.fromDate);
    }
    if (options.toDate) {
      await this.setToDate(options.toDate);
    }

    await this.clickSearch();

    // Select the first timecard row
    await this.selectFirstTimecardRow();

    // Click Actions > Edit
    await this.clickAction('Edit');

    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Update hours if provided
    if (options.hoursType) {
      await this.selectHoursType(options.hoursType);
    }
    if (options.hours) {
      await this.enterWeeklyHours(options.hours);
    }
  }

  /**
   * Create a timecard in the Classic ADF UI (manager).
   * Follows HCM.OTL.601.00 steps:
   * 1. Navigate to Time Management > Team Time Cards
   * 2. Click "+" (create)
   * 3. Enter Person Name and select employee
   * 4. Select Time card period on calendar and click Add
   * 5. Enter Assignment Number and Time Type
   * 6. Enter hours for each day
   * 7. Save
   */
  async createTimecardClassic(options: {
    personName?: string;
    assignmentNumber?: string;
    timeType?: string;
    hours?: string;
    period?: string;
  } = {}): Promise<void> {
    // Click Team Time Cards in the sidebar
    await this.clickTeamTimeCards();

    // Click the create "+" button
    await this.clickCreateTimecard();

    // Enter person name
    if (options.personName) {
      await this.fillCombobox(this.classicPersonName, options.personName);
    }

    // Select period and click Add
    if (options.period) {
      await this.selectTimecardPeriod(options.period);
    }
    await this.clickClassicAdd();

    // Enter assignment and time type
    if (options.assignmentNumber) {
      await this.fillCombobox(this.classicAssignment, options.assignmentNumber);
    }
    if (options.timeType) {
      await this.fillCombobox(this.classicTimeType, options.timeType);
    }

    // Enter hours
    if (options.hours) {
      await this.enterWeeklyHours(options.hours);
    }
  }

  /**
   * Edit a timecard in the Classic ADF UI (manager).
   * Follows HCM.OTL.701.00 steps:
   * 1. Navigate to Team Time Cards
   * 2. Search for employee by name/number and date range
   * 3. Click on the date range hyperlink
   * 4. Update fields
   */
  async editTimecardClassic(options: {
    personName?: string;
    fromDate?: string;
    toDate?: string;
    timeType?: string;
    hours?: string;
  } = {}): Promise<void> {
    // Click Team Time Cards in the sidebar
    await this.clickTeamTimeCards();

    // Search for the employee
    if (options.personName) {
      await this.fillField(this.classicPersonName, options.personName);
    }
    if (options.fromDate) {
      await this.setFromDate(options.fromDate);
    }
    if (options.toDate) {
      await this.setToDate(options.toDate);
    }

    await this.clickSearch();

    // Click the first date range hyperlink in search results
    const dateRangeLink = this.page.locator(
      'table a[id*="timecard"], table a[class*="link"], td a'
    ).first();
    if (await dateRangeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dateRangeLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Update time type and hours
    if (options.timeType) {
      await this.fillCombobox(this.classicTimeType, options.timeType);
    }
    if (options.hours) {
      await this.enterWeeklyHours(options.hours);
    }
  }

  // ===================== Submit / Attestation =====================

  /**
   * Submit the current timecard.
   * Handles both Redwood (with attestation dialog) and Classic (with confirmation popup).
   */
  async submitTimecard(): Promise<void> {
    // Try Redwood submit button first
    const redwoodSubmit = await this.submitButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (redwoodSubmit) {
      await this.submitButton.click();
    } else {
      // Try Classic ADF: More Actions > Submit
      const moreActions = await this.moreActionsButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (moreActions) {
        await this.moreActionsButton.click();
        await this.page.waitForTimeout(1000);
        const submitOption = this.page.getByText('Submit', { exact: true }).first();
        await submitOption.click();
      } else {
        await this.clickAdfButton('Submit');
      }
    }

    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Handle attestation dialog if it appears
    await this.handleAttestation();

    // Handle confirmation popup (Classic UI shows OK dialog)
    await this.handleConfirmationDialog();
  }

  /**
   * Handle the attestation dialog that appears on submit.
   * Follows HCM.OTL.301.00 steps 6-8:
   * - Attestation question displays
   * - Select answer from dropdown
   * - Click Submit and Close
   */
  async handleAttestation(): Promise<void> {
    // Check for attestation dropdown
    const hasDropdown = await this.attestationDropdown.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasDropdown) {
      // Select the first available answer (typically "Yes" or affirmative)
      await this.attestationDropdown.selectOption({ index: 1 }).catch(async () => {
        // If it's an oj-select-single, use fillCombobox instead
        await this.fillCombobox(this.attestationDropdown, 'Yes');
      });
      await this.page.waitForTimeout(1000);
    }

    // Check for attestation checkbox
    const hasCheckbox = await this.attestationCheckbox.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCheckbox) {
      await this.attestationCheckbox.check();
      await this.waitForJET();
    }

    // Click "Submit and Close" if visible
    const hasSubmitAndClose = await this.submitAndCloseButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasSubmitAndClose) {
      await this.submitAndCloseButton.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Handle OK confirmation dialog (Classic UI). */
  async handleConfirmationDialog(): Promise<void> {
    const hasOk = await this.okButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasOk) {
      await this.okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Attest the timecard (standalone attestation, not part of submit).
   * Some flows require attestation before or after submission.
   */
  async attestTimecard(): Promise<void> {
    const hasDropdown = await this.attestationDropdown.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasDropdown) {
      await this.attestationDropdown.selectOption({ index: 1 }).catch(async () => {
        await this.fillCombobox(this.attestationDropdown, 'Yes');
      });
      await this.page.waitForTimeout(1000);
      await this.waitForJET();
      return;
    }

    const hasCheckbox = await this.attestationCheckbox.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCheckbox) {
      await this.attestationCheckbox.check();
      await this.waitForJET();
    }
  }

  // ===================== Save / Recall / Close =====================

  /** Click Save and wait for processing. */
  async clickSave(): Promise<void> {
    const isVisible = await this.saveButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.saveButton.click();
    } else {
      await this.clickAdfButton('Save');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /** Click "Save and Close" button. */
  async clickSaveAndClose(): Promise<void> {
    const isVisible = await this.saveAndCloseButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.saveAndCloseButton.click();
    } else {
      await this.clickAdfButton('Save and Close');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /** Click Recall to recall a submitted timecard. */
  async clickRecall(): Promise<void> {
    const isVisible = await this.recallButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.recallButton.click();
    } else {
      await this.clickAdfButton('Recall');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /** Click Close button. */
  async clickClose(): Promise<void> {
    const isVisible = await this.closeButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.closeButton.click();
    } else {
      await this.clickAdfButton('Close');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Click Print button. */
  async clickPrint(): Promise<void> {
    const isVisible = await this.printButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.printButton.click();
    } else {
      await this.clickAdfButton('Print');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ===================== Manager Approval Actions =====================

  /**
   * Approve a timecard (manager action).
   * Follows HCM.OTL.1802.00: Team Time Cards > search submitted > select > Action > Approve
   */
  async approveTimecard(personName?: string): Promise<void> {
    if (personName) {
      await this.searchPerson(personName);
      await this.clickSearch();
    }

    // Select the first timecard row
    await this.selectFirstTimecardRow();

    // Click Actions > Approve (or direct Approve button)
    const hasApproveBtn = await this.approveButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasApproveBtn) {
      await this.approveButton.click();
    } else {
      await this.clickAction('Approve');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /**
   * Reject a timecard (manager action).
   * @param personName Optional person to search for
   * @param reason Optional rejection reason
   */
  async rejectTimecard(personName?: string, reason?: string): Promise<void> {
    if (personName) {
      await this.searchPerson(personName);
      await this.clickSearch();
    }

    // Select the first timecard row
    await this.selectFirstTimecardRow();

    // Click Reject
    const hasRejectBtn = await this.rejectButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasRejectBtn) {
      await this.rejectButton.click();
    } else {
      await this.clickAction('Reject');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Enter rejection reason if a comments field appears
    if (reason) {
      const reasonField = this.page.locator(
        'textarea[aria-label*="Reason"], textarea[aria-label*="Comment"], textarea'
      ).first();
      const hasReason = await reasonField.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasReason) {
        await this.fillField(reasonField, reason);
      }
    }

    await this.handleConfirmationDialog();
  }

  /**
   * Mass approve/submit timecards.
   * Follows HCM.OTL.501.00 (Redwood) and HCM.OTL.801.00 (Classic):
   * 1. Search for timecards
   * 2. Select all rows
   * 3. Click Actions > Submit or Approve
   */
  async massApproveTimecards(action: 'Submit' | 'Approve' = 'Approve'): Promise<void> {
    // Select all timecards
    const hasSelectAll = await this.selectAllCheckbox.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSelectAll) {
      await this.selectAllCheckbox.check();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }

    // Click the mass action
    await this.clickAction(action);
    await this.page.waitForTimeout(10000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /**
   * Approve via the notifications bell (Manager approves via bell).
   * Follows HCM.OTL.1501.00 and HCM.OTL.1801.00.
   */
  async approveViaBell(): Promise<void> {
    // Click the notifications bell
    await this.notificationsBell.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Click on the first notification related to time
    const notification = this.page.locator(
      '[class*="notification"] a, [role="listitem"] a, [id*="notification"] a'
    ).first();
    const hasNotification = await notification.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasNotification) {
      await notification.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Approve the request
    const hasApproveBtn = await this.approveButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasApproveBtn) {
      await this.approveButton.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Request more info on a timecard (manager action). */
  async requestMoreInfo(): Promise<void> {
    const isVisible = await this.requestInfoButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.requestInfoButton.click();
    } else {
      await this.clickAdfButton('Request More Info');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  // ===================== Web Clock =====================

  /**
   * View and interact with the web clock.
   * Web clock punches are imported via scheduled process
   * (HCM.OTL.202.00: Generate Time Cards from Time Collection Devices).
   */
  async viewWebClock(): Promise<void> {
    // Web clock is typically accessed via a specific URL or tile
    const webClockTile = this.page.getByText(/Web Clock/i).first();
    const hasWebClock = await webClockTile.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasWebClock) {
      await webClockTile.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Clock In via web clock. */
  async clockIn(): Promise<void> {
    const clockInBtn = this.page.getByRole('button', { name: /Clock In/i }).or(
      this.page.locator('a[role="button"]:has-text("Clock In")')
    ).first();
    const isVisible = await clockInBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await clockInBtn.click();
    } else {
      await this.clickAdfButton('Clock In');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Clock Out via web clock. */
  async clockOut(): Promise<void> {
    const clockOutBtn = this.page.getByRole('button', { name: /Clock Out/i }).or(
      this.page.locator('a[role="button"]:has-text("Clock Out")')
    ).first();
    const isVisible = await clockOutBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await clockOutBtn.click();
    } else {
      await this.clickAdfButton('Clock Out');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ===================== Admin / Scheduled Processes =====================

  /**
   * Search for a person on the timecard page.
   * Used across Classic, Redwood manager, and admin pages.
   */
  async searchPerson(name: string): Promise<void> {
    // Try Redwood search box first
    const searchBox = this.page.locator(
      'input[aria-label*="Search"], input[placeholder*="Search"], [role="searchbox"]'
    ).first();
    const hasSearchBox = await searchBox.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSearchBox) {
      await this.fillField(searchBox, name);
    } else {
      // Try Classic person name field
      const hasClassicPerson = await this.classicPersonName.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasClassicPerson) {
        await this.fillCombobox(this.classicPersonName, name);
      }
    }

    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Click first search result if a suggestions list appears
    const firstResult = this.page.locator(
      '[role="option"]:first-child, [role="listbox"] li:first-child, ' +
      '[class*="suggest"] a:first-child'
    ).first();
    if (await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstResult.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Run a scheduled process from the Time Management tasks panel.
   * Follows HCM.OTL.101.00 (Generate Time Cards), HCM.OTL.901.00 (Evaluate Group), etc.
   * @param processName Name of the process to search for and submit.
   */
  async runScheduledProcess(processName: string): Promise<void> {
    // Open the Tasks panel
    const hasTasks = await this.tasksPanel.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTasks) {
      await this.tasksPanel.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }

    // Click "Scheduled Processes" in the tasks panel
    const hasSchedLink = await this.scheduledProcessesLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSchedLink) {
      await this.scheduledProcessesLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Click "Schedule New Process"
    const hasScheduleNew = await this.scheduleNewProcessButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasScheduleNew) {
      await this.scheduleNewProcessButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Search for the process name
    const hasProcessSearch = await this.processNameSearch.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasProcessSearch) {
      await this.fillField(this.processNameSearch, processName);
    }

    // Click OK (typically twice for the search dialog)
    await this.clickOkIfVisible();
    await this.page.waitForTimeout(2000);
    await this.clickOkIfVisible();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Submit the scheduled process parameters and wait. */
  async submitScheduledProcess(): Promise<void> {
    await this.submitButton.click().catch(async () => {
      await this.clickAdfButton('Submit');
    });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handleConfirmationDialog();
  }

  /** Wait for a scheduled process to succeed by refreshing. */
  async waitForProcessSuccess(maxAttempts = 12): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const hasSucceeded = await this.processSucceededStatus.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSucceeded) return;

      // Click refresh
      const hasRefresh = await this.refreshButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasRefresh) {
        await this.refreshButton.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
      } else {
        await this.page.waitForTimeout(5000);
      }
    }
  }

  /**
   * Generate time cards for a group (admin function).
   * Follows HCM.OTL.101.00 steps 3-8.
   */
  async generateTimeCards(options: {
    groupName?: string;
    useScheduleHours?: boolean;
    payrollTimeType?: string;
  } = {}): Promise<void> {
    // Open Tasks panel and click "Generate Time Cards"
    const hasTasks = await this.tasksPanel.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTasks) {
      await this.tasksPanel.click();
      await this.page.waitForTimeout(2000);
    }

    const hasGenLink = await this.generateTimeCardsLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasGenLink) {
      await this.generateTimeCardsLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Select group name
    if (options.groupName) {
      await this.fillGroupName(options.groupName);
    }

    // Select all employees in search results
    await this.selectAll();

    // Submit
    await this.submitTimecard();
  }

  /**
   * Generate time events (admin function).
   * Follows HCM.OTL.201.00 steps 3-8.
   */
  async generateTimeEvents(options: {
    personName?: string;
    groupName?: string;
    effectiveDate?: string;
  } = {}): Promise<void> {
    // Open Tasks panel and click "Time Events"
    const hasTasks = await this.tasksPanel.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTasks) {
      await this.tasksPanel.click();
      await this.page.waitForTimeout(2000);
    }

    const hasEventsLink = await this.timeEventsLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasEventsLink) {
      await this.timeEventsLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Click "Generate" button
    const generateBtn = this.page.getByRole('button', { name: 'Generate' }).or(
      this.page.locator('a[role="button"]:has-text("Generate")')
    ).first();
    const hasGenerate = await generateBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasGenerate) {
      await generateBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Search for person or group
    if (options.personName) {
      await this.searchPerson(options.personName);
    }
    if (options.groupName) {
      await this.fillGroupName(options.groupName);
    }

    // Select rows and submit
    await this.selectAll();
    await this.submitTimecard();
  }

  // ===================== View Actions =====================

  /** View the calculated time section of a timecard. */
  async viewCalculatedTime(): Promise<void> {
    const isVisible = await this.viewCalculatedTimeButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.viewCalculatedTimeButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** View the time totals section of a timecard. */
  async viewTimeTotals(): Promise<void> {
    const isVisible = await this.viewTimeTotalsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.viewTimeTotalsButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Export timecards to Excel. */
  async exportToExcel(): Promise<void> {
    const isVisible = await this.exportExcelButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.exportExcelButton.click();
      await this.page.waitForTimeout(5000);
    }
  }

  // ===================== Helper Methods =====================

  /** Select Assignment Number on the Redwood timecard form. */
  async selectAssignment(value: string): Promise<void> {
    const hasField = await this.assignmentNumber.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.assignmentNumber, value);
    }
  }

  /** Select Hours Type on the Redwood timecard form. */
  async selectHoursType(value: string): Promise<void> {
    const hasField = await this.hoursType.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.hoursType, value);
    }
  }

  /** Fill the Absence Reason field. */
  async fillAbsenceReason(value: string): Promise<void> {
    const hasField = await this.absenceReason.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.absenceReason, value);
    }
  }

  /** Select the Timecard Period (Redwood or Classic). */
  async selectTimecardPeriod(period: string): Promise<void> {
    const hasField = await this.timecardPeriod.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.timecardPeriod, period);
    }
  }

  /**
   * Enter hours for a specific day in the weekly grid.
   * @param dayIndex Zero-based index of the day column.
   * @param hours Number of hours to enter.
   */
  async enterDayHours(dayIndex: number, hours: string): Promise<void> {
    const dayInput = this.hoursInputs.nth(dayIndex);
    if (await dayInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.fillField(dayInput, hours);
    }
  }

  /**
   * Enter hours for multiple days from a comma-separated string.
   * Format: "8,8,8,8,8,0,0" for Mon-Sun.
   */
  async enterWeeklyHours(hoursStr: string): Promise<void> {
    const hours = hoursStr.split(',').map(h => h.trim());
    for (let i = 0; i < hours.length; i++) {
      if (hours[i] && hours[i] !== '0' && hours[i] !== '') {
        await this.enterDayHours(i, hours[i]);
      }
    }
  }

  /** Fill the comments/notes field. */
  async fillComments(text: string): Promise<void> {
    const hasField = await this.comments.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillField(this.comments, text);
    }
  }

  /** Set the From Date search filter. */
  async setFromDate(date: string): Promise<void> {
    const hasField = await this.fromDate.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillField(this.fromDate, date);
    }
  }

  /** Set the To Date search filter. */
  async setToDate(date: string): Promise<void> {
    const hasField = await this.toDate.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillField(this.toDate, date);
    }
  }

  /** Click the Search button. */
  async clickSearch(): Promise<void> {
    const hasBtn = await this.searchButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBtn) {
      await this.searchButton.click();
    } else {
      await this.clickAdfButton('Search');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click "Team Time Cards" link in the Time Management sidebar. */
  async clickTeamTimeCards(): Promise<void> {
    const hasLink = await this.teamTimeCardsLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasLink) {
      await this.teamTimeCardsLink.click();
    } else {
      // Try clicking in the navigator
      const sideLink = this.page.locator('a:has-text("Team Time Cards")').first();
      const hasSideLink = await sideLink.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSideLink) {
        await sideLink.click({ force: true });
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the create "+" button on Classic Team Time Cards page. */
  async clickCreateTimecard(): Promise<void> {
    const hasBtn = await this.createTimecardButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBtn) {
      await this.createTimecardButton.click();
    } else {
      // Try the "+" icon button
      const plusButton = this.page.locator(
        'a[title*="Create"], button[title*="Create"], [aria-label*="Create"]'
      ).first();
      await plusButton.click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the "Add" button on Classic create timecard page. */
  async clickClassicAdd(): Promise<void> {
    const hasBtn = await this.classicAddButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBtn) {
      await this.classicAddButton.click();
    } else {
      await this.clickAdfButton('Add');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Select the first timecard row checkbox. */
  async selectFirstTimecardRow(): Promise<void> {
    const firstCheckbox = this.page.locator(
      'tbody input[type="checkbox"], tbody [role="checkbox"], ' +
      'table tr:nth-child(1) input[type="checkbox"]'
    ).first();
    const hasCheckbox = await firstCheckbox.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCheckbox) {
      await firstCheckbox.check();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  /** Select all rows in search results. */
  async selectAll(): Promise<void> {
    const hasSelectAll = await this.selectAllCheckbox.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSelectAll) {
      await this.selectAllCheckbox.check();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  /** Click an action from the Actions dropdown menu. */
  async clickAction(actionName: string): Promise<void> {
    // Try clicking the Actions button first to open the menu
    const hasActionsBtn = await this.actionsButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasActionsBtn) {
      await this.actionsButton.click();
      await this.page.waitForTimeout(1000);
    }

    // Click the action option from the dropdown
    const actionOption = this.page.getByRole('menuitem', { name: actionName }).or(
      this.page.locator(`[role="menu"] a:has-text("${actionName}"), ` +
        `[role="menuitem"]:has-text("${actionName}"), ` +
        `a:has-text("${actionName}")`)
    ).first();

    const hasAction = await actionOption.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasAction) {
      await actionOption.click();
    } else {
      // Fallback: try as ADF button
      await this.clickAdfButton(actionName);
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Fill the Group Name field (for admin generate/evaluate functions). */
  async fillGroupName(groupName: string): Promise<void> {
    const hasField = await this.groupNameField.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.groupNameField, groupName);
    }
  }

  /** Set the Status filter (e.g., "Submitted", "Entered", "Approved"). */
  async setStatusFilter(status: string): Promise<void> {
    const hasField = await this.statusFilter.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasField) {
      await this.fillCombobox(this.statusFilter, status);
    }
  }

  /** Click OK button if visible (for confirmation dialogs). */
  async clickOkIfVisible(): Promise<void> {
    const hasOk = await this.okButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasOk) {
      await this.okButton.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  /** Add a new row to the timecard (for adding additional hours types). */
  async addRow(): Promise<void> {
    const hasBtn = await this.addRowButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasBtn) {
      await this.addRowButton.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }
  }

  // ===================== Verification =====================

  /** Verify that a confirmation/success message is displayed. */
  async expectSuccess(): Promise<void> {
    // Check for "Time card was submitted" message
    const hasSubmittedMsg = await this.timecardSubmittedMessage.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasSubmittedMsg) return;

    // Check for confirmation banner
    const hasBanner = await this.confirmationBanner.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasBanner) return;

    // Check for process succeeded status
    const hasSucceeded = await this.processSucceededStatus.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSucceeded) return;

    // Fallback: check for common success text patterns
    const successText = this.page.locator(
      'text=/submitted|approved|saved|completed|success|succeeded/i'
    ).first();
    await successText.waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * Fill timecard fields from a UATTestCase.
   * Maps business process / test scenario fields to page interactions.
   */
  async fillFromTestCase(tc: UATTestCase): Promise<void> {
    const testData = tc.testData || '';

    // Parse common fields from testData (key=value pairs or free text)
    const personMatch = testData.match(/person[:\s]+([^\n,;]+)/i);
    const timeTypeMatch = testData.match(/(?:time|hours)\s*type[:\s]+([^\n,;]+)/i);
    const hoursMatch = testData.match(/hours[:\s]+([^\n,;]+)/i);
    const projectMatch = testData.match(/project[:\s]+([^\n,;]+)/i);
    const taskMatch = testData.match(/task[:\s]+([^\n,;]+)/i);
    const periodMatch = testData.match(/period[:\s]+([^\n,;]+)/i);
    const assignmentMatch = testData.match(/assignment[:\s]+([^\n,;]+)/i);
    const groupMatch = testData.match(/group[:\s]+([^\n,;]+)/i);

    if (personMatch) await this.searchPerson(personMatch[1].trim());
    if (periodMatch) await this.selectTimecardPeriod(periodMatch[1].trim());
    if (assignmentMatch) await this.selectAssignment(assignmentMatch[1].trim());
    if (timeTypeMatch) await this.selectHoursType(timeTypeMatch[1].trim());
    if (hoursMatch) await this.enterWeeklyHours(hoursMatch[1].trim());
    if (groupMatch) await this.fillGroupName(groupMatch[1].trim());

    // Handle project-based time entry
    if (projectMatch) {
      const projectField = this.page.locator(
        'input[aria-label*="Project"], [id*="Project"]'
      ).first();
      const hasProject = await projectField.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasProject) {
        await this.fillCombobox(projectField, projectMatch[1].trim());
      }
    }
    if (taskMatch) {
      const taskField = this.page.locator(
        'input[aria-label*="Task"], [id*="Task"]'
      ).first();
      const hasTask = await taskField.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasTask) {
        await this.fillCombobox(taskField, taskMatch[1].trim());
      }
    }
  }
}
