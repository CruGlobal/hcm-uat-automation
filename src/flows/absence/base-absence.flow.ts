import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { AbsenceManagementPage } from '../../pages/absence/absence-management.page';
import type { UATTestCase } from '../../data/types';

/**
 * Base flow for Absence Management.
 * Handles login, navigation, and common operations shared across absence flows.
 *
 * Navigation paths (from test scripts):
 * - Admin: Login -> My Client Groups tab -> Absences tile -> Absence Administration page
 * - ESS:   Login -> Me tab -> Time and Absences -> Self-service tiles
 * - Manager: Login -> My Team tab or Notifications -> Approve/Reject actions
 *
 * The admin page is accessed via Navigator > absence_administration nav item.
 * The ESS page is accessed via Navigator > absences1 nav item.
 */
export class BaseAbsenceFlow extends BaseFlow {
  protected absence: AbsenceManagementPage;

  constructor(page: Page) {
    super(page);
    this.absence = new AbsenceManagementPage(page);
  }

  /**
   * Navigate to the Absence Administration page (HR Specialist view).
   * Uses Navigator > My Client Groups > Absences (absence_administration).
   * This is the page with task links: "Absences and Entitlements",
   * "Work Schedule Assignment", "Schedule and Monitor Absence Processes", etc.
   */
  async navigateToAbsenceAdmin(): Promise<void> {
    await this.homePage.goToAbsenceAdmin();
  }

  /**
   * Navigate to the self-service Time and Absences page (Employee/Manager ESS view).
   * Uses Navigator > My Information > Time and Absences (absences1).
   * This is the page with card tiles: "Add Absence", "Absence Balance",
   * "Existing Absences", "Calendar", etc.
   */
  async navigateToAbsenceESS(): Promise<void> {
    await this.homePage.goToAbsenceESS();
  }

  /**
   * Common admin flow: Navigate to Absence Admin > Absences and Entitlements > Search person.
   * This is the shared starting sequence for most HR Specialist test scripts:
   *   Step 1: Log into Oracle
   *   Step 2: My Client Groups tab (via Navigator)
   *   Step 3: Click Absences tile
   *   Step 4: Click Absences and Entitlements (or Absence Records) link
   *   Step 5: Search for person by name or number
   */
  async navigateToPersonAbsences(tc: UATTestCase): Promise<void> {
    await this.navigateToAbsenceAdmin();
    await this.absence.openAbsencesAndEntitlements();
    const personName = this.extractPersonName(tc);
    if (personName) {
      await this.absence.searchPerson(personName);
    }
  }

  /**
   * Navigate to Notifications / Approvals page for manager actions.
   * Clicks the notification bell icon in the global header bar.
   */
  async navigateToApprovals(): Promise<void> {
    await this.absence.openNotifications();
  }

  /**
   * Extract a person name or number from the test case data.
   * Looks in testData, preConditions, and testScenario fields.
   */
  protected extractPersonName(tc: UATTestCase): string {
    const sources = [tc.testData || '', tc.preConditions || '', tc.testScenario || ''];
    for (const source of sources) {
      const match = source.match(/(?:person|employee|worker|name|person\s*number)\s*[:=]\s*(.+)/i);
      if (match) return match[1].trim();
    }
    return '';
  }

  /**
   * Extract a plan name from test case data.
   */
  protected extractPlanName(tc: UATTestCase): string {
    const sources = [tc.testData || '', tc.preConditions || ''];
    for (const source of sources) {
      const match = source.match(/(?:plan|plan\s*name)\s*[:=]\s*(.+)/i);
      if (match) return match[1].trim();
    }
    return '';
  }

  /**
   * Login and navigate to absence admin, then to the person's absence page.
   * Full sequence for HR Specialist scripts.
   */
  async loginAndNavigateToPersonAbsences(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();
    await this.navigateToPersonAbsences(tc);
  }

  /**
   * Login and navigate to the self-service absence page.
   * Full sequence for Employee Self-Service scripts.
   */
  async loginAndNavigateToAbsenceESS(): Promise<void> {
    await this.loginToHCM();
    await this.navigateToAbsenceESS();
  }

  /**
   * Login and navigate to the Absence Admin page (without person search).
   * Used when the flow needs to click on admin tasks directly.
   */
  async loginAndNavigateToAbsenceAdmin(): Promise<void> {
    await this.loginToHCM();
    await this.navigateToAbsenceAdmin();
  }
}
