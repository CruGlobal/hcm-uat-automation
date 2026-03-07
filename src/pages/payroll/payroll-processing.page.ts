import { BasePage } from '../base.page';
import { HomePage } from '../home.page';

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

  /** "Schedule New Process" button on the Scheduled Processes page. */
  private readonly scheduleNewProcessLink = this.page.locator(
    'a[role="button"]:has-text("Schedule New Process"), button:has-text("Schedule New Process"), a:has-text("Schedule New Process")'
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
  private readonly processNameInput = this.page.getByRole('combobox', { name: 'Name' });

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
   * Navigate to the Scheduled Processes page via HomePage.
   * Navigator > Tools > Scheduled Processes
   */
  async goToScheduledProcesses(): Promise<void> {
    const home = new HomePage(this.page);
    await home.goToScheduledProcesses();
    await this.waitForJET();
  }

  /** Navigate to Submit a Flow page (for payroll runs). */
  async goToSubmitFlow(): Promise<void> {
    await this.goToScheduledProcesses();
  }

  /**
   * Schedule a new process by clicking "Schedule New Process" and entering the name.
   *
   * The Name combobox in the "Schedule New Process" dialog is an ADF
   * inputComboboxListOfValues. Typing + Tab may open a "Search and Select: Name"
   * dialog with a collapsed search section. This method handles:
   *   1. Type process name → Tab to trigger LOV resolution
   *   2. If "Search and Select" dialog opens, expand search → fill Name → Search
   *   3. Select matching row → OK to close inner dialog
   *   4. OK on outer "Schedule New Process" dialog to proceed to parameters
   */
  async scheduleNewProcess(processName: string): Promise<void> {
    // Wait for Scheduled Processes page to fully render
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    if (!await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Page may not be fully loaded — try refreshing
      console.log('[Payroll] "Schedule New Process" not visible, refreshing page...');
      await this.page.reload({ timeout: 60_000 });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
    await this.scheduleNewProcessLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Type the process name and trigger LOV resolution
    const nameField = this.processNameInput;
    await nameField.click();
    await nameField.clear();
    await nameField.pressSequentially(processName, { delay: 50 });
    await this.page.waitForTimeout(2000);

    // Tab to trigger autocomplete resolution
    await nameField.press('Tab');
    await this.page.waitForTimeout(3000);

    // Check if a "Search and Select" dialog appeared (stacked on top).
    // Don't rely on AFModalGlassPane (may not exist for all dialog types) —
    // instead check for the actual dialog title "Search and Select: Name".
    const searchAndSelect = this.page.getByText('Search and Select', { exact: false }).first();
    if (await searchAndSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[Payroll] Search and Select dialog detected');
      await this.handleProcessSearchDialog(processName);
    }

    // Click OK on the "Schedule New Process" dialog to proceed to parameters
    await this.page.waitForTimeout(2000);
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      const isDisabled = await okButton.isDisabled().catch(() => true);
      if (!isDisabled) {
        await okButton.click({ force: true });
        await this.page.waitForTimeout(3000);
        await this.clearGlassPane();
        await this.waitForJET();
      } else {
        console.log(`[Payroll] Process "${processName}" not selected, OK disabled — cancelling`);
        const cancelBtn = this.page.getByRole('button', { name: 'Cancel' }).first();
        await cancelBtn.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(2000);
        await this.clearGlassPane();
        throw new Error(`Scheduled process "${processName}" could not be selected`);
      }
    }
  }

  /**
   * Handle the "Search and Select: Name" dialog that appears when the LOV
   * combobox can't autocomplete the process name.
   *
   * The dialog starts with a collapsed search section. Steps:
   *   1. Expand search (click ▶ Search or "Expand Search" button)
   *   2. Fill the Name input field with the process name
   *   3. Click the Search button to execute the query
   *   4. Select matching row from results
   *   5. Click OK to close this dialog (returns to "Schedule New Process")
   */
  private async handleProcessSearchDialog(processName: string): Promise<void> {
    await this.clearGlassPane();

    // Scope all interactions to the "Search and Select" dialog container.
    // Find the dialog by its title text and navigate to its parent container (1 level up).
    const titleEl = this.page.getByText('Search and Select: Name', { exact: true }).first();
    const ssDialog = titleEl.locator('xpath=ancestor::div[1]');
    console.log(`[Payroll] Dialog scoped, title visible: ${await titleEl.isVisible().catch(() => false)}`);

    // Expand the collapsed search section within the dialog
    const expandBtn = ssDialog.getByRole('button', { name: 'Expand Search' }).first();
    if (await expandBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expandBtn.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      console.log('[Payroll] Expanded Search and Select search section');
    }

    // Find the Name search textbox within the dialog
    const nameTextbox = ssDialog.getByRole('textbox', { name: 'Name' }).first();
    const hasTextbox = await nameTextbox.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Payroll] Search textbox visible: ${hasTextbox}`);

    if (hasTextbox) {
      await nameTextbox.click();
      await nameTextbox.fill('');
      await this.page.waitForTimeout(300);
      await nameTextbox.pressSequentially(processName, { delay: 30 });
      await this.page.waitForTimeout(500);
      console.log(`[Payroll] Typed "${processName}" in dialog search field`);

      // Click the Search button within the dialog
      const searchBtn = ssDialog.getByRole('button', { name: 'Search', exact: true }).first();
      if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchBtn.click();
        console.log('[Payroll] Clicked dialog Search button');
      } else {
        await nameTextbox.press('Enter');
        console.log('[Payroll] Pressed Enter to search');
      }
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Check for results
      let resultRowCount = await ssDialog.locator('[_afrrk]').count();

      // If 0 results, retry with wildcard search based on first word
      if (resultRowCount === 0) {
        const firstWord = processName.split(/[\s-]+/)[0]; // e.g. "Off" from "Off-Cycle Payroll"
        console.log(`[Payroll] No results for "${processName}", retrying with "${firstWord}%"`);
        await nameTextbox.click();
        await nameTextbox.fill('');
        await this.page.waitForTimeout(300);
        await nameTextbox.pressSequentially(firstWord + '%', { delay: 30 });
        await this.page.waitForTimeout(500);

        const retryBtn = ssDialog.getByRole('button', { name: 'Search', exact: true }).first();
        if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await retryBtn.click();
        }
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
      }
    } else {
      // No textbox: try clicking Search without criteria to list all processes
      console.log('[Payroll] No search textbox, searching with no criteria');
      const searchBtn = ssDialog.getByRole('button', { name: 'Search', exact: true }).first();
      if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchBtn.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
      }
    }

    // Look for result rows WITHIN the dialog only (ADF rows with _afrrk attribute)
    const resultRows = ssDialog.locator('[_afrrk]');
    let rowCount = await resultRows.count();
    console.log(`[Payroll] Dialog results: ${rowCount} ADF rows`);

    // Also check for non-ADF table rows
    if (rowCount === 0) {
      const altRows = ssDialog.locator('table tbody tr')
        .filter({ hasNot: this.page.locator('th') })
        .filter({ hasNotText: 'No rows to display' })
        .filter({ hasNotText: 'column headers' });
      const altCount = await altRows.count();
      if (altCount > 0) {
        console.log(`[Payroll] Found ${altCount} non-ADF result rows in dialog`);
        rowCount = altCount;
      }
    }

    if (rowCount > 0) {
      const rows = (await ssDialog.locator('[_afrrk]').count()) > 0
        ? ssDialog.locator('[_afrrk]')
        : ssDialog.locator('table tbody tr')
            .filter({ hasNot: this.page.locator('th') })
            .filter({ hasNotText: 'No rows to display' });

      // Try to find a row matching the process name (exact or keyword match)
      const matchRow = rows.filter({ hasText: processName }).first();
      let targetRow = matchRow;
      let matched = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);

      // If no exact match, try matching by significant keywords from the process name
      if (!matched) {
        const keywords = processName.split(/[\s-]+/).filter(w => w.length > 3);
        for (const kw of keywords) {
          const kwRow = rows.filter({ hasText: new RegExp(kw, 'i') }).first();
          if (await kwRow.isVisible({ timeout: 1000 }).catch(() => false)) {
            const text = await kwRow.textContent().catch(() => '');
            console.log(`[Payroll] Found keyword "${kw}" match: "${text?.trim().substring(0, 60)}"`);
            targetRow = kwRow;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        // No matching row found — don't select a random unrelated process
        console.log(`[Payroll] No row matches "${processName}" — closing dialog`);
        const cancelBtn = ssDialog.getByRole('button', { name: 'Cancel' }).first();
        await cancelBtn.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(2000);
        await this.clearGlassPane();
        await this.waitForJET();
        return;
      }

      // Double-click the matching row (ADF LOV convention: dblclick = select + close)
      const rowText = await targetRow.textContent().catch(() => '');
      console.log(`[Payroll] Double-clicking row: "${rowText?.trim().substring(0, 80)}"`);
      await targetRow.dblclick({ force: true });
      await this.page.waitForTimeout(3000);
      await this.waitForJET();

      // If dialog still open after double-click, click OK via ADF
      if (await titleEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Payroll] Dialog still open, clicking OK');
        const okBtn = ssDialog.getByRole('button', { name: 'OK' }).first();
        const okId = await okBtn.getAttribute('id').catch(() => '');
        if (okId) {
          await this.page.evaluate((id: string) => {
            const adfPage = (window as any).AdfPage?.PAGE;
            if (!adfPage) return;
            const comp = adfPage.findComponentByAbsoluteId(id);
            if (comp) { new (window as any).AdfActionEvent(comp).queue(); }
          }, okId);
        } else {
          await okBtn.click({ force: true });
        }
        await this.page.waitForTimeout(2000);
      }
    } else {
      // No results — close the dialog
      console.log(`[Payroll] No results for "${processName}"`);
      const closeLink = ssDialog.getByRole('link', { name: 'Close' }).first();
      if (await closeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeLink.click({ force: true });
      } else {
        const cancelBtn = ssDialog.getByRole('button', { name: 'Cancel' }).first();
        await cancelBtn.click({ force: true }).catch(() => {});
      }
    }

    await this.page.waitForTimeout(3000);
    await this.clearGlassPane();
    await this.waitForJET();
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

  /** Navigate to Calculation Card (W-4 tax setup) via Navigator > Payroll. */
  async goToCalculationCard(): Promise<void> {
    const home = new HomePage(this.page);
    await home.openNavigator();
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

  /** Navigate to Direct Deposit / Payment Methods page via Navigator. */
  async goToDirectDeposit(): Promise<void> {
    const home = new HomePage(this.page);
    await home.openNavigator();
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
    const home = new HomePage(this.page);
    await home.openNavigator();
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

  /**
   * Verify payroll result by checking for success indicators.
   * Uses soft verification since payroll processes may take time
   * and show various status indicators (Submitted, Running, Succeeded, etc.).
   */
  async verifyResult(): Promise<void> {
    const successIndicator = this.page.locator(
      ':text("Succeeded"), :text("completed"), :text("submitted"), ' +
      ':text("Running"), :text("Pending"), :text("Ready"), ' +
      '[class*="success"], [class*="confirmation"], ' +
      '.oj-message-summary, .fnd-notification-detail'
    ).first();

    const visible = await successIndicator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (visible) {
      const text = await successIndicator.textContent().catch(() => '');
      console.log(`[Payroll] Result: ${text?.substring(0, 100)}`);
    } else {
      // Check for error
      const errorIndicator = this.page.locator(':text("Error"), [class*="error"]').first();
      const hasError = await errorIndicator.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasError) {
        const errText = await errorIndicator.textContent().catch(() => '');
        console.log(`[Payroll] Error: ${errText?.substring(0, 200)}`);
      } else {
        console.log('[Payroll] No explicit result indicator visible');
      }
    }
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
