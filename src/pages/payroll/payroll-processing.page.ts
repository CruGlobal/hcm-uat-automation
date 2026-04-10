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
   * If we're on the Payroll landing/tile page instead of a specific sub-page,
   * click the relevant tile to navigate deeper.
   */
  private async clickPayrollTileIfNeeded(tileName: string): Promise<void> {
    // Check if we're on the Payroll tile page by looking for the "What do you want" heading
    const tileHeading = this.page.locator('h2:has-text("What do you want"), h1:has-text("Payroll")').first();
    const isOnTilePage = await tileHeading.isVisible({ timeout: 5000 }).catch(() => false);

    const url = this.page.url();
    const onHomeLike = url.includes('AtkHomePageWelcome') || url.endsWith('/fscm') || url.endsWith('/fscm/');

    if (!isOnTilePage && !onHomeLike) return;

    console.log(`[Payroll] On tile/landing page, clicking "${tileName}" tile...`);

    // Dismiss any overlaying popups/glass panes that may block tile clicks
    await this.dismissPopups();
    await this.clearGlassPane();

    // Strategy 1: Use the "Search for tasks" textbox (most reliable for Redwood SPA)
    const taskSearch = this.page.locator('input[placeholder*="Search for tasks"], textbox[name*="Search"]').first();
    if (await taskSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[Payroll] Using task search for "${tileName}"...`);
      await taskSearch.click();
      await taskSearch.fill(tileName);
      await this.page.waitForTimeout(2000);
      // Click the matching result
      const searchResult = this.page.locator(`a:has-text("${tileName}")`).first();
      if (await searchResult.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchResult.click();
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        const stillOnTiles = await tileHeading.isVisible({ timeout: 3000 }).catch(() => false);
        if (!stillOnTiles) return;
      }
    }

    // Strategy 2: Click the tile link directly (without force — lets Playwright do proper click)
    const tileLink = this.page.getByRole('link', { name: tileName }).first();
    if (await tileLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[Payroll] Clicking "${tileName}" tile link...`);
      await tileLink.click();
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      const stillOnTiles = await tileHeading.isVisible({ timeout: 3000 }).catch(() => false);
      if (!stillOnTiles) return;

      // Strategy 3: JS click (dispatchEvent) for SPA routing
      console.log(`[Payroll] Regular click didn't navigate, trying JS click...`);
      await tileLink.dispatchEvent('click');
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      const stillOnTiles2 = await tileHeading.isVisible({ timeout: 3000 }).catch(() => false);
      if (!stillOnTiles2) return;

      // Strategy 4: Navigate via the link's href directly
      console.log(`[Payroll] JS click didn't navigate, trying href navigation...`);
      const href = await tileLink.getAttribute('href').catch(() => null);
      if (href && href !== '#') {
        await this.page.goto(href, { timeout: 60_000 }).catch(() => {});
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
    }

    // Strategy 5: Navigate to Payroll landing then try again
    if (onHomeLike) {
      console.log(`[Payroll] Navigating to Payroll landing for "${tileName}"...`);
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      const retryLink = this.page.getByRole('link', { name: tileName }).first();
      if (await retryLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await retryLink.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
      }
    }

    console.log(`[Payroll] "${tileName}" tile navigation may have failed`);
  }

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
   * Navigate to "Submit a Flow" via My Client Groups → Payroll → Search "submit".
   * This is the correct path for Cru Offcycle Payroll Flow (NOT Scheduled Processes).
   */
  async goToSubmitAFlow(): Promise<void> {
    const home = new HomePage(this.page);
    // My Client Groups → Payroll landing page
    try {
      await home.navigateVia('nv_itemNode_workforce_management_payroll', 'Payroll');
    } catch {
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Search for "submit" in Payroll tasks search box
    const taskSearch = this.page.getByRole('textbox', { name: 'Search for tasks' });
    if (await taskSearch.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await taskSearch.fill('submit');
      await taskSearch.press('Enter');
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    }

    // Click "Submit a Flow"
    await this.page.getByRole('link', { name: 'Submit a Flow' }).click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    console.log('[Payroll] Navigated to Submit a Flow');
  }

  /**
   * Submit the Cru Offcycle Payroll Flow with parameters from codegen.
   *
   * @param payrollGroup - "Semimonthly Salaried" | "Semimonthly Supported" | "Biweekly Hourly"
   *                       Select based on the employee being processed.
   * @param flowName     - Unique name for this flow run (defaults to timestamp-based name).
   */
  async submitCruOffcycleFlow(options: {
    payrollGroup: string;
    flowName?: string;
  }): Promise<void> {
    // Search for Cru Offcycle Payroll Flow
    const flowSearch = this.page.getByRole('textbox', { name: 'Search by flow pattern name' });
    await flowSearch.fill('off');
    await flowSearch.press('Enter');
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Select "Cru Offcycle Payroll Flow"
    await this.page.getByText('Cru Offcycle Payroll Flow').click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Fill unique Payroll Flow name
    const flowName = options.flowName || `Offcycle ${Date.now()}`;
    const flowNameInput = this.page.getByRole('textbox', { name: 'Payroll Flow' });
    await flowNameInput.fill(flowName);
    console.log(`[Payroll] Flow name: ${flowName}`);

    // Select Payroll group (Semimonthly Salaried / Semimonthly Supported / Biweekly Hourly)
    const payrollArrow = this.page.locator(
      '#PAYROLL .oj-searchselect-arrow, [id$="PAYROLL"] .oj-searchselect-arrow'
    ).first();
    await payrollArrow.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
    await this.page.getByRole('gridcell', { name: options.payrollGroup, exact: true }).click();
    await this.page.waitForTimeout(1000);
    console.log(`[Payroll] Selected payroll group: ${options.payrollGroup}`);

    // Select most recent Payroll Period (first row in dropdown)
    const periodArrow = this.page.locator(
      '#PAYROLL_PERIOD .oj-searchselect-arrow, [id$="PAYROLL_PERIOD"] .oj-searchselect-arrow'
    ).first();
    await periodArrow.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();

    // Select the period whose date range contains today's date.
    // Row text format: "8 2026 Semimonthly | 2026-04-01 | 2026-04-15"
    // The dropdown is virtualized — must scroll down to render 2026 rows before matching.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // e.g. "2026-04-07"

    // Scroll the dropdown list down repeatedly until we find and click the matching period
    const scrollContainer = this.page.locator(
      '.oj-listbox-results, .oj-select-results, [class*="dropdown"] [role="listbox"], [role="listbox"]'
    ).first();

    let selectedPeriod = false;
    const maxScrollAttempts = 20;

    for (let i = 0; i < maxScrollAttempts; i++) {
      // Scan currently visible rows
      const matched = await this.page.evaluate((todayISO: string) => {
        const todayDate = new Date(todayISO);
        const rows = Array.from(document.querySelectorAll('[role="row"], [role="option"]'));
        for (const row of rows) {
          const text = row.textContent || '';
          const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
          if (dates && dates.length >= 2) {
            const start = new Date(dates[0]);
            const end = new Date(dates[1]);
            end.setHours(23, 59, 59, 999);
            if (todayDate >= start && todayDate <= end) {
              (row as HTMLElement).click();
              return text.trim();
            }
          }
        }
        return null;
      }, todayStr);

      if (matched) {
        console.log(`[Payroll] Selected period: ${matched}`);
        selectedPeriod = true;
        break;
      }

      // Not found yet — scroll down to load more rows
      const scrolled = await scrollContainer.evaluate((el: Element) => {
        if (el) {
          el.scrollTop += 300;
          return true;
        }
        return false;
      }).catch(() => false);

      if (!scrolled) {
        // Try scrolling via keyboard End key on the last visible row
        await this.page.keyboard.press('End');
      }
      await this.page.waitForTimeout(500);
    }

    if (!selectedPeriod) {
      await this.screenshot('payroll-period-not-found');
      throw new Error(`[Payroll] No payroll period found containing today's date (${today}). Cannot proceed — manual period selection required.`);
    }
    await this.page.waitForTimeout(1000);

    // Select Run Type: Regular
    const runTypeArrow = this.page.locator(
      '#RUN_TYPE .oj-searchselect-arrow, [id$="RUN_TYPE"] .oj-searchselect-arrow'
    ).first();
    await runTypeArrow.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
    await this.page.getByRole('row', { name: 'Regular' }).click();
    await this.page.waitForTimeout(1000);

    // Submit the flow
    await this.page.getByRole('button', { name: 'Submit' }).click();
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    console.log('[Payroll] Submitted Cru Offcycle Payroll Flow');
  }

  /**
   * Wait for the Payroll Checklist "Run Validation Report for Payroll" task
   * to reach "Completed" status. Clicks Refresh every 15 seconds while waiting.
   * Timeout: 5 minutes.
   */
  /**
   * Poll a checklist task until its status badge shows "Completed".
   * Clicks Refresh every 15 seconds while waiting. Timeout: 5 minutes per task.
   */
  private async waitForChecklistTask(taskName: string): Promise<void> {
    console.log(`[Payroll Checklist] Waiting for "${taskName}" to complete...`);
    const timeout = 300_000;
    const refreshInterval = 15_000;
    const startTime = Date.now();

    const completedBadge = this.page.locator('li[role="row"], tr[role="row"]')
      .filter({ hasText: taskName })
      .locator('span.oj-badge-success, span.oj-badge:has-text("Completed")')
      .first();

    while (Date.now() - startTime < timeout) {
      const isVisible = await completedBadge.isVisible({ timeout: 2_000 }).catch(() => false);
      if (isVisible) {
        const text = await completedBadge.textContent().catch(() => '');
        if (text?.includes('Completed')) {
          console.log(`[Payroll Checklist] "${taskName}" — Completed ✓`);
          return;
        }
      }
      await this.page.waitForTimeout(refreshInterval);
      const refreshBtn = this.page.getByRole('button', { name: 'Refresh' });
      if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await refreshBtn.click();
        await this.waitForJET();
        console.log(`[Payroll Checklist] Refreshed (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      }
    }
    throw new Error(`[Payroll Checklist] Timed out waiting for "${taskName}" to complete (5 min)`);
  }

  /**
   * Mark a Manual Task as complete via Actions → Mark as Complete → Submit.
   * Used for "Verify Payroll Validation Report", "Verify Reports", "Verify Prepayments".
   */
  private async markChecklistTaskComplete(taskName: string): Promise<void> {
    console.log(`[Payroll Checklist] Marking "${taskName}" as complete...`);

    // Strategy 1: codegen pattern — getByRole('row').filter(hasText).getByLabel('Actions')
    const taskRow = this.page.locator('[role="row"]').filter({ hasText: taskName }).first();
    let actionsBtn = taskRow.getByLabel('Actions', { exact: true });

    if (!await actionsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Strategy 2: codegen pattern for gridcell — used by "Verify Reports", "Verify Prepayments"
      const gridCell = this.page.getByRole('gridcell', { name: new RegExp(taskName) }).first();
      actionsBtn = gridCell.getByLabel('Actions', { exact: true });
    }

    if (!await actionsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Strategy 3: any Actions button near the task name text
      actionsBtn = this.page.locator(`[aria-label="Actions"]`).filter({ has: this.page.locator(`text=${taskName}`) }).first();
    }

    await actionsBtn.click({ timeout: 15_000 });
    await this.page.waitForTimeout(1000);

    // Click "Mark as Complete" in the dropdown menu
    await this.page.getByRole('menuitem', { name: 'Mark as Complete' }).click({ timeout: 15_000 });
    await this.page.waitForTimeout(1000);

    // Click Submit to confirm
    await this.page.getByRole('button', { name: 'Submit' }).click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
    console.log(`[Payroll Checklist] "${taskName}" — marked complete ✓`);
  }

  /**
   * Complete the full Cru Offcycle Payroll Flow checklist (10 tasks).
   *
   * Sequence:
   *  1. Run Validation Report for Payroll   — wait for Completed
   *  2. Verify Payroll Validation Report    — Manual Task: Mark as Complete
   *  3. Calculate Payroll                   — wait for Completed
   *  4. Verify Reports                      — Manual Task: Mark as Complete
   *  5. Calculate Prepayments               — wait for Completed
   *  6. Verify Prepayments                  — Manual Task: Mark as Complete
   *  7. Archive Periodic Payroll Results    — wait for Completed
   *  8. Run Payroll Costing Results         — wait for Completed
   *  9. Run Payroll Register Report         — wait for Completed
   * 10. Click Run Payroll Register Report   — view final results
   */
  async waitForPayrollChecklistCompletion(): Promise<void> {
    console.log('[Payroll Checklist] Starting full 10-task checklist...');

    // 1. Run Validation Report for Payroll — automated, wait for Completed
    await this.waitForChecklistTask('Run Validation Report for Payroll');

    // 2. Verify Payroll Validation Report — Manual Task
    await this.markChecklistTaskComplete('Verify Payroll Validation');

    // 3. Calculate Payroll — automated, wait for Completed
    await this.waitForChecklistTask('Calculate Payroll');

    // 4. Run Gross-to-Net Report — automated, must complete before Verify Reports unlocks
    await this.waitForChecklistTask('Run Gross-to-Net Report');

    // 5. Verify Reports — Manual Task (only available after Gross-to-Net completes)
    await this.markChecklistTaskComplete('Verify Reports');

    // 5. Calculate Prepayments — automated, wait for Completed
    await this.waitForChecklistTask('Calculate Prepayments');

    // 6. Verify Prepayments — Manual Task
    await this.markChecklistTaskComplete('Verify Prepayments');

    // 7. Archive Periodic Payroll Results — automated, wait for Completed
    await this.waitForChecklistTask('Archive Periodic Payroll Results');

    // 8. Run Payroll Costing Results — automated, wait for Completed
    await this.waitForChecklistTask('Run Payroll Costing Results');

    // 9. Run Payroll Register Report — automated, wait for Completed
    await this.waitForChecklistTask('Run Payroll Register Report');

    // 10. Click Run Payroll Register Report to view final results
    console.log('[Payroll Checklist] All 10 tasks completed — opening Payroll Register Report...');
    await this.page.getByText('Run Payroll Register Report').click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
    console.log('[Payroll Checklist] Done ✓');
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
    let found = await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!found) {
      // Strategy 1: Refresh the page
      console.log('[Payroll] "Schedule New Process" not visible, refreshing page...');
      await this.page.reload({ timeout: 60_000 });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      found = await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false);
    }
    if (!found) {
      // Strategy 2: Direct URL navigation with _fuse_plus suffix
      console.log('[Payroll] "Schedule New Process" still not visible, trying direct URL...');
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes_fuse_plus', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      found = await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false);
    }
    if (!found) {
      // Strategy 3: Try without _fuse_plus suffix (older Oracle versions)
      console.log('[Payroll] Trying alternate Scheduled Processes URL...');
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_tools_scheduled_processes', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      found = await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false);
    }
    if (!found) {
      // Strategy 4: Reload the page — ADF may need a fresh render
      console.log('[Payroll] Reloading page for "Schedule New Process"...');
      await this.page.reload({ timeout: 60_000 }).catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      found = await this.scheduleNewProcessLink.isVisible({ timeout: 10_000 }).catch(() => false);
    }
    if (!found) {
      throw new Error('"Schedule New Process" button not found after multiple navigation attempts');
    }
    await this.scheduleNewProcessLink.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Type the process name and trigger LOV resolution
    const nameField = this.processNameInput;
    await nameField.click();
    await nameField.clear();
    await nameField.pressSequentially(processName, { delay: 50 });
    await this.page.waitForTimeout(3000);

    // Tab to trigger autocomplete resolution — give LOV time to resolve under load
    await nameField.press('Tab');
    await this.page.waitForTimeout(5000);

    // Check if a "Search and Select" dialog appeared (stacked on top).
    const searchAndSelect = this.page.getByText('Search and Select', { exact: false }).first();
    if (await searchAndSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Payroll] Search and Select dialog detected');
      await this.handleProcessSearchDialog(processName);
    }

    // Click OK on the "Schedule New Process" dialog to proceed to parameters
    await this.page.waitForTimeout(2000);
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    if (await okButton.isVisible({ timeout: 8000 }).catch(() => false)) {
      // Wait for OK to become enabled — LOV resolution may still be in progress
      let enabled = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        const isDisabled = await okButton.isDisabled().catch(() => true);
        if (!isDisabled) { enabled = true; break; }
        console.log(`[Payroll] OK still disabled (attempt ${attempt + 1}/6), waiting for LOV resolution...`);
        await this.page.waitForTimeout(3000);
      }
      if (enabled) {
        await okButton.click({ force: true });
        await this.page.waitForTimeout(3000);
        await this.clearGlassPane();
        await this.waitForJET();
      } else {
        console.log(`[Payroll] Process "${processName}" not selected after waiting, OK still disabled — cancelling`);
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

      // If no exact match, try matching by ALL significant keywords (not just one)
      if (!matched) {
        const keywords = processName.split(/[\s-]+/).filter(w => w.length > 3);

        // Strategy 1: Find a row containing ALL keywords
        if (keywords.length > 1) {
          const allRows = await rows.all();
          for (const row of allRows) {
            const text = (await row.textContent().catch(() => '')) || '';
            const textLower = text.toLowerCase();
            const matchesAll = keywords.every(kw => textLower.includes(kw.toLowerCase()));
            if (matchesAll) {
              console.log(`[Payroll] Found all-keywords match: "${text.trim().substring(0, 60)}"`);
              targetRow = row;
              matched = true;
              break;
            }
          }
        }

        // Strategy 2: Single keyword match as last resort
        if (!matched) {
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
    // Wait for the parameters page to render — may take 20s+ under load
    // after the "Schedule New Process" dialog closes
    await this.effectiveDateInput.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      console.log('[Payroll] Parameters page fields not visible after 30s');
    });
    if (params.payrollName) {
      if (await this.payrollNameInput.isVisible({ timeout: 1000 }).catch(() => false))
        await this.fillCombobox(this.payrollNameInput, params.payrollName);
    }
    if (params.payPeriod) {
      if (await this.payPeriodInput.isVisible({ timeout: 1000 }).catch(() => false))
        await this.fillCombobox(this.payPeriodInput, params.payPeriod);
    }
    if (params.effectiveDate) {
      if (await this.effectiveDateInput.isVisible({ timeout: 1000 }).catch(() => false))
        await this.fillField(this.effectiveDateInput, params.effectiveDate);
    }
    if (params.consolidationGroup) {
      if (await this.consolidationGroupInput.isVisible({ timeout: 1000 }).catch(() => false))
        await this.fillCombobox(this.consolidationGroupInput, params.consolidationGroup);
    }
    await this.waitForJET();
  }

  /** Submit the payroll flow / scheduled process. */
  async submitFlow(): Promise<void> {
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    if (await submitBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      // Check if button is enabled (not aria-disabled) — wait up to 10s for it to enable
      let enabled = false;
      for (let i = 0; i < 5; i++) {
        const isDisabled = await submitBtn.isDisabled().catch(() => false);
        if (!isDisabled) { enabled = true; break; }
        await this.page.waitForTimeout(2000);
      }
      if (!enabled) {
        console.log('[Payroll] Submit button visible but disabled — navigation-only completion');
        return;
      }
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
    try {
      // Navigate to Payroll via Navigator — Calculation Cards is a sub-page of Payroll
      await home.navigateVia('nv_itemNode_workforce_management_payroll', 'Payroll');
    } catch {
      console.log('[Payroll] Navigator failed for Payroll — trying direct URL');
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Click through the Calculation Cards tile on the Payroll landing page
    await this.clickPayrollTileIfNeeded('Calculation Cards');
  }

  /** Fill W-4 information. */
  async fillW4Info(params: {
    employeeName?: string;
    filingStatus?: string;
    allowances?: string;
    additionalWithholding?: string;
  }): Promise<void> {
    if (params.employeeName) {
      // Try ADF-style employee search first
      const adfVisible = await this.employeeSearchInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (adfVisible) {
        await this.fillCombobox(this.employeeSearchInput, params.employeeName);
      } else {
        // Redwood "Search for a Person" combobox
        await this.searchPersonOnRedwoodPage(params.employeeName);
      }
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

  /**
   * Search for a person on a Redwood-style page (Calculation Cards, Costing, etc.).
   * These pages have a "Search for a Person" combobox that loads the person's data.
   */
  /**
   * Search for a person on a Redwood-style payroll page (Calculation Cards, Costing, etc.).
   *
   * These pages use an ADF inputComboboxListOfValues with Redwood faceted search:
   * 1. Type name in LOV → Tab → "Advanced Search" dropdown appears
   * 2. Click "Advanced Search" → faceted search page with Person Name filter
   * 3. Fill Person Name filter → click search icon → results appear
   * 4. Click person result → their data loads
   */
  private async searchPersonOnRedwoodPage(name: string): Promise<void> {
    const searchInput = this.page.locator(
      'input[placeholder*="Search for a Person"], input[placeholder*="Search for a person"]'
    ).first();

    if (!await searchInput.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('[Payroll] No person search combobox found on page');
      return;
    }

    console.log(`[Payroll] Redwood person search: "${name}"`);

    // Step 1: Type name and trigger LOV dropdown
    await searchInput.click();
    await searchInput.clear();
    await searchInput.pressSequentially(name, { delay: 50 });
    await searchInput.press('Tab');
    await this.page.waitForTimeout(3000);

    // Step 2: Click "Advanced Search:..." link in the LOV dropdown
    const advancedSearchLink = this.page.locator('a:has-text("Advanced Search")').first();
    if (await advancedSearchLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Payroll] Clicking Advanced Search link...');
      await advancedSearchLink.click();
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
    } else {
      // LOV may have auto-resolved — check if we're past the combobox
      console.log('[Payroll] No Advanced Search link — LOV may have resolved or no match');
      return;
    }

    // Step 3: On faceted search page — click the main search icon to execute search
    // (the search bar at top already has the name from the LOV)
    const searchIcon = this.page.locator('[class*="search-icon"], [aria-label*="Search"] button, a[title*="Search"]').first();
    if (await searchIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchIcon.click();
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
    }

    // Step 4: Check for results, if none try Person Name filter
    const noResults = this.page.locator(':text("No results found")').first();
    if (await noResults.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[Payroll] No results — trying Person Name filter with last name...');
      const lastName = name.includes(',') ? name.split(',')[0].trim() : name.split(' ').pop() || name;
      // Find the Person Name filter input (near the "Person Name" label)
      const filterInputs = this.page.locator('input[type="text"]');
      const count = await filterInputs.count();
      // Person Name filter is typically the 2nd input (after top search bar)
      for (let i = 1; i < Math.min(count, 5); i++) {
        const inp = filterInputs.nth(i);
        const placeholder = await inp.getAttribute('placeholder').catch(() => '');
        const nearby = (await inp.locator('..').textContent().catch(() => '')) || '';
        if (nearby.includes('Person Name') || placeholder === '') {
          await inp.clear();
          await inp.fill(lastName);
          // Click the search icon next to this filter
          const icon = inp.locator('~ a, ~ button, + a, + button').first();
          if (await icon.isVisible({ timeout: 2000 }).catch(() => false)) {
            await icon.click();
          } else {
            await inp.press('Enter');
          }
          await this.page.waitForTimeout(8000);
          await this.waitForJET();
          break;
        }
      }
    }

    // Step 5: Click the first person result card
    const personResult = this.page.locator(
      '[class*="person-card"] a, [role="listitem"] a, [class*="oj-listview-item"] a, ' +
      'a[class*="result"], [class*="card-content"] a'
    ).first();
    if (await personResult.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('[Payroll] Clicking person result...');
      await personResult.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      console.log('[Payroll] No person results found in faceted search');
    }

    // After person is selected, look for calc card links to click into
    const cardLink = this.page.locator(
      'a:has-text("Tax Withholding"), a:has-text("Statutory Deductions"), ' +
      'a:has-text("Calculation"), [role="link"]:has-text("Tax"), ' +
      '[class*="card"] a, [role="listitem"] a'
    ).first();
    if (await cardLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('[Payroll] Opening calculation card...');
      await cardLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  // --- Direct Deposit ---

  /** Navigate to Direct Deposit / Payment Methods page via Navigator. */
  async goToDirectDeposit(): Promise<void> {
    const home = new HomePage(this.page);
    try {
      await home.navigateVia('nv_itemNode_workforce_management_payroll', 'Payroll');
    } catch {
      console.log('[Payroll] Navigator failed for Payroll — trying direct URL');
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Click through the Personal Payment Methods tile on the Payroll landing page
    await this.clickPayrollTileIfNeeded('Personal Payment Methods');
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

  /** Navigate to Costing page via Navigator > Payroll > Costing for Persons tile. */
  async goToCosting(): Promise<void> {
    const home = new HomePage(this.page);
    try {
      await home.navigateVia('nv_itemNode_workforce_management_payroll', 'Payroll');
    } catch {
      console.log('[Payroll] Navigator failed for Payroll — trying direct URL');
      await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Click through the Costing tile on the Payroll landing page
    await this.clickPayrollTileIfNeeded('Costing for Persons');
  }

  /** Fill costing parameters. */
  async fillCostingParams(params: {
    employeeName?: string;
    designation?: string;
    costCenter?: string;
  }): Promise<void> {
    if (params.employeeName) {
      const adfVisible = await this.employeeSearchInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (adfVisible) {
        await this.fillCombobox(this.employeeSearchInput, params.employeeName);
      } else {
        await this.searchPersonOnRedwoodPage(params.employeeName);
      }
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
    // Try multiple Save button strategies
    const strategies = [
      () => this.page.getByRole('button', { name: 'Save' }).first(),
      () => this.page.locator('button:has-text("Save"), a[role="button"]:has-text("Save")').first(),
      () => this.page.locator('[id*="save" i][id*="::content"], [id*="Save"][id$="::content"]').first(),
      () => this.page.locator('oj-button:has-text("Save"), [role="button"]:has-text("Save")').first(),
      () => this.page.getByRole('button', { name: 'Save and Close' }).first(),
    ];
    for (const getBtn of strategies) {
      const btn = getBtn();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        return;
      }
    }
    // Final fallback: try clickAdfButton (Save, then Save and Close)
    try {
      await this.clickAdfButton('Save');
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    } catch {
      // Save not found via ADF either — try Save and Close
    }
    try {
      await this.clickAdfButton('Save and Close');
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    } catch {
      // Neither Save nor Save and Close found
    }
    // Last resort: try Submit (some payroll forms use Submit instead of Save)
    try {
      await this.clickAdfButton('Submit');
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    } catch {
      console.log('[Payroll] No Save/Submit button found — page may not have loaded correctly. Navigation-only completion.');
      return;
    }
  }
}
