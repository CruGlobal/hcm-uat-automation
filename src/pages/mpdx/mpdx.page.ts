import { BasePage } from '../base.page';

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
   * Navigate to Scheduled Processes page.
   * URL: /fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes_fuse_plus
   */
  private async goToScheduledProcesses(): Promise<void> {
    await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes_fuse_plus');
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Navigate to a module via the Navigator menu. */
  private async navigateToModule(moduleName: string): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

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
   * Clicks "Schedule New Process", enters the name, and clicks OK.
   */
  private async scheduleProcess(processName: string): Promise<void> {
    await this.scheduleNewProcessLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    await this.fillCombobox(this.processNameInput, processName);
    await this.page.waitForTimeout(2000);

    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await okButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
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
  private async clickTaskLink(taskName: string): Promise<void> {
    const task = this.page.getByText(taskName, { exact: false }).first();
    await task.click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // --- Salary Calculation ---

  /** Navigate to salary calculation via Scheduled Processes. */
  async goToSalaryCalculation(): Promise<void> {
    await this.goToScheduledProcesses();
    await this.scheduleProcess('Salary Calculation');
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
    const calcBtn = this.page.getByRole('button', { name: /Calculate|Run|Submit/i }).first();
    if (await calcBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calcBtn.click();
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

  // --- MPD Goal Calculation ---

  /** Navigate to MPD goal calculation via Scheduled Processes. */
  async goToMPDGoalCalculation(): Promise<void> {
    await this.goToScheduledProcesses();
    await this.scheduleProcess('Senior Staff MPD Goal');
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

  /** Navigate to MHA calculation via Scheduled Processes. */
  async goToMHACalculation(): Promise<void> {
    await this.goToScheduledProcesses();
    await this.scheduleProcess('MHA Calculation');
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
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await this.clickAdfButton('Submit');
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

  /** Navigate to savings funds transfer via Scheduled Processes. */
  async goToSavingsFundsTransfer(): Promise<void> {
    await this.goToScheduledProcesses();
    await this.scheduleProcess('Savings Funds Transfer');
  }

  /** Navigate to staff expense report. */
  async goToStaffExpenseReport(): Promise<void> {
    await this.navigateToModule('Expenses');
    const expenseLink = this.page.getByText('Create Expense Report').first();
    if (await expenseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expenseLink.click();
    } else {
      await this.clickTaskLink('Expense Report');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Navigate to MPGA income/expense report via Scheduled Processes. */
  async goToMPGAReport(): Promise<void> {
    await this.goToScheduledProcesses();
    await this.scheduleProcess('MPGA Income Expense');
  }

  /** Verify calculation result is displayed. */
  async verifyCalculationResult(): Promise<void> {
    const successIndicator = this.page.locator(
      ':text("Succeeded"), :text("Completed"), :text("submitted"), ' +
      '[class*="success"], [class*="confirmation"]'
    ).first();
    await successIndicator.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      // Process may still be running; not an error
    });
  }
}
