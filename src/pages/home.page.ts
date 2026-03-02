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
   * Open the navigator/hamburger menu and expand all sections.
   * If Navigator isn't visible, attempts session recovery (re-login).
   */
  async openNavigator(): Promise<void> {
    const navVisible = await this.navigator.isVisible({ timeout: 5000 }).catch(() => false);
    if (!navVisible) {
      // Session may have expired — try navigating to home first
      console.log('[Home] Navigator not visible, attempting session recovery...');
      const url = this.page.url();

      if (url.includes('login') || url.includes('okta') || url.includes('signin')) {
        // On login page — re-authenticate
        console.log('[Home] On login page, re-authenticating...');
        const login = new LoginPage(this.page);
        await login.fullLogin();
      } else {
        // Try navigating to Oracle HCM home
        await this.page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 60_000 }).catch(() => {});
        await this.page.waitForTimeout(5000);
      }

      // Check again
      const retryVisible = await this.navigator.isVisible({ timeout: 10000 }).catch(() => false);
      if (!retryVisible) {
        throw new Error('Navigator not visible after session recovery attempt');
      }
    }

    // Dismiss any overlaying popups before clicking
    await this.dismissPopups();
    await this.navigator.click({ force: true });
    await this.page.waitForTimeout(2000);
    if (await this.showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.showMore.click({ force: true });
      await this.page.waitForTimeout(2000);
    }
    // Wait for ADF to finish rendering nav items (critical after session recovery)
    await this.waitForJET();
  }

  /**
   * Generic navigator helper: opens the hamburger menu, clicks a nav item by
   * its ADF id suffix, and waits for the destination page to settle.
   * Falls back to matching by link title/text if the ADF ID is not found.
   */
  async navigateVia(navItemId: string, linkText?: string): Promise<void> {
    await this.openNavigator();
    const byId = this.page.locator(`[id$="${navItemId}"]`);
    if (await byId.isVisible({ timeout: 3000 }).catch(() => false)) {
      await byId.click({ force: true });
    } else if (linkText) {
      // Fallback: click by exact link name using accessible role
      const byRole = this.page.getByRole('link', { name: linkText, exact: true }).first();
      if (await byRole.isVisible({ timeout: 3000 }).catch(() => false)) {
        await byRole.click({ force: true });
      } else {
        // Broader fallback: match by has-text
        const byText = this.page.locator(`a:has-text("${linkText}")`).first();
        try {
          await byText.click({ force: true });
        } catch {
          // Last resort: JS click bypasses display:none CSS which force:true cannot overcome
          await byText.evaluate((el: HTMLElement) => el.click());
        }
      }
    } else {
      // Last resort: try the ID selector with longer timeout
      await byId.click({ force: true, timeout: 10_000 });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  /** Navigate to My Client Groups > New Person task page. */
  async goToNewPerson(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_new_person', 'New Person');
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

  /** Navigate to Person Management (My Client Groups > Person Management). */
  async goToPersonManagement(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_person_management', 'Person Management');
  }

  /** Navigate to Absence Administration (My Client Groups). */
  async goToAbsenceAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_absence_administration');
  }

  /** Navigate to self-service Absences (My Information > Time and Absences). */
  async goToAbsenceESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_absences1', 'Time and Absences');
  }

  /** Navigate to self-service Benefits (My Information). */
  async goToBenefitsESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_itemNode_my_information_benefits_Redwood', 'Benefits');
  }

  /** Navigate to Benefits Activity Center (Benefits Administration). */
  async goToBenefitsAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_groupNode_benefits_BenefitsActivityCenter', 'Benefits Activity Center');
  }

  /** Navigate to Workforce Compensation (Manager Resources). */
  async goToWorkforceCompensation(): Promise<void> {
    await this.navigateVia('nv_itemNode_manager_resources_workforce_compensation', 'Workforce Compensation');
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

  /** Navigate to Scheduled Processes (Tools). */
  async goToScheduledProcesses(): Promise<void> {
    await this.navigateVia('nv_itemNode_tools_scheduled_processes_fuse_plus', 'Scheduled Processes');
  }

  /** Navigate to Time Management (My Client Groups). */
  async goToTimeAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_time_management', 'Time Management');
  }

  /** Navigate to self-service Time (My Information). */
  async goToTimeESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_time', 'Time and Absences');
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
    await this.page.waitForTimeout(5000);
    await this.waitForReady();
  }

  /** Go to the home springboard. */
  async goHome(): Promise<void> {
    await this.page.goto('/fscmUI/faces/AtkHomePageWelcome');
    await this.waitForReady();
    await this.dismissPopups();
  }
}
