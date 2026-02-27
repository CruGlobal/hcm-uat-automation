import { type Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Oracle HCM Home/Springboard page.
 * Provides navigation via the Navigator hamburger menu.
 */
export class HomePage extends BasePage {
  private readonly navigator = this.page.locator('a[title="Navigator"]');
  private readonly showMore = this.page.locator('a:has-text("Show More")').first();

  // New Person task page — link IDs under My Client Groups > New Person
  private readonly TASK_LINK_PREFIX = '_FOpt1:_FOr1:0:_FONSr2:0:_FOTsr1:0:cl01Upl:UPsp1:cl01Pce:';

  /** Open the navigator/hamburger menu and expand all sections. */
  async openNavigator(): Promise<void> {
    await this.navigator.click();
    await this.page.waitForTimeout(2000);
    if (await this.showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.showMore.click();
      await this.page.waitForTimeout(2000);
    }
  }

  /**
   * Generic navigator helper: opens the hamburger menu, clicks a nav item by
   * its ADF id suffix, and waits for the destination page to settle.
   */
  async navigateVia(navItemId: string): Promise<void> {
    await this.openNavigator();
    await this.page.locator(`[id$="${navItemId}"]`).click({ force: true });
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  /** Navigate to My Client Groups > New Person task page. */
  async goToNewPerson(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_new_person');
  }

  /** Click a task on the New Person page using AdfActionEvent. */
  async clickNewPersonTask(taskIndex: number): Promise<void> {
    const linkId = `${this.TASK_LINK_PREFIX}cl01Lv:${taskIndex}:cl01Pse:cl01Cl`;
    await this.clickAdfLink(linkId);
    await this.page.waitForTimeout(10_000); // ADF forms take time to render
  }

  /** Navigate to "Hire an Employee" form (task index 1). */
  async goToHireEmployee(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(1);
  }

  /** Navigate to "Add a Contingent Worker" form (task index 2). */
  async goToAddContingentWorker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(2);
  }

  /** Navigate to "Add a Pending Worker" form (task index 3). */
  async goToAddPendingWorker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(3);
  }

  /** Navigate to "Add a Nonworker" form (task index 4). */
  async goToAddNonworker(): Promise<void> {
    await this.goToNewPerson();
    await this.clickNewPersonTask(4);
  }

  /** Navigate to Person Management (My Client Groups > Person Management). */
  async goToPersonManagement(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_person_management');
  }

  /** Navigate to Absence Administration (My Client Groups). */
  async goToAbsenceAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_absence_administration');
  }

  /** Navigate to self-service Absences (My Information). */
  async goToAbsenceESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_absences1');
  }

  /** Navigate to self-service Benefits (My Information). */
  async goToBenefitsESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_itemNode_my_information_benefits_Redwood');
  }

  /** Navigate to Benefits Activity Center (Benefits). */
  async goToBenefitsAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_groupNode_benefits_BenefitsActivityCenter');
  }

  /** Navigate to Workforce Compensation (Manager Resources). */
  async goToWorkforceCompensation(): Promise<void> {
    await this.navigateVia('nv_itemNode_manager_resources_workforce_compensation');
  }

  /** Navigate to Workforce Structures (My Client Groups). */
  async goToWorkforceStructures(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_workforce_structures');
  }

  /** Navigate to Organization Journeys (My Client Groups). */
  async goToJourneysAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_Journeys');
  }

  /** Navigate to My Journeys (My Information). */
  async goToJourneysESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_Journeys');
  }

  /** Navigate to self-service Pay (My Information). */
  async goToPayESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_pay');
  }

  /** Navigate to Scheduled Processes (Tools). */
  async goToScheduledProcesses(): Promise<void> {
    await this.navigateVia('nv_itemNode_tools_scheduled_processes_fuse_plus');
  }

  /** Navigate to Time Management (My Client Groups). */
  async goToTimeAdmin(): Promise<void> {
    await this.navigateVia('nv_itemNode_workforce_management_time_management');
  }

  /** Navigate to self-service Time (My Information). */
  async goToTimeESS(): Promise<void> {
    await this.navigateVia('nv_itemNode_my_information_time');
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
    // Look for "Element Entries" or "Payroll" in the navigator
    const elementEntriesLink = this.page.locator(
      '[id$="nv_itemNode_payroll_element_entries"], ' +
      'a[title="Element Entries"], ' +
      '[id*="element_entries"]'
    ).first();
    if (await elementEntriesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await elementEntriesLink.click({ force: true });
    } else {
      // Try navigating via Payroll section first
      const payrollLink = this.page.locator(
        '[id$="nv_itemNode_payroll_payroll"], a[title="Payroll"]'
      ).first();
      if (await payrollLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await payrollLink.click({ force: true });
      }
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  /** Go to the home springboard. */
  async goHome(): Promise<void> {
    await this.page.goto('/fscmUI/faces/AtkHomePageWelcome');
    await this.waitForReady();
    await this.dismissPopups();
  }
}
