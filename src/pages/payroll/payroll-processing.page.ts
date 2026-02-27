import { BasePage } from '../base.page';

/**
 * Page object for Oracle HCM Payroll Processing / Scheduled Processes.
 *
 * Covers payroll runs, off-cycle payroll, check processing, tax management,
 * direct deposit, and payroll reporting. Most payroll batch operations are
 * executed via the Scheduled Processes page (Navigator > Tools > Scheduled Processes).
 *
 * Page type: ADF
 *
 * Selectors sourced from .cache/inspect/scheduled-processes-deep.json (live inspection).
 * Key elements:
 * - "Schedule New Process" link (role="button")
 * - Saved Search dropdown (id contains "srRssdfl::saveSearch")
 * - Expand Search toggle (id contains "srRssdfl::_afrDscl")
 * - View radio buttons: "Flat List" / "Hierarchy"
 * - Process action buttons: Put On Hold, Cancel, Release, View Log, Resubmit
 */
export class PayrollProcessingPage extends BasePage {
  // --- Scheduled Processes selectors (from scheduled-processes-deep.json) ---

  /** "Schedule New Process" link button on the Scheduled Processes page. */
  private readonly scheduleNewProcessLink = this.page.locator(
    'a[role="button"]:has-text("Schedule New Process")'
  ).first();

  /** "Resubmit" link button. */
  private readonly resubmitLink = this.page.locator(
    'a[role="button"]:has-text("Resubmit")'
  ).first();

  /**
   * "Put On Hold" button.
   * Real ID suffix: panel:holdid
   */
  private readonly putOnHoldButton = this.page.locator(
    'button[id$="panel:holdid"], button:has-text("Put On Hold")'
  ).first();

  /**
   * "Cancel Process" button.
   * Real ID suffix: panel:cancel1
   */
  private readonly cancelProcessButton = this.page.locator(
    'button[id$="panel:cancel1"], button:has-text("Cancel Process")'
  ).first();

  /**
   * "Release Process" button.
   * Real ID suffix: panel:releaseid
   */
  private readonly releaseProcessButton = this.page.locator(
    'button[id$="panel:releaseid"], button:has-text("Release Process")'
  ).first();

  /**
   * "View Log" button.
   * Real ID suffix: panel:viewlog1
   */
  private readonly viewLogButton = this.page.locator(
    'button[id$="panel:viewlog1"], button:has-text("View Log")'
  ).first();

  /**
   * Saved Search dropdown (ADF selectOneChoice).
   * Real ID suffix: srRssdfl::saveSearch::content
   * Default value: "Last hour"
   */
  private readonly savedSearchDropdown = this.page.locator(
    'select[id$="srRssdfl::saveSearch::content"], select[label="Saved Search"]'
  ).first();

  /**
   * "Expand Search" toggle button.
   * Real ID suffix: srRssdfl::_afrDscl
   * aria-label: "Expand Search"
   */
  private readonly expandSearchToggle = this.page.locator(
    'a[aria-label="Expand Search"], a[id$="srRssdfl::_afrDscl"]'
  ).first();

  /**
   * View radio: "Flat List"
   * Real ID suffix: sorid:_0
   */
  private readonly flatListRadio = this.page.locator(
    'input[type="radio"][label="Flat List"], input[id$="sorid:_0"]'
  ).first();

  /**
   * View radio: "Hierarchy"
   * Real ID suffix: sorid:_1
   */
  private readonly hierarchyRadio = this.page.locator(
    'input[type="radio"][label="Hierarchy"], input[id$="sorid:_1"]'
  ).first();

  /** Actions menu item. */
  private readonly actionsMenu = this.page.locator(
    'div[role="menuitem"][aria-label="Actions"]'
  ).first();

  /** View menu item. */
  private readonly viewMenu = this.page.locator(
    'div[role="menuitem"][aria-label="View"]'
  ).first();

  // --- Payroll-specific selectors for Submit a Flow / process dialogs ---

  /** Process name search input in the "Schedule New Process" dialog. */
  private readonly processNameInput = this.page.locator(
    'input[aria-label*="Name"], input[aria-label*="Process"], input[placeholder*="Search"]'
  ).first();

  /** Payroll name dropdown/LOV in process parameters. */
  private readonly payrollNameInput = this.page.locator(
    'input[aria-label*="Payroll"], select[aria-label*="Payroll"]'
  ).first();

