import { type Page } from '@playwright/test';
import { BasePage } from './base.page';
import { LoginPage } from './login.page';

/**
 * Oracle HCM Home/Springboard page.
 * Provides navigation via the Navigator hamburger menu.
 */
export class HomePage extends BasePage {
  private readonly navigator = this.page.locator('a[title="Navigator"]');
  private readonly showMore = this.page.locator('a:has-text("Show More")').first();

  // New Person task page — link IDs under My Client Groups > New Person
  private readonly TASK_LINK_PREFIX = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:';

  /**
   * Verify the page is interactive (Navigator link visible).
   * If the session is dead or on a login page, re-login using bot credentials.
   */
  async ensureSessionAlive(): Promise<void> {
    const navVisible = await this.navigator.isVisible({ timeout: 5000 }).catch(() => false);
    if (navVisible) return;

    console.log('[Home] Session check: Navigator not visible, recovering...');
    const url = this.page.url();

    // If on a login page, re-authenticate immediately
    if (url.includes('login') || url.includes('okta') || url.includes('signin') || url.includes('auth_cred_submit')) {
      console.log('[Home] On login page, re-authenticating...');
      const login = new LoginPage(this.page);
      await login.fullLogin();
      return;
    }

    // Try navigating to home page to revive session
    await this.page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    // Check if we got redirected to login
    const postNavUrl = this.page.url();
    if (postNavUrl.includes('login') || postNavUrl.includes('okta') || postNavUrl.includes('signin')) {
      console.log('[Home] Redirected to login after home navigation, re-authenticating...');
      const login = new LoginPage(this.page);
      await login.fullLogin();
      return;
    }

    // Check if Navigator appeared
    const retryVisible = await this.navigator.isVisible({ timeout: 5000 }).catch(() => false);
    if (retryVisible) return;

    // Last resort: fresh login
    console.log('[Home] Navigator still not visible, performing fresh login...');
    const login = new LoginPage(this.page);
    await login.fullLogin();
  }

  /**
   * Open the navigator/hamburger menu and expand all sections.
   * If Navigator isn't visible, attempts session recovery (re-login).
   */
  async openNavigator(): Promise<void> {
    const navVisible = await this.navigator.isVisible({ timeout: 5000 }).catch(() => false);
    if (!navVisible) {
      await this.ensureSessionAlive();

      // Check again after recovery
      const retryVisible = await this.navigator.isVisible({ timeout: 10000 }).catch(() => false);
      if (!retryVisible) {
        throw new Error('Navigator not visible after session recovery attempt');
      }
    }

    // Dismiss any overlaying popups before clicking
    await this.dismissPopups();
    await this.navigator.click({ force: true });
    await this.page.waitForTimeout(2000);

    // Click "Show More" repeatedly until fully expanded (becomes "Show Less" or disappears).
    // Oracle HCM Navigator may need multiple clicks to reveal all sections.
    for (let i = 0; i < 5; i++) {
      const showMoreVisible = await this.showMore.isVisible({ timeout: 2000 }).catch(() => false);
      if (!showMoreVisible) break;
      await this.showMore.click({ force: true });
      await this.page.waitForTimeout(1500);
    }
    // Wait for ADF to finish rendering nav items (critical after session recovery)
    await this.waitForJET();
  }

