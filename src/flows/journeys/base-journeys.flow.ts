import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { JourneysPage } from '../../pages/journeys/journeys.page';
import type { UATTestCase } from '../../data/types';

/**
 * Base flow for Journeys module.
 * Handles login and navigation to the Journeys area in Oracle HCM.
 *
 * Journeys navigation (3 strategies):
 *   1. Navigator > My Client Groups > Journeys
 *   2. Direct Redwood URL: /fscmUI/redwood/journeys/...
 *   3. Navigator > My Information > Journeys (ESS fallback)
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

  /** Navigate to the Journeys area via multiple strategies. */
  async navigateToJourneys(): Promise<void> {
    // Strategy 1: Use HomePage's dedicated navigation method
    try {
      await this.homePage.goToJourneysAdmin();
      await this.page.waitForTimeout(3000);
      await this.journeysPage.waitForJET();
      await this.journeysPage.dismissPopups();

      // Verify we're on the Journeys page
      const isOnJourneys = await this.verifyJourneysPage();
      if (isOnJourneys) return;
    } catch (err) {
      console.log(`[Journeys] Strategy 1 (Navigator admin) failed: ${err}`);
    }

    // Strategy 2: Direct Redwood URL
    try {
      console.log('[Journeys] Trying direct Redwood URL...');
      await this.page.goto('/fscmUI/redwood/journeys', { timeout: 60_000 });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      await this.page.waitForTimeout(5000);
      await this.journeysPage.waitForJET();
      await this.journeysPage.dismissPopups();

      const isOnJourneys = await this.verifyJourneysPage();
      if (isOnJourneys) return;
    } catch (err) {
      console.log(`[Journeys] Strategy 2 (Redwood URL) failed: ${err}`);
    }

    // Strategy 3: ESS navigation (My Information > Journeys)
    try {
      console.log('[Journeys] Trying ESS navigation...');
      await this.homePage.goToJourneysESS();
      await this.page.waitForTimeout(3000);
      await this.journeysPage.waitForJET();
      await this.journeysPage.dismissPopups();
      return;
    } catch (err) {
      console.log(`[Journeys] Strategy 3 (ESS) failed: ${err}`);
    }

    // Strategy 4: Navigator with manual link click
    console.log('[Journeys] Trying manual Navigator navigation...');
    await this.homePage.openNavigator();

    // Try "Journeys" link directly
    const journeysLink = this.page.locator(
      'a[title="Journeys"], a:has-text("Journeys")'
    ).first();

    if (await journeysLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await journeysLink.click({ force: true });
    } else {
      // Try via "My Client Groups" section
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

  /** Verify we're on the Journeys page by checking for characteristic elements. */
  private async verifyJourneysPage(): Promise<boolean> {
    // Check for Journeys-specific elements
    const indicators = [
      'a[role="tab"]:has-text("Organization Journeys")',
      'a[role="tab"]:has-text("My Journeys")',
      'a[role="tab"]:has-text("Explore")',
      'input[aria-label="Search by person name"]',
      '[id*="journeys"]',
    ];

    for (const sel of indicators) {
      const el = this.page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  /** Login to HCM and navigate to Journeys. */
  async loginAndNavigate(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.navigateToJourneys();
  }
}
