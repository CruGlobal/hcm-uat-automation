import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { TimecardPage } from '../../pages/time-labor/timecard.page';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { TestCase, UATTestCase } from '../../data/types';

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
   * Path: My Client Groups > Time Management (via Navigator)
   * Falls back to Scheduled Processes if user lacks Time Management access.
   */
  async navigateToTimeAdmin(): Promise<void> {
    try {
      await this.homePage.goToTimeAdmin();
      await this.page.waitForTimeout(5000);
      // Verify we actually landed on Time Management (not bounced to home)
      const url = this.page.url();
      if (url.includes('time') || url.includes('Time')) return;

      // Also check for Time Management page elements (sidebar links, Team Time Cards)
      const timeManagementIndicator = this.page.locator(
        'a:has-text("Team Time Cards"), [id*="TimeManagement"], ' +
        'h1:has-text("Time Management"), a:has-text("Time Administration")'
      ).first();
      if (await timeManagementIndicator.isVisible({ timeout: 3000 }).catch(() => false)) return;
    } catch (err) {
      console.log(`[Time] Navigator path to Time Management failed: ${err}`);
    }

    // Fallback 1: Try direct URL for Time Management
    try {
      await this.page.goto('/fscmUI/faces/AtkHomePageWelcome', { timeout: 30_000 }).catch(() => {});
      await this.page.waitForTimeout(3000);
    } catch {}

    // Fallback 2: use Scheduled Processes (Tools > Scheduled Processes)
    console.log('[Time] Time Management admin not accessible, falling back to Scheduled Processes');
    try {
      await this.homePage.goToScheduledProcesses();
      await this.page.waitForTimeout(5000);
    } catch (err) {
      console.log(`[Time] Scheduled Processes fallback also failed: ${err}`);
      throw new Error('Time Management admin access not available and Scheduled Processes fallback failed');
    }
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
   * Get structured field data for a test ID from the migration DB cache.
   * Returns undefined if no field data exists for the test.
   */
  protected getTestFieldData(testId: string): TestCase | undefined {
    return getFieldData(testId);
  }

  /**
   * Extract a field value, checking migration DB field data first, then falling
   * back to regex parsing of the testData free-text string.
   *
   * @param fieldData - Structured field data from migration DB (may be undefined)
   * @param testData - Free-text testData string from UAT Plan
   * @param fieldKey - Partial key to search for (case-insensitive)
   * @param regexKey - Regex key for fallback (defaults to fieldKey)
   */
  protected extractFieldWithFallback(
    fieldData: TestCase | undefined,
    testData: string,
    fieldKey: string,
    regexKey?: string
  ): string | undefined {
    // First: check structured field data from migration DB
    if (fieldData) {
      const value = getField(fieldData, fieldKey);
      if (value) return value;
    }
    // Fallback: regex parse from testData text
    if (!testData) return undefined;
    const key = regexKey || fieldKey;
    const regex = new RegExp(`${key}[:\\s]+([^\\n,;]+)`, 'i');
    const match = testData.match(regex);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Determine the script category from the test script ID.
   *
   * NOTE: The actual UAT Plan script numbers do NOT follow a simple hundreds-based mapping.
   * Numbers range from 301 to 7301 and the old range-based logic returned 'unknown' for
   * anything >= 2200 (i.e., most tests). We now use a specific script-number lookup first,
   * then fall back to range-based guessing, and finally return 'unknown' for truly
   * unmapped scripts — which the caller handles via business-process-based routing.
   */
  protected getScriptCategory(testScript: string): string {
    // Handle optional spaces in script IDs like "HCM.OTL. 5301.00" or "HCM . OTL. 6201.00"
    const match = testScript.match(/OTL\.\s*(\d+)/i);
    if (!match) return 'unknown';
    const scriptNum = parseInt(match[1], 10);

    // --- Known specific script numbers from the UAT Plan ---
    // ESS Timecard Entry (HCM.OTL.301, 2701, 3101, 4401, 4801-4808, 5401, 5801, 7301)
    if (scriptNum === 301) return 'create-redwood';
    if ([2701, 3101, 4401, 5401, 5801, 7301].includes(scriptNum)) return 'create-redwood';
    if (scriptNum >= 4801 && scriptNum <= 4808) return 'create-redwood';

    // ESS Absence on Timecard (HCM.OTL.1201)
    if (scriptNum === 1201) return 'absence-on-timecard';

    // ESS Timecard Attestation (HCM.OTL.2601)
    if (scriptNum === 2601) return 'attestation';

    // ESS Timecard Validation (HCM.OTL.2901, 4901, 5001)
    if ([2901, 4901, 5001].includes(scriptNum)) return 'validation';

    // ESS Time Calculation (HCM.OTL.3701, 5001, 5101, 5201, 5301, 6701, 6801)
    if ([3701, 5101, 5201, 5301, 6701, 6801].includes(scriptNum)) return 'time-calculation';

    // ESS Web Clock (HCM.OTL.6201, 6901, 7001, 7201)
    if ([6201, 6901, 7001, 7201].includes(scriptNum)) return 'web-clock';

    // Manager Timecard Entry (HCM.OTL.3301, 4701)
    if ([3301, 4701].includes(scriptNum)) return 'manager-create';

    // Manager Absence on Timecard (HCM.OTL.3201)
    if (scriptNum === 3201) return 'manager-absence-on-timecard';

    // Manager Time Approval (HCM.OTL.1501, 1502, 5901, 6001, 6101)
    if ([1501, 1502].includes(scriptNum)) return 'approve-via-bell';
    if ([5901, 6001, 6101].includes(scriptNum)) return 'manager-approve-redwood';

    // Manager Timecard Update (HCM.OTL.1601)
    if (scriptNum === 1601) return 'manager-update';

    // Manager Timecard Amendments / return for correction (HCM.OTL.1401, 1402, 2301)
    if ([1401, 1402].includes(scriptNum)) return 'time-change-request';
    if (scriptNum === 2301) return 'timecard-amendments';

    // HR Specialist Transactions (HCM.OTL.3401, 3801)
    if ([3401, 3801].includes(scriptNum)) return 'hr-transactions';

    // HR Specialist Configuration (HCM.OTL.3901, 4101, 4201, 4301)
    if ([3901, 4101, 4201, 4301].includes(scriptNum)) return 'hr-config';

    // HR Specialist Timecard Entry (HCM.OTL.4501, 4601, 4701, 5501)
    if ([4501, 4601, 5501].includes(scriptNum)) return 'hr-timecard-entry';

    // HR Specialist Timecard Review/Dashboard (HCM.OTL.5601, 5701)
    // 5601 = OTL Dashboards (view submitted/approved status)
    // 5701 = Time entered but not approved (view unapproved timecards)
    if ([5601, 5701].includes(scriptNum)) return 'hr-timecard-review';

    // HR Specialist Processing (HCM.OTL.6301, 6501)
    if ([6301, 6501].includes(scriptNum)) return 'hr-processing';

    // HR Specialist Reports (HCM.OTL.6601)
    if (scriptNum === 6601) return 'hr-reports';

    // System: Time Entry notification (HCM.OTL.2401)
    if (scriptNum === 2401) return 'notification';

    // --- Fallback: range-based guessing for any unexpected numbers ---
    if (scriptNum >= 100 && scriptNum < 200) return 'generate-timecards';
    if (scriptNum >= 200 && scriptNum < 300) return 'generate-events';
    if (scriptNum >= 300 && scriptNum < 400) return 'create-redwood';
    if (scriptNum >= 1200 && scriptNum < 1300) return 'absence-on-timecard';
    if (scriptNum >= 1500 && scriptNum < 1600) return 'approve-via-bell';
    if (scriptNum >= 1800 && scriptNum < 1900) return 'manager-approve-redwood';
    if (scriptNum >= 1900 && scriptNum < 2000) return 'mass-submit-admin';
    if (scriptNum >= 2000 && scriptNum < 2100) return 'mass-approve-admin';

    return 'unknown';
  }

  /**
   * Determine the flow action from the business process and transaction category.
   * This is the PRIMARY routing mechanism since script numbers are unreliable.
   * Returns a normalized action string that flows can switch on.
   */
  protected getFlowAction(tc: UATTestCase): string {
    const bp = tc.businessProcess.toLowerCase();
    const cat = (tc.transactionCategory || '').toLowerCase();
    const scenario = (tc.testScenario || '').toLowerCase();

    // First try script category for known mappings
    const scriptCat = this.getScriptCategory(tc.testScript);
    if (scriptCat !== 'unknown') return scriptCat;

    // Route by business process + transaction category
    if (bp.includes('web clock')) return 'web-clock';
    if (bp.includes('absence on timecard')) {
      return cat.includes('manager') ? 'manager-absence-on-timecard' : 'absence-on-timecard';
    }
    if (bp.includes('attestation') || bp.includes('attest')) return 'attestation';
    if (bp.includes('validation') || bp.includes('validate')) return 'validation';
    if (bp.includes('time calculation') || bp.includes('time calc')) return 'time-calculation';
    if (bp.includes('time approval') || bp.includes('approval')) {
      if (cat.includes('manager')) return 'manager-approve-redwood';
      return 'approve-via-bell';
    }
    if (bp.includes('amendments') || bp.includes('amendment')) return 'timecard-amendments';
    if (bp.includes('time entry notification') || bp.includes('notification')) return 'notification';
    if (bp.includes('reports') || bp.includes('report')) return 'hr-reports';
    if (bp.includes('processing') || bp.includes('process')) return 'hr-processing';
    if (bp.includes('hr specialist config') || bp.includes('configuration')) return 'hr-config';
    if (bp.includes('hr specialist') && bp.includes('transaction')) return 'hr-transactions';

    // Timecard Entry routing by transaction category
    if (bp.includes('timecard entry') || bp.includes('entry') || bp.includes('timecard')) {
      if (cat.includes('manager')) return 'manager-create';
      if (cat.includes('hr spec') || cat.includes('hr specialist')) return 'hr-timecard-entry';
      return 'create-redwood';
    }

    // Default by category
    if (cat.includes('manager')) return 'manager-create';
    if (cat.includes('hr spec') || cat.includes('hr specialist')) return 'hr-transactions';
    if (cat.includes('system') || cat.includes('admin')) return 'hr-processing';
    return 'create-redwood';
  }
}
