import type { Page } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * QuickPay Payments page — Oracle HCM off-cycle quick pay processing.
 *
 * Navigation path: My Client Groups → Payroll → search "quick" → QuickPay Payments
 *
 * Flow:
 * 1. Navigate to QuickPay Payments page
 * 2. Search for the employee by name (fresh-page strategy — reload if "No suggestions")
 * 3. Set Payroll Relationship details if needed
 * 4. On the element checkboxes page: uncheck Select All, then check only:
 *    a. [dynamicElementName] (e.g. "Additional Salary", "Bonus") — from test case
 *    b. "SECA Tax Deduction Info"
 *    c. "Pre Tax 403B"
 * 5. Submit and wait for confirmation
 *
 * DOM notes (from live codegen):
 * - Element rows: `tr` containing `span.x2i8` with the element name text
 * - Checkbox in same row: `input[type="checkbox"]` inside the TR
 * - Select All checkbox: row with text "Select All"
 */
export class QuickPayPage extends BasePage {

  // Elements that are always checked (in addition to the dynamic element)
  static readonly FIXED_ELEMENTS = ['SECA Tax Deduction Info', 'Pre Tax 403B'];

  /**
   * Navigate to QuickPay Payments page.
   * Uses Payroll landing page search — type "quick" to find the tile.
   */
  async navigateToQuickPay(): Promise<void> {
    const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    console.log('[QuickPay] Navigating to Payroll landing page...');
    await this.page.goto(
      `${baseUrl}/hcmUI/faces/FndOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll`,
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Search for "quick" in the Payroll task search box
    const searchBox = this.page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await searchBox.fill('quick');
      await this.page.waitForTimeout(2000);
    }

    // Click "QuickPay Payments" link/tile
    const qpLink = this.page.getByRole('link', { name: /QuickPay Payments/i }).first();
    if (await qpLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[QuickPay] Clicking QuickPay Payments tile...');
      await qpLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      // Fallback: direct Navigator path
      console.log('[QuickPay] Tile not found, trying direct URL...');
      await this.page.goto(
        `${baseUrl}/fscmUI/faces/FndOverview?fndGlobalItemNodeId=itemNode_payroll_quickpay_payments`,
        { timeout: 60_000, waitUntil: 'domcontentloaded' }
      );
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Verify we landed on QuickPay Payments
    const heading = this.page.locator('h1:has-text("QuickPay Payments"), h2:has-text("QuickPay Payments")').first();
    if (!await heading.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await this.page.screenshot({ path: 'test-results/quickpay-nav-failed.png', fullPage: true }).catch(() => {});
      throw new Error(`[QuickPay] Failed to navigate to QuickPay Payments. URL: ${this.page.url()}`);
    }
    console.log('[QuickPay] On QuickPay Payments page');
  }

  /**
   * Search for an employee on the QuickPay Payments page.
   * Oracle search can be stale — refreshes the page and retries if "No suggestions to display".
   */
  async searchEmployee(name: string): Promise<void> {
    console.log(`[QuickPay] Searching for employee: "${name}"`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        // Reload to clear stale search state
        console.log('[QuickPay] Reloading page to clear stale search...');
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
      }

      // Find the person name search input
      const personInput = this.page.locator(
        'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"], input[aria-label*="Name"]'
      ).first();

      if (!await personInput.isVisible({ timeout: 15_000 }).catch(() => false)) {
        console.log(`[QuickPay] Person search input not visible on attempt ${attempt}`);
        continue;
      }

      await personInput.click();
      await personInput.fill('');
      await personInput.pressSequentially(name, { delay: 80 });
      await this.page.waitForTimeout(4000);

      // Check if suggestions appeared
      const noSuggestions = await this.page.locator('text=No suggestions to display').first()
        .isVisible({ timeout: 2000 }).catch(() => false);

      if (!noSuggestions) {
        // Click exact match or first option
        const exactMatch = this.page.getByText(name, { exact: true }).first();
        if (await exactMatch.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log(`[QuickPay] Clicking person: "${name}"`);
          await exactMatch.click();
          await this.page.waitForTimeout(3000);
          await this.waitForJET();
          return;
        }
        // Fallback: first dropdown option
        const firstOption = this.page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          const optionText = await firstOption.textContent().catch(() => '');
          console.log(`[QuickPay] Clicking first option: "${optionText?.trim().substring(0, 60)}"`);
          await firstOption.click();
          await this.page.waitForTimeout(3000);
          await this.waitForJET();
          return;
        }
      }

      console.log(`[QuickPay] No suggestions on attempt ${attempt} — will retry`);
    }