  /** Close the Navigator panel if it's currently open. */
  async closeNavigator(): Promise<void> {
    // Check if Navigator button is expanded (panel open)
    const navExpanded = this.page.locator('button[aria-expanded="true"] img[alt="Navigator"], button[aria-expanded="true"]:has(img[alt="Navigator"])').first();
    const showMoreLess = this.page.locator('a:has-text("Show Less"), a:has-text("Show More")').first();
    const isOpen = await navExpanded.isVisible({ timeout: 2000 }).catch(() => false)
      || await showMoreLess.isVisible({ timeout: 1000 }).catch(() => false);
    if (!isOpen) return;

    console.log('[Home] Navigator panel is open, closing...');

    // Method 1: Click the Navigator button to toggle it closed (most reliable)
    const navButton = this.page.locator('button:has(img[alt="Navigator"])').first();
    if (await navButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await navButton.click({ force: true });
      await this.page.waitForTimeout(1500);
      // Verify it closed
      const stillOpen = await showMoreLess.isVisible({ timeout: 1000 }).catch(() => false);
      if (!stillOpen) return;
    }

    // Method 2: Press Escape to dismiss
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Generic navigator helper: opens the hamburger menu, clicks a nav item by
   * its ADF id suffix, and waits for the destination page to settle.
   * Falls back to matching by link title/text if the ADF ID is not found.
   */
  async navigateVia(navItemId: string, linkText?: string): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.openNavigator();
      const clicked = await this.tryClickNavItem(navItemId, linkText);
      if (clicked) break;

      if (attempt === 1) {
        // Nav item not found — close navigator, go home, and retry
        console.log(`[Home] Nav item "${linkText || navItemId}" not found, retrying...`);
        await this.closeNavigator();
        await this.page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
        await this.page.waitForTimeout(3000);
      } else {
        throw new Error(`Navigator item "${linkText || navItemId}" not found after 2 attempts. The bot user may lack the required security role.`);
      }
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(3000);
    // Close Navigator if it's still open (overlays content and blocks clicks)
    await this.closeNavigator();
    await this.page.waitForTimeout(2000);
  }

  /** Try to click a nav item. Returns true if clicked, false if not found. */
  private async tryClickNavItem(navItemId: string, linkText?: string): Promise<boolean> {
    const byId = this.page.locator(`[id$="${navItemId}"]`);
    if (await byId.isVisible({ timeout: 3000 }).catch(() => false)) {
      await byId.click({ force: true });
      return true;
    }
    if (linkText) {
      const byRole = this.page.getByRole('link', { name: linkText, exact: true }).first();
      if (await byRole.isVisible({ timeout: 3000 }).catch(() => false)) {
        await byRole.click({ force: true });
        return true;
      }
      const byText = this.page.locator(`a:has-text("${linkText}")`).first();
      if (await byText.isVisible({ timeout: 3000 }).catch(() => false)) {
        await byText.click({ force: true });
        return true;
      }
    }
    return false;
  }

