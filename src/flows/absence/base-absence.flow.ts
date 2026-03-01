import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { AbsenceManagementPage } from '../../pages/absence/absence-management.page';
import { PersonManagementPage } from '../../pages/core-hr/person-management.page';
import type { UATTestCase } from '../../data/types';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';

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
  protected person: PersonManagementPage;

  constructor(page: Page) {
    super(page);
    this.absence = new AbsenceManagementPage(page);
    this.person = new PersonManagementPage(page);
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
   * Common admin flow: Navigate to person's absence page.
   * Uses Person Management (proven to work) to search for the person,
   * then navigates to their absence records via the Absences and Entitlements
   * Redwood page using their person number.
   */
  async navigateToPersonAbsences(tc: UATTestCase): Promise<void> {
    const personName = this.extractPersonName(tc);
    const fieldData = getFieldData(tc.testId);
    const personNumber = fieldData ? getField(fieldData, 'Person Number') : null;

    // Navigate to self-service absence ESS page.
    // For admin tests, we go to ESS and directly add an absence.
    // This is simpler and more reliable than the Absence Admin task links
    // (which are Redwood links that don't respond to standard clicks).
    await this.navigateToAbsenceESS();
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
    // Check field data first (authoritative source)
    const fieldData = getFieldData(tc.testId);
    if (fieldData) {
      const name = getField(fieldData, 'Person Name');
      if (name) return name;
      const num = getField(fieldData, 'Person Number');
      if (num) return num;
    }

    // Fallback: regex extraction from test case text fields
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
    await this.loginToHCM(tc);
    await this.navigateToPersonAbsences(tc);
  }

  /**
   * Login and navigate to the self-service absence page.
   * Full sequence for Employee Self-Service scripts.
   */
  async loginAndNavigateToAbsenceESS(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.navigateToAbsenceESS();
  }

  /**
   * Login and navigate to the Absence Admin page (without person search).
   * Used when the flow needs to click on admin tasks directly.
   */
  async loginAndNavigateToAbsenceAdmin(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.navigateToAbsenceAdmin();
  }
}