    await this.page.screenshot({ path: 'test-results/quickpay-no-person.png', fullPage: true }).catch(() => {});
    throw new Error(`[QuickPay] Employee "${name}" not found after 2 attempts. URL: ${this.page.url()}`);
  }

  /**
   * On the element checkboxes page:
   * 1. Uncheck "Select All" (deselects all elements)
   * 2. Check each dynamic element row (one or more, e.g. "Additional Salary")
   * 3. Check "SECA Tax Deduction Info"
   * 4. Check "Pre Tax 403B"
   *
   * Uses TR-based selector: find the row whose span.x2i8 contains the element name,
   * then click the checkbox in that row.
   *
   * @param dynamicElements One or more element names specific to the test case.
   */
  async selectElementCheckboxes(dynamicElements: string | string[]): Promise<void> {
    const dynamicList = Array.isArray(dynamicElements) ? dynamicElements : [dynamicElements];
    console.log(`[QuickPay] Selecting element checkboxes. Dynamic elements: ${dynamicList.map(e => `"${e}"`).join(', ')}`);

    // Wait for checkboxes to be visible
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Step 1: Uncheck Select All (deselects everything)
    const selectAllRow = this.page.locator('tr').filter({ hasText: 'Select All' }).first();
    if (await selectAllRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const selectAllCheckbox = selectAllRow.locator('input[type="checkbox"]').first();
      const isChecked = await selectAllCheckbox.isChecked().catch(() => false);
      if (isChecked) {
        console.log('[QuickPay] Unchecking Select All...');
        await selectAllCheckbox.click();
        await this.page.waitForTimeout(2000);
      }
    } else {
      console.log('[QuickPay] Select All row not found — proceeding to individual checkboxes');
    }

    // Step 2: Check each required element (dynamic + fixed SECA/Pre Tax 403B)
    const elementsToCheck = [...dynamicList, ...QuickPayPage.FIXED_ELEMENTS];
    for (const elementName of elementsToCheck) {
      await this.checkElementRow(elementName);
    }
  }

  /**
   * Find the TR row for a specific element name and check its checkbox.
   * Element names live in span.x2i8 inside table rows.
   */
  private async checkElementRow(elementName: string): Promise<void> {
    // Primary: TR containing span.x2i8 with exact element name text
    const row = this.page.locator('tr').filter({
      has: this.page.locator(`span.x2i8:text-is("${elementName}")`)
    }).first();

    if (await row.isVisible({ timeout: 5000 }).catch(() => false)) {
      const checkbox = row.locator('input[type="checkbox"]').first();
      const isChecked = await checkbox.isChecked().catch(() => false);
      if (!isChecked) {
        console.log(`[QuickPay] Checking element: "${elementName}"`);
        await checkbox.click();
        await this.page.waitForTimeout(1000);
      } else {
        console.log(`[QuickPay] Already checked: "${elementName}"`);
      }
      return;
    }

    // Fallback: TR containing the element name as text (less precise)
    const fallbackRow = this.page.locator(`tr:has-text("${elementName}")`).first();
    if (await fallbackRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      const checkbox = fallbackRow.locator('input[type="checkbox"]').first();
      const isChecked = await checkbox.isChecked().catch(() => false);
      if (!isChecked) {
        console.log(`[QuickPay] Checking element (fallback selector): "${elementName}"`);
        await checkbox.click();
        await this.page.waitForTimeout(1000);
      }
      return;
    }

    console.log(`[QuickPay] Warning: element row not found for "${elementName}" — may not be present for this employee`);
  }

  /**
   * Submit the QuickPay request and wait for confirmation.
   */
  async submitQuickPay(): Promise<void> {
    console.log('[QuickPay] Submitting QuickPay...');

    const submitBtn = this.page.getByRole('button', { name: /Submit|Run/i }).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      console.log('[QuickPay] Submit button not found — taking screenshot');
      await this.page.screenshot({ path: 'test-results/quickpay-no-submit.png', fullPage: true }).catch(() => {});
      throw new Error(`[QuickPay] Submit button not visible. URL: ${this.page.url()}`);
    }

    // Confirm in dialog if it appears
    const confirmBtn = this.page.getByRole('button', { name: /Yes|Confirm|OK/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[QuickPay] Confirming submission dialog...');
      await confirmBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }

    // Check for error messages
    const errorMsg = this.page.locator('[class*="error"], [class*="Error"]').filter({ hasNotText: 'ErrorCorrection' }).first();
    if (await errorMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await errorMsg.textContent().catch(() => '');
      console.log(`[QuickPay] Warning: error message after submit — "${text?.trim().substring(0, 120)}"`);
    } else {
      console.log('[QuickPay] QuickPay submitted successfully');
    }
  }

  /**
   * Full QuickPay flow for a given employee and one or more dynamic element names.
   * Called from PayrollProcessingFlow as Step 2 for PY-001 / PY-002 / PY-004 /
   * PY-009 / PY-011 two-step tests.
   */
  async runQuickPay(employeeName: string, dynamicElements: string | string[]): Promise<void> {
    await this.navigateToQuickPay();
    await this.searchEmployee(employeeName);
    await this.selectElementCheckboxes(dynamicElements);
    await this.submitQuickPay();
  }
}
