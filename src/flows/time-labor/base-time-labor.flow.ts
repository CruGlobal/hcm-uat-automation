import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { TimecardPage } from '../../pages/time-labor/timecard.page';

/**
 * Base flow for Time and Labor module.
 * Handles login and navigation to Time and Labor areas in Oracle HCM.
 *
 * Navigation paths:
 * - ESS (Employee): Me > Time and Absences (card tiles: Current/Add Time Card)
 * - Manager: My Team > Quick Actions > Show More > Team Time Cards
 * - Admin: My Client Groups > Time Management (sidebar + tasks panel)
 * - Scheduled Processes: Time Management > Tasks > Scheduled Processes
 */
export class BaseTimeLaborFlow extends BaseFlow {
  protected timecardPage: TimecardPage;

  constructor(page: Page) {
    super(page);
    this.timecardPage = new TimecardPage(page);
  }

  /**
   * Navigate to the ESS Time and Absences page.
   * Path: Me > Time and Absences
   * Shows card tiles: Current Time Card, Add Time Card, Existing Time Cards, etc.
   */
  async navigateToTimeESS(): Promise<void> {
    await this.homePage.goToTimeESS();
    await this.page.waitForTimeout(5000);
  }

  /**
   * Navigate to Time Management admin page.
   * Path: My Client Groups > Time Management
   * Shows sidebar with Team Time Cards, Time Management Overview, etc.
   * Right-side Tasks panel has: Generate Time Cards, Time Events, Scheduled Processes.
   */
  async navigateToTimeAdmin(): Promise<void> {
    await this.homePage.goToTimeAdmin();
    await this.page.waitForTimeout(5000);
  }

  /**
   * Navigate to Team Time Cards via My Team quick actions (manager/Redwood).
   * Path: My Team > Quick Actions > Show More > Team Time Cards
   */
  async navigateToTeamTimeCards(): Promise<void> {
    // Navigate home first, then use the Me/My Team springboard
    const myTeamLink = this.page.locator(
      'a:has-text("My Team"), [id*="my_team"], [id*="myTeam"]'
    ).first();

    const hasMyTeam = await myTeamLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasMyTeam) {
      await myTeamLink.click();
      await this.page.waitForTimeout(3000);
    }

    // Click "Show More" under Quick Actions
    const showMore = this.page.locator(
      'a:has-text("Show More"), button:has-text("Show More")'
    ).first();
    const hasShowMore = await showMore.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasShowMore) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    // Click "Team Time Cards"
    const teamTimeCards = this.page.locator(
      'a:has-text("Team Time Cards"), [id*="teamTimeCards"]'
    ).first();
    const hasTeamTC = await teamTimeCards.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTeamTC) {
      await teamTimeCards.click();
      await this.page.waitForTimeout(5000);
      await this.timecardPage.waitForJET();
    } else {
      // Fallback: navigate via Navigator
      await this.homePage.openNavigator();
      const navLink = this.page.locator(
        'a[title="Team Time Cards"], a:has-text("Team Time Cards")'
      ).first();
      const hasNavLink = await navLink.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasNavLink) {
        await navLink.click({ force: true });
        await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
        await this.page.waitForTimeout(5000);
      }
    }
  }

  /**
   * Navigate to Team Change Requests (manager).
   * Path: My Team > Quick Actions > Show More > Team Change Requests
   */
  async navigateToTeamChangeRequests(): Promise<void> {
    const myTeamLink = this.page.locator(
      'a:has-text("My Team"), [id*="my_team"]'
    ).first();

    const hasMyTeam = await myTeamLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasMyTeam) {
      await myTeamLink.click();
      await this.page.waitForTimeout(3000);
    }

    const showMore = this.page.locator(
      'a:has-text("Show More"), button:has-text("Show More")'
    ).first();
    const hasShowMore = await showMore.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasShowMore) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    const changeRequests = this.page.locator(
      'a:has-text("Team Change Requests"), [id*="changeRequests"]'
    ).first();
    const hasCR = await changeRequests.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCR) {
      await changeRequests.click();
      await this.page.waitForTimeout(5000);
      await this.timecardPage.waitForJET();
    }
  }

  /**
   * Navigate to the notifications bell for approval actions.
   * Used by HCM.OTL.1501.00 and HCM.OTL.1801.00.
   */
  async navigateToNotifications(): Promise<void> {
    // The bell is always visible on the page header
    await this.page.waitForTimeout(2000);
  }

  /**
   * Determine the script category from the test script ID.
   * Returns the major script number (e.g., "1" for HCM.OTL.1xx, "3" for HCM.OTL.3xx).
   */
  protected getScriptCategory(testScript: string): string {
    const match = testScript.match(/OTL\.(\d+)/i);
    if (!match) return '0';
    const scriptNum = parseInt(match[1], 10);
    if (scriptNum >= 100 && scriptNum < 200) return 'generate-timecards';
    if (scriptNum >= 200 && scriptNum < 300) return 'generate-events';
    if (scriptNum >= 300 && scriptNum < 400) return 'create-redwood';
    if (scriptNum >= 400 && scriptNum < 500) return 'edit-redwood';
    if (scriptNum >= 500 && scriptNum < 600) return 'mass-action-redwood';
    if (scriptNum >= 600 && scriptNum < 700) return 'create-classic';
    if (scriptNum >= 700 && scriptNum < 800) return 'edit-classic';
    if (scriptNum >= 800 && scriptNum < 900) return 'mass-action-classic';
    if (scriptNum >= 900 && scriptNum < 1000) return 'hcm-group';
    if (scriptNum >= 1000 && scriptNum < 1100) return 'view-current';
    if (scriptNum >= 1100 && scriptNum < 1200) return 'view-existing';
    if (scriptNum >= 1200 && scriptNum < 1300) return 'absence-on-timecard';
    if (scriptNum >= 1300 && scriptNum < 1400) return 'print-timecard';
    if (scriptNum >= 1400 && scriptNum < 1500) return 'time-change-request';
    if (scriptNum >= 1500 && scriptNum < 1600) return 'approve-via-bell';
    if (scriptNum >= 1600 && scriptNum < 1700) return 'manager-update';
    if (scriptNum >= 1700 && scriptNum < 1800) return 'manager-create';
    if (scriptNum >= 1800 && scriptNum < 1900) return 'manager-approve-redwood';
    if (scriptNum >= 1900 && scriptNum < 2000) return 'mass-submit-admin';
    if (scriptNum >= 2000 && scriptNum < 2100) return 'mass-approve-admin';
    if (scriptNum >= 2100 && scriptNum < 2200) return 'employee-approve';
    return 'unknown';
  }
}
