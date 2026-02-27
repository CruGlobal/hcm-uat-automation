import { type Page, expect } from '@playwright/test';
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

  /** Navigate to My Client Groups > New Person task page. */
  async goToNewPerson(): Promise<void> {
    await this.openNavigator();
    await this.page.locator('[id$="nv_itemNode_workforce_management_new_person"]').click({ force: true });
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
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
    await this.openNavigator();
    await this.page.locator('[id$="nv_itemNode_workforce_management_person_management"]').click({ force: true });
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
