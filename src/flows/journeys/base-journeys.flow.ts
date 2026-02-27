import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { JourneysPage } from '../../pages/journeys/journeys.page';

/**
 * Base flow for Journeys module.
 * Handles login and navigation to the Journeys area in Oracle HCM.
 *
 * Journeys navigation:
 *   Navigator > My Client Groups > Journeys
 *   URL: /fscmUI/redwood/journeys/...
 *
 * The Journeys page is a Redwood UI (JET/oj-* components) with:
 * - Search by person name (ojHcmAdvancedSearchBox)
 * - Filter pills: Status, Category
 * - 5 tabs: Explore, My Journeys, My Tasks, Organization Journeys, Activity
 */
export class BaseJourneysFlow extends BaseFlow {
  protected journeysPage: JourneysPage;

  constructor(page: Page) {
    super(page);
    this.journeysPage = new JourneysPage(page);
  }

  /** Navigate to the Journeys area via the Navigator menu. */
  async navigateToJourneys(): Promise<void> {
    await this.homePage.openNavigator();

    // Try direct Journeys link in navigator
    const journeysLink = this.page.locator(
      'a[title="Journeys"], a:has-text("Journeys")'
    ).first();

    if (await journeysLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await journeysLink.click({ force: true });
    } else {
      // Fallback: try navigating via My Client Groups section
      const myClientGroups = this.page.locator(
        'a:has-text("My Client Groups")'
      ).first();
      if (await myClientGroups.isVisible({ timeout: 3000 }).catch(() => false)) {
        await myClientGroups.click({ force: true });
        await this.page.waitForTimeout(2000);
        const journeysSub = this.page.locator('a:has-text("Journeys")').first();
        if (await journeysSub.isVisible({ timeout: 3000 }).catch(() => false)) {
          await journeysSub.click({ force: true });
        }
      }
    }

    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.journeysPage.waitForJET();
    await this.journeysPage.dismissPopups();
  }

  /** Login to HCM and navigate to Journeys. */
  async loginAndNavigate(): Promise<void> {
    await this.loginToHCM();
    await this.navigateToJourneys();
  }
}
