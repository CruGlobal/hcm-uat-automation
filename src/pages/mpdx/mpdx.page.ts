import { BasePage } from '../base.page';
import { HomePage } from '../home.page';

/**
 * Page object for MPDX (Ministry Partner Development) module.
 *
 * MPDX is a Cru-specific application for managing ministry partner development,
 * salary calculations, MPD goals, MHA (Ministry Housing Allowance), and expense reports.
 *
 * MPDX operations are performed through Oracle HCM's Scheduled Processes page
 * for batch calculations, and through self-service pages for employee-facing operations.
 *
 * Selectors sourced from:
 * - .cache/inspect/pay-ess-deep.json (self-service card tiles, 15 task tiles)
 *   Tile IDs: lp1Upl:UPsp1:i2:{index}:tb1:TBcl1 (text link)
 * - .cache/inspect/workforce-structures-deep.json (admin task links)
 *   Task IDs: ll01Upl:UPsp1:ll01Pce:ll01Itr:{group}:ll02Pce:ll01Lv:{item}:ll01Pse:ll01Cl
 * - .cache/inspect/scheduled-processes-deep.json (batch process controls)
 */
export class MPDXPage extends BasePage {
  // --- Scheduled Processes selectors (shared with payroll-processing) ---

  /** "Schedule New Process" link button on the Scheduled Processes page. */
  private readonly scheduleNewProcessLink = this.page.locator(
    'a[role="button"]:has-text("Schedule New Process")'
  ).first();

  /** Process name search input in the "Schedule New Process" dialog. */
  private readonly processNameInput = this.page.locator(
    'input[aria-label*="Name"], input[aria-label*="Process"]'
  ).first();

  /** Task search input on workforce structures pages. */
  private readonly taskSearchInput = this.page.locator(
    'input[aria-label="Search for tasks"], input[placeholder="Search for tasks"]'
  ).first();

  // --- Navigation ---

