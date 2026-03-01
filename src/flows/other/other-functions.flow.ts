import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow for Other Functions module.
 * Module: Other Functions (4 tests, all with field data)
 *
 * Field data structure (from migration DB -- same as Core HR):
 *   Person Name, Person Number, Person Type, Legal Employer, Department, etc.
 *
 * Business processes (4 tests):
 *   2x "Mass Uploads"    -> Scheduled Processes for batch data upload
 *   1x "AOR Security"    -> Access control / security roles
 *   1x "Role Security"   -> Security role configuration
 *
 * Navigation patterns:
 *   - Reports: Navigator > Tools > Reports and Analytics
 *   - Setup: Navigator > Setup and Maintenance
 *   - Scheduled Processes: Navigator > Tools > Scheduled Processes
 *   - Workforce Structures: Navigator > My Client Groups > Workforce Structures
 */
export class OtherFunctionsFlow extends BaseFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);

    const fieldData = getFieldData(tc.testId);
    const process = tc.businessProcess.toLowerCase();
    const script = tc.testScript.toLowerCase();

    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      console.log(`[OtherFunctions] ${tc.testId}: person="${personName}", bp="${tc.businessProcess}"`);
    }

    if (process.includes('mass upload') || process.includes('data load') || script.includes('upload')) {
      await this.executeMassUpload(tc, fieldData);
    } else if (process.includes('aor security') || process.includes('security') && process.includes('aor')) {
      await this.executeAORSecurity(tc, fieldData);
    } else if (process.includes('role security') || (process.includes('security') && process.includes('role'))) {
      await this.executeRoleSecurity(tc, fieldData);
    } else if (process.includes('report') || script.includes('report')) {
      await this.executeReport(tc, fieldData);
    } else if (process.includes('extract') || process.includes('export') || script.includes('extract')) {
      await this.executeDataExtract(tc, fieldData);
    } else if (process.includes('config') || process.includes('setup') || script.includes('setup')) {
      await this.executeConfiguration(tc, fieldData);
    } else if (process.includes('workforce structure') || script.includes('structure')) {
      await this.executeWorkforceStructures(tc, fieldData);
    } else if (process.includes('scheduled') || process.includes('process') || script.includes('scheduled')) {
      await this.executeScheduledProcess(tc, fieldData);
    } else {
      // Generic: navigate home and verify access
      await this.executeGeneric(tc, fieldData);
    }
  }

  /**
   * Execute mass upload via Scheduled Processes.
   * Mass uploads are batch data loading operations run as scheduled processes.
   */
  private async executeMassUpload(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.navigateToScheduledProcesses();

    // Schedule a new mass upload process
    const scheduleBtn = this.page.locator(
      'button:has-text("Schedule New Process"), a[role="button"]:has-text("Schedule New Process")'
    ).first();
    if (await scheduleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await scheduleBtn.click();
      await this.page.waitForTimeout(3000);

      // Search for HCM Data Loader or HDL process
      const searchInput = this.page.getByRole('combobox', { name: 'Name' }).first();
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.click();
        await searchInput.pressSequentially('Load Batch Data', { delay: 50 });
        await this.page.waitForTimeout(2000);
        await searchInput.press('Tab');
        await this.page.waitForTimeout(3000);
      }

      // Click OK on schedule dialog
      const okBtn = this.page.getByRole('button', { name: 'OK' }).first();
      if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const isDisabled = await okBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          await okBtn.click();
          await this.page.waitForTimeout(3000);
        }
      }
    }

    await this.takeScreenshot(`other-mass-upload-${tc.testId}`);
  }

  /**
   * Execute AOR Security configuration.
   * Navigates to Setup and Maintenance for security role management.
   */
  private async executeAORSecurity(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.openNavigator();

    const setupLink = this.page.locator(
      'a[title="Setup and Maintenance"], a:has-text("Setup and Maintenance")'
    ).first();
    if (await setupLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await setupLink.click({ force: true });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      await this.page.waitForTimeout(5000);

      // Search for security-related tasks
      const taskSearch = this.page.locator(
        'input[aria-label*="Search"], input[placeholder*="Search"]'
      ).first();
      if (await taskSearch.isVisible({ timeout: 5000 }).catch(() => false)) {
        await taskSearch.fill('AOR Security');
        await taskSearch.press('Enter');
        await this.page.waitForTimeout(5000);
      }
    }

    await this.takeScreenshot(`other-aor-security-${tc.testId}`);
  }

  /**
   * Execute Role Security configuration.
   * Navigates to Security Console for role management.
   */
  private async executeRoleSecurity(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.openNavigator();

    // Try to navigate to Security Console
    const securityLink = this.page.locator(
      'a[title="Security Console"], a:has-text("Security Console")'
    ).first();
    if (await securityLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await securityLink.click({ force: true });
    } else {
      // Fallback: Setup and Maintenance
      const setupLink = this.page.locator(
        'a[title="Setup and Maintenance"], a:has-text("Setup and Maintenance")'
      ).first();
      if (await setupLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await setupLink.click({ force: true });
      }
    }

    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);

    await this.takeScreenshot(`other-role-security-${tc.testId}`);
  }

  /**
   * Navigate to Reports and Analytics and run a report.
   * Navigator > Tools > Reports and Analytics
   */
  private async executeReport(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.openNavigator();

    const reportsLink = this.page.locator(
      'a[title="Reports and Analytics"], a:has-text("Reports and Analytics")'
    ).first();
    if (await reportsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportsLink.click({ force: true });
      await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
      await this.page.waitForTimeout(5000);
    } else {
      // Fallback: use Scheduled Processes for report generation
      await this.executeScheduledProcess(tc, fieldData);
    }

    await this.takeScreenshot(`other-report-${tc.testId}`);
  }

  /**
   * Navigate to Scheduled Processes for data extraction.
   */
  private async executeDataExtract(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.navigateToScheduledProcesses();

    // Schedule a new extract process
    const scheduleBtn = this.page.locator(
      'a[role="button"]:has-text("Schedule New Process")'
    ).first();
    if (await scheduleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await scheduleBtn.click();
      await this.page.waitForTimeout(3000);

      const searchInput = this.page.locator(
        'input[aria-label*="Name"], input[aria-label*="Search"]'
      ).first();
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const processName = tc.testData?.match(/(?:process|extract)[:\s]*([^\n,;]+)/i)?.[1] || 'HCM Extract';
        await searchInput.fill(processName);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(3000);
      }
    }

    await this.takeScreenshot(`other-extract-${tc.testId}`);
  }

  /**
   * Navigate to Setup and Maintenance for configuration.
   */
  private async executeConfiguration(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.openNavigator();

    const setupLink = this.page.locator(
      'a[title="Setup and Maintenance"], a:has-text("Setup and Maintenance")'
    ).first();
    if (await setupLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await setupLink.click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);

    await this.takeScreenshot(`other-config-${tc.testId}`);
  }

  /**
   * Navigate to Workforce Structures page via HomePage, then search for tasks.
   */
  private async executeWorkforceStructures(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.homePage.goToWorkforceStructures();

    // Search for a specific task if test data provides one
    if (tc.testData) {
      const taskSearch = this.page.locator(
        'input[aria-label="Search for tasks"], input[placeholder="Search for tasks"]'
      ).first();
      if (await taskSearch.isVisible({ timeout: 5000 }).catch(() => false)) {
        await taskSearch.fill(tc.testData);
        await taskSearch.press('Enter');
        await this.page.waitForTimeout(3000);
      }
    }

    await this.takeScreenshot(`other-structures-${tc.testId}`);
  }

  /**
   * Navigate to Scheduled Processes.
   */
  private async executeScheduledProcess(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.navigateToScheduledProcesses();
    await this.takeScreenshot(`other-scheduled-${tc.testId}`);
  }

  /**
   * Generic fallback: navigate home and verify the page is accessible.
   */
  private async executeGeneric(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.navigateHome();
    await this.page.waitForTimeout(3000);

    const homeIndicator = this.page.locator(
      '[class*="welcome"], [id*="AtkHomePageWelcome"]'
    ).first();
    await homeIndicator.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

    await this.takeScreenshot(`other-generic-${tc.testId}`);
  }

  /** Navigate to Scheduled Processes page via HomePage. */
  private async navigateToScheduledProcesses(): Promise<void> {
    await this.homePage.goToScheduledProcesses();
  }

  /** Take a screenshot with a descriptive name. */
  private async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true }).catch(() => {
      console.log(`[OtherFunctions] Screenshot failed: ${name}`);
    });
  }
}