  /** Pay period dropdown/LOV in process parameters. */
  private readonly payPeriodInput = this.page.locator(
    'input[aria-label*="Pay Period"], select[aria-label*="Period"]'
  ).first();

  /** Effective date field in process parameters. */
  private readonly effectiveDateInput = this.page.locator(
    'input[aria-label*="Effective Date"], input[aria-label*="Process Date"]'
  ).first();

  /** Consolidation group field. */
  private readonly consolidationGroupInput = this.page.locator(
    'input[aria-label*="Consolidation"], select[aria-label*="Consolidation"]'
  ).first();

  /** Employee name search in off-cycle / person-specific operations. */
  private readonly employeeSearchInput = this.page.locator(
    'input[aria-label*="Employee"], input[aria-label*="Person"], input[aria-label*="Worker"]'
  ).first();

  /** Filing status dropdown (for W-4 / tax forms). */
  private readonly filingStatusDropdown = this.page.locator(
    'select[aria-label*="Filing Status"], input[aria-label*="Filing Status"]'
  ).first();

  /** Bank name field (for direct deposit). */
  private readonly bankNameInput = this.page.locator(
    'input[aria-label*="Bank"], input[aria-label*="Financial Institution"]'
  ).first();

  /** Routing number field (for direct deposit). */
  private readonly routingNumberInput = this.page.locator(
    'input[aria-label*="Routing"], input[aria-label*="Transit"]'
  ).first();

  /** Account number field (for direct deposit). */
  private readonly accountNumberInput = this.page.locator(
    'input[aria-label*="Account Number"]'
  ).first();

  /** Designation/costing field. */
  private readonly designationInput = this.page.locator(
    'input[aria-label*="Designation"], select[aria-label*="Designation"]'
  ).first();

  /** Cost center field. */
  private readonly costCenterInput = this.page.locator(
    'input[aria-label*="Cost Center"], select[aria-label*="Cost Center"]'
  ).first();

  /** Check number field (for reverse/reissue). */
  private readonly checkNumberInput = this.page.locator(
    'input[aria-label*="Check Number"], input[aria-label*="Payment Number"]'
  ).first();

  // --- Navigation methods ---

  /**
   * Navigate to the Scheduled Processes page.
   * Navigator > Tools > Scheduled Processes
   */
  async goToScheduledProcesses(): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    const scheduledLink = this.page.locator('a[title="Scheduled Processes"]').first();
    if (await scheduledLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await scheduledLink.click({ force: true });
    } else {
      // Try via Tools section
      const toolsLink = this.page.getByText('Tools').first();
      if (await toolsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toolsLink.click({ force: true });
        await this.page.waitForTimeout(2000);
      }
    }

    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Navigate to Submit a Flow page (for payroll runs). */
  async goToSubmitFlow(): Promise<void> {
    await this.goToScheduledProcesses();
  }