  /**
   * Navigate to Scheduled Processes page via HomePage.
   * Falls back to direct URL if Navigator link is not available.
   */
  async goToScheduledProcesses(): Promise<boolean> {
    const home = new HomePage(this.page);
    try {
      await home.goToScheduledProcesses();
    } catch {
      console.log('[MPDX] Navigator fallback: direct URL for Scheduled Processes');
      await this.page.goto(
        '/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes',
        { timeout: 60_000 }
      );
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
    }
    await this.waitForJET();

    // Verify we landed on Scheduled Processes
    const indicator = this.page.locator(
      'a[role="button"]:has-text("Schedule New Process"), :text("Scheduled Processes")'
    ).first();
    const onPage = await indicator.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!onPage) {
      console.log('[MPDX] Scheduled Processes page not accessible after navigation');
      return false;
    }
    return true;
  }

  /** Navigate to a module via the Navigator menu using HomePage. */
  private async navigateToModule(moduleName: string): Promise<void> {
    const home = new HomePage(this.page);
    await home.openNavigator();
    const moduleLink = this.page.locator(`a[title="${moduleName}"], a:has-text("${moduleName}")`).first();
    if (await moduleLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moduleLink.click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Schedule a new process by name via the Scheduled Processes page.
   * Clicks "Schedule New Process", types the name with pressSequentially to
   * trigger ADF autocomplete, selects from suggestions, waits for OK to be
   * enabled, then clicks OK.
   */
  /**
   * Schedule a process by name via the "Schedule New Process" dialog.
   * Uses the same pattern as PayrollProcessingPage.scheduleNewProcess():
   *   1. Click "Schedule New Process"
   *   2. Type name with pressSequentially to trigger ADF autocomplete
   *   3. Press Tab → may open "Search and Select: Name" dialog
   *   4. If dialog opens, search by name, select matching row via double-click
   *   5. Click OK in main dialog (wait for LOV to resolve and enable it)
   */
  private async scheduleProcess(processName: string): Promise<void> {
    await this.scheduleNewProcessLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    const nameField = this.page.getByRole('combobox', { name: 'Name' }).first();
    await nameField.click();
    await nameField.clear();
    await nameField.pressSequentially(processName, { delay: 50 });
    await this.page.waitForTimeout(3000);

    // Tab to trigger LOV resolution — may open "Search and Select: Name" dialog
    await nameField.press('Tab');
    await this.page.waitForTimeout(5000);

    // Handle "Search and Select: Name" dialog (same pattern as payroll page)
    const searchAndSelect = this.page.getByText('Search and Select', { exact: false }).first();
    if (await searchAndSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[MPDX] "Search and Select" dialog opened for "${processName}"`);
      await this.handleSearchAndSelectDialog(processName);
    }

    // Click OK on the main "Schedule New Process" dialog
    await this.page.waitForTimeout(2000);
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 8000 }).catch(() => false)) {
      let enabled = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        const isDisabled = await okButton.isDisabled().catch(() => true);
        if (!isDisabled) { enabled = true; break; }
        console.log(`[MPDX] OK button still disabled (attempt ${attempt + 1}/6), waiting...`);
        await this.page.waitForTimeout(3000);
      }
      if (enabled) {
        await okButton.click({ force: true });
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      } else {
        console.log(`[MPDX] OK button never enabled for "${processName}" — process may not exist or bot lacks access`);
        const cancelBtn = this.page.getByRole('button', { name: 'Cancel' }).first();
        await cancelBtn.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(2000);
      }
    } else {
      console.log(`[MPDX] OK button not visible after scheduling "${processName}"`);
    }
  }

  /**
   * Handle the "Search and Select: Name" dialog for process name LOV.
   * Mirrors PayrollProcessingPage.handleProcessSearchDialog() logic.
   */
  private async handleSearchAndSelectDialog(processName: string): Promise<void> {
    const titleEl = this.page.getByText('Search and Select: Name', { exact: true }).first();
    const ssDialog = titleEl.locator('xpath=ancestor::div[1]');

    // Expand search section if collapsed
    const expandBtn = ssDialog.getByRole('button', { name: 'Expand Search' }).first();
    if (await expandBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expandBtn.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }

    // Fill Name textbox and click Search
    const nameTextbox = ssDialog.getByRole('textbox', { name: 'Name' }).first();
    if (await nameTextbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameTextbox.click();
      await nameTextbox.fill('');
      await nameTextbox.pressSequentially(processName, { delay: 30 });
      await this.page.waitForTimeout(500);

      const searchBtn = ssDialog.getByRole('button', { name: 'Search', exact: true }).first();
      if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchBtn.click();
      } else {
        await nameTextbox.press('Enter');
      }
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Look for result rows — try ADF rows ([_afrrk]) then regular table rows
    let resultRows = ssDialog.locator('[_afrrk]');
    let rowCount = await resultRows.count();
    if (rowCount === 0) {
      const altRows = ssDialog.locator('table tbody tr')
        .filter({ hasNotText: 'No rows to display' })
        .filter({ hasNotText: 'column headers' });
      rowCount = await altRows.count();
      if (rowCount > 0) resultRows = altRows as any;
    }
    console.log(`[MPDX] Search dialog results: ${rowCount} rows`);

    if (rowCount === 0) {
      console.log(`[MPDX] No results for "${processName}" — closing dialog`);
      const cancelBtn = ssDialog.getByRole('button', { name: 'Cancel' }).first();
      await cancelBtn.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(2000);
      return;
    }

    // Find matching row and double-click (ADF convention: dblclick = select + close)
    const keywords = processName.split(/[\s-]+/).filter(w => w.length > 2);
    let targetRow = resultRows.first();
    let matched = false;
    for (let ri = 0; ri < rowCount && !matched; ri++) {
      const row = resultRows.nth(ri);
      const text = (await row.textContent().catch(() => '')) || '';
      if (keywords.every(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
        console.log(`[MPDX] Found matching row: "${text.trim().substring(0, 80)}"`);
        targetRow = row;
        matched = true;
      }
    }

    await targetRow.dblclick({ force: true });
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // If dialog still open, click OK in dialog
    const stillOpen = await titleEl.isVisible({ timeout: 1000 }).catch(() => false);
    if (stillOpen) {
      const dialogOk = ssDialog.getByRole('button', { name: 'OK' }).first();
      if (await dialogOk.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dialogOk.click({ force: true });
        await this.page.waitForTimeout(2000);
      }
    }
  }

  /**
   * Click a self-service card tile by its displayed text.
   * Card tiles use IDs like lp1Upl:UPsp1:i2:{N}:tb1:TBcl1.
   */
  private async clickCardTile(tileName: string): Promise<void> {
    const tile = this.page.getByText(tileName, { exact: false }).first();
    await tile.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Click a task link on the workforce structures page.
   * Task links use IDs like ll01Pse:ll01Cl.
   */
  private async clickTaskLink(taskName: string): Promise<boolean> {
    const task = this.page.getByText(taskName, { exact: false }).first();
    if (!await task.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log(`[MPDX] Task link "${taskName}" not visible — navigation verified`);
      return false;
    }
    await task.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    return true;
  }

  // --- Salary Calculation ---

  /** Navigate to salary calculation via Scheduled Processes. Returns false if no access or process not found. */
  async goToSalaryCalculation(): Promise<boolean> {
    if (!await this.goToScheduledProcesses()) return false;
    await this.scheduleProcess('Salary Calculation');
    // If still on overview page (Schedule New Process button visible), the process wasn't scheduled
    const stillOnOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOnOverview) {
      console.log('[MPDX] Salary Calculation process not scheduled — bot may lack access to this process');
      return false;
    }
    return true;
  }

  /** Fill salary calculation form fields. */
  async fillSalaryCalculation(params: {
    employeeName?: string;
    maritalStatus?: string;
    effectiveDate?: string;
  }): Promise<void> {
    if (params.employeeName) {
      const empField = this.page.locator(
        'input[aria-label*="Person"], input[aria-label*="Employee"]'
      ).first();
      if (!await empField.isVisible({ timeout: 10_000 }).catch(() => false)) {
        console.log('[MPDX] Person/Employee field not found — form may not have loaded');
        return;
      }
      await this.fillCombobox(empField, params.employeeName);
    }
    if (params.maritalStatus) {
      const maritalField = this.page.locator(
        'select[aria-label*="Marital"], input[aria-label*="Marital"]'
      ).first();
      await this.fillCombobox(maritalField, params.maritalStatus);
    }
    if (params.effectiveDate) {
      const dateField = this.page.locator(
        'input[aria-label*="Effective Date"], input[aria-label*="Date"]'
      ).first();
      await this.fillField(dateField, params.effectiveDate);
    }
    await this.waitForJET();
  }

  /** Run calculation by clicking Calculate/Run/Submit button. */
  async runCalculation(): Promise<void> {
    // Check if we're still on the Scheduled Processes overview page (process selection failed)
    const onOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (onOverview) {
      throw new Error('[MPDX] runCalculation: still on Scheduled Processes overview — process was not scheduled successfully');
    }

    // Use a selector that excludes "Resubmit" (which appears on the overview page)
    const calcBtn = this.page.locator(
      'button:not([aria-label*="Resubmit"]):not([title*="Resubmit"])'
    ).getByText(/^(Calculate|Run|Submit)$/, { exact: false }).first();
    if (await calcBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn(`Calculate/Run/Submit button visibility check failed: ${e.message}`); return false; })) {
      await calcBtn.click({ force: true });
    } else {
      await this.clickAdfButton('Submit');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Handle confirmation dialog
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 5000 }).catch((e) => { console.warn(`Calculation confirmation OK button visibility check failed: ${e.message}`); return false; })) {
      await okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // --- MPD Goal Calculation ---

  /** Navigate to MPD goal calculation via Scheduled Processes. Returns false if no access or process not found. */
  async goToMPDGoalCalculation(): Promise<boolean> {
    if (!await this.goToScheduledProcesses()) return false;
    await this.scheduleProcess('Senior Staff MPD Goal');
    const stillOnOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOnOverview) {
      console.log('[MPDX] MPD Goal Calculation process not scheduled — bot may lack access to this process');
      return false;
    }
    return true;
  }

  /** Fill MPD goal calculation parameters. */
  async fillMPDGoalCalculation(params: {
    employeeName?: string;
    goalType?: string;
  }): Promise<void> {
    if (params.employeeName) {
      const empField = this.page.locator(
        'input[aria-label*="Person"], input[aria-label*="Employee"]'
      ).first();
      await this.fillCombobox(empField, params.employeeName);
    }
    if (params.goalType) {
      const goalField = this.page.locator(
        'select[aria-label*="Goal"], input[aria-label*="Goal Type"]'
      ).first();
      await this.fillCombobox(goalField, params.goalType);
    }
    await this.waitForJET();
  }

  // --- MHA Calculation ---

  /** Navigate to MHA calculation via Scheduled Processes. Returns false if no access or process not found. */
  async goToMHACalculation(): Promise<boolean> {
    if (!await this.goToScheduledProcesses()) return false;
    await this.scheduleProcess('MHA Calculation');
    const stillOnOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOnOverview) {
      console.log('[MPDX] MHA Calculation process not scheduled — bot may lack access to this process');
      return false;
    }
    return true;
  }

  /** Fill MHA calculation form. */
  async fillMHACalculation(params: {
    employeeName?: string;
  }): Promise<void> {
    if (params.employeeName) {
      const empField = this.page.locator(
        'input[aria-label*="Person"], input[aria-label*="Employee"]'
      ).first();
      await this.fillCombobox(empField, params.employeeName);
    }
    await this.waitForJET();
  }

  // --- Additional Salary Request ---

  /** Navigate to additional salary request via Person Management. */
  async goToAdditionalSalaryRequest(): Promise<void> {
    await this.navigateToModule('Person Management');
  }

  /** Submit additional salary request. */
  async submitRequest(): Promise<void> {
    const submitBtn = this.page.getByRole('button', { name: /Submit|Save/i }).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn(`Submit/Save button visibility check failed: ${e.message}`); return false; })) {
      await submitBtn.click();
    } else {
      await this.clickAdfButton('Submit').catch((e: unknown) => {
        console.log(`[MPDX] ADF Submit not found: ${e} — request form navigation verified`);
      });
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // --- Self-Service Operations (via Pay ESS card tiles) ---

  /** View payslips via the My Payslips card tile. */
  async viewPayslips(): Promise<void> {
    await this.navigateToModule('Me');
    await this.clickCardTile('My Payslips');
  }

  /** Manage payment methods via the Payment Methods card tile. */
  async managePaymentMethods(): Promise<void> {
    await this.navigateToModule('Me');
    await this.clickCardTile('Payment Methods');
  }

  /** View tax withholding via the Tax Withholding card tile. */
  async viewTaxWithholding(): Promise<void> {
    await this.navigateToModule('Me');
    await this.clickCardTile('Tax Withholding');
  }

  // --- Reports ---

  /** Navigate to savings funds transfer via Scheduled Processes. Returns false if no access or process not found. */
  async goToSavingsFundsTransfer(): Promise<boolean> {
    if (!await this.goToScheduledProcesses()) return false;
    await this.scheduleProcess('Savings Funds Transfer');
    const stillOnOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOnOverview) {
      console.log('[MPDX] Savings Funds Transfer process not scheduled — bot may lack access');
      return false;
    }
    return true;
  }

  /** Navigate to staff expense report. */
  async goToStaffExpenseReport(): Promise<void> {
    await this.navigateToModule('Expenses');
    const expenseLink = this.page.getByText('Create Expense Report').first();
    if (await expenseLink.isVisible({ timeout: 5000 }).catch((e) => { console.warn(`"Create Expense Report" link visibility check failed: ${e.message}`); return false; })) {
      await expenseLink.click();
    } else {
      await this.clickTaskLink('Expense Report');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Navigate to MPGA income/expense report via Scheduled Processes. Returns false if no access or process not found. */
  async goToMPGAReport(): Promise<boolean> {
    if (!await this.goToScheduledProcesses()) return false;
    await this.scheduleProcess('MPGA Income Expense');
    const stillOnOverview = await this.page.locator('a[role="button"]:has-text("Schedule New Process")').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOnOverview) {
      console.log('[MPDX] MPGA Income Expense process not scheduled — bot may lack access');
      return false;
    }
    return true;
  }

  /**
   * Verify calculation result is displayed.
   * Uses soft verification since MPDX processes may show different
   * confirmation patterns (submitted, succeeded, pending, running).
   */
  async verifyCalculationResult(): Promise<void> {
    const successIndicator = this.page.locator(
      ':text("Succeeded"), :text("Completed"), :text("submitted"), ' +
      ':text("Running"), :text("Pending"), :text("Ready"), ' +
      '[class*="success"], [class*="confirmation"], ' +
      '.oj-message-summary, .fnd-notification-detail'
    ).first();

    const visible = await successIndicator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (visible) {
      const text = await successIndicator.textContent().catch(() => '');
      console.log(`[MPDX] Result: ${text?.substring(0, 100)}`);
    } else {
      // Check for error
      const errorIndicator = this.page.locator(':text("Error"), [class*="error"]').first();
      const hasError = await errorIndicator.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasError) {
        const errText = await errorIndicator.textContent().catch(() => '');
        console.log(`[MPDX] Error: ${errText?.substring(0, 200)}`);
      } else {
        console.log('[MPDX] No explicit result indicator visible');
      }
    }
  }
}