  /** Navigate to My Client Groups > New Person task page. Falls back to direct URL. */
  async goToNewPerson(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_workforce_management_new_person', 'New Person');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for New Person');
      await this.gotoDirectUrl('itemNode_workforce_management_new_person');
    }
  }

  /** Click a task on the New Person page using AdfActionEvent, with link-text fallback. */
  async clickNewPersonTask(taskIndex: number, linkText?: string): Promise<void> {
    const linkId = `${this.TASK_LINK_PREFIX}cl01Lv:${taskIndex}:cl01Pse:cl01Cl`;
    try {
      await this.clickAdfLink(linkId);
      await this.page.waitForTimeout(10_000); // ADF forms take time to render
    } catch {
      // Fallback: click by link text (ADF IDs change between sessions)
      if (linkText) {
        console.log(`[Home] ADF link ${taskIndex} not found, falling back to link text: "${linkText}"`);
        await this.clickNewPersonTile(linkText);
      } else {
        throw new Error(`ADF task link not found at index ${taskIndex} and no fallback text provided`);
      }
    }
  }

  /**
   * Click a New Person task tile by link text, with retries.
   * Oracle Redwood tiles use a JavaScript SPA router — plain force clicks may not
   * trigger navigation. Tries dispatchEvent('click') first (fires trusted event),
   * then falls back to a regular click without force, and retries on navigation failure.
   */
  private async clickNewPersonTile(linkText: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const link = this.page.getByRole('link', { name: linkText, exact: true }).first();
      const linkVisible = await link.isVisible({ timeout: 5000 }).catch(() => false);

      if (linkVisible) {
        if (attempt === 1) {
          // First try: dispatchEvent fires a trusted click (better for Oracle Redwood SPA router)
          await link.dispatchEvent('click');
        } else {
          // Retry: standard click without force, letting Playwright handle hover/scroll
          await link.scrollIntoViewIfNeeded();
          await link.click({ timeout: 10_000 }).catch(() => link.click({ force: true }));
        }
      } else {
        // Broader fallback selector
        const byText = this.page.locator(`a:has-text("${linkText}")`).first();
        await byText.dispatchEvent('click');
      }

      // Wait for the ADF wizard form to start loading
      await this.page.waitForTimeout(3000);

      // Check if navigation happened by looking for known ADF wizard elements
      const wizardLoaded = await this.page.locator('[id*="SP1:inputDate1"]').isVisible({ timeout: 8000 })
        .catch(() => false);
      if (wizardLoaded) {
        console.log(`[Home] Tile "${linkText}" navigation succeeded (attempt ${attempt})`);
        await this.waitForJET();
        return;
      }

      // Maybe wizard uses a different date field or takes longer — check for any ADF wizard indicator
      const anyWizardEl = await this.page.locator('[id*="SP1:"], [id*="AddPw1:"], [id*="AddNw1:"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      if (anyWizardEl) {
        console.log(`[Home] Tile "${linkText}" navigation succeeded via wizard indicator (attempt ${attempt})`);
        await this.waitForJET();
        return;
      }

      if (attempt < 3) {
        console.log(`[Home] Tile "${linkText}" navigation not detected (attempt ${attempt}), retrying...`);
      }
    }

    // Navigation may still be in progress — give it one more chance
    console.log(`[Home] Tile "${linkText}" — waiting 10s for late navigation...`);
    await this.page.waitForTimeout(10_000);
    await this.waitForJET();
  }

  /** Navigate to "Hire an Employee" form (task index 1). */
  async goToHireEmployee(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(1, 'Hire an Employee');
  }

  /** Navigate to "Add a Contingent Worker" form (task index 2). */
  async goToAddContingentWorker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(2, 'Add a Contingent Worker');
  }

  /** Navigate to "Add a Pending Worker" form (task index 3). */
  async goToAddPendingWorker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(3, 'Add a Pending Worker');
  }

  /** Navigate to "Add a Nonworker" form (task index 4). */
  async goToAddNonworker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(4, 'Add a Nonworker');
  }

  /** Navigate to Person Management (My Client Groups > Person Management). Falls back to direct URL. */
  async goToPersonManagement(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_workforce_management_person_management', 'Person Management');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Person Management');
      await this.gotoDirectUrl('itemNode_workforce_management_person_management');
    }
    // Verify the search panel rendered — wait up to 30s for ADF under concurrent load
    const searchPanel = this.page.locator('[id*="q1:"]').first();
    await searchPanel.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      console.log('[Home] Person Management search panel did not render within 30s');
    });
  }

  /** Navigate to Absence Administration (My Client Groups). */
  async goToAbsenceAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_absence_administration');
  }

  /** Navigate to self-service Absences (My Information > Time and Absences). Falls back to direct URL. */
  async goToAbsenceESS(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_my_information_absences1', 'Time and Absences');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Time and Absences');
      await this.gotoDirectUrl('itemNode_my_information_absences1');
    }
  }

  /** Navigate to self-service Benefits (My Information). */
  async goToBenefitsESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_itemNode_my_information_benefits_Redwood', 'Benefits');
  }

  /** Navigate to Benefits Activity Center (Benefits Administration). */
  async goToBenefitsAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_groupNode_benefits_BenefitsActivityCenter', 'Benefits Activity Center');
  }

  /** Navigate to Workforce Compensation (Manager Resources). Falls back to direct URL. */
  async goToWorkforceCompensation(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_manager_resources_workforce_compensation', 'Workforce Compensation');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Workforce Compensation');
      await this.gotoDirectUrl('itemNode_manager_resources_workforce_compensation');
    }
  }

  /** Navigate to Workforce Structures (My Client Groups). */
  async goToWorkforceStructures(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_workforce_structures', 'Workforce Structures');
  }

  /** Navigate to Organization Journeys (My Client Groups). */
  async goToJourneysAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_Journeys', 'Journeys');
  }

  /** Navigate to My Journeys (My Information). */
  async goToJourneysESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_Journeys', 'Journeys');
  }

  /** Navigate to self-service Pay (My Information). */
  async goToPayESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_pay', 'Pay');
  }

  /** Navigate to Scheduled Processes (Tools). Falls back to direct URL. Verifies destination. */
  async goToScheduledProcesses(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_tools_scheduled_processes_fuse_plus', 'Scheduled Processes');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Scheduled Processes');
      await this.gotoDirectUrl('itemNode_tools_scheduled_processes');
    }
    // Verify we actually landed on Scheduled Processes (not home page)
    const onScheduledProcesses = await this.page.locator(
      'h1:has-text("Scheduled Processes"), a:has-text("Schedule New Process"), [class*="page-title"]:has-text("Scheduled")'
    ).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!onScheduledProcesses) {
      const currentUrl = this.page.url();
      console.log(`[Home] Not on Scheduled Processes (URL: ${currentUrl}), retrying with direct URL`);
      await this.gotoDirectUrl('itemNode_tools_scheduled_processes_fuse_plus');
      // Wait a bit more for the page to load
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Navigate to Time Management (My Client Groups). Falls back to direct URL. */
  async goToTimeAdmin(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_workforce_management_time_management', 'Time Management');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Time Management');
      await this.gotoDirectUrl('itemNode_workforce_management_time_management');
    }
  }

  /** Navigate to self-service Time (My Information). Falls back to direct URL. */
  async goToTimeESS(): Promise<void> {
    try {
      await this.navigateVia('nv_itemNode_my_information_time', 'Time and Absences');
    } catch {
      console.log('[Home] Navigator fallback: direct URL for Time ESS');
      await this.gotoDirectUrl('itemNode_my_information_time');
    }
  }

  /** Navigate to Pending Workers dashboard (Redwood direct URL). */
  async goToPendingWorkers(): Promise<void> {
    await this.page.goto('/fscmUI/redwood/employment-pending-workers/view/dashboard');
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  /** Navigate to My Client Groups > Payroll > Element Entries. */
  async goToElementEntries(): Promise<void> {
    await this.openNavigator();
    // Look for "Element Entries" link by title or partial text (expanded navigator)
    const elementEntriesLink = this.page.locator(
      'a[title="Element Entries"]'
    ).first();
    if (await elementEntriesLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await elementEntriesLink.click({ force: true });
    } else {
      // Try "Payroll" to navigate to payroll landing, which has Element Entries task
      const payrollLink = this.page.locator('a[title="Payroll"]').first();
      const payrollByRole = this.page.getByRole('link', { name: 'Payroll', exact: true }).first();
      const payTarget = await payrollLink.isVisible({ timeout: 5000 }).catch(() => false)
        ? payrollLink
        : payrollByRole;
      if (await payTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
        await payTarget.click({ force: true });
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
        await this.page.waitForTimeout(5000);
        // On payroll landing, look for Element Entries task link
        const eeTask = this.page.locator('a:has-text("Element Entries")').first();
        if (await eeTask.isVisible({ timeout: 10_000 }).catch(() => false)) {
          await eeTask.click({ force: true });
        }
      } else {
        // Fallback: navigate to Payroll via direct ADF URL
        await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll');
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      }
    }
    await this.closeNavigator();
    await this.page.waitForTimeout(5000);
    await this.waitForReady();

    // Verify we landed on Element Entries page — look for the search field
    const eeSearchField = this.page.locator(
      '[id*="pglSearchByPersonNumberPersonNameA::content"], [id*="personName::content"], input[placeholder*="Person"], ' +
      'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"]'
    ).first();
    if (!await eeSearchField.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try deep link to Element Entries
      console.log('[Home] Element Entries page not loaded — trying deep link');
      const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
      await this.page.goto(`${baseUrl}/fscmUI/faces/deeplink?objType=ELEMENT_ENTRIES&action=NONE`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      }).catch(() => {});
      await this.page.waitForTimeout(5000);
      await this.waitForReady();
    }
  }

  /** Navigate to an Oracle HCM page by its fndGlobalItemNodeId (direct URL bypass). */
  private async gotoDirectUrl(itemNodeId: string): Promise<void> {
    await this.page.goto(
      `/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=${itemNodeId}`,
      { timeout: 60_000 },
    );
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** Go to the home springboard. */
  async goHome(): Promise<void> {
    await this.page.goto('/fscmUI/faces/AtkHomePageWelcome');
    await this.waitForReady();
    await this.dismissPopups();
  }
}