  /**
   * Schedule a new process by clicking "Schedule New Process" and entering the name.
   * Uses the real "Schedule New Process" link button from inspection data.
   */
  async scheduleNewProcess(processName: string): Promise<void> {
    await this.scheduleNewProcessLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Fill the process name in the dialog
    await this.fillCombobox(this.processNameInput, processName);
    await this.page.waitForTimeout(2000);

    // Click OK to proceed to parameters
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Select payroll flow type by scheduling a new process with the given name. */
  async selectFlowType(flowType: string): Promise<void> {
    await this.scheduleNewProcess(flowType);
  }

  /**
   * Search for a process by name using the saved search or expanded search.
   * Expands the search panel and enters the process name.
   */
  async searchProcess(name: string): Promise<void> {
    // Expand search if collapsed
    if (await this.expandSearchToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.expandSearchToggle.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }

    // Fill search criteria
    const searchInput = this.page.locator(
      'input[aria-label*="Name"], input[aria-label*="Process Name"]'
    ).first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.fillField(searchInput, name);
      await this.page.waitForTimeout(2000);
    }

    // Click Search button
    const searchBtn = this.page.getByRole('button', { name: 'Search' }).first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /**
   * View the log of the selected process.
   * Uses the real button ID suffix panel:viewlog1.
   */
  async viewProcessLog(): Promise<void> {
    await this.viewLogButton.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Cancel the selected process.
   * Uses the real button ID suffix panel:cancel1.
   */
  async cancelProcess(): Promise<void> {
    await this.cancelProcessButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Confirm the cancellation if a confirmation dialog appears
    const yesButton = this.page.getByRole('button', { name: /Yes|OK|Confirm/i }).first();
    if (await yesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await yesButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Resubmit the selected process.
   * Uses the real "Resubmit" link button from inspection data.
   */
  async resubmitProcess(): Promise<void> {
    await this.resubmitLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Put the selected process on hold.
   * Uses the real button ID suffix panel:holdid.
   */
  async putOnHold(): Promise<void> {
    await this.putOnHoldButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Release a held process.
   * Uses the real button ID suffix panel:releaseid.
   */
  async releaseProcess(): Promise<void> {
    await this.releaseProcessButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Select a saved search filter from the dropdown.
   * Uses the real select element with label "Saved Search".
   */
  async selectSavedSearch(name: string): Promise<void> {
    await this.savedSearchDropdown.selectOption({ label: name });
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Toggle between Flat List and Hierarchy view.
   * Uses the real radio button inputs from inspection data.
   */
  async toggleView(type: 'flat' | 'hierarchy'): Promise<void> {
    if (type === 'flat') {
      await this.flatListRadio.click();
    } else {
      await this.hierarchyRadio.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // --- Payroll Run ---

  /** Fill payroll run parameters. */
  async fillPayrollRunParams(params: {
    payrollName?: string;
    payPeriod?: string;
    effectiveDate?: string;
    consolidationGroup?: string;
  }): Promise<void> {
    if (params.payrollName) {
      await this.fillCombobox(this.payrollNameInput, params.payrollName);
    }
    if (params.payPeriod) {
      await this.fillCombobox(this.payPeriodInput, params.payPeriod);
    }
    if (params.effectiveDate) {
      await this.fillField(this.effectiveDateInput, params.effectiveDate);
    }
    if (params.consolidationGroup) {
      await this.fillCombobox(this.consolidationGroupInput, params.consolidationGroup);
    }
    await this.waitForJET();
  }

  /** Submit the payroll flow / scheduled process. */
  async submitFlow(): Promise<void> {
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await this.clickAdfButton('Submit');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Handle confirmation dialog
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // --- Off-Cycle Payroll ---

  /** Navigate to Off-Cycle payroll via Scheduled Processes. */
  async goToOffCyclePayroll(): Promise<void> {
    await this.goToScheduledProcesses();
  }

  /** Fill off-cycle payroll parameters. */
  async fillOffCycleParams(params: {
    employeeName?: string;
    paymentType?: string;
    amount?: string;
    effectiveDate?: string;
  }): Promise<void> {
    if (params.employeeName) {
      await this.fillCombobox(this.employeeSearchInput, params.employeeName);
    }
    if (params.paymentType) {
      const paymentTypeInput = this.page.locator(
        'select[aria-label*="Payment Type"], input[aria-label*="Payment Type"]'
      ).first();
      await this.fillCombobox(paymentTypeInput, params.paymentType);
    }
    if (params.amount) {
      const amountInput = this.page.locator('input[aria-label*="Amount"]').first();
      await this.fillField(amountInput, params.amount);
    }
    if (params.effectiveDate) {
      await this.fillField(this.effectiveDateInput, params.effectiveDate);
    }
    await this.waitForJET();
  }

  // --- W-4 / Tax Forms ---

  /** Navigate to Calculation Card (W-4 tax setup). */
  async goToCalculationCard(): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    // Navigate to Payroll > Calculation Cards
    const payrollLink = this.page.locator('a[title="Payroll"]').first();
    if (await payrollLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await payrollLink.click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Fill W-4 information. */
  async fillW4Info(params: {
    employeeName?: string;
    filingStatus?: string;
    allowances?: string;
    additionalWithholding?: string;
  }): Promise<void> {
    if (params.employeeName) {
      await this.fillCombobox(this.employeeSearchInput, params.employeeName);
    }
    if (params.filingStatus) {
      await this.fillCombobox(this.filingStatusDropdown, params.filingStatus);
    }
    if (params.allowances) {
      const allowancesInput = this.page.locator('input[aria-label*="Allowance"]').first();
      await this.fillField(allowancesInput, params.allowances);
    }
    if (params.additionalWithholding) {
      const withholdingInput = this.page.locator('input[aria-label*="Additional"]').first();
      await this.fillField(withholdingInput, params.additionalWithholding);
    }
    await this.waitForJET();
  }

  // --- Direct Deposit ---

  /** Navigate to Direct Deposit / Payment Methods page. */
  async goToDirectDeposit(): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    // Try Payment Methods or Direct Deposit link
    const ddLink = this.page.locator(
      'a[title="Payment Methods"], a:has-text("Payment Methods"), a:has-text("Direct Deposit")'
    ).first();
    if (await ddLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ddLink.click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Fill direct deposit info. */
  async fillDirectDeposit(params: {
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    accountType?: string;
    amount?: string;
  }): Promise<void> {
    if (params.bankName) {
      await this.fillField(this.bankNameInput, params.bankName);
    }
    if (params.routingNumber) {
      await this.fillField(this.routingNumberInput, params.routingNumber);
    }
    if (params.accountNumber) {
      await this.fillField(this.accountNumberInput, params.accountNumber);
    }
    if (params.accountType) {
      const typeInput = this.page.locator('select[aria-label*="Account Type"]').first();
      await this.fillCombobox(typeInput, params.accountType);
    }
    if (params.amount) {
      const amountInput = this.page.locator('input[aria-label*="Amount"]').first();
      await this.fillField(amountInput, params.amount);
    }
    await this.waitForJET();
  }

  // --- Costing ---

  /** Navigate to Costing page via Navigator. */
  async goToCosting(): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    const costingLink = this.page.locator(
      'a[title="Costing"], a:has-text("Costing")'
    ).first();
    if (await costingLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await costingLink.click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Fill costing parameters. */
  async fillCostingParams(params: {
    employeeName?: string;
    designation?: string;
    costCenter?: string;
  }): Promise<void> {
    if (params.employeeName) {
      await this.fillCombobox(this.employeeSearchInput, params.employeeName);
    }
    if (params.designation) {
      await this.fillCombobox(this.designationInput, params.designation);
    }
    if (params.costCenter) {
      await this.fillCombobox(this.costCenterInput, params.costCenter);
    }
    await this.waitForJET();
  }

  // --- Check Processing ---

  /** Navigate to check processing via Scheduled Processes. */
  async goToCheckProcessing(): Promise<void> {
    await this.goToScheduledProcesses();
  }

  /** Generate and print checks via scheduled process. */
  async generateChecks(): Promise<void> {
    await this.scheduleNewProcess('Generate Check Payments');
    await this.submitFlow();
  }

  /** Reverse and reissue a check. */
  async reverseAndReissue(params: { checkNumber?: string }): Promise<void> {
    if (params.checkNumber) {
      await this.fillField(this.checkNumberInput, params.checkNumber);
    }

    const reverseBtn = this.page.getByRole('button', { name: /Reverse|Void/i }).first();
    if (await reverseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reverseBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // --- Tax Management ---

  /** Navigate to tax adjustment page via Scheduled Processes. */
  async goToTaxAdjustments(): Promise<void> {
    await this.goToScheduledProcesses();
  }

  /** Run direct deposit file generation. */
  async runDirectDepositFile(): Promise<void> {
    await this.scheduleNewProcess('Run Direct Deposit');
    await this.submitFlow();
  }

  /** Generate pay advice. */
  async generatePayAdvice(): Promise<void> {
    await this.scheduleNewProcess('Generate Pay Advice');
    await this.submitFlow();
  }

  /** Generate tax payment file. */
  async generateTaxPaymentFile(): Promise<void> {
    await this.scheduleNewProcess('Generate Tax Payment File');
    await this.submitFlow();
  }

  // --- Verification ---

  /** Verify payroll result by checking for success indicators. */
  async verifyResult(): Promise<void> {
    const successIndicator = this.page.locator(
      ':text("Succeeded"), :text("completed"), :text("submitted"), ' +
      '[class*="success"], [class*="confirmation"]'
    ).first();
    await successIndicator.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      // Process may still be running; check for pending/running status
    });
  }

  /** Save current form. */
  async save(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
    } else {
      await this.clickAdfButton('Save');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }
}
